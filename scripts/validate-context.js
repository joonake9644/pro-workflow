#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const AGENTS_MAX_BYTES = 8 * 1024;
const AGENTS_MIN_BYTES = 200;
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
    if (bytes > AGENTS_MAX_BYTES) {
      fail(`<= ${AGENTS_MAX_BYTES} bytes`, `${bytes} bytes`, 'AGENTS.md',
        'entry instructions exceed the thin-context cap; move detail behind a path reference');
    }
    if (bytes < AGENTS_MIN_BYTES) {
      fail(`>= ${AGENTS_MIN_BYTES} bytes`, `${bytes} bytes`, 'AGENTS.md',
        'entry instructions are too thin to route a session; a stub cannot be a map');
    }
    if (body.trim() === '') {
      fail('non-empty', 'empty', 'AGENTS.md', 'entry instructions are empty');
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

  return { failures, exemptions };
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
  const { failures, exemptions } = check(root);

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

module.exports = { check, AGENTS_MAX_BYTES, AGENTS_MIN_BYTES, STATE_REQUIRED_FIELDS, VALID_STAGES, EVIDENCE_MIN_BYTES, HOME_PATH_EXEMPT };
