const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const css = fs.readFileSync(path.join(__dirname, '..', 'index.css'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

test('QA matrix thumbs are taller than the old 110px crop', () => {
  assert.doesNotMatch(css, /\.qa-slot img\s*\{[^}]*height:\s*110px/s);
  assert.match(css, /\.qa-slot-media\s*\{[^}]*min-height:\s*280px/s);
  assert.match(css, /object-position:\s*top center/);
  assert.match(css, /minmax\(200px,\s*1fr\)/);
});

test('QA matrix supports click-to-zoom lightbox', () => {
  assert.match(app, /openQaMatrixLightbox/);
  assert.match(app, /data-qa-zoom/);
  assert.match(css, /\.qa-matrix-lightbox/);
  assert.match(html, /clic en una foto para ampliar|Clic en la imagen/i);
});
