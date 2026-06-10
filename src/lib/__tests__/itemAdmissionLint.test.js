import { describe, expect, it } from 'vitest';
import {
  hasClangAssociationCue,
  hasGrammaticalCue,
  hasLongestOptionCue,
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
});
