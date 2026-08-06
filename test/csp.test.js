/**
 * Sec CSP — política endurecida + cabeceras HTTP.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

process.env.DISABLE_GIT_BACKUP = '1';
delete process.env.CSP_REPORT_ONLY;
delete process.env.CSP_ALLOW_HTTPS_IMG;

const auth = require('../auth');
const app = require('../server');

async function withServer(fn) {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await fn(base);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('buildContentSecurityPolicy: connect-src solo self; sin https: wildcard en img', () => {
  const csp = auth.buildContentSecurityPolicy({});
  assert.match(csp, /connect-src 'self'/);
  assert.doesNotMatch(csp, /connect-src[^;]*https:/);
  assert.match(csp, /img-src 'self' data: blob:/);
  assert.doesNotMatch(csp, /img-src[^;]*https:/);
  assert.match(csp, /object-src 'none'/);
  assert.match(csp, /base-uri 'self'/);
  assert.match(csp, /form-action 'self'/);
  assert.match(csp, /frame-ancestors 'self'/);
  assert.match(csp, /script-src 'self' 'unsafe-inline'/);
  assert.match(csp, /style-src 'self' 'unsafe-inline' https:\/\/fonts\.googleapis\.com/);
});

test('buildContentSecurityPolicy: CSP_ALLOW_HTTPS_IMG=1 reañade https: a img-src', () => {
  const csp = auth.buildContentSecurityPolicy({ CSP_ALLOW_HTTPS_IMG: '1' });
  assert.match(csp, /img-src 'self' data: blob: https:/);
});

test('GET / envía Content-Security-Policy endurecida', async () => {
  delete process.env.CSP_REPORT_ONLY;
  await withServer(async (base) => {
    const res = await fetch(`${base}/`);
    assert.equal(res.status, 200);
    const csp = res.headers.get('content-security-policy');
    assert.ok(csp, 'falta Content-Security-Policy');
    assert.equal(res.headers.get('content-security-policy-report-only'), null);
    assert.match(csp, /connect-src 'self'/);
    assert.doesNotMatch(csp, /connect-src[^;]*https:/);
    assert.match(csp, /object-src 'none'/);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(res.headers.get('x-frame-options'), 'SAMEORIGIN');
  });
});

test('CSP_REPORT_ONLY=1 usa Report-Only y no enforce', async () => {
  const prev = process.env.CSP_REPORT_ONLY;
  process.env.CSP_REPORT_ONLY = '1';
  try {
    assert.equal(auth.isCspReportOnly(), true);
    await withServer(async (base) => {
      const res = await fetch(`${base}/`);
      assert.equal(res.status, 200);
      assert.equal(res.headers.get('content-security-policy'), null);
      const report = res.headers.get('content-security-policy-report-only');
      assert.ok(report);
      assert.match(report, /connect-src 'self'/);
    });
  } finally {
    if (prev === undefined) delete process.env.CSP_REPORT_ONLY;
    else process.env.CSP_REPORT_ONLY = prev;
  }
});
