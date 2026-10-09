// Job Assist — background service worker
// Wires the side panel, routes capture/fill messages to the active tab,
// and stores default settings on install.
'use strict';

const DEFAULTS = {
  apiBaseUrl: 'http://127.0.0.1:8642/v1',
  apiKey: '',
  model: '', // empty = auto-detect from /v1/models
  profile: '', // optional: named profile on multiplexed installs (/p/<profile>/v1)
  dossierPath: '', // optional: path to a verified career record JSON
  stream: true
};

chrome.runtime.onInstalled.addListener(async () => {
  const existing = await chrome.storage.local.get(Object.keys(DEFAULTS));
  const toSet = {};
  for (const [k, v] of Object.entries(DEFAULTS)) {
    if (existing[k] === undefined) toSet[k] = v;
  }
  if (Object.keys(toSet).length > 0) await chrome.storage.local.set(toSet);

  if (chrome.sidePanel) {
    await chrome.sidePanel
      .setPanelBehavior({ openPanelOnActionClick: true })
      .catch(() => {});
  }
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || typeof msg.type !== 'string') return undefined;

  if (msg.type === 'capture') {
    (async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || tab.id === undefined) throw new Error('No active tab found.');
      try {
        const data = await chrome.tabs.sendMessage(tab.id, { type: 'extract' });
        sendResponse({ ok: true, data });
      } catch {
        // Content script not injected (e.g. the tab predates the extension).
        try {
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['content.js']
          });
          const data = await chrome.tabs.sendMessage(tab.id, { type: 'extract' });
          sendResponse({ ok: true, data });
        } catch {
          sendResponse({
            ok: false,
            error:
              'Cannot read this page. Chrome blocks extensions on some pages ' +
              '(chrome:// pages, the Web Store, built-in PDF viewer).'
          });
        }
      }
    })().catch((err) => sendResponse({ ok: false, error: String((err && err.message) || err) }));
    return true; // async response
  }

  if (msg.type === 'fill') {
    (async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || tab.id === undefined) {
        sendResponse({ ok: false, error: 'No active tab.' });
        return;
      }
      try {
        const data = await chrome.tabs.sendMessage(tab.id, msg.payload);
        sendResponse({ ok: true, data });
      } catch (err) {
        sendResponse({ ok: false, error: String((err && err.message) || err) });
      }
    })();
    return true;
  }

  return undefined;
});
