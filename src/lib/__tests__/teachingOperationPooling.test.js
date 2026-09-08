import { describe, it, expect } from 'vitest';
import { pooledCountsFixture } from '../../../tests/fixtures/teaching/pooledCounts.js';
import {
  createTeachingOperationPlan,
  evaluateTeachingOperationPlan,
  validateTeachingOperationPlan,
} from '../teachingOperationPlan.js';
import { renderTeachingOperationTask } from '../teachingOperationTask.js';
import { evaluatePooling } from '../teachingOperationPooling.js';
import { buildCourseBlueprint, compileBlueprintDeliverables } from '../courseBlueprintCompiler.js';
import {
  createNewTeachingTaskReviewDraft,
  createTeachingTaskReviewDraft,
  previewTeachingTaskReview,
  commitTeachingTaskReview,
} from '../teachingTaskReview.js';
import { readTeachingTaskSources } from '../teachingProgram.js';
import { rebuildTeachingTaskSource } from '../teachingTaskSource.js';

const planFor = (f, admission = { kind: 'teacher-confirmed' }) =>
  createTeachingOperationPlan({ operation: 'pooled-proportion', inputs: f.inputs, bindings: f.bindings, admission });
const features = [
  'syllabus',
  'lessonPlans',
  'slideDecks',
  'assignments',
  'rubrics',
  'discussions',
  'quizBank',
  'studyGuides',
  'courseFaq',
];
const accept = (state) => {
  const preview = previewTeachingTaskReview(state);
  expect(preview.status, preview.message).toBe('preview');
  const result = commitTeachingTaskReview({ ...state, preview, teacherConfirmed: true });
  expect(result.status, result.message).toBe('applied');
  return { courseMap: result.courseMap, deliverables: { ...state.deliverables, ...result.changed }, result };
};

describe('reviewed pooling of distinct counted groups', () => {
  it('uses the same calculation and distinct Chinese task and transfer wording', () => {
    const f = pooledCountsFixture(true),
      plan = planFor(f);
    const body = renderTeachingOperationTask(plan, f.inputs, f.objective);
    expect(body.language).toBe('zh');
    expect(body.answer).toContain('21/60 = 35%');
    expect(body.answer).toContain('组百分比的等权平均 = 50%');
    expect(body.criteria.every((criterion) => new Set(Object.values(criterion.levels)).size === 4)).toBe(true);
  });
  it('calculates 35% item weighting and 50% group weighting from the exposed number-word source', () => {
    const f = pooledCountsFixture(),
      plan = planFor(f);
    const result = evaluateTeachingOperationPlan(plan, f.inputs, f.objective);
    expect(result.pooled.percent).toBe('35');
    expect(result.equalGroupMean.percent).toBe('50');
    expect(result.part).toBe('21');
    expect(result.whole).toBe('60');
    const task = renderTeachingOperationTask(plan, f.inputs, f.objective);
    expect(task.criteria.map((c) => c.weight)).toEqual([30, 40, 30]);
    expect(task.answer).toContain('(12/60) × (9/12)');
    expect(task.answer).toContain(f.selections.distinctMembership.quote);
    expect(task.answer).toContain('different borrower groups');
    expect(task.contrastResponses).toHaveLength(4);
    for (const example of task.contrastResponses)
      for (const judgment of example.judgments)
        for (const span of judgment.evidence) {
          expect(span.start).toBeGreaterThanOrEqual(0);
          expect(example.response.slice(span.start, span.end)).toBe(span.quote);
        }
  });
  it('does not admit a missing membership role, a reused number occurrence, or an unconfirmed model proposal', () => {
    const f = pooledCountsFixture(),
      plan = planFor(f);
    const missing = structuredClone(plan);
    delete missing.bindings.distinctMembership;
    expect(validateTeachingOperationPlan(missing, f.inputs).valid).toBe(false);
    const reused = structuredClone(plan);
    reused.bindings.secondPart = reused.bindings.firstWhole;
    expect(validateTeachingOperationPlan(reused, f.inputs).issues.some((issue) => issue.code === 'plan-pooling')).toBe(
      true,
    );
    expect(renderTeachingOperationTask(planFor(f, { kind: 'model-proposal' }), f.inputs, f.objective)).toBeNull();
    const stale = structuredClone(f.inputs);
    stale[1].text += ' A later note says some tablets were transferred.';
    expect(validateTeachingOperationPlan(plan, stale).valid).toBe(false);
  });
  it('retains exact compiler arithmetic when intermediate products exceed source-count limits', () => {
    const result = evaluatePooling({
      firstPart: '999999998',
      firstWhole: '999999999',
      secondPart: '999999997',
      secondWhole: '999999998',
    });
    expect(result.pooled.numerator).toBe('1999999995');
    expect(result.pooled.denominator).toBe('1999999997');
    expect(result.equalGroupMean).not.toBeNull();
    expect(result.pooled.exact).toBe(false);
  });
  it('creates and updates a shared task across all nine material projections, then reopens it', () => {
    const f = pooledCountsFixture();
    const courseMap = {
      courseName: 'Tablet return decisions',
      lessons: [
        {
          title: 'Combining observations',
          sections: [{ topicSection: 'Counts and weights', learningObjectives: f.objective }],
        },
      ],
    };
    const compiled = compileBlueprintDeliverables(buildCourseBlueprint(courseMap), features);
    const deliverables = Object.fromEntries(
      features.map((id) => [id, { status: 'done', stale: false, data: compiled[id] }]),
    );
    const draft = createNewTeachingTaskReviewDraft(courseMap, { lessonNumber: 1, operation: 'pooled-proportion' });
    Object.assign(draft, { inputs: f.inputs, bindings: f.selections, objective: f.objective });
    const initial = accept({ courseMap, deliverables, draft });
    expect(Object.keys(initial.result.changed).sort()).toEqual([...features].sort());
    const quiz = initial.deliverables.quizBank.data.quizzes[0];
    expect(quiz.questions.filter((question) => question.practiceKind).map((question) => question.points)).toEqual([
      12, 20, 2, 2, 0,
    ]);
    const guide = initial.deliverables.studyGuides.data.studyGuides[0];
    expect(guide.summary).toContain('denominator weights');
    expect(guide.workedExample.result.length).toBeLessThan(300);
    const source = readTeachingTaskSources(initial.courseMap)[0];
    expect(rebuildTeachingTaskSource(source).answer).toContain('21/60');
    const transfer = rebuildTeachingTaskSource(source).sequence.find((unit) => unit.kind === 'independent-transfer');
    expect(transfer.answer).toContain('40/80 = 50%');
    expect(transfer.answer).toContain('60%');
    expect(transfer.question).not.toContain('40/80');
    const edit = createTeachingTaskReviewDraft(source, initial.deliverables.rubrics.data, 'rubrics');
    edit.inputs[0].text = edit.inputs[0].text.replace('twelve of the forty-eight', 'twenty-four of the forty-eight');
    edit.bindings.secondPart = { ...edit.bindings.secondPart, quote: 'twenty-four', occurrence: 0 };
    const updated = accept({ ...initial, draft: edit });
    expect(Object.keys(updated.result.changed).sort()).toEqual([...features].sort());
    const reopened = JSON.parse(JSON.stringify(updated.courseMap));
    const after = rebuildTeachingTaskSource(readTeachingTaskSources(reopened)[0]);
    expect(after.id).toBe(rebuildTeachingTaskSource(source).id);
    expect(after.answer).toContain('33/60 = 55%');
    expect(after.answer).toContain('62.5%');
    for (const feature of ['assignments', 'quizBank', 'studyGuides', 'rubrics']) {
      const text = JSON.stringify(updated.deliverables[feature].data);
      expect(text, feature).toContain('33/60');
      expect(text, feature).not.toContain('21/60');
    }
  });
});

it('does not mistake explicit membership uncertainty for evidence of disjoint groups', async () => {
  const { poolingMembershipEvidenceIssue } = await import('../teachingOperationPooling.js');
  for (const text of [
    'Whether the groups share learners is unknown.',
    'The report does not state whether any participants belong to both groups.',
    '两组是否有重复学员尚未说明。',
    '组间重叠人数未知。',
  ])
    expect(poolingMembershipEvidenceIssue(text)?.binding).toBe('distinctMembership');
  for (const text of [
    'Each reader is enrolled in only one circle; the circles have no members in common.',
    '两组没有重复学员。',
    'Prior experience is unknown. The groups share no learners.',
  ])
    expect(poolingMembershipEvidenceIssue(text)).toBeNull();
});
