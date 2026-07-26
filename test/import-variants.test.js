const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

// Configure fast queue timing for tests
process.env.GEN_MIN_GAP_MS = '10';
process.env.GEN_429_COOLDOWN_MS = '50';

const dbService = require('../db');
const aiService = require('../ai-service');
const genQueue = require('../gen-queue');
const app = require('../server');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test('Multi-Image Import & Background Variants Test Suite', async (t) => {
  let server;
  let baseUrl;
  let origGenImage;
  let origGenMulti;

  t.before(() => {
    // Mock external AI calls to run fast & deterministically offline
    origGenImage = aiService.generateInfluencerImage;
    origGenMulti = aiService.generateWithGeminiMulti;

    aiService.generateInfluencerImage = async () => 'assets/references/mock_variant.jpg';
    aiService.generateWithGeminiMulti = async () => ({
      identity: { name: 'Test Persona', gender: 'Female', apparent_age: '24 años', ethnicity_appearance: 'Latina' },
      body: { body_type: 'Atlético' },
      facial_features: { face_shape: 'ovalada', skin_tone: 'piel clara' },
      hair: { length: 'largo', texture: 'ondulado', color: 'Castaño' },
      aesthetic: { overall_vibe: 'Casual' },
      photography: { background_setting: 'Estudio' },
      clothing: { type: 'Top' }
    });
  });

  t.after(() => {
    aiService.generateInfluencerImage = origGenImage;
    aiService.generateWithGeminiMulti = origGenMulti;
  });

  t.beforeEach(async () => {
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  t.afterEach(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  await t.test('POST /api/import-influencer accepts 1 to 4 images and responds in <1000ms', async () => {
    const formData = new FormData();
    formData.append('name', 'SpeedTestPersona');
    for (let i = 1; i <= 3; i++) {
      formData.append('photo', new Blob([Buffer.from(`fake-img-content-${i}`)], { type: 'image/jpeg' }), `img${i}.jpg`);
    }

    const start = Date.now();
    const res = await fetch(`${baseUrl}/api/import-influencer`, {
      method: 'POST',
      body: formData
    });
    const elapsed = Date.now() - start;

    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.success, true);
    assert.ok(data.persona);
    assert.equal(data.persona.name, 'SpeedTestPersona');
    assert.ok(elapsed < 1000, `Response should take <1000ms (took ${elapsed}ms)`);
  });

  await t.test('POST /api/import-influencer rejects payloads with more than 4 images (400 Bad Request)', async () => {
    const formData = new FormData();
    formData.append('name', 'OverLimitPersona');
    for (let i = 1; i <= 5; i++) {
      formData.append('photo', new Blob([Buffer.from(`fake-img-content-${i}`)], { type: 'image/jpeg' }), `img${i}.jpg`);
    }

    const res = await fetch(`${baseUrl}/api/import-influencer`, {
      method: 'POST',
      body: formData
    });
    const data = await res.json();

    assert.equal(res.status, 400);
    assert.equal(data.success, false);
    assert.match(data.message, /máximo 4 fotos/i);
  });

  await t.test('Import triggers non-blocking background variants and dual persistence in SQLite & personas.json', async () => {
    const formData = new FormData();
    const personaName = `DualSyncPersona_${Date.now()}`;
    formData.append('name', personaName);
    formData.append('photo', new Blob([Buffer.from('fake-img-content')], { type: 'image/jpeg' }), 'photo.jpg');

    const res = await fetch(`${baseUrl}/api/import-influencer`, {
      method: 'POST',
      body: formData
    });
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.success, true);

    const personaId = data.persona.id;
    assert.ok(personaId);

    // Wait for genQueue to finish running background tasks
    let attempts = 0;
    while (attempts < 50) {
      const qStatus = genQueue.getStatus();
      if (!qStatus.active && qStatus.pendingCount === 0) break;
      await sleep(50);
      attempts++;
    }

    // 1. Verify SQLite persona_variants table
    const variantsInDb = dbService.getVariantsForPersona(personaId);
    assert.equal(variantsInDb.length, 4, 'Should generate 4 background variants in SQLite DB');

    // 2. Verify personas.json dual persistence
    const jsonPath = path.join(__dirname, '..', 'personas.json');
    assert.ok(fs.existsSync(jsonPath), 'personas.json file must exist');

    const jsonContent = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    const personaInJson = jsonContent.find(p => p.id === personaId);
    assert.ok(personaInJson, 'Newly created persona should be present in personas.json');
    assert.ok(Array.isArray(personaInJson.variants), 'Persona in personas.json should have a variants array');
    assert.equal(personaInJson.variants.length, 4, 'Persona in personas.json should contain 4 variants');
  });
});
