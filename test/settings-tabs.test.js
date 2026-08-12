/**
 * Ajustes: pestañas + lista de perfiles scrolleable (no muro sin navegación).
 * Markup vive en views/_foot.html → npm run build:index → index.html.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const foot = fs.readFileSync(path.join(root, 'views/_foot.html'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'index.css'), 'utf8');

test('settings: tab nav + paneles por sección (_foot + index)', () => {
  for (const src of [foot, html]) {
    assert.match(src, /id="settingsTabNav"/);
    assert.match(src, /data-settings-tab="claves"/);
    assert.match(src, /data-settings-tab="perfiles"/);
    assert.match(src, /data-settings-tab="invites"/);
    assert.match(src, /data-settings-tab="studio"/);
    assert.match(src, /data-settings-tab="cuenta"/);
    assert.match(src, /id="settingsPanelClaves"/);
    assert.match(src, /id="settingsPanelPerfiles"/);
    assert.match(src, /id="profilesListFilter"/);
    assert.match(src, /id="cuentaActiveProfileSummary"/);
    assert.match(src, /id="btnPruneEmptyTestProfiles"/);
  }
});

test('settings: JS setSettingsTab y filtro de perfiles', () => {
  assert.match(app, /function setSettingsTab\(/);
  assert.match(app, /profilesListFilter/);
  assert.match(app, /influ_settings_tab/);
  assert.match(app, /function openPollinationsSettings[\s\S]{0,800}setSettingsTab\('claves'\)/);
  assert.match(app, /sessionStorage\.setItem\('influ_settings_tab', 'claves'\)/);
});

test('settings: CSS scroll en card y lista de perfiles', () => {
  assert.match(css, /\.settings-card/);
  assert.match(css, /\.profiles-list-scroll/);
  assert.match(css, /\.settings-tab-nav/);
  assert.match(css, /max-height:\s*min\(88vh/);
});
