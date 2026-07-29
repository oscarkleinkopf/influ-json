const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('path');

const { registerGenerationRoutes } = require('../routes/generation');
const { registerImportRoutes } = require('../routes/import');

test('routes/generation exporta registerGenerationRoutes', () => {
  assert.equal(typeof registerGenerationRoutes, 'function');
});

test('routes/import exporta registerImportRoutes', () => {
  assert.equal(typeof registerImportRoutes, 'function');
});

test('server.js registra generation + import y ya no define handlers inline', () => {
  const js = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert.match(js, /require\('\.\/routes\/generation'\)/);
  assert.match(js, /require\('\.\/routes\/import'\)/);
  assert.match(js, /registerGenerationRoutes\(app/);
  assert.match(js, /registerImportRoutes\(app/);
  assert.doesNotMatch(js, /async function triggerBackgroundVariants/);
  assert.doesNotMatch(js, /async function downloadOrResolveImage/);
  assert.doesNotMatch(js, /app\.post\('\/api\/ai\/generate-image'/);
  assert.doesNotMatch(js, /app\.post\(\['\/api\/import-influencer'/);
});

test('routes/generation.js monta AI + generations', () => {
  const js = fs.readFileSync(path.join(__dirname, '..', 'routes', 'generation.js'), 'utf8');
  assert.match(js, /\/api\/ai\/generate-image/);
  assert.match(js, /\/api\/ai\/analyze-photo/);
  assert.match(js, /\/api\/generations\/:id/);
  assert.match(js, /\/api\/stats\/generations/);
  assert.match(js, /\/api\/ai\/generate-video/);
});

test('routes/import.js monta upload + discard + import + anchors', () => {
  const js = fs.readFileSync(path.join(__dirname, '..', 'routes', 'import.js'), 'utf8');
  assert.match(js, /\/api\/upload-reference/);
  assert.match(js, /\/api\/import-preview\/discard/);
  assert.match(js, /\/api\/upload-reference-url/);
  assert.match(js, /\/api\/import-influencer/);
  assert.match(js, /triggerBackgroundVariants/);
  assert.match(js, /downloadOrResolveImage/);
  assert.match(js, /require\('sharp'\)/);
});
