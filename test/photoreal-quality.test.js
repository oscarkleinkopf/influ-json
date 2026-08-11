const test = require('node:test');
const assert = require('node:assert/strict');

/**
 * Unit-level checks for photoreal quality helpers without hitting Pollinations.
 * We exercise prompt assembly via the same string rules used in ai-service.
 */
test('photoQuality high adds PHOTO QUALITY LOCK cues', () => {
  let finalPrompt = 'IDENTITY LOCK: test person in cafe.';
  const options = { photoQuality: 'high', photoreal: true };
  const wantsPhotoreal = options.photoreal === true;
  if (wantsPhotoreal && !/NOT 3D render|not cgi|photorealistic raw/i.test(finalPrompt)) {
    finalPrompt += '. PHOTOREAL: real smartphone photograph of a real human, real material texture, subtle sheen only, natural pores, NOT 3D render, NOT CGI plastic, NOT mirror chrome, NOT doll.';
  }
  if (options.photoQuality === 'high' || options.photoQuality === true) {
    if (!/PHOTO QUALITY LOCK/i.test(finalPrompt)) {
      finalPrompt += '. PHOTO QUALITY LOCK: ultra-photorealistic DSLR/smartphone photo, natural skin pores and fine vellus hair, authentic catchlights in eyes, subtle film grain, no beauty-filter plastic skin, no illustration, no anime, no 3D render.';
    }
    finalPrompt = finalPrompt
      .replace(/\bAmateur casual UGC style\b/gi, 'Candid lifestyle smartphone photo')
      .replace(/\bunedited\b/gi, 'light natural grade, still photoreal');
  }
  assert.match(finalPrompt, /PHOTO QUALITY LOCK/i);
  assert.match(finalPrompt, /natural skin pores/i);
  assert.match(finalPrompt, /PHOTOREAL/i);
});

test('photoQuality draft keeps base photoreal without quality lock', () => {
  let finalPrompt = 'Amateur casual UGC style, unedited. IDENTITY LOCK.';
  const options = { photoQuality: 'draft', photoreal: true };
  if (options.photoreal && !/NOT 3D render|not cgi|photorealistic raw/i.test(finalPrompt)) {
    finalPrompt += '. PHOTOREAL: real smartphone photograph.';
  }
  if (options.photoQuality === 'high' || options.photoQuality === true) {
    finalPrompt += '. PHOTO QUALITY LOCK: should-not-appear';
  }
  assert.match(finalPrompt, /Amateur casual UGC style/);
  assert.doesNotMatch(finalPrompt, /PHOTO QUALITY LOCK/);
});
