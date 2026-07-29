const test = require('node:test');
const assert = require('node:assert/strict');
const { FREE_CHATBOT_PACKS, buildFreeChatbotPack, listPackIds } = require('../chatbot-packs');

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
