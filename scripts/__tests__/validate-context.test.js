const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const SRC = path.join(__dirname, '..', 'validate-context.js');
const { check, AGENTS_MAX_BYTES, AGENTS_MIN_BYTES, HOME_PATH_EXEMPT } = require(SRC);

// Built from fragments on purpose: the detector's own source must not contain a
// literal home path, or the checker flags its test suite.
const B = String.fromCharCode(92);
const TOOL_LABEL_LINE = 'TOOL_LABEL: harness\n\n';
const HANDOFF_OK = (extra = '') => `${TOOL_LABEL_LINE}# handoff\n\nbaseline\n\n${'x'.repeat(240)}\n${extra}`;
const MAC = '/' + 'Us' + 'ers' + '/some' + 'body';
const LIN = '/' + 'ho' + 'me' + '/some' + 'body';
const WIN = 'C:' + B + 'Us' + 'ers' + B + 'some' + 'body';

function makeProject(overrides = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-fixture-'));
  fs.mkdirSync(path.join(root, '.context'), { recursive: true });

  fs.writeFileSync(
    path.join(root, 'AGENTS.md'),
    overrides.agents ?? ('# fixture entry instructions\n\n' + 'routing note. '.repeat(24) + '\n')
  );

  const state = {
    session: '2026-01-01T00:00+09:00',
    todo_active: '#001',
    todo_stage: null,
    coverage_gate: 'passed',
    checkpoint: 'fixture checkpoint',
    blockers: [],
    dirty: false,
    ...(overrides.state ?? {}),
  };

  if (overrides.rawState !== undefined) {
    fs.writeFileSync(path.join(root, '.context', 'STATE'), overrides.rawState);
  } else {
    fs.writeFileSync(path.join(root, '.context', 'STATE'), JSON.stringify(state));
  }

  for (const name of ['CONTEXT.md', 'TODO.md', 'glossary.md']) {
    if (overrides.omit?.includes(name)) continue;
    const body = overrides.empty?.includes(name)
      ? ''
      : name === 'TODO.md'
        ? '# TODO\n\n## 항목\n\n- [ ] #001 fixture task\n- [✓] #000 done task\n'
        : '# fixture\n';
    fs.writeFileSync(path.join(root, '.context', name), body);
  }

  // default: a complete, gate-passing session-end handoff set
  const handoff = { 'docs/next-session-prompt.md': HANDOFF_OK() };
  for (const n of ['TICKETS.md', 'CONTEXT.md', 'TEST-LOG.md']) handoff[`docs/${n}`] = '# ok\n';
  handoff['docs/REVIEW.md'] = 'REVIEW_MODEL: m\nREVIEW_RESULT: clean\n';
  if (overrides.datedSession !== false) {
    for (const n of SESSION_FILES) handoff[`docs/sessions/2026-09-28/${n}`] = '# ok\n';
    handoff['docs/sessions/2026-09-28/REVIEW.md'] = 'REVIEW_MODEL: m\nREVIEW_RESULT: clean\n';
  }
  for (const [rel, body] of Object.entries(handoff)) {
    if (overrides.omit?.some(f => rel.endsWith(f))) continue;
    if (rel in (overrides.extraFiles ?? {})) continue;
    fs.mkdirSync(path.join(root, path.dirname(rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), body);
  }

  if (!overrides.omit?.includes('CLAUDE.md') && !('CLAUDE.md' in (overrides.extraFiles ?? {}))) {
    fs.writeFileSync(
      path.join(root, 'CLAUDE.md'),
      '@AGENTS.md\n\n## Tool-specific notes\n\nnot a project rule\n'
    );
  }

  if (overrides.extraFiles) {
    for (const [rel, body] of Object.entries(overrides.extraFiles)) {
      const target = path.join(root, rel);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, body);
    }
  }

  if (overrides.extraSymlinks) {
    for (const [rel, target] of Object.entries(overrides.extraSymlinks)) {
      const link = path.join(root, rel);
      fs.mkdirSync(path.dirname(link), { recursive: true });
      fs.symlinkSync(target, link);
    }
  }

  return root;
}

const files = failures => failures.map(f => f.file);
const msgs = failures => failures.map(f => f.msg);

test('a well-formed project passes', () => {
  const root = makeProject();
  const { failures } = check(root);
  assert.deepEqual(failures, [], JSON.stringify(failures, null, 2));
  fs.rmSync(root, { recursive: true, force: true });
});

test('real repository context is clean', () => {
  const { failures } = check(path.join(__dirname, '..', '..'));
  assert.deepEqual(failures, [], JSON.stringify(failures, null, 2));
});

test('missing AGENTS.md is caught', () => {
  const root = makeProject();
  fs.unlinkSync(path.join(root, 'AGENTS.md'));
  const { failures } = check(root);
  assert.ok(files(failures).includes('AGENTS.md'));
  fs.rmSync(root, { recursive: true, force: true });
});

test('AGENTS.md over the thin-context cap is caught', () => {
  const root = makeProject({ agents: 'x'.repeat(AGENTS_MAX_BYTES + 1) });
  const { failures } = check(root);
  assert.ok(msgs(failures).some(m => m.includes('absolute size limit')));
  assert.ok(failures.some(f => f.expected.includes(String(AGENTS_MAX_BYTES))));
  fs.rmSync(root, { recursive: true, force: true });
});

test('missing required STATE field is caught', () => {
  const raw = JSON.stringify({ session: 'x', checkpoint: 'c', blockers: [] });
  assert.equal('dirty' in JSON.parse(raw), false, 'fixture must genuinely omit the field');
  const root = makeProject({ rawState: raw });
  const { failures } = check(root);
  assert.ok(msgs(failures).some(m => m.includes('required field missing: dirty')));
  fs.rmSync(root, { recursive: true, force: true });
});

test('omitting several required fields reports each one', () => {
  const raw = JSON.stringify({ session: 'x', blockers: [], dirty: false });
  const { failures } = check(makeProject({ rawState: raw }));
  const missing = msgs(failures).filter(m => m.includes('required field missing')).map(m => m.split(': ').pop());
  assert.deepEqual(missing.sort(), ['checkpoint', 'coverage_gate', 'todo_active', 'todo_stage']);
});

test('wrongly typed STATE field is caught', () => {
  const root = makeProject({ state: { blockers: 'not-an-array' } });
  const { failures } = check(root);
  assert.ok(msgs(failures).some(m => m.includes('wrong type: blockers')));
  fs.rmSync(root, { recursive: true, force: true });
});

test('null and array are distinguished from other object types', () => {
  assert.equal(check(makeProject({ state: { todo_stage: null, blockers: [] } })).failures.length, 0);
  const { failures: bad } = check(makeProject({ state: { todo_stage: { nested: true } } }));
  assert.ok(msgs(bad).some(m => m.includes('wrong type: todo_stage')));
});

test('unparseable STATE is caught', () => {
  const root = makeProject({ rawState: '{ not json' });
  const { failures } = check(root);
  assert.ok(msgs(failures).some(m => m.includes('not parseable')));
  fs.rmSync(root, { recursive: true, force: true });
});

test('empty checkpoint is caught', () => {
  const root = makeProject({ state: { checkpoint: '   ' } });
  const { failures } = check(root);
  assert.ok(msgs(failures).some(m => m.includes('checkpoint must not be empty')));
  fs.rmSync(root, { recursive: true, force: true });
});

test('missing context file is caught', () => {
  const root = makeProject({ omit: ['TODO.md'] });
  const { failures } = check(root);
  assert.ok(files(failures).includes('.context/TODO.md'));
  fs.rmSync(root, { recursive: true, force: true });
});

test('empty context file is caught', () => {
  const root = makeProject({ empty: ['glossary.md'] });
  const { failures } = check(root);
  assert.ok(msgs(failures).some(m => m.includes('is empty')));
  fs.rmSync(root, { recursive: true, force: true });
});

test('absolute home path leak is caught', () => {
  const root = makeProject({ state: { checkpoint: `ran at ${MAC}/else/project` } });
  const { failures } = check(root);
  assert.ok(msgs(failures).some(m => m.includes('machine-specific')));
  assert.ok(failures.some(f => f.actual.includes(MAC)),
    `expected the leaked home segment, got: ${JSON.stringify(failures.map(f => f.actual))}`);
  fs.rmSync(root, { recursive: true, force: true });
});

test('a missing STATE file is caught', () => {
  const root = makeProject();
  fs.unlinkSync(path.join(root, '.context', 'STATE'));
  const { failures } = check(root);
  assert.ok(files(failures).includes('.context/STATE'));
  assert.ok(msgs(failures).some(m => m.includes('session state missing')));
  fs.rmSync(root, { recursive: true, force: true });
});

for (const raw of ['false', 'null', '0', '""']) {
  test(`falsy non-object STATE (${raw}) is caught, not accepted`, () => {
    const root = makeProject({ rawState: raw });
    const { failures } = check(root);
    assert.ok(failures.length > 0,
      `STATE=${raw} must not validate as a well-formed session state`);
    assert.ok(msgs(failures).some(m => m.includes('not a JSON object')));
    fs.rmSync(root, { recursive: true, force: true });
  });
}

for (const raw of ['5', '"abc"', 'true']) {
  test(`truthy non-object STATE (${raw}) is reported cleanly, not crashed on`, () => {
    const root = makeProject({ rawState: raw });
    let failures;
    assert.doesNotThrow(() => { ({ failures } = check(root)); },
      `STATE=${raw} must produce a report, not a TypeError`);
    assert.ok(msgs(failures).some(m => m.includes('not a JSON object')));
    fs.rmSync(root, { recursive: true, force: true });
  });
}

test('array STATE is caught', () => {
  const root = makeProject({ rawState: '[]' });
  assert.ok(msgs(check(root).failures).some(m => m.includes('not a JSON object')));
  fs.rmSync(root, { recursive: true, force: true });
});

test('every reported failure names file, expected and actual for non-object STATE', () => {
  const root = makeProject({ rawState: 'false' });
  const { failures } = check(root);
  assert.ok(failures.length > 0);
  for (const f of failures) {
    assert.ok(f.file.includes('STATE'));
    assert.ok(f.expected.length > 0);
    assert.ok(f.actual.length > 0);
    assert.ok(f.msg.length > 0);
  }
  fs.rmSync(root, { recursive: true, force: true });
});

test('every failure names the file to fix, the expected value, and the actual value', () => {
  const root = makeProject({ omit: ['TODO.md'], state: { blockers: 7 } });
  const { failures } = check(root);
  assert.ok(failures.length >= 2);
  for (const f of failures) {
    assert.equal(typeof f.file, 'string');
    assert.ok(f.file.length > 0, 'file must be named');
    assert.ok(f.expected.length > 0, 'expected must be stated');
    assert.ok(f.actual.length > 0, 'actual must be stated');
  }
  fs.rmSync(root, { recursive: true, force: true });
});

// --- spec §6-126: referenced real paths, including symlinks, must stay in the repo ---

const OUTSIDE = fs.realpathSync(os.tmpdir());

test('a STATE symlinked outside the repository is caught', () => {
  const outside = path.join(OUTSIDE, `ctx-outside-${process.pid}.json`);
  fs.writeFileSync(outside, JSON.stringify({ session: 'x', checkpoint: 'c', blockers: [], dirty: false }));
  const root = makeProject();
  fs.unlinkSync(path.join(root, '.context', 'STATE'));
  fs.symlinkSync(outside, path.join(root, '.context', 'STATE'));

  const { failures } = check(root);
  assert.ok(msgs(failures).some(m => m.includes('symlink escapes the repository')),
    `expected an escape report, got ${JSON.stringify(failures.map(f => f.msg))}`);
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(outside, { force: true });
});

test('a .context directory symlinked outside the repository is caught', () => {
  const outside = fs.mkdtempSync(path.join(OUTSIDE, 'ctx-dir-'));
  for (const n of ['CONTEXT.md', 'TODO.md', 'glossary.md', 'STATE']) {
    fs.writeFileSync(path.join(outside, n), '# x\n');
  }
  const root = makeProject();
  fs.rmSync(path.join(root, '.context'), { recursive: true, force: true });
  fs.symlinkSync(outside, path.join(root, '.context'));

  const { failures } = check(root);
  assert.ok(msgs(failures).some(m => m.includes('symlink escapes the repository')),
    `expected an escape report, got ${JSON.stringify(failures.map(f => f.msg))}`);
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(outside, { recursive: true, force: true });
});

test('a symlink that stays inside the repository is not reported', () => {
  const root = makeProject();
  fs.symlinkSync(path.join(root, 'AGENTS.md'), path.join(root, 'link.md'));
  const { failures } = check(root);
  assert.ok(!msgs(failures).some(m => m.includes('symlink escapes')));
  fs.rmSync(root, { recursive: true, force: true });
});

// --- spec §7-134: a one-string fake evidence and a bare symlink must fail ---

test('lifecycle complete with no evidence directory is caught', () => {
  const root = makeProject({ state: { lifecycle: 'complete' } });
  const { failures } = check(root);
  assert.ok(msgs(failures).some(m => m.includes('no evidence artifact')));
  fs.rmSync(root, { recursive: true, force: true });
});

test('lifecycle complete with a one-word fake evidence file is caught', () => {
  const root = makeProject({
    state: { lifecycle: 'complete' },
    extraFiles: { 'docs/evidence/proof.md': 'done' },
  });
  const { failures } = check(root);
  assert.ok(msgs(failures).some(m => m.includes('evidence artifact is a stub')),
    `a one-word evidence file must fail, got ${JSON.stringify(failures.map(f => f.msg))}`);
  fs.rmSync(root, { recursive: true, force: true });
});

test('lifecycle complete with a long but contentless evidence file is caught', () => {
  const root = makeProject({
    state: { lifecycle: 'complete' },
    extraFiles: { 'docs/evidence/proof.md': 'x'.repeat(400) },
  });
  const { failures } = check(root);
  assert.ok(msgs(failures).some(m => m.includes('evidence artifact is a stub')));
  fs.rmSync(root, { recursive: true, force: true });
});

test('lifecycle complete with real command-citing evidence passes', () => {
  const root = makeProject({
    state: { lifecycle: 'complete' },
    extraFiles: {
      'docs/evidence/proof.md':
        `# run log\n\nVERIFIED: npm test exit=0, 92 pass / 0 fail\n\n$ npm run verify\nexit code 0\n${'detail. '.repeat(40)}`,
    },
  });
  const { failures } = check(root);
  assert.deepEqual(failures, [], JSON.stringify(failures, null, 2));
  fs.rmSync(root, { recursive: true, force: true });
});

test('evidence planted outside docs/evidence does not satisfy completion', () => {
  const root = makeProject({
    state: { lifecycle: 'complete' },
    extraFiles: { 'src/fake-evidence.ts': 'VERIFIED exit=0 ' + 'x'.repeat(300) },
  });
  const { failures } = check(root);
  assert.ok(msgs(failures).some(m => m.includes('no evidence artifact')));
  fs.rmSync(root, { recursive: true, force: true });
});

test('lifecycle other than complete is not gated on evidence', () => {
  const root = makeProject({ state: { lifecycle: 'in_progress' } });
  const { failures } = check(root);
  assert.deepEqual(failures, [], JSON.stringify(failures, null, 2));
  fs.rmSync(root, { recursive: true, force: true });
});

// --- spec §6-118: the active work pointer must resolve ---

test('an active work pointer absent from TODO.md is caught', () => {
  const root = makeProject({ state: { todo_active: '#999' } });
  const { failures } = check(root);
  assert.ok(msgs(failures).some(m => m.includes('does not resolve to any task')),
    `expected a dangling-pointer report, got ${JSON.stringify(failures.map(f => f.msg))}`);
  fs.rmSync(root, { recursive: true, force: true });
});

test('a resolvable active work pointer passes', () => {
  const root = makeProject({ state: { todo_active: '#001' } });
  const { failures } = check(root);
  assert.deepEqual(failures, [], JSON.stringify(failures, null, 2));
  fs.rmSync(root, { recursive: true, force: true });
});

test('TODO.md without any task line is caught', () => {
  const root = makeProject();
  fs.writeFileSync(path.join(root, '.context', 'TODO.md'), '# TODO\n\nno tasks here\n');
  const { failures } = check(root);
  assert.ok(msgs(failures).some(m => m.includes('no task lines')));
  fs.rmSync(root, { recursive: true, force: true });
});

test('a null active work pointer is not treated as dangling', () => {
  const root = makeProject({ state: { todo_active: null } });
  const { failures } = check(root);
  assert.deepEqual(failures, [], JSON.stringify(failures, null, 2));
  fs.rmSync(root, { recursive: true, force: true });
});

// --- thin entry instructions need a floor, not only a ceiling ---

test('a zero-byte AGENTS.md is caught', () => {
  const root = makeProject({ agents: '' });
  const { failures } = check(root);
  assert.ok(msgs(failures).some(m => m.includes('too thin')));
  fs.rmSync(root, { recursive: true, force: true });
});

test('a whitespace-only AGENTS.md is caught', () => {
  const root = makeProject({ agents: '   \n\t\n' });
  const { failures } = check(root);
  assert.ok(msgs(failures).some(m => m.includes('too thin')));
  fs.rmSync(root, { recursive: true, force: true });
});

test('a single-character AGENTS.md is caught', () => {
  const root = makeProject({ agents: 'x' });
  const { failures } = check(root);
  assert.ok(msgs(failures).some(m => m.includes('too thin')));
  fs.rmSync(root, { recursive: true, force: true });
});

// --- session and stage fields ---

test('an empty session timestamp is caught', () => {
  const root = makeProject({ state: { session: '   ' } });
  const { failures } = check(root);
  assert.ok(msgs(failures).some(m => m.includes('session must not be empty')));
  fs.rmSync(root, { recursive: true, force: true });
});

test('an unrecognised todo_stage is caught', () => {
  const root = makeProject({ state: { todo_stage: 'MOSTLY_DONE' } });
  const { failures } = check(root);
  assert.ok(msgs(failures).some(m => m.includes('not a recognised TDD stage')));
  fs.rmSync(root, { recursive: true, force: true });
});

for (const stage of ['RED', 'GREEN', 'REFACTOR', 'POST-CHECK']) {
  test(`todo_stage ${stage} is accepted`, () => {
    const root = makeProject({ state: { todo_stage: stage } });
    const { failures } = check(root);
    assert.deepEqual(failures, [], JSON.stringify(failures, null, 2));
    fs.rmSync(root, { recursive: true, force: true });
  });
}

// --- spec §6-122: an ADR must be resolvable as accepted or superseded ---

test('an ADR without a status line is caught', () => {
  const root = makeProject({ extraFiles: { '.context/ADR/0001-x.md': '# ADR 1\n\nwe should do a thing\n' } });
  const { failures } = check(root);
  assert.ok(msgs(failures).some(m => m.includes('no valid status line')),
    `expected an ADR status report, got ${JSON.stringify(failures.map(f => f.msg))}`);
  fs.rmSync(root, { recursive: true, force: true });
});

for (const status of ['제안', '채택', '대체됨(ADR-0002)', '폐기']) {
  test(`ADR status "${status}" is accepted`, () => {
    const root = makeProject({
      extraFiles: { '.context/ADR/0001-x.md': `# ADR 1\n\n- 상태: ${status} · 2026-09-27\n` },
    });
    const { failures } = check(root);
    assert.deepEqual(failures, [], JSON.stringify(failures, null, 2));
    fs.rmSync(root, { recursive: true, force: true });
  });
}

// --- home path detection: scope and platform coverage ---

for (const [label, leak] of [
  ['macOS', `see ${MAC}/project/file.ts`],
  ['Linux', `see ${LIN}/project/file.ts`],
  ['Windows', `see ${WIN}${B}project${B}file.ts`],
]) {
  test(`an absolute ${label} home path in a non-context document is caught`, () => {
    const root = makeProject({ extraFiles: { 'docs/plan.md': `# plan\n\n${leak}\n` } });
    const { failures } = check(root);
    assert.ok(msgs(failures).some(m => m.includes('machine-specific')),
      `${label} leak in docs/plan.md must be caught, got ${JSON.stringify(failures.map(f => f.msg))}`);
    fs.rmSync(root, { recursive: true, force: true });
  });
}

test('a machine-specific path in an extensionless artifact is still scanned', () => {
  const root = makeProject();
  fs.writeFileSync(path.join(root, 'NOTES'), `ran at ${MAC}/thing\n`);
  const { failures } = check(root);
  assert.ok(msgs(failures).some(m => m.includes('machine-specific')));
  fs.rmSync(root, { recursive: true, force: true });
});

test('a declared exemption suppresses the report and is surfaced', () => {
  const root = makeProject({
    extraFiles: { 'docs/plan.md': `# plan\n\nsee ${MAC}/x // ${HOME_PATH_EXEMPT} placeholder\n` },
  });
  const { failures, exemptions } = check(root);
  assert.deepEqual(failures, [], JSON.stringify(failures, null, 2));
  assert.equal(exemptions.length, 1);
  assert.match(exemptions[0], /^docs\/plan\.md:\d+ /,
    `exemption must be file:line plus the excused path, got: ${exemptions[0]}`);
  fs.rmSync(root, { recursive: true, force: true });
});

test('exemptions are reported per line, not per file', () => {
  const root = makeProject({
    extraFiles: {
      'docs/a.md': `# a\n\n${MAC}/x/1 // ${HOME_PATH_EXEMPT}\n${MAC}/y/2 // ${HOME_PATH_EXEMPT}\n`,
    },
  });
  const { failures, exemptions } = check(root);
  assert.deepEqual(failures, []);
  assert.equal(exemptions.length, 2);
  fs.rmSync(root, { recursive: true, force: true });
});

test('an exemption marker does not excuse a different file on the same line', () => {
  const root = makeProject({
    extraFiles: { 'docs/b.md': `# b\n\n${MAC}/x/1 // ${HOME_PATH_EXEMPT} and ${MAC}/z/2\n` },
  });
  const { failures } = check(root);
  assert.ok(msgs(failures).some(m => m.includes('machine-specific')));
  fs.rmSync(root, { recursive: true, force: true });
});

// --- regression: forms the earlier delimiter-based regex silently missed ---

const U = n => '/' + 'Us' + 'ers' + '/' + n;
const LEAK_FORMS = [
  'home:' + U('alice') + '/project/x',
  'link:' + U('alice') + '/project/x',
  'VAR=' + U('alice') + '/repo',
  'PREFIX=' + U('alice'),
  'see ' + U('alice') + ' here',
  'git blame ' + U('alice'),
  '"p":"' + U('alice') + '/x"',
  '  ' + U('alice') + '/x',
  'C:' + U('alice') + '/project/x',
  'C:' + B + 'Us' + 'ers' + B + 'alice' + B + 'x',
  '/' + 'ho' + 'me' + '/alice/x',
];

const CLEAN_FORMS = [
  'see /usr/local/bin',
  'normal relative/path.md',
  'https://example.com' + U('alice'),
  'README and docs/index.html',
  '[x](/relative/link.md)',
];

for (const form of LEAK_FORMS) {
  test(`home path form is detected: ${form.split(B).join('/')}`, () => {
    const root = makeProject({ extraFiles: { 'docs/probe.md': `# probe\n\n${form}\n` } });
    const { failures } = check(root);
    assert.ok(msgs(failures).some(m => m.includes('machine-specific')),
      `missed leak form: ${form}`);
    fs.rmSync(root, { recursive: true, force: true });
  });
}

for (const form of CLEAN_FORMS) {
  test(`non-leak form is not flagged: ${form}`, () => {
    const root = makeProject({ extraFiles: { 'docs/probe.md': `# probe\n\n${form}\n` } });
    const { failures } = check(root);
    assert.ok(!msgs(failures).some(m => m.includes('machine-specific')),
      `false positive on: ${form}`);
    fs.rmSync(root, { recursive: true, force: true });
  });
}

// --- a broken symlink must be reported, not crash the checker ---

test('a broken symlink as STATE is reported without crashing', () => {
  const root = makeProject();
  fs.unlinkSync(path.join(root, '.context', 'STATE'));
  fs.symlinkSync(path.join(root, 'does-not-exist'), path.join(root, '.context', 'STATE'));
  let failures;
  assert.doesNotThrow(() => { ({ failures } = check(root)); },
    'a dangling symlink must produce a report, not an uncaught ENOENT');
  assert.ok(failures.length > 0);
  fs.rmSync(root, { recursive: true, force: true });
});

// --- an exemption must name what it excuses, so hiding is visible ---

test('an exemption surfaces the path it excuses, not just a line number', () => {
  const root = makeProject({
    extraFiles: { 'docs/p.md': `# p\n\n${MAC}/secret/x // ${HOME_PATH_EXEMPT}\n` },
  });
  const { failures, exemptions } = check(root);
  assert.deepEqual(failures, []);
  assert.equal(exemptions.length, 1);
  assert.ok(exemptions[0].includes(MAC), `exemption must name the excused path, got: ${exemptions[0]}`);
  fs.rmSync(root, { recursive: true, force: true });
});

// --- the invariant that makes model-independence real rather than promised ---

test('CLAUDE.md must import AGENTS.md rather than restating rules', () => {
  const root = makeProject({
    extraFiles: { 'CLAUDE.md': '# entry\n\nsome Claude-only note\n' },
  });
  const { failures } = check(root);
  assert.ok(msgs(failures).some(m => m.includes('must import AGENTS.md')),
    `expected an import report, got ${JSON.stringify(failures.map(f => f.msg))}`);
  fs.rmSync(root, { recursive: true, force: true });
});

test('a missing CLAUDE.md is reported', () => {
  const root = makeProject({ omit: ['CLAUDE.md'] });
  const { failures } = check(root);
  assert.ok(files(failures).includes('CLAUDE.md'));
  fs.rmSync(root, { recursive: true, force: true });
});

test('a CLAUDE.md that duplicates an AGENTS.md rule heading is reported', () => {
  const root = makeProject({
    extraFiles: {
      'AGENTS.md': '# rules\n\n## 보고 규칙 (전 세션 공통)\n\n' + 'x'.repeat(240) + '\n',
      'CLAUDE.md': '@AGENTS.md\n\n## 보고 규칙 (전 세션 공통)\n\ncopied text\n',
    },
  });
  const { failures } = check(root);
  assert.ok(msgs(failures).some(m => m.includes('restates rules')),
    `expected a duplication report, got ${JSON.stringify(failures.map(f => f.msg))}`);
  fs.rmSync(root, { recursive: true, force: true });
});

test('a thin CLAUDE.md adapter with its own headings passes', () => {
  const root = makeProject({
    extraFiles: {
      'AGENTS.md': '# rules\n\n## 보고 규칙 (전 세션 공통)\n\n' + 'x'.repeat(240) + '\n',
      'CLAUDE.md': '@AGENTS.md\n\n## Claude Code 전용\n\nnotes that are not project rules\n',
    },
  });
  const { failures } = check(root);
  assert.deepEqual(failures, [], JSON.stringify(failures, null, 2));
  fs.rmSync(root, { recursive: true, force: true });
});

test('the real repository keeps CLAUDE.md a thin adapter', () => {
  const { failures } = check(path.join(__dirname, '..', '..'));
  assert.deepEqual(failures, [], JSON.stringify(failures, null, 2));
});

// --- session-end harness: closing a session is machine-checked ---

const SESSION_DOCS = ['TICKETS.md', 'CONTEXT.md', 'TEST-LOG.md', 'REVIEW.md'];
const SESSION_FILES = ['DONE.md', 'TICKETS.md', 'CONTEXT.md', 'TEST-LOG.md', 'REVIEW.md', 'next-session-prompt.md'];

test('a missing next-session-prompt is reported', () => {
  const root = makeProject({ omit: ['next-session-prompt.md'] });
  const { failures } = check(root);
  assert.ok(msgs(failures).some(m => m.includes('no session-end handoff exists')));
  fs.rmSync(root, { recursive: true, force: true });
});

test('a handoff without a baseline section is reported', () => {
  const root = makeProject({
    extraFiles: { 'docs/next-session-prompt.md': `${TOOL_LABEL_LINE}# handoff\n\ndo the thing\n` },
  });
  const { failures } = check(root);
  assert.ok(msgs(failures).some(m => m.includes('cannot tell whether the baseline drifted')));
  fs.rmSync(root, { recursive: true, force: true });
});

test('a handoff that is too thin to resume from is reported', () => {
  const root = makeProject({
    extraFiles: { 'docs/next-session-prompt.md': `${TOOL_LABEL_LINE}baseline ` + 'x'.repeat(80) },
  });
  const { failures } = check(root);
  assert.ok(msgs(failures).some(m => m.includes('too thin to resume from')));
  fs.rmSync(root, { recursive: true, force: true });
});

for (const name of SESSION_DOCS) {
  test(`a handoff missing docs/${name} is reported`, () => {
    const root = makeProject({
      omit: [name],
      extraFiles: {
        'docs/next-session-prompt.md': `${TOOL_LABEL_LINE}# handoff\n\nbaseline ${'x'.repeat(240)}\n`,
      },
    });
    const { failures } = check(root);
    assert.ok(files(failures).includes(`docs/${name}`),
      `expected a report for ${name}, got ${JSON.stringify(files(failures))}`);
    fs.rmSync(root, { recursive: true, force: true });
  });
}

test('a complete handoff set passes', () => {
  // this test builds the dated folder itself
  const extra = { 'docs/next-session-prompt.md': HANDOFF_OK() };
  for (const n of SESSION_DOCS) extra[`docs/${n}`] = '# ok\n';
  extra['docs/REVIEW.md'] = 'REVIEW_MODEL: m\nREVIEW_RESULT: clean\n';
  for (const n of SESSION_FILES) extra[`docs/sessions/2026-09-28/${n}`] = '# ok\n';
  extra['docs/sessions/2026-09-28/REVIEW.md'] = 'REVIEW_MODEL: m\nREVIEW_RESULT: clean\n';
  const root = makeProject({ extraFiles: extra });
  const { failures } = check(root);
  assert.deepEqual(failures, [], JSON.stringify(failures, null, 2));
  fs.rmSync(root, { recursive: true, force: true });
});

test('an incomplete dated session folder is reported', () => {
  // this test builds the dated folder itself
  const root = makeProject({ datedSession: false,
    extraFiles: { 'docs/sessions/2026-09-28/DONE.md': '# done\n' },
  });
  const { failures } = check(root);
  assert.ok(msgs(failures).some(m => m.includes('dated session folder is incomplete')));
  fs.rmSync(root, { recursive: true, force: true });
});

test('a complete dated session folder passes', () => {
  const extra = {};
  for (const n of ['DONE.md', ...SESSION_DOCS, 'next-session-prompt.md']) {
    extra[`docs/sessions/2026-09-28/${n}`] = '# ok\n';
  }
  const root = makeProject({ extraFiles: extra });
  const { failures } = check(root);
  assert.ok(!msgs(failures).some(m => m.includes('dated session folder')));
  fs.rmSync(root, { recursive: true, force: true });
});

test('the real repository satisfies the session-close gate', () => {
  const { failures } = check(path.join(__dirname, '..', '..'));
  assert.deepEqual(failures, [], JSON.stringify(failures, null, 2));
});

// --- freshness: a handoff written before the last commit is not a handoff ---

const { execFileSync } = require('node:child_process');

// The freshness rule is exempt under CI, so any test that asserts freshness must clear
// the variable first — otherwise running the suite in CI (which is exactly what happens)
// turns its own expectations inside out. Local runs and CI runs then agree.
function withoutCI(fn) {
  const prevCI = process.env.CI;
  const prevGH = process.env.GITHUB_ACTIONS;
  delete process.env.CI;
  delete process.env.GITHUB_ACTIONS;
  try {
    return fn();
  } finally {
    if (prevCI !== undefined) process.env.CI = prevCI;
    if (prevGH !== undefined) process.env.GITHUB_ACTIONS = prevGH;
  }
}

function gitRepo({ datedSession, ...files } = {}) {
  const root = makeProject({ extraFiles: files, datedSession });
  execFileSync('git', ['init', '-q'], { cwd: root, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.email', 'harness@example.invalid'], { cwd: root, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.name', 'harness'], { cwd: root, stdio: 'ignore' });
  execFileSync('git', ['add', '-A'], { cwd: root, stdio: 'ignore' });
  execFileSync('git', ['commit', '-q', '-m', 'init'], { cwd: root, stdio: 'ignore' });
  return root;
}


test('a handoff in a git repo that does not name the current commit is reported', () => {
  withoutCI(() => {
    const root = gitRepo({ datedSession: false, 'docs/next-session-prompt.md': HANDOFF_OK() });
    const { failures } = check(root);
    assert.ok(msgs(failures).some(m => m.includes('predates product work')),
      `expected a staleness report, got ${JSON.stringify(failures.map(f => f.msg))}`);
    fs.rmSync(root, { recursive: true, force: true });
  });
});

test('a handoff that names the current commit passes', () => withoutCI(() => {
  const root = gitRepo({ 'docs/next-session-prompt.md': HANDOFF_OK() });
  const head = execFileSync('git', ['rev-parse', '--short=7', 'HEAD'], { cwd: root })
    .toString().trim();
  fs.writeFileSync(path.join(root, 'docs', 'next-session-prompt.md'), HANDOFF_OK(`\ncommit: ${head}\n`));

  const { failures } = check(root);
  assert.ok(!msgs(failures).some(m => m.includes('predates product work')),
      `named commit ${head} must satisfy the freshness rule`);
  fs.rmSync(root, { recursive: true, force: true });
}));

test('a handoff that names a stale commit is reported', () => withoutCI(() => {
  const root = gitRepo({ datedSession: false, 'docs/next-session-prompt.md': HANDOFF_OK() });
  fs.writeFileSync(path.join(root, 'docs', 'next-session-prompt.md'), HANDOFF_OK('\ncommit: 0000000\n'));
  const { failures } = check(root);
  assert.ok(msgs(failures).some(m => m.includes('predates product work')));
  fs.rmSync(root, { recursive: true, force: true });
}));

test('a handoff naming a longer sha still matches the short head', () => withoutCI(() => {
  const root = gitRepo({ 'docs/next-session-prompt.md': HANDOFF_OK() });
  const full = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root }).toString().trim();
  fs.writeFileSync(path.join(root, 'docs', 'next-session-prompt.md'), HANDOFF_OK(`\ncommit: ${full}\n`));
  const { failures } = check(root);
  assert.ok(!msgs(failures).some(m => m.includes('predates product work')),
    'a full sha must satisfy a short-head comparison');
  fs.rmSync(root, { recursive: true, force: true });
}));

test('a non-git tree with a valid handoff is not failed for freshness', () => {
  const root = makeProject();
  const { failures } = check(root);
  assert.ok(!msgs(failures).some(m => m.includes('predates product work')));
  fs.rmSync(root, { recursive: true, force: true });
});

test('a CI run is not failed for freshness, because the merge commit cannot be in the handoff', () => {
  // GitHub builds a synthetic merge commit for the PR. `git log -1 -- . :!docs :!.context`
  // returns that sha in CI, and it is by definition newer than anything the branch author
  // could have written into the handoff. VERIFIED on run 36831658193: the gate asked for
  // 728bee0, which does not exist in the author's clone at all.
  const root = gitRepo({ 'docs/next-session-prompt.md': HANDOFF_OK() });
  const head = execFileSync('git', ['rev-parse', '--short=7', 'HEAD'], { cwd: root })
    .toString().trim();
  fs.writeFileSync(path.join(root, 'docs', 'next-session-prompt.md'), HANDOFF_OK(`\ncommit: ${head}\n`));

  const prev = process.env.CI;
  process.env.CI = 'true';
  try {
    const { failures, advisories } = check(root);
    assert.ok(!msgs(failures).some(m => m.includes('predates product work')),
      'CI must judge the branch as written, not against a commit it just synthesised');
    assert.ok((advisories || []).some(a => a.msg.includes('freshness is not verified in CI')),
      'the exemption must be visible, not a silent pass — an unseen skip reads as a satisfied check');
  } finally {
    if (prev === undefined) delete process.env.CI; else process.env.CI = prev;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('a GITHUB_ACTIONS-only run is exempt too, since GitHub documents CI as overwritable', () => {
  const root = gitRepo({ 'docs/next-session-prompt.md': HANDOFF_OK() });
  const head = execFileSync('git', ['rev-parse', '--short=7', 'HEAD'], { cwd: root })
    .toString().trim();
  fs.writeFileSync(path.join(root, 'docs', 'next-session-prompt.md'), HANDOFF_OK(`\ncommit: ${head}\n`));

  const prevCI = process.env.CI;
  const prevGH = process.env.GITHUB_ACTIONS;
  delete process.env.CI;
  process.env.GITHUB_ACTIONS = 'true';
  try {
    const { failures } = check(root);
    assert.ok(!msgs(failures).some(m => m.includes('predates product work')),
      'GITHUB_ACTIONS alone must be enough to detect the synthetic merge commit');
  } finally {
    if (prevCI !== undefined) process.env.CI = prevCI;
    if (prevGH === undefined) delete process.env.GITHUB_ACTIONS; else process.env.GITHUB_ACTIONS = prevGH;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('CI still enforces every other rule, so the exemption is only about freshness', () => {
  const root = gitRepo({ datedSession: false, 'docs/next-session-prompt.md': HANDOFF_OK() });
  const prev = process.env.CI;
  process.env.CI = 'true';
  try {
    const { failures } = check(root);
    assert.ok(msgs(failures).some(m => m.includes('dated snapshot')),
      'exempting freshness must not exempt the structural rules');
  } finally {
    if (prev === undefined) delete process.env.CI; else process.env.CI = prev;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

// --- trend-aligned thin-handoff rules (somatlas ADR-0015 / docstudio / Red Hat 2026-07) ---

test('a handoff over the 80-line cap is reported', () => {
  const long = `${TOOL_LABEL_LINE}# handoff\n\nbaseline\n\n${'line\n'.repeat(90)}`;
  const root = makeProject({ extraFiles: { 'docs/next-session-prompt.md': long } });
  const { failures } = check(root);
  assert.ok(msgs(failures).some(m => m.includes('routing note')),
    `expected a thin-handoff report, got ${JSON.stringify(failures.map(f => f.msg))}`);
  fs.rmSync(root, { recursive: true, force: true });
});

test('a handoff that does not name the tool is reported', () => {
  const root = makeProject({
    extraFiles: { 'docs/next-session-prompt.md': '# handoff\n\nbaseline\n\n' + 'x'.repeat(240) + '\n' },
  });
  const { failures } = check(root);
  assert.ok(msgs(failures).some(m => m.includes('unrecorded model makes drift invisible')));
  fs.rmSync(root, { recursive: true, force: true });
});

test('docs/DONE.md at the root is reported: it is a dated history artifact', () => {
  const root = makeProject({ extraFiles: { 'docs/DONE.md': '# done\n' } });
  const { failures } = check(root);
  assert.ok(files(failures).includes('docs/DONE.md'),
    '15 of 20 projects following this convention omit it, and one asserts it must be absent');
  fs.rmSync(root, { recursive: true, force: true });
});

test('a session folder missing REVIEW.md is reported', () => {
  // this test builds the dated folder itself
  const extra = { 'docs/sessions/2026-09-28/DONE.md': '# ok\n' };
  for (const n of ['TICKETS.md', 'CONTEXT.md', 'TEST-LOG.md', 'next-session-prompt.md']) {
    extra[`docs/sessions/2026-09-28/${n}`] = '# ok\n';
  }
  const root = makeProject({ datedSession: false, extraFiles: extra });
  const { failures } = check(root);
  assert.ok(msgs(failures).some(m => m.includes('dated session folder is incomplete')));
  assert.ok(files(failures).includes('docs/sessions/2026-09-28/REVIEW.md'));
  fs.rmSync(root, { recursive: true, force: true });
});

test('a REVIEW.md without a verdict line is reported', () => {
  // this test builds the dated folder itself
  const extra = {};
  for (const n of ['DONE.md', 'TICKETS.md', 'CONTEXT.md', 'TEST-LOG.md', 'next-session-prompt.md']) {
    extra[`docs/sessions/2026-09-28/${n}`] = '# ok\n';
  }
  extra['docs/sessions/2026-09-28/REVIEW.md'] = '# review\n\nlooked fine\n';
  extra['docs/REVIEW.md'] = '# review\n\nlooked fine\n';
  const root = makeProject({ datedSession: false, extraFiles: extra });
  const { failures } = check(root);
  assert.ok(msgs(failures).some(m => m.includes('independent review is mandatory')));
  fs.rmSync(root, { recursive: true, force: true });
});

test('a REVIEW.md carrying a verdict passes', () => {
  // this test builds the dated folder itself
  const extra = {};
  for (const n of ['DONE.md', 'TICKETS.md', 'CONTEXT.md', 'TEST-LOG.md', 'next-session-prompt.md']) {
    extra[`docs/sessions/2026-09-28/${n}`] = '# ok\n';
  }
  extra['docs/sessions/2026-09-28/REVIEW.md'] = 'REVIEW_MODEL: m\nREVIEW_RESULT: clean\n';
  extra['docs/REVIEW.md'] = 'REVIEW_MODEL: m\nREVIEW_RESULT: clean\n';
  const root = makeProject({ datedSession: false, extraFiles: extra });
  const { failures } = check(root);
  assert.ok(!msgs(failures).some(m => m.includes('independent review is mandatory')));
  fs.rmSync(root, { recursive: true, force: true });
});

// --- entry-doc budget: hard limit is lines (Red Hat 2026-07), bytes are advisory ---

const { AGENTS_MAX_LINES, AGENTS_BUDGET_BYTES } = require(SRC);

test('AGENTS.md over the 150-line budget is reported', () => {
  const root = makeProject({ agents: 'x\n'.repeat(AGENTS_MAX_LINES + 5) });
  const { failures } = check(root);
  assert.ok(msgs(failures).some(m => m.includes('thin-context budget')));
  fs.rmSync(root, { recursive: true, force: true });
});

test('AGENTS.md over 8 KB but under the line budget is an advisory, not a failure', () => {
  // 40 fat lines: over the byte budget, comfortably under 150 lines.
  const body = '# rules\n\n' + 'invariant guidance. '.repeat(15) + '\n\n'
    + ('invariant guidance. '.repeat(15) + '\n\n').repeat(39);
  const root = makeProject({ agents: body });
  const { failures, advisories } = check(root);
  assert.equal(failures.length, 0,
    `bytes over the preferred budget must not delete rules; got ${JSON.stringify(failures, null, 2)}`);
  assert.ok(advisories.some(a => a.file === 'AGENTS.md' && a.msg.includes('8 KB budget')));
  fs.rmSync(root, { recursive: true, force: true });
});

test('AGENTS.md over the absolute size limit is still a failure', () => {
  const body = '# rules\n\n' + ('invariant guidance. '.repeat(15) + '\n\n').repeat(400);
  const root = makeProject({ agents: body });
  const { failures } = check(root);
  assert.ok(msgs(failures).some(m => m.includes('absolute size limit')));
  fs.rmSync(root, { recursive: true, force: true });
});

test('the real entry doc is inside both the line and byte budgets', () => withoutCI(() => {
  // withoutCI because the freshness rule pushes its own advisory under CI; this test is
  // about the entry-doc budgets and must not start failing when an unrelated one appears.
  const { failures, advisories } = check(path.join(__dirname, '..', '..'));
  assert.deepEqual(failures, [], JSON.stringify(failures, null, 2));
  assert.deepEqual(advisories, [], JSON.stringify(advisories, null, 2));
}));

// --- the pathspec exclusion is the rule's core behaviour and was untested ---

function writeIn(root, rel, body) {
  const target = path.join(root, rel);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, body);
}

function commit(root, paths) {
  execFileSync('git', ['add', '-A', '--', ...paths], { cwd: root, stdio: 'ignore' });
  execFileSync('git', ['commit', '-q', '-m', `commit ${paths.join(' ')}`], { cwd: root, stdio: 'ignore' });
  return execFileSync('git', ['rev-parse', '--short=7', 'HEAD'], { cwd: root }).toString().trim();
}

test('a docs-only commit after product work does not invalidate the handoff', () => {
  const root = gitRepo({ 'docs/next-session-prompt.md': HANDOFF_OK() });
  writeIn(root, 'src/feature.ts', 'export const x = 1;\n');
  const product = commit(root, ['src/feature.ts']);

  fs.writeFileSync(path.join(root, 'docs', 'next-session-prompt.md'), HANDOFF_OK(`\ncommit: ${product}\n`));
  commit(root, ['docs/next-session-prompt.md']);

  const head = execFileSync('git', ['rev-parse', '--short=7', 'HEAD'], { cwd: root }).toString().trim();
  assert.notEqual(head, product, 'the docs commit must be a distinct commit for this test to mean anything');

  const { failures } = check(root);
  assert.ok(!msgs(failures).some(m => m.includes('predates product work')),
    `a docs-only commit must not stale the handoff, but it did: ${JSON.stringify(failures.map(f => f.msg))}`);
  fs.rmSync(root, { recursive: true, force: true });
});

test('a handoff naming the commit before product work is reported', () => withoutCI(() => {
  const root = gitRepo({ 'docs/next-session-prompt.md': HANDOFF_OK() });
  const before = execFileSync('git', ['rev-parse', '--short=7', 'HEAD'], { cwd: root }).toString().trim();

  writeIn(root, 'src/feature.ts', 'export const y = 2;\n');
  commit(root, ['src/feature.ts']);

  const { failures } = check(root);
  assert.ok(msgs(failures).some(m => m.includes('predates product work')),
    'a handoff naming the pre-product commit must be reported stale');
  assert.ok(failures.some(f => f.expected.includes(before) || f.expected.includes('newest product change')));
  fs.rmSync(root, { recursive: true, force: true });
}));

test('a .context-only change does not stale the handoff either', () => {
  const root = gitRepo({ 'docs/next-session-prompt.md': HANDOFF_OK() });
  writeIn(root, 'src/feature.ts', 'export const z = 3;\n');
  const product = commit(root, ['src/feature.ts']);

  fs.writeFileSync(path.join(root, '.context', 'glossary.md'), '# g\nterm: a definition\n');
  commit(root, ['.context/glossary.md']);

  fs.writeFileSync(path.join(root, 'docs', 'next-session-prompt.md'), HANDOFF_OK(`\ncommit: ${product}\n`));
  const { failures } = check(root);
  assert.ok(!msgs(failures).some(m => m.includes('predates product work')));
  fs.rmSync(root, { recursive: true, force: true });
});
