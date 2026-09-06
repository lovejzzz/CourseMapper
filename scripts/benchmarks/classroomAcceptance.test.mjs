import test from 'node:test';
import assert from 'node:assert/strict';
import { ACCEPTANCE_FEATURES, evaluateAcceptanceOutputs } from './classroomAcceptance.mjs';

const fixture = { sources: ['Two of five observed devices pass.'], sessionMinutes: 15, expected: { result: '40%' } };
function sample() {
  const bands = {
    exemplary: 'Labels part and whole and explains the observation.',
    proficient: 'Labels part and whole.',
    developing: 'Gives an unlabeled fraction.',
    beginning: 'Reverses part and whole.',
  };
  const criteria = ['Count', 'Calculate', 'Interpret'].map((label, index) => ({
    label,
    points: index === 0 ? 4 : 3,
    levels: bands,
  }));
  const transfer = {
    id: 't:transfer',
    kind: 'independent-transfer',
    sources: ['Three of eight different devices pass.'],
    question: 'Calculate and interpret the second record.',
    answer: '37.5% of these observed devices.',
    rubric: criteria.map((entry) => ({ label: entry.label, ...bands })),
  };
  const task = {
    id: 't',
    inputs: fixture.sources.map((text) => ({ text })),
    criteria,
    question: 'Calculate the observed proportion.',
    answer: '40% of these observed devices.',
    sequence: [transfer],
  };
  const record = { taskId: 't', sourceEvidenceBrief: { claims: fixture.sources } };
  const scoring = criteria.map((entry) => ({ criterion: entry.label, points: entry.points, ...entry.levels }));
  const outputs = Object.fromEntries(ACCEPTANCE_FEATURES.map((feature) => [feature, {}]));
  outputs.assignments = {
    assignments: [
      {
        ...record,
        weightPercent: null,
        weightedGradingCriteria: scoring,
        anchorExampleSet: { strongSample: task.answer },
      },
    ],
  };
  outputs.rubrics = { rubrics: [{ ...record, totalPoints: 10, criteria: scoring }] };
  outputs.studyGuides = {
    studyGuides: [
      {
        ...record,
        reviewQuestions: [{ practiceId: transfer.id, question: transfer.question, answer: transfer.answer }],
      },
    ],
  };
  outputs.quizBank = { quizzes: [{ questions: [{ practiceId: transfer.id, sampleAnswer: transfer.answer }] }] };
  outputs.lessonPlans = {
    lessonPlans: [{ ...record, duration: '15 minutes', outline: [{ time: '5 minutes' }, { time: '10 minutes' }] }],
  };
  outputs.slideDecks = {
    decks: [
      {
        totalSlides: 2,
        slides: [
          { taskRole: 'worked:0', title: 'The reasoning', bullets: ['Two divided by five.'] },
          { taskRole: 'activity', title: 'Try a new case', bullets: [transfer.question] },
        ],
      },
    ],
  };
  return { outputs, tasks: [task] };
}
const evaluate = (sample) => evaluateAcceptanceOutputs(fixture, sample.outputs, sample.tasks);
const failed = (sample, id) => evaluate(sample).checks.some((check) => check.id === id && check.status === 'fail');
test('has one clean synthetic control and detects missing actual materials despite a perfect quality badge', () => {
  assert.deepEqual(evaluate(sample()).failures, []);
  const result = evaluateAcceptanceOutputs(fixture, { qualityScore: 100 }, []);
  assert.equal(result.checks.filter((check) => check.id === 'material-present' && check.status === 'fail').length, 10);
});
test('detects changed source quotations and keys independently of product receipts', () => {
  const s = sample();
  s.outputs.assignments.assignments[0].sourceEvidenceBrief = { claims: ['Three of five devices pass.'] };
  s.outputs.assignments.assignments[0].anchorExampleSet.strongSample = '60%';
  assert.equal(failed(s, 'retained-source-record'), true);
  assert.equal(failed(s, 'reference-answer-sync'), true);
});
test('detects a missing or stale independent assessment while the taught task remains correct', () => {
  const s = sample();
  s.outputs.quizBank.quizzes[0].questions[0].sampleAnswer = '40%';
  assert.equal(failed(s, 'independent-key-sync'), true);
});
test('detects copied rubric bands, mismatched criteria and points', () => {
  const s = sample();
  s.tasks[0].criteria[0].levels.proficient = s.tasks[0].criteria[0].levels.exemplary;
  s.outputs.rubrics.rubrics[0].criteria = structuredClone(s.outputs.rubrics.rubrics[0].criteria);
  s.outputs.rubrics.rubrics[0].criteria[0].points = 8;
  assert.equal(failed(s, 'discriminating-task-bands'), true);
  assert.equal(failed(s, 'assessment-criteria-sync'), true);
  assert.equal(failed(s, 'point-total'), true);
});
test('detects invented grade policy and an overbooked class clock', () => {
  const s = sample();
  s.outputs.assignments.assignments[0].weightPercent = 100;
  s.outputs.lessonPlans.lessonPlans[0].outline[1].time = '20 minutes';
  assert.equal(failed(s, 'no-invented-course-weight'), true);
  assert.equal(failed(s, 'class-clock'), true);
});
test('detects misplaced reasoning and actual slide crowding', () => {
  const s = sample();
  s.outputs.slideDecks.decks[0].slides.reverse();
  s.outputs.slideDecks.decks[0].slides[0].bullets = ['long '.repeat(130)];
  assert.equal(failed(s, 'reasoning-before-practice'), true);
  assert.equal(failed(s, 'visible-density'), true);
});
