const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

// Load Express app from server.js
const app = require('../server');

test('GET /api/queue-status returns HTTP 200 and queue status object', async () => {
  const server = http.createServer(app);

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const port = address.port;

  try {
    const res = await new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${port}/api/queue-status`, (response) => {
        let data = '';
        response.on('data', (chunk) => { data += chunk; });
        response.on('end', () => {
          resolve({ status: response.statusCode, body: JSON.parse(data) });
        });
      }).on('error', reject);
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.ok(res.body.queue, 'Queue status should exist in response');
    assert.equal(typeof res.body.queue.active, 'boolean');
    assert.equal(typeof res.body.queue.pendingCount, 'number');
    assert.equal(typeof res.body.queue.isCoolingDown, 'boolean');
    assert.equal(typeof res.body.queue.cooldownRemainingMs, 'number');
    assert.ok('currentTaskInfo' in res.body.queue);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
