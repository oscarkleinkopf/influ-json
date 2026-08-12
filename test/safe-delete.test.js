const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('path');

test('deletePersonaAction archiva por defecto y ofrece Deshacer', () => {
  const js = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  assert.match(js, /async function deletePersonaAction/);
  assert.match(js, /\/api\/personas\/\$\{id\}\/archive/);
  assert.match(js, /actionLabel: 'Deshacer'/);
  assert.match(js, /hardDelete/);
  assert.match(js, /BORRADO PERMANENTE/);
  // Ya no confirma borrado permanente como único camino
  assert.doesNotMatch(
    js,
    /eliminar permanentemente al influencer "\$\{state\.selectedPersona\.name\}"/
  );
});

test('showAppToast soporta actionLabel/onAction', () => {
  // UX-4: toast vive en studio-toast.js (app.js solo reexporta)
  const toastJs = fs.readFileSync(path.join(__dirname, '..', 'studio-toast.js'), 'utf8');
  assert.match(toastJs, /opts\.actionLabel/);
  assert.match(toastJs, /toast-action-btn/);
  const appJs = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  assert.match(appJs, /InfluStudioToast/);
});
