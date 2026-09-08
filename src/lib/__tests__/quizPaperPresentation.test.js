import { expect, it } from 'vitest';
import { deliverablePdfDefinition } from '../exporters/classroomPdf.js';

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
});
