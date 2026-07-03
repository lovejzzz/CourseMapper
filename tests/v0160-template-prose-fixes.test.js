// v0.16 template-prose regression tests — five bug classes verified in the
// shipped Linear Algebra package (v0.16.0 DOCX audit):
//   1. Determiner collision: "Check your the Week 4 sets…" (finalizer short
//      artifact reference landing after your/their/an/two).
//   2. Fused sentences: "…would make you adjust it Use that answer…" and
//      "…changes the Week 4 sets Have students compare two…".
//   3. Global lens-noun misbinding: one lesson's concept ("invertibility
//      judgment", "solution structure") stamped course-wide.
//   4. Citation spliced mid-prose: "a visual map of the relevant Wikipedia
//      contributors. Independent politician. Wikipedia: https: evidence".
//   5. Matrix symbol mangled by article agreement: "pivot columns of An
//      indicate independent columns".
import { describe, expect, it } from 'vitest';
import {
  buildCourseBlueprint,
  compileBlueprintDeliverables,
  humanSourceCueLabel,
} from '../src/lib/courseBlueprintCompiler';
import { finalizeCompiledDeliverableLanguage } from '../src/lib/compiledLanguageFinalizer';

const LESSON_TOPICS = [
  ['Systems of Linear Equations', 'solution sets; row reduction; augmented matrices'],
  ['Vector Spaces and Span', 'span; linear combinations; subspaces'],
  ['Linear Independence and Basis', 'linear independence; basis; dimension'],
  ['Orthogonality', 'orthogonal projection; inner products; Gram-Schmidt'],
  ['Determinants', 'cofactor expansion; volume scaling; row operations'],
  ['Invertibility', 'invertible matrix theorem; matrix inverse; invertibility criteria'],
];

const makeLinearAlgebraCourseMap = () => ({
  courseName: 'Linear Algebra',
  semester: 'Fall 2026',
  lessons: LESSON_TOPICS.map(([topic, extras], index) => ({
    title: `Lesson ${index + 1}: ${topic}`,
    sections: [
      {
        topicSection: `${topic}; ${extras}`,
        learningObjectives: `Analyze ${topic} with worked evidence ${index + 1}; Evaluate reasoning tradeoffs ${index + 1}`,
        learningGoals: `Connect ${topic} to defensible written solutions ${index + 1}`,
        weeklyAssessments: `Problem set ${index + 1}`,
        asyncActivities: `Read course text chapter ${index + 1}; annotate worked examples`,
        syncActivities: `Small-group problem session ${index + 1}; instructor debrief`,
        supportingResources: `Course text chapter ${index + 1}; practice worksheet ${index + 1}`,
        evaluateDesign: `Score problem set reasoning and justification ${index + 1}`,
      },
    ],
  })),
});

const MISBOUND_LENS = {
  decisionNoun: 'invertibility judgment',
  evidenceNoun: 'solution structure',
};

describe('finalizer determiner collision (bug 1)', () => {
  const finalize = (text) => {
    const data = { entries: [{ body: text }] };
    finalizeCompiledDeliverableLanguage('lessonPlans', data, {});
    return data.entries[0].body;
  };

  it('drops the minted article after a possessive', () => {
    expect(finalize('Check your the Week 4 sets against the stronger anchor.')).toBe(
      'Check your Week 4 sets against the stronger anchor.',
    );
    expect(finalize('Peers strengthen their the Week 4 sets before submission.')).toContain('their Week 4 sets');
  });

  it('drops the minted article after a determiner with intervening modifiers', () => {
    expect(finalize('Write an evidence-backed the Week 11 sets recommendation.')).toContain(
      'an evidence-backed Week 11 sets recommendation',
    );
    expect(finalize('Norm scoring by contrasting two the Week 4 sets samples.')).toContain('two Week 4 sets samples');
  });

  it('never reaches across a phrase boundary', () => {
    expect(finalize('Bring a draft of the Week 4 sets to class.')).toContain('a draft of the Week 4 sets');
    expect(finalize('Students respond to the Week 4 sets feedback.')).toContain('to the Week 4 sets feedback');
  });
});

describe('finalizer article agreement guard (bug 5)', () => {
  const finalize = (text) => {
    const data = { entries: [{ body: text }] };
    finalizeCompiledDeliverableLanguage('quizBank', data, {});
    return data.entries[0].body;
  };

  it('leaves a mid-sentence capital "A" (matrix symbol) alone', () => {
    expect(finalize('The pivot columns of A indicate independent columns.')).toContain('of A indicate');
    expect(finalize('The rank of A equals the number of pivot columns.')).toContain('of A equals');
  });

  it('still fixes genuine article agreement at template joins', () => {
    expect(finalize('Students make a Energy decision from the data.')).toContain('an Energy decision');
    expect(finalize('A important step comes first.')).toContain('An important step');
  });
});

describe('lens-noun misbinding (bug 3)', () => {
  const blueprint = buildCourseBlueprint(makeLinearAlgebraCourseMap(), {
    enrichment: { lens: { ...MISBOUND_LENS } },
  });

  it('sanitizes a lesson-scoped decision/evidence noun out of the course lens', () => {
    expect(blueprint.enrichment.lens.decisionNoun).not.toBe('invertibility judgment');
    expect(blueprint.enrichment.lens.evidenceNoun).not.toBe('solution structure');
  });

  it('binds the specific noun only in the lesson that owns the concept', () => {
    const phrases = blueprint.enrichment.lessonPhrases;
    const lessonOne = blueprint.lessons[0];
    const invertibilityLesson = blueprint.lessons[5];
    // Lesson 1 must not teach with a Lesson 6 concept.
    expect(phrases[lessonOne.id].decisionMove).not.toMatch(/invertibility/i);
    // The owning lesson keeps the specific noun.
    expect(phrases[invertibilityLesson.id].decisionMove).toContain('invertibility judgment');
    // "solution structure" belongs to the solution-sets lesson, not Orthogonality.
    expect(phrases[blueprint.lessons[3].id].evidenceMove).not.toMatch(/solution structure/i);
    expect(phrases[lessonOne.id].evidenceMove).toContain('solution structure');
  });

  it('sanitizes a stale stored lens on the recompile path (blueprintLens)', () => {
    // Simulates a blueprint that arrives with the misbound AI lens already
    // stored on enrichment (the path that bypasses normalizeBlueprintEnrichment).
    const staleBlueprint = {
      ...blueprint,
      enrichment: { ...blueprint.enrichment, lens: { ...blueprint.enrichment.lens, ...MISBOUND_LENS } },
    };
    const compiled = compileBlueprintDeliverables(staleBlueprint, ['slideDecks', 'studyGuides']);
    const decks = compiled.slideDecks.decks;
    for (const deck of decks) {
      const text = JSON.stringify(deck);
      if (!/invertibility/i.test(String(deck.lessonTitle))) {
        // No other lesson's deck may carry the Lesson 6 concept as its
        // decision noun frame ("choose the invertibility judgment for …").
        expect(text).not.toMatch(/invertibility judgment/i);
      }
    }
    // Study guides read the sanitized course lens: the misbound evidence noun
    // no longer stamps guides for lessons that never teach solution sets.
    for (const guide of compiled.studyGuides.studyGuides.slice(1)) {
      expect(JSON.stringify(guide)).not.toMatch(/course solution structure/i);
    }
  });
});

describe('fused sentences (bug 2)', () => {
  const blueprint = buildCourseBlueprint(makeLinearAlgebraCourseMap(), {});
  const compiled = compileBlueprintDeliverables(blueprint, ['studyGuides', 'discussions']);

  it('study-guide metacognitive questions keep the sentence boundary', () => {
    const questions = compiled.studyGuides.studyGuides.flatMap((guide) =>
      (guide.reviewQuestions || []).map((entry) => String(entry.question || '')),
    );
    expect(questions.length).toBeGreaterThan(0);
    for (const question of questions) {
      // The shipped defect: "…would make you adjust it Use that answer…" /
      // "…it still fits Decide which…" — a follow-up sentence glued on with
      // no terminal punctuation.
      expect(question).not.toMatch(/[a-z] (?:Use that answer|Decide which|Turn the answer)/);
      for (const opener of ['Use that answer', 'Decide which', 'Turn the answer']) {
        const index = question.indexOf(opener);
        if (index > 0) {
          expect(question.slice(Math.max(0, index - 2), index)).toMatch(/[.?!]\s$/);
        }
      }
    }
  });

  it('discussion equity bullets keep the sentence boundary before the revision cue', () => {
    for (const discussion of compiled.discussions.discussions) {
      const equity = String(discussion.equityConsiderations || '');
      expect(equity).not.toMatch(/[a-z] (?:Have students compare|Ask students to choose|Students can prepare)/);
    }
  });
});

describe('citation spliced mid-prose (bug 4)', () => {
  it('reduces a ledger citation to its source title', () => {
    expect(
      humanSourceCueLabel(
        'Wikipedia contributors. Independent politician. Wikipedia: https://en.wikipedia.org/wiki/Independent_politician',
        'the lesson course materials',
      ),
    ).toBe('Independent politician');
  });

  it('never leaves a truncated URL scheme in the label', () => {
    const label = humanSourceCueLabel(
      'Wikipedia contributors. Independent politician. Wikipedia: https:',
      'the lesson course materials',
    );
    expect(label).not.toMatch(/https?:?/i);
  });

  it('falls back instead of using an author name as a noun', () => {
    expect(humanSourceCueLabel('Mieke De Cock', 'Orthogonality course materials')).toBe(
      'Orthogonality course materials',
    );
  });

  it('passes ordinary prose cues through unchanged', () => {
    expect(humanSourceCueLabel('Chapter 3 worked examples', 'fallback')).toBe('Chapter 3 worked examples');
    expect(humanSourceCueLabel('', 'fallback')).toBe('fallback');
    expect(humanSourceCueLabel('Linear Algebra', 'fallback')).toBe('Linear Algebra');
  });
});
