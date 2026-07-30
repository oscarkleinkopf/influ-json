const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

test('founder welcome modal y CTAs están en index.html', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.match(html, /id="founderWelcomeModal"/);
  assert.match(html, /id="btnFounderWelcomeCreate"/);
  assert.match(html, /id="btnFounderWelcomeImport"/);
  assert.match(html, /id="btnFounderWelcomeGuide"/);
  assert.match(html, /data-happy-action="import"/);
});

test('app.js tiene onboarding founder y biblioteca Packs en portafolio', () => {
  const js = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  assert.match(js, /function maybeShowFounderOnboarding/);
  assert.match(js, /founderOnboardDismissKey/);
  assert.match(js, /btn-quick-packs/);
  assert.match(js, /data-portfolio-pack="fullbody"/);
  assert.match(js, /data-portfolio-pack="bikini"/);
  assert.match(js, /copyFreeChatbotPack\(packId\)/);
  assert.match(js, /action === 'import'/);
});

test('founder dismiss key es estable por perfil', () => {
  // Mirror de la convención en app.js (sin cargar el monolito del browser)
  const prefix = 'influ_founder_onboard_dismissed_';
  const key = (profileId) => `${prefix}${profileId || 'unknown'}`;
  assert.equal(key('abc'), 'influ_founder_onboard_dismissed_abc');
  assert.equal(key(null), 'influ_founder_onboard_dismissed_unknown');
});
