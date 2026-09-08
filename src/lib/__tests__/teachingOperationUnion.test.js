import { describe, it, expect } from 'vitest';
import { solveTeachingUnionBounds } from '../teachingSetArithmetic.js';

describe('exact union bounds and constructive membership partitions', () => {
  it('updates the overlap and witnesses even when the resulting union range stays unchanged', () => {
    const before = solveTeachingUnionBounds('50', '35', '30');
    const after = solveTeachingUnionBounds('50', '35', '20');
    expect([before.lower.percent, before.upper.percent]).toEqual(['70', '100']);
    expect([after.lower.percent, after.upper.percent]).toEqual(['70', '100']);
    expect([before.overlapMinimum, before.overlapMaximum]).toEqual(['15', '30']);
    expect([after.overlapMinimum, after.overlapMaximum]).toEqual(['5', '20']);
    expect(before.minimum).toEqual({ firstOnly: '5', secondOnly: '0', both: '30', neither: '15', union: '35' });
    expect(after.minimum).toEqual({ firstOnly: '15', secondOnly: '0', both: '20', neither: '15', union: '35' });
  });
  it('agrees with exhaustive possible overlaps and conserves each group and population', () => {
    for (let n = 1; n <= 12; n++)
      for (let a = 0; a <= n; a++)
        for (let b = 0; b <= n; b++) {
          const possible = [];
          for (let x = 0; x <= n; x++) if (x <= a && x <= b && a + b - x <= n) possible.push(a + b - x);
          const result = solveTeachingUnionBounds(String(n), String(a), String(b));
          expect(Number(result.minimum.union)).toBe(Math.min(...possible));
          expect(Number(result.maximum.union)).toBe(Math.max(...possible));
          expect(result.exactUnion).toBe(new Set(possible).size === 1);
          for (const w of [result.minimum, result.maximum]) {
            expect(Number(w.firstOnly) + Number(w.both)).toBe(a);
            expect(Number(w.secondOnly) + Number(w.both)).toBe(b);
            expect(Number(w.union) + Number(w.neither)).toBe(n);
            expect(Object.values(w).every((value) => Number(value) >= 0)).toBe(true);
          }
        }
  });
  it('recognizes exact boundary cases and refuses invalid counts', () => {
    expect(solveTeachingUnionBounds('50', '0', '20').exactUnion).toBe(true);
    expect(solveTeachingUnionBounds('50', '50', '20').lower.percent).toBe('100');
    for (const counts of [
      ['0', '0', '0'],
      ['50', '51', '20'],
      ['50', '-1', '20'],
      ['50', '3.5', '20'],
    ])
      expect(solveTeachingUnionBounds(...counts)).toBeNull();
  });
});

import { unionCountsFixture } from '../../../tests/fixtures/teaching/unionCounts.js';
import { createTeachingOperationPlan, validateTeachingOperationPlan } from '../teachingOperationPlan.js';
import { renderTeachingOperationTask } from '../teachingOperationTask.js';
import { buildCourseBlueprint, compileBlueprintDeliverables } from '../courseBlueprintCompiler.js';
import {
  createNewTeachingTaskReviewDraft,
  createTeachingTaskReviewDraft,
  previewTeachingTaskReview,
  commitTeachingTaskReview,
} from '../teachingTaskReview.js';
import { readTeachingTaskSources } from '../teachingProgram.js';
import { rebuildTeachingTaskSource } from '../teachingTaskSource.js';

describe('reviewed union material contract', () => {
  for (const zh of [false, true])
    it(`keeps shared reasoning current across nine projections and reopen (${zh ? 'zh' : 'en'})`, () => {
      const f = unionCountsFixture(zh);
      const plan = createTeachingOperationPlan({
        operation: 'union-bounds',
        inputs: f.inputs,
        bindings: f.bindings,
        admission: { kind: 'teacher-confirmed' },
      });
      const task = renderTeachingOperationTask(plan, f.inputs, f.objective);
      expect(task.answer).toContain('15 ≤ x ≤ 30');
      expect(task.answer).toContain('35/50 = 70%');
      expect(task.criteria.map((c) => c.weight)).toEqual([30, 40, 30]);
      for (const response of task.contrastResponses)
        for (const judgment of response.judgments)
          for (const evidence of judgment.evidence) {
            expect(evidence.start).toBeGreaterThanOrEqual(0);
            expect(response.response.slice(evidence.start, evidence.end)).toBe(evidence.quote);
          }
      expect(
        renderTeachingOperationTask({ ...plan, admission: { kind: 'model-proposal' } }, f.inputs, f.objective),
      ).toBeNull();
      const missing = structuredClone(plan);
      delete missing.bindings.stablePopulation;
      expect(validateTeachingOperationPlan(missing, f.inputs).valid).toBe(false);
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
      const courseMap = {
        courseName: 'Participation bounds',
        lessons: [
          {
            title: 'Overlapping memberships',
            sections: [{ topicSection: 'Set bounds', learningObjectives: f.objective }],
          },
        ],
      };
      const compiled = compileBlueprintDeliverables(buildCourseBlueprint(courseMap), features);
      const deliverables = Object.fromEntries(
        features.map((id) => [id, { status: 'done', stale: false, data: compiled[id] }]),
      );
      const apply = (state) => {
        const preview = previewTeachingTaskReview(state);
        expect(preview.status, preview.message).toBe('preview');
        const result = commitTeachingTaskReview({ ...state, preview, teacherConfirmed: true });
        expect(result.status, result.message).toBe('applied');
        expect(Object.keys(result.changed).sort()).toEqual([...features].sort());
        return { courseMap: result.courseMap, deliverables: { ...state.deliverables, ...result.changed } };
      };
      const draft = createNewTeachingTaskReviewDraft(courseMap, { lessonNumber: 1, operation: 'union-bounds' });
      Object.assign(draft, { inputs: f.inputs, bindings: f.selections, objective: f.objective });
      const initial = apply({ courseMap, deliverables, draft });
      const guidance = initial.deliverables.assignments.data.assignments[0].anchorExampleGuidance;
      expect(guidance[2]).toContain(zh ? '注意到缺失重叠' : 'Notices missing overlap');
      expect(guidance[2]).not.toContain(zh ? '界限正确' : 'Correct bounds');
      const source = readTeachingTaskSources(initial.courseMap)[0];
      const transfer = rebuildTeachingTaskSource(source).sequence.find((u) => u.kind === 'independent-transfer');
      expect(transfer.answer).toContain('18/40 = 45%');
      expect(transfer.answer).toContain('30/40 = 75%');
      expect(transfer.question).not.toContain('18/40');
      const edit = createTeachingTaskReviewDraft(source, initial.deliverables.rubrics.data, 'rubrics');
      edit.inputs[1].text = edit.inputs[1].text.replace('30', '20');
      edit.bindings.secondCount.quote = '20';
      const updated = apply({ ...initial, draft: edit });
      const after = rebuildTeachingTaskSource(
        readTeachingTaskSources(JSON.parse(JSON.stringify(updated.courseMap)))[0],
      );
      expect(after.id).toBe(rebuildTeachingTaskSource(source).id);
      expect(after.answer).toContain('5 ≤ x ≤ 20');
      expect(after.answer).toContain('35/50 = 70%');
      for (const id of ['assignments', 'rubrics', 'quizBank', 'studyGuides']) {
        const text = JSON.stringify(updated.deliverables[id].data);
        expect(text, id).toContain('5 ≤ x ≤ 20');
        expect(text, id).not.toContain('15 ≤ x ≤ 30');
      }
    });
});

import { sourceQuantityTask } from '../teachingTaskQuantityOperations.js';
it('does not teach false uncertainty for empty or full events in the legacy explicit grammar', () => {
  for (const first of ['0', '50']) {
    const task = sourceQuantityTask(
      [
        `A fictional society has 50 members; ${first} attended a rehearsal and 20 attended a performance.`,
        'The overlap is unknown.',
        'The counts are distinct members within each event.',
      ],
      'Find the fraction of members attending at least one event.',
    );
    expect(task).not.toBeNull();
    expect(task.answer).toContain('Both bounds coincide');
    expect(task.answer).not.toContain('exact union proportion is not determined');
  }
});
