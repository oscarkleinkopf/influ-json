'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

describe('Polish-2 — guía, ES, a11y modales, CTA vacío', () => {
  it('Cómo usar mentions start-studio, plantillas/brief, Licencias', () => {
    const guide = fs.readFileSync(path.join(root, 'views/tabs/como-usar.html'), 'utf8');
    assert.match(guide, /start-studio/);
    assert.match(guide, /Plantillas|Qué producir ahora/);
    assert.match(guide, /Licencias/);
    assert.doesNotMatch(guide, /Campañas \+ Licensing/);
  });

  it('visible titles are Spanish (Guiones / Licencias)', () => {
    const scripts = fs.readFileSync(path.join(root, 'views/tabs/script-engine.html'), 'utf8');
    const lic = fs.readFileSync(path.join(root, 'views/tabs/licensing.html'), 'utf8');
    const head = fs.readFileSync(path.join(root, 'views/_head.html'), 'utf8');
    assert.match(scripts, /<h1>Guiones<\/h1>/);
    assert.match(lic, /<h1>Licencias y pitch<\/h1>/);
    assert.match(head, /data-tab="licensing">Licencias</);
    assert.doesNotMatch(scripts, /<h1>Script Engine<\/h1>/);
    assert.doesNotMatch(lic, /Licensing & Pitch/);
  });

  it('no user-facing voseo leftovers in views/app', () => {
    const files = [
      'views/tabs/licensing.html',
      'views/tabs/ugc-studio.html',
      'views/tabs/persona-engine.html',
      'views/tabs/script-engine.html',
      'app.js'
    ];
    for (const rel of files) {
      const text = fs.readFileSync(path.join(root, rel), 'utf8');
      assert.doesNotMatch(text, /\belegí\b/i);
      assert.doesNotMatch(text, /\busá\b/);
      assert.doesNotMatch(text, /\bcreá\b/);
      assert.doesNotMatch(text, /\bcopiá\b/);
      assert.doesNotMatch(text, /\barmá\b/);
      assert.doesNotMatch(text, /\bAñadí\b/);
    }
  });

  it('settings + import modals have dialog contract on overlay', () => {
    const foot = fs.readFileSync(path.join(root, 'views/_foot.html'), 'utf8');
    assert.match(foot, /id="settingsModal"[^>]*role="dialog"/);
    assert.match(foot, /id="settingsModal"[^>]*aria-modal="true"/);
    assert.match(foot, /id="settingsModal"[^>]*aria-labelledby="settingsModalTitle"/);
    assert.match(foot, /id="importInfluencerModal"[^>]*role="dialog"/);
    assert.match(foot, /id="importInfluencerModal"[^>]*aria-modal="true"/);
    assert.match(foot, /id="importInfluencerTitle"/);
    assert.match(foot, /id="btnCloseImportModal"[^>]*aria-label="Cerrar importación"/);
  });

  it('empty roster: next CTA has no duplicate buttons; member banner has no CTA row', () => {
    const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
    assert.match(app, /Un solo cluster de CTAs vive en #emptyRosterPanel/);
    assert.match(app, /Usa <strong>Crear<\/strong> \/ <strong>Importar<\/strong> en el Portafolio/);
    assert.match(app, /id="btnEmptyRosterCreate"/);
    const dash = fs.readFileSync(path.join(root, 'views/tabs/dashboard.html'), 'utf8');
    assert.doesNotMatch(dash, /id="btnMemberEmptyCreate"/);
  });
});
