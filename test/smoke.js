/**
 * Smoke happy-path — boot efímero del Studio y 9 checks (PLAN W2).
 *
 * Uso:
 *   npm run smoke
 *   DISABLE_GIT_BACKUP=1 node test/smoke.js
 *
 * Exit 0 si todo pasa; ≠0 si algo falla.
 * Payload de personas: columnas planas + detailedJSON (como app.js savePersona).
 */
process.env.DISABLE_GIT_BACKUP = '1';
process.env.ENABLE_GIT_BACKUP = '';
process.env.INFLU_SKIP_ENV_PERSIST = process.env.INFLU_SKIP_ENV_PERSIST || '1';
process.env.STUDIO_PIN = process.env.STUDIO_PIN || '1234';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'smoke-session-secret';
process.env.GEN_MIN_GAP_MS = process.env.GEN_MIN_GAP_MS || '10';
process.env.GEN_429_COOLDOWN_MS = process.env.GEN_429_COOLDOWN_MS || '50';

const http = require('node:http');
const { buildFreeChatbotPack } = require('../chatbot-packs');
const { makeTestJpegBuffer } = require('../image-validation');
const app = require('../server');

const PIN = (process.env.STUDIO_PIN || '1234').trim();
const results = [];

function ok(step, detail) {
  results.push({ step, pass: true, detail });
  console.log(`PASS  ${step} — ${detail}`);
}

function fail(step, detail) {
  results.push({ step, pass: false, detail });
  console.error(`FAIL  ${step} — ${detail}`);
}

function cookieFrom(res) {
  return (res.headers.getSetCookie?.()?.[0] || res.headers.get('set-cookie') || '').split(';')[0];
}

async function boot() {
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return {
    base: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(resolve))
  };
}

async function runSmoke(base) {
  let adminCookie;
  let createdId;
  let confirmedId;
  const createdIds = [];
  const smokeName = `SmokeCreate_${Date.now()}`;
  const importName = `SmokeImport_${Date.now()}`;

  {
    const res = await fetch(`${base}/api/status`);
    const data = await res.json();
    if (res.status === 200 && data.imageProviders?.active === 'pollinations') {
      ok('0.status', 'pollinations free path');
    } else {
      fail('0.status', JSON.stringify(data).slice(0, 200));
    }
  }

  {
    const res = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: PIN })
    });
    const data = await res.json();
    adminCookie = cookieFrom(res);
    if (res.status === 200 && data.success && adminCookie) {
      ok('1.login-admin', `role=${data.profile?.role || 'admin'}`);
    } else {
      fail('1.login-admin', JSON.stringify(data));
    }
  }

  {
    const detailedJSON = {
      identity: {
        name: smokeName,
        gender: 'Female',
        apparent_age: '25 años',
        ethnicity_appearance: 'Latina de tez clara'
      },
      facial_features: {
        face_shape: 'ovalada',
        skin_tone: 'piel clara',
        skin_tone_hex: '#f0d5c0'
      },
      hair: { length: 'largo', texture: 'liso', color: 'Castaño' },
      body: { body_type: 'Atlético' },
      aesthetic: { overall_vibe: 'Casual' },
      character_lock: {
        free_chatbot_system: 'Misma persona siempre.',
        must_match_every_image: {
          name: smokeName,
          skin_tone: 'piel clara',
          skin_tone_hex: '#f0d5c0'
        }
      }
    };
    const payload = {
      forceCreate: true,
      name: smokeName,
      gender: 'Female',
      age: '25 años',
      ethnicity: 'Latina de tez clara',
      style: 'Casual',
      hair: 'largo, liso, color Castaño',
      clothing: 'Top casual',
      setting: 'Estudio',
      detailedJSON
    };
    const save = await fetch(`${base}/api/personas`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
        Authorization: `Bearer ${PIN}`
      },
      body: JSON.stringify(payload)
    });
    const saved = await save.json();
    createdId = saved.persona?.id;
    if (createdId) createdIds.push(createdId);
    const data = await (
      await fetch(`${base}/api/data`, {
        headers: { Cookie: adminCookie, Authorization: `Bearer ${PIN}` }
      })
    ).json();
    const inList = (data.personas || []).some((p) => p.id === createdId);
    if (save.status === 200 && createdId && inList) {
      ok('2.create-save-roster', `id=${createdId}`);
    } else {
      fail(
        '2.create-save-roster',
        `status=${save.status} msg=${saved.message} id=${createdId} inList=${inList}`
      );
    }

    const packSource =
      typeof saved.persona?.detailedJSON === 'object' && saved.persona.detailedJSON
        ? saved.persona.detailedJSON
        : detailedJSON;
    const pack = buildFreeChatbotPack(packSource, 'fullbody');
    if (pack.includes('CHARACTER LOCK') && pack.includes(smokeName) && pack.includes('#f0d5c0')) {
      ok('3.copy-pack-fullbody', `len=${pack.length}`);
    } else {
      fail('3.copy-pack-fullbody', 'missing lock/name/hex');
    }
  }

  let previewPersona;
  let previewPaths = [];
  {
    const form = new FormData();
    form.append('name', importName);
    form.append('previewOnly', '1');
    const jpeg = await makeTestJpegBuffer({ background: '#c49a6c' });
    form.append('photo', new Blob([jpeg], { type: 'image/jpeg' }), 'smoke.jpg');
    const res = await fetch(`${base}/api/import-influencer`, {
      method: 'POST',
      headers: { Cookie: adminCookie, Authorization: `Bearer ${PIN}` },
      body: form
    });
    const data = await res.json();
    previewPersona = data.persona;
    if (data.persona?.image) previewPaths.push(data.persona.image);
    const roster = await (
      await fetch(`${base}/api/data`, {
        headers: { Cookie: adminCookie, Authorization: `Bearer ${PIN}` }
      })
    ).json();
    const leaked = (roster.personas || []).some((p) => p.name === importName);
    if (res.status === 200 && data.preview === true && !data.persona?.id && !leaked) {
      ok('4.import-preview-no-save', 'ok');
    } else {
      fail(
        '4.import-preview-no-save',
        `status=${res.status} preview=${data.preview} leaked=${leaked} msg=${data.message || ''}`
      );
    }
  }

  {
    const res = await fetch(`${base}/api/import-preview/discard`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
        Authorization: `Bearer ${PIN}`
      },
      body: JSON.stringify({
        imagePaths: previewPaths,
        paths: previewPaths,
        references: previewPersona?.references || []
      })
    });
    const roster = await (
      await fetch(`${base}/api/data`, {
        headers: { Cookie: adminCookie, Authorization: `Bearer ${PIN}` }
      })
    ).json();
    const leaked = (roster.personas || []).some((p) => p.name === importName);
    if (res.status === 200 && !leaked) ok('5.discard-preview', 'ok');
    else fail('5.discard-preview', `status=${res.status} leaked=${leaked}`);
  }

  {
    const form = new FormData();
    form.append('name', importName);
    form.append('previewOnly', '1');
    const jpeg2 = await makeTestJpegBuffer({ background: '#b8896a' });
    form.append('photo', new Blob([jpeg2], { type: 'image/jpeg' }), 'smoke2.jpg');
    const preview = await (
      await fetch(`${base}/api/import-influencer`, {
        method: 'POST',
        headers: { Cookie: adminCookie, Authorization: `Bearer ${PIN}` },
        body: form
      })
    ).json();
    const payload = { ...preview.persona, forceCreate: true, name: importName };
    delete payload.id;
    if (payload.hair && typeof payload.hair === 'object') {
      payload.detailedJSON = payload.detailedJSON || { hair: payload.hair };
      payload.hair = [payload.hair.length, payload.hair.texture, payload.hair.color]
        .filter(Boolean)
        .join(', ');
    }
    const saveRes = await fetch(`${base}/api/personas`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
        Authorization: `Bearer ${PIN}`
      },
      body: JSON.stringify(payload)
    });
    const saved = await saveRes.json();
    confirmedId = saved.persona?.id;
    if (confirmedId) createdIds.push(confirmedId);
    const roster = await (
      await fetch(`${base}/api/data`, {
        headers: { Cookie: adminCookie, Authorization: `Bearer ${PIN}` }
      })
    ).json();
    const matches = (roster.personas || []).filter((p) => p.name === importName);
    if (saveRes.status === 200 && confirmedId && matches.length === 1) {
      ok('6.confirm-import-once', `id=${confirmedId}`);
    } else {
      fail(
        '6.confirm-import-once',
        `status=${saveRes.status} msg=${saved.message} id=${confirmedId} count=${matches.length}`
      );
    }
  }

  {
    const niches = await fetch(`${base}/api/niches`, {
      headers: { Cookie: adminCookie, Authorization: `Bearer ${PIN}` }
    });
    const nicheData = await niches.json();
    const exp = await fetch(`${base}/api/export/persona/${createdId}`, {
      headers: { Cookie: adminCookie, Authorization: `Bearer ${PIN}` }
    });
    const buf = Buffer.from(await exp.arrayBuffer());
    const isZip = buf[0] === 0x50 && buf[1] === 0x4b;
    const list = nicheData.niches || nicheData;
    if (niches.status === 200 && list.length && exp.status === 200 && isZip) {
      ok('7.export-zip-niches', `zipBytes=${buf.length} niches=${list.length}`);
    } else {
      fail(
        '7.export-zip-niches',
        `niches=${niches.status} exp=${exp.status} zip=${isZip} len=${buf.length}`
      );
    }
  }

  {
    const inviteRes = await fetch(`${base}/api/invites`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminCookie,
        Authorization: `Bearer ${PIN}`
      },
      body: JSON.stringify({ label: `smoke_${Date.now()}`, note: 'smoke', maxUses: 1 })
    });
    const invite = await inviteRes.json();
    const code = invite.invite?.code || invite.code;
    const memberPin = `9${String(Date.now()).slice(-5)}`;
    const redeemed = await (
      await fetch(`${base}/api/invites/redeem`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          name: `SmokeMember_${Date.now()}`,
          pin: memberPin
        })
      })
    ).json();
    const memberId = redeemed.profile?.id;
    const memLogin = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: memberPin, profileId: memberId })
    });
    const memberCookie = cookieFrom(memLogin);
    const roster = await (
      await fetch(`${base}/api/data`, { headers: { Cookie: memberCookie } })
    ).json();
    const seesAdmin = (roster.personas || []).some((p) => createdIds.includes(p.id));
    const del = await fetch(`${base}/api/personas/${createdId}`, {
      method: 'DELETE',
      headers: { Cookie: memberCookie }
    });
    const exp = await fetch(`${base}/api/export/persona/${createdId}`, {
      headers: { Cookie: memberCookie }
    });
    if (!seesAdmin && del.status === 404 && exp.status === 404) {
      ok('8.member-isolation', `personas=${(roster.personas || []).length}`);
    } else {
      fail(
        '8.member-isolation',
        `seesAdmin=${seesAdmin} del=${del.status} exp=${exp.status} inviteOk=${!!code}`
      );
    }
  }

  for (const id of createdIds) {
    await fetch(`${base}/api/personas/${id}`, {
      method: 'DELETE',
      headers: { Cookie: adminCookie, Authorization: `Bearer ${PIN}` }
    });
  }

  return results;
}

async function main() {
  const { base, close } = await boot();
  try {
    await runSmoke(base);
  } finally {
    await close();
  }

  const failed = results.filter((r) => !r.pass);
  console.log('\n--- smoke summary ---');
  console.log(`pass=${results.length - failed.length} fail=${failed.length}`);
  if (failed.length) {
    process.exitCode = 1;
  }
}

// Runnable as script; also export for optional require()
if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(2);
  });
}

module.exports = { runSmoke, boot };
