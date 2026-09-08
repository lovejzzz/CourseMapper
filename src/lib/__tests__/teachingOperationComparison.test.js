import { teachingTaskSourceFromLesson } from '../teachingTaskSource.js';
import { withTeachingTaskSources, readTeachingTaskSources } from '../teachingProgram.js';
import { projectTeachingTasksIntoCourseMap } from '../compilerTeachingTaskProjection.js';
import {
  createTeachingTaskReviewDraft,
  previewTeachingTaskReview,
  commitTeachingTaskReview,
} from '../teachingTaskReview.js';
import { deriveCourseGraphFromCourseMap } from '../courseGraph/index.js';
import { createEditTransaction, applyEditTransaction } from '../deliverableEditHistory.js';
import { prepareProjectSnapshotForRestore } from '../projectSnapshotSanitizer.js';
import { deliverablePdfDefinition } from '../exporters/classroomPdf.js';
import { alternativeReferenceParagraphs, reviewedRequirementSections } from '../teachingMaterialPresentation.js';
import { describe, expect, it } from 'vitest';
import { comparisonDesignFixture } from '../../../tests/fixtures/teaching/comparisonDesign.js';
import { comparisonCourseDraft } from '../../../tests/fixtures/teaching/courses/comparisonCourse.js';
import {
  createTeachingOperationPlan,
  validateTeachingOperationPlan,
  evaluateTeachingOperationPlan,
  rebindTeachingOperationEdit,
} from '../teachingOperationPlan.js';
import { buildSharedTeachingTask } from '../compilerTeachingTask.js';
import { projectSharedTeachingTasks } from '../compilerTeachingTaskProjection.js';
import { finalizeCompiledDeliverableLanguage } from '../compiledLanguageFinalizer.js';

function fixture(zh = false, presentationVersion) {
  const f = comparisonDesignFixture(zh);
  const plan = createTeachingOperationPlan({
    ...f,
    operation: 'paired-condition-confound',
    admission: { kind: 'teacher-confirmed' },
  });
  if (presentationVersion !== undefined) plan.presentationVersion = presentationVersion;
  const task = buildSharedTeachingTask({
    lessonId: 'design-unit',
    objective: f.objective,
    sourceInputs: f.inputs,
    operationPlan: plan,
    admitted: true,
  });
  return { ...f, plan, task };
}

it('exports response space for the actual lesson requirements and the five-part capstone', () => {
  const course = comparisonCourseDraft();
  for (const index of [0, 5]) {
    const f = course.lessons[index];
    const plan = createTeachingOperationPlan({
      ...f,
      operation: 'paired-condition-confound',
      version: 2,
      admission: { kind: 'teacher-confirmed' },
    });
    const task = buildSharedTeachingTask({
      lessonId: 'course-export',
      objective: f.objective,
      sourceInputs: f.inputs,
      operationPlan: plan,
      admitted: true,
    });
    expect(task).toBeTruthy();
    const lesson = {
      id: 'course-export',
      lessonNumber: 1,
      title: f.title,
      teachingTaskScope: 'primary-task',
      teachingTask: task,
    };
    for (const feature of ['assignments', 'studyGuides', 'rubrics']) {
      const data = projectSharedTeachingTasks(
        feature,
        { [feature]: [{ lessonNumber: 1, ...(feature === 'rubrics' ? { criteria: [], totalPoints: 100 } : {}) }] },
        { lessons: [lesson] },
      );
      const saved = structuredClone(data);
      const definition = deliverablePdfDefinition(feature, data, course.title);
      const strings = [];
      const visit = (value) => {
        if (typeof value === 'string') strings.push(value);
        else if (Array.isArray(value)) value.forEach(visit);
        else if (value && typeof value === 'object') Object.values(value).forEach(visit);
      };
      visit(definition.content);
      const lines = strings.filter(
        (text) => text === '________________________________________________________',
      ).length;
      if (feature === 'assignments') {
        expect(lines).toBe(4 * f.requirements.length);
        expect(strings).not.toContain('Proposed allocation, conditions and measurement');
        for (const requirement of f.requirements) expect(strings).toContain(requirement.label);
      } else if (feature === 'studyGuides') {
        expect(lines).toBe(index === 0 ? 11 : 35);
      }
      if (index === 5 && feature !== 'assignments') {
        f.requirements.forEach((requirement, position) =>
          expect(strings).toContain(
            `${feature === 'studyGuides' ? `6.${position + 1}` : `${position + 1}.`} ${requirement.label}: `,
          ),
        );
      }
      expect(data).toEqual(saved);
    }
  }
});

it('labels only exact reviewed answers and leaves teacher wording and stale sources untouched', () => {
  const requirements = comparisonCourseDraft().lessons[5].requirements;
  const source = { operationPlan: { version: 2, requirements } };
  const text = requirements.map((r) => r.transfer.answer).join('\n\n');
  const sections = reviewedRequirementSections(text, source, 'transfer');
  expect(sections).toHaveLength(5);
  expect(sections.map((s) => s.text).join('\n\n')).toBe(text);
  expect(reviewedRequirementSections(text + '\nTeacher qualification.', source, 'transfer')).toBeNull();
  const changed = structuredClone(source);
  changed.operationPlan.requirements[0].transfer.answer = 'A separately reviewed correction.';
  expect(reviewedRequirementSections(text, changed, 'transfer')).toBeNull();
  expect(reviewedRequirementSections(text, { operationPlan: { version: 1, requirements } }, 'transfer')).toBeNull();
  expect(reviewedRequirementSections(text, source, 'toString')).toBeNull();
});

describe('reviewed paired-condition comparison design', () => {
  it('replaces the old generated experiment bank while retaining authored and separately bound questions', () => {
    const { task } = fixture();
    const authored = {
      id: 'teacher-q',
      type: 'essay',
      question: 'Explain our laboratory reporting convention.',
      enrichmentSource: 'teacher-authored',
      points: 3,
    };
    const separate = {
      id: 'other-task-q',
      type: 'short_answer',
      taskId: 'another-task',
      question: 'A separately bound question.',
      points: 2,
    };
    const legacy = {
      id: 'old-generated-q',
      type: 'multiple_choice',
      question: 'Which seedlings receive light?',
      enrichmentSource: 'compiler-verified-operation-assessment',
      points: 2,
    };
    const data = { quizzes: [{ lessonNumber: 1, questions: [legacy, authored, separate] }] };
    const blueprint = {
      lessons: [{ id: 'design-unit', lessonNumber: 1, teachingTaskScope: 'primary-task', teachingTask: task }],
    };
    const row = projectSharedTeachingTasks('quizBank', data, blueprint).quizzes[0];
    expect(row.questions).toContainEqual(authored);
    expect(row.questions).toContainEqual(separate);
    expect(row.questions.some((q) => q.id === legacy.id)).toBe(false);
    const bound = row.questions.filter((q) => q.practiceId?.startsWith(`${task.id}:`));
    expect(bound.some((q) => q.practiceKind === 'independent-transfer')).toBe(true);
    expect(bound.some((q) => q.practiceKind === 'task-scaffold')).toBe(false);
    expect(row.practiceRecord.records).toEqual(task.inputs.map((input) => input.text));
    expect(row.totalPoints).toBe(row.questions.reduce((sum, q) => sum + q.points, 0));
    const materialBlueprint = structuredClone(blueprint);
    const oldExample = { problem: 'Design a seedling light experiment.', result: '24 seedlings' };
    const assignment = projectSharedTeachingTasks(
      'assignments',
      { assignments: [{ lessonNumber: 1, workedExample: oldExample }] },
      materialBlueprint,
    ).assignments[0];
    expect(assignment.workedExample).toBeUndefined();
    const plan = projectSharedTeachingTasks(
      'lessonPlans',
      { lessonPlans: [{ lessonNumber: 1, workedExample: oldExample }] },
      materialBlueprint,
    ).lessonPlans[0];
    expect(plan.workedExample.problem).toBe(task.question);
    expect(plan.workedExample.result).toBe(task.summary);
  });

  it.each([false, true])(
    'builds a concrete proposal with attributable conditions and no invented result (Chinese: %s)',
    (zh) => {
      const { inputs, plan, task } = fixture(zh);
      expect(task?.kind).toBe('evidence-experiment');
      expect(task.operationPlan.operation).toBe('paired-condition-confound');
      expect(task.inputs).toEqual(inputs);
      const evaluated = evaluateTeachingOperationPlan(plan, inputs);
      expect(evaluated.status).toBe('ready');
      expect(evaluated.allocation).toMatchObject({ total: zh ? 24 : 32, first: zh ? 12 : 16, second: zh ? 12 : 16 });
      expect(evaluated.steps.at(-1).result.futureEffect).toBe('unknown');
      expect(task.answer).toContain(zh ? '每个只使用一次' : 'once each');
      expect(task.answer).toContain(zh ? '不是统计功效计算' : 'not a power calculation');
      expect(task.answer).toContain(zh ? '逐杯保存' : 'five-second intervals');
      expect(task.question).toContain(zh ? '空白记录表' : 'blank recording table');
      expect(task.answer).toContain(zh ? '空白记录表栏目' : 'Blank record columns');
      expect(task.criteria.map((c) => c.weight)).toEqual([25, 40, 35]);
      expect(task.contrastResponses).toHaveLength(4);
      for (const example of task.contrastResponses)
        for (const judgment of example.judgments)
          for (const excerpt of judgment.evidence) {
            expect(excerpt.start).toBeGreaterThanOrEqual(0);
            expect(example.response.slice(excerpt.start, excerpt.end)).toBe(excerpt.quote);
          }
      expect(task.contrastResponses.at(-1).response).toContain(zh ? '30 °C' : '26 °C');
      expect(task.contrastResponses[1].judgments.map((j) => j.level)).toEqual([
        'proficient',
        'developing',
        'developing',
      ]);
      expect(task.sequence.find((u) => u.kind === 'independent-transfer')?.question).toBeTruthy();
    },
  );

  it('cannot admit model suggestions, arbitrary old-rule provenance or mismatched source roles', () => {
    const { plan, inputs } = fixture();
    const proposal = { ...plan, admission: { kind: 'model-proposal' } };
    expect(evaluateTeachingOperationPlan(proposal, inputs).status).toBe('needs-review');
    expect(
      buildSharedTeachingTask({
        lessonId: 'x',
        objective: 'Design a comparison.',
        sourceInputs: inputs,
        operationPlan: proposal,
        admitted: true,
      }),
    ).toBeNull();
    expect(validateTeachingOperationPlan({ ...plan, admission: { kind: 'legacy-explicit-rule' } }, inputs).valid).toBe(
      false,
    );
    const wrong = structuredClone(plan);
    wrong.bindings.firstTreatment = wrong.bindings.secondTreatment;
    expect(validateTeachingOperationPlan(wrong, inputs).issues.some((i) => i.code === 'plan-record-ownership')).toBe(
      true,
    );
    wrong.bindings.firstTreatment = wrong.bindings.firstOther;
    expect(validateTeachingOperationPlan(wrong, inputs).issues.some((i) => i.code === 'plan-comparison-role')).toBe(
      true,
    );
    wrong.bindings.firstTreatment = { ...plan.bindings.firstTreatment, end: plan.bindings.firstOther.end };
    expect(validateTeachingOperationPlan(wrong, inputs).issues.some((i) => i.code === 'plan-comparison-role')).toBe(
      true,
    );
  });

  it('requires actual distinct settings rather than assuming every comparison is confounded', () => {
    const { plan, inputs } = fixture();
    const changed = structuredClone(inputs);
    changed[1].text = changed[1].text.replace('26 °C', '18 °C');
    const wrong = structuredClone(plan);
    // Rebind all source revisions through the public creation validator.
    expect(() =>
      createTeachingOperationPlan({
        operation: plan.operation,
        inputs: changed,
        bindings: wrong.bindings,
        admission: plan.admission,
      }),
    ).toThrow(/distinct/);
    expect(rebindTeachingOperationEdit(plan, inputs, changed)).toBeNull();
  });

  it('recomputes a changed resource count, including odd totals, and refuses insufficient replication', () => {
    const { plan, inputs } = fixture();
    const changed = structuredClone(inputs);
    changed[2].text = changed[2].text.replace('32 fresh', '33 fresh');
    const updated = rebindTeachingOperationEdit(plan, inputs, changed);
    expect(updated).not.toBeNull();
    expect(evaluateTeachingOperationPlan(updated, changed).allocation).toMatchObject({
      total: 33,
      first: 16,
      second: 17,
    });
    changed[2].text = changed[2].text.replace('33 fresh', '3 fresh');
    expect(rebindTeachingOperationEdit(plan, inputs, changed)).toBeNull();
    changed[2].text = changed[2].text.replace('3 fresh', '32 fresh').replace('five-second', 'ten-second');
    expect(rebindTeachingOperationEdit(plan, inputs, changed)).toBeNull();
  });

  it.each([false, true])(
    'gives study guides experimental concepts while retaining exact review evidence (Chinese: %s)',
    (zh) => {
      const { task } = fixture(zh);
      const blueprint = {
        lessons: [{ id: 'design-unit', lessonNumber: 1, teachingTaskScope: 'primary-task', teachingTask: task }],
      };
      const data = finalizeCompiledDeliverableLanguage(
        'studyGuides',
        projectSharedTeachingTasks('studyGuides', { studyGuides: [{ lessonNumber: 1 }] }, blueprint),
        blueprint,
      );
      const guide = data.studyGuides[0];
      expect(guide.teachingGuideVersion).toBe(1);
      expect(guide.conceptConnections.join(' ')).toContain(zh ? '实验单位与读数' : 'Experimental units and readings');
      expect(guide.conceptConnections.join(' ')).not.toContain('effective date');
      expect(guide.workedExample.result).toBe(task.summary);
      expect(guide.reviewQuestions.filter((q) => q.practiceKind === 'task-scaffold')).toHaveLength(3);
    },
  );
});

it.each([false, true])(
  'uses the design operation level for assignment, rubric and rehearsal in both languages: %s',
  (zh) => {
    const { task } = fixture(zh);
    const blueprint = {
      lessons: [{ id: 'design-unit', lessonNumber: 1, teachingTaskScope: 'primary-task', teachingTask: task }],
    };
    const assignment = projectSharedTeachingTasks(
      'assignments',
      { assignments: [{ lessonNumber: 1, title: 'Old', totalPoints: 100, bloomsLevel: 'Apply' }] },
      blueprint,
    ).assignments[0];
    const rubric = projectSharedTeachingTasks(
      'rubrics',
      { rubrics: [{ lessonNumber: 1, title: 'Old', totalPoints: 100, bloomsLevel: 'Apply', criteria: [] }] },
      blueprint,
    ).rubrics[0];
    const quiz = projectSharedTeachingTasks('quizBank', { quizzes: [{ lessonNumber: 1, questions: [] }] }, blueprint)
      .quizzes[0];
    expect(assignment.bloomsLevel).toBe('Create');
    expect(rubric.bloomsLevel).toBe('Create');
    expect(assignment.language).toBe(zh ? 'zh' : 'en');
    expect(rubric.title).toBe(zh ? `${task.title}——评分标准` : `${task.title} — Rubric`);
    expect(quiz.questions.find((question) => question.practiceKind === 'task-rehearsal').bloomsLevel).toBe('Create');
    const errorQuestions = quiz.questions.filter((question) => question.practiceKind === 'error-analysis');
    expect(errorQuestions.length).toBeGreaterThan(0);
    expect(errorQuestions.every((question) => question.bloomsLevel === 'Analyze')).toBe(true);
  },
);

it.each([false, true])(
  'prints comparison alternatives as explicit changes without altering scoring evidence: %s',
  (zh) => {
    const { task } = fixture(zh);
    const data = projectSharedTeachingTasks(
      'rubrics',
      { rubrics: [{ lessonNumber: 1, totalPoints: 100, criteria: [] }] },
      {
        lessons: [{ id: 'design-unit', lessonNumber: 1, teachingTaskScope: 'primary-task', teachingTask: task }],
      },
    );
    const saved = structuredClone(data);
    const anchors = data.rubrics[0].anchorExamples;
    const paragraphs = alternativeReferenceParagraphs(anchors, zh);
    expect(paragraphs.join(' ')).toContain(zh ? '30 °C' : '26 °C');
    expect(paragraphs.join(' ')).toContain(zh ? '随机' : 'Randomize');
    expect(paragraphs[0]).toContain(zh ? '上方' : 'above');
    const definition = deliverablePdfDefinition('rubrics', data, 'Comparison design');
    const strings = [];
    const visit = (value) => {
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === 'object') Object.values(value).forEach(visit);
      else if (typeof value === 'string') strings.push(value);
    };
    visit(definition.content);
    const limit = anchors.strongSample.split(/\n\n/).at(-1);
    expect(strings.filter((text) => text === limit)).toHaveLength(1);
    expect(strings).toContain(paragraphs[0]);
    expect(data).toEqual(saved);
    expect(anchors.alternativeSample).toContain(limit);
    for (const judgment of task.contrastResponses.at(-1).judgments)
      for (const evidence of judgment.evidence)
        expect(task.contrastResponses.at(-1).response.slice(evidence.start, evidence.end)).toBe(evidence.quote);
    // Teacher-authored alternatives and partial matches remain verbatim.
    expect(alternativeReferenceParagraphs({ ...anchors, sampleOrigin: 'teacher-authored' }, zh).join('\n\n')).toBe(
      anchors.alternativeSample,
    );
    const changedEnding = { ...anchors, alternativeSample: anchors.alternativeSample + '\n\nTeacher qualification.' };
    expect(alternativeReferenceParagraphs(changedEnding, zh).join('\n\n')).toBe(changedEnding.alternativeSample);
  },
);

it.each([false, true])('scores full rehearsals from shared criteria while preserving saved point budgets: %s', (zh) => {
  const { task } = fixture(zh, 3);
  const blueprint = {
    lessons: [{ id: 'design-unit', lessonNumber: 1, teachingTaskScope: 'primary-task', teachingTask: task }],
  };
  const data = projectSharedTeachingTasks('quizBank', { quizzes: [{ lessonNumber: 1, questions: [] }] }, blueprint);
  const row = data.quizzes[0];
  let question = row.questions.find((q) => q.practiceKind === 'task-rehearsal');
  expect(question.points).toBe(20);
  for (const criterion of task.criteria) {
    expect(question.scoringGuidance).toContain(criterion.label);
    expect(question.scoringGuidance).toContain(`${criterion.weight}%`);
    for (const band of ['exemplary', 'proficient', 'developing', 'beginning'])
      expect(question.scoringGuidance).toContain(criterion.levels[band]);
  }
  const definition = deliverablePdfDefinition('quizBank', data, 'Comparison design');
  const keptParagraphs = [];
  const printedStrings = [];
  const inspect = (node) => {
    if (typeof node === 'string') printedStrings.push(node);
    else if (Array.isArray(node)) node.forEach(inspect);
    else if (node && typeof node === 'object') {
      if (node.unbreakable === true && node.text) keptParagraphs.push(JSON.stringify(node.text));
      Object.values(node).forEach(inspect);
    }
  };
  inspect(definition.content);
  const diagnostic = row.questions.find((q) => q.practiceKind === 'error-analysis');
  expect(diagnostic.scoringGuidance).toBe(diagnostic.answer);
  expect(printedStrings.some((text) => text.trim() === diagnostic.answer)).toBe(true);
  expect(printedStrings.some((text) => text.includes(`Scoring Guidance: ${diagnostic.answer}`))).toBe(false);
  for (const criterion of task.criteria)
    expect(keptParagraphs.some((text) => text.includes(criterion.levels.exemplary))).toBe(true);
  expect(row.totalPoints).toBe(row.questions.reduce((sum, q) => sum + q.points, 0));
  for (const savedPoints of [0, 7.5, 30]) {
    question.points = savedPoints;
    projectSharedTeachingTasks('quizBank', data, blueprint);
    const revised = row.questions.find((q) => q.practiceId === question.practiceId);
    expect(revised.points).toBe(savedPoints);
    expect(revised.scoringGuidance).toContain(zh ? `满分为${savedPoints}分` : `total is ${savedPoints} points`);
    const entry = row.quizBlueprint.questionPlan.find((q) => q.practiceId === revised.practiceId);
    expect(entry.points).toBe(savedPoints);
    // The next projection receives the actual retained row.
    question = revised;
  }
});

it.each([
  [false, '3786a14924443889af7e4be3fb55e91f5e29feadced86c2bc1bfe7bb0a9b80d9'],
  [true, 'a8420ff8380a1e6998fb0b73bce63bddbcfb460f18ea75ffc1dacc831d417eae'],
])('reconstructs the pre-upgrade comparison task for merge baselines: %s', (zh, revision) => {
  expect(fixture(zh, 3).task.revision).toBe(revision);
});

it.each([false, true])('separates assessed performances from prompts and unscored retry: %s', (zh) => {
  const { task } = fixture(zh);
  expect(task.operationPlan.presentationVersion).toBe(5);
  const data = projectSharedTeachingTasks(
    'quizBank',
    { quizzes: [{ lessonNumber: 1, questions: [] }] },
    {
      lessons: [{ id: 'design-unit', lessonNumber: 1, teachingTaskScope: 'primary-task', teachingTask: task }],
    },
  );
  const row = data.quizzes[0];
  expect(row.questions).toHaveLength(6);
  expect(row.questions.map((q) => q.practiceKind)).toEqual([
    'independent-transfer',
    'task-rehearsal',
    'error-analysis',
    'error-analysis',
    'error-analysis',
    'feedback-retry',
  ]);
  expect(row.questions.map((q) => q.points)).toEqual([12, 20, 2, 2, 2, 0]);
  expect(row.totalPoints).toBe(38);
  const transfer = task.sequence.find((unit) => unit.kind === 'independent-transfer');
  for (const criterion of transfer.rubric) {
    expect(row.questions[0].scoringGuidance).toContain(criterion.label);
    for (const level of ['exemplary', 'proficient', 'developing', 'beginning'])
      expect(row.questions[0].scoringGuidance).toContain(criterion[level]);
  }
  task.errors.forEach((error, index) => {
    const guidance = row.questions[index + 2].scoringGuidance;
    expect(guidance).toContain(error.response);
    expect(guidance).toContain(error.correction);
  });
  expect(row.questions.at(-1).scoringGuidance).toContain(zh ? '不重复计分' : 'Unscored revision');
  expect(row.questions.at(-1).question).not.toContain(transfer.feedback);
  expect(row.questions.at(-1).feedback).toBe(transfer.feedback);
  expect(task.scaffoldQuestions).toHaveLength(3);
});

it.each([false, true])('qualifies design claims without rewriting saved comparison presentations: %s', (zh) => {
  const previous = fixture(zh, 4).task;
  const current = fixture(zh).task;
  expect(previous.workedExample.boundary).toContain(zh ? '改进消除了' : 'The repair removes');
  expect(current.workedExample.boundary).toContain(zh ? '有效改进必须消除' : 'A valid repair must remove');
  expect(current.workedExample.interpretation).toContain(zh ? '需要新的观测' : 'needs new observations');
  expect(current.revision).not.toBe(previous.revision);
  expect(current.criteria).toEqual(previous.criteria);
  expect(current.operationPlan.bindings).toEqual(previous.operationPlan.bindings);
});

function oldComparisonWorkspace(zh) {
  const { task } = fixture(zh, 3);
  const lesson = {
    id: 'design-unit',
    lessonNumber: 1,
    title: 'Comparison design',
    teachingTaskScope: 'primary-task',
    teachingTask: task,
  };
  const source = teachingTaskSourceFromLesson(lesson);
  const blueprint = { lessons: [lesson] };
  const courseMap = projectTeachingTasksIntoCourseMap(
    withTeachingTaskSources(
      {
        courseName: 'Comparison workshop',
        lessons: [{ title: lesson.title, sections: [{ learningObjectives: task.objective }] }],
      },
      [source],
    ),
    blueprint,
  );
  const data = projectSharedTeachingTasks(
    'quizBank',
    { quizzes: [{ lessonNumber: 1, lessonTitle: lesson.title, questions: [] }] },
    blueprint,
  );
  return {
    source,
    courseMap,
    deliverables: {
      quizBank: {
        status: 'done',
        stale: false,
        data: finalizeCompiledDeliverableLanguage('quizBank', data, blueprint),
      },
    },
  };
}

it.each([false, true])('upgrades old practice through review and reversible history: %s', (zh) => {
  const state = oldComparisonWorkspace(zh);
  const before = {
    courseMap: state.courseMap,
    courseGraph: deriveCourseGraphFromCourseMap(state.courseMap),
    deliverables: state.deliverables,
  };
  expect(state.deliverables.quizBank.data.quizzes[0].questions).toHaveLength(10);
  const preview = previewTeachingTaskReview({ ...state, draft: createTeachingTaskReviewDraft(state.source) });
  expect(preview.status, preview.message).toBe('preview');
  const applied = commitTeachingTaskReview({ ...state, preview, teacherConfirmed: true });
  expect(applied.status).toBe('applied');
  expect(applied.conflicts).toEqual([]);
  expect(readTeachingTaskSources(applied.courseMap)[0].operationPlan.presentationVersion).toBe(5);
  expect(applied.changed.quizBank.data.quizzes[0].questions).toHaveLength(6);
  const after = {
    courseMap: applied.courseMap,
    courseGraph: deriveCourseGraphFromCourseMap(applied.courseMap),
    deliverables: { ...state.deliverables, ...applied.changed },
  };
  const transaction = JSON.parse(JSON.stringify(createEditTransaction(before, after)));
  const restored = prepareProjectSnapshotForRestore(JSON.parse(JSON.stringify(after)));
  const undo = applyEditTransaction(restored, transaction, 'undo');
  expect(undo.status).toBe('applied');
  expect(undo.workspace.deliverables).toEqual(before.deliverables);
  const redo = applyEditTransaction(undo.workspace, transaction, 'redo');
  expect(redo.workspace.deliverables).toEqual(after.deliverables);
});

it('retains an edited scaffold as a conflict rather than deleting teacher work', () => {
  const state = oldComparisonWorkspace(false);
  const question = state.deliverables.quizBank.data.quizzes[0].questions.find(
    (q) => q.practiceKind === 'task-scaffold',
  );
  question.question = 'Teacher task: explain our laboratory allocation procedure.';
  const preview = previewTeachingTaskReview({ ...state, draft: createTeachingTaskReviewDraft(state.source) });
  const applied = commitTeachingTaskReview({ ...state, preview, teacherConfirmed: true });
  expect(applied.status).toBe('applied');
  const retained = applied.changed.quizBank.data.quizzes[0].questions.find((q) => q.practiceId === question.practiceId);
  expect(retained.question).toBe(question.question);
  expect(applied.conflicts.length).toBeGreaterThan(0);
  expect(applied.changed.quizBank.stale).toBe(true);
});
