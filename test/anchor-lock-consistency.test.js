const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');

const {
  classifyLockAppearance,
  sampleImageAppearance,
  anchorConflictsWithLock,
  enrichDetailedFromInspiration,
  isInspirationPortrait,
  reconcilePromptWithInspiration
} = require('../anchor-lock-consistency');
const { isPlaceholderAnchorImage } = require('../character-lock-validator');

const eruLock = {
  facial_features: {
    skin_tone: 'Piel morena oscura / profunda',
    skin_tone_hex: '#72442e'
  },
  hair: { color: 'Negro' },
  character_lock: {
    must_match_every_image: {
      skin_tone: 'Piel morena oscura / profunda',
      hair_color: 'Negro'
    }
  }
};

/** Synthetic fair+blonde-ish portrait (hair band bright/warm, face mid-fair). */
async function writeFairBlondeFixture(outPath) {
  const sharp = require('sharp');
  const w = 256;
  const h = 256;
  const buf = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 3;
      if (y < Math.floor(h * 0.2)) {
        // blonde hair band
        buf[i] = 210; buf[i + 1] = 185; buf[i + 2] = 120;
      } else {
        // fair skin
        buf[i] = 220; buf[i + 1] = 185; buf[i + 2] = 165;
      }
    }
  }
  await sharp(buf, { raw: { width: w, height: h, channels: 3 } })
    .jpeg()
    .toFile(outPath);
}

test('classifyLockAppearance: Eru-style dark + black hair', () => {
  const c = classifyLockAppearance(eruLock);
  assert.equal(c.skin, 'dark');
  assert.equal(c.hair, 'dark');
});

test('classifyLockAppearance: fair + blonde', () => {
  const c = classifyLockAppearance({
    facial_features: { skin_tone: 'Piel clara / beige claro', skin_tone_hex: '#f0d5c0' },
    hair: { color: 'Rubio platino' }
  });
  assert.equal(c.skin, 'fair');
  assert.equal(c.hair, 'blonde');
});

test('isPlaceholderAnchorImage: nano_banana shared stubs', () => {
  assert.equal(isPlaceholderAnchorImage('assets/nano_banana_influencer.png'), true);
  assert.equal(isPlaceholderAnchorImage('assets/nano_banana_ugc.png'), true);
  assert.equal(isPlaceholderAnchorImage('assets/references/ref_eru.jpg'), false);
});

test('fair blonde portrait conflicts with dark Latina lock', async () => {
  const tmp = path.join(os.tmpdir(), `influ-fair-blonde-${Date.now()}.jpg`);
  await writeFairBlondeFixture(tmp);
  try {
    const sample = await sampleImageAppearance(tmp);
    assert.ok(
      sample.skin === 'fair' || sample.hair === 'blonde',
      `expected fair/blonde sample, got ${JSON.stringify(sample)}`
    );
    const check = await anchorConflictsWithLock(tmp, eruLock, { rootDir: path.join(__dirname, '..') });
    assert.equal(check.conflict, true);
    assert.ok(check.reason && check.reason.length > 0);
  } finally {
    try { fs.unlinkSync(tmp); } catch (_) {}
  }
});

test('enrichDetailedFromInspiration: dark defaults → fair lock from fair photo', async () => {
  const tmp = path.join(os.tmpdir(), `influ-fair-blonde-${Date.now()}.jpg`);
  await writeFairBlondeFixture(tmp);
  try {
    const bad = {
      identity: { ethnicity_appearance: 'Latina' },
      facial_features: {
        skin_tone: 'Piel morena oscura / profunda',
        skin_tone_hex: '#72442e',
        eye_color: 'marrón oscuro'
      },
      hair: { color: 'Negro' }
    };
    const enriched = await enrichDetailedFromInspiration(tmp, bad, { rootDir: path.join(__dirname, '..') });
    assert.equal(enriched.inspired_from_photo, true);
    assert.equal(enriched.anchor_source, 'inspiration_upload');
    assert.match(enriched.facial_features.skin_tone, /clara|blanca|fair/i);
    assert.match(enriched.hair.color, /rubio|blonde|castaño claro/i);
    // Critical: do NOT keep "Latina" — models bias to dark hair on Caucasian refs
    assert.match(enriched.identity.ethnicity_appearance, /cauc[aá]sic|europea/i);
    assert.doesNotMatch(enriched.identity.ethnicity_appearance, /^Latina$/i);
    assert.equal(enriched.hair.color_hex, '#d4b483');
  } finally {
    try { fs.unlinkSync(tmp); } catch (_) {}
  }
});

test('Eru honey-blonde ref samples as fair+blonde (not furniture-dark hair)', async (t) => {
  const eruRef = path.join(__dirname, '..', 'assets', 'references', 'ref_1786413920031_n6jca.jpg');
  if (!fs.existsSync(eruRef)) {
    t.skip('Eru reference not in workspace');
    return;
  }
  const sample = await sampleImageAppearance(eruRef);
  assert.equal(sample.skin, 'fair');
  assert.equal(sample.hair, 'blonde');
});

test('reconcilePromptWithInspiration strips Latina bias for fair blonde', () => {
  const prompt = 'A 26 Latina woman. color Negro hair. SKIN LOCK: Piel morena oscura.';
  const detailed = {
    identity: { ethnicity_appearance: 'Caucásica / Europea de tez clara' },
    facial_features: {
      skin_tone: 'Piel clara / tez blanca',
      skin_lock: 'fair light porcelain',
      eye_color: 'Azul claro'
    },
    hair: { color: 'Rubio dorado / rubia natural' }
  };
  const out = reconcilePromptWithInspiration(prompt, detailed);
  assert.doesNotMatch(out, /\bLatina\b/i);
  assert.match(out, /HAIR LOCK:.*Rubio/i);
});

test('isInspirationPortrait detects ref_* uploads', () => {
  assert.equal(isInspirationPortrait('assets/references/ref_abc.jpg', {}), true);
  assert.equal(isInspirationPortrait('assets/generated/gen_x.jpg', {}), false);
  assert.equal(isInspirationPortrait('assets/generated/gen_x.jpg', { inspired_from_photo: true }), true);
});

test('matching dark lock + missing file does not false-positive', async () => {
  const check = await anchorConflictsWithLock(
    'assets/references/does-not-exist-xyz.jpg',
    eruLock,
    { rootDir: path.join(__dirname, '..') }
  );
  assert.equal(check.conflict, false);
});

test('reconcilePromptWithInspiration strips morena lock for fair DNA', () => {
  const prompt = 'IDENTITY LOCK. SKIN LOCK: Piel morena oscura hex #72442e, keep deep/dark undertone. Negro hair.';
  const detailed = {
    facial_features: {
      skin_tone: 'Piel clara / tez blanca',
      skin_tone_hex: '#f0d5c0',
      skin_lock: 'fair light porcelain',
      eye_color: 'Azul claro / cristalino'
    },
    hair: { color: 'Rubio dorado / rubia natural' }
  };
  const out = reconcilePromptWithInspiration(prompt, detailed);
  assert.match(out, /HAIR LOCK:.*Rubio/i);
  assert.match(out, /EYES:.*Azul/i);
  assert.doesNotMatch(out, /keep deep\/dark undertone/i);
});

test('real Eru upload (if present) conflicts with her dark lock', async (t) => {
  const eruRef = path.join(__dirname, '..', 'assets', 'references', 'ref_1786413920031_n6jca.jpg');
  if (!fs.existsSync(eruRef)) {
    t.skip('Eru reference not in workspace');
    return;
  }
  const check = await anchorConflictsWithLock(
    'assets/references/ref_1786413920031_n6jca.jpg',
    eruLock,
    { rootDir: path.join(__dirname, '..') }
  );
  assert.equal(check.conflict, true, check.reason || 'expected conflict');
});
