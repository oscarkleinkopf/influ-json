const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  validateCharacterLock,
  getExportReadyStatus,
  isPlaceholderAnchorImage
} = require('../character-lock-validator');

function solidPersona(overrides = {}) {
  return {
    name: 'Daniela Ríos',
    image: overrides.image ?? 'assets/references/ref_daniela_anchor.jpg',
    detailedJSON: {
      identity: {
        name: 'Daniela Ríos',
        gender: 'Female',
        apparent_age: '26 años',
        ethnicity_appearance: 'Latina de tez clara',
        body_type: 'Atlético y proporcionado'
      },
      facial_features: {
        face_shape: 'Ovalada',
        skin_tone: 'Piel clara / beige claro',
        skin_tone_hex: '#f0d5c0',
        skin_texture: 'Suave',
        eye_color: 'Miel',
        eyebrow_style: 'Cejas naturales',
        lip_shape: 'Carnosos',
        smile_type: 'Natural',
        distinctive_marks: 'Lunar bajo el ojo'
      },
      hair: {
        color: 'Castaño oscuro',
        color_hex: '#3b2417',
        texture: 'Ondulado',
        length: 'Largo',
        style: 'Suelto'
      },
      body: {
        body_type: 'Atlético y proporcionado',
        height_appearance: 'Estatura media',
        proportions: 'Equilibradas',
        posture: 'Erguida',
        fitness_level: 'Tono natural',
        skin_continuity: 'Mismo tono'
      },
      personality: { mbti: 'ENFP', communication_style: 'Cálido' },
      character_lock: {
        version: 1,
        free_tier: true,
        must_match_every_image: {
          name: 'Daniela Ríos',
          skin_tone: 'Piel clara / beige claro',
          skin_tone_hex: '#f0d5c0'
        }
      },
      ...overrides.detailed
    },
    archived: overrides.archived || 0
  };
}

test('W16 isPlaceholderAnchorImage detecta stock', () => {
  assert.equal(isPlaceholderAnchorImage(null), true);
  assert.equal(isPlaceholderAnchorImage('assets/influencer_female.png'), true);
  assert.equal(isPlaceholderAnchorImage('assets/influencer_male.png'), true);
  assert.equal(isPlaceholderAnchorImage('assets/references/ref_abc.jpg'), false);
});

test('W16 getExportReadyStatus: Listo / Revisar / Sin ancla', () => {
  const ready = getExportReadyStatus(solidPersona());
  assert.equal(ready.kind, 'ready');
  assert.equal(ready.label, 'Listo');
  assert.equal(ready.lockOk, true);
  assert.equal(ready.hasRealAnchor, true);
  assert.equal(validateCharacterLock(solidPersona().detailedJSON).grade, 'solid');

  const noAnchor = getExportReadyStatus(solidPersona({ image: 'assets/influencer_female.png' }));
  assert.equal(noAnchor.kind, 'no_anchor');
  assert.equal(noAnchor.label, 'Sin ancla');
  assert.equal(noAnchor.lockOk, true);

  const weak = getExportReadyStatus({
    name: 'x',
    image: 'assets/references/ref_x.jpg',
    detailedJSON: { identity: { name: 'Nuevo Influencer' }, character_lock: {} }
  });
  assert.equal(weak.kind, 'review');
  assert.equal(weak.label, 'Revisar lock');
});

test('W16 UI: badges + filtros Listos / A revisar; archivados fuera de listos', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, '..', 'index.css'), 'utf8');

  assert.match(app, /getPersonaExportReadyStatus|getExportReadyStatus/);
  assert.match(app, /openExportReadyFromBadge/);
  assert.match(app, /portfolioFilter === 'ready'/);
  assert.match(app, /portfolioFilter === 'review'/);
  assert.match(app, /isArchivedPersona\(p\)\) return false/);
  assert.match(app, /data-export-status/);
  // No bloquea export / copy
  assert.doesNotMatch(app, /exportReady[\s\S]{0,80}disabled|kind === 'review'[\s\S]{0,120}return;/);

  assert.match(html, /btnPortfolioReady/);
  assert.match(html, /btnPortfolioReview/);
  assert.match(html, /setPortfolioFilter\('ready'\)/);

  assert.match(css, /badge-export-ready/);
  assert.match(css, /badge-lock-review/);
  assert.match(css, /badge-no-anchor/);
});
