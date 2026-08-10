/**
 * Front-end smoke (P0): Studio must serve index.html + app.js, and the served
 * script must wire save → refresh so a persona appears after save.
 *
 * Picked up by `npm test` via test/*.test.js — no new framework.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const vm = require('node:vm');

process.env.DISABLE_GIT_BACKUP = '1';
process.env.ENABLE_GIT_BACKUP = '';
process.env.STUDIO_PIN = process.env.STUDIO_PIN || '1234';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-session-secret';
process.env.INFLU_SKIP_ENV_PERSIST = '1';

const app = require('../server');
const db = require('../db');

function authHeaders(extra = {}) {
  const pin = (process.env.STUDIO_PIN || '1234').trim();
  return pin ? { ...extra, Authorization: `Bearer ${pin}` } : extra;
}

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

function appScriptSrcFromHtml(html) {
  const m = html.match(/<script[^>]+src=["']([^"']*app\.js[^"']*)["']/i);
  assert.ok(m, 'index.html must reference app.js via <script src>');
  return m[1];
}

test('P0 front smoke: / serves index.html, app.js is served+parses, save→appear wired', async () => {
  await withServer(async (base) => {
    const page = await fetch(`${base}/`);
    assert.equal(page.status, 200, 'GET / must return 200');
    const ctype = page.headers.get('content-type') || '';
    assert.match(ctype, /html/i);
    const html = await page.text();
    assert.match(html, /<!DOCTYPE html>/i);
    assert.match(html, /id=["']btnSavePersona["']/, 'save CTA must exist for P0');

    const scriptSrc = appScriptSrcFromHtml(html);
    // Resolve relative script URL the browser would request (keeps ?v= cache-bust)
    const appUrl = new URL(scriptSrc, `${base}/`).toString();
    assert.match(appUrl, /\/app\.js(\?|$)/, `script src must resolve to /app.js (got ${appUrl})`);

    const jsRes = await fetch(appUrl);
    assert.equal(jsRes.status, 200, `served app.js must be 200 (${appUrl})`);
    const js = await jsRes.text();
    assert.ok(js.length > 1000, 'app.js body should not be empty/stub');

    // Syntax-only parse (browser globals are not required)
    assert.doesNotThrow(() => new vm.Script(js, { filename: 'app.js' }), 'served app.js must parse');

    // P0 wiring: save posts to /api/personas, refreshes state.personas, re-renders grids
    assert.match(js, /async function savePersona\b/);
    assert.match(js, /authFetch\(\s*['"]\/api\/personas['"]/);
    assert.match(js, /state\.personas\s*=\s*Array\.isArray\(data\.personas\)/);
    assert.match(js, /function refreshPersonaLists\b/);
    assert.match(js, /function renderPersonaGrids\b/);
    assert.match(js, /refreshPersonaLists\s*\(/);

    // Backend half of “guardé y aparece”: create then list contains the row
    const name = `FrontSmoke_${Date.now()}`;
    const create = await fetch(`${base}/api/personas`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        name,
        gender: 'Female',
        forceCreate: true,
        detailedJSON: {
          identity: { name },
          character_lock: {
            version: 1,
            free_tier: true,
            must_match_every_image: { name }
          }
        }
      })
    });
    const created = await create.json();
    assert.equal(create.status, 200, JSON.stringify(created));
    assert.equal(created.success, true);
    const id = created.persona?.id;
    assert.ok(id, 'create must return persona.id');
    assert.ok(
      (created.personas || []).some((p) => p.id === id),
      'save response personas list must include the new persona (UI refresh source)'
    );

    const listRes = await fetch(`${base}/api/personas`, { headers: authHeaders() });
    const listBody = await listRes.json();
    const personas = Array.isArray(listBody) ? listBody : listBody.personas || [];
    assert.ok(personas.some((p) => p.id === id && p.name === name), 'GET /api/personas must show saved persona');

    try {
      db.deletePersona(id);
    } catch (_) {}
  });
});

test('P0 front smoke fails closed when HTML drops app.js script tag', () => {
  // Documents the failure mode the smoke above would catch (broken script reference).
  assert.throws(
    () => appScriptSrcFromHtml('<html><body>no script</body></html>'),
    /app\.js/
  );
});
