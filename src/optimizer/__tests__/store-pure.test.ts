import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { trajectoriesToValidation } from '../store';
import type { Trajectory } from '../types';

function traj(learningId: number, timesApplied: number, extra: Partial<Trajectory> = {}): Trajectory {
  return {
    learningId,
    category: `cat-${learningId}`,
    rule: `rule-${learningId}`,
    mistake: `mistake-${learningId}`,
    correction: `correction-${learningId}`,
    timesApplied,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...extra,
  };
}

describe('trajectoriesToValidation', () => {
  it('holds out at most a quarter of the batch', () => {
    const out = trajectoriesToValidation('demo', [traj(1, 1), traj(2, 1), traj(3, 1), traj(4, 1)], 10);
    assert.equal(out.validation.length, 1);
    assert.equal(out.train.length, 3);
  });

  it('honours a smaller requested holdout', () => {
    const rows = [traj(1, 1), traj(2, 1), traj(3, 1), traj(4, 1), traj(5, 1), traj(6, 1), traj(7, 1), traj(8, 1)];
    assert.equal(trajectoriesToValidation('demo', rows, 1).validation.length, 1);
  });

  it('never holds out more than a quarter even when asked for more', () => {
    const rows = [traj(1, 1), traj(2, 1), traj(3, 1), traj(4, 1), traj(5, 1), traj(6, 1)];
    assert.equal(
      trajectoriesToValidation('demo', rows, 2).validation.length,
      1,
      'a quarter cap keeps the holdout from starving the training split',
    );
  });

  it('sorts the most-applied trajectories into validation, leaving rare ones to train', () => {
    const rows = [traj(1, 1), traj(2, 9), traj(3, 1), traj(4, 9)];
    const out = trajectoriesToValidation('demo', rows, 1);
    assert.equal(out.validation[0].learningId, 4);
    assert.deepEqual(out.train.map((t) => t.learningId), [1, 3, 2]);
  });

  it('breaks a tie on timesApplied by learningId so the split is deterministic', () => {
    const rows = [traj(5, 1), traj(2, 1), traj(9, 1), traj(1, 1)];
    assert.deepEqual(trajectoriesToValidation('demo', rows, 1).train.map((t) => t.learningId), [1, 2, 5]);
  });

  it('does not mutate the caller array', () => {
    const rows = [traj(3, 5), traj(1, 1)];
    const before = rows.map((r) => r.learningId);
    trajectoriesToValidation('demo', rows, 1);
    assert.deepEqual(rows.map((r) => r.learningId), before);
  });

  it('weights by usage so a rarely-applied learning counts less', () => {
    const rows = [traj(1, 0), traj(2, 8), traj(3, 1), traj(4, 1)];
    const out = trajectoriesToValidation('demo', rows, 1);
    assert.equal(out.validation[0].learningId, 2);
    assert.ok(out.validation[0].weight > 1, 'a learning applied 8 times should weigh more than 1');
  });

  it('clamps the weight so one runaway learning cannot dominate the score', () => {
    const rows = [traj(1, 0), traj(2, 10_000), traj(3, 1), traj(4, 1)];
    const out = trajectoriesToValidation('demo', rows, 1);
    assert.equal(out.validation[0].weight, 3);
  });

  it('falls back to a category-derived prompt when the trajectory has no mistake', () => {
    const rows = [traj(1, 1), traj(2, 1), traj(3, 1), traj(7, 5, { mistake: null, correction: null })];
    const out = trajectoriesToValidation('demo', rows, 1);
    assert.equal(out.validation[0].prompt, 'Scenario from category "cat-7"');
    assert.equal(out.validation[0].expected, 'rule-7');
  });

  it('stamps the slug on every validation row so rows cannot be attributed to another skill', () => {
    const rows = [traj(1, 1), traj(2, 1), traj(3, 1), traj(4, 9)];
    const out = trajectoriesToValidation('demo', rows, 1);
    assert.equal(out.validation[0].skillSlug, 'demo');
  });

  it('holds out nothing for a batch too small to quarter', () => {
    const out = trajectoriesToValidation('demo', [traj(1, 1)], 5);
    assert.deepEqual(out.validation, []);
    assert.equal(out.train.length, 1);
  });

  it('holds out nothing for an empty batch', () => {
    const out = trajectoriesToValidation('demo', [], 5);
    assert.deepEqual(out.validation, []);
    assert.deepEqual(out.train, []);
  });

  it('does not let a zero holdout carve the tail off as if slice(-0) meant slice(0)', () => {
    const rows = [traj(1, 1), traj(2, 1), traj(3, 1), traj(4, 1)];
    const out = trajectoriesToValidation('demo', rows, 0);
    assert.deepEqual(out.validation, []);
    assert.equal(out.train.length, 4);
  });

  it('holds out nothing for a negative holdout rather than carving a tail off the end', () => {
    const rows = [traj(1, 1), traj(2, 2), traj(3, 3), traj(4, 4)];
    const out = trajectoriesToValidation('demo', rows, -3);
    assert.deepEqual(out.validation, []);
    assert.equal(
      out.train.length,
      4,
      'a negative holdout must not leak rows out of the training split',
    );
  });

  it('never lets train and validation overlap', () => {
    const rows = [traj(1, 1), traj(2, 2), traj(3, 3), traj(4, 4), traj(5, 5), traj(6, 6), traj(7, 7), traj(8, 8)];
    const out = trajectoriesToValidation('demo', rows, 2);
    const trainIds = new Set(out.train.map((t) => t.learningId));
    assert.equal(out.validation.filter((v) => trainIds.has(v.learningId)).length, 0);
  });
});