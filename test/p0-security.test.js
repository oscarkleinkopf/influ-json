const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

process.env.DISABLE_GIT_BACKUP = '1';
process.env.ENABLE_GIT_BACKUP = '';
process.env.GEN_MIN_GAP_MS = '10';
process.env.GEN_429_COOLDOWN_MS = '50';

const dbService = require('../db');
const aiService = require('../ai-service');
const app = require('../server');

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

test('POST /api/ai/analyze-photo rechaza path traversal (400)', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/api/ai/analyze-photo`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ imagePath: '../../../etc/passwd' })
    });
    const data = await res.json();
    assert.equal(res.status, 400);
    assert.equal(data.success, false);
    assert.match(String(data.message), /inválida|permitida/i);
  });
});

test('POST /api/upload-reference-url bloquea SSRF localhost (400)', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/api/upload-reference-url`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ url: 'http://127.0.0.1/secret.jpg' })
    });
    const data = await res.json();
    assert.equal(res.status, 400);
    assert.equal(data.success, false);
    assert.match(String(data.message), /privada|local|bloqueada|URL|inválida/i);
  });
});

test('member no puede borrar generation ni generar imagen de persona ajena', async () => {
  const orig = aiService.generateInfluencerImage;
  aiService.generateInfluencerImage = async () => 'assets/generated/mock_p0.jpg';

  try {
    await withServer(async (base) => {
      const adminPin = (process.env.STUDIO_PIN || '1234').trim();
      const memberPin = `mp${Date.now().toString().slice(-8)}`;

      const adminLogin = await fetch(`${base}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: adminPin })
      });
      const adminData = await adminLogin.json();
      assert.equal(adminData.success, true, adminData.message || 'admin login');
      const adminCookie = cookieFrom(adminLogin);

      const inviteRes = await fetch(`${base}/api/invites`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: adminCookie,
          Authorization: `Bearer ${adminPin}`
        },
        body: JSON.stringify({ note: 'p0-security' })
      });
      const invite = await inviteRes.json();
      assert.equal(invite.success, true, invite.message || 'invite');
      assert.ok(invite.invite?.code);

      const redeemRes = await fetch(`${base}/api/invites/redeem`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: invite.invite.code,
          name: `P0Mem_${Date.now()}`,
          pin: memberPin
        })
      });
      const redeemed = await redeemRes.json();
      assert.equal(redeemed.success, true, redeemed.message || 'redeem');
      const memberCookie = cookieFrom(redeemRes);

      const adminId = dbService.ensureDefaultStudioProfile();
      const adminPersona = dbService.savePersona({
        name: `P0AdminPersona_${Date.now()}`,
        gender: 'Female',
        forceCreate: true,
        profile_id: adminId
      });
      const genId = dbService.saveGeneration({
        persona_id: adminPersona.id,
        prompt: 'secret',
        image_path: 'assets/generated/secret.jpg',
        generation_type: 'portrait'
      });

      const delRes = await fetch(`${base}/api/generations/${genId}`, {
        method: 'DELETE',
        headers: { Cookie: memberCookie }
      });
      assert.equal(delRes.status, 404);

      const still = dbService.getGenerationById(genId);
      assert.ok(still, 'generation debe seguir existiendo');

      const genRes = await fetch(`${base}/api/ai/generate-image`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: memberCookie
        },
        body: JSON.stringify({
          prompt: 'hijack',
          personaId: adminPersona.id,
          generationType: 'portrait'
        })
      });
      assert.equal(genRes.status, 404);

      // Cleanup
      dbService.deleteGeneration(genId);
      dbService.deletePersona(adminPersona.id);
      if (redeemed.profile?.id) {
        try { dbService.deleteStudioProfile(redeemed.profile.id); } catch (_) {}
      }
    });
  } finally {
    aiService.generateInfluencerImage = orig;
  }
});
