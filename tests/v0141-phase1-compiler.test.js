/**
 * V0.14.1 Phase 1 batch A — compiler output integrity fixes.
 *
 * Pins the six compiler-side fixes from
 * docs/V0.14.1_OUTPUT_INTEGRITY_ROADMAP.md:
 *  - 1.2 fused assessment titles keep the second label's casing
 *  - 1.3 truncated slide bullets end on a clause boundary or an ellipsis,
 *        with the "Practice:"-style label counted inside the budget
 *  - 1.4 syllabus SLOs round-robin across lessons instead of exhausting
 *        the cap on Lessons 1-2
 *  - 1.6 quiz items align to the objective their source signal talks about
 *  - 1.7 quiz frames 2/4 are student-facing content questions and the
 *        distractor pool rotates across lessons
 *  - 1.9 objective sentences are never comma-split into fragment key terms
 *  - 1.10 no internal vocabulary (preference bucket tokens, modality ids,
 *        "Evidence Thread" project names) in compiled text
 *
 * All compile calls use skipLanguageFinalizer so the assertions pin the
 * compiler layer itself, independent of the finalizer's cleanup passes.
 */
import { describe, expect, it } from 'vitest';

import {
  buildCourseBlueprint,
  buildQuizAtomsForLesson,
  buildSlideDeckIntermediateRepresentation,
  compileBlueprintDeliverable,
  compileBlueprintDeliverables,
} from '../src/lib/courseBlueprintCompiler.js';
import { buildInstructorPreferenceProfile } from '../src/lib/instructorPreferenceProfile.js';

const COMPILE_OPTIONS = { skipLanguageFinalizer: true };

function mandarinCourseMap() {
  return {
    courseName: 'Beginning Mandarin',
    lessons: [
      {
        title: 'Lesson 1: Ordering Food',
        sections: [
          {
            topicSection: 'Food vocabulary; measure words; polite requests',
            learningObjectives:
              'Conduct a short food-ordering dialogue with measure words.\nEvaluate politeness choices in a restaurant exchange.',
            weeklyAssessments:
              'Grammar check: translate five sentences with measure words; Oral drill: record a partner dialogue using the new vocabulary.',
            asyncActivities: 'Listen to two menu-ordering dialogues and mark the measure words.',
            syncActivities: 'Practice ordering food in pairs with the menu card.',
            supportingResources: 'Textbook chapter 4 dialogues',
          },
        ],
      },
    ],
  };
}

const LONG_ACTIVITY =
  'Students compare three streamflow datasets from the county gauges and then identify which gauge shows the most variance before they defend the monitoring recommendation they would give the county water board ahead of the storm season';

const LONG_OBJECTIVE =
  'Evaluate how sediment transport interacts with channel morphology by tracing one storm event through the full watershed course pattern and run the comparison against the historical gauge record from the assigned basin packet';

function hydrologyCourseMap() {
  return {
    courseName: 'Watershed Hydrology',
    lessons: [
      {
        title: 'Lesson 1: Streamflow and Sediment Transport',
        sections: [
          {
            topicSection: 'Streamflow measurement; sediment transport; channel morphology',
            learningObjectives: `${LONG_OBJECTIVE}\nAnalyze gauge records to justify one monitoring decision.`,
            weeklyAssessments: 'Watershed brief: defend one monitoring recommendation with gauge evidence.',
            asyncActivities: `${LONG_ACTIVITY}.`,
            syncActivities: `${LONG_ACTIVITY}; compare findings with a partner team and revise the recommendation.`,
            supportingResources: 'County gauge data packet',
          },
        ],
      },
    ],
  };
}

function fourteenLessonCourseMap() {
  const topics = [
    ['Variables and Types', 'variable binding'],
    ['Conditionals', 'branch logic'],
    ['For Loops', 'definite iteration'],
    ['While Loops', 'indefinite iteration'],
    ['Functions', 'function signatures'],
    ['Lists', 'list indexing'],
    ['Dictionaries', 'key lookup'],
    ['Strings', 'string slicing'],
    ['File Handling', 'file parsing'],
    ['Errors and Exceptions', 'exception handling'],
    ['Modules', 'module imports'],
    ['Testing', 'unit testing'],
    ['Recursion', 'recursive cases'],
    ['Final Project', 'project integration'],
  ];
  return {
    courseName: 'Introduction to Programming',
    lessons: topics.map(([title, concept], index) => ({
      title: `Lesson ${index + 1}: ${title}`,
      sections: [
        {
          topicSection: `${concept}; ${title.toLowerCase()} practice`,
          learningObjectives: `Analyze ${concept} using the lesson ${index + 1} starter code.\nEvaluate how ${concept} changes the week ${index + 1} build.`,
          weeklyAssessments: `Week ${index + 1} lab: applied ${concept} exercises.`,
          asyncActivities: `Read the chapter on ${title.toLowerCase()}.`,
          syncActivities: `Workshop: trace ${concept} examples together.`,
          supportingResources: `Starter repository for ${title.toLowerCase()}`,
        },
      ],
    })),
  };
}

function geologyCourseMap() {
  return {
    courseName: 'Physical Geology',
    lessons: [
      {
        title: 'Lesson 1: Rock Cycle Synthesis',
        sections: [
          {
            topicSection:
              'Integrate mineral, rock, and process concepts; mineral identification; igneous rock textures',
            learningObjectives: 'Integrate mineral, rock, and process concepts to explain the rock cycle.',
            weeklyAssessments: 'Rock cycle diagram: annotate each transition with one process and one example.',
            asyncActivities: 'Review the mineral identification chart.',
            syncActivities: 'Sort hand samples by formation process.',
            supportingResources: 'Mineral identification chart',
          },
        ],
      },
    ],
  };
}

function biologyLabCourseMap() {
  const topics = [
    ['Microscopy Basics', 'cell structure observation'],
    ['Enzyme Activity', 'reaction rate measurement'],
    ['Photosynthesis', 'light response experiment'],
  ];
  return {
    courseName: 'Introductory Biology Lab',
    lessons: topics.map(([title, concept], index) => ({
      title: `Lesson ${index + 1}: ${title}`,
      sections: [
        {
          topicSection: `${concept}; ${title.toLowerCase()} procedure`,
          learningObjectives: `Analyze ${concept} results from the bench experiment.\nEvaluate one limitation of the ${title.toLowerCase()} protocol.`,
          weeklyAssessments: `Lab report ${index + 1}: ${concept} results with one limitation note.`,
          asyncActivities: `Read the ${title.toLowerCase()} protocol before the session.`,
          syncActivities: `Run the ${title.toLowerCase()} experiment and record observations.`,
          supportingResources: `Lab manual section on ${title.toLowerCase()}`,
        },
      ],
    })),
  };
}

function makeLoopLesson(lessonNumber) {
  return {
    lessonNumber,
    title: `Lesson ${lessonNumber}: Loops in Python`,
    keyConcepts: ['while loops', 'for loops'],
    outcomes: ['Use for loops to iterate over a list of items', 'Trace while loop execution until the condition fails'],
    studentArtifact: 'Loop practice worksheet',
    successCriteria: ['Worksheet shows correct loop traces with the stopping condition named'],
    prerequisitePlan: {
      diagnosticCheck: 'Check that students can iterate over a list of items before class',
    },
    evidencePlan: {
      sourceCue: 'the loops chapter',
      evidenceRequirement: 'Trace a while loop by hand and explain when the loop condition fails',
    },
    bloomsLevel: 'Apply',
  };
}

function loopBlueprint(lesson) {
  return { courseName: 'Introduction to Programming', lessons: [lesson], assessments: [] };
}

function uxTextureCourseMap() {
  const topics = [
    'Project-based UX design',
    'Critique sessions',
    'Design journals',
    'Usability testing',
    'Accessibility review',
    'Wireframes',
    'Prototypes',
    'Design rationale',
    'Peer critique',
    'Final UX case study portfolio',
    'Studio work',
    'Portfolio review',
  ];
  return {
    courseName: 'User Experience Design Studio',
    lessons: topics.map((topic, index) => ({
      title: `Lesson ${index + 1}: ${topic}`,
      sections: [
        {
          topicSection: `${index + 1}.1: ${topic.toLowerCase()}`,
          learningObjectives: `Apply ${topic.toLowerCase()} to a UX artifact and explain the design decision it changes.`,
          weeklyAssessments: `${topic} critique memo naming one user-evidence signal and one design revision.`,
          asyncActivities: `Review the UX example and mark where ${topic.toLowerCase()} changes the design rationale.`,
          syncActivities: `Run a critique round that tests how ${topic.toLowerCase()} changes the artifact.`,
          supportingResources: `UX example, critique protocol, and design-journal prompt aligned to ${topic.toLowerCase()}.`,
        },
      ],
    })),
  };
}

function distractorTexts(question) {
  return question.options
    .filter((option) => !option.startsWith(`${question.answer}.`))
    .map((option) => option.replace(/^[A-D]\.\s*/, ''));
}

function countOccurrences(text, needle) {
  return text.split(needle).length - 1;
}

describe('v0.14.1 phase 1 batch A compiler fixes', () => {
  it('1.2 keeps the second fused assessment label cased as written', () => {
    const blueprint = buildCourseBlueprint(mandarinCourseMap());
    const artifact = blueprint.lessons[0].studentArtifact;
    expect(artifact).toBe('Grammar check and Oral drill');
    // No interior-lowercase fused titles: "and <lower> <Upper>" is the
    // signature of the old charAt(0).toLowerCase() mangling.
    expect(artifact).not.toMatch(/\band [a-z]+ [A-Z]/);
  });

  it('1.3 truncated slide bullets end with an ellipsis or sentence punctuation', () => {
    const blueprint = buildCourseBlueprint(hydrologyCourseMap());
    const ir = buildSlideDeckIntermediateRepresentation(blueprint);
    const compiled = compileBlueprintDeliverable('slideDecks', blueprint, COMPILE_OPTIONS);
    let truncatedChecked = 0;
    ir.decks.forEach((deck, deckIndex) => {
      deck.slides.forEach((slide, slideIndex) => {
        // Activity slides replace bullets 1-2 with constructed cue phrases,
        // so display bullets are not truncations of the source there; the
        // label-budget check below covers them.
        if (slide.type === 'activity') return;
        const displayBullets = compiled.decks[deckIndex].slides[slideIndex].bullets;
        const sourceBullets = (slide.bullets || []).slice(0, slide.type === 'agenda' ? 5 : 3);
        sourceBullets.forEach((source, bulletIndex) => {
          const display = displayBullets[bulletIndex];
          if (!display || String(source).length <= 112) return;
          truncatedChecked += 1;
          expect(display, `deck ${deckIndex} slide ${slideIndex} bullet ${bulletIndex}`).toMatch(/(?:…|[.!?;])$/);
        });
      });
    });
    expect(truncatedChecked, 'fixture must exercise the >112-char bullet path').toBeGreaterThan(0);

    // The activity label spends the same budget as the bullet text: with
    // "Practice"/"Evidence"/"Debrief" prepended the rendered line stays at
    // or under the 78-char activity cap (+1 for a closing ellipsis).
    const activityBullets = compiled.decks.flatMap((deck) =>
      deck.slides.filter((slide) => slide.type === 'activity').flatMap((slide) => slide.bullets),
    );
    expect(activityBullets.length).toBeGreaterThan(0);
    for (const bullet of activityBullets) {
      expect(bullet).toMatch(/^(?:Practice|Evidence|Debrief|Step \d+): /);
      expect(bullet.length).toBeLessThanOrEqual(79);
    }
  });

  it('varies repeated UX readiness, discussion, slide, and FAQ texture scaffolds across 12 lessons', () => {
    const blueprint = buildCourseBlueprint(uxTextureCourseMap());
    const compiled = compileBlueprintDeliverables(
      blueprint,
      ['lessonPlans', 'slideDecks', 'discussions', 'courseFaq'],
      {
        ...COMPILE_OPTIONS,
        configMap: { slideDecks: { slideCount: 8 }, courseFaq: { questionsPerLesson: 7 } },
      },
    );
    const text = JSON.stringify(compiled);

    [
      'diagnostic response to form ready, partial, and needs-support groups before',
      'Where is the strongest limitation, risk, or ethical concern in your current reasoning about',
      'Explains the reasoning behind the claim and connects it to',
      'revise one evidence move for',
      'Do not stop at summary. Explain how',
    ].forEach((oldScaffold) => {
      expect(countOccurrences(text, oldScaffold), oldScaffold).toBe(0);
    });

    expect(text).toContain('warm-up evidence');
    expect(text).toContain('ready, developing, and targeted-support groups');
    expect(text).toContain('Which assumption');
    expect(text).toContain('Makes the warrant visible');
    expect(text).toContain('test one source-backed');
    expect(text).toContain('Avoid a general recap');
    expect(text).toContain('Move beyond summary');
  });

  it('1.3 final export pass punctuates long authored slide bullets', () => {
    const blueprint = buildCourseBlueprint(hydrologyCourseMap());
    blueprint.lessons[0].enrichment = {
      slideContent: [
        {
          title: 'EXAMPLE',
          bullets: ['Claims about group differences often overstate what genetic data can show'],
        },
      ],
    };

    const compiled = compileBlueprintDeliverable('slideDecks', blueprint, COMPILE_OPTIONS);
    const exampleSlide = compiled.decks[0].slides.find((slide) => slide.title === 'EXAMPLE');
    expect(exampleSlide?.bullets[0]).toBe('Claims about group differences often overstate what genetic data can show.');
  });

  it('1.4 syllabus SLOs span at least five distinct lessons of a 14-lesson course', () => {
    const blueprint = buildCourseBlueprint(fourteenLessonCourseMap());
    const compiled = compileBlueprintDeliverable('syllabus', blueprint, COMPILE_OPTIONS);
    const slos = compiled.syllabus.learningOutcomes;
    expect(slos.length).toBeGreaterThanOrEqual(7);

    const owners = new Map();
    for (const lesson of blueprint.lessons) {
      for (const outcome of lesson.outcomes) {
        const key = outcome.toLowerCase();
        if (!owners.has(key)) owners.set(key, new Set());
        owners.get(key).add(lesson.lessonNumber);
      }
    }
    const lessonsCovered = new Set();
    for (const slo of slos) {
      for (const lessonNumber of owners.get(slo.toLowerCase()) || []) {
        lessonsCovered.add(lessonNumber);
      }
    }
    expect(lessonsCovered.size).toBeGreaterThanOrEqual(5);

    // The alignment matrix uses the same cross-lesson sample.
    const matrixOutcomes = compiled.syllabus.outcomeAlignmentMatrix.map((row) => row.outcome);
    expect(matrixOutcomes).toEqual(slos);
  });

  it('1.6 aligns the while-loop item to the while-loop objective, not the for-loop one', () => {
    const lesson = makeLoopLesson(4);
    const atoms = buildQuizAtomsForLesson(lesson, loopBlueprint(lesson), { assessment: {} });
    // Item 0's diagnostic signal talks about iterating over a list — the
    // for-loop objective. Item 1's evidence signal talks about tracing a
    // while loop — it must take the while-loop objective even though the
    // old rotation would have handed it the next unused (for-loop) one.
    expect(atoms[0].objectiveAligned).toMatch(/for loops/i);
    expect(atoms[1].objectiveAligned).toMatch(/while loop/i);
    expect(atoms[1].objectiveAligned).not.toMatch(/for loops/i);
    expect(atoms[1].quizPlan.objectiveAlignmentStrategy).toBe('stem-objective-lexical-match');
  });

  it('1.7 frames 2 and 4 are student-facing content questions', () => {
    const lesson = makeLoopLesson(4);
    const atoms = buildQuizAtomsForLesson(lesson, loopBlueprint(lesson), { assessment: {} });
    for (const question of atoms) {
      expect(question.question).not.toMatch(/instructor question/i);
      expect(question.question).not.toMatch(/feedback move/i);
    }
    // Frame 2 applies the secondary concept inside a concrete scenario.
    expect(atoms[2].question).toMatch(/^In the /);
    expect(atoms[2].question).toContain('for loops');
    // Frame 4 asks which evidence supports a claim about the concept.
    expect(atoms[4].question).toContain('evidence');
    expect(atoms[4].question).toContain('claim');
  });

  it('1.7 rotates the distractor pool so adjacent lessons differ', () => {
    const lessonOne = makeLoopLesson(1);
    const lessonTwo = makeLoopLesson(2);
    const atomsOne = buildQuizAtomsForLesson(lessonOne, loopBlueprint(lessonOne), { assessment: {} });
    const atomsTwo = buildQuizAtomsForLesson(lessonTwo, loopBlueprint(lessonTwo), { assessment: {} });
    const setOne = new Set(distractorTexts(atomsOne[0]));
    const setTwo = new Set(distractorTexts(atomsTwo[0]));
    expect([...setOne].some((text) => !setTwo.has(text))).toBe(true);
  });

  it('1.9 never comma-splits objective sentences into fragment key terms', () => {
    const blueprint = buildCourseBlueprint(geologyCourseMap());
    const concepts = blueprint.lessons[0].keyConcepts.map((concept) => concept.toLowerCase());
    expect(concepts).not.toContain('integrate mineral');
    expect(concepts.some((concept) => /^integrate\b/.test(concept))).toBe(false);
    expect(concepts).not.toContain('and process concepts');
    expect(concepts).not.toContain('process concepts');
    // Real terms survive the filter.
    expect(concepts.some((concept) => concept.includes('mineral'))).toBe(true);
  });

  it('1.10 ships no internal vocabulary in compiled deliverables', () => {
    const preferenceProfile = buildInstructorPreferenceProfile([
      { featureId: 'rubrics', field: 'criteria', action: 'accepted', accessCount: 5, importance: 4 },
      { featureId: 'quizBank', field: 'question', action: 'accepted' },
      { featureId: 'slideDecks', field: 'slides.notes', action: 'edited' },
      { featureId: 'lessonPlans', field: 'outline.duration', action: 'edited' },
      { featureId: 'discussions', field: 'prompt', action: 'accepted' },
      { featureId: 'assignments', field: 'instructions', action: 'accepted' },
    ]);
    const blueprint = buildCourseBlueprint(biologyLabCourseMap(), { instructorPreferences: preferenceProfile });

    // (c) the running project is named like something a student keeps.
    expect(blueprint.courseThroughlineContext.projectName).toContain('Lab Notebook');
    expect(JSON.stringify(blueprint)).not.toContain('Evidence Thread');

    const featureIds = [
      'syllabus',
      'lessonPlans',
      'slideDecks',
      'assignments',
      'rubrics',
      'discussions',
      'quizBank',
      'studyGuides',
      'courseFaq',
    ];
    const text = featureIds
      .map((featureId) => JSON.stringify(compileBlueprintDeliverable(featureId, blueprint, COMPILE_OPTIONS) || {}))
      .join('\n');

    // (a) preference bucket tokens render as display phrases.
    expect(text).not.toContain('Preference profile: criterion-specific');
    expect(text).not.toMatch(/Preference profile:/i);
    expect(text).toContain('feedback tied to specific rubric criteria');

    // (b) no internal modality id glued to "evidence routine".
    expect(text).not.toMatch(/[a-z]+(?:-[a-z]+)+ evidence routine/);

    // (c) the internal thread name never reaches compiled text.
    expect(text).not.toContain('Evidence Thread');
  });
});
