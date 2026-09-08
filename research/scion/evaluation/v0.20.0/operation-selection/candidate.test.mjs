import assert from 'node:assert/strict';
import test from 'node:test';
import { assess, messages } from './candidate-v1.mjs';

test('selection is a proposal, never approval; null is a valid abstention', () => {
  assert.deepEqual(assess('{"operation":null,"reason":"Missing prerequisite"}'), {
    status: 'requires-semantic-review',
    operation: null,
    reason: 'Missing prerequisite',
  });
  assert.equal(assess('{"operation":"pooled-proportion","reason":"Distinct groups"}').operation, 'pooled-proportion');
});
test('malformed, unknown and authority-expanding responses fail closed', () => {
  for (const raw of [
    '{}',
    'null',
    '[]',
    '{"operation":"unknown","reason":"x"}',
    '{"operation":null,"reason":""}',
    '{"operation":null,"reason":"x","approved":true}',
    '{"operation":null,"reason":"x"} trailing',
  ])
    assert.equal(assess(raw).status, 'invalid');
});
test('only product input fields enter inference, not evaluator additions', () => {
  const request = {
    request: 'x',
    objective: 'y',
    sources: [{ id: 'a', text: 'z', solution: 'PRIVATE' }],
    reference: 'PRIVATE',
  };
  assert.deepEqual(JSON.parse(messages(request)[1].content), {
    request: 'x',
    objective: 'y',
    sources: [{ id: 'a', text: 'z' }],
  });
});

import { assess as assessLabel } from './candidate.mjs';
test('fixed labels reject explanations and quoted pseudo-null', () => {
  assert.deepEqual(assessLabel('NONE'), { status: 'requires-semantic-review', operation: null });
  assert.equal(assessLabel('pooled-proportion').operation, 'pooled-proportion');
  for (const raw of ['null', '"NONE"', 'NONE because evidence is missing', 'unknown', ''])
    assert.equal(assessLabel(raw).status, 'invalid');
});
