/**
 * Corte A / P0-F1 — lote de anuncios: CSRF + enqueue(label,fn) + ownership.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

process.env.DISABLE_GIT_BACKUP = '1';
process.env.ENABLE_GIT_BACKUP = '';
process.env.GEN_MIN_GAP_MS = '0';
process.env.GEN_429_COOLDOWN_MS = '10';
process.env.BULK_ADS_TEST_MATRIX = '1';
process.env.STUDIO_PIN = process.env.STUDIO_PIN || '1234';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-session-secret-bulk-ads';
process.env.INFLU_SKIP_ENV_PERSIST = '1';
delete process.env.CSRF_PROTECTION;

const dbService = require('../db');
const aiService = require('../ai-service');
const genQueue = require('../gen-queue');
const app = require('../server');
const { loginSession } = require('./helpers/session');

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

async function waitForBatch(base, session, batchId, { timeoutMs = 8000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await fetch(`${base}/api/ads/batch-status/${batchId}`, {
      headers: session.headers()
    });
    const data = await res.json();
    if (data.success && data.batch && data.batch.status === 'completed') {
      return data.batch;
    }
    await new Promise((r) => setTimeout(r, 40));
  }
  throw new Error(`batch ${batchId} no completó en ${timeoutMs}ms`);
}

test('bulk ads: cookie sin CSRF → 403; con CSRF + stub → completed (2 tareas)', async () => {
  const orig = aiService.generateInfluencerImage;
  let stubCalls = 0;
  aiService.generateInfluencerImage = async () => {
    stubCalls += 1;
    return `assets/generated/bulk_stub_${stubCalls}.jpg`;
  };
  genQueue._resetForTests();

  try {
    await withServer(async (base) => {
      const session = await loginSession(base);
      assert.equal(session.data.success, true);

      const adminId = dbService.ensureDefaultStudioProfile();
      const persona = dbService.savePersona({
        name: `BulkAds_${Date.now()}`,
        age: '25',
        ethnicity: 'Latina',
        hair: 'dark wavy',
        profile_id: adminId
      });
      const product = dbService.saveProduct({
        name: `ProdBulk_${Date.now()}`,
        benefit: 'beneficio',
        audience: 'a',
        frustration: 'f',
        profile_id: adminId
      });

      const denied = await fetch(`${base}/api/ads/bulk-generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: session.cookie },
        body: JSON.stringify({ personaId: persona.id, productIds: [product.id] })
      });
      assert.equal(denied.status, 403);
      const deniedBody = await denied.json();
      assert.equal(deniedBody.code, 'CSRF');

      const start = await fetch(`${base}/api/ads/bulk-generate`, {
        method: 'POST',
        headers: session.jsonHeaders(),
        body: JSON.stringify({ personaId: persona.id, productIds: [product.id] })
      });
      assert.equal(start.status, 200);
      const startBody = await start.json();
      assert.equal(startBody.success, true);
      assert.equal(startBody.totalTasks, 2);
      assert.ok(startBody.batchId);

      const batch = await waitForBatch(base, session, startBody.batchId);
      assert.equal(batch.status, 'completed');
      assert.equal(batch.completed, 2);
      assert.equal(batch.failed, 0);
      assert.equal(batch.images.length, 2);
      assert.equal(stubCalls, 2);
      assert.equal(typeof batch.profileId, 'undefined', 'no filtrar profileId al cliente');

      const gens = dbService.getGenerationsForPersona(persona.id);
      const bulkGens = gens.filter((g) => g.generation_type === 'bulk_ad');
      assert.ok(bulkGens.length >= 2, `esperaba ≥2 generaciones bulk_ad, got ${bulkGens.length}`);
    });
  } finally {
    aiService.generateInfluencerImage = orig;
    delete process.env.BULK_ADS_TEST_MATRIX;
  }
});

test('bulk ads: otro perfil no ve batch-status (404)', async () => {
  const orig = aiService.generateInfluencerImage;
  aiService.generateInfluencerImage = async () => 'assets/generated/bulk_own.jpg';
  genQueue._resetForTests();
  process.env.BULK_ADS_TEST_MATRIX = '1';

  try {
    await withServer(async (base) => {
      const admin = await loginSession(base);
      const adminId = dbService.ensureDefaultStudioProfile();
      const member = dbService.createStudioProfile({
        name: `BulkMem_${Date.now()}`,
        pin: '778800',
        role: 'member'
      });

      const persona = dbService.savePersona({
        name: `BulkOwn_${Date.now()}`,
        age: '24',
        profile_id: adminId
      });
      const product = dbService.saveProduct({
        name: `ProdOwn_${Date.now()}`,
        benefit: 'b',
        audience: 'a',
        frustration: 'f',
        profile_id: adminId
      });

      const start = await fetch(`${base}/api/ads/bulk-generate`, {
        method: 'POST',
        headers: admin.jsonHeaders(),
        body: JSON.stringify({ personaId: persona.id, productIds: [product.id] })
      });
      const startBody = await start.json();
      assert.equal(startBody.success, true);

      const mem = await loginSession(base, { pin: '778800', profileId: member.id });
      const peek = await fetch(`${base}/api/ads/batch-status/${startBody.batchId}`, {
        headers: mem.headers()
      });
      assert.equal(peek.status, 404);
      const peekBody = await peek.json();
      assert.equal(peekBody.success, false);

      // Owner still sees it (may still be processing)
      const own = await fetch(`${base}/api/ads/batch-status/${startBody.batchId}`, {
        headers: admin.headers()
      });
      assert.equal(own.status, 200);
      const ownBody = await own.json();
      assert.equal(ownBody.success, true);

      await waitForBatch(base, admin, startBody.batchId);
    });
  } finally {
    aiService.generateInfluencerImage = orig;
    delete process.env.BULK_ADS_TEST_MATRIX;
  }
});
