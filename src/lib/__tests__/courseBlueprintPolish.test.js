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

  it('uses an empirical workflow for a biology lab and hides internal provenance from classroom surfaces', () => {
    const blueprint = buildCourseBlueprint({
      courseName: 'Introduction to Genetics',
      lessons: [
        {
          title: 'Lesson 1: Model Organism Investigation',
          sections: [
            {
              topicSection: 'Model organisms and inheritance evidence',
              learningGoals: 'Use observations from a model organism to explain an inheritance pattern.',
              learningObjectives: 'Record phenotypes and interpret the resulting inheritance evidence.',
              weeklyAssessments: 'Model organism lab report with observations, controls, and a bounded conclusion.',
              syncActivities: 'Conduct the model-organism investigation and compare phenotypes.',
              supportingResources: 'Source excerpt, example, or activity prompt aligned to model organisms.',
              evaluateDesign: 'Score procedural accuracy, recorded observations, and interpretation.',
            },
          ],
        },
      ],
    });
    blueprint.lessons[0].readings = [
      'Existing course map fields.',
      'Source excerpt, example, or activity prompt aligned to model organisms.',
    ];
    blueprint.lessons[0].enrichment = {
      keyTerms: [
        {
          term: 'Allele segregation',
          definition: 'Allele pairs separate during gamete formation.',
          example: 'Offspring phenotypes can reveal the segregation pattern.',
          source: 'fact-ledger-projection',
        },
      ],
      kernel: { facts: ['Allele pairs separate during gamete formation.'] },
    };

    const compiled = compileBlueprintDeliverables(blueprint, ['lessonPlans', 'syllabus', 'studyGuides', 'quizBank']);
    const classroomCopy = JSON.stringify({
      materials: compiled.lessonPlans.lessonPlans[0].materials,
      outline: compiled.lessonPlans.lessonPlans[0].outline,
      weeklySchedule: compiled.syllabus.syllabus.weeklySchedule,
      keyTerms: compiled.studyGuides.studyGuides[0].keyTerms,
      quizBank: compiled.quizBank.quizzes.map((quiz) =>
        quiz.questions.map((question) => ({
          question: question.question,
          options: question.options,
          answer: question.answer,
          sampleAnswer: question.sampleAnswer,
        })),
      ),
    });

    expect(blueprint.enrichment.lens).toMatchObject({
      domain: 'biological science inquiry',
      decisionNoun: 'biological explanation',
    });
    expect(classroomCopy).not.toMatch(
      /fact-ledger-projection|Existing course map fields|Source excerpt,? example|professional decision-making/i,
    );
    expect(classroomCopy).not.toMatch(/error message|\bbug\b|run early|running their work/i);
    expect(classroomCopy).toMatch(/observations|measurements|procedure|controls/i);
  });

  it('uses field, laboratory, and public-health evidence for environmental microbiology', () => {
    const blueprint = buildCourseBlueprint({
      courseName: 'Environmental Microbiology',
      lessons: [
        {
          title: 'Lesson 1: Waterborne Pathogens',
          sections: [
            {
              topicSection: 'Waterborne pathogens; field sampling; public-health interpretation',
              learningGoals: 'Connect microbial evidence to an environmental decision.',
              learningObjectives:
                'Evaluate a field and laboratory record before making a public-health recommendation.',
              weeklyAssessments: 'Waterborne pathogen evidence check',
              asyncActivities: 'Annotate field observations and laboratory results.',
              syncActivities: 'Compare two exposure interpretations and defend the bounded conclusion.',
              supportingResources: 'Open microbiology reading, field sample record, and laboratory report',
              evaluateDesign: 'Score evidence use, interpretation, limitation, and decision quality.',
            },
          ],
        },
      ],
    });
    const compiled = compileBlueprintDeliverables(blueprint, ['quizBank']);
    const quizText = JSON.stringify(compiled.quizBank);

    expect(blueprint.enrichment.lens).toMatchObject({
      domain: 'environmental microbiology inquiry',
      evidenceNoun: 'field, laboratory, and public-health evidence',
      decisionNoun: 'environmental or public-health decision',
      learnerRole: 'environmental microbiologist',
    });
    expect(quizText).toContain('field, laboratory, and public-health evidence');
    expect(quizText).not.toContain('experimental and genetic evidence');
  });
});
