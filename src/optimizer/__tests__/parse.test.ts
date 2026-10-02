import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { stripFencesAndParse } from '../parse';
import { skillHash } from '../hash';

describe('stripFencesAndParse', () => {
  it('parses bare JSON', () => {
    assert.deepEqual(stripFencesAndParse<{ a: number }>('{"a":1}'), { a: 1 });
  });

  it('strips a leading json fence and the closing fence', () => {
    assert.deepEqual(
      stripFencesAndParse<{ a: number }>('```json\n{"a":1}\n```'),
      { a: 1 },
      'the fence is an LLM formatting habit, not part of the payload',
    );
  });

  it('strips a fence with no language tag', () => {
    assert.deepEqual(stripFencesAndParse<{ a: number }>('```\n{"a":1}\n```'), { a: 1 });
  });

  it('accepts an unterminated fence, because a truncated reply still carries the payload', () => {
    assert.deepEqual(stripFencesAndParse<{ a: number }>('```json\n{"a":1}'), { a: 1 });
  });

  it('returns null for prose around the JSON instead of guessing a substring', () => {
    assert.equal(
      stripFencesAndParse('Here you go:\n{"a":1}\nHope that helps.'),
      null,
      'salvaging a substring would make a malformed reply indistinguishable from a valid one',
    );
  });

  it('returns null for empty input', () => {
    assert.equal(stripFencesAndParse(''), null);
  });

  it('returns null rather than throwing on malformed JSON', () => {
    assert.equal(stripFencesAndParse('{not json'), null);
  });

  it('lets a literal JSON null through, which is indistinguishable from a parse failure by design', () => {
    assert.equal(stripFencesAndParse('null'), null);
  });

  it('passes non-object JSON through unchanged', () => {
    assert.deepEqual(stripFencesAndParse('[1,2,3]'), [1, 2, 3]);
  });
});

describe('skillHash', () => {
  it('is a stable 16-char hex digest', () => {
    assert.match(skillHash('# Skill'), /^[0-9a-f]{16}$/);
    assert.equal(skillHash('# Skill'), skillHash('# Skill'));
  });

  it('separates contents that differ', () => {
    assert.notEqual(skillHash('# Skill'), skillHash('# Skil'));
  });

  it('keeps the digest length fixed for content far longer than the window', () => {
    assert.match(skillHash('x'.repeat(100_000)), /^[0-9a-f]{16}$/);
  });

  it('handles empty content without throwing', () => {
    assert.match(skillHash(''), /^[0-9a-f]{16}$/);
  });
});