const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const personasRoutes = require('../routes/personas');

test('routes/personas exporta registerPersonasRoutes y scoreVariantAgainstPersona', () => {
  assert.equal(typeof personasRoutes.registerPersonasRoutes, 'function');
  assert.equal(typeof personasRoutes.scoreVariantAgainstPersona, 'function');
});

test('scoreVariantAgainstPersona: misma path → distance 0', async () => {
  const fake = {
    scoreAgainstAnchor: async () => {
      throw new Error('no debería llamarse');
    }
  };
  const scored = await personasRoutes.scoreVariantAgainstPersona(
    fake,
    { image: 'assets/a.jpg' },
    'assets/a.jpg'
  );
  assert.equal(scored.distance, 0);
  assert.equal(scored.grade, 'ok');
});

test('scoreVariantAgainstPersona: sin ancla → null', async () => {
  const scored = await personasRoutes.scoreVariantAgainstPersona(
    {},
    { image: null },
    'assets/a.jpg'
  );
  assert.equal(scored, null);
});

test('server.js registra routes/personas y ya no define CRUD inline', () => {
  const js = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert.match(js, /require\('\.\/routes\/personas'\)/);
  assert.match(js, /registerPersonasRoutes\(app/);
  assert.doesNotMatch(js, /\/\/ Personas endpoints\napp\.get\('\/api\/personas'/);
  assert.doesNotMatch(js, /async function scoreVariantAgainstPersona\(/);
  assert.match(js, /_personaBg\.trigger = triggerBackgroundVariants/);
});

test('routes/personas.js monta export + license + variants', () => {
  const js = fs.readFileSync(path.join(__dirname, '..', 'routes', 'personas.js'), 'utf8');
  assert.match(js, /\/api\/personas\/:id\/variants/);
  assert.match(js, /\/api\/personas\/:id\/commercial-license/);
  assert.match(js, /\/api\/export\/persona\/:id/);
  assert.match(js, /\/api\/personas\/:id\/versions/);
  assert.match(js, /require\('\.\.\/brand-kit'\)/);
});
