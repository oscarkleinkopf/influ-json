/**
 * Free Path consolidación: Copiar JSON primero, sin claims GPT-5.6/Meta Ads live,
 * sin fila duplicada de packs en consola, toasts honestos tras guiones.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const appJs = fs.readFileSync(path.join(root, 'app.js'), 'utf8');

test('Free Path: UGC pone Copiar JSON antes del boceto', () => {
  const ugcStart = html.indexOf('id="ugc-studio"');
  const ugcEnd = html.indexOf('id="licensing"');
  assert.ok(ugcStart >= 0 && ugcEnd > ugcStart);
  const ugc = html.slice(ugcStart, ugcEnd);
  const copyIdx = ugc.indexOf('id="btnExportUgcChatbot"');
  const bocetoIdx = ugc.indexOf('id="btnGenerateUgcImage"');
  assert.ok(copyIdx >= 0 && bocetoIdx > copyIdx, 'Copiar JSON debe ir antes del boceto');
  assert.match(ugc, /Free path: Copiar JSON/);
  assert.match(ugc, /Copiar JSON \(recomendado\)/);
  assert.match(ugc, /ugcAdvancedAdsDetails/);
  assert.match(ugc, /ugcDownloadsDetails/);
});

test('Free Path: sin claims falsos GPT-5.6 / Meta Ads live / Producción AI', () => {
  assert.doesNotMatch(html, /GPT-5\.6/);
  assert.doesNotMatch(appJs, /GPT-5\.6/);
  assert.doesNotMatch(html, /Simular GPT/);
  assert.doesNotMatch(html, /Generación & Producción AI/);
  assert.doesNotMatch(html, /Meta \/ TikTok Ads/);
  assert.doesNotMatch(html, /Crear Anuncio Publicitario de Conversión/);
  assert.doesNotMatch(appJs, /Conectar AI/);
  assert.doesNotMatch(appJs, /¡Campaña guardada y respaldada en GitHub!/);
});

test('Free Path: Script Engine etiqueta honestas', () => {
  assert.match(html, /Generar 10 guiones \(plantillas locales \/ Gemini opt-in\)/);
  assert.match(html, /<h1>Script Engine<\/h1>/);
  assert.doesNotMatch(html, /Script Engine \(GPT/);
});

test('Free Path: consola no duplica botones data-free-pack', () => {
  const consoleStart = html.indexOf('id="promptPreview"');
  const consoleEnd = html.indexOf('right-panel-tabbed-container');
  assert.ok(consoleStart >= 0 && consoleEnd > consoleStart);
  const consoleBlock = html.slice(consoleStart, consoleEnd);
  assert.doesNotMatch(consoleBlock, /data-free-pack=/);
  assert.match(consoleBlock, /Free path: usa/);
  // Packs siguen en la ficha (sidebar)
  assert.match(html, /id="btnCopyPackFullbodyPrimary"/);
  assert.match(html, /data-free-pack="bikini"/);
  assert.match(html, /data-free-pack="spicy"/);
  assert.match(html, /data-free-pack="product"/);
});

test('Free Path: sin alert() de runtime en app.js (solo comentarios UX-3b)', () => {
  const runtimeAlerts = [...appJs.matchAll(/(?:^|[^\/\w])alert\s*\(/gm)];
  assert.equal(runtimeAlerts.length, 0, 'no runtime alert() calls');
  assert.match(appJs, /downloadLicensingProposal/);
  assert.match(appJs, /btnDownloadProposal/);
});
