/**
 * P0-Q1 — mutaciones del front deben usar authFetch (CSRF), no fetch directo.
 * Allowlist mínima: login, redeem, logout (envía CSRF a mano).
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const APP_JS = path.join(__dirname, '..', 'app.js');

/** Rutas API donde fetch directo está permitido (método mutante). */
const ALLOWLIST = new Set([
  '/api/auth/login',
  '/api/invites/redeem',
  '/api/auth/logout'
]);

test('app.js: fetch mutante a /api/* usa authFetch (salvo allowlist)', () => {
  const src = fs.readFileSync(APP_JS, 'utf8');

  // fetch('/api/...', { method: 'POST'|PUT|PATCH|DELETE ... })
  const callRe = /\bfetch\s*\(\s*(['"`])(\/api\/[^'"`]+)\1\s*(?:,\s*\{([^}]*)\})?/g;
  const offenders = [];
  let m;
  while ((m = callRe.exec(src)) !== null) {
    const url = m[2].split('?')[0];
    const opts = m[3] || '';
    const methodMatch = opts.match(/method\s*:\s*['"`](POST|PUT|PATCH|DELETE)['"`]/i);
    if (!methodMatch) continue; // GET / sin method = seguro
    if (ALLOWLIST.has(url)) continue;
    const line = src.slice(0, m.index).split('\n').length;
    offenders.push({ line, url, method: methodMatch[1].toUpperCase() });
  }

  assert.deepEqual(
    offenders,
    [],
    `Mutaciones con fetch directo (usar authFetch):\n${offenders
      .map((o) => `  L${o.line} ${o.method} ${o.url}`)
      .join('\n')}`
  );
});

test('app.js: bulk-generate usa authFetch', () => {
  const src = fs.readFileSync(APP_JS, 'utf8');
  assert.match(src, /authFetch\s*\(\s*['"`]\/api\/ads\/bulk-generate['"`]/);
  assert.doesNotMatch(src, /\bfetch\s*\(\s*['"`]\/api\/ads\/bulk-generate['"`]/);
});
