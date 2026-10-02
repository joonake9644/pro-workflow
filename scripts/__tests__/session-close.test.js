const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

// A captured runner transcript, kept as a fixed shape so the parser can be tested
// without re-running the suite. These numbers are a sample of the transcript
// format, not the project's current baseline; the live counts are whatever
// `npm test` reports now, and the handoff is compared against that.
const REAL_RUN_OUTPUT = [
  'run-tests: discovered 9 test file(s)',
  'ℹ tests 241',
  'ℹ suites 16',
  'ℹ pass 241',
  'ℹ fail 0',
  'ℹ cancelled 0',
  'ℹ skipped 0',
  'ℹ todo 0',
  'ℹ duration_ms 1711.418583',
  '',
].join('\n');

// Captured verbatim from `node v22.17.0 node_modules/.bin/tsx --test <file>` with stdout
// piped. Node only defaults to the spec reporter (`ℹ`) from v23 onward, so the tap form
// (`#`) is what every older CI matrix leg actually emits — and this gate reads the run
// through a pipe, so it must parse it or it fails on every leg but the newest.
const TAP_RUN_OUTPUT = [
  'run-tests: discovered 9 test file(s)',
  '# Subtest: stripFencesAndParse',
  '# Subtest: skillHash',
  '# tests 241',
  '# suites 16',
  '# pass 241',
  '# fail 0',
  '# cancelled 0',
  '# skipped 0',
  '# todo 0',
  '# duration_ms 1180.5',
  '',
].join('\n');

const S = () => require('../session-close');

test('parses the counts out of a real runner transcript', () => {
  assert.deepEqual(S().parseTestOutput(REAL_RUN_OUTPUT), {
    passed: 241, failed: 0, suites: 16, files: 9, tests: 241,
    skipped: 0, todo: 0, cancelled: 0,
  });
});

test('parses the tap reporter format that node 20/22 emit through a pipe', () => {
  assert.deepEqual(S().parseTestOutput(TAP_RUN_OUTPUT), {
    passed: 241, failed: 0, suites: 16, files: 9, tests: 241,
    skipped: 0, todo: 0, cancelled: 0,
  }, 'the CI matrix runs 20 and 22 — both below the version that defaults to spec');
  assert.equal(S().measurementProblem(S().parseTestOutput(TAP_RUN_OUTPUT)), null,
    'a tap-format run must satisfy the same consistency check as a spec-format one');
});

test('a run with skipped tests is not read as internally inconsistent', () => {
  const withSkip = [
    'run-tests: discovered 9 test file(s)',
    'ℹ tests 10', 'ℹ suites 2', 'ℹ pass 9', 'ℹ fail 0', 'ℹ skipped 1', 'ℹ todo 0', 'ℹ cancelled 0',
  ].join('\n');
  assert.equal(S().measurementProblem(S().parseTestOutput(withSkip)), null,
    'node counts a skipped test in `tests` but in neither pass nor fail');
});

test('parseTestOutput reports a missing marker instead of inventing zero', () => {
  const got = S().parseTestOutput('run-tests: discovered 9 test file(s)\nℹ pass 241\n');
  assert.equal(got.failed, null, 'a run with no "fail" line is not a zero-failure run');
  assert.equal(got.suites, null);
});

test('an inner run printed before the outer summary does not supply the counts', () => {
  // A nested runner prints its own markers first; the outer summary comes last.
  // Reading the first match would compare the handoff against the inner run.
  const interleaved = [
    'run-tests: discovered 1 test file(s)',
    'ℹ tests 1',
    'ℹ suites 1',
    'ℹ pass 1',
    'ℹ fail 0',
    REAL_RUN_OUTPUT,
  ].join('\n');

  const got = S().parseTestOutput(interleaved);
  assert.deepEqual(got, {
    passed: 241, failed: 0, suites: 16, files: 9, tests: 241,
    skipped: 0, todo: 0, cancelled: 0,
  });
  assert.equal(got.passed, got.tests, 'pass and tests must come from the same run');
});

test('a measurement that ran nothing is rejected rather than accepted as zero', () => {
  const zero = { passed: 0, failed: 0, suites: 0, files: 0, tests: 0 };
  assert.ok(S().measurementProblem(zero), 'a suite that discovered no files is not a pass');
  assert.ok(S().measurementProblem({ ...zero, files: 0, tests: 4, passed: 4 }),
    'a run that counted tests but discovered no files is still broken');
  assert.ok(S().measurementProblem({ passed: 3, failed: null, suites: 1, files: 1, tests: 3 }),
    'a run with no failure marker cannot be compared field by field');
  assert.equal(S().measurementProblem({ passed: 4, failed: 0, suites: 2, files: 1, tests: 4 }), null,
    'a complete, non-empty measurement is acceptable');
});

test('a measurement that contradicts itself is rejected', () => {
  // pass + fail must account for the whole run. If it does not, the transcript
  // was assembled from more than one run and the counts cannot be trusted.
  assert.match(
    S().measurementProblem({ passed: 3, failed: 0, suites: 2, files: 1, tests: 9 }) || '',
    /internally inconsistent/,
    'a run whose parts do not add up must be rejected'
  );
});

test('a measurement that is not an object is rejected', () => {
  for (const bad of [null, undefined, '241/0', 42]) {
    assert.ok(S().measurementProblem(bad), `${JSON.stringify(bad)} is not a measurement`);
  }
});

test('run refuses a measurement that contradicts itself', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'session-close-'));
  fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(root, 'docs', 'next-session-prompt.md'), [
    '## baseline 상태',
    '- passed: 3 / failed: 0 / suites: 2 / test files discovered: 1',
  ].join('\n'));

  // The handoff agrees with this measurement, so only the self-consistency check
  // can turn it into a failure.
  const result = S().run(root, {
    measure: () => ({ passed: 3, failed: 0, suites: 2, files: 1, tests: 9 }),
    structural: () => ({ failures: [] }),
  });
  assert.equal(result.exitCode, 1);
  assert.match(result.failures[0].actual, /internally inconsistent/);
  fs.rmSync(root, { recursive: true, force: true });
});

test('reads the recorded baseline block out of a handoff', () => {
  const body = [
    '## baseline 상태',
    '<!-- npm run verify 결과 -->',
    '- passed: 241 / failed: 0 / suites: 16 / test files discovered: 9',
    '- 제품 커밋: abc1234 (something)',
  ].join('\n');
  assert.deepEqual(S().parseBaseline(body), {
    passed: 241, failed: 0, suites: 16, files: 9,
  });
});

test('run measures the directory it was asked about, not the repository it lives in', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'session-close-'));
  fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(root, 'docs', 'next-session-prompt.md'), [
    '## baseline 상태',
    '- passed: 7 / failed: 0 / suites: 3 / test files discovered: 2',
  ].join('\n'));

  // The default measurement runs <root>/scripts/run-tests.js. A root with no such
  // file cannot produce a measurement, and that has to be a reported failure
  // rather than a pass that happened to match the numbers.
  const result = S().run(root, { structural: () => ({ failures: [] }) });
  assert.equal(result.exitCode, 1);
  assert.match(result.failures[0].msg, /test suite/,
    `expected a reported failure, got ${JSON.stringify(result.failures)}`);
  assert.equal(result.failures[0].file, 'npm test');
  fs.rmSync(root, { recursive: true, force: true });
});

test('a suite that fails to run is reported as such, not as a stack trace', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'session-close-'));
  fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(root, 'docs', 'next-session-prompt.md'), [
    '## baseline 상태',
    '- passed: 1 / failed: 0 / suites: 1 / test files discovered: 1',
  ].join('\n'));

  const result = S().run(root, {
    structural: () => ({ failures: [] }),
    measure: () => { throw Object.assign(new Error('Command failed'), { code: 1, status: 1 }); },
  });

  assert.equal(result.exitCode, 1);
  const f = result.failures[0];
  assert.match(f.msg, /test suite/);
  assert.equal(f.expected, 'exit 0');
  assert.equal(f.actual, 'exit 1');
  fs.rmSync(root, { recursive: true, force: true });
});

test('a handoff with no baseline block is reported, so it cannot be omitted to pass', () => {
  const failures = S().compare(null, { passed: 241, failed: 0, suites: 16, files: 9 });
  assert.equal(failures.length, 1);
  assert.match(failures[0].msg, /baseline/);
  assert.equal(failures[0].expected, 'a line of the form "- passed: N / failed: N / suites: N / test files discovered: N"');
  assert.match(failures[0].actual, /no such line/);
});

// This is the hole the gate actually had: a handoff claiming 225 while the suite
// ran 239 passed, and the sha it names was present, so the old rule exited 0.
test('a handoff whose recorded counts disagree with the live run is reported', () => {
  const recorded = { passed: 225, failed: 0, suites: 16, files: 9 };
  const measured = { passed: 239, failed: 0, suites: 16, files: 9 };
  const failures = S().compare(recorded, measured);
  assert.equal(failures.length, 1);
  assert.match(failures[0].msg, /passed/);
  assert.equal(failures[0].expected, '239');
  assert.equal(failures[0].actual, '225');
});

test('each drifted field is named rather than collapsed into one failure', () => {
  const failures = S().compare(
    { passed: 1, failed: 2, suites: 3, files: 4 },
    { passed: 9, failed: 8, suites: 7, files: 6 }
  );
  assert.equal(failures.length, 4);
  for (const field of ['passed', 'failed', 'suites', 'files']) {
    assert.ok(failures.some(f => f.msg.includes(field)), `${field} is not reported`);
  }
});

test('an exact match produces no failures', () => {
  const counts = { passed: 241, failed: 0, suites: 16, files: 9 };
  assert.deepEqual(S().compare(counts, { ...counts }), []);
});

test('run exits non-zero when the handoff is stale, naming file/expected/actual', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'session-close-'));
  fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
  fs.mkdirSync(path.join(root, '.context'), { recursive: true });
  fs.writeFileSync(path.join(root, 'docs', 'next-session-prompt.md'), [
    '## baseline 상태',
    '- passed: 225 / failed: 0 / suites: 16 / test files discovered: 9',
  ].join('\n'));

  const result = S().run(root, {
    measure: () => ({ passed: 241, failed: 0, suites: 16, files: 9, tests: 241 }),
    structural: () => ({ failures: [] }),
  });

  assert.equal(result.exitCode, 1);
  const drift = result.failures.find(f => f.msg.includes('passed'));
  assert.ok(drift, 'the drift is not in the reported failures');
  assert.equal(drift.file, 'docs/next-session-prompt.md');
  assert.equal(drift.expected, '241');
  assert.equal(drift.actual, '225');
  fs.rmSync(root, { recursive: true, force: true });
});

test('run exits non-zero when the structural gate fails, without measuring', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'session-close-'));
  fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(root, 'docs', 'next-session-prompt.md'), '# handoff\n');

  let measured = false;
  const result = S().run(root, {
    measure: () => { measured = true; return { passed: 0, failed: 0, suites: 0, files: 0 }; },
    structural: () => ({ failures: [{ file: 'AGENTS.md', msg: 'bad', expected: 'x', actual: 'y' }] }),
  });

  assert.equal(result.exitCode, 1);
  assert.equal(measured, false, 'a broken structural gate must not be papered over by a run');
  fs.rmSync(root, { recursive: true, force: true });
});
