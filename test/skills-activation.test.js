/**
 * Project skills must declare Use-when triggers + expected output so paraphrased
 * user asks route to the matching skill (roster / license / UGC script).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SKILLS_ROOT = path.join(__dirname, '..', '.agents', 'skills');

const SKILL_DIRS = [
  'influ-json-studio',
  'influ-license-certifier',
  'influ-ugc-scriptwriter'
];

function readFrontmatterDescription(skillDir) {
  const raw = fs.readFileSync(path.join(SKILLS_ROOT, skillDir, 'SKILL.md'), 'utf8');
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  assert.ok(m, `${skillDir}: missing YAML frontmatter`);
  const block = m[1];
  // Folded block scalar: description: >-  then indented lines until next key or end
  const folded = block.match(/^description:\s*>-?\s*\r?\n((?:[ \t]+.+\r?\n?)+)/m);
  let desc;
  if (folded) {
    desc = folded[1]
      .split(/\r?\n/)
      .map((line) => line.replace(/^[ \t]+/, ''))
      .filter((line) => line.length > 0)
      .join(' ');
  } else {
    const single = block.match(/^description:\s*(.+)$/m);
    assert.ok(single, `${skillDir}: missing description`);
    desc = single[1].trim();
  }
  desc = desc.replace(/\s+/g, ' ').trim();
  return { raw, desc };
}

function tokenize(text) {
  return String(text)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2);
}

function score(description, prompt) {
  const bag = new Set(tokenize(description));
  const words = tokenize(prompt);
  let hits = 0;
  for (const w of words) {
    if (bag.has(w)) hits += 1;
  }
  // Boost distinctive phrases present in the skill description
  const d = description.toLowerCase();
  const p = prompt.toLowerCase();
  const boosts = [
    ['roster', 'roster'],
    ['character_lock', 'character_lock'],
    ['chatbot', 'chatbot'],
    ['license', 'license'],
    ['licencia', 'license'],
    ['certificate', 'certificate'],
    ['certificado', 'certificate'],
    ['sha-256', 'sha-256'],
    ['script', 'script'],
    ['guion', 'script'],
    ['tiktok', 'tiktok'],
    ['aida', 'aida'],
    ['pas', 'pas'],
    ['unboxing', 'unboxing']
  ];
  for (const [needle, key] of boosts) {
    if (p.includes(needle) && d.includes(key)) hits += 3;
  }
  return hits;
}

function route(prompt, skills) {
  let best = null;
  let bestScore = -1;
  for (const s of skills) {
    const sc = score(s.desc, prompt);
    if (sc > bestScore) {
      best = s;
      bestScore = sc;
    }
  }
  return { best, bestScore };
}

test('each project skill description has Use when + Expected output + Self-check', () => {
  for (const dir of SKILL_DIRS) {
    const { raw, desc } = readFrontmatterDescription(dir);
    assert.match(desc, /Use when\b/i, `${dir}: description must include "Use when …"`);
    assert.match(desc, /Expected output\b/i, `${dir}: description must include expected output`);
    assert.match(desc, /Self-check\b/i, `${dir}: description must include self-check`);
    assert.match(raw, /^## Expected output/m, `${dir}: body should keep Expected output section`);
    assert.match(raw, /^## Self-check/m, `${dir}: body should keep Self-check section`);
    assert.match(raw, /^## Workflow/m, `${dir}: workflows must remain`);
  }
});

test('paraphrased requests route to the matching project skill', () => {
  const skills = SKILL_DIRS.map((dir) => {
    const { desc } = readFrontmatterDescription(dir);
    return { dir, name: dir, desc };
  });

  const cases = [
    {
      prompt:
        'Can you show me everyone in the influencer roster and export Daniela’s free chatbot pack with character_lock?',
      expect: 'influ-json-studio'
    },
    {
      prompt:
        'Please issue a commercial IP license certificate for Diana to Glow Skincare for Meta ads and verify the hash.',
      expect: 'influ-license-certifier'
    },
    {
      prompt:
        'Write a 20-second TikTok UGC script (AIDA) for Daniela promoting a serum — visual, VO, and captions.',
      expect: 'influ-ugc-scriptwriter'
    }
  ];

  for (const c of cases) {
    const { best, bestScore } = route(c.prompt, skills);
    assert.ok(bestScore > 0, `no skill scored for: ${c.prompt}`);
    assert.equal(best.dir, c.expect, `prompt routed to ${best.dir} (score=${bestScore}): ${c.prompt}`);

    // Winner must beat the runners-up
    for (const s of skills) {
      if (s.dir === best.dir) continue;
      assert.ok(
        bestScore > score(s.desc, c.prompt),
        `${c.expect} should outrank ${s.dir} for: ${c.prompt}`
      );
    }
  }
});
