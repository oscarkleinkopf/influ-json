/**
 * Corte G — medir valor: activación, prueba identidad, lock lab, recetas.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const activation = require('../studio-activation');
const trial = require('../identity-trial');
const lockLab = require('../lock-lab');
const recipe = require('../production-recipe');

function memStore() {
  const mem = new Map();
  return {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => { mem.set(k, String(v)); },
    removeItem: (k) => { mem.delete(k); }
  };
}

test('activación: mark + summarize 5 pasos', () => {
  const s = memStore();
  activation.mark('p1', 'create', s);
  activation.mark('p1', 'save', s);
  activation.mark('p1', 'copy', s);
  const flags = activation.resolve('p1', { exportedPack: true }, s);
  assert.equal(flags.export, true);
  const sum = activation.summarize(flags);
  assert.equal(sum.total, 5);
  assert.equal(sum.done, 4);
  assert.match(sum.label, /4\/5/);
});

test('prueba identidad: save/pass/compare', () => {
  const s = memStore();
  const ev = trial.save('p1', 'pers1', 'rev1', {
    face: true, skin: true, hair: true, silhouette: true
  }, s);
  assert.equal(trial.isPassing(ev), true);
  const before = trial.emptyEvaluation();
  before.face = false;
  const changes = trial.compareEvaluations(before, ev);
  assert.ok(changes.some((c) => c.path === 'face'));
  const block = trial.buildTrialBlock({
    character_lock: { must_match_every_image: { name: 'Luna', skin_tone: 'clara' } }
  }, { fallbackName: 'Luna' });
  assert.match(block, /PRUEBA|PROMPT|cara/i);
});

test('lock lab: recommend keep_a / keep_b / tie', () => {
  const session = lockLab.emptySession();
  session.scoreA = { face: true, skin: true, hair: true, silhouette: true };
  session.scoreB = { face: true, skin: false, hair: true, silhouette: false };
  assert.equal(lockLab.recommend(session), 'keep_a');
  session.scoreB = { face: true, skin: true, hair: true, silhouette: true };
  assert.equal(lockLab.recommend(session), 'tie');
  session.scoreA = { face: false, skin: false, hair: true, silhouette: false };
  assert.equal(lockLab.recommend(session), 'keep_b');
  assert.match(lockLab.recommendationLabel('keep_b'), /B/i);
});

test('receta: build sin identidad + validate', () => {
  const r = recipe.buildRecipe({
    title: 'UGC crema',
    personaName: 'Luna',
    shotType: 'testimonial',
    camera: 'selfie',
    product: { name: 'Crema X', benefit: 'hidratación' },
    character_lock: { must_match_every_image: { skin_tone: 'clara', eye_color: 'marrón' } }
  }, { includeIdentity: false });
  assert.equal(r.schema_id, 'influ-recipe/v1');
  assert.equal(r.identity_opt_in, undefined);
  assert.equal(recipe.validateRecipe(r).ok, true);
  const withId = recipe.buildRecipe({
    title: 'Privada',
    character_lock: { must_match_every_image: { skin_tone: 'clara' } }
  }, { includeIdentity: true });
  assert.ok(withId.identity_opt_in);
  assert.equal(recipe.stripIdentity(withId).identity_opt_in, undefined);
});

test('HTML/scripts Corte G cableados', () => {
  const foot = fs.readFileSync(path.join(root, 'views/_foot.html'), 'utf8');
  const dash = fs.readFileSync(path.join(root, 'views/tabs/dashboard.html'), 'utf8');
  const pe = fs.readFileSync(path.join(root, 'views/tabs/persona-engine.html'), 'utf8');
  const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
  const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  for (const f of ['studio-activation.js', 'identity-trial.js', 'lock-lab.js', 'production-recipe.js']) {
    assert.match(foot, new RegExp(f.replace('.', '\\.')));
    assert.match(server, new RegExp(`/${f.replace('.', '\\.')}`));
  }
  assert.match(dash, /studioActivationCard|studioActivationLabel/);
  assert.match(dash, /btnOpenIdentityTrial/);
  assert.match(foot, /chkSessionSilhouette/);
  assert.match(pe, /lockLabPanel|btnCopyProductionRecipe/);
  assert.match(app, /setupStudioActivation|setupLockLab|setupProductionRecipe/);
  assert.match(app, /markStudioActivation\('identity'\)/);
});
