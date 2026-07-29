const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('path');

const {
  inviteStatus,
  registerInviteRedeemRoute,
  registerAdminRoutes
} = require('../routes/admin');

test('routes/admin exporta register + inviteStatus', () => {
  assert.equal(typeof registerInviteRedeemRoute, 'function');
  assert.equal(typeof registerAdminRoutes, 'function');
  assert.equal(typeof inviteStatus, 'function');
});

test('inviteStatus: active / revoked / expired / used', () => {
  assert.equal(inviteStatus({ use_count: 0, max_uses: 1 }), 'active');
  assert.equal(inviteStatus({ revoked_at: '2026-01-01' }), 'revoked');
  assert.equal(inviteStatus({ expires_at: '2000-01-01T00:00:00.000Z', use_count: 0 }), 'expired');
  assert.equal(inviteStatus({ use_count: 1, max_uses: 1 }), 'used');
  assert.equal(inviteStatus(null), 'unknown');
});

test('server.js registra admin (redeem público + routes protegidas)', () => {
  const js = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert.match(js, /require\('\.\/routes\/admin'\)/);
  assert.match(js, /registerInviteRedeemRoute\(app/);
  assert.match(js, /registerAdminRoutes\(app/);
  // redeem before requireAuth
  const iRedeem = js.indexOf('registerInviteRedeemRoute');
  const iAuth = js.indexOf("app.use('/api', requireAuth)");
  assert.ok(iRedeem > 0 && iAuth > iRedeem);
  assert.doesNotMatch(js, /function inviteStatus\(/);
  assert.doesNotMatch(js, /\/\/ Profiles CRUD \(local multi-user\)/);
  assert.doesNotMatch(js, /\/\/ Backups SQLite \(solo Administración\)/);
});

test('routes/admin.js monta profiles, invites, backups, settings', () => {
  const js = fs.readFileSync(path.join(__dirname, '..', 'routes', 'admin.js'), 'utf8');
  assert.match(js, /\/api\/profiles/);
  assert.match(js, /\/api\/invites/);
  assert.match(js, /\/api\/invites\/redeem/);
  assert.match(js, /\/api\/backups/);
  assert.match(js, /\/api\/export\/studio/);
  assert.match(js, /\/api\/settings\/keys/);
});
