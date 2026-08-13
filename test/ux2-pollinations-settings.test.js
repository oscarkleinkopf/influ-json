/**
 * UX #2 — POLLINATIONS_TOKEN desde Ajustes (admin).
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

process.env.DISABLE_GIT_BACKUP = '1';
process.env.STUDIO_PIN = process.env.STUDIO_PIN || '1234';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-session-secret-ux2';

const root = path.join(__dirname, '..');

test('UI: Ajustes tiene campo pollinationsTokenInput antes de Gemini/Replicate', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  assert.match(html, /id="pollinationsTokenInput"/);
  const pollen = html.indexOf('pollinationsTokenInput');
  const gemini = html.indexOf('geminiKeyInput');
  const rep = html.indexOf('replicateTokenInput');
  assert.ok(pollen > 0 && gemini > pollen && rep > gemini);
  assert.match(html, /Token Pollinations/);
  assert.match(app, /pollinationsToken/);
  assert.match(app, /refreshSettingsKeysStatus/);
  assert.match(app, /\/api\/settings\/keys/);
});

test('admin.js: POST settings/keys acepta pollinationsToken; GET enmascara', () => {
  const admin = fs.readFileSync(path.join(root, 'routes/admin.js'), 'utf8');
  assert.match(admin, /pollinationsToken/);
  assert.match(admin, /POLLINATIONS_TOKEN/);
  assert.match(admin, /app\.get\('\/api\/settings\/keys'/);
  assert.match(admin, /pollinationsConfigured/);
});

test('API: admin puede guardar POLLINATIONS_TOKEN (temp .env)', async () => {
  const prevToken = process.env.POLLINATIONS_TOKEN;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'influ-ux2-'));
  const tmpEnv = path.join(tmpDir, '.env');
  fs.writeFileSync(tmpEnv, 'STUDIO_PIN=1234\nSESSION_SECRET=test\n');

  // Patch by copying approach: call update logic via real server but restore .env
  const envPath = path.join(root, '.env');
  const backup = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : null;
  const hadEnv = fs.existsSync(envPath);

  delete require.cache[require.resolve('../server')];
  delete require.cache[require.resolve('../routes/admin')];
  const app = require('../server');

  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const pin = (process.env.STUDIO_PIN || '1234').trim();

  try {
    const { loginSession } = require('./helpers/session');
    const session = await loginSession(base, { pin });

    const getBefore = await fetch(`${base}/api/settings/keys`, { headers: session.headers() });
    assert.equal(getBefore.status, 200);
    const before = await getBefore.json();
    assert.equal(before.success, true);
    assert.equal(typeof before.pollinationsConfigured, 'boolean');

    const marker = `ux2_test_${Date.now()}`;
    const post = await fetch(`${base}/api/settings/keys`, {
      method: 'POST',
      headers: session.jsonHeaders(),
      body: JSON.stringify({ pollinationsToken: marker })
    });
    const postData = await post.json();
    assert.equal(post.status, 200);
    assert.equal(postData.success, true);
    assert.equal(postData.pollinationsConnected, true);
    assert.equal(process.env.POLLINATIONS_TOKEN, marker);

    const getAfter = await fetch(`${base}/api/settings/keys`, { headers: session.headers() });
    const after = await getAfter.json();
    assert.equal(after.pollinationsConfigured, true);
    assert.equal(after.pollinationsToken, undefined); // never leak
  } finally {
    await new Promise((r) => server.close(r));
    if (backup != null) fs.writeFileSync(envPath, backup);
    else if (!hadEnv && fs.existsSync(envPath)) {
      // leave as was — restore from backup only
    }
    if (prevToken === undefined) delete process.env.POLLINATIONS_TOKEN;
    else process.env.POLLINATIONS_TOKEN = prevToken;
    // Restore token in .env from backup already done
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
  }
});
