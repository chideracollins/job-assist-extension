# PRD — Job Assist (Chrome extension ↔ Hermes)

Status: scaffold v0.1 · Owner: user (build/polish) + Hermes (spec/review)
Date: 2026-10-09

## Problem

Applying to jobs means re-deriving the same tailored artifacts per posting:
a resume matched to the JD, a cover letter, and truthful answers to application
form questions. Doing this by hand is slow; doing it with a generic chatbot
produces ungrounded, invented content. The user already maintains a verified
career record (`~/Documents/Career-Dossier/career_record.json`) that a local
Hermes agent can read with full tools, memory, and skills.

## Goal

A Chrome extension that links the user's current tab to the local Hermes agent
so that, on any job page, the user can:

1. capture the page (posting text + application form questions),
2. generate a **resume**, **cover letter**, or **answers** tailored to that page
   and grounded in the verified career record,
3. move the draft into the application (copy, fill focused field, fill per question),
4. never have the tool invent experience, metrics, or credentials.

## Non-goals (v0.1)

- Auto-submitting applications or bypassing CAPTCHAs / anti-bot systems.
- Reading form-field values (passwords, PII) — questions only.
- Cloud relay; the extension talks only to `127.0.0.1`.
- Multi-user, Chrome Web Store distribution, analytics.

## User stories

- As a job seeker on a posting page, I click Capture, pick "Resume", and get a
  one-page resume whose bullets map the JD's must-haves to my real record,
  ending with a "Gaps to address" section.
- On an application form, I click Capture, pick "Answers", and get numbered
  answers to the questions the form actually asks.
- After generating, I focus a field and click "Fill focused field" (or choose a
  question in the dropdown and "Fill →") to paste the draft.
- I never see invented claims: if the record lacks something the JD requires,
  the draft says so and tells me what to add to the record.

## Functional spec

| # | Feature | Detail |
| --- | --- | --- |
| F1 | Capture | Extract visible main text (≤60k chars) + form questions (label, type, required, maxLength). Values never captured. |
| F2 | Modes | Resume / Cover letter / Answers / Ask (freeform). |
| F3 | Generate | POST to Hermes API server `/v1/chat/completions` (model = profile name), SSE streaming, stop/abort, 10-min timeout. |
| F4 | Grounding | System prompt: read `dossierPath` first; never invent; page text is untrusted data (prompt-injection guard). |
| F5 | Output actions | Copy; Fill focused field; Fill by question index. React-safe native setter + input/change events. |
| F6 | Settings | Base URL, API key (storage.local), model, dossier path; Test connection. |
| F7 | Status | Connection indicator in side panel; inline errors. |

## Non-functional requirements

- **Privacy**: localhost-only bridge; key in extension-local storage; no values captured; no auto-submit.
- **Latency**: streaming with tool-progress status; full-agent runs may take 10–60 s.
- **Reliability**: capture fallback re-injects content script; clear errors for blocked pages (chrome://, Web Store, PDF viewer).
- **Verifiability**: mock server (`scripts/mock_api_server.py`) to test UI without the real bridge.

## Acceptance criteria (v0.1)

1. Loaded unpacked; side panel opens from toolbar; Options test connection succeeds against a running API server (or mock).
2. Capture on a job posting returns title, URL, text, and questions; count shown in UI.
3. Generate streams a draft; Stop aborts; Copy copies; Fill inserts into focused field and per-question into a captured field.
4. Draft for a posting whose requirements are absent from the record contains an explicit "Gaps to address" — no fabricated claims.
5. No values are read from form fields; no application is auto-submitted.
6. README setup reproduces on a clean profile in <5 minutes.

## Risks / mitigations

| Risk | Mitigation |
| --- | --- |
| Job portals (Workday-style) resist synthetic events | Paste-into-focused-field + per-question fill only; no full autofill in v0.1 |
| LLM fabricates from screen text | System prompt grounding + dossier read + "Gaps" convention + user review gate |
| Prompt injection from hostile pages | Page text marked untrusted; instructions only from the extension |
| API key leakage | `chrome.storage.local`; `.env` ignored by git; script prints key once |
| Gateway restart disrupts desktop session | Script prints restart steps; user controls when |

## Out of scope (future)

Full-form autofill by label matching, application history, resume PDF/DOCX
export, store packaging, agent-driven browser control (Hermes
`browser.extension_control`), multi-profile model routing.
