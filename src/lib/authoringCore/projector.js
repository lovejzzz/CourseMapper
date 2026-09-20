import { clone } from './primitives.js';
const text = (blocks) => blocks.map((b) => b.text).join('\n\n');
export function projectDraft(draft, request) {
  const courseMap = { courseName: draft.plan.title, courseDescription: draft.plan.description, lessons: [] };
  const plans = [],
    assignments = [],
    rubrics = [];
  for (const [index, lesson] of draft.plan.lessons.entries()) {
    const b = draft.bundles[lesson.id];
    if (!b) continue;
    const objectiveText = (ids) => ids.map((i) => lesson.objectives.find((o) => o.id === i)?.text || i);
    courseMap.lessons.push({
      id: lesson.id,
      title: lesson.title,
      sections: [
        {
          topicSection: lesson.title,
          learningGoals: objectiveText(b.objectiveIds).join('\n'),
          learningObjectives: objectiveText(b.objectiveIds).join('\n'),
          weeklyAssessments: b.assessments.map((a) => a.prompt.text).join('\n\n'),
          asyncActivities: text(b.materials.assignmentBrief),
          syncActivities: b.lessonPlan.blocks
            .map((x) => `${x.title} (${x.durationMinutes} minutes): ${x.learnerTask.text}`)
            .join('\n\n'),
          supportingResources: b.concepts.map((c) => `${c.name}: ${c.explanation.text}`).join('\n\n'),
          technologyNeeded: '',
          presentationFormat: '',
          evaluateDesign: '',
        },
      ],
    });
    const workedExamples = b.examples
      .map((e) => [e.problem.text, ...e.steps.map((s) => s.text), e.result.text].join('\n\n'))
      .join('\n\n');
    plans.push({
      lessonId: lesson.id,
      lessonTitle: lesson.title,
      weekNumber: String(index + 1),
      duration: `${b.lessonPlan.sessionMinutes} minutes`,
      objectives: objectiveText(b.objectiveIds),
      materials: [
        ...b.concepts.map((c) => `${c.name}\n${c.explanation.text}`),
        ...b.examples.map((e) =>
          ['Worked example', e.problem.text, ...e.steps.map((s) => s.text), e.result.text].join('\n\n'),
        ),
        ...b.materials.teacherNotes.map((n) => n.text),
      ],
      prerequisiteKnowledge: b.concepts
        .map((c) => c.prerequisiteConceptIds.join(', '))
        .filter(Boolean)
        .join('\n'),
      outline: b.lessonPlan.blocks.map((x) => ({
        activity: x.title,
        time: `${x.durationMinutes} minutes`,
        type: 'Learning activity',
        description: x.learnerTask.text,
        instructorNotes: x.teacherInstructions.text,
        objectiveIds: x.objectiveIds,
        assessmentIds: x.assessmentClientIds,
      })),
      readyToTeachSupport: {
        workedExample: workedExamples,
        studentHandout: text(b.materials.assignmentBrief),
        instructorPrep: text(b.materials.teacherNotes),
        methodSpecificMiniRubric: b.rubric.map((c) => `${c.name} (${c.weightPercent}%)`).join('\n'),
      },
      formativeCheck: {
        type: 'Assessment',
        prompt: b.assessments.map((a) => a.prompt.text).join('\n\n'),
        instructorAction: b.assessments
          .map((a) =>
            [a.evaluation.teacherText.text, ...a.evaluation.reasoningOrCriteria.map((t) => t.text)].join('\n\n'),
          )
          .join('\n\n'),
      },
      tags: [],
    });
    // Student-facing assignments deliberately omit evaluation.teacherText,
    // reasoningOrCriteria and teacherNotes. They remain in the author layer.
    assignments.push({
      lessonId: lesson.id,
      title: lesson.title,
      assignmentType: 'Practice',
      relatedLessons: [lesson.title],
      overview: text(b.materials.assignmentBrief),
      objectives: objectiveText(b.objectiveIds),
      instructions: b.assessments.map((a) => a.prompt.text),
      deliverables: b.assessments.map((a) => a.studentEvidenceExpected),
      assessmentIds: b.assessments.map((a) => a.clientId),
      gradingCriteria: b.rubric.map((c) => `${c.name}: ${c.weightPercent}%`).join('\n'),
      totalPoints: 100,
      tags: [],
    });
    rubrics.push({
      lessonId: lesson.id,
      title: `${lesson.title} — rubric`,
      lessonTitle: lesson.title,
      gradedWork: b.assessments.map((a) => a.prompt.text).join('\n\n'),
      assessmentIds: b.assessments.map((a) => a.clientId),
      totalPoints: 100,
      criteria: b.rubric.map((c) => ({
        criterion: c.name,
        objectiveAligned: objectiveText(c.objectiveIds).join('; '),
        weight: c.weightPercent,
        points: c.weightPercent,
        exemplary: c.bands.find((x) => x.level === 4).descriptor,
        proficient: c.bands.find((x) => x.level === 3).descriptor,
        developing: c.bands.find((x) => x.level === 2).descriptor,
        beginning: c.bands.find((x) => x.level === 1).descriptor,
      })),
      teacherNotes: text(b.materials.teacherNotes),
      tags: [],
    });
  }
  const data = { lessonPlans: { plans }, assignments: { assignments }, rubrics: { rubrics } };
  const deliverables = Object.fromEntries(
    request.requestedFeatures.map((f) => [
      f,
      {
        status: 'done',
        data: data[f],
        error: null,
        stale: false,
        staleConfidence: null,
        authoredContent: {
          protocolVersion: 'coursemapper.authoring.v2',
          projectorVersion: 1,
          plan: clone(draft.plan),
          bundles: clone(draft.bundles),
          teacherOverride: clone(data[f]),
        },
      },
    ]),
  );
  return { courseMap, deliverables };
}
export { synchronizeAuthorLayer, authoredFeatures, preserveAuthoredSnapshot } from './authorLayer.js';
