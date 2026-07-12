import { describe, expect, it } from 'vitest';

import {
  buildQuizDepthFindings,
  extractMultipleChoiceQuizStems,
  extractMultipleChoiceQuizItems,
  extractShortAnswerQuizItems,
  isAppliedQuizStem,
  isClaimEvidenceBoundaryShortAnswer,
  isConceptCuedCompilerShortAnswer,
  summarizeAppliedQuizDepth,
  summarizeConstructedResponseDepth,
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

const appliedDisciplineStems = [
  'A musician is reading music written in the Bass Clef and observes a note on the second line from the bottom. What pitch is this note?',
  'Examine the provided staff excerpt with the Treble Clef; if a note is positioned on the third ledger line below the staff, what is its approximate pitch relative to Middle C?',
  "Evaluate the claim: 'The staff lines define the absolute pitch of every note.' Refer to the provided score excerpt. Based on this evidence, is the claim true?",
  "Evaluate the claim: 'The staff lines define the absolute pitch of every note.' Examine the provided score excerpt before choosing.",
  "Given the score excerpt showing the Treble Clef and ledger lines, evaluate: 'The staff lines define the absolute pitch of every note.'",
];

const appliedOutcomeStems = [
  "A designer creates a persona for 'Frugal Traveler' but ignores evidence that the group prefers budget apps. What is the most likely outcome?",
  'A contrast checker reports a 2.5:1 ratio on the primary button against a light-red background. What is the likely impact on accessibility?',
  'Users spend over three minutes finding a handbook in a 50-category portal. What is the primary risk of keeping this flat structure?',
  "A researcher asks, 'Do you think this button is too hard to use?' What is the primary flaw in this question?",
  "A facilitator creates a theme called 'Users Hate the App' from 50 interview quotes. Why is this invalid synthesis?",
  'A team stops collecting interviews after every new session repeats the same frustration pattern. What concept justifies stopping data collection?',
  'A designer creates hover-only navigation with no keyboard focus indicator. Which usability heuristic is violated by this behavior?',
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
    for (const stem of appliedDisciplineStems) expect(isAppliedQuizStem(stem), stem).toBe(true);
    for (const stem of appliedOutcomeStems) expect(isAppliedQuizStem(stem), stem).toBe(true);
    expect(isAppliedQuizStem('Which clef establishes the pitch reference point for a staff?')).toBe(false);
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

  it('distinguishes concept-cued compiler frames from claim-evidence-boundary tasks', () => {
    const oldFrame =
      'A participant pauses twice at checkout. Using Contextual Inquiry, analyze what this evidence shows and justify your conclusion.';
    const boundedTask =
      'A participant pauses twice at checkout and asks for help. Without assuming a hidden cause, identify the most relevant course method, state the best-supported conclusion, cite two case details, and name one limitation or next piece of evidence.';
    expect(isConceptCuedCompilerShortAnswer(oldFrame)).toBe(true);
    expect(isClaimEvidenceBoundaryShortAnswer(oldFrame)).toBe(false);
    expect(isConceptCuedCompilerShortAnswer(boundedTask)).toBe(false);
    expect(isClaimEvidenceBoundaryShortAnswer(boundedTask)).toBe(true);
  });

  it('extracts and summarizes short-answer reasoning depth', () => {
    const files = [
      {
        paragraphs: [
          'Q1 (Short answer, 4 pts, ~5 min): A participant pauses twice. Use Contextual Inquiry to interpret the evidence and defend a conclusion.',
          'Q2 (Short answer, 4 pts, ~5 min): A participant pauses twice and asks for help. Identify the most relevant method, cite two case details, and name one limitation or next piece of evidence.',
        ],
      },
    ];
    expect(extractShortAnswerQuizItems(files[0].paragraphs)).toHaveLength(2);
    expect(summarizeConstructedResponseDepth(files)).toMatchObject({
      total: 2,
      conceptCued: 1,
      claimEvidenceBoundary: 1,
    });
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
