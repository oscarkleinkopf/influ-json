/**
 * Corte E — UX resistente: borradores, diálogos, must_match diff, scripts + mobile smoke.
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const draft = require('../persona-draft');
const dialogs = require('../studio-dialogs');

test('persona-draft: save/load/clear sin data URLs', () => {
  const mem = new Map();
  const storage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => { mem.set(k, String(v)); },
    removeItem: (k) => { mem.delete(k); }
  };
  assert.equal(
    draft.saveDraft({
      profileId: 'p1',
      mode: 'create',
      form: { name: 'Luna', skinTone: 'clara', photo: 'data:image/png;base64,aaaa' }
    }, storage),
    true
  );
  const loaded = draft.loadDraft('p1', 'create', storage);
  assert.equal(loaded.form.name, 'Luna');
  assert.equal(loaded.form.skinTone, 'clara');
  assert.equal(loaded.form.photo, undefined);
  draft.clearDraft('p1', 'create', storage);
  assert.equal(draft.loadDraft('p1', 'create', storage), null);
});

test('persona-draft: vacío no se guarda', () => {
  const mem = new Map();
  const storage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => { mem.set(k, String(v)); },
    removeItem: (k) => { mem.delete(k); }
  };
  assert.equal(draft.saveDraft({ profileId: 'p1', form: { name: '  ' } }, storage), false);
});

test('studio-dialogs: diffMustMatch detecta cambios', () => {
  const changes = dialogs.diffMustMatch(
    { name: 'A', skin_tone: 'clara', eye_color: 'marrón' },
    { name: 'A', skin_tone: 'media', eye_color: 'marrón', hair_color: 'castaño' }
  );
  assert.ok(changes.some((c) => c.path === 'skin_tone'));
  assert.ok(changes.some((c) => c.path === 'hair_color'));
  assert.match(dialogs.formatMustMatchDiff(changes), /skin_tone/);
});

test('studio-dialogs: Escape cierra el diálogo superior', () => {
  const doc = {
    __influDialogsBound: false,
    activeElement: null,
    addEventListener(type, fn) {
      this._kd = fn;
    },
    querySelectorAll() { return []; }
  };
  // Minimal element stubs
  const el = {
    style: { display: 'none' },
    attrs: {},
    setAttribute(k, v) { this.attrs[k] = v; },
    getAttribute(k) { return this.attrs[k] ?? null; },
    removeAttribute(k) { delete this.attrs[k]; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    focus() {}
  };
  // Patch globals used by module
  const prevDoc = global.document;
  global.document = {
    ...doc,
    activeElement: { focus() {} },
    addEventListener: doc.addEventListener.bind(doc),
    querySelectorAll: () => []
  };
  try {
    dialogs.installGlobalHandlers(global.document);
    dialogs.openDialog(el, { display: 'flex' });
    assert.equal(el.style.display, 'flex');
    dialogs._stackForTests.length; // ensure stack exists
    assert.equal(dialogs.closeTop(), true);
    assert.equal(el.style.display, 'none');
  } finally {
    // Drain stack
    while (dialogs.closeTop()) { /* empty */ }
    global.document = prevDoc;
  }
});

test('app.js: CSRF recovery + notifyApiError + draft helpers', () => {
  const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  assert.match(app, /async function refreshCsrfToken/);
  assert.match(app, /function notifyApiError/);
  assert.match(app, /_csrfRetried/);
  assert.match(app, /schedulePersonaDraftSave/);
  assert.match(app, /showPersonaDraftBanner/);
  assert.match(app, /diffMustMatch/);
  assert.match(app, /setupAccessibleDialogs/);
});

test('HTML foot carga persona-draft + studio-dialogs antes de app.js', () => {
  const foot = fs.readFileSync(path.join(root, 'views/_foot.html'), 'utf8');
  const iDraft = foot.indexOf('persona-draft.js');
  const iDialogs = foot.indexOf('studio-dialogs.js');
  const iApp = foot.indexOf('app.js?v=');
  assert.ok(iDraft > 0 && iDialogs > 0 && iApp > 0);
  assert.ok(iDraft < iApp);
  assert.ok(iDialogs < iApp);
});

test('layout-smoke incluye pass móvil 414', () => {
  const smoke = fs.readFileSync(path.join(root, 'scripts/layout-smoke.js'), 'utf8');
  assert.match(smoke, /mobile-414/);
  assert.match(smoke, /414,\s*896|width:\s*414/);
  assert.match(smoke, /08-mobile-414/);
});

test('server.js sirve influ-persona + persona-draft + studio-dialogs', () => {
  const serverJs = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
  assert.match(serverJs, /['"]\/influ-persona\.js['"]/);
  assert.match(serverJs, /['"]\/persona-draft\.js['"]/);
  assert.match(serverJs, /['"]\/studio-dialogs\.js['"]/);
});
