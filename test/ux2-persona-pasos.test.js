/**
 * UX-2 — Persona Engine en 3 pasos (Identidad / Lock & Packs / Variaciones).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const appJs = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'index.css'), 'utf8');

function personaEngineSlice() {
  const start = html.indexOf('id="persona-engine"');
  const end = html.indexOf('id="script-engine"');
  assert.ok(start >= 0 && end > start);
  return html.slice(start, end);
}

test('UX-2: stepper 1 Identidad / 2 Lock & Packs / 3 Variaciones', () => {
  const pe = personaEngineSlice();
  assert.match(pe, /id="personaStepper"/);
  assert.match(pe, /data-persona-goto="1"/);
  assert.match(pe, /data-persona-goto="2"/);
  assert.match(pe, /data-persona-goto="3"/);
  assert.match(pe, /data-active-step="1"/);
  assert.match(pe, /id="btnPersonaStepNext"/);
  assert.match(appJs, /function setPersonaStep\b/);
  assert.match(appJs, /function setupPersonaSteps\b/);
  assert.match(css, /\.persona-stepper/);
});

test('UX-2: bloques etiquetados por paso', () => {
  const pe = personaEngineSlice();
  assert.match(pe, /data-persona-step="1"[\s\S]{0,80}Añadir Nuevo Influencer|cardCreateScratch/);
  assert.match(pe, /id="personaForm"[^>]*data-persona-step="1"/);
  assert.match(pe, /id="personaProfileSheet"[^>]*data-persona-step="2"|pack-library-card"[^>]*data-persona-step="2"/);
  assert.match(pe, /id="variantManagerSection"[^>]*data-persona-step="3"/);
  assert.match(pe, /id="generationHistorySection"[^>]*data-persona-step="3"/);
  assert.match(pe, /id="facePackPanel"[^>]*data-persona-step="3"/);
});

test('UX-2: identidad pliega escena y marca; avanzado pliega A/B y LoRA', () => {
  const pe = personaEngineSlice();
  assert.match(pe, /id="personaIdentitySceneDetails"/);
  assert.match(pe, /id="personaIdentityBrandDetails"/);
  assert.match(pe, /id="personaIdentityExtraTraits"/);
  assert.match(pe, /id="personaIdentityProfileDetails"/);
  assert.match(pe, /id="personaCreateOptionsCard"/);
  assert.match(pe, /id="personaAdvancedTools"/);
  assert.match(pe, /id="loraAdvancedPanel"[^>]*data-persona-step="advanced"/);
  assert.match(pe, /id="abComparatorContainer"[^>]*data-persona-step="advanced"/);
  assert.match(pe, /id="personaRightPanel"[^>]*data-persona-step="2"|data-persona-step="2"[^>]*id="personaRightPanel"/);
  assert.match(pe, /id="personaCompiledPromptConsole"[^>]*data-persona-step="2"|data-persona-step="2"[^>]*id="personaCompiledPromptConsole"/);
  // Details de identidad no nacen abiertos
  assert.doesNotMatch(pe, /id="personaIdentityExtraTraits"[^>]*\sopen[\s>]/);
  assert.doesNotMatch(pe, /id="personaAdvancedTools"[^>]*\sopen[\s>]/);
  assert.doesNotMatch(pe, /id="loraAdvancedPanel"[^>]*\sopen[\s>]/);
});

test('UX-2: CSS oculta pasos inactivos; crear → paso 1, select → paso 2', () => {
  assert.match(css, /#persona-engine\[data-active-step="1"\] \[data-persona-step="2"\]/);
  assert.match(css, /#persona-engine\[data-active-step="2"\] \[data-persona-step="3"\]/);
  assert.match(css, /data-form-open="1"[\s\S]{0,80}personaCreateOptionsCard/);
  assert.match(css, /data-creating="1"[\s\S]{0,80}data-persona-edit-only/);
  assert.match(appJs, /startCreateScratchFlow[\s\S]{0,800}setPersonaStep\(1/);
  assert.match(appJs, /selectPersona\(persona\)[\s\S]{0,2200}setPersonaStep\(2/);
  assert.match(appJs, /action === 'packs'[\s\S]{0,350}setPersonaStep\(2/);
  // Al cambiar paso se pliegan avanzados
  assert.match(appJs, /#personaAdvancedTools[\s\S]{0,280}d\.open\s*=\s*false/);
  assert.match(appJs, /data-form-open/);
  assert.match(appJs, /resetPersonaFormForNew[\s\S]{0,8000}setPersonaStep\(1/);
});

test('UX-2: campaigns editor-layout no lleva id personaEditorLayout', () => {
  const campStart = html.indexOf('id="campaigns"');
  const campEnd = html.indexOf('id="persona-engine"');
  const camp = html.slice(campStart, campEnd);
  assert.doesNotMatch(camp, /id="personaEditorLayout"/);
  assert.match(html, /id="personaEditorLayout"/);
});
