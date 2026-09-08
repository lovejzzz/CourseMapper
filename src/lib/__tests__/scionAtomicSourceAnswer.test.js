import { it, expect } from 'vitest';
import fs from 'node:fs';
import { resolveAtomicSourceAnswer, atomicAnswerSentenceContext } from '../scionAtomicSourceAnswer.js';
const read = (name) =>
  JSON.parse(
    fs.readFileSync(
      new URL('../../../research/scion/evaluation/v0.20.0/atomic-reading/' + name, import.meta.url),
      'utf8',
    ),
  );
it('locates the count inside each actual atomic answer without rewriting its source notation', () => {
  const raw = read('first-run-raw.json'),
    inputs = read('inputs.json'),
    references = read('references.json');
  const counts = raw.calls.filter((c) => /-(returned|whole)$/.test(c.id));
  expect(counts).toHaveLength(8);
  for (const call of counts) {
    const input = inputs.find((i) => i.id === call.id),
      answer = call.mode === 'json' ? JSON.parse(call.raw).answer : call.raw;
    const result = resolveAtomicSourceAnswer(answer, [{ id: 'record', text: input.record }], { type: 'count' });
    expect(result.status, call.id + ' ' + call.mode).toBe('located');
    expect(result.binding.quote).toBe(references.find((r) => r.id === call.id).expected);
    expect(input.record.slice(result.witness.start, result.witness.end)).toBe(answer);
    expect(result.semanticReviewRequired).toBe(true);
  }
});
it('refuses rewritten, repeated and multi-count evidence instead of choosing the first number', () => {
  const inputs = [{ id: 's', text: 'North has twelve tools; twelve of forty-eight tools returned at South.' }];
  expect(resolveAtomicSourceAnswer('12 tools', inputs, { type: 'count' }).status).toBe('needs-review');
  expect(resolveAtomicSourceAnswer('twelve', inputs, { type: 'count' }).status).toBe('needs-review');
  expect(resolveAtomicSourceAnswer('twelve of forty-eight tools', inputs, { type: 'count' }).status).toBe(
    'needs-review',
  );
  const resolved = resolveAtomicSourceAnswer('North has twelve tools', inputs, { type: 'count' });
  expect(resolved.binding.quote).toBe('twelve');
  expect(resolved.binding.occurrence).toBe(0);
  expect(resolveAtomicSourceAnswer('UNKNOWN', inputs, { type: 'count' }).status).toBe('missing');
  expect(resolveAtomicSourceAnswer('tools returned at South.', inputs, { type: 'count' }).status).toBe('needs-review');
});
it('derives a complete record only from uniquely located evidence and honors an explicit owner', () => {
  const inputs = [
    { id: 'a', text: 'The list stayed unchanged.' },
    { id: 'b', text: 'The list stayed unchanged. Further details are unavailable.' },
  ];
  expect(resolveAtomicSourceAnswer('The list stayed unchanged.', inputs, { type: 'record' }).status).toBe(
    'needs-review',
  );
  const located = resolveAtomicSourceAnswer('The list stayed unchanged.', inputs, { type: 'record', inputId: 'b' });
  expect(located.binding.quote).toBe(inputs[1].text);
  expect(located.witness.quote).toBe('The list stayed unchanged.');
  expect(
    resolveAtomicSourceAnswer('The list stayed unchanged.', inputs, { type: 'record', inputId: 'gone' }).status,
  ).toBe('needs-review');
});

it('uses verified clarification context without guessing among globally repeated counts', () => {
  const inputs = [{ id: 's', text: 'North issued twelve tools. At South, twelve of forty-eight tools returned.' }];
  const context = resolveAtomicSourceAnswer('At South, twelve of forty-eight tools returned.', inputs).witness;
  const result = resolveAtomicSourceAnswer('twelve', inputs, { type: 'count', context });
  expect(result.status).toBe('located');
  expect(result.binding.occurrence).toBe(1);
  expect(resolveAtomicSourceAnswer('twelve', inputs, { type: 'count', context: { ...context, start: 0 } }).status).toBe(
    'needs-review',
  );
  const multi = resolveAtomicSourceAnswer(context.quote, inputs, { type: 'count' });
  expect(multi.status).toBe('needs-review');
  expect(multi.witness).toEqual(context);
});

it('canonicalizes identical labels within one record without relaxing count or cross-record ambiguity', () => {
  const inputs = [{ id: 'a', text: 'Cedar depot reports sixteen returns. Cedar depot issued forty tools.' }];
  const label = resolveAtomicSourceAnswer('Cedar depot', inputs, { type: 'label' });
  expect(label.status).toBe('located');
  expect(label.binding.occurrence).toBe(0);
  expect(label.matchingOccurrences).toEqual([0, 1]);
  expect(label.semanticReviewRequired).toBe(true);
  expect(resolveAtomicSourceAnswer('Cedar depot', inputs).status).toBe('needs-review');
  expect(
    resolveAtomicSourceAnswer('Cedar depot', [...inputs, { id: 'b', text: 'Cedar depot has a conflicting report.' }], {
      type: 'label',
    }).status,
  ).toBe('needs-review');
  expect(
    resolveAtomicSourceAnswer('sixteen', [{ id: 'a', text: 'sixteen returns of sixteen tools' }], { type: 'count' })
      .status,
  ).toBe('needs-review');
});

it('narrows follow-up reading to the verified count sentence without changing source positions', () => {
  const inputs = [{ id: 'a', text: 'North has twenty devices. South has forty devices; ten passed.' }];
  const count = resolveAtomicSourceAnswer('forty devices', inputs, { type: 'count' });
  const context = atomicAnswerSentenceContext(count.witness, inputs);
  expect(context.quote).toBe(' South has forty devices;');
  const unit = resolveAtomicSourceAnswer('devices', inputs, { context });
  expect(unit.binding.occurrence).toBe(1);
  expect(atomicAnswerSentenceContext({ ...count.witness, quote: 'invented' }, inputs)).toBeNull();
});

it('retains exact original bytes for a unique sentence-initial capitalization difference', () => {
  const input = [{ id: 'a', text: 'Every learner belongs to one class; the classes share no learners.' }];
  const result = resolveAtomicSourceAnswer('The classes share no learners.', input);
  expect(result.binding.quote).toBe('the classes share no learners.');
  expect(result.answerNormalization).toBe('sentence-initial-capital');
  expect(result.witness.start).toBe(input[0].text.indexOf('the classes'));
  expect(resolveAtomicSourceAnswer('The classes SHARE no learners.', input).status).toBe('needs-review');
  expect(
    resolveAtomicSourceAnswer('The classes share no learners.', [
      ...input,
      { id: 'b', text: 'the classes share no learners.' },
    ]).status,
  ).toBe('needs-review');
  expect(resolveAtomicSourceAnswer('Twenty', [{ id: 'a', text: 'twenty' }], { type: 'count' }).status).toBe(
    'needs-review',
  );
});
