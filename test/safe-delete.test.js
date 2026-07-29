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
  const js = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  assert.match(js, /opts\.actionLabel/);
  assert.match(js, /toast-action-btn/);
});
