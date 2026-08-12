/**
 * UX detalles — variant-vault-ui extract + wiring.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const appJs = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const foot = fs.readFileSync(path.join(root, 'views', '_foot.html'), 'utf8');
const serverJs = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const vault = require('../variant-vault-ui.js');
const presets = require('../variant-presets.js');

test('InfluVariantVaultUi exports createVariantVaultUi', () => {
  assert.equal(typeof vault.createVariantVaultUi, 'function');
});

test('createVariantVaultUi returns vault/chips API', () => {
  const state = {
    variantMode: 'traditional',
    variantAccessories: [],
    variantBatch: 1,
    activeVariants: [],
    selectedPersona: null
  };
  const api = vault.createVariantVaultUi({
    getState: () => state,
    authFetch: async () => ({ ok: true, json: async () => ([]) }),
    toastInfo() {},
    toastSuccess() {},
    toastError() {},
    toastLoading() {},
    variantPresetsApi: presets,
    document: {
      getElementById() { return null; },
      querySelector() { return null; },
      createElement() {
        return {
          classList: { toggle() {}, add() {}, remove() {} },
          addEventListener() {},
          appendChild() {},
          style: {},
          options: []
        };
      }
    },
    window: {}
  });

  const expected = [
    'setVariantMode',
    'populateVariantDropdowns',
    'renderVariantChips',
    'renderAccessoryChips',
    'randomizeVariantChips',
    'applyLookPreset',
    'renderLookPresets',
    'updateBatchHint',
    'renderBatchChips',
    'updateVariantClothingDropdown',
    'loadVariantsForPersona',
    'consistencyChipHtml',
    'renderVariantVaultGrid',
    'setMainVariantAction',
    'deleteVariantAction',
    'generateVariantAction',
    'generateOneVariant',
    'setupVariantManager',
    'bindWindowGlobals'
  ];
  for (const name of expected) {
    assert.equal(typeof api[name], 'function', `missing ${name}`);
  }
  assert.ok(api.VARIANT_PRESETS.traditional);
  assert.ok(Array.isArray(api.LOOK_PRESETS));
});

test('consistencyChipHtml grades ok/warn/bad', () => {
  const api = vault.createVariantVaultUi({
    getState: () => ({ activeVariants: [] }),
    authFetch: async () => ({ ok: true, json: async () => ([]) })
  });
  assert.equal(api.consistencyChipHtml({}), '');
  assert.match(api.consistencyChipHtml({ consistency_grade: 'ok', consistency_distance: 2 }), /is-ok/);
  assert.match(api.consistencyChipHtml({ consistency_grade: 'warn', consistency_distance: 8 }), /is-warn/);
  assert.match(api.consistencyChipHtml({ consistency_grade: 'bad', consistency_distance: 20 }), /is-bad/);
});

test('bindWindowGlobals wires setVariantMode / setMain / delete', () => {
  const state = { variantMode: 'traditional', selectedPersona: null, activeVariants: [] };
  const fakeWin = {};
  const api = vault.createVariantVaultUi({
    getState: () => state,
    authFetch: async () => ({ ok: true, json: async () => ({}) }),
    document: { getElementById() { return null; }, querySelector() { return null; }, createElement() { return {}; } },
    window: fakeWin
  });
  api.bindWindowGlobals(fakeWin);
  assert.equal(typeof fakeWin.setVariantMode, 'function');
  assert.equal(typeof fakeWin.setMainVariantAction, 'function');
  assert.equal(typeof fakeWin.deleteVariantAction, 'function');
  assert.equal(typeof fakeWin.randomizeVariantChips, 'function');
});

test('app.js / foot / server cablean variant-vault-ui', () => {
  assert.match(appJs, /InfluVariantVaultUi/);
  assert.match(appJs, /createVariantVaultUi/);
  assert.match(appJs, /_variantVaultUi/);
  assert.match(appJs, /bindWindowGlobals/);
  assert.doesNotMatch(appJs, /Selfie primer plano \(rostro\)/);
  assert.doesNotMatch(appJs, /Renderizando \$\{mode === 'spicy'/);
  assert.match(appJs, /async function archivePersonaAction/);
  assert.match(appJs, /function setupVariantManager/);
  assert.match(foot, /variant-vault-ui\.js/);
  assert.match(serverJs, /variant-vault-ui\.js/);
  // Thin wrappers remain for call sites
  assert.match(appJs, /function loadVariantsForPersona/);
  assert.match(appJs, /function renderVariantVaultGrid/);
  assert.match(appJs, /function consistencyChipHtml/);
});

test('photo-upload-ui UMD + wiring', () => {
  const photoUi = require('../photo-upload-ui.js');
  assert.equal(typeof photoUi.createPhotoUploadUi, 'function');
  assert.match(appJs, /InfluPhotoUploadUi/);
  assert.match(foot, /photo-upload-ui\.js/);
  assert.match(serverJs, /photo-upload-ui\.js/);
  assert.match(appJs, /window\.resetUploadDropzone/);
});

test('paths getReferencesUploadDir aisla tests en DATA_DIR', () => {
  const pathsSrc = fs.readFileSync(path.join(root, 'paths.js'), 'utf8');
  assert.match(pathsSrc, /function getReferencesUploadDir/);
  assert.match(pathsSrc, /INFLU_TEST_UPLOADS/);
  assert.match(serverJs, /getReferencesUploadDir/);
  const runTests = fs.readFileSync(path.join(root, 'scripts', 'run-tests.js'), 'utf8');
  assert.match(runTests, /INFLU_TEST_UPLOADS/);
});

test('layout-smoke script + CI workflow presentes', () => {
  assert.ok(fs.existsSync(path.join(root, 'scripts', 'layout-smoke.js')));
  const wf = fs.readFileSync(path.join(root, '.github', 'workflows', 'test.yml'), 'utf8');
  assert.match(wf, /layout-smoke/);
  assert.match(wf, /setup-chrome|browser-actions\/setup-chrome/);
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.equal(pkg.scripts['layout-smoke'], 'node scripts/layout-smoke.js');
  assert.ok(pkg.devDependencies && pkg.devDependencies['puppeteer-core']);
});

test('drafts #72/#76–80 documentados como backlog (no reabrir en masa)', () => {
  const handoff = fs.readFileSync(path.join(root, 'HANDOFF.md'), 'utf8');
  assert.match(handoff, /#72|#76|backlog|no reintegr/i);
});
