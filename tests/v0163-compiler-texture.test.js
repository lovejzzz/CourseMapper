import { describe, expect, it } from 'vitest';

import { buildCourseBlueprint, compileBlueprintDeliverables } from '../src/lib/courseBlueprintCompiler.js';
import { buildBlueprintFromGraph } from '../src/lib/courseGraph/blueprintFromGraph.js';
import { deriveCourseGraphFromCourseMap } from '../src/lib/courseGraph/deriveFromCourseMap.js';
import { buildQuizItemPlan } from '../src/lib/blueprintEnrichmentPass.js';
import { projectKernelToSurfaces } from '../src/lib/kernelProjection.js';
import { findPromptArtifactContamination } from '../src/lib/quality/artifactDefectPatterns.js';
import { buildEvidenceTableVisualDescriptor, slideAgendaDecisionCue } from '../src/lib/compilerFactLedgerVisuals.js';
import { compactSlideInstructionLabel } from '../src/lib/courseCompilerCopyVariants.js';
import { slideDiscussionDecisionBullets } from '../src/lib/courseCompilerInstructionalCopy.js';
import {
  isClaimEvidenceBoundaryShortAnswer,
  isConceptCuedCompilerShortAnswer,
} from '../src/lib/quality/quizItemDepth.js';

function studioCourseMap() {
  return {
    courseName: 'Evidence-led Design Studio',
    semester: 'Fall 2026',
    lessons: Array.from({ length: 12 }, (_, index) => ({
      title: `Lesson ${index + 1}: Studio Decision ${index + 1}`,
      sections: [
        {
          topicSection: `Evidence pattern ${index + 1}`,
          learningGoals: `Use evidence pattern ${index + 1} to make a defensible design decision.`,
          learningObjectives: `Evaluate evidence pattern ${index + 1}.\nJustify design decision ${index + 1}.`,
          weeklyAssessments: `Decision memo ${index + 1} with an evidence-backed recommendation.`,
          asyncActivities: `Inspect case ${index + 1} and annotate the strongest evidence.`,
          syncActivities: `Critique two recommendations and revise decision ${index + 1}.`,
          supportingResources: `Instructor case packet ${index + 1}.`,
        },
      ],
    })),
  };
}

describe('v0.16.3 compiler texture', () => {
  it('authors three of four multiple-choice seats from inspectable case evidence', () => {
    const mcPlan = buildQuizItemPlan(6).filter((slot) => slot.type === 'multiple_choice');
    expect(mcPlan).toHaveLength(4);
    expect(mcPlan.filter((slot) => /concrete|case evidence/i.test(slot.note))).toHaveLength(3);
  });

  it('varies evidence-bounded short-answer frames without weakening the reasoning contract', () => {
    const items = Array.from({ length: 12 }, (_, index) => {
      const topic = `Evidence pattern ${index + 1}`;
      const payload = projectKernelToSurfaces(
        {
          facts: [`${topic} links an observed signal to a bounded design decision.`],
          keyTerms: [
            {
              term: topic,
              definition: `a method for testing design decision ${index + 1} against observable evidence`,
              example: `Team ${index + 1} compares two prototypes before choosing a revision`,
              misconception: `The first preference always determines decision ${index + 1}`,
            },
          ],
          scenario: {
            setup: `Team ${index + 1} observes a prototype failure, a conflicting user preference, and a two-day delivery constraint.`,
            materials: `observation log ${index + 1}, preference table ${index + 1}, and delivery plan ${index + 1}`,
          },
          discussionPrompt: {
            prompt: `Which revision should team ${index + 1} prioritize?`,
            tension: 'The fastest change conflicts with the strongest user signal.',
            positions: ['Revise the interaction first.', 'Preserve the interaction and add guidance.'],
          },
          mc: [],
        },
        { itemPlan: buildQuizItemPlan(6) },
      );
      return payload.quizItems.find((item) => item.type === 'short_answer');
    });

    expect(items.every(Boolean)).toBe(true);
    expect(new Set(items.map((item) => item.question)).size).toBeGreaterThanOrEqual(4);
    expect(new Set(items.map((item) => item.answer)).size).toBeGreaterThanOrEqual(4);
    expect(new Set(items.map((item) => item.scoringGuidance)).size).toBeGreaterThanOrEqual(4);
    expect(items.every((item) => isClaimEvidenceBoundaryShortAnswer(item.question))).toBe(true);
    expect(items.every((item) => !isConceptCuedCompilerShortAnswer(item.question))).toBe(true);
    expect(
      items.every((item) =>
        /(?:limitation|boundary|additional evidence|not a broader|cannot establish|do not prove|case-specific)/i.test(
          item.answer,
        ),
      ),
    ).toBe(true);
  });

  it('teaches toward the richer weekly artifact when weights are compiler-distributed', () => {
    const courseMap = studioCourseMap();
    courseMap.lessons = [
      {
        ...courseMap.lessons[0],
        sections: [
          {
            ...courseMap.lessons[0].sections[0],
            weeklyAssessments: '1. Quiz: define principles\n2. Task: create empathy map',
          },
        ],
      },
    ];
    const graph = deriveCourseGraphFromCourseMap(courseMap);
    const blueprint = buildBlueprintFromGraph(graph);

    expect(graph.assessments.map((assessment) => assessment.weightPct)).toEqual([50, 50]);
    expect(blueprint.lessons[0].studentArtifact).toBe('Task: create empathy map');
  });

  it('keeps generic quiz registry labels out of slide visual metadata', () => {
    const courseMap = studioCourseMap();
    courseMap.lessons[3] = {
      ...courseMap.lessons[3],
      title: 'Lesson 4: Affinity mapping and insight synthesis',
      sections: courseMap.lessons[3].sections.map((section) => ({
        ...section,
        topicSection: 'Affinity mapping and insight synthesis',
        weeklyAssessments: 'Weekly autograded quizzes',
      })),
    };
    const compiled = compileBlueprintDeliverables(buildCourseBlueprint(courseMap), ['slideDecks']);
    const visualMetadata = compiled.slideDecks.decks[3].slides.map(
      (slide) => `${slide.visual?.description || ''} ${slide.visual?.altText || ''}`,
    );
    expect(visualMetadata.map(findPromptArtifactContamination).filter(Boolean)).toEqual([]);
    expect(JSON.stringify(visualMetadata)).toMatch(/Week 4 quiz/i);
  });

  it('does not mistake a legitimate quiz revision note for a lesson-concept artifact', () => {
    const note =
      'Nonvisual summary: memory encoding evidence supports weekly reading quizzes. Frame the bridge as a quick check on what students can already use before revising the Week 4 quiz.';
    expect(findPromptArtifactContamination(note)).toBeNull();
    expect(
      findPromptArtifactContamination('Concept summary: Lesson 1 focuses on lesson plans and slide decks.'),
    ).toEqual(expect.objectContaining({ label: 'lesson plans' }));
  });

  it('routes quiz checks to the quiz bank instead of minting fake assignment briefs', () => {
    const courseMap = studioCourseMap();
    courseMap.lessons = [
      {
        ...courseMap.lessons[0],
        sections: [
          {
            ...courseMap.lessons[0].sections[0],
            weeklyAssessments: '1. Quiz: define principles\n2. Task: create empathy map',
          },
        ],
      },
    ];
    const blueprint = buildBlueprintFromGraph(deriveCourseGraphFromCourseMap(courseMap));
    const compiled = compileBlueprintDeliverables(blueprint, ['assignments', 'rubrics'], {
      skipLanguageFinalizer: true,
    });

    expect(compiled.assignments.courseAssignmentMap).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ artifact: 'Quiz: define principles', expectedFile: expect.stringMatching(/Quiz/) }),
      ]),
    );
    expect(compiled.assignments.assignments.map((assignment) => assignment.title)).toEqual([
      'Task: create empathy map',
    ]);
    const quizRubric = compiled.rubrics.rubrics.find((rubric) => rubric.title.startsWith('Quiz:'));
    const taskRubric = compiled.rubrics.rubrics.find((rubric) => rubric.title.startsWith('Task: create empathy map'));
    expect(quizRubric).toMatchObject({
      assessmentType: 'Quiz (scored by answer key)',
      answerKeyHandoffNote: expect.stringMatching(/Quiz & Exam Bank/),
    });
    expect(quizRubric.criteria).toBeUndefined();
    expect(taskRubric?.criteria?.length).toBeGreaterThan(0);
  });

  it('respects fully explicit source weights when choosing the central artifact', () => {
    const courseMap = studioCourseMap();
    courseMap.lessons = [
      {
        ...courseMap.lessons[0],
        sections: [
          {
            ...courseMap.lessons[0].sections[0],
            weeklyAssessments: '1. Quiz: define principles (70%)\n2. Task: create empathy map (30%)',
          },
        ],
      },
    ];
    const blueprint = buildBlueprintFromGraph(deriveCourseGraphFromCourseMap(courseMap));

    expect(blueprint.lessons[0].studentArtifact).toBe('Quiz: define principles (70%)');
  });

  it('does not stamp one debrief sentence across every slide deck', () => {
    const blueprint = buildCourseBlueprint(studioCourseMap());
    const compiled = compileBlueprintDeliverables(blueprint, ['slideDecks'], {
      configMap: { slideDecks: { slideCount: 12 } },
      skipLanguageFinalizer: true,
    });
    const debriefs = compiled.slideDecks.decks.map((deck) => {
      const activity = deck.slides.find((slide) => slide.type === 'activity');
      return activity?.bullets?.at(-1) || '';
    });

    expect(debriefs).toHaveLength(12);
    expect(debriefs.every(Boolean)).toBe(true);
    expect(new Set(debriefs).size).toBeGreaterThanOrEqual(4);
    expect(debriefs.filter((line) => /Debrief by naming the revision choice/i.test(line))).toHaveLength(0);
  });

  it('projects distinct admitted evidence into agenda, discussion, and fact-table instructions', () => {
    const blueprint = buildCourseBlueprint(studioCourseMap());
    const compiled = compileBlueprintDeliverables(blueprint, ['slideDecks'], {
      configMap: { slideDecks: { slideCount: 12 } },
      skipLanguageFinalizer: true,
    });
    const agendaDecisionCues = compiled.slideDecks.decks.map(
      (deck) => deck.slides.find((slide) => slide.type === 'agenda')?.bullets?.[1] || '',
    );
    const discussionDecisionCues = compiled.slideDecks.decks.map(
      (deck) => deck.slides.find((slide) => slide.type === 'discussion')?.bullets?.[1] || '',
    );
    const descriptor = buildEvidenceTableVisualDescriptor(
      [],
      [
        'Observed shoreline retreat accelerates after the protective wetland is removed.',
        'The same shoreline remains stable where the wetland dissipates wave energy.',
        'A single storm observation cannot establish the long-term erosion rate.',
      ],
    );

    expect(new Set(agendaDecisionCues).size).toBe(12);
    expect(new Set(discussionDecisionCues).size).toBe(12);
    expect(
      agendaDecisionCues.filter(
        (cue) =>
          cue.length > 113 ||
          !/decide|keep|separate|set|link|discard|identify|compare|preserve|explain/i.test(cue) ||
          /[:;,–—-]$/.test(cue),
      ),
    ).toEqual([]);
    expect(agendaDecisionCues.join(' ')).not.toMatch(/Model the evidence decision for/i);
    expect(discussionDecisionCues.join(' ')).not.toMatch(
      /Vote on the stronger choice|Name what makes the weaker choice|Defend the ranking/i,
    );
    const missingEvidenceBoundaryCues = discussionDecisionCues.filter(
      (cue) => !/evidence|source|criterion|uncertainty|assumption/i.test(cue),
    );
    expect(missingEvidenceBoundaryCues).toEqual([]);
    expect(descriptor.tableLead).toContain('shoreline retreat accelerates');
    expect(descriptor.tableLead).not.toMatch(/Use the fact ledger to compare/i);
  });

  it('composes every slide decision variant to fit without clipped or imperative phrase fragments', () => {
    const hostileInputs = {
      concept: 'Environmental Impact Assessment using course evidence',
      secondary: 'reproduce its key form from memory before choosing a response',
      sourceCue: 'Environmental Impact Assessment worked example response guide',
      artifact: 'Environmental Impact Assessment evidence check and reflection',
      successCriterion: 'Uses the relevant evidence precisely and explains one limitation before revising',
    };
    const agendas = Array.from({ length: 12 }, (_, index) =>
      slideAgendaDecisionCue({ lessonNumber: index + 1, ...hostileInputs }),
    );
    const discussions = Array.from({ length: 12 }, (_, index) =>
      slideDiscussionDecisionBullets({ lessonNumber: index + 1, ...hostileInputs }),
    ).flat();

    expect(new Set(agendas).size).toBe(12);
    expect(new Set(discussions).size).toBe(24);
    expect(agendas.every((line) => line.length <= 112)).toBe(true);
    expect(discussions.every((line) => line.length <= 118)).toBe(true);
    expect([...agendas, ...discussions].every((line) => /[.!?]$/.test(line))).toBe(true);
    expect([...agendas, ...discussions].join(' ')).not.toMatch(
      /reproduce its key form|detail that changes the|before choosing the next|…/,
    );
    expect([...agendas, ...discussions].every((line) => !/[:;,–—-]$/.test(line))).toBe(true);
    expect(
      compactSlideInstructionLabel(
        "Environmental Justice to the week's work and explain one supporting evidence source",
        'lesson concept',
      ),
    ).toBe('Environmental Justice');
    expect(
      compactSlideInstructionLabel(
        'Policy Monitoring exit reflection: connect evidence to Policy Monitoring task',
        'course artifact',
      ),
    ).toBe('Policy Monitoring exit reflection');
  });

  it('keeps compact assignment resources concrete without inventing a specific source packet', () => {
    const courseMap = studioCourseMap();
    courseMap.lessons[1] = {
      ...courseMap.lessons[1],
      title: 'Lesson 2: Greetings and Self-Introductions',
      sections: courseMap.lessons[1].sections.map((section) => ({
        ...section,
        topicSection: 'Greetings and Self-Introductions',
        weeklyAssessments: 'Character writing homework with an evidence-backed recommendation.',
      })),
    };
    const blueprint = buildCourseBlueprint(courseMap);
    const compiled = compileBlueprintDeliverables(blueprint, ['assignments']);

    expect(JSON.stringify(compiled.assignments.assignments)).not.toMatch(/\bspecific source packet\b/i);
  });

  it('varies flat lesson-plan closure and debrief guidance', () => {
    const blueprint = buildCourseBlueprint(studioCourseMap());
    const compiled = compileBlueprintDeliverables(blueprint, ['lessonPlans'], {
      configMap: { lessonPlans: { depth: 'flat' } },
      skipLanguageFinalizer: true,
    });
    const closures = compiled.lessonPlans.lessonPlans.map((plan) => plan.outline.at(-1));
    const collaborativeNotes = compiled.lessonPlans.lessonPlans.map((plan) => plan.outline[3].instructorNotes);
    const workshopDescriptions = compiled.lessonPlans.lessonPlans.map((plan) => plan.outline[4].description);

    expect(new Set(closures.map((closure) => closure.description)).size).toBeGreaterThanOrEqual(4);
    expect(new Set(closures.map((closure) => closure.instructorNotes)).size).toBeGreaterThanOrEqual(4);
    expect(new Set(collaborativeNotes).size).toBeGreaterThanOrEqual(4);
    expect(new Set(workshopDescriptions).size).toBeGreaterThanOrEqual(4);
    expect(
      closures.filter((closure) =>
        /peer review to name the strongest design move and next revision/i.test(closure.instructorNotes),
      ),
    ).toHaveLength(2);
  });
});
