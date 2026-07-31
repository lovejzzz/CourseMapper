// v0.16.0 "Ready to Teach" — regression net for the lane changes.
// Every case pins a defect Prof measured (see docs/ROADMAP_V016_READY_TO_TEACH.md).
import { describe, expect, it } from 'vitest';
import {
  buildCourseBlueprint,
  compileBlueprintDeliverables,
  buildQuizAtomsForLesson,
  bloomLevelFromStemVerb,
  compactBlueprintForStorage,
  hydrateBlueprintForCompilation,
} from '../src/lib/courseBlueprintCompiler';
import { auditSubstance } from '../src/lib/contentQualityChecks';
import { repairDeliverableContentQuality } from '../src/lib/contentQualityRepair';
import { buildPostGenerationDigest } from '../src/lib/agentDigest';
import { repairCourseMapReadiness } from '../src/lib/deliverableReadiness';
import {
  disciplineSafeReadingsForLesson,
  hasMusicIntervalSemanticContradiction,
  isMusicIntervalLesson,
} from '../src/lib/musicTheoryQuizFrames';

const LESSON_COUNT = 15;
const QUIZ_ANSWER_LETTERS_FOR_TEST = ['A', 'B', 'C', 'D'];

function bigCourse() {
  return {
    courseName: 'Introduction to Computer Science with Python',
    lessons: Array.from({ length: LESSON_COUNT }, (_, i) => ({
      title: i === 0 ? 'Lesson 1: Python interpreter' : `Lesson ${i + 1}: Python Topic ${i + 1}`,
      sections: [
        {
          topicSection: i === 0 ? '1.1: Python interpreter' : `${i + 1}.1: Python topic ${i + 1}`,
          learningGoals: `Understand python topic ${i + 1}.`,
          learningObjectives:
            i === 0
              ? 'Write and run a short program in the Python interpreter.'
              : `Write a short program using python topic ${i + 1}.`,
          weeklyAssessments: 'Autograded quiz',
          asyncActivities: 'Read the chapter.',
          syncActivities: 'Hands-on coding lab.',
          supportingResources: 'Python textbook chapter',
        },
      ],
    })),
  };
}

function enrichedLesson() {
  return {
    quizItems: [
      {
        index: 0,
        type: 'multiple_choice',
        question: 'What does a Python interpreter do?',
        options: [
          'Reads and executes Python code directly',
          'Compiles code to native binaries first',
          'Formats source files for readability',
          'Manages package downloads only',
        ],
        answerIndex: 0,
        explanation: 'The interpreter reads and executes Python statements directly.',
      },
      {
        index: 1,
        type: 'multiple_choice',
        question: 'Should beginners start in a notebook, an editor, or an interactive shell? Take a position.',
        options: ['Notebook', 'Editor', 'Shell', 'It depends'],
        answerIndex: 3,
      },
      { index: 2, type: 'short_answer', question: 'Describe what happens when you run a saved file.' },
    ],
    keyTerms: [
      {
        term: 'Python interpreter',
        definition: 'a program that reads and executes Python statements directly',
        example: 'running python3 hello.py executes each statement in order',
        misconception: 'Students often read x = x + 1 as an unsolvable equation.',
        correction: 'In Python = is assignment: the right side is evaluated first and bound to the name.',
      },
    ],
    kernel: {
      facts: ['Python code is executed by an interpreter.', 'A source file stores statements for later execution.'],
    },
    assignmentCore: {
      taskDescription:
        'Use a starter file to build a three-line program, run it in the Python interpreter, and confirm each line executes.',
    },
  };
}

function compiledBig(featureIds) {
  const blueprint = buildCourseBlueprint(bigCourse(), {
    enrichment: { source: 'test', lessonContent: { 'lesson-1': enrichedLesson() } },
  });
  return { blueprint, compiled: compileBlueprintDeliverables(blueprint, featureIds, {}) };
}

describe('A5 — outcome surfaces cover the whole course', () => {
  it('the alignment matrix + SLO list reach the back half of a 15-lesson course', () => {
    const { compiled } = compiledBig(['syllabus']);
    const syl = compiled.syllabus.syllabus ?? compiled.syllabus;
    const text = JSON.stringify(syl.outcomeAlignmentMatrix) + JSON.stringify(syl.learningOutcomes);
    // Lessons 11-15 must be visible somewhere in the outcome surfaces
    // (their own row, or a collapsed row's practicedIn list).
    for (const n of [11, 12, 13, 14, 15]) {
      expect(text).toMatch(new RegExp(`(topic ${n}|Lesson ${n})`, 'i'));
    }
  });

  it('near-duplicate template outcomes collapse instead of repeating a shingle 14 times', () => {
    const { compiled } = compiledBig(['syllabus']);
    const outcomes = (compiled.syllabus.syllabus ?? compiled.syllabus).learningOutcomes;
    const stems = outcomes.map((o) => o.toLowerCase().split(/\s+/).slice(0, 8).join(' '));
    expect(new Set(stems).size).toBe(stems.length);
  });
});

describe('A1 — unit-integrity, authored-first quiz overlay', () => {
  it('never splices an authored stem onto template options, and opinion stems never ship as MC', () => {
    const { blueprint } = compiledBig([]);
    const atoms = buildQuizAtomsForLesson(blueprint.lessons[0], blueprint, {
      assessment: { title: 'Autograded quiz' },
    });
    const text = JSON.stringify(atoms);
    expect(text).not.toContain('Take a position'); // opinion stem gated out
    // The authored stem ships as a UNIT: wherever the interpreter question
    // appears, its authored key must be among that item's options (no
    // authored-stem-on-template-options Franken-items).
    const authored = atoms.filter((a) => /What does a Python interpreter do/.test(a.question));
    expect(authored.length).toBeGreaterThan(0);
    for (const atom of authored) {
      expect(atom.options.join(' ')).toContain('Reads and executes Python code directly');
      expect(atom.enrichmentSource).toBe('lesson-content-enrichment');
    }
    for (const atom of atoms.filter((item) => item.enrichmentSource !== 'lesson-content-enrichment')) {
      expect(JSON.stringify([atom.question, atom.options])).not.toMatch(/Autograded quiz|Week\s*1 quiz/i);
    }
  });

  it('re-checks persisted quiz feedback and falls back instead of exporting a generation loop', () => {
    const badStem = 'Which Python operation executes a saved source file from the command line?';
    const payload = enrichedLesson();
    payload.quizItems = [
      {
        index: 0,
        type: 'multiple_choice',
        question: badStem,
        options: ['Run python3 file.py', 'Rename the file', 'Open a browser tab', 'Compress the folder'],
        answerIndex: 0,
        explanation: `ex_reason_1_correct_key_ ${'reasoning_1_correct_key_ '.repeat(12)}`,
      },
    ];
    const blueprint = buildCourseBlueprint(bigCourse(), {
      enrichment: { source: 'persisted-graph', lessonContent: { 'lesson-1': payload } },
    });
    const atoms = buildQuizAtomsForLesson(blueprint.lessons[0], blueprint, {
      assessment: { title: 'Autograded quiz' },
    });
    const compiledText = JSON.stringify(atoms);
    expect(compiledText).not.toContain(badStem);
    expect(compiledText).not.toMatch(/ex_reason|correct_key|reasoning_1/i);
  });
});

describe('A1 — subject-safe deterministic fallback', () => {
  it('keeps a Bayesian quiz disciplinary when the local lesson kernel is unavailable', () => {
    const blueprint = buildCourseBlueprint({
      courseName: 'Bayesian Reasoning for Product Decisions',
      lessons: [
        {
          title: 'Lesson 1: Prior Beliefs and Evidence',
          sections: [
            {
              topicSection: 'Priors, likelihoods, and posteriors',
              learningGoals: 'Update beliefs with evidence.',
              learningObjectives:
                'Calculate a simple posterior. Explain why weak evidence should not overturn a strong prior.',
              weeklyAssessments: 'Quiz: Bayesian product decision.',
              asyncActivities: 'Analyze a product experiment.',
              syncActivities: 'Compare prior beliefs with new evidence.',
              supportingResources: 'Prior belief guide.',
            },
          ],
        },
      ],
    });
    const atoms = buildQuizAtomsForLesson(blueprint.lessons[0], blueprint, { assessment: {} });
    const audit = auditSubstance('quizBank', { quizzes: [{ questions: atoms }] });

    expect(blueprint.enrichment.lens).toMatchObject({
      domain: 'Bayesian inference and decision analysis',
      decisionNoun: 'posterior decision',
      learnerRole: 'Bayesian decision analyst',
    });
    expect(atoms).toHaveLength(8);
    expect(audit).toMatchObject({ meta: 0, metaShare: 0 });
    expect(atoms.map((item) => item.question).join(' ')).toMatch(/prior odds|likelihood ratio|weak evidence/i);
    expect(atoms.map((item) => item.question).join(' ')).not.toMatch(/lesson|artifact|professional decision/i);
    expect(atoms.map((item) => item.bloomsLevel)).toEqual([
      'Apply',
      'Apply',
      'Understand',
      'Understand',
      'Evaluate',
      'Analyze',
      'Evaluate',
      'Apply',
    ]);

    const oddsItem = atoms.find((item) => /posterior odds when prior odds are 1:1/i.test(item.question));
    const answerIndex = QUIZ_ANSWER_LETTERS_FOR_TEST.indexOf(oddsItem.answer);
    expect(oddsItem.options[answerIndex]).toContain('3:1 in favor');
    expect(oddsItem.explanation).toMatch(/1 × 3 = 3/);
  });

  it('uses verified interval frames instead of fake keys when Scion kernel admission fails', () => {
    const blueprint = buildCourseBlueprint(
      {
        courseName: 'Musical Intervals and Ear Training',
        lessons: [
          {
            title: 'Lesson 1: Melodic and Harmonic Intervals',
            sections: [
              {
                topicSection: 'Melodic versus harmonic intervals',
                learningGoals: 'Recognize interval presentation and quality.',
                learningObjectives:
                  'Distinguish melodic from harmonic intervals. Count semitones between two notes. Explain interval quality from notation and listening evidence.',
                weeklyAssessments: 'Listening comparison and notation exercise',
                asyncActivities: 'Compare Notated Example A with Recording B.',
                syncActivities: 'Diagnose a misconception in Listening Pair C.',
                supportingResources: 'Notated Example A, Recording B, and Listening Pair C',
              },
            ],
          },
        ],
      },
      {
        enrichment: {
          source: 'browser-scion',
          quality: { source: 'deterministic-fallback' },
          stageDecisions: { genomeLinker: 'ran', modelStage: 'failed: no usable kernels parsed' },
          coverage: { requestedLessons: 1, enrichedLessons: 0, missingLessons: [1] },
        },
      },
    );
    const atoms = buildQuizAtomsForLesson(blueprint.lessons[0], blueprint, { assessment: {} });
    const compiled = compileBlueprintDeliverables(blueprint, ['studyGuides'], {});
    const guide = compiled.studyGuides.studyGuides[0];
    const audit = auditSubstance('quizBank', { quizzes: [{ questions: atoms }] });
    const text = atoms.map((item) => item.question).join(' ');

    expect(blueprint.enrichment.stageDecisions.modelStage).toMatch(/^failed:/);
    expect(blueprint.enrichment.lens).toMatchObject({
      domain: 'music theory and aural skills',
      evidenceNoun: 'notated and listening evidence',
      decisionNoun: 'interval identification',
      learnerRole: 'musician',
      exampleNoun: 'notated or recorded excerpt',
    });
    expect(atoms).toHaveLength(8);
    expect(atoms.every((item) => item.type === 'multiple_choice')).toBe(true);
    expect(atoms.every((item) => item.enrichmentSource === 'compiler-domain-fallback')).toBe(true);
    expect(atoms.every((item) => item.fallbackSource === 'discipline-verified-music-theory-frame')).toBe(true);
    expect(audit).toMatchObject({ meta: 0, metaShare: 0 });
    expect(text).toMatch(/melodic|harmonic/i);
    expect(text).toMatch(/semitone|C4–E♭4|D4–F♯4/i);
    expect(text).not.toMatch(/professional decision|evidence move|lesson artifact/i);
    expect(guide.keyTerms.map((term) => term.term)).toEqual([
      'Generic interval number',
      'Interval quality',
      'Semitone',
    ]);
    expect(JSON.stringify(guide.keyTerms)).not.toMatch(/evidence focus|weekly artifact|as a self-check/i);
  });

  it('rejects explicit same-domain interval contradictions without rejecting a correct label', () => {
    expect(hasMusicIntervalSemanticContradiction('The interval F♯–A is a major sixth.')).toBe(true);
    expect(hasMusicIntervalSemanticContradiction('The interval F♯–A is a minor third.')).toBe(false);
    expect(hasMusicIntervalSemanticContradiction('C4–E♭4 is a minor third.')).toBe(false);
  });

  it('carries a music-theory course identity into an inversion-only lesson title', () => {
    const lesson = {
      title: 'Lesson 2: Simple Compound Intervals and Inversion',
      outcomes: ['Apply number pairs for simple intervals', 'Determine quality changes via inversion'],
      learnerContextCue:
        'Students connect interval evidence from notated and listening evidence to an interval-identification task.',
    };
    expect(isMusicIntervalLesson(lesson)).toBe(true);
    expect(
      disciplineSafeReadingsForLesson(lesson, ['number pairs that sum to nine and the correct quality changes']),
    ).toEqual(['number pairs that sum to nine and the correct quality changes']);
    expect(
      disciplineSafeReadingsForLesson(lesson, [
        'Immunogenicity of standard and extended dosing intervals of BNT162b2 mRNA vaccine',
      ]),
    ).toEqual(['Class notes and assigned source materials']);
  });

  it('keeps admitted atoms but source-binds every empty quiz slot and missing lesson in a partial run', () => {
    const courseMap = {
      courseName: 'Musical Intervals and Ear Training',
      lessons: [1, 2].map((number) => ({
        title:
          number === 1 ? 'Lesson 1: Melodic and Harmonic Intervals' : 'Lesson 2: Interval Recognition and Application',
        sections: [
          {
            topicSection: number === 1 ? 'Melodic versus harmonic intervals' : 'Recognizing intervals',
            learningGoals: 'Recognize interval presentation and quality.',
            learningObjectives:
              number === 1
                ? 'Distinguish melodic from harmonic intervals. Count semitones accurately.'
                : 'Identify intervals from notation. Recognize intervals from a recording.',
            weeklyAssessments: 'Listening comparison and notation exercise',
            asyncActivities: 'Compare Notated Example A with Recording B.',
            syncActivities: 'Diagnose a misconception in Listening Pair C.',
            supportingResources: 'Notated Example A, Recording B, and Listening Pair C',
          },
        ],
      })),
    };
    const blueprint = buildCourseBlueprint(courseMap, {
      enrichment: {
        source: 'browser-scion',
        stageDecisions: { genomeLinker: 'ran', modelStage: 'ran' },
        coverage: { requestedLessons: 2, enrichedLessons: 1, missingLessons: [2] },
        lessonContent: {
          'lesson-1': {
            quizItems: [
              {
                index: 0,
                type: 'multiple_choice',
                question: 'Which pair is presented harmonically?',
                options: ['Two pitches together', 'Two pitches in sequence', 'One silent rest', 'One repeated pitch'],
                answerIndex: 0,
                explanation: 'A harmonic interval presents two pitches at the same time.',
              },
            ],
            keyTerms: [
              {
                term: 'Harmonic interval',
                definition: 'A relationship between two pitches sounded at the same time.',
                example: 'A notated dyad played together forms a harmonic interval.',
                misconception: 'Any two adjacent notes form a harmonic interval.',
                correction: 'Adjacent notes are harmonic only when they sound simultaneously.',
              },
            ],
            kernel: { facts: ['Harmonic intervals sound two pitches simultaneously.'] },
          },
        },
      },
    });
    const lessonOne = buildQuizAtomsForLesson(blueprint.lessons[0], blueprint, { assessment: {} });
    const lessonTwo = buildQuizAtomsForLesson(blueprint.lessons[1], blueprint, { assessment: {} });
    const allText = [...lessonOne, ...lessonTwo].map((item) => item.question).join(' ');

    expect(lessonOne[0]).toMatchObject({
      question: 'Which pair is presented harmonically?',
      enrichmentSource: 'lesson-content-enrichment',
    });
    expect(lessonOne.slice(1).every((item) => item.enrichmentSource === 'compiler-domain-fallback')).toBe(true);
    expect(lessonTwo.every((item) => item.enrichmentSource === 'compiler-domain-fallback')).toBe(true);
    expect(allText).not.toMatch(/professional decision|evidence move|weekly artifact/i);
  });

  it('replaces an admitted math-interval collision with verified music-theory terms and questions', () => {
    const courseMap = {
      courseName: 'Simple Interval Quality and Compound Interval Inversion',
      lessons: [
        {
          title: 'Lesson 1: Simple Interval Quality and Semitone Verification',
          sections: [
            {
              topicSection: 'Generic interval number; major, minor, and perfect quality; semitone verification',
              learningGoals: 'Classify simple intervals accurately.',
              learningObjectives:
                'Identify generic interval number. Verify interval quality with semitone evidence from Notation Sheet J.',
              weeklyAssessments: 'Notation classification check',
              asyncActivities: 'Analyze Notation Sheet J.',
              syncActivities: 'Compare interval labels.',
              supportingResources:
                'Notation Sheet J; Teaching Inclusive Design Skills with the CIDER Assumption Elicitation Technique; Counting everyone: evidence for inclusive measures of disability in federal surveys',
            },
          ],
        },
        {
          title: 'Lesson 2: Simple Versus Compound Intervals and Inversion',
          sections: [
            {
              topicSection: 'Simple and compound intervals; inversion number pairs; inversion quality changes',
              learningGoals: 'Invert and reduce intervals accurately.',
              learningObjectives:
                'Distinguish simple from compound intervals. Explain inversion number and quality changes from Listening Set K.',
              weeklyAssessments:
                'Interval Types transfer task: explain one example, one source detail, and one limitation.',
              asyncActivities: 'Analyze Listening Set K.',
              syncActivities: 'Invert notated intervals.',
              supportingResources:
                'Listening Set K; Immunogenicity of standard and extended dosing intervals of BNT162b2 mRNA vaccine; Analysis of Premature Rupture of Membranes Interval on Types of Labor',
            },
          ],
        },
      ],
    };
    const blueprint = buildCourseBlueprint(courseMap, {
      knowledgeResources: [
        {
          citation:
            'Alannah Oleson et al. (2022). Teaching Inclusive Design Skills with the CIDER Assumption Elicitation Technique.',
          kind: 'article',
          origin: 'openalex',
        },
        {
          citation:
            'Rebecca Payne et al. (2021). Immunogenicity of standard and extended dosing intervals of BNT162b2 mRNA vaccine.',
          kind: 'article',
          origin: 'openalex',
        },
        {
          citation: 'Open Music Theory: Intervals and Inversion.',
          kind: 'reference',
          origin: 'openalex',
        },
      ],
      enrichment: {
        source: 'browser-scion',
        stageDecisions: { genomeLinker: 'ran', modelStage: 'ran' },
        coverage: { requestedLessons: 2, enrichedLessons: 2, missingLessons: [] },
        lessonContent: {
          'lesson-1': {
            keyTerms: [],
            quizItems: [],
            kernel: {
              facts: [
                'Generic interval number counts both endpoint letter names.',
                'Semitone distance distinguishes major and minor intervals with the same generic number.',
              ],
            },
          },
          'lesson-2': {
            keyTerms: [
              {
                term: 'Simple intervals',
                definition:
                  'A basic mathematical interval structure consisting of a single, continuous segment on the real number line.',
                example: 'A simple interval is represented by a single continuous segment on the number line.',
                misconception: 'Simple intervals are always defined by a single, unbroken set of endpoints.',
                correction: 'A simple interval has one start point and one end point.',
              },
            ],
            quizItems: [
              {
                index: 0,
                type: 'multiple_choice',
                question: 'Given a start point of 2 and an end point of 7, how is this interval classified?',
                options: ['Compound', 'Simple', 'Perfect', 'Inverted'],
                answerIndex: 1,
                explanation: 'It is a simple interval because it is a single continuous span.',
              },
              {
                index: 1,
                type: 'multiple_choice',
                question: 'How should F♯–A be classified?',
                options: ['A major sixth', 'A minor third', 'A perfect fourth', 'An augmented second'],
                answerIndex: 0,
                explanation: 'F♯–A is a major sixth.',
              },
            ],
            kernel: {
              facts: [
                'A simple interval is represented by a single continuous segment on the number line.',
                'The classification depends on whether the interval is a single unit or a combination.',
                'Simple intervals are defined by their basic structure and relationship between start and end points.',
                'Compound intervals require the combination of two or more simple intervals into a larger structure.',
                'Classifying the interval between F♯ and A as a major sixth uses letter names.',
              ],
            },
            slideContent: [
              {
                title: 'The process of verifying intervals requires careful counting',
                bullets: ['Classifying the interval between F♯ and A as a major sixth using letter names.'],
              },
            ],
            discussionPrompt: {
              prompt:
                'Analyze how the classification system used to categorize mathematical sets based on fundamental structural composition strengthens or complicates your decision.',
              tension: 'A continuous number-line segment may be simple or compound depending on its endpoints.',
              positions: ['Use structural composition.', 'Use the number line.'],
            },
          },
        },
      },
    });
    const guides = compileBlueprintDeliverables(blueprint, ['studyGuides'], {}).studyGuides.studyGuides;
    const packageOutputs = compileBlueprintDeliverables(
      compactBlueprintForStorage(blueprint),
      ['syllabus', 'lessonPlans', 'slideDecks', 'assignments', 'rubrics', 'discussions', 'courseFaq'],
      {},
    );
    const lessonOneQuiz = buildQuizAtomsForLesson(blueprint.lessons[0], blueprint, { assessment: {} });
    const lessonTwoQuiz = buildQuizAtomsForLesson(blueprint.lessons[1], blueprint, { assessment: {} });
    const lessonOneText = JSON.stringify(guides[0]);
    const lessonTwoText = JSON.stringify(guides[1]);

    expect(guides[0].keyTerms.map((term) => term.term)).toEqual([
      'Generic interval number',
      'Interval quality',
      'Semitone',
    ]);
    expect(guides[1].keyTerms.map((term) => term.term)).toEqual([
      'Simple interval',
      'Compound interval',
      'Interval inversion',
      'Inversion number pair',
      'Inversion quality change',
    ]);
    expect(`${lessonOneText} ${lessonTwoText}`).toMatch(/3 \+ 6 = 9|major third|minor sixth/i);
    expect(`${lessonOneText} ${lessonTwoText}`).not.toMatch(
      /names the evidence focus|weekly artifact|helps students separate description|as a self-check/i,
    );
    expect(guides[0].reviewQuestions.map((item) => item.question).join(' ')).toMatch(/C4–E♭4|C–D♯/);
    expect(guides[1].reviewQuestions.map((item) => item.question).join(' ')).toMatch(
      /major tenth|augmented fourth|major third inverts/i,
    );
    expect(guides.flatMap((guide) => guide.practiceActivities).join(' ')).not.toMatch(
      /evidence card|three-column note|source-to-decision/i,
    );
    expect(`${lessonOneText} ${lessonTwoText}`).not.toMatch(
      /number line|continuous segment|unbroken set of endpoints|single unit or a combination/i,
    );
    expect(JSON.stringify(guides)).not.toContain('"pattern":');
    expect(lessonOneQuiz.map((item) => item.question).join(' ')).toMatch(/C4–E♭4|D4–F♯4|generic number/i);
    expect(lessonTwoQuiz.map((item) => item.question).join(' ')).toMatch(/compound tenth|major third|sum to nine/i);
    expect(`${JSON.stringify(lessonOneQuiz)} ${JSON.stringify(lessonTwoQuiz)}`).not.toMatch(
      /two lesson concepts|relationships between points|methodological claim|start point of 2|continuous span|F♯ and A as a major sixth/i,
    );
    expect(new Set([...lessonOneQuiz, ...lessonTwoQuiz].map((item) => item.distractorRationale)).size).toBe(16);
    const packageText = JSON.stringify(packageOutputs);
    const lessonTwoDeck = packageOutputs.slideDecks.decks[1];
    const lessonTwoConceptMap = lessonTwoDeck.slides.find(
      (slide) => slide.type === 'keyTerm' && slide.visual?.kind === 'concept map',
    );
    const lessonTwoSlideText = JSON.stringify(lessonTwoDeck.slides);
    const discussionClosures = packageOutputs.discussions.discussions.map(
      (discussion) => discussion.facilitationTips.closure,
    );
    expect(lessonTwoConceptMap).toBeTruthy();
    expect(lessonTwoConceptMap.visual.hub.length).toBeLessThanOrEqual(48);
    expect(lessonTwoConceptMap.visual.spokes.length).toBeGreaterThanOrEqual(2);
    expect(lessonTwoConceptMap.visual.spokes).toEqual(
      expect.arrayContaining(['Simple interval', 'Compound interval', 'Interval inversion']),
    );
    expect(lessonTwoSlideText).toMatch(/Reduce, invert, then exchange quality/);
    expect(lessonTwoSlideText).toMatch(/major tenth|major third/);
    expect(lessonTwoSlideText).toMatch(/minor sixth/);
    expect(lessonTwoSlideText).not.toMatch(/integer sets|mathematical procedure|necessary starting data/i);
    expect(new Set(discussionClosures).size).toBe(2);
    expect(discussionClosures[0]).toMatch(/pitch endpoints|inclusive count|semitone check/i);
    expect(discussionClosures[1]).toMatch(/sum-to-nine partner|quality exchange/i);
    expect(packageText).toMatch(/Notation classification check/);
    expect(packageText).toMatch(/Listening Set K Interval Classification and Inversion Analysis/);
    expect(packageText).toMatch(/Open Music Theory: Intervals and Inversion/);
    expect(packageOutputs.syllabus.syllabus.requiredTexts.map((item) => item.title)).toEqual(
      expect.arrayContaining(['Notation Sheet J', 'Listening Set K']),
    );
    expect(packageText).toMatch(/sum-to-nine rule|number pair and quality change/i);
    const faqText = JSON.stringify(packageOutputs.courseFaq.faqs);
    expect(faqText).toMatch(/Generic interval number/);
    expect(faqText).toMatch(/Interval quality/);
    expect(faqText).toMatch(/Simple interval/);
    expect(faqText).toMatch(/Compound interval/);
    expect(faqText).not.toMatch(/I thought count only|c–E counts/);
    expect(packageText).not.toMatch(/source evidence source|notated and listening evidence source/i);
    expect(packageText).not.toMatch(
      /verifying semitone quality involves assessing|total number of notes within the defined span|F♯ and A as a major sixth/i,
    );
    const rubricText = JSON.stringify(packageOutputs.rubrics.rubrics);
    expect(rubricText).toMatch(/inclusive letter-name counting/);
    expect(rubricText).toMatch(/Interval quality from verified semitone distance/);
    expect(rubricText).toMatch(/Inversion number pair sums to nine/);
    expect(rubricText).toMatch(/perfect↔perfect, major↔minor, augmented↔diminished/);
    expect(rubricText).not.toMatch(/Source-practice checkpoint|Professional communication organized/);
    expect(
      packageText.match(
        /.{0,100}(?:CIDER Assumption|measures of disability|BNT162b2|Premature Rupture of Membranes|mathematical sets|number-line segment|structural composition|start and end points|two or more simple intervals|one example, one source detail, and one limitation|literature matrix|source synthesis|gap statement).{0,180}/gi,
      ) || [],
    ).toEqual([]);

    const digest = buildPostGenerationDigest({
      courseMap,
      deliverables: Object.fromEntries(
        Object.entries(packageOutputs).map(([featureId, data]) => [featureId, { status: 'done', data }]),
      ),
    });
    expect(digest?.observations || []).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'coverage-l1' })]),
    );
  });

  it('quarantines off-discipline interval sources without collapsing the provenance contract', () => {
    const courseMap = {
      courseName: 'Interval Evidence Studio',
      lessons: [
        {
          title: 'Lesson 1: Written and Heard Interval Classification',
          sections: [
            {
              topicSection: 'Generic interval number, interval quality, and semitone verification',
              learningObjectives:
                'Classify written and heard musical intervals with inclusive letter-name and semitone counting.',
              weeklyAssessments: 'Interval classification evidence sheet',
              syncActivities: 'Classify notated and heard musical intervals.',
              supportingResources:
                'Biochemistry Changes That Occur after Death: Potential Markers for Determining Post-Mortem Interval',
            },
          ],
        },
        {
          title: 'Lesson 2: Simple and Compound Intervals and Inversion',
          sections: [
            {
              topicSection: 'Simple intervals, compound intervals, and sum-to-nine inversion pairs',
              learningObjectives:
                'Distinguish simple and compound musical intervals and invert them with number and quality rules.',
              weeklyAssessments: 'Interval inversion analysis',
              syncActivities: 'Invert notated musical intervals and verify each label.',
              supportingResources: 'Metronome',
            },
          ],
        },
      ],
    };
    const blueprint = buildCourseBlueprint(courseMap);
    const prepared = hydrateBlueprintForCompilation(blueprint);
    const compiled = compileBlueprintDeliverables(blueprint, ['syllabus', 'lessonPlans', 'slideDecks']);
    const packageText = JSON.stringify(compiled);

    expect(compiled.syllabus).toBeTruthy();
    expect(compiled.lessonPlans.lessonPlans).toHaveLength(2);
    expect(compiled.slideDecks.decks).toHaveLength(2);
    expect(prepared.lessons).toHaveLength(2);
    for (const lesson of prepared.lessons) {
      expect(lesson.sourceAnchors.length).toBeGreaterThan(0);
      expect(lesson.sourceEvidenceTrace.sourceFields.length).toBeGreaterThanOrEqual(4);
      expect(
        lesson.sourceEvidenceTrace.sourceFields.every(
          (field) => field.field && field.sourceColumn && field.source && field.compiledValue,
        ),
      ).toBe(true);
      expect(lesson.sourceEvidenceTrace.domainAdmissionRepair).toMatchObject({
        source: 'deterministic-compiler-domain-guard',
      });
    }
    expect(packageText).not.toMatch(/post-mortem|biochemistry changes|metronome/i);
    expect(compiled.syllabus.syllabus.courseDescription).toMatch(
      /count letter names inclusively.+check semitone distance.+inversion pairs whose numbers sum to nine/i,
    );
    expect(compiled.syllabus.syllabus.courseDescription).not.toMatch(/course audience|applied decisions/i);
    const classificationOutcome = compiled.syllabus.syllabus.outcomeAlignmentMatrix.find((row) =>
      /classify.+interval/i.test(row.outcome),
    );
    expect(classificationOutcome?.bloomsLevel).toBe('Apply');
    const boundarySlide = compiled.slideDecks.decks[0].slides.find((slide) =>
      /classification check proves/i.test(slide.title),
    );
    expect(boundarySlide?.bullets).toEqual([
      'Letter names determine the generic interval number; semitone count does not replace spelling.',
      'Semitone distance distinguishes qualities only after the generic number is known.',
      'A listening answer is provisional until its pitch endpoints can be checked.',
    ]);
    const classificationDeckText = JSON.stringify(compiled.slideDecks.decks[0]);
    const inversionDeckText = JSON.stringify(compiled.slideDecks.decks[1]);
    expect(classificationDeckText).toMatch(/Classification lab: spell, count, verify/);
    expect(classificationDeckText).toMatch(/Which interval classification is defensible/);
    expect(inversionDeckText).toMatch(/Inversion lab: reduce, pair, exchange/);
    expect(inversionDeckText).toMatch(/Confirm that the inversion pair sums to nine/);
    const visibleDeckText = compiled.slideDecks.decks
      .flatMap((deck) => deck.slides.map((slide) => JSON.stringify([slide.title, slide.bullets])))
      .join(' ');
    expect(visibleDeckText).not.toMatch(
      /weekly applied seminar|name the reading|source check|evidence choice holds up/i,
    );
    const repairResult = repairDeliverableContentQuality('slideDecks', compiled.slideDecks);
    expect(packageText).toMatch(/inclusive letter-name count|semitone verification|inversion-number verification/i);
    expect(repairResult.repeatedPhrase).toBeTruthy();
    expect(repairResult.repairedPhrases).toBe(0);
    expect(repairResult.data).toBe(compiled.slideDecks);
    expect(JSON.stringify(repairResult.data)).not.toMatch(/(?:review note|evidence check)-and-quality agreement/i);

    const missingTraceBlueprint = buildCourseBlueprint(courseMap);
    missingTraceBlueprint.lessons[0].sourceEvidenceTrace = null;
    expect(() => compileBlueprintDeliverables(missingTraceBlueprint, ['syllabus'])).toThrow(
      /Contract blocked compilation: sourceTrace L1/,
    );
  });

  it('repairs a generic music-interval Course Map assessment into a source-bound classification task', () => {
    const result = repairCourseMapReadiness({
      courseMap: {
        courseName: 'Interval Evidence Studio',
        lessons: [
          {
            title: 'Lesson 1: Simple Versus Compound Intervals and Inversion',
            sections: [
              {
                topicSection: 'Simple and compound intervals; inversion number pairs; inversion quality changes',
                learningObjectives:
                  'Distinguish simple from compound intervals and apply inversion number and quality rules.',
                weeklyAssessments:
                  'Interval Types transfer task: explain one example, one source detail, and one limitation.',
                supportingResources: 'Audio Set M',
              },
            ],
          },
        ],
      },
    });
    const assessment = result.courseMap.lessons[0].sections[0].weeklyAssessments;
    expect(result.changed).toBe(true);
    expect(assessment).toMatch(/Audio Set M interval-classification and inversion analysis/i);
    expect(assessment).toMatch(/inspectable pitch evidence/i);
    expect(assessment).not.toMatch(/transfer task|one source detail|one limitation/i);
  });

  it('leaves unknown definitions empty instead of inventing course-process glossary prose', () => {
    const blueprint = buildCourseBlueprint(
      {
        courseName: 'Special Topics Seminar',
        lessons: [
          {
            title: 'Lesson 1: Local Interpretive Framework',
            sections: [
              {
                topicSection: 'Local interpretive framework',
                learningObjectives: 'Evaluate a claim using the supplied local source.',
                supportingResources: 'Instructor source packet',
              },
            ],
          },
        ],
      },
      {
        enrichment: {
          source: 'browser-scion',
          stageDecisions: { modelStage: 'ran' },
          coverage: { requestedLessons: 1, enrichedLessons: 1, missingLessons: [] },
          lessonContent: {
            'lesson-1': {
              keyTerms: [],
              quizItems: [],
              kernel: {
                facts: ['The supplied local source defines the framework within its own institutional context.'],
              },
            },
          },
        },
      },
    );
    const guide = compileBlueprintDeliverables(blueprint, ['studyGuides'], {}).studyGuides.studyGuides[0];

    expect(guide.keyTerms).toEqual([]);
    expect(guide.sourceReviewRequired).toMatch(/no definitions were invented/i);
    expect(JSON.stringify(guide)).not.toMatch(/names the evidence focus|weekly artifact|as a self-check/i);
  });
});

describe('A2 — the autograding spec is printable fact', () => {
  it('an all-MC weekly quiz states its machine-scoring rule', () => {
    const { compiled } = compiledBig(['quizBank']);
    const weekly = compiled.quizBank.quizzes.find((q) => q.kind !== 'exam');
    expect(weekly.questions.every((q) => q.type === 'multiple_choice')).toBe(true);
    expect(weekly.gradingSpec).toMatch(/Machine-scorable against the answer key/);
    expect(weekly.gradingSpec).toMatch(/no partial credit/);
  });
});

describe('A3 — activity language follows the assessment genre', () => {
  it('an autograded-quiz lesson practices retrieval; nobody drafts the quiz', () => {
    const { compiled } = compiledBig(['lessonPlans']);
    const plan = JSON.stringify(compiled.lessonPlans.lessonPlans[0]);
    expect(plan).not.toMatch(/Students draft (?:the )?Autograded/i);
    expect(plan).toMatch(/practice items|retrieval-practice|timed practice|quiz each other/i);
  });
});

describe('A4 — Bloom tags treat coding performances as Apply', () => {
  it('"Define a function" is a performance in a making context, not recall', () => {
    expect(bloomLevelFromStemVerb('Define a function that returns the running total')).toBe('Apply');
    expect(bloomLevelFromStemVerb('Define the key vocabulary of the unit')).not.toBe('Apply');
  });
});

describe('C1 — explanations repair the documented misconception', () => {
  it('the correct-answer explanation names and corrects the wrong turn', () => {
    const { compiled } = compiledBig(['quizBank']);
    const text = JSON.stringify(compiled.quizBank.quizzes[0].questions);
    expect(text).toMatch(/A common wrong turn/);
    expect(text).toMatch(/evaluated first and bound to the name/);
  });
});

describe('C2 — every lesson plan carries a non-reader catch-up path', () => {
  it('the mini-lesson opens with a recap for students who missed the reading', () => {
    const { compiled } = compiledBig(['lessonPlans']);
    for (const plan of compiled.lessonPlans.lessonPlans.slice(0, 3)) {
      expect(JSON.stringify(plan)).toMatch(/missed the reading/);
    }
  });
});

describe('C3 — the lesson teaches a focused core', () => {
  it('keyConcepts cap at 4 (word-mining filler no longer counts as taught content)', () => {
    const { blueprint } = compiledBig([]);
    for (const lesson of blueprint.lessons) {
      expect(lesson.keyConcepts.length).toBeLessThanOrEqual(4);
    }
  });
});

describe('B2 — rubric bands are observable behaviors', () => {
  it('strong = applies the definition; weak = shows the misconception', () => {
    const { compiled } = compiledBig(['rubrics']);
    const text = JSON.stringify(compiled.rubrics);
    expect(text).toMatch(/Strong work uses Python interpreter correctly/);
    expect(text).toMatch(/Weak work shows the common misunderstanding/);
  });
});

describe('B4 — the FAQ answers demand', () => {
  it('the lesson FAQ opens with the misconception, phrased as students ask it', () => {
    const { compiled } = compiledBig(['courseFaq']);
    const lessonOne = compiled.courseFaq.faqs[0];
    const questions = lessonOne.qs.map((q) => q.q).join('\n');
    expect(questions).toMatch(/I thought .*is that wrong/i);
    expect(questions).toMatch(/What does Python interpreter actually mean/i);
  });
});

describe('E — professional credibility tail', () => {
  it('E2: testing accommodations are tied to exams in the accessibility policy', () => {
    const { compiled } = compiledBig(['syllabus']);
    const syl = compiled.syllabus.syllabus ?? compiled.syllabus;
    expect(syl.accommodations).toMatch(/testing accommodations/i);
    expect(syl.accommodations).toMatch(/quiz, midterm, and final/i);
  });

  it('E4: Lesson 1 slides never reference "Last time"', () => {
    const { compiled } = compiledBig(['slideDecks']);
    const deckOne = JSON.stringify(compiled.slideDecks.decks[0]);
    expect(deckOne).not.toMatch(/Last time:/);
    const deckTwo = JSON.stringify(compiled.slideDecks.decks[1]);
    expect(deckTwo).toMatch(/Last time:/); // later lessons keep continuity
  });

  it('E5: hands-on technical artifacts carry a realistic after-class floor', () => {
    const { blueprint } = compiledBig([]);
    // "Autograded quiz" + "Hands-on coding lab" artifact → technical floor.
    expect(blueprint.lessons[0].workloadEstimate.afterClassMinutes).toBeGreaterThanOrEqual(90);
  });
});
