#!/usr/bin/env node
/**
 * U1 — Empaqueta un ZIP de release del Studio (sin datos ni secretos).
 * Uso: npm run pack:release
 * Salida: dist/influ-json-studio-<version>.zip + LEEME.txt dentro del ZIP.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const archiverMod = require('archiver');

/** Archiver v8 (ESM interop) usa ZipArchive; v7 era archiver('zip'). */
function createZipArchive(options = { zlib: { level: 9 } }) {
  if (typeof archiverMod === 'function') return archiverMod('zip', options);
  if (archiverMod.ZipArchive) return new archiverMod.ZipArchive(options);
  if (archiverMod.Archiver) {
    const a = new archiverMod.Archiver(options);
    if (typeof a.format === 'function') a.format('zip', options);
    return a;
  }
  throw new Error('No se pudo inicializar archiver (ZIP)');
}

const root = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const version = String(pkg.version || '0.0.0').replace(/[^\w.-]+/g, '_');
const outDir = path.join(root, 'dist');
const outName = `influ-json-studio-${version}.zip`;
const outPath = path.join(outDir, outName);

/** Paths relative to repo root that must never ship in a community ZIP. */
const EXCLUDE_NAMES = new Set([
  '.git',
  '.env',
  'node_modules',
  'data',
  'dist',
  'coverage',
  '.cursor',
  '.agents',
  '.grok',
  'artifacts',
  'influ.sqlite',
  'influ.sqlite-wal',
  'influ.sqlite-shm',
  'personas.json',
  '.DS_Store'
]);

const EXCLUDE_PREFIXES = [
  'assets/references/ref_',
  'assets/generated/',
  'tmp/'
];

const EXCLUDE_SUFFIXES = [
  '.log',
  '.sqlite',
  '.sqlite-wal',
  '.sqlite-shm'
];

function isSecretEnvFile(name) {
  // Keep .env.example; exclude .env and other local overrides.
  if (name === '.env.example') return false;
  return name === '.env' || name.startsWith('.env.');
}

function shouldExclude(relPosix) {
  const parts = relPosix.split('/');
  if (parts.some((p) => EXCLUDE_NAMES.has(p) || isSecretEnvFile(p))) return true;
  if (EXCLUDE_PREFIXES.some((p) => relPosix.startsWith(p))) return true;
  if (EXCLUDE_SUFFIXES.some((s) => relPosix.endsWith(s))) return true;
  if (relPosix === 'dist' || relPosix.startsWith('dist/')) return true;
  return false;
}

function walk(dir, base = '') {
  const entries = [];
  for (const name of fs.readdirSync(dir)) {
    const abs = path.join(dir, name);
    const rel = base ? `${base}/${name}` : name;
    const relPosix = rel.split(path.sep).join('/');
    if (shouldExclude(relPosix)) continue;
    let st;
    try {
      st = fs.lstatSync(abs);
    } catch (_) {
      continue;
    }
    if (st.isSymbolicLink()) continue;
    if (st.isDirectory()) {
      entries.push(...walk(abs, relPosix));
    } else if (st.isFile()) {
      entries.push({ abs, relPosix });
    }
  }
  return entries;
}

const LEEME = `influ-JSON Studio — instalación local (cero costo)

1. Instala Node.js 18 o superior (LTS) desde https://nodejs.org
2. Descomprime este ZIP en una carpeta tuya (Escritorio, Documentos…).
3. Arranque de un clic:
   · Windows: doble clic en start-studio.cmd
   · Linux / macOS: en Terminal → ./start-studio.sh
4. El navegador debería abrir http://127.0.0.1:3000
   PIN inicial: 1234 (cámbialo en el asistente de primer arranque).

Si falta Node, el launcher te lo dice con pasos claros.
No hace falta tarjeta ni Replicate para el path free (Copiar JSON → chatbot gratis).

Diagnóstico: npm run doctor
Soporte: npm run support-bundle  (ZIP redactado en data/backups/)

Versión empaquetada: ${version}
`;

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  if (fs.existsSync(outPath)) fs.unlinkSync(outPath);

  const files = walk(root);
  const output = fs.createWriteStream(outPath);
  const archive = createZipArchive({ zlib: { level: 9 } });

  const done = new Promise((resolve, reject) => {
    output.on('close', resolve);
    archive.on('error', reject);
  });

  archive.pipe(output);
  archive.append(LEEME, { name: 'LEEME.txt' });
  for (const f of files) {
    archive.file(f.abs, { name: f.relPosix });
  }
  await archive.finalize();
  await done;

  const bytes = fs.statSync(outPath).size;
  console.log(`OK ${outPath} (${files.length} archivos + LEEME.txt, ${bytes} bytes)`);
  console.log('Excluye: .env, data/, node_modules/, .git, sqlite mirrors, dist/');
  return outPath;
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err.message || err);
    process.exit(1);
  });
}

module.exports = {
  shouldExclude,
  walk,
  main,
  outPath,
  EXCLUDE_NAMES
};
