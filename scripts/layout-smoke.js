#!/usr/bin/env node
/**
 * UX detalles — layout smoke + captura (DoD PLAN-NEXT).
 * Arranca el Studio, abre / en Chrome headless, comprueba ancho de .main-content
 * y guarda screenshot bajo artifacts/ o /tmp.
 *
 * Requiere: google-chrome/chromium + puppeteer-core (devDependency).
 * Env: STUDIO_PIN, CHROME_PATH, LAYOUT_SHOT_PATH, PORT
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

  // Isolated DATA_DIR for this smoke
  const dataDir = process.env.DATA_DIR || fs.mkdtempSync(path.join(os.tmpdir(), 'influ-layout-'));
  process.env.DATA_DIR = dataDir;
  process.env.INFLU_SKIP_DB_MIGRATE = '1';
  process.env.INFLU_SKIP_ENV_PERSIST = '1';
  process.env.DISABLE_GIT_BACKUP = '1';
  process.env.ENABLE_GIT_BACKUP = '';
  process.env.STUDIO_PIN = process.env.STUDIO_PIN || '1234';
  process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'layout-smoke-secret';
  process.env.HOST = '127.0.0.1';

  // Clear module cache so paths/db pick up DATA_DIR
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

  const shotDir = process.env.LAYOUT_SHOT_DIR || path.join(root, 'artifacts');
  fs.mkdirSync(shotDir, { recursive: true });
  const shotPath = process.env.LAYOUT_SHOT_PATH || path.join(shotDir, 'layout-smoke-dashboard.png');

  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath: chromePath,
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--window-size=1440,900']
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });

    // Login via API cookie then open /
    const login = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin: process.env.STUDIO_PIN })
    });
    const setCookie = login.headers.getSetCookie?.() || [];
    const raw = login.headers.get('set-cookie');
    const cookies = setCookie.length
      ? setCookie
      : (raw ? raw.split(/,(?=\s*[^;]+=)/) : []);
    for (const c of cookies) {
      const [pair] = c.split(';');
      const eq = pair.indexOf('=');
      if (eq < 0) continue;
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      await page.setCookie({ name, value, url: base });
    }

    await page.goto(`${base}/`, { waitUntil: 'networkidle2', timeout: 60000 });
    await page.waitForSelector('.main-content', { timeout: 15000 });

    const metrics = await page.evaluate(() => {
      const main = document.querySelector('.main-content');
      const app = document.querySelector('.app-container');
      const panels = document.querySelectorAll('main.main-content > section.tab-panel');
      const r = main ? main.getBoundingClientRect() : null;
      return {
        mainWidth: r ? r.width : 0,
        viewport: window.innerWidth,
        panelCount: panels.length,
        appExists: !!app
      };
    });

    await page.screenshot({ path: shotPath, fullPage: false });
    console.log(`[layout-smoke] screenshot → ${shotPath}`);
    console.log(`[layout-smoke] metrics`, metrics);

    const minWidth = metrics.viewport * 0.7;
    if (metrics.mainWidth < minWidth) {
      throw new Error(
        `.main-content width ${metrics.mainWidth.toFixed(0)} < 70% viewport (${minWidth.toFixed(0)})`
      );
    }
    if (metrics.panelCount < 8) {
      throw new Error(`Expected ≥8 tab-panels under main, got ${metrics.panelCount}`);
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
