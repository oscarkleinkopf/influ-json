/**
 * Login cookie + CSRF para tests de mutaciones sin Bearer.
 */
'use strict';

function cookieFrom(res) {
  const multi = res.headers.getSetCookie?.();
  if (multi && multi.length) return multi.map((c) => c.split(';')[0]).join('; ');
  const raw = res.headers.get('set-cookie');
  if (!raw) return '';
  return raw.split(',').map((c) => c.split(';')[0].trim()).filter(Boolean).join('; ');
}

/**
 * @param {string} base
 * @param {{ pin?: string, profileId?: string }} [opts]
 */
async function loginSession(base, opts = {}) {
  const pin = opts.pin != null ? opts.pin : (process.env.STUDIO_PIN || '1234');
  const body = { pin };
  if (opts.profileId) body.profileId = opts.profileId;
  const res = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await res.json();
  const cookie = cookieFrom(res);
  const csrf = data.csrfToken || null;
  return {
    res,
    data,
    cookie,
    csrf,
    headers(extra = {}) {
      const h = { Cookie: cookie, ...extra };
      if (csrf) h['X-CSRF-Token'] = csrf;
      return h;
    },
    jsonHeaders(extra = {}) {
      return this.headers({ 'Content-Type': 'application/json', ...extra });
    }
  };
}

module.exports = { cookieFrom, loginSession };
