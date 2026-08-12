import { describe, expect, it } from 'vitest';

import { extractBriefQualityContract, lessonRequiresFunctionalVisual } from '../briefQualityContract.js';
import { buildCourseBlueprint, compileBlueprintDeliverables } from '../courseBlueprintCompiler.js';
import { isAppliedQuizStem } from '../quality/quizItemDepth.js';

const VISUAL_BRIEF =
  'Create a two-lesson visual evidence course. Every lesson must require students to analyze a concrete visual and produce an evidence-based annotation or comparison. Use only verifiable open or public-domain visuals and preserve attribution and license boundaries.';

function visualCourseMap() {
  return {
    courseName: 'Visual Evidence Studio',
    lessons: ['Composition and Attention', 'Framing and Context'].map((title, index) => ({
      title: `Lesson ${index + 1}: ${title}`,
      sections: [
        {
          topicSection: title,
          learningObjectives: `Analyze ${title.toLowerCase()} evidence and justify an interpretation.`,
          weeklyAssessments: `${title} evidence memo`,
          asyncActivities: `Annotate one ${title.toLowerCase()} example.`,
          syncActivities: `Compare two interpretations of ${title.toLowerCase()}.`,
          supportingResources: `${title} source packet`,
        },
      ],
    })),
  };
}

describe('brief quality contract', () => {
  it('admits an explicit all-lessons functional-visual and rights boundary', () => {
    const contract = extractBriefQualityContract(VISUAL_BRIEF, { lessonCount: 2 });
    expect(contract).toMatchObject({
      protocol: 'coursemapper-brief-quality-contract-v1',
      scope: 'all-lessons',
      requiredLessonNumbers: [1, 2],
      functionalVisual: {
        required: true,
        processAction: 'analyze',
        productActions: ['annotate', 'compare'],
      },
      rightsBoundary: {
        mode: 'open-or-public-domain',
        attributionRequired: true,
        originalNativeAllowed: false,
      },
    });
    expect(lessonRequiresFunctionalVisual(contract, 1)).toBe(true);
    expect(lessonRequiresFunctionalVisual(contract, 3)).toBe(false);
  });

  it('distinguishes strict open-only requirements from briefs that explicitly allow original-native visuals', () => {
    const contract = extractBriefQualityContract(
      'Every lesson must require students to analyze a concrete visual and annotate or compare it. Use verifiable open or public-domain visuals or original CourseMapper-native diagrams, and disclose attribution and rights.',
      { lessonCount: 2 },
    );
    expect(contract.rightsBoundary).toMatchObject({
      mode: 'open-or-public-domain-or-original-native',
      externalAssetAllowedOnlyWithInspectableRights: true,
      originalNativeAllowed: true,
    });
  });

  it('does not convert incidental visuals or one-lesson suggestions into a course-wide contract', () => {
    expect(extractBriefQualityContract('Add visual examples where useful.', { lessonCount: 5 })).toBeNull();
    expect(
      extractBriefQualityContract('In lesson 2, analyze a chart and compare two trends.', { lessonCount: 5 }),
    ).toBeNull();
  });

  it('does not combine unrelated clauses from an attached syllabus into a course-wide visual contract', () => {
    const statisticsBrief = `
Using the attached official syllabus as the governing source, create exactly eight lessons from the first eight continuous instructional topic units in source order. Each lesson must require an inspectable statistical procedure and a bounded interpretation.
=== File: statistics-syllabus.pdf ===
Students learn to analyze distributions. Chapter 1 uses graphs and charts. Later chapters compare sampling designs.`;

    expect(extractBriefQualityContract(statisticsBrief, { lessonCount: 8 })).toBeNull();
  });

  it('projects the contract into every deck as a visible native task and into assignment instructions', () => {
    const blueprint = buildCourseBlueprint(visualCourseMap(), { sourceBrief: VISUAL_BRIEF });
    const compiled = compileBlueprintDeliverables(blueprint, [
      'slideDecks',
      'assignments',
      'quizBank',
      'studyGuides',
      'lessonPlans',
    ]);

    expect(blueprint.briefQualityContract.requiredLessonNumbers).toEqual([1, 2]);
    for (const [index, deck] of compiled.slideDecks.decks.entries()) {
      const task = deck.slides.find((slide) => slide.enrichmentSource === 'brief-functional-visual-contract-v1');
      expect(task).toMatchObject({
        activityType: 'Visual annotation and comparison',
        visual: {
          kind: 'evidence specimen',
          functionalVisualContract: {
            protocol: 'coursemapper-functional-visual-task-v1',
            lessonNumber: index + 1,
            required: true,
          },
        },
      });
      expect(task.title).toContain('Visual evidence lab');
      expect(task.bullets.join(' ')).toMatch(/analy|annotat|compar/i);
      expect(task.bullets.join(' ')).toMatch(/(?:visual provenance for|original native|CC0 1\.0 Universal)/i);
      expect(task.visual).toMatchObject({
        specimenSeed: expect.any(String),
        observationPrompt: expect.stringMatching(/analy[sz]e|locate|observe|inspect/i),
        typedSpecimen: {
          protocol: 'coursemapper-typed-evidence-specimen-v1',
          lessonNumber: index + 1,
          conceptBinding: expect.any(String),
          specimenKind: expect.any(String),
          specimenIR: {
            protocol: 'coursemapper-disciplinary-specimen-ir-v1',
            discipline: 'visual-analysis',
            objectType: expect.any(String),
            observableOperation: expect.any(String),
            domainObjectIds: expect.any(Array),
            counterexampleQuestion: expect.any(String),
            lessonObjective: expect.any(String),
            learnerArtifact: expect.any(String),
            scoredCriterion: expect.any(String),
          },
          entities: expect.arrayContaining([
            expect.objectContaining({ id: expect.any(String), role: expect.any(String), geometry: expect.any(Object) }),
          ]),
          relations: expect.arrayContaining([
            expect.objectContaining({ id: expect.any(String), from: expect.any(String), to: expect.any(String) }),
          ]),
          expectedObservation: {
            id: `expected-l${index + 1}`,
            claim: expect.any(String),
            evidenceIds: expect.any(Array),
          },
          answerRubricBinding: {
            expectedObservationId: `expected-l${index + 1}`,
            scoringUse: expect.any(String),
          },
          sourceBinding: {
            id: `CM-SRC-L0${index + 1}`,
            label: expect.stringMatching(/Public-domain course-created/i),
            resolution: 'native-evidence-specimen',
            verificationRule: expect.stringMatching(/typed entities/i),
          },
          rightsBinding: {
            mode: 'open-or-public-domain',
            assetRightsClass: 'public-domain',
            disclosure: expect.stringMatching(/CC0 1\.0 Universal/i),
            attribution: expect.stringMatching(/CourseMapper-generated native vector/i),
          },
        },
      });
      expect(task.visual.typedSpecimen.taskContract.upstreamRequirement.objectives).toEqual(
        blueprint.lessons[index].outcomes,
      );
    }

    for (const assignment of compiled.assignments.assignments) {
      expect(assignment.instructions.join(' ')).toContain('concrete visual evidence panel');
      expect(assignment.instructions.join(' ')).not.toMatch(/\b(?:one|two)\s+the\b/i);
      expect(assignment.functionalVisualContract).toMatchObject({
        protocol: 'coursemapper-functional-visual-task-v1',
        required: true,
      });
    }

    for (const [index, quiz] of compiled.quizBank.quizzes.entries()) {
      expect(quiz.questions).toHaveLength(8);
      expect(
        quiz.questions.every(
          (question) =>
            question.enrichmentSource === 'brief-functional-visual-contract-v1' &&
            question.functionalVisualEvidenceBinding?.resolution === 'native-evidence-specimen' &&
            question.question.includes(`Lesson ${index + 1} evidence specimen`),
        ),
      ).toBe(true);
      expect(JSON.stringify(quiz.questions)).not.toMatch(/source-bound recovery/i);
      expect(
        quiz.questions.filter((question) => question.question.includes('Its declared relations are')),
      ).toHaveLength(1);
      expect(
        quiz.questions.every((question) =>
          /case|inspect|evidence|peer|revise|evaluate|using|locate|trace|judge|cite|identify/i.test(question.question),
        ),
      ).toBe(true);
      const multipleChoice = quiz.questions.filter((question) => question.type === 'multiple_choice');
      expect(
        multipleChoice.filter((question) => isAppliedQuizStem(question.question)).length / multipleChoice.length,
      ).toBeGreaterThanOrEqual(0.35);
    }

    for (const guide of compiled.studyGuides.studyGuides) {
      expect(guide.workedExample).toMatchObject({
        protocol: 'coursemapper-functional-visual-study-practice-v1',
        verification: { checked: true },
        steps: expect.arrayContaining([expect.stringMatching(/typed|trace|inspect|inventory|follow|test/i)]),
        result: expect.any(String),
        boundary: expect.any(String),
        transferTask: expect.any(String),
      });
    }

    for (const [index, plan] of compiled.lessonPlans.lessonPlans.entries()) {
      const governingObjective = visualCourseMap().lessons[index].sections[0].learningObjectives;
      expect(plan.objectives.filter((objective) => objective === governingObjective)).toHaveLength(1);
      expect(plan.objectives).toEqual(expect.arrayContaining(blueprint.lessons[index].outcomes));
    }
  });

  it('uses recognizable matched scenes for perspective and context-boundary analysis', () => {
    const courseMap = {
      courseName: 'Visual Analysis',
      lessons: [
        {
          title: 'Lesson 1: Perspective and Framing',
          sections: [
            {
              topicSection: 'Perspective and framing',
              learningObjectives: 'Analyze viewpoint, convergence, and crop evidence.',
              weeklyAssessments: 'Perspective comparison',
            },
          ],
        },
        {
          title: 'Lesson 2: Ethical Context and Attribution',
          sections: [
            {
              topicSection: 'Ethical context and attribution',
              learningObjectives: 'Analyze how caption and provenance change an interpretation.',
              weeklyAssessments: 'Context-boundary comparison',
            },
          ],
        },
      ],
    };
    const blueprint = buildCourseBlueprint(courseMap, { sourceBrief: VISUAL_BRIEF });
    const specimens = compileBlueprintDeliverables(blueprint, ['slideDecks']).slideDecks.decks.map(
      (deck) => deck.slides.find((slide) => slide.visual?.typedSpecimen)?.visual?.typedSpecimen,
    );

    expect(specimens[0].specimenIR).toMatchObject({
      objectType: 'matched architectural-viewpoint study',
      domainObjectIds: expect.arrayContaining(['horizon-wide', 'vanishing-point', 'foreground-wide']),
    });
    expect(specimens[0].entities.map((entity) => entity.label)).toEqual(
      expect.arrayContaining(['HORIZON', 'ROAD', 'PERSON']),
    );
    expect(specimens[1].specimenIR).toMatchObject({
      objectType: 'matched editorial-event scene',
      domainObjectIds: expect.arrayContaining(['speaker-a', 'lectern-a', 'audience-a']),
    });
    expect(specimens[1].entities.map((entity) => entity.label)).toEqual(
      expect.arrayContaining(['SPEAKER', 'LECTERN', 'AUDIENCE', 'SOURCE · DATE · PURPOSE']),
    );
    expect(specimens[1].entities.map((entity) => entity.label)).not.toContain('◆');
  });
});
