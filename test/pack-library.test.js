const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  FREE_CHATBOT_PACKS,
  buildFreeChatbotPack,
  listPackIds,
  formatRelativeCopyAge,
  packLabel
} = require('../chatbot-packs');

const samplePersona = {
  identity: { name: 'Vera' },
  character_lock: {
    free_chatbot_system: 'Misma Vera siempre.',
    must_match_every_image: {
      name: 'Vera',
      skin_tone: 'piel clara',
      skin_tone_hex: '#f0d5c0',
      hair_color: 'castaño'
    }
  }
};

test('W13: los 4 packs incluyen character_lock y no APIs de pago', () => {
  for (const packId of listPackIds()) {
    const text = buildFreeChatbotPack(samplePersona, packId, {
      productData: { name: 'Serum Vera', benefit: 'glow' }
    });
    assert.match(text, /CHARACTER LOCK/, packId);
    assert.match(text, /#f0d5c0/, packId);
    assert.match(text, /Vera/, packId);
    assert.doesNotMatch(text, /REPLICATE_API/, packId);
    assert.doesNotMatch(text, /InstantID|PuLID/, packId);
    assert.ok(FREE_CHATBOT_PACKS[packId].label);
  }
});

test('W13: formatRelativeCopyAge y packLabel', () => {
  const now = Date.parse('2026-07-30T12:00:00.000Z');
  assert.equal(formatRelativeCopyAge(now - 12_000, now), 'hace 12s');
  assert.equal(formatRelativeCopyAge(now - 180_000, now), 'hace 3m');
  assert.equal(formatRelativeCopyAge(now - 7_200_000, now), 'hace 2h');
  assert.equal(formatRelativeCopyAge(null, now), null);
  assert.equal(packLabel('fullbody'), FREE_CHATBOT_PACKS.fullbody.label);
  assert.equal(packLabel('nope'), null);
});

test('W13 UI: menú Packs portafolio + memoria último pack', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, '..', 'index.css'), 'utf8');

  assert.match(app, /btn-quick-packs/);
  assert.match(app, /data-portfolio-pack/);
  assert.match(app, /influ_last_pack_/);
  assert.match(app, /function saveLastCopiedPack/);
  assert.match(app, /function refreshLastPackStatus/);
  assert.match(app, /Volver a copiar último pack/);
  assert.match(app, /copyLastFreeChatbotPack/);
  // No llama APIs de pago al copiar packs
  assert.doesNotMatch(app, /copyFreeChatbotPack[\s\S]{0,400}REPLICATE/);
  assert.doesNotMatch(app, /authFetch\(['`]\/api\/.*pack/);

  assert.match(html, /data-last-pack-status/);
  assert.match(html, /id="btnRecopyLastPack"/);
  assert.match(html, /data-free-pack="fullbody"/);
  assert.match(html, /data-free-pack="bikini"/);
  assert.match(html, /data-free-pack="spicy"/);
  assert.match(html, /data-free-pack="product"/);

  assert.match(css, /portfolio-pack-menu/);
  assert.match(css, /portfolio-last-pack/);
});
