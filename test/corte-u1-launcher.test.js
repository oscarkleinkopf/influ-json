'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
const pack = require('../scripts/pack-release');

describe('Corte U1 — launcher + ZIP release', () => {
  it('start-studio.sh checks Node 18+, npm install, doctor, opens browser', () => {
    const sh = fs.readFileSync(path.join(root, 'start-studio.sh'), 'utf8');
    assert.match(sh, /MIN_NODE=18/);
    assert.match(sh, /nodejs\.org/);
    assert.match(sh, /npm install/);
    assert.match(sh, /npm run doctor/);
    assert.match(sh, /OPEN_BROWSER/);
    assert.match(sh, /127\.0\.0\.1:3000/);
    assert.match(sh, /xdg-open|open /);
  });

  it('start-studio.cmd checks Node, install, doctor, starts browser', () => {
    const cmd = fs.readFileSync(path.join(root, 'start-studio.cmd'), 'utf8');
    assert.match(cmd, /MIN_NODE=18/);
    assert.match(cmd, /nodejs\.org/i);
    assert.match(cmd, /npm install/);
    assert.match(cmd, /npm run doctor/);
    assert.match(cmd, /OPEN_BROWSER/);
    assert.match(cmd, /127\.0\.0\.1:3000/);
  });

  it('pack-release excludes secrets and data mirrors', () => {
    assert.equal(pack.shouldExclude('.env'), true);
    assert.equal(pack.shouldExclude('.env.local'), true);
    assert.equal(pack.shouldExclude('.env.example'), false);
    assert.equal(pack.shouldExclude('data/influ.sqlite'), true);
    assert.equal(pack.shouldExclude('node_modules/express/index.js'), true);
    assert.equal(pack.shouldExclude('.git/config'), true);
    assert.equal(pack.shouldExclude('influ.sqlite'), true);
    assert.equal(pack.shouldExclude('personas.json'), true);
    assert.equal(pack.shouldExclude('assets/references/ref_123.jpg'), true);
    assert.equal(pack.shouldExclude('assets/generated/gen_flux_1.jpg'), true);
    assert.equal(pack.shouldExclude('artifacts/layout-smoke-dashboard.png'), true);
    assert.equal(pack.shouldExclude('community-templates.js'), false);
    assert.equal(pack.shouldExclude('start-studio.sh'), false);
  });

  it('npm run pack:release builds ZIP with LEEME and without .env', () => {
    execFileSync('node', [path.join(root, 'scripts', 'pack-release.js')], {
      cwd: root,
      stdio: 'pipe',
      env: { ...process.env }
    });
    assert.ok(fs.existsSync(pack.outPath), 'zip missing: ' + pack.outPath);
    const listing = execFileSync('unzip', ['-Z1', pack.outPath], { encoding: 'utf8' });
    assert.match(listing, /^LEEME\.txt$/m);
    assert.match(listing, /^start-studio\.sh$/m);
    assert.match(listing, /^start-studio\.cmd$/m);
    assert.match(listing, /^\.env\.example$/m);
    assert.doesNotMatch(listing, /(^|\/)\.env$/m);
    assert.doesNotMatch(listing, /(^|\/)data\//m);
    assert.doesNotMatch(listing, /(^|\/)node_modules\//m);
    assert.doesNotMatch(listing, /(^|\/)\.git\//m);
  });

  it('package.json exposes pack:release and engines.node', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    assert.equal(pkg.scripts['pack:release'], 'node scripts/pack-release.js');
    assert.ok(pkg.engines?.node);
    assert.match(String(pkg.engines.node), /18/);
  });
});
