import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { proportionPresentationFixture } from '../../../tests/fixtures/teaching/proportionPresentation.js';
import { observedProportionFixture } from '../../../tests/fixtures/teaching/observedProportion.js';
import { performanceRequirementsFixture } from '../../../tests/fixtures/teaching/performanceRequirements.js';
import { createTeachingOperationPlan } from '../teachingOperationPlan.js';
import { buildSharedTeachingTask } from '../compilerTeachingTask.js';
import { projectSharedTeachingTasks, projectTeachingTasksIntoCourseMap } from '../compilerTeachingTaskProjection.js';
import { teachingTaskSourceFromLesson } from '../teachingTaskSource.js';
import { withTeachingTaskSources, readTeachingTaskSources } from '../teachingProgram.js';
import { finalizeCompiledDeliverableLanguage } from '../compiledLanguageFinalizer.js';
import {
  createTeachingTaskReviewDraft,
  previewTeachingTaskReview,
  commitTeachingTaskReview,
} from '../teachingTaskReview.js';
import { deriveCourseGraphFromCourseMap } from '../courseGraph/index.js';
import { prepareProjectSnapshotForRestore } from '../projectSnapshotSanitizer.js';
import { createEditTransaction, applyEditTransaction } from '../deliverableEditHistory.js';
import { buildDeliverableDocxBlob } from '../exporters/bulkDocxExporter.js';
import { deliverablePdfDefinition } from '../exporters/classroomPdf.js';
import { mergeTaskProjection, rememberTeacherEdit, preserveTeacherEdits } from '../teachingTaskContentSync.js';
import { studyGuideExportLabel, isStudyGuideExplanationEdit } from '../studyGuidePresentation.js';
import { projectArtifactEditToCourseMapPatch, createCanonicalPatchRequest } from '../artifactBlueprintProjection.js';

function fixture(zh = false, presentation = 3, authored = false) {
  const f = authored
    ? { ...observedProportionFixture(), ...performanceRequirementsFixture() }
    : proportionPresentationFixture(zh);
  const plan = createTeachingOperationPlan({
    ...f,
    operation: 'observed-proportion',
    version: authored ? 2 : 1,
    admission: { kind: 'teacher-confirmed' },
  });
  plan.presentationVersion = presentation;
  const task = buildSharedTeachingTask({
    lessonId: 'guide-unit',
    objective: f.objective,
    sourceInputs: f.inputs,
    operationPlan: plan,
    admitted: true,
  });
  const lesson = {
    id: 'guide-unit',
    lessonNumber: 1,
    title: zh ? '维修记录' : 'Repair records',
    teachingTaskScope: 'primary-task',
    teachingTask: task,
    classSessionPlan: { sessionMinutes: 50 },
  };
  const source = teachingTaskSourceFromLesson(lesson);
  const blueprint = { lessons: [lesson] };
  const data = finalizeCompiledDeliverableLanguage(
    'studyGuides',
    projectSharedTeachingTasks(
      'studyGuides',
      { studyGuides: [{ lessonNumber: 1, lessonTitle: lesson.title }] },
      blueprint,
    ),
    blueprint,
  );
  const courseMap = projectTeachingTasksIntoCourseMap(
    withTeachingTaskSources(
      {
        courseName: 'Guide development',
        lessons: [{ title: lesson.title, sections: [{ learningObjectives: task.objective }] }],
      },
      [source],
    ),
    blueprint,
  );
  return { task, source, data, courseMap, deliverables: { studyGuides: { data, status: 'done', stale: false } } };
}

function visible(value) {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(visible).join('');
  if (!value || typeof value !== 'object') return '';
  return visible(value.text || value.ul || value.stack || value.table?.body || '');
}

describe('reviewed study guide instructional roles', () => {
  it('keeps a reviewed guide explanation local and preserves it on later compilation', () => {
    const state = fixture(true);
    const editPath = ['studyGuides', 0, 'summary'];
    const newData = structuredClone(state.data);
    newData.studyGuides[0].summary += '教师备注：先圈出所计群体。';
    const args = { ...state, featureId: 'studyGuides', lessonIndex: 0, editPath, oldData: state.data, newData };
    expect(isStudyGuideExplanationEdit(args.featureId, args.oldData, args.editPath)).toBe(true);
    expect(projectArtifactEditToCourseMapPatch(args)).toBeNull();
    expect(createCanonicalPatchRequest(args)).toBeNull();
    const saved = rememberTeacherEdit(state.data, newData, editPath);
    expect(preserveTeacherEdits(saved, state.data).studyGuides[0].summary).toBe(newData.studyGuides[0].summary);
    for (const field of ['learningObjectives', 'sourceEvidenceBrief', 'reviewQuestions']) {
      expect(isStudyGuideExplanationEdit(args.featureId, args.oldData, ['studyGuides', 0, field, 0])).toBe(false);
    }
    const legacy = fixture(true, 2);
    expect(isStudyGuideExplanationEdit('studyGuides', legacy.data, editPath)).toBe(false);
    expect(isStudyGuideExplanationEdit('studyGuides', state.data, ['guides', 0, 'summary'])).toBe(false);
  });
  it('uses the same active collection for localized export titles, including legacy aliases', () => {
    const guides = [{ teachingGuideVersion: 1, language: 'zh' }];
    expect(studyGuideExportLabel('studyGuides', { guides }, 'Study Guides')).toBe('学习指南');
    expect(studyGuideExportLabel('studyGuides', { studyGuides: [], guides }, 'Study Guides')).toBe('Study Guides');
    expect(studyGuideExportLabel('studyGuides', { studyGuides: {}, guides }, 'Study Guides')).toBe('学习指南');
    expect(studyGuideExportLabel('studyGuides', { guides: [...guides, { language: 'en' }] }, 'Study Guides')).toBe(
      'Study Guides',
    );
    expect(studyGuideExportLabel('rubrics', { guides }, 'Rubrics')).toBe('Rubrics');
  });
  it('removes unchanged generated practice despite digest replay, retaining a teacher answer conflict', () => {
    const previous = [
      {
        id: 'practice-1',
        taskId: 'task-1',
        taskRevision: 'a'.repeat(64),
        question: 'Explain the denominator.',
        answer: 'The observed whole.',
      },
    ];
    const current = [{ ...previous[0], taskRevision: 'b'.repeat(64) }];
    expect(mergeTaskProjection(previous, [], current)).toEqual([]);
    current[0].answer = 'Teacher: annotate each counted group on the printed record.';
    const conflicts = [];
    expect(mergeTaskProjection(previous, [], current, [], conflicts)).toEqual(current);
    expect(conflicts).toHaveLength(1);
  });
  it.each([false, true])(
    'separates worked, guided and independent work without inventing answers (Chinese: %s)',
    (zh) => {
      const { task, data } = fixture(zh);
      const guide = data.studyGuides[0];
      expect(guide.reviewQuestions.map((q) => q.practiceKind)).toEqual([
        'task-scaffold',
        'task-scaffold',
        'independent-transfer',
      ]);
      expect(guide.reviewQuestions.some((q) => q.question === task.question)).toBe(false);
      expect(guide.objectivePractice).not.toContain(task.question);
      expect(guide.practiceActivities).not.toContain(task.question);
      expect(guide.workedExample.problem).toBe(task.question);
      expect(guide.workedExample.result).toContain(zh ? '53.75%' : '61.29%');
      expect(guide.summary).not.toContain(zh ? '53.75%' : '61.29%');
      expect(
        guide.conceptConnections.some((c) => task.criteria.some((criterion) => c.includes(criterion.levels.exemplary))),
      ).toBe(false);
      expect(guide.conceptConnections.join(' ')).toContain(
        zh ? '没有记录的结果仍是未知' : 'an unrecorded result is unknown',
      );
      const independent = task.sequence.find((unit) => unit.kind === 'independent-transfer');
      expect(guide.reviewQuestions.at(-1)).toMatchObject({
        practiceId: independent.id,
        answer: independent.answer,
        hint: '',
      });
      expect(guide.sourceEvidenceBrief.claims).toEqual(task.inputs.map((input) => input.text));
      expect(guide.commonMisconceptions.map((m) => m.correction)).toEqual(task.errors.map((e) => e.feedback));
    },
  );

  it('keeps every authored requirement’s guided and independent practice', () => {
    const { task, data } = fixture(false, 3, true);
    const guide = data.studyGuides[0];
    for (const requirement of task.operationPlan.requirements) {
      expect(
        guide.reviewQuestions.some((q) => q.requirementId === requirement.id && q.practiceKind === 'task-scaffold'),
      ).toBe(true);
      const independent = guide.reviewQuestions.find((q) => q.practiceKind === 'independent-transfer');
      expect(independent.question).toContain(requirement.transfer.action);
      expect(independent.answer).toContain(requirement.transfer.answer);
      expect(independent.successCriteria).toContain(requirement.transfer.levels.exemplary);
    }
  });

  it.each([false, true])('upgrades an older guide through the real review and restored history (Chinese: %s)', (zh) => {
    const state = fixture(zh, 2);
    expect(state.data.studyGuides[0].reviewQuestions.some((q) => q.practiceKind === 'task-rehearsal')).toBe(true);
    expect(state.data.studyGuides[0].teachingGuideVersion).toBeUndefined();
    const before = {
      courseMap: state.courseMap,
      courseGraph: deriveCourseGraphFromCourseMap(state.courseMap),
      deliverables: state.deliverables,
    };
    const untouched = JSON.stringify(before);
    const preview = previewTeachingTaskReview({ ...state, draft: createTeachingTaskReviewDraft(state.source) });
    expect(preview.status, preview.message).toBe('preview');
    expect(JSON.stringify(before)).toBe(untouched);
    const applied = commitTeachingTaskReview({ ...state, preview, teacherConfirmed: true });
    expect(applied.conflicts).toEqual([]);
    const next = applied.changed.studyGuides.data.studyGuides[0];
    expect(next.teachingGuideVersion).toBe(1);
    expect(next.reviewQuestions).toHaveLength(3);
    expect(readTeachingTaskSources(applied.courseMap)[0].id).toBe(state.source.id);
    const after = {
      courseMap: applied.courseMap,
      courseGraph: deriveCourseGraphFromCourseMap(applied.courseMap),
      deliverables: { ...state.deliverables, ...applied.changed },
    };
    const tx = JSON.parse(JSON.stringify(createEditTransaction(before, after)));
    const restored = prepareProjectSnapshotForRestore(JSON.parse(JSON.stringify(after)));
    const undone = applyEditTransaction(restored, tx, 'undo');
    expect(undone.status).toBe('applied');
    expect(undone.workspace.deliverables).toEqual(before.deliverables);
    expect(applyEditTransaction(undone.workspace, tx, 'redo').workspace.deliverables).toEqual(after.deliverables);
  });

  it('preserves an authored summary as an explicit upgrade conflict', () => {
    const state = fixture(false, 2);
    state.data.studyGuides[0].summary = 'Teacher note: our workshop uses this evidence example before the laboratory.';
    const preview = previewTeachingTaskReview({ ...state, draft: createTeachingTaskReviewDraft(state.source) });
    const applied = commitTeachingTaskReview({ ...state, preview, teacherConfirmed: true });
    expect(applied.changed.studyGuides.data.studyGuides[0].summary).toBe(state.data.studyGuides[0].summary);
    expect(applied.conflicts.some((entry) => entry.path.at(-1) === 'summary')).toBe(true);
    expect(applied.changed.studyGuides.stale).toBe(true);
  });

  it('recalculates the main case without changing the independent case', () => {
    const state = fixture();
    const independent = state.data.studyGuides[0].reviewQuestions.at(-1);
    const draft = createTeachingTaskReviewDraft(state.source);
    draft.inputs[0].text = draft.inputs[0].text.replace('19 had', '20 had');
    draft.bindings.numerator.quote = '20';
    const preview = previewTeachingTaskReview({ ...state, draft });
    expect(preview.status, preview.message).toBe('preview');
    const applied = commitTeachingTaskReview({ ...state, preview, teacherConfirmed: true });
    expect(applied.conflicts).toEqual([]);
    const guide = applied.changed.studyGuides.data.studyGuides[0];
    expect(guide.workedExample.result).toContain('64.52%');
    expect(guide.reviewQuestions.at(-1)).toMatchObject({
      practiceId: independent.practiceId,
      question: independent.question,
      answer: independent.answer,
      successCriteria: independent.successCriteria,
    });
  });

  it.each([false, true])(
    'exports one main task, separate answer pages and source numbers (Chinese: %s)',
    async (zh) => {
      const { task, data } = fixture(zh);
      const guide = data.studyGuides[0];
      guide.keyTerms = [
        {
          term: 'denominator',
          definition: 'The counted whole.',
          example: '80 inspected devices.',
          source: 'Workshop record',
        },
      ];
      const definition = deliverablePdfDefinition('studyGuides', data, 'Workshop');
      const content = definition.content.map(visible);
      const key = content.findIndex((text) => text.includes(zh ? '自查答案' : 'PRACTICE ANSWER KEY'));
      expect(key).toBeGreaterThan(0);
      expect(definition.content[key].pageBreak).toBe('before');
      const independentAnswer = guide.reviewQuestions.at(-1).answer;
      expect(content.slice(0, key).join('')).not.toContain(independentAnswer);
      expect(content.slice(key).join('')).toContain(independentAnswer);
      expect(content.join('').split(task.question)).toHaveLength(2);
      expect(content.join('')).toContain(guide.examPrep.reviewStrategy);
      expect(content.join('')).not.toContain('compare the two source claims');
      expect(content.join('')).toContain('1. ' + task.inputs[0].text);
      expect(content.join('')).toContain('_____');
      expect(content.join('')).toContain(`${zh ? '例子' : 'Example'}: 80 inspected devices.`);
      if (zh) {
        expect(content.join('')).toContain('独立练习');
        expect(content.join('')).not.toMatch(/REVIEW QUESTIONS|CONCEPT SUMMARY|Hint:|Bloom:|Practice task:/);
        expect(definition.info.title).toBe('Workshop — 学习指南');
      }
      const blob = await buildDeliverableDocxBlob('studyGuides', data, 'Workshop');
      const archive = await JSZip.loadAsync(await blob.arrayBuffer());
      const xml = await archive.file('word/document.xml').async('string');
      expect(xml).toContain(zh ? '自查答案' : 'PRACTICE ANSWER KEY');
      expect(xml).toContain('<w:pageBreakBefore');
      expect(xml).toContain(guide.examPrep.reviewStrategy.replaceAll('&', '&amp;'));
    },
  );
});
