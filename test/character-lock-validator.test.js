const test = require('node:test');
const assert = require('node:assert/strict');

const { validateCharacterLock, isValidHex } = require('../character-lock-validator.js');

// JSON completo tal como lo produce getFullPersonaJSON para una persona bien definida
function healthyPersona() {
  return {
    identity: {
      name: 'Daniela Ríos',
      gender: 'Female',
      apparent_age: '26 años',
      ethnicity_appearance: 'Latina de tez clara',
      body_type: 'Atlético y proporcionado'
    },
    facial_features: {
      face_shape: 'Ovalada',
      skin_tone: 'Piel clara / beige claro',
      skin_tone_hex: '#f0d5c0',
      skin_texture: 'Suave',
      eye_color: 'Miel',
      eyebrow_style: 'Cejas naturales definidas',
      lip_shape: 'Labios carnosos',
      smile_type: 'Natural',
      distinctive_marks: 'Lunar bajo el ojo izquierdo',
      facial_asymmetry: 'Ojo izquierdo ~2% más pequeño, mandíbula izquierda ligeramente más suave'
    },
    hair: {
      color: 'Castaño oscuro',
      color_hex: '#3b2417',
      texture: 'Ondulado',
      length: 'Largo',
      style: 'Suelto con raya al medio'
    },
    body: {
      body_type: 'Atlético y proporcionado',
      height_appearance: 'Estatura media (~1.65 m)',
      proportions: 'Hombros equilibrados, cintura definida',
      posture: 'Erguida y relajada',
      fitness_level: 'Tono natural ligero',
      skin_continuity: 'Mismo tono en rostro, cuello y brazos'
    },
    personality: {
      mbti: 'ENFP - El Entusiasta Creativo',
      communication_style: 'Cálido y cercano'
    },
    character_lock: {
      version: 1,
      free_tier: true,
      must_match_every_image: {
        name: 'Daniela Ríos',
        skin_tone: 'Piel clara / beige claro',
        skin_tone_hex: '#f0d5c0',
        distinctive_marks: 'Lunar bajo el ojo izquierdo',
        facial_asymmetry: 'Ojo izquierdo ~2% más pequeño, mandíbula izquierda ligeramente más suave'
      }
    }
  };
}

test('persona completa → score 100, grado sólido, sin avisos', () => {
  const v = validateCharacterLock(healthyPersona());
  assert.equal(v.score, 100);
  assert.equal(v.grade, 'solid');
  assert.equal(v.gradeLabel, 'Sólido');
  assert.equal(v.errors.length, 0);
  assert.equal(v.warnings.length, 0);
  assert.equal(v.infos.length, 0);
  assert.match(v.summary, /sólido/i);
});

test('sin hex de tez → aviso skin_tone_hex y grado aceptable', () => {
  const p = healthyPersona();
  delete p.facial_features.skin_tone_hex;
  delete p.character_lock.must_match_every_image.skin_tone_hex;
  const v = validateCharacterLock(p);
  assert.equal(v.errors.length, 0);
  assert.equal(v.warnings.length, 1);
  assert.equal(v.warnings[0].field, 'facial_features.skin_tone_hex');
  assert.equal(v.score, 92);
  assert.equal(v.grade, 'ok');
});

test('etiqueta de tez débil («Tono Natural») → aviso', () => {
  const p = healthyPersona();
  p.facial_features.skin_tone = 'Tono Natural';
  const v = validateCharacterLock(p);
  assert.equal(v.warnings.length, 1);
  assert.equal(v.warnings[0].field, 'facial_features.skin_tone');
  assert.match(v.warnings[0].message, /débil/i);
});

test('hex de tez inválido → aviso de formato', () => {
  const p = healthyPersona();
  p.facial_features.skin_tone_hex = '#zzzzzz';
  p.character_lock.must_match_every_image.skin_tone_hex = '#zzzzzz';
  const v = validateCharacterLock(p);
  assert.equal(v.warnings.length, 1);
  assert.equal(v.warnings[0].field, 'facial_features.skin_tone_hex');
  assert.match(v.warnings[0].message, /no es un color válido/i);
});

test('nombre genérico por defecto → error, grado débil', () => {
  const p = healthyPersona();
  p.identity.name = 'Influencer';
  const v = validateCharacterLock(p);
  assert.equal(v.errors.length, 1);
  assert.equal(v.errors[0].field, 'identity.name');
  assert.equal(v.grade, 'weak');
});

test('anti-sesgo: «Latina» a secas + tez clara → aviso; «de tez clara» lo resuelve', () => {
  const p = healthyPersona();
  p.identity.ethnicity_appearance = 'Latina';
  const v = validateCharacterLock(p);
  assert.equal(v.warnings.length, 1);
  assert.equal(v.warnings[0].field, 'identity.ethnicity_appearance');
  assert.match(v.warnings[0].message, /tez clara/i);

  const fixed = healthyPersona();
  fixed.identity.ethnicity_appearance = 'Latina de tez clara';
  const vFixed = validateCharacterLock(fixed);
  assert.equal(vFixed.warnings.length, 0);
});

test('anti-sesgo no dispara con tez oscura', () => {
  const p = healthyPersona();
  p.identity.ethnicity_appearance = 'Latina';
  p.facial_features.skin_tone = 'Morena';
  p.facial_features.skin_tone_hex = '#8d5a3b';
  p.character_lock.must_match_every_image.skin_tone = 'Morena';
  p.character_lock.must_match_every_image.skin_tone_hex = '#8d5a3b';
  const v = validateCharacterLock(p);
  assert.equal(v.warnings.length, 0);
});

test('JSON importado vacío → 3 errores, score 0, grado débil', () => {
  const v = validateCharacterLock({});
  assert.equal(v.errors.length, 3);
  assert.deepEqual(v.errors.map(e => e.field), ['character_lock', 'identity.name', 'identity.apparent_age']);
  assert.equal(v.score, 0);
  assert.equal(v.grade, 'weak');
});

test('sin bloque body → aviso de tipo de cuerpo (packs fullbody/bikini/spicy)', () => {
  const p = healthyPersona();
  delete p.body;
  delete p.identity.body_type;
  const v = validateCharacterLock(p);
  const fields = v.warnings.map(w => w.field);
  assert.ok(fields.includes('body.body_type'));
});

test('entrada basura no rompe el validador', () => {
  for (const garbage of [null, undefined, 'texto', 42, [1, 2, 3]]) {
    const v = validateCharacterLock(garbage);
    assert.equal(v.grade, 'weak');
    assert.ok(v.errors.length >= 3);
  }
});

test('score es monótono: más problemas → menor score', () => {
  const good = validateCharacterLock(healthyPersona());
  const noHex = healthyPersona();
  delete noHex.facial_features.skin_tone_hex;
  delete noHex.character_lock.must_match_every_image.skin_tone_hex;
  const mid = validateCharacterLock(noHex);
  const bad = validateCharacterLock({});
  assert.ok(good.score > mid.score);
  assert.ok(mid.score > bad.score);
});

test('sin asimetría facial → sugerencia info', () => {
  const p = healthyPersona();
  delete p.facial_features.facial_asymmetry;
  delete p.character_lock.must_match_every_image.facial_asymmetry;
  const v = validateCharacterLock(p);
  assert.equal(v.errors.length, 0);
  assert.ok(v.infos.some((i) => i.field === 'facial_features.facial_asymmetry'));
  assert.match(v.infos.find((i) => i.field === 'facial_features.facial_asymmetry').message, /asimetr/i);
});

test('isValidHex acepta #RRGGBB y rechaza basura', () => {
  assert.ok(isValidHex('#f0d5c0'));
  assert.ok(isValidHex('f0d5c0'));
  assert.ok(!isValidHex('#fff'));
  assert.ok(!isValidHex('#zzzzzz'));
  assert.ok(!isValidHex(''));
  assert.ok(!isValidHex(null));
});
