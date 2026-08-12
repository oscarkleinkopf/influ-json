/**
 * UX-1 — arquitectura de información:
 * 3 hubs (+ ?) alineados sidebar/móvil, chip global, ≤3 botones «Copiar JSON».
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const appJs = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'index.css'), 'utf8');

function sidebarNavBlock() {
  const start = html.indexOf('aria-label="Navegación principal"');
  const end = html.indexOf('</nav>', start);
  assert.ok(start >= 0 && end > start);
  return html.slice(start, end);
}

function mobileNavBlock() {
  const start = html.indexOf('aria-label="Navegación móvil"');
  const end = html.indexOf('</nav>', start);
  assert.ok(start >= 0 && end > start);
  return html.slice(start, end);
}

test('UX-1a: sidebar tiene 3 hubs (Influencers / Producir / Negocio)', () => {
  const nav = sidebarNavBlock();
  assert.match(nav, /data-nav-hub="influencers"/);
  assert.match(nav, /data-nav-hub="produce"/);
  assert.match(nav, /data-nav-hub="business"/);
  assert.match(nav, />\s*Influencers\s*</);
  assert.match(nav, />\s*Producir\s*</);
  assert.match(nav, />\s*Negocio\s*</);
  assert.doesNotMatch(nav, /Persona Engine/);
  assert.doesNotMatch(nav, /Script Engine/);
  assert.doesNotMatch(nav, /Licensing & Pitch/);
  assert.doesNotMatch(nav, /Galería Prompts/);
  // Cómo usar no es destino de sidebar (va a ?)
  assert.doesNotMatch(nav, /data-tab="como-usar"/);
});

test('UX-1a: móvil usa los mismos nombres de hub (+ ?)', () => {
  const nav = mobileNavBlock();
  assert.match(nav, />\s*Influencers\s*</);
  assert.match(nav, />\s*Producir\s*</);
  assert.match(nav, />\s*Negocio\s*</);
  assert.match(nav, /id="mbNavGuide"/);
  assert.doesNotMatch(nav, />\s*Studio\s*</);
  assert.doesNotMatch(nav, />\s*Campañas\s*</);
  assert.doesNotMatch(nav, />\s*Cómo usar\s*</);
});

test('UX-1a: hub-subnav cubre Portafolio/Ficha, UGC/Guiones, Campañas/Licensing (sin Galería)', () => {
  assert.match(html, /id="hubSubnav"/);
  assert.match(html, /data-hub="influencers"[\s\S]*data-tab="dashboard"[\s\S]*data-tab="persona-engine"/);
  assert.match(html, /data-hub="produce"[\s\S]*data-tab="ugc-studio"[\s\S]*data-tab="script-engine"/);
  // Galería demoted: scrapbook vía ficha, no peer de Producir
  const produceStart = html.indexOf('data-hub="produce"');
  const produceEnd = html.indexOf('data-hub="business"', produceStart);
  assert.ok(produceStart >= 0 && produceEnd > produceStart);
  const produceBlock = html.slice(produceStart, produceEnd);
  assert.doesNotMatch(produceBlock, /data-tab="gallery"/);
  assert.match(html, /data-hub="business"[\s\S]*data-tab="campaigns"[\s\S]*data-tab="licensing"/);
  assert.match(html, /id="btnOpenGalleryFromFicha"/);
  assert.match(html, /id="gallery"/);
  assert.match(appJs, /function switchStudioTab\b/);
  assert.match(appJs, /function updateHubSubnav\b/);
  assert.match(appJs, /TAB_TO_HUB/);
  assert.match(appJs, /btnOpenGalleryFromFicha/);
  assert.match(appJs, /btnEmptyGalleryCopyJson/);
});

test('UX-1a: hub-subnav-inner[hidden] fuerza display none (no mezclar hubs)', () => {
  assert.match(css, /\.hub-subnav-inner\[hidden\]\s*\{[^}]*display:\s*none\s*!important/);
});

test('UX-1b: chip global Trabajando con + Copiar JSON de contexto', () => {
  assert.match(html, /id="activePersonaChip"/);
  assert.match(html, /id="btnActivePersonaMenu"/);
  assert.match(html, /id="activePersonaChipName"/);
  assert.match(html, /id="btnContextCopyJson"/);
  assert.match(html, /Trabajando con/);
  assert.match(appJs, /function setupActivePersonaChip\b/);
  assert.match(appJs, /function updateActivePersonaChip\b/);
  assert.match(appJs, /selectPersona\(persona\)[\s\S]{0,400}updateActivePersonaChip/);
  assert.match(css, /\.studio-context-bar/);
  assert.match(css, /\.active-persona-chip/);
});

test('UX-1b: Guiones muestra el mismo influencer activo que UGC', () => {
  assert.match(html, /id="scriptActivePersonaName"/);
  assert.match(html, /id="scriptActiveAvatar"/);
  assert.match(html, /id="ugcActiveName"/);
  assert.match(appJs, /populateActiveUgcData[\s\S]{0,1200}scriptActivePersonaName/);
  assert.match(appJs, /updateActivePersonaChip[\s\S]{0,400}populateActiveUgcData/);
  assert.match(css, /\.active-context-row/);
});

test('UX-1b: Licensing muestra influencer activo y no usa Sofia falsa', () => {
  assert.match(html, /id="licenseActivePersonaName"/);
  assert.match(html, /id="licenseActiveAvatar"/);
  assert.match(html, /id="pitchInfluName"[^>]*>\s*Sin influencer/);
  assert.doesNotMatch(html, /id="pitchInfluName"[^>]*>\s*Sofia/);
  assert.match(appJs, /populateActiveUgcData[\s\S]{0,2000}licenseActivePersonaName/);
  assert.doesNotMatch(appJs, /selectedPersona \|\| \{\s*name:\s*["']Sofia["']/);
  assert.match(appJs, /copyLicensingProposal[\s\S]{0,250}selectedPersona/);
});

test('UX-1b: Nueva campaña pre-marca el influencer del chip', () => {
  assert.match(appJs, /selectedPersona\?\.id[\s\S]{0,500}personaCheck/);
  assert.match(appJs, /Sin influencers — elegí/);
});

test('UX-1c: vocab unificado — sin «Copiar JSON (recomendado)» en botones', () => {
  // Botones: cero chrome «(recomendado)»; CTA = «Copiar JSON»
  const buttonRe = /<button\b[^>]*>([\s\S]*?)<\/button>/gi;
  const copyJson = [];
  const copyRec = [];
  let m;
  while ((m = buttonRe.exec(html))) {
    const text = m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (text === 'Copiar JSON') copyJson.push(text);
    if (text === 'Copiar JSON (recomendado)') copyRec.push(text);
  }
  assert.equal(copyRec.length, 0, 'no debe quedar botón exacto «Copiar JSON (recomendado)»');
  assert.ok(copyJson.length >= 2, 'debe haber al menos chip/guía/CTA con «Copiar JSON»');
  assert.match(html, /id="btnCopyPackFullbodyPrimary"/);
  assert.match(html, /id="btnContextCopyJson"/);
  assert.match(html, /id="packVariantsMenu"/);
  assert.match(html, /Packs ▾/);
  // UGC CTA copia pack product (honesty #97)
  assert.match(appJs, /btnExportUgcChatbot[\s\S]{0,500}copyFreeChatbotPack\(['"]product['"]\)/);
  // Import copia estructura cruda — no debe decir «Copiar JSON»
  assert.match(html, /id="btnCopyImportJSON"[^>]*>\s*Copiar estructura\s*</);
  assert.doesNotMatch(html, /id="btnCopyImportJSON"[^>]*>\s*Copiar JSON\s*</);
});

test('UX-1c: Persona Engine sin Sofia de placeholder', () => {
  assert.doesNotMatch(html, /id="sheetName"[^>]*>\s*Sofia\s*</);
  assert.doesNotMatch(html, /id="pName"[^>]*value="Sofia"/);
  assert.doesNotMatch(html, /id="activeInfluencerName"[^>]*>\s*Sofia\s*</);
  assert.match(html, /id="sheetName"[^>]*>\s*Sin influencer\s*</);
  assert.match(html, /id="pName"[^>]*placeholder="Nombre del influencer"/);
  assert.match(html, /id="activeInfluencerName"[^>]*>\s*Sin influencer\s*</);
});
