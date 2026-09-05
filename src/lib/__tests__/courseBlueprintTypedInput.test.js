import { describe, expect, it } from 'vitest';
import { buildBlueprintFromGraph } from '../courseGraph/blueprintFromGraph';
import { deriveCourseGraphFromCourseMap } from '../courseGraph/deriveFromCourseMap';
import { compactBlueprintForStorage, compileBlueprintDeliverables } from '../courseBlueprintCompiler';

function makeWorldLiteratureMap() {
  return {
    courseName: 'World Literature',
    semester: 'Fall 2026',
    lessons: Array.from({ length: 12 }, (_, index) => {
      const lessonNumber = index + 1;
      const target = lessonNumber === 12;
      return {
        title: target ? 'Lesson 12: Fantastic Library' : `Lesson ${lessonNumber}: Literature Topic ${lessonNumber}`,
        sections: [
          {
            topicSection: target ? '12.1: Fantastic Elements' : `${lessonNumber}.1: Literary reading`,
            learningObjectives: target
              ? 'Apply the main concepts from Fantastic Elements to a course task or example.'
              : 'Interpret one textual detail in relation to a whole work.',
            weeklyAssessments: target
              ? 'Fantastic Elements transfer task: explain one example, one source detail, and one limitation.'
              : `Literature response ${lessonNumber}`,
            asyncActivities: 'Prepare a source note from the assigned reading.',
            syncActivities: 'Practice close reading in pairs and revise one interpretation.',
            supportingResources: target ? 'The Library of Babel' : `Literature packet ${lessonNumber}`,
          },
        ],
      };
    }),
  };
}

describe('typed compiler inputs', () => {
  it('keeps assessment identity singular and renders structured citation labels as text', () => {
    const graph = deriveCourseGraphFromCourseMap(makeWorldLiteratureMap());
    const title = 'Fantastic Elements transfer task: explain one example, one source detail, and one limitation.';
    const compactTitle = 'Fantastic Elements evidence application';
    const targetAssessment = graph.assessments.find((assessment) => assessment.dueSession === 12);
    targetAssessment.title = `${title}: ${title}`;
    graph.enrichmentOverlay = {
      lessonContent: {
        'lesson-12': {
          keyTerms: [
            {
              term: 'Close reading',
              definition: 'Close reading connects specific textual details to an interpretation of the whole work.',
              misconception: 'Listing details without an interpretive claim counts as close reading.',
              correction: 'Each detail must support an interpretive claim about the whole.',
            },
          ],
          conceptProvenance: {
            citations: [
              {
                displayTitle: 'Close Reading in Literary Study §1',
                sourceUrl: 'https://example.edu/close-reading',
                license: 'CC-BY-4.0',
              },
            ],
          },
        },
      },
    };

    const blueprint = compactBlueprintForStorage(buildBlueprintFromGraph(graph));
    expect(blueprint.lessons[11].studentArtifact).toBe(compactTitle);
    expect(blueprint.assessmentRegistry.find((assessment) => assessment.dueSession === 12)?.title).toBe(compactTitle);

    const compiled = compileBlueprintDeliverables(blueprint, ['lessonPlans'], {
      configMap: { lessonPlans: { depth: 'deep' } },
    });
    const lessonPlan = compiled.lessonPlans.lessonPlans[11];
    expect(lessonPlan.assessmentBlock.find((assessment) => assessment.id === targetAssessment.id)?.title).toBe(
      compactTitle,
    );
    const text = JSON.stringify({
      assessmentBlock: lessonPlan.assessmentBlock,
      warmUp: lessonPlan.warmUp,
      outline: lessonPlan.outline,
      formativeCheck: lessonPlan.formativeCheck,
      udlNotes: lessonPlan.udlNotes,
      homework: lessonPlan.homework,
      closingActivity: lessonPlan.closingActivity,
    });

    expect(text).not.toContain('[object Object]');
    expect(text).toContain('Close Reading in Literary Study §1');
    expect(text).not.toContain(`${title}: ${title}`);
  });

  it('preserves a governing category total through storage and semantic anchor rebuilds', () => {
    const graph = deriveCourseGraphFromCourseMap({
      courseName: 'Introductory Statistics',
      gradingPolicy: {
        version: 1,
        sourceStatus: 'source-explicit',
        categories: [{ id: 'g1', title: 'HW', weightPct: 15, extraCredit: false, sourceStatus: 'source-formula' }],
      },
      lessons: [
        {
          title: 'Lesson 1: Regression Analysis',
          sections: [
            {
              topicSection: 'Simple linear regression',
              learningObjectives: 'Fit and interpret a simple linear regression for supplied paired observations.',
              weeklyAssessments: 'weekly homework: Regression Analysis',
            },
          ],
        },
      ],
    });
    const blueprint = compactBlueprintForStorage(buildBlueprintFromGraph(graph));
    const compiled = compileBlueprintDeliverables(blueprint, ['assignments']);
    const assignment = compiled.assignments.assignments[0];

    expect(blueprint.assessments[0].officialGradingCategory).toMatchObject({ title: 'HW', weightPct: 15 });
    expect(assignment.percentOfGrade).toBe('Part of HW — 15% total course category');
    expect(assignment.courseMapRef).toContain('HW · 15% category total');
    expect(assignment.assessmentArchitecture.weightProvenance.sourceStatus).toBe('source-explicit-category-total');
  });

  it('lets an explicit simple-linear objective quarantine neighboring regression families', () => {
    const graph = deriveCourseGraphFromCourseMap({
      courseName: 'Introductory Statistics',
      lessons: [
        {
          title: 'Lesson 1: Regression Analysis',
          sections: [
            {
              topicSection: 'Simple linear regression',
              learningObjectives:
                'Fit and interpret a simple linear regression for supplied paired observations by showing slope and intercept calculations, checking fitted values or residuals, and limiting causal or extrapolated claims.',
              weeklyAssessments: 'Regression analysis memo',
            },
          ],
        },
      ],
    });
    graph.enrichmentOverlay = {
      lessonContent: {
        'lesson-1': {
          keyTerms: [
            { term: 'Poisson regression', definition: 'Poisson regression models count outcomes.' },
            { term: 'Segmented regression', definition: 'Segmented regression estimates breakpoints.' },
            { term: 'Least-squares slope', definition: 'The fitted slope uses Sxy divided by Sxx.' },
          ],
          kernel: {
            facts: [
              'Poisson regression models count outcomes.',
              'Segmented regression estimates breakpoints.',
              'The least-squares slope uses Sxy divided by Sxx.',
            ],
          },
        },
      },
    };
    const blueprint = compactBlueprintForStorage(buildBlueprintFromGraph(graph));
    const compiled = compileBlueprintDeliverables(blueprint, ['lessonPlans', 'quizBank']);
    const learnerFacing = JSON.stringify(compiled);

    expect(learnerFacing).toMatch(/least[- ]squares|slope|residual/i);
    expect(learnerFacing).not.toMatch(/Poisson regression|Segmented regression/i);
  });
});
