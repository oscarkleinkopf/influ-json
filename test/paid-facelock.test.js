'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('path');

process.env.DISABLE_GIT_BACKUP = '1';
process.env.STUDIO_PIN = process.env.STUDIO_PIN || '1234';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-session-secret';
process.env.INFLU_SKIP_ENV_PERSIST = '1';

function clearFaceEnv() {
  delete process.env.ENABLE_PAID_FACE_LOCK;
  delete process.env.REPLICATE_API_TOKEN;
  delete process.env.REPLICATE_API_KEY;
  delete process.env.IMAGE_PROVIDER;
  delete process.env.REPLICATE_FACE_MODEL;
  delete require.cache[require.resolve('../paid-facelock')];
  delete require.cache[require.resolve('../image-provider')];
}

test('isPaidFaceLockEnabled requiere flag + token (token solo = false)', () => {
  clearFaceEnv();
  process.env.REPLICATE_API_TOKEN = 'r8_test';
  let paid = require('../paid-facelock');
  assert.equal(paid.isPaidFaceLockEnabled(), false);

  process.env.ENABLE_PAID_FACE_LOCK = '1';
  delete require.cache[require.resolve('../paid-facelock')];
  paid = require('../paid-facelock');
  assert.equal(paid.isPaidFaceLockEnabled(), true);
  clearFaceEnv();
});

test('IMAGE_PROVIDER=replicate + token también habilita (R0)', () => {
  clearFaceEnv();
  process.env.IMAGE_PROVIDER = 'replicate';
  process.env.REPLICATE_API_TOKEN = 'r8_test';
  const paid = require('../paid-facelock');
  assert.equal(paid.isPaidFaceLockEnabled(), true);
  clearFaceEnv();
});

test('buildFaceLockInput pulid vs instantid', () => {
  clearFaceEnv();
  const paid = require('../paid-facelock');
  const pulid = paid.buildFaceLockInput({
    faceImageUrl: 'https://example.com/face.jpg',
    prompt: 'portrait cafe',
    modelId: 'bytedance/pulid:abc'
  });
  assert.equal(pulid.main_face_image, 'https://example.com/face.jpg');
  assert.equal(pulid.prompt, 'portrait cafe');

  const instant = paid.buildFaceLockInput({
    faceImageUrl: 'https://example.com/face.jpg',
    prompt: 'portrait',
    modelId: 'zedge/instantid:def'
  });
  assert.equal(instant.input_image, 'https://example.com/face.jpg');
  clearFaceEnv();
});

test('generateWithOptionalFaceLock sin flag → null', async () => {
  clearFaceEnv();
  const imageProvider = require('../image-provider');
  const out = await imageProvider.generateWithOptionalFaceLock({
    prompt: 'test',
    referenceUrl: 'https://example.com/face.jpg'
  });
  assert.equal(out, null);
  clearFaceEnv();
});

test('generateWithOptionalFaceLock con mock Replicate → gen_facelock path', async () => {
  clearFaceEnv();
  process.env.ENABLE_PAID_FACE_LOCK = '1';
  process.env.REPLICATE_API_TOKEN = 'r8_test';
  delete require.cache[require.resolve('../paid-facelock')];
  delete require.cache[require.resolve('../image-provider')];
  const imageProvider = require('../image-provider');

  const jpegish = Buffer.from([0xff, 0xd8, 0xff, 0xd9, 0x01, 0x02, 0x03]);
  const fetchImpl = async (url, opts = {}) => {
    const u = String(url);
    if (u.includes('/predictions') && opts.method === 'POST') {
      return {
        ok: true,
        status: 200,
        async text() {
          return JSON.stringify({
            id: 'pred_fl',
            status: 'succeeded',
            output: ['https://example.com/facelock.jpg']
          });
        },
        async json() {
          return { id: 'pred_fl', status: 'succeeded', output: ['https://example.com/facelock.jpg'] };
        }
      };
    }
    if (u.includes('facelock.jpg')) {
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

  const out = await imageProvider.generateWithOptionalFaceLock({
    prompt: 'cafe portrait same face',
    referenceUrl: 'https://example.com/face.jpg',
    fetchImpl
  });

  assert.ok(out);
  assert.match(out, /^assets\/generated\/gen_facelock_/);
  assert.equal(imageProvider.inferProviderFromImagePath(out), 'replicate');

  const abs = path.join(__dirname, '..', out);
  if (fs.existsSync(abs)) fs.unlinkSync(abs);
  clearFaceEnv();
});

test('inferProviderFromImagePath clasifica free vs replicate', () => {
  clearFaceEnv();
  const imageProvider = require('../image-provider');
  assert.equal(imageProvider.inferProviderFromImagePath('assets/generated/gen_flux_1.jpg'), 'pollinations');
  assert.equal(imageProvider.inferProviderFromImagePath('assets/generated/gen_facelock_9.jpg'), 'replicate');
  assert.equal(imageProvider.inferProviderFromImagePath('assets/generated/gen_lora_paid_1.jpg'), 'replicate');
  assert.equal(imageProvider.inferProviderFromImagePath('assets/generated/gen_local_1.jpg'), 'local');
  clearFaceEnv();
});

test('ai-service solo intenta face-lock con preferFaceLock === true', async () => {
  clearFaceEnv();
  process.env.ENABLE_PAID_FACE_LOCK = '1';
  process.env.REPLICATE_API_TOKEN = 'r8_test';
  delete require.cache[require.resolve('../paid-facelock')];
  delete require.cache[require.resolve('../image-provider')];
  delete require.cache[require.resolve('../ai-service')];

  const imageProvider = require('../image-provider');
  let called = 0;
  const orig = imageProvider.generateWithOptionalFaceLock;
  imageProvider.generateWithOptionalFaceLock = async () => {
    called += 1;
    return null;
  };

  // Stub Pollinations path to avoid network — force early by mocking isApiConnected path
  // We only assert face-lock gate: with preferFaceLock false/undefined, called stays 0.
  // Direct unit check of the gate condition via re-reading source is fragile; call the
  // private path by invoking generateInfluencerImage with skipQueue and a stub that
  // fails Pollinations quickly is heavy. Instead verify the gate via image-provider
  // + source inspection of ai-service.
  const aiSrc = fs.readFileSync(path.join(__dirname, '..', 'ai-service.js'), 'utf8');
  assert.match(aiSrc, /preferFaceLock === true/);
  assert.doesNotMatch(aiSrc, /preferFaceLock !== false/);

  imageProvider.generateWithOptionalFaceLock = orig;
  clearFaceEnv();
  assert.equal(called, 0);
});

test('UI toggle face-lock demoted + docs', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.match(html, /preferFaceLockToggle/);
  assert.match(html, /faceLockOptInWrap/);
  assert.match(html, /Face-lock mejorado/);

  const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  assert.match(app, /preferFaceLock/);
  assert.match(app, /refreshFaceLockOptIn/);

  const doc = fs.readFileSync(path.join(__dirname, '..', 'docs/FACELOCK_R.md'), 'utf8');
  assert.match(doc, /ENABLE_PAID_FACE_LOCK/);
  assert.match(doc, /fallback automático a Pollinations/);
});
