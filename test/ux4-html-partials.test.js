/**
 * UX-4 — index.html composed from views/ partials.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const { composeIndexHtml, TAB_ORDER } = require('../views/compose-index');

test('views/ tiene head, foot y un parcial por pestaña', () => {
  assert.ok(fs.existsSync(path.join(root, 'views', '_head.html')));
  assert.ok(fs.existsSync(path.join(root, 'views', '_foot.html')));
  assert.ok(fs.existsSync(path.join(root, 'views', 'compose-index.js')));
  for (const id of TAB_ORDER) {
    const p = path.join(root, 'views', 'tabs', `${id}.html`);
    assert.ok(fs.existsSync(p), `missing ${p}`);
    const body = fs.readFileSync(p, 'utf8');
    assert.match(body, new RegExp(`id="${id}"`));
    assert.match(body, /tab-panel/);
  }
});

test('composeIndexHtml incluye las 8 pestañas bajo markers de main', () => {
  const html = composeIndexHtml(root);
  assert.match(html, /<main class="main-content">/);
  assert.match(html, /<\/main>/);
  for (const id of TAB_ORDER) {
    assert.match(html, new RegExp(`<section[^>]*id="${id}"[^>]*class="[^"]*tab-panel`));
  }
  assert.match(html, /id="staticHostModal"/);
  assert.match(html, /src="app\.js/);
});

test('index.html committed matches compose (Pages / git)', () => {
  const composed = composeIndexHtml(root);
  const committed = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.equal(
    committed.replace(/\r\n/g, '\n'),
    composed.replace(/\r\n/g, '\n'),
    'Run: npm run build:index'
  );
});

test('GET / usa composeIndexHtml (no sendFile de index.html)', () => {
  const serverSrc = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
  assert.match(serverSrc, /composeIndexHtml/);
  assert.match(serverSrc, /res\.type\('html'\)\.send\(composeIndexHtml/);
  assert.doesNotMatch(serverSrc, /res\.sendFile\(path\.join\(__dirname,\s*'index\.html'\)\)/);
});
