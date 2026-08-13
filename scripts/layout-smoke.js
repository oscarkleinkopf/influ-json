#!/usr/bin/env node
/**
 * UX — layout smoke visual (DoD PLAN-NEXT).
 * Arranca el Studio, abre / en Chrome headless, comprueba ancho de .main-content
 * en hubs clave (dashboard, Persona pasos, Negocio) y guarda screenshots.
 *
 * Requiere: google-chrome/chromium + puppeteer-core (devDependency).
 * Env: STUDIO_PIN, CHROME_PATH, LAYOUT_SHOT_DIR, LAYOUT_SHOT_PATH, PORT
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
    '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
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

async function dismissOverlays(page) {
  await page.evaluate(() => {
    for (const id of ['setupPinModal', 'founderOnboardingModal', 'loginModal']) {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    }
    document.getElementById('btnSetupPinLater')?.click();
  }).catch(() => {});
}

async function mainMetrics(page) {
  return page.evaluate(() => {
    const main = document.querySelector('.main-content');
    const app = document.querySelector('.app-container');
    const panels = document.querySelectorAll('main.main-content > section.tab-panel');
    const r = main ? main.getBoundingClientRect() : null;
    return {
      mainWidth: r ? r.width : 0,
      viewport: window.innerWidth,
      panelCount: panels.length,
      appExists: !!app,
      activeTab: window.state?.activeTab || null,
      personaStep: document.getElementById('persona-engine')?.getAttribute('data-active-step') || null
    };
  });
}

async function main() {
  let puppeteer;
  try {
    puppeteer = require('puppeteer-core');
  } catch (_) {
    console.error('[layout-smoke] Falta puppeteer-core. npm i -D puppeteer-core');
    process.exit(2);
  }

  const chromePath = findChrome();
  if (!chromePath) {
    console.error('[layout-smoke] No se encontró Chrome/Chromium (CHROME_PATH)');
    process.exit(2);
  }

  const dataDir = process.env.DATA_DIR || fs.mkdtempSync(path.join(os.tmpdir(), 'influ-layout-'));
  process.env.DATA_DIR = dataDir;
  process.env.INFLU_SKIP_DB_MIGRATE = '1';
  process.env.INFLU_SKIP_ENV_PERSIST = '1';
  process.env.DISABLE_GIT_BACKUP = '1';
  process.env.ENABLE_GIT_BACKUP = '';
  process.env.STUDIO_PIN = process.env.STUDIO_PIN || '1234';
  process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'layout-smoke-secret';
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

  const shotDir = process.env.LAYOUT_SHOT_DIR
    || path.join('/opt/cursor/artifacts/screenshots', 'layout-smoke');
  fs.mkdirSync(shotDir, { recursive: true });
  // Legacy single-path still written for CI upload compatibility
  const legacyShot = process.env.LAYOUT_SHOT_PATH
    || path.join(process.env.LAYOUT_SHOT_DIR || path.join(root, 'artifacts'), 'layout-smoke-dashboard.png');
  if (process.env.LAYOUT_SHOT_DIR || process.env.LAYOUT_SHOT_PATH) {
    fs.mkdirSync(path.dirname(legacyShot), { recursive: true });
  }

  const report = { ok: true, shots: [], checks: [] };
  const shot = (name) => path.join(shotDir, name);

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

    // Seed one persona so Negocio/Persona steps show real context
    const createRes = await fetch(`${base}/api/personas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      body: JSON.stringify({
        name: 'Layout Smoke Luna',
        gender: 'Female',
        age: '24 años',
        ethnicity: 'Latina',
        style: 'Natural UGC',
        hair: 'Castaño ondulado',
        clothing: 'camiseta blanca',
        setting: 'sala moderna',
        lighting: 'luz natural',
        camera: 'iPhone selfie',
        detailedJSON: {
          character_lock: {
            must_match_every_image: {
              name: 'Layout Smoke Luna',
              skin_tone: 'piel clara',
              eyes: 'marrón',
              hair: 'castaño ondulado'
            }
          }
        }
      })
    });
    const created = await createRes.json().catch(() => ({}));
    if (!createRes.ok || !created.success) {
      throw new Error(`create persona failed: ${createRes.status}`);
    }
    report.checks.push({ check: 'seed-persona', pass: true });

    await page.goto(`${base}/`, { waitUntil: 'networkidle2', timeout: 60000 });
    await dismissOverlays(page);
    await page.waitForSelector('.main-content', { timeout: 15000 });

    const assertWidth = async (label) => {
      const metrics = await mainMetrics(page);
      const minWidth = metrics.viewport * 0.7;
      const pass = metrics.mainWidth >= minWidth && metrics.panelCount >= 8;
      report.checks.push({ check: `width:${label}`, pass, metrics });
      if (!pass) report.ok = false;
      return metrics;
    };

    // 01 dashboard
    let metrics = await assertWidth('dashboard');
    await page.screenshot({ path: shot('01-dashboard.png'), fullPage: false });
    report.shots.push(shot('01-dashboard.png'));
    // Keep CI legacy artifact name
    try {
      fs.copyFileSync(shot('01-dashboard.png'), legacyShot);
    } catch (_) {
      await page.screenshot({ path: legacyShot, fullPage: false });
    }

    // Select persona + Persona Engine steps
    await page.evaluate((name) => {
      if (typeof window.selectPersona === 'function' && window.state?.personas) {
        const p = window.state.personas.find((x) => x.name === name);
        if (p) window.selectPersona(p);
      }
      if (typeof navigateToTab === 'function') navigateToTab('persona-engine');
    }, 'Layout Smoke Luna');
    await new Promise((r) => setTimeout(r, 400));

    // Create-from-scratch: compact Identidad (altura + controles)
    await page.evaluate(() => {
      if (typeof startCreateScratchFlow === 'function') startCreateScratchFlow();
    });
    await new Promise((r) => setTimeout(r, 600));
    const createMetrics = await page.evaluate(() => {
      const pe = document.getElementById('persona-engine');
      const form = document.getElementById('personaForm');
      const isVisible = (el) => {
        if (!el) return false;
        if (el.closest('details:not([open])')) return false;
        const s = getComputedStyle(el);
        if (s.display === 'none' || s.visibility === 'hidden') return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      };
      const controls = [...(pe?.querySelectorAll('button, input, select, textarea') || [])].filter(isVisible);
      return {
        step: pe?.getAttribute('data-active-step'),
        formOpen: pe?.getAttribute('data-form-open'),
        creating: pe?.getAttribute('data-creating'),
        peScrollHeight: pe?.scrollHeight || 0,
        visibleControls: controls.length,
        createCardHidden: !isVisible(document.getElementById('personaCreateOptionsCard')),
        rightPanelHidden: !isVisible(document.getElementById('personaRightPanel')),
        archiveHidden: !isVisible(document.getElementById('btnArchivePersona'))
      };
    });
    const createPass = createMetrics.step === '1'
      && createMetrics.formOpen === '1'
      && createMetrics.creating === '1'
      && createMetrics.createCardHidden
      && createMetrics.rightPanelHidden
      && createMetrics.archiveHidden
      && createMetrics.peScrollHeight <= 2200
      && createMetrics.visibleControls <= 40;
    report.checks.push({ check: 'persona-create-compact', pass: createPass, createMetrics });
    if (!createPass) report.ok = false;
    await page.screenshot({ path: shot('01b-persona-create.png'), fullPage: false });
    report.shots.push(shot('01b-persona-create.png'));

    // Re-select seeded persona for remaining steps (exit create mode)
    await page.evaluate((name) => {
      const p = (window.state?.personas || []).find((x) => x.name === name);
      if (p && typeof window.selectPersona === 'function') window.selectPersona(p);
      if (typeof updateActivePersonaChip === 'function') updateActivePersonaChip();
      if (typeof populateActiveUgcData === 'function') populateActiveUgcData();
      if (typeof setPersonaStep === 'function') setPersonaStep(2, { scroll: false });
    }, 'Layout Smoke Luna');
    await new Promise((r) => setTimeout(r, 500));
    const reselected = await page.evaluate(() => ({
      name: window.state?.selectedPersona?.name || null,
      creating: !!window.state?.isCreatingNewPersona,
      chip: (document.getElementById('activePersonaChipName')?.textContent || '').trim()
    }));
    report.checks.push({
      check: 'reselect-after-create',
      pass: reselected.name === 'Layout Smoke Luna' && !reselected.creating,
      reselected
    });
    if (reselected.name !== 'Layout Smoke Luna' || reselected.creating) report.ok = false;

    for (const step of [1, 2, 3]) {
      await page.evaluate((n) => {
        if (typeof setPersonaStep === 'function') setPersonaStep(n, { scroll: false });
      }, step);
      await new Promise((r) => setTimeout(r, 350));
      metrics = await assertWidth(`persona-step-${step}`);
      const stepInfo = await page.evaluate((n) => {
        const root = document.getElementById('persona-engine');
        const extra = document.getElementById('personaIdentityExtraTraits');
        const adv = document.getElementById('personaAdvancedTools');
        const copy = document.getElementById('btnCopyPackFullbodyPrimary');
        const skin = document.getElementById('pSkinTone');
        return {
          activeStep: root?.getAttribute('data-active-step'),
          extraOpen: !!extra?.open,
          advOpen: !!adv?.open,
          copyVisible: !!(copy && getComputedStyle(copy).display !== 'none'),
          skinVisible: !!(skin && getComputedStyle(skin).display !== 'none'
            && skin.offsetParent !== null)
        };
      }, step);
      const stepPass = stepInfo.activeStep === String(step)
        && (step !== 1 || stepInfo.extraOpen === false)
        && (step !== 2 || stepInfo.copyVisible)
        && (step !== 2 || stepInfo.advOpen === false);
      report.checks.push({ check: `persona-step-${step}`, pass: stepPass, stepInfo });
      if (!stepPass) report.ok = false;
      await page.screenshot({ path: shot(`0${step + 1}-persona-step-${step}.png`), fullPage: false });
      report.shots.push(shot(`0${step + 1}-persona-step-${step}.png`));
    }

    // Negocio: Licensing
    await page.evaluate(() => {
      if (typeof navigateToTab === 'function') navigateToTab('licensing');
      if (typeof populateActiveUgcData === 'function') populateActiveUgcData();
    });
    await new Promise((r) => setTimeout(r, 400));
    metrics = await assertWidth('licensing');
    const lic = await page.evaluate(() => {
      const chip = (document.getElementById('activePersonaChipName')?.textContent || '').trim();
      const name = (document.getElementById('licenseActivePersonaName')?.textContent || '').trim();
      return { chip, name, match: !!chip && chip === name };
    });
    const licPass = lic.match && /Layout Smoke Luna/i.test(lic.name);
    report.checks.push({ check: 'licensing-chip', pass: licPass, lic });
    if (!licPass) report.ok = false;
    await page.screenshot({ path: shot('05-licensing.png'), fullPage: false });
    report.shots.push(shot('05-licensing.png'));

    // Negocio: Campañas empty (1 CTA)
    await page.evaluate(() => {
      if (typeof navigateToTab === 'function') navigateToTab('campaigns');
      if (typeof renderCampaigns === 'function') return renderCampaigns();
    });
    await new Promise((r) => setTimeout(r, 500));
    metrics = await assertWidth('campaigns');
    const campEmpty = await page.evaluate(() => {
      const emptyBtn = document.getElementById('btnEmptyCampaignCreate');
      const headerBtn = document.getElementById('btnNewCampaign');
      return {
        hasEmptyCta: !!emptyBtn,
        emptyVisible: !!(emptyBtn && getComputedStyle(emptyBtn).display !== 'none'),
        headerHidden: !!(headerBtn && headerBtn.hidden)
      };
    });
    const campPass = campEmpty.hasEmptyCta && campEmpty.emptyVisible && campEmpty.headerHidden;
    report.checks.push({ check: 'campaigns-empty-one-cta', pass: campPass, campEmpty });
    if (!campPass) report.ok = false;
    await page.screenshot({ path: shot('06-campaigns-empty.png'), fullPage: false });
    report.shots.push(shot('06-campaigns-empty.png'));

    // Open modal via empty CTA → pre-check persona
    if (campEmpty.hasEmptyCta) {
      await page.click('#btnEmptyCampaignCreate');
      await new Promise((r) => setTimeout(r, 400));
    }
    const precheck = await page.evaluate(() => {
      const checks = [...document.querySelectorAll('input[name="personaCheck"]')];
      const checked = checks.filter((c) => c.checked);
      return {
        total: checks.length,
        checkedCount: checked.length,
        hasLuna: checked.some((c) => /Layout Smoke Luna/i.test(c.closest('label')?.textContent || ''))
      };
    });
    const prePass = precheck.hasLuna && precheck.checkedCount >= 1;
    report.checks.push({ check: 'campaigns-precheck', pass: prePass, precheck });
    if (!prePass) report.ok = false;
    await page.screenshot({ path: shot('07-campaigns-precheck.png'), fullPage: false });
    report.shots.push(shot('07-campaigns-precheck.png'));

    const reportPath = path.join(shotDir, 'layout-smoke-report.json');
    fs.writeFileSync(reportPath, JSON.stringify({ ...report, metrics }, null, 2));
    console.log('[layout-smoke] report →', reportPath);
    console.log(JSON.stringify(report, null, 2));
    if (!report.ok) {
      throw new Error('layout-smoke checks failed — ver layout-smoke-report.json');
    }
    console.log('[layout-smoke] OK');
  } finally {
    if (browser) await browser.close().catch(() => {});
    await new Promise((r) => server.close(r));
    if (!process.env.DATA_DIR || process.env.INFLU_KEEP_TEST_DATA !== '1') {
      try {
        fs.rmSync(dataDir, { recursive: true, force: true });
      } catch (_) {}
    }
  }
}

main().catch((err) => {
  console.error('[layout-smoke] FAIL', err.message || err);
  process.exit(1);
});
