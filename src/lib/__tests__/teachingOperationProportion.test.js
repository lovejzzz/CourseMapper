import { describe, expect, it } from 'vitest';
import { observedProportionFixture } from '../../../tests/fixtures/teaching/observedProportion.js';
import { parseSourceCount, countSpanCutsNumber } from '../sourceCount.js';
import { buildSharedTeachingTask } from '../compilerTeachingTask.js';
import {
  createTeachingOperationPlan,
  evaluateTeachingOperationPlan,
  rebindTeachingOperationEdit,
  operationInputRevision,
  validateTeachingOperationPlan,
} from '../teachingOperationPlan.js';
import {
  createTeachingTaskReviewDraft,
  reviewableTeachingTaskSources,
  resolveTeachingTaskReviewDraft,
  previewTeachingTaskReview,
  commitTeachingTaskReview,
} from '../teachingTaskReview.js';
import { readTeachingTaskSources, restoreSnapshotTeachingProgram } from '../teachingProgram.js';
import { deriveCourseGraphFromCourseMap } from '../courseGraph/index.js';
import {
  buildCourseBlueprint,
  compileBlueprintDeliverables,
  BLUEPRINT_COMPILE_CONTEXT,
  reconcileCourseMapWithBlueprintSemanticAdmission,
} from '../courseBlueprintCompiler.js';
import { rebuildTeachingTaskSource } from '../teachingTaskSource.js';
import { rememberTeacherEdit } from '../teachingTaskContentSync.js';
import { createEditTransaction, applyEditTransaction } from '../deliverableEditHistory.js';
import { prepareProjectSnapshotForRestore } from '../projectSnapshotSanitizer.js';
import { quarantineInvalidInstructionalPlanLineage } from '../instructionalPlanLineage.js';
import { normalizeRestoredDeliverables } from '../../model/courseStore.jsx';

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
function boundFixture(options = {}, admission = { kind: 'teacher-confirmed' }) {
  const fixture = observedProportionFixture(options);
  return { ...fixture, plan: createTeachingOperationPlan({ operation: 'observed-proportion', ...fixture, admission }) };
}
function compile(f) {
  return buildSharedTeachingTask({
    lessonId: 'bound-quantity',
    objective: f.objective,
    operationPlan: f.plan,
    sourceInputs: f.inputs,
    admitted: true,
  });
}
function packageFixture(zh) {
  const f = observedProportionFixture({ zh });
  const facts = f.inputs.map((i) => i.text);
  const map = {
    courseName: zh ? '样本与群体' : 'Samples and populations',
    lessons: [
      {
        title: zh ? '观察范围' : 'Observed scope',
        sections: [
          {
            topicSection: zh ? '样本比例' : 'Sample proportions',
            learningObjectives: f.objective,
            weeklyAssessments: f.objective,
          },
        ],
      },
    ],
  };
  const blueprint = buildCourseBlueprint(map, {
    sourceBrief: `${f.objective}\nSource facts:\n${facts.map((text, i) => `${i + 1}. ${text}`).join('\n')}`,
    sessionMinutes: 50,
    instructorProvidedFacts: facts,
  });
  const generated = compileBlueprintDeliverables(blueprint, features);
  const state = {
    courseMap: reconcileCourseMapWithBlueprintSemanticAdmission(map, generated[BLUEPRINT_COMPILE_CONTEXT]),
    deliverables: normalizeRestoredDeliverables(
      Object.fromEntries(features.map((id) => [id, { status: 'done', stale: false, data: generated[id] }])),
    ),
  };
  const source = readTeachingTaskSources(state.courseMap)[0];
  expect(source.kind).toBe('source-proportion');
  expect(source.operationPlan).toBeUndefined();
  const draft = createTeachingTaskReviewDraft(source, state.deliverables.rubrics.data, 'rubrics');
  return { ...state, source, draft, fixture: f };
}
function locateReview(state) {
  for (const [name, span] of Object.entries(state.fixture.bindings)) {
    const original = state.fixture.inputs.find((i) => i.id === span.inputId);
    const input = state.draft.inputs.find((i) => i.text === original.text);
    expect(input).toBeTruthy();
    state.draft.bindings[name] = { inputId: input.id, quote: original.text.slice(span.start, span.end), occurrence: 0 };
  }
}

describe('reviewed observed proportions', () => {
  it.each([false, true])('compiles explicit source roles with novel prose (Chinese: %s)', (zh) => {
    const f = boundFixture({ zh, notation: false });
    expect(
      buildSharedTeachingTask({
        lessonId: 'bound-quantity',
        objective: f.objective,
        claims: f.inputs.map((i) => i.text),
        admitted: true,
      }),
    ).toBeNull();
    const task = compile(f);
    expect(task.answer).toContain('42.5%');
    expect(task.answer).toContain(f.labels.observedGroup);
    expect(task.answer).toContain(f.labels.missingGroup);
    expect(task.answer).toContain(f.labels.targetGroup);
    expect(task.derivation.at(-1).result.populationRate).toBe('not-established');
    expect(task.workedExample.verification.scope).toBe('arithmetic-only');
    expect(task.language).toBe(zh ? 'zh' : 'en');
    if (zh) expect(task.answer).toContain('相关观察时段');
    for (const response of task.contrastResponses) {
      expect(response.kind).toBe('synthetic-review-example');
      for (const judgment of response.judgments)
        for (const evidence of judgment.evidence)
          expect(response.response.slice(evidence.start, evidence.end)).toBe(evidence.quote);
    }
    const alternative = task.contrastResponses.find((r) => r.id === 'alternative-representation');
    expect(alternative.response).toContain('1 - 23/40 = 17/40 = 0.425');
    expect(alternative.judgments.map((j) => j.level)).toEqual(['exemplary', 'exemplary', 'exemplary']);
    expect(task.question).toContain(zh ? '进一步证据' : 'further evidence');
    expect(task.product).toContain(zh ? '证据方案' : 'proposal for further evidence');
    const independent = task.sequence.find((unit) => unit.kind === 'independent-transfer');
    expect(independent.question).toContain(zh ? '反向检验' : 'reverse check');
    expect(independent.question).toContain(zh ? '证据方案' : 'further evidence');
    expect(independent.answer).toContain(zh ? '相同问题' : 'proposed observations');
  });

  it.each([
    ['2', '7', '28.57', false],
    ['0', '40', '0', true],
    ['40', '40', '100', true],
    ['1', '128', '0.78125', true],
    ['999999998', '999999999', '100', false],
  ])('calculates %s/%s exactly before formatting and rounding', (n, d, percent, exact) => {
    const task = compile(boundFixture({ n, d }));
    expect(task.workedExample.verification.percent).toBe(percent);
    expect(task.workedExample.verification.exact).toBe(exact);
    expect(task.answer).toContain(exact ? 'exact.' : 'rounded to two decimal places');
    expect(task.contrastResponses[3].response).toContain(`(${n}/${d}) × ${d} = ${n}`);
    if (!exact) expect(task.answer).toContain(`≈ ${percent}%`);
  });

  it.each([' = 0.425 = 42.5%', ' ≈ 43%'])('checks compatible supplied equations: %s', (equation) => {
    expect(compile(boundFixture({ equation }))).toBeTruthy();
  });
  it.each([' = 90%', ' = 0.425 = 90%', ' ≈ 42%', ' = 0.425e2', '/2'])(
    'rejects conflicting or ambiguous source arithmetic: %s',
    (equation) => {
      expect(() => boundFixture({ equation })).toThrow(/equation|fraction|rounding/i);
    },
  );
  it.each(['0', '16'])('rejects an invalid denominator %s', (d) => {
    expect(() => boundFixture({ d })).toThrow();
  });
  it('keeps a model proposal unconfirmed and never falls back to the legacy compiler', () => {
    const f = boundFixture({}, { kind: 'model-proposal' });
    expect(validateTeachingOperationPlan(f.plan, f.inputs).valid).toBe(true);
    expect(evaluateTeachingOperationPlan(f.plan, f.inputs).status).toBe('needs-review');
    expect(compile(f)).toBeNull();
    expect(() => boundFixture({}, { kind: 'legacy-explicit-rule' })).toThrow(/review/);
  });
  it.each(['-17', '− 17', '1.17', '17.5', '17%', '17 %', '1e17', '17e2', '117'])(
    'rejects a count fragment in %s',
    (literal) => {
      const f = boundFixture();
      f.inputs[0].text = f.inputs[0].text.replace('17/40', `${literal}/40`);
      for (const [name, span] of Object.entries(f.plan.bindings)) {
        if (span.inputId !== f.inputs[0].id) continue;
        if (name === 'countRecord') span.end = f.inputs[0].text.length;
        if (name === 'numerator') {
          span.start = f.inputs[0].text.indexOf('17');
          span.end = span.start + 2;
        }
        if (name === 'denominator') {
          span.start = f.inputs[0].text.indexOf('40');
          span.end = span.start + 2;
        }
      }
      f.plan.inputRevisions[f.inputs[0].id] = operationInputRevision(f.inputs[0]);
      expect(validateTeachingOperationPlan(f.plan, f.inputs).issues.some((i) => i.code === 'plan-count')).toBe(true);
    },
  );
  it('requires the count roles and scope roles to belong to their selected records', () => {
    const f = boundFixture();
    f.plan.bindings.missingGroup = f.plan.bindings.observedGroup;
    expect(validateTeachingOperationPlan(f.plan, f.inputs).issues.some((i) => i.code === 'plan-record-ownership')).toBe(
      true,
    );
  });
  it('rebinds a numeric correction with stable roles; semantic changes and invalid counts require review', () => {
    const f = boundFixture();
    const edited = f.inputs.map((i) => ({ ...i, text: i.text.replace('17/40', '19/40') }));
    const rebound = rebindTeachingOperationEdit(f.plan, f.inputs, edited);
    expect(compile({ ...f, inputs: edited, plan: rebound }).answer).toContain('47.5%');
    expect(rebound.bindings.observedGroup).toEqual(f.plan.bindings.observedGroup);
    expect(
      compile({ ...f, inputs: edited, plan: rebound }).sequence.find((u) => u.kind === 'independent-transfer'),
    ).toEqual(compile(f).sequence.find((u) => u.kind === 'independent-transfer'));
    expect(compile({ ...f, inputs: edited })).toBeNull();
    const changedGroup = f.inputs.map((i) => ({
      ...i,
      text: i.text.replace('afternoon volunteers', 'evening visitors'),
    }));
    expect(rebindTeachingOperationEdit(f.plan, f.inputs, changedGroup)).toBeNull();
    const invalid = f.inputs.map((i) => ({ ...i, text: i.text.replace('17/40', '41/40') }));
    expect(rebindTeachingOperationEdit(f.plan, f.inputs, invalid)).toBeNull();
  });

  it.each([false, true])(
    'upgrades a real compiled legacy task through review, all materials, restore and undo (Chinese: %s)',
    (zh) => {
      const state = packageFixture(zh);
      expect(reviewableTeachingTaskSources(state.courseMap).map((s) => s.id)).toContain(state.source.id);
      expect(Object.values(state.draft.bindings).every((b) => b.inputId === '' && b.quote === '')).toBe(true);
      expect(resolveTeachingTaskReviewDraft(state.source, state.draft, '2026-09-06').status).toBe('needs-review');
      locateReview(state);
      const before = {
        courseMap: state.courseMap,
        courseGraph: quarantineInvalidInstructionalPlanLineage(deriveCourseGraphFromCourseMap(state.courseMap)),
        deliverables: state.deliverables,
      };
      const preview = previewTeachingTaskReview(state);
      expect(preview.status).toBe('preview');
      expect(preview.impacts.map((i) => i.featureId)).toEqual(features);
      expect(commitTeachingTaskReview({ ...state, preview }).status).toBe('needs-review');
      const applied = commitTeachingTaskReview({ ...state, preview, teacherConfirmed: true });
      expect(applied.status).toBe('applied');
      expect(applied.modelCalls).toBe(0);
      expect(applied.conflicts).toEqual([]);
      const source = readTeachingTaskSources(applied.courseMap)[0];
      expect(source.id).toBe(state.source.id);
      expect(source.operationPlan.operation).toBe('observed-proportion');
      const task = rebuildTeachingTaskSource(source);
      expect(applied.changed.rubrics.data.rubrics[0].criteria.map((c) => c.objectiveAligned)).toEqual(
        Array(3).fill(state.source.objective),
      );
      expect(task.answer).toContain(state.fixture.labels.missingGroup);
      for (const id of features) {
        expect(applied.changed[id].data.teachingTaskSources[0].operationPlan).toEqual(source.operationPlan);
        expect(JSON.stringify(applied.changed[id].data)).toContain(state.fixture.labels.missingGroup);
      }
      const after = {
        courseMap: applied.courseMap,
        courseGraph: quarantineInvalidInstructionalPlanLineage(deriveCourseGraphFromCourseMap(applied.courseMap)),
        deliverables: { ...state.deliverables, ...applied.changed },
      };
      const restored = restoreSnapshotTeachingProgram(JSON.parse(JSON.stringify(after)));
      expect(restored.courseMap.teachingProgram).toEqual(after.courseMap.teachingProgram);
      const transaction = JSON.parse(JSON.stringify(createEditTransaction(before, after)));
      expect(applyEditTransaction(after, transaction, 'undo').workspace).toEqual(before);
      expect(applyEditTransaction(before, transaction, 'redo').workspace).toEqual(after);
      const reopen = prepareProjectSnapshotForRestore(JSON.parse(JSON.stringify(after)));
      const reopenedWorkspace = {
        courseMap: reopen.courseMap,
        courseGraph: reopen.courseGraph,
        deliverables: normalizeRestoredDeliverables(reopen.deliverables),
      };
      expect(applyEditTransaction(reopenedWorkspace, transaction, 'undo').workspace).toEqual(before);
    },
  );

  it('retains an authored rubric answer during the upgrade and rejects a stale preview', () => {
    const state = packageFixture(false);
    const old = state.deliverables.rubrics.data;
    const next = structuredClone(old);
    next.rubrics[0].anchorExampleSet.partialSample += ' Teacher note: discuss selection bias.';
    state.deliverables.rubrics.data = rememberTeacherEdit(old, next, [
      'rubrics',
      0,
      'anchorExampleSet',
      'partialSample',
    ]);
    locateReview(state);
    const preview = previewTeachingTaskReview(state);
    expect(preview.status).toBe('preview');
    expect(preview.impacts.find((i) => i.featureId === 'rubrics').conflicts).toHaveLength(1);
    const applied = commitTeachingTaskReview({ ...state, preview, teacherConfirmed: true });
    expect(applied.changed.rubrics.data.rubrics[0].anchorExampleSet.partialSample).toContain('Teacher note:');
    state.deliverables.rubrics.data.rubrics[0].title = 'A newer teacher edit';
    expect(commitTeachingTaskReview({ ...state, preview, teacherConfirmed: true }).status).toBe('needs-review');
  });
});

it.each([
  [false, 'seventeen', 'forty'],
  [true, '十七', '四十'],
])('compiles exact word-count bindings while preserving the quoted source: %s', (zh, n, d) => {
  const f = observedProportionFixture({ zh, n, d, notation: false });
  const plan = createTeachingOperationPlan({
    ...f,
    operation: 'observed-proportion',
    admission: { kind: 'teacher-confirmed' },
  });
  const result = evaluateTeachingOperationPlan(plan, f.inputs);
  expect(result.status).toBe('ready');
  expect(result.calculation.percent).toBe('42.5');
  const task = buildSharedTeachingTask({
    lessonId: 'word-counts',
    objective: f.objective,
    sourceInputs: f.inputs,
    operationPlan: plan,
    admitted: true,
  });
  expect(task.answer).toContain('42.5%');
  expect(task.inputs).toEqual(f.inputs);
  const binding = task.operationPlan.bindings.numerator;
  expect(task.inputs.find((entry) => entry.id === binding.inputId).text.slice(binding.start, binding.end)).toBe(n);
});

it('normalizes only exact supported count expressions', () => {
  for (const [text, value] of [
    ['zero', 0],
    ['nineteen', 19],
    ['twenty-one', 21],
    ['Ninety nine', 99],
    ['十', 10],
    ['二十三', 23],
    ['〇', 0],
    ['两', 2],
    ['00017', 17],
  ])
    expect(parseSourceCount(text)).toBe(value);
  for (const text of [
    'one hundred',
    '一百二',
    'twenty zero',
    'a dozen',
    '3.5',
    '-2',
    '17%',
    'about seven',
    'between three and five',
    '第十七',
    ' 17 ',
    'thirty--one',
  ])
    expect(parseSourceCount(text)).toBeNull();
});
it.each([
  ['twenty one participants', 'one'],
  ['seventeen percent of volunteers', 'seventeen'],
  ['百分之十七', '十七'],
  ['not seventeen participants', 'seventeen'],
  ['one hundred participants', 'one'],
  ['一百五十名', '五十'],
  ['第十七名', '十七'],
  ['minus seven people', 'seven'],
  ['负十七名', '十七'],
  ['about seventeen', 'seventeen'],
  ['17 to 40 people', '17'],
  ['seventeen to forty people', 'forty'],
  ['十七至四十名', '十七'],
])('rejects an incomplete or qualified count span: %s', (text, quote) => {
  const at = text.indexOf(quote);
  expect(countSpanCutsNumber(text, at, at + quote.length)).toBe(true);
});
it('does not mistake ordinary source prose before a count for a number range', () => {
  const text = 'One observer refers to seventeen volunteers.';
  const at = text.indexOf('seventeen');
  expect(countSpanCutsNumber(text, at, at + 'seventeen'.length)).toBe(false);
});
