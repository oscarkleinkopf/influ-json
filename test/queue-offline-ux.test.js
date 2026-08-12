const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('path');

process.env.GEN_MIN_GAP_MS = '0';
process.env.GEN_429_COOLDOWN_MS = '0';

const genQueue = require('../gen-queue');

test('cola: 3 jobs → position #1/#2/#3 de 3', async () => {
  genQueue._resetForTests();
  const seen = [];
  const jobs = [1, 2, 3].map((n) =>
    genQueue.enqueue(`job_${n}`, async () => {
      const s = genQueue.getStatus();
      seen.push({ n, position: s.position, total: s.totalInWave });
      await new Promise((r) => setTimeout(r, 5));
      return n;
    })
  );
  // Immediately after enqueueing 3, wave size should be 3
  const early = genQueue.getStatus();
  assert.equal(early.pendingCount + (early.active ? 1 : 0), 3);
  assert.equal(early.waveSize || early.totalInWave, 3);

  await Promise.all(jobs);
  assert.deepEqual(
    seen.map((x) => x.position),
    [1, 2, 3]
  );
  assert.ok(seen.every((x) => x.total === 3));
  const done = genQueue.getStatus();
  assert.equal(done.pendingCount, 0);
  assert.equal(done.active, false);
});

test('UI: modo offline + chip posición en app/index', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  assert.match(app, /isStudioOfflineMode/);
  assert.match(app, /offlineModeStorageKey/);
  assert.match(app, /#\$\{pos\} de \$\{total\}/);
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.match(html, /offlineModeToggleBar/);
  assert.match(html, /Modo offline/);
});

test('W15: offline-first labels + 429 sugiere offline + empty vault', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  const vault = fs.readFileSync(path.join(__dirname, '..', 'variant-vault-ui.js'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const readme = fs.readFileSync(path.join(__dirname, '..', 'README.md'), 'utf8');

  assert.match(html, /Generar boceto \(opt-in · puede pedir token\)|Generar boceto \(gratis, inestable\)/);
  assert.match(html, /Copiar JSON/);
  assert.doesNotMatch(html, /<button\b[^>]*>\s*Copiar JSON \(recomendado\)\s*</);
  assert.match(html, /id="btnRateLimitGoOffline"/);
  assert.match(html, /Sin gens — igual puedes exportar packs/);
  assert.match(html, /Modo offline/);

  assert.match(app, /btnRateLimitGoOffline/);
  assert.match(app, /isRateLimitActiveUi|_rateLimitUiActive/);
  assert.match(app, /offlineModeStorageKey/);
  // Empty vault copy vive en variant-vault-ui.js
  assert.match(vault, /Sin gens — igual puedes exportar packs/);
  assert.match(vault, /Copiar JSON/);
  assert.doesNotMatch(vault, /Copiar JSON \(recomendado\)/);
  // Toggle sigue en localStorage (W8)
  assert.match(app, /localStorage\.setItem\(offlineModeStorageKey\(\)/);
  assert.match(app, /localStorage\.getItem\(offlineModeStorageKey\(\)/);

  assert.match(readme, /Copiar JSON/);
  assert.match(readme, /Modo offline/);
  assert.match(readme, /opt-in · puede pedir token|gratis, inestable|Pollinations/);
});
