import { expect, it } from 'vitest';
import { completeCourse, draft } from './fixtures';
import { pedagogyPrompt, reviewPassages } from '../pedagogy';

it('shows the critic the exit-ticket data and maps short passage IDs without duplicating structured answers', () => {
  const lesson = draft();
  lesson.exitTicket.datasets = [
    { id: 'transfer', label: 'Exit-only sample', kind: 'observations', values: [2, 9, 11] },
  ];
  lesson.activities[0].answerParts = [{ title: 'Reasoning', text: 'Canonical structured answer.', length: null }];
  lesson.activities[0].answer = 'Canonical structured answer.';
  const prompt = pedagogyPrompt(lesson, completeCourse());
  expect(prompt).toContain('"component":"exitTicket","datasets":[{"id":"transfer"');
  expect(prompt).toContain('"values":[2,9,11]');
  const passages = reviewPassages(lesson);
  expect(passages.every((passage) => /^p\d+$/.test(passage.passageId))).toBe(true);
  expect(passages.filter((passage) => passage.text === 'Canonical structured answer.')).toHaveLength(1);
});
