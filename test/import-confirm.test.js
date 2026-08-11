const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

// Evitar auto-commit de git backup al correr este archivo solo
process.env.DISABLE_GIT_BACKUP = '1';
process.env.GEN_MIN_GAP_MS = '10';
process.env.GEN_429_COOLDOWN_MS = '50';

const dbService = require('../db');
const aiService = require('../ai-service');
const genQueue = require('../gen-queue');
const app = require('../server');
const { makeTestJpegBuffer } = require('../image-validation');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function authHeaders(extra = {}) {
  const pin = (process.env.STUDIO_PIN || '1234').trim();
  return pin ? { ...extra, Authorization: `Bearer ${pin}` } : extra;
}

test('1.2 import confirm: previewOnly no persiste; confirmar guarda + variantes', async (t) => {
  let server;
  let baseUrl;
  let origGenImage;
  let origGenMulti;
  let origScripts;

  t.before(() => {
    origGenImage = aiService.generateInfluencerImage;
    origGenMulti = aiService.generateWithGeminiMulti;
    origScripts = aiService.generateUgcVideoScripts;

    aiService.generateInfluencerImage = async () => 'assets/references/mock_variant.jpg';
    aiService.generateWithGeminiMulti = async () => ({
      identity: { name: 'Preview Persona', gender: 'Female', apparent_age: '24 años', ethnicity_appearance: 'Latina' },
      body: { body_type: 'Atlético' },
      facial_features: { face_shape: 'ovalada', skin_tone: 'piel clara', skin_tone_hex: '#f0d5c0' },
      hair: { length: 'largo', texture: 'ondulado', color: 'Castaño' },
      aesthetic: { overall_vibe: 'Casual' },
      photography: { background_setting: 'Estudio', lighting_type: 'soft', camera_lens: '50mm' },
      clothing: { type: 'Top' }
    });
    aiService.generateUgcVideoScripts = async () => [];
  });

  t.after(() => {
    aiService.generateInfluencerImage = origGenImage;
    aiService.generateWithGeminiMulti = origGenMulti;
    aiService.generateUgcVideoScripts = origScripts;
  });

  t.beforeEach(async () => {
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  t.afterEach(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
  });

  await t.test('previewOnly no crea fila en SQLite ni encola variantes', async () => {
    const name = `PreviewOnly_${Date.now()}`;
    const before = dbService.getAllPersonas().filter((p) => p.name === name).length;
    const jpeg = await makeTestJpegBuffer({ background: '#c49a6c' });

    const formData = new FormData();
    formData.append('name', name);
    formData.append('previewOnly', '1');
    formData.append('photo', new Blob([jpeg], { type: 'image/jpeg' }), 'p.jpg');

    const res = await fetch(`${baseUrl}/api/import-influencer`, {
      method: 'POST',
      headers: authHeaders(),
      body: formData
    });
    const data = await res.json();

    assert.equal(res.status, 200);
    assert.equal(data.success, true);
    assert.equal(data.preview, true);
    assert.ok(data.persona);
    assert.equal(data.persona.name, name);
    assert.equal(data.persona.id, undefined);

    const after = dbService.getAllPersonas().filter((p) => p.name === name).length;
    assert.equal(after, before, 'previewOnly no debe insertar en SQLite');

    const q = genQueue.getStatus();
    assert.ok(q.pendingCount === 0 || !String(q.currentTaskInfo || '').includes(name));
  });

  await t.test('confirmar via POST /api/personas persiste y encola variantes', async () => {
    const name = `ConfirmImport_${Date.now()}`;
    const jpeg = await makeTestJpegBuffer({ background: '#b8896a' });
    const formData = new FormData();
    formData.append('name', name);
    formData.append('previewOnly', '1');
    formData.append('photo', new Blob([jpeg], { type: 'image/jpeg' }), 'p2.jpg');

    const previewRes = await fetch(`${baseUrl}/api/import-influencer`, {
      method: 'POST',
      headers: authHeaders(),
      body: formData
    });
    const preview = await previewRes.json();
    assert.equal(preview.preview, true);

    const payload = {
      ...preview.persona,
      forceCreate: true
    };
    delete payload.id;

    const saveRes = await fetch(`${baseUrl}/api/personas`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload)
    });
    const saved = await saveRes.json();
    assert.equal(saveRes.status, 200);
    assert.equal(saved.success, true);
    assert.ok(saved.persona?.id);

    const personaId = saved.persona.id;
    let attempts = 0;
    while (attempts < 120) {
      const qStatus = genQueue.getStatus();
      const variantsInDb = dbService.getVariantsForPersona(personaId);
      if (!qStatus.active && qStatus.pendingCount === 0 && variantsInDb.length >= 6) break;
      await sleep(50);
      attempts++;
    }

    const variantsInDb = dbService.getVariantsForPersona(personaId);
    assert.equal(variantsInDb.length, 6, 'Tras confirmar deben generarse 6 anclas (face pack)');

    dbService.deletePersona(personaId);
  });
});
