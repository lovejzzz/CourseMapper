import { expect, it } from 'vitest';
import { buildCourseBlueprint, buildQuizAtomsForLesson } from '../courseBlueprintCompiler.js';
import { deliverablePdfDefinition, classroomPdfDefinition } from '../exporters/classroomPdf.js';

it('keeps a heading, misconception and its feedback together without swallowing a forced page break', () => {
  const content = classroomPdfDefinition(
    [
      { text: 'Misconceptions', _keepNext: true },
      { text: 'Wrong event date', _keepNext: true },
      { text: 'Check the recording role' },
      { text: 'Answer key', pageBreak: 'before' },
    ],
    'Course',
    'Guide',
  ).content;
  expect(content[0].unbreakable).toBe(true);
  expect(content[0].stack.map((node) => node.text)).toEqual([
    'Misconceptions',
    'Wrong event date',
    'Check the recording role',
  ]);
  expect(content[1].pageBreak).toBe('before');
});

function textOf(node) {
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (!node || typeof node !== 'object') return '';
  return textOf(node.text || node.stack || node.ul || '');
}
function paper(data) {
  return deliverablePdfDefinition('quizBank', data, 'Practice review').content.map(textOf);
}

it('provides response space without leaking the key and scopes mixed purposes to the correct questions', () => {
  const content = paper({
    quizzes: [
      {
        lessonTitle: 'One lesson',
        questions: [
          {
            type: 'short_answer',
            question: 'Interpret a new record.',
            answer: 'PRIVATE INDEPENDENT KEY',
            practiceKind: 'independent-transfer',
            intendedUse: 'Use the new record independently.',
            points: 4,
          },
          {
            type: 'short_answer',
            question: 'Revisit the taught record.',
            answer: 'PRIVATE REHEARSAL KEY',
            practiceKind: 'task-rehearsal',
            intendedUse: 'Rehearse the taught record.',
            points: 20,
          },
          {
            type: 'short_answer',
            question: 'Submit a revised response.',
            answer: 'PRIVATE RETRY KEY',
            practiceKind: 'feedback-retry',
            intendedUse: 'Rehearse the taught record.',
            points: 0,
          },
          {
            type: 'multiple_choice',
            question: 'Select the unit.',
            options: ['A. seats', 'B. days'],
            answer: 'A',
            points: 1,
          },
        ],
      },
    ],
  });
  const keyAt = content.findIndex((text) => text.includes('Answer Key'));
  expect(keyAt).toBeGreaterThan(0);
  const student = content.slice(0, keyAt).join('\n');
  expect(student).not.toContain('PRIVATE');
  for (const prompt of ['Interpret a new record.', 'Revisit the taught record.', 'Submit a revised response.']) {
    const start = content.findIndex((text) => text.includes(prompt));
    const nextPrompt = content.findIndex((text, index) => index > start && /Q\d/.test(text));
    expect(content.slice(start, nextPrompt).join('\n')).toContain('________');
  }
  const choiceAt = content.findIndex((text) => text.includes('Select the unit.'));
  expect(content.slice(choiceAt, keyAt).join('\n')).not.toContain('________');
  expect(student).toContain('Independent response: new case');
  expect(student).toContain('Rehearsal: taught case');
  expect(student).toContain('Retry after feedback');
  expect(student).toContain('0 pts');
  const teacher = content.slice(keyAt).join('\n');
  expect(teacher).toContain('Instructor use (Q1): Use the new record independently.');
  expect(teacher).toContain('Instructor use (Q2, Q3): Rehearse the taught record.');
  expect(teacher).toContain('PRIVATE INDEPENDENT KEY');
});

it('gives a reviewed multipart response more space even when its saved budget is zero', () => {
  const render = (parts) =>
    paper({
      teachingTaskSources: [
        {
          id: 'reviewed-task',
          operationPlan: {
            version: 2,
            requirements: Array.from({ length: parts }, (_, index) => ({ id: `part-${index}` })),
          },
        },
      ],
      quizzes: [
        {
          practiceRecord: { taskId: 'reviewed-task' },
          lessonTitle: 'Multipart response',
          questions: [
            {
              type: 'short_answer',
              practiceKind: 'independent-transfer',
              points: 0,
              question: 'Respond to each part.',
              answer: 'PRIVATE KEY',
            },
          ],
        },
      ],
    });
  const lines = (content) => content.filter((text) => text.includes('________')).length;
  expect(lines(render(5))).toBeGreaterThan(lines(render(1)));
  expect(render(5).join('\n')).toContain('0 pts');
  const writingBlocks = render(5).filter((text) => text.includes('________'));
  expect(writingBlocks.length).toBe(5);
  for (const block of writingBlocks) expect(block).toContain('Q1 — Response:');
});

it('keeps fabricated practice scaffolds under review when no specific answer was authored', () => {
  const blueprint = buildCourseBlueprint({
    courseName: 'Chronology evidence',
    lessons: [
      {
        title: 'Source dates',
        sections: [
          {
            topicSection: 'Event and reporting dates',
            learningObjectives: 'Distinguish an event date from a later report.',
            supportingResources: 'The supplied letter and interview.',
          },
        ],
      },
    ],
  });
  const lesson = blueprint.lessons[0];
  lesson.enrichment = {};
  lesson.evidencePlan = { ...lesson.evidencePlan, sourceCue: 'Course-created chronology practice record' };
  blueprint.enrichment = { coverage: { missingLessons: [lesson.lessonNumber] } };
  blueprint.instructionalIntentGraph = {
    evidenceRecoveryAuthorization: { status: 'authorized', lessonNumbers: [lesson.lessonNumber] },
  };
  const items = buildQuizAtomsForLesson(lesson, blueprint, { assessment: {} });
  const recovery = items.filter((item) => item.enrichmentSource === 'compiler-created-practice-recovery');
  expect(recovery.length).toBeGreaterThan(0);
  expect(recovery.every((item) => item.sourceReviewRequired === true)).toBe(true);
  const printed = paper({ quizzes: [{ lessonTitle: 'Unsolved practice', questions: recovery }] }).join('\n');
  expect(printed).toContain('Teacher review required');
});

it('prints the actual source list for a source-ledger fallback and still requires a specific reviewed key', () => {
  const facts = [
    'Letter: Completed yesterday, written 18 August; no year is supplied.',
    'Interview: Recorded 4 October, recalling installation in August.',
    'Limit: The first successful operation date is unknown.',
  ];
  const blueprint = buildCourseBlueprint(
    {
      courseName: 'Source chronology',
      lessons: [{ title: 'Dates', sections: [{ learningObjectives: 'Compare event and reporting dates.' }] }],
    },
    { instructorProvidedFacts: facts },
  );
  const lesson = blueprint.lessons[0];
  lesson.enrichment = {};
  blueprint.enrichment = { coverage: { missingLessons: [lesson.lessonNumber] } };
  const items = buildQuizAtomsForLesson(lesson, blueprint, { assessment: {} });
  expect(items.every((item) => item.enrichmentSource === 'compiler-exact-source-ledger')).toBe(true);
  expect(items.every((item) => item.sourceReviewRequired)).toBe(true);
  expect(items[0].practiceRecord.records).toEqual(facts);
  const content = paper({
    quizzes: [{ lessonTitle: 'Source chronology', practiceRecord: items[0].practiceRecord, questions: items }],
  });
  const student = content
    .slice(
      0,
      content.findIndex((text) => text.includes('Answer Key')),
    )
    .join('\n');
  for (const fact of facts) expect(student).toContain(fact);
});

it('renders readable question-type tags in the actual Word key without changing topic tags', async () => {
  const { buildDeliverableDocxBlob } = await import('../exporters/bulkDocxExporter.js');
  const { default: JSZip } = await import('jszip');
  const blob = await buildDeliverableDocxBlob(
    'quizBank',
    {
      quizzes: [
        {
          lessonTitle: 'Evidence',
          questions: [
            {
              type: 'short_answer',
              question: 'Name the observer.',
              answer: 'Sora',
              tags: ['short_answer', 'multiple_choice', 'Record provenance'],
            },
          ],
        },
      ],
    },
    'Evidence course',
  );
  const archive = await JSZip.loadAsync(await blob.arrayBuffer());
  const xml = await archive.file('word/document.xml').async('string');
  expect(xml).toContain('Short answer, Multiple choice, Record provenance');
  expect(xml).not.toContain('short_answer');
  expect(xml).not.toContain('multiple_choice');
});
