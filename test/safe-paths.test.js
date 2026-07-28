const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {
  assertPublicHttpUrl,
  isPrivateOrLocalHostname,
  resolveSafeLocalImagePath
} = require('../safe-paths');

describe('safe-paths SSRF / host guards', () => {
  it('allows public https URLs', () => {
    const u = assertPublicHttpUrl('https://cdn.example.com/photo.jpg');
    assert.equal(u.hostname, 'cdn.example.com');
  });

  it('blocks localhost and private IPs', () => {
    assert.throws(() => assertPublicHttpUrl('http://127.0.0.1/secret'), /local o privado/);
    assert.throws(() => assertPublicHttpUrl('http://192.168.1.10/x'), /local o privado/);
    assert.throws(() => assertPublicHttpUrl('http://10.0.0.5/x'), /local o privado/);
    assert.throws(() => assertPublicHttpUrl('http://169.254.169.254/latest'), /local o privado/);
    assert.throws(() => assertPublicHttpUrl('http://localhost/admin'), /local o privado/);
  });

  it('blocks non-http schemes', () => {
    assert.throws(() => assertPublicHttpUrl('file:///etc/passwd'), /http/);
    assert.throws(() => assertPublicHttpUrl('ftp://example.com/a'), /http/);
  });

  it('detects private hostnames', () => {
    assert.equal(isPrivateOrLocalHostname('127.0.0.1'), true);
    assert.equal(isPrivateOrLocalHostname('example.com'), false);
  });
});

describe('safe-paths local image resolve', () => {
  it('resolves an existing assets image', () => {
    const sample = path.join(__dirname, '..', 'assets');
    const files = fs.existsSync(sample)
      ? fs.readdirSync(sample).filter((f) => /\.(png|jpe?g|webp|gif)$/i.test(f))
      : [];
    if (files.length === 0) {
      // Skip gracefully if assets empty in CI
      return;
    }
    const rel = `assets/${files[0]}`;
    const abs = resolveSafeLocalImagePath(rel);
    assert.ok(abs.endsWith(files[0]));
  });

  it('rejects path traversal to .env', () => {
    assert.throws(() => resolveSafeLocalImagePath('../.env'), /permitido|inválida|Solo se permiten/);
    assert.throws(() => resolveSafeLocalImagePath('.env'), /Solo se permiten|permitido|no encontrado|Extensión/);
  });
});
