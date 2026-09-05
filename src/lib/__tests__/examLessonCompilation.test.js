/**
 * v0.16 exam-lesson regression tests.
 *
 * Verified against a real generated Linear Algebra package (v0.16.0; 14
 * lessons, L8 = Midterm exam, L14 = Final exam) where four bugs shipped:
 *  1. META-TEMPLATE EXAM ITEMS — every exam MC item was one recognition
 *     template ("Which statement most accurately connects Systems of linear
 *     equations to the work in Systems of linear equations?" — the topic
 *     connected to ITSELF) with process-move distractors.
 *  2. EXAM-DAY TEACHING BOILERPLATE — exam lessons received full
 *     active-learning lesson plans (misconception poll, homework due on exam
 *     day), a graded mid-exam discussion, a 13-slide teaching deck, and a
 *     study guide that treated the exam as a concept.
 *  3. SELF-INCLUSION — the final's scope said "Covers Lessons 1–14",
 *     including itself and the review days.
 *  4. QUIZ ON EXAM DAY — the exam lesson also carried a 6-question weekly
 *     quiz in addition to the exam paper.
 */
import { describe, expect, it, vi } from 'vitest';
import { buildCourseBlueprint, compileBlueprintDeliverables } from '../courseBlueprintCompiler';
import { findWorstPhraseRepetition } from '../exportRenderedTextAudit';

vi.mock('../customDeliverableLibrary', () => ({
  getCustomDeliverable: vi.fn(() => null),
}));

const CONTENT_LESSONS = [
  {
    focus: 'Systems of linear equations',
    concept: 'Gaussian elimination',
    definition: 'Gaussian elimination reduces a linear system to row-echelon form using row operations.',
    misconception: 'Students often think swapping two rows changes the solution set of the system.',
    correction: 'Row swaps are elementary operations: they never change the solution set, only the presentation.',
    fact: 'A linear system has zero, one, or infinitely many solutions - never exactly two.',
  },
  {
    focus: 'Matrices and matrix algebra',
    concept: 'Matrix multiplication',
    definition: 'Matrix multiplication composes linear maps: entry ij is the dot product of row i and column j.',
    misconception: 'Students often assume matrix multiplication is commutative like scalar multiplication.',
    correction: 'Matrix products depend on order: AB and BA usually differ, and one may not even be defined.',
    fact: 'The product of an m by n matrix and an n by p matrix is an m by p matrix.',
  },
  {
    focus: 'Determinants',
    concept: 'Determinant of a matrix',
    definition: 'The determinant is a scalar that measures how a square matrix scales signed volume.',
    misconception: 'Students often believe a nonzero determinant means every entry of the matrix is nonzero.',
    correction: 'Determinants summarize the whole matrix: invertible matrices can contain many zero entries.',
    fact: 'A square matrix is invertible exactly when its determinant is nonzero.',
  },
];

function makeExamCourseMap() {
  const contentLessons = CONTENT_LESSONS.map((entry, index) => ({
    title: `Lesson ${index + 1}: ${entry.focus}`,
    sections: [
      {
        topicSection: `${entry.focus}; ${entry.concept}; worked examples`,
        learningObjectives: `Analyze ${entry.concept} in worked problems; Evaluate when ${entry.concept} applies`,
        learningGoals: `Use ${entry.concept} to solve ${entry.focus} problems with justified steps.`,
        weeklyAssessments: `Problem set ${index + 1}: ${entry.focus} practice with solution justification.`,
        asyncActivities: `Read the ${entry.focus} chapter and annotate one worked example.`,
        syncActivities: `Board work on ${entry.focus} with step-by-step justification and peer checks.`,
        supportingResources: `Linear algebra text chapter ${index + 1}; ${entry.focus} problem bank`,
        evaluateDesign: `Score solution accuracy, step justification, and error diagnosis for ${entry.focus}.`,
      },
    ],
  }));
  return {
    courseName: 'Introductory Linear Algebra',
    semester: 'Fall 2026',
    learningOutcomes:
      'Solve linear systems, compute with matrices and determinants, and justify each solution step with course definitions.',
    lessons: [
      ...contentLessons,
      {
        title: 'Lesson 4: Final review',
        sections: [
          {
            topicSection: 'Cumulative review of systems, matrices, and determinants',
            learningObjectives: 'Evaluate readiness across the covered material; Analyze remaining gaps',
            learningGoals: 'Consolidate the covered concepts before the final exam.',
            weeklyAssessments: 'Practice set: final exam preparation problems.',
            asyncActivities: 'Re-work one problem from each covered lesson without notes.',
            syncActivities: 'Review stations for systems, matrices, and determinants.',
            supportingResources: 'Cumulative problem bank; covered-lesson study guides',
            evaluateDesign: 'Check practice-set completion and gap diagnosis quality.',
          },
        ],
      },
      {
        title: 'Lesson 5: Final exam',
        sections: [
          {
            topicSection: 'Final exam session',
            learningObjectives: 'Demonstrate command of the covered material under exam conditions',
            learningGoals: 'Show cumulative mastery of systems, matrices, and determinants.',
            weeklyAssessments: 'Final Exam: cumulative coverage of systems, matrices, and determinants.',
            asyncActivities: 'Complete final preparation using the review guide.',
            syncActivities: 'Final exam administration.',
            supportingResources: 'Exam policy sheet',
            evaluateDesign: 'Score the final exam against the answer key.',
          },
        ],
      },
    ],
  };
}

function buildExamBlueprint() {
  const blueprint = buildCourseBlueprint(makeExamCourseMap(), {
    enrichment: {
      source: 'test-exam-lesson-enrichment',
      lens: {
        domain: 'linear algebra',
        evidenceNoun: 'worked-solution evidence',
        decisionNoun: 'solution-method decision',
        learnerRole: 'linear algebra student',
        exampleNoun: 'worked problem',
      },
    },
  });
  blueprint.lessons.forEach((lesson, index) => {
    const entry = CONTENT_LESSONS[index];
    if (!entry) return; // review + exam lessons carry no authored kernel
    lesson.enrichment = {
      ...(lesson.enrichment || {}),
      keyTerms: [
        {
          term: entry.concept,
          definition: entry.definition,
          misconception: entry.misconception,
          correction: entry.correction,
        },
      ],
      kernel: { facts: [entry.fact] },
    };
  });
  return blueprint;
}

function compileExamPackage() {
  const blueprint = buildExamBlueprint();
  const compiled = compileBlueprintDeliverables(
    blueprint,
    ['quizBank', 'lessonPlans', 'studyGuides', 'discussions', 'slideDecks'],
    { enforceCompilerContract: false },
  );
  return { blueprint, compiled };
}

const SELF_CONNECTION_RE = /connects\s+(.{3,80}?)\s+to the work in\s+\1\s*\?/i;

describe('exam-lesson compilation (v0.16 exam fixes)', () => {
  const { compiled } = compileExamPackage();
  const quizzes = compiled.quizBank.quizzes;
  const examEntry = quizzes.find((quiz) => quiz.kind === 'exam');
  const examLessonPlan = compiled.lessonPlans.lessonPlans[4];
  const reviewLessonPlan = compiled.lessonPlans.lessonPlans[3];
  const examStudyGuide = compiled.studyGuides.studyGuides[4];
  const examDiscussion = compiled.discussions.discussions[4];
  const examDeck = compiled.slideDecks.decks[4];

  it('compiles the exam paper as a quiz-bank entry', () => {
    expect(examEntry).toBeTruthy();
    expect(examEntry.questions.length).toBeGreaterThanOrEqual(5);
  });

  it('exam scope excludes the exam lesson itself and review-day lessons (bug 3)', () => {
    expect(examEntry.examScope).toMatch(/Covers Lessons 1–3\b/);
    expect(examEntry.examScope).not.toMatch(/1–[45]/);
    // Neither the review day nor the exam day appear as covered content.
    expect(examEntry.examScope).not.toMatch(/Final review|Final exam/i);
  });

  it('never connects a topic to itself anywhere in the bank (bug 1)', () => {
    for (const quiz of quizzes) {
      for (const question of quiz.questions) {
        expect(question.question).not.toMatch(SELF_CONNECTION_RE);
      }
    }
  });

  it("exam MC items are instantiated from the covered lessons' authored atoms (bug 1)", () => {
    const mcItems = examEntry.questions.filter((question) => question.type === 'multiple_choice');
    expect(mcItems.length).toBeGreaterThanOrEqual(3);
    // No item uses the old meta template.
    for (const item of mcItems) {
      expect(item.question).not.toMatch(/most accurately connects .* to the work in/i);
    }
    // Every covered lesson's authored concept appears in the exam paper.
    const examText = JSON.stringify(examEntry.questions);
    for (const entry of CONTENT_LESSONS) {
      expect(examText).toContain(entry.concept);
    }
    // Definition-recognition items carry the authored definition as an option
    // and draw at least one distractor from another lesson's atoms or the
    // lesson's own misconception text.
    const definitionItem = mcItems.find((item) => /working definition of Gaussian elimination/i.test(item.question));
    expect(definitionItem).toBeTruthy();
    const optionText = definitionItem.options.join(' ');
    expect(optionText).toContain('reduces a linear system to row-echelon form');
    expect(
      /swapping two rows changes the solution set/i.test(optionText) ||
        /composes linear maps|measures how a square matrix scales/i.test(optionText),
    ).toBe(true);
    // Misconception items pit the documented wrong claim against its
    // authored corrective.
    const misconceptionItem = mcItems.find((item) => item.misconceptionSourced === true);
    expect(misconceptionItem).toBeTruthy();
    expect(misconceptionItem.options.join(' ')).toMatch(/never change the solution set|depend on order|invertible/i);
  });

  it('keeps cumulative-exam definition framing below the rendered repetition limit', () => {
    const contentLessons = Array.from({ length: 12 }, (_, index) => ({
      title: `Lesson ${index + 1}: Physics Concept ${index + 1}`,
      sections: [
        {
          topicSection: `Physics Concept ${index + 1}; worked calculation ${index + 1}`,
          learningObjectives: `Apply Physics Concept ${index + 1} to a bounded calculation.`,
          learningGoals: `Explain and calculate with Physics Concept ${index + 1}.`,
          weeklyAssessments: `Problem set ${index + 1}: Physics Concept ${index + 1}`,
          asyncActivities: `Annotate the worked example for Physics Concept ${index + 1}.`,
          syncActivities: `Solve a boundary case for Physics Concept ${index + 1}.`,
          supportingResources: `Physics source packet ${index + 1}`,
        },
      ],
    }));
    const blueprint = buildCourseBlueprint({
      courseName: 'Introductory Physics II',
      lessons: [
        ...contentLessons,
        {
          title: 'Lesson 13: Final Exam',
          sections: [
            {
              topicSection: 'Cumulative final exam',
              learningObjectives: 'Apply covered physics concepts under exam conditions.',
              learningGoals: 'Demonstrate cumulative physics mastery.',
              weeklyAssessments: 'Final Exam (40%)',
              asyncActivities: 'Review the cumulative guide.',
              syncActivities: 'Complete the final exam.',
              supportingResources: 'Equation sheet; exam policy',
            },
          ],
        },
      ],
    });
    blueprint.lessons.slice(0, 12).forEach((lesson, index) => {
      lesson.enrichment = {
        keyTerms: [
          {
            term: `Physics Concept ${index + 1}`,
            definition: `Physics Concept ${index + 1} relates measured quantity ${index + 1} to a bounded physical system.`,
            misconception: `Physics Concept ${index + 1} applies without boundary conditions.`,
            correction: `Physics Concept ${index + 1} requires the stated boundary conditions.`,
          },
        ],
        kernel: { facts: [`Measured quantity ${index + 1} changes only under the stated physical conditions.`] },
      };
    });
    const exam = compileBlueprintDeliverables(blueprint, ['quizBank'], {
      enforceCompilerContract: false,
    }).quizBank.quizzes.find((entry) => entry.kind === 'exam');
    const renderedParagraphs = exam.questions.flatMap((question) => [question.intendedUse, question.question]);
    const before = findWorstPhraseRepetition(
      Array.from(
        { length: 12 },
        (_, index) => `Which statement gives the course's working definition of Physics Concept ${index + 1}?`,
      ),
    );
    const after = findWorstPhraseRepetition(renderedParagraphs);

    expect(before.count).toBeGreaterThanOrEqual(before.limit);
    expect(after.count).toBeLessThan(after.limit);
    expect(
      new Set(exam.questions.filter((question) => question.type === 'multiple_choice').map((q) => q.question)).size,
    ).toBeGreaterThanOrEqual(6);
  });

  it('exam day gets the exam paper only - no weekly quiz on exam day (bug 4)', () => {
    expect(quizzes.some((quiz) => quiz.lessonTitle === 'Lesson 5: Final exam')).toBe(false);
    // The review lesson (a teaching session) keeps its weekly retrieval quiz.
    expect(quizzes.some((quiz) => quiz.lessonTitle === 'Lesson 4: Final review')).toBe(true);
  });

  it('exam lesson plan is logistics + brief review, with no homework or misconception poll (bug 2)', () => {
    expect(examLessonPlan.lessonTitle).toBe('Lesson 5: Final exam');
    expect(examLessonPlan.examDay).toBe(true);
    expect(examLessonPlan.homework).toBeUndefined();
    const planText = JSON.stringify(examLessonPlan);
    expect(planText).not.toMatch(/misconception poll/i);
    expect(planText).not.toMatch(/mini-lesson/i);
    expect(planText).not.toMatch(/draft workshop/i);
    // Logistics + warm-up review shape.
    expect(examLessonPlan.warmUp.type).toMatch(/review/i);
    expect(examLessonPlan.outline.some((step) => step.type === 'Exam')).toBe(true);
    // Every lesson still gets a plan (coverage contract intact).
    expect(compiled.lessonPlans.lessonPlans).toHaveLength(5);
  });

  it('review lessons keep their full teaching plan (exam detection stays narrow)', () => {
    expect(reviewLessonPlan.lessonTitle).toBe('Lesson 4: Final review');
    expect(reviewLessonPlan.examDay).toBeUndefined();
    expect(reviewLessonPlan.homework).toBeTruthy();
  });

  it('exam study guide is a cumulative review of covered atoms, never the exam-as-concept (bug 2)', () => {
    expect(examStudyGuide.examDay).toBe(true);
    const guideText = JSON.stringify(examStudyGuide);
    expect(guideText).not.toMatch(/connects to the assessment artifact:\s*(Final|Midterm)/i);
    // Covered lessons' authored terms and misconceptions are the content.
    expect(examStudyGuide.keyTerms.map((term) => term.term)).toEqual(
      expect.arrayContaining(['Gaussian elimination', 'Matrix multiplication', 'Determinant of a matrix']),
    );
    expect(examStudyGuide.commonMisconceptions.length).toBeGreaterThanOrEqual(2);
    expect(examStudyGuide.examScope).toMatch(/Lessons 1–3/);
  });

  it('exam discussion is a short optional post-exam reflection (bug 2)', () => {
    expect(examDiscussion.examDay).toBe(true);
    expect(examDiscussion.format).toMatch(/post-exam reflection/i);
    expect(examDiscussion.estimatedDuration).toMatch(/5-10 minutes/);
    const discussionText = JSON.stringify(examDiscussion);
    expect(discussionText).not.toMatch(/during (the )?(Midterm|Final) exam/i);
    expect(discussionText).not.toMatch(/two visible contributions/i);
    expect(examDiscussion.followUpProbes).toHaveLength(3);
    expect(examDiscussion.evaluationCriteria.length).toBeGreaterThanOrEqual(2);
    expect(examDiscussion.facilitationTips).toMatchObject({
      opening: expect.any(String),
      ifStalls: expect.any(String),
      closure: expect.any(String),
    });
  });

  it('exam slide deck is a short review/logistics deck (bug 2)', () => {
    expect(examDeck.slides.length).toBeLessThanOrEqual(6);
    const deckText = JSON.stringify(examDeck.slides);
    expect(deckText).toMatch(/exam conditions/i);
    expect(deckText).not.toMatch(/misconception poll/i);
    // The review slide reuses covered lessons' authored definitions.
    expect(deckText).toMatch(/row-echelon form|composes linear maps|signed volume/i);
  });
});
