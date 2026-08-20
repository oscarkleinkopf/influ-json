const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('path');

const {
  assembleCharacterLock,
  buildIdentityLockBlock,
  buildVariantPrompt,
  buildChatbotExportTextFromPersona,
  REALISM_ANCHORS_BLOCK,
  STANDARD_NEGATIVE_PROMPT
} = require('../prompt-builder.js');

const { buildFreeChatbotPack, synthesizeCharacterLock } = require('../chatbot-packs.js');

test('assembleCharacterLock incluye facial_asymmetry y distinctive_marks en must_match', () => {
  const base = {
    identity: { name: 'Lila', gender: 'Female', apparent_age: '22 años', ethnicity_appearance: 'Swedish' },
    facial_features: {
      face_shape: 'oval',
      eye_color: 'blue-grey',
      skin_tone: 'fair',
      skin_tone_hex: '#F8C4AE',
      facial_asymmetry: 'left eye 2% smaller',
      distinctive_marks: 'mole below right jaw'
    },
    hair: { color: 'golden blonde', texture: 'wave', length: 'mid-chest' },
    body: { body_type: 'slim' }
  };
  assembleCharacterLock(base);
  const must = base.character_lock.must_match_every_image;
  assert.equal(must.facial_asymmetry, 'left eye 2% smaller');
  assert.equal(must.distinctive_marks, 'mole below right jaw');
  assert.match(base.character_lock.free_chatbot_system, /Asimetr/i);
  assert.match(base.character_lock.free_chatbot_system, /Marcas/i);
  assert.ok(base.character_lock.never_do.some((x) => /asimetr|marcas/i.test(x)));
});

test('buildIdentityLockBlock + buildVariantPrompt inyectan asimetría, marcas y realism anchors', () => {
  const detailed = {
    identity: { name: 'Lila', apparent_age: '22', ethnicity_appearance: 'Swedish' },
    facial_features: {
      face_shape: 'oval',
      eye_color: 'blue',
      facial_asymmetry: 'left eye 2% smaller',
      distinctive_marks: 'mole below right jaw'
    },
    hair: { color: 'blonde' },
    body: { body_type: 'slim' }
  };
  const id = buildIdentityLockBlock({ name: 'Lila', gender: 'Female' }, detailed, {
    tone: 'fair',
    hex: '#F8C4AE',
    isLight: true
  });
  assert.match(id.faceBits, /facial asymmetry/);
  assert.match(id.faceBits, /distinguishing marks/);
  const prompt = buildVariantPrompt({
    id,
    skin: { tone: 'fair', hex: '#F8C4AE' },
    pose: 'standing casual',
    attitude: 'relaxed smile',
    clothing: 'cream knit',
    setting: 'beach golden hour',
    framing: 'medium'
  });
  assert.match(prompt, /Asymmetry lock/);
  assert.match(prompt, /Distinguishing marks/);
  assert.match(prompt, /visible skin pores/);
  assert.match(prompt, /plastic skin/);
  assert.ok(prompt.includes(REALISM_ANCHORS_BLOCK.slice(0, 40)));
  assert.ok(prompt.includes(STANDARD_NEGATIVE_PROMPT.slice(0, 30)));
});

test('export chatbot incluye REALISMO + NEGATIVE + asimetría', () => {
  const persona = {
    identity: { name: 'Lila' },
    facial_features: {
      distinctive_marks: 'mole below right jaw',
      facial_asymmetry: 'left eye 2% smaller',
      skin_tone: 'fair',
      skin_tone_hex: '#F8C4AE'
    },
    personality: { mbti: 'ENFP', communication_style: 'warm', taboos: [] },
    character_lock: {
      must_match_every_image: {
        name: 'Lila',
        facial_asymmetry: 'left eye 2% smaller',
        distinctive_marks: 'mole below right jaw',
        skin_tone: 'fair',
        skin_tone_hex: '#F8C4AE'
      }
    }
  };
  const text = buildChatbotExportTextFromPersona(persona, { includePrompt: false });
  assert.match(text, /Asimetría \(fija\)/);
  assert.match(text, /REALISMO/);
  assert.match(text, /NEGATIVE PROMPT/);
  assert.match(text, /left eye 2%/);
});

test('synthesizeCharacterLock propaga asimetría y marcas', () => {
  const lock = synthesizeCharacterLock({
    identity: { name: 'Nora' },
    facial_features: {
      skin_tone: 'clara',
      facial_asymmetry: 'mandíbula izquierda más suave',
      distinctive_marks: 'peca en pómalo'
    }
  });
  assert.equal(lock.must_match_every_image.facial_asymmetry, 'mandíbula izquierda más suave');
  assert.equal(lock.must_match_every_image.distinctive_marks, 'peca en pómalo');
  assert.match(lock.free_chatbot_system, /Asimetr/);
});

test('UI: campo pFacialAsymmetry cableado en form + getFullPersonaJSON', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  assert.match(html, /id="pFacialAsymmetry"/);
  assert.match(app, /pFacialAsymmetry/);
  assert.match(app, /facial_asymmetry/);
  assert.match(html, /chatbot-packs\.js\?v=1\.5\.0/);
  assert.match(html, /prompt-builder\.js\?v=1\.1\.0/);
  assert.match(html, /ugc-shot-composer\.js\?v=1\.0\.0/);
});

test('pack spicy sigue trayendo realism + negative tras synthesize', () => {
  const text = buildFreeChatbotPack(
    {
      identity: { name: 'Nora' },
      facial_features: {
        skin_tone: 'piel clara',
        skin_tone_hex: '#ead2c0',
        facial_asymmetry: 'ojo derecho levemente más abierto',
        distinctive_marks: 'lunar cerca del labio'
      }
    },
    'bikini'
  );
  assert.match(text, /ojo derecho levemente más abierto/);
  assert.match(text, /lunar cerca del labio/);
  assert.match(text, /NEGATIVE PROMPT/);
  assert.match(text, /REALISMO/);
});
