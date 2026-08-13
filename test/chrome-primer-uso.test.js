/**
 * Idea #5 — silenciar chrome primer uso:
 * PIN en Ajustes (no barra+toast); offline = chip; Git/Ajustes colapsados.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'index.css'), 'utf8');

test('chrome #5: Más tarde no dispara toast ni banner PIN', () => {
  const laterIdx = app.indexOf('btnSetupPinLater');
  assert.ok(laterIdx > 0);
  const slice = app.slice(laterIdx, laterIdx + 450);
  assert.match(slice, /hideSetupPinModal/);
  assert.match(slice, /maybeShowPinDefaultBanner/);
  assert.doesNotMatch(slice, /toastInfo\(/);
  assert.match(app, /function maybeShowPinDefaultBanner[\s\S]{0,280}display = 'none'/);
  assert.match(html, /id="pinDefaultSettingsHint"/);
  assert.match(html, /btnSetupPinLater[\s\S]{0,200}Ajustes/);
  assert.doesNotMatch(html, /banner de aviso/);
});

test('chrome #5: offline es chip; sin barra fija', () => {
  assert.match(html, /id="offlineModeChip"/);
  assert.match(html, /id="offlineModeToggleBar"/);
  assert.doesNotMatch(html, /id="offlineModeBar"/);
  assert.match(app, /offlineModeChip/);
  assert.match(css, /\.offline-mode-chip/);
  assert.match(css, /padding-top:\s*40px/);
  assert.doesNotMatch(css, /padding-top:\s*76px/);
});

test('chrome #5: Studio / Git colapsado en sidebar', () => {
  assert.match(html, /id="sidebarStudioTools"/);
  assert.match(html, /<details id="sidebarStudioTools"[\s\S]{0,80}>/);
  assert.doesNotMatch(html, /id="sidebarStudioTools"[^>]*\sopen\b/);
  assert.match(html, /id="sidebarStudioTools"[\s\S]{0,400}id="btnOpenSettings"/);
  assert.match(html, /id="sidebarStudioTools"[\s\S]{0,600}id="btnSyncNow"/);
});
