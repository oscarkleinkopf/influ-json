const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  parseDetailedJSON,
  isRealPersonaObject,
  assembleCharacterLock,
  buildIdentityLockBlock,
  resolveSkinForPrompt,
  buildPromptFromAnalysis,
  buildFormPrompt,
  detectVariantFraming,
  buildVariantPrompt,
  buildChatbotExportTextFromPersona
} = require('../prompt-builder');

test('parseDetailedJSON unwraps double-encoded string', () => {
  const inner = { identity: { name: 'Luna' }, facial_features: { skin_tone: 'Piel clara' } };
  const once = JSON.stringify(inner);
  const twice = JSON.stringify(once);
  assert.equal(parseDetailedJSON(twice).identity.name, 'Luna');
  assert.deepEqual(parseDetailedJSON(null), {});
  assert.deepEqual(parseDetailedJSON(''), {});
});

test('parseDetailedJSON recovers char-index corruption', () => {
  const s = JSON.stringify({ identity: { name: 'Ada' }, hair: { color: 'negro' } });
  const corrupt = {};
  for (let i = 0; i < s.length; i++) corrupt[String(i)] = s[i];
  const recovered = parseDetailedJSON(corrupt);
  assert.equal(recovered.identity.name, 'Ada');
  assert.equal(recovered.hair.color, 'negro');
});

test('isRealPersonaObject rejects char-maps and empties', () => {
  assert.equal(isRealPersonaObject(null), false);
  assert.equal(isRealPersonaObject([]), false);
  assert.equal(isRealPersonaObject({}), false);
  assert.equal(isRealPersonaObject({ identity: { name: 'X' } }), true);
  const corrupt = {};
  for (let i = 0; i < 50; i++) corrupt[String(i)] = '{';
  assert.equal(isRealPersonaObject(corrupt), false);
});

test('assembleCharacterLock fija must_match y free_tier', () => {
  const base = {
    identity: { name: 'Sol', gender: 'Female', apparent_age: '24', ethnicity_appearance: 'Latina' },
    facial_features: { face_shape: 'Ovalada', skin_tone: 'Piel clara', skin_tone_hex: '#f0d5c0', eye_color: 'Marrón' },
    hair: { color: 'Castaño', texture: 'Ondulado', length: 'Largo' },
    body: { body_type: 'Atlético', height_appearance: '1.65', proportions: 'equilibradas' },
    generation_prompt: 'DROP ME',
    anchor_reference: 'DROP ME TOO'
  };
  const out = assembleCharacterLock(base, { nicheId: 'beauty' });
  assert.equal(out.character_lock.free_tier, true);
  assert.equal(out.character_lock.version, 1);
  assert.equal(out.character_lock.niche, 'beauty');
  assert.equal(out.character_lock.must_match_every_image.name, 'Sol');
  assert.equal(out.character_lock.must_match_every_image.skin_tone_hex, '#f0d5c0');
  assert.ok(out.character_lock.may_vary_per_image.includes('pose'));
  assert.equal(out.generation_prompt, undefined);
  assert.equal(out.anchor_reference, undefined);
  assert.match(out.character_lock.free_chatbot_system, /Piel clara/);
});

test('assembleCharacterLock enriquece nicheExtras', () => {
  const base = {
    identity: { name: 'Nia' },
    facial_features: { skin_tone: 'clara' },
    hair: {},
    body: {}
  };
  assembleCharacterLock(base, {
    nicheExtras: {
      id: 'skincare',
      label: 'Skincare',
      lockExtras: {
        niche: 'skincare',
        brand_voice: 'cálida',
        recommended_packs: ['fullbody']
      }
    }
  });
  assert.equal(base.character_lock.brand_voice, 'cálida');
  assert.equal(base.niche, 'skincare');
  assert.equal(base.brand_niche, 'Skincare');
});

test('resolveSkinForPrompt no confía en Tono Natural si hay clara guardada', () => {
  const skin = resolveSkinForPrompt(
    { facial_features: { skin_tone: 'Tono Natural' } },
    {
      detailedJSON: JSON.stringify({
        facial_features: { skin_tone: 'Piel clara', skin_tone_hex: '#f0d5c0' }
      })
    }
  );
  assert.match(skin.tone, /clara/i);
  assert.equal(skin.hex, '#f0d5c0');
  assert.equal(skin.isLight, true);
  assert.ok(skin.lock);
});

test('resolveSkinForPrompt clasifica band por hex', () => {
  const dark = resolveSkinForPrompt(
    { facial_features: { skin_tone_hex: '#5a3a28' } },
    {}
  );
  assert.equal(dark.isLight, false);
  assert.ok(['medium_dark', 'dark'].includes(dark.band));
});

test('buildIdentityLockBlock marca latina + tez clara', () => {
  const id = buildIdentityLockBlock(
    { name: 'Luna', gender: 'Female', ethnicity: 'Latina', age: '25 años' },
    {
      identity: { apparent_age: '25 años', ethnicity_appearance: 'Latina' },
      facial_features: { face_shape: 'Ovalada', eye_color: 'Marrón', lips: 'Labios rosados' },
      hair: { color: 'Negro', texture: 'Liso', length: 'Largo' },
      body: { body_type: 'Atlético' }
    },
    { tone: 'Piel clara', hex: '#f0d5c0', lock: 'fair', avoid: 'dark', isLight: true }
  );
  assert.match(id.ethnicity, /tez clara/i);
  assert.equal(id.genderWord, 'female');
  assert.match(id.faceBits, /Ovalada/);
  assert.match(id.skinClause, /#f0d5c0/);
});

test('buildPromptFromAnalysis incluye SKIN LOCK y cuerpo', () => {
  const prompt = buildPromptFromAnalysis({
    identity: { name: 'Mia', apparent_age: '23', gender: 'female', ethnicity_appearance: 'Latina' },
    facial_features: { skin_tone: 'Piel clara', skin_tone_hex: '#f0d5c0', eye_color: 'verdes', face_shape: 'ovalada', eyebrow_style: 'natural', lip_shape: 'llenos' },
    hair: { color: 'castaño', texture: 'ondulado', color_hex: '#6b4423' },
    body: { body_type: 'atlético', proportions: 'equilibradas' },
    clothing: { type: 'camiseta', color: 'blanco' },
    photography: { camera_lens: 'iPhone', background_setting: 'café', lighting_type: 'ventana' }
  });
  assert.match(prompt, /SKIN LOCK/);
  assert.match(prompt, /#f0d5c0/);
  assert.match(prompt, /tez clara/);
  assert.match(prompt, /atlético/);
  assert.match(prompt, /#6b4423/);
});

test('buildFormPrompt anti-sesgo Latina + piel clara', () => {
  const prompt = buildFormPrompt({
    age: '24',
    ethnicity: 'Latina',
    gender: 'Female',
    skinTone: 'Piel clara',
    skinHex: '#f0d5c0',
    hairColor: 'Castaño',
    hairTexture: 'Ondulado',
    hairLength: 'Largo',
    eyeColor: 'Marrón',
    eyebrows: 'naturales',
    lips: 'rosados',
    faceShape: 'Ovalada',
    smileType: 'Natural',
    bodyType: 'Atlético',
    camera: 'iPhone',
    clothing: 'jeans',
    setting: 'estudio',
    lighting: 'luz natural'
  });
  assert.match(prompt, /tez clara/);
  assert.match(prompt, /NOT dark skin/);
  assert.match(prompt, /SKIN LOCK/);
});

test('detectVariantFraming reconoce fullbody y portrait', () => {
  assert.equal(detectVariantFraming('cuerpo entero de pie'), 'fullbody');
  assert.equal(detectVariantFraming('head-to-toe walking'), 'fullbody');
  assert.equal(detectVariantFraming('close-up selfie portrait'), 'portrait');
  assert.equal(detectVariantFraming('sentada en sofá sonriendo'), 'medium');
});

test('buildVariantPrompt antepone framing y IDENTITY LOCK', () => {
  const id = {
    name: 'Luna',
    age: '25',
    ethnicity: 'Latina de tez clara',
    genderWord: 'female',
    faceBits: 'oval face',
    hairBits: 'brown wavy',
    hairHex: '',
    bodyBits: 'athletic',
    skinClause: 'Piel clara skin'
  };
  const prompt = buildVariantPrompt({
    id,
    skin: { tone: 'Piel clara', hex: '#f0d5c0' },
    pose: 'cuerpo entero de pie',
    attitude: 'confiada',
    clothing: 'bikini',
    setting: 'playa',
    framing: 'fullbody'
  });
  assert.match(prompt, /^FULL BODY PHOTO/);
  assert.match(prompt, /IDENTITY LOCK/);
  assert.match(prompt, /SKIN LOCK: Piel clara #f0d5c0/);
  assert.match(prompt, /natural outdoor daylight/);
  assert.match(prompt, /head to toe/);
});

test('buildChatbotExportTextFromPersona incluye character_lock', () => {
  const persona = assembleCharacterLock({
    identity: { name: 'Eva', gender: 'Female', apparent_age: '26', ethnicity_appearance: 'Mixta' },
    facial_features: { skin_tone: 'clara', face_shape: 'oval', eye_color: 'café', lips: 'naturales', eyebrow_style: 'arched' },
    hair: { color: 'negro', texture: 'liso', length: 'medio' },
    body: { body_type: 'slim' },
    personality: { mbti: 'ENFP', communication_style: 'cálida', taboos: ['política'] }
  });
  const text = buildChatbotExportTextFromPersona(persona, {
    includePrompt: true,
    promptText: 'test prompt here',
    includeProduct: true,
    productData: { name: 'Serum X', benefit: 'brillo', audience: '25-35', frustration: 'opacidad' }
  });
  assert.match(text, /CHARACTER LOCK/);
  assert.match(text, /Eva/);
  assert.match(text, /Serum X/);
  assert.match(text, /test prompt here/);
  assert.match(text, /cero costo|CERO COSTO/i);
});

test('index.html carga prompt-builder.js antes de app.js', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const iPb = html.indexOf('prompt-builder.js');
  const iApp = html.indexOf('app.js?v=');
  assert.ok(iPb > 0);
  assert.ok(iApp > iPb);
});

test('app.js delega a InfluPromptBuilder', () => {
  const js = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  assert.match(js, /window\.InfluPromptBuilder|_promptBuilder\(\)/);
  assert.match(js, /assembleCharacterLock/);
  assert.match(js, /buildVariantPrompt/);
  assert.doesNotMatch(js, /free_chatbot_system: `Eres un generador de UGC/);
});

test('server.js sirve /prompt-builder.js', () => {
  const js = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert.match(js, /\/prompt-builder\.js/);
});
