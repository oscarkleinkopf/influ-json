const test = require('node:test');
const assert = require('node:assert/strict');
const aiService = require('../ai-service');
const pb = require('../prompt-builder');

test('resolveFraming: explicit medium wins even if prompt says "full body"', () => {
  const prompt =
    'Medium shot. Avoid: accidental close-up portrait when full body requested.';
  assert.equal(
    aiService.resolveFraming({ framing: 'medium' }, prompt),
    'medium'
  );
});

test('resolveFraming: explicit portrait wins over fullbody keywords', () => {
  assert.equal(
    aiService.resolveFraming({ framing: 'portrait' }, 'FULL BODY PHOTOGRAPH standing full-body'),
    'portrait'
  );
});

test('resolveFraming: without explicit framing, fullbody keywords still detect', () => {
  assert.equal(
    aiService.resolveFraming({}, 'standing full-body confident pose'),
    'fullbody'
  );
});

test('buildVariantPrompt medium spicy does not poison framing via Avoid: full body', () => {
  const prompt = pb.buildVariantPrompt({
    id: {
      name: 'Testa',
      age: 25,
      ethnicity: 'Latina',
      genderWord: 'woman',
      faceBits: 'oval face',
      hairBits: 'dark hair',
      hairHex: '',
      skinClause: 'warm tan',
      bodyBits: 'athletic'
    },
    skin: { tone: 'warm tan', hex: '#c68642' },
    pose: 'looking over the shoulder toward camera',
    attitude: 'subtle seductive expression',
    clothing: 'red lace lingerie',
    setting: 'luxury hotel bedroom',
    framing: 'medium'
  });
  assert.doesNotMatch(prompt, /when full body requested/i);
  assert.equal(
    aiService.resolveFraming({ framing: 'medium' }, prompt),
    'medium'
  );
});

test('buildVariantPrompt fullbody still asks for head-to-toe (not medium)', () => {
  const prompt = pb.buildVariantPrompt({
    id: { name: 'Testa', age: 25, ethnicity: 'Latina', genderWord: 'woman', skinClause: 'tan' },
    skin: { tone: 'tan', hex: '' },
    pose: 'standing full-body confident pose',
    attitude: 'confident',
    clothing: 'latex catsuit',
    setting: 'hotel bedroom',
    framing: 'fullbody'
  });
  assert.match(prompt, /FULL BODY PHOTO|head to toe|head-to-toe/i);
  assert.equal(aiService.resolveFraming({ framing: 'fullbody' }, prompt), 'fullbody');
});
