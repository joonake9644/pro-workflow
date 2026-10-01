import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseOutcomes } from '../validate';

describe('parseOutcomes', () => {
  it('maps snake_case outcome fields onto the domain shape', () => {
    assert.deepEqual(
      parseOutcomes('{"outcomes":[{"item_id":7,"pass":true,"score":0.9,"rationale":"ok"}]}'),
      [{ itemId: 7, pass: true, score: 0.9, rationale: 'ok' }],
    );
  });

  it('falls back to pass ? 1 : 0 when score is absent, because weightedScore must stay computable', () => {
    assert.equal(parseOutcomes('{"outcomes":[{"item_id":1,"pass":true}]}')[0].score, 1);
    assert.equal(parseOutcomes('{"outcomes":[{"item_id":1,"pass":false}]}')[0].score, 0);
  });

  it('falls back to pass ? 1 : 0 when score is null, since typeof null is not number', () => {
    assert.equal(parseOutcomes('{"outcomes":[{"item_id":1,"pass":true,"score":null}]}')[0].score, 1);
  });

  it('drops an outcome whose item_id is not a number', () => {
    assert.deepEqual(parseOutcomes('{"outcomes":[{"item_id":"7","pass":true}]}'), []);
  });

  it('drops an outcome whose pass is not a boolean', () => {
    assert.deepEqual(parseOutcomes('{"outcomes":[{"item_id":7,"pass":"true"}]}'), []);
  });

  it('defaults rationale to empty when it is missing or not a string', () => {
    assert.equal(parseOutcomes('{"outcomes":[{"item_id":1,"pass":true}]}')[0].rationale, '');
    assert.equal(parseOutcomes('{"outcomes":[{"item_id":1,"pass":true,"rationale":7}]}')[0].rationale, '');
  });

  it('keeps the good outcomes when one entry is malformed', () => {
    assert.equal(
      parseOutcomes('{"outcomes":[{"item_id":"x","pass":true},{"item_id":2,"pass":false,"score":0.2}]}').length,
      1,
    );
  });

  it('returns empty when outcomes is not an array', () => {
    assert.deepEqual(parseOutcomes('{"outcomes":7}'), []);
  });

  it('returns empty for an unparseable reply', () => {
    assert.deepEqual(parseOutcomes('total: 3/5 passed'), []);
  });

  it('returns empty for an empty batch', () => {
    assert.deepEqual(parseOutcomes('{"outcomes":[]}'), []);
  });

  it('preserves the reply order, because weightedScore folds over the array as given', () => {
    assert.deepEqual(
      parseOutcomes('{"outcomes":[{"item_id":3,"pass":true},{"item_id":1,"pass":false}]}').map((o) => o.itemId),
      [3, 1],
    );
  });
});