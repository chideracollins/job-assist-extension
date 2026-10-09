// Job Assist — options page
'use strict';

const $ = (sel) => document.querySelector(sel);

const fields = {
  apiBaseUrl: $('#apiBaseUrl'),
  apiKey: $('#apiKey'),
  model: $('#model'),
  profile: $('#profile'),
  dossierPath: $('#dossierPath')
};
const statusEl = $('#status');

function setStatus(text, isErr) {
  statusEl.textContent = text;
  statusEl.className = isErr ? 'err' : '';
}

async function load() {
  const stored = await chrome.storage.local.get(['apiBaseUrl', 'apiKey', 'model', 'profile', 'dossierPath']);
  fields.apiBaseUrl.value = stored.apiBaseUrl || 'http://127.0.0.1:8642/v1';
  fields.apiKey.value = stored.apiKey || '';
  fields.model.value = stored.model || '';
  fields.profile.value = stored.profile || '';
  fields.dossierPath.value = stored.dossierPath || '';
}

// Effective API base applied to requests (mirrors sidepanel.js getApiBase).
function effectiveBase() {
  const base = fields.apiBaseUrl.value.trim().replace(/\/+$/, '');
  const profile = fields.profile.value.trim();
  if (!profile) return base;
  return base.replace(/\/v1$/, '') + `/p/${encodeURIComponent(profile)}/v1`;
}

$('#form').addEventListener('submit', async (e) => {
  e.preventDefault();
  await chrome.storage.local.set({
    apiBaseUrl: fields.apiBaseUrl.value.trim().replace(/\/+$/, ''),
    apiKey: fields.apiKey.value.trim(),
    model: fields.model.value.trim(),
    profile: fields.profile.value.trim(),
    dossierPath: fields.dossierPath.value.trim()
  });
  setStatus('Saved.');
});

$('#test').addEventListener('click', async () => {
  const base = effectiveBase();
  const key = fields.apiKey.value.trim();
  setStatus('Testing…');
  try {
    const res = await fetch(`${base}/models`, {
      headers: key ? { Authorization: `Bearer ${key}` } : {}
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.json();
    const ids = (body.data || []).map((m) => m.id).join(', ');
    setStatus(`Connected. Advertised models: ${ids || '(none)'}.`);
  } catch (err) {
    setStatus(
      `Could not reach ${base}. Is the Hermes gateway running with the API server enabled? ` +
        `See README.md → Setup. (${String((err && err.message) || err)})`,
      true
    );
  }
});

load();
