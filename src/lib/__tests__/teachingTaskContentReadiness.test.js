import { describe, expect, it } from 'vitest';
import fixture from '../../../benchmarks/classroom/v2/cases/d-c04-recurring.json';
import { buildCourseBlueprint, compileBlueprintDeliverables } from '../courseBlueprintCompiler.js';
import { repairDeliverableContentQuality } from '../contentQualityRepair.js';
import { evaluateWorkspaceReadiness } from '../deliverableReadiness.js';
import { runDeterministicPackageFinalizer } from '../packageFinalizer.js';
import { addSemanticTrustAdmissionFindings } from '../quality/deepQualityTrustAdmission.js';

describe('specific answer readiness', () => {
  it('preserves canonical assignment sources and reasoning through the complete package finalizer', () => {
    const map = {
      courseName: 'Rounding',
      lessons: [
        {
          title: 'Lesson 1: Seven of 12 fictional test strips changed color',
          sections: [{ learningObjectives: fixture.request }],
        },
      ],
    };
    const blueprint = buildCourseBlueprint(map, {
      instructorProvidedFacts: fixture.sources,
      sourceBrief: fixture.request,
      sessionMinutes: fixture.sessionMinutes,
    });
    const compiled = compileBlueprintDeliverables(blueprint, ['assignments', 'lessonPlans', 'discussions']);
    const original = structuredClone(compiled.assignments.assignments[0]);
    const result = runDeterministicPackageFinalizer({
      courseMap: map,
      blueprint,
      sourceBrief: fixture.request,
      selectedFeatures: ['assignments', 'lessonPlans', 'discussions'],
      deliverables: Object.fromEntries(
        ['assignments', 'lessonPlans', 'discussions'].map((id) => [id, { status: 'done', data: compiled[id] }]),
      ),
    });
    const assignment = result.deliverables.assignments.data.assignments[0];
    expect(assignment.supportResources).toEqual(original.supportResources);
    for (const source of fixture.sources) expect(JSON.stringify(assignment.supportResources)).toContain(source);
    expect(original.workedExample).toBeTruthy();
    expect(assignment.workedExample).toEqual(original.workedExample);
    expect(assignment.gradingCriteria).toEqual(original.gradingCriteria);
    expect(assignment.overview).toBe(original.overview);
    expect(JSON.stringify(compiled.assignments.assignments[0])).toBe(JSON.stringify(original));
    const plan = result.deliverables.lessonPlans.data.lessonPlans[0];
    const catchUp = plan.outline.map((step) => step.catchUpPlan || '').join(' ');
    expect(catchUp).toContain(fixture.sources[0]);
    expect(JSON.stringify(result.deliverables)).not.toContain('the Seven fictional test focus');
  });

  it('keeps complete source limitations through the production repetition-repair pass', () => {
    const map = {
      courseName: 'Rounding',
      lessons: [{ title: 'Rounding', sections: [{ learningObjectives: fixture.request }] }],
    };
    const blueprint = buildCourseBlueprint(map, {
      instructorProvidedFacts: fixture.sources,
      sourceBrief: fixture.request,
      sessionMinutes: fixture.sessionMinutes,
    });
    const original = compileBlueprintDeliverables(blueprint, ['studyGuides']).studyGuides;
    const fixed = repairDeliverableContentQuality('studyGuides', original, { sourceFacts: fixture.sources }).data;
    const guide = fixed.studyGuides[0];
    expect(guide.conceptConnections).toEqual(original.studyGuides[0].conceptConnections);
    expect(guide.commonMisconceptions).toEqual(original.studyGuides[0].commonMisconceptions);
    expect(JSON.stringify(guide.conceptConnections)).toContain('other batches were not tested');
    expect(JSON.stringify(guide)).not.toContain('the cited evidence on strips');
    expect(JSON.stringify(guide)).not.toContain('the source statement about strips');
  });

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
