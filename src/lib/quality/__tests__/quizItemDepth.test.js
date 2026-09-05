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

const appliedMusicIntervalStems = [
  'Apply inclusive letter-name counting to C4–E♭4. What are its generic number and interval quality?',
  'Verify D4–F♯4 by semitone count. Which interval label is correct?',
  'Analyze E4–F4. Why is this pair one semitone apart even though neither note has an accidental?',
  'Reduce a compound tenth to its simple equivalent. Which interval number results?',
  'Invert a major third by moving its lower pitch up an octave. Which interval results?',
  'Analyze the inversion of an augmented fourth. Which quality change is required?',
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

const appliedFrameworkStems = [
  'A pharmaceutical company discovers a rare but serious drug side effect. A recall would save lives but cost millions. Which ethical framework prioritizes the recall?',
  'An employee discovers falsified financial reports and risks dismissal by reporting them. What ethical concept does this dilemma highlight?',
  'A CEO cuts employee benefits to increase shareholder returns while remaining legally compliant. Why is this decision ethically problematic?',
  'A board member owns stock in a supplier but refuses to disclose it. What is the primary ethical issue?',
];

const appliedClassificationCompletions = [
  "In Pavlov's studies, the tone triggered salivation after repeated pairing with meat powder. At that point the tone is best labeled the",
  'Taking aspirin removes a headache, making a person more likely to take aspirin next time. Removing the headache acts as',
  'A trainer rewards a puppy immediately after it sits, and the puppy sits more often. This is an example of which conditioning process?',
  'A dog stops salivating after the bell sounds many times without food. This decline is called',
  'A trainer rewards a dolphin for closer approximations of a flip. This technique is called',
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
    for (const stem of appliedMusicIntervalStems) expect(isAppliedQuizStem(stem), stem).toBe(true);
    for (const stem of appliedOutcomeStems) expect(isAppliedQuizStem(stem), stem).toBe(true);
    for (const stem of appliedFrameworkStems) expect(isAppliedQuizStem(stem), stem).toBe(true);
    for (const stem of appliedClassificationCompletions) expect(isAppliedQuizStem(stem), stem).toBe(true);
    expect(isAppliedQuizStem('Which clef establishes the pitch reference point for a staff?')).toBe(false);
    expect(isAppliedQuizStem('Which interval numbers form inversion pairs?')).toBe(false);
    expect(isAppliedQuizStem('Which ethical framework focuses on duties rather than consequences?')).toBe(false);
    expect(
      isAppliedQuizStem(
        'Which principle best describes the relationship between literary traditions in the study of world literature?',
      ),
    ).toBe(false);
    expect(isAppliedQuizStem("Bandura's four steps of successful modeling, in order, are")).toBe(false);
    expect(isAppliedQuizStem("In operant conditioning, 'positive' and 'negative' refer to")).toBe(false);
    expect(
      isAppliedQuizStem(
        'A manager discovers falsified records and must choose whether to report them. Which ethical framework applies',
      ),
    ).toBe(false);
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

  it('recognizes a singular course lens in a claim-evidence-boundary task', () => {
    const task =
      'Name the most defensible course lens, point to two case details, and state one boundary or next piece of evidence.';
    expect(isClaimEvidenceBoundaryShortAnswer(task)).toBe(true);
  });

  it('recognizes the sparse-course constructed-response frame as independent selection', () => {
    const task =
      'In 2-3 sentences, independently select the course concept or method that should guide an analyst making the decision in the Week 3 report. Cite one inspectable evidence detail from the source packet, then state a limitation or evidence boundary.';
    expect(isConceptCuedCompilerShortAnswer(task)).toBe(false);
    expect(isClaimEvidenceBoundaryShortAnswer(task)).toBe(true);
  });

  it('recognizes a two-card synthesis that independently selects a concept and bounds the relationship', () => {
    const task =
      'Claim A states one course proposition. Claim B states a related proposition. Identify the course concept that best organizes these claims, explain how they differ or connect, and state what they do not establish. Use both claim cards and keep the conclusion bounded.';
    expect(isClaimEvidenceBoundaryShortAnswer(task)).toBe(true);
  });

  it('recognizes every compiler cross-concept exam variant as evidence-bound reasoning', () => {
    const scope = 'measurement and protocol revision';
    const stems = [
      `Use one course detail for each concept from ${scope}. Identify the two course concepts, explain how their roles differ, and state one conclusion the paired evidence still does not establish.`,
      `Choose two course concepts from ${scope}. Cite one evidence detail for each, compare their explanatory roles, and state one boundary the paired evidence cannot cross.`,
      `Select the two course concepts that best organize ${scope}. Cite a distinct evidence detail for each, explain the relationship, and state what the evidence does not prove.`,
      `Name the two course concepts that best fit ${scope}. Use one supporting detail for each, distinguish their roles, and state one limitation on the conclusion.`,
      `Identify the two course concepts supported by details from ${scope}. Cite one evidence detail for each, compare the concepts, and state one limitation on the combined inference.`,
      `Choose the two course concepts that create the strongest contrast in ${scope}. Cite one course detail for each, connect their roles, and name one extension the evidence does not establish.`,
    ];
    expect(stems.every(isClaimEvidenceBoundaryShortAnswer)).toBe(true);
    expect(stems.some(isConceptCuedCompilerShortAnswer)).toBe(false);
  });

  it('recognizes applied and bounded beginner-language assessment tasks', () => {
    const appliedCard =
      'A student is preparing a three-column language card for this lesson. Which response correctly completes the written-form, tone-marked-Pinyin, and English-meaning columns?';
    const boundedLanguageTask =
      'Choose the language principle—pronunciation, written form, grammar, or meaning—that best organizes this lesson detail: “在 (zài) locates 图书馆 relative to 食堂.” Cite the exact detail as evidence, explain what it establishes about 图书馆在食堂旁边, and state one boundary: what the detail does not establish about other Mandarin forms.';
    expect(isAppliedQuizStem(appliedCard)).toBe(true);
    expect(isConceptCuedCompilerShortAnswer(boundedLanguageTask)).toBe(false);
    expect(isClaimEvidenceBoundaryShortAnswer(boundedLanguageTask)).toBe(true);
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

  it('reports source-bound recovery as a subject-matter review requirement even for one lesson', () => {
    const files = [
      {
        text: 'This recovery item assesses source use without fabricating a disciplinary answer key after the local knowledge kernel failed admission. '.repeat(
          6,
        ),
      },
    ];
    expect(buildQuizDepthFindings(files)).toEqual([
      expect.objectContaining({
        severity: 'P1',
        dimension: 'substance',
        file: 'quizBank',
        detail: expect.stringContaining('6 quiz items use source-bound recovery'),
      }),
    ]);
  });
});
