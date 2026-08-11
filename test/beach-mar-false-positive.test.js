/**
 * Falso positivo /mar/ dentro de "smartphone" forzaba playa en spicy látex.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  promptImpliesBeachSetting,
  promptHasExplicitIndoorSetting
} = require('../ai-service');

const spicyLatexBedroom =
  'FULL BODY PHOTOGRAPH, head-to-toe shot. '
  + 'Pose: standing. Wearing: passion red latex catsuit with subtle sheen. '
  + 'Background/location: modern bedroom at night with soft warm bedside lamps. '
  + 'Photorealistic amateur UGC smartphone photo, real fabric, natural skin pores, raw unedited iPhone look.';

test('smartphone + dormitorio látex NO implica playa', () => {
  assert.equal(promptImpliesBeachSetting(spicyLatexBedroom), false);
  assert.equal(promptHasExplicitIndoorSetting(spicyLatexBedroom), true);
});

test('playa / beach / ocean / mar (palabra) SÍ implica playa', () => {
  assert.equal(promptImpliesBeachSetting('Background/location: sunny tropical beach.'), true);
  assert.equal(promptImpliesBeachSetting('foto en la playa al mediodía'), true);
  assert.equal(promptImpliesBeachSetting('standing by the ocean shoreline'), true);
  assert.equal(promptImpliesBeachSetting('vista al mar caribe'), true);
  assert.equal(promptImpliesBeachSetting('costa mediterránea'), true);
});

test('no falso positivo: camara, primary, acostada', () => {
  assert.equal(promptImpliesBeachSetting('camara digital primary color'), false);
  assert.equal(promptImpliesBeachSetting('mujer acostada en el sofá del boudoir'), false);
});

test('indoor explícito gana sobre señales ambiguas', () => {
  const mixed = 'Background/location: modern bedroom at night. smartphone photo near a pool toy.';
  // "pool" is a real beach/pool token — but explicit indoor Background/location should block override
  assert.equal(promptHasExplicitIndoorSetting(mixed), true);
});

test('ai-service ya no usa /mar/ suelto en detección de playa', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'ai-service.js'), 'utf8');
  assert.match(src, /function promptImpliesBeachSetting/);
  // Old buggy pattern must not remain as active beach detector
  assert.doesNotMatch(src, /\/playa\|beach\|mar\|ocean\|seaside\|costa\|shore\|piscina\|pool\/i/);
  assert.match(src, /promptImpliesBeachSetting\(finalPrompt\)/);
  assert.match(src, /promptImpliesBeachSetting\(fullText\)/);
});

test('prompt-builder variant siempre incluye smartphone (regresión del bug)', () => {
  const pb = require('../prompt-builder');
  const text = pb.buildVariantPrompt({
    id: 'Colorina',
    skin: 'light olive',
    pose: 'standing',
    attitude: 'confident',
    clothing: 'passion red latex catsuit',
    setting: 'modern bedroom at night',
    framing: 'fullbody',
    hairFallback: 'dark brown'
  });
  assert.match(text, /smartphone/i);
  assert.match(text, /Background\/location:\s*modern bedroom/i);
  assert.equal(promptImpliesBeachSetting(text), false);
});
