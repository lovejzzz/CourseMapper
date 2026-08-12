/**
 * v0.14.7 WS-G — sync as a star feature (the deterministic chain).
 *
 * The audit (BEFORE_V0.14.6 §2.9) found four holes in the V1.8-era engine;
 * this file pins their fixes end-to-end with real compiles, no mocks of the
 * compiler:
 *
 *  G1 — a compiler-synced lesson KEEPS its enrichment (the original path
 *       compiled the bare blueprint and silently regressed to mail-merge).
 *  G2 — the blast radius is recompile-and-diff: the syllabus rejoins the
 *       radius (it was excluded from every per-lesson plan), no-op edits
 *       ask for no approval, and undiffable state never reads "unaffected".
 *  G4 — the pending sync plan classes into the review queue with the diff
 *       preview as the item detail.
 *  G5 — patch items match lessons by registry/numeric identity first; the
 *       title-regex tier is last-resort and LOUD.
 */
import { describe, expect, it, vi } from 'vitest';

import {
  buildCompiledLessonPatchData,
  compileBlueprintLessonPatch,
  restoreCompleteEnrichmentOverlay,
  revalidatePersistedLessonContent,
} from '../src/lib/compiledLessonSync.js';
import { computeSyncBlastRadius, diffCompiledFeature } from '../src/lib/syncBlastRadius.js';
import { buildReviewQueue } from '../src/lib/reviewQueueModel.js';
import {
  sanitizeGenomeEnrichmentForLesson,
  sanitizeLessonTitleEchoEnrichment,
} from '../src/lib/lessonSemanticRelevance.js';
import {
  compileBlueprintDeliverables,
  buildCourseBlueprint,
  compactBlueprintForStorage,
} from '../src/lib/courseBlueprintCompiler.js';

const FIXTURE_TERM = 'Isostasy fixture term';

function geologyMap() {
  const topics = ['Minerals', 'Igneous Rocks', 'Sedimentary Rocks', 'Metamorphic Rocks'];
  return {
    courseName: 'Physical Geology',
    semester: 'Fall 2026',
    lessons: topics.map((title, index) => ({
      title: `Lesson ${index + 1}: ${title}`,
      sections: [
        {
          topicSection: `${index + 1}.1: ${title}`,
          learningGoals: `1. Build field-ready understanding of ${title.toLowerCase()}.`,
          learningObjectives: `Analyze ${title.toLowerCase()} using specimen evidence.\nEvaluate identification keys for ${title.toLowerCase()}.`,
          weeklyAssessments: `Quiz: ${title.toLowerCase()} identification`,
          asyncActivities: `Read the assigned chapter on ${title.toLowerCase()}.`,
          syncActivities: `Workshop: ${title.toLowerCase()} case analysis.`,
          supportingResources: `OpenStax geology chapter on ${title.toLowerCase()}`,
        },
      ],
    })),
  };
}

const overlayFor = (lessonNumber) => ({
  lessonContent: {
    [`lesson-${lessonNumber}`]: {
      enrichmentSource: 'lesson-content-enrichment',
      keyTerms: [
        {
          term: FIXTURE_TERM,
          definition: 'Isostasy explains how the lithosphere reaches gravitational balance over the mantle.',
          example: 'A geologist compares crustal thickness before interpreting regional elevation patterns.',
          misconception: 'Students may assume that equal surface height proves equal crustal thickness.',
          correction: 'The correction is to compare density and thickness evidence before drawing that conclusion.',
          source: 'OpenStax fixture §2.1',
        },
      ],
      quizItems: [],
    },
  },
});

describe('G1 — the sync compile keeps its subject matter', () => {
  it('revalidates saved kernels and removes quiz atoms that depend on a newly rejected term', () => {
    const validTerm = overlayFor(2).lessonContent['lesson-2'].keyTerms[0];
    const persisted = {
      'lesson-2': {
        keyTerms: [
          {
            term: 'Realism and Liberalism',
            definition: 'Realism emphasizes power and security under anarchy in international politics.',
            example: 'An analyst interprets a military buildup as a response to insecurity.',
            misconception: 'Students may assume that every international outcome has one cause.',
            correction: 'The correction is to compare the explanation with the available case evidence.',
          },
          validTerm,
        ],
        quizItems: [
          { index: 0, question: 'Which definition describes Realism and Liberalism?' },
          { index: 1, question: `Which claim best applies ${FIXTURE_TERM}?` },
        ],
      },
    };

    const result = revalidatePersistedLessonContent(persisted, geologyMap());

    expect(result.lessonContent['lesson-2'].keyTerms.map((term) => term.term)).toEqual([FIXTURE_TERM]);
    expect(result.lessonContent['lesson-2'].quizItems).toHaveLength(1);
    expect(result.lessonContent['lesson-2'].quizItems[0].index).toBe(1);
    expect(result.receipt).toMatchObject({ rejectedKeyTerms: 1, removedQuizItems: 1 });
  });

  it('reapplies current curricular-role admission to persisted research instead of grandfathering drift', () => {
    const computingDrift = 'Semantic interpretation is an important component in dialog systems.';
    const cited = (displayTitle, claim) => ({
      displayTitle,
      provider: 'wikipedia',
      evidence: claim,
      supportReceipt: {
        checks: [{ claim, quote: claim, semanticSupport: true, quoteInSnapshot: true }],
      },
    });
    const courseMap = {
      courseName: 'Introduction to Language Structure',
      lessons: [
        {
          title: 'Lesson 1: Semantic Interpretation',
          sections: [
            {
              topicSection: 'Lexical Semantics',
              learningObjectives: 'Compare lexical meanings using observable language data.',
            },
          ],
        },
      ],
    };
    const result = revalidatePersistedLessonContent(
      {
        'lesson-1': {
          enrichmentSource: 'algi-researched',
          keyTerms: [{ term: 'Semantic interpretation in dialog systems', definition: computingDrift }],
          quizItems: [],
          slideContent: [],
          kernel: { facts: [computingDrift], provenance: { factCount: 1 } },
          conceptProvenance: {
            source: 'algi-researched',
            citations: [cited('Semantic interpretation', computingDrift)],
          },
        },
      },
      courseMap,
    );

    expect(result.lessonContent).not.toHaveProperty('lesson-1');
    expect(result.receipt.droppedLessonIds).toContain('lesson-1');
    expect(result.receipt.removedFacts).toBe(1);
  });

  it('keeps an authoritative exact ledger when replay has no optional glossary or quiz atoms', () => {
    const facts = [
      'Isostatic equilibrium describes gravitational balance between the lithosphere and asthenosphere.',
      'Crustal thickness and density both affect the elevation predicted by an isostatic model.',
      'A field interpretation must distinguish measured elevation from an inferred subsurface structure.',
    ];
    const result = revalidatePersistedLessonContent(
      {
        'lesson-1': {
          sourceFactAuthority: 'admitted-evidence-authority',
          keyTerms: [],
          quizItems: [],
          kernel: {
            facts,
            provenance: {
              source: 'compiler-owned-exact-source-ledger',
              authority: 'admitted-evidence-authority',
              copiedFactsVerbatim: true,
              factCount: facts.length,
            },
          },
        },
      },
      geologyMap(),
    );

    expect(result.lessonContent['lesson-1']?.kernel?.facts).toEqual(facts);
    expect(result.receipt.droppedLessonIds).not.toContain('lesson-1');
  });

  it('rejects genome terms that match only generic lesson descriptors and resets unattributed atoms', () => {
    const courseMap = {
      courseName: 'World Literature',
      lessons: [
        {
          title: 'Lesson 1: Oral Epic Tradition',
          sections: [
            {
              topicSection: 'Oral Epic Forms',
              learningObjectives: 'Analyze oral transmission using evidence from Gilgamesh.',
              readings: 'Gilgamesh',
              supportingResources:
                'Shakespeare staging source and a close-reading title exercise imported by an older genome linker.',
            },
          ],
        },
      ],
    };
    const result = revalidatePersistedLessonContent(
      {
        'lesson-1': {
          enrichmentSource: 'genome-linked',
          keyTerms: [
            {
              term: 'Directorial reading of a play',
              definition:
                'A directorial reading interprets a dramatic text through staging choices and performance constraints.',
              example: 'A director decides how an actor should cross the stage during a disputed line.',
              misconception: 'Students may assume that Shakespeare supplies every required stage direction.',
              correction:
                'The director must infer staging from the dramatic evidence rather than inventing textual directions.',
              source: 'Shakespeare staging source',
            },
          ],
          quizItems: [{ index: 0, question: 'Which Shakespeare staging choice is best supported?' }],
          slideContent: [{ title: 'Reading Shakespeare as a director', bullets: ['Infer a stage direction.'] }],
          kernel: { facts: ['Shakespeare does not supply every stage direction.'], scenario: { title: 'Rehearsal' } },
          conceptProvenance: {
            source: 'genome-linked',
            conceptIds: ['lit/reading-shakespeare-as-director'],
            competencies: [{ term: 'Directorial reading of a play', bloom: 'Apply', standards: [] }],
            citations: ['Shakespeare staging source'],
          },
        },
      },
      courseMap,
    );

    expect(result.lessonContent).not.toHaveProperty('lesson-1');
    expect(result.receipt).toMatchObject({
      rejectedGenomeTerms: 1,
      semanticAtomResets: 1,
      removedQuizItems: 1,
      removedSlides: 1,
      removedFacts: 1,
    });
  });

  it('keeps a source-anchored genome kernel when the lesson matches a curated exact alias', () => {
    const courseMap = {
      courseName: 'Introduction to Psychology',
      lessons: [
        {
          title: 'Lesson 1: Functional fixedness and mental set',
          sections: [
            {
              topicSection: 'functional fixedness; mental set',
              learningObjectives: 'Apply functional fixedness and mental set to a problem-solving example.',
            },
          ],
        },
      ],
    };
    const result = sanitizeGenomeEnrichmentForLesson(courseMap.lessons[0], {
      enrichmentSource: 'genome-linked',
      keyTerms: [
        {
          term: 'Problem-solving strategies',
          definition: 'Algorithms and heuristics are two families of problem-solving strategy.',
          source: 'OpenStax Psychology 2e §7.3',
        },
      ],
      quizItems: [],
      kernel: {
        facts: [
          'A mental set persists with an approach that worked before but is not working now.',
          'Functional fixedness limits an object to its conventional use.',
        ],
      },
      conceptProvenance: {
        source: 'genome-linked',
        conceptIds: ['psych/problem-solving-strategies'],
        competencies: [
          {
            term: 'Problem-solving strategies',
            aliases: ['algorithms and heuristics', 'mental set', 'functional fixedness'],
            bloom: 'Apply',
            standards: [],
          },
        ],
        citations: ['OpenStax Psychology 2e §7.3'],
        fullyAnchored: true,
      },
    });

    expect(result.enrichment.kernel.facts).toHaveLength(2);
    expect(result.enrichment.conceptProvenance.competencies[0].aliases).toContain('functional fixedness');
    expect(result.receipt).toMatchObject({ rejectedGenomeTerms: [], resetAuthoredAtoms: false });
  });

  it('rejects legacy concept contamination without letting generated objectives self-authorize it', () => {
    const samplingClaim = 'A sampling frame lists the units eligible for selection.';
    const pValueClaim = 'A p-value is computed under a null hypothesis.';
    const citation = (id, label, claim) => ({
      id: `source-${id}`,
      conceptLinks: [{ id, label }],
      supportReceipt: { checks: [{ claim }] },
    });
    const result = sanitizeGenomeEnrichmentForLesson(
      {
        title: 'Lesson 7: Producing Data: Sampling',
        keyConcepts: ['Producing Data: Sampling', 'Principles of Sampling Techniques'],
        semanticIdentityTerms: [
          'Producing Data: Sampling',
          'Explain p-value using the available course evidence.',
          'Apply p-value in one practical example from Producing Data: Sampling and justify one revision.',
        ],
        outcomes: ['Explain p-value using the available course evidence.'],
      },
      {
        enrichmentSource: 'genome-linked',
        kernel: {
          facts: [samplingClaim, pValueClaim],
          provenance: {
            source: 'compiler-owned-exact-source-ledger',
            copiedFactsVerbatim: true,
            factCount: 2,
            authority: 'shipped-source-library',
          },
        },
        conceptProvenance: {
          source: 'genome-linked',
          conceptIds: ['stats/sampling-distribution', 'stats/p-value'],
          citations: [
            citation('stats/sampling-distribution', 'Sampling distribution', samplingClaim),
            citation('stats/p-value', 'p-value', pValueClaim),
          ],
        },
      },
    );

    expect(result.receipt).toMatchObject({
      rejectedGenomeTerms: ['Sampling distribution', 'p-value'],
      rejectedConceptIds: ['stats/sampling-distribution', 'stats/p-value'],
      removedFacts: 2,
      resetAuthoredAtoms: true,
    });
    expect(result.enrichment.conceptProvenance.conceptIds).toEqual([]);
    expect(result.enrichment.conceptProvenance.citations).toHaveLength(0);
    expect(result.enrichment.kernel.facts).toEqual([]);
    expect(result.enrichment.kernel.provenance.factCount).toBe(0);
    expect(result.enrichment.semanticAdmission.rejectedSourceLocators).toEqual(
      expect.arrayContaining(['source-stats/p-value']),
    );
  });

  it('keeps a source-anchored title-shaped term but rejects an unverified title echo', () => {
    const lesson = {
      title: 'Lesson 8: Telescope light-gathering power and aperture',
      sections: [{ topicSection: 'Telescope light-gathering power and aperture' }],
    };
    const result = sanitizeLessonTitleEchoEnrichment(lesson, {
      keyTerms: [
        {
          term: 'Telescope light-gathering power',
          definition: 'Collecting power grows with the area of the aperture rather than its diameter.',
          source: 'OpenStax Astronomy 2e §6.1',
          tier: 2,
        },
        {
          term: 'Telescope light-gathering power and aperture',
          definition: 'A generated restatement of the lesson title.',
          source: 'fact-ledger-projection',
          tier: 1,
        },
      ],
      quizItems: [],
      kernel: { facts: ['Aperture area determines light-gathering power.'] },
    });

    expect(result.enrichment.keyTerms.map((term) => term.term)).toEqual(['Telescope light-gathering power']);
    expect(result.receipt.rejectedTitleTerms).toEqual(['Telescope light-gathering power and aperture']);
  });

  it('projects a source-anchored title fragment as subject knowledge in the study guide', () => {
    const courseMap = {
      courseName: 'Introduction to Astronomy',
      lessons: [
        {
          title: 'Lesson 8: Telescope light-gathering power and aperture',
          sections: [
            {
              topicSection: 'Telescope light-gathering power and aperture',
              learningObjectives: 'Analyze telescope aperture and name one limitation.',
            },
          ],
        },
      ],
    };
    const blueprint = buildCourseBlueprint(courseMap, {
      enrichment: {
        source: 'test-enrichment',
        lessonContent: {
          'lesson-1': {
            keyTerms: [
              {
                term: 'Telescope light-gathering power',
                definition: 'Collecting power grows with the area of the aperture rather than its diameter.',
                example: 'A four-meter mirror collects sixteen times as much light as a one-meter mirror.',
                source: 'OpenStax Astronomy 2e §6.1',
                tier: 2,
              },
            ],
            kernel: { facts: ['Aperture area determines light-gathering power.'] },
          },
        },
      },
    });

    const guide = compileBlueprintDeliverables(blueprint, ['studyGuides'], { skipLanguageFinalizer: true }).studyGuides
      .studyGuides[0];
    expect(guide.keyTerms).toContainEqual(
      expect.objectContaining({
        term: 'Telescope light-gathering power',
        definition: 'Collecting power grows with the area of the aperture rather than its diameter.',
      }),
    );
    expect(JSON.stringify(guide)).not.toContain('names the evidence focus');
  });

  it('reuses a complete restored overlay without another model pass', () => {
    const courseMap = geologyMap();
    const fullOverlay = {
      quality: { source: 'native-pass-b' },
      stageDecisions: { genomeLinker: 'ran', modelStage: 'ran' },
      lessonContent: Object.fromEntries(
        courseMap.lessons.map((_, index) => [
          `lesson-${index + 1}`,
          overlayFor(index + 1).lessonContent[`lesson-${index + 1}`],
        ]),
      ),
    };

    const restored = restoreCompleteEnrichmentOverlay(fullOverlay, courseMap);

    expect(restored.enrichedLessonIds).toEqual(['lesson-1', 'lesson-2', 'lesson-3', 'lesson-4']);
    expect(restored.enrichment).toMatchObject({
      quality: { source: 'native-pass-b' },
      coverage: { requestedLessons: 4, enrichedLessons: 4, missingLessons: [] },
      stageDecisions: { genomeLinker: 'ran', modelStage: 'restored' },
    });
  });

  it('refuses a partial restored overlay so the missing lesson can be refreshed', () => {
    expect(restoreCompleteEnrichmentOverlay(overlayFor(2), geologyMap())).toBeNull();
  });

  it('drops saved lesson payloads that no longer exist in the course map', () => {
    const result = revalidatePersistedLessonContent(
      {
        ...overlayFor(2).lessonContent,
        'lesson-99': overlayFor(2).lessonContent['lesson-2'],
      },
      geologyMap(),
    );

    expect(result.lessonContent).not.toHaveProperty('lesson-99');
    expect(result.receipt.droppedLessonIds).toContain('lesson-99');
  });

  it('with the stored overlay, the synced lesson compiles enriched and carries the kernel term', () => {
    const result = compileBlueprintLessonPatch({
      featureId: 'studyGuides',
      courseMap: geologyMap(),
      lessonIndex: 1,
      config: {},
      enrichmentOverlay: overlayFor(2),
    });
    expect(result).toBeTruthy();
    expect(result.lessonEnriched).toBe(true);
    expect(result.enrichedLessonCount).toBe(1);
    expect(result.enrichedLessonIds).toEqual(['lesson-2']);
    expect(JSON.stringify(result.data)).toContain(FIXTURE_TERM);
  });

  it('the fingerprint-keyed cache is the second tier (reload survival)', () => {
    const lessons = geologyMap().lessons;
    const cache = {
      get: (lesson) =>
        lesson === undefined ? null : lesson.title.includes('Igneous') ? overlayFor(2).lessonContent['lesson-2'] : null,
    };
    const result = compileBlueprintLessonPatch({
      featureId: 'studyGuides',
      courseMap: { ...geologyMap(), lessons },
      lessonIndex: 1,
      config: {},
      enrichmentOverlay: null,
      kernelCache: cache,
    });
    expect(result.lessonEnriched).toBe(true);
    expect(JSON.stringify(result.data)).toContain(FIXTURE_TERM);
  });

  it('no overlay, no cache → lessonEnriched false (the loud-gate signal, never silent)', () => {
    const result = compileBlueprintLessonPatch({
      featureId: 'studyGuides',
      courseMap: geologyMap(),
      lessonIndex: 1,
      config: {},
    });
    expect(result).toBeTruthy();
    expect(result.lessonEnriched).toBe(false);
    expect(JSON.stringify(result.data)).not.toContain(FIXTURE_TERM);
  });
});

describe('G2 — recompile-and-diff blast radius', () => {
  const FEATURES = ['syllabus', 'assignments', 'rubrics', 'quizBank', 'studyGuides'];
  function compiledStateFor(courseMap) {
    const blueprint = compactBlueprintForStorage(buildCourseBlueprint(courseMap, {}));
    const compiled = compileBlueprintDeliverables(blueprint, FEATURES, { configMap: {} });
    return Object.fromEntries(FEATURES.map((featureId) => [featureId, { status: 'done', data: compiled[featureId] }]));
  }

  it('an assessment retitle reaches the SYLLABUS grading table — the hole syncDependencies.js:226 left open', () => {
    const deliverables = compiledStateFor(geologyMap());
    const edited = geologyMap();
    edited.lessons[1].sections[0].weeklyAssessments = 'Quiz: igneous rocks identification mastery';
    const radius = computeSyncBlastRadius({
      courseMap: edited,
      deliverables,
      selectedFeatures: ['courseMap', ...FEATURES],
    });
    const planFeatures = radius.plan.map((entry) => entry.featureId);
    expect(planFeatures).toContain('syllabus');
    const syllabusEntry = radius.plan.find((entry) => entry.featureId === 'syllabus');
    expect(JSON.stringify(syllabusEntry.changes)).toMatch(/grading table|Syllabus/i);
    // The quiz itself changed too — and the radius names the lesson.
    expect(planFeatures).toContain('quizBank');
  });

  it('a no-op "edit" asks for NO approval (zero diffs, empty plan)', () => {
    const deliverables = compiledStateFor(geologyMap());
    const radius = computeSyncBlastRadius({
      courseMap: geologyMap(),
      deliverables,
      selectedFeatures: ['courseMap', ...FEATURES],
    });
    expect(radius.totalChanges).toBe(0);
    expect(radius.plan).toEqual([]);
    expect(radius.undiffableFeatures).toEqual([]);
  });

  it('done features WITHOUT data are undiffable — unprovable, never "unaffected"', () => {
    const radius = computeSyncBlastRadius({
      courseMap: geologyMap(),
      deliverables: { syllabus: { status: 'done' } },
      selectedFeatures: ['courseMap', 'syllabus'],
    });
    expect(radius.plan).toEqual([]);
    expect(radius.undiffableFeatures).toEqual(['syllabus']);
  });

  it('diffCompiledFeature names registry entities in summaries (the approval preview)', () => {
    const prev = {
      assignments: [{ assessmentId: 'A2.1', title: 'Quiz: igneous rocks identification', lessonNumber: 2, body: 'a' }],
    };
    const next = {
      assignments: [{ assessmentId: 'A2.1', title: 'Quiz: igneous rocks identification', lessonNumber: 2, body: 'b' }],
    };
    const changes = diffCompiledFeature('assignments', prev, next);
    expect(changes).toHaveLength(1);
    expect(changes[0].summary).toContain('A2.1');
    expect(changes[0].lessonNumber).toBe(2);
  });

  it('diffs only the canonical rendered collection when a stale alias changes', () => {
    const canonical = [{ lessonNumber: 1, lessonTitle: 'Canonical plan', body: 'unchanged' }];
    const prev = { lessonPlans: canonical, plans: [{ lessonNumber: 1, body: 'old stale text' }] };
    const next = { lessonPlans: canonical, plans: [{ lessonNumber: 1, body: 'new stale text' }] };

    expect(diffCompiledFeature('lessonPlans', prev, next)).toEqual([]);
  });
});

describe('G4 — the sync plan classes into the review queue with its diff preview', () => {
  it('one queue item per affected deliverable, preview summaries as detail, sync class leads', () => {
    const queue = buildReviewQueue({
      syncSuggestion: {
        id: 'sync_test_1',
        plan: [
          {
            featureId: 'syllabus',
            lessonIndices: null,
            changes: [{ change: 'updated', lessonNumber: null, summary: 'Syllabus grading table: Midterm updated' }],
          },
          {
            featureId: 'rubrics',
            lessonIndices: [1],
            changes: [{ change: 'updated', lessonNumber: 2, summary: 'Rubric: A2.1 updated' }],
          },
        ],
        changedFieldsSummary: 'weekly assessments',
      },
    });
    expect(queue.counts.sync).toBe(2);
    expect(queue.total).toBe(2);
    const [syllabusItem, rubricItem] = queue.classes.sync;
    expect(syllabusItem.title).toContain('full document');
    expect(syllabusItem.detail).toContain('grading table');
    expect(rubricItem.title).toContain('lesson 2');
    expect(rubricItem.detail).toContain('A2.1');
    expect(rubricItem.target).toEqual({ featureId: 'rubrics' });
  });
});

describe('G5 — identity-tier matching in the lesson patch builder', () => {
  it('registry ids decide membership regardless of title text', () => {
    const compiledData = {
      assignments: [
        { assessmentId: 'A2.1', title: 'Totally unrelated words here' },
        { assessmentId: 'A3.1', title: 'Lesson 2 lookalike title' }, // id says lesson 3 — id WINS
      ],
    };
    const patch = buildCompiledLessonPatchData('assignments', compiledData, geologyMap(), 1);
    expect(patch.assignments).toHaveLength(1);
    expect(patch.assignments[0].assessmentId).toBe('A2.1');
  });

  it('the text tier still works for legacy items — and is LOUD', () => {
    const onTextTierMatch = vi.fn();
    const compiledData = { assignments: [{ title: 'Lesson 2: Igneous Rocks worksheet' }] };
    const patch = buildCompiledLessonPatchData('assignments', compiledData, geologyMap(), 1, { onTextTierMatch });
    expect(patch.assignments).toHaveLength(1);
    expect(onTextTierMatch).toHaveBeenCalledTimes(1);
  });
});
