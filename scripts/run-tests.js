#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const TEST_ROOTS = ['src', 'scripts'];
const TEST_FILE_RE = /\.(test|spec)\.(ts|js|mts|cts|mjs|cjs)$/;

function collectTestFiles(dir) {
  const found = [];

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      found.push(...collectTestFiles(full));
      continue;
    }

    const inTestDir = path.basename(path.dirname(full)) === '__tests__';
    if (TEST_FILE_RE.test(entry.name) || inTestDir) {
      found.push(full);
    }
  }

  return found;
}

function main() {
  const roots = TEST_ROOTS.map(r => path.join(ROOT, r)).filter(r => fs.existsSync(r));

  if (roots.length === 0) {
    console.error(`run-tests: none of these directories exist: ${TEST_ROOTS.join(', ')}`);
    process.exit(1);
  }

  const files = roots.flatMap(collectTestFiles).sort();

  if (files.length === 0) {
    console.error(`run-tests: no test files found under ${roots.join(', ')}`);
    process.exit(1);
  }

  console.log(`run-tests: discovered ${files.length} test file(s)`);
  for (const f of files) console.log(`  - ${path.relative(ROOT, f)}`);

  const tsxBin = path.join(ROOT, 'node_modules', '.bin', 'tsx');
  const useLocal = fs.existsSync(tsxBin);
  const command = useLocal ? tsxBin : 'npx';
  const args = useLocal ? ['--test', ...files] : ['tsx', '--test', ...files];

  const child = spawn(command, args, { stdio: 'inherit' });
  child.on('error', err => {
    console.error(`run-tests: failed to start test runner: ${err.message}`);
    process.exit(1);
  });
  child.on('exit', code => process.exit(code === null ? 1 : code));
}

main();
