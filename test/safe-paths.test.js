const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const {
  isGitBackupEnabled,
  resolveSafeAssetPath,
  assertSafeRemoteImageUrl,
  isPrivateOrLocalHost,
  UNSAFE_PATH,
  UNSAFE_URL
} = require('../safe-paths');
const { PROJECT_ROOT } = require('../paths');

test('isGitBackupEnabled es opt-in (ENABLE_GIT_BACKUP=1)', () => {
  const prevEnable = process.env.ENABLE_GIT_BACKUP;
  const prevDisable = process.env.DISABLE_GIT_BACKUP;
  try {
    delete process.env.ENABLE_GIT_BACKUP;
    delete process.env.DISABLE_GIT_BACKUP;
    assert.equal(isGitBackupEnabled(), false);

    process.env.ENABLE_GIT_BACKUP = '1';
    assert.equal(isGitBackupEnabled(), true);

    process.env.DISABLE_GIT_BACKUP = '1';
    assert.equal(isGitBackupEnabled(), false);
  } finally {
    if (prevEnable === undefined) delete process.env.ENABLE_GIT_BACKUP;
    else process.env.ENABLE_GIT_BACKUP = prevEnable;
    if (prevDisable === undefined) delete process.env.DISABLE_GIT_BACKUP;
    else process.env.DISABLE_GIT_BACKUP = prevDisable;
  }
});

test('resolveSafeAssetPath acepta assets/references y rechaza traversal', () => {
  const prevSkip = process.env.INFLU_SKIP_DB_MIGRATE;
  const prevUploads = process.env.INFLU_TEST_UPLOADS;
  try {
    delete process.env.INFLU_SKIP_DB_MIGRATE;
    delete process.env.INFLU_TEST_UPLOADS;
    const ok = resolveSafeAssetPath('assets/references/demo.jpg');
    assert.equal(ok, path.join(PROJECT_ROOT, 'assets', 'references', 'demo.jpg'));
  } finally {
    if (prevSkip === undefined) delete process.env.INFLU_SKIP_DB_MIGRATE;
    else process.env.INFLU_SKIP_DB_MIGRATE = prevSkip;
    if (prevUploads === undefined) delete process.env.INFLU_TEST_UPLOADS;
    else process.env.INFLU_TEST_UPLOADS = prevUploads;
  }

  assert.throws(
    () => resolveSafeAssetPath('../../../etc/passwd'),
    (err) => err && err.code === UNSAFE_PATH
  );
  assert.throws(
    () => resolveSafeAssetPath('/etc/passwd'),
    (err) => err && err.code === UNSAFE_PATH
  );
});

test('assertSafeRemoteImageUrl bloquea localhost y metadata cloud', () => {
  assert.doesNotThrow(() => assertSafeRemoteImageUrl('https://cdn.example.com/a.jpg'));

  for (const bad of [
    'http://127.0.0.1/secret',
    'http://localhost/x',
    'http://169.254.169.254/latest/meta-data/',
    'http://192.168.1.10/img.jpg',
    'http://10.0.0.5/a',
    'file:///etc/passwd'
  ]) {
    assert.throws(
      () => assertSafeRemoteImageUrl(bad),
      (err) => err && err.code === UNSAFE_URL,
      bad
    );
  }
});

test('isPrivateOrLocalHost detecta rangos privados', () => {
  assert.equal(isPrivateOrLocalHost('127.0.0.1'), true);
  assert.equal(isPrivateOrLocalHost('10.1.2.3'), true);
  assert.equal(isPrivateOrLocalHost('172.16.0.1'), true);
  assert.equal(isPrivateOrLocalHost('192.168.0.1'), true);
  assert.equal(isPrivateOrLocalHost('8.8.8.8'), false);
  assert.equal(isPrivateOrLocalHost('cdn.example.com'), false);
});
