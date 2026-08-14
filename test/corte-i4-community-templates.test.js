'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');

const api = require('../community-templates.js');

describe('Corte I4 — community templates (safe share)', () => {
  it('lists curated templates with schema and no identity', () => {
    const list = api.listTemplates();
    assert.ok(list.length >= 4);
    for (const t of list) {
      assert.equal(t.schema_id, api.SCHEMA_ID);
      assert.ok(t.id);
      assert.ok(t.title);
      assert.ok(t.pack);
      assert.ok(t.shot);
      assert.ok(t.camera);
      assert.equal(t.must_match_every_image, undefined);
      assert.ok(!JSON.stringify(t).includes('must_match'));
    }
  });

  it('getTemplate returns by id with shot/hooks', () => {
    const t = api.getTemplate('beauty_skincare');
    assert.ok(t);
    assert.equal(t.niche, 'beauty');
    assert.equal(t.shot?.camera, 'mirror');
    assert.ok(Array.isArray(t.script_hooks) && t.script_hooks.length >= 1);
  });

  it('validateCommunitySafe rejects identity / photos', () => {
    assert.equal(api.validateCommunitySafe({ schema_id: api.SCHEMA_ID, id: 'x', title: 'Ok' }).ok, true);
    assert.equal(api.validateCommunitySafe({ must_match_every_image: { name: 'X' } }).ok, false);
    assert.equal(api.validateCommunitySafe({ identity_opt_in: true }).ok, false);
    assert.equal(api.validateCommunitySafe({ photos: ['a'] }).ok, false);
    assert.equal(api.validateCommunitySafe({ cover: 'data:image/png;base64,xx' }).ok, false);
  });

  it('stripIdentity removes forbidden keys', () => {
    const raw = {
      schema_id: api.SCHEMA_ID,
      id: 'demo',
      title: 'Demo',
      must_match_every_image: { name: 'No' },
      character_lock: { x: 1 },
      hooks: ['hola'],
      script_hooks: ['hola']
    };
    const clean = api.stripIdentity(raw);
    assert.equal(clean.must_match_every_image, undefined);
    assert.equal(clean.character_lock, undefined);
    assert.deepEqual(clean.script_hooks, ['hola']);
  });

  it('toClipboardText is pasteable JSON without identity', () => {
    const t = api.getTemplate('fitness_wellness');
    const text = api.toClipboardText(t);
    assert.ok(text.includes(api.SCHEMA_ID));
    assert.ok(!text.includes('must_match'));
    const parsed = JSON.parse(text);
    assert.equal(parsed.id, 'fitness_wellness');
  });

  it('toBriefDefaults fills product and goal', () => {
    const defaults = api.toBriefDefaults(api.getTemplate('fashion_grwm'));
    assert.ok(defaults);
    assert.ok(String(defaults.product || '').length > 0);
    assert.equal(defaults.goal, 'ugc');
    assert.equal(defaults.wantProductPack, false);
    assert.equal(defaults.shotsCount, 3);
  });

  it('toRecipeInput maps niche and camera', () => {
    const r = api.toRecipeInput(api.getTemplate('food_ugc'));
    assert.equal(r.niche, 'food');
    assert.ok(r.camera);
  });

  it('parseImport accepts curated JSON and rejects identity', () => {
    const good = api.toClipboardText(api.getTemplate('beauty_skincare'));
    const parsed = api.parseImport(good);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.template.id, 'beauty_skincare');

    const bad = api.parseImport(JSON.stringify({
      schema_id: api.SCHEMA_ID,
      id: 'evil',
      title: 'Evil',
      must_match_every_image: { name: 'X' },
    }));
    assert.equal(bad.ok, false);
  });

  it('dashboard hosts community templates card', () => {
    const html = fs.readFileSync(path.join(__dirname, '../views/tabs/dashboard.html'), 'utf8');
    assert.ok(html.includes('id="communityTemplatesCard"'));
    assert.ok(html.includes('id="communityTemplatesGrid"'));
    assert.ok(html.includes('id="communityTemplateImportText"'));
  });

  it('Express serves community-templates.js', () => {
    const server = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
    assert.ok(server.includes("'/community-templates.js'"));
    const foot = fs.readFileSync(path.join(__dirname, '../views/_foot.html'), 'utf8');
    assert.ok(foot.includes('community-templates.js'));
  });
});
