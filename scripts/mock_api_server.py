#!/usr/bin/env python3
"""Mock Hermes API server for testing Job Assist without enabling the real bridge.

Simulates the OpenAI-compatible endpoints the extension talks to:
  GET  /v1/models
  POST /v1/chat/completions   (streaming SSE and non-streaming)

Usage:  python3 scripts/mock_api_server.py [port]   (default 8642)

Then in the extension Options set the base URL to http://127.0.0.1:8642/v1
and leave the API key empty. The mock emits a fake draft after a short delay
so you can exercise Capture → Generate → Copy → Fill against any page.
"""

from __future__ import annotations

import json
import os
import sys
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8642
MODEL = os.environ.get("MOCK_MODEL", "hermes-agent")

FAKE_DRAFT = (
    "Tailored Resume — Senior Software Engineer\n"
    "------------------------------------------\n"
    "Summary: Full-stack engineer with production apps shipped across web and "
    "mobile, plus backend API experience. (MOCK OUTPUT — connect a real Hermes "
    "agent for drafts grounded in your career record.)\n\n"
    "• Led a flagship app from spec to store, owning architecture, state "
    "management, and release pipeline.\n"
    "• Built backend services with typed endpoints and automated test coverage.\n\n"
    "Gaps to address: posting asks for team leadership — not yet in the record."
)


def sse_event(data: str) -> str:
    return f"data: {json.dumps(data)}\n\n"


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):  # quieter logs
        sys.stderr.write("[mock] %s\n" % (fmt % args))

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        if self.path.rstrip("/") == "/v1/models":
            body = json.dumps({"object": "list", "data": [{"id": MODEL}]}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self._cors()
            self.end_headers()
            self.wfile.write(body)
            return
        self.send_response(404)
        self.end_headers()

    def do_POST(self):
        if self.path.rstrip("/") != "/v1/chat/completions":
            self.send_response(404)
            self.end_headers()
            return

        length = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(length) if length else b"{}"
        try:
            req = json.loads(raw)
        except json.JSONDecodeError:
            req = {}
        stream = bool(req.get("stream", False))

        if stream:
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.send_header("Cache-Control", "no-cache")
            self._cors()
            self.end_headers()

            def send(data: bytes):
                try:
                    self.wfile.write(data)
                    self.wfile.flush()
                except (BrokenPipeError, ConnectionResetError):
                    # Client closed early (e.g. curl | head) — stop streaming.
                    raise StopStreaming()

            class StopStreaming(Exception):
                pass

            # Simulate a tool-progress event, then the draft in chunks.
            send(
                sse_event(
                    {
                        "event": "hermes.tool.progress",
                        "tool_name": "read_file",
                        "status": "running",
                    }
                ).encode()
            )
            try:
                time.sleep(0.8)
                for i in range(0, len(FAKE_DRAFT), 24):
                    send(
                        sse_event(
                            {
                                "choices": [
                                    {"delta": {"content": FAKE_DRAFT[i : i + 24]}}
                                ]
                            }
                        ).encode()
                    )
                    time.sleep(0.05)
                send(b"data: [DONE]\n\n")
            except StopStreaming:
                pass
            return

        body = json.dumps(
            {
                "id": "mock-cmpl",
                "object": "chat.completion",
                "model": MODEL,
                "choices": [
                    {
                        "index": 0,
                        "message": {"role": "assistant", "content": FAKE_DRAFT},
                        "finish_reason": "stop",
                    }
                ],
                "usage": {"prompt_tokens": 100, "completion_tokens": 90, "total_tokens": 190},
            }
        ).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self._cors()
        self.end_headers()
        self.wfile.write(body)


if __name__ == "__main__":
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"Mock Hermes API listening on http://127.0.0.1:{PORT}/v1")
    print(f"Model advertised: {MODEL}")
    print("Press Ctrl+C to stop.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
