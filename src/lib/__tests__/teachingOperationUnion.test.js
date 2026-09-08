import { sha256HexSync } from '../sha256Sync.js';
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
  it('preserves every legacy presentation byte while new tasks explicitly assess both sets', () => {
    const hashes = {
      'en-3': '75565fa1a0ebeb3fae3927c5790fcc23a403f413fb4a6cd3ea200c8018650808',
      'en-4': '31024ed7f3d0a6c2cbfac5541cbd4ea5995f966e339510caec7e903d6ccf4030',
      'en-5': 'e944d33e3df4ef7deea7e9ede56bbb92d461bda4af242030a94fe91c75a02685',
      'zh-3': '5eafc747fdb5e962d598311042652998dad49945fa88591fa09ee69c2f0a3484',
      'zh-4': 'bf1687d2deb514c518c2925d8f1c493b1e0c2ad0120c5b54c20b61e8ef48c02f',
      'zh-5': '6862f777d8048bd2dc9f11e2cd73adc01c77163bec4445ffbfbed87fee11baed',
    };
    for (const zh of [false, true]) {
      const f = unionCountsFixture(zh);
      const plan = createTeachingOperationPlan({
        operation: 'union-bounds',
        inputs: f.inputs,
        bindings: f.bindings,
        admission: { kind: 'teacher-confirmed' },
      });
      expect(plan.presentationVersion).toBe(6);
      const task = renderTeachingOperationTask(plan, f.inputs, f.objective);
      expect(task.question).toContain(
        zh ? '两次都参加的人数的全部可能整数' : 'every possible integer count attending both',
      );
      expect(task.answer).toContain(
        zh ? '从 15 到 30 的每个整数 x 都可实现' : 'Every integer x from 15 through 30 is possible',
      );
      expect(task.answer).toContain(
        zh ? '并集和交集不能各自独立任选' : 'the two counts cannot be chosen independently',
      );
      const criterion = task.criteria.find((row) => row.id === 'operation');
      expect(criterion.levels.proficient).toContain('15');
      expect(criterion.levels.proficient).toContain('30');
      expect(criterion.levels.proficient).toContain('35');
      const alternative = task.contrastResponses.find((row) => row.id === 'alternative-representation');
      expect(alternative.judgments.find((row) => row.criterionId === 'operation').evidence[0].quote).toContain(
        zh ? '每个整数 x' : 'Every integer x',
      );
      expect(task.contrastResponses.find((row) => row.id === 'misconception').judgments[0].level).toBe('beginning');
      for (const presentationVersion of [3, 4, 5]) {
        const old = renderTeachingOperationTask({ ...plan, presentationVersion }, f.inputs, f.objective);
        expect(sha256HexSync(JSON.stringify(old))).toBe(hashes[`${zh ? 'zh' : 'en'}-${presentationVersion}`]);
      }
    }
  });

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
      const errorIndex = guidance.findIndex((line) => line.startsWith(zh ? '错误示例：' : 'Error example:'));
      expect(errorIndex).toBeGreaterThanOrEqual(0);
      expect(guidance[errorIndex + 1]).toContain(zh ? '注意到缺失重叠' : 'Notices missing overlap');
      expect(guidance[errorIndex + 1]).not.toContain(zh ? '界限正确' : 'Correct bounds');
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
