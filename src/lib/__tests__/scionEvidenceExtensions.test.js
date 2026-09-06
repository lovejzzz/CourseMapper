import { additionalAnswerChecks } from '../exporters/answerKeyChecks.js';
import { validateInstructionalIntentGraph } from '../instructionalIntentGraph.js';
import { compileBlueprintLessonPatch } from '../compiledLessonSync.js';
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { buildSharedTeachingTask } from '../compilerTeachingTask.js';
import {
  buildCourseBlueprint,
  compileBlueprintDeliverables,
  BLUEPRINT_COMPILE_CONTEXT,
  reconcileCourseMapWithBlueprintSemanticAdmission,
} from '../courseBlueprintCompiler.js';
import { runDeterministicPackageFinalizer } from '../packageFinalizer.js';
import { applyTeachingTaskSourceEdit } from '../teachingTaskContentSync.js';
import { evaluateAcceptanceOutputs, ACCEPTANCE_FEATURES } from '../../../scripts/benchmarks/classroomAcceptance.mjs';
const fixture = (id) => JSON.parse(fs.readFileSync(`benchmarks/classroom/v2/cases/${id}.json`, 'utf8'));

it('still rejects an unobservable Chinese learner action', () => {
  const result = validateInstructionalIntentGraph({
    lessonIntents: [{ id: 'lesson-1', learnerAction: '了解访谈证据。' }],
  });
  expect(result.blockers).toContain('lesson-1:unobservable-learner-action');
});
const build = (objective, claims) =>
  buildSharedTeachingTask({ lessonId: 'lesson-1', admitted: true, objective, claims });
const cases = [
  ['h-s01-print-exposure', 'event-stage-dates'],
  ['h-s02-amended-record', 'effective-record-amendment'],
  ['h-s03-missing-axis', 'missing-chart-context'],
  ['h-s04-interview-zh', 'testimony-attribution'],
  ['h-e01-coach-nutrition', 'co-intervention-and-assignment'],
  ['h-e02-cache-order', 'cache-and-run-order'],
  ['h-e03-taste-blinding', 'label-and-serving-order'],
  ['h-e04-filter-time-zh', 'initial-condition-and-duration'],
];
function compilePacket(id) {
  const fixture = JSON.parse(fs.readFileSync(`benchmarks/classroom/v2/cases/${id}.json`, 'utf8'));
  const map = {
    courseName: fixture.request,
    lessons: [
      {
        title: fixture.request,
        sections: [
          {
            topicSection: fixture.request,
            learningObjectives: fixture.request,
            weeklyAssessments: 'A reasoned response using the supplied record.',
          },
        ],
      },
    ],
  };
  const sourceBrief = `${fixture.request}\n${fixture.sessionMinutes} minutes.\nSource facts:\n${fixture.sources.map((s, i) => `${i + 1}. ${s}`).join('\n')}`;
  const blueprint = buildCourseBlueprint(map, {
    sourceBrief,
    sessionMinutes: fixture.sessionMinutes,
    instructorProvidedFacts: fixture.sources,
  });
  const features = ACCEPTANCE_FEATURES.filter((f) => f !== 'courseMap');
  const compiled = compileBlueprintDeliverables(blueprint, features);
  const context = compiled[BLUEPRINT_COMPILE_CONTEXT];
  const courseMap = reconcileCourseMapWithBlueprintSemanticAdmission(map, context);
  const deliverables = Object.fromEntries(
    features.map((f) => [f, { data: compiled[f], status: 'done', stale: false }]),
  );
  return { fixture, blueprint, features, sourceBrief, context, courseMap, deliverables };
}

describe('explicit evidence relationships from the exposed source packets', () => {
  it.each(cases)('%s admits a task with matching independent work', (id, kind) => {
    const f = fixture(id);
    const t = build(f.request, f.sources);
    expect(t?.operation?.kind).toBe(kind);
    expect(t.inputs.map((v) => v.text)).toEqual(f.sources);
    const independent = t.sequence.find((v) => v.kind === 'independent-transfer');
    expect(independent.operationKind).toBe(kind);
    expect(independent.sources).not.toEqual(f.sources);
    expect(independent.answer).not.toBe(t.answer);
    expect(independent.rubric).toHaveLength(3);
  });
  it.each(cases)('%s survives all ten projections and finalization', (id) => {
    const f = compilePacket(id);
    const final = runDeterministicPackageFinalizer({
      courseMap: f.courseMap,
      blueprint: f.blueprint,
      sourceBrief: f.sourceBrief,
      selectedFeatures: f.features,
      deliverables: f.deliverables,
    });
    const outputs = {
      courseMap: f.courseMap,
      ...Object.fromEntries(f.features.map((k) => [k, final.deliverables[k].data])),
    };
    const tasks = f.context.lessons.map((l) => l.teachingTask).filter(Boolean);
    expect(evaluateAcceptanceOutputs(f.fixture, outputs, tasks).failures).toEqual([]);
    const checks = outputs.assignments.assignments[0].selfAssessmentRubric.join(' ');
    for (const c of tasks[0].criteria) expect(checks).not.toContain(c.levels.exemplary);
  });
});

// Deliberately change meaning, not merely the fixture identifier. A topic word
// or negated/missing relationship must not manufacture a supported operation.
describe('evidence semantics, counterexamples and source edits', () => {
  it('distinguishes compatible stages from a reversed prerequisite across 36 year pairs', () => {
    const f = fixture('h-s01-print-exposure');
    for (const first of [1850, 1900, 1936, 1960, 2000, 2020])
      for (const second of [1850, 1900, 1936, 1960, 2000, 2020]) {
        const sources = f.sources.map((s) => s.replace('1936', String(first)).replace('1984', String(second)));
        const t = build(f.request, sources);
        expect(t?.summary).toContain(second >= first ? 'dates are compatible' : 'chronology is inconsistent');
        for (const b of t.operation.sourceBindings)
          expect(sources[b.inputIndex].slice(b.start, b.start + b.text.length)).toBe(b.text);
      }
  });
  it('keeps amendments time-scoped and does not choose a rule for an undated photograph', () => {
    const f = fixture('h-s02-amended-record');
    const t = build(
      f.request,
      f.sources.map((s) => s.replace('90 seats', '75 seats').replace('1 July', '12 November')),
    );
    expect(t.answer).toContain('75 seats from 12 November');
    expect(t.answer).toContain('not proof that the earlier entry was simply false');
    expect(t.answer).toContain('applicable capacity for the undated observation is unresolved');
    expect(t.answer).not.toContain('90 seats');
  });
  it('does not interpret a cropped chart as a measured percentage or rate', () => {
    const f = fixture('h-s03-missing-axis');
    const t = build(f.request, f.sources);
    expect(t.answer).toContain('variable, size of change or rate');
    expect(t.answer).toContain('even the mapping from picture direction to values is unverified');
    expect(t.answer).not.toMatch(/\d+%/);
  });
  it('classifies testimony without laundering reported observation into verified fact', () => {
    const f = fixture('h-s04-interview-zh');
    const t = build(f.request, f.sources);
    expect(t.answer).toContain('自称亲眼所见');
    expect(t.answer).toContain('有来源的转述');
    expect(t.answer).toContain('主观推测');
    expect(t.answer).toContain('缺少记录不等于事件没有发生');
    expect(t.operation.sourceBindings.map((b) => b.name)).toEqual(['reported-observation', 'hearsay', 'inference']);
    const independent = t.sequence.find((s) => s.kind === 'independent-transfer');
    expect(independent.answer).toContain('仓库的灯亮着');
    expect(independent.answer).not.toContain('两辆车');
  });
  it('repairs team, coach and nutrition confounding without inventing measured improvement', () => {
    const f = fixture('h-e01-coach-nutrition');
    const t = build(f.request, f.sources);
    expect(t.answer).toMatch(/multiple independent teams.*randomize teams/);
    expect(t.answer).toMatch(/baseline.*coach/);
    expect(t.answer).toContain('same nutrition program');
    expect(t.answer).toContain('not independently assigned treatment replicates');
    expect(t.answer).toContain('new outcomes');
  });
  it('keeps cache preparation separate from balancing run order and checks outputs', () => {
    const f = fixture('h-e02-cache-order');
    const t = build(f.request, f.sources);
    expect(t.answer).toContain('verify equivalent correct outputs');
    expect(t.answer).toContain('Re-establish the specified cache state before every timed run');
    expect(t.answer).toContain('Repeat independent prepared runs');
    const independent = t.sequence.find((s) => s.kind === 'independent-transfer');
    expect(independent.sources.join(' ')).toContain('Algorithm Merge has a lower');
    expect(independent.answer).toContain('Algorithm Merge is observed first');
  });
  it('does not claim the proposed blinding already proved a recipe preference', () => {
    const f = fixture('h-e03-taste-blinding');
    const t = build(f.request, f.sources);
    for (const phrase of [
      'neutral random codes',
      'keeps the recipe-code key',
      'Balance both recipe orders',
      'one preference scale',
      'new ratings',
      'carryover',
    ])
      expect(t.answer).toContain(phrase);
    const independent = t.sequence.find((s) => s.kind === 'independent-transfer');
    expect(independent.sources.join(' ')).toContain('everyday cups higher');
    expect(independent.answer).not.toContain('premium');
  });
  it('controls both initial state and duration and distinguishes independent water samples from rereads', () => {
    const f = fixture('h-e04-filter-time-zh');
    const t = build(f.request, f.sources);
    for (const phrase of [
      '同一批充分混匀',
      '等体积独立水样',
      '都使用10分钟',
      '经校准的浑浊度仪',
      '重复读取同一杯水不能当作新的处理重复',
      '新方案还需取得',
    ])
      expect(t.answer).toContain(phrase);
    const independent = t.sequence.find((s) => s.kind === 'independent-transfer');
    expect(independent.answer).toContain('都使用12分钟');
    expect(independent.answer).not.toContain('甲滤材');
  });
  const invalids = [
    ['negated exposure', 'h-s01-print-exposure', (s) => s.replace('dates the exposure', 'does not date the exposure')],
    ['uncertain exposure', 'h-s01-print-exposure', (s) => s.replace('dates the exposure', 'may date the exposure')],
    ['different negative', 'h-s01-print-exposure', (s) => s.replace('from that negative', 'from another negative')],
    ['unbound print date', 'h-s01-print-exposure', (s) => s.replace('1984', 'an unknown year')],
    ['negated amendment', 'h-s02-amended-record', (s) => s.replace('explicitly amends', 'never amends')],
    ['missing effective date', 'h-s02-amended-record', (s) => s.replace('1 July', 'an unknown date')],
    ['different unit', 'h-s02-amended-record', (s) => s.replace('90 seats', '90 square metres')],
    [
      'different room',
      'h-s02-amended-record',
      (s) => s.replace('the permitted capacity', 'another hall’s permitted capacity'),
    ],
    ['unchanged capacity', 'h-s02-amended-record', (s) => s.replace('90 seats', '120 seats')],
    ['negated visual feature', 'h-s03-missing-axis', (s) => s.replace('shows an upward', 'does not show an upward')],
    [
      'missing rather than known graph facts',
      'h-s03-missing-axis',
      (s) => s.replace('cropped out', 'fully labeled and available'),
    ],
    ['missing testimony observer', 'h-s04-interview-zh', (s) => s.replace('我亲眼看到', '我没有亲眼看到')],
    ['missing report source', 'h-s04-interview-zh', (s) => s.replace('邻居告诉我，他们在开会；', '')],
    ['missing inference marker', 'h-s04-interview-zh', (s) => s.replace('我觉得他们可能要搬走', '他们正在搬走')],
    ['no coach contrast', 'h-e01-coach-nutrition', (s) => s.replace('Different coaches', 'The same coach')],
    ['negated coach contrast', 'h-e01-coach-nutrition', (s) => s.replace('Different coaches', 'Not different coaches')],
    [
      'baseline provided',
      'h-e01-coach-nutrition',
      (s) =>
        s.replace(
          'No baseline sprint times or random assignment are reported.',
          'Baseline sprint times and random assignment are reported.',
        ),
    ],
    ['negated ordering', 'h-e02-cache-order', (s) => s.replace('always runs', 'never always runs')],
    ['matched cache', 'h-e02-cache-order', (s) => s.replace('on warmed data', 'on a cold cache')],
    ['same algorithm', 'h-e02-cache-order', (s) => s.replaceAll('Algorithm B', 'Algorithm A')],
    [
      'labels concealed',
      'h-e03-taste-blinding',
      (s) => s.replace('Participants know the labels', 'Participants do not know the labels'),
    ],
    ['negated serving', 'h-e03-taste-blinding', (s) => s.replace('is served', 'is not served')],
    [
      'balanced serving',
      'h-e03-taste-blinding',
      (s) => s.replace('Serving order is fixed', 'Serving order is balanced'),
    ],
    ['same initial water', 'h-e04-filter-time-zh', (s) => s.replace('高浑浊度', '低浑浊度')],
    ['equal duration', 'h-e04-filter-time-zh', (s) => s.replace('5分钟', '10分钟')],
    ['invalid duration', 'h-e04-filter-time-zh', (s) => s.replace('10分钟', '0分钟')],
    ['negated filter observation', 'h-e04-filter-time-zh', (s) => s.replace('甲滤材处理', '没有甲滤材处理')],
  ];
  it.each(invalids)('does not turn %s into an admitted fact', (_, id, change) => {
    const f = fixture(id);
    expect(build(f.request, f.sources.map(change))).toBeNull();
  });
  it('does not hijack an existing arithmetic objective because it mentions a chart', () => {
    expect(
      build('Calculate the percentage 3/8 and present it in a chart.', ['The recorded proportion is 3/8.'])?.kind,
    ).toBe('source-proportion');
  });
  it('source edits update nine materials and keep unrelated teacher notes', () => {
    const f = compilePacket('h-s02-amended-record');
    const oldData = f.deliverables.studyGuides.data;
    const newData = structuredClone(oldData);
    const row = newData.studyGuides[0];
    const index = row.sourceEvidenceBrief.claims.findIndex((s) => s.includes('90 seats'));
    row.sourceEvidenceBrief.claims[index] = row.sourceEvidenceBrief.claims[index].replace('90 seats', '75 seats');
    f.deliverables.lessonPlans.data.lessonPlans[0].warmUp.facilitation = 'Teacher note: build a timeline on the board.';
    const change = applyTeachingTaskSourceEdit({
      featureId: 'studyGuides',
      oldData,
      newData,
      editPath: ['studyGuides', 0, 'sourceEvidenceBrief', 'claims', index],
      deliverables: f.deliverables,
      courseMap: f.courseMap,
    });
    expect(change.status, change.message).toBe('applied');
    expect(Object.keys(change.changed)).toHaveLength(9);
    expect(change.changed.assignments.data.assignments[0].anchorExampleSet.strongSample).toContain('75 seats');
    expect(change.changed.studyGuides.data.studyGuides[0].workedExample.result).not.toContain('90 seats');
    expect(change.changed.lessonPlans.data.lessonPlans[0].warmUp.facilitation).toContain('Teacher note:');
  });
  it.each(['h-s04-interview-zh', 'h-e04-filter-time-zh'])('%s keeps student error prompts in Chinese', (id) => {
    const f = compilePacket(id);
    const qs = f.deliverables.studyGuides.data.studyGuides[0].reviewQuestions;
    expect(qs.length).toBeGreaterThan(3);
    for (const item of qs) expect(item.question).not.toMatch(/Evaluate this response|Correct the reasoning|Which step/);
  });
});

describe('classroom clarity beyond the original structural benchmark', () => {
  it.each(['h-e02-cache-order', 'h-e03-taste-blinding', 'h-e04-filter-time-zh'])(
    '%s requires an executable design for its highest reasoning band',
    (id) => {
      const f = fixture(id);
      const t = build(f.request, f.sources);
      const highest = t.criteria.find((c) => c.id === 'reasoning').levels.exemplary;
      expect(highest).not.toBe(t.summary);
      expect(highest).toMatch(/prepared runs|paired ratings|独立重复/);
      expect(highest).toMatch(/balanced|随机分配/);
    },
  );
  it.each(['h-s04-interview-zh', 'h-e04-filter-time-zh'])('%s localizes compiler directions across materials', (id) => {
    const f = compilePacket(id);
    const outputs = Object.fromEntries(Object.entries(f.deliverables).map(([k, v]) => [k, v.data]));
    const a = outputs.assignments.assignments[0];
    expect(a.instructions.join(' ')).not.toMatch(/Use the source record|Check each criterion/);
    expect(a.anchorExampleSet.scoringRationale).toMatch(/部分正确/);
    const p = outputs.lessonPlans.lessonPlans[0];
    expect(p.outline.map((v) => v.activity).join(' ')).not.toMatch(/Read|Model|Write|Compare|Check/);
    expect(outputs.courseFaq.faqs[0].qs[0].q).toBe('我将学会做什么？');
    const deck = outputs.slideDecks.decks[0];
    for (const slide of deck.slides)
      expect(slide.title).not.toMatch(/Worked example|Read the source|A new fictional|Find the error|Write your/);
  });
  it('prints additional scoring evidence without duplicating a linked answer', () => {
    const q = {
      practiceId: 'task:answer',
      answer: 'The date is unknown. Obtain a dated log.',
      successCriteria: [
        'The date is unknown.',
        'Explain why this source cannot date the event.',
        'Explain why this source cannot date the event.',
      ],
    };
    expect(additionalAnswerChecks(q)).toEqual(['Explain why this source cannot date the event.']);
    expect(q.successCriteria).toHaveLength(3);
  });
  it('retains distinct negations, short missing checks and authored answer keys', () => {
    const q = {
      practiceId: 'task:answer',
      answer: 'The date is known.',
      successCriteria: ['The date is unknown.', 'Source?'],
    };
    expect(additionalAnswerChecks(q)).toEqual(q.successCriteria);
    const authored = { answer: 'Answer.', successCriteria: ['Answer.', 'Answer.'] };
    expect(additionalAnswerChecks(authored)).toEqual(authored.successCriteria);
  });
});

it.each([
  'Calculate 3/8 as a percentage and print the result.',
  'Calculate the percentage 3/8 of items processed by an algorithm.',
])('does not hijack ordinary arithmetic: %s', (objective) => {
  expect(build(objective, ['The recorded proportion is 3/8.'])?.kind).toBe('source-proportion');
});

it.each([
  ['h-s04-interview-zh', '访谈证据的层次'],
  ['h-e04-filter-time-zh', '公平比较过滤材料'],
])('%s accepts measurable Chinese actions in an entirely Chinese course', (id, title) => {
  const f = fixture(id);
  const map = {
    courseName: title,
    lessons: [
      {
        title,
        sections: [
          {
            topicSection: title,
            learningGoals: f.request,
            learningObjectives: f.request,
            weeklyAssessments: '根据所给记录提交推理和证据。',
            syncActivities: '阅读材料、完成引导任务、讨论理由，再独立处理新案例。',
            asyncActivities: '课后根据反馈修改一处推理。',
          },
        ],
      },
    ],
  };
  const blueprint = buildCourseBlueprint(map, {
    sourceBrief: f.request,
    sessionMinutes: f.sessionMinutes,
    instructorProvidedFacts: f.sources,
  });
  const outputs = compileBlueprintDeliverables(
    blueprint,
    ACCEPTANCE_FEATURES.filter((k) => k !== 'courseMap'),
  );
  expect(outputs[BLUEPRINT_COMPILE_CONTEXT].lessons[0].teachingTask?.language).toBe('zh');
  expect(outputs.studyGuides.studyGuides[0].workedExample.result).toMatch(/所见|滤材/);
});

it.each(['h-e02-cache-order', 'h-e03-taste-blinding', 'h-e04-filter-time-zh'])(
  '%s scores error diagnosis separately from a complete experimental design',
  (id) => {
    const f = compilePacket(id);
    const questions = f.deliverables.studyGuides.data.studyGuides[0].reviewQuestions;
    const diagnosis = questions.find((q) => q.practiceId?.endsWith(':error-0'));
    expect(diagnosis).toBeTruthy();
    expect(diagnosis.successCriteria).toEqual([diagnosis.answer]);
    expect(diagnosis.successCriteria.join(' ')).not.toMatch(/prepared runs|paired ratings|独立重复/);
    expect(f.context.lessons[0].teachingTask.criteria.find((c) => c.id === 'reasoning').levels.exemplary).toMatch(
      /prepared runs|paired ratings|独立重复/,
    );
  },
);

it.each(cases)('%s recognizes a fully compiled source task without inventing a model kernel', (id) => {
  const f = fixture(id);
  const courseMap = {
    courseName: f.request,
    lessons: [{ title: f.request, sections: [{ learningObjectives: f.request }] }],
  };
  const patch = compileBlueprintLessonPatch({
    featureId: 'studyGuides',
    courseMap,
    lessonIndex: 0,
    sourceBrief: `${f.request}\nSource facts:\n${f.sources.map((s, i) => `${i + 1}. ${s}`).join('\n')}`,
    sessionMinutes: f.sessionMinutes,
  });
  expect(patch.sourceTaskCompiled).toBe(true);
  expect(patch.lessonEnriched).toBe(false);
  expect(patch.enrichedLessonCount).toBe(0);
});

it('does not skip missing knowledge for an unsupported source operation', () => {
  const f = fixture('h-s03-missing-axis');
  const sourceBrief = `${f.request}\nSource facts:\n${f.sources.map((s) => s.replace('upward-sloping line', 'curve of unknown shape')).join('\n')}`;
  const courseMap = {
    courseName: f.request,
    lessons: [{ title: f.request, sections: [{ learningObjectives: f.request }] }],
  };
  const patch = compileBlueprintLessonPatch({
    featureId: 'studyGuides',
    courseMap,
    lessonIndex: 0,
    sourceBrief,
    sessionMinutes: f.sessionMinutes,
  });
  expect(patch.sourceTaskCompiled).toBe(false);
  expect(patch.lessonEnriched).toBe(false);
});
