const test = require('node:test');
const assert = require('node:assert/strict');
const {
  pickQaMatrixSlots,
  scoreFullbody,
  scoreSpicy,
  emptyChecks,
  summarizeChecks,
  CHECKS,
  SLOT_DEFS
} = require('../qa-matrix');

test('SLOT_DEFS y CHECKS tienen 3 entradas estables', () => {
  assert.equal(SLOT_DEFS.length, 3);
  assert.equal(CHECKS.length, 3);
  assert.deepEqual(CHECKS.map((c) => c.id), ['face', 'skin', 'hair']);
});

test('pickQaMatrixSlots usa imagen ancla como portrait', () => {
  const slots = pickQaMatrixSlots(
    { id: 'p1', image: '/assets/ref.png' },
    [],
    []
  );
  assert.equal(slots.portrait.image_path, '/assets/ref.png');
  assert.equal(slots.portrait.source, 'anchor');
  assert.equal(slots.fullbody, null);
  assert.equal(slots.spicy, null);
});

test('pickQaMatrixSlots elige fullbody y spicy por heurística de texto', () => {
  const variants = [
    { id: 'v1', image_path: '/a.jpg', pose: 'close-up portrait selfie' },
    { id: 'v2', image_path: '/b.jpg', pose: 'full body standing fashion', clothing: 'jeans' },
    { id: 'v3', image_path: '/c.jpg', clothing: 'bikini playa spicy', pose: 'beach' }
  ];
  const slots = pickQaMatrixSlots({ id: 'p1', image: '/anchor.jpg' }, variants, []);
  assert.equal(slots.fullbody.image_path, '/b.jpg');
  assert.equal(slots.spicy.image_path, '/c.jpg');
  assert.ok(scoreFullbody(variants[1]) >= 1);
  assert.ok(scoreSpicy(variants[2]) >= 1);
});

test('pickQaMatrixSlots no reutiliza la misma imagen en spicy si ya es fullbody', () => {
  const only = {
    id: 'v1',
    image_path: '/same.jpg',
    pose: 'full body bikini spicy beach'
  };
  const slots = pickQaMatrixSlots({ image: '/a.jpg' }, [only], []);
  assert.equal(slots.fullbody.image_path, '/same.jpg');
  assert.equal(slots.spicy, null);
});

test('summarizeChecks cuenta 0–3 y allOk', () => {
  const empty = emptyChecks();
  assert.deepEqual(summarizeChecks(empty), { done: 0, total: 3, allOk: false, pct: 0 });
  const partial = { face: true, skin: true, hair: false };
  assert.equal(summarizeChecks(partial).done, 2);
  assert.equal(summarizeChecks(partial).allOk, false);
  const full = { face: true, skin: true, hair: true };
  assert.equal(summarizeChecks(full).allOk, true);
  assert.equal(summarizeChecks(full).pct, 100);
});
