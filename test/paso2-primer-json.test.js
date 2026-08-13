'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

test('paso2 primer JSON: markup data-step2-focus / secondary / banner', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const views = fs.readFileSync(path.join(root, 'views/tabs/persona-engine.html'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'index.css'), 'utf8');
  const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');

  assert.match(views, /id="personaStep2FocusBanner"/);
  assert.match(views, /id="btnStep2FocusExit"/);
  assert.match(views, /Primer JSON/);
  assert.match(views, /data-step2-secondary/);
  assert.match(html, /id="personaStep2FocusBanner"/);
  assert.match(html, /data-step2-secondary/);

  assert.match(css, /data-step2-focus="1"/);
  assert.match(css, /\[data-step2-secondary\]/);
  assert.match(css, /persona-step2-focus-banner/);

  assert.match(app, /function setStep2Focus\b/);
  assert.match(app, /function clearStep2Focus\b/);
  assert.match(app, /step2FocusMode/);
  assert.match(app, /setStep2Focus\(true/);
  assert.match(app, /btnStep2FocusExit/);
  assert.match(app, /window\.setStep2Focus/);
});

test('paso2 primer JSON: panel derecho y pose/UGC son secondary', () => {
  const views = fs.readFileSync(path.join(root, 'views/tabs/persona-engine.html'), 'utf8');
  assert.match(views, /id="personaRightPanel"[^>]*data-step2-secondary|data-step2-secondary[^>]*id="personaRightPanel"/);
  assert.match(views, /id="personaCompiledPromptConsole"[^>]*data-step2-secondary|data-step2-secondary[^>]*id="personaCompiledPromptConsole"/);
  assert.match(views, /id="btnSheetPose"/);
  // Acciones de ficha viven dentro de un bloque secondary
  assert.match(views, /data-step2-secondary[\s\S]{0,200}id="btnSheetPose"/);
});
