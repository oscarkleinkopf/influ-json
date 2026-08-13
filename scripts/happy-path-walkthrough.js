#!/usr/bin/env node
/**
 * Walkthrough happy path free + Produce declutter (capturas).
 * Login → crear persona (API) → Copiar JSON en UI → Producir sin Galería → Ver galería desde ficha.
 *
 * Uso: node scripts/happy-path-walkthrough.js
 * Env: STUDIO_PIN, CHROME_PATH, WALK_SHOT_DIR
 */
'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const os = require('os');

const root = path.join(__dirname, '..');

function findChrome() {
  if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) {
    return process.env.CHROME_PATH;
  }
  const candidates = [
    '/usr/local/bin/google-chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser'
  ];
  return candidates.find((p) => fs.existsSync(p)) || null;
}

async function setSessionCookies(page, base, pin) {
  const login = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin })
  });
  if (!login.ok) throw new Error(`login HTTP ${login.status}`);
  const setCookie = login.headers.getSetCookie?.() || [];
  const raw = login.headers.get('set-cookie');
  const cookies = setCookie.length ? setCookie : (raw ? raw.split(/,(?=\s*[^;]+=)/) : []);
  for (const c of cookies) {
    const [pair] = c.split(';');
    const eq = pair.indexOf('=');
    if (eq < 0) continue;
    await page.setCookie({
      name: pair.slice(0, eq).trim(),
      value: pair.slice(eq + 1).trim(),
      url: base
    });
  }
  return cookies.map((c) => c.split(';')[0]).join('; ');
}

async function main() {
  const puppeteer = require('puppeteer-core');
  const chromePath = findChrome();
  if (!chromePath) throw new Error('Chrome/Chromium no encontrado');

  const dataDir = process.env.DATA_DIR || fs.mkdtempSync(path.join(os.tmpdir(), 'influ-walk-'));
  process.env.DATA_DIR = dataDir;
  process.env.INFLU_SKIP_DB_MIGRATE = '1';
  process.env.INFLU_SKIP_ENV_PERSIST = '1';
  process.env.DISABLE_GIT_BACKUP = '1';
  process.env.ENABLE_GIT_BACKUP = '';
  process.env.STUDIO_PIN = process.env.STUDIO_PIN || '1234';
  process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'happy-path-walk-secret';
  process.env.HOST = '127.0.0.1';

  Object.keys(require.cache).forEach((k) => {
    if (k.includes(`${path.sep}paths.js`) || k.includes(`${path.sep}db.js`) || k.includes(`${path.sep}server.js`)) {
      delete require.cache[k];
    }
  });

  const app = require(path.join(root, 'server.js'));
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;
  const pin = process.env.STUDIO_PIN;

  const shotDir = process.env.WALK_SHOT_DIR
    || path.join('/opt/cursor/artifacts/screenshots', 'happy-path');
  fs.mkdirSync(shotDir, { recursive: true });
  const shot = (name) => path.join(shotDir, name);

  const report = { steps: [], shots: [], ok: true };

  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath: chromePath,
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--window-size=1440,900']
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });

    const cookieHeader = await setSessionCookies(page, base, pin);

    // Create persona via API (same session cookie)
    const createRes = await fetch(`${base}/api/personas`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookieHeader
      },
      body: JSON.stringify({
        name: 'Walkthrough Luna',
        gender: 'Female',
        age: '24 años',
        ethnicity: 'Latina',
        style: 'Natural UGC',
        hair: 'Castaño ondulado',
        clothing: 'camiseta blanca',
        setting: 'sala moderna',
        lighting: 'luz natural ventana',
        camera: 'iPhone 15 Pro selfie',
        detailedJSON: {
          character_lock: {
            must_match_every_image: {
              name: 'Walkthrough Luna',
              skin_tone: 'piel clara natural',
              eyes: 'marrón oscuro',
              hair: 'castaño ondulado medio'
            }
          }
        }
      })
    });
    const created = await createRes.json().catch(() => ({}));
    if (!createRes.ok || !created.success) {
      throw new Error(`create persona failed: ${createRes.status} ${JSON.stringify(created).slice(0, 200)}`);
    }
    report.steps.push({ step: 'create-persona-api', pass: true, id: created.persona?.id || created.id });

    await page.goto(`${base}/`, { waitUntil: 'networkidle2', timeout: 60000 });
    // Dismiss blocking overlays if present
    await page.evaluate(() => {
      for (const id of ['setupPinModal', 'founderOnboardingModal', 'loginModal']) {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
      }
      const later = document.getElementById('btnSetupPinLater');
      if (later) later.click();
    }).catch(() => {});

    await page.waitForSelector('.main-content', { timeout: 15000 });
    await page.screenshot({ path: shot('01-portafolio.png'), fullPage: false });
    report.shots.push(shot('01-portafolio.png'));
    report.steps.push({ step: 'portafolio', pass: true });

    // Select persona in UI if visible
    await page.evaluate((name) => {
      const cards = [...document.querySelectorAll('.persona-card, [data-persona-id], .portfolio-card')];
      const hit = cards.find((c) => (c.textContent || '').includes(name));
      if (hit) hit.click();
      else if (typeof window.selectPersona === 'function' && window.state?.personas) {
        const p = window.state.personas.find((x) => x.name === name);
        if (p) window.selectPersona(p);
      }
    }, 'Walkthrough Luna');
    await new Promise((r) => setTimeout(r, 400));

    // Visual smoke — Persona Engine pasos 1→2→3
    await page.evaluate(() => {
      if (typeof navigateToTab === 'function') navigateToTab('persona-engine');
    });
    for (const step of [1, 2, 3]) {
      await page.evaluate((n) => {
        if (typeof setPersonaStep === 'function') setPersonaStep(n, { scroll: false });
      }, step);
      await new Promise((r) => setTimeout(r, 350));
      const info = await page.evaluate(() => {
        const root = document.getElementById('persona-engine');
        const extra = document.getElementById('personaIdentityExtraTraits');
        const adv = document.getElementById('personaAdvancedTools');
        const copy = document.getElementById('btnCopyPackFullbodyPrimary');
        return {
          activeStep: root?.getAttribute('data-active-step'),
          extraOpen: !!extra?.open,
          advOpen: !!adv?.open,
          hasCopy: !!copy
        };
      });
      const stepOk = info.activeStep === String(step)
        && (step !== 1 || info.extraOpen === false)
        && (step !== 2 || info.hasCopy)
        && (step !== 2 || info.advOpen === false);
      await page.screenshot({ path: shot(`01b-persona-step-${step}.png`), fullPage: false });
      report.shots.push(shot(`01b-persona-step-${step}.png`));
      report.steps.push({ step: `persona-step-${step}`, pass: stepOk, info });
      if (!stepOk) report.ok = false;
    }

    // Go to ficha / step 2
    await page.evaluate(() => {
      if (typeof navigateToTab === 'function') navigateToTab('persona-engine');
      if (typeof setPersonaStep === 'function') setPersonaStep(2, { scroll: true });
    });
    await new Promise((r) => setTimeout(r, 500));

    const copyBtn = await page.$('#btnCopyPackFullbodyPrimary, #btnContextCopyJson');
    if (!copyBtn) throw new Error('No se encontró botón Copiar JSON');
    await page.evaluate(async () => {
      window.__lastClipboard = '';
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: async (t) => {
            window.__lastClipboard = String(t || '');
            return undefined;
          },
          readText: async () => window.__lastClipboard || ''
        }
      });
    });
    await copyBtn.click();
    await new Promise((r) => setTimeout(r, 600));
    const copied = await page.evaluate(() => window.__lastClipboard || '');
    const copyOk = copied.length > 40 && /character_lock|must_match/i.test(copied);
    await page.screenshot({ path: shot('02-copiar-json.png'), fullPage: false });
    report.shots.push(shot('02-copiar-json.png'));
    report.steps.push({
      step: 'copiar-json',
      pass: copyOk,
      clipboardChars: copied.length,
      hasLock: /character_lock|must_match/i.test(copied)
    });
    if (!copyOk) {
      throw new Error(
        `Copiar JSON no dejó character_lock en clipboard (chars=${copied.length})`
      );
    }

    // Produce hub — assert no Galería in subnav
    await page.evaluate(() => {
      if (typeof navigateToTab === 'function') navigateToTab('ugc-studio');
    });
    await new Promise((r) => setTimeout(r, 400));
    const produceNav = await page.evaluate(() => {
      const inner = document.querySelector('.hub-subnav-inner[data-hub="produce"]');
      const tabs = [...(inner?.querySelectorAll('[data-tab]') || [])].map((b) => b.getAttribute('data-tab'));
      const labels = [...(inner?.querySelectorAll('.hub-subnav-btn') || [])].map((b) => (b.textContent || '').trim());
      return { tabs, labels, hidden: !!inner?.hidden };
    });
    await page.screenshot({ path: shot('03-produce-subnav.png'), fullPage: false });
    report.shots.push(shot('03-produce-subnav.png'));
    const produceOk = produceNav.tabs.includes('ugc-studio')
      && produceNav.tabs.includes('script-engine')
      && !produceNav.tabs.includes('gallery')
      && !produceNav.labels.some((l) => /galer/i.test(l));
    report.steps.push({ step: 'produce-no-gallery', pass: produceOk, produceNav });
    if (!produceOk) report.ok = false;

    // UGC Copiar JSON
    const ugcBtn = await page.$('#btnExportUgcChatbot');
    if (ugcBtn) {
      await ugcBtn.click();
      await new Promise((r) => setTimeout(r, 500));
    }
    await page.screenshot({ path: shot('04-ugc-copiar.png'), fullPage: false });
    report.shots.push(shot('04-ugc-copiar.png'));
    report.steps.push({ step: 'ugc-copiar', pass: !!ugcBtn });

    // Ver galería from ficha
    await page.evaluate(() => {
      if (typeof navigateToTab === 'function') navigateToTab('persona-engine');
    });
    await new Promise((r) => setTimeout(r, 300));
    const openGal = await page.$('#btnOpenGalleryFromFicha');
    if (openGal) await openGal.click();
    await new Promise((r) => setTimeout(r, 500));
    const onGallery = await page.evaluate(() => {
      const panel = document.getElementById('gallery');
      const emptyCta = document.getElementById('btnEmptyGalleryCopyJson');
      return {
        panelActive: panel && !panel.classList.contains('u-hidden') && getComputedStyle(panel).display !== 'none',
        hasEmptyCta: !!emptyCta,
        activeTab: window.state?.activeTab || null
      };
    });
    await page.screenshot({ path: shot('05-galeria.png'), fullPage: false });
    report.shots.push(shot('05-galeria.png'));
    const galOk = onGallery.activeTab === 'gallery' || onGallery.panelActive;
    report.steps.push({ step: 'ver-galeria', pass: galOk, onGallery });
    if (!galOk) report.ok = false;

    if (onGallery.hasEmptyCta) {
      await page.click('#btnEmptyGalleryCopyJson');
      await new Promise((r) => setTimeout(r, 600));
      const after = await page.evaluate(() => {
        const pe = document.getElementById('persona-engine');
        const copy = document.getElementById('btnCopyPackFullbodyPrimary');
        return {
          tab: window.state?.activeTab || null,
          personaVisible: !!(pe && getComputedStyle(pe).display !== 'none'),
          hasCopyBtn: !!copy
        };
      });
      const ctaOk = after.personaVisible || after.tab === 'persona-engine' || after.hasCopyBtn;
      report.steps.push({ step: 'empty-gallery-cta', pass: ctaOk, after });
      if (!ctaOk) report.ok = false;
    }

    // Negocio hub — Licensing mirrors chip; Campañas pre-checks active persona
    await page.evaluate(() => {
      if (typeof navigateToTab === 'function') navigateToTab('licensing');
      if (typeof populateActiveUgcData === 'function') populateActiveUgcData();
    });
    await new Promise((r) => setTimeout(r, 400));
    const licensingSync = await page.evaluate(() => {
      const chip = (document.getElementById('activePersonaChipName')?.textContent || '').trim();
      const license = (document.getElementById('licenseActivePersonaName')?.textContent || '').trim();
      return {
        chip,
        license,
        match: !!chip && chip === license,
        tab: window.state?.activeTab || null
      };
    });
    await page.screenshot({ path: shot('06-licensing.png'), fullPage: false });
    report.shots.push(shot('06-licensing.png'));
    const licOk = licensingSync.match && /Walkthrough Luna/i.test(licensingSync.license);
    report.steps.push({ step: 'negocio-licensing-chip', pass: licOk, licensingSync });
    if (!licOk) report.ok = false;

    await page.evaluate(() => {
      if (typeof navigateToTab === 'function') navigateToTab('campaigns');
      if (typeof renderCampaigns === 'function') return renderCampaigns();
    });
    await new Promise((r) => setTimeout(r, 500));
    const campEmpty = await page.evaluate(() => {
      const emptyBtn = document.getElementById('btnEmptyCampaignCreate');
      const headerBtn = document.getElementById('btnNewCampaign');
      return {
        hasEmptyCta: !!emptyBtn,
        emptyVisible: !!(emptyBtn && getComputedStyle(emptyBtn).display !== 'none'),
        headerHidden: !!(headerBtn && headerBtn.hidden)
      };
    });
    await page.screenshot({ path: shot('07a-campaigns-empty.png'), fullPage: false });
    report.shots.push(shot('07a-campaigns-empty.png'));
    const emptyOk = campEmpty.hasEmptyCta && campEmpty.emptyVisible && campEmpty.headerHidden;
    report.steps.push({ step: 'negocio-campaign-empty-cta', pass: emptyOk, campEmpty });
    if (!emptyOk) report.ok = false;

    const openCampaign = await page.$('#btnEmptyCampaignCreate');
    if (openCampaign) await openCampaign.click();
    else {
      const btnNew = await page.$('#btnNewCampaign');
      if (btnNew) {
        await page.evaluate(() => {
          const b = document.getElementById('btnNewCampaign');
          if (b) b.hidden = false;
        });
        await btnNew.click();
      }
    }
    await new Promise((r) => setTimeout(r, 400));
    const campaignPrecheck = await page.evaluate(() => {
      const checks = [...document.querySelectorAll('input[name="personaCheck"]')];
      const checked = checks.filter((c) => c.checked);
      const checkedNames = checked.map((c) => {
        const label = c.closest('label');
        return (label?.textContent || '').trim();
      });
      return {
        total: checks.length,
        checkedCount: checked.length,
        checkedNames,
        hasLuna: checkedNames.some((n) => /Walkthrough Luna/i.test(n))
      };
    });
    await page.screenshot({ path: shot('07-campaigns-precheck.png'), fullPage: false });
    report.shots.push(shot('07-campaigns-precheck.png'));
    const campOk = campaignPrecheck.hasLuna && campaignPrecheck.checkedCount >= 1;
    report.steps.push({ step: 'negocio-campaign-precheck', pass: campOk, campaignPrecheck });
    if (!campOk) report.ok = false;

    const reportPath = path.join(shotDir, 'walkthrough-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log('[happy-path-walk] report →', reportPath);
    console.log(JSON.stringify(report, null, 2));
    if (!report.ok) process.exitCode = 1;
    else console.log('[happy-path-walk] OK');
  } finally {
    if (browser) await browser.close().catch(() => {});
    await new Promise((r) => server.close(r));
  }
}

main().catch((err) => {
  console.error('[happy-path-walk] FAIL', err.message || err);
  process.exit(1);
});
