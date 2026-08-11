/**
 * Setting del vault (hotel/bedroom) debe ganar sobre playa / bikini drift.
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  extractRequestedSetting,
  isIndoorSettingText,
  buildRequestedSettingPrefix,
  promptImpliesBeachSetting
} = require('../ai-service');

const hotel = 'luxury hotel bedroom, warm practical lighting, real architecture (photoreal hotel boudoir)';
const latexPrompt =
  `Background/location: ${hotel}. `
  + 'Wearing: passion red latex catsuit. Photorealistic amateur UGC smartphone photo.';

test('extractRequestedSetting: options.setting gana', () => {
  assert.equal(
    extractRequestedSetting('Background/location: other.', { setting: hotel }),
    hotel
  );
});

test('extractRequestedSetting: parsea Background/location', () => {
  assert.equal(extractRequestedSetting(latexPrompt, {}), hotel);
});

test('buildRequestedSettingPrefix indoor: NOT beach + SCENE', () => {
  const prefix = buildRequestedSettingPrefix(hotel);
  assert.match(prefix, /INDOOR SETTING LOCK/i);
  assert.match(prefix, /NOT beach/i);
  assert.match(prefix, /NOT ocean/i);
  assert.equal(promptImpliesBeachSetting(prefix), false);
});

test('isIndoorSettingText: hotel/bedroom/penthouse', () => {
  assert.equal(isIndoorSettingText(hotel), true);
  assert.equal(isIndoorSettingText('modern bedroom at night'), true);
  assert.equal(isIndoorSettingText('sunny tropical beach'), false);
});

test('ai-service generate path: settingPrefix sobrevive y no fuerza playa', () => {
  // Simula el orden: clean → latex outfit lock → setting prefix
  let finalPrompt = latexPrompt;
  const requested = extractRequestedSetting(finalPrompt, { setting: hotel });
  finalPrompt = finalPrompt
    .replace(/OUTDOOR SUNNY BEACH PHOTOGRAPH[^.]*\./gi, '')
    .replace(/SETTING LOCK \(critical\):[^.]*\./gi, '');
  if (/latex|látex|catsuit/i.test(finalPrompt)) {
    finalPrompt += ' OUTFIT LOCK: keep the described latex/catsuit outfit; NOT bikini, NOT swimsuit, NOT beachwear.';
  }
  const settingPrefix = buildRequestedSettingPrefix(requested);
  finalPrompt = `${settingPrefix}${finalPrompt}`;

  assert.match(finalPrompt, /INDOOR SETTING LOCK/i);
  assert.match(finalPrompt, /OUTFIT LOCK:.*latex/i);
  assert.doesNotMatch(finalPrompt, /OUTDOOR SUNNY TROPICAL BEACH/);
  assert.equal(promptImpliesBeachSetting(hotel), false);
});
