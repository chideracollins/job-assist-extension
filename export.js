// Job Assist — export utilities.
// Converts a markdown draft into clean HTML and produces a PDF via the
// browser's built-in print-to-PDF dialog — zero dependencies, no AI credits,
// full Unicode. Also downloads the draft as Markdown.
//
// The core functions (escapeHtml, renderMarkdown, buildPdfHtml) are DOM-free
// and exported for node tests (scripts/test_export.js).
'use strict';

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Apply inline styles to ALREADY-ESCAPED text. Order matters: code and bold
// first so they are not re-parsed by later rules.
function inline(text) {
  return String(text)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    // Links: only http(s) — never javascript: or data:.
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" rel="noopener">$1</a>');
}

// Minimal, safe markdown renderer for the subset the agent outputs:
// headings, fenced code, hr, bullet/numbered lists, paragraphs, inline
// code/bold/italic/links. Input is treated as untrusted text (escaped).
function renderMarkdown(src) {
  const lines = String(src || '').split(/\r?\n/);
  const out = [];
  let para = [];
  let listType = null;
  let listItems = [];

  const flushParagraph = () => {
    if (para.length) {
      out.push('<p>' + para.map(inline).join(' ') + '</p>');
      para = [];
    }
  };
  const flushList = () => {
    if (listItems.length) {
      out.push('<' + listType + '><li>' + listItems.map(inline).join('</li><li>') + '</li></' + listType + '>');
      listItems = [];
    }
    listType = null;
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block.
    if (/^```/.test(line.trim())) {
      flushParagraph();
      flushList();
      const buf = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i].trim())) {
        buf.push(lines[i]);
        i++;
      }
      i++; // skip closing fence
      out.push('<pre><code>' + escapeHtml(buf.join('\n')) + '</code></pre>');
      continue;
    }

    const trimmed = line.trim();
    if (!trimmed) {
      flushParagraph();
      flushList();
      i++;
      continue;
    }

    // Headings.
    const h = /^(#{1,6})\s+(.*)$/.exec(trimmed);
    if (h) {
      flushParagraph();
      flushList();
      const lvl = h[1].length;
      out.push('<h' + lvl + '>' + inline(escapeHtml(h[2])) + '</h' + lvl + '>');
      i++;
      continue;
    }

    // Horizontal rule.
    if (/^(-{3,}|\*{3,})$/.test(trimmed)) {
      flushParagraph();
      flushList();
      out.push('<hr />');
      i++;
      continue;
    }

    // Unordered list.
    const ul = /^[-*+]\s+(.*)$/.exec(trimmed);
    if (ul) {
      flushParagraph();
      if (listType !== 'ul') {
        flushList();
        listType = 'ul';
      }
      listItems.push(escapeHtml(ul[1]));
      i++;
      continue;
    }

    // Ordered list.
    const ol = /^\d+[.)]\s+(.*)$/.exec(trimmed);
    if (ol) {
      flushParagraph();
      if (listType !== 'ol') {
        flushList();
        listType = 'ol';
      }
      listItems.push(escapeHtml(ol[1]));
      i++;
      continue;
    }

    // Plain paragraph line.
    flushList();
    para.push(escapeHtml(trimmed));
    i++;
  }

  flushParagraph();
  flushList();
  return out.join('\n');
}

// Full standalone HTML document for print-to-PDF, styled for resumes/letters.
function buildPdfHtml(markdown, opts) {
  const o = opts || {};
  const title = o.title || 'Draft';
  const subtitle = o.subtitle || '';
  const body = renderMarkdown(markdown);
  return (
    '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8" />\n' +
    '<title>' + escapeHtml(title) + '</title>\n' +
    '<style>\n' +
    '  @page { size: A4; margin: 16mm 14mm; }\n' +
    '  * { box-sizing: border-box; }\n' +
    '  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; font-size: 11pt; line-height: 1.55; color: #1c1c28; margin: 0; }\n' +
    '  header { margin-bottom: 6mm; padding-bottom: 3mm; border-bottom: 2px solid #6c5ce7; }\n' +
    '  h1 { font-size: 17pt; margin: 0 0 1mm; color: #17152a; }\n' +
    '  .subtitle { color: #6b6b80; font-size: 10pt; margin: 0; word-break: break-word; }\n' +
    '  h2 { font-size: 12.5pt; margin: 6mm 0 2mm; color: #17152a; border-bottom: 1px solid #e2e2ec; padding-bottom: 1mm; }\n' +
    '  h3 { font-size: 11pt; margin: 4mm 0 1.5mm; color: #17152a; }\n' +
    '  p { margin: 0 0 2.5mm; }\n' +
    '  ul, ol { margin: 0 0 2.5mm; padding-left: 6mm; }\n' +
    '  li { margin-bottom: 1mm; }\n' +
    '  code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 9.5pt; background: #f4f4f9; padding: 0.5mm 1.5mm; border-radius: 2mm; }\n' +
    '  pre { background: #f4f4f9; border-radius: 2.5mm; padding: 3mm; white-space: pre-wrap; overflow-wrap: break-word; }\n' +
    '  pre code { background: none; padding: 0; }\n' +
    '  strong { color: #17152a; }\n' +
    '  a { color: #4e3fc7; }\n' +
    '  hr { border: none; border-top: 1px solid #e2e2ec; margin: 4mm 0; }\n' +
    '  footer { margin-top: 8mm; font-size: 8.5pt; color: #9a9ab0; }\n' +
    '  @media print { footer { display: none; } }\n' +
    '</style>\n</head>\n<body>\n' +
    '<header>\n  <h1>' + escapeHtml(title) + '</h1>\n' +
    (subtitle ? '  <p class="subtitle">' + escapeHtml(subtitle) + '</p>\n' : '') +
    '</header>\n<main>\n' + body + '\n</main>\n' +
    '<footer>Draft generated with Job Assist — review before submitting.</footer>\n' +
    '</body>\n</html>'
  );
}

// ---------- browser helpers ----------

function downloadTextFile(filename, text, mime) {
  const type = mime || 'text/markdown';
  const blob = new Blob([text], { type: type + ';charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}

// Opens the browser's print dialog with the draft rendered as a styled page.
// The user picks "Save as PDF" as the destination — Chrome's engine does the
// conversion locally (no AI credits, no dependencies).
function printToPdf(markdown, opts) {
  const html = buildPdfHtml(markdown, opts);
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.left = '-10000px';
  iframe.style.top = '0';
  iframe.style.width = '1024px';
  iframe.style.height = '800px';
  iframe.style.border = '0';
  iframe.setAttribute('aria-hidden', 'true');
  iframe.onload = () => {
    try {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
    } catch (err) {
      console.error('print-to-PDF failed:', err);
    }
    // Keep the frame alive through the print dialog, then drop it.
    setTimeout(() => iframe.remove(), 60000);
  };
  iframe.srcdoc = html;
  document.body.appendChild(iframe);
  return true;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { escapeHtml, renderMarkdown, buildPdfHtml };
}
