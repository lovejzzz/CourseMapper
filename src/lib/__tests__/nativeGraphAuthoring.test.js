import { describe, expect, it } from 'vitest';
import { deriveCourseGraphFromCourseMap } from '../courseGraph/deriveFromCourseMap.js';
import { renderCourseMapFromGraph } from '../courseGraph/renderCourseMap.js';
import {
  backfillNativeAuthoringFromLessonContent,
  completeNativeKernelSurfaces,
  matchEntityIds,
  mergeNativePartialOverlays,
  partitionCumulativeAssessmentLessons,
  preserveSourceProof,
  projectCumulativeAssessmentKernels,
  requireNativeAuthorshipForNamedReadings,
  repairCourseGraphResourceIds,
  resolveNativeAssembly,
  restoreCourseGraphForProject,
} from '../nativeGraphAuthoring.js';
import { mergeLessonPayloads } from '../genome/composeLessonFromConcepts.js';
import { assessProjectedKernelCoverage } from '../blueprintEnrichmentPass.js';
import { validateCourseGraph } from '../courseGraph/schema.js';
import { findWorstPhraseRepetition } from '../exportRenderedTextAudit.js';
import { normalizeFactLedgerFeedback } from '../factLedgerFeedback.js';
import { assessTargetLanguagePresence } from '../languageIdentityGuard.js';
import { repairCourseMapReadiness } from '../deliverableReadiness.js';

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

describe('source-grounded native authoring backfill', () => {
  const skeleton = {
    sessions: [{ id: 's1', order: 1, title: 'Accessible forms', sectionTitles: ['Accessible forms'] }],
  };
  const anchoredKernel = {
    conceptProvenance: { source: 'algi-researched', fullyAnchored: true },
    keyTerms: [
      { term: 'Accessible forms', definition: 'Accessible forms expose instructions and controls to users.' },
      { term: 'Labels', definition: 'Labels identify the purpose of a form control.' },
      { term: 'Validation', definition: 'Validation identifies an error and explains how to correct it.' },
    ],
    kernel: {
      facts: [
        'Labels identify the purpose of a form control.',
        'Instructions explain expected input before a user submits a form.',
        'Validation identifies an error and explains how to correct it.',
      ],
    },
  };

  it('projects distinct glossary anchors from admitted fact subjects when the model returns one term', () => {
    const facts = [
      'Pandas data structures provide efficient methods for manipulating large structured datasets in Python.',
      'Public dataset acquisition involves accessing information from governmental repositories.',
      'Vectorized operations enable fast computation across an entire data column.',
      'Public datasets require inspection for bias and data limitations.',
      'Reproducible notebooks record the sequence of data transformations.',
    ];
    const completed = completeNativeKernelSurfaces(
      {
        keyTerms: [
          {
            term: 'Pandas data structures',
            definition: facts[0],
            example: facts[2],
            misconception: 'Loading a public file makes its conclusions unbiased.',
            correction: facts[3],
          },
        ],
        kernel: { facts },
      },
      {
        title: 'Lesson 1: Python and pandas for public datasets',
        sections: [{ topicSection: 'Pandas and public datasets', weeklyAssessments: 'Policy data memo' }],
      },
    );

    expect(completed.keyTerms.length).toBeGreaterThanOrEqual(3);
    expect(completed.keyTerms.map((term) => term.term)).toEqual(
      expect.arrayContaining(['Pandas data structures', 'Public dataset acquisition', 'Vectorized operations']),
    );
    expect(completed.keyTerms.every((term) => facts.includes(term.definition))).toBe(true);
    expect(completed.keyTermFallbacks).toEqual(
      expect.arrayContaining([expect.objectContaining({ source: 'fact-subject-projection' })]),
    );
    expect(JSON.stringify(completed)).not.toContain('can be applied without checking the scope or conditions stated');
    for (const term of completed.keyTerms.filter((entry) => entry.source === 'fact-subject-projection')) {
      expect(term.misconception).not.toContain(term.definition);
      expect(term.correction).not.toContain(term.definition);
      expect(term.correction).toContain(term.term);
    }
  });

  it('preserves a complete seven-word admitted-fact subject instead of cutting a word', () => {
    const longConcept = 'Evidence-based policy memo with limitations and recommendations';
    const facts = [
      `${longConcept} requires a bounded claim and a named evidence limit.`,
      'Policy memo evidence connects a public problem to a feasible recommendation.',
      'Limitations identify what the available evidence cannot establish.',
      'Stakeholder analysis records who benefits and who bears implementation risk.',
    ];
    const completed = completeNativeKernelSurfaces(
      {
        keyTerms: [
          {
            term: 'Policy evidence',
            definition: facts[1],
            example: facts[2],
            misconception: 'A polished memo proves its recommendation.',
            correction: facts[3],
          },
        ],
        kernel: { facts },
      },
      {
        title: `Lesson 5: ${longConcept}`,
        sections: [{ topicSection: longConcept, weeklyAssessments: 'Policy memo' }],
      },
    );

    expect(completed.keyTerms.map((term) => term.term)).toContain(longConcept);
    expect(JSON.stringify(completed)).not.toContain('recommendati"');
    expect(JSON.stringify(completed)).not.toContain('only for the relationship stated in its admitted fact');
  });

  it('builds missing outcomes and activities only from admitted source terms', () => {
    const authored = backfillNativeAuthoringFromLessonContent({
      skeleton,
      lessonContent: { 'lesson-1': anchoredKernel },
    });

    expect(authored['lesson-1']).toMatchObject({
      source: 'scion-source-kernel-backfill',
      outcomes: [
        'Explain Accessible forms using the available course evidence.',
        'Apply Labels to a practical Accessible forms example and justify one revision.',
        'Evaluate a claim about Validation, then state the evidence boundary.',
      ],
    });
    expect(authored['lesson-1'].goal).toContain('Accessible forms and Labels');
    expect(authored['lesson-1'].asyncActivities[0]).toContain('one limitation');
    expect(authored['lesson-1'].syncActivities[0]).toContain('using evidence about Labels');
  });

  it('preserves existing authored fields and refuses thin or unverified kernels', () => {
    const existing = {
      goal: 'Audit a supplied form against its documented requirements.',
      outcomes: ['Repair one label-to-control association.'],
      asyncActivities: ['Annotate the supplied form specification.'],
      syncActivities: ['Run a paired keyboard and error-message audit.'],
    };
    const preserved = backfillNativeAuthoringFromLessonContent({
      skeleton,
      authoredBySession: { 'lesson-1': existing },
      lessonContent: { 'lesson-1': anchoredKernel },
    });
    expect(preserved['lesson-1']).toMatchObject(existing);

    const refused = backfillNativeAuthoringFromLessonContent({
      skeleton,
      lessonContent: {
        'lesson-1': {
          conceptProvenance: { source: 'algi-researched', fullyAnchored: false },
          keyTerms: anchoredKernel.keyTerms.slice(0, 2),
          kernel: { facts: anchoredKernel.kernel.facts.slice(0, 2) },
        },
      },
    });
    expect(refused).toEqual({});
  });

  it('preserves source-grounded authoring through CourseIR projection and graph assembly', () => {
    const completeSkeleton = {
      course: { name: 'Digital Accessibility for Product Teams', term: 'Summer', goals: [] },
      sessions: skeleton.sessions,
      assessments: [
        {
          id: 'a1',
          title: 'Accessible forms audit',
          kind: 'graded-artifact',
          dueSession: 1,
          weightPct: 100,
        },
      ],
      readings: [],
      resources: [],
    };
    const authored = backfillNativeAuthoringFromLessonContent({
      skeleton: completeSkeleton,
      lessonContent: { 'lesson-1': anchoredKernel },
    });
    const assembly = resolveNativeAssembly({
      skeleton: completeSkeleton,
      passBBySession: authored,
    });

    expect(assembly.ok).toBe(true);
    expect(assembly.graph.outcomes).toHaveLength(3);
    const section = assembly.courseMap.lessons[0].sections[0];
    expect(section.learningGoals).toContain('source evidence about Accessible forms and Labels');
    expect(section.learningObjectives).toContain('Explain Accessible forms using the available course evidence');
    expect(section.learningObjectives).toContain('Apply Labels to a practical Accessible forms example');
    expect(section.learningObjectives).toContain('Evaluate a claim about Validation');
    expect(section.asyncActivities).toContain('Annotate the available course evidence');
    expect(section.syncActivities).toContain('using evidence about Labels');
    expect(section.learningGoals).not.toContain('course-relevant decisions');

    const readinessRepair = repairCourseMapReadiness({ courseMap: assembly.courseMap });
    const repairedSection = readinessRepair.courseMap.lessons[0].sections[0];
    expect(repairedSection.learningGoals).toContain('source evidence about Accessible forms and Labels');
    expect(repairedSection.learningObjectives).toContain(
      'Explain Accessible forms using the available course evidence',
    );
    expect(repairedSection.asyncActivities).toContain('Annotate the available course evidence');
    expect(repairedSection.syncActivities).toContain('using evidence about Labels');
    expect(readinessRepair.repairedFields).not.toEqual(
      expect.arrayContaining([
        expect.stringMatching(/Learning Goals/),
        expect.stringMatching(/Learning Objectives/),
        expect.stringMatching(/Asynchronous Activities/),
        expect.stringMatching(/Synchronous Activities/),
      ]),
    );
  });
});

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

  it('preserves Algi research receipts when a finish repair re-derives the display map', () => {
    const courseMap = {
      courseName: 'Introduction to Quantum Computing',
      lessons: [
        {
          title: 'Lesson 1: Qubits',
          sections: [
            {
              topicSection: '1.1: Quantum states',
              learningObjectives: 'Explain a qubit state.',
              weeklyAssessments: 'Compare two qubit states.',
              supportingResources: 'Instructor qubit worksheet.',
            },
          ],
        },
        {
          title: 'Lesson 2: Quantum gates',
          sections: [
            {
              topicSection: '2.1: Quantum circuits',
              learningObjectives: 'Analyze a quantum circuit.',
              weeklyAssessments: 'Trace a circuit outcome.',
              supportingResources: 'Instructor circuit worksheet.',
            },
          ],
        },
      ],
    };
    const oldGraph = deriveCourseGraphFromCourseMap(courseMap);
    const [qubitSession, gateSession] = oldGraph.sessions;
    oldGraph.resources.push(
      {
        id: 'kr1',
        citation: 'Qubits — Qubit (open encyclopedia, CC BY-SA 4.0 — https://en.wikipedia.org/wiki/Qubit)',
        kind: 'open encyclopedia',
        sessionRefs: [qubitSession.id],
        origin: 'algi-research',
        provider: 'wikipedia',
        url: 'https://en.wikipedia.org/wiki/Qubit',
        license: 'CC BY-SA 4.0',
        attribution: 'Wikipedia contributors',
        revisionId: '101',
      },
      {
        id: 'kr2',
        citation: 'Quantum gates — Quantum logic gate (open encyclopedia)',
        kind: 'open encyclopedia',
        sessionRefs: [gateSession.id],
        origin: 'algi-research',
        provider: 'wikipedia',
        url: 'https://en.wikipedia.org/wiki/Quantum_logic_gate',
        license: 'CC BY-SA 4.0',
        attribution: 'Wikipedia contributors',
        revisionId: '202',
      },
    );
    qubitSession.sections[0].resourceRefs.push('kr1');
    gateSession.sections[0].resourceRefs.push('kr2');

    // Package finishing can repair map prose after compilation. That
    // re-derivation intentionally contains only the repaired display cells;
    // Algi's source receipts must survive even when their citations no longer
    // match those cells byte-for-byte.
    const repairedMap = renderCourseMapFromGraph(oldGraph, { assessmentReferences: true });
    repairedMap.lessons[0].sections[0].supportingResources = 'Instructor qubit worksheet.';
    repairedMap.lessons[1].sections[0].supportingResources = 'Instructor circuit worksheet.';
    const rederived = deriveCourseGraphFromCourseMap(repairedMap);
    const preserved = preserveSourceProof(oldGraph, rederived);

    expect(preserved.resources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'kr1',
          origin: 'algi-research',
          provider: 'wikipedia',
          revisionId: '101',
        }),
        expect.objectContaining({
          id: 'kr2',
          origin: 'algi-research',
          provider: 'wikipedia',
          revisionId: '202',
        }),
      ]),
    );
    expect(preserved.sessions[0].sections[0].resourceRefs).toContain('kr1');
    expect(preserved.sessions[1].sections[0].resourceRefs).toContain('kr2');
    expect(validateCourseGraph(preserved)).toMatchObject({ valid: true, issues: [] });
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
  it.each(['algi-researched', 'scion-source-researched'])(
    'retains source-researched facts whose topical receipt already passed admission (%s)',
    (enrichmentSource) => {
      const completed = completeNativeKernelSurfaces(
        {
          enrichmentSource,
          conceptProvenance: {
            citations: [
              {
                topic: 'duties to workers',
                evidence: 'Labour laws mediate relationships between workers, employers, unions, and government.',
                sourceUrl: 'https://en.wikipedia.org/wiki/Labour_law',
              },
            ],
          },
          keyTerms: [
            {
              term: 'Employment standards',
              definition: 'Employment standards define minimum socially acceptable conditions for work.',
              example: 'A workplace rule establishes a minimum condition for employees.',
              misconception: 'Employment standards and labour law always have identical scope.',
              correction: 'The source treats them as related concepts with different scope and evidence.',
            },
          ],
          quizItems: [
            { index: 0, type: 'multiple_choice' },
            { index: 1, type: 'multiple_choice' },
          ],
          kernel: {
            facts: [
              'Employment standards define minimum socially acceptable conditions for work.',
              'Individual labour law concerns employee rights under a contract for work.',
              'Labour laws mediate relationships between workers, employers, unions, and government.',
              'Occupational safety addresses hazards experienced while performing work duties.',
              'Workplace prevention programs address incidents and occupational disease.',
            ],
            scenario: {
              setup: 'A reviewer compares employee protections across one workplace case and its cited rules.',
              materials: 'the admitted labour-law and occupational-safety source passages',
            },
          },
        },
        {
          lessonNumber: 2,
          title: 'Lesson 2: duties to workers',
          sections: [{ topicSection: '2.1: duties to workers', weeklyAssessments: 'Worked example' }],
        },
      );

      expect(completed.slideContent.length).toBeGreaterThanOrEqual(1);
      expect(assessProjectedKernelCoverage(completed).usable).toBe(true);
    },
  );

  it('keeps the admitted cross-lesson ledger for an explicit cumulative projection', () => {
    const completed = completeNativeKernelSurfaces(
      {
        projectionKind: 'cumulative-assessment',
        sourceLessonIds: ['lesson-1', 'lesson-2', 'lesson-3'],
        kernel: {
          facts: [
            'Comparative reading identifies a defensible relation between details from two assigned texts.',
            'An essay proposal states the comparison and names the evidence each text contributes.',
            'Oral epics use patterned language to support performance and collective memory.',
            'Tang poetry often develops meaning through compressed imagery and patterned form.',
            'Classical drama presents conflict through staged speech, action, and audience knowledge.',
          ],
        },
      },
      {
        title: 'Lesson 8: Comparative Reading Methods',
        sections: [
          { topicSection: 'Comparative Reading Strategies' },
          { topicSection: 'Developing Comparative Essays' },
        ],
      },
    );

    expect(completed.kernel.facts).toHaveLength(5);
    expect(completed.slideContent.length).toBeGreaterThanOrEqual(1);
    expect(assessProjectedKernelCoverage(completed).usable).toBe(true);
  });

  it('projects an interpretive reading task from a named text instead of synthetic claim cards', () => {
    const completed = completeNativeKernelSurfaces(
      {
        keyTerms: [],
        quizItems: [
          {
            index: 3,
            type: 'short_answer',
            question: 'Claim A: homecoming. Claim B: identity. Compare the supplied claim cards.',
            enrichmentSource: 'fact-ledger-projection',
          },
          {
            index: 5,
            type: 'essay',
            question: 'Evaluate the supplied claim cards.',
            enrichmentSource: 'fact-ledger-projection',
          },
        ],
        kernel: {
          facts: [
            'Homeric narrative form organizes The Odyssey around a difficult homecoming.',
            'Nostos makes return, identity, and recognition part of the epic interpretation.',
            'Repeated epithets connect oral-form technique to characterization in epic poetry.',
            'A counter-reading can test whether cunning strengthens or complicates heroic identity.',
            'Another passage may limit a claim drawn from one episode of the assigned work.',
          ],
        },
      },
      {
        lessonNumber: 3,
        title: 'Lesson 3: Homeric Epic',
        sections: [
          {
            topicSection: 'Homeric Narrative Form',
            learningObjectives: 'Interpret formal choices in epic poetry.',
            readings: ['The Odyssey'],
          },
        ],
      },
    );

    expect(completed.kernel.scenario).toMatchObject({ source: 'assigned-reading-projection' });
    expect(completed.kernel.scenario.materials).toContain('assigned edition of The Odyssey');
    expect(completed.quizItems.filter((item) => item.type !== 'multiple_choice')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ question: expect.stringContaining('locatable passage') }),
        expect.objectContaining({ question: expect.stringContaining('formal feature') }),
      ]),
    );
    expect(completed.discussionPrompt).toMatchObject({
      prompt: expect.stringContaining('locatable passage from The Odyssey'),
      positions: expect.arrayContaining([expect.stringContaining('credible counter-reading')]),
    });
    expect(completed.discussionPrompt.prompt).not.toMatch(/case example|analyst reviews/i);
    expect(JSON.stringify(completed.quizItems)).not.toMatch(/Claim A:|supplied claim cards/i);
  });

  it('keeps the full Course Map formative direction while using a concise native artifact identity', () => {
    const fullDirection =
      'Epic Structure: Gilgamesh Narrative Arc comparative close-reading: compare two passages by the selected writers, synthesize one claim, and support it with quoted details.';
    const courseMapLesson = {
      lessonNumber: 1,
      title: 'Lesson 1: Narrative Structure: Gilgamesh',
      sections: [
        {
          topicSection: 'Epic Structure: Gilgamesh Narrative Arc',
          weeklyAssessments: fullDirection,
        },
      ],
    };

    const completed = completeNativeKernelSurfaces(
      {
        keyTerms: [],
        kernel: {
          facts: [
            'Epic narrative structure connects a sequence of trials to a changing account of power and mortality.',
            'A locatable passage can support one interpretation without establishing that every episode works identically.',
            'A counter-reading should explain the same formal detail rather than merely state a different preference.',
          ],
          scenario: {
            setup: 'Students compare two locatable passages from the assigned edition.',
            materials: 'two assigned passages and annotation notes',
          },
        },
      },
      courseMapLesson,
    );

    expect(courseMapLesson.sections[0].weeklyAssessments).toBe(fullDirection);
    expect(completed.assignmentCore.canonicalAssessment).toBe(
      'Epic Structure: Gilgamesh Narrative Arc close-reading check',
    );
    expect(JSON.stringify(completed)).not.toContain('support it with before publishing');
  });

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

  it('completes a determiner-ended MC stem before projecting it as a key-term example', () => {
    const completed = completeNativeKernelSurfaces(
      {
        keyTerms: [],
        quizItems: [
          {
            index: 0,
            type: 'multiple_choice',
            question: 'Most nutrient absorption takes place in the',
            options: ['small intestine', 'stomach', 'large intestine', 'esophagus'],
            answerIndex: 0,
            explanation:
              'Nutrient absorption takes place mainly in the small intestine because its folds, villi, and microvilli create a large exchange surface.',
          },
        ],
        kernel: {
          facts: [
            'The small intestine is the main site of nutrient absorption.',
            'Villi and microvilli increase the surface available for absorption.',
            'The stomach begins digestion but absorbs relatively few nutrients.',
          ],
          scenario: { setup: 'Trace a meal through the digestive tract.', materials: 'digestive-system diagram' },
        },
      },
      {
        title: 'Lesson 9: Digestion and absorption in the GI tract',
        lessonNumber: 9,
        sections: [{ topicSection: 'Digestion and absorption' }],
      },
    );

    expect(completed.keyTerms).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          term: 'small intestine',
          example: 'Most nutrient absorption takes place in the small intestine',
        }),
      ]),
    );
  });

  it('turns a complete MC question into a grammatical answer-bearing example', () => {
    const question =
      'The research team discovers during the first session that the final task link is broken. Which step would most directly have caught this?';
    const completed = completeNativeKernelSurfaces(
      {
        keyTerms: [],
        quizItems: [
          {
            index: 0,
            type: 'multiple_choice',
            question,
            options: [
              'Rehearsing every task the day before',
              'Increasing the incentive amount',
              'Adding more demographic questions',
              'Replacing observation with a survey',
            ],
            answerIndex: 0,
            explanation:
              'Researchers should run through test tasks before a session so broken links and procedure gaps are found before participants arrive.',
          },
        ],
        kernel: {
          facts: [
            'Researchers should run through every task before the research session.',
            'A rehearsal can expose broken links before participants arrive.',
            'The study setup should support the evidence the team needs to collect.',
          ],
          scenario: { setup: 'A research team rehearses its study.', materials: 'test script and prototype' },
        },
      },
      {
        title: 'Lesson 1: User research planning',
        lessonNumber: 1,
        sections: [{ topicSection: 'Research planning and rehearsal' }],
      },
    );

    expect(completed.keyTerms).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          term: 'Rehearsing every task the day before',
          example: `The supported answer to “${question}” is Rehearsing every task the day before.`,
        }),
      ]),
    );
    expect(JSON.stringify(completed)).not.toMatch(/For the research team discovers/i);
  });

  it('uses verified partial overlays before recovery can spend another model call', () => {
    const lessonContent = {
      'lesson-2': {
        kernel: {
          facts: [
            'The celestial sphere is an apparent dome used to map positions in the sky.',
            'Right ascension and declination locate objects on the celestial sphere.',
          ],
          scenario: { setup: 'Locate a star on a coordinate chart.', materials: 'star chart' },
        },
        keyTerms: [],
      },
    };
    const partialOverlays = {
      'lesson-2': {
        enrichmentSource: 'genome-partial',
        kernel: {
          facts: ['Declination measures angular distance north or south of the celestial equator.'],
          scenario: { setup: 'Compare two mapped stars.', materials: 'star chart' },
        },
        keyTerms: [
          {
            term: 'declination',
            definition: 'Declination is angular distance north or south of the celestial equator.',
            example: 'A star with positive declination lies north of the celestial equator.',
            source: 'OpenStax Astronomy 2e',
          },
        ],
        quizItems: [
          {
            index: 0,
            type: 'multiple_choice',
            question: 'Declination is measured relative to the',
            options: ['celestial equator', 'ecliptic only', 'local horizon only', 'Moon'],
            answerIndex: 0,
            explanation: 'Declination uses the celestial equator as its reference.',
          },
          {
            index: 1,
            type: 'short_answer',
            question: 'How does declination locate a star?',
            answer: "It gives the star's angular distance north or south of the celestial equator.",
          },
        ],
      },
    };

    expect(mergeNativePartialOverlays(lessonContent, partialOverlays, mergeLessonPayloads)).toEqual(['lesson-2']);
    const completed = completeNativeKernelSurfaces(lessonContent['lesson-2'], {
      title: 'Lesson 2: The Celestial Sphere and Sky Coordinates',
      lessonNumber: 2,
      sections: [{ topicSection: 'Celestial sphere, right ascension, and declination' }],
    });
    expect(assessProjectedKernelCoverage(completed).usable).toBe(true);
    expect(completed.kernel.facts).toContain(
      'Declination measures angular distance north or south of the celestial equator.',
    );
  });

  it('does not let an older genome partial replace current researched provenance', () => {
    const researched = {
      enrichmentSource: 'scion-source-researched',
      kernel: {
        facts: [
          'Accessibility evaluation combines appropriate tools with knowledgeable human review.',
          'Preliminary checks cannot establish comprehensive accessibility conformance.',
          'An evaluation scope defines what the review includes before sampling begins.',
        ],
      },
      conceptProvenance: {
        source: 'algi-researched',
        citations: [{ sourceUrl: 'https://www.w3.org/WAI/test-evaluate/' }],
      },
    };
    const lessonContent = { 'lesson-4': researched };
    const partialOverlays = {
      'lesson-4': {
        enrichmentSource: 'genome-linked',
        kernel: { facts: ['Older general accessibility background remains useful in a different lesson.'] },
        conceptProvenance: {
          source: 'genome-linked',
          citations: [{ sourceUrl: 'https://www.w3.org/TR/WCAG22/' }],
        },
      },
    };

    expect(mergeNativePartialOverlays(lessonContent, partialOverlays, mergeLessonPayloads)).toEqual([]);
    expect(lessonContent['lesson-4']).toBe(researched);
    expect(lessonContent['lesson-4'].conceptProvenance.citations[0].sourceUrl).toContain('/WAI/test-evaluate/');
  });

  it('does not fold an older partial into a compiler-owned exact source ledger before provenance binding', () => {
    const exactLedger = {
      enrichmentSource: 'compiler-owned-exact-source-ledger',
      kernel: {
        facts: [
          'Accessibility evaluation combines appropriate tools with knowledgeable human review.',
          'Preliminary checks cannot establish comprehensive accessibility conformance.',
          'An evaluation scope defines what the review includes before sampling begins.',
        ],
        provenance: {
          source: 'compiler-owned-exact-source-ledger',
          copiedFactsVerbatim: true,
          factCount: 3,
        },
      },
      conceptProvenance: {
        source: 'algi-researched',
        citations: [{ sourceUrl: 'https://www.w3.org/WAI/test-evaluate/' }],
      },
    };
    const lessonContent = { 'lesson-4': exactLedger };
    const partialOverlays = {
      'lesson-4': {
        kernel: { facts: ['An older broad source claim must not re-enter this ledger.'] },
        conceptProvenance: {
          source: 'genome-linked',
          citations: [{ sourceUrl: 'https://www.w3.org/TR/WCAG22/' }],
        },
      },
    };

    expect(mergeNativePartialOverlays(lessonContent, partialOverlays, mergeLessonPayloads)).toEqual([]);
    expect(lessonContent['lesson-4']).toBe(exactLedger);
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

  it('keeps a valid 22-word cited psychology fact usable when projecting its slide core', () => {
    const completed = completeNativeKernelSurfaces(
      {
        quizItems: [
          {
            index: 0,
            type: 'multiple_choice',
            question: 'Which problem-solving pattern repeats a previously successful approach after it stops working?',
            options: ['Mental set', 'Algorithm', 'Heuristic', 'Working backward'],
            answerIndex: 0,
            explanation: 'A mental set persists with an approach that worked before even when it now fails.',
          },
          {
            index: 1,
            type: 'multiple_choice',
            question: 'Which strategy follows a defined sequence of steps toward a solution?',
            options: ['Algorithm', 'Mental set', 'Functional fixedness', 'Guessing'],
            answerIndex: 0,
            explanation: 'An algorithm supplies a defined step-by-step procedure for solving a problem.',
          },
        ],
        keyTerms: [
          {
            term: 'Problem-solving strategies',
            definition:
              'Problem-solving strategies include exact algorithms and flexible heuristics selected for different constraints.',
            example: 'Working backward from a deadline can organize intermediate milestones.',
            misconception: 'Heuristics are merely careless substitutes for reliable algorithms.',
            correction: 'Heuristics are adaptive frameworks used when exhaustive procedures are impractical.',
            source: 'OpenStax Psychology 2e',
            tier: 2,
          },
        ],
        kernel: {
          facts: [
            'An algorithm provides step-by-step instructions for reaching a defined solution.',
            'A heuristic is a flexible problem-solving framework rather than an exact recipe.',
            'People reach for heuristics under specific conditions — for example, when faced with too much information or when decision time is limited.',
            'A mental set is persisting with an approach that worked in the past but is clearly not working now.',
            'Functional fixedness restricts how a familiar object is perceived and used.',
          ],
          scenario: {
            setup: 'An analyst compares two problem-solving records before selecting a strategy.',
            materials: 'algorithm trace and heuristic decision note',
          },
        },
      },
      {
        lessonNumber: 13,
        title: 'Lesson 13: problem-solving strategies with algorithms and heuristics',
        sections: [{ topicSection: '13.1: problem-solving strategies with algorithms and heuristics' }],
      },
    );

    const coverage = assessProjectedKernelCoverage(completed);
    expect(completed.slideContent.length).toBeGreaterThanOrEqual(1);
    expect(completed.slideContent.flatMap((slide) => slide.bullets)).toContain(
      'People reach for heuristics under specific conditions — for example, when faced with too much information or when decision time is limited',
    );
    expect(coverage.usable).toBe(true);
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

describe('named-reading authorship boundary', () => {
  it('removes a generic library kernel before it can replace an instructor-assigned primary text', () => {
    const lessonContent = {
      'lesson-1': { enrichmentSource: 'genome-linked', kernel: { facts: ['A generic epic fact.'] } },
      'lesson-2': { enrichmentSource: 'genome-linked', kernel: { facts: ['A general literature fact.'] } },
    };
    const partialOverlays = {
      'lesson-1': { enrichmentSource: 'genome-partial', keyTerms: [{ term: 'composite authorship' }] },
    };
    const lessons = [
      {
        title: 'Lesson 1: Homeric Epic',
        sections: [{ topicSection: 'Epic form', readings: ['The Odyssey'] }],
      },
      { title: 'Lesson 2: Literary Circulation', sections: [{ topicSection: 'Circulation' }] },
    ];

    expect(requireNativeAuthorshipForNamedReadings([0, 1], lessonContent, partialOverlays, lessons)).toEqual([
      'lesson-1',
    ]);
    expect(lessonContent['lesson-1']).toBeUndefined();
    expect(partialOverlays['lesson-1']).toBeUndefined();
    expect(lessonContent['lesson-2']).toBeTruthy();
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

  it('projects explicitly named review and synthesis sessions without classifying ordinary instruction as cumulative', () => {
    const reviewLessons = [
      {
        title: 'Lesson 13: Contemporary Global Fiction',
        sections: [{ topicSection: 'Global Voices' }],
      },
      {
        title: 'Lesson 14: Course Synthesis',
        sections: [{ topicSection: 'Final Paper Workshop' }],
      },
      {
        title: 'Lesson 14: Vocabulary Recall and Grammar',
        sections: [{ topicSection: 'Vocabulary Recall' }, { topicSection: 'Grammar' }],
      },
      {
        title: 'Lesson 8: Comparative Reading Methods',
        sections: [{ topicSection: 'Developing Comparative Essays' }, { topicSection: 'Proposal Drafting' }],
      },
      {
        title: 'Lesson 8: Developing Comparative Essays',
        sections: [{ topicSection: 'Proposal Drafting' }],
      },
      {
        title: 'Lesson 7: Vocabulary Building and Grammar',
        sections: [{ topicSection: 'New sentence patterns' }],
      },
    ];

    expect(partitionCumulativeAssessmentLessons(reviewLessons, [0, 1, 2, 3, 4, 5])).toEqual({
      subjectLessonIndices: [0, 5],
      cumulativeAssessmentLessonIndices: [1, 2, 3, 4],
    });
  });

  it('projects a comparative-reading integrator from earlier admitted texts instead of shipping review placeholders', () => {
    const comparativeLessons = [
      { title: 'Lesson 1: Oral Epic Tradition', sections: [{ topicSection: 'Epic transmission' }] },
      { title: 'Lesson 2: Classical Drama', sections: [{ topicSection: 'Dramatic conflict' }] },
      {
        title: 'Lesson 3: Comparative Reading Methods',
        sections: [
          { topicSection: 'Comparative Reading Strategies', weeklyAssessments: 'Comparative essay proposal' },
          { topicSection: 'Proposal Drafting', weeklyAssessments: 'Evidence plan' },
        ],
      },
    ];
    const lessonContent = {
      'lesson-1': {
        kernel: {
          facts: [
            'Oral epics use patterned language to support performance and memory.',
            'Performance context changes how an audience encounters an epic narrative.',
            'Written editions preserve some features while reframing others.',
          ],
        },
      },
      'lesson-2': {
        kernel: {
          facts: [
            'Classical drama develops conflict through staged speech and action.',
            'A dramatic scene gives an audience evidence through language, structure, and performance.',
            'Comparing scenes requires a bounded claim supported by details from each text.',
          ],
        },
      },
    };

    const result = projectCumulativeAssessmentKernels({
      lessonContent,
      courseMapLessons: comparativeLessons,
      lessonIndices: [2],
      courseName: 'World Literature',
    });

    expect(result).toEqual({ projectedLessonIndices: [2], skippedLessonIndices: [] });
    expect(lessonContent['lesson-3']).toMatchObject({
      enrichmentSource: 'cumulative-review-projection',
      projectionKind: 'cumulative-assessment',
      sourceLessonIds: ['lesson-1', 'lesson-2'],
    });
    expect(assessProjectedKernelCoverage(lessonContent['lesson-3']).usable).toBe(true);
    expect(
      lessonContent['lesson-3'].kernel.facts.every((fact) =>
        ['lesson-1', 'lesson-2'].some((lessonId) => lessonContent[lessonId].kernel.facts.includes(fact)),
      ),
    ).toBe(true);
  });

  it('builds a real two-text formal comparison when earlier lessons name assigned readings', () => {
    const comparativeLessons = [
      {
        title: 'Lesson 1: Homeric Epic',
        sections: [{ topicSection: 'Epic form', readings: ['The Odyssey'] }],
      },
      {
        title: 'Lesson 2: Frame Narratives',
        sections: [{ topicSection: 'Frame narrative', readings: ['The Thousand and One Nights'] }],
      },
      {
        title: 'Lesson 3: Comparative Reading Methods',
        sections: [{ topicSection: 'Comparative Reading Strategies', weeklyAssessments: 'Comparative essay proposal' }],
      },
    ];
    const lessonContent = {
      'lesson-1': {
        kernel: {
          facts: [
            'The Odyssey opens with an invocation that frames the poem’s subject.',
            'Odysseus embeds a first-person account inside the poem’s broader third-person narration.',
            'Recognition depends on characters interpreting signs and privileged knowledge.',
          ],
        },
        keyTerms: [
          {
            term: 'embedded narration',
            definition: 'Embedded narration places one speaker’s account inside a broader narrative frame.',
            example: 'A reader compares Odysseus’s account with scenes presented by the external narrator.',
            misconception: 'Every event is narrated from the same perspective.',
            correction: 'Separate the embedded speaker from the broader narrator before interpreting authority.',
          },
        ],
      },
      'lesson-2': {
        kernel: {
          facts: [
            'The Thousand and One Nights uses a frame narrative with multiple layers of storytelling.',
            'Its episodic structure places stories inside a larger narrative situation.',
            'Changes in perspective affect how readers evaluate a storyteller’s purpose.',
          ],
        },
        keyTerms: [
          {
            term: 'frame narrative',
            definition: 'A frame narrative places one or more stories inside a larger storytelling situation.',
            example: 'A reader tracks the outer situation while interpreting an embedded story.',
            misconception: 'The inner and outer stories always have the same narrator.',
            correction: 'Identify each narrative level and the speaker who controls its information.',
          },
        ],
      },
    };

    const result = projectCumulativeAssessmentKernels({
      lessonContent,
      courseMapLessons: comparativeLessons,
      lessonIndices: [2],
      courseName: 'World Literature',
    });

    expect(result).toEqual({ projectedLessonIndices: [2], skippedLessonIndices: [] });
    const comparison = lessonContent['lesson-3'];
    expect(comparison.keyTerms[0].term).toBe('comparative reading');
    expect(comparison.keyTerms[0].source).toBeUndefined();
    expect(comparison.kernel.facts.slice(0, 2)).toEqual([
      'Odysseus embeds a first-person account inside the poem’s broader third-person narration.',
      'The Thousand and One Nights uses a frame narrative with multiple layers of storytelling.',
    ]);
    expect(comparison.kernel.scenario.setup).toContain(
      'Students compare narrative perspective in The Odyssey and The Thousand and One Nights.',
    );
    expect(comparison.kernel.scenario.setup).toContain('one locatable passage from each assigned edition');
    expect(comparison.kernel.scenario.materials).not.toContain('returned practice');
    expect(comparison.discussionPrompt.prompt).toContain(
      'How does narrative perspective shape interpretation differently in The Odyssey and The Thousand and One Nights?',
    );
    expect(comparison.assignmentCore).toMatchObject({
      canonicalAssessment: 'comparative essay proposal',
    });
    expect(comparison.assignmentCore.taskDescription).toContain('The Odyssey');
    expect(comparison.assignmentCore.taskDescription).toContain('The Thousand and One Nights');
    expect(comparison.assignmentCore.taskDescription).toContain('one locatable passage from each assigned edition');
  });

  it('projects course synthesis from admitted compact fact ledgers before optional surfaces exist', () => {
    const synthesisLessons = [
      { title: 'Lesson 1: Defining World Literature', sections: [{ topicSection: 'Selection criteria' }] },
      { title: 'Lesson 2: Oral Epic Traditions', sections: [{ topicSection: 'Epic transmission' }] },
      { title: 'Lesson 3: Course Synthesis', sections: [{ topicSection: 'Final Paper Workshop' }] },
    ];
    const lessonContent = {
      'lesson-1': {
        kernel: {
          facts: [
            'World literature compares texts across languages, regions, and histories.',
            'Selection criteria shape which works enter a comparative corpus.',
            'Translation choices can alter a reader’s access to form and context.',
          ],
        },
      },
      'lesson-2': {
        kernel: {
          facts: [
            'Oral epics use patterned language to support performance and memory.',
            'Performance context changes how an audience encounters an epic narrative.',
            'Written editions preserve some features while reframing others.',
          ],
        },
      },
      'lesson-3': {
        enrichmentSource: 'model-recovery-fallback',
        kernel: { facts: ['One incomplete synthesis claim.'] },
      },
    };

    const result = projectCumulativeAssessmentKernels({
      lessonContent,
      courseMapLessons: synthesisLessons,
      lessonIndices: [2],
      courseName: 'World Literature',
    });

    expect(result).toEqual({ projectedLessonIndices: [2], skippedLessonIndices: [] });
    expect(lessonContent['lesson-3']).toMatchObject({
      enrichmentSource: 'cumulative-review-projection',
      projectionKind: 'cumulative-assessment',
      sourceLessonIds: ['lesson-1', 'lesson-2'],
    });
    expect(assessProjectedKernelCoverage(lessonContent['lesson-3']).usable).toBe(true);
  });

  it('samples the full taught span and never labels one lesson fact with another lesson term', () => {
    const spanLessons = [
      ...Array.from({ length: 13 }, (_, index) => ({
        title: `Lesson ${index + 1}: Topic ${index + 1}`,
        sections: [{ topicSection: `Topic ${index + 1}` }],
      })),
      { title: 'Lesson 14: Course Synthesis', sections: [{ topicSection: 'Final Paper Workshop' }] },
    ];
    const lessonContent = Object.fromEntries(
      Array.from({ length: 13 }, (_, index) => [
        `lesson-${index + 1}`,
        {
          kernel: {
            facts: [
              `Topic ${index + 1} establishes a distinct course claim supported by its assigned evidence.`,
              `Topic ${index + 1} also establishes one bounded interpretive limitation for comparison.`,
              `Topic ${index + 1} requires evidence before extending its conclusion to another text.`,
            ],
          },
          keyTerms: [
            {
              term: `Term ${index + 1}`,
              definition: `Term ${index + 1} is the precise concept established by Topic ${index + 1}.`,
              example: `The Topic ${index + 1} example applies Term ${index + 1} to assigned evidence.`,
              misconception: `A reader may apply Term ${index + 1} without checking the assigned evidence.`,
              correction: `Use the Topic ${index + 1} evidence boundary when applying Term ${index + 1}.`,
            },
          ],
        },
      ]),
    );

    const result = projectCumulativeAssessmentKernels({
      lessonContent,
      courseMapLessons: spanLessons,
      lessonIndices: [13],
      courseName: 'World Literature',
    });

    expect(result.projectedLessonIndices).toEqual([13]);
    const finalLesson = lessonContent['lesson-14'];
    expect(finalLesson.kernel.facts).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Topic 1 establishes'),
        expect.stringContaining('Topic 13 establishes'),
      ]),
    );
    expect(finalLesson.studyGuide.summary).not.toMatch(/Term \d+:/);
    expect(finalLesson.studyGuide.reviewStrategy).toContain('connect each claim to its source lesson');
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

  it('treats an instructor-named primary text as evidence rather than a glossary definition', () => {
    const result = completeNativeKernelSurfaces(
      {
        enrichmentSource: 'scion-model',
        kernel: {
          facts: [
            'Li Bai often uses expansive natural imagery and an exuberant lyric voice.',
            'Du Fu often connects compressed poetic form to social and historical pressures.',
            'Tang regulated verse balances tonal and structural constraints with concentrated imagery.',
          ],
          scenario: {
            setup: 'Readers compare two assigned Tang poems and mark the formal evidence behind each interpretation.',
            materials: 'selected poems of Li Bai and Du Fu',
          },
        },
      },
      {
        lessonNumber: 5,
        title: 'Lesson 5: Tang Poetry',
        sections: [
          {
            topicSection: '5.1: selected poems of Li Bai and Du Fu',
            readings: ['selected poems of Li Bai and Du Fu'],
            weeklyAssessments: 'close-reading check',
          },
          { topicSection: '5.2: Characteristics of Tang Verse', readings: ['selected poems of Li Bai and Du Fu'] },
        ],
      },
    );

    expect(result.keyTerms[0].term).toBe('Characteristics of Tang Verse');
    expect(result.keyTerms[0].term).not.toBe('selected poems of Li Bai and Du Fu');
    expect(result.assignmentCore.taskDescription).toContain('Characteristics of Tang Verse');
  });

  it('preserves the target-language contract in compiler-projected cumulative review lessons', () => {
    const mandarinLessons = [
      {
        title: 'Lesson 1: Greetings and Introductions',
        sections: [{ topicSection: 'Greetings and Introductions', weeklyAssessments: 'Dialogue check' }],
      },
      {
        title: 'Lesson 2: Final Oral Performance',
        sections: [
          { topicSection: 'Integrated Speaking Task', weeklyAssessments: 'Final oral performance' },
          { topicSection: 'Final Assessment', weeklyAssessments: 'Cumulative oral assessment' },
        ],
      },
    ];
    const source = completeNativeKernelSurfaces(
      {
        enrichmentSource: 'scion-model',
        targetLanguagePair: { hanzi: '你好', pinyin: 'nǐ hǎo', english: 'hello' },
        kernel: {
          facts: [
            'Mandarin greetings use conventional phrases to acknowledge another speaker.',
            'A self-introduction names the speaker and supports a short interpersonal exchange.',
            'Tone-marked Pinyin records pronunciation alongside the matching Hanzi.',
          ],
          scenario: {
            setup: 'Students compare two greeting exchanges before performing one.',
            materials: 'course dialogue and pronunciation guide',
          },
        },
        keyTerms: [
          {
            term: 'greeting',
            definition: 'A conventional phrase used to acknowledge another speaker.',
            example: '你好 (nǐ hǎo) means hello.',
            misconception: 'Pinyin can replace the matching Hanzi in every learning artifact.',
            correction: 'Pair tone-marked Pinyin with its matching Hanzi.',
          },
        ],
      },
      mandarinLessons[0],
    );
    const lessonContent = { 'lesson-1': source };

    const result = projectCumulativeAssessmentKernels({
      lessonContent,
      courseMapLessons: mandarinLessons,
      lessonIndices: [1],
      courseName: 'Elementary Mandarin Chinese I',
    });

    expect(result.projectedLessonIndices).toEqual([1]);
    expect(lessonContent['lesson-2'].targetLanguagePair).toEqual({
      hanzi: '你好，我叫李明。',
      pinyin: 'Nǐ hǎo, wǒ jiào Lǐ Míng.',
      english: 'Hello, my name is Li Ming',
    });
    expect(
      assessTargetLanguagePresence({
        courseIdentity: 'Elementary Mandarin Chinese I',
        text: JSON.stringify(lessonContent['lesson-2']),
      }),
    ).toMatchObject({ complete: true, paired: true });
  });

  it('uses a topical Hanzi and tone-marked Pinyin pair for vocabulary-recall projections', () => {
    const mandarinLessons = [
      {
        title: 'Lesson 1: Sentence Patterns',
        sections: [{ topicSection: 'Basic sentence patterns' }],
      },
      {
        title: 'Lesson 2: Vocabulary Recall and Grammar',
        sections: [{ topicSection: 'Vocabulary Recall' }, { topicSection: 'Grammar' }],
      },
    ];
    const lessonContent = { 'lesson-1': admittedSubjectKernel(0) };

    const result = projectCumulativeAssessmentKernels({
      lessonContent,
      courseMapLessons: mandarinLessons,
      lessonIndices: [1],
      courseName: 'Elementary Mandarin Chinese I',
    });

    expect(result.projectedLessonIndices).toEqual([1]);
    expect(lessonContent['lesson-2'].targetLanguagePair).toEqual({
      hanzi: '我喜欢苹果。',
      pinyin: 'Wǒ xǐhuān píngguǒ.',
      english: 'I like apples',
    });
  });
});
