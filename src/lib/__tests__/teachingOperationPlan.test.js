import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import * as docx from 'docx';
import JSZip from 'jszip';
import { _buildDocxContentShared, buildDocxDocument } from '../exporters/docxExporter.js';
import { buildSharedTeachingTask, teachingTaskRubric } from '../compilerTeachingTask.js';
import { teachingTaskSourceFromLesson, rebuildTeachingTaskSource } from '../teachingTaskSource.js';
import {
  createTeachingOperationPlan,
  evaluateTeachingOperationPlan,
  rebindTeachingOperationEdit,
  operationInputRevision,
  validateTeachingOperationPlan,
} from '../teachingOperationPlan.js';
import {
  withTeachingTaskSources,
  readTeachingTaskSources,
  validateTeachingProgram,
  teachingProgramRevision,
} from '../teachingProgram.js';
import { explicitSourceRelationTask } from '../teachingTaskSourceRelations.js';
import { deriveCourseGraphFromCourseMap, renderCourseMapFromGraph } from '../courseGraph/index.js';
import {
  buildCourseBlueprint,
  compileBlueprintDeliverables,
  BLUEPRINT_COMPILE_CONTEXT,
  reconcileCourseMapWithBlueprintSemanticAdmission,
} from '../courseBlueprintCompiler.js';
import { applyTeachingTaskSourceEdit } from '../teachingTaskContentSync.js';

const objective = 'Explain how an amended record changes the interpretation of an earlier entry.';
const legacyClaims = [
  'A fictional permit log initially records 120 seats for a hall.',
  'A later entry explicitly amends the permitted capacity to 90 seats from 1 July.',
  'An attendance photograph has no reliable date.',
];
const legacyTask = () =>
  buildSharedTeachingTask({ lessonId: 'source-lesson', objective, claims: legacyClaims, admitted: true });

function paraphrasedPlan(admission = { kind: 'teacher-confirmed' }) {
  const inputs = [
    { id: 'entry-a', text: 'Fictional register A: the hall limit was 76 seats.' },
    { id: 'entry-b', text: 'Replacement rule B for this hall: from 14 September the limit is 52 seats.' },
    { id: 'entry-c', text: 'The attendance observation has no recorded date.' },
  ];
  const whole = (index) => ({ inputId: inputs[index].id, start: 0, end: inputs[index].text.length });
  const span = (index, quote) => {
    const start = inputs[index].text.indexOf(quote);
    return { inputId: inputs[index].id, start, end: start + quote.length };
  };
  return {
    inputs,
    plan: createTeachingOperationPlan({
      operation: 'record-amendment',
      inputs,
      admission,
      bindings: {
        priorRecord: whole(0),
        amendedRecord: whole(1),
        priorValue: span(0, '76'),
        amendedValue: span(1, '52'),
        priorUnit: span(0, 'seats'),
        amendedUnit: span(1, 'seats'),
        effectiveDate: span(1, '14 September'),
        observationLimit: whole(2),
      },
    }),
  };
}

describe('executable teaching operations', () => {
  it('uses teacher-confirmed source roles to handle a paraphrase without the legacy sentence parser', () => {
    const { plan, inputs } = paraphrasedPlan();
    expect(
      buildSharedTeachingTask({ lessonId: 'new-case', objective, claims: inputs.map((i) => i.text), admitted: true }),
    ).toBeNull();
    const task = buildSharedTeachingTask({
      lessonId: 'new-case',
      objective,
      operationPlan: plan,
      sourceInputs: inputs,
      admitted: true,
    });
    expect(task.answer).toContain('76 seats');
    expect(task.answer).toContain('52 seats from 14 September');
    expect(task.answer).toContain('unresolved');
    expect(task.answer).not.toMatch(/photograph|image/);
    expect(task.contrastResponses.map((example) => example.response).join(' ')).not.toMatch(/photograph|image/);
    expect(task.derivation.at(-1).result.applicableVersion).toBe('unresolved');
    expect(task.inputs.map((i) => i.id)).toEqual(['entry-a', 'entry-b', 'entry-c']);
    const source = teachingTaskSourceFromLesson({
      id: 'new-case',
      lessonNumber: 1,
      title: 'Amendment',
      teachingTask: task,
      teachingTaskScope: 'primary-task',
    });
    const map = withTeachingTaskSources({ courseName: 'Evidence', lessons: [] }, [source]);
    const roundTrip = renderCourseMapFromGraph(deriveCourseGraphFromCourseMap(map));
    expect(rebuildTeachingTaskSource(readTeachingTaskSources(roundTrip)[0]).answer).toBe(task.answer);
  });

  it('does not compile a structurally valid but unconfirmed model proposal', () => {
    const { inputs, plan } = paraphrasedPlan({ kind: 'model-proposal' });
    expect(validateTeachingOperationPlan(plan, inputs).valid).toBe(true);
    expect(evaluateTeachingOperationPlan(plan, inputs).issues[0].code).toBe('plan-unconfirmed');
    expect(
      buildSharedTeachingTask({
        lessonId: 'review',
        objective,
        operationPlan: plan,
        sourceInputs: inputs,
        admitted: true,
      }),
    ).toBeNull();
  });

  it('binds a number rather than accepting the whole sentence as a numeric role', () => {
    const { plan, inputs } = paraphrasedPlan();
    plan.bindings.amendedValue = { ...plan.bindings.amendedRecord };
    expect(evaluateTeachingOperationPlan(plan, inputs).issues.some((i) => i.code === 'plan-count')).toBe(true);
    plan.bindings.amendedValue = {
      inputId: 'entry-b',
      start: inputs[1].text.indexOf('52') + 1,
      end: inputs[1].text.indexOf('52') + 2,
    };
    expect(evaluateTeachingOperationPlan(plan, inputs).issues.some((i) => i.code === 'plan-count')).toBe(true);
  });

  it('checks source ownership, revision, operation version, and complete required performances', () => {
    const { plan, inputs } = paraphrasedPlan();
    const changed = structuredClone(inputs);
    changed[0].text += ' The first entry is disputed.';
    expect(evaluateTeachingOperationPlan(plan, changed).issues.some((i) => i.code === 'plan-stale-input')).toBe(true);
    expect(validateTeachingOperationPlan({ ...plan, operation: '__proto__' }, inputs).valid).toBe(false);
    expect(validateTeachingOperationPlan({ ...plan, version: 200 }, inputs).valid).toBe(false);
    expect(
      validateTeachingOperationPlan({ ...plan, requirements: [{ id: 'evidence', weight: 100 }] }, inputs).valid,
    ).toBe(false);
    const wrongRecord = structuredClone(plan);
    wrongRecord.bindings.priorValue = { ...wrongRecord.bindings.amendedValue };
    expect(
      evaluateTeachingOperationPlan(wrongRecord, inputs).issues.some((i) => i.code === 'plan-record-ownership'),
    ).toBe(true);
  });

  it.each(['-52', '−52', '- 52', '5.52', '52.5', '1e52', '52e3', '52/76', '52%'])(
    'rejects a numeric substring in %s',
    (value) => {
      const { plan, inputs } = paraphrasedPlan();
      inputs[1].text = inputs[1].text.replace('52 seats', `${value} seats`);
      const start = inputs[1].text.indexOf('52');
      plan.bindings.amendedValue = { inputId: inputs[1].id, start, end: start + 2 };
      plan.inputRevisions[inputs[1].id] = operationInputRevision(inputs[1]);
      expect(validateTeachingOperationPlan(plan, inputs).issues.some((i) => i.code === 'plan-count')).toBe(true);
    },
  );

  it('declines out-of-contract legacy records without throwing or compiling an unchanged numeric value', () => {
    for (const revised of ['1234567890', '0120']) {
      const claims = legacyClaims.map((text) => text.replace('90 seats', `${revised} seats`));
      expect(() => explicitSourceRelationTask(claims, objective)).not.toThrow();
      expect(explicitSourceRelationTask(claims, objective)).toBeNull();
    }
    const claims = legacyClaims.map((text) => text.replace('1 July', `1 July ${'additional context '.repeat(10)}`));
    expect(explicitSourceRelationTask(claims, objective)).toBeNull();
  });

  it('rejects an imported task whose declared family differs from its bound operation', () => {
    const source = teachingTaskSourceFromLesson({
      id: 'source-lesson',
      lessonNumber: 1,
      title: 'Amendment',
      teachingTask: legacyTask(),
    });
    const map = withTeachingTaskSources({ courseName: 'Evidence', lessons: [] }, [source]);
    map.teachingProgram.tasks[0].kind = 'evidence-experimental-design';
    map.teachingProgram.revision = teachingProgramRevision(map.teachingProgram);
    expect(
      validateTeachingProgram(map.teachingProgram).issues.some((i) => i.code === 'teaching-program-operation-kind'),
    ).toBe(true);
  });

  it('preserves identities and repositions date bindings when a count changes length', () => {
    const task = legacyTask();
    expect(task.operationPlan).toBeTruthy();
    const nextInputs = task.inputs.map((i) => ({ ...i, text: i.text.replace('90 seats', '104 seats') }));
    const nextPlan = rebindTeachingOperationEdit(task.operationPlan, task.inputs, nextInputs);
    const result = evaluateTeachingOperationPlan(nextPlan, nextInputs);
    expect(result.status).toBe('ready');
    expect(result.values.amendedValue).toBe('104');
    expect(result.values.effectiveDate).toBe('1 July');
    expect(Object.keys(nextPlan.inputRevisions)).toEqual(task.inputs.map((i) => i.id));
    const source = teachingTaskSourceFromLesson({
      id: 'source-lesson',
      lessonNumber: 1,
      title: 'Amendment',
      teachingTask: task,
      teachingTaskScope: 'primary-task',
    });
    const rebuilt = rebuildTeachingTaskSource({ ...source, inputs: nextInputs, operationPlan: nextPlan });
    expect(rebuilt.id).toBe(task.id);
    expect(rebuilt.answer).toContain('104 seats');
    expect(rebuilt.answer).not.toContain('90 seats');
    expect(rebuilt.revision).not.toBe(task.revision);
  });

  it('does not silently compile impossible effective dates during source edits', () => {
    const task = legacyTask();
    for (const date of ['31 April', '2025-02-29', '1900-02-29']) {
      const nextInputs = task.inputs.map((input) => ({ ...input, text: input.text.replace('1 July', date) }));
      expect(rebindTeachingOperationEdit(task.operationPlan, task.inputs, nextInputs)).toBeNull();
    }
    const nextInputs = task.inputs.map((input) => ({ ...input, text: input.text.replace('1 July', '2000-02-29') }));
    const nextPlan = rebindTeachingOperationEdit(task.operationPlan, task.inputs, nextInputs);
    expect(evaluateTeachingOperationPlan(nextPlan, nextInputs).status).toBe('ready');
    const initial = paraphrasedPlan();
    initial.inputs[1].text = initial.inputs[1].text.replace('14 September', '31 September');
    initial.plan.inputRevisions[initial.inputs[1].id] = operationInputRevision(initial.inputs[1]);
    const checked = validateTeachingOperationPlan(initial.plan, initial.inputs);
    expect(checked.issues.some((entry) => entry.code === 'plan-calendar-date')).toBe(true);
    expect(evaluateTeachingOperationPlan(initial.plan, initial.inputs).status).toBe('needs-review');
  });

  it.each([
    ['revocation', (s) => s.replace('amends', 'does not amend')],
    ['unit', (s) => s.replace('90 seats', '90 tables')],
    ['boundary', (s) => s.replace('no reliable date', 'a reliable date of 2 July')],
    ['date condition', (s) => s.replace('1 July', '1 July unless the amendment was cancelled')],
    ['negative count', (s) => s.replace('90 seats', '-90 seats')],
  ])('requires fresh review for a %s edit', (_label, edit) => {
    const task = legacyTask();
    expect(
      rebindTeachingOperationEdit(
        task.operationPlan,
        task.inputs,
        task.inputs.map((i) => ({ ...i, text: edit(i.text) })),
      ),
    ).toBeNull();
  });

  it('uses persisted criterion weights and keeps a supported alternative response in the rubric review set', () => {
    const { plan, inputs } = paraphrasedPlan();
    plan.requirements = [
      { id: 'evidence', weight: 20 },
      { id: 'reasoning', weight: 50 },
      { id: 'boundary', weight: 30 },
    ];
    const task = buildSharedTeachingTask({
      lessonId: 'score',
      objective,
      operationPlan: plan,
      sourceInputs: inputs,
      admitted: true,
    });
    expect(teachingTaskRubric(task, 20).map((c) => c.points)).toEqual([4, 10, 6]);
    expect(task.question).toContain('propose one specific new record');
    expect(task.answer).toContain('Seek a dated register');
    expect(task.contrastResponses.map((r) => r.id)).toEqual([
      'complete',
      'conclusion-without-reasoning',
      'misconception',
      'alternative-representation',
    ]);
    for (const example of task.contrastResponses)
      for (const judgment of example.judgments)
        for (const evidence of judgment.evidence) {
          expect(evidence.start).toBeGreaterThanOrEqual(0);
          expect(example.response.slice(evidence.start, evidence.end)).toBe(evidence.quote);
        }
  });
});

describe('operation bindings in the actual material compiler and sync', () => {
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
  function packageFixture() {
    const map = {
      courseName: 'Record revisions',
      lessons: [
        {
          title: 'Record revisions',
          sections: [
            {
              topicSection: 'Records',
              learningObjectives: objective,
              weeklyAssessments: 'An evidence table and justified conclusion.',
            },
          ],
        },
      ],
    };
    const blueprint = buildCourseBlueprint(map, {
      sourceBrief: `${objective}\n50 minutes.\nSource facts:\n${legacyClaims.map((s, i) => `${i + 1}. ${s}`).join('\n')}`,
      sessionMinutes: 50,
      instructorProvidedFacts: legacyClaims,
    });
    const compiled = compileBlueprintDeliverables(blueprint, features);
    return {
      map: reconcileCourseMapWithBlueprintSemanticAdmission(map, compiled[BLUEPRINT_COMPILE_CONTEXT]),
      entries: Object.fromEntries(features.map((id) => [id, { status: 'done', data: compiled[id], stale: false }])),
    };
  }

  it('updates the same operation, all nine material copies and answers while preserving the independent case', () => {
    const { map, entries } = packageFixture();
    const oldData = entries.studyGuides.data;
    expect(map.teachingProgram.tasks[0].operationPlan.operation).toBe('record-amendment');
    const editPath = ['studyGuides', 0, 'sourceEvidenceBrief', 'claims', 1];
    const newData = structuredClone(oldData);
    newData.studyGuides[0].sourceEvidenceBrief.claims[1] = legacyClaims[1].replace('90 seats', '104 seats');
    const result = applyTeachingTaskSourceEdit({
      featureId: 'studyGuides',
      oldData,
      newData,
      editPath,
      deliverables: entries,
      courseMap: map,
    });
    expect(result.status).toBe('applied');
    expect(result.conflicts).toEqual([]);
    for (const id of features) {
      const rendered = JSON.stringify(result.changed[id].data);
      expect(rendered, id).toContain('104 seats');
      expect(rendered, id).not.toContain('90 seats');
      expect(result.changed[id].data.teachingTaskSources[0].operationPlan.operation).toBe('record-amendment');
    }
    expect(JSON.stringify(result.changed.studyGuides.data)).toContain('24 places');
    expect(JSON.stringify(result.changed.studyGuides.data)).toContain('36 places');
    expect(result.changed.rubrics.data.rubrics[0].anchorExampleSet.partialSample).toContain('applicable version');
    expect(result.changed.rubrics.data.rubrics[0].anchorExampleSet.misconceptionSample).toContain('always incorrect');
    expect(result.changed.rubrics.data.rubrics[0].anchorExampleSet.alternativeSample).toContain('Table:');
  });

  it('migrates the old generated question instead of retaining a question that omits the new scoring requirement', () => {
    const { courseMap: oldMap, deliverables: entries } = JSON.parse(
      fs.readFileSync('tests/fixtures/teaching/v0192-amendment-study-guide.json', 'utf8'),
    );
    const oldData = entries.studyGuides.data;
    const newData = structuredClone(oldData);
    newData.studyGuides[0].sourceEvidenceBrief.claims[1] = legacyClaims[1].replace('90 seats', '84 seats');
    const result = applyTeachingTaskSourceEdit({
      featureId: 'studyGuides',
      oldData,
      newData,
      editPath: ['studyGuides', 0, 'sourceEvidenceBrief', 'claims', 1],
      deliverables: entries,
      courseMap: oldMap,
    });
    expect(result.status).toBe('applied');
    expect(result.conflicts).toEqual([]);
    expect(result.changed.studyGuides.data.studyGuides[0].workedExample.problem).toContain(
      'propose one specific new record',
    );
    expect(
      result.changed.studyGuides.data.studyGuides[0].reviewQuestions.some((q) => q.practiceKind === 'task-rehearsal'),
    ).toBe(false);
    expect(readTeachingTaskSources(result.courseMap)[0].operationPlan.operation).toBe('record-amendment');
  });

  it('refuses an unconfirmed saved operation without falling back to an independently re-parsed answer', () => {
    const { map } = packageFixture();
    const sources = readTeachingTaskSources(map);
    sources[0].operationPlan.admission = { kind: 'model-proposal' };
    const pending = withTeachingTaskSources(map, sources);
    const blueprint = buildCourseBlueprint(pending, { instructorProvidedFacts: legacyClaims, sessionMinutes: 50 });
    expect(() => compileBlueprintDeliverables(blueprint, features)).toThrow('Review the saved teaching operation');
  });

  it('includes all four constructed responses and their status in the actual editable rubric document', async () => {
    const { entries } = packageFixture();
    const children = [];
    _buildDocxContentShared('rubrics', entries.rubrics.data, children, docx);
    const document = buildDocxDocument(docx, children, { courseName: 'Record revisions', label: 'Rubrics' });
    const bytes = await docx.Packer.toBuffer(document);
    const zip = await JSZip.loadAsync(bytes);
    const xml = await zip.file('word/document.xml').async('string');
    for (const expected of [
      'Strong response',
      'Partial response',
      'Typical misconception',
      'Acceptable alternative',
      'not student data',
      'Table:',
      'applicable version',
    ])
      expect(xml).toContain(expected);
  });
});
