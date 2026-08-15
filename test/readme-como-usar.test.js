/**
 * Idea #6 — README / Cómo usar alineados a botones reales
 * (Influencers · Ficha · Copiar JSON). Sin «Persona Engine» ni «(recomendado)».
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
const comoUsar = fs.readFileSync(path.join(root, 'views/tabs/como-usar.html'), 'utf8');
const dashboard = fs.readFileSync(path.join(root, 'views/tabs/dashboard.html'), 'utf8');

test('README: vocabulario UI real (Influencers / Ficha / Copiar JSON)', () => {
  assert.match(readme, /\*\*Influencers\*\*/);
  assert.match(readme, /Ficha \/ Editor/);
  assert.match(readme, /\*\*Copiar JSON\*\*/);
  assert.match(readme, /Lock & Packs|Lock &amp; Packs/);
  assert.doesNotMatch(readme, /Persona Engine/);
  assert.doesNotMatch(readme, /Copiar JSON \(recomendado\)/);
  assert.doesNotMatch(readme, /barra superior del Studio/);
  assert.match(readme, /chip \*\*Offline\*\*/);
});

test('Cómo usar: mapa de hubs + Copiar JSON (sin Persona Engine)', () => {
  assert.match(comoUsar, /Influencers/);
  assert.match(comoUsar, /Ficha \/ Editor|Ficha/);
  assert.match(comoUsar, /Copiar JSON/);
  assert.match(comoUsar, /data-guide-action="packs"[^>]*>\s*Ir a Copiar JSON\s*</);
  assert.doesNotMatch(comoUsar, /Persona Engine/);
  assert.doesNotMatch(comoUsar, /Copiar JSON \(recomendado\)/);
  assert.match(comoUsar, /Dónde está cada cosa|guide-map-title/);
  assert.match(comoUsar, /Campañas \+ Licencias/);
  assert.match(comoUsar, /start-studio/);
  assert.match(comoUsar, /Plantillas|Qué producir ahora/);
});

test('Portafolio checklist: sin Persona Engine', () => {
  assert.doesNotMatch(dashboard, /Persona Engine/);
  assert.match(dashboard, /Ficha \/ Editor|Influencers/);
});
