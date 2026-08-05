'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('path');
const os = require('node:os');

test('migración v11 persona_loras está definida', () => {
  const { MIGRATIONS } = require('../migrations');
  const m = MIGRATIONS.find((x) => x.id === 11);
  assert.ok(m);
  assert.equal(m.name, 'persona_loras');
});

test('generateWithLora → null sin COMFYUI_URL (free path)', async () => {
  const prev = process.env.COMFYUI_URL;
  delete process.env.COMFYUI_URL;
  // Re-require fresh module state for URL
  delete require.cache[require.resolve('../comfyui-client')];
  delete require.cache[require.resolve('../image-provider')];
  const imageProvider = require('../image-provider');
  const out = await imageProvider.generateWithLora({
    personaId: 'nope',
    prompt: 'test',
    loraRow: { status: 'ready', weights_path: 'loras/x/a.safetensors', trigger_token: 'ohwx' }
  });
  assert.equal(out, null);
  if (prev != null) process.env.COMFYUI_URL = prev;
  else delete process.env.COMFYUI_URL;
  delete require.cache[require.resolve('../comfyui-client')];
  delete require.cache[require.resolve('../image-provider')];
});

test('generateWithLora → null si status != ready aunque haya URL', async () => {
  process.env.COMFYUI_URL = 'http://127.0.0.1:8188';
  delete require.cache[require.resolve('../comfyui-client')];
  delete require.cache[require.resolve('../image-provider')];
  const imageProvider = require('../image-provider');
  const out = await imageProvider.generateWithLora({
    personaId: 'p1',
    prompt: 'hello',
    loraRow: { status: 'none', weights_path: null }
  });
  assert.equal(out, null);
  delete process.env.COMFYUI_URL;
  delete require.cache[require.resolve('../comfyui-client')];
  delete require.cache[require.resolve('../image-provider')];
});

test('generateWithLora mock ComfyUI escribe assets/generated', async () => {
  process.env.COMFYUI_URL = 'http://127.0.0.1:8199';
  delete require.cache[require.resolve('../comfyui-client')];
  delete require.cache[require.resolve('../image-provider')];
  const imageProvider = require('../image-provider');

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'influ-lora-'));
  const weightsAbs = path.join(tmpDir, 'demo.safetensors');
  fs.writeFileSync(weightsAbs, Buffer.from('fake-weights'));

  const jpegish = Buffer.from([0xff, 0xd8, 0xff, 0xd9, 0x00, 0x01, 0x02]);
  const fetchImpl = async (url, opts = {}) => {
    const u = String(url);
    if (u.includes('/prompt') && opts.method === 'POST') {
      return {
        ok: true,
        status: 200,
        async json() { return { prompt_id: 'pid_test' }; },
        async text() { return ''; }
      };
    }
    if (u.includes('/history/')) {
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            pid_test: {
              outputs: {
                '9': { images: [{ filename: 'out.png', subfolder: '', type: 'output' }] }
              },
              status: { completed: true, status_str: 'success' }
            }
          };
        }
      };
    }
    if (u.includes('/view')) {
      return {
        ok: true,
        status: 200,
        async arrayBuffer() {
          return jpegish.buffer.slice(jpegish.byteOffset, jpegish.byteOffset + jpegish.byteLength);
        }
      };
    }
    return { ok: false, status: 404, async text() { return 'no'; } };
  };

  const out = await imageProvider.generateWithLora({
    personaId: 'p_mock',
    prompt: 'portrait',
    options: { seed: 42 },
    loraRow: {
      status: 'ready',
      weights_path: weightsAbs,
      trigger_token: 'ohwx_demo',
      base_model: 'sd_xl_base_1.0.safetensors',
      training_meta: JSON.stringify({ comfy_lora_name: 'demo.safetensors' })
    },
    fetchImpl
  });

  assert.ok(out, 'should return relative path');
  assert.match(out, /^assets\/generated\/gen_lora_/);
  const abs = path.join(__dirname, '..', out);
  assert.ok(fs.existsSync(abs));
  fs.unlinkSync(abs);

  delete process.env.COMFYUI_URL;
  delete require.cache[require.resolve('../comfyui-client')];
  delete require.cache[require.resolve('../image-provider')];
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
});

test('comfyui buildDefaultLoraWorkflow incluye LoraLoader', () => {
  delete require.cache[require.resolve('../comfyui-client')];
  const client = require('../comfyui-client');
  const wf = client.buildDefaultLoraWorkflow({
    prompt: 'ohwx woman',
    loraName: 'x.safetensors',
    seed: 1
  });
  assert.equal(wf['10'].class_type, 'LoraLoader');
  assert.equal(wf['10'].inputs.lora_name, 'x.safetensors');
  assert.equal(wf['6'].inputs.text, 'ohwx woman');
});
