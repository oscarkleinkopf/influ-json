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

test('Portafolio + Ajustes cablean el switch; CSS oculta nvidia-only por default', () => {
  const dash = fs.readFileSync(path.join(__dirname, '..', 'views', 'tabs', 'dashboard.html'), 'utf8');
  const foot = fs.readFileSync(path.join(__dirname, '..', 'views', '_foot.html'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, '..', 'index.css'), 'utf8');
  const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  const variants = fs.readFileSync(path.join(__dirname, '..', 'variant-vault-ui.js'), 'utf8');

  assert.match(dash, /id="workModeCard"/);
  assert.match(dash, /data-work-mode-btn="chatbots"/);
  assert.match(dash, /data-work-mode-btn="nvidia"/);
  assert.match(dash, /Locally Uncensored/);
  assert.match(foot, /studio-work-mode\.js/);
  assert.match(foot, /data-work-mode-btn="nvidia"/);
  assert.match(server, /studio-work-mode\.js/);
  assert.match(app, /function setupWorkMode/);
  assert.match(css, /data-work-mode="nvidia"/);
  assert.match(css, /\[data-nvidia-only\]/);
  assert.match(variants, /genLocalGpuRequestFlags/);
});
