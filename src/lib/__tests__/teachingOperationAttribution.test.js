import { describe, it, expect } from 'vitest';
import { checkReviewedPracticeCount } from '../reviewedPracticeCount.js';
import { normalizeQuizBankQuestionCounts, validateDeliverableGeneration } from '../deliverablePostProcess.js';
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
import { operationSpecificTransfer } from '../teachingTaskTransferOperations.js';

function fixture(zh = false) {
  const texts = zh
    ? [
        '虚构日志：林记下“17:10灯闪了一次”。她没有检测电路。',
        '管理员说“维修组换过开关”。记录没有说明管理员如何得知此事。',
        '评论者写道“换开关导致了闪灯”。没有电路检查或对应时间的维修记录。',
      ]
    : [
        'Fictional log: Sora wrote “The lamp flickered at 17:10”. She did not test the circuit.',
        'The porter said “The crew replaced the switch”. The record does not state how the porter learned this.',
        'The commentator wrote “Replacing the switch caused the flicker”. There is no circuit inspection or time-matched maintenance record.',
      ];
  const roles = zh
    ? {
        observer: [0, '林'],
        observedClaim: [0, '17:10灯闪了一次'],
        observationBasis: [0, '她没有检测电路'],
        reporter: [1, '管理员'],
        reportedClaim: [1, '维修组换过开关'],
        reportingBasis: [1, '记录没有说明管理员如何得知此事'],
        inferenceAuthor: [2, '评论者'],
        inferredClaim: [2, '换开关导致了闪灯'],
        inferenceLimit: [2, '没有电路检查或对应时间的维修记录'],
        proposedEvidence: [2, '电路检查'],
      }
    : {
        observer: [0, 'Sora'],
        observedClaim: [0, 'The lamp flickered at 17:10'],
        observationBasis: [0, 'She did not test the circuit'],
        reporter: [1, 'The porter'],
        reportedClaim: [1, 'The crew replaced the switch'],
        reportingBasis: [1, 'The record does not state how the porter learned this'],
        inferenceAuthor: [2, 'The commentator'],
        inferredClaim: [2, 'Replacing the switch caused the flicker'],
        inferenceLimit: [2, 'There is no circuit inspection or time-matched maintenance record'],
        proposedEvidence: [2, 'circuit inspection'],
      };
  const inputs = texts.map((text, i) => ({ id: `record-${i}`, text }));
  const bindings = {},
    selections = {};
  for (const [role, [i, quote]] of Object.entries(roles)) {
    const start = texts[i].indexOf(quote);
    bindings[role] = { inputId: inputs[i].id, start, end: start + quote.length };
    selections[role] = { inputId: inputs[i].id, quote, occurrence: 0 };
  }
  for (const [i, role] of ['observationRecord', 'reportRecord', 'inferenceRecord'].entries()) {
    bindings[role] = { inputId: inputs[i].id, start: 0, end: texts[i].length };
    selections[role] = { inputId: inputs[i].id, quote: texts[i], occurrence: 0 };
  }
  return {
    inputs,
    bindings,
    selections,
    objective: zh
      ? '区分观察、陈述和解释，保留知情依据与证据边界。'
      : 'Distinguish observation, assertion and explanation while retaining evidence limits.',
  };
}

describe('reviewed claim attribution contract', () => {
  it.each([false, true])('keeps the knowledge basis explicit without inventing hearsay (Chinese: %s)', (zh) => {
    const f = fixture(zh);
    const candidate = createTeachingOperationPlan({ ...f, operation: 'claim-attribution' });
    expect(renderTeachingOperationTask(candidate, f.inputs, f.objective)).toBeNull();
    const plan = createTeachingOperationPlan({
      ...f,
      operation: 'claim-attribution',
      admission: { kind: 'teacher-confirmed' },
    });
    const task = renderTeachingOperationTask(plan, f.inputs, f.objective);
    expect(task.answer).toContain(f.selections.reportingBasis.quote);
    expect(task.answer).toContain(f.selections.inferredClaim.quote);
    expect(task.answer).toContain(f.selections.proposedEvidence.quote);
    expect(task.answer).toContain(zh ? '不替陈述者补写' : 'do not invent whether');
    expect(task.question).toContain(zh ? '反面' : 'opposite');
    const transfer = operationSpecificTransfer(task);
    expect(transfer.question).toContain(zh ? '信封' : 'envelopes');
    expect(transfer.answer).toContain(zh ? '带日期的漏水检查' : 'dated leak inspection');
    expect(transfer.sources.some((text) => f.inputs.some((input) => input.text === text))).toBe(false);
    expect(task.criteria.map((c) => c.weight)).toEqual([35, 35, 30]);
    expect(task.contrastResponses.map((r) => r.judgments[0].level)).toEqual([
      'exemplary',
      'developing',
      'beginning',
      'exemplary',
    ]);
    for (const row of task.contrastResponses)
      for (const j of row.judgments)
        for (const e of j.evidence) expect(row.response.slice(e.start, e.end)).toBe(e.quote);
    const changed = structuredClone(f.inputs);
    changed[1].text += ' New information.';
    expect(validateTeachingOperationPlan(plan, changed, f.objective).valid).toBe(false);
    const crossed = structuredClone(plan);
    crossed.bindings.reportingBasis = crossed.bindings.observationBasis;
    expect(
      validateTeachingOperationPlan(crossed, f.inputs, f.objective).issues.some((x) => x.code === 'plan-attribution'),
    ).toBe(true);
    const circular = structuredClone(plan);
    circular.bindings.reportingBasis = circular.bindings.reportedClaim;
    expect(validateTeachingOperationPlan(circular, f.inputs, f.objective).valid).toBe(false);
    expect(() =>
      createTeachingOperationPlan({
        ...f,
        operation: 'claim-attribution',
        admission: { kind: 'legacy-explicit-rule' },
      }),
    ).toThrow();
  });

  it('revises the proposed evidence through the real transaction and all nine material projections', () => {
    const f = fixture();
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
      courseName: 'Claim review',
      lessons: [
        { title: 'Attributed claims', sections: [{ topicSection: 'Evidence', learningObjectives: f.objective }] },
      ],
    };
    const compiled = compileBlueprintDeliverables(buildCourseBlueprint(courseMap), features);
    const deliverables = Object.fromEntries(features.map((id) => [id, { status: 'done', data: compiled[id] }]));
    deliverables.quizBank.data.quizzes[0].questions.push(
      {
        id: 'legacy-attribution',
        type: 'multiple_choice',
        question: 'Old generated claim',
        answer: 'A',
        explanation: 'Unsupported invented knowledge source',
        enrichmentSource: 'lesson-content-enrichment',
      },
      {
        id: 'protected-question',
        type: 'multiple_choice',
        question: 'Protected machine-scored question',
        answer: 'A',
        machineScored: true,
      },
    );
    const draft = createNewTeachingTaskReviewDraft(courseMap, { lessonNumber: 1, operation: 'claim-attribution' });
    Object.assign(draft, { inputs: f.inputs, bindings: f.selections });
    const apply = (state) => {
      const preview = previewTeachingTaskReview(state);
      expect(preview.status, preview.message).toBe('preview');
      expect(commitTeachingTaskReview({ ...state, preview, teacherConfirmed: false }).status).not.toBe('applied');
      const result = commitTeachingTaskReview({ ...state, preview, teacherConfirmed: true });
      expect(result.status, result.message).toBe('applied');
      expect(Object.keys(result.changed).sort()).toEqual([...features].sort());
      return { courseMap: result.courseMap, deliverables: { ...state.deliverables, ...result.changed } };
    };
    const first = apply({ courseMap, deliverables, draft });
    expect(JSON.stringify(first.deliverables.quizBank.data)).not.toContain('Unsupported invented knowledge source');
    expect(JSON.stringify(first.deliverables.quizBank.data)).toContain('Protected machine-scored question');
    const retry = first.deliverables.quizBank.data.quizzes[0].questions.find(
      (q) => q.practiceKind === 'feedback-retry',
    );
    expect(retry.points).toBe(0);
    const bank = structuredClone(first.deliverables.quizBank.data);
    const quiz = bank.quizzes[0];
    expect(checkReviewedPracticeCount(bank, quiz)?.valid).toBe(true);
    quiz.questions = quiz.questions.filter((q) => !q.machineScored);
    quiz.totalPoints = quiz.questions.reduce((sum, q) => sum + q.points, 0);
    expect(quiz.questions).toHaveLength(5);
    expect(normalizeQuizBankQuestionCounts(bank, 6).mismatchedIndices).toEqual([]);
    expect(validateDeliverableGeneration('quizBank', bank, { config: { questionsPerLesson: 6 } }).valid).toBe(true);
    const ordinary = structuredClone(bank);
    delete ordinary.quizzes[0].reviewedPracticeCount;
    expect(validateDeliverableGeneration('quizBank', ordinary, { config: { questionsPerLesson: 6 } }).valid).toBe(
      false,
    );
    const incomplete = structuredClone(bank);
    incomplete.quizzes[0].questions.pop();
    expect(checkReviewedPracticeCount(incomplete, incomplete.quizzes[0])?.valid).toBe(false);
    const changedSource = structuredClone(bank);
    changedSource.teachingTaskSources[0].inputs[0].text += ' Changed.';
    expect(checkReviewedPracticeCount(changedSource, changedSource.quizzes[0])?.valid).toBe(false);
    const duplicate = structuredClone(bank);
    duplicate.quizzes[0].questions[4] = duplicate.quizzes[0].questions[3];
    expect(checkReviewedPracticeCount(duplicate, duplicate.quizzes[0])?.valid).toBe(false);
    expect(first.deliverables.quizBank.data.quizzes[0].questions.some((q) => q.practiceKind === 'task-scaffold')).toBe(
      false,
    );
    const source = readTeachingTaskSources(first.courseMap)[0];
    const transfer = rebuildTeachingTaskSource(source).sequence.find((unit) => unit.kind === 'independent-transfer');
    expect(transfer.question).toContain('envelopes');
    expect(transfer.answer).toContain('dated leak inspection');
    expect(transfer.question).not.toContain('Sora');
    expect(transfer.answer).not.toContain('broadcast');
    const edit = createTeachingTaskReviewDraft(source, first.deliverables.assignments.data, 'assignments');
    edit.inputs[2].text = edit.inputs[2].text.replaceAll('circuit inspection', 'voltage log');
    edit.bindings.inferenceLimit.quote = edit.bindings.inferenceLimit.quote.replace(
      'circuit inspection',
      'voltage log',
    );
    edit.bindings.proposedEvidence.quote = 'voltage log';
    const second = apply({ ...first, draft: edit });
    const revisedBank = JSON.parse(JSON.stringify(second.deliverables.quizBank.data));
    expect(checkReviewedPracticeCount(revisedBank, revisedBank.quizzes[0])?.valid).toBe(true);
    expect(revisedBank.quizzes[0].reviewedPracticeCount.sourceHash).not.toBe(quiz.reviewedPracticeCount.sourceHash);
    const restored = readTeachingTaskSources(JSON.parse(JSON.stringify(second.courseMap)))[0];
    const task = rebuildTeachingTaskSource(restored);
    expect(restored.id).toBe(source.id);
    expect(task.answer).toContain('voltage log');
    expect(task.answer).not.toContain('circuit inspection');
    for (const id of features) expect(second.deliverables[id].data.teachingTaskSources[0]).toEqual(restored);
  });
});
