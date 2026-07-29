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
  initImportModal
} = require('../import-flow');

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

test('index.html carga import-flow.js antes de app.js', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const iFlow = html.indexOf('import-flow.js');
  const iApp = html.indexOf('app.js?v=');
  assert.ok(iFlow > 0);
  assert.ok(iApp > iFlow);
});

test('app.js delega initImportModal a InfluImportFlow', () => {
  const js = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  assert.match(js, /window\.InfluImportFlow/);
  assert.match(js, /api\.initImportModal\(/);
  assert.doesNotMatch(js, /lastImportImagePaths = \[\]/);
});
