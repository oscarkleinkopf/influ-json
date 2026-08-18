const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  MAX_IMPORT_PHOTOS,
  filterImageFiles,
  mergeSelectedFiles,
  buildAnalyzeFormData,
  normalizeImportPreview,
  buildConfirmPersonaPayload,
  collectDiscardPaths,
  buildSummaryHtml,
  getImportPreviewTraits,
  applyImportConfirmTraits,
  applyImportOriginMode,
  focusImportOrigin,
  mergeEditedJsonIntoPersona,
  setImportRitualStep,
  initImportModal
} = require('../import-flow');

test('applyImportOriginMode destaca url vs photo', () => {
  const classes = { photo: [], url: [] };
  const makeEl = (origin) => ({
    getAttribute: () => origin,
    classList: {
      toggle: (cls, on) => classes[origin].push([cls, !!on])
    }
  });
  const root = {
    querySelectorAll: () => [makeEl('photo'), makeEl('url')]
  };
  assert.equal(applyImportOriginMode(root, 'url'), 'url');
  assert.ok(classes.url.some((x) => x[0] === 'is-origin-focus' && x[1] === true));
  assert.ok(classes.photo.some((x) => x[0] === 'is-origin-muted' && x[1] === true));
});

test('focusImportOrigin enfoca URL o selector de archivo', () => {
  const focused = [];
  const makeEl = (name) => ({ focus: () => focused.push(name) });
  assert.equal(focusImportOrigin('url', { urlInput: makeEl('url') }), 'url');
  assert.deepEqual(focused, ['url']);
  focused.length = 0;
  assert.equal(focusImportOrigin('photo', {
    imagesInput: makeEl('file'),
    dropzone: makeEl('drop')
  }), 'photo');
  assert.deepEqual(focused, ['file']);
  focused.length = 0;
  assert.equal(focusImportOrigin('photo', { dropzone: makeEl('drop') }), 'photo');
  assert.deepEqual(focused, ['drop']);
});

test('mergeEditedJsonIntoPersona reemplaza detailedJSON o rechaza inválido', () => {
  const base = { name: 'Ada', detailedJSON: { identity: { name: 'Ada' } } };
  const next = mergeEditedJsonIntoPersona(base, '{"identity":{"name":"Luna"}}');
  assert.equal(next.detailedJSON.identity.name, 'Luna');
  assert.equal(next.name, 'Ada');
  assert.throws(() => mergeEditedJsonIntoPersona(base, '{nope'), /JSON/);
});

test('MAX_IMPORT_PHOTOS es 4', () => {
  assert.equal(MAX_IMPORT_PHOTOS, 4);
});

test('filterImageFiles solo deja image/*', () => {
  const files = [
    { type: 'image/jpeg', name: 'a.jpg' },
    { type: 'text/plain', name: 'b.txt' },
    { type: 'image/png', name: 'c.png' }
  ];
  assert.equal(filterImageFiles(files).length, 2);
  assert.deepEqual(filterImageFiles(null), []);
});

test('mergeSelectedFiles respeta tope 4 y reporta truncado', () => {
  const selected = [
    { type: 'image/jpeg', name: '1.jpg' },
    { type: 'image/jpeg', name: '2.jpg' },
    { type: 'image/jpeg', name: '3.jpg' }
  ];
  const incoming = [
    { type: 'image/jpeg', name: '4.jpg' },
    { type: 'image/jpeg', name: '5.jpg' }
  ];
  const merged = mergeSelectedFiles(selected, incoming);
  assert.equal(merged.files.length, 4);
  assert.equal(merged.truncated, true);
  assert.equal(merged.added, 1);

  const full = mergeSelectedFiles(merged.files, incoming);
  assert.equal(full.added, 0);
  assert.equal(full.truncated, true);
});

test('buildAnalyzeFormData marca previewOnly=1 por defecto', () => {
  const fd = buildAnalyzeFormData({
    files: [{ name: 'a.jpg' }],
    name: 'Luna',
    imageUrl: 'https://example.com/x.jpg',
    scriptTopic: 'serum'
  });
  assert.equal(fd.get('previewOnly'), '1');
  assert.equal(fd.get('name'), 'Luna');
  assert.equal(fd.get('imageUrl'), 'https://example.com/x.jpg');
  assert.equal(fd.get('scriptTopic'), 'serum');
  assert.ok(fd.get('photo'));
});

test('normalizeImportPreview quita id y recoge imagePaths', () => {
  const n = normalizeImportPreview({
    preview: true,
    persona: { id: 'should-go', name: 'Ada', image: 'assets/references/ref_x.jpg' },
    videoScripts: [{ title: 'A' }]
  });
  assert.equal(n.isPreview, true);
  assert.equal(n.persona.id, undefined);
  assert.equal(n.persona.name, 'Ada');
  assert.deepEqual(n.imagePaths, ['assets/references/ref_x.jpg']);
  assert.equal(n.videoScripts.length, 1);
});

test('buildConfirmPersonaPayload fuerza forceCreate y handle', () => {
  const payload = buildConfirmPersonaPayload(
    { id: 'x', name: 'Old', gender: 'Female', hair: { length: 'largo', color: 'negro' } },
    'Nueva Marca'
  );
  assert.equal(payload.id, undefined);
  assert.equal(payload.forceCreate, true);
  assert.equal(payload.name, 'Nueva Marca');
  assert.equal(payload.handle, '@nuevamarca_ugc');
  assert.equal(typeof payload.hair, 'string');
  assert.match(payload.hair, /largo/);
});

test('buildConfirmPersonaPayload rechaza sin nombre', () => {
  assert.throws(() => buildConfirmPersonaPayload({ name: '' }, '  '), /nombre/);
});

test('collectDiscardPaths prioriza imagePaths', () => {
  assert.deepEqual(collectDiscardPaths(['a.jpg'], { image: 'b.jpg' }), ['a.jpg']);
  assert.deepEqual(collectDiscardPaths([], { image: 'b.jpg' }), ['b.jpg']);
});

test('buildSummaryHtml incluye campos del detailedJSON', () => {
  const html = buildSummaryHtml({
    gender: 'Female',
    detailedJSON: {
      identity: { gender: 'Female', apparent_age: '24 años', ethnicity_appearance: 'Latina' },
      facial_features: { face_shape: 'ovalada', skin_tone: 'piel clara' },
      hair: { length: 'largo', texture: 'liso', color: 'Castaño' },
      aesthetic: { overall_vibe: 'Casual' }
    }
  });
  assert.match(html, /24 años/);
  assert.match(html, /piel clara/);
  assert.match(html, /Casual/);
});

test('initImportModal está exportado', () => {
  assert.equal(typeof initImportModal, 'function');
});

test('getImportPreviewTraits lee detailedJSON (skin/eyes/hair)', () => {
  const traits = getImportPreviewTraits({
    ethnicity: 'Latina',
    detailedJSON: {
      identity: { ethnicity_appearance: 'Latina de tez clara' },
      facial_features: { skin_tone: 'piel clara natural', eye_color: 'marrón cálido' },
      hair: { color: 'Castaño', length: 'largo', texture: 'ondulado' }
    }
  });
  assert.equal(traits.skin, 'piel clara natural');
  assert.equal(traits.eyes, 'marrón cálido');
  assert.match(traits.hair, /Castaño/);
  assert.equal(traits.ethnicity, 'Latina de tez clara');
});

test('applyImportConfirmTraits actualiza must_match y detailedJSON', () => {
  const base = {
    name: 'Luna',
    detailedJSON: {
      identity: { ethnicity_appearance: 'Latina' },
      facial_features: { skin_tone: 'medio', eye_color: 'verde' },
      hair: { color: 'negro', length: 'corto' }
    }
  };
  const next = applyImportConfirmTraits(base, {
    skin: 'piel clara natural',
    eyes: 'marrón oscuro',
    hair: 'Castaño, largo, ondas suaves',
    ethnicity: 'Latina de tez clara'
  });
  assert.equal(next.detailedJSON.facial_features.skin_tone, 'piel clara natural');
  assert.equal(next.detailedJSON.facial_features.eye_color, 'marrón oscuro');
  assert.equal(next.detailedJSON.identity.ethnicity_appearance, 'Latina de tez clara');
  assert.equal(next.ethnicity, 'Latina de tez clara');
  assert.equal(next.detailedJSON.hair.color, 'Castaño');
  assert.equal(next.detailedJSON.character_lock.must_match_every_image.skin_tone, 'piel clara natural');
  assert.equal(next.detailedJSON.character_lock.must_match_every_image.eyes, 'marrón oscuro');
  assert.match(next.detailedJSON.character_lock.must_match_every_image.hair, /Castaño/);
  assert.equal(next.character_lock.must_match_every_image.name, 'Luna');
});

test('setImportRitualStep marca paso activo', () => {
  const els = [1, 2, 3].map((n) => {
    const toggles = [];
    return {
      getAttribute: () => String(n),
      classList: { toggle: (cls, on) => toggles.push([cls, !!on]) },
      toggles
    };
  });
  setImportRitualStep({ querySelectorAll: () => els }, 2);
  assert.deepEqual(els[0].toggles, [['is-active', false], ['is-done', true]]);
  assert.deepEqual(els[1].toggles, [['is-active', true], ['is-done', false]]);
  assert.deepEqual(els[2].toggles, [['is-active', false], ['is-done', false]]);
});

test('modal ritual: confirmar tez/ojos/pelo + CTA Copiar JSON', () => {
  const foot = fs.readFileSync(path.join(__dirname, '..', 'views/_foot.html'), 'utf8');
  assert.match(foot, /Inspirar desde foto/);
  assert.match(foot, /id="importConfirmSkin"/);
  assert.match(foot, /id="importConfirmEyes"/);
  assert.match(foot, /id="importConfirmHair"/);
  assert.match(foot, /Guardar → Copiar JSON/);
  assert.match(foot, /data-import-ritual="1"/);
  assert.match(foot, /id="importJsonReview"/);
  assert.match(foot, /id="btnOpenImportInEditor"/);
  assert.match(foot, /data-import-origin="url"/);
  assert.match(foot, /data-import-origin="photo"/);
  assert.match(foot, /id="importUrlHint"/);
  assert.match(foot, /class="import-file-input"/);
  assert.match(foot, /id="importImages"/);
});

test('app.js inyecta setStep2Focus / Copiar JSON en import', () => {
  const js = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  assert.match(js, /setStep2Focus,/);
  assert.match(js, /copyFreeChatbotPack/);
  assert.match(js, /api\.initImportModal\(/);
});

test('index.html carga import-flow.js antes de app.js', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const iFlow = html.indexOf('import-flow.js');
  const iApp = html.indexOf('app.js?v=');
  assert.ok(iFlow > 0);
  assert.ok(iApp > iFlow);
  assert.match(html, /Inspirar desde foto/);
  assert.match(html, /id="importConfirmSkin"/);
});

test('app.js delega initImportModal a InfluImportFlow', () => {
  const js = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  assert.match(js, /window\.InfluImportFlow/);
  assert.match(js, /api\.initImportModal\(/);
  assert.doesNotMatch(js, /lastImportImagePaths = \[\]/);
});
