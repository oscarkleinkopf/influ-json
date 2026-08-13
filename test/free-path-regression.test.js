/**
 * Regresión free path (sin red / sin Pollinations real):
 * crear skinny → sintetizar lock → export ZIP 4 packs
 * + POST /api/ai/generate-image con stub
 * + contrato checklist: copy ≠ gen; core = create/save/copy
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

process.env.DISABLE_GIT_BACKUP = '1';
process.env.ENABLE_GIT_BACKUP = '';
process.env.STUDIO_PIN = process.env.STUDIO_PIN || '1234';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'free-path-test-secret';

const dbService = require('../db');
const aiService = require('../ai-service');
const app = require('../server');
const {
  buildFreeChatbotPack,
  normalizePersonaForPack,
  listPackIds
} = require('../chatbot-packs');

function authHeaders(extra = {}) {
  const pin = (process.env.STUDIO_PIN || '1234').trim();
  return pin ? { ...extra, Authorization: `Bearer ${pin}` } : extra;
}

async function withServer(fn) {
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await fn(base);
  } finally {
    await new Promise((r) => server.close(r));
  }
}

/** Mismo contrato que renderHappyPathChecklist en app.js (core ≠ gen). */
function coreHappyPathProgress(status) {
  const coreSteps = ['create', 'save', 'copy'];
  return coreSteps.reduce((n, step) => n + (status[step] ? 1 : 0), 0);
}

function syntheticGenStatus({ personas = [], generationStats = {}, activeVariants = [], copied = false } = {}) {
  const hasAny = personas.length > 0;
  const hasActive = personas.some((p) => !p.archived);
  const totalGens = generationStats.total || 0;
  const hasVariants = Array.isArray(activeVariants) && activeVariants.length > 0;
  return {
    create: hasAny,
    save: hasActive || hasAny,
    gen: totalGens > 0 || hasVariants,
    copy: !!copied
  };
}

test('free-path: checklist core 3/3 — copiar JSON no marca gen', () => {
  const afterCreate = syntheticGenStatus({
    personas: [{ id: '1', name: 'A' }],
    copied: false
  });
  assert.equal(afterCreate.gen, false);
  assert.equal(coreHappyPathProgress(afterCreate), 2); // create+save

  const afterCopy = syntheticGenStatus({
    personas: [{ id: '1', name: 'A' }],
    copied: true
  });
  assert.equal(afterCopy.copy, true);
  assert.equal(afterCopy.gen, false);
  assert.equal(coreHappyPathProgress(afterCopy), 3);

  const afterGen = syntheticGenStatus({
    personas: [{ id: '1', name: 'A' }],
    copied: true,
    generationStats: { total: 1 }
  });
  assert.equal(afterGen.gen, true);
  assert.equal(coreHappyPathProgress(afterGen), 3); // gen no suma al core
});

test('free-path: fila SQLite skinny → normalize + 4 packs con must_match', () => {
  const row = {
    id: 'skinny-1',
    name: 'SkinnyFree',
    gender: 'Female',
    detailedJSON: JSON.stringify({
      identity: { name: 'SkinnyFree', apparent_age: '24 años' },
      facial_features: {
        skin_tone: 'piel clara',
        skin_tone_hex: '#ead2c0',
        eye_color: 'cafés',
        face_shape: 'ovalada'
      },
      hair: { color: 'castaño', length: 'largo' }
    })
  };

  const normalized = normalizePersonaForPack(row);
  assert.ok(normalized.character_lock?.must_match_every_image);
  assert.equal(normalized.character_lock.must_match_every_image.name, 'SkinnyFree');
  assert.match(String(normalized.character_lock.must_match_every_image.skin_tone_hex), /#ead2c0/i);

  for (const packId of listPackIds()) {
    const text = buildFreeChatbotPack(row, packId);
    assert.match(text, /CHARACTER LOCK/i, packId);
    assert.match(text, /SkinnyFree/, packId);
    assert.match(text, /#ead2c0/i, packId);
    assert.doesNotMatch(text, /REPLICATE_API_TOKEN/);
    assert.doesNotMatch(text, /CHARACTER LOCK \(obligatorio\)\n─+\n\{\}/);
  }
});

test('free-path: export ZIP skinny sintetiza lock + packs spicy/product', async () => {
  const persona = dbService.savePersona({
    name: `SkinnyExport_${Date.now()}`,
    gender: 'Female',
    age: '24 años',
    forceCreate: true,
    detailedJSON: {
      identity: { name: 'SkinnyExport', apparent_age: '24 años' },
      facial_features: {
        skin_tone: 'piel clara',
        skin_tone_hex: '#f1c9b0',
        eye_color: 'verdes',
        face_shape: 'corazón'
      },
      hair: { color: 'rubio', length: 'medio' }
      // sin character_lock a propósito
    }
  });

  const tmpZip = path.join(__dirname, `../scratch/free_path_${persona.id}.zip`);
  const tmpDir = path.join(__dirname, `../scratch/free_path_${persona.id}_out`);

  await withServer(async (base) => {
    const res = await fetch(`${base}/api/export/persona/${persona.id}`, {
      headers: authHeaders()
    });
    assert.equal(res.status, 200);
    const buf = Buffer.from(await res.arrayBuffer());
    assert.ok(buf.length > 100);
    assert.equal(buf[0], 0x50);
    assert.equal(buf[1], 0x4b);

    fs.mkdirSync(path.dirname(tmpZip), { recursive: true });
    fs.writeFileSync(tmpZip, buf);
    fs.mkdirSync(tmpDir, { recursive: true });

    try {
      execFileSync('unzip', ['-o', tmpZip, '-d', tmpDir], { stdio: 'ignore' });
    } catch (err) {
      if (err && (err.status === 127 || /ENOENT/.test(String(err.message)))) {
        console.warn('unzip missing — solo magic ZIP');
        dbService.deletePersona(persona.id);
        return;
      }
      throw err;
    }

    const lockPath = path.join(tmpDir, 'character_lock.json');
    assert.ok(fs.existsSync(lockPath));
    const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
    assert.ok(lock.must_match_every_image);
    assert.match(String(lock.must_match_every_image.skin_tone_hex || ''), /#f1c9b0/i);

    for (const packId of ['fullbody', 'bikini', 'spicy', 'product']) {
      const packFile = path.join(tmpDir, 'packs', `${packId}.txt`);
      assert.ok(fs.existsSync(packFile), `falta packs/${packId}.txt`);
      const text = fs.readFileSync(packFile, 'utf8');
      assert.match(text, /CHARACTER LOCK/i);
      assert.doesNotMatch(text, /REPLICATE_API_TOKEN/);
    }
  });

  dbService.deletePersona(persona.id);
  try {
    fs.rmSync(tmpZip, { force: true });
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch (_) {}
});

test('free-path: POST /api/ai/generate-image con stub (sin red) guarda historial', async () => {
  const orig = aiService.generateInfluencerImage;
  const stubPath = 'assets/generated/free_path_stub.jpg';
  let calledWithPrefer = null;
  aiService.generateInfluencerImage = async (_prompt, _ref, opts = {}) => {
    calledWithPrefer = !!opts.preferFaceLock;
    return stubPath;
  };

  const persona = dbService.savePersona({
    name: `GenStub_${Date.now()}`,
    gender: 'Female',
    forceCreate: true,
    detailedJSON: {
      identity: { name: 'GenStub' },
      facial_features: { skin_tone_hex: '#e8c4a8' },
      character_lock: {
        must_match_every_image: { name: 'GenStub', skin_tone_hex: '#e8c4a8' }
      }
    }
  });

  try {
    await withServer(async (base) => {
      const res = await fetch(`${base}/api/ai/generate-image`, {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          prompt: 'test portrait offline stub',
          personaId: persona.id,
          generationType: 'portrait'
        })
      });
      const body = await res.json();
      assert.equal(res.status, 200, body.message || JSON.stringify(body));
      assert.equal(body.success, true);
      assert.equal(body.imagePath, stubPath);
      assert.equal(calledWithPrefer, false);

      const hist = dbService.getGenerationsForPersona(persona.id);
      assert.ok(hist.some((g) => g.image_path === stubPath));
      const row = hist.find((g) => g.image_path === stubPath);
      let meta = {};
      try { meta = JSON.parse(row.metadata || '{}'); } catch (_) {}
      assert.equal(!!meta.preferFaceLock, false);
    });
  } finally {
    aiService.generateInfluencerImage = orig;
    dbService.deletePersona(persona.id);
  }
});

test('free-path: walkthrough exige clipboard con lock (source)', () => {
  const walk = fs.readFileSync(
    path.join(__dirname, '..', 'scripts', 'happy-path-walkthrough.js'),
    'utf8'
  );
  assert.match(walk, /clipboardChars/);
  assert.match(walk, /pass:\s*copyOk/);
  assert.match(walk, /no dejó character_lock/);
  // P0: crear en UI → guardar → aparece (no solo API)
  assert.match(walk, /create-ui-save-appears/);
  assert.match(walk, /startCreateScratchFlow|resetPersonaFormForNew/);
  assert.match(walk, /btnSavePersona|savePersona\(\{\s*withPortrait:\s*false\s*\}\)/);
  assert.match(walk, /founderWelcomeModal/);
});
