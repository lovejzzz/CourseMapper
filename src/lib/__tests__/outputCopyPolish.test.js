import { describe, expect, it } from 'vitest';
import {
  buildCourseBlueprint,
  compileBlueprintDeliverables,
  contextualizeModalityRoutine,
} from '../courseBlueprintCompiler';
import { repairCourseMapReadiness } from '../deliverableReadiness';
import { objectiveConstructApplicationInstruction } from '../objectiveConstructInstruction';

describe('learner-facing output copy polish', () => {
  it('applies a readable objective without copying its declaration a second time', () => {
    const objective = 'Distinguish observable features from inference in Composition; cite the deciding visual detail.';
    const instruction = objectiveConstructApplicationInstruction([objective], {
      artifact: 'Week 1 evidence explanation',
      lessonTitle: 'Lesson 1: Composition',
      existingTaskText: '',
      lesson: { lessonNumber: 1, title: 'Lesson 1: Composition' },
    });

    expect(instruction).toContain('cite the deciding visual detail');
    expect(instruction).toContain('distinguish observable features from inference in Composition');
    expect(instruction).not.toContain(objective.replace(/\.$/, ''));
    expect(instruction).not.toContain('observable features inference Composition');
  });

  it('turns separately parsed imperative objectives into readable action cues', () => {
    const instruction = objectiveConstructApplicationInstruction(
      ['Distinguish observable features from inference in Composition.', 'Cite the deciding visual detail.'],
      {
        artifact: 'Week 1 comparison',
        lessonTitle: 'Lesson 1: Composition',
        existingTaskText: '',
        lesson: { lessonNumber: 1, title: 'Lesson 1: Composition' },
      },
    );

    expect(instruction).toContain('a clear distinction between observable features and inference in Composition');
    expect(instruction).toContain('source support for the deciding visual detail');
    expect(instruction).not.toContain('distinguish, observable, features');
  });

  it('does not promote an objective sentence into a secondary slide concept', () => {
    const blueprint = buildCourseBlueprint({
      courseName: 'Visual Evidence Studio',
      lessons: [
        {
          title: 'Lesson 1: Composition',
          sections: [
            {
              topicSection: 'Composition',
              learningObjectives:
                'Distinguish observable features from inference in Composition; name what the visible evidence cannot establish.',
              weeklyAssessments: 'Composition evidence comparison.',
            },
          ],
        },
      ],
    });
    const deck = compileBlueprintDeliverables(blueprint, ['slideDecks']).slideDecks.decks[0];
    const learnerFacingSlideText = JSON.stringify(
      deck.slides.map((slide) => ({ title: slide.title, bullets: slide.bullets, visual: slide.visual })),
    );

    expect(learnerFacingSlideText).not.toMatch(/Use name what the visible evidence cannot establish/i);
    expect(learnerFacingSlideText).not.toMatch(/name what the visible evidence cannot establish evidence/i);
  });

  it('does not route a linguistics course through target-language audio fallbacks', () => {
    const courseMap = {
      courseName: 'Introduction to Language Structure',
      lessons: [
        {
          title: 'Lesson 1: Phonology and Tone',
          sections: [
            {
              topicSection: 'Tone and phoneme analysis',
              learningObjectives: '',
              weeklyAssessments: '',
              syncActivities: '',
              supportingResources: '',
            },
          ],
        },
      ],
    };
    const repaired = repairCourseMapReadiness({ courseMap }).courseMap;
    expect(JSON.stringify(repaired)).not.toMatch(/instructor-approved .*audio|voice-recording|pronunciation audio/i);
    expect(repaired.lessons[0].sections[0].supportingResources).toMatch(/tone and phoneme analysis/i);
  });

  it('rotates objective-alignment moves across a long course instead of stamping one sentence', () => {
    const instructions = Array.from({ length: 14 }, (_, index) =>
      objectiveConstructApplicationInstruction(
        [`Analyze language pattern ${index + 1} from observable evidence and bound the conclusion.`],
        {
          artifact: `analysis memo ${index + 1}`,
          lessonTitle: `Lesson ${index + 1}: Language Pattern ${index + 1}`,
          existingTaskText: '',
          lesson: { lessonNumber: index + 1, title: `Lesson ${index + 1}: Language Pattern ${index + 1}` },
        },
      ),
    );

    expect(new Set(instructions).size).toBe(14);
    expect(instructions.filter((instruction) => /show both the supporting evidence/i.test(instruction))).toHaveLength(
      1,
    );
  });

  it('uses human activity labels, grammatical concept phrases, and proportionate prep time', () => {
    const blueprint = buildCourseBlueprint({
      courseName: 'Introduction to Language Structure',
      lessons: [
        {
          title: 'Lesson 1: Linguistic Evidence Basis',
          sections: [
            {
              topicSection: 'Linguistic Evidence',
              learningObjectives: 'Evaluate one linguistic claim using observable evidence and a bounded conclusion.',
              weeklyAssessments: 'Defining Linguistic Evidence evidence check.',
              syncActivities: 'Annotate a minimal-pair transcription and compare two language-data analyses.',
              supportingResources: 'Instructor evidence packet.',
            },
          ],
        },
      ],
    });
    const lessonPlan = compileBlueprintDeliverables(blueprint, ['lessonPlans']).lessonPlans.lessonPlans[0];
    const visibleText = JSON.stringify(lessonPlan);

    expect(blueprint.courseModalityProfile.primaryMode).toBe('linguistic-analysis');
    expect(lessonPlan.classSessionPlan.segments.map((segment) => segment.phase)).toContain(
      'competing analysis and counterexample test',
    );
    expect(visibleText).not.toMatch(/Collect two fast|accurate the .* use|"type":"Lecture exam"/i);
    if (/preparation, not a separate submission/i.test(lessonPlan.homework.description)) {
      expect(Number.parseInt(lessonPlan.homework.estimatedTime, 10)).toBeLessThanOrEqual(30);
    }
  });

  it('varies linguistic evidence and feedback routines without relaxing their instructional checks', () => {
    const evidenceBase =
      'collect the exact form, gloss or transcription, source locator, structural pattern, counterexample, and analysis boundary before accepting the generalization';
    const feedbackBase =
      'check data fidelity, notation, pattern evidence, alternative analysis, counterexample handling, and one required revision to the linguistic claim';
    const lessons = Array.from({ length: 14 }, (_, index) => ({
      lessonNumber: index + 1,
      title: `Lesson ${index + 1}: Language Pattern ${index + 1}`,
      keyConcepts: [`language pattern ${index + 1}`, `contrast ${index + 1}`],
    }));
    const evidenceRoutines = lessons.map((lesson) =>
      contextualizeModalityRoutine('evidenceRoutine', evidenceBase, {
        lesson,
        concept: lesson.keyConcepts[0],
        artifact: `analysis memo ${lesson.lessonNumber}`,
        mode: 'linguistic-analysis',
      }),
    );
    const feedbackRoutines = lessons.map((lesson) =>
      contextualizeModalityRoutine('feedbackRoutine', feedbackBase, {
        lesson,
        concept: lesson.keyConcepts[0],
        artifact: `analysis memo ${lesson.lessonNumber}`,
        mode: 'linguistic-analysis',
      }),
    );

    expect(new Set(evidenceRoutines).size).toBe(14);
    expect(new Set(feedbackRoutines).size).toBe(14);
    expect(evidenceRoutines.join(' ')).not.toContain('collect the exact form, gloss or transcription');
    expect(feedbackRoutines.join(' ')).not.toContain('check data fidelity, notation, pattern evidence');
    for (const routine of evidenceRoutines) {
      expect(routine).toMatch(/form|transcription|language record|language data/i);
      expect(routine).toMatch(/source|boundary|counterexample|qualif|limit|disconfirm/i);
    }
    for (const routine of feedbackRoutines) {
      expect(routine).toMatch(/revis|correct|narrow|strengthen|target/i);
    }
  });

  it('turns a generic capstone shell into disciplinary language-data work', () => {
    const blueprint = buildCourseBlueprint({
      courseName: 'Introduction to Language Structure',
      lessons: [
        {
          title: 'Lesson 1: Phonetics Fundamentals',
          sections: [{ topicSection: 'Speech sounds', learningObjectives: 'Analyze a transcription.' }],
        },
        {
          title: 'Lesson 2: Morphological Structure',
          sections: [{ topicSection: 'Morpheme analysis', learningObjectives: 'Analyze a form-gloss record.' }],
        },
        {
          title: 'Lesson 3: Syntactic Frameworks',
          sections: [{ topicSection: 'Constituent structure', learningObjectives: 'Compare two syntax analyses.' }],
        },
        {
          title: 'Lesson 4: Project Development',
          sections: [
            {
              topicSection: 'Project Scoping',
              learningObjectives: 'Build a source-bounded language-data proposal.',
              weeklyAssessments: 'Project Scoping mini-brief with one stakeholder and one recommended action.',
            },
          ],
        },
      ],
    });
    blueprint.enrichment = {
      lessonContent: {
        'lesson-4': {
          keyTerms: [
            {
              term: 'Project management',
              definition: 'Project management supervises a team to meet constraints.',
            },
          ],
          kernel: { facts: ['A project charter names stakeholders and scope constraints.'] },
        },
      },
    };
    const compiled = compileBlueprintDeliverables(blueprint, ['lessonPlans', 'assignments', 'quizBank']);
    const visible = JSON.stringify(compiled);

    expect(blueprint.courseModalityProfile.primaryMode).toBe('linguistic-analysis');
    expect(visible).toMatch(/linguistic research question|language data selection|linguistic data-analysis proposal/i);
    expect(visible).not.toMatch(/project management supervises|project charter names stakeholders/i);
  });
});
