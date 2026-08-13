'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  validateCharacterLock,
  suggestLatinaLightSkinFix,
  LATINA_TEZ_CLARA
} = require('../character-lock-validator.js');

test('suggestLatinaLightSkinFix: Latina + tez clara → sugerencia', () => {
  const fix = suggestLatinaLightSkinFix('Latina', 'piel clara natural', '#f0d5c0');
  assert.ok(fix);
  assert.equal(fix.suggested, LATINA_TEZ_CLARA);
  assert.match(fix.message, /Latina de tez clara/);
});

test('suggestLatinaLightSkinFix: ya corregido → null', () => {
  assert.equal(suggestLatinaLightSkinFix('Latina de tez clara', 'piel clara', '#f0d5c0'), null);
});

test('suggestLatinaLightSkinFix: Latina / Mediterránea no es «a secas»', () => {
  assert.equal(suggestLatinaLightSkinFix('Latina / Mediterránea', 'piel clara', '#f0d5c0'), null);
});

test('suggestLatinaLightSkinFix: Latina + tez morena → null', () => {
  assert.equal(suggestLatinaLightSkinFix('Latina', 'piel morena profunda', '#5c3a2e'), null);
});

test('validateCharacterLock: Latina + clara emite warning ethnicity', () => {
  const v = validateCharacterLock({
    identity: { name: 'Luna', apparent_age: '24', ethnicity_appearance: 'Latina' },
    facial_features: { skin_tone: 'piel clara', skin_tone_hex: '#f0d5c0', eye_color: 'marrón', face_shape: 'oval' },
    hair: { color: 'castaño' },
    body: { body_type: 'atlético' },
    character_lock: {
      must_match_every_image: {
        name: 'Luna',
        skin_tone: 'piel clara',
        skin_tone_hex: '#f0d5c0',
        eyes: 'marrón',
        hair: 'castaño'
      }
    }
  });
  assert.ok(v.warnings.some((w) => w.field === 'identity.ethnicity_appearance'));
});

test('UI Identidad: hint + score inline + apply button', () => {
  const root = path.join(__dirname, '..');
  const html = fs.readFileSync(path.join(root, 'views/tabs/persona-engine.html'), 'utf8');
  const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  const css = fs.readFileSync(path.join(root, 'index.css'), 'utf8');
  assert.match(html, /id="identityLockHint"/);
  assert.match(html, /id="btnApplyEthnicityTezClara"/);
  assert.match(html, /id="identityLockHealthInline"/);
  assert.match(app, /function refreshIdentityLockHints\b/);
  assert.match(app, /function applyLatinaTezClaraSuggestion\b/);
  assert.match(app, /suggestLatinaLightSkinFix/);
  assert.match(app, /pEthnicity['"]?\)\.value = ['"]Latina de tez clara['"]/);
  assert.match(css, /identity-lock-hint/);
  assert.match(css, /lock-health-inline/);
});
