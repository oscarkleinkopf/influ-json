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

test('L4 docs: carpeta models/loras para LU/Comfy', () => {
  const md = fs.readFileSync(path.join(root, 'docs/lora/L4_LOCAL_GPU.md'), 'utf8');
  assert.match(md, /Dónde poner el `\.safetensors` \(Locally Uncensored\)/);
  assert.match(md, /ComfyUI\/models\/loras/);
  assert.match(md, /models\/Lora/);
  assert.match(md, /COMFYUI_LORAS_DIR/);
  assert.match(md, /Flux LoRA = solo Colab L1/);
  assert.match(md, /Chatbots gratis/);
});

test('L2 apunta a companion L4', () => {
  const md = fs.readFileSync(path.join(root, 'docs/lora/L2_COMFYUI.md'), 'utf8');
  assert.match(md, /locally-uncensored/);
  assert.match(md, /Dónde poner el `\.safetensors`/);
});

test('L5 apunta Kohya SDXL en G513R; Flux sigue Colab L1', () => {
  const md = fs.readFileSync(path.join(root, 'docs/lora/L5_LOCAL_TRAIN.md'), 'utf8');
  assert.match(md, /Kohya/);
  assert.match(md, /Flux se entrena solo en Colab L1/);
  assert.match(md, /models\/loras/);
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
