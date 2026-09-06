import { describe, expect, it } from 'vitest';
import twoSessions from '../../../benchmarks/classroom/v1/cases/held-two-session-design.json';
import {
  BLUEPRINT_COMPILE_CONTEXT,
  buildCourseBlueprint,
  compactBlueprintForStorage,
  compileBlueprintDeliverables,
  hydrateBlueprintForCompilation,
} from '../courseBlueprintCompiler.js';
import { buildSharedTeachingTask } from '../compilerTeachingTask.js';
import { selectInstructorTaskSourceFacts } from '../compilerTeachingTaskSequence.js';
import { extractInstructorProvidedFacts } from '../sourceBriefConstraints.js';
import { completeNativeKernelSurfaces } from '../nativeGraphAuthoring.js';
import { projectTeachingTaskSyllabus } from '../compilerTeachingTaskSyllabus.js';
import { compileBlueprintLessonPatch } from '../compiledLessonSync.js';

const features = [
  'lessonPlans',
  'studyGuides',
  'assignments',
  'rubrics',
  'discussions',
  'quizBank',
  'courseFaq',
  'slideDecks',
];
function blueprint(fixture = twoSessions, extra = {}) {
  const lessonContent = structuredClone(fixture.lessonContent);
  for (const [id, payload] of Object.entries(lessonContent))
    lessonContent[id] = completeNativeKernelSurfaces(
      payload,
      fixture.map.lessons[Number(id.replace('lesson-', '')) - 1],
    );
  return buildCourseBlueprint(fixture.map, {
    sourceBrief: fixture.sourceBrief,
    instructorProvidedFacts: extractInstructorProvidedFacts(fixture.sourceBrief),
    sessionMinutes: fixture.sessionMinutes,
    enrichment: { lessonContent },
    ...extra,
  });
}
const sensorFacts = [
  'In a fictional sensor experiment, Group A receives higher voltage and twelve degrees of temperature while Group B receives lower voltage and twenty degrees of temperature; both use the same device model and exposure time.',
  'Signal amplitude after ten seconds is the outcome; because voltage and temperature both differ, this comparison cannot isolate the effect of voltage.',
  'Random assignment allocates devices by chance to conditions; keeping temperature equal while changing voltage removes the stated temperature difference from the comparison.',
];
const diagnosis = {
  id: 'sensor-diagnosis',
  outcomes: ['Identify the changed conditions and outcome in the supplied sensor comparison.'],
};
const repair = {
  id: 'sensor-repair',
  outcomes: ['Propose a comparison that changes voltage while keeping temperature equal.'],
};

describe('lesson-specific source tasks and progression', () => {
  it('routes only complete records with case-specific objective anchors, including a different experiment', () => {
    expect(selectInstructorTaskSourceFacts(diagnosis, sensorFacts)).toEqual(sensorFacts.slice(0, 2));
    expect(selectInstructorTaskSourceFacts(repair, sensorFacts)).toEqual(sensorFacts);
    expect(
      selectInstructorTaskSourceFacts(
        { id: 'other', outcomes: ['Identify the variables in a market comparison.'] },
        sensorFacts,
      ),
    ).toEqual([]);
    expect(
      selectInstructorTaskSourceFacts(
        { id: 'generic', outcomes: ['Identify the changed conditions and measured outcome.'] },
        sensorFacts,
      ),
    ).toEqual([]);
    const plantFacts = extractInstructorProvidedFacts(twoSessions.sourceBrief);
    expect(selectInstructorTaskSourceFacts(repair, [...sensorFacts, ...plantFacts])).toEqual([]);
    expect(selectInstructorTaskSourceFacts(repair, sensorFacts.slice(0, 2))).toEqual([]);
    const unrelatedRepair = plantFacts.find((fact) => fact.startsWith('Random assignment'));
    const unrelatedLimit = plantFacts.find((fact) => fact.startsWith('Plant height'));
    expect(selectInstructorTaskSourceFacts(repair, [...sensorFacts.slice(0, 2), unrelatedRepair])).toEqual([]);
    expect(selectInstructorTaskSourceFacts(diagnosis, [sensorFacts[0], unrelatedLimit])).toEqual([]);
    expect(selectInstructorTaskSourceFacts(diagnosis, [...sensorFacts.slice(0, 2), unrelatedRepair])).toEqual(
      sensorFacts.slice(0, 2),
    );
    const task = buildSharedTeachingTask({
      lessonId: diagnosis.id,
      objective: diagnosis.outcomes[0],
      claims: sensorFacts.slice(0, 2),
      admitted: true,
    });
    expect(task.kind).toBe('confound-diagnosis');
    expect(task.question).not.toContain('repaired design');
    expect(task.answer).toContain('twelve degrees');
    expect(task.answer).toContain('twenty degrees');
    expect(task.answer).not.toContain('fertilizer');
  });

  it('preserves distinct declared goals and makes lesson two retrieve the actual earlier diagnosis', () => {
    const d = compileBlueprintDeliverables(blueprint(), features);
    const [first, second] = d[BLUEPRINT_COMPILE_CONTEXT].lessons;
    expect(first.outcomes).toEqual([twoSessions.map.lessons[0].sections[0].learningObjectives]);
    expect(second.outcomes).toEqual([twoSessions.map.lessons[1].sections[0].learningObjectives]);
    expect(first.teachingTask.kind).toBe('confound-diagnosis');
    expect(second.teachingTask.kind).toBe('controlled-comparison-repair');
    expect(first.teachingTask.criteria.map((c) => c.id)).not.toContain('repair');
    expect(second.teachingTask.criteria.map((c) => c.id)).toContain('repair');
    expect(second.teachingTask.preparation.taskRevision).toBe(first.teachingTask.revision);
    expect(d.lessonPlans.lessonPlans[1].outline[0].instructorNotes).toContain(first.teachingTask.checkpoint.answer);
    expect(d.lessonPlans.lessonPlans[1].warmUp.facilitation).toContain('Lesson 1');
    expect(d.studyGuides.studyGuides[1].practiceActivities[0]).toContain('if you missed that lesson');
    expect(d.assignments.assignments[0].deliverables[0]).toContain('comparison table');
    expect(d.assignments.assignments[1].deliverables[0]).toContain('two-group protocol');
    for (let index = 0; index < 2; index++) {
      expect(d.studyGuides.studyGuides[index].taskRevision).toBe(d.rubrics.rubrics[index].taskRevision);
      expect(d.studyGuides.studyGuides[index].reviewQuestions.every((q) => q.answer)).toBe(true);
      expect(d.discussions.discussions[index].followUpProbes.length).toBeGreaterThanOrEqual(2);
      expect(d.quizBank.quizzes[index].questions).toHaveLength(8);
      expect(d.quizBank.quizzes[index].questions.every((q) => q.enrichmentSource === 'shared-teaching-task')).toBe(
        true,
      );
      expect(d.quizBank.quizzes[index].questions.map((q) => q.answer).join(' ')).not.toContain('Accept a claim traced');
      expect(d.slideDecks.decks[index].slides.map((s) => `${s.title} ${s.bullets?.join(' ')}`).join(' ')).not.toContain(
        'An individual written explanation supported',
      );
      expect(d.lessonPlans.lessonPlans[index].classSessionPlan.sessionMinutes).toBe(40);
    }
    expect(d.quizBank.quizzes[1].questions.every((q) => q.enrichmentSource === 'shared-teaching-task')).toBe(true);
    expect(d.quizBank.quizzes[1].questions.map((q) => q.answer).join(' ')).not.toMatch(
      /A valid response identifies|Quote or identify the decisive ledger/,
    );
    expect(d.quizBank.quizzes[1].questions[6].answer).toContain('does not supply outcome data');
    expect(d.quizBank.quizzes[1].questions[7].answer).toContain('first group');
  });

  it('retains source routing through compact restore without inventing a prerequisite in a single-lesson scope', () => {
    const compact = JSON.parse(JSON.stringify(compactBlueprintForStorage(blueprint())));
    const restored = hydrateBlueprintForCompilation(compact);
    expect(restored.lessons[1].teachingTask.preparation.taskId).toBe(restored.lessons[0].teachingTask.id);
    const scoped = hydrateBlueprintForCompilation(blueprint(twoSessions, { scopeIndices: [1] }));
    expect(scoped.lessons).toHaveLength(1);
    expect(scoped.lessons[0].id).toBe('lesson-2');
    expect(scoped.lessons[0].teachingTask.kind).toBe('controlled-comparison-repair');
    expect(scoped.lessons[0].teachingTask.preparation).toBeUndefined();
    expect(scoped.instructorSourceFactsByLesson['lesson-2']).toHaveLength(3);
  });

  it('binds duplicate syllabus assessment names to distinct tasks and retains grading provenance', () => {
    const d = compileBlueprintDeliverables(blueprint(), ['syllabus', 'assignments', 'rubrics']);
    const { lessons } = d[BLUEPRINT_COMPILE_CONTEXT];
    const syllabus = d.syllabus.syllabus;
    expect(syllabus.meetingPattern).toBe('2 sessions of 40 minutes');
    expect(syllabus.gettingStarted).not.toMatch(/Week|course site/);
    expect(new Set(syllabus.courseRequirements.map((r) => r.name)).size).toBe(2);
    lessons.forEach((lesson, index) => {
      const task = lesson.teachingTask;
      expect(syllabus.courseRequirements[index].name).toBe(d.assignments.assignments[index].title);
      expect(syllabus.outcomeAlignmentMatrix[index].assessedBy).toEqual([task.title]);
      expect(syllabus.assessmentCalendar[index].rubricCriteria).toEqual(task.criteria.map((c) => c.label));
      expect(syllabus.weeklySchedule[index].week).toBe(`Session ${index + 1}`);
      expect(syllabus.importantDates[index].event).toBe(task.title);
      expect(syllabus.assessmentCalendar[index].gradingWeightProvenance.reviewRequired).toBe(false);
      expect(syllabus.assessmentCalendar[index].pointsOrWeight).toMatch(/formative/i);
    });
    expect(syllabus.courseRequirementWeightNote).toContain('No course-grade percentages have been invented');
    const official = { ...d[BLUEPRINT_COMPILE_CONTEXT], courseGradingPolicy: { categories: [] } };
    const categories = [{ name: 'Department portfolio', weight: '100%', lessonNumbers: [1] }];
    syllabus.courseRequirements = structuredClone(categories);
    projectTeachingTaskSyllabus(syllabus, official);
    expect(syllabus.courseRequirements).toEqual(categories);
    // An integrated assessment must not be renamed after just one of its lessons.
    delete official.courseGradingPolicy;
    syllabus.courseRequirements = [{ name: 'Integrated assessment', lessonNumbers: [1, 2] }];
    projectTeachingTaskSyllabus(syllabus, official);
    expect(syllabus.courseRequirements[0].name).toBe('Integrated assessment');
  });

  it('updates the prerequisite answer and revision after source edits without changing the task identities', () => {
    const before = hydrateBlueprintForCompilation(blueprint());
    const changed = JSON.parse(JSON.stringify(twoSessions).replaceAll('eight hours', 'ten hours'));
    const after = hydrateBlueprintForCompilation(blueprint(changed));
    for (let index = 0; index < 2; index++) {
      expect(after.lessons[index].teachingTask.id).toBe(before.lessons[index].teachingTask.id);
      expect(after.lessons[index].teachingTask.revision).not.toBe(before.lessons[index].teachingTask.revision);
    }
    const reference = after.lessons[1].teachingTask.preparation;
    expect(reference.taskRevision).toBe(after.lessons[0].teachingTask.revision);
    expect(reference.expectedAnswer).toContain('ten hours');
    expect(reference.expectedAnswer).not.toContain('eight hours');
  });

  it('keeps the preceding source diagnosis when the production sync path regenerates lesson two', () => {
    const saved = blueprint();
    const patch = compileBlueprintLessonPatch({
      featureId: 'studyGuides',
      courseMap: twoSessions.map,
      lessonIndex: 1,
      sourceBrief: twoSessions.sourceBrief,
      sessionMinutes: 40,
      enrichmentOverlay: { lessonContent: Object.fromEntries(saved.lessons.map((l) => [l.id, l.enrichment])) },
    });
    expect(patch.data.studyGuides).toHaveLength(1);
    expect(patch.data.studyGuides[0].practiceActivities[0]).toContain('diagnosis from Lesson 1');
    expect(patch.data.studyGuides[0].workedExample.result).toContain('eight hours');
    expect(
      patch.data.studyGuides[0].reviewQuestions.filter((question) => question.practiceKind !== 'independent-transfer'),
    ).toHaveLength(6);
    expect(
      patch.data.studyGuides[0].reviewQuestions.filter((question) => question.practiceKind === 'independent-transfer'),
    ).toHaveLength(1);
  });
});
