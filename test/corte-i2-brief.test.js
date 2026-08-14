/**
 * I2 — Brief de marca → checklist de producción.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const brief = require('../production-brief');

function mem() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k)
  };
}

test('brief vacío → checklist con persona pendiente', () => {
  const cl = brief.buildChecklist({}, { hasPersona: false });
  assert.ok(cl.tasks.some((t) => t.id === 'persona' && !t.done));
  assert.ok(cl.summary.pending >= 1);
  assert.match(cl.summary.label, /pendiente/i);
});

test('brief con hooks/shots cuenta pendientes', () => {
  const cl = brief.buildChecklist(
    { product: 'Crema X', brand: 'Labs', hooksCount: 3, shotsCount: 2, wantLicense: true },
    { hasPersona: true, personaName: 'Luna', scriptsCount: 1, campaignsCount: 0 }
  );
  assert.match(cl.title, /Labs|Crema/);
  const hooks = cl.tasks.find((t) => t.id === 'hooks');
  assert.ok(hooks);
  assert.match(hooks.label, /2 hooks pendientes|1\/3/);
  assert.equal(hooks.done, false);
  assert.ok(cl.tasks.some((t) => t.id === 'license' && !t.done));
  const next = brief.nextAction(cl);
  assert.ok(next);
});

test('overrides marcan done; save/load', () => {
  const s = mem();
  brief.save('p1', { product: 'Serum', hooksCount: 2 }, { hooks: true }, s);
  const loaded = brief.load('p1', s);
  assert.equal(loaded.brief.product, 'Serum');
  let cl = brief.buildChecklist(loaded.brief, { hasPersona: true, scriptsCount: 0 });
  cl = brief.applyOverrides(cl, loaded.overrides);
  assert.equal(cl.tasks.find((t) => t.id === 'hooks').done, true);
});

test('HTML + server cablean production-brief', () => {
  const foot = fs.readFileSync(path.join(root, 'views/_foot.html'), 'utf8');
  const dash = fs.readFileSync(path.join(root, 'views/tabs/dashboard.html'), 'utf8');
  const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
  const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  assert.match(foot, /production-brief\.js/);
  assert.match(server, /\/production-brief\.js/);
  assert.match(dash, /prodBriefCard|prodBriefChecklist|Qué producir ahora/);
  assert.match(app, /setupProductionBrief|renderProductionBrief|runBriefAction/);
});
