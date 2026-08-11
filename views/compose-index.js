/**
 * UX-4 — compose Studio HTML from views/ partials (same idea as routes/).
 * Used by server.js (runtime) and scripts/build-index.js (Pages / git).
 */
'use strict';

const fs = require('fs');
const path = require('path');

const TAB_ORDER = [
  'dashboard',
  'como-usar',
  'campaigns',
  'persona-engine',
  'script-engine',
  'ugc-studio',
  'licensing',
  'gallery'
];

function viewsRoot(repoRoot) {
  return path.join(repoRoot || path.join(__dirname, '..'), 'views');
}

function readPart(filePath) {
  return fs.readFileSync(filePath, 'utf8').replace(/\s+$/, '') + '\n';
}

/**
 * @param {string} [repoRoot]
 * @returns {string}
 */
function composeIndexHtml(repoRoot) {
  const root = viewsRoot(repoRoot);
  const parts = [];
  parts.push(readPart(path.join(root, '_head.html')));
  for (const id of TAB_ORDER) {
    parts.push(readPart(path.join(root, 'tabs', `${id}.html`)));
  }
  parts.push(readPart(path.join(root, '_foot.html')));
  return parts.join('');
}

function listTabPartials(repoRoot) {
  return TAB_ORDER.map((id) => path.join(viewsRoot(repoRoot), 'tabs', `${id}.html`));
}

module.exports = {
  TAB_ORDER,
  composeIndexHtml,
  listTabPartials,
  viewsRoot
};
