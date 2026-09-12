import { expect, it } from 'vitest';
import { researchQuestionVariantsForLesson } from '../algiKernelComposer.js';

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
