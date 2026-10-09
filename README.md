# Job Assist — Hermes Copilot (Chrome extension)

Capture the job page you're looking at and let **your local Hermes agent** draft a
tailored resume, cover letter, and application answers — grounded in your
**verified career record** (if configured), never invented from the screen.

Works for anyone running Hermes Agent: install the extension, point it at your
local Hermes API server, and it connects *your* agent to *your* browser tab.

```
[Job page] ──capture──▶ [Extension side panel]
                              │  POST /v1/chat/completions (Bearer key)
                              ▼
                    [Hermes API server @ http://127.0.0.1:8642/v1]
                              │  full agent: memory + skills + tools
                              ▼
                 reads your career record (optional — set in Options)
                              │
                              ▼
        tailored draft ──▶ Copy / Fill field / PDF / Markdown
```

Everything runs on `127.0.0.1`; the only data leaving your machine is the page
text you send to Hermes — the same privacy envelope as talking to Hermes in
chat. **The extension never auto-submits anything.**

## What you'll use it for

| Scenario | What you do | What you get |
| --- | --- | --- |
| On a **job posting** | Capture → **Resume** | One-page resume mapped to the posting's must-haves, with a "Gaps to address" section for anything the record doesn't support |
| On a **job posting** | Capture → **Cover letter** | 3–4 short paragraphs grounded in the record, addressing the company's stated needs |
| On an **application form** | Capture → **Answers** | Numbered answers to the form's actual questions, ready to fill in |
| On **any job page** | Capture → **Ask** | Freeform help: summarize requirements, suggest projects to close gaps, prep interview questions |
| **Any draft** | **PDF** / **.md** | Export the draft as a styled PDF (browser print dialog → "Save as PDF", no AI credits) or as Markdown |

Then move the draft into the form: **Copy**, **Fill focused field**, or pick a
captured question in the dropdown and **Fill →** (React/Vue forms accept the
fill because it uses the native value setter + real events).

---

## Installation

**Prerequisites:** Chrome 116+, Hermes Agent installed, and a Hermes profile
(the profile name becomes the model the extension talks to). A career record is
optional — see Step 4.

### Step 1 — Get the code

```bash
# Option A: clone from GitHub
git clone https://github.com/chideracollins/job-assist-extension.git
cd job-assist-extension

# Option B: it's already local at ~/Repo/job-assist-extension
cd ~/Repo/job-assist-extension
```

### Step 2 — Enable the Hermes API server (once)

The extension talks to Hermes through the gateway's OpenAI-compatible API server.
Enable it for your profile and get an API key:

```bash
./scripts/enable_api_server.sh <your-profile>   # prints an API key
# (auto-detects the profile if you only have one; list profiles with: hermes profile list)
```

Then **restart Hermes** so the gateway picks it up (quit + relaunch the desktop
app, or run `hermes -p <your-profile> gateway`), and verify it's listening:

```bash
curl -H "Authorization: Bearer <your-api-key>" http://127.0.0.1:8642/v1/models
```

You should see `{"object":"list","data":[{"id":"<your-profile>"}]}`.

> Manual alternative: add `API_SERVER_ENABLED=true`, `API_SERVER_PORT=8642`,
> `API_SERVER_KEY=<your-key>` to `<hermes-home>/profiles/<your-profile>/.env`, then
> restart and verify as above.

### Step 3 — Load the extension into Chrome

1. Open `chrome://extensions`
2. Toggle **Developer mode** (top-right corner)
3. Click **Load unpacked** and select the `job-assist-extension` folder
4. The extension appears in the toolbar — **pin it** so the icon is always visible
5. Click the icon to open the side panel (or use the side-panel toggle in the
   `chrome://extensions` details view)

### Step 4 — Configure (⚙ in the side panel)

| Field | Value |
| --- | --- |
| API base URL | `http://127.0.0.1:8642/v1` |
| API key | the key printed by the script in Step 2 (also in your profile's `.env`) |
| Model | **leave empty** — auto-detects your profile name via `GET /v1/models` |
| Career record path | **optional** — path to your verified career record JSON, e.g. `~/Documents/Career-Dossier/career_record.json`. The agent reads this before drafting. Leave empty to draft only from the conversation and the agent's memory. |

Click **Test connection** — the status line should show **Connected**.

### Step 5 — Use it

1. Open a job posting (or an application form page).
2. **Capture this page** — the panel shows the char count and any captured form questions.
3. Pick a mode → **Generate** → watch the draft stream in (full-agent runs take ~10–60 s).
4. **Review the draft** — you are responsible for what you submit.
5. Move it out: **Copy**, **Fill focused field**, **Fill →**, **PDF** (print dialog → Save as PDF), or **.md**.

---

## Testing the UI without the real bridge

Not ready to enable Hermes yet? Test the whole flow with the mock server:

```bash
python3 scripts/mock_api_server.py          # serves http://127.0.0.1:8642/v1
```

In Options, keep the base URL at `http://127.0.0.1:8642/v1`, leave the API key
empty, and run Capture → Generate → Copy → Fill → PDF on any page. The mock
emits a fake draft so you can exercise the UI end-to-end.

## Permissions

The extension requests standard MV3 permissions:

- **`tabs`** — read tab URLs/titles from the side panel (needed for capture and fill routing)
- **`activeTab`** — temporary access to the current tab for the fallback script injection
- **`sidePanel`**, **`storage`**, **`scripting`**, **`clipboardWrite`** — side panel UI, settings, field fill, copy
- **host permissions** — only `http://127.0.0.1:8642` and `localhost:8642` (your local Hermes)

It never asks for access to your browsing history or remote servers.

## Security & privacy notes

- **Local only.** The extension connects to `127.0.0.1:8642`. The API key lives
  in `chrome.storage.local` (extension-local, not synced by default).
- **Values are never captured** from form fields — only questions/labels. If a
  page asks for sensitive info you typed, that stays on the page.
- **Prompt-injection guard.** Job descriptions are untrusted data; the system
  prompt tells Hermes to ignore instructions inside page text. The fill tools
  never read page values back.
- **No auto-submit.** The extension fills fields you point it at. Review every
  draft: anything invented, wrong, or stale is a hiring signal against you.

## Project layout

```
manifest.json        MV3 manifest (side panel, permissions, host permissions)
background.js        Service worker: side-panel wiring, capture/fill routing
content.js           Passive content script: page text + form-question capture, field fill
export.js            Markdown renderer + PDF (print-to-PDF) + .md download
sidepanel.html/css/js Side-panel UI: capture, modes, streaming draft, copy/fill/export
options.html/js      Settings: base URL, API key, model, dossier path
scripts/
  enable_api_server.sh  Idempotent API-server enablement for a Hermes profile
  mock_api_server.py    Fake OpenAI-compatible server for UI testing
  make_icons.py         Placeholder PNG icon generator (no deps)
  test_export.js        Node tests for the markdown/PDF renderer
icons/               Generated placeholder icons
```

## Developer notes

- **Export is dependency-free on purpose.** PDFs come from the browser's own
  print-to-PDF engine (full Unicode, styled with the CSS in `export.js`), and
  Markdown is a plain text download — no AI credits, no Python/JS PDF library,
  no build step.
- The DOM-free core of `export.js` (`renderMarkdown`, `buildPdfHtml`) is unit
  tested with `node scripts/test_export.js`.

## Polish checklist (open items)

- [ ] **Branded icons** — replace `scripts/make_icons.py` placeholders.
- [ ] **CORS from a plain web page** — if you ever test from a non-extension page,
      set `API_SERVER_CORS_ORIGINS=chrome-extension://<your-id>` in the profile `.env`.
- [ ] **Domain allowlist** — if you want the content script on specific job sites
      only, narrow `content_scripts.matches` in `manifest.json`.
- [ ] **Autofill v2** — map drafts to fields by label similarity across the whole
      form, not just focused/selected fields (keep file uploads manual).
- [ ] **Per-application history** — save drafts + captured pages locally for
      follow-up and interview prep.
- [ ] **PDF template polish** — fancier resume/letter headers in `buildPdfHtml`.
- [ ] **Chrome Web Store packaging** — `zip` the folder (minus scripts) when ready.

## Troubleshooting

- **"Hermes not reachable"** → gateway not restarted after enabling the API
  server, or `API_SERVER_KEY` mismatch. Run the curl in Step 2.
- **Capture fails on a tab** → Chrome blocks extensions on `chrome://`, the Web
  Store, and the built-in PDF viewer. Navigate to the real page.
- **Fill does nothing** → the field must be focused (click it first), or pick
  the question in the dropdown and use **Fill →**.
- **PDF button does nothing** → pop-ups/print may be blocked for the extension;
  open the side panel again and retry. Choose **Save as PDF** as the print destination.
- **Draft ignores the career record** → check `dossierPath` in Options and that
  the file exists; the agent reads it with `read_file` during generation. If it's
  empty, the agent drafts from conversation + memory only.
