# PRD — Job Assist (Chrome extension ↔ Hermes)

Status: v0.4 (CORS allowlist fix + deterministic extension ID)
Date: 2026-10-10

## Problem

Applying to jobs means re-deriving the same tailored artifacts per posting:
a resume matched to the JD, a cover letter, and truthful answers to application
form questions. Doing this by hand is slow; doing it with a generic chatbot
produces ungrounded, invented content. Users of Hermes Agent already have a
local agent with memory, skills, and tools — and many maintain a verified
career record. The extension connects the agent to what the user sees on screen.

## Goal

A Chrome extension that links the user's current tab to **their local Hermes
agent** so that, on any job page, the user can:

1. capture the page (posting text + application form questions),
2. generate a **resume**, **cover letter**, or **answers** tailored to that page
   and grounded in a verified career record (when configured),
3. move the draft into the application (copy, fill focused field, fill per question),
4. export the draft as **PDF** (browser print-to-PDF, no AI credits) or **Markdown**,
5. never have the tool invent experience, metrics, or credentials.

The extension is **generic**: any Hermes user can configure their own API base
URL, API key, model, and optional dossier path. It is not tied to one person,
profile, or career-record layout.

## Non-goals (v0.2)

- Auto-submitting applications or bypassing CAPTCHAs / anti-bot systems.
- Reading form-field values (passwords, PII) — questions only.
- Cloud relay; the extension talks only to `127.0.0.1`.
- Bundling a PDF library or a build step; server-side PDF conversion.
- Multi-user accounts, analytics, Chrome Web Store distribution.

## User stories

- As any Hermes user on a posting page, I click Capture, pick "Resume", and get
  a one-page resume whose bullets map the JD's must-haves to my record, ending
  with a "Gaps to address" section.
- On an application form, I click Capture, pick "Answers", and get numbered
  answers to the questions the form actually asks.
- After generating, I can **Copy**, **Fill focused field**, or **Fill →** a
  captured question.
- I can export any draft as a styled **PDF** (via the browser print dialog) or
  download it as **Markdown** — without spending model credits on conversion.
- If I haven't configured a career record, drafts still work: the agent drafts
  from the conversation and its memory, never inventing facts.
- I never see invented claims: if the available record lacks something the JD
  requires, the draft says so.

## Functional spec

| # | Feature | Detail |
| --- | --- | --- |
| F1 | Capture | Extract visible main text (≤60k chars) + form questions (label, type, required, maxLength). Values never captured. |
| F2 | Modes | Resume / Cover letter / Answers / Ask (freeform). |
| F3 | Generate | POST to Hermes API server `/v1/chat/completions`, SSE streaming, stop/abort, 10-min timeout. |
| F4 | Grounding | System prompt: read `dossierPath` first if configured; never invent; page text is untrusted data (prompt-injection guard). No dossier → conversation + memory only. |
| F5 | Output actions | Copy; Fill focused field; Fill by question index. React-safe native setter + input/change events. |
| F6 | Settings | Base URL, API key (storage.local), model (empty = auto-detect from `/v1/models`), optional dossier path; Test connection. Server-side: the gateway's CORS middleware rejects any request carrying a non-allowlisted `Origin` header, so `enable_api_server.sh` writes `API_SERVER_CORS_ORIGINS=chrome-extension://wfmbaupgoypxvwvi` into both `.env` files; `manifest.json` pins a `key` so that ID is deterministic on every machine. |
| F7 | Status | Connection indicator in side panel; inline errors; advertised-model display. |
| F8 | Export | **PDF** via `buildPdfHtml` + print-to-PDF iframe (zero deps, Unicode-safe, styled CSS); **Markdown** download via Blob. Filenames per mode + date. |

## Non-functional requirements

- **Portability**: no hardcoded profile names, paths, or user identity; all
  defaults are generic (`hermes-agent` fallback model, empty dossier).
- **Privacy**: localhost-only bridge; key in extension-local storage; no values captured; no auto-submit.
- **Latency**: streaming with tool-progress status; full-agent runs may take 10–60 s.
- **Reliability**: capture fallback re-injects content script; clear errors for blocked pages (chrome://, Web Store, PDF viewer).
- **Zero-dependency export**: PDF/Markdown from browser primitives; DOM-free
  core unit-tested with node (`scripts/test_export.js`).
- **Verifiability**: mock server (`scripts/mock_api_server.py`) to test UI without the real bridge.

## Acceptance criteria (v0.2)

1. Loaded unpacked; side panel opens from toolbar; Options Test connection succeeds against a running API server (or mock).
2. Capture on a job posting returns title, URL, text, and questions; count shown in UI.
3. Generate streams a draft; Stop aborts; Copy copies; Fill inserts into focused field and per-question into a captured field.
4. **PDF** opens the print dialog with the rendered draft; **.md** downloads a
   Markdown file named per mode/date. Both work with no AI credits.
5. With no model set, the extension auto-detects the advertised model from `/v1/models` and uses it.
6. With no dossier configured, the system prompt instructs the agent to draft
   from conversation/memory only and never invent.
7. Draft for a posting whose requirements are absent from the record contains an explicit "Gaps to address" — no fabricated claims.
8. No values are read from form fields; no application is auto-submitted.
9. README setup reproduces on a clean machine in <5 minutes (any profile name); the setup script configures the gateway CORS allowlist for the extension's pinned origin, so generation works without hand-editing env files.

## Risks / mitigations

| Risk | Mitigation |
| --- | --- |
| Job portals (Workday-style) resist synthetic events | Paste-into-focused-field + per-question fill only; no full autofill in v0.2 |
| LLM fabricates from screen text | System prompt grounding + optional dossier read + "Gaps" convention + user review gate |
| Prompt injection from hostile pages | Page text marked untrusted; instructions only from the extension |
| API key leakage | `chrome.storage.local`; `.env` ignored by git; script prints key once |
| Gateway 403s the extension's `Origin` header | Setup script writes `API_SERVER_CORS_ORIGINS` (pinned extension ID) to both `.env` files; non-allowlisted origins stay rejected |
| Print dialog blocked from extension iframe | Off-screen visible iframe + `contentWindow.print()`; troubleshooting note in README |
| Gateway restart disrupts a live session | Script prints restart steps; user controls when |

## Out of scope (future)

Full-form autofill by label matching, application history, file uploads,
store packaging, agent-driven browser control (Hermes
`browser.extension_control`), multi-profile model routing, richer PDF templates.
