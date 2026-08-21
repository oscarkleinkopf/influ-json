/**
 * Modo de trabajo: chatbots (default, sin GPU) vs NVIDIA local (G513R).
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const mode = require('../studio-work-mode');

function memStore(seed) {
  const mem = new Map(seed ? Object.entries(seed) : []);
  return {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => { mem.set(k, String(v)); },
    removeItem: (k) => { mem.delete(k); }
  };
}

test('applyWorkModeToDocument marca html (una sola fuente CSS)', () => {
  const fakeBtns = [];
  const html = {
    setAttribute(k, v) { this[k] = v; },
    classList: { toggle() {} }
  };
  const body = {
    setAttribute(k, v) { this[k] = v; },
    classList: { toggle() {} }
  };
  const doc = {
    documentElement: html,
    body,
    querySelectorAll: () => fakeBtns,
    getElementById: () => null
  };
  mode.applyWorkModeToDocument('nvidia', doc);
  assert.equal(html['data-work-mode'], 'nvidia');
  assert.equal(body['data-work-mode'], 'nvidia');
});

test('default es chatbots; nvidia es opt-in', () => {
  const s = memStore();
  assert.equal(mode.getWorkMode(s), 'chatbots');
  assert.equal(mode.isChatbots(s), true);
  assert.equal(mode.isNvidia(s), false);
  const flagsOff = mode.genLocalGpuFlags(s);
  assert.equal(flagsOff.preferLocalGpu, false);
  assert.equal(flagsOff.forceLocalGpu, false);

  assert.equal(mode.setWorkMode('nvidia', s), 'nvidia');
  assert.equal(mode.isNvidia(s), true);
  const flagsOn = mode.genLocalGpuFlags(s);
  assert.equal(flagsOn.preferLocalGpu, true);
  assert.equal(flagsOn.forceLocalGpu, true);

  assert.equal(mode.setWorkMode('nope', s), 'chatbots');
});

test('etiquetas Camino A / Camino B; status default chatbots', () => {
  assert.match(mode.MODES.chatbots.label, /Camino A/);
  assert.match(mode.MODES.nvidia.label, /Camino B/);
  const status = { textContent: '' };
  const doc = {
    documentElement: { setAttribute() {}, classList: { toggle() {} } },
    body: { setAttribute() {}, classList: { toggle() {} } },
    querySelectorAll: () => [],
    getElementById: (id) => (id === 'workModeStatus' ? status : null)
  };
  mode.applyWorkModeToDocument('chatbots', doc);
  assert.match(status.textContent, /Camino A/);
  assert.match(status.textContent, /Copiar JSON/);
  mode.applyWorkModeToDocument('nvidia', doc);
  assert.match(status.textContent, /Camino B/);
});

test('Portafolio + Ajustes cablean el switch; CSS oculta nvidia-only por default', () => {
  const dash = fs.readFileSync(path.join(__dirname, '..', 'views', 'tabs', 'dashboard.html'), 'utf8');
  const foot = fs.readFileSync(path.join(__dirname, '..', 'views', '_foot.html'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, '..', 'index.css'), 'utf8');
  const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  const variants = fs.readFileSync(path.join(__dirname, '..', 'variant-vault-ui.js'), 'utf8');

  assert.match(dash, /id="workModeCard"/);
  assert.match(dash, /Dos caminos/);
  assert.match(dash, /Camino A/);
  assert.match(dash, /Camino B/);
  assert.match(dash, /data-work-mode-btn="chatbots"/);
  assert.match(dash, /data-work-mode-btn="nvidia"/);
  assert.match(dash, /Locally Uncensored/);
  assert.match(foot, /studio-work-mode\.js/);
  assert.match(foot, /data-work-mode-btn="nvidia"/);
  assert.match(server, /studio-work-mode\.js/);
  assert.match(app, /function setupWorkMode/);
  assert.match(css, /data-work-mode="nvidia"/);
  assert.match(css, /\[data-nvidia-only\]/);
  assert.doesNotMatch(css, /body:not\(\[data-work-mode="nvidia"\]\)/);
  assert.match(variants, /genLocalGpuRequestFlags/);
});
