import test from 'node:test';
import assert from 'node:assert/strict';
import { arithmetic, checkClassroomV3Evidence } from './classroomV3Checks.mjs';
const input = {
  sources: [
    { id: 'a', text: 'Nine of twelve; twelve of forty-eight.' },
    { id: 'b', text: 'Other record says Nine.' },
  ],
};
const task = {
  id: 't',
  inputs: [
    { id: 'i', text: input.sources[0].text },
    { id: 'j', text: input.sources[1].text },
  ],
  operationPlan: { bindings: { part: { inputId: 'i', start: 0, end: 4 }, whole: { inputId: 'i', start: 8, end: 14 } } },
};
const features = [
  'syllabus',
  'lessonPlans',
  'slideDecks',
  'assignments',
  'rubrics',
  'discussions',
  'quizBank',
  'studyGuides',
  'courseFaq',
];
function fixture() {
  return {
    courseMap: {},
    deliverables: Object.fromEntries(
      features.map((f) => [
        f,
        {
          data: {
            teachingTaskSources: [structuredClone(task)],
            row: { taskId: 't', taskRevision: 'r1' },
            answer: '(9 + 12)/(12 + 48) = 21/60 = 35%',
            transfer: '3/4 = 75%',
            criteria: [{ criterionId: 'counts' }, { criterionId: 'weights' }, { criterionId: 'limits' }],
            contrast: 'partial',
          },
        },
      ]),
    ),
  };
}
const annotations = {
  bindings: {
    t: {
      part: { sourceId: 'a', quote: 'Nine', occurrence: 0 },
      whole: { sourceId: 'a', quote: 'twelve', occurrence: 0 },
    },
  },
  scoring: [{ path: ['rubrics'], requirementIds: ['counts', 'weights', 'limits'] }],
  answers: [
    {
      path: ['assignments', 'answer'],
      equationPattern: '\\(9 \\+ 12\\)/\\(12 \\+ 48\\) = \\d+/\\d+ = [\\d.]+%',
      independentExpression: '(9+12)/(12+48)',
    },
    { path: ['quizBank', 'transfer'], equationPattern: '\\d+/\\d+ = [\\d.]+%', independentExpression: '3/4' },
  ],
  exactValues: [{ id: 'contrast-judgment', path: ['rubrics', 'contrast'], expected: 'partial' }],
};
const failures = (p, extra = {}) => checkClassroomV3Evidence(p, input, annotations, extra).failures.map((f) => f.id);
test('valid evidence checks never imply educational or visual acceptance', () => {
  const result = checkClassroomV3Evidence(fixture(), input, annotations);
  assert.deepEqual(result.failures, []);
  assert.equal(result.educationalAcceptance, 'pending');
  assert.equal(result.coverage.visualReview, 'pending');
});
test('independent arithmetic supports weighted expressions and rejects unsafe/invalid text', () => {
  assert.equal(arithmetic('(9+12)/(12+48)'), 0.35);
  assert.ok(Math.abs(arithmetic('(1/5)*75%+(4/5)*25%') - 0.35) < 1e-12);
  assert.equal(arithmetic('1-(39/60)'), 0.35);
  assert.equal(arithmetic('-2+3*4'), 10);
  for (const text of ['1/0', '1..', '2(3)', '1;process.exit()', 'Math.random()', '(2+3', 'NaN'])
    assert.throws(() => arithmetic(text));
});
const faults = [
  [
    'fabricated displayed evidence',
    (p) => (p.deliverables.assignments.data.sourceEvidenceBrief = { claims: ['Invented quotation.'] }),
    'displayed-source-verbatim',
  ],
  [
    'wrong denominator or answer',
    (p) => (p.deliverables.assignments.data.answer = '(9 + 12)/(12 + 48) = 21/48 = 43.75%'),
    'independent-answer-calculation',
  ],
  [
    'fabricated source',
    (p) => (p.deliverables.assignments.data.teachingTaskSources[0].inputs[0].text += ' invented fact'),
    'source-verbatim',
  ],
  [
    'wrong source attribution',
    (p) =>
      (p.deliverables.assignments.data.teachingTaskSources[0].operationPlan.bindings.part = {
        inputId: 'j',
        start: 18,
        end: 22,
      }),
    'source-role-attribution',
  ],
  [
    'wrong occurrence of repeated count',
    (p) =>
      (p.deliverables.assignments.data.teachingTaskSources[0].operationPlan.bindings.whole = {
        inputId: 'i',
        start: 16,
        end: 22,
      }),
    'source-role-occurrence',
  ],
  ['omitted scoring requirement', (p) => p.deliverables.rubrics.data.criteria.pop(), 'scoring-coverage'],
  [
    'unassigned scoring requirement',
    (p) => p.deliverables.rubrics.data.criteria.push({ criterionId: 'new-experiment' }),
    'scoring-coverage',
  ],
  ['wrong contrast judgment', (p) => (p.deliverables.rubrics.data.contrast = 'complete'), 'contrast-judgment'],
  ['stale material', (p) => (p.deliverables.slideDecks.data.row.taskRevision = 'old'), 'material-revision-consistency'],
  [
    'main result contaminates transfer',
    (p) => (p.deliverables.quizBank.data.transfer = '21/60 = 35%'),
    'independent-answer-calculation',
  ],
  [
    'missing task source copy',
    (p) => (p.deliverables.courseFaq.data.teachingTaskSources = []),
    'shared-source-coverage',
  ],
  [
    'omitted reviewed role',
    (p) => delete p.deliverables.assignments.data.teachingTaskSources[0].operationPlan.bindings.part,
    'reviewed-binding-present',
  ],
];
for (const [name, mutate, code] of faults)
  test(`fault injection: ${name}`, () => {
    const p = fixture();
    mutate(p);
    assert.ok(failures(p).includes(code));
  });
test('fault injections: teacher loss, stale preview commit, student answer leak', () => {
  const extra = {
    transitions: [
      {
        id: 'edit',
        before: { note: 'teacher note' },
        after: { note: 'model replacement' },
        preservePaths: [['note']],
        applied: true,
        previewRevision: 'r1',
        currentRevision: 'r2',
      },
    ],
    studentExports: [
      { name: 'student.pdf', text: 'Question. Teacher key: 35%.', teacherOnlyText: ['Teacher key: 35%.'] },
    ],
  };
  for (const id of ['teacher-content-preserved', 'stale-preview-rejected', 'student-answer-isolation'])
    assert.ok(failures(fixture(), extra).includes(id));
});
test('missing evidence and incomplete annotations are not silently accepted', () => {
  const result = checkClassroomV3Evidence({}, input);
  assert.ok(result.failures.length);
  assert.equal(result.coverage.answers, 'pending');
  const a = structuredClone(annotations);
  a.answers[0].path = ['missing'];
  assert.ok(
    checkClassroomV3Evidence(fixture(), input, a).failures.some((f) => f.id === 'independent-answer-calculation'),
  );
});
