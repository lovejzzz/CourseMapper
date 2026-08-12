import { describe, expect, it } from 'vitest';
import { COURSE_GRAPH_VERSION, courseGraphStats, createEmptyCourseGraph, validateCourseGraph } from '../schema.js';
import { deriveCourseGraphFromCourseMap } from '../deriveFromCourseMap.js';
import { renderCourseMapFromGraph } from '../renderCourseMap.js';
import { buildBlueprintFromGraph, enrichmentFromGraph, selectCompilerRegistryBridges } from '../blueprintFromGraph.js';
import { lintCourseGraphAlignment } from '../alignmentLint.js';
import { sha256HexSync } from '../../sha256Sync.js';
import { buildSourceLedgerFromCourseGraph } from '../../knowledge/sourceLedger.js';

function fixtureMap() {
  return {
    courseName: 'Principles of Microeconomics',
    lessons: [
      {
        title: 'Lesson 1: Scarcity and Economic Thinking',
        sections: [
          {
            topicSection: '1.1: Opportunity Cost',
            learningGoals: '1. Build an economic way of thinking grounded in tradeoffs.',
            learningObjectives:
              '1a. Analyze opportunity cost using personal examples.\n1b. Evaluate tradeoffs in a budget decision.',
            weeklyAssessments: '1. Week 1 quiz: applied opportunity cost problems.',
            asyncActivities: '1. Read: chapter on scarcity.\n2. Watch: tradeoffs mini-lecture.',
            syncActivities: '1. Workshop: budget-line case analysis.',
            technologyNeeded: 'Shared workspace and LMS quiz.',
            presentationFormat: 'Case discussion',
            supportingResources: 'OpenStax chapter on scarcity',
            evaluateDesign: 'Objectives are measurable and assessed by the weekly quiz.',
          },
        ],
      },
      {
        title: 'Lesson 2: Demand and Supply Basics',
        sections: [
          {
            topicSection: '2.1: Demand Curve',
            learningObjectives: 'Analyze demand shifts using market events.',
            weeklyAssessments: 'Problem set 2: demand and supply shifts.',
            supportingResources: 'OpenStax chapter on demand and supply',
            customColumn: 'Custom value survives the round trip.',
          },
        ],
      },
    ],
  };
}

describe('courseGraph (v0.13 P0)', () => {
  it('creates a valid empty graph and validates referential integrity', () => {
    const graph = createEmptyCourseGraph({ courseName: 'Test Course' });
    expect(graph.version).toBe(COURSE_GRAPH_VERSION);
    expect(validateCourseGraph(graph).valid).toBe(true);

    graph.edges.teaches.push({ from: 's99', to: 'c99' });
    const invalid = validateCourseGraph(graph);
    expect(invalid.valid).toBe(false);
    expect(invalid.issues.some((issue) => issue.code === 'dangling-edge')).toBe(true);
  });

  it('derives entities, edges, and lossless extras from a course map', () => {
    const graph = deriveCourseGraphFromCourseMap(fixtureMap());
    expect(validateCourseGraph(graph).valid).toBe(true);
    expect(graph.sessions).toHaveLength(2);
    expect(graph.outcomes).toHaveLength(3);
    expect(graph.outcomes[0]).toMatchObject({ label: '1a', bloomVerb: 'analyze' });
    expect(graph.assessments).toHaveLength(2);
    expect(graph.resources).toHaveLength(2);
    expect(graph.concepts.map((concept) => concept.term)).toEqual(['Opportunity Cost', 'Demand Curve']);
    // Alignment edges: each assessment assesses its section's outcomes.
    expect(graph.edges.assesses.length).toBeGreaterThan(0);
    // Compiler-owned and custom columns pass through verbatim.
    expect(graph.sessions[0].sections[0].extras.presentationFormat).toBe('Case discussion');
    expect(graph.sessions[1].sections[0].extras.customColumn).toBe('Custom value survives the round trip.');
  });

  it('round-trips derive → render preserving every readiness-relevant cell', () => {
    const original = fixtureMap();
    const rendered = renderCourseMapFromGraph(deriveCourseGraphFromCourseMap(original));

    expect(rendered.courseName).toBe(original.courseName);
    expect(rendered.lessons).toHaveLength(2);
    expect(rendered.lessons[0].title).toBe(original.lessons[0].title);
    const section = rendered.lessons[0].sections[0];
    expect(section.topicSection).toBe('1.1: Opportunity Cost');
    expect(section.learningObjectives).toBe(
      '1a. Analyze opportunity cost using personal examples.\n1b. Evaluate tradeoffs in a budget decision.',
    );
    expect(section.weeklyAssessments).toBe('1. Week 1 quiz: applied opportunity cost problems.');
    expect(section.asyncActivities).toBe('1. Read: chapter on scarcity.\n2. Watch: tradeoffs mini-lecture.');
    expect(section.presentationFormat).toBe('Case discussion');
    expect(rendered.lessons[1].sections[0].customColumn).toBe('Custom value survives the round trip.');
    // The v0.12.1 stem rule holds at render time: no stem in the cell.
    expect(section.learningObjectives).not.toContain('Students will be able to');
  });

  it('bridges a complete Course Map assessment when native assembly clipped the identity without changing count', () => {
    const fullFormativeTitle =
      'Epic Structure: Gilgamesh Narrative Arc comparative close-reading: compare two passages by the selected writers, synthesize one claim, and support it with quoted details.';
    const mapDerivedGraph = deriveCourseGraphFromCourseMap({
      courseName: 'World Literature Survey',
      lessons: [
        {
          title: 'Lesson 1: Narrative Structure: Gilgamesh',
          sections: [
            {
              topicSection: '1.1: Epic Structure: Gilgamesh Narrative Arc',
              learningObjectives: 'Analyze a passage and support a bounded interpretation with textual evidence.',
              weeklyAssessments: fullFormativeTitle,
            },
          ],
        },
      ],
    });
    const nativeGraph = structuredClone(mapDerivedGraph);
    nativeGraph.assessments[0].title =
      'Epic Structure: Gilgamesh Narrative Arc comparative close-reading: compare two passages by the selected writers, synthesize one claim, and support it with';

    const bridges = selectCompilerRegistryBridges(nativeGraph, mapDerivedGraph);

    expect(nativeGraph.assessments).toHaveLength(mapDerivedGraph.assessments.length);
    expect(bridges.assessmentRegistry).toEqual(mapDerivedGraph.assessments);
    expect(bridges.stats).toMatchObject({
      graphAssessmentCount: 1,
      mapAssessmentCount: 1,
      missingAssessmentCount: 1,
    });
  });

  it('migrates the old compiler-generated mini-brief identity before recompiling saved graphs', () => {
    const graph = deriveCourseGraphFromCourseMap(fixtureMap());
    graph.assessments[0].title =
      'Opportunity Cost mini-brief with one stakeholder, one constraint, and one recommended action.';
    graph.assessments[0].sourceText = graph.assessments[0].title;

    const blueprint = buildBlueprintFromGraph(graph);

    expect(blueprint.assessmentRegistry[0]).toMatchObject({
      title: 'Opportunity Cost brief: stakeholder, constraint, recommendation.',
      sourceText: 'Opportunity Cost brief: stakeholder, constraint, recommendation.',
    });

    graph.assessments[0].title = 'Opportunity Cost exit reflection: connect evidence to Opportunity Cost task.';
    graph.assessments[0].sourceText = graph.assessments[0].title;
    const replayed = buildBlueprintFromGraph(graph);
    expect(replayed.assessmentRegistry[0]).toMatchObject({
      title: 'Opportunity Cost exit reflection.',
      sourceText: 'Opportunity Cost exit reflection.',
    });

    graph.assessments[0].title = 'Opportunity Cost application check: apply one example and name one limitation.';
    graph.assessments[0].sourceText = graph.assessments[0].title;
    const replayedApplication = buildBlueprintFromGraph(graph);
    expect(replayedApplication.assessmentRegistry[0]).toMatchObject({
      title: 'Opportunity Cost application check.',
      sourceText: 'Opportunity Cost application check.',
    });
  });

  it('shortens the legacy compiler operation resource boilerplate during saved-graph replay', () => {
    const graph = deriveCourseGraphFromCourseMap({
      courseName: 'Applied Statistics',
      lessons: [
        {
          title: 'Lesson 1: Regression',
          sections: [
            {
              topicSection: 'Simple linear regression',
              learningObjectives: 'Fit and interpret a supplied regression model.',
              weeklyAssessments: 'Regression calculation trace.',
              supportingResources:
                'Admitted Regression source record plus a CourseMapper-native worked specimen with inspectable inputs and answer key.',
            },
          ],
        },
      ],
    });

    const blueprint = buildBlueprintFromGraph(graph);
    const replayText = JSON.stringify(blueprint.lessons[0]);

    expect(replayText).toContain('Admitted Regression source record and verified CourseMapper operation specimen.');
    expect(replayText).not.toContain('plus a CourseMapper-native worked specimen with inspectable inputs');
  });

  it('restores an exact admitted evidence ledger when saved graph enrichment payloads are absent', () => {
    const graph = deriveCourseGraphFromCourseMap({
      courseName: 'Language Change Seminar',
      lessons: [
        {
          title: 'Lesson 1: Language Change',
          sections: [
            {
              topicSection: 'Variation and change',
              learningObjectives: 'Explain one bounded relationship between variation and language change.',
              weeklyAssessments: 'Language-change evidence note.',
            },
          ],
        },
      ],
    });
    const authorityPayload = {
      protocol: 'coursemapper-evidence-authority-v1',
      lessonId: 'lesson-1',
      status: 'admitted',
      authorityKind: 'verified-open-research',
      claims: [
        {
          id: 'claim-1',
          text: 'Language variation can persist while a change is in progress.',
          sourceIds: ['source-1'],
          authorityKind: 'verified-open-research',
        },
        {
          id: 'claim-2',
          text: 'Stable variation can coexist for an extended period without producing a change.',
          sourceIds: ['source-1'],
          authorityKind: 'verified-open-research',
        },
        {
          id: 'claim-3',
          text: 'Evidence for change must distinguish newer and older forms in a bounded sample.',
          sourceIds: ['source-1'],
          authorityKind: 'verified-open-research',
        },
        {
          id: 'claim-4',
          text: 'Language variation: Language variation can persist while a change is in progress.',
          sourceIds: ['source-1'],
          authorityKind: 'verified-open-research',
        },
        {
          id: 'claim-5',
          text: 'Stable variation: Stable variation can coexist for an extended period without producing a change.',
          sourceIds: ['source-1'],
          authorityKind: 'verified-open-research',
        },
        {
          id: 'claim-6',
          text: 'Variation is a characteristic of language: there is more than one way to express the same meaning.',
          sourceIds: ['source-1'],
          authorityKind: 'verified-open-research',
        },
        {
          id: 'claim-7',
          text: 'Variation: Variation is a characteristic of language: there is more than one way to express the same meaning.',
          sourceIds: ['source-1'],
          authorityKind: 'verified-open-research',
        },
      ],
      sources: [
        {
          id: 'source-1',
          title: 'Language variation and change',
          url: 'https://example.edu/language-change',
          provider: 'openalex',
          license: 'CC BY 4.0',
          attribution: 'Example Research Group',
          supportReceipt: {
            status: 'passed',
            checkedClaims: 4,
            minimumScore: 1,
            checks: [
              'Language variation can persist while a change is in progress.',
              'Stable variation can coexist for an extended period without producing a change.',
              'Evidence for change must distinguish newer and older forms in a bounded sample.',
              'Variation is a characteristic of language: there is more than one way to express the same meaning.',
            ].map((claim) => ({
              claim,
              quote: claim,
              quoteInSnapshot: true,
              entailed: true,
              semanticSupport: true,
            })),
          },
          authorityKind: 'verified-open-research',
        },
      ],
    };
    const authority = {
      ...authorityPayload,
      receiptSha256: sha256HexSync(JSON.stringify(authorityPayload)),
    };
    const optionOnlyGraph = structuredClone(graph);
    const optionOnlyBlueprint = buildBlueprintFromGraph(optionOnlyGraph, {
      planningAuthority: { protocol: 'coursemapper-planning-authority-v1', authorityKind: 'pre-admission' },
      evidenceAuthorityByLessonId: { 'lesson-1': authority },
    });
    expect(optionOnlyBlueprint.evidenceAuthorityByLessonId['lesson-1']).toEqual(authority);
    expect(optionOnlyGraph.enrichmentOverlay.coverage).toMatchObject({
      requestedLessons: 1,
      enrichedLessons: 1,
      missingLessons: [],
      evidenceReplayRecovery: { status: 'complete', recoveredLessonNumbers: [1] },
    });
    expect(optionOnlyGraph.enrichmentOverlay.lessonContent['lesson-1']).toMatchObject({
      sourceFactAuthority: 'admitted-evidence-authority',
      evidenceAuthorityReceipt: { receiptSha256: authority.receiptSha256 },
    });
    graph.evidenceGroundedInstructionalPlan = {
      planningAuthority: { protocol: 'coursemapper-planning-authority-v1', authorityKind: 'saved-plan' },
      lessonIntents: [
        {
          id: 'lesson-1',
          lessonNumber: 1,
          evidenceBoundary: { authority },
        },
      ],
    };

    const blueprint = buildBlueprintFromGraph(graph);
    const admittedFacts = [...authority.claims.slice(0, 3).map((claim) => claim.text), authority.claims[5].text];

    expect(blueprint.evidenceAuthorityByLessonId['lesson-1']).toEqual(authority);
    expect(blueprint.lessons[0].enrichment).toMatchObject({
      sourceFactAuthority: 'admitted-evidence-authority',
      kernel: {
        facts: admittedFacts,
        provenance: { copiedFactsVerbatim: true, factCount: 4 },
      },
      replayRecoveryReceipt: { status: 'exact-authority-ledger-restored' },
    });
    expect(blueprint.lessons[0].enrichment.kernel.facts).not.toContain(authority.claims[6].text);
    expect(graph.enrichmentOverlay.lessonContent['lesson-1']).toMatchObject({
      sourceFactAuthority: 'admitted-evidence-authority',
      evidenceAuthorityReceipt: { receiptSha256: authority.receiptSha256 },
      replayRecoveryReceipt: { status: 'exact-authority-ledger-restored' },
      conceptProvenance: {
        citations: [
          expect.objectContaining({
            provider: 'openalex',
            license: 'CC BY 4.0',
            attribution: 'Example Research Group',
            supportReceipt: expect.objectContaining({ status: 'passed', checkedClaims: 4, minimumScore: 1 }),
          }),
        ],
      },
    });
    expect(graph.enrichmentOverlay.coverage).toMatchObject({
      requestedLessons: 1,
      enrichedLessons: 1,
      missingLessons: [],
      evidenceReplayRecovery: {
        status: 'complete',
        recoveredLessonNumbers: [1],
      },
    });
    const replayedLedger = buildSourceLedgerFromCourseGraph(graph, {
      checkedAt: '2026-08-10T00:00:00.000Z',
    });
    expect(replayedLedger?.reviewRows || []).toHaveLength(0);
    expect(replayedLedger?.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          provider: 'openalex',
          license: 'CC BY 4.0',
          attribution: 'Example Research Group',
          supportReceipt: expect.objectContaining({ status: 'passed', checkedClaims: 4, minimumScore: 1 }),
        }),
      ]),
    );
  });

  it('does not replay a hash-valid source authority whose identity conflicts with the lesson discipline', () => {
    const graph = deriveCourseGraphFromCourseMap({
      courseName: 'Introduction to Linguistics',
      lessons: [
        {
          title: 'Lesson 1: Language Change and Contact',
          sections: [
            {
              topicSection: 'Borrowing, shift, and diachronic evidence',
              learningObjectives: 'Analyze a bounded language-change record and preserve its source limit.',
              weeklyAssessments: 'Language-change evidence note.',
            },
          ],
        },
      ],
    });
    const authorityPayload = {
      protocol: 'coursemapper-evidence-authority-v1',
      lessonId: 'lesson-1',
      status: 'admitted',
      authorityKind: 'verified-open-research',
      claims: [
        { id: 'c1', text: 'A mutation is a change in a DNA sequence.', sourceIds: ['genetics-source'] },
        { id: 'c2', text: 'Some mutations can be inherited through germ cells.', sourceIds: ['genetics-source'] },
        {
          id: 'c3',
          text: 'Mutation effects depend on sequence and biological context.',
          sourceIds: ['genetics-source'],
        },
      ],
      sources: [
        {
          id: 'genetics-source',
          title: 'Mutation §Definition',
          url: 'https://www.genome.gov/genetics-glossary/Mutation',
          attribution: 'National Human Genome Research Institute',
        },
      ],
    };
    const authority = {
      ...authorityPayload,
      receiptSha256: sha256HexSync(JSON.stringify(authorityPayload)),
    };

    const blueprint = buildBlueprintFromGraph(graph, {
      evidenceAuthorityByLessonId: { 'lesson-1': authority },
    });

    expect(blueprint.evidenceAuthorityByLessonId?.['lesson-1']).toBeUndefined();
    expect(JSON.stringify(blueprint.lessons[0])).not.toMatch(
      /genome\.gov|human genome research institute|DNA sequence/i,
    );
  });

  it('does not reinterpret support-receipt prose as the source identity during replay', () => {
    const graph = deriveCourseGraphFromCourseMap({
      courseName: 'Introduction to Linguistics',
      lessons: [
        {
          title: 'Lesson 1: Cross-Linguistic Comparison',
          sections: [
            {
              topicSection: 'Typological comparison of grammatical structures',
              learningObjectives: 'Compare observable forms across two human languages.',
              weeklyAssessments: 'Submit a source-bound cross-linguistic comparison.',
            },
          ],
        },
      ],
    });
    const authorityPayload = {
      protocol: 'coursemapper-evidence-authority-v1',
      lessonId: 'lesson-1',
      status: 'admitted',
      authorityKind: 'verified-open-research',
      claims: [
        {
          id: 'c1',
          text: 'Linguistic typology compares structural patterns across human languages.',
          sourceIds: ['typology-source'],
        },
        {
          id: 'c2',
          text: 'A comparison must apply the same observable feature to each language sample.',
          sourceIds: ['typology-source'],
        },
        {
          id: 'c3',
          text: 'A bounded sample cannot establish a universal claim about all languages.',
          sourceIds: ['typology-source'],
        },
      ],
      sources: [
        {
          id: 'typology-source',
          title: 'Linguistic typology',
          topic: 'Cross-linguistic comparison',
          url: 'https://example.edu/linguistic-typology',
          supportReceipt: {
            status: 'passed',
            note: 'The search audit also rejected an unrelated result about programming languages.',
            checks: [
              'Linguistic typology compares structural patterns across human languages.',
              'A comparison must apply the same observable feature to each language sample.',
              'A bounded sample cannot establish a universal claim about all languages.',
            ].map((claim) => ({
              claim,
              quote: claim,
              quoteInSnapshot: true,
              entailed: true,
              semanticSupport: true,
            })),
          },
        },
      ],
    };
    const authority = {
      ...authorityPayload,
      receiptSha256: sha256HexSync(JSON.stringify(authorityPayload)),
    };

    const blueprint = buildBlueprintFromGraph(graph, {
      evidenceAuthorityByLessonId: { 'lesson-1': authority },
    });

    expect(blueprint.evidenceAuthorityByLessonId?.['lesson-1']).toEqual(authority);
    expect(blueprint.lessons[0].enrichment).toMatchObject({
      replayRecoveryReceipt: { status: 'exact-authority-ledger-restored' },
    });
    expect(JSON.stringify(blueprint.lessons[0].enrichment)).toContain('Linguistic typology');
  });

  it('renders manual overrides verbatim over entity rendering', () => {
    const graph = deriveCourseGraphFromCourseMap(fixtureMap());
    graph.sessions[0].sections[0].overrides.learningObjectives = 'Instructor wrote this exact text.';
    const rendered = renderCourseMapFromGraph(graph);
    expect(rendered.lessons[0].sections[0].learningObjectives).toBe('Instructor wrote this exact text.');
  });

  it('uses enriched kernel focus instead of generic Session labels in rendered maps', () => {
    const graph = deriveCourseGraphFromCourseMap({
      courseName: 'Project Management',
      lessons: [
        {
          title: 'Lesson 1: Session 1',
          sections: [
            {
              topicSection: '1.1: Session 1',
              learningGoals: 'Use Session 1 to explain a course problem.',
              learningObjectives: 'Explain how Session 1 changes project decisions.',
              weeklyAssessments: 'Session 1 evidence check.',
              asyncActivities: 'Review assigned materials and prepare notes on Session 1.',
              syncActivities: 'Discuss examples and practice applying Session 1.',
            },
          ],
        },
      ],
    });
    graph.enrichmentOverlay = {
      lessonContent: {
        'lesson-1': {
          keyTerms: [{ term: 'Project charter' }, { term: 'Stakeholder analysis' }, { term: 'Scope baseline' }],
        },
      },
    };

    const rendered = renderCourseMapFromGraph(graph);

    expect(rendered.lessons[0].title).toBe('Lesson 1: Project charter, Stakeholder analysis, and Scope baseline');
    expect(rendered.lessons[0].sections[0].topicSection).toBe(
      '1.1: Project charter, Stakeholder analysis, and Scope baseline',
    );
    expect(rendered.lessons[0].sections[0].learningObjectives).toContain('Project charter');
    expect(rendered.lessons[0].sections[0].learningObjectives).not.toContain('Session 1');
  });

  it('lints alignment structurally — unassessed outcomes, premature assessments, weights', () => {
    const graph = deriveCourseGraphFromCourseMap(fixtureMap());
    // The derived fixture is aligned: every section's assessments assess its
    // outcomes, nothing is due before it is taught.
    expect(lintCourseGraphAlignment(graph)).toEqual([]);

    // Break alignment: an outcome nothing assesses…
    graph.edges.assesses = graph.edges.assesses.filter((edge) => edge.to !== graph.outcomes[0].id);
    // …and an assessment due before its outcome's session is taught.
    const lateOutcome = graph.outcomes.find((outcome) => outcome.sessionRef === graph.sessions[1].id);
    graph.assessments[0].dueSession = 1;
    graph.edges.assesses.push({ from: graph.assessments[0].id, to: lateOutcome.id });
    // …and weights that cannot account for the whole grade.
    graph.assessments.forEach((assessment, index) => {
      assessment.weightPct = index === 0 ? 10 : 20;
    });
    graph.assessments.push({ id: 'a99', title: 'Extra quiz', dueSession: 2, weightPct: 10 });

    const findings = lintCourseGraphAlignment(graph);
    const codes = findings.map((finding) => finding.code);
    expect(codes).toContain('unassessed-outcomes');
    expect(codes).toContain('assessed-before-taught');
    expect(codes).toContain('weights-do-not-sum');
  });

  // The cloud project snapshot carries the graph, and Firestore rejects
  // directly nested arrays — tuple-shaped edges broke cloud save the day
  // v0.13.0 shipped. Edges are { from, to } objects; this walk guards the
  // whole structure against the class of bug, not just edges.
  it('serializes without nested arrays (Firestore-safe)', () => {
    const graph = deriveCourseGraphFromCourseMap(fixtureMap());
    graph.edges.genomeLink.push({ from: graph.concepts[0].id, to: 'econ/opportunity-cost' });
    const offenders = [];
    const walk = (node, path) => {
      if (Array.isArray(node)) {
        node.forEach((item, index) => {
          if (Array.isArray(item)) offenders.push(`${path}[${index}]`);
          walk(item, `${path}[${index}]`);
        });
      } else if (node && typeof node === 'object') {
        for (const [key, value] of Object.entries(node)) walk(value, `${path}.${key}`);
      }
    };
    walk(graph, '$');
    expect(offenders, offenders.join(', ')).toEqual([]);
  });

  it('assembles the enrichment overlay from concept kernels and reports stats', () => {
    const graph = deriveCourseGraphFromCourseMap(fixtureMap());
    const conceptId = graph.concepts[0].id;
    graph.concepts[0].kernel = { tm: 'Opportunity Cost', fs: [{ tx: 'A real fact.' }] };
    graph.edges.genomeLink.push({ from: conceptId, to: 'econ/opportunity-cost' });

    const overlay = enrichmentFromGraph(graph);
    expect(overlay.lessonContent['lesson-1']).toMatchObject({ tm: 'Opportunity Cost' });

    const stats = courseGraphStats(graph);
    expect(stats).toMatchObject({ sessions: 2, genomeLinkedConcepts: 1 });
  });

  it('makes a validated authentic language-data packet visible to relevant lesson compilers', () => {
    const graph = deriveCourseGraphFromCourseMap({
      courseName: 'Introduction to Language Structure',
      lessons: [
        {
          title: 'Lesson 1: Word Order',
          sections: [{ topicSection: 'Compare constituent order', weeklyAssessments: 'Data analysis.' }],
        },
        {
          title: 'Lesson 2: Morphology',
          sections: [{ topicSection: 'Analyze morpheme boundaries', weeklyAssessments: 'Glossing exercise.' }],
        },
      ],
    });
    graph.authenticLanguageData = {
      protocol: 'coursemapper-authentic-language-data-v1',
      examples: [
        {
          id: 'e1',
          language: 'English',
          form: 'Writers test claims.',
          gloss: 'writer.PL test claim.PL',
          translation: 'Writers test claims.',
          sourceId: 's1',
          sourceLocator: 'example 1',
          analysisFocus: 'SVO word order',
        },
        {
          id: 'e2',
          language: 'Cebuano',
          form: 'Mibasa ang estudyante.',
          sourceId: 's1',
          gloss: 'V S O',
          translation: 'The student read.',
          sourceLocator: 'example 2',
          analysisFocus: 'verb-initial constituent order',
        },
      ],
    };

    const blueprint = buildBlueprintFromGraph(graph);

    expect(blueprint.lessons).toHaveLength(2);
    expect(JSON.stringify(blueprint.lessons[0].readings)).toContain('AUTHENTIC_LANGUAGE_DATA.csv');
    expect(JSON.stringify(blueprint.lessons[1].readings)).toContain('AUTHENTIC_LANGUAGE_DATA.csv');
    expect(blueprint.authenticLanguageDataCoverage).toMatchObject({
      requiredLessonCount: 2,
      admittedLessonCount: 2,
      coverage: 1,
    });
    expect(blueprint.lessons[0].authenticDataTaskPlan).toMatchObject({
      protocol: 'coursemapper-authentic-evidence-task-binding-v1',
      operation: 'comparison',
      evidenceItemIds: ['e1', 'e2'],
      payloadSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(blueprint.lessons[0].evidencePlan.evidenceRequirement).toContain('Writers test claims.');
    expect(blueprint.lessons[0].evidencePlan.evidenceRequirement).toContain('Mibasa ang estudyante.');
    expect(blueprint.lessons[1].authenticDataTaskPlan).toMatchObject({
      protocol: 'coursemapper-authentic-evidence-task-binding-v1',
      evidenceItemIds: [expect.stringMatching(/^wals-20-/)],
    });
    expect(graph.authenticLanguageDataCoverage).toEqual(blueprint.authenticLanguageDataCoverage);
  });

  it('does not reuse generic word-order examples for a head-movement explanation', () => {
    const graph = deriveCourseGraphFromCourseMap({
      courseName: 'Advanced Syntax',
      lessons: [
        {
          title: 'Lesson 1: Head Movement and Structure',
          sections: [
            {
              topicSection: 'Explain head movement and compare competing syntactic accounts',
              weeklyAssessments: 'Movement analysis.',
            },
          ],
        },
      ],
    });
    graph.authenticLanguageData = {
      protocol: 'coursemapper-authentic-language-data-v1',
      examples: [
        { id: 'e1', language: 'English', sourceId: 's1', gloss: 'S V O', analysisFocus: 'SVO word order' },
        { id: 'e2', language: 'Cebuano', sourceId: 's1', gloss: 'V S O', analysisFocus: 'verb-initial order' },
      ],
    };

    const blueprint = buildBlueprintFromGraph(graph);
    expect(blueprint.authenticLanguageDataCoverage.lessons[0]).toMatchObject({
      operation: 'mechanism-explanation',
      admitted: true,
      relevantExampleIds: ['mit-head-movement-english-v-adv', 'mit-head-movement-french-v-adv'],
      relevantLanguages: ['english', 'french'],
    });
    expect(blueprint.authenticLanguageDataCoverage.lessons[0].relevantExampleIds).not.toContain('e1');
    expect(blueprint.authenticLanguageDataCoverage.lessons[0].relevantExampleIds).not.toContain('e2');
    expect(JSON.stringify(blueprint.lessons[0].readings)).toContain('AUTHENTIC_LANGUAGE_DATA.csv');
  });

  it('revalidates persisted research before replaying a visual-analysis lesson', () => {
    const graph = deriveCourseGraphFromCourseMap({
      courseName: 'Visual Evidence and Image Analysis',
      lessons: [
        {
          title: 'Lesson 1: Perspective and Framing',
          sections: [
            {
              topicSection: 'Linear Perspective Systems',
              learningObjectives: 'Analyze perspective and framing in a concrete visual.',
              weeklyAssessments: 'Submit an annotated comparison.',
            },
          ],
        },
      ],
    });
    const badCitation = {
      id: 'doaj-social-platform',
      origin: 'algi-research',
      provider: 'doaj',
      title: 'Perceived Emotional and Social Effects of TikTok Among Youth: A Visual Communication Perspective',
      topic: 'Perspective and Framing',
      evidence:
        'Young people describe emotional and social effects of a platform where interface design contributes to user engagement.',
      url: 'https://example.org/tiktok-study',
      license: 'CC BY 4.0',
    };
    graph.resources.push(badCitation);
    graph.sessions[0].sections[0].resourceRefs = [badCitation.id];
    graph.enrichmentOverlay = {
      lessonContent: {
        'lesson-1': {
          sourceFactAuthority: 'verified-open-research',
          facts: ['Platform engagement is the governing mechanism for linear perspective.'],
          conceptProvenance: {
            citations: [badCitation],
          },
        },
      },
    };

    const blueprint = buildBlueprintFromGraph(graph);
    const replayed = JSON.stringify(blueprint);
    expect(replayed).not.toMatch(/TikTok|platform engagement/i);
    expect(replayed).toContain('Perspective and Framing');
  });
});
