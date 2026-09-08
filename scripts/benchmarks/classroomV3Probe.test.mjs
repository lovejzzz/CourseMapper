import { test } from 'node:test';
import assert from 'node:assert/strict';
import { productInput, compilerArguments, inspectCapture } from './classroomV3Probe.mjs';

const input = {
  request: 'Compare the two records.',
  objective: 'Identify a supported conclusion.',
  sources: [{ id: 'note', text: 'Original source text.' }],
};

test('reference fields cannot cross the product input boundary', () => {
  assert.throws(() => productInput({ ...input, judgment: 'REFERENCE ANSWER' }));
  assert.throws(() => productInput({ ...input, sources: [{ ...input.sources[0], answer: 'REFERENCE' }] }));
  const safe = productInput(input);
  safe.sources[0].text = 'mutated';
  assert.equal(input.sources[0].text, 'Original source text.');
});

test('invalid and duplicate records fail before product invocation', () => {
  for (const sources of [[], [null], [input.sources[0], input.sources[0]], [{ id: 'note', text: '' }]])
    assert.throws(() => productInput({ ...input, sources }));
});

test('compiler receives the original objective, request, IDs and source prose', () => {
  const { map, options } = compilerArguments(input);
  assert.equal(map.lessons[0].sections[0].learningObjectives, input.objective);
  assert.equal(map.lessons[0].sections[0].weeklyAssessments, input.request);
  assert.deepEqual(options.instructorProvidedFacts, ['Original source text.']);
  assert(options.sourceBrief.includes('[note] Original source text.'));
  assert.equal(options.teachingTaskSources, undefined);
});

test('missing output and product self-reported quality cannot yield acceptance', () => {
  const result = inspectCapture({ outputs: { quality: { ready: true, score: 100 } }, tasks: [] });
  assert.equal(result.failures.length, 10);
  assert.equal(result.sharedTaskStatus, 'not-formed');
  assert.equal(result.educationalAcceptance, 'pending');
  assert.equal(result.protocolCompletion, 'not-measured');
});

test('a task or material presence does not certify answers, layout or classroom readiness', () => {
  const result = inspectCapture({
    outputs: { courseMap: { lessons: [{ title: 'Task' }] } },
    tasks: [{ answer: 'Wrong answer' }],
  });
  assert.equal(result.materials.courseMap.surfacePresent, true);
  assert.equal(result.materials.courseMap.evidenceAndAnswers, 'pending');
  assert.equal(result.materials.courseMap.layout, 'pending');
  assert.equal(result.sharedTaskStatus, 'requires-review');
  assert.equal(result.educationalAcceptance, 'pending');
});

test('compiler exceptions remain in the capture instead of dropping failed cases', () => {
  const result = inspectCapture({ outputs: {}, tasks: [], error: 'Model-free compile failed' });
  assert.equal(result.failures[0].code, 'compiler-exception');
  assert.equal(result.failures[0].detail, 'Model-free compile failed');
  assert.equal(result.failures.length, 11);
});
