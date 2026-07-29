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

test('listPackIds expone fullbody/bikini/spicy/product', () => {
  assert.deepEqual(listPackIds().sort(), ['bikini', 'fullbody', 'product', 'spicy']);
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
});

test('buildFreeChatbotPack rechaza pack desconocido', () => {
  assert.throws(() => buildFreeChatbotPack({}, 'nope'), /Pack desconocido/);
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
  assert.match(html, /btnChatbotSessionCheck/);
  assert.match(html, /chatbotSessionModal/);
  assert.match(html, /Probar en chatbot \(3 prompts\)/);
});
