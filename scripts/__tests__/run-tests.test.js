const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { isTestCandidate, collectTestFiles } = require('../run-tests.js');

test('a __tests__ directory collects only executable files', () => {
  for (const name of ['a.test.ts', 'a.test.js', 'a.spec.ts']) {
    assert.equal(isTestCandidate(name, true), true, `${name} must be collected`);
  }
  for (const name of ['NOTES.md', 'fixture.json', 'expected.snap', 'README.txt', 'data.csv']) {
    assert.equal(isTestCandidate(name, true), false,
      `${name} is not executable; collecting it kills the whole run with ERR_UNKNOWN_FILE_EXTENSION`);
  }
});

test('outside a __tests__ directory only explicit test names count', () => {
  assert.equal(isTestCandidate('a.test.ts', false), true);
  assert.equal(isTestCandidate('helper.ts', false), false);
  assert.equal(isTestCandidate('index.ts', false), false);
});

test('collectTestFiles skips non-executable files inside a __tests__ dir', () => {
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'rt-'));
  fs.mkdirSync(path.join(root, 'src', '__tests__'), { recursive: true });
  const dir = path.join(root, 'src', '__tests__');
  fs.writeFileSync(path.join(dir, 'real.test.ts'), '');
  fs.writeFileSync(path.join(dir, 'NOTES.md'), '# notes');
  fs.writeFileSync(path.join(dir, 'fixture.json'), '{}');

  const found = collectTestFiles(path.join(root, 'src')).map(f => path.basename(f));
  assert.deepEqual(found, ['real.test.ts']);
  fs.rmSync(root, { recursive: true, force: true });
});

test('a nested test directory is still discovered', () => {
  const root = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'rt-'));
  const deep = path.join(root, 'src', 'a', 'b', '__tests__');
  fs.mkdirSync(deep, { recursive: true });
  fs.writeFileSync(path.join(deep, 'deep.test.ts'), '');
  assert.equal(collectTestFiles(path.join(root, 'src')).length, 1);
  fs.rmSync(root, { recursive: true, force: true });
});
