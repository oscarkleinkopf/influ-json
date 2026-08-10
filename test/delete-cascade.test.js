/**
 * Foreign-key CASCADE: deleting a persona must wipe child rows.
 * Requires db.pragma('foreign_keys = ON') after opening better-sqlite3.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

process.env.DISABLE_GIT_BACKUP = '1';
process.env.ENABLE_GIT_BACKUP = '';
process.env.STUDIO_PIN = process.env.STUDIO_PIN || '1234';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-session-secret';
process.env.INFLU_SKIP_ENV_PERSIST = '1';

const dbService = require('../db');
const app = require('../server');

function countForPersona(table, personaId) {
  return dbService.db.prepare(`SELECT COUNT(*) AS c FROM ${table} WHERE persona_id = ?`).get(personaId).c;
}

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

test('db.js enables foreign_keys pragma after open', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'db.js'), 'utf8');
  assert.match(src, /db\.pragma\(\s*['"]foreign_keys\s*=\s*ON['"]\s*\)/);
  assert.equal(dbService.db.pragma('foreign_keys', { simple: true }), 1);
});

test('deletePersona CASCADE: variant + version + generation + campaign_personas', () => {
  const name = `CascadeUnit_${Date.now()}`;
  const persona = dbService.savePersona({
    name,
    gender: 'Female',
    age: '24',
    forceCreate: true,
    detailedJSON: {
      identity: { name },
      character_lock: {
        version: 1,
        free_tier: true,
        must_match_every_image: { name, skin_tone: 'Piel clara' }
      }
    }
  });
  assert.ok(persona?.id);

  // Version row (savePersona update path)
  dbService.savePersona({
    ...persona,
    forceCreate: false,
    name: `${name}_v2`,
    detailedJSON: persona.detailedJSON
  });

  const variant = dbService.saveVariant({
    persona_id: persona.id,
    pose: 'standing',
    clothing: 'casual',
    attitude: 'smile',
    setting: 'studio',
    image_path: 'assets/influencer_female.png'
  });
  assert.ok(variant?.id);

  dbService.saveGeneration({
    persona_id: persona.id,
    prompt: 'cascade test',
    image_path: 'assets/influencer_female.png',
    generation_type: 'portrait'
  });

  const campaign = dbService.saveCampaign(
    { name: `CampCascade_${Date.now()}`, status: 'draft' },
    [persona.id]
  );
  assert.ok(campaign?.id);

  assert.ok(countForPersona('versions', persona.id) >= 1);
  assert.equal(countForPersona('persona_variants', persona.id), 1);
  assert.equal(countForPersona('generation_history', persona.id), 1);
  assert.equal(countForPersona('campaign_personas', persona.id), 1);

  dbService.deletePersona(persona.id);

  assert.equal(dbService.getPersonaById(persona.id) ?? null, null);
  assert.equal(countForPersona('versions', persona.id), 0);
  assert.equal(countForPersona('persona_variants', persona.id), 0);
  assert.equal(countForPersona('generation_history', persona.id), 0);
  assert.equal(countForPersona('campaign_personas', persona.id), 0);

  // Campaign itself should remain (only join row cascades)
  assert.ok(dbService.getCampaignById(campaign.id));
  try {
    dbService.deleteCampaign(campaign.id);
  } catch (_) {}
});

test('DELETE /api/personas/:id leaves no child rows for that id', async () => {
  await withServer(async (base) => {
    const name = `CascadeApi_${Date.now()}`;
    const persona = dbService.savePersona({
      name,
      gender: 'Female',
      age: '25',
      forceCreate: true,
      detailedJSON: {
        identity: { name },
        character_lock: {
          version: 1,
          free_tier: true,
          must_match_every_image: { name, skin_tone_hex: '#f0d5c0' }
        }
      }
    });

    dbService.savePersona({
      ...persona,
      forceCreate: false,
      name: `${name}_edited`,
      detailedJSON: persona.detailedJSON
    });

    dbService.saveVariant({
      persona_id: persona.id,
      pose: 'portrait',
      clothing: 'blouse',
      attitude: 'soft',
      setting: 'window',
      image_path: 'assets/influencer_female.png'
    });

    dbService.saveGeneration({
      persona_id: persona.id,
      prompt: 'api cascade',
      image_path: 'assets/influencer_female.png',
      generation_type: 'ugc'
    });

    const campaign = dbService.saveCampaign(
      { name: `CampApiCascade_${Date.now()}`, status: 'draft' },
      [persona.id]
    );

    assert.ok(countForPersona('versions', persona.id) >= 1);
    assert.equal(countForPersona('persona_variants', persona.id), 1);
    assert.equal(countForPersona('generation_history', persona.id), 1);
    assert.equal(countForPersona('campaign_personas', persona.id), 1);

    const res = await fetch(`${base}/api/personas/${persona.id}`, {
      method: 'DELETE',
      headers: authHeaders()
    });
    const body = await res.json();
    assert.equal(res.status, 200, JSON.stringify(body));
    assert.equal(body.success, true);

    assert.equal(dbService.getPersonaById(persona.id) ?? null, null);
    assert.equal(countForPersona('versions', persona.id), 0);
    assert.equal(countForPersona('persona_variants', persona.id), 0);
    assert.equal(countForPersona('generation_history', persona.id), 0);
    assert.equal(countForPersona('campaign_personas', persona.id), 0);

    try {
      dbService.deleteCampaign(campaign.id);
    } catch (_) {}
  });
});
