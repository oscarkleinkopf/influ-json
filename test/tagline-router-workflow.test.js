/**
 * Tagline de utilidad: router de workflow (no GPUs) en superficies visibles.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const PHRASE = /Un router de workflow, no de GPUs/;
const JOBS = /inspirar,\s*UGC,\s*producto,\s*chatbot/;

test('Portafolio: tagline router de workflow', () => {
  const dash = fs.readFileSync(path.join(root, 'views/tabs/dashboard.html'), 'utf8');
  assert.match(dash, PHRASE);
  assert.match(dash, JOBS);
});

test('Cómo usar: lead con tagline', () => {
  const guide = fs.readFileSync(path.join(root, 'views/tabs/como-usar.html'), 'utf8');
  assert.match(guide, PHRASE);
  assert.match(guide, JOBS);
});

test('Onboarding founder + app.js: misma línea de utilidad', () => {
  const foot = fs.readFileSync(path.join(root, 'views/_foot.html'), 'utf8');
  const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  assert.match(foot, PHRASE);
  assert.match(foot, /character_lock/);
  assert.match(app, PHRASE);
  assert.match(app, /utilityLine/);
});
