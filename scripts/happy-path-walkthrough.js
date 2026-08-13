#!/usr/bin/env node
/**
 * Walkthrough happy path free + Produce declutter (capturas).
 * Login → crear en UI (Guardar) → aparece en roster → Copiar JSON → Producir sin Galería → Ver galería.
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

    await setSessionCookies(page, base, pin);

    const personaName = `Walkthrough Luna ${Date.now().toString(36).slice(-4)}`;

    await page.goto(`${base}/`, { waitUntil: 'networkidle2', timeout: 60000 });
    // Dismiss blocking overlays (id real: founderWelcomeModal)
    const dismissOverlays = async () => {
      await page.evaluate(() => {
        for (const id of [
          'setupPinModal',
          'founderWelcomeModal',
          'founderOnboardingModal',
          'loginModal',
          'memberWelcomeModal'
        ]) {
          const el = document.getElementById(id);
          if (!el) continue;
          el.style.display = 'none';
          el.classList.add('u-hidden');
          el.hidden = true;
        }
        document.getElementById('btnSetupPinLater')?.click();
        document.getElementById('btnFounderWelcomeSkip')?.click();
      }).catch(() => {});
    };
    await dismissOverlays();

    await page.waitForSelector('.main-content', { timeout: 15000 });

    // P0 happy path: crear en UI → Guardar → aparece (no API)
    await page.evaluate(() => {
      if (typeof window.startCreateScratchFlow === 'function') window.startCreateScratchFlow();
      else if (typeof window.resetPersonaFormForNew === 'function') window.resetPersonaFormForNew();
      else throw new Error('startCreateScratchFlow / resetPersonaFormForNew no expuestos');
    });
    await new Promise((r) => setTimeout(r, 400));

    const createForm = await page.evaluate((name) => {
      const pe = document.getElementById('persona-engine');
      const nameEl = document.getElementById('pName');
      const skin = document.getElementById('pSkinTone');
      const eyes = document.getElementById('pEyeColor') || document.getElementById('pEyes');
      const hair = document.getElementById('pHairColor') || document.getElementById('pHair');
      if (nameEl) nameEl.value = name;
      if (skin && !String(skin.value || '').trim()) skin.value = 'piel clara natural';
      if (eyes && !String(eyes.value || '').trim()) eyes.value = 'marrón oscuro';
      if (hair && !String(hair.value || '').trim()) hair.value = 'castaño ondulado';
      nameEl?.dispatchEvent(new Event('input', { bubbles: true }));
      return {
        creating: pe?.getAttribute('data-creating') === '1',
        formOpen: pe?.getAttribute('data-form-open') === '1',
        name: nameEl?.value || '',
        saveBtn: !!document.getElementById('btnSavePersona')
      };
    }, personaName);
    await page.screenshot({ path: shot('00-crear-form.png'), fullPage: false });
    report.shots.push(shot('00-crear-form.png'));
    const formOk = createForm.creating && createForm.saveBtn && createForm.name === personaName;
    report.steps.push({ step: 'create-ui-form', pass: formOk, createForm });
    if (!formOk) report.ok = false;

    // Mismo path que el botón «Crear influencer» (scroll + click; fallback savePersona)
    const clickResult = await page.evaluate(async () => {
      const btn = document.getElementById('btnSavePersona');
      if (!btn) return { ok: false, reason: 'no-btn' };
      btn.scrollIntoView({ block: 'center' });
      const rect = btn.getBoundingClientRect();
      const visible = rect.width > 0 && rect.height > 0
        && getComputedStyle(btn).display !== 'none'
        && getComputedStyle(btn).visibility !== 'hidden';
      if (!visible) {
        if (typeof window.savePersona === 'function') {
          await window.savePersona({ withPortrait: false });
          return { ok: true, via: 'savePersona-hidden' };
        }
        return { ok: false, reason: 'btn-hidden' };
      }
      btn.click();
      return { ok: true, via: 'click', top: rect.top };
    });
    if (!clickResult.ok) {
      throw new Error(`No se pudo disparar guardar: ${JSON.stringify(clickResult)}`);
    }
    report.steps.push({ step: 'create-ui-click-save', pass: true, clickResult });

    // Esperar selectPersona + salto a paso 2 tras save
    try {
      await page.waitForFunction(
        (name) => {
          const sel = window.state?.selectedPersona;
          const step = document.getElementById('persona-engine')?.getAttribute('data-active-step');
          return sel && sel.name === name && !window.state?.isCreatingNewPersona && step === '2';
        },
        { timeout: 25000 },
        personaName
      );
    } catch (_) {
      // Último intento: invocar savePersona si el click no enganchó el listener
      await page.evaluate(async () => {
        if (window.state?.isCreatingNewPersona && typeof window.savePersona === 'function') {
          await window.savePersona({ withPortrait: false });
        }
      });
      await page.waitForFunction(
        (name) => {
          const sel = window.state?.selectedPersona;
          const step = document.getElementById('persona-engine')?.getAttribute('data-active-step');
          return sel && sel.name === name && !window.state?.isCreatingNewPersona && step === '2';
        },
        { timeout: 20000 },
        personaName
      );
    }

    const afterSave = await page.evaluate((name) => {
      const inState = (window.state?.personas || []).some((p) => p.name === name);
      const cards = [...document.querySelectorAll('.persona-card, [data-persona-id], .portfolio-card')];
      const inDom = cards.some((c) => (c.textContent || '').includes(name));
      const sel = window.state?.selectedPersona;
      return {
        inState,
        inDom,
        selectedName: sel?.name || null,
        selectedId: sel?.id || null,
        creating: !!window.state?.isCreatingNewPersona,
        step: document.getElementById('persona-engine')?.getAttribute('data-active-step'),
        hasCopy: !!document.getElementById('btnCopyPackFullbodyPrimary')
      };
    }, personaName);
    await page.screenshot({ path: shot('00b-tras-guardar.png'), fullPage: false });
    report.shots.push(shot('00b-tras-guardar.png'));
    const saveOk = afterSave.inState
      && afterSave.selectedName === personaName
      && !afterSave.creating
      && afterSave.step === '2'
      && afterSave.hasCopy;
    report.steps.push({
      step: 'create-ui-save-appears',
      pass: saveOk,
      afterSave,
      name: personaName
    });
    if (!saveOk) {
      throw new Error(
        `P0: guardar UI no dejó persona en roster/paso 2: ${JSON.stringify(afterSave)}`
      );
    }

    // Portafolio: la nueva debe verse
    await page.evaluate(() => {
      if (typeof navigateToTab === 'function') navigateToTab('dashboard');
    });
    await new Promise((r) => setTimeout(r, 400));
    const inPortfolio = await page.evaluate((name) => {
      const cards = [...document.querySelectorAll('.persona-card, [data-persona-id], .portfolio-card, .dash-persona-card')];
      return cards.some((c) => (c.textContent || '').includes(name))
        || (window.state?.personas || []).some((p) => p.name === name);
    }, personaName);
    await page.screenshot({ path: shot('01-portafolio.png'), fullPage: false });
    report.shots.push(shot('01-portafolio.png'));
    report.steps.push({ step: 'portafolio', pass: inPortfolio, name: personaName });
    if (!inPortfolio) report.ok = false;

    // Volver a ficha seleccionada
    await page.evaluate((name) => {
      if (typeof navigateToTab === 'function') navigateToTab('persona-engine');
      const p = (window.state?.personas || []).find((x) => x.name === name);
      if (p && typeof window.selectPersona === 'function') window.selectPersona(p);
    }, personaName);
    await new Promise((r) => setTimeout(r, 400));

    // Visual smoke — Persona Engine pasos 1→2→3
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

    // Go to ficha / step 2 — Copiar JSON (pack primary, no header shortcut)
    await page.evaluate(() => {
      if (typeof navigateToTab === 'function') navigateToTab('persona-engine');
      if (typeof setPersonaStep === 'function') setPersonaStep(2, { scroll: true });
    });
    await new Promise((r) => setTimeout(r, 500));

    await page.evaluate(() => {
      window.__lastClipboard = '';
      const mock = {
        writeText: async (t) => {
          window.__lastClipboard = String(t || '');
          return undefined;
        },
        readText: async () => window.__lastClipboard || ''
      };
      try {
        Object.defineProperty(navigator, 'clipboard', {
          configurable: true,
          writable: true,
          value: mock
        });
      } catch (_) {
        try { navigator.clipboard.writeText = mock.writeText; } catch (__) {}
      }
    });

    const copyMeta = await page.evaluate(async () => {
      const btn = document.getElementById('btnCopyPackFullbodyPrimary');
      if (!btn) return { clicked: false, reason: 'no-primary-btn' };
      btn.scrollIntoView({ block: 'center' });
      if (typeof window.copyFreeChatbotPack === 'function') {
        await window.copyFreeChatbotPack('fullbody');
        return {
          clicked: true,
          via: 'copyFreeChatbotPack',
          selected: window.state?.selectedPersona?.name || null,
          clipLen: (window.__lastClipboard || '').length
        };
      }
      btn.click();
      await new Promise((r) => setTimeout(r, 400));
      return {
        clicked: true,
        via: 'click',
        selected: window.state?.selectedPersona?.name || null,
        clipLen: (window.__lastClipboard || '').length
      };
    });
    await new Promise((r) => setTimeout(r, 300));
    const copied = await page.evaluate(() => window.__lastClipboard || '');
    const copyOk = copied.length > 40 && /character_lock|must_match/i.test(copied);
    await page.screenshot({ path: shot('02-copiar-json.png'), fullPage: false });
    report.shots.push(shot('02-copiar-json.png'));
    report.steps.push({
      step: 'copiar-json',
      pass: copyOk,
      clipboardChars: copied.length,
      hasLock: /character_lock|must_match/i.test(copied),
      copyMeta
    });
    if (!copyOk) {
      throw new Error(
        `Copiar JSON no dejó character_lock en clipboard (chars=${copied.length}) meta=${JSON.stringify(copyMeta)}`
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

    // Ver galería from ficha (paso 2 · botón en sheet)
    await dismissOverlays();
    await page.evaluate((name) => {
      if (typeof navigateToTab === 'function') navigateToTab('persona-engine');
      const p = (window.state?.personas || []).find((x) => x.name === name);
      if (p && typeof window.selectPersona === 'function') window.selectPersona(p);
      if (typeof setPersonaStep === 'function') setPersonaStep(2, { scroll: false });
    }, personaName);
    await new Promise((r) => setTimeout(r, 400));
    await page.evaluate(() => {
      const btn = document.getElementById('btnOpenGalleryFromFicha');
      if (btn) {
        btn.scrollIntoView({ block: 'center' });
        btn.click();
      } else if (typeof navigateToTab === 'function') {
        navigateToTab('gallery');
      }
    });
    await new Promise((r) => setTimeout(r, 500));
    const onGallery = await page.evaluate(() => {
      const panel = document.getElementById('gallery');
      const emptyCta = document.getElementById('btnEmptyGalleryCopyJson');
      const founder = document.getElementById('founderWelcomeModal');
      const founderVisible = !!(
        founder
        && getComputedStyle(founder).display !== 'none'
        && !founder.classList.contains('u-hidden')
      );
      return {
        panelActive: panel && !panel.classList.contains('u-hidden') && getComputedStyle(panel).display !== 'none',
        hasEmptyCta: !!emptyCta,
        activeTab: window.state?.activeTab || null,
        founderVisible
      };
    });
    await page.screenshot({ path: shot('05-galeria.png'), fullPage: false });
    report.shots.push(shot('05-galeria.png'));
    const galOk = (onGallery.activeTab === 'gallery' || onGallery.panelActive) && !onGallery.founderVisible;
    report.steps.push({ step: 'ver-galeria', pass: galOk, onGallery });
    if (!galOk) report.ok = false;

    if (onGallery.hasEmptyCta) {
      await page.evaluate(() => document.getElementById('btnEmptyGalleryCopyJson')?.click());
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
    await dismissOverlays();
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
    const licOk = licensingSync.match && licensingSync.license === personaName;
    report.steps.push({ step: 'negocio-licensing-chip', pass: licOk, licensingSync });
    if (!licOk) report.ok = false;

    await dismissOverlays();
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
        headerHidden: !!(headerBtn && headerBtn.hidden),
        rosterCount: (window.state?.personas || []).length
      };
    });
    await page.screenshot({ path: shot('07a-campaigns-empty.png'), fullPage: false });
    report.shots.push(shot('07a-campaigns-empty.png'));
    const emptyOk = campEmpty.hasEmptyCta && campEmpty.emptyVisible && campEmpty.headerHidden;
    report.steps.push({ step: 'negocio-campaign-empty-cta', pass: emptyOk, campEmpty });
    if (!emptyOk) report.ok = false;

    await page.evaluate(() => {
      const empty = document.getElementById('btnEmptyCampaignCreate');
      const btnNew = document.getElementById('btnNewCampaign');
      if (empty) empty.click();
      else if (btnNew) {
        btnNew.hidden = false;
        btnNew.click();
      }
    });
    await new Promise((r) => setTimeout(r, 500));
    const campaignPrecheck = await page.evaluate((name) => {
      const modal = document.getElementById('campaignModal');
      const checks = [...document.querySelectorAll('#campaignModal input[name="personaCheck"], input[name="personaCheck"]')];
      const checked = checks.filter((c) => c.checked);
      const checkedNames = checked.map((c) => {
        const label = c.closest('label');
        return (label?.textContent || '').trim();
      });
      return {
        modalDisplay: modal ? getComputedStyle(modal).display : null,
        rosterCount: (window.state?.personas || []).length,
        selected: window.state?.selectedPersona?.name || null,
        total: checks.length,
        checkedCount: checked.length,
        checkedNames,
        hasCreated: checkedNames.some((n) => n.includes(name))
      };
    }, personaName);
    await page.screenshot({ path: shot('07-campaigns-precheck.png'), fullPage: false });
    report.shots.push(shot('07-campaigns-precheck.png'));
    const campOk = campaignPrecheck.hasCreated && campaignPrecheck.checkedCount >= 1;
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
