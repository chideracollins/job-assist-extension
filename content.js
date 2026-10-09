// Job Assist — content script (passive)
// Does nothing on its own. When asked by the side panel it:
//   - extracts the visible page text + form questions from the job page
//   - fills an editable field (focused, or by captured index)
'use strict';

(() => {
  const TEXT_LIMIT = 60000;

  function visibleText(el) {
    return (el && el.innerText ? el.innerText : '').trim();
  }

  // Prefer the main content region of a job posting; fall back to the body.
  function pickMainElement() {
    const candidates = document.querySelectorAll(
      'main, article, [role="main"], #job-description, .job-description, .description, .posting'
    );
    for (const el of candidates) {
      const t = visibleText(el);
      if (t.length > 400) return { el, t };
    }
    return { el: document.body, t: visibleText(document.body) };
  }

  function capText(text) {
    if (text.length <= TEXT_LIMIT) return text;
    return (
      text.slice(0, TEXT_LIMIT) +
      `\n\n[... truncated: ${text.length - TEXT_LIMIT} more chars]`
    );
  }

  function labelFor(el) {
    if (el.labels && el.labels.length > 0) return el.labels[0].innerText.trim();
    if (el.id) {
      const lab = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (lab) return lab.innerText.trim();
    }
    const wrapping = el.closest('label');
    if (wrapping) return wrapping.innerText.trim();
    const ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel) return ariaLabel.trim();
    const labelledBy = el.getAttribute('aria-labelledby');
    if (labelledBy) {
      const parts = labelledBy
        .split(/\s+/)
        .map((id) => {
          const node = document.getElementById(id);
          return node ? node.innerText.trim() : '';
        })
        .filter(Boolean);
      if (parts.length) return parts.join(' ');
    }
    if (el.placeholder) return `(placeholder) ${el.placeholder.trim()}`;
    if (el.name) return `(name) ${el.name}`;
    return '(untitled question)';
  }

  // Collect visible form questions. Values are intentionally NOT captured —
  // the agent only needs the questions, and we never read passwords or PII.
  function collectQuestions() {
    const fields = [];
    const seen = new WeakSet();
    const selector =
      'textarea, input[type="text"], input[type="email"], input[type="tel"], ' +
      'input[type="url"], input:not([type]), select';
    const skipTypes = ['hidden', 'submit', 'button', 'reset', 'checkbox', 'radio', 'file', 'password', 'image'];

    document.querySelectorAll(selector).forEach((el) => {
      if (seen.has(el)) return;
      seen.add(el);
      const type = el.type || 'text';
      if (skipTypes.includes(type)) return;
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      const visible =
        rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
      if (!visible) return;
      fields.push({
        index: fields.length,
        label: labelFor(el),
        type,
        required: el.required || el.getAttribute('aria-required') === 'true' || false,
        maxLength: el.maxLength > 0 ? el.maxLength : null
      });
    });
    return fields;
  }

  function extract() {
    const { t } = pickMainElement();
    return {
      url: location.href,
      title: document.title,
      text: capText(t),
      questions: collectQuestions(),
      capturedAt: new Date().toISOString()
    };
  }

  // React/Vue/etc. need the native value setter + real events, not el.value = x.
  function setNativeValue(el, value) {
    const proto =
      el instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : el instanceof HTMLSelectElement
          ? HTMLSelectElement.prototype
          : HTMLInputElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, 'value');
    if (desc && desc.set) desc.set.call(el, value);
    else el.value = value;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function fillElement(el, text) {
    if (!el) return { ok: false, reason: 'No editable element found.' };
    if (el.isContentEditable) {
      el.focus();
      el.textContent = text;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return { ok: true };
    }
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      el.focus();
      setNativeValue(el, text);
      return { ok: true, maxLength: el.maxLength > 0 ? el.maxLength : null };
    }
    if (el instanceof HTMLSelectElement) {
      const hit = Array.from(el.options).find(
        (o) => text.trim().toLowerCase() === o.text.trim().toLowerCase()
      );
      if (hit) {
        setNativeValue(el, hit.value);
        return { ok: true };
      }
      return { ok: false, reason: 'Dropdown match not found — choose manually.' };
    }
    return { ok: false, reason: 'Focused element is not a fillable field.' };
  }

  function focusedEditable() {
    const el = document.activeElement;
    if (!el) return null;
    if (
      el.isContentEditable ||
      el instanceof HTMLInputElement ||
      el instanceof HTMLTextAreaElement ||
      el instanceof HTMLSelectElement
    ) {
      return el;
    }
    return null;
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || typeof msg.type !== 'string') return undefined;
    switch (msg.type) {
      case 'extract':
        sendResponse(extract());
        return;
      case 'fill-focused': {
        sendResponse(fillElement(focusedEditable(), msg.text || ''));
        return;
      }
      case 'fill-by-index': {
        const fields = collectQuestions();
        const el = fields[msg.index];
        sendResponse(fillElement(el, msg.text || ''));
        return;
      }
      default:
        return undefined;
    }
  });
})();
