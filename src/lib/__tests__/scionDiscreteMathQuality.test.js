import { isAppliedQuizStem } from '../quality/quizItemDepth.js';
import { sourceIdentityScopeMismatch } from '../lessonSemanticRelevance.js';
import { derivePromptPreviewTitle } from '../promptAwarePreview.js';
import { extractCourseName } from '../algiComposer.js';
import { extractExplicitLessonSequence } from '../explicitLessonSequence.js';
import { describe, it, expect } from 'vitest';
import { extractExplicitTeachingRequirements } from '../explicitTeachingRequirements.js';
import { buildVerifiedDiscreteMathPractice, classifyFiniteFunction } from '../verifiedDiscreteMathPractice.js';
import {
  buildCourseBlueprint,
  compactBlueprintForStorage,
  compileBlueprintDeliverables,
} from '../courseBlueprintCompiler.js';
import { detectRequestedClassSessionMinutes } from '../sourceBriefConstraints.js';
const brief =
  'A 3-session course, 75 minutes per session. Students know elementary algebra. Each session needs a 4-question quiz. Session 3 must prove 1+2+...+n = n(n+1)/2 with explicit base case, induction hypothesis, and induction step.';
const titles = ['Propositional logic and truth tables', 'Sets and functions', 'Mathematical induction'];
const map = {
  courseName: 'Discrete Mathematics: Logic and Proof',
  lessons: titles.map((title) => ({
    title,
    sections: [
      { topicSection: title, learningObjectives: `Apply ${title}.`, weeklyAssessments: `Worked example: ${title}` },
    ],
  })),
};
const make = () =>
  buildCourseBlueprint(map, {
    sourceBrief: brief,
    enrichment: { coverage: { requestedLessons: 3, enrichedLessons: 0, missingLessons: [1, 2, 3] }, lessonContent: {} },
  });
describe('Scion discrete mathematics output regression', () => {
  it('preserves explicit count, prerequisites and minutes without reading course counts as quiz counts', () => {
    expect(extractExplicitTeachingRequirements(brief).questionsPerLesson).toBe(4);
    expect(extractExplicitTeachingRequirements('Each lesson needs a four-question quiz.').questionsPerLesson).toBe(4);
    expect(extractExplicitTeachingRequirements('Quizzes with EIGHT questions.').questionsPerLesson).toBe(8);
    expect(extractExplicitTeachingRequirements('A four-session course and a quiz.').questionsPerLesson).toBeNull();
    expect(
      extractExplicitTeachingRequirements('A four-question quiz and a six-question quiz.').questionsPerLesson,
    ).toBeNull();
    expect(extractExplicitTeachingRequirements('A ten-question quiz.').questionsPerLesson).toBeNull();

    expect(extractExplicitTeachingRequirements('A 4-session course and a quiz.').questionsPerLesson).toBeNull();
    expect(
      extractExplicitTeachingRequirements('A 4-question quiz and a 6-question quiz.').questionsPerLesson,
    ).toBeNull();
    expect(
      extractExplicitLessonSequence(
        'Exact sequence: 1) Logic; 2) Sets and functions; 3) Mathematical induction. Students know algebra.',
      ),
    ).toEqual(['Logic', 'Sets and functions', 'Mathematical induction']);
    expect(detectRequestedClassSessionMinutes(brief)).toBe(75);
    expect(detectRequestedClassSessionMinutes('2 hours per session')).toBe(120);
  });
  it('computes finite-function properties and rejects malformed mappings', () => {
    expect(classifyFiniteFunction({ domain: ['a', 'b'], codomain: [1, 2, 3], outputs: [1, 2] })).toEqual({
      image: [1, 2],
      injective: true,
      surjective: false,
    });
    expect(classifyFiniteFunction({ domain: ['a', 'b', 'c'], codomain: [1, 2], outputs: [1, 2, 2] })).toEqual({
      image: [1, 2],
      injective: false,
      surjective: true,
    });
    expect(() => classifyFiniteFunction({ domain: ['a', 'a'], codomain: [1], outputs: [1, 1] })).toThrow();
    expect(() => classifyFiniteFunction({ domain: ['a'], codomain: [1], outputs: [2] })).toThrow();
  });
  it('does not invent an unrelated induction theorem or route a non-math lesson', () => {
    expect(buildVerifiedDiscreteMathPractice({ title: 'Electromagnetic induction' }, brief)).toBeNull();
    expect(
      buildVerifiedDiscreteMathPractice({ title: 'Mathematical induction' }, 'Prove the sum of squares formula.'),
    ).toBeNull();
    expect(buildVerifiedDiscreteMathPractice({ title: 'Customer functions' })).toBeNull();
  });
  it('rejects the observed statistical-learning source collision without excluding intentional ML courses', () => {
    const sourceIdentity = 'spa: Semi-Supervised Semi-Parametric Graph-Based Estimation in R';
    expect(sourceIdentityScopeMismatch({ lessonIdentity: 'Sets and functions', sourceIdentity }).mismatch).toBe(true);
    expect(
      sourceIdentityScopeMismatch({ lessonIdentity: 'Sets and functions in machine learning', sourceIdentity })
        .mismatch,
    ).toBe(false);
    expect(
      sourceIdentityScopeMismatch({
        lessonIdentity: 'Sets and functions',
        sourceIdentity: 'Functions: injectivity and surjectivity',
      }).mismatch,
    ).toBe(false);
  });
  it('recognizes supplied mathematical cases without giving definitions applied credit', () => {
    expect(
      isAppliedQuizStem(
        'Let f: {a,b} → {1,2,3}, with f(a)=1, f(b)=2. Determine whether f is injective and whether it is surjective.',
      ),
    ).toBe(true);
    expect(
      isAppliedQuizStem(
        'Compute the truth table for (P IMPLIES Q). Which output column is correct in the supplied row order (T,T), (T,F), (F,T), (F,F)?',
      ),
    ).toBe(true);
    expect(
      isAppliedQuizStem(
        'In the study of functions, which definition correctly describes what it means for a function to be injective?',
      ),
    ).toBe(false);
  });
  it('keeps the leading course title ahead of quoted instructions', () => {
    const prompt =
      'Discrete Mathematics: Logic and Proof — a 3-session undergraduate computer science mini-course. Do not ask students to “cite evidence”.';
    expect(derivePromptPreviewTitle(prompt)).toBe('Discrete Mathematics: Logic and Proof');
    expect(extractCourseName(prompt)).toBe('Discrete Mathematics: Logic and Proof');
  });
  it('keeps synthetic practice out of instructor-source-only courses', () => {
    const bp = buildCourseBlueprint(map, {
      sourceBrief: `${brief} Use only instructor-provided sources.`,
      enrichment: {
        coverage: { requestedLessons: 3, enrichedLessons: 0, missingLessons: [1, 2, 3] },
        lessonContent: {},
      },
    });
    const out = compileBlueprintDeliverables(bp, ['studyGuides']);
    expect(out.studyGuides.studyGuides.every((g) => !g.verifiedPractice)).toBe(true);
  });
  it('still fulfils explicit math tasks when admitted background facts have no worked example', () => {
    const bp = make();
    bp.enrichment.coverage = { requestedLessons: 3, enrichedLessons: 3, missingLessons: [] };
    for (const lesson of bp.lessons)
      lesson.enrichment = {
        sourceFactAuthority: 'admitted-evidence-authority',
        keyTerms: [],
        kernel: {
          facts: [
            'A finite set has finitely many elements.',
            'A function assigns outputs to inputs.',
            'Mappings can be represented by ordered pairs.',
          ],
          provenance: {
            source: 'compiler-owned-exact-source-ledger',
            authority: 'admitted-evidence-authority',
            copiedFactsVerbatim: true,
          },
        },
      };
    const out = compileBlueprintDeliverables(bp, ['quizBank', 'lessonPlans']);
    expect(
      out.quizBank.quizzes[1].questions.every((q) => q.enrichmentSource === 'compiler-verified-discrete-math'),
    ).toBe(true);
    expect(out.lessonPlans.lessonPlans[2].workedExample.steps.join(' ')).toContain('Induction hypothesis');
  });
  it('compiles real mathematical work through stored blueprints, even with a conflicting model default', () => {
    const bp = JSON.parse(JSON.stringify(compactBlueprintForStorage(make())));
    const out = compileBlueprintDeliverables(
      bp,
      ['syllabus', 'lessonPlans', 'studyGuides', 'slideDecks', 'quizBank', 'assignments'],
      { configMap: { quizBank: { questionsPerLesson: 6 } } },
    );
    expect(out.syllabus.syllabus.prerequisites).toContain('elementary algebra');
    expect(out.quizBank.quizzes.map((q) => q.questions.length)).toEqual([4, 4, 4]);
    const [logic, functions, induction] = out.quizBank.quizzes;
    expect(logic.questions[0].sampleAnswer).toBe('T, F, T, T');
    expect(logic.questions[1].sampleAnswer).toBe('T, T, F, T');
    expect(functions.questions.every((q) => q.question.startsWith('Let f:'))).toBe(true);
    expect(functions.questions[1].explanation).toContain('The inputs b and c');
    expect(functions.questions.map((q) => q.sampleAnswer)).toEqual([
      'Injective and not surjective.',
      'Not injective and surjective.',
      'Injective and surjective.',
      'Not injective and not surjective.',
    ]);
    expect(induction.questions[3].sampleAnswer).toBe('(k+1)(k+2)/2');
    for (const quiz of out.quizBank.quizzes)
      for (const q of quiz.questions) {
        expect(q.options[q.answerIndex]).toBe(`${q.answer}. ${q.sampleAnswer}`);
        expect(new Set(q.options.map((s) => s.slice(3))).size).toBe(4);
        expect(q.sourceReviewRequired).toBe(false);
        expect(q.practiceRecord.records.join(' ')).not.toContain('Record A - Objective');
      }
    for (const feature of ['lessonPlans', 'studyGuides']) {
      expect(out[feature][feature]).toHaveLength(3);
      expect(out[feature][feature][1].workedExample.steps.join(' ')).toContain('image = {1, 2, 3}');
      const proof = out[feature][feature][2].workedExample;
      expect(proof.steps.join(' ')).toContain('Induction hypothesis');
      expect(proof.steps.join(' ')).toContain('(k+1)(k+2)/2');
    }
    expect(out.studyGuides.studyGuides.every((g) => g.keyTerms.length >= 3)).toBe(true);
    expect(JSON.stringify(out.slideDecks.decks[2].slides)).toContain('Base case n=1');
    expect(out.assignments.assignments[1].instructions.join(' ')).toContain('g(a)=1');
  });
});
