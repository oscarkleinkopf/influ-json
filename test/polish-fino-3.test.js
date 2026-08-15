'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

describe('Polish-3 — restos ES / checklist / alts', () => {
  it('hides checklist step actions when roster empty', () => {
    const dash = fs.readFileSync(path.join(root, 'views/tabs/dashboard.html'), 'utf8');
    assert.match(dash, /happy-path-step-actions/);
    const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
    assert.match(app, /happy-path-step-actions[\s\S]{0,120}rosterEmpty/);
    assert.match(app, /CTAs viven solo en Portafolio/);
  });

  it('Scripts → Guiones in visible UI', () => {
    const dash = fs.readFileSync(path.join(root, 'views/tabs/dashboard.html'), 'utf8');
    const campaigns = fs.readFileSync(path.join(root, 'views/tabs/campaigns.html'), 'utf8');
    const lic = fs.readFileSync(path.join(root, 'views/tabs/licensing.html'), 'utf8');
    assert.match(dash, /<h3>Guiones<\/h3>/);
    assert.doesNotMatch(dash, /<h3>Scripts<\/h3>/);
    assert.match(campaigns, /Regenerar guiones/);
    assert.doesNotMatch(campaigns, /Regenerar Scripts/);
    assert.match(lic, /Paquete de redacción \(10 guiones\)/);
    assert.doesNotMatch(lic, /10 Scripts/);
    const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
    assert.match(app, /Regenerar guiones/);
  });

  it('no preferí voseo in variant tooltip', () => {
    const pe = fs.readFileSync(path.join(root, 'views/tabs/persona-engine.html'), 'utf8');
    assert.match(pe, /prefiere Copiar JSON/);
    assert.doesNotMatch(pe, /preferí/);
  });

  it('image alts are Spanish', () => {
    const files = [
      'views/tabs/persona-engine.html',
      'views/tabs/ugc-studio.html',
      'views/_foot.html',
      'app.js',
      'photo-upload-ui.js'
    ];
    for (const rel of files) {
      const text = fs.readFileSync(path.join(root, rel), 'utf8');
      assert.doesNotMatch(text, /alt="Profile"/);
      assert.doesNotMatch(text, /alt="Generated image"/);
      assert.doesNotMatch(text, /alt="Influencer Holding Product"/);
      assert.doesNotMatch(text, /alt="Gallery preview"/);
      assert.doesNotMatch(text, /alt="Generation image"/);
      assert.doesNotMatch(text, /alt="Reference Photo"/);
    }
  });
});
