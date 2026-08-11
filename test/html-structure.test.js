/**
 * UX-0d — HTML structure smoke.
 * Catches the P0 that left 4 tab panels + generation history as <body>
 * flex siblings of .app-container (extra </div> closed <main>/<section> early).
 *
 * No browser required: parse index.html as text + lightweight tag stack.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const HTML_PATH = path.join(ROOT, 'index.html');

const CONTAINERS = new Set([
  'div', 'section', 'main', 'aside', 'nav', 'header', 'footer', 'form', 'details',
  'span', 'p', 'li', 'ul', 'ol', 'label', 'button', 'a', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'strong', 'em', 'small', 'code', 'pre', 'textarea', 'select', 'option', 'summary',
  'table', 'thead', 'tbody', 'tr', 'td', 'th',
  'style', 'script', 'svg', 'title', 'head', 'body', 'html'
]);
const VOID = new Set([
  'input', 'img', 'br', 'hr', 'meta', 'link', 'source', 'path', 'circle', 'rect',
  'line', 'polyline', 'polygon', 'ellipse', 'use', 'area', 'base', 'col', 'embed',
  'param', 'track', 'wbr'
]);

function stripHtmlComments(html) {
  return html.replace(/<!--[\s\S]*?-->/g, (block) => block.replace(/[^\n]/g, ' '));
}

function parseTagBalance(html) {
  html = stripHtmlComments(html);
  const re = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)([^>]*?)(\/?)>/g;
  let m;
  const stack = [];
  let line = 1;
  let lastIndex = 0;
  const problems = [];

  while ((m = re.exec(html))) {
    line += (html.slice(lastIndex, m.index).match(/\n/g) || []).length;
    lastIndex = m.index;
    const closing = m[1] === '/';
    const tag = m[2].toLowerCase();
    const selfClose = m[4] === '/';
    if (!CONTAINERS.has(tag) || VOID.has(tag) || selfClose) continue;

    if (!closing) {
      stack.push({ tag, line });
      continue;
    }

    let idx = -1;
    for (let i = stack.length - 1; i >= 0; i--) {
      if (stack[i].tag === tag) {
        idx = i;
        break;
      }
    }
    if (idx === -1) {
      problems.push({ line, kind: 'stray', tag });
    } else {
      const popped = stack.splice(idx);
      if (popped.length > 1) {
        problems.push({
          line,
          kind: 'premature',
          tag,
          alsoClosed: popped.slice(1).map((s) => `<${s.tag}>@${s.line}`)
        });
      }
    }
  }

  for (const s of stack) {
    problems.push({ line: s.line, kind: 'unclosed', tag: s.tag });
  }
  return problems;
}

/** Extract id="…" of every <section … class="…tab-panel…"> */
function listTabPanelIds(html) {
  const ids = [];
  const re = /<section\b([^>]*)>/gi;
  let m;
  while ((m = re.exec(html))) {
    const attrs = m[1];
    if (!/\bclass\s*=\s*["'][^"']*\btab-panel\b/i.test(attrs)) continue;
    const idMatch = attrs.match(/\bid\s*=\s*["']([^"']+)["']/i);
    if (idMatch) ids.push(idMatch[1]);
  }
  return ids;
}

/** Extract data-tab values from sidebar + mobile nav (unique). */
function listNavDataTabs(html) {
  const tabs = new Set();
  const re = /data-tab\s*=\s*["']([^"']+)["']/gi;
  let m;
  while ((m = re.exec(html))) tabs.add(m[1]);
  return [...tabs];
}

/**
 * Approximate "is node A an ancestor of node B" using a tag stack over the
 * source — enough to assert each tab-panel section sits under <main>.
 */
function sectionAncestorsById(html) {
  html = stripHtmlComments(html);
  const re = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)([^>]*?)(\/?)>/g;
  let m;
  const stack = [];
  const result = Object.create(null);
  let line = 1;
  let lastIndex = 0;

  while ((m = re.exec(html))) {
    line += (html.slice(lastIndex, m.index).match(/\n/g) || []).length;
    lastIndex = m.index;
    const closing = m[1] === '/';
    const tag = m[2].toLowerCase();
    const selfClose = m[4] === '/';
    if (!CONTAINERS.has(tag) || VOID.has(tag) || selfClose) continue;

    if (!closing) {
      const idMatch = m[3].match(/\bid\s*=\s*["']([^"']+)["']/i);
      const id = idMatch ? idMatch[1] : null;
      stack.push({ tag, id, line });
      if (tag === 'section' && id && /\bclass\s*=\s*["'][^"']*\btab-panel\b/i.test(m[3])) {
        result[id] = stack.slice(0, -1).map((s) => s.tag + (s.id ? `#${s.id}` : ''));
      }
      continue;
    }

    for (let i = stack.length - 1; i >= 0; i--) {
      if (stack[i].tag === tag) {
        stack.splice(i);
        break;
      }
    }
  }
  return result;
}

test('UX-0d: index.html tag stack is balanced (no premature </div> closing <main>)', () => {
  const html = fs.readFileSync(HTML_PATH, 'utf8');
  const problems = parseTagBalance(html);
  assert.deepEqual(
    problems,
    [],
    `HTML tag imbalance:\n${problems.map((p) => JSON.stringify(p)).join('\n')}`
  );
});

test('UX-0d: every nav data-tab has a matching section.tab-panel under <main>', () => {
  const html = fs.readFileSync(HTML_PATH, 'utf8');
  const navTabs = listNavDataTabs(html);
  const panelIds = listTabPanelIds(html);
  const ancestors = sectionAncestorsById(html);

  assert.ok(navTabs.length >= 4, `expected several nav tabs, got ${navTabs.join(',')}`);
  assert.ok(panelIds.length >= 4, `expected several tab panels, got ${panelIds.join(',')}`);

  for (const tab of navTabs) {
    assert.ok(panelIds.includes(tab), `nav data-tab="${tab}" missing <section id="${tab}" class="tab-panel">`);
    const chain = ancestors[tab];
    assert.ok(chain, `no ancestor chain for section#${tab}`);
    assert.ok(
      chain.some((c) => c === 'main' || c.startsWith('main#')),
      `section#${tab} must be under <main> (ancestors: ${chain.join(' > ')})`
    );
  }

  // Explicit regression guard for the four panels that escaped <main>
  for (const id of ['script-engine', 'ugc-studio', 'licensing', 'gallery', 'persona-engine', 'dashboard']) {
    assert.ok(panelIds.includes(id), `missing panel #${id}`);
    const chain = ancestors[id] || [];
    assert.ok(
      chain.some((c) => c === 'main' || c.startsWith('main#')),
      `#${id} must stay inside <main> (was P0 body-flex orphan)`
    );
  }
});

test('UX-0d: generationHistorySection stays inside persona-engine (not a body flex sibling)', () => {
  const html = fs.readFileSync(HTML_PATH, 'utf8');
  // Cheap source-order check: history opens after persona-engine opens and before it closes.
  const peOpen = html.search(/<section\b[^>]*\bid\s*=\s*["']persona-engine["']/i);
  const peClose = html.indexOf('</section>', peOpen);
  const histOpen = html.search(/id\s*=\s*["']generationHistorySection["']/i);
  assert.ok(peOpen >= 0 && peClose > peOpen, 'persona-engine section markers');
  assert.ok(histOpen > peOpen && histOpen < peClose, 'generationHistorySection must sit inside #persona-engine');
});
