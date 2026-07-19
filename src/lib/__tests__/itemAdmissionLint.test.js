import { describe, expect, it } from 'vitest';
import {
  hasAnswerPositionResidue,
  hasClangAssociationCue,
  hasGenerationMarkerResidue,
  hasGrammaticalCue,
  hasInternalSourceIndexResidue,
  hasLongestOptionCue,
  hasRepetitiveExplanation,
  hasUnsupportedAbsenceInference,
  hasUnsupportedBehaviorInference,
  hasUnsupportedCausalInference,
  hasUnsupportedPolicyInference,
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

  it('quarantines leaked generation markers and phrase loops in learner feedback', () => {
    const corrupt = {
      ...CLEAN_ITEM,
      explanation: `ex_reason_1_correct_key_ ${'reasoning_1_correct_key_ '.repeat(8)}`,
    };
    expect(hasGenerationMarkerResidue(corrupt)).toBe(true);
    expect(hasRepetitiveExplanation(corrupt)).toBe(true);
    expect(lintItemAdmission(corrupt)).toEqual(
      expect.arrayContaining(['generation-marker-residue', 'repetitive-explanation']),
    );
    expect(lintEnrichedQuizItem(corrupt, { groundingText: '' })).toEqual(
      expect.arrayContaining(['generation-marker-residue', 'repetitive-explanation']),
    );

    const legitimateEmphasis = {
      ...CLEAN_ITEM,
      explanation: 'Check the evidence, compare the alternatives, and check the final claim against the source.',
    };
    expect(hasRepetitiveExplanation(legitimateEmphasis)).toBe(false);
  });

  it('quarantines answer positions and compact source indexes from learner feedback', () => {
    const positionLeak = {
      ...CLEAN_ITEM,
      explanation: 'This supports option 3 because greenhouse gases absorb outgoing longwave radiation.',
    };
    expect(hasAnswerPositionResidue(positionLeak)).toBe(true);
    expect(lintItemAdmission(positionLeak)).toContain('answer-position-residue');
    expect(lintEnrichedQuizItem(positionLeak, { groundingText: '' })).toContain('answer-position-residue');

    expect(
      hasAnswerPositionResidue({ ...CLEAN_ITEM, explanation: 'Option 0 is correct because the aperture is wider.' }),
    ).toBe(true);
    expect(
      hasAnswerPositionResidue({
        ...CLEAN_ITEM,
        explanation: 'The third and fourth options both restate the same relationship.',
      }),
    ).toBe(true);

    const sourceIndexLeak = {
      ...CLEAN_ITEM,
      explanation: 'This is supported by fact 5 in the compact lesson kernel.',
    };
    expect(hasInternalSourceIndexResidue(sourceIndexLeak)).toBe(true);
    expect(lintItemAdmission(sourceIndexLeak)).toContain('claim-marker-residue');

    const naturalFeedback = {
      ...CLEAN_ITEM,
      explanation: 'The greenhouse effect follows from the first law of thermodynamics and the evidence provided.',
    };
    expect(hasAnswerPositionResidue(naturalFeedback)).toBe(false);
    expect(hasInternalSourceIndexResidue(naturalFeedback)).toBe(false);
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

  it('rejects a policy judgment when the stem never supplies the policy', () => {
    const unsupported = {
      question:
        'A cashier says, "I skip the receipt step when customers are in a hurry." Which interpretation is most supported by the evidence?',
      options: [
        'The cashier is intentionally violating company policy',
        'The cashier is following an allowed rush-hour procedure',
        'The cashier is unaware of the receipt setting',
        'The cashier is trying to reduce transaction errors',
      ],
      answerIndex: 0,
    };
    expect(hasUnsupportedPolicyInference(unsupported)).toBe(true);
    expect(lintItemAdmission(unsupported)).toContain('unsupported-policy-inference');

    const supported = {
      ...unsupported,
      question:
        'Company policy requires a receipt offer for every transaction. A cashier says, "I skip the receipt step when customers are in a hurry." Which interpretation is most supported?',
    };
    expect(hasUnsupportedPolicyInference(supported)).toBe(false);
  });

  it('rejects an invented explanation for one recorded pause', () => {
    const unsupported = {
      question:
        'A field note records that a user repeatedly pauses while selecting items. Which evidence type best explains this pause?',
      options: [
        'The user is distracted by a notification',
        'The user is uncertain about availability',
        'The user is experiencing a technical glitch',
        'The user is reading the product description',
      ],
      answerIndex: 1,
    };
    expect(hasUnsupportedBehaviorInference(unsupported)).toBe(true);
    expect(lintItemAdmission(unsupported)).toContain('unsupported-behavior-inference');
  });
});
