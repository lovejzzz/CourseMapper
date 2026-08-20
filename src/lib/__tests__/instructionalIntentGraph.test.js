import { describe, expect, it } from 'vitest';
import {
  applyInstructionalIntentGraph,
  assertInstructionalIntentGraph,
  buildInstructionalIntentGraph,
  instructionalIntentGraphReceiptMatches,
  validateInstructionalIntentGraph,
  isCompilerGenericInstructionalIntent,
} from '../instructionalIntentGraph.js';

function lesson(overrides = {}) {
  return {
    id: 'lesson-1',
    lessonNumber: 1,
    title: 'Lesson 1: Sampling distributions',
    outcomes: ['Compare two sampling distributions and justify which estimate is more stable.'],
    keyConcepts: ['sampling distribution'],
    activityPattern: 'Compare two simulated distributions and explain the observed difference.',
    studentArtifact: 'Sampling-distribution evidence memo',
    successCriteria: ['Uses the correct statistic', 'Justifies the comparison with visible evidence'],
    evidencePlan: {
      sourceCue: 'Assigned statistics source',
      evidenceRequirement: 'Use the simulated distributions and report the relevant statistic.',
      limitationCue: 'Do not generalize beyond the simulated sampling conditions.',
    },
    sourceUsePlan: {
      approvedSources: ['Assigned statistics source'],
      citationExpectation: 'Cite the assigned source and simulation output.',
    },
    enrichment: {
      kernel: {
        facts: ['A sampling distribution describes the distribution of a statistic across repeated samples.'],
      },
    },
    missingSignals: [],
    ...overrides,
  };
}

describe('plan-before-draft instructional intent graph', () => {
  it.each([
    'Ask sequenced intake questions and confirm patient-history information.',
    'Prioritize patient cues and justify the safest initial response.',
    'Prepare a proof portfolio that explains strategy choices.',
    'Conduct a complete simulated patient interview.',
    'Communicate dosage instructions and check patient understanding.',
    'Defend an escalation decision using clinical judgment evidence.',
    'Calibrate a competency-log entry against observed skills evidence.',
  ])('admits an observable discipline-authored learner action: %s', (outcome) => {
    const graph = buildInstructionalIntentGraph({
      courseName: 'Observable Practice',
      lessons: [lesson({ outcomes: [outcome], activityPattern: '' })],
      assessments: [{ artifact: 'Inspectable practice record', lessonNumbers: [1] }],
    });

    expect(graph.admission.status).toBe('approved');
    expect(graph.admission.blockers).not.toContain('lesson-1:unobservable-learner-action');
    expect(graph.lessonIntents[0].learnerAction).toBe(outcome);
  });

  it('does not mistake compiler connective tissue for an instructional plan', () => {
    expect(
      isCompilerGenericInstructionalIntent('Use Graphs and Data Visualization to make course-relevant decisions.'),
    ).toBe(true);
    expect(
      isCompilerGenericInstructionalIntent('Explain Linguistic prescription using the available course evidence.'),
    ).toBe(true);
    expect(
      isCompilerGenericInstructionalIntent(
        'Apply the main concepts from Two-Way Tables Analysis to a course task or example.',
      ),
    ).toBe(true);
    expect(
      isCompilerGenericInstructionalIntent('Compare two distributions and justify which estimate is more stable.'),
    ).toBe(false);
  });

  it('replaces a generic quantitative objective with an operation-qualified intent before drafting', () => {
    const graph = buildInstructionalIntentGraph({
      courseName: 'Introductory Statistics',
      lessons: [
        lesson({
          title: 'Lesson 1: Graphs and Data Visualization',
          outcomes: ['Use Graphs and Data Visualization to make course-relevant decisions.'],
          activityPattern:
            'Apply Graphs and Data Visualization in one practical example from Introductory Statistics and justify one revision.',
          keyConcepts: ['histograms', 'frequency distributions'],
        }),
      ],
      assessments: [{ artifact: 'Verified histogram analysis', lessonNumbers: [1] }],
    });

    expect(graph.admission.status).toBe('approved');
    expect(graph.lessonIntents[0].targetObjectives[0]).toMatch(/declar(?:e|ing) bin edges/i);
    expect(graph.lessonIntents[0].learnerAction).toMatch(/place and total every observation/i);
    expect(graph.lessonIntents[0].expectedEvidence.evidenceRequirement).toMatch(/bin counts/i);
    expect(graph.lessonIntents[0].targetObjectives.join(' ')).not.toMatch(/course-relevant decisions/i);
  });

  it('authorizes a compiler-verified operation specimen without pretending curriculum labels are factual sources', () => {
    const graph = buildInstructionalIntentGraph({
      courseName: 'Introductory Statistics',
      planningAuthority: {
        protocol: 'coursemapper-pre-draft-planning-authority-v1',
        courseMapSha256: 'curriculum-only',
      },
      lessons: [
        lesson({
          title: 'Lesson 1: Describing Distributions with Numbers',
          outcomes: ['Use Describing Distributions with Numbers to make course-relevant decisions.'],
          keyConcepts: ['center and spread'],
          enrichment: null,
          readings: ['Admitted distribution source record that has no claim receipt'],
          sourceAnchors: [
            {
              field: 'resources',
              source: 'course-map',
              anchor: 'Admitted distribution source record that has no claim receipt',
            },
          ],
          sourceUsePlan: {
            approvedSources: ['Admitted distribution source record that has no claim receipt'],
            citationExpectation: 'Cite the assigned course materials.',
          },
        }),
      ],
      assessments: [{ artifact: 'Distribution calculation trace', lessonNumbers: [1] }],
    });

    expect(graph.admission).toMatchObject({ status: 'approved', blockerCount: 0 });
    expect(graph.lessonIntents[0]).toMatchObject({
      evidenceNeedKind: 'operation-specimen',
      evidenceBoundary: {
        mode: 'compiler-verified-operation-specimen',
        draftAuthorization: 'authorized',
        allowedClaims: [],
        compilerOperationSpecimen: {
          authorityKind: 'compiler-verified-synthetic',
          operation: 'summarize-and-interpret-distribution',
        },
      },
    });
    expect(graph.lessonIntents[0].evidenceBoundary.publicationBoundary).toMatch(
      /add no external factual claims without admitted source evidence/i,
    );
    expect(graph.lessonIntents[0].evidenceBoundary.approvedSources).toEqual([
      'course-created summarize-and-interpret-distribution specimen',
    ]);
    expect(graph.lessonIntents[0].evidenceBoundary.instructorSource).toBe(false);
    expect(graph.lessonIntents[0].evidenceBoundary.citationExpectation).toMatch(
      /course-created summarize-and-interpret-distribution specimen/i,
    );
    expect(graph.lessonIntents[0].evidenceBoundary.citationExpectation).not.toContain('assigned course materials');
    const [plannedLesson] = applyInstructionalIntentGraph(
      [
        lesson({
          title: 'Lesson 1: Describing Distributions with Numbers',
          evidencePlan: { sourceCue: 'Admitted source record without a receipt' },
          sourceUsePlan: {
            approvedSources: ['Admitted source record without a receipt'],
            citationExpectation: 'Cite the assigned course materials.',
          },
          throughlineCase: { evidencePacket: 'Admitted source record without a receipt' },
        }),
      ],
      graph,
    );
    expect(plannedLesson.evidencePlan.sourceCue).toBe('course-created summarize-and-interpret-distribution specimen');
    expect(plannedLesson.sourceUsePlan.approvedSources).toEqual([
      'course-created summarize-and-interpret-distribution specimen',
    ]);
    expect(plannedLesson.sourceUsePlan.citationExpectation).not.toContain('assigned course materials');
    expect(plannedLesson.throughlineCase.evidencePacket).toBe(
      'course-created summarize-and-interpret-distribution specimen',
    );
  });

  it('does not present a visual planning placeholder as the admitted learner source', () => {
    const sourceTitle = 'Photographic composition';
    const sourceClaims = [
      'A composition can organize visible elements within a frame.',
      'A focal element can be identified from observable placement and contrast.',
      'A bounded interpretation separates the visible arrangement from contextual inference.',
    ];
    const sourceLesson = lesson({
      title: 'Lesson 1: Composition',
      outcomes: ['Analyze a concrete visual composition and justify one bounded interpretation.'],
      keyConcepts: ['composition'],
      enrichment: null,
      readings: [
        'Admitted visual specimen and attribution record',
        'Lesson-specific visual specimen and attribution record for Composition; asset admission required before drafting.',
      ],
      sourceUsePlan: {
        approvedSources: [
          'Admitted visual specimen and attribution record',
          'Lesson-specific visual specimen and attribution record for Composition; asset admission required before drafting.',
        ],
        citationExpectation: 'Cite the admitted visual asset.',
      },
    });
    const graph = buildInstructionalIntentGraph({
      courseName: 'Visual Evidence',
      planningAuthority: {
        protocol: 'coursemapper-pre-draft-planning-authority-v1',
        courseMapSha256: 'visual-curriculum',
      },
      lessons: [sourceLesson],
      assessments: [{ artifact: 'Composition evidence annotation', lessonNumbers: [1] }],
      evidenceAuthorityByLessonId: {
        'lesson-1': {
          protocol: 'coursemapper-evidence-authority-v1',
          status: 'admitted',
          authorityKind: 'verified-open-research',
          receiptSha256: 'visual-source-receipt',
          sources: [{ id: 'visual-source-1', title: sourceTitle }],
          claims: sourceClaims.map((text, index) => ({
            id: `visual-claim-${index + 1}`,
            text,
            sourceIds: ['visual-source-1'],
          })),
        },
      },
    });

    expect(graph.admission.status).toBe('approved');
    expect(graph.lessonIntents[0].evidenceBoundary.approvedSources).toEqual([sourceTitle]);
    graph.lessonIntents[0].evidenceBoundary.approvedSources.unshift(
      'Admitted visual specimen and attribution record',
      'Admitted visual specimen and attribution record for Composition.',
      'Lesson-specific visual specimen and attribution record',
      'Lesson-specific visual specimen and attribution record for Composition',
    );
    const [plannedLesson] = applyInstructionalIntentGraph([sourceLesson], graph);
    expect(plannedLesson.sourceUsePlan.approvedSources).toEqual([sourceTitle]);
    expect(plannedLesson.evidencePlan.sourceCue).toBe(sourceTitle);
    expect(plannedLesson.sourceUsePlan.studentAttributionMove).toContain(sourceTitle);
    expect(plannedLesson.sourceUsePlan.studentAttributionMove).not.toContain('Admitted visual specimen');
  });

  it('turns a generic non-operational plan into an inspectable evidence performance', () => {
    const graph = buildInstructionalIntentGraph({
      courseName: 'Language Structure',
      lessons: [
        lesson({
          title: 'Lesson 1: Defining Linguistic Evidence',
          outcomes: ['Explain Linguistic prescription using the available course evidence.'],
          activityPattern: '',
          keyConcepts: ['linguistic evidence'],
        }),
      ],
      assessments: [{ artifact: 'Source-bounded evidence analysis', lessonNumbers: [1] }],
    });

    expect(graph.admission.status).toBe('approved');
    expect(graph.admission.blockers).not.toContain('lesson-1:generic-objective');
    expect(graph.admission.blockers).not.toContain('lesson-1:unobservable-learner-action');
    expect(graph.lessonIntents[0].targetObjectives[0]).toMatch(
      /Distinguish admitted evidence for linguistic evidence from its inference and bound the Source-bounded evidence analysis conclusion/i,
    );
    expect(graph.lessonIntents[0].learnerAction).toBe(graph.lessonIntents[0].targetObjectives[0]);
  });

  it('turns an explicit all-lessons visual brief into an inspectable plan before drafting', () => {
    const graph = buildInstructionalIntentGraph({
      courseName: 'Visual Evidence',
      lessons: [
        lesson({
          title: 'Lesson 1: Foundational Composition Principles',
          outcomes: ['Explain Rule of thirds using the available course evidence.'],
          activityPattern: '',
          keyConcepts: ['composition', 'rule of thirds'],
          studentArtifact: 'Evidence-based visual annotation',
        }),
      ],
      assessments: [{ artifact: 'Evidence-based visual annotation', lessonNumbers: [1] }],
      briefQualityContract: {
        protocol: 'coursemapper-brief-quality-contract-v1',
        scope: 'all-lessons',
        requiredLessonNumbers: [1],
        functionalVisual: { required: true, productActions: ['annotate', 'compare'] },
      },
    });

    expect(graph.admission.status).toBe('approved');
    expect(graph.lessonIntents[0].targetObjectives[0]).toMatch(/primary-to-secondary mass relationship/i);
    expect(graph.lessonIntents[0].targetObjectives[0]).toMatch(/concrete rule of thirds specimen/i);
    expect(graph.lessonIntents[0].learnerAction).toMatch(/matched rule of thirds specimen/i);
    expect(graph.lessonIntents[0].learnerAction).toMatch(/counterweight state/i);
    expect(graph.lessonIntents[0].expectedEvidence.evidenceRequirement).toMatch(/declared visual relationship/i);
  });

  it('creates one hash-bound authority that connects intent, evidence, and every artifact family', () => {
    const graph = buildInstructionalIntentGraph({
      courseName: 'Introduction to Statistics',
      courseConcepts: ['sampling', 'inference'],
      lessons: [lesson()],
      assessments: [
        {
          artifact: 'Sampling-distribution evidence memo',
          lessonNumbers: [1],
        },
      ],
    });

    expect(graph.admission).toMatchObject({ status: 'approved', blockerCount: 0, lessonCount: 1 });
    expect(graph.lessonIntents[0]).toMatchObject({
      focusConcepts: expect.arrayContaining(['Sampling distributions']),
      learnerAction: expect.stringMatching(/compare/i),
      evidenceBoundary: {
        mode: 'claim-bounded',
        mayAddUnsupportedFacts: false,
      },
      expectedEvidence: {
        artifact: 'Sampling-distribution evidence memo',
      },
    });
    expect(Object.keys(graph.artifactResponsibilities)).toHaveLength(9);
    expect(graph.lessonIntents[0].artifactResponsibilities).toBeUndefined();
    expect(instructionalIntentGraphReceiptMatches(graph)).toBe(true);
    expect(() => assertInstructionalIntentGraph(graph)).not.toThrow();
  });

  it('preserves source-authored section topics in the pre-draft lesson identity', () => {
    const graph = buildInstructionalIntentGraph({
      courseName: 'Introduction to Statistics',
      lessons: [
        lesson({
          title: 'Lesson 1: Picturing Distributions',
          keyConcepts: [],
          sections: [
            { topicSection: '1.1: Graphs and Data Visualization' },
            { topicSection: '1.2: Describing Distributions with Numbers' },
          ],
        }),
      ],
      assessments: [{ artifact: 'Distribution evidence memo', lessonNumbers: [1] }],
    });

    expect(graph.lessonIntents[0].focusConcepts).toEqual(
      expect.arrayContaining(['Graphs and Data Visualization', 'Describing Distributions with Numbers']),
    );
    expect(graph.lessonIntents[0].focusConcepts.join(' ')).not.toContain('1.1:');
  });

  it('blocks drafting when a plan loses its evidence product or its hash no longer matches', () => {
    const graph = buildInstructionalIntentGraph({
      courseName: 'Introduction to Statistics',
      lessons: [lesson()],
      assessments: [{ artifact: 'Evidence memo', lessonNumbers: [1] }],
    });
    graph.lessonIntents[0].expectedEvidence.artifact = '';

    expect(validateInstructionalIntentGraph(graph).blockers).toContain('lesson-1:missing-evidence-artifact');
    expect(instructionalIntentGraphReceiptMatches(graph)).toBe(false);
    expect(() => assertInstructionalIntentGraph(graph)).toThrow(/blocked drafting/i);
  });

  it('blocks drafting and asks a targeted question when governing evidence is absent', () => {
    const graph = buildInstructionalIntentGraph({
      courseName: 'Studio Seminar',
      lessons: [
        lesson({
          enrichment: null,
          readings: [],
          sourceAnchors: [],
          sourceUsePlan: { approvedSources: [] },
        }),
      ],
      assessments: [{ artifact: 'Studio critique record', lessonNumbers: [1] }],
    });

    expect(graph.admission.status).toBe('blocked');
    expect(graph.admission.blockers).toContain('lesson-1:essential-instructor-input-required');
    expect(graph.lessonIntents[0].evidenceBoundary.mode).toBe('instructor-confirmation-required');
    expect(graph.lessonIntents[0].clarificationQuestions).toContainEqual(
      expect.objectContaining({ priority: 'essential', decision: 'governing-source' }),
    );
    expect(() => assertInstructionalIntentGraph(graph)).toThrow(/blocked drafting/i);
  });

  it('treats titles, objectives, and a named reading as evidence needs rather than factual authority', () => {
    const graph = buildInstructionalIntentGraph({
      courseName: 'Public Decisions',
      planningAuthority: {
        protocol: 'coursemapper-pre-draft-planning-authority-v1',
        courseMapSha256: 'curriculum-only',
      },
      lessons: [
        lesson({
          enrichment: null,
          readings: ['A Named Reading Without Extracted Claims'],
          sourceUsePlan: { approvedSources: ['A Named Reading Without Extracted Claims'] },
          sourceAnchors: [
            { field: 'title', source: 'course-map', anchor: 'Visual Evidence' },
            {
              field: 'objectives',
              source: 'course-map',
              anchor: 'Compare two visual claims and justify a decision.',
            },
          ],
        }),
      ],
      assessments: [{ artifact: 'Evidence memo', lessonNumbers: [1] }],
    });

    expect(graph.admission.status).toBe('needs-evidence');
    expect(graph.admission.blockers).toEqual(['lesson-1:evidence-acquisition-required']);
    expect(graph.lessonIntents[0].evidenceBoundary).toMatchObject({
      mode: 'source-bounded-no-claim-expansion',
      draftAuthorization: 'evidence-acquisition-required',
      curriculumSignalsAreNotSources: true,
      allowedClaims: [],
    });
    expect(graph.lessonIntents[0].evidenceBoundary.approvedSources).toEqual([
      'A Named Reading Without Extracted Claims',
    ]);
    expect(() => assertInstructionalIntentGraph(graph, { allowEvidenceNeeds: true })).not.toThrow();
    expect(() => assertInstructionalIntentGraph(graph)).toThrow(/blocked drafting/i);
  });

  it('authorizes only exact admitted claims and rejects a later model-provisional fact', () => {
    const sourceClaims = [
      'A bar chart encodes magnitude by length along a common quantitative scale.',
      'Truncated quantitative axes can visually exaggerate differences between values.',
      'A chart annotation should distinguish a visible observation from its interpretation.',
    ];
    const evidenceAuthorityByLessonId = {
      'lesson-1': {
        protocol: 'coursemapper-evidence-authority-v1',
        status: 'admitted',
        authorityKind: 'verified-open-research',
        receiptSha256: 'evidence-receipt',
        sources: [{ id: 'source-1', title: 'Verified chart-design source' }],
        claims: sourceClaims.map((text, index) => ({
          id: `lesson-1-claim-${index + 1}`,
          text,
          sourceIds: ['source-1'],
        })),
      },
    };
    const build = (facts) =>
      buildInstructionalIntentGraph({
        courseName: 'Public Decisions',
        planningAuthority: {
          protocol: 'coursemapper-pre-draft-planning-authority-v1',
          courseMapSha256: 'curriculum-plus-evidence',
        },
        evidenceAuthorityByLessonId,
        lessons: [
          lesson({
            enrichment: { kernel: { facts } },
            readings: ['Verified chart-design source'],
            sourceUsePlan: { approvedSources: ['Verified chart-design source'] },
          }),
        ],
        assessments: [{ artifact: 'Evidence memo', lessonNumbers: [1] }],
      });

    const admitted = build(sourceClaims);
    expect(admitted.admission.status).toBe('approved');
    expect(admitted.lessonIntents[0].evidenceBoundary.admittedClaimIds).toHaveLength(3);
    expect(admitted.lessonIntents[0].evidenceBoundary.unadmittedClaims).toEqual([]);

    const contaminated = build([
      ...sourceClaims,
      'A plausible model-provisional design rule was never admitted by the evidence transaction.',
    ]);
    expect(contaminated.admission.status).toBe('blocked');
    expect(contaminated.admission.blockers).toContain('lesson-1:unadmitted-draft-claims');
  });

  it('projects the approved plan back into canonical lesson fields used by artifact compilers', () => {
    const sourceLesson = lesson({ studentArtifact: 'Old independent artifact label' });
    const graph = buildInstructionalIntentGraph({
      courseName: 'Introduction to Statistics',
      lessons: [sourceLesson],
      assessments: [{ artifact: 'Approved evidence memo', lessonNumbers: [1] }],
    });
    const [planned] = applyInstructionalIntentGraph([sourceLesson], graph);

    expect(planned.studentArtifact).toBe('Approved evidence memo');
    expect(planned.keyConcepts[0]).toBe('Sampling distributions');
    expect(planned.outcomes).toEqual(graph.lessonIntents[0].targetObjectives);
    expect(planned.instructionalIntentReceiptSha256).toBe(graph.receipt.exactInputSha256);
    expect(planned.evidencePlan.evidenceRequirement).toBe(graph.lessonIntents[0].expectedEvidence.evidenceRequirement);
  });
});
