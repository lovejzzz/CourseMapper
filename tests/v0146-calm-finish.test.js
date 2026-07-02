/**
 * v0.14.6 — fixes from the live Calculus I run (run-1781243864054).
 *
 * (1) Exam-frame phrase rotation: the final exam covered all 15 lessons and
 *     stamped the same correct-option tail ("…decision and names the
 *     evidence that supports it") 15× inside ONE quiz-bank section — over
 *     the export shingle audit's limit of 12. The Understand frame now
 *     rotates five equivalent phrasings by covered position; within any one
 *     exam section no template repeats at audit frequency, and no two
 *     variants share an 8-word chunk (the audit's shingle size).
 */
import { describe, expect, it } from 'vitest';

import { compileBlueprintDeliverables } from '../src/lib/courseBlueprintCompiler';
import { buildBlueprintFromGraph, deriveCourseGraphFromCourseMap } from '../src/lib/courseGraph';
import { buildSlideDeckPptxBlob } from '../src/lib/exporters/pptxExporter';
import { auditOfficeBlobRepetition } from '../src/lib/exportRenderedTextAudit';

// 15-lesson Calculus-like course whose final lesson carries a comprehensive
// final exam — the live shape that produced the 15× repetition warning.
function calculusCourseMap() {
  const topics = [
    'Limits and Function Behavior',
    'Limit Laws and Algebraic Techniques',
    'Continuity and Discontinuities',
    'Derivative Definition and Tangent Lines',
    'Differentiation Rules I',
    'Differentiation Rules II',
    'Chain Rule',
    'Implicit Differentiation',
    'Related Rates',
    'Optimization',
    'Curve Sketching',
    'Mixed Differentiation Fluency',
    'Integration Basics I',
    'Integration Basics II',
    'Cumulative Review',
  ];
  const lessons = topics.map((title, index) => {
    const lessonNumber = index + 1;
    const isFinal = lessonNumber === topics.length;
    return {
      title: `Lesson ${lessonNumber}: ${title}`,
      sections: [
        {
          topicSection: `${lessonNumber}.1: ${title}`,
          learningGoals: `1. Reason about ${title.toLowerCase()} with graphs and algebra.`,
          learningObjectives: `Apply ${title.toLowerCase()} to worked problems.\nEvaluate solution validity with units and graphs.`,
          weeklyAssessments: isFinal
            ? `Final Exam: comprehensive assessment of Lessons 1–15`
            : `Problem Set: ${title.toLowerCase()} practice`,
          asyncActivities: `Read the ${title.toLowerCase()} notes.`,
          syncActivities: `Board work: ${title.toLowerCase()} examples.`,
          supportingResources: `Course problem bank for ${title.toLowerCase()}`,
        },
      ],
    };
  });
  return { courseName: 'Calculus I: Limits and Derivatives', semester: 'Fall 2026', lessons };
}

// The audit flags any 8-word phrase repeated >= 12 times within a section;
// mirror its normalization closely enough to count template-level repeats.
function worstShingleCount(texts, size = 8) {
  const counts = new Map();
  for (const text of texts) {
    const words = String(text)
      .toLowerCase()
      .replace(/[^a-z0-9' ]+/g, ' ')
      .split(/\s+/)
      .filter(Boolean);
    const seenInText = new Set();
    for (let i = 0; i + size <= words.length; i++) {
      const shingle = words.slice(i, i + size).join(' ');
      if (seenInText.has(shingle)) continue; // count per option, not per overlap
      seenInText.add(shingle);
      counts.set(shingle, (counts.get(shingle) || 0) + 1);
    }
  }
  let worst = 0;
  for (const count of counts.values()) worst = Math.max(worst, count);
  return worst;
}

describe('v0.14.6 (1) — exam correct-option rotation stays under the shingle audit', () => {
  const graph = deriveCourseGraphFromCourseMap(calculusCourseMap());
  const blueprint = buildBlueprintFromGraph(graph);
  const compiled = compileBlueprintDeliverables(blueprint, ['quizBank']);
  const exam = compiled.quizBank.quizzes.find((quiz) => quiz.kind === 'exam');

  it('the comprehensive final still mints one Understand item per covered lesson', () => {
    expect(exam).toBeTruthy();
    const understandItems = exam.questions.filter(
      (question) => question.type === 'multiple_choice' && question.bloomsLevel === 'Understand',
    );
    expect(understandItems.length).toBeGreaterThanOrEqual(12);
  });

  it('correct options rotate phrasings: no 8-word shingle reaches the audit limit of 12', () => {
    const correctOptions = exam.questions
      .filter((question) => question.type === 'multiple_choice')
      .map((question) => {
        const letter = String(question.answer || '')
          .trim()
          .charAt(0);
        const index = letter ? letter.charCodeAt(0) - 65 : -1;
        return Array.isArray(question.options) && index >= 0 ? question.options[index] : '';
      })
      .filter(Boolean);
    expect(correctOptions.length).toBeGreaterThanOrEqual(12);
    // The live failure repeated one tail 15x; rotation caps any shared
    // 8-word chunk at ceil(15/5) = 3 — well under the audit's 12.
    expect(worstShingleCount(correctOptions)).toBeLessThan(12);
    expect(worstShingleCount(correctOptions)).toBeLessThanOrEqual(4);
  });

  it('at least four distinct phrasings appear across the covered lessons', () => {
    const understandCorrect = exam.questions
      .filter((question) => question.type === 'multiple_choice' && question.bloomsLevel === 'Understand')
      .map((question) => {
        const letter = String(question.answer || '')
          .trim()
          .charAt(0);
        const index = letter ? letter.charCodeAt(0) - 65 : -1;
        return Array.isArray(question.options) && index >= 0 ? question.options[index] : '';
      });
    const signatures = new Set(
      understandCorrect.map((option) =>
        String(option)
          // Drop the variable slots (concept + lesson focus) to expose the template skeleton.
          .toLowerCase()
          .replace(/[^a-z ]+/g, ' ')
          .split(/\s+/)
          .slice(-4)
          .join(' '),
      ),
    );
    expect(signatures.size).toBeGreaterThanOrEqual(4);
  });
});

describe('v0.14.7.1 — long lesson titles stay under the mention budget in briefs/discussions', () => {
  // Live repro (US History run-1781276589370): "crisis and conservatism in
  // the late 20th century" ×12 within one section — 4-5 briefs per lesson,
  // each templated field naming the full title. The finalizer caps the full
  // title at 2 mentions per item; later mentions become "this lesson".
  const LONG_TITLE_MAP = {
    courseName: 'United States History since 1865',
    semester: 'Fall 2026',
    lessons: [
      {
        title: 'Lesson 1: Reconstruction and the New South',
        sections: [
          {
            topicSection: '1.1: Reconstruction and the New South',
            learningGoals: '1. Explain Reconstruction outcomes.',
            learningObjectives: 'Analyze Reconstruction sources.\nEvaluate competing narratives.',
            weeklyAssessments: 'Quiz: Reconstruction sources',
            asyncActivities: 'Read the assigned chapter.',
            syncActivities: 'Discussion seminar.',
            supportingResources: 'Primary source packet',
          },
        ],
      },
      {
        title: 'Lesson 2: Crisis and Conservatism in the Late 20th Century',
        sections: [
          {
            topicSection: '2.1: Crisis and Conservatism in the Late 20th Century',
            learningGoals: '1. Trace conservative political realignment.',
            learningObjectives: 'Analyze realignment evidence.\nEvaluate policy arguments.',
            weeklyAssessments:
              'DBQ Essay: stagflation and politics\nPrimary Source Set: campaign rhetoric\nReflection: deindustrialization\nQuiz: late 20th century shifts',
            asyncActivities: 'Annotate the campaign speeches.',
            syncActivities: 'Structured academic controversy.',
            supportingResources: 'Document-based question packet',
          },
        ],
      },
    ],
  };
  const FOCUS = /crisis and conservatism in the late 20th century/gi;
  const graph = deriveCourseGraphFromCourseMap(LONG_TITLE_MAP);
  const blueprint = buildBlueprintFromGraph(graph);
  const compiled = compileBlueprintDeliverables(blueprint, ['assignments', 'discussions']);

  // Identity fields (titles, lesson references, provenance lessonTitle keys)
  // KEEP the full title by design — the budget applies to prose. Mirror the
  // finalizer's skip philosophy when counting.
  const IDENTITY_KEYS = new Set([
    'title',
    'lessonTitle',
    'assessmentTitle',
    'assignmentTitle',
    'rubricTitle',
    'relatedLessons',
    'courseMapRef',
    'registryId',
    'assessmentId',
    'id',
    'name',
  ]);
  // The cap targets TOP-LEVEL prose fields only — nested structures are
  // shared across features (mutating them leaked into Lesson Plans live)
  // and the section renderers stamp top-level fields. Count what the cap
  // governs. v0.15.187: identity SPANS inside prose (the full "Lesson N:
  // <title>" reference) are exempt from the budget — compressing inside them
  // minted "Lesson 10: the lesson" placeholders in the live crucible round —
  // so strip them before counting, mirroring the finalizer's masking.
  const FULL_TITLE_SPAN = /Lesson\s*\d+\s*[:.\-–—]\s*crisis and conservatism in the late 20th century/gi;
  function proseMentions(item) {
    let sum = 0;
    for (const [key, value] of Object.entries(item)) {
      if (IDENTITY_KEYS.has(key) || typeof value !== 'string') continue;
      sum += (value.replace(FULL_TITLE_SPAN, '').match(FOCUS) || []).length;
    }
    return sum;
  }

  it('every brief/discussion item mentions the full title at most twice in PROSE fields', () => {
    for (const featureId of ['assignments', 'discussions']) {
      const items = compiled[featureId][featureId];
      expect(items.length).toBeGreaterThan(0);
      for (const item of items) {
        expect(proseMentions(item), `${featureId} item "${item.title || ''}" prose mentions`).toBeLessThanOrEqual(2);
      }
    }
  });

  it('per-section PROSE totals stay well under the export audit limit of 12', () => {
    for (const featureId of ['assignments', 'discussions']) {
      const total = compiled[featureId][featureId].reduce((sum, item) => sum + proseMentions(item), 0);
      expect(total, `${featureId} section prose total`).toBeLessThan(12);
    }
  });

  it('capped mentions read as prose ("this lesson"), not as holes', () => {
    const briefBodies = JSON.stringify(compiled.assignments.assignments);
    expect(briefBodies.toLowerCase()).toContain('this lesson');
  });
});

describe('v0.15.52 — slide speaker notes shorten repeated long artifact names before PPTX audit', () => {
  function projectManagementCourseMap() {
    return {
      courseName: 'Project Management',
      semester: 'Fall 2026',
      lessons: Array.from({ length: 12 }, (_, index) => {
        const lessonNumber = index + 1;
        const focus = [
          'Project charter',
          'Scope definition',
          'Work breakdown structures',
          'Schedule planning',
          'Risk response planning',
          'Stakeholder communication',
          'Resource planning',
          'Quality assurance',
          'Procurement decisions',
          'Predictive planning',
          'Project monitoring',
          'Closure review',
        ][index];
        return {
          title: `Lesson ${lessonNumber}: ${focus}`,
          sections: [
            {
              topicSection: `${lessonNumber}.1: ${focus}`,
              learningGoals: `1. Apply ${focus.toLowerCase()} to a realistic project decision.`,
              learningObjectives: `Explain the ${focus.toLowerCase()} evidence.\nJustify one project choice with tradeoff evidence.`,
              weeklyAssessments: 'Exit ticket using predictive planning to justify one approach comparison',
              asyncActivities: `Review assigned materials and prepare notes on ${focus.toLowerCase()}.`,
              syncActivities: `Discuss examples and practice applying ${focus.toLowerCase()}.`,
              supportingResources: 'Project Management Body of Knowledge excerpt',
            },
          ],
        };
      }),
    };
  }

  it('does not stamp the long exit-ticket artifact phrase into rendered PPTX notes', async () => {
    const graph = deriveCourseGraphFromCourseMap(projectManagementCourseMap());
    const blueprint = buildBlueprintFromGraph(graph);
    const compiled = compileBlueprintDeliverables(blueprint, ['slideDecks']);
    const notes = JSON.stringify(
      compiled.slideDecks.decks.flatMap((deck) => deck.slides.map((slide) => slide.notes || '')),
    );

    // The long exit-ticket phrase shortens to a lesson-specific reference
    // derived from the artifact's own head noun ("… approach comparison" →
    // "the Week N comparison"), not a generic rotation noun.
    expect(notes).toContain('the Week 1 comparison');
    expect((notes.match(/exit ticket using predictive planning to justify one/gi) || []).length).toBeLessThan(12);

    const blob = await buildSlideDeckPptxBlob(compiled.slideDecks, 'Project Management', 0);
    const finding = await auditOfficeBlobRepetition(blob, 'pptx');
    expect(finding, finding && `flagged "${finding.sample}" x${finding.count}`).toBeNull();
  });
});
