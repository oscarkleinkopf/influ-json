/**
 * Fase L / L5 — local LoRA train orchestrator.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const os = require('node:os');
const { EventEmitter } = require('node:events');

process.env.DISABLE_GIT_BACKUP = '1';
process.env.STUDIO_PIN = process.env.STUDIO_PIN || '1234';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-session-secret-l5';
process.env.INFLU_SKIP_ENV_PERSIST = '1';

function clearLocalTrainEnv() {
  delete process.env.ENABLE_LOCAL_LORA_TRAIN;
  delete process.env.LOCAL_LORA_TRAIN_CMD;
  delete process.env.AI_TOOLKIT_DIR;
  delete require.cache[require.resolve('../local-train')];
  delete require.cache[require.resolve('../image-provider')];
}

function authHeaders(extra = {}) {
  const pin = (process.env.STUDIO_PIN || '1234').trim();
  return pin ? { ...extra, Authorization: `Bearer ${pin}` } : extra;
}

async function withServer(fn) {
  const app = require('../server');
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await fn(base);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('isLocalTrainEnabled requiere ENABLE_LOCAL_LORA_TRAIN', () => {
  clearLocalTrainEnv();
  process.env.AI_TOOLKIT_DIR = '/tmp/fake-toolkit';
  let lt = require('../local-train');
  assert.equal(lt.isLocalTrainEnabled(), false);
  assert.equal(lt.canSpawnTrainer(), false);

  process.env.ENABLE_LOCAL_LORA_TRAIN = '1';
  delete require.cache[require.resolve('../local-train')];
  lt = require('../local-train');
  assert.equal(lt.isLocalTrainEnabled(), true);
  assert.equal(lt.canSpawnTrainer(), true);
  clearLocalTrainEnv();
});

test('materializePack escribe dataset + yaml con rutas absolutas', () => {
  clearLocalTrainEnv();
  const lt = require('../local-train');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'influ-l5-'));
  const img = path.join(tmp, 'src.jpg');
  fs.writeFileSync(img, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
  const workDir = path.join(tmp, 'job');
  const pack = {
    triggerToken: 'ohwx_test',
    classWord: 'woman',
    count: 1,
    datasetItems: [{
      srcRelPath: img,
      imageName: 'img_01.jpg',
      captionName: 'img_01.txt',
      caption: 'ohwx_test woman, photo'
    }],
    textFiles: [
      { name: 'README.txt', content: 'hi' },
      {
        name: 'config/ai-toolkit-flux.yaml',
        content: 'training_folder: "output"\nfolder_path: "dataset"\n'
      }
    ]
  };
  const out = lt.materializePack(pack, { rootDir: tmp, workDir });
  assert.equal(out.imageCount, 1);
  assert.ok(fs.existsSync(path.join(workDir, 'dataset', 'img_01.jpg')));
  assert.ok(fs.existsSync(path.join(workDir, 'dataset', 'img_01.txt')));
  const yaml = fs.readFileSync(out.configAbs, 'utf8');
  assert.match(yaml, /folder_path:\s*"/);
  assert.doesNotMatch(yaml, /folder_path:\s*"dataset"/);
  fs.rmSync(tmp, { recursive: true, force: true });
  clearLocalTrainEnv();
});

test('startTrainProcess + poll → promote weights (mock spawn)', async () => {
  clearLocalTrainEnv();
  process.env.ENABLE_LOCAL_LORA_TRAIN = '1';
  process.env.LOCAL_LORA_TRAIN_CMD = 'echo {config}';
  delete require.cache[require.resolve('../local-train')];
  const lt = require('../local-train');
  lt._resetJobsForTests();

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'influ-l5-spawn-'));
  const workDir = path.join(tmp, 'job');
  const outputAbs = path.join(workDir, 'output');
  fs.mkdirSync(outputAbs, { recursive: true });
  const configAbs = path.join(workDir, 'config.yaml');
  fs.writeFileSync(configAbs, 'x: 1\n');

  const fakeChild = new EventEmitter();
  fakeChild.pid = 4242;
  fakeChild.stdout = new EventEmitter();
  fakeChild.stderr = new EventEmitter();
  fakeChild.kill = () => {};

  const started = lt.startTrainProcess({
    personaId: 'persona-l5',
    workDir,
    configAbs,
    triggerToken: 'ohwx_x',
    spawnImpl: () => {
      setImmediate(() => {
        const weights = path.join(outputAbs, 'ohwx_x.safetensors');
        fs.writeFileSync(weights, 'fake-weights');
        fakeChild.emit('close', 0);
      });
      return fakeChild;
    }
  });
  assert.equal(started.pid, 4242);

  await new Promise((r) => setTimeout(r, 40));
  const poll = lt.pollTrainJob('persona-l5', { outputAbs });
  assert.equal(poll.running, false);
  assert.equal(poll.exitCode, 0);
  assert.ok(poll.weightsAbs);
  assert.equal(lt.mapLocalTrainStatus(poll), 'ready');
  const promoted = lt.promoteWeights('persona-l5', poll.weightsAbs, {
    destName: 'ohwx_x_flux_lora.safetensors'
  });
  assert.match(promoted.weightsRel, /loras\/persona-l5\//);
  assert.ok(fs.existsSync(promoted.destAbs));
  lt._resetJobsForTests();
  fs.rmSync(tmp, { recursive: true, force: true });
  // cleanup promoted copy under DATA_DIR
  try { fs.unlinkSync(promoted.destAbs); } catch (_) {}
  clearLocalTrainEnv();
});

test('POST /lora/train-local sin flag → 400', async () => {
  clearLocalTrainEnv();
  const db = require('../db');
  const persona = db.savePersona({
    name: `L5Off ${Date.now()}`,
    gender: 'Female',
    forceCreate: true
  });

  await withServer(async (base) => {
    const res = await fetch(`${base}/api/personas/${persona.id}/lora/train-local`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ confirmLocal: true })
    });
    const body = await res.json();
    assert.equal(res.status, 400);
    assert.match(String(body.message), /desactivado|ENABLE_LOCAL_LORA_TRAIN/i);
  });

  db.deletePersona(persona.id);
  clearLocalTrainEnv();
});

test('POST /lora/train-local materializeOnly → dataset_ready', async () => {
  clearLocalTrainEnv();
  process.env.ENABLE_LOCAL_LORA_TRAIN = '1';
  delete require.cache[require.resolve('../local-train')];
  delete require.cache[require.resolve('../image-provider')];

  const db = require('../db');
  const genDir = path.join(__dirname, '..', 'assets', 'generated');
  fs.mkdirSync(genDir, { recursive: true });
  const imgs = [];
  for (let i = 0; i < 4; i++) {
    const name = `l5mat_${Date.now()}_${i}.jpg`;
    const abs = path.join(genDir, name);
    fs.writeFileSync(abs, Buffer.from([0xff, 0xd8, 0xff, 0xd9, i]));
    imgs.push(`assets/generated/${name}`);
  }

  const persona = db.savePersona({
    name: `L5Mat ${Date.now()}`,
    gender: 'Female',
    forceCreate: true,
    image: imgs[0]
  });
  for (let i = 1; i < 4; i++) {
    db.saveVariant({
      persona_id: persona.id,
      image_path: imgs[i],
      pose: 'portrait',
      clothing: 'casual'
    });
  }

  await withServer(async (base) => {
    const res = await fetch(`${base}/api/personas/${persona.id}/lora/train-local`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ confirmLocal: true, materializeOnly: true })
    });
    const body = await res.json();
    assert.equal(res.status, 200, body.message);
    assert.equal(body.lora?.status, 'dataset_ready');
    assert.equal(body.job?.mode, 'materialize_only');
    assert.ok(body.job?.workDir);
    assert.ok(fs.existsSync(body.job.workDir));
    assert.ok(body.job.imageCount >= 4);

    const sync = await fetch(`${base}/api/personas/${persona.id}/lora/sync-local`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: '{}'
    });
    const syncBody = await sync.json();
    assert.equal(sync.status, 200);
    assert.equal(syncBody.lora?.status, 'dataset_ready');

    // Drop fake weights into output and sync → ready
    const outDir = path.join(body.job.workDir, 'output');
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'done.safetensors'), 'weights');
    const sync2 = await fetch(`${base}/api/personas/${persona.id}/lora/sync-local`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: '{}'
    });
    const s2 = await sync2.json();
    assert.equal(sync2.status, 200);
    assert.equal(s2.lora?.status, 'ready');
    assert.ok(s2.lora?.weights_path);

    db.clearPersonaLora(persona.id);
    if (s2.lora?.weights_path) {
      const abs = path.join(require('../paths').DATA_DIR, s2.lora.weights_path);
      try { fs.unlinkSync(abs); } catch (_) {}
    }
  });

  db.deletePersona(persona.id);
  for (const rel of imgs) {
    try { fs.unlinkSync(path.join(__dirname, '..', rel)); } catch (_) {}
  }
  clearLocalTrainEnv();
});

test('L5 docs exist', () => {
  assert.ok(fs.existsSync(path.join(__dirname, '..', 'docs', 'lora', 'L5_LOCAL_TRAIN.md')));
});
