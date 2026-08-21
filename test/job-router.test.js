/**
 * Job router — Portafolio: inspirar · chatbot · UGC · producto
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

test('Portafolio: job router markup y cuatro jobs', () => {
  const dash = fs.readFileSync(path.join(root, 'views/tabs/dashboard.html'), 'utf8');
  assert.match(dash, /id="jobRouterCard"/);
  assert.match(dash, /id="jobRouterTitle"/);
  assert.match(dash, /¿Qué quieres hacer\?/);
  assert.match(dash, /Camino A · default · sin GPU/);
  assert.match(dash, /El producto es <strong>Copiar JSON<\/strong>/);
  assert.match(dash, /data-job-router="inspirar"/);
  assert.match(dash, /data-job-router="chatbot"/);
  assert.match(dash, /data-job-router="ugc"/);
  assert.match(dash, /data-job-router="producto"/);
  assert.match(dash, /btnJobInspirar/);
  assert.match(dash, /btnJobChatbot/);
  assert.match(dash, /btnJobUgc/);
  assert.match(dash, /btnJobProducto/);
  const router = dash.slice(dash.indexOf('id="jobRouterCard"'), dash.indexOf('id="workModeCard"'));
  assert.doesNotMatch(router, /LoRA/);
});

test('happyPathLead alineado al router', () => {
  const dash = fs.readFileSync(path.join(root, 'views/tabs/dashboard.html'), 'utf8');
  assert.match(dash, /id="happyPathLead"/);
  assert.match(dash, /Elige un job arriba/);
  assert.match(dash, /Camino A \(default\): Copiar JSON/);
});

test('app.js cablea job router a flujos free', () => {
  const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  assert.match(app, /function setupJobRouter/);
  assert.match(app, /function runJobRouterAction/);
  assert.match(app, /function ensureActivePersonaForJob/);
  assert.match(app, /data-job-router/);
  assert.match(app, /runHappyPathAction\('copy-pack'\)/);
  assert.match(app, /runBriefAction\('ugc'\)/);
  assert.match(app, /runBriefAction\('copy_product'\)/);
  assert.match(app, /btnQuickImportUrl/);
  assert.match(app, /setupJobRouter/);
});

test('CSS: grid job router', () => {
  const css = fs.readFileSync(path.join(root, 'index.css'), 'utf8');
  assert.match(css, /\.job-router-grid/);
  assert.match(css, /\.job-router-btn/);
});
