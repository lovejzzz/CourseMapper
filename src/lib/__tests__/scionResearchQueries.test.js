import { expect, it } from 'vitest';
import { researchQuestionVariantsForLesson, researchTopicForLesson } from '../algiKernelComposer.js';

it('does not spend the recovery query budget on generated teaching boilerplate', () => {
  const questions = researchQuestionVariantsForLesson(
    'Working with APIs',
    {
      topics: ['HTTP Request Protocols', 'Data Serialization Formats'],
      objectives: ['Test the reasoning step: revise any claim that reaches beyond the record; weekly build labs.'],
      evidenceIntent: [
        'Worked example: state what it warrants; Check that the HTTP Request Protocols resource aligns; Use a guided case.',
      ],
    },
    { courseContext: 'Full-Stack Web Development' },
  );
  expect(questions).toContain('Working with APIs');
  expect(questions).toContain('HTTP Request Protocols');
  expect(questions.join(' ')).not.toMatch(
    /worked example|test the reasoning|weekly build labs|state what it warrants|guided case|check that/i,
  );
});

it('researches the subject instead of generic exercise packaging', () => {
  expect(
    researchTopicForLesson({
      title: 'Semantic HTML and Accessible Forms',
      topics: ['1.1: Runnable Starter Files', '1.2: Reference Implementations', '1.3: Observable Acceptance Checks'],
    }),
  ).toBe('Semantic HTML and Accessible Forms');
  expect(researchTopicForLesson({ title: 'Responsive Layouts', topics: ['1.1: CSS Grid'] })).toContain('CSS Grid');
});

it('uses a bounded subject phrase on recovery without reducing relevance checks', () => {
  const queries = researchQuestionVariantsForLesson('Responsive CSS Grid Layouts', {
    topics: ['2.1: CSS Grid Mechanism', '2.2: Layout Adaptation Techniques'],
  });
  expect(queries).toContain('CSS Grid');
  expect(queries).toContain('Responsive CSS Grid Layouts');
  expect(queries.length).toBeLessThanOrEqual(5);
});
