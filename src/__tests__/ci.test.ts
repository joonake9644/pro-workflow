import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const CI_WORKFLOW = path.join(REPO_ROOT, '.github', 'workflows', 'ci.yml');
const ci = fs.readFileSync(CI_WORKFLOW, 'utf8');

const GATES = [
  { name: 'test suite', run: 'run: npm test' },
  { name: 'session context', run: 'run: npm run validate:context' },
  { name: 'session close', run: 'run: npm run session:close' },
];

const stepIndex = (needle: string) => ci.indexOf(needle);

describe('CI workflow', () => {
  it('exists and is readable', () => {
    assert.ok(fs.existsSync(CI_WORKFLOW));
    assert.ok(ci.length > 0);
  });

  for (const gate of GATES) {
    it(`runs the ${gate.name} gate`, () => {
      assert.ok(
        stepIndex(gate.run) > 0,
        `ci.yml must contain a \`${gate.run}\` step; without it the gate is never enforced in CI`
      );
    });

    it(`runs the ${gate.name} gate inside the job that owns the node-version matrix`, () => {
      assert.match(ci, /node-version:\s*\[([^\]]+)\]/, 'ci.yml must declare a node-version matrix');

      // "Appears after the matrix text" is not enough: a gate moved into a different
      // job would still satisfy that. Assert it is within the matrix job's own span.
      const jobs = [...ci.matchAll(/^ {2}([A-Za-z0-9_-]+):\s*$/gm)].map(m => ({
        name: m[1],
        start: m.index,
      }));
      const idx = stepIndex(gate.run);
      assert.ok(idx > 0, `ci.yml must contain a \`${gate.run}\` step`);

      const owner = jobs.filter(j => j.start < idx).pop();
      assert.ok(owner, 'the gate step must belong to some job');
      assert.match(
        ci.slice(owner.start, idx),
        /strategy:[\s\S]*?matrix:[\s\S]*?node-version:/,
        `the \`${gate.run}\` step sits in job "${owner.name}", which has no node-version matrix`
      );
    });

    it(`does not silence ${gate.name} failures`, () => {
      const escaped = gate.run.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      assert.doesNotMatch(ci, new RegExp(`${escaped}[^\\n]*\\|\\|\\s*true`));
    });
  }

  it('does not disable job-level continue-on-error', () => {
    assert.doesNotMatch(ci, /continue-on-error:\s*true/);
  });

  it('keeps every gate in the same job as the type check', () => {
    const typeCheck = stepIndex('run: npx tsc --noEmit');
    assert.ok(typeCheck > 0, 'ci.yml must run a type check');
    for (const gate of GATES) {
      const idx = stepIndex(gate.run);
      assert.ok(idx > typeCheck, `${gate.run} must be gated before the dist file checks`);
    }
  });
});
