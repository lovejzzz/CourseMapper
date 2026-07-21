import { describe, expect, it } from 'vitest';
import { deriveCourseGraphFromCourseMap } from '../courseGraph/deriveFromCourseMap.js';
import { renderCourseMapFromGraph } from '../courseGraph/renderCourseMap.js';
import {
  completeNativeKernelSurfaces,
  matchEntityIds,
  partitionCumulativeAssessmentLessons,
  preserveSourceProof,
  projectCumulativeAssessmentKernels,
  repairCourseGraphResourceIds,
  restoreCourseGraphForProject,
} from '../nativeGraphAuthoring.js';
import { assessProjectedKernelCoverage } from '../blueprintEnrichmentPass.js';
import { validateCourseGraph } from '../courseGraph/schema.js';
import { findWorstPhraseRepetition } from '../exportRenderedTextAudit.js';
import { normalizeFactLedgerFeedback } from '../factLedgerFeedback.js';

function sourceBackedMap() {
  return {
    courseName: 'AI Governance',
    lessons: [
      {
        title: 'Lesson 1: Model documentation',
        sections: [
          {
            topicSection: '1.1: Model cards',
            learningObjectives: 'Explain model documentation evidence.',
            weeklyAssessments: 'Exit ticket using model documentation.',
            supportingResources: 'Instructor placeholder',
          },
        ],
      },
    ],
  };
}

describe('nativeGraphAuthoring matchEntityIds', () => {
  it('preserves verified resource metadata when the display map is re-derived', () => {
    const oldGraph = deriveCourseGraphFromCourseMap(sourceBackedMap());
    const session = oldGraph.sessions[0];
    const section = session.sections[0];
    const citation =
      'Mitchell et al. (2019). Model Cards for Model Reporting. OpenAlex: https://openalex.org/W123 (open access)';
    oldGraph.resources.push({
      id: 'kr1',
      citation,
      kind: 'peer-reviewed reading',
      sessionRefs: [session.id],
      origin: 'openalex',
      url: 'https://openalex.org/W123',
      license: 'open access',
      attribution: 'OpenAlex (CC0 metadata)',
    });
    section.resourceRefs = ['kr1'];
    oldGraph.authoredBy = 'native';

    const rederived = deriveCourseGraphFromCourseMap(
      renderCourseMapFromGraph(oldGraph, { assessmentReferences: true }),
    );
    const matched = matchEntityIds(oldGraph, rederived);

    expect(matched.resources).toHaveLength(1);
    expect(matched.resources.find((resource) => resource.id === 'kr1')).toMatchObject({
      origin: 'openalex',
      url: 'https://openalex.org/W123',
      license: 'open access',
    });
    expect(matched.sessions[0].sections[0].resourceRefs).toContain('kr1');
  });

  it('preserves unmatched source-backed resources when a later map repair drops the rendered citation', () => {
    const oldGraph = deriveCourseGraphFromCourseMap(sourceBackedMap());
    const session = oldGraph.sessions[0];
    const section = session.sections[0];
    oldGraph.resources.push({
      id: 'sf1',
      citation: 'OpenAlex (2024). Governance of genetics data. OpenAlex: https://openalex.org/W999 (open access)',
      kind: 'source',
      sessionRefs: [session.id],
      origin: 'source-finder',
      provider: 'openalex',
      url: 'https://openalex.org/W999',
      license: 'open access',
      attribution: 'OpenAlex (CC0 metadata)',
    });
    section.resourceRefs = ['sf1'];
    oldGraph.authoredBy = 'native';

    const repairedMap = renderCourseMapFromGraph(oldGraph, { assessmentReferences: true });
    repairedMap.lessons[0].sections[0].supportingResources = 'Instructor worksheet for model documentation.';
    const rederived = deriveCourseGraphFromCourseMap(repairedMap);
    const matched = matchEntityIds(oldGraph, rederived);

    expect(matched.resources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'sf1',
          origin: 'source-finder',
          provider: 'openalex',
          url: 'https://openalex.org/W999',
        }),
      ]),
    );
    expect(matched.resources).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ citation: 'Instructor placeholder' })]),
    );
    expect(matched.sessions[0].sections[0].resourceRefs).toContain('sf1');
  });

  it('preserves source-finder proof for prose graph re-derivations after map repairs', () => {
    const oldGraph = deriveCourseGraphFromCourseMap(sourceBackedMap());
    const session = oldGraph.sessions[0];
    const section = session.sections[0];
    oldGraph.sourceFinderMiniShard = {
      version: 'source-finder-v2',
      topics: [
        {
          sessionId: session.id,
          lessonNumber: 1,
          topic: 'Model documentation',
          conceptRefs: ['c1'],
          sources: [
            {
              id: 'https://openalex.org/W999',
              provider: 'openalex',
              title: 'Governance of model documentation',
              url: 'https://openalex.org/W999',
              license: 'cc-by',
            },
          ],
        },
      ],
    };
    oldGraph.resources.push({
      id: 'sf1',
      citation: 'OpenAlex (2024). Governance of model documentation. OpenAlex: https://openalex.org/W999 (cc-by)',
      kind: 'source',
      sessionRefs: [session.id],
      origin: 'source-finder',
      provider: 'openalex',
      url: 'https://openalex.org/W999',
      license: 'cc-by',
      attribution: 'OpenAlex (CC0 metadata)',
    });
    section.resourceRefs = ['sf1'];

    const repairedMap = renderCourseMapFromGraph(oldGraph, { assessmentReferences: true });
    repairedMap.lessons[0].sections[0].supportingResources = 'Instructor worksheet for model documentation.';
    const rederived = deriveCourseGraphFromCourseMap(repairedMap);
    const preserved = preserveSourceProof(oldGraph, rederived);

    expect(preserved.resources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'sf1',
          origin: 'source-finder',
          provider: 'openalex',
          url: 'https://openalex.org/W999',
          license: 'cc-by',
        }),
      ]),
    );
    expect(preserved.sourceFinderMiniShard).toEqual(oldGraph.sourceFinderMiniShard);
    expect(preserved.sessions[0].sections[0].resourceRefs).toContain('sf1');
  });

  it('keeps resource ids unique when a preserved id collides with a newly derived resource', () => {
    const oldGraph = deriveCourseGraphFromCourseMap(sourceBackedMap());
    oldGraph.resources[0].id = 'r4';
    oldGraph.resources[0].origin = 'source-finder';
    oldGraph.sessions[0].sections[0].resourceRefs = ['r4'];

    const expandedMap = sourceBackedMap();
    expandedMap.lessons[0].sections[0].supportingResources = [
      'Instructor placeholder',
      'New resource B',
      'New resource C',
      'New resource D',
    ].join('; ');
    const rederived = deriveCourseGraphFromCourseMap(expandedMap);
    const preserved = preserveSourceProof(oldGraph, rederived);

    expect(new Set(preserved.resources.map((resource) => resource.id)).size).toBe(4);
    expect(preserved.resources.find((resource) => resource.citation === 'Instructor placeholder')).toMatchObject({
      id: 'r4',
      origin: 'source-finder',
    });
    expect(preserved.resources.find((resource) => resource.citation === 'New resource D')?.id).not.toBe('r4');
    expect(validateCourseGraph(preserved)).toMatchObject({ valid: true, issues: [] });
  });

  it('repairs duplicate resource ids in an existing saved graph without dropping lesson links', () => {
    const graph = deriveCourseGraphFromCourseMap({
      courseName: 'Mandarin Foundations',
      lessons: [
        {
          title: 'Lesson 1',
          sections: [{ topicSection: 'Pinyin', supportingResources: 'Pinyin guide' }],
        },
        {
          title: 'Lesson 2',
          sections: [{ topicSection: 'Greetings', supportingResources: 'Greetings guide' }],
        },
      ],
    });
    graph.resources[1].id = graph.resources[0].id;
    graph.sessions[1].sections[0].resourceRefs = [graph.resources[0].id];

    expect(validateCourseGraph(graph).valid).toBe(false);
    const repaired = repairCourseGraphResourceIds(graph);

    expect(validateCourseGraph(repaired)).toMatchObject({ valid: true, issues: [] });
    expect(repaired.resources.map((resource) => resource.id)).toEqual(['r1', 'r1-preserved']);
    expect(repaired.sessions[0].sections[0].resourceRefs).toEqual(['r1']);
    expect(repaired.sessions[1].sections[0].resourceRefs).toEqual(['r1-preserved']);
    expect(graph.resources.map((resource) => resource.id)).toEqual(['r1', 'r1']);
  });

  it('restores a repaired enriched graph instead of deriving a content-thin fallback', () => {
    const graph = deriveCourseGraphFromCourseMap(sourceBackedMap());
    graph.enrichmentOverlay = { lessonContent: { 'lesson-1': { kernel: { facts: ['Verified fact.'] } } } };
    graph.resources.push({ ...graph.resources[0] });

    const restored = restoreCourseGraphForProject({ courseGraph: graph, courseMap: sourceBackedMap() });

    expect(validateCourseGraph(restored).valid).toBe(true);
    expect(restored.enrichmentOverlay).toEqual(graph.enrichmentOverlay);
  });
});

describe('completeNativeKernelSurfaces', () => {
  it('completes a sentence-completion MC stem before projecting it as a key-term example', () => {
    const completed = completeNativeKernelSurfaces(
      {
        keyTerms: [],
        quizItems: [
          {
            index: 0,
            type: 'multiple_choice',
            question: 'A strong close reading connects a textual detail to',
            options: [
              'an interpretive claim about the whole work',
              'the total number of words on the page',
              "the author's documented daily writing schedule",
              'a rule that every metaphor must mean the same thing',
            ],
            answerIndex: 0,
            explanation:
              'A close reading earns an interpretive claim by showing how specific passages support it, rather than cataloguing details for their own sake.',
          },
        ],
        kernel: {
          facts: [
            'Close reading connects textual detail to a bounded interpretive claim.',
            'Specific passages provide the evidence for that claim.',
            'A defensible reading distinguishes interpretation from a catalogue of details.',
          ],
          scenario: {
            setup: 'A reader compares two passages before deciding which interpretation the evidence supports.',
            materials: 'two assigned passages',
          },
        },
      },
      {
        title: 'Lesson 2: Oral Epic Tradition',
        lessonNumber: 2,
        sections: [{ topicSection: 'Oral Epic Forms' }],
      },
    );

    expect(completed.keyTerms).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          term: 'interpretive claim about the whole work',
          example: 'A strong close reading connects a textual detail to an interpretive claim about the whole work',
          source: 'verified-quiz-projection',
        }),
      ]),
    );
  });

  it('keeps fact-ledger misconception feedback lesson-specific across a full course', () => {
    const paragraphs = Array.from({ length: 15 }, (_, index) => {
      const lessonNumber = index + 1;
      const title = `Genetics topic ${lessonNumber}`;
      const completed = completeNativeKernelSurfaces(
        {
          keyTerms: [],
          quizItems: [],
          kernel: {
            facts: [
              `${title} fact one names an inspectable biological relationship.`,
              `${title} fact two distinguishes the closest competing explanation.`,
              `${title} fact three limits the conclusion to the supplied evidence.`,
            ],
            scenario: {
              setup: `Learners compare the three supplied claims about ${title} before choosing a conclusion.`,
              materials: `${title} evidence packet`,
            },
          },
        },
        {
          lessonNumber,
          title: `Lesson ${lessonNumber}: ${title}`,
          sections: [{ topicSection: title }],
        },
      );
      const recovered = completed.keyTerms.find((term) => term.source === 'fact-ledger-projection');
      return `${recovered.misconception} ${recovered.correction}`;
    });

    const repetition = findWorstPhraseRepetition(paragraphs);
    expect(repetition.count, `repeated phrase: ${repetition.shingle}`).toBeLessThan(repetition.limit);
    expect(new Set(paragraphs).size).toBe(15);
  });

  it('does not project true but wrong-lesson padding facts into learner surfaces', () => {
    const completed = completeNativeKernelSurfaces(
      {
        keyTerms: [],
        quizItems: [],
        kernel: {
          facts: [
            'Model-organism labs apply genetic principles to observations of living systems.',
            'Data collection in a model-organism study requires precise measurement of observable traits.',
            'Mendelian ratios describe segregation in a single-gene cross.',
            'A DNA double helix contains deoxyribose sugars and nitrogenous bases.',
            'Genome editing uses molecular tools to alter genetic material.',
          ],
        },
      },
      {
        lessonNumber: 14,
        title: 'Lesson 14: Model-organism lab',
        sections: [{ topicSection: '14.1: Lab procedures' }, { topicSection: '14.2: Data collection' }],
      },
    );

    const projected = JSON.stringify({
      slides: completed.slideContent,
      quizItems: completed.quizItems,
      scenario: completed.kernel.scenario,
    });
    expect(projected).toContain('Model-organism');
    expect(projected).toContain('Data collection');
    expect(projected).not.toContain('Mendelian ratios');
    expect(projected).not.toContain('DNA double helix');
    expect(projected).not.toContain('Genome editing');
  });

  it('upgrades persisted legacy fact-ledger feedback without changing authored terms', () => {
    const authored = {
      term: 'Allele frequency',
      misconception: 'Instructor-authored misconception.',
      correction: 'Instructor-authored correction.',
      source: 'lesson-content-enrichment',
    };
    const legacy = {
      term: 'Hardy-Weinberg equilibrium',
      misconception: 'The first supplied claim alone settles every question about Hardy-Weinberg equilibrium.',
      correction: 'Use all supplied claims to state a bounded conclusion and identify what they do not establish.',
      source: 'fact-ledger-projection',
    };
    const legacyMaterials = 'Hardy-Weinberg equilibrium examples and the named reading or activity';

    const normalized = normalizeFactLedgerFeedback(
      { lessonNumber: 7, title: 'Lesson 7: Population genetics' },
      {
        keyTerms: [authored, legacy],
        discussionPrompt: {
          prompt: `Which interpretation is best supported by ${legacyMaterials}?`,
        },
        assignmentBrief: {
          task: `Analyze ${legacyMaterials} and state one limitation.`,
        },
      },
    );

    expect(normalized.keyTerms[0]).toBe(authored);
    expect(normalized.keyTerms[1]).not.toBe(legacy);
    expect(normalized.keyTerms[1].misconception).toContain('Population genetics');
    expect(normalized.keyTerms[1].misconception).not.toContain('first supplied claim alone');
    expect(JSON.stringify(normalized)).not.toContain(legacyMaterials);
    expect(normalized.discussionPrompt.prompt).toContain('examples and source material for Population genetics');
    expect(normalized.assignmentBrief.task).toContain('examples and source material for Population genetics');
  });
});

describe('cumulative assessment kernel projection', () => {
  const lessonTitles = [
    'Mendelian inheritance',
    'Meiosis',
    'Linkage and gene mapping',
    'DNA structure',
    'Gene expression',
    'Mutation',
    'Population genetics',
    'Epigenetics',
    'Modern genetic technologies',
    'Midterm 1',
    'Midterm 2',
    'Final Exam',
    'Problem Sets',
    'Model-organism lab',
    'Final Assessment',
  ];
  const lessons = lessonTitles.map((title, index) => ({
    title: `Lesson ${index + 1}: ${title}`,
    lessonNumber: index + 1,
    sections: [{ topicSection: title, weeklyAssessments: `${title} evidence check` }],
  }));

  function admittedSubjectKernel(index) {
    return completeNativeKernelSurfaces(
      {
        enrichmentSource: 'scion-model',
        kernel: {
          facts: [
            `Lesson ${index + 1} fact A is bounded by the supplied course evidence and named example.`,
            `Lesson ${index + 1} fact B connects the observed pattern to one defensible conclusion.`,
            `Lesson ${index + 1} fact C identifies the limit that keeps the conclusion from overreaching.`,
          ],
          scenario: {
            setup: `Students inspect the Lesson ${index + 1} worked example before choosing a conclusion.`,
            materials: `Lesson ${index + 1} notes and worked example`,
          },
        },
        keyTerms: [
          {
            term: lessonTitles[index],
            definition: `This is the course-bounded definition for ${lessonTitles[index]} established in Lesson ${index + 1}.`,
            example: `The Lesson ${index + 1} worked example applies ${lessonTitles[index]} to the supplied evidence.`,
            misconception: `A common error treats every example of ${lessonTitles[index]} as supporting the same conclusion.`,
            correction: `Check the Lesson ${index + 1} evidence boundary before extending the ${lessonTitles[index]} claim.`,
          },
        ],
      },
      lessons[index],
    );
  }

  it('separates assessment-only sessions from the model-organism lab', () => {
    const partition = partitionCumulativeAssessmentLessons(
      lessons,
      lessons.map((_, index) => index),
    );
    expect(partition.cumulativeAssessmentLessonIndices).toEqual([9, 10, 11, 12, 14]);
    expect(partition.subjectLessonIndices).toContain(13);
  });

  it('reuses admitted subject facts verbatim and produces usable assessment kernels without touching the lab', () => {
    const lessonContent = {};
    for (let index = 0; index < 9; index += 1) {
      lessonContent[`lesson-${index + 1}`] = admittedSubjectKernel(index);
      expect(assessProjectedKernelCoverage(lessonContent[`lesson-${index + 1}`]).usable).toBe(true);
    }
    const sourceFactSet = new Set(Object.values(lessonContent).flatMap((payload) => payload.kernel.facts));

    const result = projectCumulativeAssessmentKernels({
      lessonContent,
      courseMapLessons: lessons,
      lessonIndices: [9, 10, 11, 12, 13, 14],
    });

    expect(result.projectedLessonIndices).toEqual([9, 10, 11, 12, 14]);
    expect(lessonContent['lesson-14']).toBeUndefined();
    for (const lessonIndex of result.projectedLessonIndices) {
      const payload = lessonContent[`lesson-${lessonIndex + 1}`];
      expect(payload).toMatchObject({
        enrichmentSource: 'cumulative-review-projection',
        projectionKind: 'cumulative-assessment',
      });
      expect(assessProjectedKernelCoverage(payload).usable).toBe(true);
      expect(payload.kernel.facts.every((fact) => sourceFactSet.has(fact))).toBe(true);
      expect(payload.sourceLessonIds.every((lessonId) => Number(lessonId.replace('lesson-', '')) <= 9)).toBe(true);
    }
  });
});
