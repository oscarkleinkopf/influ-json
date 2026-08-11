const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('path');

const {
  FACE_PACK_SLOTS,
  listSlotIds,
  buildAnchorSpecsForPersona,
  buildFacePackChatbotText,
  mapPackImages,
  summarizePack,
  resolveSlotIdFromLegacy,
  lockFingerprint
} = require('../face-pack.js');

test('face pack tiene 6 slots canónicos', () => {
  assert.equal(FACE_PACK_SLOTS.length, 6);
  assert.deepEqual(listSlotIds(), [
    'front', 'three_quarter_l', 'three_quarter_r', 'profile', 'laughing', 'fullbody'
  ]);
});

test('legacy anchor types mapean a slots nuevos', () => {
  assert.equal(resolveSlotIdFromLegacy('front_portrait'), 'front');
  assert.equal(resolveSlotIdFromLegacy('profile_45'), 'three_quarter_r');
  assert.equal(resolveSlotIdFromLegacy('expression_wink'), 'laughing');
  assert.equal(resolveSlotIdFromLegacy('fullbody_studio'), 'fullbody');
  assert.equal(resolveSlotIdFromLegacy('front'), 'front');
});

test('buildAnchorSpecsForPersona: 6 specs con framing', () => {
  const specs = buildAnchorSpecsForPersona({
    name: 'Lila',
    clothing: 'cream knit',
    detailedJSON: {
      identity: { name: 'Lila' },
      character_lock: {
        must_match_every_image: {
          name: 'Lila',
          skin_tone_hex: '#F8C4AE',
          facial_asymmetry: 'left eye 2% smaller',
          distinctive_marks: 'mole below jaw'
        }
      }
    }
  });
  assert.equal(specs.length, 6);
  assert.equal(specs[0].anchorType, 'front');
  assert.equal(specs[0].framing, 'portrait');
  assert.equal(specs[5].framing, 'fullbody');
  assert.equal(specs[0]._lockHints.facial_asymmetry, 'left eye 2% smaller');
});

test('buildFacePackChatbotText incluye lock + 6 tomas', () => {
  const text = buildFacePackChatbotText({
    identity: { name: 'Lila' },
    character_lock: {
      free_chatbot_system: 'Misma Lila.',
      must_match_every_image: {
        name: 'Lila',
        skin_tone: 'fair',
        skin_tone_hex: '#F8C4AE',
        facial_asymmetry: 'ojo izq',
        distinctive_marks: 'lunar'
      }
    }
  });
  assert.match(text, /FACE PACK CANÓNICO/);
  assert.match(text, /CHARACTER LOCK/);
  assert.match(text, /FRONTAL/);
  assert.match(text, /¾ IZQUIERDA|THREE_QUARTER|three_quarter_l/i);
  assert.match(text, /PERFIL/);
  assert.match(text, /RISA|laughing/i);
  assert.match(text, /CUERPO ENTERO|fullbody/i);
  assert.match(text, /#F8C4AE/);
  assert.match(text, /cero costo/i);
});

test('mapPackImages dedupea por slot y acepta legacy metadata', () => {
  const slots = mapPackImages({
    mainImage: 'assets/references/main.jpg',
    history: [
      {
        generation_type: 'anchor_pack',
        image_path: 'assets/generated/a.jpg',
        created_at: '2026-01-01',
        metadata: JSON.stringify({ anchorType: 'front_portrait', title: 'Frontal' })
      },
      {
        generation_type: 'anchor_pack',
        image_path: 'assets/generated/b.jpg',
        created_at: '2026-01-02',
        metadata: JSON.stringify({ anchorType: 'front', title: 'Frontal' })
      },
      {
        generation_type: 'anchor_pack',
        image_path: 'assets/generated/c.jpg',
        created_at: '2026-01-01',
        metadata: JSON.stringify({ anchorType: 'fullbody_studio' })
      }
    ]
  });
  assert.equal(slots.length, 6);
  const front = slots.find((s) => s.id === 'front');
  assert.equal(front.image_path, 'assets/generated/b.jpg');
  assert.equal(front.filled, true);
  const full = slots.find((s) => s.id === 'fullbody');
  assert.equal(full.filled, true);
  const sum = summarizePack(slots);
  assert.equal(sum.filled, 2);
  assert.equal(sum.complete, false);
});

test('lockFingerprint cambia si asimetría cambia', () => {
  const a = {
    character_lock: { must_match_every_image: { name: 'Lila', facial_asymmetry: 'a' } }
  };
  const b = {
    character_lock: { must_match_every_image: { name: 'Lila', facial_asymmetry: 'b' } }
  };
  assert.notEqual(lockFingerprint(a), lockFingerprint(b));
});

test('UI + server + import wires face-pack', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  const personas = fs.readFileSync(path.join(__dirname, '..', 'routes/personas.js'), 'utf8');
  const imp = fs.readFileSync(path.join(__dirname, '..', 'routes/import.js'), 'utf8');
  assert.match(html, /face-pack\.js\?v=1\.0\.0/);
  assert.match(html, /id="facePackPanel"/);
  assert.match(html, /id="btnCopyFacePackText"/);
  assert.match(app, /setupFacePack/);
  assert.match(app, /copyFacePackText/);
  assert.match(app, /renderFacePack/);
  assert.match(server, /face-pack\.js/);
  assert.match(personas, /face-pack\/regenerate/);
  assert.match(personas, /face-pack\.txt/);
  assert.match(imp, /face-pack/);
  assert.match(imp, /buildAnchorSpecsForPersona/);
});

test('import ya no hardcodea solo 4 anchors legacy', () => {
  const imp = fs.readFileSync(path.join(__dirname, '..', 'routes/import.js'), 'utf8');
  assert.doesNotMatch(imp, /anchorType: 'front_portrait'/);
  assert.match(imp, /\[face-pack\]/);
});
