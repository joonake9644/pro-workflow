#!/usr/bin/env node
// session:close — the gate that has to fail when the handoff stops being true.
//
// validate-context.js checks the *shape* of the session documents: the right
// files exist, carry the right labels, stay inside their line budgets. That is
// necessary and not sufficient. A handoff can satisfy every structural rule
// while stating numbers that stopped being true, and it did: the 2026-09-28
// handoff recorded "passed: 225" after the suite had grown to 239, and named a
// commit that really was the newest product change, so the sha rule was
// satisfied and the gate exited 0. The document was stale and provably so.
//
// So this gate re-measures instead of trusting. The pass criterion is the live
// counts, not the presence of a sha. `npm run session:close` runs the suite and
// compares it against the baseline block the handoff claims, field by field.
//
// `npm run validate:context` stays the cheap structural sensor and keeps its
// contract: no test run, no network, deterministic. Only session:close pays for
// a measurement, because only session:close makes a claim about the numbers.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const HANDOFF = 'docs/next-session-prompt.md';

const BASELINE_LINE = /^\s*-\s*passed:\s*(\d+)\s*\/\s*failed:\s*(\d+)\s*\/\s*suites:\s*(\d+)\s*\/\s*test files discovered:\s*(\d+)/m;

// The last occurrence wins. A test file that shells out to the runner prints its
// own summary first, and taking the first match would compare the handoff against
// an inner run instead of the suite this gate is closing on.
// Flags are unioned with `g`, not replaced by it: an anchored pattern needs `m` to
// match a summary line anywhere in the transcript, and dropping it made every
// anchored counter read as null.
function num(text, re) {
  const flags = re.flags.includes('g') ? re.flags : `${re.flags}g`;
  const all = [...String(text).matchAll(new RegExp(re.source, flags))];
  const m = all[all.length - 1];
  return m ? Number(m[1]) : null;
}

// Node prints `ℹ pass N` on the spec reporter and `# pass N` on the tap reporter.
// The tap reporter is the default for a non-TTY stdout below Node 23, and this gate
// captures the run through a pipe — so both forms have to be accepted or the gate
// fails on every CI matrix leg except the newest. VERIFIED against node 20.11.0 and
// 22.17.0, which both emitted `# pass` for the same suite that prints `ℹ` on node 24.
function numCounter(text, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return num(text, new RegExp(`^[#\\u2139] ${escaped} (\\d+)`, 'm'));
}

// A run that did not print a marker is unknown, not zero. Reporting `failed: 0`
// for a run that never said so would turn a broken measurement into a pass.
function parseTestOutput(output) {
  return {
    passed: numCounter(output, 'pass'),
    failed: numCounter(output, 'fail'),
    suites: numCounter(output, 'suites'),
    files: num(output, /discovered (\d+) test file\(s\)/),
    tests: numCounter(output, 'tests'),
    skipped: numCounter(output, 'skipped'),
    todo: numCounter(output, 'todo'),
    cancelled: numCounter(output, 'cancelled'),
  };
}

// Zero of everything is indistinguishable from a handoff that recorded zero, so
// the measurement has to be non-empty and self-consistent before it is compared.
function measurementProblem(measured) {
  if (!measured || typeof measured !== 'object') {
    return 'the measurement is not an object';
  }
  for (const field of ['passed', 'failed', 'suites', 'files', 'tests']) {
    if (measured[field] === null || measured[field] === undefined) {
      return `the run printed no "${field}" marker, so the handoff cannot be compared against it`;
    }
  }
  if (!(measured.files > 0)) {
    return 'the run discovered no test files, so its counts describe nothing';
  }
  // Node counts skipped tests in `tests` but in neither `pass` nor `fail`, so a single
  // it.skip() would otherwise read as an internally inconsistent run. VERIFIED: the tap
  // reporter prints `cancelled`, `skipped`, and `todo` as separate counters.
  const notRun = (measured.skipped ?? 0) + (measured.todo ?? 0) + (measured.cancelled ?? 0);
  if (measured.passed + measured.failed + notRun !== measured.tests) {
    return `the run is internally inconsistent: ${measured.passed} passed + ${measured.failed} failed + ${notRun} not run != ${measured.tests} tests`;
  }
  return null;
}

function parseBaseline(body) {
  // Last occurrence wins here too, for the same reason `num` does it: a handoff that
  // records more than one baseline block must be compared against the final one.
  const all = [...String(body).matchAll(new RegExp(BASELINE_LINE.source, 'gm'))];
  const m = all[all.length - 1];
  if (!m) return null;
  return {
    passed: Number(m[1]),
    failed: Number(m[2]),
    suites: Number(m[3]),
    files: Number(m[4]),
  };
}

const FIELDS = ['passed', 'failed', 'suites', 'files'];

function compare(recorded, measured) {
  if (!recorded) {
    return [{
      file: HANDOFF,
      msg: 'the handoff must record a baseline block the gate can check',
      expected: 'a line of the form "- passed: N / failed: N / suites: N / test files discovered: N"',
      actual: 'no such line was found',
    }];
  }

  const failures = [];
  for (const field of FIELDS) {
    if (recorded[field] === measured[field]) continue;
    failures.push({
      file: HANDOFF,
      msg: `the recorded baseline ${field} does not match the live run`,
      expected: String(measured[field] === null ? 'a readable value' : measured[field]),
      actual: String(recorded[field]),
    });
  }
  return failures;
}

// Measures the directory it was handed. Defaulting to ROOT here would let
// `session-close.js <dir>` compare <dir>'s handoff against this repository's
// suite, which is a pass for a document nobody measured.
function measure(root) {
  const runner = path.join(root, 'scripts', 'run-tests.js');
  const out = execFileSync(process.execPath, [runner], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return parseTestOutput(out);
}

function run(root, deps = {}) {
  const structural = deps.structural || (r => require('./validate-context').check(r));
  const takeMeasurement = deps.measure || measure;

  const { failures: structuralFailures } = structural(root);
  if (structuralFailures.length) {
    // Measuring on top of a broken structural gate would only add noise, and a
    // later passing measurement must never be able to mask a missing document.
    return { exitCode: 1, failures: structuralFailures };
  }

  const prompt = path.join(root, HANDOFF);
  if (!fs.existsSync(prompt)) {
    return {
      exitCode: 1,
      failures: [{
        file: HANDOFF,
        msg: 'the handoff the baseline is recorded in is missing',
        expected: 'a file at docs/next-session-prompt.md',
        actual: 'not found',
      }],
    };
  }

  let measured;
  try {
    measured = takeMeasurement(root);
  } catch (err) {
    // execFileSync throws on a non-zero exit. A red suite and a drifted handoff
    // are different problems and must not share one exit code and one message.
    return {
      exitCode: 1,
      failures: [{
        file: 'npm test',
        msg: 'the test suite did not complete, so the handoff could not be measured',
        expected: 'exit 0',
        actual: `exit ${err && err.status !== undefined ? err.status : 'unknown'}`,
      }],
    };
  }

  const unusable = measurementProblem(measured);
  if (unusable) {
    return {
      exitCode: 1,
      failures: [{
        file: 'npm test',
        msg: 'the live measurement cannot be compared against the handoff',
        expected: 'a complete run that discovered at least one test file',
        actual: unusable,
      }],
    };
  }

  const failures = compare(parseBaseline(fs.readFileSync(prompt, 'utf8')), measured);
  return { exitCode: failures.length ? 1 : 0, failures, measured };
}

function main() {
  const root = path.resolve(process.argv[2] || ROOT);
  const { exitCode, failures, measured } = run(root);

  if (exitCode === 0) {
    console.log(`session:close: OK (${path.basename(root)})`);
    console.log(`  live run: passed ${measured.passed} / failed ${measured.failed} / suites ${measured.suites} / test files ${measured.files}`);
    console.log(`  ${HANDOFF} records those counts`);
    process.exit(0);
  }

  console.error(`session:close: ${failures.length} violation(s) in ${root}\n`);
  for (const f of failures) {
    console.error(`  ${f.file}`);
    console.error(`    problem : ${f.msg}`);
    console.error(`    expected: ${f.expected}`);
    console.error(`    actual  : ${f.actual}`);
  }
  console.error('\nre-measure with `npm test` and write the real numbers into the handoff, then re-run.');
  process.exit(1);
}

if (require.main === module) main();

module.exports = {
  run, compare, parseBaseline, parseTestOutput, measure, measurementProblem, HANDOFF,
};
