#!/usr/bin/env node
/**
 * Rebuild root index.html from views/ (GitHub Pages + offline open).
 * Usage: node scripts/build-index.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { composeIndexHtml } = require('../views/compose-index');

const root = path.join(__dirname, '..');
const out = path.join(root, 'index.html');
const html = composeIndexHtml(root);
fs.writeFileSync(out, html);
console.log(`[build-index] wrote ${path.relative(root, out)} (${html.length} bytes, ${html.split('\n').length} lines)`);
