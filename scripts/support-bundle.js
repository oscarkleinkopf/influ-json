#!/usr/bin/env node
/**
 * CLI: npm run support-bundle
 * Genera ZIP redactado en data/backups/
 */
'use strict';

const path = require('path');
process.chdir(path.join(__dirname, '..'));

const args = new Set(process.argv.slice(2));
const { writeSupportBundle } = require('../support-bundle');

writeSupportBundle({ includeAudit: args.has('--audit') })
  .then(({ zipPath, doctor }) => {
    console.log(`Support bundle: ${zipPath}`);
    console.log(`Doctor ok: ${doctor.ok} (errors=${doctor.summary.errors}, warns=${doctor.summary.warns})`);
    process.exit(0);
  })
  .catch((err) => {
    console.error('No se pudo crear el support bundle:', err.message);
    process.exit(1);
  });
