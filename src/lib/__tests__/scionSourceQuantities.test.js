import { describe, expect, it } from 'vitest';
import { buildSharedTeachingTask } from '../compilerTeachingTask.js';

const build = (objective, claims) =>
  buildSharedTeachingTask({ lessonId: 'lesson-1', admitted: true, objective, claims });
const pool = [
  'Depot North received 10 items and returned 9; Depot South received 90 items and returned 45.',
  'The requested overall proportion counts all returned items among all received items.',
  'The depots handle different product types, and no cause of the difference is supplied.',
];
const overlap = [
  'A fictional association has 80 members; 30 attended a lecture and 25 attended a workshop.',
  'Members may attend both events; the overlap was not recorded.',
  'Each attendance count refers to distinct members within that event.',
];
const units = [
  'In a fictional block, 8 of 20 metered households use rain barrels.',
  'The 20 households used 500 cubic metres of mains water in total.',
  'The record gives no water volume split between barrel users and other households.',
];

describe('source quantity reasoning, without answer-containing input', () => {
  it('combines counts rather than averaging unequal depot rates', () => {
    const t = build('Compute the combined return proportion and explain averaging rates.', pool);
    expect(t?.operation?.kind).toBe('pooled-proportion');
    expect(t.answer).toContain('(9 + 45)/(10 + 90)');
    expect(t.answer).toContain('54%');
    expect(t.answer).toContain('70%');
    expect(t.answer).toMatch(/unweighted.*70%/i);
    expect(t.inputs.map((i) => i.text)).toEqual(pool);
    const transfer = t.sequence.find((s) => s.kind === 'independent-transfer');
    expect(transfer.operationKind).toBe('pooled-proportion');
    expect(transfer.answer).not.toContain('54%');
    expect(transfer.rubric).toHaveLength(3);
  });
  it.each([
    [2, 5, 6, 15, '40%'],
    [0, 5, 0, 15, '0%'],
    [1, 3, 1, 4, '28.57%'],
    [5, 5, 15, 15, '100%'],
  ])('pools different counts %s/%s and %s/%s', (a, n, b, m, expected) => {
    const t = build('Calculate the pooled success proportion.', [
      `Lab Red tested ${n} devices and passed ${a}; Lab Blue tested ${m} devices and passed ${b}.`,
      'Count all passed devices among all tested devices; the two batches are separate.',
    ]);
    expect(t?.answer).toContain(expected);
    expect(t.reasoning.join(' ')).toContain(`${n} + ${m}`);
  });
  it('gives attainable bounds when overlap is unknown, rather than inventing independence', () => {
    const t = build('Determine the fraction of members attending at least one activity.', overlap);
    expect(t?.operation?.kind).toBe('union-bounds');
    expect(t.answer).toContain('30/80');
    expect(t.answer).toContain('55/80');
    expect(t.answer).toContain('37.5%');
    expect(t.answer).toContain('68.75%');
    expect(t.answer).toMatch(/overlap.*unknown/i);
    expect(t.sequence.find((s) => s.kind === 'independent-transfer').operationKind).toBe('union-bounds');
  });
  it('caps the union at the actual population when the counts sum above it', () => {
    const t = build('Find the fraction of members attending at least one activity.', [
      'A club has 40 members; 30 attended a lecture and 25 attended a workshop.',
      'Members may attend both events; the overlap is unknown.',
      'Each count refers to distinct members within that event.',
    ]);
    expect(t?.answer).toContain('30/40');
    expect(t.answer).toContain('40/40');
    expect(t.answer).not.toContain('55/40');
    expect(t.reasoning.join(' ')).toContain('15');
  });
  it('keeps the household count separate from an unknown volume share', () => {
    const t = build('Distinguish a proportion of households from a proportion of water volume.', units);
    expect(t?.operation?.kind).toBe('count-unit-boundary');
    expect(t.answer).toContain('40%');
    expect(t.answer).toContain('metered households');
    expect(t.answer).toMatch(/water volume.*(?:unknown|cannot)/i);
    expect(t.sequence.find((s) => s.kind === 'independent-transfer').operationKind).toBe('count-unit-boundary');
  });
  it('retains stable task identity and changes answer/revision when an admitted count changes', () => {
    const before = build('Compute the combined return proportion.', pool);
    const after = build(
      'Compute the combined return proportion.',
      pool.map((s) => s.replace('returned 45', 'returned 63')),
    );
    expect(after?.id).toBe(before?.id);
    expect(after?.revision).not.toBe(before?.revision);
    expect(after?.answer).toContain('72%');
  });
  it.each([
    ['different units', pool.map((s) => s.replace('90 items', '90 pallets'))],
    ['part above whole', pool.map((s) => s.replace('returned 45', 'returned 95'))],
    ['zero denominator', pool.map((s) => s.replace('received 10', 'received 0'))],
    ['unparsed third group', [...pool, 'Depot West received 4 items and returned 6.']],
    ['approximate count', pool.map((s) => s.replace('received 10', 'received about 10'))],
    ['different event', pool.map((s) => s.replace('returned 45', 'repaired 45'))],
    ['negative count', pool.map((s) => s.replace('received 10', 'received -10'))],
    ['decimal count', pool.map((s) => s.replace('received 10', 'received 10.5'))],
    ['ambiguous third group', [...pool, 'Depot West received 15 items and returned 12.']],
    [
      'possibly duplicated items',
      [...pool, 'The same items may appear in both depots; duplicate identities were not recorded.'],
    ],
    ['negated observation', pool.map((s) => s.replace('Depot North received', 'Depot North never received'))],
  ])('declines unsafe pooling: %s', (_, claims) => {
    expect(build('Compute the combined return proportion.', claims)).toBeNull();
  });
  it.each(
    [
      overlap.map((s) => s.replace('80 members', '20 members')),
      overlap.map((s) => s.replace('overlap was not recorded', 'overlap is 12 members')),
      overlap.map((s) => s.replace('distinct members', 'visits, including repeated visits')),
      overlap.map((s) => s.replace('25 attended', '25 did not attend')),
    ].map((claims) => [claims]),
  )('declines an unproved set relationship %#', (claims) => {
    expect(build('Calculate the fraction attending at least one activity.', claims)).toBeNull();
  });
  it('does not silently substitute a single-fraction task for unsupported pooling', () => {
    expect(
      build('Compare the combined proportion across both groups.', [
        'The first proportion is 3/8.',
        'The second proportion is 3/8.',
        'The two groups may contain the same participants.',
      ]),
    ).toBeNull();
  });
  it.each(
    [
      overlap.map((s) => s.replace('overlap was not recorded', 'overlap is not unknown')),
      [...overlap, 'The overlap is 12 members.'],
    ].map((claims) => [claims]),
  )('declines contradictory overlap evidence %#', (claims) => {
    expect(build('Find the fraction attending at least one activity.', claims)).toBeNull();
  });
  it('does not mistake an unrelated negation for an unknown quantity breakdown', () => {
    expect(
      build('Distinguish household and water volume proportions.', [
        ...units.slice(0, 2),
        'There was no increase in water volume.',
      ]),
    ).toBeNull();
    expect(
      build('Distinguish household and water volume proportions.', [
        ...units,
        'Barrel users used 200 cubic metres of water.',
      ]),
    ).toBeNull();
    expect(
      build(
        'Distinguish household and water volume proportions.',
        units.map((s) => s.replace('500 cubic', '0 cubic')),
      ),
    ).toBeNull();
  });
  it('does not turn an unobserved quantity into an exact result', () => {
    expect(build('Calculate the volume proportion.', units.slice(1))).toBeNull();
    expect(
      build(
        'Distinguish household and water volume proportions.',
        units.map((s) => s.replace('8 of 20', '28 of 20')),
      ),
    ).toBeNull();
  });
});

// These v0.19.0 failures have been exposed; they are regression cases, not
// unseen evaluation. Never change their frozen packets or original receipts.
import fs from 'node:fs';
import {
  buildCourseBlueprint,
  compileBlueprintDeliverables,
  BLUEPRINT_COMPILE_CONTEXT,
  reconcileCourseMapWithBlueprintSemanticAdmission,
} from '../courseBlueprintCompiler.js';
import { runDeterministicPackageFinalizer } from '../packageFinalizer.js';
import { applyTeachingTaskSourceEdit } from '../teachingTaskContentSync.js';
import { evaluateAcceptanceOutputs, ACCEPTANCE_FEATURES } from '../../../scripts/benchmarks/classroomAcceptance.mjs';

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

describe('quantity operations through actual material projections and source edits', () => {
  it.each(['h-c01-pooled-rates', 'h-c03-overlap', 'h-c04-volume-vs-households'])(
    '%s survives complete package finalization',
    (id) => {
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
      const selfChecks = outputs.assignments.assignments[0].selfAssessmentRubric.join(' ');
      for (const criterion of tasks[0].criteria) expect(selfChecks).not.toContain(criterion.levels.exemplary);
      expect(selfChecks).not.toMatch(/54%|37.5%|40%/);
      for (const t of tasks)
        for (const operand of t.operation.operands) {
          const { inputIndex, start, text } = operand.source;
          expect(t.inputs[inputIndex].text.slice(start, start + text.length)).toBe(text);
        }
    },
  );
  it('updates a pooled count through all nine materials and preserves teacher prose', () => {
    const f = compilePacket('h-c01-pooled-rates');
    const oldData = f.deliverables.studyGuides.data;
    const newData = structuredClone(oldData);
    const index = newData.studyGuides[0].sourceEvidenceBrief.claims.findIndex((s) => s.includes('returned 45'));
    newData.studyGuides[0].sourceEvidenceBrief.claims[index] = newData.studyGuides[0].sourceEvidenceBrief.claims[
      index
    ].replace('returned 45', 'returned 63');
    f.deliverables.lessonPlans.data.lessonPlans[0].warmUp.facilitation =
      'Teacher note: ask which unit each denominator counts.';
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
    expect(change.changed.studyGuides.data.studyGuides[0].workedExample.result).toContain('72%');
    expect(change.changed.assignments.data.assignments[0].anchorExampleSet.strongSample).toContain('72%');
    expect(change.changed.lessonPlans.data.lessonPlans[0].warmUp.facilitation).toContain('Teacher note:');
  });
  it('checks 60 generated count combinations against independent arithmetic', () => {
    for (let i = 1; i <= 60; i++) {
      const n = i + 3,
        m = 2 * i + 5,
        a = i % 4,
        b = (3 * i) % (m + 1);
      const t = build('Compute the overall completion proportion.', [
        `Room One enrolled ${n} learners and completed ${a}; Room Two enrolled ${m} learners and completed ${b}.`,
        'Count all completed learners among all enrolled learners; the classes have separate learner lists.',
      ]);
      expect(t?.operation.result.numerator).toBe(String(a + b));
      expect(t.operation.result.denominator).toBe(String(n + m));
      expect(Math.abs(Number(t.operation.result.percent) - (100 * (a + b)) / (n + m))).toBeLessThanOrEqual(0.005001);
    }
  });
});
