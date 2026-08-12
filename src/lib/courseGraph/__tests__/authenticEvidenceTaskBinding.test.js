import { describe, expect, it } from 'vitest';

import { evaluateClassroomReadiness } from '../../classroomReadiness.js';
import { isClaimEvidenceBoundaryShortAnswer } from '../../quality/quizItemDepth.js';
import {
  applyAuthenticDataTaskQuizBinding,
  compactBlueprintForStorage,
  compileBlueprintDeliverables,
} from '../../courseBlueprintCompiler.js';
import { identificationObservationInstruction } from '../../verifiedDraftCompilerContracts.js';
import { attachAuthenticLanguageDataTransactionToGraph, buildBlueprintFromGraph } from '../blueprintFromGraph.js';
import { deriveCourseGraphFromCourseMap } from '../deriveFromCourseMap.js';
import { enrichAuthenticLanguageDataPacket } from '../authenticLanguageEvidenceLibrary.js';

describe('authentic evidence task binding', () => {
  it('initializes the curated packet from strong language-analysis demand instead of drafting placeholders', () => {
    const graph = deriveCourseGraphFromCourseMap({
      courseName: 'Language Structure',
      lessons: [
        {
          title: 'Lesson 1: Morphological Structure',
          sections: [{ topicSection: 'Identify morphemes and fusion', weeklyAssessments: 'Morpheme analysis.' }],
        },
      ],
    });

    const blueprint = buildBlueprintFromGraph(graph);

    expect(graph.authenticLanguageData).toMatchObject({
      protocol: 'coursemapper-authentic-language-data-v1',
      curatedFallbackReceipt: { initializedFromCurriculumDemand: true },
    });
    expect(blueprint.lessons[0].authenticDataTaskPlan).toMatchObject({
      protocol: 'coursemapper-authentic-evidence-task-binding-v1',
      operation: 'identification',
    });
  });

  it('turns a linguistic-evidence foundation into an observation-versus-inference audit', () => {
    const graph = deriveCourseGraphFromCourseMap({
      courseName: 'Language Structure',
      lessons: [
        {
          title: 'Lesson 1: Linguistic Evidence Basis',
          sections: [{ topicSection: 'Defining Linguistic Evidence', weeklyAssessments: 'Evidence audit.' }],
        },
      ],
    });

    const blueprint = buildBlueprintFromGraph(graph);
    const task = blueprint.lessons[0].authenticDataTaskPlan;

    expect(task).toMatchObject({ operation: 'evidence-audit' });
    expect(task.evidenceItemIds).toHaveLength(2);
    expect(task.prompt).toMatch(/observation|interpretation|generalization/i);
    expect(task.answerKey).toMatch(/observation from source-bounded interpretation/i);
    expect(blueprint.instructionalIntentGraph.admission).toMatchObject({
      status: 'approved',
      blockers: [],
    });
    expect(blueprint.instructionalIntentGraph.lessonIntents[0]).toMatchObject({
      id: blueprint.lessons[0].id,
    });
    expect(blueprint.instructionalIntentGraph.lessonIntents[0].targetObjectives).toContain(task.objective);
  });

  it('recognizes language-data project stages from course context without hardcoding a course title', () => {
    const graph = deriveCourseGraphFromCourseMap({
      courseName: 'Multilingual Analysis Studio',
      lessons: [
        {
          title: 'Lesson 1: Project Development',
          sections: [{ topicSection: 'Project scoping, hypothesis formulation, and methodology design' }],
        },
        {
          title: 'Lesson 2: Project Execution',
          sections: [{ topicSection: 'Data processing, analysis implementation, and drafting findings' }],
        },
        {
          title: 'Lesson 3: Data Presentation',
          sections: [{ topicSection: 'Results visualization, conclusion formulation, and final project submission' }],
        },
      ],
    });

    const blueprint = buildBlueprintFromGraph(graph);

    expect(blueprint.authenticLanguageDataCoverage).toMatchObject({
      requiredLessonCount: 3,
      admittedLessonCount: 3,
      coverage: 1,
    });
    expect(blueprint.authenticLanguageDataCoverage.lessons.map((lesson) => lesson.operation)).toEqual([
      'proposal-defense',
      'dataset-audit',
      'evidence-audit',
    ]);
  });

  it('does not use a synchronic form record as authority for historical sound change', () => {
    const graph = deriveCourseGraphFromCourseMap({
      courseName: 'Language Structure and Change',
      lessons: [
        {
          title: 'Lesson 1: Phonetic Observation',
          sections: [{ topicSection: 'Identify articulatory phonetic categories' }],
        },
        {
          title: 'Lesson 2: Language Change',
          sections: [{ topicSection: 'Sound change mechanisms, lexical evolution, and structural drift' }],
        },
      ],
    });

    const blueprint = buildBlueprintFromGraph(graph);

    expect(blueprint.authenticLanguageDataCoverage.lessons.map((lesson) => lesson.lessonNumber)).toEqual([1]);
    expect(blueprint.lessons[1].authenticDataTaskPlan).toBeUndefined();
  });

  it('binds lateral claims to the language and form so identical prose cannot collide in provenance', () => {
    const packet = enrichAuthenticLanguageDataPacket(
      { protocol: 'coursemapper-authentic-language-data-v1', sources: [], examples: [] },
      [
        {
          title: 'Cross-linguistic lateral comparison',
          sections: [{ topic: 'Compare voiced lateral consonants across languages' }],
        },
      ],
    );
    const lateralExamples = packet.examples.filter((example) =>
      /wals-8-(?:english|spanish|indonesian)/.test(example.id),
    );

    expect(lateralExamples).toHaveLength(3);
    expect(new Set(lateralExamples.map((example) => example.analysisFocus)).size).toBe(3);
    for (const example of lateralExamples) {
      expect(example.analysisFocus).toContain(example.language);
      expect(example.analysisFocus).toContain(`“${example.form}”`);
    }
  });

  it('replays the pre-draft packet and task exactly when later semantic text would select different evidence', () => {
    const initialMap = {
      courseName: 'Language Structure',
      lessons: [
        {
          title: 'Lesson 1: Tone and Prosody',
          sections: [
            {
              topicSection: 'Identify tone, prosody, and intonation from displayed forms',
              weeklyAssessments: 'Bounded prosodic identification.',
            },
          ],
        },
      ],
    };
    const initialGraph = deriveCourseGraphFromCourseMap(initialMap);
    const initialBlueprint = buildBlueprintFromGraph(initialGraph);
    const frozenPacket = structuredClone(initialGraph.authenticLanguageData);
    const frozenCoverage = structuredClone(initialBlueprint.authenticLanguageDataCoverage);
    const frozenTask = structuredClone(frozenCoverage.lessons[0].taskBinding);

    const laterGraph = deriveCourseGraphFromCourseMap({
      ...initialMap,
      lessons: [
        {
          title: 'Lesson 1: Cross-linguistic Lateral Comparison',
          sections: [
            {
              topicSection: 'Compare voiced lateral consonants across languages',
              weeklyAssessments: 'Bounded lateral comparison.',
            },
          ],
        },
      ],
    });
    const recomputed = buildBlueprintFromGraph(structuredClone(laterGraph));
    expect(recomputed.lessons[0].authenticDataTaskPlan.evidenceItemIds).not.toEqual(frozenTask.evidenceItemIds);

    const replayed = buildBlueprintFromGraph(laterGraph, {
      authenticLanguageDataPacket: frozenPacket,
      authenticLanguageDataCoverage: frozenCoverage,
    });

    expect(replayed.lessons[0].authenticDataTaskPlan).toEqual(frozenTask);
    expect(laterGraph.authenticLanguageData).toEqual(frozenPacket);
    expect(laterGraph.authenticLanguageDataCoverage).toEqual(frozenCoverage);
    expect(laterGraph.sessions[0].sections[0].resourceRefs).toContain('authentic-language-data-packet');
  });

  it('freezes the pre-draft language transaction onto the final native graph before save callbacks', () => {
    const sourceGraph = deriveCourseGraphFromCourseMap({
      courseName: 'Language Structure',
      lessons: [
        {
          title: 'Lesson 1: Morphological Structure',
          sections: [{ topicSection: 'Identify morphemes and fusion' }],
        },
      ],
    });
    const sourceBlueprint = buildBlueprintFromGraph(sourceGraph);
    const finalNativeGraph = deriveCourseGraphFromCourseMap({
      courseName: 'Language Structure',
      lessons: [
        {
          title: 'Lesson 1: Morphological Structure',
          sections: [{ topicSection: 'Identify morphemes and fusion' }],
        },
      ],
    });

    const frozen = attachAuthenticLanguageDataTransactionToGraph(finalNativeGraph, {
      authenticLanguageDataPacket: sourceGraph.authenticLanguageData,
      authenticLanguageDataCoverage: sourceBlueprint.authenticLanguageDataCoverage,
    });

    expect(frozen.authenticLanguageData).toEqual(sourceGraph.authenticLanguageData);
    expect(frozen.authenticLanguageDataCoverage).toEqual(sourceBlueprint.authenticLanguageDataCoverage);
    expect(frozen.sessions[0].sections[0].resourceRefs).toContain('authentic-language-data-packet');
  });
  it('rotates identification guidance across long courses without weakening the shared evidence boundary', () => {
    const courseMap = {
      courseName: 'Reusable Morphological Identification Laboratory',
      lessons: Array.from({ length: 8 }, (_, index) => ({
        title: `Lesson ${index + 1}: Morphological Identification ${index + 1}`,
        sections: [
          {
            topicSection: `Identify morpheme boundaries and form-gloss correspondences in dataset ${index + 1}`,
            weeklyAssessments: `Bounded identification note ${index + 1}.`,
          },
        ],
      })),
    };
    const identificationGuidance = courseMap.lessons.map((_, index) =>
      identificationObservationInstruction({ lessonNumber: index + 1 }),
    );
    const assignments = identificationGuidance.map((instruction, index) => ({
      lessonNumber: index + 1,
      title: `Lesson ${index + 1} identification note`,
      instructions: [instruction],
    }));
    const readiness = evaluateClassroomReadiness({
      courseMap,
      selectedFeatures: ['assignments'],
      deliverables: { assignments: { status: 'done', data: { assignments } } },
    });

    expect(identificationGuidance.length).toBe(8);
    expect(new Set(identificationGuidance).size).toBe(identificationGuidance.length);
    expect(identificationGuidance.join(' ')).toMatch(/form|gloss/i);
    expect(
      readiness.warnings.some((issue) => issue.message.includes('repeats the same boilerplate')),
      JSON.stringify(readiness.warnings, null, 2),
    ).toBe(false);
  });

  it('admits examples from their declared analysis family, not incidental boundary words', () => {
    const graph = deriveCourseGraphFromCourseMap({
      courseName: 'Language Structure',
      lessons: [
        {
          title: 'Lesson 1: Morphological Structures',
          sections: [{ topicSection: 'Identify and classify morphemes', weeklyAssessments: 'Morpheme analysis.' }],
        },
        {
          title: 'Lesson 2: Syntactic Frameworks',
          sections: [{ topicSection: 'Analyze phrase structure rules', weeklyAssessments: 'Syntax analysis.' }],
        },
        {
          title: 'Lesson 3: Semantic Interpretation',
          sections: [{ topicSection: 'Interpret lexical meaning in context', weeklyAssessments: 'Meaning analysis.' }],
        },
      ],
    });
    graph.authenticLanguageData = {
      protocol: 'coursemapper-authentic-language-data-v1',
      examples: [
        {
          id: 'phonology-lake',
          language: 'English',
          form: 'lake',
          gloss: 'initial lateral segment',
          translation: 'lake',
          analysisFocus: 'Phonetic and phonological identification of a lateral consonant.',
          sourceId: 'phonology-source',
          sourceLocator: 'example 1',
          communityContext: 'This segment in one word does not describe every clause or meaning.',
        },
        {
          id: 'morphology-fijian',
          language: 'Boumaa Fijian',
          form: 'Au aa soli-a a=niu vei ira.',
          gloss: '1SG PST give-TR ART=coconut to 3PL',
          translation: 'I gave the coconut to them.',
          analysisFocus: 'Morphological and morpheme identification of a past-tense formative.',
          sourceId: 'morphology-source',
          sourceLocator: 'example 2',
          communityContext: 'One clause does not establish all Fijian morphology.',
        },
        {
          id: 'syntax-japanese',
          language: 'Japanese',
          form: 'John ga tegami o yon-da.',
          gloss: 'John SUBJ letter OBJ read-PST',
          translation: 'John read the letter.',
          analysisFocus:
            'Syntax and constituent word order: the cited clause is SOV; translation supports bounded semantic meaning comparison.',
          sourceId: 'syntax-source',
          sourceLocator: 'example 3',
          communityContext: 'The translation preserves meaning but does not establish every clause order.',
        },
      ],
    };

    const blueprint = buildBlueprintFromGraph(graph);

    expect(blueprint.lessons[0].authenticDataTaskPlan?.evidenceItemIds).toEqual(['morphology-fijian']);
    expect(blueprint.lessons[1].authenticDataTaskPlan?.evidenceItemIds).toEqual(['syntax-japanese']);
    expect(blueprint.lessons[2].authenticDataTaskPlan?.evidenceItemIds).toEqual(['wals-129-bambara-hand-arm']);
    expect(blueprint.authenticLanguageDataCoverage.lessons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ lessonNumber: 1, admitted: true, relevantExampleIds: ['morphology-fijian'] }),
        expect.objectContaining({ lessonNumber: 2, admitted: true, relevantExampleIds: ['syntax-japanese'] }),
        expect.objectContaining({
          lessonNumber: 3,
          evidenceSubtype: 'lexical-semantics',
          admitted: true,
          relevantExampleIds: ['wals-129-bambara-hand-arm'],
        }),
      ]),
    );

    const compiled = compileBlueprintDeliverables(compactBlueprintForStorage(blueprint), ['quizBank']);
    const singleRecordQuizzes = compiled.quizBank.quizzes.filter((quiz) => [1, 2].includes(quiz.lessonNumber));
    const renderedQuizText = JSON.stringify(singleRecordQuizzes);
    expect(renderedQuizText).toContain('Identification:');
    expect(renderedQuizText).not.toMatch(/Comparison:\s+[^;]+\s+versus\s+/i);
    expect(renderedQuizText).not.toMatch(/“([^”]+)”\s+versus\s+[^“]*“\1”/i);
  });

  it('fills uncovered semantic-pragmatic subtypes from source-bound evidence instead of reusing one generic record', () => {
    const graph = deriveCourseGraphFromCourseMap({
      courseName: 'Meaning and Use',
      lessons: [
        {
          title: 'Lesson 1: Lexical Semantics',
          sections: [{ topicSection: 'Analyze word meaning and polysemy', weeklyAssessments: 'Lexical analysis.' }],
        },
        {
          title: 'Lesson 2: Pragmatic Context',
          sections: [
            { topicSection: 'Identify speech acts and utterance functions', weeklyAssessments: 'Speech-act analysis.' },
          ],
        },
        {
          title: 'Lesson 3: Modal Logic in Meaning',
          sections: [{ topicSection: 'Interpret epistemic possibility', weeklyAssessments: 'Modal analysis.' }],
        },
      ],
    });
    graph.authenticLanguageData = {
      protocol: 'coursemapper-authentic-language-data-v1',
      sources: [{ id: 'baseline-source', title: 'Baseline source' }],
      examples: [
        {
          id: 'baseline-phonology',
          language: 'English',
          form: 'lake',
          gloss: 'initial lateral',
          translation: 'lake',
          analysisFocus: 'Phonological identification of a lateral.',
          sourceId: 'baseline-source',
          sourceLocator: 'example 1',
        },
        {
          id: 'baseline-syntax',
          language: 'Japanese',
          form: 'John ga tegami o yon-da.',
          gloss: 'John SUBJ letter OBJ read-PST',
          translation: 'John read the letter.',
          analysisFocus: 'Syntax and constituent word order.',
          sourceId: 'baseline-source',
          sourceLocator: 'example 2',
        },
      ],
    };

    const blueprint = buildBlueprintFromGraph(graph);

    expect(blueprint.authenticLanguageDataCoverage).toMatchObject({
      requiredLessonCount: 3,
      admittedLessonCount: 3,
      coverage: 1,
    });
    expect(blueprint.authenticLanguageDataCoverage.lessons).toEqual([
      expect.objectContaining({
        evidenceSubtype: 'lexical-semantics',
        relevantExampleIds: ['wals-129-bambara-hand-arm'],
        admitted: true,
      }),
      expect.objectContaining({
        evidenceSubtype: 'speech-acts',
        relevantExampleIds: ['wals-72-waunana-imperative'],
        admitted: true,
      }),
      expect.objectContaining({
        evidenceSubtype: 'modality',
        relevantExampleIds: ['wals-75-harar-oromo-epistemic'],
        admitted: true,
      }),
    ]);
    expect(graph.authenticLanguageData.curatedFallbackReceipt).toMatchObject({
      protocol: 'coursemapper-curated-authentic-language-evidence-v1',
      demandedSubtypes: ['lexical-semantics', 'modality', 'speech-acts'],
      addedExampleIds: ['wals-129-bambara-hand-arm', 'wals-72-waunana-imperative', 'wals-75-harar-oromo-epistemic'],
    });
    expect(graph.authenticLanguageData.sources.slice(-3)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'wals-hand-arm-129', license: 'CC BY 4.0' }),
        expect.objectContaining({ id: 'wals-imperative-hortative-72', license: 'CC BY 4.0' }),
        expect.objectContaining({ id: 'wals-epistemic-possibility-75', license: 'CC BY 4.0' }),
      ]),
    );
  });

  it('fills missing structural evidence families from the reusable source-bound library', () => {
    const graph = deriveCourseGraphFromCourseMap({
      courseName: 'Language Structure Laboratory',
      lessons: [
        {
          title: 'Lesson 1: Phonological Contrast',
          sections: [
            { topicSection: 'Compare consonant patterns across languages', weeklyAssessments: 'Contrast analysis.' },
          ],
        },
        {
          title: 'Lesson 2: Morphological Structure',
          sections: [{ topicSection: 'Identify morphemes and fusion', weeklyAssessments: 'Morpheme analysis.' }],
        },
        {
          title: 'Lesson 3: Constituent Order',
          sections: [{ topicSection: 'Compare word order across languages', weeklyAssessments: 'Syntax analysis.' }],
        },
        {
          title: 'Lesson 4: Head Movement',
          sections: [
            {
              topicSection: 'Explain head movement from competing syntactic accounts',
              weeklyAssessments: 'Mechanism explanation.',
            },
          ],
        },
        {
          title: 'Lesson 5: Prosody',
          sections: [
            { topicSection: 'Compare tone and suprasegmental evidence', weeklyAssessments: 'Prosody analysis.' },
          ],
        },
      ],
    });
    graph.authenticLanguageData = {
      protocol: 'coursemapper-authentic-language-data-v1',
      sources: [],
      examples: [],
    };

    const blueprint = buildBlueprintFromGraph(graph);
    const coverage = blueprint.authenticLanguageDataCoverage;

    expect(coverage).toMatchObject({ requiredLessonCount: 5, admittedLessonCount: 5, coverage: 1 });
    expect(coverage.lessons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ lessonNumber: 1, operation: 'comparison', admitted: true }),
        expect.objectContaining({ lessonNumber: 2, evidenceSubtype: 'fusion', admitted: true }),
        expect.objectContaining({ lessonNumber: 3, evidenceSubtype: 'word-order', admitted: true }),
        expect.objectContaining({ lessonNumber: 4, evidenceSubtype: 'head-movement', admitted: true }),
        expect.objectContaining({ lessonNumber: 5, evidenceSubtype: 'prosody', admitted: true }),
      ]),
    );
    expect(blueprint.lessons[3].authenticDataTaskPlan).toMatchObject({
      operation: 'mechanism-explanation',
      evidenceItemIds: expect.arrayContaining(['mit-head-movement-english-v-adv', 'mit-head-movement-french-v-adv']),
    });
    expect(graph.authenticLanguageData.curatedFallbackReceipt).toMatchObject({
      protocol: 'coursemapper-curated-authentic-language-evidence-v1',
      demandedFamilies: expect.arrayContaining([
        'morphology:fusion',
        'phonology:prosody',
        'syntax:head-movement',
        'syntax:word-order',
      ]),
    });
  });

  it('grounds broad typological comparison in one comparable multilingual structural dimension', () => {
    const graph = deriveCourseGraphFromCourseMap({
      courseName: 'Introduction to Language Structure',
      lessons: [
        {
          title: 'Lesson 12: Cross-Linguistic Comparison',
          sections: [
            { topicSection: 'Typological Approaches to Language Comparison' },
            { topicSection: 'Mapping Structural Similarities and Differences' },
            { topicSection: 'Comparative Analysis of Grammatical Structures' },
          ],
        },
      ],
    });

    const blueprint = buildBlueprintFromGraph(graph);
    const coverage = blueprint.authenticLanguageDataCoverage;
    const task = blueprint.lessons[0].authenticDataTaskPlan;

    expect(coverage).toMatchObject({
      requiredLessonCount: 1,
      admittedLessonCount: 1,
      coverage: 1,
      lessons: [
        expect.objectContaining({
          evidenceSubtype: 'word-order',
          operation: 'generalization',
          requiredExamples: 3,
          requiredLanguages: 3,
          admitted: true,
        }),
      ],
    });
    expect(task).toMatchObject({
      operation: 'generalization',
      evidenceItemIds: expect.arrayContaining([
        expect.stringMatching(/^wals-81-/),
        expect.stringMatching(/^wals-81-/),
        expect.stringMatching(/^wals-81-/),
      ]),
    });
    expect(task.examples).toHaveLength(3);
    expect(new Set(task.examples.map((example) => example.language)).size).toBe(3);
    expect(task.examples.every((example) => /constituent word order/i.test(example.analysisFocus))).toBe(true);
    expect(task.prompt).toMatch(/bounded cross-linguistic generalization|inside the cited sample/i);
  });

  it('covers generic semantics and pragmatics lessons with rotated source-bound records', () => {
    const graph = deriveCourseGraphFromCourseMap({
      courseName: 'Meaning in Context',
      lessons: [
        {
          title: 'Lesson 1: Semantic Interpretation',
          sections: [{ topicSection: 'Interpret meaning from evidence', weeklyAssessments: 'Meaning analysis.' }],
        },
        {
          title: 'Lesson 2: Pragmatic Context',
          sections: [{ topicSection: 'Analyze context and inference', weeklyAssessments: 'Context analysis.' }],
        },
        {
          title: 'Lesson 3: Semantics and Pragmatics',
          sections: [{ topicSection: 'Connect meaning and use', weeklyAssessments: 'Evidence note.' }],
        },
      ],
    });
    graph.authenticLanguageData = {
      protocol: 'coursemapper-authentic-language-data-v1',
      sources: [],
      examples: [],
    };

    const blueprint = buildBlueprintFromGraph(graph);
    const coverage = blueprint.authenticLanguageDataCoverage;
    const taskIds = blueprint.lessons.map((lesson) => lesson.authenticDataTaskPlan?.evidenceItemIds?.[0]);

    expect(coverage).toMatchObject({ requiredLessonCount: 3, admittedLessonCount: 3, coverage: 1 });
    expect(coverage.lessons.every((lesson) => lesson.evidenceSubtype === 'general' && lesson.admitted)).toBe(true);
    expect(new Set(taskIds).size).toBe(3);
    expect(graph.authenticLanguageData.curatedFallbackReceipt).toMatchObject({
      demandedSubtypes: ['general'],
      addedExampleIds: ['wals-129-bambara-hand-arm', 'wals-72-waunana-imperative', 'wals-75-harar-oromo-epistemic'],
    });
  });

  it('turns corpus and final-project lessons into replayable multilingual method tasks', () => {
    const graph = deriveCourseGraphFromCourseMap({
      courseName: 'Language Data Methods',
      lessons: [
        {
          title: 'Lesson 1: Data Analysis Project',
          sections: [
            {
              topicSection: 'Corpus Selection and Annotation',
              weeklyAssessments: 'Audit the sample and coding protocol.',
            },
          ],
        },
        {
          title: 'Lesson 2: Final Data Analysis Project',
          sections: [
            {
              topicSection: 'Project Proposal Defense',
              weeklyAssessments: 'Defend the analysis design.',
            },
          ],
        },
      ],
    });
    graph.authenticLanguageData = {
      protocol: 'coursemapper-authentic-language-data-v1',
      sources: [],
      examples: [],
    };

    const blueprint = buildBlueprintFromGraph(graph);
    expect(blueprint.authenticLanguageDataCoverage).toMatchObject({
      requiredLessonCount: 2,
      admittedLessonCount: 2,
      coverage: 1,
    });
    expect(blueprint.authenticLanguageDataCoverage.lessons).toEqual([
      expect.objectContaining({
        evidenceSubtype: 'corpus-methods',
        operation: 'dataset-audit',
        admitted: true,
      }),
      expect.objectContaining({
        evidenceSubtype: 'project-synthesis',
        operation: 'proposal-defense',
        admitted: true,
      }),
    ]);
    for (const lesson of blueprint.lessons) {
      const task = lesson.authenticDataTaskPlan;
      expect(task).toMatchObject({
        evidenceItemIds: expect.any(Array),
        payloadSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        taskContractSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      });
      expect(new Set(task.examples.map((example) => example.language)).size).toBe(3);
      expect(task.prompt).toMatch(/sampling|sample|corpus|project|proposal/i);
      expect(task.answerKey).toMatch(/sampling|sample|select/i);
      expect(lesson.successCriteria.join(' ')).not.toContain(
        'Cite their recorded locations and respect their community limits.',
      );
    }

    const compiled = compileBlueprintDeliverables(compactBlueprintForStorage(blueprint), [
      'quizBank',
      'assignments',
      'rubrics',
    ]);
    const rendered = JSON.stringify(compiled);
    expect(rendered).toContain('reproducible inclusion rule');
    expect(rendered).toContain('sampling and annotation decisions');
    expect(compiled.assignments.assignments[0].instructions.join(' ')).toMatch(
      /replayable sampling and annotation ledger/i,
    );
    expect(compiled.assignments.assignments[1].instructions.join(' ')).toMatch(/frame one answerable question/i);
    expect(compiled.assignments.assignments[0].instructions).not.toEqual(
      compiled.assignments.assignments[1].instructions,
    );
    expect(
      compiled.quizBank.quizzes.flatMap((quiz) => quiz.questions).every((question) => !question.sourceReviewRequired),
    ).toBe(true);
    const proposalQuestionRows = applyAuthenticDataTaskQuizBinding(
      Array.from({ length: 8 }, (_, index) => ({
        question: `placeholder ${index + 1}`,
        points: 2,
      })),
      blueprint.lessons[1],
    );
    expect(proposalQuestionRows).toHaveLength(8);
    const proposalQuestions = proposalQuestionRows.map((question) => question.question);
    expect(new Set(proposalQuestions).size).toBe(8);
    expect(
      proposalQuestions.filter(
        (question) =>
          /Spanish lobo example/i.test(question) && /Boumaa Fijian/i.test(question) && /Turkish past/i.test(question),
      ).length,
    ).toBeLessThanOrEqual(2);
    expect(proposalQuestions.join(' ')).toMatch(
      /analytic-unit|annotation plan|reliability|counterexample|methods plan/i,
    );
    expect(
      proposalQuestionRows
        .filter((question) => question.type === 'short_answer')
        .every((question) => isClaimEvidenceBoundaryShortAnswer(question.question)),
    ).toBe(true);

    const corpusQuestionRows = applyAuthenticDataTaskQuizBinding(
      Array.from({ length: 8 }, (_, index) => ({
        question: `placeholder ${index + 1}`,
        points: 2,
      })),
      blueprint.lessons[0],
    );
    expect(
      corpusQuestionRows
        .filter((question) => question.type === 'short_answer')
        .every((question) => isClaimEvidenceBoundaryShortAnswer(question.question)),
    ).toBe(true);
  });

  it('treats generic authentic-dataset selection as a language-data method inside a language course', () => {
    const graph = deriveCourseGraphFromCourseMap({
      courseName: 'Introduction to Language Structure',
      lessons: [
        {
          title: 'Lesson 1: Authentic Data Application',
          sections: [
            {
              topicSection: 'Data Set Selection',
              weeklyAssessments: 'Audit the selected evidence sample.',
            },
          ],
        },
      ],
    });

    const blueprint = buildBlueprintFromGraph(graph);

    expect(blueprint.authenticLanguageDataCoverage).toMatchObject({
      requiredLessonCount: 1,
      admittedLessonCount: 1,
      coverage: 1,
      lessons: [
        expect.objectContaining({
          evidenceSubtype: 'corpus-methods',
          operation: 'dataset-audit',
          admitted: true,
        }),
      ],
    });
    expect(blueprint.lessons[0].authenticDataTaskPlan).toMatchObject({
      operation: 'dataset-audit',
      evidenceItemIds: expect.any(Array),
    });
  });

  it('binds exact payloads through the prompt, answer key, assignment, and rubric', () => {
    const graph = deriveCourseGraphFromCourseMap({
      courseName: 'Advanced Syntax',
      lessons: [
        {
          title: 'Lesson 1: Head Movement and Structure',
          sections: [
            {
              topicSection: 'Explain head movement and compare competing syntactic accounts',
              weeklyAssessments: 'Head-movement evidence analysis.',
            },
          ],
        },
      ],
    });
    graph.authenticLanguageData = {
      protocol: 'coursemapper-authentic-language-data-v1',
      examples: [
        {
          id: 'english-v-adv',
          language: 'English',
          form: 'Mary often speaks French.',
          gloss: 'Mary often speak.3SG French',
          translation: 'Mary often speaks French.',
          analysisFocus:
            'In this syntax head movement contrast, the finite lexical verb follows the VP adverb in English.',
          sourceId: 'syntax-lecture',
          sourceLocator: 'slides 48–49',
          communityContext: 'This contrast does not establish every English head-movement operation.',
        },
        {
          id: 'french-v-adv',
          language: 'French',
          form: 'Marie parle souvent français.',
          gloss: 'Marie speak.3SG often French',
          translation: 'Marie often speaks French.',
          analysisFocus:
            'In this syntax head movement contrast, the finite verb precedes the VP adverb in the cited V-to-I analysis.',
          sourceId: 'syntax-lecture',
          sourceLocator: 'slides 48–49',
          communityContext: 'This bounded contrast is not an invariant claim about every French clause or variety.',
        },
      ],
    };

    const blueprint = buildBlueprintFromGraph(graph);
    const storedBlueprint = compactBlueprintForStorage(blueprint);
    const compiled = compileBlueprintDeliverables(storedBlueprint, ['quizBank', 'assignments', 'rubrics']);
    const quiz = compiled.quizBank.quizzes[0];
    const assignment = compiled.assignments.assignments[0];
    const rubric = compiled.rubrics.rubrics[0];
    const task = blueprint.lessons[0].authenticDataTaskPlan;
    const rendered = JSON.stringify({ quiz, assignment, rubric });

    expect(graph.authenticLanguageDataCoverage?.lessons?.[0]).toMatchObject({
      operation: 'mechanism-explanation',
      admitted: true,
    });
    expect(task).toMatchObject({
      operation: 'mechanism-explanation',
      evidenceItemIds: ['english-v-adv', 'french-v-adv'],
      evidenceLabels: ['English verb–adverb example', 'French verb–adverb example'],
      payloadSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      truthProof: {
        promptDisplaysBoundPayload: true,
        answerKeyOperatesOnBoundPayload: true,
        rubricScoresDeclaredOperation: true,
      },
    });
    expect(rendered).toContain('Mary often speaks French.');
    expect(rendered).toContain('Marie parle souvent français.');
    expect(task.prompt).not.toContain('english-v-adv');
    expect(task.prompt).not.toContain('french-v-adv');
    expect(task.answerKey).toContain('English verb–adverb example');
    expect(task.answerKey).toContain('French verb–adverb example');
    expect(
      quiz.questions.some((question) => question.authenticEvidenceBinding?.payloadSha256 === task.payloadSha256),
    ).toBe(true);
    expect(
      quiz.questions
        .filter((question) => question.authenticEvidenceBinding?.payloadSha256 === task.payloadSha256)
        .every((question) => question.sourceReviewRequired === false),
    ).toBe(true);
    expect(storedBlueprint.lessons[0].authenticDataTaskPlan).toMatchObject({
      payloadSha256: task.payloadSha256,
    });
    expect(assignment.instructions.join(' ')).not.toContain('sha256:');
    expect(assignment.instructions.join(' ')).not.toContain('english-v-adv');
    expect(assignment.instructions.join(' ')).not.toContain('french-v-adv');
    expect(assignment.instructions.join(' ')).toMatch(/diagram the competing structural states/i);
    expect(assignment.instructions.join(' ')).toMatch(/test the same account against the second language record/i);
    expect(rubric.criteria.map((criterion) => criterion.criterion).join(' ')).toMatch(
      /mechanism-explanation using English verb–adverb example, French verb–adverb example/i,
    );
    expect(JSON.stringify(quiz)).toContain(
      'Comparison operands: English verb–adverb example · French verb–adverb example.',
    );
    expect(JSON.stringify(quiz)).toContain('Discriminating feature:');
    expect(JSON.stringify(quiz)).not.toMatch(/“([^”]+)”\s+versus\s+[^“]*“\1”/i);
  });
});
