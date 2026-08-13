const test = require('node:test');
const assert = require('node:assert/strict');

// Configure fast timings for tests
process.env.GEN_MIN_GAP_MS = '10';
process.env.GEN_429_COOLDOWN_MS = '150';

const genQueue = require('../gen-queue');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test('genQueue.getStatus() returns required status schema', () => {
  const status = genQueue.getStatus();
  assert.equal(typeof status.active, 'boolean');
  assert.equal(typeof status.pendingCount, 'number');
  assert.equal(typeof status.isCoolingDown, 'boolean');
  assert.equal(typeof status.cooldownRemainingMs, 'number');
  assert.ok('currentTaskInfo' in status);
  assert.equal(typeof status.completedCount, 'number');
  assert.equal(status.minGapMs, 10);
  assert.equal(status.rateLimitCooldownMs, 150);
});

test('genQueue completedCount incrementa al terminar jobs', async () => {
  genQueue._resetForTests();
  const before = genQueue.getStatus().completedCount;
  await genQueue.enqueue('count-ok', async () => 'ok');
  try {
    await genQueue.enqueue('count-fail', async () => {
      throw new Error('boom');
    });
  } catch (_) { /* expected */ }
  const after = genQueue.getStatus().completedCount;
  assert.equal(after, before + 2);
});

test('genQueue serializes tasks sequentially in FIFO order', async () => {
  const executionOrder = [];

  const p1 = genQueue.enqueue('task1', async () => {
    await sleep(20);
    executionOrder.push(1);
    return 'res1';
  });

  const p2 = genQueue.enqueue('task2', async () => {
    await sleep(10);
    executionOrder.push(2);
    return 'res2';
  });

  const [r1, r2] = await Promise.all([p1, p2]);

  assert.equal(r1, 'res1');
  assert.equal(r2, 'res2');
  assert.deepEqual(executionOrder, [1, 2]);
});

test('genQueue handles 429 rate limit cooldown and automatic retry', async () => {
  let attempts = 0;

  const promise = genQueue.enqueue('task-retry-429', async () => {
    attempts++;
    if (attempts === 1) {
      const err = new Error('HTTP 429 Too Many Requests');
      err.status = 429;
      throw err;
    }
    return 'retry-success';
  });

  // Brief delay to let first attempt run and trigger 429
  await sleep(30);

  const statusDuringCooldown = genQueue.getStatus();
  assert.equal(statusDuringCooldown.isCoolingDown, true);
  assert.ok(statusDuringCooldown.cooldownRemainingMs > 0);

  const result = await promise;
  assert.equal(result, 'retry-success');
  assert.equal(attempts, 2);

  const statusAfter = genQueue.getStatus();
  assert.equal(statusAfter.active, false);
});
