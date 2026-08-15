'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

describe('Polish fino — dashboard + copy CTA + ES + login a11y', () => {
  it('dashboard demotes plantillas/brief until roster exists', () => {
    const dash = fs.readFileSync(path.join(root, 'views/tabs/dashboard.html'), 'utf8');
    assert.match(dash, /id="communityTemplatesCard"[^>]*data-require-roster="1"/);
    assert.match(dash, /id="prodBriefCard"[^>]*data-require-roster="1"/);
    const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
    assert.match(app, /function syncDashboardRosterPolish/);
    assert.match(app, /data-require-roster/);
    assert.match(app, /updateDashboardStats[\s\S]{0,200}syncDashboardRosterPolish/);
  });

  it('copy without persona / clipboard fail expose CTA', () => {
    const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
    assert.match(app, /Elige un influencer primero \(chip «Trabajando con»\)\.[\s\S]{0,120}actionLabel:\s*'Ir a Influencers'/);
    assert.match(app, /Selecciona o crea un influencer antes de copiar un pack\.[\s\S]{0,120}actionLabel:\s*'Ir a Influencers'/);
    assert.match(app, /No se pudo copiar el pack:[\s\S]{0,160}actionLabel:\s*'Reintentar'/);
    assert.match(app, /function flashCopySuccessButtons/);
    assert.match(app, /¡Copiado!/);
  });

  it('Spanish tuteo: no voseo Elegí / no Product in Hand', () => {
    const views = [
      'views/tabs/ugc-studio.html',
      'views/tabs/script-engine.html',
      'views/tabs/licensing.html',
      'app.js'
    ];
    for (const rel of views) {
      const text = fs.readFileSync(path.join(root, rel), 'utf8');
      assert.doesNotMatch(text, /\belegí\b/i);
      assert.doesNotMatch(text, /Product in Hand/);
    }
    const ugc = fs.readFileSync(path.join(root, 'views/tabs/ugc-studio.html'), 'utf8');
    assert.match(ugc, /Producir · UGC \(producto en mano\)/);
  });

  it('loginModal has dialog contract', () => {
    const foot = fs.readFileSync(path.join(root, 'views/_foot.html'), 'utf8');
    assert.match(foot, /id="loginModal"[^>]*role="dialog"/);
    assert.match(foot, /aria-modal="true"/);
    assert.match(foot, /aria-labelledby="loginModalTitle"/);
    assert.match(foot, /id="loginModalTitle"/);
    const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
    assert.match(app, /showLoginScreen[\s\S]{0,400}openDialog/);
    assert.match(app, /hideLoginScreen[\s\S]{0,300}closeDialog/);
  });
});
