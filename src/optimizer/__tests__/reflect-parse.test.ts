import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parsePatches, extractReasoning } from '../reflect';
import {
  buildAnthropicBody,
  buildOpenAIBody,
  extractText,
  extractUsage,
  resolveTimeoutMs,
  priceFor,
} from '../llm';
import type { LLMRequest } from '../llm';

const ok = { op: 'add', anchor: '## Rules', payload: '- new' };

describe('parsePatches', () => {
  it('keeps a well-formed patch', () => {
    assert.deepEqual(parsePatches('{"patches":[{"op":"add","anchor":"## Rules","payload":"- new"}]}'), [ok]);
  });

  it('tolerates a markdown fence, since the prompt asks for strict JSON and the model still fences', () => {
    assert.deepEqual(parsePatches('```json\n{"patches":[{"op":"add","anchor":"## Rules","payload":"- new"}]}\n```'), [ok]);
  });

  it('drops a patch whose op is outside the three the applier understands', () => {
    assert.deepEqual(parsePatches('{"patches":[{"op":"PATCH","anchor":"a","payload":"b"}]}'), []);
  });

  it('is case-sensitive about op, so "Add" cannot slip past as "add"', () => {
    assert.deepEqual(parsePatches('{"patches":[{"op":"Add","anchor":"a","payload":"b"}]}'), []);
  });

  it('drops a patch whose anchor is not a string', () => {
    assert.deepEqual(parsePatches('{"patches":[{"op":"add","anchor":123,"payload":"b"}]}'), []);
  });

  it('drops a patch whose payload is missing', () => {
    assert.deepEqual(parsePatches('{"patches":[{"op":"add","anchor":"a"}]}'), []);
  });

  it('keeps only the three known fields and drops unknown ones', () => {
    assert.deepEqual(
      parsePatches('{"patches":[{"op":"add","anchor":"a","payload":"b","confidence":0.9}]}'),
      [{ op: 'add', anchor: 'a', payload: 'b' }],
      'an unrecognized key must not ride along into the patch the applier folds over',
    );
  });

  it('keeps an empty anchor, which is how "append at end" is spelled', () => {
    assert.deepEqual(parsePatches('{"patches":[{"op":"add","anchor":"","payload":"- tail"}]}'),
      [{ op: 'add', anchor: '', payload: '- tail' }]);
  });

  it('returns empty when patches is not an array', () => {
    assert.deepEqual(parsePatches('{"patches":{"op":"add"}}'), []);
  });

  it('returns empty when the key is absent', () => {
    assert.deepEqual(parsePatches('{"reasoning":"x"}'), []);
  });

  it('returns empty for an unparseable reply', () => {
    assert.deepEqual(parsePatches('I am sorry, I cannot comply.'), []);
  });

  it('skips a null entry rather than throwing on it', () => {
    assert.deepEqual(
      parsePatches('{"patches":[null,{"op":"add","anchor":"a","payload":"b"}]}'),
      [{ op: 'add', anchor: 'a', payload: 'b' }],
      'a null inside the array must not take down the whole reply',
    );
  });

  it('skips a non-object entry such as a bare number or string', () => {
    assert.deepEqual(parsePatches('{"patches":[7,"add",[1]]}'), []);
  });

  it('returns empty for a batch that is entirely invalid rather than throwing', () => {
    assert.deepEqual(parsePatches('{"patches":[{"op":1},{"op":"add","anchor":"a","payload":"b"}]}'),
      [{ op: 'add', anchor: 'a', payload: 'b' }],
      'one bad entry must not discard the good one');
  });
});

describe('extractReasoning', () => {
  it('returns the reasoning paragraph', () => {
    assert.equal(extractReasoning('{"reasoning":"tightened the rules"}'), 'tightened the rules');
  });

  it('returns empty when the key is absent', () => {
    assert.equal(extractReasoning('{"patches":[]}'), '');
  });

  it('returns empty for an unparseable reply', () => {
    assert.equal(extractReasoning('no json here'), '');
  });

  it('rejects a non-string reasoning so the caller never stores a number in a string field', () => {
    assert.equal(
      extractReasoning('{"reasoning":5}'),
      '',
      'ReflectOutput.reasoning is typed string; leaking 5 would persist a wrong type into the run record',
    );
  });

  it('rejects a null reasoning', () => {
    assert.equal(extractReasoning('{"reasoning":null}'), '');
  });
});
const req: LLMRequest = { provider: 'anthropic', model: 'claude-sonnet-5', system: 'S', user: 'U' };

describe('buildAnthropicBody', () => {
  it('carries the system prompt out of band and the user turn as a message', () => {
    const body = JSON.parse(buildAnthropicBody({ ...req, system: 'be strict', user: 'grade this' }));
    assert.equal(body.system, 'be strict');
    assert.deepEqual(body.messages, [{ role: 'user', content: 'grade this' }]);
  });

  it('defaults max_tokens to 4096', () => {
    assert.equal(JSON.parse(buildAnthropicBody(req)).max_tokens, 4096);
  });

  it('honours an explicit maxTokens of 0 instead of replacing it with the default', () => {
    assert.equal(JSON.parse(buildAnthropicBody({ ...req, maxTokens: 0 })).max_tokens, 0);
  });

  it('sends the requested temperature, because validateSkill passes 0 for a strict grading gate', () => {
    assert.equal(
      JSON.parse(buildAnthropicBody({ ...req, temperature: 0 })).temperature,
      0,
      'a dropped temperature makes the strict validation gate non-deterministic on this provider',
    );
  });
});

describe('buildOpenAIBody', () => {
  it('puts the system prompt into the message list, since this API has no system field', () => {
    const body = JSON.parse(buildOpenAIBody({ ...req, provider: 'openai', system: 'S', user: 'U' }));
    assert.deepEqual(body.messages, [{ role: 'system', content: 'S' }, { role: 'user', content: 'U' }]);
    assert.equal(body.system, undefined);
  });

  it('defaults temperature to 0.2 when unspecified', () => {
    assert.equal(JSON.parse(buildOpenAIBody({ ...req, provider: 'openai' })).temperature, 0.2);
  });

  it('honours an explicit temperature of 0', () => {
    assert.equal(JSON.parse(buildOpenAIBody({ ...req, provider: 'openai', temperature: 0 })).temperature, 0);
  });

  it('defaults max_tokens to 4096', () => {
    assert.equal(JSON.parse(buildOpenAIBody({ ...req, provider: 'openai' })).max_tokens, 4096);
  });
});

describe('extractText', () => {
  it('reads the first text block from an anthropic reply', () => {
    assert.equal(extractText('anthropic', { content: [{ type: 'thinking' }, { type: 'text', text: 'hi' }] }), 'hi');
  });

  it('reads the first choice from an openai-shaped reply', () => {
    assert.equal(extractText('openai', { choices: [{ message: { content: 'hi' } }] }), 'hi');
  });

  it('returns empty rather than throwing when the reply carries no content', () => {
    assert.equal(extractText('anthropic', {}), '');
    assert.equal(extractText('openai', {}), '');
  });

  it('returns empty when the choice has no message', () => {
    assert.equal(extractText('openai', { choices: [{}] }), '');
  });
});

describe('extractUsage', () => {
  it('maps anthropic token names', () => {
    assert.deepEqual(extractUsage('anthropic', { usage: { input_tokens: 5, output_tokens: 7 } }), { input: 5, output: 7 });
  });

  it('maps openai token names', () => {
    assert.deepEqual(extractUsage('openai', { usage: { prompt_tokens: 5, completion_tokens: 7 } }), { input: 5, output: 7 });
  });

  it('reports zero rather than NaN when the reply omits usage, so the cost stays finite', () => {
    assert.deepEqual(extractUsage('anthropic', {}), { input: 0, output: 0 });
    assert.deepEqual(extractUsage('openai', { usage: {} }), { input: 0, output: 0 });
  });
});

describe('priceFor', () => {
  it('returns the price pair for a known model', () => {
    assert.deepEqual(priceFor('claude-sonnet-5'), { input: 2, output: 10 });
  });

  it('returns null for an unpriced model so the budget cap can refuse the call', () => {
    assert.equal(priceFor('some-unreleased-model'), null);
  });
});

describe('resolveTimeoutMs', () => {
  it('falls back to the default when the env var is absent', () => {
    assert.equal(resolveTimeoutMs(undefined), 120_000);
  });

  it('falls back to the default when the env var is not a number', () => {
    assert.equal(resolveTimeoutMs('abc'), 120_000);
  });

  it('honours an explicit override', () => {
    assert.equal(resolveTimeoutMs('5000'), 5000);
  });

  it('refuses a zero timeout, which would abort every request on the first tick', () => {
    assert.equal(resolveTimeoutMs('0'), 120_000);
  });

  it('refuses a negative timeout, which would fire setTimeout immediately', () => {
    assert.equal(resolveTimeoutMs('-1'), 120_000);
  });
});
