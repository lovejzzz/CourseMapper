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
