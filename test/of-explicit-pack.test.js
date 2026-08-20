/**
 * OF-1/OF-2 — pack explicit + Locally Uncensored cajas separadas (G513R).
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const packs = require('../chatbot-packs');
const recipe = require('../production-recipe');
const brandKit = require('../brand-kit');

const sample = {
  identity: { name: 'Lina' },
  character_lock: {
    free_chatbot_system: 'Misma Lina siempre.',
    must_match_every_image: {
      name: 'Lina',
      skin_tone: 'piel clara',
      skin_tone_hex: '#f0d5c0',
      eye_color: 'cafés',
      hair_color: 'castaño',
      body_type: 'delgada'
    }
  }
};

test('listPackIds incluye explicit; SFW sigue siendo 4', () => {
  assert.ok(packs.listPackIds().includes('explicit'));
  assert.deepEqual(packs.listSfwPackIds().sort(), ['bikini', 'fullbody', 'product', 'spicy']);
  assert.equal(packs.FREE_CHATBOT_PACKS.explicit.nsfw, true);
});

test('pack explicit: lock + 3 prompts PPV + LU cajas separadas', () => {
  const text = packs.buildFreeChatbotPack(sample, 'explicit', { triggerToken: 'ohwx_lina' });
  assert.match(text, /CHARACTER LOCK/);
  assert.match(text, /#f0d5c0/);
  assert.match(text, /PROMPT A/);
  assert.match(text, /PROMPT B/);
  assert.match(text, /PROMPT C/);
  assert.match(text, /NUNCA renegocies la cara/i);
  assert.match(text, /cajas SEPARADAS/i);
  assert.match(text, /<<<LU_NEGATIVE/);
  assert.match(text, /LU_NEGATIVE>>>/);
  assert.match(text, /<<<LU_POSITIVE_A/);
  assert.match(text, /<<<LU_POSITIVE_B/);
  assert.match(text, /<<<LU_POSITIVE_C/);
  assert.match(text, /ohwx_lina/);
  assert.match(text, /juggernautXL_ragnarok\.safetensors/);
  assert.match(text, /Juggernaut-XL_v9\.safetensors/);
  assert.match(text, /Realistic_Vision_V6\.0_NV_B1_fp16\.safetensors/);
  assert.match(text, /lustifyNSFWCheckpoint_zenithV9\.safetensors/);
  assert.doesNotMatch(text, /REPLICATE_API_TOKEN/);
});

test('buildLuSplitPrompts: positivo y negativo son strings limpios (sin etiquetas)', () => {
  const must = sample.character_lock.must_match_every_image;
  const split = packs.buildLuSplitPrompts(must, { triggerToken: 'ohwx_lina' });
  assert.ok(split.negative);
  assert.doesNotMatch(split.negative, /<<<|POSITIVE|NEGATIVE PROMPT|LU_NEGATIVE/);
  assert.equal(split.shots.length, 3);
  for (const shot of split.shots) {
    assert.ok(shot.positive.includes('photorealistic'));
    assert.doesNotMatch(shot.positive, /<<<LU_|CAJA POSITIVE|CAJA NEGATIVE/);
    assert.match(shot.positive, /ohwx_lina/);
    assert.ok(!shot.positive.includes(split.negative.slice(0, 40)), 'positivo no embebe el negativo');
  }
  assert.match(split.note, /cajas distintas/i);
});

test('ZIP kit marca incluye packs/explicit.txt', () => {
  const { files } = brandKit.buildBrandKitFiles({
    name: 'Lina',
    detailedJSON: sample
  });
  const names = files.map((f) => f.name);
  assert.ok(names.includes('packs/explicit.txt'));
  const explicit = files.find((f) => f.name === 'packs/explicit.txt').content;
  assert.match(explicit, /CHARACTER LOCK/);
  assert.match(explicit, /LU_NEGATIVE/);
});

test('receta G513R: 4 checkpoints + LU split + no Lustify default', () => {
  const r = recipe.buildG513rRecipe({ personaName: 'Lina' }, { triggerToken: 'ohwx_lina' });
  assert.equal(r.kind, 'g513r_local');
  assert.equal(r.schema_id, 'influ-recipe/v1');
  assert.equal(r.inference.lu_split_prompts, true);
  assert.equal(r.inference.default_explicit_checkpoint, 'juggernautXL_ragnarok.safetensors');
  assert.equal(r.inference.nsfw_optin_checkpoint, 'lustifyNSFWCheckpoint_zenithV9.safetensors');
  const lustify = r.checkpoints.find((c) => c.id === 'lustify');
  assert.equal(lustify.neverDefault, true);
  const text = recipe.toG513rClipboardText(r);
  assert.match(text, /cajas separadas/i);
  assert.match(text, /Ollama/);
  assert.match(text, /LM Studio/);
  assert.match(text, /Locally Uncensored/);
  assert.match(text, /ohwx_lina/);
});

test('UI: botones LU + pack explicit + receta G513R (nvidia-only)', () => {
  const pe = fs.readFileSync(path.join(__dirname, '..', 'views', 'tabs', 'persona-engine.html'), 'utf8');
  const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  assert.match(pe, /data-free-pack="explicit"/);
  assert.match(pe, /id="btnCopyLuNegative"/);
  assert.match(pe, /data-lu-positive="A"/);
  assert.match(pe, /id="btnCopyG513rRecipe"/);
  assert.match(pe, /data-nvidia-only/);
  assert.match(pe, /id="chkLoraExplicitCaptions"/);
  assert.match(app, /function copyLuPromptPart/);
  assert.match(app, /function setupWorkMode/);
  assert.match(app, /buildG513rRecipe/);
});
