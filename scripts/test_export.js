#!/usr/bin/env node
// Unit tests for the DOM-free core of export.js (markdown → HTML → PDF doc).
// Run with: node scripts/test_export.js   (exits nonzero on failure)
'use strict';

const { escapeHtml, renderMarkdown, buildPdfHtml } = require('../export.js');

let failures = 0;
function check(name, cond, detail) {
  if (cond) {
    console.log(`ok   - ${name}`);
  } else {
    failures++;
    console.error(`FAIL - ${name}${detail ? `\n       ${detail}` : ''}`);
  }
}

// escapeHtml
check('escapeHtml escapes HTML', escapeHtml('<script>alert("x")</script>') === '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');

// Headings
check('h1 heading', renderMarkdown('# Title\n').includes('<h1>Title</h1>'));
check('h3 heading', renderMarkdown('### Sub\n').includes('<h3>Sub</h3>'));

// Bold / italic / inline code / link
check('bold', renderMarkdown('**strong**\n').includes('<strong>strong</strong>'));
check('italic', renderMarkdown('*em*\n').includes('<em>em</em>'));
check('inline code', renderMarkdown('use `npm i`\n').includes('<code>npm i</code>'));
check(
  'safe link',
  renderMarkdown('[docs](https://example.com)\n').includes('<a href="https://example.com" rel="noopener">docs</a>')
);
check('javascript: link NOT rendered', !renderMarkdown('[x](javascript:alert(1))\n').includes('<a href="javascript:'));

// Lists
check('bullet list', renderMarkdown('- a\n- b\n').includes('<ul><li>a</li><li>b</li></ul>'));
check('numbered list', renderMarkdown('1. a\n2. b\n').includes('<ol><li>a</li><li>b</li></ol>'));

// Code block escapes content
check('code block escaped', renderMarkdown('```\n<a>\n```\n').includes('<pre><code>&lt;a&gt;</code></pre>'));

// hr
check('hr', renderMarkdown('---\n').includes('<hr />'));

// Injection safety: raw HTML in draft must not survive
check('raw HTML stripped', !renderMarkdown('<img src=x onerror=alert(1)>\n').includes('<img'));

// buildPdfHtml
const doc = buildPdfHtml('# Resume\n\n- skill\n', { title: 'Resume Draft', subtitle: 'ACME — https://x.io' });
check('pdf doc has title', doc.includes('<h1>Resume Draft</h1>'));
check('pdf doc has subtitle', doc.includes('ACME — https://x.io'));
check('pdf doc is full html', doc.startsWith('<!doctype html>') && doc.includes('@page'));
check('pdf doc renders markdown', doc.includes('<h1>Resume Draft</h1>') && doc.includes('<ul><li>skill</li></ul>'));

if (failures > 0) {
  console.error(`\n${failures} test(s) FAILED`);
  process.exit(1);
}
console.log('\nAll export tests passed.');
