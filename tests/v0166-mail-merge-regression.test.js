import { describe, expect, it } from 'vitest';
import { buildCourseBlueprint, compileBlueprintDeliverables } from '../src/lib/courseBlueprintCompiler';

const GENETICS_TITLES = [
  'DNA Structure Fundamentals',
  'Genome Editing Techniques',
  'Population Genetics Theory',
  'Quantitative Genetics Modeling',
  'Cumulative Investigation Project',
];

function geneticsCourseMap() {
  return {
    courseName: 'Introduction to Genetics',
    semester: 'Fall 2026',
    lessons: GENETICS_TITLES.map((title, index) => ({
      title: `Lesson ${index + 1}: ${title}`,
      sections: [
        {
          topicSection: `${index + 1}.1: ${title}`,
          learningGoals: `Explain the central model for ${title}.`,
          learningObjectives: `Analyze genetics evidence and defend one bounded conclusion about ${title}.`,
          weeklyAssessments: `Reflection: connect evidence to the ${title} investigation.`,
          asyncActivities: `Review the worked example and source packet for ${title}.`,
          syncActivities: `Compare two genetics claims and revise one explanation about ${title}.`,
          supportingResources: `Instructor-provided genetics evidence packet for ${title}.`,
        },
      ],
    })),
  };
}

function titleHits(value, title) {
  return JSON.stringify(value).match(new RegExp(title, 'gi'))?.length || 0;
}

const ASSIGNMENT_DOCX_FIELDS = [
  'title',
  'assignmentType',
  'bloomsLevel',
  'dueWeek',
  'dueDate',
  'estimatedTime',
  'totalPoints',
  'percentOfGrade',
  'courseMapRef',
  'relatedLessons',
  'overview',
  'description',
  'speakingPrompts',
  'objectives',
  'instructions',
  'formatRequirements',
  'deliverables',
  'submissionFormat',
  'gradingCriteria',
  'progressTracking',
  'accessibilityAndUDL',
  'selfAssessmentRubric',
  'feedbackLoop',
  'scaffoldingMilestones',
  'supportResources',
  'academicIntegrityStatement',
];

const LESSON_PLAN_DOCX_FIELDS = [
  'lessonTitle',
  'title',
  'duration',
  'weekNumber',
  'bloomsLevels',
  'objectives',
  'warmUp',
  'materials',
  'assessmentBlock',
  'outline',
  'dialoguePractice',
  'workedExample',
  'observationProtocol',
  'evidenceBase',
  'prerequisiteCheck',
  'formativeCheck',
  'udlNotes',
  'homework',
  'closingActivity',
];

function publicationProjection(value, fields) {
  return Object.fromEntries(fields.filter((field) => value[field] !== undefined).map((field) => [field, value[field]]));
}

describe('v0.16.66 long-title publication texture', () => {
  it('keeps full lesson-title echoes below the exported mail-merge thresholds', () => {
    const blueprint = buildCourseBlueprint(geneticsCourseMap());
    const compiled = compileBlueprintDeliverables(blueprint, ['assignments', 'lessonPlans', 'slideDecks']);
    const briefs = compiled.assignments.assignments;
    const plans = compiled.lessonPlans.lessonPlans;

    expect(briefs).toHaveLength(GENETICS_TITLES.length);
    expect(plans).toHaveLength(GENETICS_TITLES.length);
    GENETICS_TITLES.forEach((title, index) => {
      // Match the exact fields the DOCX exporter renders. Internal proof and
      // source-grounding objects intentionally retain the canonical title and
      // are not student-facing publication text.
      const briefPublication = publicationProjection(briefs[index], ASSIGNMENT_DOCX_FIELDS);
      const planPublication = publicationProjection(plans[index], LESSON_PLAN_DOCX_FIELDS);
      expect(titleHits(briefPublication, title), `assignment ${index + 1}: ${title}`).toBeLessThanOrEqual(8);
      expect(titleHits(planPublication, title), `lesson plan ${index + 1}: ${title}`).toBeLessThanOrEqual(12);
    });

    const repeatedExampleCueCount = compiled.slideDecks.decks.filter((deck) =>
      JSON.stringify(deck.slides).includes('Pause on the example long enough for students to identify which detail'),
    ).length;
    expect(repeatedExampleCueCount).toBeLessThan(compiled.slideDecks.decks.length);
  });
});
