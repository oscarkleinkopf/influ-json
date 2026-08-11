/**
 * UX-3 — honestidad de UI: sin alert stub, sin toast deprecado,
 * sin stat inventado (campañas×10), vídeo etiquetado como demo,
 * Regenerar Scripts cableado, empty states con CTA.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');

process.env.DISABLE_GIT_BACKUP = '1';
process.env.ENABLE_GIT_BACKUP = '';
process.env.STUDIO_PIN = process.env.STUDIO_PIN || '1234';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-session-secret';
process.env.INFLU_SKIP_ENV_PERSIST = '1';

const root = path.join(__dirname, '..');
const app = require('../server');
const db = require('../db');

function authHeaders(extra = {}) {
  const pin = (process.env.STUDIO_PIN || '1234').trim();
  return pin ? { ...extra, Authorization: `Bearer ${pin}` } : extra;
}

async function withServer(fn) {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('UX-3b: Enviar Propuesta ya no usa alert(); hay Descargar propuesta', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.doesNotMatch(html, /alert\(\s*['"]Propuesta lista/);
  assert.match(html, /id=["']btnDownloadProposal["']/);
  assert.match(html, /Descargar propuesta \(\.txt\)/);
});

test('UX-3c: vídeo UGC etiquetado como DEMO sin pipeline real', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const appJs = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  assert.match(html, /DEMO — sin pipeline real/);
  assert.match(html, /Probar timeline demo/);
  assert.doesNotMatch(html, /Renderizar Video UGC \(15 Segundos\)/);
  assert.match(appJs, /no hay pipeline de vídeo real/);
  assert.doesNotMatch(appJs, /Renderizado UGC finalizado\. Timeline listo para entrega/);
});

test('UX-3d: stat Scripts no usa campañas×10 ni fallback a 10', () => {
  const appJs = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  assert.doesNotMatch(appJs, /campaigns\.length\s*\*\s*10/);
  assert.doesNotMatch(appJs, /scriptStat\.textContent\s*=\s*scriptsCount\s*\|\|\s*10/);
  assert.match(appJs, /scriptsCount/);
});

test('UX-3h: showSyncToast eliminado; se usa toastSuccess/toastError', () => {
  const appJs = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  assert.doesNotMatch(appJs, /\bshowSyncToast\b/);
  assert.match(appJs, /\btoastSuccess\b/);
  assert.match(appJs, /\btoastError\b/);
});

test('UX-3a: Regenerar Scripts cableado a generateCampaignScriptsAction', () => {
  const appJs = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  assert.match(appJs, /btnGenerateCampaignScripts[\s\S]{0,120}generateCampaignScriptsAction/);
  assert.match(appJs, /async function generateCampaignScriptsAction\b/);
  assert.match(appJs, /\/api\/campaigns\/\$\{campaign\.id\}\/scripts/);
});

test('UX-3f: empty states de campañas y galería tienen CTA', () => {
  const appJs = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  assert.match(appJs, /btnEmptyCampaignCreate/);
  assert.match(appJs, /btnEmptyGalleryPersona|btnEmptyGalleryClear/);
});

test('UX-3d/e: /api/data expone scriptsCount y gens scoped por perfil', async () => {
  await withServer(async (base) => {
    const dataRes = await fetch(`${base}/api/data`, { headers: authHeaders() });
    assert.equal(dataRes.status, 200);
    const data = await dataRes.json();
    assert.ok(Number.isFinite(data.scriptsCount), 'scriptsCount must be a number');
    assert.ok(data.generationStats && Number.isFinite(data.generationStats.total));

    // countScriptsForProfile unit
    const n = db.countScriptsForProfile('no-such-profile');
    assert.equal(n, 0);

    // Profile-scoped gens: empty profile → 0 even if other gens exist in DB
    const empty = db.getGenerationStats('profile-does-not-exist-ux3');
    assert.equal(empty.total, 0);
  });
});
