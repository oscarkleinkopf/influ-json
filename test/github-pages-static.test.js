/**
 * GitHub Pages / static host: no fingir login PIN; landing docs honesta.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const appJs = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const docsIndex = fs.readFileSync(path.join(root, 'docs', 'index.html'), 'utf8');

test('detecta GitHub Pages / file:// como host estático', () => {
  assert.match(appJs, /function isStaticHostEnvironment/);
  assert.match(appJs, /github\\.io/);
  assert.match(appJs, /file:/);
});

test('sin API Studio muestra staticHostModal (no login PIN)', () => {
  assert.match(appJs, /function showStaticHostScreen/);
  assert.match(appJs, /probeStudioApiStatus/);
  assert.match(appJs, /isStaticHostEnvironment\(\)[\s\S]{0,120}showStaticHostScreen/);
  assert.match(indexHtml, /id="staticHostModal"/);
  assert.match(indexHtml, /Studio local/);
  assert.match(indexHtml, /npm start/);
});

test('landing docs/ explica arranque local', () => {
  assert.match(docsIndex, /influ-JSON/);
  assert.match(docsIndex, /npm start/);
  assert.match(docsIndex, /character_lock/);
  assert.match(docsIndex, /127\.0\.0\.1:3000/);
  assert.match(docsIndex, /login Google|Google opt-in/i);
  assert.ok(fs.existsSync(path.join(root, 'docs', '.nojekyll')));
  assert.ok(fs.existsSync(path.join(root, '.nojekyll')));
});

test('staticHostModal menciona sesiones (Google no en Pages)', () => {
  assert.match(indexHtml, /id="staticHostModal"/);
  assert.match(indexHtml, /login Google|sesiones/i);
});
