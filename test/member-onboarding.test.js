const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

process.env.DISABLE_GIT_BACKUP = '1';
process.env.STUDIO_PIN = process.env.STUDIO_PIN || '1234';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-session-secret';

const db = require('../db');
const app = require('../server');

async function withServer(fn) {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('settings keys: member cannot write .env; admin can', async () => {
  const member = db.createStudioProfile({ name: `KeysMem_${Date.now()}`, pin: '667700', role: 'member' });

  await withServer(async (base) => {
    const { loginSession } = require('./helpers/session');
    const mem = await loginSession(base, { pin: '667700', profileId: member.id });
    const forbid = await fetch(`${base}/api/settings/keys`, {
      method: 'POST',
      headers: mem.jsonHeaders(),
      body: JSON.stringify({ geminiApiKey: 'should-not-save' })
    });
    assert.equal(forbid.status, 403);

    const admin = await loginSession(base);
    const allow = await fetch(`${base}/api/settings/keys`, {
      method: 'POST',
      headers: admin.jsonHeaders(),
      body: JSON.stringify({})
    });
    assert.notEqual(allow.status, 403);
  });

  db.deleteStudioProfile(member.id);
});

test('invite redeem returns member profile ready for empty onboarding', async () => {
  const adminId = db.ensureDefaultStudioProfile();
  const invite = db.createStudioInvite({
    invitedBy: adminId,
    note: 'onboard-test',
    expiresInDays: 3,
    maxUses: 1
  });

  await withServer(async (base) => {
    const name = `Onboard_${Date.now()}`;
    const redeem = await fetch(`${base}/api/invites/redeem`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: invite.code, name, pin: '424200' })
    });
    const data = await redeem.json();
    assert.equal(data.success, true, data.message || 'redeem');
    assert.equal(data.profile.role, 'member');
    assert.equal(data.profile.name, name);

    const cookie = (redeem.headers.getSetCookie?.()?.[0] || redeem.headers.get('set-cookie') || '').split(';')[0];
    const roster = await fetch(`${base}/api/data`, { headers: { Cookie: cookie } });
    const body = await roster.json();
    assert.equal((body.personas || []).length, 0);
    assert.equal(body.profile?.role, 'member');
  });
});
