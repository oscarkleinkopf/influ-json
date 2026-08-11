const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');

const {
  classifyLockAppearance,
  sampleImageAppearance,
  anchorConflictsWithLock
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

test('matching dark lock + missing file does not false-positive', async () => {
  const check = await anchorConflictsWithLock(
    'assets/references/does-not-exist-xyz.jpg',
    eruLock,
    { rootDir: path.join(__dirname, '..') }
  );
  assert.equal(check.conflict, false);
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
