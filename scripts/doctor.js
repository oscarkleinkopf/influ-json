#!/usr/bin/env node
/**
 * CLI: npm run doctor
 * Uso: node scripts/doctor.js [--json] [--audit]
 */
'use strict';

const path = require('path');
process.chdir(path.join(__dirname, '..'));

const args = new Set(process.argv.slice(2));
const { runDoctor } = require('../studio-doctor');

const report = runDoctor({ includeAudit: args.has('--audit') });

if (args.has('--json')) {
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
} else {
  console.log(`influ-JSON doctor — ${report.ok ? 'OK' : 'PROBLEMAS'} (${report.generatedAt})`);
  console.log(`Node ${report.node} · ${report.platform}`);
  console.log(`dataDir: ${report.dataDir}`);
  console.log('');
  for (const c of report.checks) {
    const mark = c.level === 'error' ? '✗' : c.level === 'warn' ? '!' : c.level === 'info' ? '·' : '✓';
    console.log(`  ${mark} [${c.id}] ${c.detail}`);
  }
  console.log('');
  console.log(`Resumen: ${report.summary.errors} errores · ${report.summary.warns} avisos · ${report.summary.total} checks`);
  if (!report.ok) {
    console.log('Corrige los errores y vuelve a ejecutar: npm run doctor');
  }
}

process.exit(report.ok ? 0 : 1);
