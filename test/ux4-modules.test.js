/**
 * UX-4 continuación — toast / form / card / queue modules + CSS classes.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const appJs = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'index.css'), 'utf8');
const foot = fs.readFileSync(path.join(root, 'views', '_foot.html'), 'utf8');
const serverJs = fs.readFileSync(path.join(root, 'server.js'), 'utf8');

const toast = require('../studio-toast.js');
const form = require('../persona-form.js');
const card = require('../persona-card.js');
const queue = require('../queue-poller.js');

test('UX-4 modules export expected APIs', () => {
  assert.equal(typeof toast.createStudioToast, 'function');
  assert.equal(typeof form.readPersonaForm, 'function');
  assert.equal(typeof form.readPersonaRowFields, 'function');
  assert.equal(typeof card.buildSelectPersonaCard, 'function');
  assert.equal(typeof card.buildCampaignPersonaCard, 'function');
  assert.equal(typeof queue.createQueuePoller, 'function');
});

test('readPersonaForm lee ids del Persona Engine', () => {
  const values = {
    pName: 'Ana',
    pGender: 'Female',
    pAge: '25',
    pEthnicity: 'Latina',
    pStyle: 'Natural',
    pHair: 'Largo',
    pLighting: 'Soft',
    pCamera: 'iPhone',
    pClothing: 'Casual',
    pSetting: 'Café',
    pSkinTone: 'Clara',
    pSkinToneHex: '#f0d5c0',
    pSkinTexture: 'Suave',
    pHairColor: 'Castaño',
    pHairTexture: 'Ondulado',
    pHairLength: 'Largo',
    pEyebrows: 'Natural',
    pEyeColor: 'Marrón',
    pLips: 'Rosados',
    pFaceShape: 'Ovalada',
    pSmileType: 'Natural',
    pDistinctiveMarks: '',
    pFacialAsymmetry: '',
    pBodyType: 'Atlético',
    pHeight: '1.65',
    pProportions: '',
    pPosture: '',
    pFitness: '',
    pBodySkin: '',
    pMbti: 'ENFP',
    pCommunicationStyle: '',
    pTaboos: 'política'
  };
  const doc = {
    getElementById(id) {
      if (!(id in values)) return { value: '' };
      return { value: values[id] };
    }
  };
  const f = form.readPersonaForm(doc);
  assert.equal(f.name, 'Ana');
  assert.equal(f.skinToneHex, '#f0d5c0');
  assert.equal(f.taboos, 'política');
  const row = form.readPersonaRowFields(doc);
  assert.equal(row.name, 'Ana');
  assert.equal(row.ethnicity, 'Latina');
});

test('studio-toast createStudioToast escribe en banner mock', () => {
  const banner = {
    className: '',
    classList: { remove() { banner.className = banner.className.replace(/\bshow\b/, '').trim(); } },
    querySelector() { return null; },
    appendChild() {}
  };
  const textEl = { textContent: '' };
  const api = toast.createStudioToast({
    getBanner: () => banner,
    getTextEl: () => textEl,
    getIconEl: () => null,
    getGitIndicator: () => null,
    getGitStatusText: () => null
  });
  api.toastSuccess('Guardado OK', { duration: 10 });
  assert.match(banner.className, /show/);
  assert.match(banner.className, /type-success/);
  assert.equal(textEl.textContent, 'Guardado OK');
});

test('createQueuePoller para cuando cola vacía', async () => {
  let stopped = false;
  let disabledCalls = [];
  const poller = queue.createQueuePoller({
    authFetch: async () => ({
      ok: true,
      json: async () => ({
        success: true,
        queue: { active: false, pendingCount: 0, isCoolingDown: false, rateLimitActive: false }
      })
    }),
    showAppToast() {},
    setGenerationButtonsDisabled(v) { disabledCalls.push(v); },
    updateQueueStatusChip() {},
    getState: () => ({ selectedPersona: null, activeTab: 'dashboard' })
  });
  const origStop = poller.stop.bind(poller);
  poller.stop = () => { stopped = true; origStop(); };
  await poller.check();
  assert.equal(stopped, true);
  assert.ok(disabledCalls.includes(false));
});

test('app.js / foot / server cablean módulos UX-4', () => {
  assert.match(appJs, /InfluStudioToast/);
  assert.match(appJs, /InfluQueuePoller/);
  assert.match(appJs, /InfluPersonaForm/);
  assert.match(appJs, /InfluPersonaCard/);
  assert.match(appJs, /readPersonaForm/);
  assert.match(appJs, /readPersonaRowFields/);
  assert.match(appJs, /buildSelectPersonaCard/);
  assert.match(appJs, /buildCampaignPersonaCard/);
  assert.doesNotMatch(appJs, /const MIN_TOAST_MS = 3000/);
  assert.match(foot, /studio-toast\.js/);
  assert.match(foot, /queue-poller\.js/);
  assert.match(foot, /persona-form\.js/);
  assert.match(foot, /persona-card\.js/);
  assert.match(serverJs, /studio-toast\.js/);
  assert.match(serverJs, /persona-form\.js/);
});

test('CSS UX-4: btn-compact y persona-card--compact', () => {
  assert.match(css, /\.btn-compact\s*\{/);
  assert.match(css, /\.persona-card--compact/);
  assert.match(css, /\.settings-field-input/);
  assert.match(css, /\.empty-filter-panel/);
  assert.match(appJs, /btn-compact/);
  assert.match(appJs, /empty-filter-panel/);
});

test('variant-presets UMD + app wiring', () => {
  const vp = require('../variant-presets.js');
  assert.ok(vp.VARIANT_PRESETS.traditional);
  assert.ok(vp.VARIANT_PRESETS.spicy);
  assert.ok(Array.isArray(vp.VARIANT_ACCESSORIES));
  assert.deepEqual(vp.VARIANT_BATCH_OPTIONS, [1, 4]);
  assert.equal(vp.getPreset('missing'), vp.VARIANT_PRESETS.traditional);
  assert.ok(vp.clothingFor(vp.VARIANT_PRESETS.traditional, 'Female').length > 0);
  assert.match(appJs, /InfluVariantPresets/);
  assert.match(appJs, /_variantPresetsApi/);
  assert.doesNotMatch(appJs, /Selfie primer plano \(rostro\)/);
  assert.match(foot, /variant-presets\.js/);
  assert.match(serverJs, /variant-presets\.js/);
});

test('applyAnalysisToFormFields escribe form mock', () => {
  const store = {};
  const doc = {
    getElementById(id) {
      if (!store[id]) store[id] = { value: '' };
      return store[id];
    }
  };
  const out = form.applyAnalysisToFormFields({
    identity: { name: 'Val', gender: 'Female', apparent_age: '24', ethnicity_appearance: 'Latina' },
    facial_features: {
      skin_tone: 'Clara', eye_color: 'Verde', face_shape: 'Ovalada', smile_type: 'Natural',
      skin_texture: 'Suave', eyebrow_style: 'Arqueadas', lips: 'Rosados'
    },
    hair: { color: 'Negro', texture: 'Liso', length: 'Largo' },
    aesthetic: { overall_vibe: 'Chic' },
    photography: { background_setting: 'Café' },
    clothing: { type: 'Vestido', color: 'rojo' },
    body: { body_type: 'Atlético' }
  }, doc);
  assert.equal(store.pName.value, 'Val');
  assert.equal(store.pEyeColor.value, 'Verde');
  assert.equal(store.pBodyType.value, 'Atlético');
  assert.match(out.clothingHint, /Vestido/);
});

test('CSS utilities UX-4 presentes', () => {
  assert.match(css, /\.u-hidden/);
  assert.match(css, /\.u-flex-between/);
  assert.match(css, /\.u-section-title/);
  assert.match(css, /\.filter-btn-active/);
  const pe = fs.readFileSync(path.join(root, 'views', 'tabs', 'persona-engine.html'), 'utf8');
  assert.match(pe, /u-hidden|u-flex-between|u-mt-10/);
});
