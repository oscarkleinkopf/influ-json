/**
 * Sec #2 — gate /assets/references|generated, cookie-first UI contract,
 * and X-Forwarded-For hardening for login rate-limit keys.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

process.env.DISABLE_GIT_BACKUP = '1';
process.env.STUDIO_PIN = process.env.STUDIO_PIN || '1234';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-session-secret-sec2';
delete process.env.TRUST_PROXY;

const auth = require('../auth');
const app = require('../server');

const ASSETS = path.join(__dirname, '..', 'assets');
const REF_DIR = path.join(ASSETS, 'references');
const GEN_DIR = path.join(ASSETS, 'generated');
const GUIDE = path.join(ASSETS, 'guides', 'como-usar-hero.png');

function authHeaders(extra = {}) {
  const pin = (process.env.STUDIO_PIN || '1234').trim();
  return pin ? { ...extra, Authorization: `Bearer ${pin}` } : extra;
}

function cookieFrom(res) {
  const multi = res.headers.getSetCookie?.();
  if (multi && multi.length) return multi.map((c) => c.split(';')[0]).join('; ');
  const raw = res.headers.get('set-cookie');
  if (!raw) return '';
  return raw.split(',').map((c) => c.split(';')[0].trim()).filter(Boolean).join('; ');
}

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

test('clientKey ignores spoofed X-Forwarded-For unless TRUST_PROXY=1', () => {
  const prev = process.env.TRUST_PROXY;
  try {
    delete process.env.TRUST_PROXY;
    const socketIp = '10.0.0.42';
    const spoof = '198.51.100.99';
    const req = {
      ip: spoof,
      headers: { 'x-forwarded-for': spoof },
      socket: { remoteAddress: socketIp }
    };
    assert.equal(auth.clientKey(req), socketIp);

    // Lock by real socket; spoofed header alone must not share that bucket
    for (let i = 0; i < 5; i++) auth.registerLoginFailure(req);
    assert.equal(auth.getLoginLockStatus(req).locked, true);

    const spoofOnly = {
      ip: spoof,
      headers: { 'x-forwarded-for': spoof },
      socket: { remoteAddress: '10.0.0.99' }
    };
    assert.equal(auth.getLoginLockStatus(spoofOnly).locked, false);
    auth.clearLoginFailures(req);

    process.env.TRUST_PROXY = '1';
    // Re-read via env — isTrustProxyEnabled reads process.env each call
    assert.equal(auth.isTrustProxyEnabled(), true);
    const trusted = {
      ip: spoof,
      headers: { 'x-forwarded-for': spoof },
      socket: { remoteAddress: socketIp }
    };
    assert.equal(auth.clientKey(trusted), spoof);
  } finally {
    if (prev === undefined) delete process.env.TRUST_PROXY;
    else process.env.TRUST_PROXY = prev;
  }
});

test('GET /assets/references and /generated require auth; guides stay public', async () => {
  fs.mkdirSync(REF_DIR, { recursive: true });
  fs.mkdirSync(GEN_DIR, { recursive: true });
  const stamp = Date.now();
  const refName = `sec2_ref_${stamp}.txt`;
  const genName = `sec2_gen_${stamp}.txt`;
  const refPath = path.join(REF_DIR, refName);
  const genPath = path.join(GEN_DIR, genName);
  fs.writeFileSync(refPath, 'sec2-ref');
  fs.writeFileSync(genPath, 'sec2-gen');

  try {
    await withServer(async (base) => {
      const unauthRef = await fetch(`${base}/assets/references/${refName}`);
      assert.equal(unauthRef.status, 401);

      const unauthGen = await fetch(`${base}/assets/generated/${genName}`);
      assert.equal(unauthGen.status, 401);

      if (fs.existsSync(GUIDE)) {
        const guide = await fetch(`${base}/assets/guides/como-usar-hero.png`);
        assert.equal(guide.status, 200);
      }

      const demoPng = path.join(ASSETS, 'influencer_female.png');
      if (fs.existsSync(demoPng)) {
        const pub = await fetch(`${base}/assets/influencer_female.png`);
        assert.equal(pub.status, 200);
      }

      // Bearer still works (CLI / tests)
      const bearerRef = await fetch(`${base}/assets/references/${refName}`, {
        headers: authHeaders()
      });
      assert.equal(bearerRef.status, 200);
      assert.equal(await bearerRef.text(), 'sec2-ref');

      // Cookie session (browser <img> path)
      const pin = (process.env.STUDIO_PIN || '1234').trim();
      const login = await fetch(`${base}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin })
      });
      assert.equal(login.status, 200);
      const cookie = cookieFrom(login);
      assert.ok(cookie.includes('influ.sid'));

      const cookieRef = await fetch(`${base}/assets/references/${refName}`, {
        headers: { Cookie: cookie }
      });
      assert.equal(cookieRef.status, 200);
      assert.equal(await cookieRef.text(), 'sec2-ref');

      const cookieGen = await fetch(`${base}/assets/generated/${genName}`, {
        headers: { Cookie: cookie }
      });
      assert.equal(cookieGen.status, 200);
      assert.equal(await cookieGen.text(), 'sec2-gen');
    });
  } finally {
    try { fs.unlinkSync(refPath); } catch (_) {}
    try { fs.unlinkSync(genPath); } catch (_) {}
  }
});

test('app.js cookie-first: no sessionStorage studioPin; authFetch omits Bearer', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  assert.match(src, /sessionStorage\.removeItem\(['"]studioPin['"]\)/);
  assert.doesNotMatch(src, /sessionStorage\.setItem\(\s*['"]studioPin['"]/);
  assert.doesNotMatch(src, /Authorization['"]\s*\]\s*=\s*`Bearer/);
  assert.doesNotMatch(src, /Authorization['"]\s*\]\s*=\s*['"]Bearer/);
  assert.match(src, /options\.credentials\s*=\s*options\.credentials\s*\|\|\s*['"]same-origin['"]/);
});
