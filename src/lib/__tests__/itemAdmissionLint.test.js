import { describe, expect, it } from 'vitest';
import {
  hasClangAssociationCue,
  hasGrammaticalCue,
  hasLongestOptionCue,
  hasUnsupportedAbsenceInference,
  hasUnsupportedBehaviorInference,
  hasUnsupportedCausalInference,
  lintItemAdmission,
} from '../itemAdmissionLint.js';
import { lintEnrichedQuizItem } from '../blueprintEnrichmentPass.js';

const CLEAN_ITEM = {
  question: 'Which process explains why increasing atmospheric CO2 raises global mean surface temperature?',
  options: [
    'Absorption and re-emission of outgoing longwave radiation by greenhouse gases',
    'Increased reflection of incoming sunlight by a thicker atmosphere',
    'Direct heating of the air by CO2 chemical reactions',
    'Reduction of the ozone layer allowing more ultraviolet light through',
  ],
  answerIndex: 0,
};

describe('itemAdmissionLint (test-wiseness battery)', () => {
  it('passes a clean, homogeneous item', () => {
    expect(lintItemAdmission(CLEAN_ITEM)).toEqual([]);
  });

  it('flags clang association when the key echoes the stem and distractors do not', () => {
    const item = {
      question: 'Which mechanism best describes photosynthesis converting light energy into chemical energy storage?',
      options: [
        'Photosynthesis converts light energy into chemical energy stored in glucose',
        'Cells burn oxygen to release heat',
        'Roots absorb minerals from soil',
        'Water evaporates from leaf surfaces',
      ],
      answerIndex: 0,
    };
    expect(hasClangAssociationCue(item)).toBe(true);
    expect(lintItemAdmission(item)).toContain('clang-association-cue');
  });

  it('flags the grammatical article cue only when the key uniquely fits', () => {
    // Key starts with a vowel LETTER and matches the trailing "an"; distractors
    // start with consonants, so the article gives the answer away.
    const cued = {
      question: 'The cellular structure that packages and ships proteins is an',
      options: ['endomembrane complex', 'ribosome', 'lysosome', 'centriole'],
      answerIndex: 0,
    };
    expect(hasGrammaticalCue(cued)).toBe(true);

    // Every option starts with a vowel — the article fits all, so no cue.
    const allFit = {
      question: 'The cellular structure that packages and ships proteins is an',
      options: ['endomembrane complex', 'aqueous vesicle', 'inner organelle', 'outer envelope'],
      answerIndex: 0,
    };
    expect(hasGrammaticalCue(allFit)).toBe(false);

    const noArticle = { ...cued, question: 'Which structure packages and ships proteins?' };
    expect(hasGrammaticalCue(noArticle)).toBe(false);
  });

  it('flags the longest-option cue when the key dwarfs every distractor', () => {
    const item = {
      question: 'What is the primary function of the cell membrane in living organisms?',
      options: [
        'It selectively regulates which molecules enter and leave the cell while maintaining the internal chemical environment',
        'It stores energy',
        'It makes proteins',
        'It holds the nucleus',
      ],
      answerIndex: 0,
    };
    expect(hasLongestOptionCue(item)).toBe(true);
    expect(lintItemAdmission(item)).toContain('longest-option-cue');
  });

  it('is wired into lintEnrichedQuizItem with the same codes', () => {
    const cued = {
      type: 'multiple_choice',
      question: 'The organelle where aerobic respiration produces most cellular energy is an',
      options: ['oxidative powerhouse', 'ribosome', 'lysosome', 'centriole'],
      answerIndex: 0,
      explanation: 'Aerobic respiration occurs in this organelle, which produces most of the cell ATP supply.',
    };
    expect(lintEnrichedQuizItem(cued, { groundingText: '' })).toContain('grammatical-cue');
  });

  it('rejects causal inference from one ambiguous behavior unless an evidence-limited option is present', () => {
    const unsupported = {
      question: 'A participant laughed during an interview. Which interpretation is most defensible?',
      options: [
        'The participant disliked the researcher',
        'The participant found the task funny',
        'The participant felt uncomfortable',
        'The participant did not take the study seriously',
      ],
      answerIndex: 1,
    };
    expect(hasUnsupportedBehaviorInference(unsupported)).toBe(true);
    expect(lintItemAdmission(unsupported)).toContain('unsupported-behavior-inference');
    expect(lintEnrichedQuizItem(unsupported, { groundingText: '' })).toContain('unsupported-behavior-inference');

    const evidenceLimited = {
      ...unsupported,
      options: [
        ...unsupported.options.slice(0, 3),
        'The behavior has multiple possible explanations; ask the participant',
      ],
      answerIndex: 3,
    };
    expect(hasUnsupportedBehaviorInference(evidenceLimited)).toBe(false);

    const quotedObservation = {
      ...unsupported,
      question:
        'A field note records, “The participant looked at the screen for five seconds.” What does this suggest?',
    };
    expect(hasUnsupportedBehaviorInference(quotedObservation)).toBe(true);

    const corroborated = {
      ...unsupported,
      question:
        'A participant laughed, then explained that the unexpected label was funny. Which interpretation is most defensible?',
    };
    expect(hasUnsupportedBehaviorInference(corroborated)).toBe(false);
  });

  it('rejects unexplained causal guesses from outcome metrics', () => {
    const unsupported = {
      question:
        'A usability study reports a 95% task completion rate but a 30% error rate. Which flawed method likely contributed to the high error rate?',
      options: ['A long tutorial', 'Tasks were too complex', 'A noisy room', 'No think-aloud protocol'],
      answerIndex: 1,
    };
    expect(hasUnsupportedCausalInference(unsupported)).toBe(true);
    expect(lintItemAdmission(unsupported)).toContain('unsupported-causal-inference');

    const supported = {
      ...unsupported,
      question:
        'A usability study reports a 30% error rate when participants receive multi-part tasks with no practice. Which method likely caused the errors?',
    };
    expect(hasUnsupportedCausalInference(supported)).toBe(false);
  });

  it('rejects an absence-of-use overclaim when the key invents missed observations', () => {
    const unsupported = {
      question:
        'A researcher concludes that because all observed users avoided the search bar, it is unnecessary. Why is this method flawed?',
      options: [
        'The sample was too large',
        'The observation missed users who actually used the search bar',
        'The search bar looked decorative',
        'The participants were students',
      ],
      answerIndex: 1,
      explanation: 'Missing users who used the bar shows sampling bias.',
    };
    expect(hasUnsupportedAbsenceInference(unsupported)).toBe(true);
    expect(lintItemAdmission(unsupported)).toContain('unsupported-absence-inference');
    const supported = {
      ...unsupported,
      options: [
        ...unsupported.options.slice(0, 1),
        'Avoidance does not prove the search bar is unnecessary',
        ...unsupported.options.slice(2),
      ],
      explanation: 'Absence of use in one observation cannot establish that the feature is unnecessary.',
    };
    expect(hasUnsupportedAbsenceInference(supported)).toBe(false);
  });
});
