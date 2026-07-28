const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execSync } = require('node:child_process');

process.env.DISABLE_GIT_BACKUP = '1';
process.env.STUDIO_PIN = process.env.STUDIO_PIN || '1234';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-session-secret';

const niches = require('../niche-presets');
const brandKit = require('../brand-kit');
const db = require('../db');
const app = require('../server');

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

test('niche presets: beauty/fitness/moda expose form + lock extras', () => {
  const list = niches.listNichePresets();
  assert.equal(list.length, 3);
  assert.ok(list.some((n) => n.id === 'beauty'));
  const beauty = niches.formValuesFromNiche('beauty');
  assert.ok(beauty.pStyle.toLowerCase().includes('beauty') || beauty.pStyle.toLowerCase().includes('skincare'));
  assert.ok(beauty.pSkinTone);
  assert.equal(beauty._lockExtras.niche, 'beauty');
  assert.ok(Array.isArray(beauty._lockExtras.recommended_packs));
  assert.equal(niches.formValuesFromNiche('nope'), null);
});

test('brand-kit: builds packs + ugc script for persona', () => {
  const persona = {
    id: 'test-persona',
    name: 'KitTest',
    gender: 'Female',
    age: '25 años',
    ethnicity: 'Latina',
    detailedJSON: {
      niche: 'beauty',
      facial_features: { skin_tone: 'piel clara', skin_tone_hex: '#f0d5c0' },
      personality: { mbti: 'ENFP', communication_style: 'cercana' },
      character_lock: {
        version: 1,
        niche: 'beauty',
        must_match_every_image: { name: 'KitTest', skin_tone: 'piel clara' }
      }
    }
  };
  const { files, nicheId } = brandKit.buildBrandKitFiles(persona);
  assert.equal(nicheId, 'beauty');
  const names = files.map((f) => f.name);
  assert.ok(names.includes('character_lock.json'));
  assert.ok(names.includes('guion_ugc_15s.txt'));
  assert.ok(names.includes('COMO_USAR_KIT.txt'));
  assert.ok(names.includes('packs/fullbody.txt'));
  assert.ok(names.includes('packs/product.txt'));
  const script = files.find((f) => f.name === 'guion_ugc_15s.txt').content;
  assert.match(script, /HOOK|CTA|KitTest/i);
});

test('API: niches list + brand kit ZIP contains guion', async () => {
  const persona = db.savePersona({
    name: `NicheKit_${Date.now()}`,
    gender: 'Female',
    age: '24 años',
    ethnicity: 'Latina',
    forceCreate: true,
    detailedJSON: {
      niche: 'moda',
      character_lock: {
        version: 1,
        niche: 'moda',
        must_match_every_image: { name: 'ModaTest', skin_tone: 'piel clara' }
      }
    }
  });

  await withServer(async (base) => {
    const nichesRes = await fetch(`${base}/api/niches`, { headers: authHeaders() });
    const nichesJson = await nichesRes.json();
    assert.equal(nichesJson.success, true);
    assert.ok(nichesJson.niches.length >= 3);

    const res = await fetch(`${base}/api/export/persona/${persona.id}?kit=1`, {
      headers: authHeaders()
    });
    assert.equal(res.status, 200);
    const buf = Buffer.from(await res.arrayBuffer());
    assert.ok(buf.length > 100);
    const cd = res.headers.get('content-disposition') || '';
    assert.match(cd, /brand_kit\.zip/i);

    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'influ-kit-'));
    const zipPath = path.join(tmp, 'kit.zip');
    fs.writeFileSync(zipPath, buf);
    try {
      execSync(`unzip -qo ${JSON.stringify(zipPath)} -d ${JSON.stringify(tmp)}`, { stdio: 'pipe' });
      assert.ok(fs.existsSync(path.join(tmp, 'guion_ugc_15s.txt')));
      assert.ok(fs.existsSync(path.join(tmp, 'COMO_USAR_KIT.txt')));
      assert.ok(fs.existsSync(path.join(tmp, 'packs', 'fullbody.txt')));
      assert.ok(fs.existsSync(path.join(tmp, 'character_lock.json')));
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  db.deletePersona(persona.id);
});
