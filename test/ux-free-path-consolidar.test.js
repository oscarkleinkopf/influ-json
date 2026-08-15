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

test('Free Path: UGC pone pack producto antes del boceto (UX-1c)', () => {
  const ugcStart = html.indexOf('id="ugc-studio"');
  const ugcEnd = html.indexOf('id="licensing"');
  assert.ok(ugcStart >= 0 && ugcEnd > ugcStart);
  const ugc = html.slice(ugcStart, ugcEnd);
  const copyIdx = ugc.indexOf('id="btnExportUgcChatbot"');
  const bocetoIdx = ugc.indexOf('id="btnGenerateUgcImage"');
  assert.ok(copyIdx >= 0 && bocetoIdx > copyIdx, 'pack producto debe ir antes del boceto');
  assert.match(ugc, /Free path: pack producto|Free path: pack de la ficha|Free path: Copiar JSON/);
  assert.match(ugc, /id="btnExportUgcChatbot"/);
  assert.match(ugc, /Copiar pack producto/);
  assert.doesNotMatch(ugc, /id="btnExportUgcChatbot"[\s\S]{0,160}>\s*Copiar JSON\s*</);
  assert.doesNotMatch(ugc, /id="btnExportUgcChatbot"[\s\S]{0,120}Copiar JSON \(recomendado\)/);
  assert.match(ugc, /ugcAdvancedAdsDetails/);
  assert.match(ugc, /ugcDownloadsDetails/);
  assert.match(ugc, /ugcVideoDemoDetails/);
  assert.match(ugc, /Sin influencer/);
});

test('Free Path: UGC pack producto llama copyFreeChatbotPack (no solo navega)', () => {
  assert.match(
    appJs,
    /btnExportUgcChatbot[\s\S]{0,500}copyFreeChatbotPack\(['"]product['"]\)/
  );
  assert.doesNotMatch(
    appJs,
    /btnExportUgcChatbot[\s\S]{0,400}navigateToTab\(['"]persona-engine['"]\)[\s\S]{0,200}toastInfo\(['"]Pack free está en la ficha/
  );
  assert.match(appJs, /Sin influencer/);
  assert.match(appJs, /Elige uno en el chip del header/);
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

test('Free Path: Guiones etiqueta honestas', () => {
  assert.match(html, /Generar 10 guiones \(plantillas locales \/ Gemini opt-in\)/);
  assert.match(html, /<h1>Guiones<\/h1>/);
  assert.doesNotMatch(html, /Script Engine \(GPT/);
  assert.doesNotMatch(html, /<h1>Script Engine<\/h1>/);
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
