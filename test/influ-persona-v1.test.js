/**
 * Corte D — influ-persona/v1 schema, migrate, round-trip.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const InfluPersona = require('../influ-persona');
const { normalizePersonaForPack, buildFreeChatbotPack } = require('../chatbot-packs');

function minimalRaw() {
  return {
    identity: { name: 'Camila V.', apparent_age: '24 años' },
    facial_features: {
      skin_tone: 'Piel clara',
      skin_tone_hex: '#f0d5c0',
      eye_color: 'Marrón'
    },
    hair: { color: 'Castaño', texture: 'Ondulado', length: 'Largo' }
  };
}

test('schema JSON existe y declara influ-persona/v1', () => {
  const schemaPath = path.join(__dirname, '..', 'schemas', 'influ-persona-v1.schema.json');
  assert.ok(fs.existsSync(schemaPath));
  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
  assert.equal(schema.title, 'influ-persona/v1');
  assert.equal(schema.properties.schema_id.const, 'influ-persona/v1');
  assert.ok(schema.properties.character_lock.properties.must_match_every_image.required.includes('name'));
  assert.ok(schema.properties.character_lock.properties.must_match_every_image.required.includes('skin_tone'));
  assert.ok(schema.properties.character_lock.properties.must_match_every_image.required.includes('eye_color'));
  assert.ok(schema.properties.character_lock.properties.must_match_every_image.required.includes('hair_color'));
});

test('migrate añade schema_id + must_match mínimos', () => {
  const out = InfluPersona.migrate(minimalRaw());
  assert.equal(out.schema_id, InfluPersona.SCHEMA_ID);
  assert.equal(out.character_lock.version, 1);
  assert.equal(out.character_lock.must_match_every_image.name, 'Camila V.');
  assert.equal(out.character_lock.must_match_every_image.skin_tone, 'Piel clara');
  assert.equal(out.character_lock.must_match_every_image.eye_color, 'Marrón');
  assert.equal(out.character_lock.must_match_every_image.hair_color, 'Castaño');
  assert.match(String(out.created_with), /influ-json/);
});

test('validate falla sin nombre; ok tras migrate', () => {
  const bad = InfluPersona.validate({ identity: {}, character_lock: { version: 1, must_match_every_image: {} } });
  assert.equal(bad.ok, false);
  assert.ok(bad.errors.some((e) => e.field === 'identity.name'));

  const good = InfluPersona.importPersona(minimalRaw());
  assert.equal(good.ok, true);
  assert.equal(good.errors.length, 0);
});

test('round-trip: canonicalize estable entre «máquinas» (export → import)', () => {
  const machineA = InfluPersona.importPersona(minimalRaw(), { createdWith: 'influ-json@test-a' });
  assert.equal(machineA.ok, true);
  const exported = JSON.parse(JSON.stringify(machineA.persona));

  // Simula otra instalación: solo el JSON portable
  const machineB = InfluPersona.importPersona(exported, { createdWith: 'influ-json@test-b' });
  assert.equal(machineB.ok, true);

  const ca = InfluPersona.canonicalize(machineA.persona);
  const cb = InfluPersona.canonicalize(machineB.persona);
  assert.deepEqual(ca.character_lock, cb.character_lock);
  assert.equal(ca.identity.name, cb.identity.name);
  assert.equal(ca.schema_id, InfluPersona.SCHEMA_ID);
});

test('migrate conserva extensiones desconocidas', () => {
  const raw = {
    ...minimalRaw(),
    custom_brand_hook: 'glow-serum',
    character_lock: {
      version: 1,
      must_match_every_image: { name: 'Camila V.', skin_tone: 'clara', eye_color: 'marrón', hair_color: 'castaño' },
      experimental_field: true
    }
  };
  const out = InfluPersona.migrate(raw);
  assert.equal(out.custom_brand_hook, 'glow-serum');
  assert.equal(out.character_lock.experimental_field, true);
});

test('normalizePersonaForPack (chatbot-packs) emite schema_id v1', () => {
  const json = normalizePersonaForPack({
    name: 'SQLite Row',
    detailedJSON: JSON.stringify(minimalRaw())
  });
  assert.equal(json.schema_id, 'influ-persona/v1');
  assert.ok(json.character_lock?.must_match_every_image?.name);
  const pack = buildFreeChatbotPack(json, 'fullbody');
  assert.match(pack, /Camila V\.|CHARACTER LOCK|character_lock/i);
});

test('import desde fila SQLite produce mismo canonical que JSON expandido', () => {
  const expanded = InfluPersona.canonicalize(minimalRaw());
  const fromRow = InfluPersona.canonicalize({
    id: 'x',
    name: 'Camila V.',
    detailedJSON: JSON.stringify(minimalRaw())
  });
  assert.deepEqual(fromRow.character_lock, expanded.character_lock);
  assert.equal(fromRow.identity.name, expanded.identity.name);
});
