/**
 * UX · dos caminos claros: Copiar JSON (Camino A, default) vs GPU NVIDIA (Camino B).
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const mode = require('../studio-work-mode');

function read(...parts) {
  return fs.readFileSync(path.join(root, ...parts), 'utf8');
}

function sliceBetween(src, startNeedle, endNeedle) {
  const start = src.indexOf(startNeedle);
  const end = src.indexOf(endNeedle);
  assert.ok(start >= 0 && end > start, `slice ${startNeedle} → ${endNeedle}`);
  return src.slice(start, end);
}

test('default de trabajo es chatbots (Camino A), no NVIDIA', () => {
  assert.equal(mode.CHATBOTS, 'chatbots');
  assert.equal(mode.getWorkMode(null), 'chatbots');
  assert.equal(mode.normalize(undefined), 'chatbots');
  assert.equal(mode.normalize(''), 'chatbots');
  assert.equal(mode.normalize('nvidia'), 'nvidia');
  const flags = mode.genLocalGpuFlags({ getItem: () => null });
  assert.equal(flags.preferLocalGpu, false);
  assert.equal(flags.forceLocalGpu, false);
});

test('Portafolio: Camino A vs Camino B inequívocos; LoRA no se promociona en el router', () => {
  const dash = read('views', 'tabs', 'dashboard.html');
  assert.match(dash, /id="jobRouterCard"/);
  assert.match(dash, /id="workModeCard"/);
  assert.match(dash, /Dos caminos/);
  assert.match(dash, /Camino A/);
  assert.match(dash, /Camino B/);
  assert.match(dash, /Copiar JSON es el producto/);
  assert.match(dash, /GPU NVIDIA \/ LoRA es un segundo camino opt-in/);

  const router = sliceBetween(dash, 'id="jobRouterCard"', 'id="workModeCard"');
  assert.match(router, /Camino A · default · sin GPU/);
  assert.match(router, /Copiar JSON/);
  assert.doesNotMatch(router, /LoRA/);
  assert.doesNotMatch(router, /G513R/);

  const work = sliceBetween(dash, 'id="workModeCard"', 'id="quickCreateCard"');
  assert.match(work, /Camino A<\/strong> \(default\): Copiar JSON/);
  assert.match(work, /Camino B<\/strong>: GPU NVIDIA local/);
  assert.doesNotMatch(work, /LoRA/);
  assert.match(work, /data-work-mode-btn="chatbots"/);
  assert.match(work, /data-work-mode-btn="nvidia"/);
  assert.match(work, /is-active/);
});

test('Cómo usar + founder + happy-path: Copiar JSON es el producto', () => {
  const guide = read('views', 'tabs', 'como-usar.html');
  const foot = read('views', '_foot.html');
  const app = read('app.js');
  const dash = read('views', 'tabs', 'dashboard.html');
  const TWO = /El producto es Copiar JSON;\s*GPU NVIDIA \/ LoRA es un segundo camino opt-in/;

  assert.match(guide, TWO);
  assert.match(foot, TWO);
  assert.match(app, TWO);
  assert.match(dash, /id="happyPathLead"[^>]*>Camino A \(default\): Copiar JSON/);
  assert.match(dash, /GPU NVIDIA \/ LoRA es Camino B/);
});

test('HTML arranca en chatbots; LoRA / G513R son data-nvidia-only', () => {
  const head = read('views', '_head.html');
  const pe = read('views', 'tabs', 'persona-engine.html');
  const css = read('index.css');

  assert.match(head, /<html lang="es" data-work-mode="chatbots">/);
  assert.match(pe, /id="loraAdvancedPanel"[^>]*data-nvidia-only|data-nvidia-only[^>]*id="loraAdvancedPanel"/);
  assert.match(pe, /id="btnCopyG513rRecipe"[^>]*data-nvidia-only|data-nvidia-only[^>]*id="btnCopyG513rRecipe"/);
  assert.match(css, /html:not\(\[data-work-mode="nvidia"\]\) \[data-nvidia-only\]/);
});
