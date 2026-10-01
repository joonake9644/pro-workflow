#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

// Red Hat's AGENTS.md guidance (2026-07) sets the budget in lines, not bytes:
// "aim for fewer than 150 lines". Bytes stay as an advisory because a hard byte
// cap deletes rules once a project legitimately needs more, which is exactly
// why docstudio/ADR-0002 downgraded its 8 KB cap to an advisory measurement.
const AGENTS_MAX_LINES = 150;
const AGENTS_MAX_BYTES = 12 * 1024;
const AGENTS_BUDGET_BYTES = 8 * 1024;
const AGENTS_MIN_BYTES = 200;
// Trend-aligned thin-handoff caps. somatlas ADR-0015 and docstudio both hard-cap
// the handoff at 80 lines; Red Hat's AGENTS.md guidance (2026-07) is that
// context dilutes signal and every line must earn its place.
const PROMPT_MAX_LINES = 80;
const SESSION_FILES = ['DONE.md', 'TICKETS.md', 'CONTEXT.md', 'TEST-LOG.md', 'REVIEW.md', 'next-session-prompt.md'];
const STATE_REQUIRED_FIELDS = {
  session: 'string',
  todo_active: ['string', 'null'],
  todo_stage: ['string', 'null'],
  coverage_gate: ['string', 'null'],
  checkpoint: 'string',
  blockers: 'array',
  dirty: 'boolean',
};
const VALID_STAGES = ['RED', 'GREEN', 'REFACTOR', 'POST-CHECK'];
const CONTEXT_FILES = ['CONTEXT.md', 'TODO.md', 'glossary.md'];
const EVIDENCE_MIN_BYTES = 200;
const EVIDENCE_MARKER = /VERIFIED|EXIT=|exit code|INFERENCE|미검증|commands?:/i;
const HOME_PATH_EXEMPT = 'validate-context' + ':allow' + '-home-path';
const AGENTS_RULE_HEADINGS = new Set([
  '세션 시작 규칙 (점진적 노출)',
  '세션 종료 게이트 (필수, 예외 없음)',
  '보고 규칙 (전 세션 공통)',
  '강제 장치 (규칙을 지킨다는 약속이 아니라 실제로 막는 곳)',
]);
// No \b here: JS word boundaries are [A-Za-z0-9_], so they never match after CJK.
const ADR_STATUS = /^\s*[-*]?\s*상태\s*[:：]\s*(제안|채택|대체됨\s*\(\s*ADR-\d+\s*\)|폐기)[^\n]*$/m;

const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', '.omo', '.next', 'coverage']);
const TEXT_EXT = /\.(md|markdown|json|jsonc|js|mjs|cjs|ts|tsx|yml|yaml|sql|sh|txt)$/i;
// Lookbehind, not a leading delimiter class. An earlier version required a quote or
// space before the home segment and a trailing separator after it, so the common
// assignment, key-colon and bare-with-no-trailing-separator forms all slipped through.
// The lookbehind keeps it from matching inside a longer path or a URL.
// NB: this comment deliberately contains no literal home path, or the checker flags itself.
const HOME_LEAK_RE = new RegExp(
  '(?<![\\w./])/(?:Users|home)/[A-Za-z0-9._-]+|[A-Za-z]:[\\\\/]Users[\\\\/][A-Za-z0-9._-]+',
  'g'
);

function matchType(value, allowed) {
  return allowed.some(t => {
    if (t === 'array') return Array.isArray(value);
    if (t === 'null') return value === null;
    return typeof value === t;
  });
}

function describe(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

function isTextFile(p) {
  if (TEXT_EXT.test(p)) return true;
  try {
    const buf = fs.readFileSync(p);
    if (buf.includes(0)) return false;
    return buf.length > 0 && buf.length <= 2 * 1024 * 1024;
  } catch {
    return false;
  }
}

function isInside(root, target) {
  const rel = path.relative(root, target);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

function walk(dir, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(path.join(dir, entry.name), out);
    } else if (entry.isFile() && isTextFile(path.join(dir, entry.name))) {
      out.push(path.join(dir, entry.name));
    }
  }
  return out;
}

function check(rootArg) {
  const failures = [];
  const advisories = [];
  const fail = (expected, actual, file, msg) => failures.push({ file, expected, actual, msg });

  // Compare real paths on both sides: on macOS os.tmpdir() is /var/... while its
  // real path is /private/var/..., so an unresolved root makes every file look like an escape.
  const root = safeRealpath(path.resolve(rootArg));
  const rel = p => path.relative(root, safeRealpath(p)) || p;

  // Every context artifact must be a real file living inside the repository.
  const guard = (p, label) => {
    if (!fs.existsSync(p) && !isSymlink(p)) return false;
    const real = safeRealpath(p);
    if (!isInside(root, real)) {
      fail('inside the repository', rel(real), label, 'symlink escapes the repository');
      return false;
    }
    let isFile = false;
    try {
      isFile = fs.statSync(p).isFile();
    } catch (err) {
      fail('a regular file', `unreadable: ${err.code || err.message}`, label,
        'context artifact is a broken or unreadable link');
      return false;
    }
    if (!isFile) {
      fail('a regular file', 'not a file', label, 'context artifact is not a regular file');
      return false;
    }
    return true;
  };

  const agents = path.join(root, 'AGENTS.md');
  if (!guard(agents, 'AGENTS.md')) {
    if (!fs.existsSync(agents)) fail('AGENTS.md present', 'missing', 'AGENTS.md', 'entry instructions missing');
  } else {
    const body = fs.readFileSync(agents, 'utf8');
    const bytes = Buffer.byteLength(body);
    const lines = body.split('\n').length;
    if (lines > AGENTS_MAX_LINES) {
      fail(`<= ${AGENTS_MAX_LINES} lines`, `${lines} lines`, 'AGENTS.md',
        'entry instructions exceed the thin-context budget; move detail behind a path reference');
    }
    if (bytes > AGENTS_MAX_BYTES) {
      fail(`<= ${AGENTS_MAX_BYTES} bytes`, `${bytes} bytes`, 'AGENTS.md',
        'entry instructions exceed the absolute size limit');
    }
    if (bytes > AGENTS_BUDGET_BYTES) {
      advisories.push({
        file: 'AGENTS.md',
        expected: `<= ${AGENTS_BUDGET_BYTES} bytes (8 KB advisory budget)`,
        actual: `${bytes} bytes`,
        msg: 'over the preferred 8 KB budget; consider splitting detail into a referenced file',
      });
    }
    if (bytes < AGENTS_MIN_BYTES) {
      fail(`>= ${AGENTS_MIN_BYTES} bytes`, `${bytes} bytes`, 'AGENTS.md',
        'entry instructions are too thin to route a session; a stub cannot be a map');
    }
    if (body.trim() === '') {
      fail('non-empty', 'empty', 'AGENTS.md', 'entry instructions are empty');
    }
  }

  // Rule files: one source of truth, thin per-tool adapters. This is what makes
  // behaviour identical regardless of which model or tool is driving the repo.
  const claude = path.join(root, 'CLAUDE.md');
  if (guard(claude, 'CLAUDE.md')) {
    const body = fs.readFileSync(claude, 'utf8');
    if (!/(^|\n)\s*@AGENTS\.md\b/.test(body)) {
      fail('a `@AGENTS.md` import', 'absent', 'CLAUDE.md',
        'CLAUDE.md must import AGENTS.md instead of restating rules; two copies drift apart');
    }
    const dupes = [...body.matchAll(/^##\s+(.+)$/gm)]
      .map(m => m[1].trim())
      .filter(h => {
        if (AGENTS_RULE_HEADINGS.has(h)) return true;
        return fs.existsSync(agents) && fs.readFileSync(agents, 'utf8').includes(`## ${h}`);
      });
    if (dupes.length) {
      fail('no rule headings duplicated from AGENTS.md', dupes.join(', '), 'CLAUDE.md',
        'CLAUDE.md restates rules that already live in AGENTS.md');
    }
  } else if (!fs.existsSync(claude)) {
    fail('CLAUDE.md present', 'missing', 'CLAUDE.md',
      'tool adapters must cover Claude Code as well as AGENTS.md readers');
  }

  // Session-end documentation harness: the gate that makes closing a session a
  // machine-checked event instead of a habit.
  const closeDocs = path.join(root, 'docs');
  const prompt = path.join(closeDocs, 'next-session-prompt.md');
  if (fs.existsSync(prompt)) {
    const body = fs.readFileSync(prompt, 'utf8');
    if (!/baseline/i.test(body)) {
      fail('a `baseline` section', 'absent', 'docs/next-session-prompt.md',
        'the next session cannot tell whether the baseline drifted without it');
    }
    if (body.trim().length < 200) {
      fail(`>= 200 bytes`, `${Buffer.byteLength(body)} bytes`, 'docs/next-session-prompt.md',
        'the handoff is too thin to resume from');
    }
    const lines = body.split('\n').length;
    if (lines > PROMPT_MAX_LINES) {
      fail(`<= ${PROMPT_MAX_LINES} lines`, `${lines} lines`, 'docs/next-session-prompt.md',
        'the handoff is a routing note, not a report; move detail to TICKETS or TEST-LOG');
    }
    if (!/TOOL_LABEL\s*[:=]/.test(body)) {
      fail('a `TOOL_LABEL:` line', 'absent', 'docs/next-session-prompt.md',
        'this repo exists to keep behaviour model-independent; an unrecorded model makes drift invisible');
    }
    for (const name of ['TICKETS.md', 'CONTEXT.md', 'TEST-LOG.md', 'REVIEW.md']) {
      const q = path.join(closeDocs, name);
      if (!fs.existsSync(q)) fail(`${name} synced to docs/`, 'missing', `docs/${name}`,
        'session-end docs must be synced to the docs root for the gate to see them');
    }
  } else {
    fail('docs/next-session-prompt.md present', 'missing', 'docs/next-session-prompt.md',
      'no session-end handoff exists; run the session-wrap harness before closing a session');
  }

  // Freshness: a handoff that predates real work is not a handoff.
  // Compared against the newest commit that touched a product path. Commits that
  // only touch docs/ or .context/ are excluded, otherwise a commit whose only
  // purpose is updating the handoff would make the handoff stale by construction
  // and the rule could never be satisfied.
  //
  // Skipped only for a synthetic PR merge checkout. GitHub builds that commit per PR, so
  // `productHead` there names a sha that did not exist when the branch was written and
  // cannot be in the handoff by any means — unsatisfiable, not merely unmet. VERIFIED on
  // run 36831658193, which asked for 728bee0 while the branch head was 0d8fb87.
  // A push to main checks out a real, nameable commit, so the rule must keep running
  // there; keying off `CI` alone would disable it everywhere.
  if (fs.existsSync(prompt) && fs.existsSync(path.join(root, '.git'))) {
    if (isSyntheticMergeCheckout(root)) {
      // Report the skip rather than passing silently. An exemption nobody can see is
      // how a disabled check starts reading as a satisfied one.
      advisories.push({
        file: 'docs/next-session-prompt.md',
        expected: 'a commit the handoff can name',
        actual: 'not checked (HEAD is the synthetic PR merge commit)',
        msg: 'handoff freshness is not verified for a PR merge checkout; run `npm run session:close` on the branch',
      });
    } else {
      const product = productHead(root);
      const body = fs.readFileSync(prompt, 'utf8');
      if (!product) {
        fail('a readable git history', 'unavailable', 'docs/next-session-prompt.md',
          'cannot verify that the session handoff reflects the current work');
      } else if (!hasHeadRef(body, product) && !hasHeadRef(body, gitHead(root) || '')) {
        fail(`commit ${product} (newest product change) or newer`, 'absent',
          'docs/next-session-prompt.md',
          'the session handoff predates product work; re-run the session-end harness');
      }
    }
  }

  // DONE.md is a dated history artifact. browser-design-forensics forbids it at the
  // docs root and 15 of the 20 projects following this convention omit it.
  if (fs.existsSync(path.join(closeDocs, 'DONE.md'))) {
    fail('no docs/DONE.md', 'present', 'docs/DONE.md',
      'DONE.md is a dated history artifact; the live copy belongs in the session folder only');
  }

  const sessionsRoot = path.join(closeDocs, 'sessions');
  const dated = fs.existsSync(sessionsRoot)
    ? fs.readdirSync(sessionsRoot).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort()
    : [];
  if (!dated.length) {
    fail('a dated folder under docs/sessions/', 'none', 'docs/sessions/',
      'a session cannot be closed without a dated snapshot; without one the review and completeness rules never run');
  } else {
    {
      const latest = dated[dated.length - 1];
      for (const name of SESSION_FILES) {
        const q = path.join(sessionsRoot, latest, name);
        if (!fs.existsSync(q)) fail(`${name} present`, 'missing', `docs/sessions/${latest}/${name}`,
          'a dated session folder is incomplete');
      }
      // Both halves are required. An alternation let a REVIEW.md record which model ran
      // while recording nothing about the outcome, which is the exact gap AGENTS.md
      // claims to close.
      for (const [rel, body] of [
        [`docs/sessions/${latest}/REVIEW.md`, path.join(sessionsRoot, latest, 'REVIEW.md')],
        ['docs/REVIEW.md', path.join(closeDocs, 'REVIEW.md')],
      ]) {
        if (!fs.existsSync(body)) continue;
        const text = fs.readFileSync(body, 'utf8');
        for (const label of ['REVIEW_MODEL', 'REVIEW_RESULT']) {
          if (!new RegExp(`${label}\\s*[:=]`).test(text)) {
            fail(`a \`${label}:\` line`, 'absent', rel,
              'an independent review is mandatory at session close; the artifact must name the model and record its verdict');
          }
        }
      }
    }
  }

  const ctxDir = path.join(root, '.context');
  const statePath = path.join(ctxDir, 'STATE');
  let state = null;

  if (guard(statePath, '.context/STATE')) {
    let parsed = false;
    const raw = fs.readFileSync(statePath, 'utf8');
    try {
      state = JSON.parse(raw);
      parsed = true;
    } catch (err) {
      fail('valid JSON', err.message, '.context/STATE', 'session state is not parseable');
    }

    const isPlainObject = state !== null && typeof state === 'object' && !Array.isArray(state);
    if (parsed && !isPlainObject) {
      fail('a JSON object', describe(state), '.context/STATE', 'session state is not a JSON object');
    }

    if (isPlainObject) {
      for (const [field, expectedType] of Object.entries(STATE_REQUIRED_FIELDS)) {
        if (!(field in state)) {
          fail(`"${field}" present`, 'absent', '.context/STATE', `required field missing: ${field}`);
          continue;
        }
        const allowed = Array.isArray(expectedType) ? expectedType : [expectedType];
        if (!matchType(state[field], allowed)) {
          fail(allowed.join(' | '), describe(state[field]), '.context/STATE',
            `field has wrong type: ${field}`);
        }
      }

      for (const field of ['checkpoint', 'session']) {
        if (typeof state[field] === 'string' && state[field].trim() === '') {
          fail('non-empty', 'empty', '.context/STATE', `${field} must not be empty`);
        }
      }

      if (state.todo_stage != null && !VALID_STAGES.includes(state.todo_stage)) {
        fail(VALID_STAGES.join(' | '), String(state.todo_stage), '.context/STATE',
          'todo_stage is not a recognised TDD stage');
      }
    }
  } else if (!fs.existsSync(statePath)) {
    fail('.context/STATE present', 'missing', '.context/STATE', 'session state missing');
  }

  const todoBody = [];
  for (const name of CONTEXT_FILES) {
    const p = path.join(ctxDir, name);
    if (!guard(p, `.context/${name}`)) {
      if (!fs.existsSync(p)) fail(`${name} present`, 'missing', `.context/${name}`, 'context file missing');
      continue;
    }
    const text = fs.readFileSync(p, 'utf8');
    if (text.trim() === '') fail('non-empty', 'empty', `.context/${name}`, 'context file is empty');
    if (name === 'TODO.md') todoBody.push(text);
  }

  if (todoBody.length && state && typeof state === 'object' && !Array.isArray(state)) {
    const todo = todoBody[0];
    if (!/^\s*[-*]\s*\[[ x→✓⚠✗]\]/m.test(todo)) {
      fail('at least one task line matching `- [ ] #NNN`', 'none found', '.context/TODO.md',
        'TODO.md has no task lines, so no active work can be resolved');
    }
    const active = state.todo_active;
    if (typeof active === 'string' && active.trim() !== '' && !todo.includes(active)) {
      fail(`"${active}" present in TODO.md`, 'absent', '.context/STATE',
        `active work pointer ${active} does not resolve to any task in TODO.md`);
    }
  }

  if (state && typeof state === 'object' && !Array.isArray(state) && state.lifecycle === 'complete') {
    const dir = path.join(root, 'docs', 'evidence');
    const files = fs.existsSync(dir)
      ? fs.readdirSync(dir).filter(f => fs.statSync(path.join(dir, f)).isFile())
      : [];
    if (files.length === 0) {
      fail('>= 1 artifact under docs/evidence/', '0 artifacts', 'docs/evidence/',
        'lifecycle is complete but no evidence artifact exists');
    } else {
      const thin = [];
      for (const f of files) {
        const body = fs.readFileSync(path.join(dir, f), 'utf8');
        if (Buffer.byteLength(body) < EVIDENCE_MIN_BYTES || !EVIDENCE_MARKER.test(body)) thin.push(f);
      }
      if (thin.length) {
        fail(`each artifact >= ${EVIDENCE_MIN_BYTES} bytes and citing a command or result`,
          `too thin: ${thin.join(', ')}`, 'docs/evidence/',
          'evidence artifact is a stub; completion requires reproducible proof');
      }
    }
  }

  const adrDir = path.join(ctxDir, 'ADR');
  if (fs.existsSync(adrDir) && fs.statSync(adrDir).isDirectory()) {
    for (const f of fs.readdirSync(adrDir)) {
      if (!/\.md$/i.test(f)) continue;
      const body = fs.readFileSync(path.join(adrDir, f), 'utf8');
      if (!ADR_STATUS.test(body)) {
        fail('a `- 상태: 제안|채택|대체됨(ADR-NNNN)|폐기` line', 'absent', `.context/ADR/${f}`,
          'ADR has no valid status line, so it cannot be resolved as accepted or superseded');
      }
    }
  }

  const exemptions = [];
  const scanned = new Set(walk(root));
  // Extensionless context artifacts (STATE) are invisible to an extension-based walk.
  for (const extra of [agents, statePath, ...CONTEXT_FILES.map(n => path.join(ctxDir, n))]) {
    if (fs.existsSync(extra) && fs.statSync(extra).isFile()) scanned.add(extra);
  }

  for (const file of scanned) {
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      let hits = line.match(HOME_LEAK_RE);
      if (hits && line.includes(HOME_PATH_EXEMPT)) {
        // The marker excuses the first leak on the line only, so a real second
        // leak on the same line is still reported. The excused path is named in
        // the output so an exemption cannot quietly hide a genuine leak.
        exemptions.push(`${rel(file)}:${i + 1} ${hits[0]}`);
        hits = hits.slice(1);
      }
      if (hits && hits.length) {
        const found = [...new Set(hits.map(h => h.trim()))].join(', ');
        fail('no absolute home paths', found, rel(file),
          'absolute home path makes the file machine-specific');
      }
    });
  }

  return { failures, advisories, exemptions };
}

function gitHead(root) {
  try {
    const out = require('child_process')
      .execFileSync('git', ['rev-parse', '--short=7', 'HEAD'], { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
    return out || null;
  } catch {
    return null;
  }
}

// Accept a full 40-char sha as well as the 7-char short form: compare the short
// head against the prefix of each hex token rather than requiring a word boundary.
function productHead(root) {
  try {
    return require('child_process')
      .execFileSync('git',
        // AGENTS.md is entry documentation, not product code. Leaving it in made a
        // close commit that edits both AGENTS.md and the handoff unsatisfiable, since
        // the handoff inside that commit cannot name the commit it is part of.
        ['log', '-1', '--format=%h', '--', '.', ':(exclude)docs', ':(exclude).context', ':(exclude)AGENTS.md'],
        { cwd: root, stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8' })
      .trim() || null;
  } catch {
    return null;
  }
}

// `CI=false` / `CI=0` are how a developer opts out; treat only a truthy value as CI.
function isCI() {
  for (const v of [process.env.CI, process.env.GITHUB_ACTIONS]) {
    if (v && v !== 'false' && v !== '0') return true;
  }
  return false;
}

// The freshness rule is only unsatisfiable when HEAD is the synthetic merge commit
// GitHub builds for a pull request. GitHub names that case precisely with GITHUB_REF
// (`refs/pull/N/merge`); a push to main keeps `refs/heads/...` and stays checkable, so
// keying off `CI` alone would silently stop verifying main.
function isSyntheticMergeCheckout(root) {
  const ref = process.env.GITHUB_REF || '';
  if (ref.startsWith('refs/pull/')) return true;
  if (!isCI()) return false;
  // Fallback for a CI that checks out a merge commit without GITHUB_REF: a merge has
  // more than one parent. `rev-list --parents` prints `<commit> <parent>...`.
  try {
    const line = require('child_process')
      .execFileSync('git', ['rev-list', '--parents', '-n', '1', 'HEAD'],
        { cwd: root, stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8' })
      .trim();
    return line.split(/\s+/).length > 2;
  } catch {
    return false;
  }
}

function hasHeadRef(text, head) {
  for (const token of text.match(/\b[0-9a-f]{7,40}\b/gi) || []) {
    if (token.toLowerCase().startsWith(head.toLowerCase())) return true;
  }
  return false;
}

function isSymlink(p) {
  try {
    return fs.lstatSync(p).isSymbolicLink();
  } catch {
    return false;
  }
}

function safeRealpath(p) {
  try {
    return fs.realpathSync(p);
  } catch {
    return path.resolve(p);
  }
}

function main() {
  const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
  const { failures, advisories, exemptions } = check(root);

  // Printed regardless of failures: an exemption that disappears from a red run is
  // exactly the "disabled check reads as a satisfied check" failure this guards against.
  for (const a of advisories || []) {
    console.log(`  [ADVISORY] ${a.file}: ${a.msg} (expected ${a.expected}, actual ${a.actual})`);
  }

  if (failures.length === 0) {
    console.log(`validate-context: OK (${path.basename(root)})`);
    const ex = exemptions || [];
    if (ex.length) {
      console.log(`  ${ex.length} declared home-path exemption(s):`);
      for (const e of ex) console.log(`    - ${e}`);
    }
    process.exit(0);
  }

  console.error(`validate-context: ${failures.length} violation(s) in ${root}\n`);
  for (const f of failures) {
    console.error(`  ${f.file}`);
    console.error(`    problem : ${f.msg}`);
    console.error(`    expected: ${f.expected}`);
    console.error(`    actual  : ${f.actual}`);
  }
  console.error('\nfix the files listed above, then re-run: node scripts/validate-context.js');
  process.exit(1);
}

if (require.main === module) main();

module.exports = { check, AGENTS_MAX_BYTES, AGENTS_MAX_LINES, AGENTS_BUDGET_BYTES, AGENTS_MIN_BYTES, STATE_REQUIRED_FIELDS, VALID_STAGES, EVIDENCE_MIN_BYTES, HOME_PATH_EXEMPT };
