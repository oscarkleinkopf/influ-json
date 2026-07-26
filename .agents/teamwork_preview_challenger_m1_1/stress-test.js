const assert = require('node:assert/strict');
const http = require('node:http');

// Set environment for test: min gap 10ms, cooldown 1000ms for fast execution
process.env.GEN_MIN_GAP_MS = '10';
process.env.GEN_429_COOLDOWN_MS = '1000';

const genQueue = require('../../gen-queue');
const app = require('../../server');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function runStressTest() {
  console.log('=== STRESS TEST START ===');

  const numTasks = 10;
  const executionOrder = [];
  let rateLimitTriggered = false;
  let cooldownObservedInStatus = false;

  console.log(`Enqueueing ${numTasks} concurrent tasks...`);

  const promises = [];
  for (let i = 1; i <= numTasks; i++) {
    const taskId = i;
    const p = genQueue.enqueue(`task-${taskId}`, async () => {
      // Simulate 429 on task 3 first attempt
      if (taskId === 3 && !rateLimitTriggered) {
        rateLimitTriggered = true;
        console.log(`[Test] Task 3 throwing simulated HTTP 429 rate limit error`);
        const err = new Error('HTTP 429 Too Many Requests');
        err.status = 429;
        throw err;
      }

      await sleep(10);
      executionOrder.push(taskId);
      return `result-${taskId}`;
    });
    promises.push(p);
  }

  // Check queue status right after enqueueing
  const statusImmediate = genQueue.getStatus();
  console.log('Immediate queue status:', statusImmediate);
  assert.equal(typeof statusImmediate.pendingCount, 'number');

  // Monitor status in background while queue drains
  const statusMonitor = setInterval(() => {
    const st = genQueue.getStatus();
    if (st.isCoolingDown) {
      cooldownObservedInStatus = true;
      assert.ok(st.cooldownRemainingMs > 0, 'cooldownRemainingMs should be > 0');
      assert.ok(st.retryAfterSeconds >= 0, 'retryAfterSeconds should be >= 0');
    }
  }, 20);

  // Wait for all 10 tasks to finish
  const resolvedResults = await Promise.all(promises);
  clearInterval(statusMonitor);

  console.log('Execution order:', executionOrder);
  console.log('Resolved results count:', resolvedResults.length);

  // Verification 1: All 10 tasks resolved (0 lost requests)
  assert.equal(resolvedResults.length, 10, 'All 10 tasks must complete');
  for (let i = 1; i <= numTasks; i++) {
    assert.equal(resolvedResults[i - 1], `result-${i}`, `Task ${i} result mismatch`);
  }

  // Verification 2: FIFO order [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
  const expectedOrder = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  assert.deepEqual(executionOrder, expectedOrder, 'Tasks must execute in exact FIFO order');

  // Verification 3: 429 cooldown was observed
  assert.ok(rateLimitTriggered, '429 error should have been triggered');
  assert.ok(cooldownObservedInStatus, 'Cooldown state should have been observed in getStatus()');

  console.log('=== VERIFYING HTTP GET /api/queue-status ===');
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;

  try {
    const httpRes = await new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${port}/api/queue-status`, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(data) }));
      }).on('error', reject);
    });

    assert.equal(httpRes.status, 200);
    assert.equal(httpRes.body.success, true);
    assert.ok(httpRes.body.queue);
    console.log('HTTP GET /api/queue-status response:', httpRes.body);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }

  console.log('=== TEST WITH DEFAULT 30s COOLDOWN TIMING SCHEMA ===');
  process.env.GEN_429_COOLDOWN_MS = '30000';
  genQueue.markRateLimited();
  const status30s = genQueue.getStatus();
  assert.equal(status30s.isCoolingDown, true);
  assert.equal(status30s.rateLimitCooldownMs, 30000);
  assert.ok(status30s.cooldownRemainingMs > 29000, `cooldownRemainingMs (${status30s.cooldownRemainingMs}) should be ~30000`);
  assert.ok(status30s.retryAfterSeconds >= 29 && status30s.retryAfterSeconds <= 30, `retryAfterSeconds (${status30s.retryAfterSeconds}) should be 30`);
  console.log('30s Cooldown Status Schema verified:', status30s);

  console.log('=== ALL STRESS TESTS PASSED SUCCESSFULLY ===');
}

runStressTest().catch((err) => {
  console.error('STRESS TEST FAILED:', err);
  process.exit(1);
});
