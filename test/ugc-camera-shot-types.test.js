const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('path');

const {
  CAMERA_PROFILES,
  SHOT_TYPES,
  listCameraIds,
  listShotTypeIds,
  composeShotExtras,
  buildWeekBriefs,
  buildWeekCalendarText,
  getCamera,
  getShotType
} = require('../ugc-shot-composer.js');

const { buildFreeChatbotPack } = require('../chatbot-packs.js');

test('camera profiles: 4 iPhone UGC cams', () => {
  assert.deepEqual(listCameraIds().sort(), ['mirror', 'overhead', 'rear', 'selfie']);
  assert.match(CAMERA_PROFILES.selfie.promptBlock, /front selfie/i);
  assert.match(CAMERA_PROFILES.mirror.promptBlock, /Mirror selfie/i);
  assert.match(CAMERA_PROFILES.overhead.promptBlock, /Overhead flatlay/i);
  assert.match(CAMERA_PROFILES.rear.promptBlock, /rear main/i);
});

test('shot types: UGC formats with default cameras include product_on_face', () => {
  const ids = listShotTypeIds();
  assert.ok(ids.includes('product_demo'));
  assert.ok(ids.includes('product_on_face'));
  assert.equal(ids.length, 8);
  assert.equal(SHOT_TYPES.testimonial.defaultCamera, 'selfie');
  assert.equal(SHOT_TYPES.unboxing.defaultCamera, 'overhead');
  assert.equal(SHOT_TYPES.grwm.defaultCamera, 'mirror');
  assert.equal(SHOT_TYPES.lifestyle.defaultCamera, 'rear');
  assert.equal(SHOT_TYPES.product_on_face.defaultCamera, 'rear');
  assert.equal(SHOT_TYPES.product_on_face.suggestedPack, 'product');
  assert.match(SHOT_TYPES.product_on_face.label, /Producto en la cara/i);
  assert.match(SHOT_TYPES.product_on_face.short, /on-skin|close-up/i);
});

test('composeShotExtras: shot type picks default camera', () => {
  const c = composeShotExtras({ shotTypeId: 'unboxing' });
  assert.equal(c.cameraId, 'overhead');
  assert.equal(c.shotTypeId, 'unboxing');
  assert.match(c.extraScene, /SHOT TYPE/);
  assert.match(c.extraScene, /CAMERA/);
  assert.match(c.extraScene, /Overhead flatlay/i);
  assert.equal(c.suggestedPack, 'product');
});

test('composeShotExtras: explicit camera overrides default', () => {
  const c = composeShotExtras({ shotTypeId: 'testimonial', cameraId: 'rear' });
  assert.equal(c.cameraId, 'rear');
  assert.match(c.extraScene, /rear main/i);
});

test('buildWeekBriefs: one-liners with name for every shot type', () => {
  const lines = buildWeekBriefs('Lila');
  assert.equal(lines.length, listShotTypeIds().length);
  assert.ok(lines.every((l) => l.startsWith('Lila,')));
  assert.match(buildWeekCalendarText('Lila'), /CALENDARIO UGC/);
  assert.match(buildWeekCalendarText('Lila'), /CHARACTER LOCK/i);
  assert.match(buildWeekCalendarText('Lila'), /on-skin close-up/i);
});

test('buildFreeChatbotPack inyecta CAMERA / SHOT TYPE', () => {
  const text = buildFreeChatbotPack(
    {
      identity: { name: 'Lila' },
      character_lock: {
        free_chatbot_system: 'Misma Lila.',
        must_match_every_image: {
          name: 'Lila',
          skin_tone: 'fair',
          skin_tone_hex: '#F8C4AE'
        }
      }
    },
    'fullbody',
    { cameraId: 'mirror', shotTypeId: 'grwm' }
  );
  assert.match(text, /SHOT TYPE \(GRWM\)/);
  assert.match(text, /CAMERA \(Mirror selfie\)/);
  assert.match(text, /Cámara\/formato: GRWM · Mirror selfie/);
  assert.match(text, /Mirror selfie shot on iPhone/);
});

test('product_on_face: close-up on-skin + SKU in corner, not product_demo', () => {
  const shot = getShotType('product_on_face');
  assert.ok(shot);
  assert.equal(shot.suggestedPack, 'product');
  assert.match(shot.scenarioSeed, /on skin/i);
  assert.match(shot.scenarioSeed, /3:4/);
  assert.match(shot.scenarioSeed, /jar|tube|SKU/i);
  assert.match(shot.scenarioSeed, /does not cover the eyes/i);
  assert.match(shot.scenarioSeed, /hydrogel|mask|serum/i);
  assert.doesNotMatch(shot.scenarioSeed, /Midjourney|midjourney/);
  const demo = getShotType('product_demo');
  assert.match(demo.scenarioSeed, /applying or using/i);
  assert.doesNotMatch(shot.scenarioSeed, /hands and face focus/i);

  const c = composeShotExtras({ shotTypeId: 'product_on_face' });
  assert.equal(c.cameraId, 'rear');
  assert.equal(c.suggestedPack, 'product');
  assert.match(c.extraScene, /SHOT TYPE \(Producto en la cara\)/);
  assert.match(c.extraScene, /face fills the frame/i);
  assert.match(c.extraScene, /lower corner/i);
});

test('pack product: on-skin alternate when shot selected; in-hand default intact', () => {
  const persona = {
    identity: { name: 'Lila' },
    character_lock: {
      free_chatbot_system: 'Misma Lila.',
      must_match_every_image: {
        name: 'Lila',
        skin_tone: 'fair',
        skin_tone_hex: '#F8C4AE'
      }
    }
  };
  const inHand = buildFreeChatbotPack(persona, 'product');
  assert.match(inHand, /sostiene el producto cerca de la cámara/i);
  assert.match(inHand, /Plano medio o selfie con producto/);
  assert.doesNotMatch(inHand, /producto EN LA PIEL/);
  assert.doesNotMatch(inHand, /SHOT TYPE \(Producto en la cara\)/);

  const onSkin = buildFreeChatbotPack(persona, 'product', { shotTypeId: 'product_on_face' });
  assert.match(onSkin, /producto EN LA PIEL/);
  assert.match(onSkin, /close-up 3:4/i);
  assert.match(onSkin, /SKU/);
  assert.match(onSkin, /esquina/);
  assert.match(onSkin, /no cubre los ojos/i);
  assert.match(onSkin, /SHOT TYPE \(Producto en la cara\)/);
  assert.match(onSkin, /Cámara\/formato: Producto en la cara/);
  assert.doesNotMatch(onSkin, /sostiene el producto cerca de la cámara/);
  assert.doesNotMatch(onSkin, /Midjourney|midjourney/);

  const fullbody = buildFreeChatbotPack(persona, 'fullbody');
  assert.match(fullbody, /CUERPO ENTERO/);
  assert.doesNotMatch(fullbody, /producto EN LA PIEL/);
  assert.doesNotMatch(fullbody, /SHOT TYPE \(Producto en la cara\)/);
  assert.doesNotMatch(fullbody, /sostiene el producto cerca de la cámara/);
});

test('getCamera / getShotType null-safe', () => {
  assert.equal(getCamera('nope'), null);
  assert.equal(getShotType('nope'), null);
  assert.ok(getCamera('selfie'));
});

test('UI + server wires ugc-shot-composer', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const views = fs.readFileSync(path.join(__dirname, '..', 'views/tabs/persona-engine.html'), 'utf8');
  const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert.match(html, /ugc-shot-composer\.js\?v=1\.0\.0/);
  assert.match(html, /data-ugc-camera="selfie"/);
  assert.match(html, /data-ugc-shot="testimonial"/);
  assert.match(html, /data-ugc-shot="product_demo"/);
  assert.match(html, /data-ugc-shot="product_on_face"/);
  assert.match(views, /data-ugc-shot="product_on_face"/);
  assert.match(html, /id="btnCopyUgcWeek"/);
  assert.match(app, /setUgcCamera/);
  assert.match(app, /copyUgcWeekCalendar/);
  assert.match(app, /ugcCameraId/);
  assert.match(server, /ugc-shot-composer\.js/);
});
