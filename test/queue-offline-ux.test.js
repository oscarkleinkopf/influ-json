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
