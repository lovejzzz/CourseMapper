import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateClassroomOutputs, FEATURES } from './classroomBenchmark.mjs';

const fixture = {
  map: { lessons: [{}] },
  sourceBrief: 'A single 30-minute lesson using supplied observations.',
  sessionMinutes: 30,
  expectations: {
    singleSession: true,
    selfContained: true,
    arithmetic: { fraction: '3/8', decimal: '0.375', percent: '37.5' },
  },
};
const example = {
  result: '3/8 = 0.375 = 37.5%.',
  steps: ['Divide three by eight.', 'Multiply by 100.'],
  verification: { numerator: '3', denominator: '8', decimal: '0.375', percent: '37.5' },
};
function sample() {
  return {
    courseMap: {
      lessons: [
        { title: 'Observed proportions', sections: [{ learningObjectives: 'Calculate and interpret a proportion.' }] },
      ],
    },
    lessonPlans: {
      lessonPlans: [
        {
          duration: '30 minutes',
          outline: [{ time: '10 minutes' }, { time: '20 minutes' }],
          workedExample: structuredClone(example),
          formativeCheck: { practiceId: 'p', expectedAnswer: '37.5%' },
        },
      ],
    },
    studyGuides: {
      studyGuides: [
        {
          workedExample: structuredClone(example),
          reviewQuestions: [{ practiceId: 'p', question: 'Calculate the percentage.', answer: '37.5%' }],
        },
      ],
    },
    quizBank: {
      quizzes: [
        {
          questions: [
            {
              type: 'multiple_choice',
              question: 'Choose the observed percentage.',
              options: ['A. 3.75%', 'B. 37.5%'],
              answer: 'B',
            },
            { type: 'short_answer', question: 'Write the percentage.', answer: '37.5%' },
          ],
        },
      ],
    },
    rubrics: { rubrics: [{ totalPoints: 10, criteria: [{ points: 10 }] }] },
    slideDecks: {
      decks: [
        {
          slides: [
            {
              title: 'Compare part and whole',
              bullets: ['Three of eight learners.'],
              notes: 'Ask learners to identify which number describes the whole.',
            },
          ],
        },
      ],
    },
  };
}
const probe = (outputs, feature, id) =>
  evaluateClassroomOutputs(fixture, outputs).checks.find((c) => c.feature === feature && c.id === id).status;
test('covers every deliverable and cannot turn an absent artifact into a pass with quality metadata', () => {
  const r = evaluateClassroomOutputs(fixture, { qualityScore: 100, receipt: { status: 'ready' } });
  assert.deepEqual(
    r.summary.map((s) => s.feature),
    FEATURES,
  );
  assert.equal(r.checks.filter((c) => c.id === 'material-present' && c.status === 'fail').length, 10);
});
test('accepts actual letter keys and short numeric answers, then detects an invalid key and duplicated options', () => {
  const o = sample();
  assert.equal(probe(o, 'quizBank', 'answered-items'), 'pass');
  o.quizBank.quizzes[0].questions[0].answer = 'Z';
  assert.equal(probe(o, 'quizBank', 'answered-items'), 'fail');
  o.quizBank.quizzes[0].questions[0].answer = 'B';
  o.quizBank.quizzes[0].questions[0].options = ['A. 37.5%', 'B. 37.5%'];
  assert.equal(probe(o, 'quizBank', 'answered-items'), 'fail');
});
test('checks the displayed result, even when stale verification metadata claims it is correct', () => {
  const o = sample();
  assert.equal(probe(o, 'studyGuides', 'numeric-oracle'), 'pass');
  o.studyGuides.studyGuides[0].workedExample.result = '3/8 = 0.375 = 3.75%.';
  assert.equal(probe(o, 'studyGuides', 'numeric-oracle'), 'fail');
});
test('does not mistake a calculation topic label for a question that requires calculation', () => {
  const o = sample();
  o.quizBank.quizzes[0].questions = [
    { question: 'Why does Worked calculation 3/8 matter?', answer: 'The source mentions 37.5%.' },
  ];
  assert.equal(probe(o, 'quizBank', 'calculation-objective-tested'), 'fail');
  o.quizBank.quizzes[0].questions = [{ question: 'Calculate 3/8 as a percentage.', answer: '37.5%.' }];
  assert.equal(probe(o, 'quizBank', 'calculation-objective-tested'), 'pass');
});
test('detects missing reference answers and broken teacher/student agreement', () => {
  const o = sample();
  assert.equal(probe(o, 'lessonPlans', 'student-teacher-answer-sync'), 'pass');
  o.studyGuides.studyGuides[0].reviewQuestions[0].answer = '';
  assert.equal(probe(o, 'studyGuides', 'answerable-self-study'), 'fail');
  assert.equal(probe(o, 'lessonPlans', 'student-teacher-answer-sync'), 'fail');
});
test('detects a changed class clock and broken rubric point total', () => {
  const o = sample();
  assert.equal(probe(o, 'lessonPlans', 'class-clock'), 'pass');
  o.lessonPlans.lessonPlans[0].outline[1].time = '25 minutes';
  assert.equal(probe(o, 'lessonPlans', 'class-clock'), 'fail');
  assert.equal(probe(o, 'rubrics', 'point-total'), 'pass');
  o.rubrics.rubrics[0].criteria[0].points = 20;
  assert.equal(probe(o, 'rubrics', 'point-total'), 'fail');
});
test('flags an unavailable material without flagging supplied material as invented', () => {
  const o = sample();
  o.lessonPlans.lessonPlans[0].materials = ['Compare the two supplied solution paths.'];
  assert.equal(probe(o, 'lessonPlans', 'provided-materials-only'), 'fail');
  const r = evaluateClassroomOutputs(
    { ...fixture, sourceBrief: fixture.sourceBrief + ' Includes two supplied solution paths.' },
    o,
  );
  assert.equal(r.checks.find((c) => c.feature === 'lessonPlans' && c.id === 'provided-materials-only').status, 'pass');
});
test('flags slide crowding from visible text, not verbose hidden receipts', () => {
  const o = sample();
  o.slideDecks.decks[0].sourceGrounding = { text: 'metadata '.repeat(1000) };
  assert.equal(probe(o, 'slideDecks', 'slide-density'), 'pass');
  o.slideDecks.decks[0].slides[0].bullets = ['crowded '.repeat(100)];
  assert.equal(probe(o, 'slideDecks', 'slide-density'), 'fail');
});
