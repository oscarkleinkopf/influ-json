const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

test('pulido: Cómo usar packs scrollea al Copiar JSON primary (no ZIP kit)', () => {
  const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  // packs action must target primary copy CTA, not brand kit ZIP
  assert.match(app, /action === 'packs'[\s\S]{0,400}btnCopyPackFullbodyPrimary/);
  assert.doesNotMatch(
    app,
    /action === 'packs'[\s\S]{0,200}btnExportBrandKitSheet/
  );
});

test('pulido: consola distingue prompt+JSON del pack fullbody', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.match(html, /id="btnCopyChatbotPrompt"[^>]*>Copiar prompt \+ JSON</);
  // UX-1c: canónico es «Copiar JSON» (id primary); variantes viven en Packs ▾
  assert.match(html, /id="btnCopyPackFullbodyPrimary"[\s\S]{0,200}>[\s\S]{0,40}Copiar JSON/);
  assert.match(html, /id="packVariantsMenu"|Packs ▾/);
});

test('pulido: happy path 3/3 core — gen no se completa al copiar', () => {
  const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

  assert.match(app, /coreDone === 3/);
  assert.match(app, /\$\{coreDone\} \/ 3/);
  // genDone must NOT include copied
  assert.match(app, /const genDone = totalGens > 0 \|\| hasVariants;/);
  assert.doesNotMatch(app, /genDone = totalGens > 0 \|\| hasVariants \|\| copied/);

  assert.match(html, /happyPathProgress[^>]*>0 \/ 3</);
  assert.match(html, /happyPathLead[\s\S]{0,120}Copiar JSON/);
});

test('pulido: member pollen Ajustes no es dead-end', () => {
  const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

  assert.match(app, /openPollinationsSettings[\s\S]{0,200}isCurrentUserAdmin/);
  assert.match(app, /token de Pollinations lo configura Administración/);
  assert.match(html, /id="memberSettingsHint"/);
  assert.match(html, /lo configura solo Administración en Ajustes/);
});

test('pulido: founder onboarding dice Copiar JSON (no solo pack)', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const founder = html.slice(
    html.indexOf('id="founderWelcomeModal"'),
    html.indexOf('id="btnFounderWelcomeSkip"')
  );
  assert.match(founder, /Copiar JSON/);
  assert.doesNotMatch(founder, /<strong[^>]*>Copiar pack<\/strong>/);
});
