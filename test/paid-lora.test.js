'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('path');
const http = require('node:http');

process.env.DISABLE_GIT_BACKUP = '1';
process.env.STUDIO_PIN = process.env.STUDIO_PIN || '1234';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-session-secret';
process.env.INFLU_SKIP_ENV_PERSIST = '1';

function clearPaidEnv() {
  delete process.env.ENABLE_PAID_LORA;
  delete process.env.REPLICATE_API_TOKEN;
  delete process.env.REPLICATE_API_KEY;
  delete process.env.REPLICATE_USERNAME;
  delete require.cache[require.resolve('../paid-lora')];
  delete require.cache[require.resolve('../image-provider')];
}

test('isPaidLoraEnabled requiere ENABLE_PAID_LORA + token', () => {
  clearPaidEnv();
  process.env.REPLICATE_API_TOKEN = 'r8_test';
  let paid = require('../paid-lora');
  assert.equal(paid.isPaidLoraEnabled(), false);

  process.env.ENABLE_PAID_LORA = '1';
  delete require.cache[require.resolve('../paid-lora')];
  paid = require('../paid-lora');
  assert.equal(paid.isPaidLoraEnabled(), true);
  clearPaidEnv();
});

test('mapTrainingStatus + extractModelVersion', () => {
  clearPaidEnv();
  const paid = require('../paid-lora');
  assert.equal(paid.mapTrainingStatus({ status: 'succeeded' }), 'ready');
  assert.equal(paid.mapTrainingStatus({ status: 'failed' }), 'failed');
  assert.equal(paid.mapTrainingStatus({ status: 'processing' }), 'training');
  assert.equal(
    paid.extractModelVersion({ destination: 'u/m', output: { version: 'abc123' } }),
    'u/m:abc123'
  );
  clearPaidEnv();
});

test('generateWithLora usa Replicate cuando ready + model version (mock)', async () => {
  clearPaidEnv();
  process.env.ENABLE_PAID_LORA = '1';
  process.env.REPLICATE_API_TOKEN = 'r8_test';
  delete require.cache[require.resolve('../paid-lora')];
  delete require.cache[require.resolve('../image-provider')];
  const imageProvider = require('../image-provider');

  const jpegish = Buffer.from([0xff, 0xd8, 0xff, 0xd9, 0x01, 0x02]);
  const fetchImpl = async (url, opts = {}) => {
    const u = String(url);
    if (u.includes('/predictions') && opts.method === 'POST') {
      return {
        ok: true,
        status: 200,
        async text() {
          return JSON.stringify({ id: 'pred1', status: 'succeeded', output: ['https://example.com/out.jpg'] });
        },
        async json() {
          return { id: 'pred1', status: 'succeeded', output: ['https://example.com/out.jpg'] };
        }
      };
    }
    if (u.includes('example.com/out.jpg')) {
      return {
        ok: true,
        status: 200,
        async arrayBuffer() {
          return jpegish.buffer.slice(jpegish.byteOffset, jpegish.byteOffset + jpegish.byteLength);
        }
      };
    }
    return { ok: false, status: 404, async text() { return 'no'; }, async json() { return {}; } };
  };

  // Patch paid-lora run via fetchImpl on generateWithLora
  const out = await imageProvider.generateWithLora({
    personaId: 'p_paid',
    prompt: 'cafe portrait',
    loraRow: {
      status: 'ready',
      trigger_token: 'ohwx_demo',
      weights_path: null,
      training_meta: JSON.stringify({
        replicate_model_version: 'user/demo:abcdef0123456789abcdef0123456789abcdef01'
      })
    },
    fetchImpl
  });

  assert.ok(out);
  assert.match(out, /^assets\/generated\/gen_lora_paid_/);
  const abs = path.join(__dirname, '..', out);
  assert.ok(fs.existsSync(abs));
  fs.unlinkSync(abs);
  clearPaidEnv();
});

test('POST /lora/train sin ENABLE_PAID_LORA → 400; sync link manual → ready', async () => {
  clearPaidEnv();
  const db = require('../db');
  const app = require('../server');

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;
  const headers = {
    Authorization: `Bearer ${process.env.STUDIO_PIN}`,
    'Content-Type': 'application/json'
  };

  try {
    const persona = db.savePersona({
      name: `PaidLora ${Date.now()}`,
      gender: 'Female',
      forceCreate: true
    });

    const train = await fetch(`${base}/api/personas/${persona.id}/lora/train`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ confirmPaid: true })
    });
    assert.equal(train.status, 400);
    const tj = await train.json();
    assert.match(tj.message || '', /ENABLE_PAID_LORA|desactivado/i);

    const sync = await fetch(`${base}/api/personas/${persona.id}/lora/sync`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        replicateModelVersion: 'demo/user:abc123',
        triggerToken: 'ohwx_link'
      })
    });
    assert.equal(sync.status, 200);
    const sj = await sync.json();
    assert.equal(sj.success, true);
    assert.equal(sj.lora.status, 'ready');
    assert.equal(sj.lora.trigger_token, 'ohwx_link');

    db.clearPersonaLora(persona.id);
    db.deletePersona(persona.id);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    clearPaidEnv();
  }
});

test('L3 docs exist', () => {
  assert.ok(fs.existsSync(path.join(__dirname, '..', 'docs', 'lora', 'L3_PAID.md')));
});
