/**
 * L4 companion: Locally Uncensored / ComfyUI hint — no fork, JSON first.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

test('L4 docs: companion LU sin integrar código', () => {
  const md = fs.readFileSync(path.join(root, 'docs/lora/L4_LOCAL_GPU.md'), 'utf8');
  assert.match(md, /Companion: Locally Uncensored/);
  assert.match(md, /PurpleDoubleD\/locally-uncensored/);
  assert.match(md, /No se integra en el Studio/);
  assert.match(md, /producto sigue siendo el JSON/);
  assert.match(md, /AGPL-3\.0/);
});

test('L2 apunta a companion L4', () => {
  const md = fs.readFileSync(path.join(root, 'docs/lora/L2_COMFYUI.md'), 'utf8');
  assert.match(md, /locally-uncensored/);
});

test('ficha GPU: hint companion + estados en app.js', () => {
  const pe = fs.readFileSync(path.join(root, 'views/tabs/persona-engine.html'), 'utf8');
  const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  assert.match(pe, /id="localGpuCompanionHint"/);
  assert.match(pe, /locally-uncensored/);
  assert.match(app, /function updateLocalGpuCompanionHint/);
  assert.match(app, /ComfyUI detectado \(online\)/);
  assert.match(app, /ComfyUI configurado pero offline/);
});
