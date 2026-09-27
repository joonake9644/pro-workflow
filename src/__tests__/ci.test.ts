import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const CI_WORKFLOW = path.join(REPO_ROOT, '.github', 'workflows', 'ci.yml');
const ci = fs.readFileSync(CI_WORKFLOW, 'utf8');

describe('CI workflow', () => {
  it('exists and is readable', () => {
    assert.ok(fs.existsSync(CI_WORKFLOW));
    assert.ok(ci.length > 0);
  });

  it('runs the test suite', () => {
    assert.match(ci, /run:\s*npm test/);
  });

  it('runs tests on every node-version matrix leg', () => {
    const matrix = ci.match(/node-version:\s*\[([^\]]+)\]/);
    assert.ok(matrix, 'ci.yml must declare a node-version matrix');

    const testStepIndex = ci.indexOf('run: npm test');
    assert.ok(testStepIndex > 0, 'ci.yml must contain a `run: npm test` step');

    const buildJob = ci.slice(0, testStepIndex);
    assert.match(
      buildJob,
      /strategy:[\s\S]*?matrix:[\s\S]*?node-version:/,
      'the `npm test` step must belong to a job that uses the node-version matrix'
    );
  });

  it('does not silence test failures', () => {
    assert.doesNotMatch(ci, /npm test[^\n]*\|\|\s*true/);
    assert.doesNotMatch(ci, /continue-on-error:\s*true/);
  });
});
