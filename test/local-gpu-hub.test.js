/**
 * L4 — Hub de inferencia local (ComfyUI + A1111/Forge).
 * Mocks HTTP; sin GPU real.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

function clearLocalGpuCache() {
  const mods = [
    '../local-gpu/a1111-adapter',
    '../local-gpu/comfyui-adapter',
    '../local-gpu/hub',
    '../local-gpu/index',
    '../comfyui-client',
    '../image-provider'
  ];
  for (const m of mods) {
    try { delete require.cache[require.resolve(m)]; } catch (_) {}
  }
}

function resetEnv(keys) {
  for (const k of keys) delete process.env[k];
}

const ENV_KEYS = [
  'COMFYUI_URL', 'A1111_URL', 'FORGE_URL',
  'LOCAL_GPU_BACKEND', 'PREFER_LOCAL_GPU',
  'ENABLE_PAID_LORA'
];

test('hub: sin URLs → not configured / generate null', async () => {
  resetEnv(ENV_KEYS);
  clearLocalGpuCache();
  const hub = require('../local-gpu');
  assert.equal(hub.isConfigured(), false);
  assert.equal(hub.isPreferLocalGpu(), false);
  const status = await hub.getLocalGpuStatus({ doPing: false });
  assert.equal(status.configured, false);
  assert.equal(status.active, null);
  const out = await hub.generateLocalImage({ prompt: 'x' });
  assert.equal(out, null);
});

test('hub: solo Comfy healthy → selecciona comfyui', async () => {
  resetEnv(ENV_KEYS);
  process.env.COMFYUI_URL = 'http://127.0.0.1:8188';
  process.env.A1111_URL = 'http://127.0.0.1:7860';
  process.env.LOCAL_GPU_BACKEND = 'auto';
  clearLocalGpuCache();
  const hub = require('../local-gpu');

  const fetchImpl = async (url) => {
    const u = String(url);
    if (u.includes(':8188') && u.includes('/system_stats')) {
      return { ok: true, status: 200, async json() { return {}; } };
    }
    if (u.includes(':7860')) {
      return { ok: false, status: 503, async json() { return {}; }, async text() { return 'down'; } };
    }
    return { ok: false, status: 404, async text() { return ''; } };
  };

  const resolved = await hub.resolveBackend({ fetchImpl, doPing: true });
  assert.ok(resolved);
  assert.equal(resolved.name, 'comfyui');

  const status = await hub.getLocalGpuStatus({ fetchImpl, doPing: true });
  assert.equal(status.active, 'comfyui');
  assert.equal(status.backends.comfyui.ok, true);
  assert.equal(status.backends.a1111.ok, false);
});

test('hub: solo A1111 healthy → selecciona a1111', async () => {
  resetEnv(ENV_KEYS);
  process.env.COMFYUI_URL = 'http://127.0.0.1:8188';
  process.env.A1111_URL = 'http://127.0.0.1:7860';
  clearLocalGpuCache();
  const hub = require('../local-gpu');

  const fetchImpl = async (url) => {
    const u = String(url);
    if (u.includes(':8188')) {
      return { ok: false, status: 503, async text() { return 'down'; } };
    }
    if (u.includes('/sdapi/v1/sd-models')) {
      return { ok: true, status: 200, async json() { return [{ title: 'model' }]; } };
    }
    return { ok: false, status: 404, async text() { return ''; } };
  };

  const resolved = await hub.resolveBackend({ fetchImpl, doPing: true });
  assert.equal(resolved.name, 'a1111');
});

test('hub: LOCAL_GPU_BACKEND=a1111 fuerza A1111 aunque Comfy esté up', async () => {
  resetEnv(ENV_KEYS);
  process.env.COMFYUI_URL = 'http://127.0.0.1:8188';
  process.env.A1111_URL = 'http://127.0.0.1:7860';
  process.env.LOCAL_GPU_BACKEND = 'a1111';
  clearLocalGpuCache();
  const hub = require('../local-gpu');

  const fetchImpl = async (url) => {
    const u = String(url);
    if (u.includes('/system_stats') || u.includes('/sd-models')) {
      return { ok: true, status: 200, async json() { return u.includes('sd-models') ? [] : {}; } };
    }
    return { ok: false, status: 404, async text() { return ''; } };
  };

  const resolved = await hub.resolveBackend({ fetchImpl, doPing: true });
  assert.equal(resolved.name, 'a1111');
  assert.equal(hub.getBackendPreference(), 'a1111');
});

test('hub: ambos down → generate null', async () => {
  resetEnv(ENV_KEYS);
  process.env.COMFYUI_URL = 'http://127.0.0.1:8188';
  process.env.A1111_URL = 'http://127.0.0.1:7860';
  clearLocalGpuCache();
  const hub = require('../local-gpu');

  const fetchImpl = async () => ({
    ok: false,
    status: 503,
    async text() { return 'down'; },
    async json() { return {}; }
  });

  const out = await hub.generateLocalImage({ prompt: 'x' }, { fetchImpl });
  assert.equal(out, null);
});

test('a1111: prompt incluye <lora:…> cuando hay LoRA', () => {
  resetEnv(ENV_KEYS);
  clearLocalGpuCache();
  const a1111 = require('../local-gpu/a1111-adapter');
  const withLora = a1111.buildPromptWithLora('portrait of a woman', {
    name: 'ohwx_demo.safetensors',
    strength: 0.8
  });
  assert.match(withLora, /<lora:ohwx_demo\.safetensors:0\.8>/);
  assert.match(withLora, /portrait of a woman/);
  const plain = a1111.buildPromptWithLora('hello', null);
  assert.equal(plain, 'hello');
});

test('a1111 generate mock → buffer', async () => {
  resetEnv(ENV_KEYS);
  process.env.A1111_URL = 'http://127.0.0.1:7860';
  clearLocalGpuCache();
  const hub = require('../local-gpu');

  const jpegish = Buffer.from([0xff, 0xd8, 0xff, 0xd9, 0x11, 0x22]);
  let capturedBody = null;
  const fetchImpl = async (url, opts = {}) => {
    const u = String(url);
    if (u.includes('/sd-models')) {
      return { ok: true, status: 200, async json() { return [{ title: 'sdxl' }]; } };
    }
    if (u.includes('/txt2img') && opts.method === 'POST') {
      capturedBody = JSON.parse(opts.body);
      return {
        ok: true,
        status: 200,
        async json() {
          return { images: [jpegish.toString('base64')] };
        }
      };
    }
    return { ok: false, status: 404, async text() { return ''; } };
  };

  const out = await hub.generateLocalImage({
    prompt: 'test shot',
    lora: { name: 'demo.safetensors', strength: 0.9 }
  }, { fetchImpl });

  assert.ok(out?.buffer);
  assert.equal(out.backend, 'a1111');
  assert.ok(Buffer.isBuffer(out.buffer));
  assert.match(capturedBody.prompt, /<lora:demo\.safetensors:0\.9>/);
});

test('image-provider: PREFER_LOCAL_GPU + A1111 escribe assets/generated', async () => {
  resetEnv(ENV_KEYS);
  process.env.A1111_URL = 'http://127.0.0.1:7860';
  process.env.PREFER_LOCAL_GPU = '1';
  clearLocalGpuCache();
  const imageProvider = require('../image-provider');
  assert.equal(imageProvider.isPreferLocalGpu(), true);

  const jpegish = Buffer.from([0xff, 0xd8, 0xff, 0xd9, 0xaa]);
  const fetchImpl = async (url, opts = {}) => {
    const u = String(url);
    if (u.includes('/sd-models')) {
      return { ok: true, status: 200, async json() { return []; } };
    }
    if (u.includes('/txt2img')) {
      return {
        ok: true,
        status: 200,
        async json() { return { images: [jpegish.toString('base64')] }; }
      };
    }
    return { ok: false, status: 404, async text() { return ''; } };
  };

  const out = await imageProvider.generateWithLocalGpu({
    prompt: 'local sketch',
    options: {},
    fetchImpl
  });
  assert.ok(out);
  assert.match(out, /^assets\/generated\/gen_local_a1111_/);
  const abs = path.join(__dirname, '..', out);
  assert.ok(fs.existsSync(abs));
  fs.unlinkSync(abs);

  resetEnv(ENV_KEYS);
  clearLocalGpuCache();
});

test('image-provider: generateWithLora vía hub A1111', async () => {
  resetEnv(ENV_KEYS);
  process.env.A1111_URL = 'http://127.0.0.1:7860';
  clearLocalGpuCache();
  const imageProvider = require('../image-provider');

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'influ-l4-'));
  const weightsAbs = path.join(tmpDir, 'demo.safetensors');
  fs.writeFileSync(weightsAbs, Buffer.from('fake'));

  const jpegish = Buffer.from([0xff, 0xd8, 0xff, 0xd9, 0xbb]);
  let captured = null;
  const fetchImpl = async (url, opts = {}) => {
    const u = String(url);
    if (u.includes('/sd-models')) {
      return { ok: true, status: 200, async json() { return []; } };
    }
    if (u.includes('/txt2img')) {
      captured = JSON.parse(opts.body);
      return {
        ok: true,
        status: 200,
        async json() { return { images: [jpegish.toString('base64')] }; }
      };
    }
    return { ok: false, status: 404, async text() { return ''; } };
  };

  const out = await imageProvider.generateWithLora({
    personaId: 'p_l4',
    prompt: 'portrait',
    options: { seed: 7 },
    loraRow: {
      status: 'ready',
      weights_path: weightsAbs,
      trigger_token: 'ohwx_l4',
      training_meta: JSON.stringify({ comfy_lora_name: 'demo.safetensors', lora_strength: 0.75 })
    },
    fetchImpl
  });

  assert.ok(out);
  assert.match(out, /^assets\/generated\/gen_lora_a1111_/);
  assert.match(captured.prompt, /<lora:demo\.safetensors:0\.75>/);
  assert.match(captured.prompt, /ohwx_l4/);
  fs.unlinkSync(path.join(__dirname, '..', out));
  fs.rmSync(tmpDir, { recursive: true, force: true });

  resetEnv(ENV_KEYS);
  clearLocalGpuCache();
});

test('UI: panel L4 dentro de #loraAdvancedPanel (demoted)', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  assert.match(html, /id="loraAdvancedPanel"/);
  const loraIdx = html.indexOf('id="loraAdvancedPanel"');
  const packIdx = html.indexOf('id="btnCopyPackFullbodyPrimary"');
  assert.ok(packIdx >= 0 && loraIdx > packIdx, 'LoRA panel must be after Copiar JSON card');
  assert.match(html, /GPU local \(L4\)/);
  assert.match(html, /id="localGpuStatusPanel"/);
  assert.ok(html.indexOf('localGpuStatusPanel') > loraIdx);
  assert.match(html, /docs\/lora\/L4_LOCAL_GPU\.md/);
  assert.match(app, /\/api\/local-gpu\/status/);
  assert.match(app, /function refreshLocalGpuStatus/);
  assert.match(app, /btnRefreshLocalGpu/);
});

test('GET /api/local-gpu/status responde sin backends', async () => {
  resetEnv(ENV_KEYS);
  clearLocalGpuCache();
  process.env.DISABLE_GIT_BACKUP = '1';
  process.env.STUDIO_PIN = process.env.STUDIO_PIN || '1234';
  process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-session-secret-l4';
  delete require.cache[require.resolve('../server')];
  const http = require('node:http');
  const appSrv = require('../server');
  const server = http.createServer(appSrv);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const pin = (process.env.STUDIO_PIN || '1234').trim();
    const res = await fetch(`${base}/api/local-gpu/status`, {
      headers: { Authorization: `Bearer ${pin}` }
    });
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.success, true);
    assert.equal(data.configured, false);
    assert.ok(data.backends);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
