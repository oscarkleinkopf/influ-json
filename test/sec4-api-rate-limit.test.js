/**
 * Sec #4 — API abuse rate-limit on heavy routes.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

process.env.DISABLE_GIT_BACKUP = '1';
process.env.STUDIO_PIN = process.env.STUDIO_PIN || '1234';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-session-secret-sec4';
process.env.INFLU_SKIP_ENV_PERSIST = '1';

function clearRateEnv() {
  delete process.env.API_RATE_LIMIT;
  delete process.env.API_RATE_LIMIT_WINDOW_MS;
  delete process.env.API_RATE_LIMIT_HEAVY_MAX;
  delete process.env.API_RATE_LIMIT_MAX;
  delete require.cache[require.resolve('../auth')];
}

test('checkApiRateLimit: sliding window bloquea al superar max', () => {
  clearRateEnv();
  process.env.API_RATE_LIMIT_HEAVY_MAX = '3';
  process.env.API_RATE_LIMIT_WINDOW_MS = '60000';
  const auth = require('../auth');
  auth._resetApiRateLimitsForTests();

  const req = { socket: { remoteAddress: '10.0.0.9' }, session: { profileId: 'p1' } };
  assert.equal(auth.checkApiRateLimit(req, 'heavy').allowed, true);
  assert.equal(auth.checkApiRateLimit(req, 'heavy').allowed, true);
  assert.equal(auth.checkApiRateLimit(req, 'heavy').allowed, true);
  const blocked = auth.checkApiRateLimit(req, 'heavy');
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfterSec >= 1);
  assert.equal(blocked.remaining, 0);

  // other profile / bucket independent
  const other = { socket: { remoteAddress: '10.0.0.9' }, session: { profileId: 'p2' } };
  assert.equal(auth.checkApiRateLimit(other, 'heavy').allowed, true);
  assert.equal(auth.checkApiRateLimit(req, 'default').allowed, true);

  auth._resetApiRateLimitsForTests();
  clearRateEnv();
});

test('API_RATE_LIMIT=0 desactiva el límite', () => {
  clearRateEnv();
  process.env.API_RATE_LIMIT = '0';
  process.env.API_RATE_LIMIT_HEAVY_MAX = '1';
  const auth = require('../auth');
  auth._resetApiRateLimitsForTests();
  const req = { socket: { remoteAddress: '10.0.0.8' }, session: {} };
  assert.equal(auth.checkApiRateLimit(req, 'heavy').allowed, true);
  assert.equal(auth.checkApiRateLimit(req, 'heavy').allowed, true);
  assert.equal(auth.checkApiRateLimit(req, 'heavy').enabled, false);
  auth._resetApiRateLimitsForTests();
  clearRateEnv();
});

test('POST /api/ai/analyze-photo respeta rate-limit heavy → 429', async () => {
  clearRateEnv();
  process.env.API_RATE_LIMIT = '1';
  process.env.API_RATE_LIMIT_HEAVY_MAX = '2';
  process.env.API_RATE_LIMIT_WINDOW_MS = '60000';
  delete require.cache[require.resolve('../auth')];
  delete require.cache[require.resolve('../server')];

  const auth = require('../auth');
  auth._resetApiRateLimitsForTests();
  const app = require('../server');

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const pin = process.env.STUDIO_PIN || '1234';
  const headers = {
    Authorization: `Bearer ${pin}`,
    'Content-Type': 'application/json'
  };

  try {
    const body = JSON.stringify({ imagePath: 'assets/guides/como-usar-hero.png' });
    const r1 = await fetch(`${base}/api/ai/analyze-photo`, { method: 'POST', headers, body });
    const r2 = await fetch(`${base}/api/ai/analyze-photo`, { method: 'POST', headers, body });
    // May be 200 or 400 (path) but not 429 yet
    assert.notEqual(r1.status, 429);
    assert.notEqual(r2.status, 429);
    assert.ok(r1.headers.get('x-ratelimit-limit'));

    const r3 = await fetch(`${base}/api/ai/analyze-photo`, { method: 'POST', headers, body });
    assert.equal(r3.status, 429);
    assert.equal(r3.headers.get('retry-after') != null, true);
    const j = await r3.json();
    assert.equal(j.code, 'RATE_LIMIT');
    assert.match(String(j.message), /Demasiadas|espera/i);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    auth._resetApiRateLimitsForTests();
    clearRateEnv();
  }
});

test('POST /api/upload-reference-url también usa bucket heavy', async () => {
  clearRateEnv();
  process.env.API_RATE_LIMIT_HEAVY_MAX = '1';
  delete require.cache[require.resolve('../auth')];
  delete require.cache[require.resolve('../server')];
  const auth = require('../auth');
  auth._resetApiRateLimitsForTests();
  const app = require('../server');

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const pin = process.env.STUDIO_PIN || '1234';
  const headers = {
    Authorization: `Bearer ${pin}`,
    'Content-Type': 'application/json'
  };

  try {
    const body = JSON.stringify({ url: 'http://127.0.0.1/x.jpg' });
    const r1 = await fetch(`${base}/api/upload-reference-url`, { method: 'POST', headers, body });
    // SSRF → 400 normally
    assert.notEqual(r1.status, 429);
    const r2 = await fetch(`${base}/api/upload-reference-url`, { method: 'POST', headers, body });
    assert.equal(r2.status, 429);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    auth._resetApiRateLimitsForTests();
    clearRateEnv();
  }
});
