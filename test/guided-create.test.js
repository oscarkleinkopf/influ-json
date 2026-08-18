/**
 * Acciones rápidas del dashboard: URL / foto / crear a mano.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

test('dashboard tiene las tres acciones rápidas con IDs pedidos', () => {
  const dash = fs.readFileSync(path.join(root, 'views/tabs/dashboard.html'), 'utf8');
  assert.match(dash, /id="quickCreateCard"/);
  assert.match(dash, /id="btnQuickImportUrl"/);
  assert.match(dash, /id="btnQuickImportPhoto"/);
  assert.match(dash, /id="btnQuickManualPersona"/);
  assert.match(dash, /Analizar una URL/);
  assert.match(dash, /Analizar una imagen/);
  assert.match(dash, /Crear influencer manualmente/);
  assert.match(dash, /1 Origen/);
  assert.match(dash, /5 Guardar/);
  assert.match(dash, /Puedes pegar la URL de un perfil público o una imagen directa para generar el JSON automáticamente/);
});

test('app.js cablea acciones rápidas al flujo de import/crear', () => {
  const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  assert.match(app, /function setupQuickCreateActions/);
  assert.match(app, /btnQuickImportUrl/);
  assert.match(app, /btnQuickImportPhoto/);
  assert.match(app, /btnQuickManualPersona/);
  assert.match(app, /startImportFlow\(\{ mode: 'url' \}\)/);
  assert.match(app, /startImportFlow\(\{ mode: 'photo' \}\)/);
  assert.match(app, /mode = 'all'/);
  assert.match(app, /window\.__importModalCtl/);
  assert.match(app, /openModal\(\{ mode \}\)/);
  assert.match(app, /function startCreateScratchFlow[\s\S]*getElementById\('pName'\)/);
  assert.match(app, /focusManualName/);
});

test('index compuesto incluye acciones rápidas y JSON review', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.match(html, /id="btnQuickImportUrl"/);
  assert.match(html, /id="btnQuickImportPhoto"/);
  assert.match(html, /id="btnQuickManualPersona"/);
  assert.match(html, /id="btnOpenImportInEditor"/);
  assert.match(html, /id="importJsonReview"/);
  assert.match(html, /id="importUrlHint"/);
  assert.match(html, /class="import-file-input"/);
  assert.match(html, /id="importImages"/);
});
