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

test('shot types: 7 UGC formats with default cameras', () => {
  assert.equal(listShotTypeIds().length, 7);
  assert.equal(SHOT_TYPES.testimonial.defaultCamera, 'selfie');
  assert.equal(SHOT_TYPES.unboxing.defaultCamera, 'overhead');
  assert.equal(SHOT_TYPES.grwm.defaultCamera, 'mirror');
  assert.equal(SHOT_TYPES.lifestyle.defaultCamera, 'rear');
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

test('buildWeekBriefs: 7 one-liners with name', () => {
  const lines = buildWeekBriefs('Lila');
  assert.equal(lines.length, 7);
  assert.ok(lines.every((l) => l.startsWith('Lila,')));
  assert.match(buildWeekCalendarText('Lila'), /CALENDARIO UGC/);
  assert.match(buildWeekCalendarText('Lila'), /CHARACTER LOCK/i);
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

test('getCamera / getShotType null-safe', () => {
  assert.equal(getCamera('nope'), null);
  assert.equal(getShotType('nope'), null);
  assert.ok(getCamera('selfie'));
});

test('UI + server wires ugc-shot-composer', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
  assert.match(html, /ugc-shot-composer\.js\?v=1\.0\.0/);
  assert.match(html, /data-ugc-camera="selfie"/);
  assert.match(html, /data-ugc-shot="testimonial"/);
  assert.match(html, /id="btnCopyUgcWeek"/);
  assert.match(app, /setUgcCamera/);
  assert.match(app, /copyUgcWeekCalendar/);
  assert.match(app, /ugcCameraId/);
  assert.match(server, /ugc-shot-composer\.js/);
});
