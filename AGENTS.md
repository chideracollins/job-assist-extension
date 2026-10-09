# Job Assist — Agent Guide

Chrome extension (Manifest V3) that links the user's current browser tab to a
**local** Hermes agent: it captures the visible job-posting page, lets the agent
draft a tailored resume / cover letter / application answers, and moves the
draft into the form (copy, fill focused field, fill per captured question).

## Architecture

```
content.js        Passive content script: extracts page text + form questions,
                  fills fields (React-safe native setter + input/change events)
background.js     Service worker: side-panel wiring, capture/fill routing, defaults
sidepanel.*       Side-panel UI: capture, modes, SSE streaming, copy/fill actions
options.*         Settings: API base URL, API key, model, dossier path
scripts/
  enable_api_server.sh   Idempotently enables the Hermes API server for a profile
  mock_api_server.py     Fake OpenAI-compatible server for UI testing (no real bridge)
  make_icons.py          Placeholder icon generator (stdlib only)
```

The extension talks only to `http://127.0.0.1:8642/v1` (the Hermes gateway's
OpenAI-compatible API server), which runs the full agent — memory, skills,
tools — so the agent reads the career record before drafting.

## Invariants — never weaken these

- **Grounding**: drafts must come from the user's verified career record
  (`dossierPath` setting, default `~/Documents/Career-Dossier/career_record.json`).
  The system prompt in `sidepanel.js` (`buildSystemPrompt`) forbids inventing
  experience/metrics and marks page text as untrusted data (prompt-injection
  guard). Keep both rules in any prompt rewrite.
- **Privacy**: form-field *values* are never captured — only questions/labels.
  Passwords, hidden inputs, and PII stay on the page. Never add value capture.
- **No auto-submit**: the extension only fills fields the user points at.
- **No secrets in the repo**: `.env`, `*.pem` are gitignored; the API key lives
  in `chrome.storage.local`. Never commit a real key or personal absolute paths
  (use `~/` in defaults/docs).
- **Local only**: no cloud relay, no analytics, no telemetry.

## Conventions

- Plain JavaScript (ES2020), no frameworks, no build step — keep it that way.
- Content script is passive: it must do nothing until messaged.
- `stream: true` is the default path; keep the SSE parser (`parseSSE`)
  tolerant of keepalive comments and non-JSON lines.

## Verification before declaring work done

1. `node --check background.js content.js sidepanel.js options.js`
2. `python3 -m json.tool manifest.json > /dev/null`
3. `python3 -m py_compile scripts/*.py`
4. Smoke-test the bridge contract:
   ```bash
   python3 scripts/mock_api_server.py &   # serves http://127.0.0.1:8642/v1
   curl -s http://127.0.0.1:8642/v1/models
   curl -s -X POST http://127.0.0.1:8642/v1/chat/completions \
     -H "Content-Type: application/json" \
     -d '{"model":"career-os","stream":true}'
   ```
5. Manual UI pass: reload the unpacked extension, then on a real job page run
   Capture → Generate → Copy, and Fill focused field. Confirm a draft's "Gaps
   to address" section appears when the posting asks for something absent from
   the record.

## Out of scope (do not add without a PRD update)

Full-form autofill by label matching, file uploads, application history,
resume PDF/DOCX export, auto-submit, anti-bot bypass, cloud relay,
multi-user/account features.

## Permissions note

The extension now requires the **`tabs`** permission (replacing `activeTab`). This permission enables the side‑panel to query tab URLs and other tab properties needed for capture and fill operations.

## Permissions note

The extension now requires the **`tabs`** permission (instead of `activeTab`). This permission is needed for the side‑panel to retrieve the current tab’s URL and other details during capture and fill.
