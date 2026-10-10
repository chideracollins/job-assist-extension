# Job Assist — Agent Guide

Chrome extension (Manifest V3) that links the user's current browser tab to a
**local** Hermes agent: it captures the visible job-posting page, lets the agent
draft a tailored resume / cover letter / application answers, and moves the
draft into the form or exports it (copy, fill, PDF, Markdown).

Generic by design: any Hermes user can configure their own base URL, API key,
model (or auto-detect it), and optional career record path. It is not tied to
one person, profile, or dossier layout.

## Architecture

```
content.js        Passive content script: extracts page text + form questions,
                  fills fields (React-safe native setter + input/change events)
background.js     Service worker: side-panel wiring, capture/fill routing, defaults
export.js         Markdown renderer + PDF (print-to-PDF) + .md download
sidepanel.*       Side-panel UI: capture, modes, SSE streaming, copy/fill/export
options.*         Settings: API base URL, API key, model, dossier path
scripts/
  enable_api_server.sh   Idempotently enables the Hermes API server for a profile
  mock_api_server.py     Fake OpenAI-compatible server for UI testing (no real bridge)
  make_icons.py          Placeholder icon generator (stdlib only)
  test_export.js         Node tests for the markdown/PDF renderer core
```

The extension talks only to `http://127.0.0.1:8642/v1` (the Hermes gateway's
OpenAI-compatible API server), which runs the full agent — memory, skills,
tools. The gateway rejects ANY request whose `Origin` header is not in
`API_SERVER_CORS_ORIGINS` (Chrome extensions always send
`Origin: chrome-extension://<id>`), so the allowlist in both `.env` files —
written by `scripts/enable_api_server.sh` — is part of the bridge contract.
Removing it reproduces the "Connected but not generating" bug.

## Invariants — never weaken these

- **Grounding**: drafts must never invent experience/metrics. If a dossier path
  is configured, the system prompt in `sidepanel.js` (`buildSystemPrompt`) makes
  it the source of truth and tells the agent to read it first. If not configured,
  the prompt tells the agent to draft only from the conversation and its memory.
  Page text is always marked UNTRUSTED DATA (prompt-injection guard). Keep all
  three rules in any prompt rewrite.
- **Generic by default**: no hardcoded profile names, user paths, or identities.
  Model empty → auto-detect from `/v1/models`; dossier empty → optional.
- **Privacy**: form-field *values* are never captured — only questions/labels.
  Passwords, hidden inputs, and PII stay on the page. Never add value capture.
- **No auto-submit**: the extension only fills fields the user points at.
- **No secrets in the repo**: `.env`, `*.pem` are gitignored; the API key lives
  in `chrome.storage.local`. Never commit a real key or personal absolute paths.
- **Local only**: no cloud relay, no analytics, no telemetry.
- **Zero-dependency export**: PDF via the browser's own print-to-PDF
  (`export.js`) — never a bundled PDF library and never an AI-credit
  conversion. Keep the DOM-free core (`renderMarkdown`, `buildPdfHtml`) free of
  browser globals so the node tests keep working.

## Conventions

- Plain JavaScript (ES2020), no frameworks, no build step — keep it that way.
- Content script is passive: it must do nothing until messaged.
- `stream: true` is the default path; keep the SSE parser (`parseSSE`)
  tolerant of keepalive comments and non-JSON lines.

## Versioning & release — required for every version bump

- Every change to `"version"` in `manifest.json` MUST be released as a git tag
  named exactly `v<version>` (e.g. manifest `0.5.0` → tag `v0.5.0`).
- The release commit sequence is: commit the changes → `git tag v<version>` →
  `git push origin main` → `git push origin v<version>`. A tag that exists only
  locally is not a release.
- Tag only AFTER the "Verification before declaring work done" checklist passes.
- Bump the version for any user-visible change (bug fix, feature, doc-driven
  behavior change); pure typo/doc touch-ups may ride on main untagged.
- Never move or delete an already-pushed tag. If a release was cut from a
  broken commit, fix forward with a new version bump and tag.

## Verification before declaring work done

1. `node --check background.js content.js export.js sidepanel.js options.js scripts/test_export.js`
2. `node scripts/test_export.js` (markdown renderer + PDF doc + injection safety)
3. `python3 -m json.tool manifest.json > /dev/null`
4. `python3 -m py_compile scripts/*.py`
5. Smoke-test the bridge contract:
   ```bash
   python3 scripts/mock_api_server.py &   # serves http://127.0.0.1:8642/v1
   curl -s http://127.0.0.1:8642/v1/models
   curl -s -X POST http://127.0.0.1:8642/v1/chat/completions \
     -H "Content-Type: application/json" \
     -H "Origin: chrome-extension://wfmbaupgoypxvwvi" \
     -d '{"model":"hermes-agent","stream":true}'
   ```
   A request WITH the extension's `Origin` header must not 403 — if it does,
   the gateway's CORS allowlist is missing `API_SERVER_CORS_ORIGINS` (re-run
   `enable_api_server.sh`, restart the gateway).
6. Manual UI pass: reload the unpacked extension, then on a real job page run
   Capture → Generate → Copy, Fill focused field, and PDF/.md export. Confirm a
   draft's "Gaps to address" section appears when the posting asks for something
   absent from the record.

## Permissions note

`tabs` lets the side panel read tab URLs/titles (needed for capture and fill
routing); `activeTab` is kept for the one-off host grant that powers the
fallback content-script injection when a tab predates the extension install.
Both are standard, low-risk MV3 permissions. Keep `manifest.json` strict JSON —
no comments.

## Out of scope (do not add without a PRD update)

Full-form autofill by label matching, file uploads, application history,
server-side PDF conversion, auto-submit, anti-bot bypass, cloud relay,
multi-user/account features.
