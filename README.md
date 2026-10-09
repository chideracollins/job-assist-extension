# Job Assist — Hermes Copilot (Chrome extension)

Capture the job page you're looking at and let your **local** Hermes agent draft a
tailored resume, cover letter, and application answers — grounded in your
**verified career record**, never invented from the screen.

```
[Job page] ──capture──▶ [Extension side panel]
                              │  POST /v1/chat/completions (Bearer key)
                              ▼
                    [Hermes API server @ http://127.0.0.1:8642/v1]
                              │  full agent: memory + skills + tools
                              ▼
                 reads ~/Documents/Career-Dossier/career_record.json
                              │
                              ▼
        tailored draft ──▶ Copy / Fill focused field / Fill by question
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

Then move the draft into the form: **Copy**, **Fill focused field**, or pick a
captured question in the dropdown and **Fill →** (React/Vue forms accept the
fill because it uses the native value setter + real events).

---

## Installation

**Prerequisites:** Chrome 116+, Hermes installed, and a `career-os` profile with
a career record at `~/Documents/Career-Dossier/career_record.json`.

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
./scripts/enable_api_server.sh career-os   # idempotent; prints an API key
```

Then **restart Hermes** so the gateway picks it up (quit + relaunch the desktop
app, or run `hermes -p career-os gateway`), and verify it's listening:

```bash
curl -H "Authorization: Bearer <your-api-key>" http://127.0.0.1:8642/v1/models
```

You should see `{"object":"list","data":[{"id":"career-os"}]}`.

> Manual alternative: add `API_SERVER_ENABLED=true`, `API_SERVER_PORT=8642`,
> `API_SERVER_KEY=<your-key>` to `<hermes-home>/profiles/career-os/.env`, then
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
| Model | `career-os` (your profile name as advertised by `/v1/models`) |
| Career record path | `~/Documents/Career-Dossier/career_record.json` |

Click **Test connection** — the status line should show **Connected**.

### Step 5 — Use it

1. Open a job posting (or an application form page).
2. **Capture this page** — the panel shows the char count and any captured form questions.
3. Pick a mode → **Generate** → watch the draft stream in (full-agent runs take ~10–60 s).
4. **Review the draft** — you are responsible for what you submit.
5. **Copy** it, or focus a form field and **Fill focused field**, or pick a
   question in the dropdown and **Fill →**.

---

## Testing the UI without the real bridge

Not ready to enable Hermes yet? Test the whole flow with the mock server:

```bash
python3 scripts/mock_api_server.py          # serves http://127.0.0.1:8642/v1
```

In Options, keep the base URL at `http://127.0.0.1:8642/v1`, leave the API key
empty, and run Capture → Generate → Copy → Fill on any page. The mock emits a
fake draft so you can exercise the UI end-to-end.

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
sidepanel.html/css/js Side-panel UI: capture, modes, streaming draft, copy/fill
options.html/js      Settings: base URL, API key, model, dossier path
scripts/
  enable_api_server.sh  Idempotent API-server enablement for a Hermes profile
  mock_api_server.py    Fake OpenAI-compatible server for UI testing
  make_icons.py         Placeholder PNG icon generator (no deps)
icons/               Generated placeholder icons
```

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
- [ ] **Resume PDF export** — generate the .docx/.pdf alongside the draft.
- [ ] **Chrome Web Store packaging** — `zip` the folder (minus scripts) when ready.

## Troubleshooting

- **"Hermes not reachable"** → gateway not restarted after enabling the API
  server, or `API_SERVER_KEY` mismatch. Run the curl in Step 2.
- **Capture fails on a tab** → Chrome blocks extensions on `chrome://`, the Web
  Store, and the built-in PDF viewer. Navigate to the real page.
- **Fill does nothing** → the field must be focused (click it first), or pick
  the question in the dropdown and use **Fill →**.
- **Draft ignores the career record** → check `dossierPath` in Options and that
  `career_record.json` exists; the agent reads it with `read_file` during generation.
