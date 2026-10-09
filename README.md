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

## What it does

| Mode | What you get |
| --- | --- |
| **Resume** | One-page resume tailored to the posting, with a "Gaps to address" section for requirements the record doesn't support |
| **Cover letter** | 3–4 short paragraphs grounded in the record, addressing the company's stated needs |
| **Answers** | Numbered answers to the captured application-form questions |
| **Ask** | Freeform: summarize requirements, suggest projects, anything |

Plus: **Fill focused field** and **Fill →** (per captured question) to move a
draft into the form, with a native-setter + real events so React/Vue forms
accept it.

## Setup

### 1. Enable the Hermes API server (once)

The extension talks to Hermes through the gateway's OpenAI-compatible API server.

```bash
cd job-assist-extension
./scripts/enable_api_server.sh career-os   # idempotent; prints an API key
```

Then **restart Hermes** (quit + relaunch the desktop app, or
`hermes -p career-os gateway`) and verify:

```bash
curl -H "Authorization: Bearer <key>" http://127.0.0.1:8642/v1/models
```

Manual alternative: add to `<hermes-home>/profiles/career-os/.env`
(`API_SERVER_ENABLED=true`, `API_SERVER_PORT=8642`, `API_SERVER_KEY=<your-key>`),
restart, verify.

### 2. Load the extension

1. Open `chrome://extensions`
2. Enable **Developer mode** (top right)
3. **Load unpacked** → select this folder (`job-assist-extension`)
4. Pin the extension; clicking the icon opens the side panel (or use
   `chrome://extensions` → the side-panel toggle).

### 3. Configure in Options (⚙ in the side panel)

| Field | Value |
| --- | --- |
| API base URL | `http://127.0.0.1:8642/v1` |
| API key | the `API_SERVER_KEY` from step 1 |
| Model | `career-os` (your profile name as advertised by `/v1/models`) |
| Career record path | `/Users/cc/Documents/Career-Dossier/career_record.json` |

Click **Test connection** — you should see the advertised model.

### 4. Use it

1. Open a job posting (or an application form page).
2. **Capture this page** — see the char count and captured questions.
3. Pick a mode → **Generate** → watch the draft stream in.
4. **Review the draft** — you are responsible for what you submit.
5. **Copy**, or focus a form field and **Fill focused field**, or pick a
   question in the dropdown and **Fill →**.

## Testing without the real bridge

If Hermes isn't set up yet, test the whole UI with the mock server:

```bash
python3 scripts/mock_api_server.py          # serves http://127.0.0.1:8642/v1
```

Set the extension Options base URL to `http://127.0.0.1:8642/v1`, leave the API
key empty, and run Capture → Generate → Copy → Fill on any page. The mock emits
a fake draft so you can exercise the flow end-to-end.

## Security & privacy notes

- **Local only.** The extension connects to `127.0.0.1:8642`. The API key lives
  in `chrome.storage.local` (extension-local, not synced by default).
- **Values are never captured** from form fields — only questions/labels. If a
  page asks for sensitive info you typed, that stays on the page.
- **Prompt-injection guard.** Job descriptions are untrusted data; the system
  prompt tells Hermes to ignore instructions inside page text. The mock/fill
  tools never read page values back.
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
  server, or `API_SERVER_KEY` mismatch. Run the curl above.
- **Capture fails on a tab** → Chrome blocks extensions on `chrome://`, the Web
  Store, and the built-in PDF viewer. Navigate to the real page.
- **Fill does nothing** → the field must be focused (click it first), or pick
  the question in the dropdown and use **Fill →**.
- **Draft ignores the career record** → check `dossierPath` and that
  `career_record.json` exists; the agent reads it with `read_file` during generation.
