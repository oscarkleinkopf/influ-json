'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('path');
const http = require('node:http');
const os = require('node:os');

process.env.DISABLE_GIT_BACKUP = '1';
process.env.STUDIO_PIN = process.env.STUDIO_PIN || '1234';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-session-secret';
process.env.INFLU_SKIP_ENV_PERSIST = '1';

const db = require('../db');
const app = require('../server');

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

function authHeaders(extra = {}) {
  return {
    Authorization: `Bearer ${process.env.STUDIO_PIN}`,
    ...extra
  };
}

test('db upsertPersonaLora + getPersonaLora + clear', () => {
  const persona = db.savePersona({
    name: `Lora Test ${Date.now()}`,
    gender: 'Female',
    forceCreate: true
  });
  const id = persona.id;
  const row = db.upsertPersonaLora({
    personaId: id,
    triggerToken: 'ohwx_test',
    baseModel: 'sd_xl_base_1.0.safetensors',
    weightsPath: `loras/${id}/demo.safetensors`,
    status: 'ready',
    trainingMeta: { comfy_lora_name: 'demo.safetensors' }
  });
  assert.equal(row.status, 'ready');
  assert.equal(row.trigger_token, 'ohwx_test');
  assert.equal(db.getPersonaLora(id).weights_path, `loras/${id}/demo.safetensors`);
  db.clearPersonaLora(id);
  assert.equal(db.getPersonaLora(id), null);
  db.deletePersona(id);
});

test('GET /api/personas/:id/lora default none; POST register; DELETE clear', async () => {
  await withServer(async (base) => {
    const persona = db.savePersona({
      name: `Lora HTTP ${Date.now()}`,
      gender: 'Female',
      forceCreate: true
    });
    const id = persona.id;

    const get1 = await fetch(`${base}/api/personas/${id}/lora`, { headers: authHeaders() });
    assert.equal(get1.status, 200);
    const j1 = await get1.json();
    assert.equal(j1.success, true);
    assert.equal(j1.lora.status, 'none');

    const tmp = path.join(os.tmpdir(), `w_${Date.now()}.safetensors`);
    fs.writeFileSync(tmp, Buffer.from('fake'));

    const fd = new FormData();
    const blob = new Blob([fs.readFileSync(tmp)], { type: 'application/octet-stream' });
    fd.append('weights', blob, 'demo.safetensors');
    fd.append('triggerToken', 'ohwx_http');

    const post = await fetch(`${base}/api/personas/${id}/lora`, {
      method: 'POST',
      headers: authHeaders(),
      body: fd
    });
    const pj = await post.json();
    assert.equal(post.status, 200, pj.message || '');
    assert.equal(pj.success, true);
    assert.equal(pj.lora.status, 'ready');
    assert.match(pj.lora.weights_path, new RegExp(`loras/${id}/`));

    const get2 = await fetch(`${base}/api/personas/${id}/lora`, { headers: authHeaders() });
    const j2 = await get2.json();
    assert.equal(j2.lora.status, 'ready');

    const del = await fetch(`${base}/api/personas/${id}/lora`, {
      method: 'DELETE',
      headers: authHeaders()
    });
    assert.equal(del.status, 200);
    assert.equal((await del.json()).success, true);
    assert.equal(db.getPersonaLora(id), null);

    try { fs.unlinkSync(tmp); } catch (_) {}
    db.deletePersona(id);
  });
});

test('L2 docs exist', () => {
  const root = path.join(__dirname, '..');
  assert.ok(fs.existsSync(path.join(root, 'docs', 'lora', 'L2_COMFYUI.md')));
});
