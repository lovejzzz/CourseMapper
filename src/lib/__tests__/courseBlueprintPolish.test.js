import { describe, expect, it } from 'vitest';
import { buildCourseBlueprint, compileBlueprintDeliverables } from '../courseBlueprintCompiler';

describe('compiled classroom copy polish', () => {
  it('deduplicates equivalent lab materials and capitalizes the syllabus delivery mode', () => {
    const courseMap = {
      courseName: 'Environmental Chemistry',
      lessons: [
        {
          title: 'Lesson 1: Atmospheric Chemistry',
          sections: [
            {
              topicSection: 'Atmospheric Chemistry',
              learningGoals: 'Use chemistry evidence',
              learningObjectives: 'Explain atmospheric processes; Model chemical reactions',
              weeklyAssessments:
                'Atmospheric Chemistry lab analysis — explain atmospheric processes; model chemical reactions',
              asyncActivities: 'Prepare an evidence table',
              syncActivities: 'Run the laboratory analysis',
              supportingResources:
                'Atmospheric Chemistry lab protocol and data sheet; Atmospheric Chemistry lab protocol data sheet',
              presentationFormat: 'Lab demonstration + guided analysis + evidence debrief',
              evaluateDesign: 'Score measurement accuracy and interpretation',
            },
          ],
        },
      ],
    };
    const blueprint = buildCourseBlueprint(courseMap, { sessionMinutes: 75 });
    const compiled = compileBlueprintDeliverables(blueprint, ['lessonPlans', 'syllabus']);
    const materials = compiled.lessonPlans.lessonPlans[0].materials;
    const labMaterials = materials.filter((material) => /lab protocol.*data sheet/i.test(material));
    const lessonPlanCopy = JSON.stringify(compiled.lessonPlans.lessonPlans[0].outline);

    expect(labMaterials).toHaveLength(1);
    expect(compiled.syllabus.syllabus.deliveryMode).toMatch(/^[A-Z]/);
    expect(lessonPlanCopy).toContain('Week 1 lab analysis');
    expect(lessonPlanCopy).not.toMatch(/Press for [^."]*—[^."]* evidence\b/i);
    expect(lessonPlanCopy).not.toMatch(/Close by having students name[^."]*—[^."]*\./i);
  });
});
