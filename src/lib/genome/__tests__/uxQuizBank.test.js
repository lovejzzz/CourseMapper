import fs from 'node:fs';

import { describe, expect, it } from 'vitest';

import { composeLessonFromConcepts } from '../composeLessonFromConcepts.js';
import { normalizeConceptKernel } from '../kernelSchema.js';
import { inferCourseDisciplines, selectShardsForDisciplines } from '../libraryShardLoader.js';
import { createKernelLibrary } from '../kernelLibrary.js';
import { runGenomeLinker } from '../runGenomeLinker.js';
import { isAppliedQuizStem } from '../../quality/quizItemDepth.js';
import { analyzeDecisionScenario } from '../../scenarioContract.js';
import {
  buildCourseBlueprint,
  buildSlideDeckIntermediateRepresentation,
  compileBlueprintDeliverables,
} from '../../courseBlueprintCompiler.js';

const UX_SHARD = JSON.parse(fs.readFileSync('public/genome/ux-intro.json', 'utf8'));
const GENOME_MANIFEST = JSON.parse(fs.readFileSync('public/genome/manifest.json', 'utf8'));
const ITEM_PLAN = Array.from({ length: 4 }, (_, index) => ({ index, type: 'multiple_choice', bloom: 'Apply' }));
const UX_COURSE_MAP = {
  courseName: 'User Experience Design Studio',
  lessons: [
    'Human-centered design foundations',
    'Research planning and ethics',
    'Contextual interviews and observation',
    'Affinity mapping and insight synthesis',
    'Personas',
    'Journey maps and service blueprints',
    'Information architecture',
    'Task flows and interaction patterns',
    'Low-fidelity wireframes',
    'Interactive prototyping',
    'Accessibility and usability evaluation',
    'Design handoff with portfolio storytelling',
  ].map((topic, index) => ({
    title: `Lesson ${index + 1}: ${topic}`,
    sections: [
      {
        topicSection: topic,
        learningObjectives: `Apply ${topic} to an evidence-based product decision.`,
        weeklyAssessments: 'Weekly autograded quizzes',
      },
    ],
  })),
};

function linkUxCourse() {
  const library = createKernelLibrary();
  library.addKernels(UX_SHARD.kernels, { source: 'shard' });
  return runGenomeLinker({
    courseMap: UX_COURSE_MAP,
    lessonIndices: UX_COURSE_MAP.lessons.map((_, index) => index),
    library,
    itemPlan: ITEM_PLAN,
  });
}

describe('source-backed UX assessment bank', () => {
  it('routes UX courses to the source-backed shard', () => {
    const disciplines = inferCourseDisciplines(UX_COURSE_MAP);
    expect(disciplines).toContain('ux');
    expect(selectShardsForDisciplines(GENOME_MANIFEST, disciplines)).toEqual([
      expect.objectContaining({ id: 'ux-intro', path: 'ux-intro.json', conceptCount: 6 }),
    ]);
  });

  it('links the six source-backed lessons in the 12-lesson UX benchmark', () => {
    const result = linkUxCourse();
    expect(result.telemetry.resolvedFromGenome).toBe(6);
    expect(result.telemetry.partialFromGenome).toBe(6);
    expect(Object.keys(result.lessonContent)).toEqual([
      'lesson-2',
      'lesson-5',
      'lesson-6',
      'lesson-8',
      'lesson-10',
      'lesson-11',
    ]);
    for (const payload of Object.values(result.lessonContent)) {
      expect(payload.quizItems.filter((item) => item.type === 'multiple_choice')).toHaveLength(4);
      expect(payload.conceptProvenance?.citations?.length).toBeGreaterThan(0);
    }
    expect(result.lessonContent['lesson-10'].conceptProvenance.conceptIds[0]).toBe('ux/interactive-prototyping');
    expect(result.lessonContent['lesson-11'].conceptProvenance.conceptIds[0]).toBe(
      'ux/accessibility-usability-evaluation',
    );
  });

  it('admits four anchored, applied, position-balanced items per kernel', () => {
    expect(UX_SHARD.kernels).toHaveLength(6);
    for (const raw of UX_SHARD.kernels) {
      const normalized = normalizeConceptKernel(raw);
      expect(normalized.issues, raw.id).toEqual([]);
      expect(
        normalized.kernel.mcBank.map((item) => item.answerIndex),
        raw.id,
      ).toEqual([0, 1, 2, 3]);
      expect(
        normalized.kernel.mcBank.every((item) => isAppliedQuizStem(item.stem)),
        raw.id,
      ).toBe(true);
      for (const item of normalized.kernel.mcBank) {
        expect(normalized.kernel.facts[item.explanationFactRef]?.anchor?.src, raw.id).toBeTruthy();
      }
    }
  });

  it('composes all source-backed seats without model content', () => {
    for (const raw of UX_SHARD.kernels) {
      const kernel = normalizeConceptKernel(raw).kernel;
      const composed = composeLessonFromConcepts([kernel], {}, { itemPlan: ITEM_PLAN });
      const multipleChoice = composed.payload.quizItems.filter((item) => item.type === 'multiple_choice');
      expect(multipleChoice, raw.id).toHaveLength(4);
      expect(composed.consumption.mcConsumed[raw.id], raw.id).toBe(4);
      expect(composed.conceptProvenance.citations.length, raw.id).toBeGreaterThan(0);
      expect(analyzeDecisionScenario(composed.payload.kernel.scenario).ready, raw.id).toBe(true);
      expect(composed.payload.kernel.scenario.source, raw.id).toBe('derived-kernel-fallback');
    }
  });

  it('keeps classroom slides free of registry labels, numbered-list residue, and projected source cues', () => {
    const courseMap = structuredClone(UX_COURSE_MAP);
    courseMap.lessons[11].sections[0].weeklyAssessments =
      '1. Final portfolio case study (40%) 2. Design journals (10%)';
    const linked = linkUxCourse();
    const blueprint = buildCourseBlueprint(courseMap, {
      enrichment: {
        source: 'ux-slide-contract-regression',
        lessonContent: linked.lessonContent,
        genomeTelemetry: linked.telemetry,
      },
    });
    blueprint.lessons[11].evidencePlan.sourceCue = 'verified-quiz-projection (open textbook, open license)';
    blueprint.lessons[7].evidencePlan.sourceCue = 'digitalgov:task-flow §What';
    const directDeckText = buildSlideDeckIntermediateRepresentation(blueprint)
      .decks[7].slides.flatMap((slide) => [slide.title, ...(slide.bullets || [])])
      .join('\n');
    const compiled = compileBlueprintDeliverables(blueprint, ['slideDecks'], {
      enforceCompilerContract: false,
    });
    const visibleText = compiled.slideDecks.decks
      .flatMap((deck) => deck.slides.flatMap((slide) => [slide.title, ...(slide.bullets || [])]))
      .join('\n');

    expect(visibleText).not.toMatch(/Weekly autograded|\bin Weekly[.!]?|changes Weekly[.!]?/i);
    expect(visibleText).not.toMatch(/verified[- ]quiz[- ]projection|open textbook|open license/i);
    expect(visibleText).not.toMatch(/Final portfolio case study \(40%\) 2\b/);
    expect(visibleText).toMatch(/Week 1 quiz/);
    expect(visibleText).toMatch(/Final portfolio case study \(40%\)/);
    expect(directDeckText).toMatch(/Digital\.gov: Task Flow/);
    expect(visibleText).not.toMatch(/Key insight:\s+strong answers/i);
    expect(visibleText).not.toMatch(/handoff with portfolio storytelling:\s+Apply/i);
  });

  it('humanizes machine enums and source locators at the quiz compilation boundary', () => {
    const courseMap = structuredClone(UX_COURSE_MAP);
    courseMap.lessons[7].sections[0].supportingResources = 'Digitalgov:task Flow §what (open textbook)';
    const linked = linkUxCourse();
    const lessonTwoContent = structuredClone(linked.lessonContent['lesson-2']);
    lessonTwoContent.quizItems[0].options[1] = 'Test_Hypothesis';
    const blueprint = buildCourseBlueprint(courseMap, {
      enrichment: {
        source: 'ux-quiz-humanization-regression',
        lessonContent: {
          ...linked.lessonContent,
          'lesson-2': lessonTwoContent,
        },
        genomeTelemetry: linked.telemetry,
      },
    });
    const compiled = compileBlueprintDeliverables(blueprint, ['quizBank'], {
      enforceCompilerContract: false,
    });
    const visibleText = compiled.quizBank.quizzes
      .flatMap((quiz) =>
        quiz.questions.flatMap((question) => [
          question.question,
          ...(question.options || []),
          question.explanation,
          question.distractorRationale,
        ]),
      )
      .join('\n');

    expect(visibleText).toMatch(/Test Hypothesis/);
    expect(visibleText).not.toMatch(/Test_Hypothesis/);
    expect(visibleText).toMatch(/Digital\.gov: Task Flow/);
    expect(visibleText).not.toMatch(/Digitalgov:task|§what|open textbook/i);
  });

  it('does not promote quiz-projected distractor metadata into a classroom pitfalls slide', () => {
    const courseMap = structuredClone(UX_COURSE_MAP);
    const blueprint = buildCourseBlueprint(courseMap, {
      enrichment: {
        source: 'ux-projected-pitfall-regression',
        lessonContent: {
          'lesson-12': {
            keyTerms: [
              {
                term: 'Design documentation',
                definition: 'Records design rationale and constraints.',
                misconception: 'Documentation is only a collection of wireframes.',
                correction: 'Documentation links the problem, process, constraints, and solution.',
              },
              {
                term: 'measurable impact',
                definition: 'A quiz-derived fallback term.',
                misconception: 'A common error is choosing the technical feasibility option.',
                correction: 'The admitted explanation supports measurable impact after the named details.',
                source: 'verified-quiz-projection',
              },
            ],
          },
        },
      },
    });
    const compiled = compileBlueprintDeliverables(blueprint, ['slideDecks'], {
      enforceCompilerContract: false,
    });
    const deckText = compiled.slideDecks.decks[11].slides
      .flatMap((slide) => [slide.title, ...(slide.bullets || [])])
      .join('\n');

    expect(deckText).not.toMatch(/technical feasibility option|after the named details/i);
    expect(deckText).not.toMatch(/Common pitfalls in/i);
  });

  it('does not duplicate the student subject when a misconception already names students', () => {
    const blueprint = buildCourseBlueprint(UX_COURSE_MAP, {
      enrichment: {
        source: 'ux-pitfall-subject-regression',
        lessonContent: {
          'lesson-8': {
            keyTerms: [
              {
                term: 'Task flow',
                definition: 'A path through actions and decisions.',
                misconception: 'Students often mistake a screen inventory for a task flow.',
                correction: 'A task flow connects a goal, user actions, system responses, and decision points.',
              },
              {
                term: 'User flow',
                definition: 'A route a user can take through a product.',
                misconception: 'Students assume a user flow is identical to a wireframe.',
                correction: 'A user flow describes actions and choices rather than screen layout.',
              },
            ],
          },
        },
      },
    });
    const compiled = compileBlueprintDeliverables(blueprint, ['slideDecks'], {
      enforceCompilerContract: false,
    });
    const pitfall = compiled.slideDecks.decks[7].slides.find((slide) => /Common pitfalls/i.test(slide.title));

    expect(pitfall).toBeTruthy();
    expect(pitfall.bullets.join('\n')).not.toMatch(/Students may assume students/i);
    expect(pitfall.bullets.join('\n')).toMatch(/Students may assume a screen inventory/i);
  });

  it('renders misconception pairs as complete labeled claims instead of fragile sentence splices', () => {
    const blueprint = buildCourseBlueprint(UX_COURSE_MAP, {
      enrichment: {
        source: 'ux-pitfall-grammar-regression',
        lessonContent: {
          'lesson-1': {
            keyTerms: [
              {
                term: 'Design principles',
                definition: 'Reusable rules that guide design decisions.',
                misconception: 'Confusing principles with specific UI elements.',
                correction: 'Design principles are abstract rules applied across the design process.',
              },
              {
                term: 'User needs',
                definition: 'Underlying problems experienced by a user.',
                misconception: 'Confusing needs with feature requests.',
                correction: 'User needs describe problems rather than requested features.',
              },
            ],
          },
        },
      },
    });
    const compiled = compileBlueprintDeliverables(blueprint, ['slideDecks'], {
      enforceCompilerContract: false,
    });
    const pitfall = compiled.slideDecks.decks[0].slides.find((slide) => /Common pitfalls/i.test(slide.title));
    const text = pitfall.bullets.join('\n');

    expect(text).toMatch(/Tempting claim: Confusing principles with specific UI elements\./);
    expect(text).toMatch(/Correction: Design principles are abstract rules/i);
    expect(text).not.toMatch(/think confusing|correction is name/i);
  });

  it('removes enriched example bullets that only repeat the assertion title', () => {
    const blueprint = buildCourseBlueprint(UX_COURSE_MAP, {
      enrichment: {
        source: 'ux-slide-title-echo-regression',
        lessonContent: {
          'lesson-12': {
            slideContent: [
              {
                title: 'Design documentation must articulate problem context clearly',
                bullets: ['Narrative structure follows a problem-solution-impact arc'],
              },
              {
                title: 'Final presentations require audience-specific tailoring',
                bullets: ['A strong narrative links design choices to user needs'],
              },
              {
                title: 'The final presentation must focus on measurable impact',
                bullets: [
                  'A specification document details interaction flows and component states',
                  'The final presentation must focus on measurable impact',
                ],
              },
            ],
          },
        },
      },
    });
    const compiled = compileBlueprintDeliverables(blueprint, ['slideDecks'], {
      enforceCompilerContract: false,
    });
    const example = compiled.slideDecks.decks[11].slides.find(
      (slide) => slide.title === 'The final presentation must focus on measurable impact',
    );

    expect(example.bullets).toEqual(['A specification document details interaction flows and component states.']);
  });
});
