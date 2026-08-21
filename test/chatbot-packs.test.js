const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('path');
const {
  FREE_CHATBOT_PACKS,
  buildFreeChatbotPack,
  buildChatbotSessionCheck,
  listPackIds,
  emptySessionChecklist,
  isSessionChecklistPassing
} = require('../chatbot-packs');

test('listPackIds expone fullbody/bikini/spicy/product + explicit opt-in', () => {
  assert.deepEqual(listPackIds().sort(), ['bikini', 'explicit', 'fullbody', 'product', 'spicy']);
  assert.ok(FREE_CHATBOT_PACKS.fullbody.sceneInstruction.includes('CUERPO ENTERO'));
});

test('buildFreeChatbotPack incluye character_lock y escena', () => {
  const text = buildFreeChatbotPack(
    {
      identity: { name: 'Luna' },
      character_lock: {
        free_chatbot_system: 'Misma persona siempre.',
        must_match_every_image: {
          name: 'Luna',
          skin_tone: 'piel clara',
          skin_tone_hex: '#f0d5c0'
        }
      }
    },
    'fullbody'
  );
  assert.match(text, /CHARACTER LOCK/);
  assert.match(text, /#f0d5c0/);
  assert.match(text, /CUERPO ENTERO/);
  assert.match(text, /Luna/);
  assert.match(text, /sin Replicate/);
  assert.match(text, /REALISMO/);
  assert.match(text, /NEGATIVE PROMPT/);
  assert.match(text, /visible skin pores/i);
  assert.match(text, /plastic skin/);
});

test('buildFreeChatbotPack incluye asimetría y marcas en resumen', () => {
  const text = buildFreeChatbotPack(
    {
      identity: { name: 'Eru' },
      facial_features: {
        skin_tone: 'piel clara',
        skin_tone_hex: '#f0d5c0',
        facial_asymmetry: 'Ojo izquierdo ~2% más pequeño',
        distinctive_marks: 'Lunar bajo mandíbula derecha'
      },
      character_lock: {
        free_chatbot_system: 'Misma Eru.',
        must_match_every_image: {
          name: 'Eru',
          skin_tone: 'piel clara',
          skin_tone_hex: '#f0d5c0',
          facial_asymmetry: 'Ojo izquierdo ~2% más pequeño',
          distinctive_marks: 'Lunar bajo mandíbula derecha'
        }
      }
    },
    'spicy'
  );
  assert.match(text, /Asimetría \(fija\): Ojo izquierdo/);
  assert.match(text, /Marcas \(siempre visibles\): Lunar bajo mandíbula/);
  assert.match(text, /REALISMO/);
});

test('buildFreeChatbotPack acepta fila API con detailedJSON (no pega lock vacío)', () => {
  const { buildFreeChatbotPack: build } = require('../chatbot-packs');
  const row = {
    id: 'p1',
    name: 'Camila_API',
    detailedJSON: {
      identity: { name: 'Camila_API', gender: 'Female', apparent_age: '24 años' },
      facial_features: { skin_tone: 'piel clara', skin_tone_hex: '#f0d5c0', face_shape: 'ovalada', eye_color: 'cafés' },
      hair: { color: 'Castaño', texture: 'ondulado', length: 'largo' },
      body: { body_type: 'Atlética' },
      character_lock: {
        free_chatbot_system: 'Sos Camila_API.',
        must_match_every_image: {
          name: 'Camila_API',
          skin_tone: 'piel clara',
          skin_tone_hex: '#f0d5c0'
        }
      }
    }
  };
  const text = build(row, 'fullbody');
  assert.match(text, /Camila_API/);
  assert.match(text, /#f0d5c0/);
  assert.doesNotMatch(text, /CHARACTER LOCK \(obligatorio\)\n─+\n\{\}/);
});

test('buildFreeChatbotPack sintetiza lock si solo hay identity/facial', () => {
  const { buildFreeChatbotPack: build } = require('../chatbot-packs');
  const text = build({
    identity: { name: 'Nora' },
    facial_features: { skin_tone: 'piel clara', skin_tone_hex: '#ead2c0' },
    hair: { color: 'negro', length: 'corto' }
  }, 'bikini');
  assert.match(text, /Nora/);
  assert.match(text, /#ead2c0/);
  assert.match(text, /playa/i);
});

test('buildFreeChatbotPack rechaza pack desconocido', () => {
  assert.throws(() => buildFreeChatbotPack({}, 'nope'), /Pack desconocido/);
});

test('pack product: default en mano; on-skin cambia label + escena', () => {
  const persona = {
    identity: { name: 'Mia' },
    character_lock: {
      must_match_every_image: { name: 'Mia', skin_tone: 'clara', skin_tone_hex: '#f0d5c0' }
    }
  };
  const inHand = buildFreeChatbotPack(persona, 'product');
  assert.match(inHand, /PACK GRATIS PARA CHATBOT — Producto en mano/);
  assert.match(inHand, /sostiene el producto cerca de la cámara/);
  assert.equal(FREE_CHATBOT_PACKS.product.label, 'Producto en mano');
  assert.ok(FREE_CHATBOT_PACKS.product.sceneInstructionOnSkin);
  assert.ok(FREE_CHATBOT_PACKS.product.labelOnSkin);

  const onSkin = buildFreeChatbotPack(persona, 'product', { shotTypeId: 'product_on_face' });
  assert.match(onSkin, /PACK GRATIS PARA CHATBOT — Producto on-skin/);
  assert.match(onSkin, /producto EN LA PIEL/);
  assert.match(onSkin, /SKU/);
  assert.doesNotMatch(onSkin, /sostiene el producto cerca de la cámara/);
});

test('W11 buildChatbotSessionCheck: lock + 3 prompts', () => {
  const text = buildChatbotSessionCheck({
    identity: { name: 'Nora' },
    character_lock: {
      niche: 'beauty',
      free_chatbot_system: 'Misma Nora siempre.',
      must_match_every_image: {
        name: 'Nora',
        skin_tone: 'piel clara',
        skin_tone_hex: '#e8c4a8',
        hair_color: 'castaño',
        eye_color: 'verdes'
      }
    }
  }, { productData: { name: 'Serum X', benefit: 'brillo' } });

  assert.match(text, /SESIÓN DE PRUEBA/);
  assert.match(text, /CHARACTER LOCK/);
  assert.match(text, /PROMPT A — RETRATO/);
  assert.match(text, /PROMPT B — CUERPO ENTERO/);
  assert.match(text, /PROMPT C — PRODUCTO/);
  assert.match(text, /#e8c4a8/);
  assert.match(text, /Serum X/);
  assert.match(text, /cero costo/i);
  assert.doesNotMatch(text, /REPLICATE_API/);
});

test('W11 checklist helpers', () => {
  const empty = emptySessionChecklist();
  assert.equal(isSessionChecklistPassing(empty), false);
  assert.equal(isSessionChecklistPassing({ face: true, skin: true, hair: true }), true);
  assert.equal(isSessionChecklistPassing({ face: true, skin: true, hair: false }), false);
});

test('W11 UI wires sesión chatbot', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.match(app, /copyChatbotSessionCheck/);
  assert.match(app, /setupChatbotSessionUi/);
  assert.match(app, /influ_chatbot_session_/);
  assert.match(app, /refreshChatbotSessionSheetStatus/);
  assert.match(html, /btnChatbotSessionCheck/);
  assert.match(html, /btnOpenChatbotChecklist/);
  assert.match(html, /chatbotSessionModal/);
  assert.match(html, /Probar en chatbot \(3 prompts\)/);
});

test('W11 migrations usan INSERT OR IGNORE (seguro bajo tests paralelos)', () => {
  const js = fs.readFileSync(path.join(__dirname, '..', 'migrations.js'), 'utf8');
  assert.match(js, /INSERT OR IGNORE INTO schema_migrations/);
});
