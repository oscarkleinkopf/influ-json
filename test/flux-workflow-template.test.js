'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const fluxPath = path.join(root, 'docs/lora/comfy_workflow_flux_lora.json');

test('L4c: plantilla Flux existe y es JSON válido con placeholders', () => {
  assert.ok(fs.existsSync(fluxPath));
  const raw = fs.readFileSync(fluxPath, 'utf8');
  const obj = JSON.parse(raw);
  assert.ok(obj['6'] || obj[6]);
  assert.match(raw, /\{\{PROMPT\}\}/);
  assert.match(raw, /\{\{LORA\}\}/);
  assert.match(raw, /\{\{LORA_STRENGTH\}\}/);
  assert.match(raw, /\{\{SEED\}\}/);
  assert.match(raw, /\{\{WIDTH\}\}/);
  assert.match(raw, /\{\{HEIGHT\}\}/);
  assert.match(raw, /\{\{CHECKPOINT\}\}/);
  assert.match(raw, /LoraLoaderModelOnly|LoraLoader/);
  assert.match(raw, /UNETLoader|CheckpointLoaderSimple/);
});

test('L4c: applyWorkflowTemplate sustituye placeholders Flux', () => {
  const comfy = require('../comfyui-client');
  const template = JSON.parse(fs.readFileSync(fluxPath, 'utf8'));
  delete template._meta;
  const out = comfy.applyWorkflowTemplate(template, {
    PROMPT: 'ohwx_demo portrait',
    NEGATIVE: 'blurry',
    LORA: 'demo.safetensors',
    LORA_STRENGTH: 0.8,
    SEED: 42,
    WIDTH: 1024,
    HEIGHT: 1024,
    CHECKPOINT: 'flux1-dev.safetensors'
  });
  const encode = out['6'];
  assert.equal(encode.inputs.text, 'ohwx_demo portrait');
  assert.equal(out['13'].inputs.lora_name, 'demo.safetensors');
  assert.equal(String(out['13'].inputs.strength_model), '0.8');
  assert.equal(out['12'].inputs.unet_name, 'flux1-dev.safetensors');
  assert.equal(String(out['25'].inputs.noise_seed), '42');
});

test('L4c docs referenciados desde L2/L4/.env.example', () => {
  const l2 = fs.readFileSync(path.join(root, 'docs/lora/L2_COMFYUI.md'), 'utf8');
  const l4 = fs.readFileSync(path.join(root, 'docs/lora/L4_LOCAL_GPU.md'), 'utf8');
  const env = fs.readFileSync(path.join(root, '.env.example'), 'utf8');
  assert.match(l2, /comfy_workflow_flux_lora\.json/);
  assert.match(l4, /L4C_FLUX_WORKFLOW|comfy_workflow_flux_lora/);
  assert.match(env, /comfy_workflow_flux_lora\.json/);
  assert.ok(fs.existsSync(path.join(root, 'docs/lora/L4C_FLUX_WORKFLOW.md')));
});
