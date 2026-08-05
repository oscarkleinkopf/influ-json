const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

test('W14: roster vacío — panel Crear | Importar | Cómo usar', () => {
  const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

  assert.match(app, /empty-roster-panel/);
  assert.match(app, /btnEmptyRosterCreate/);
  assert.match(app, /btnEmptyRosterImport/);
  assert.match(app, /btnEmptyRosterGuide/);
  assert.match(app, /function renderHappyPathNextCta/);
  assert.match(app, /function runHappyPathAction/);
  assert.match(app, /copyFreeChatbotPack\('fullbody'\)/);

  // Member empty: mismos 3 CTAs, sin chrome admin
  assert.match(html, /id="btnMemberEmptyCreate"/);
  assert.match(html, /id="btnMemberEmptyImport"/);
  assert.match(html, /id="btnMemberEmptyGuide"/);
  assert.match(html, /id="btnMemberWelcomeImport"/);

  // Founder modal: Crear | Importar | Cómo usar (no Beauty forzado)
  assert.match(html, /id="btnFounderWelcomeCreate"[^>]*>Crear</);
  assert.match(html, /id="btnFounderWelcomeImport"/);
  assert.doesNotMatch(html, /Empezar con preset Beauty/);
});

test('W14: post-save CTA pack + gen demoted a boceto opcional', () => {
  const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

  assert.match(app, /Copiar JSON \(recomendado\)|Copiar pack fullbody/);
  assert.match(app, /creatingNew[\s\S]{0,200}toastSuccess/);
  assert.match(app, /actionLabel:\s*'Copiar JSON \(recomendado\)'|actionLabel:\s*'Copiar pack fullbody'/);
  assert.match(app, /data-happy-action="copy-pack"|data-happy-next="copy-pack"|copy-pack/);

  assert.match(html, /Generar boceto \(opt-in · puede pedir token\)|Boceto local opcional|Generar boceto \(gratis, inestable\)/);
  assert.match(html, /id="btnSavePersonaWithPortrait"/);
  assert.match(html, /btnSavePersonaWithPortrait[\s\S]{0,500}Generar boceto \(opt-in · puede pedir token\)|btnSavePersonaWithPortrait[\s\S]{0,500}Boceto local opcional|btnSavePersonaWithPortrait[\s\S]{0,500}Generar boceto \(gratis, inestable\)/);
  assert.match(html, /class="btn btn-secondary" id="btnGenerateVariant"/);
  assert.match(html, /id="happyPathNextCta"/);

  // No exige Gemini ni Replicate para el flujo
  assert.doesNotMatch(app, /runHappyPathAction[\s\S]{0,300}GEMINI_API_KEY/);
  assert.doesNotMatch(app, /copy-pack[\s\S]{0,200}REPLICATE/);
});

test('UX: pollen/401 CTA + LoRA demoted fuera del pack card verde', () => {
  const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const personas = fs.readFileSync(path.join(root, 'routes', 'personas.js'), 'utf8');

  assert.match(app, /function isPollenAuthError/);
  assert.match(app, /function notifyGenerationFailure/);
  assert.match(app, /function setPollenBanner/);
  assert.match(app, /actionLabel:\s*'Copiar JSON \(recomendado\)'/);
  assert.match(html, /id="pollenBanner"/);
  assert.match(html, /id="btnPollenCopyJson"/);
  assert.match(html, /id="loraAdvancedPanel"/);
  assert.match(html, /Avanzado · LoRA/);
  // Pack card cierra antes del panel LoRA (LoRA no dentro del card verde primario)
  const packIdx = html.indexOf('pack-library-card');
  const loraIdx = html.indexOf('id="loraAdvancedPanel"');
  assert.ok(packIdx >= 0 && loraIdx > packIdx);
  assert.match(html, /POLLINATIONS_TOKEN|enter\.pollinations|pollen/i);
  assert.match(personas, /paymentRequired/);
  assert.match(personas, /authRequired/);
});
test('W14: happy path ordena copy antes que gen opcional', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const copyIdx = html.indexOf('data-step="copy"');
  const genIdx = html.indexOf('data-step="gen"');
  assert.ok(copyIdx > 0 && genIdx > 0);
  assert.ok(copyIdx < genIdx, 'copy debe ir antes que gen en el checklist');
  assert.match(html, /copiar (JSON|pack)/i);
});
