import { describe, expect, it } from 'vitest';
import fixture from '../../../benchmarks/classroom/v2/cases/d-c04-recurring.json';
import { buildCourseBlueprint, compileBlueprintDeliverables } from '../courseBlueprintCompiler.js';
import { evaluateWorkspaceReadiness } from '../deliverableReadiness.js';
import { addSemanticTrustAdmissionFindings } from '../quality/deepQualityTrustAdmission.js';

describe('specific answer readiness', () => {
  it('fills the final compiler-owned written question with a source-specific revision and matching key', () => {
    const map = {
      courseName: 'Rounding',
      lessons: [{ title: 'Rounding', sections: [{ learningObjectives: fixture.request }] }],
    };
    const blueprint = buildCourseBlueprint(map, {
      instructorProvidedFacts: fixture.sources,
      sourceBrief: fixture.request,
      sessionMinutes: fixture.sessionMinutes,
    });
    const output = compileBlueprintDeliverables(blueprint, ['quizBank']);
    const questions = output.quizBank.quizzes[0].questions;
    expect(questions).toHaveLength(8);
    const retry = questions.find((question) => question.practiceKind === 'feedback-retry');
    const transfer = questions.find((question) => question.practiceKind === 'independent-transfer');
    expect(retry).toBeDefined();
    expect(retry.answer).toBe(transfer.answer);
    expect(retry.sourceReviewRequired).toBe(false);
    expect(retry.question).toContain('Feedback:');
    expect(retry.question).not.toContain('professional decision');
  });
  it('does not require multiple-choice distractors in a constructed-response bank, but rejects a missing claimed tuple', () => {
    const tupleFindings = (total) => {
      const found = [];
      addSemanticTrustAdmissionFindings(
        { add: (finding) => found.push(finding) },
        {
          manifest: {
            semanticClaimInventory: {
              assessmentTupleIntegrity: {
                protocol: 'coursemapper-assessment-tuple-integrity-v1',
                total,
                structurallyComplete: 0,
                reviewRequired: 0,
                rows: [],
              },
            },
          },
        },
        String,
      );
      return found.filter((finding) => finding.code === 'assessment-tuple-integrity-unresolved');
    };
    expect(tupleFindings(0)).toHaveLength(0);
    expect(tupleFindings(1)).toHaveLength(1);
  });
  const courseMap = { lessons: [{ title: 'One' }, { title: 'Two' }] };
  const deliverables = {
    quizBank: {
      status: 'done',
      data: {
        quizzes: [1, 2].map((lessonNumber) => ({
          lessonNumber,
          lessonTitle: lessonNumber === 1 ? 'One' : 'Two',
          questions: [
            {
              type: 'short_answer',
              question: 'Explain this specific observation.',
              answer: 'General evidence guidance.',
              sourceReviewRequired: lessonNumber === 2,
            },
          ],
        })),
      },
    },
  };
  const review = (lessonFilter) =>
    evaluateWorkspaceReadiness({
      courseMap,
      deliverables,
      selectedFeatures: ['quizBank'],
      lessonFilter,
    }).warnings.filter((issue) => issue.message.includes('instructor-reviewed answer'));
  it('reports missing keys only in the selected lesson scope', () => {
    expect(review([0])).toHaveLength(0);
    expect(review([1])).toHaveLength(1);
    expect(review(null)[0].message).toContain('1 question needs');
  });
});
