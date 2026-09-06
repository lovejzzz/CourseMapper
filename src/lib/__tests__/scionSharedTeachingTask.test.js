import { describe, expect, it } from 'vitest';
import experiment from '../../../benchmarks/classroom/v1/cases/experimental-design.json';
import history from '../../../benchmarks/classroom/v1/cases/historical-sources.json';
import proportion from '../../../benchmarks/classroom/v1/cases/local-proportions.json';
import { buildSharedTeachingTask, teachingTaskRubric } from '../compilerTeachingTask.js';
import {
  buildCourseBlueprint,
  compileBlueprintDeliverables,
  BLUEPRINT_COMPILE_CONTEXT,
  reconcileCourseMapWithBlueprintSemanticAdmission,
} from '../courseBlueprintCompiler.js';
import { completeNativeKernelSurfaces } from '../nativeGraphAuthoring.js';
import { extractInstructorProvidedFacts } from '../sourceBriefConstraints.js';
import JSZip from 'jszip';
import { buildDeliverableDocxBlob } from '../exporters/bulkDocxExporter.js';
import { buildSlideDeckPptxBlob } from '../exporters/pptxExporter.js';

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
function replay(fixture) {
  const lessonContent = structuredClone(fixture.lessonContent);
  for (const [id, payload] of Object.entries(lessonContent)) {
    for (const field of payload.surfaceFallbacks || []) delete payload[field];
    lessonContent[id] = completeNativeKernelSurfaces(
      payload,
      fixture.map.lessons[Number(id.replace('lesson-', '')) - 1],
    );
  }
  return compileBlueprintDeliverables(
    buildCourseBlueprint(fixture.map, {
      sourceBrief: fixture.sourceBrief,
      sessionMinutes: fixture.sessionMinutes,
      instructorProvidedFacts: extractInstructorProvidedFacts(fixture.sourceBrief),
      enrichment: { lessonContent },
    }),
    features,
  );
}

describe('a shared source task across classroom materials', () => {
  it('keeps the actual Word and PowerPoint export contracts for all task projections', async () => {
    const d = replay(experiment);
    for (const feature of features.filter((id) => id !== 'slideDecks')) {
      const blob = await buildDeliverableDocxBlob(feature, d[feature], experiment.map.courseName);
      const zip = await JSZip.loadAsync(await blob.arrayBuffer());
      const text = await zip.file('word/document.xml').async('string');
      expect(text.length).toBeGreaterThan(200);
      if (feature === 'rubrics') expect(text).toContain('increases the sample');
      if (feature === 'studyGuides') expect(text).toContain('keeping light equal');
      if (feature === 'assignments') expect(text).not.toContain('1.6 hours');
      if (feature === 'lessonPlans') expect(text).not.toContain('Preserves the defining relationship');
    }
    const pptx = await buildSlideDeckPptxBlob(d.slideDecks, experiment.map.courseName, 0);
    const zip = await JSZip.loadAsync(await pptx.arrayBuffer());
    const pages = await Promise.all(
      Object.values(zip.files)
        .filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f.name))
        .map((f) => f.async('string')),
    );
    expect(pages.join(' ')).toContain('eight hours');
    expect(pages.join(' ')).toContain('four hours');
    expect(pages.join(' ')).toContain('keeping light equal');
  });
  it('recovers the actual experiment instead of testing only variable definitions', () => {
    const d = replay(experiment);
    const a = d.assignments.assignments[0],
      r = d.rubrics.rubrics[0],
      g = d.studyGuides.studyGuides[0],
      p = d.lessonPlans.lessonPlans[0];
    expect(a.overview).toContain('repaired design');
    expect(g.workedExample.inputs.join(' ')).toContain('eight hours');
    expect(g.workedExample.inputs.join(' ')).toContain('four hours');
    expect(g.workedExample.result).toContain('height after two weeks');
    expect(g.workedExample.result).toContain('keeping light equal');
    expect(d.quizBank.quizzes[0].practiceRecord.records.join(' ')).toContain('eight hours');
    expect(p.formativeCheck.prompt).toContain('adding more units');
    expect(p.closingActivity).toContain(p.formativeCheck.prompt);
    expect(p.formativeCheck.instructorAction).toContain('More units do not remove');
    const q = g.reviewQuestions.find((q) => q.practiceId === p.formativeCheck.practiceId);
    expect(q.answer).toBe(p.formativeCheck.expectedAnswer);
    expect(q.question).toBe(p.formativeCheck.prompt);
    expect(a.taskId).toBe(r.taskId);
    expect(a.taskRevision).toBe(g.taskRevision);
    expect(r.anchorExamples.strongSample).toBe(g.reviewQuestions[0].answer);
    expect(a.weightedGradingCriteria).toEqual(r.criteria);
    expect(r.criteria.find((c) => c.criterionId === 'repair').beginning).toContain('increases the sample');
    expect(r.criteria.find((c) => c.criterionId === 'confound').beginning).toContain('entirely');
    expect(r.criteria.reduce((sum, c) => sum + c.points, 0)).toBe(r.totalPoints);
    for (const criterion of r.criteria) {
      expect(new Set(['exemplary', 'proficient', 'developing', 'beginning'].map((k) => criterion[k])).size).toBe(4);
      expect(criterion.proficient).not.toContain('Excellent descriptor');
    }
    expect(d.discussions.discussions[0].estimatedDuration).toBe('10 minutes');
    expect(p.outline.find((x) => x.activity === 'Compare and revise responses').time).toBe('10 minutes');
    expect(d.quizBank.quizzes[0].questions).toHaveLength(8);
    expect(d.quizBank.quizzes[0].questions.filter((q) => q.enrichmentSource === 'shared-teaching-task')).toHaveLength(
      6,
    );
  });
  it('answers the historical comparison and makes a specific false inference scorable', () => {
    const d = replay(history);
    const g = d.studyGuides.studyGuides[0],
      r = d.rubrics.rubrics[0];
    expect(g.workedExample.result).toContain('1921');
    expect(g.workedExample.result).toContain('1978');
    expect(g.workedExample.result).toContain('dates need not conflict');
    expect(g.workedExample.result).toContain('no date for the repair is recorded');
    expect(r.criteria.find((c) => c.criterionId === 'relationship').beginning).toContain('one record must be false');
    expect(r.criteria.find((c) => c.criterionId === 'inference-limit').beginning).toContain('repair date');
    expect(g.reviewQuestions.every((q) => q.answer && q.successCriteria.length)).toBe(true);
    const map = reconcileCourseMapWithBlueprintSemanticAdmission(history.map, d[BLUEPRINT_COMPILE_CONTEXT]);
    expect(map.lessons[0].teachingTaskLink.taskId).toBe(g.taskId);
    expect(map.lessons[0].sections[0].syncActivities).toBe(d.assignments.assignments[0].overview);
    const edited = structuredClone(map);
    edited.lessons[0].sections[0].syncActivities = 'Learners draw their own event timeline in pairs.';
    expect(
      reconcileCourseMapWithBlueprintSemanticAdmission(edited, d[BLUEPRINT_COMPILE_CONTEXT]).lessons[0].sections[0]
        .syncActivities,
    ).toBe('Learners draw their own event timeline in pairs.');
    for (const [feature, key] of [
      ['lessonPlans', 'lessonPlans'],
      ['slideDecks', 'decks'],
      ['discussions', 'discussions'],
      ['courseFaq', 'faqs'],
    ])
      expect(d[feature][key][0].taskRevision).toBe(g.taskRevision);
  });
  it('updates the calculation, answer and rubric together after an input edit', () => {
    const changed = JSON.parse(
      JSON.stringify(proportion)
        .replaceAll('16/20', '3/8')
        .replaceAll('0.80', '0.375')
        .replaceAll('80%', '37.5%')
        .replaceAll('20 volunteers', '8 volunteers')
        .replaceAll('16 completed', '3 completed'),
    );
    const before = replay(proportion),
      after = replay(changed);
    const a = before.assignments.assignments[0],
      b = after.assignments.assignments[0];
    expect(a.taskId).toBe(b.taskId);
    expect(a.taskRevision).not.toBe(b.taskRevision);
    expect(after.rubrics.rubrics[0].taskRevision).toBe(b.taskRevision);
    expect(after.studyGuides.studyGuides[0].summary).toContain('37.5%');
    expect(JSON.stringify(after.rubrics.rubrics[0].criteria)).not.toContain('80%');
    expect(after.quizBank.quizzes[0].questions.find((q) => q.taskId === b.taskId).answer).toContain('0.375 × 8 = 3');
  });
  it('does not invent an experiment from definitions or borrow a missing record', () => {
    const claims = extractInstructorProvidedFacts(experiment.sourceBrief);
    const options = {
      lessonId: 'x',
      objective: 'Identify a confound and propose a repaired design.',
      admitted: true,
      claims,
    };
    expect(buildSharedTeachingTask(options)).not.toBeNull();
    expect(buildSharedTeachingTask({ ...options, claims: claims.slice(0, 4) })).toBeNull();
    expect(buildSharedTeachingTask({ ...options, claims: claims.filter((s) => !s.includes('Group A')) })).toBeNull();
    expect(buildSharedTeachingTask({ ...options, admitted: false })).toBeNull();
    expect(
      buildSharedTeachingTask({
        ...options,
        claims: [...claims, 'In a second experiment, Group A receives heat while Group B receives cooling.'],
      }),
    ).toBeNull();
    expect(
      buildSharedTeachingTask({
        ...options,
        workedExample: {
          problem: 'An authored alternative',
          result: 'The authored result',
          steps: ['Reason from its record.'],
        },
      }),
    ).toBeNull();
  });
  it('uses a changed source case without hard-coded subjects, dates, or the development answer', () => {
    const facts = extractInstructorProvidedFacts(
      history.sourceBrief
        .replaceAll('1921', '1842')
        .replaceAll('1978', '1996')
        .replaceAll('map', 'painting')
        .replace('In a fictional museum record', 'In fictional museum record 8888')
        .replace('The accession register', 'Accession register 7777'),
    );
    const task = buildSharedTeachingTask({
      lessonId: 'painting',
      objective: 'Compare the dates and distinguish observations from historical inferences.',
      claims: facts,
      admitted: true,
    });
    expect(task.answer).toContain('1842');
    expect(task.answer).toContain('1996');
    expect(task.answer).not.toContain('1921');
    expect(task.answer).not.toContain('1978');
    expect(task.answer).toMatch(/^1842 dates creation; 1996 dates acquisition/);
    expect(task.answer).not.toContain('8888 dates');
    expect(task.answer).toContain('painting');
    expect(teachingTaskRubric(task, 37).reduce((sum, c) => sum + c.points, 0)).toBe(37);
  });
});
