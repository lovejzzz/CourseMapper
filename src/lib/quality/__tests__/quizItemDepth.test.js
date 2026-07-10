import { describe, expect, it } from 'vitest';

import {
  buildQuizDepthFindings,
  extractMultipleChoiceQuizStems,
  extractMultipleChoiceQuizItems,
  isAppliedQuizStem,
  summarizeAppliedQuizDepth,
  summarizeUnsupportedQuizInferences,
} from '../quizItemDepth.js';

const shallowScionStems = [
  'Which element is NOT typically part of a contextual inquiry?',
  'Think-aloud protocols are best used when?',
  'Elicitation techniques aim to:',
  'Which is a primary benefit of combining observation and interview?',
];

const appliedLunaStems = [
  'A participant says the confirmation message was clear, but the recording shows them reopening the same screen twice. Which conclusion is best supported?',
  'A researcher records that a shopper paused at a price tag, then quotes the shopper comparing unit costs. Which interpretation best fits both observations?',
  'A team keeps every scripted question but ignores unexpected behavior in the field notes. What issue most clearly weakens the method?',
];

const appliedCompilerStems = [
  'A student is preparing a mineral identification worksheet. Which action best applies streak evidence before submission?',
  'In the field-site scenario, which approach best applies igneous texture evidence to strengthen the specimen analysis?',
  'Which use of evidence best supports a claim about metamorphic grade in the field artifact?',
];

describe('quiz item depth', () => {
  it('extracts only multiple-choice stems from rendered quiz paragraphs', () => {
    const paragraphs = [
      `Q1 (Multiple choice, 2 pts, ~2 min): ${appliedLunaStems[0]}`,
      'A. Ask another general question',
      'Q2 (Short answer, 4 pts, ~5 min): Explain your reasoning.',
    ];
    expect(extractMultipleChoiceQuizStems(paragraphs)).toEqual([appliedLunaStems[0]]);
    expect(extractMultipleChoiceQuizItems(paragraphs)).toEqual([
      { question: appliedLunaStems[0], options: ['Ask another general question'] },
    ]);
  });

  it('distinguishes evidence-based judgment from recall wearing a Bloom label', () => {
    for (const stem of shallowScionStems) expect(isAppliedQuizStem(stem), stem).toBe(false);
    for (const stem of appliedLunaStems) expect(isAppliedQuizStem(stem), stem).toBe(true);
    for (const stem of appliedCompilerStems) expect(isAppliedQuizStem(stem), stem).toBe(true);
  });

  it('summarizes package-level applied share from rendered paragraphs', () => {
    const stems = [...appliedLunaStems, ...shallowScionStems];
    const files = [
      {
        paragraphs: stems.map((stem, index) => `Q${index + 1} (Multiple choice, 2 pts, ~2 min): ${stem}`),
      },
    ];
    expect(summarizeAppliedQuizDepth(files)).toMatchObject({ total: 7, applied: 3 });
  });

  it('counts unsupported single-behavior inferences from rendered items', () => {
    const files = [
      {
        paragraphs: [
          'Q1 (Multiple choice, 2 pts, ~2 min): A participant laughed during an interview. Which interpretation is most defensible?',
          'A. The participant disliked the researcher',
          'B. The participant found the task funny',
          'C. The participant felt uncomfortable',
          'D. The participant did not take the study seriously',
          'Q2 (Multiple choice, 2 pts, ~2 min): A participant laughed, then said the unexpected label was funny. Which interpretation is most defensible?',
          'A. The label prompted the laugh',
          'B. The researcher caused discomfort',
          'C. The task was too easy',
          'D. The participant was disengaged',
        ],
      },
    ];
    expect(summarizeUnsupportedQuizInferences(files)).toMatchObject({ total: 2, risky: 1 });
  });

  it('turns package-level depth into normal grader findings', () => {
    const files = Array.from({ length: 3 }, () => ({
      paragraphs: shallowScionStems.map((stem, index) => `Q${index + 1} (Multiple choice, 2 pts, ~2 min): ${stem}`),
    }));
    expect(buildQuizDepthFindings(files)).toEqual([
      expect.objectContaining({ severity: 'P1', dimension: 'substance', file: 'quizBank' }),
    ]);
  });
});
