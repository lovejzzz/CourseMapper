import { describe, expect, it } from 'vitest';
import { sha256HexSync } from '../sha256Sync.js';
import { buildInstructionalIntentGraph } from '../instructionalIntentGraph.js';
import {
  buildScionEvidenceLessonPrompt,
  bindScionEvidenceProvenance,
  createScionEvidenceAuthorityContract,
  createScionEvidenceOverlay,
  excludeRejectedEvidenceSeeds,
  prepareScionEvidenceGenerationHandoff,
  prepareScionEvidenceForGeneration,
  prepareScionEvidenceLayer,
  materializeScionEvidenceLessonContent,
  mergeScionEvidenceOverlays,
  scionPayloadMatchesEvidence,
  scionEvidenceLessonFromComposedPayload,
  scionEvidenceLessonIds,
  selectScionEvidenceCandidate,
  summarizeScionEvidenceOverlay,
} from '../scionEvidenceLayer';

function payload(overrides = {}) {
  return {
    lessonId: 'lesson-2',
    facts: [
      'Contextual inquiry examines work while it occurs in the participant’s ordinary setting.',
      'Researchers combine observation with questions to understand both action and intent.',
      'Field notes separate observed events from the researcher’s later interpretation.',
      'A focused inquiry documents tools, interruptions, handoffs, and environmental constraints.',
      'Evidence from several sessions supports patterns but does not make a sample statistically representative.',
    ],
    keyTerms: [
      {
        tr: 'Contextual inquiry',
        df: 'A field method.',
        eg: 'A workplace visit.',
        mi: 'It is an interview.',
        cx: 'It combines observation and inquiry.',
      },
      {
        tr: 'Field note',
        df: 'A contemporaneous record.',
        eg: 'A timestamped action.',
        mi: 'It is a transcript.',
        cx: 'It records context and action.',
      },
      {
        tr: 'Interpretation',
        df: 'An evidence-based explanation.',
        eg: 'A pattern hypothesis.',
        mi: 'It is an observation.',
        cx: 'It must be distinguished from observation.',
      },
    ],
    conceptProvenance: {
      source: 'algi-researched',
      fullyAnchored: true,
      conceptIds: ['ux/contextual-inquiry'],
      citations: [
        {
          id: 'doaj:contextual-inquiry',
          displayTitle: 'Contextual Inquiry',
          sourceUrl: 'https://example.edu/contextual-inquiry',
          license: 'CC BY 4.0',
          attribution: 'Example University',
          provider: 'doaj',
          topic: 'Contextual inquiry',
          sourceTier: 1,
          evidence: 'The admitted passage.',
          supportReceipt: {
            status: 'passed',
            method: 'exact-source-claim-v1',
            semanticSupport: true,
            readinessEligible: false,
            checks: [
              {
                sourceId: 'doaj:contextual-inquiry',
                locator: 'abstract',
                quote: 'The admitted passage.',
                claim: 'The admitted passage.',
                quoteInSnapshot: true,
                entailed: true,
                semanticSupport: true,
              },
            ],
          },
        },
      ],
    },
    ...overrides,
  };
}

describe('Scion evidence layer', () => {
  function instancePlan({ title, concept, objective }) {
    return buildInstructionalIntentGraph({
      courseName: 'Evidence Methods',
      lessons: [
        {
          id: 'lesson-1',
          lessonNumber: 1,
          title,
          outcomes: [objective],
          keyConcepts: [concept],
          studentArtifact: 'source-bound analysis',
          successCriteria: ['Cite the observed record.', 'Keep the conclusion within the evidence.'],
          sections: [{ topicSection: concept }],
        },
      ],
    });
  }

  function exactCitation({ id, title, topic, claims }) {
    return {
      id,
      displayTitle: title,
      sourceUrl: `https://example.edu/${id}`,
      license: 'CC BY 4.0',
      attribution: 'Example University',
      provider: 'test-provider',
      topic,
      supportReceipt: {
        status: 'passed',
        checks: claims.map((claim, index) => ({
          sourceId: id,
          locator: `passage-${index + 1}`,
          quote: claim,
          claim,
          quoteInSnapshot: true,
          entailed: true,
          semanticSupport: true,
        })),
      },
    };
  }

  it('rejects exact-source atoms from a later operation instead of laundering them into lesson one', () => {
    const plan = instancePlan({
      title: 'Linguistic Evidence',
      concept: 'Minimal pair evidence',
      objective: 'Analyze a minimal pair and justify one bounded contrast claim.',
    });
    const relevantClaims = [
      'A minimal pair contains two forms distinguished by one sound in the same position.',
      'A minimal-pair comparison provides observable evidence that two sounds distinguish forms.',
      'One minimal pair supports a bounded contrast claim but does not describe every language variety.',
    ];
    const crossedClaims = [
      'Data processing collects and manipulates digital records to produce information.',
      'Automatic data processing uses electronic systems to transform input records.',
      'A processing workflow applies a sequence of operations to a set of inputs.',
    ];
    const researched = {
      lessonId: 'lesson-1',
      instructionalInstanceId: plan.lessonIntents[0].instructionalInstanceId,
      instructionalInstance: structuredClone(plan.lessonIntents[0].instructionalInstance),
      sourceFacts: [...relevantClaims, ...crossedClaims],
      conceptProvenance: {
        source: 'algi-researched',
        fullyAnchored: true,
        citations: [
          exactCitation({
            id: 'minimal-pair',
            title: 'Minimal pair',
            topic: 'Minimal pair evidence',
            claims: relevantClaims,
          }),
          exactCitation({
            id: 'data-processing',
            title: 'Data processing',
            topic: 'Data Processing · Analysis Implementation · Project Execution',
            claims: crossedClaims,
          }),
        ],
      },
    };

    const contract = createScionEvidenceAuthorityContract({
      lessonIndices: [0],
      evidenceOverlay: { byLessonId: { 'lesson-1': researched } },
      instructionalPlan: plan,
    });

    expect(contract.status).toBe('admitted');
    expect(contract.byLessonId['lesson-1'].claims.map((claim) => claim.text)).toEqual(relevantClaims);
    expect(contract.byLessonId['lesson-1'].claims.every((claim) => /^[a-f0-9]{64}$/.test(claim.candidateId))).toBe(
      true,
    );
    expect(
      contract.byLessonId['lesson-1'].claims.every(
        (claim) =>
          /^[a-f0-9]{64}$/.test(claim.queryId) &&
          claim.queryReceipt?.queryId === claim.queryId &&
          claim.candidateReceipt?.candidateId === claim.candidateId &&
          claim.candidateReceipt?.queryId === claim.queryId,
      ),
    ).toBe(true);
    expect(
      contract.byLessonId['lesson-1'].claims.every(
        (claim) => claim.instructionalInstanceId === plan.lessonIntents[0].instructionalInstanceId,
      ),
    ).toBe(true);
    expect(contract.byLessonId['lesson-1'].atomAdmission).toMatchObject({
      admittedAtomCount: 3,
      rejectedAtomCount: 3,
    });
    expect(contract.byLessonId['lesson-1'].sourceAdmission).toMatchObject({
      protocol: 'scion-evidence-source-admission-v1',
      admittedSourceCount: 1,
      rejectedSourceCount: 1,
    });
    expect(contract.byLessonId['lesson-1'].sourceAdmission.decisions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sourceId: 'minimal-pair', admitted: true }),
        expect.objectContaining({ sourceId: 'data-processing', admitted: false }),
      ]),
    );
  });

  it('rejects undeclared source specializations but keeps one named in the frozen lesson plan', () => {
    const plan = instancePlan({
      title: 'Normal Distribution',
      concept: 'Normal distribution',
      objective: 'Interpret a normal model and audit one randomized experiment comparison.',
    });
    const normalClaims = [
      'A normal distribution is a continuous probability distribution for a real-valued random variable.',
      'The normal model is symmetric around its mean.',
      'A normal-model interpretation must be checked against the supplied data.',
    ];
    const gammaClaims = [
      'A normal-gamma distribution is a bivariate four-parameter family.',
      'A normal-gamma model combines a normal and gamma component.',
      'The specialized family is used in advanced statistical modeling.',
    ];
    const randomizedClaims = [
      'A randomized experiment assigns treatments using a chance mechanism.',
      'Random assignment supports a bounded causal comparison.',
      'The assignment record makes the randomized procedure inspectable.',
    ];
    const researched = {
      lessonId: 'lesson-1',
      instructionalInstanceId: plan.lessonIntents[0].instructionalInstanceId,
      instructionalInstance: structuredClone(plan.lessonIntents[0].instructionalInstance),
      sourceFacts: [...normalClaims, ...gammaClaims, ...randomizedClaims],
      conceptProvenance: {
        source: 'algi-researched',
        fullyAnchored: true,
        citations: [
          exactCitation({
            id: 'normal',
            title: 'Normal distribution',
            topic: 'Normal Distribution',
            claims: normalClaims,
          }),
          exactCitation({
            id: 'normal-gamma',
            title: 'Normal-gamma distribution',
            topic: 'Normal Distribution',
            claims: gammaClaims,
          }),
          exactCitation({
            id: 'randomized-experiment',
            title: 'Randomized experiment',
            topic: 'Normal Distribution',
            claims: randomizedClaims,
          }),
        ],
      },
    };

    const contract = createScionEvidenceAuthorityContract({
      lessonIndices: [0],
      evidenceOverlay: { byLessonId: { 'lesson-1': researched } },
      instructionalPlan: plan,
    });

    expect(contract.status).toBe('admitted');
    expect(contract.byLessonId['lesson-1'].sources.map((source) => source.id)).toEqual([
      'normal',
      'randomized-experiment',
    ]);
    expect(contract.byLessonId['lesson-1'].claims.map((claim) => claim.text)).not.toEqual(
      expect.arrayContaining(gammaClaims),
    );
    expect(contract.byLessonId['lesson-1'].sourceAdmission.decisions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceId: 'normal-gamma',
          admitted: false,
          reason: 'undeclared-source-specialization',
          sourceSnapshotSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
          locators: expect.arrayContaining(['passage-1']),
        }),
        expect.objectContaining({ sourceId: 'randomized-experiment', admitted: true }),
      ]),
    );
  });

  it('does not confuse linguistic semantics with computer-vision semantic segmentation', () => {
    const plan = instancePlan({
      title: 'First-Language Acquisition',
      concept: 'Semantic bootstrapping',
      objective: 'Audit one semantic-bootstrapping claim against child-language evidence.',
    });
    const relevantClaims = [
      'Semantic bootstrapping proposes that children use meaning-related categories while inferring grammatical categories.',
      'A child-language observation can support a bounded acquisition claim without establishing one universal learning path.',
      'Competing acquisition evidence can limit an inference drawn from a semantic-bootstrapping example.',
    ];
    const crossedClaims = [
      'Semantic segmentation assigns a category label to image regions or pixels in a visual scene.',
      'Remote-sensing segmentation models can experience performance loss when the image domain changes.',
      'Visual domain prompts can alter how an image-segmentation model processes remote-sensing inputs.',
    ];
    const researched = {
      lessonId: 'lesson-1',
      instructionalInstanceId: plan.lessonIntents[0].instructionalInstanceId,
      instructionalInstance: structuredClone(plan.lessonIntents[0].instructionalInstance),
      sourceFacts: [...relevantClaims, ...crossedClaims],
      conceptProvenance: {
        source: 'algi-researched',
        fullyAnchored: true,
        citations: [
          exactCitation({
            id: 'semantic-bootstrapping',
            title: 'Semantic bootstrapping',
            topic: 'First-language acquisition',
            claims: relevantClaims,
          }),
          exactCitation({
            id: 'semantic-segmentation',
            title: 'Semantic Segmentation via Visual Domain Prompt in Remote Sensing Data',
            topic: 'Semantic segmentation',
            claims: crossedClaims,
          }),
        ],
      },
    };

    const contract = createScionEvidenceAuthorityContract({
      lessonIndices: [0],
      evidenceOverlay: { byLessonId: { 'lesson-1': researched } },
      instructionalPlan: plan,
    });

    expect(contract.status).toBe('admitted');
    expect(contract.byLessonId['lesson-1'].claims.map((claim) => claim.text)).toEqual(relevantClaims);
    expect(contract.byLessonId['lesson-1'].sources.map((source) => source.title)).not.toContain(
      'Semantic Segmentation via Visual Domain Prompt in Remote Sensing Data',
    );
    expect(contract.byLessonId['lesson-1'].atomAdmission.rejectedAtomCount).toBe(3);
  });

  it('prunes a neighboring-discipline source before signing a mixed lesson authority', () => {
    const plan = instancePlan({
      title: 'Cross-Linguistic Comparison',
      concept: 'Comparative grammatical structures',
      objective: 'Compare attested grammatical structures and justify one bounded cross-linguistic claim.',
    });
    const relevantClaims = [
      'Cross-linguistic comparison can describe how attested grammatical structures differ across languages.',
      'A typological comparison requires the same structural feature to be identified in each language record.',
      'A bounded comparison names the sampled languages and does not treat them as representative of every language.',
    ];
    const misleadingClaim =
      'Comparative analysis identifies structural similarities and differences before selecting a bounded interpretation.';
    const researched = {
      lessonId: 'lesson-1',
      instructionalInstanceId: plan.lessonIntents[0].instructionalInstanceId,
      instructionalInstance: structuredClone(plan.lessonIntents[0].instructionalInstance),
      sourceFacts: [...relevantClaims, misleadingClaim],
      conceptProvenance: {
        source: 'algi-researched',
        fullyAnchored: true,
        citations: [
          exactCitation({
            id: 'linguistic-typology',
            title: 'Linguistic typology',
            topic: 'Cross-linguistic grammatical comparison',
            claims: relevantClaims,
          }),
          exactCitation({
            id: 'programming-language-comparison',
            title: 'Comparison of programming languages',
            topic: 'Computer programming language design',
            claims: [misleadingClaim],
          }),
        ],
      },
    };

    const contract = createScionEvidenceAuthorityContract({
      lessonIndices: [0],
      evidenceOverlay: { byLessonId: { 'lesson-1': researched } },
      instructionalPlan: plan,
    });

    expect(contract.status).toBe('admitted');
    expect(contract.byLessonId['lesson-1'].claims.map((claim) => claim.text)).toEqual(relevantClaims);
    expect(contract.byLessonId['lesson-1'].sources.map((source) => source.title)).toEqual(['Linguistic typology']);
    expect(contract.byLessonId['lesson-1'].atomAdmission.rejectedAtoms).toContainEqual({
      textSha256: sha256HexSync(misleadingClaim),
      sourceIds: ['programming-language-comparison'],
      reason: 'source-identity-scope-mismatch',
    });
  });

  it('does not sign historical reconstruction as typological structural comparison', () => {
    const plan = instancePlan({
      title: 'Cross-Linguistic Comparison',
      concept: 'Typological comparison of grammatical structures',
      objective: 'Compare attested grammatical structures and justify one bounded cross-linguistic claim.',
    });
    const historicalClaims = [
      'Comparative linguistics compares languages to establish their historical relatedness.',
      'Comparative reconstruction proposes features of an unattested proto-language.',
      'An asterisk distinguishes reconstructed forms from forms attested in surviving texts.',
    ];
    const researched = {
      lessonId: 'lesson-1',
      instructionalInstanceId: plan.lessonIntents[0].instructionalInstanceId,
      instructionalInstance: structuredClone(plan.lessonIntents[0].instructionalInstance),
      sourceFacts: historicalClaims,
      conceptProvenance: {
        source: 'algi-researched',
        fullyAnchored: true,
        citations: [
          exactCitation({
            id: 'comparative-linguistics',
            title: 'Comparative linguistics',
            topic: 'Cross-Linguistic Comparison',
            claims: historicalClaims,
          }),
        ],
      },
    };

    const contract = createScionEvidenceAuthorityContract({
      lessonIndices: [0],
      evidenceOverlay: { byLessonId: { 'lesson-1': researched } },
      instructionalPlan: plan,
    });

    expect(contract.status).toBe('needs-evidence');
    expect(contract.byLessonId['lesson-1']).toMatchObject({
      status: 'needs-evidence',
      claims: [],
      sources: [],
    });
    expect(contract.byLessonId['lesson-1'].admissionDiagnostics.researched.reasons).toContain(
      'source-identity-scope-mismatch',
    );
  });

  it('rejects a payload that carries a fresh receipt for a different instructional instance', () => {
    const sourcePlan = instancePlan({
      title: 'Linguistic Evidence',
      concept: 'Minimal pair evidence',
      objective: 'Analyze a minimal pair and justify one bounded contrast claim.',
    });
    const targetPlan = instancePlan({
      title: 'Probability Sampling',
      concept: 'Probability sample',
      objective: 'Construct a probability sample and audit one selection risk.',
    });
    const claims = [
      'A probability sample uses a known selection mechanism for population units.',
      'A sampling frame identifies the units available to the selection procedure.',
      'Nonresponse can create a difference between selected units and observed units.',
    ];
    const crossedPayload = {
      lessonId: 'lesson-1',
      instructionalInstanceId: sourcePlan.lessonIntents[0].instructionalInstanceId,
      instructionalInstance: structuredClone(sourcePlan.lessonIntents[0].instructionalInstance),
      sourceFacts: claims,
      conceptProvenance: {
        source: 'algi-researched',
        fullyAnchored: true,
        citations: [
          exactCitation({ id: 'sampling', title: 'Probability sampling', topic: 'Probability sample', claims }),
        ],
      },
    };

    const contract = createScionEvidenceAuthorityContract({
      lessonIndices: [0],
      evidenceOverlay: { byLessonId: { 'lesson-1': crossedPayload } },
      instructionalPlan: targetPlan,
    });

    expect(contract.status).toBe('needs-evidence');
    expect(contract.admittedLessonIds).toEqual([]);
  });

  it('removes rejected shipped payloads before a targeted recovery pass', () => {
    const retained = { lessonId: 'lesson-2', facts: ['retained'] };
    expect(
      excludeRejectedEvidenceSeeds(
        {
          'lesson-1': { lessonId: 'lesson-1', facts: ['already rejected'] },
          'lesson-2': retained,
          'lesson-3': { lessonId: 'lesson-3', facts: ['already rejected'] },
        },
        [0, 2],
      ),
    ).toEqual({ 'lesson-2': retained });
  });

  it('merges one bounded recovery overlay without losing earlier admitted lessons', () => {
    const merged = mergeScionEvidenceOverlays(
      {
        protocol: 'scion-evidence-prepass-v1',
        byLessonId: { 'lesson-1': { lessonId: 'lesson-1' } },
        admitted: 1,
        requested: 2,
        uncovered: ['lesson-2'],
        researched: 1,
        cachedResearch: 0,
        researchReceipt: { attempt: 1 },
      },
      {
        protocol: 'scion-evidence-prepass-v1',
        byLessonId: { 'lesson-2': { lessonId: 'lesson-2' } },
        admitted: 1,
        requested: 1,
        uncovered: [],
        researched: 1,
        cachedResearch: 0,
        researchReceipt: { attempt: 2 },
      },
    );

    expect(Object.keys(merged.byLessonId)).toEqual(['lesson-1', 'lesson-2']);
    expect(merged).toMatchObject({ admitted: 2, requested: 2, uncovered: [], researched: 2 });
    expect(merged.researchReceipts).toEqual([{ attempt: 1 }, { attempt: 2 }]);
  });

  it('materializes admitted ledgers before model drafting so rejected output cannot erase source coverage', () => {
    const admittedEvidence = scionEvidenceLessonFromComposedPayload(payload({ lessonId: 'lesson-1' }));
    const lessonContent = materializeScionEvidenceLessonContent({
      byLessonId: { 'lesson-1': admittedEvidence },
    });

    expect(lessonContent['lesson-1']).toMatchObject({
      lessonId: 'lesson-1',
      enrichmentSource: 'scion-source-researched',
      sourceFactAuthority: 'verified-open-research',
      evidenceRecoveryReceipt: {
        status: 'exact-ledger-restored',
      },
    });
    expect(lessonContent['lesson-1'].kernel.facts).toEqual(admittedEvidence.sourceFacts);
    expect(lessonContent['lesson-1'].conceptProvenance.citations).toHaveLength(1);
  });

  it('does not project structurally complete research when the lesson authority rejects it', () => {
    const rejectedEvidence = scionEvidenceLessonFromComposedPayload(payload({ lessonId: 'lesson-1' }));
    const rejectedAuthority = {
      protocol: 'coursemapper-evidence-authority-v1',
      lessonId: 'lesson-1',
      status: 'needs-evidence',
      claims: [],
      sources: [],
      receiptSha256: '',
    };
    const overlay = { byLessonId: { 'lesson-1': rejectedEvidence } };
    const previous = { kernel: { facts: ['Keep the prior compiler-owned lesson content.'] } };
    const candidate = { kernel: { facts: ['Keep the new compiler-owned lesson content.'] } };

    expect(materializeScionEvidenceLessonContent(overlay, { 'lesson-1': rejectedAuthority })).toEqual({});
    const selected = selectScionEvidenceCandidate(
      overlay,
      'lesson-1',
      previous,
      candidate,
      (_previous, next) => next,
      rejectedAuthority,
    );
    expect(selected).toMatchObject({
      sourceFactAuthority: 'model-provisional',
      enrichmentSource: 'scion-model-provisional',
      kernel: { provenance: { authority: 'model-provisional', copiedFactsVerbatim: false } },
      semanticAdmissionReceipt: {
        protocol: 'scion-evidence-authority-quarantine-v1',
        status: 'model-provisional',
      },
    });
    expect(selected.kernel.facts).toEqual(candidate.kernel.facts);
    expect(bindScionEvidenceProvenance(overlay, 'lesson-1', candidate, rejectedAuthority)).toMatchObject({
      sourceFactAuthority: 'model-provisional',
      conceptProvenance: { authority: 'model-provisional', fullyAnchored: false, citations: [] },
    });
    expect(bindScionEvidenceProvenance({ byLessonId: {} }, 'lesson-1', candidate, rejectedAuthority)).toMatchObject({
      sourceFactAuthority: 'model-provisional',
    });
  });

  it('turns only exact fully anchored claims into draft authority', () => {
    const admittedEvidence = scionEvidenceLessonFromComposedPayload(payload({ lessonId: 'lesson-1' }));
    const contract = createScionEvidenceAuthorityContract({
      lessonIndices: [0, 1],
      evidenceOverlay: { byLessonId: { 'lesson-1': admittedEvidence } },
    });

    expect(contract).toMatchObject({
      protocol: 'coursemapper-governing-source-contract-v1',
      status: 'needs-evidence',
      requestedLessonCount: 2,
      admittedLessonIds: ['lesson-1'],
      receiptSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(contract.byLessonId['lesson-1']).toMatchObject({
      status: 'admitted',
      authorityKind: 'verified-open-research',
      receiptSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(contract.byLessonId['lesson-1'].claims).toHaveLength(9);
    expect(contract.byLessonId['lesson-1'].claims).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          text: 'Contextual inquiry: A field method.',
          claimRole: 'definition',
        }),
        expect.objectContaining({
          text: 'The admitted passage.',
          claimRole: 'source-passage',
        }),
      ]),
    );
    expect(contract.byLessonId['lesson-2']).toMatchObject({
      status: 'needs-evidence',
      claims: [],
      sources: [],
    });
  });

  it('binds exact supported claims to their individual source receipts', () => {
    const firstFact = 'The first verified source supports this exact lesson-specific teaching claim.';
    const secondFact = 'The second verified source supports a different exact teaching claim.';
    const makeCitation = (id, claim) => ({
      id,
      displayTitle: `Source ${id}`,
      sourceUrl: `https://example.edu/${id}`,
      license: 'CC BY 4.0',
      supportReceipt: {
        status: 'passed',
        checks: [
          {
            sourceId: id,
            quote: claim,
            claim,
            quoteInSnapshot: true,
            entailed: true,
            semanticSupport: true,
          },
        ],
      },
    });
    const researched = scionEvidenceLessonFromComposedPayload(
      payload({
        lessonId: 'lesson-1',
        facts: [firstFact, secondFact, 'A third exact fact keeps the evidence ledger structurally complete.'],
        keyTerms: [],
        conceptProvenance: {
          source: 'algi-researched',
          fullyAnchored: true,
          citations: [makeCitation('source-a', firstFact), makeCitation('source-b', secondFact)],
        },
      }),
    );
    const contract = createScionEvidenceAuthorityContract({
      lessonIndices: [0],
      evidenceOverlay: { byLessonId: { 'lesson-1': researched } },
    });

    const claims = contract.byLessonId['lesson-1'].claims;
    expect(claims.find((claim) => claim.text === firstFact)?.sourceIds).toEqual(['source-a']);
    expect(claims.find((claim) => claim.text === secondFact)?.sourceIds).toEqual(['source-b']);
  });

  it('selects source-diverse facts from lesson-identity sources and excludes incidental domain matches', () => {
    const claims = {
      language: [
        'Language change unfolds through variation in which older and newer forms can coexist.',
        'Historical comparison can identify systematic differences between earlier and later language states.',
      ],
      sound: [
        'A sound change alters pronunciation within a language across time.',
        'Regular sound change is expected to apply whenever its structural conditions are met.',
      ],
      planning: ['Language planning is a deliberate effort to influence language use in a community.'],
    };
    const citation = (id, title, sourceClaims) => ({
      id,
      displayTitle: title,
      sourceUrl: `https://example.edu/${id}`,
      license: 'CC BY 4.0',
      supportReceipt: {
        status: 'passed',
        checks: sourceClaims.map((claim) => ({
          sourceId: id,
          claim,
          quote: claim,
          quoteInSnapshot: true,
          entailed: true,
          semanticSupport: true,
        })),
      },
    });
    const lesson = scionEvidenceLessonFromComposedPayload(
      payload({
        lessonId: 'lesson-10',
        facts: [...claims.planning, ...claims.language, ...claims.sound],
        keyTerms: [],
        conceptProvenance: {
          source: 'algi-researched',
          fullyAnchored: true,
          citations: [
            citation('language-change', 'Language change', claims.language),
            citation('sound-change', 'Sound change', claims.sound),
            citation('language-planning', 'Language planning', claims.planning),
          ],
        },
      }),
      {
        title: 'Language Change',
        topics: ['Sound Change Mechanisms'],
        objectives: ['Compare systematic changes over time'],
        evidenceIntent: ['Use attested historical forms'],
      },
    );

    expect(lesson.sourceFacts).toEqual(expect.arrayContaining([claims.language[0], claims.sound[0]]));
    expect(lesson.sourceFacts).not.toContain(claims.planning[0]);
  });

  it('rejects source-valid research that does not match the approved lesson intent', () => {
    const researched = scionEvidenceLessonFromComposedPayload(payload({ lessonId: 'lesson-1' }));
    const contract = createScionEvidenceAuthorityContract({
      lessonIndices: [0],
      evidenceOverlay: { byLessonId: { 'lesson-1': researched } },
      instructionalPlan: {
        lessonIntents: [
          {
            id: 'lesson-1',
            title: 'Two-Way Tables',
            focusConcepts: ['Two-Way Tables'],
            targetObjectives: ['Compare conditional proportions for two categorical variables.'],
            learnerAction: 'Compare two categorical distributions and justify one bounded association claim.',
            expectedEvidence: {
              artifact: 'two-way table analysis',
              evidenceRequirement: 'Show the conditional proportions used in the comparison.',
              successCriteria: ['Use the correct denominator.', 'Do not infer causation.'],
            },
          },
        ],
      },
    });

    expect(contract.status).toBe('needs-evidence');
    expect(contract.byLessonId['lesson-1'].admissionDiagnostics.researched).toMatchObject({
      reasons: expect.arrayContaining(['lesson-intent-semantic-mismatch']),
      intentAdmission: { status: 'failed', conceptMatches: 0, claimMatches: 0 },
    });
  });

  it('admits a source-anchored claim ledger without requiring a duplicate glossary row', () => {
    const contrastFacts = [
      'Contrast is the difference in luminance or color that makes an object distinguishable from its background.',
      'Increasing contrast in one part of a bounded image can reduce contrast elsewhere.',
      'The maximum contrast of an image is commonly described by its contrast ratio or dynamic range.',
    ];
    const researched = scionEvidenceLessonFromComposedPayload(
      payload({
        lessonId: 'lesson-1',
        keyTerms: [],
        sourceConcepts: [],
        facts: contrastFacts,
        conceptProvenance: {
          source: 'algi-researched',
          fullyAnchored: true,
          citations: [
            exactCitation({
              id: 'color-contrast',
              title: 'Color contrast',
              topic: 'Color and contrast',
              claims: contrastFacts,
            }),
          ],
        },
      }),
    );
    const contract = createScionEvidenceAuthorityContract({
      lessonIndices: [0],
      evidenceOverlay: { byLessonId: { 'lesson-1': researched } },
      instructionalPlan: {
        lessonIntents: [
          {
            id: 'lesson-1',
            title: 'Color and contrast',
            focusConcepts: ['Color and contrast'],
            targetObjectives: ['Analyze how contrast changes a visual interpretation.'],
            learnerAction: 'Annotate the visible contrast evidence for one claim.',
            expectedEvidence: {
              artifact: 'contrast annotation',
              evidenceRequirement: 'Cite the visible contrast evidence.',
              successCriteria: ['Name the contrast feature.', 'Bound the interpretation.'],
            },
          },
        ],
      },
    });

    expect(contract.status).toBe('admitted');
    expect(contract.byLessonId['lesson-1'].intentAdmission).toMatchObject({
      status: 'passed',
      admissionBasis: 'claim-ledger',
      conceptMatches: 0,
      claimMatches: 3,
    });
  });

  it('admits exact verified passages when their verified source identity matches the lesson', () => {
    const verifiedClaims = [
      'Each observation belongs to exactly one interval when bin boundaries are defined consistently.',
      'Changing interval width can make different features of the same distribution more or less visible.',
      'Relative frequencies preserve the shape of a frequency display while expressing each bin as a proportion.',
    ];
    const researched = scionEvidenceLessonFromComposedPayload(
      payload({
        lessonId: 'lesson-1',
        facts: verifiedClaims,
        keyTerms: [],
        conceptProvenance: {
          source: 'algi-researched',
          fullyAnchored: true,
          citations: [
            {
              id: 'wikipedia:histogram',
              displayTitle: 'Histogram',
              sourceUrl: 'https://en.wikipedia.org/wiki/Histogram',
              license: 'CC BY-SA 4.0',
              attribution: 'Wikipedia contributors',
              provider: 'wikipedia',
              topic: 'Histogram',
              supportReceipt: {
                status: 'passed',
                checks: verifiedClaims.map((claim) => ({
                  sourceId: 'wikipedia:histogram',
                  quote: claim,
                  claim,
                  quoteInSnapshot: true,
                  entailed: true,
                  semanticSupport: true,
                })),
              },
            },
          ],
        },
      }),
    );
    const contract = createScionEvidenceAuthorityContract({
      lessonIndices: [0],
      evidenceOverlay: { byLessonId: { 'lesson-1': researched } },
      instructionalPlan: {
        lessonIntents: [
          {
            id: 'lesson-1',
            title: 'Histograms',
            focusConcepts: ['Histograms'],
            targetObjectives: ['Interpret the visible shape of a quantitative distribution.'],
            learnerAction: 'Compare two histogram designs and justify the more faithful display.',
            expectedEvidence: {
              artifact: 'annotated histogram comparison',
              evidenceRequirement: 'Show the distribution feature used in each interpretation.',
              successCriteria: ['Use the same data.', 'Name one limitation.'],
            },
          },
        ],
      },
    });

    expect(contract.status).toBe('admitted');
    expect(contract.byLessonId['lesson-1'].intentAdmission).toMatchObject({
      status: 'passed',
      admissionBasis: 'verified-source-identity',
      conceptMatches: 0,
      claimMatches: 0,
      sourceIdentityMatches: 1,
    });
  });

  it('uses the frozen evidence operation to bind a concrete source to a broad lesson identity', () => {
    const verifiedClaims = [
      'A minimal pair consists of two words distinguished by one sound in the same position.',
      'Minimal-pair comparison provides observable evidence that the contrasting sounds distinguish word forms.',
      'One minimal set supports a bounded contrast claim but does not describe every variety of a language.',
    ];
    const researched = scionEvidenceLessonFromComposedPayload(
      payload({
        lessonId: 'lesson-1',
        facts: verifiedClaims,
        keyTerms: [],
        conceptProvenance: {
          source: 'algi-researched',
          fullyAnchored: true,
          citations: [
            {
              id: 'wikipedia:minimal-pair',
              displayTitle: 'Minimal pair',
              sourceUrl: 'https://en.wikipedia.org/wiki/Minimal_pair',
              license: 'CC BY-SA 4.0',
              topic: 'English minimal sets example',
              supportReceipt: {
                status: 'passed',
                checks: verifiedClaims.map((claim) => ({
                  sourceId: 'wikipedia:minimal-pair',
                  quote: claim,
                  claim,
                  quoteInSnapshot: true,
                  entailed: true,
                  semanticSupport: true,
                })),
              },
            },
          ],
        },
      }),
    );
    const contract = createScionEvidenceAuthorityContract({
      lessonIndices: [0],
      evidenceOverlay: { byLessonId: { 'lesson-1': researched } },
      instructionalPlan: {
        lessonIntents: [
          {
            id: 'lesson-1',
            title: 'Linguistic Evidence Basis',
            focusConcepts: ['Defining Linguistic Evidence'],
            learnerAction: 'Separate observation from interpretation for an English minimal sets example.',
            expectedEvidence: {
              artifact: 'source-bound evidence audit',
              evidenceRequirement: 'Cite the English minimal sets example and state one transfer boundary.',
              successCriteria: ['Name the visible minimal contrast.', 'State what the record cannot establish.'],
            },
          },
        ],
      },
    });

    expect(contract.status).toBe('admitted');
    expect(contract.byLessonId['lesson-1'].intentAdmission).toMatchObject({
      status: 'passed',
      admissionBasis: 'claim-ledger',
    });
  });

  it('carries the hash-bound lesson authority into the compiler-facing evidence payload', () => {
    const researched = scionEvidenceLessonFromComposedPayload(payload({ lessonId: 'lesson-1' }));
    const plan = {
      lessonIntents: [
        {
          id: 'lesson-1',
          title: 'Contextual Inquiry',
          focusConcepts: ['Contextual inquiry', 'Field note'],
          targetObjectives: ['Distinguish observation from interpretation in a field record.'],
          learnerAction: 'Audit a field note against an observed event.',
          expectedEvidence: {
            artifact: 'field evidence memo',
            evidenceRequirement: 'Separate the observed event from the later interpretation.',
            successCriteria: ['Cite the event.', 'Bound the interpretation.'],
          },
        },
      ],
    };
    const contract = createScionEvidenceAuthorityContract({
      lessonIndices: [0],
      evidenceOverlay: { byLessonId: { 'lesson-1': researched } },
      instructionalPlan: plan,
    });
    const lessonContent = materializeScionEvidenceLessonContent(
      { byLessonId: { 'lesson-1': researched } },
      contract.byLessonId,
    );

    expect(contract.status).toBe('admitted');
    expect(lessonContent['lesson-1'].evidenceAuthorityReceipt).toEqual(contract.byLessonId['lesson-1']);
  });

  it('does not let acquisition metadata self-declare an authoritative source class', () => {
    const selfDeclared = payload({
      lessonId: 'lesson-1',
      sourceFactAuthority: 'verified-open-research',
      evidenceOrigin: 'verified-open-research',
      conceptProvenance: {
        ...payload().conceptProvenance,
        source: 'model-authored',
      },
    });
    const contract = createScionEvidenceAuthorityContract({
      lessonIndices: [0],
      genomeLessonContent: { 'lesson-1': selfDeclared },
    });

    expect(contract.status).toBe('needs-evidence');
    expect(contract.admittedLessonIds).toEqual([]);
    expect(contract.byLessonId['lesson-1']).toMatchObject({
      status: 'needs-evidence',
      claims: [],
    });
  });

  it('authorizes the exact union when research and the shipped library are independently admitted', () => {
    const researched = scionEvidenceLessonFromComposedPayload(payload({ lessonId: 'lesson-1' }));
    const linkedFacts = [
      'A histogram represents a quantitative distribution with adjacent bars.',
      'A box plot summarizes the median, quartiles, and potential outliers.',
      'Relative frequency divides a category count by the total observation count.',
    ];
    const linked = {
      lessonId: 'lesson-1',
      facts: linkedFacts,
      conceptProvenance: {
        source: 'genome-linked',
        fullyAnchored: true,
        citations: [
          {
            displayTitle: 'OpenStax Introductory Statistics — Key Terms',
            sourceUrl: 'https://openstax.org/books/introductory-statistics/pages/2-key-terms',
            license: 'CC BY 4.0',
            attribution: 'OpenStax',
          },
        ],
      },
    };
    const contract = createScionEvidenceAuthorityContract({
      lessonIndices: [0],
      evidenceOverlay: { byLessonId: { 'lesson-1': researched } },
      genomeLessonContent: { 'lesson-1': linked },
    });

    expect(contract.status).toBe('admitted');
    expect(contract.byLessonId['lesson-1']).toMatchObject({
      status: 'admitted',
      authorityKind: 'composite-source-authority',
      predecessorAuthorityReceipts: [expect.stringMatching(/^[a-f0-9]{64}$/), expect.stringMatching(/^[a-f0-9]{64}$/)],
    });
    expect(contract.byLessonId['lesson-1'].claims.map((claim) => claim.text)).toEqual(
      expect.arrayContaining([...researched.sourceFacts, ...linkedFacts]),
    );
    expect(new Set(contract.byLessonId['lesson-1'].sources.map((source) => source.id)).size).toBe(2);
  });

  it('rejects a direct evidence authority when its claim changes after the receipt was issued', () => {
    const exactPayload = {
      protocol: 'coursemapper-evidence-authority-v1',
      lessonId: 'lesson-1',
      status: 'admitted',
      authorityKind: 'curated-authentic-language-evidence',
      claims: [
        {
          id: 'claim-1',
          text: 'The source-bound example preserves its exact form, gloss, translation, and locator.',
          sourceIds: ['source-1'],
        },
      ],
      sources: [{ id: 'source-1', title: 'Verified language record' }],
    };
    const authority = {
      ...exactPayload,
      receiptSha256: sha256HexSync(JSON.stringify(exactPayload)),
    };
    authority.claims[0].text = 'A fluent replacement claim that was never admitted.';

    const contract = createScionEvidenceAuthorityContract({
      lessonIndices: [0],
      authenticLanguageEvidenceAuthorityByLessonId: { 'lesson-1': authority },
    });

    expect(contract.status).toBe('needs-evidence');
    expect(contract.byLessonId['lesson-1'].admissionDiagnostics.authenticLanguageEvidence).toEqual({
      status: 'rejected',
      reasons: ['authority-receipt-missing-or-stale'],
    });
  });

  it('keeps a fresh but unrelated authentic-language authority supplemental', () => {
    const exactPayload = {
      protocol: 'coursemapper-evidence-authority-v1',
      lessonId: 'lesson-1',
      status: 'admitted',
      authorityKind: 'curated-authentic-language-evidence',
      admissionPolicyVersion: 'scion-authentic-language-evidence-admission-v1',
      claims: [
        {
          id: 'claim-1',
          text: 'The ceremonial greeting uses a source-bound form, gloss, and translation.',
          sourceIds: ['source-1'],
        },
        {
          id: 'claim-2',
          text: 'The answer key identifies the greeting particle in the documented utterance.',
          sourceIds: ['source-1'],
        },
      ],
      sources: [
        {
          id: 'source-1',
          title: 'Documented ceremonial greetings',
          sourceRecordSha256: 'a'.repeat(64),
        },
      ],
      authenticEvidenceReceipt: {
        protocol: 'scion-authentic-language-evidence-transaction-v1',
        taskContractSha256: 'b'.repeat(64),
        payloadSha256: 'c'.repeat(64),
      },
    };
    const authority = {
      ...exactPayload,
      receiptSha256: sha256HexSync(JSON.stringify(exactPayload)),
    };
    const contract = createScionEvidenceAuthorityContract({
      lessonIndices: [0],
      authenticLanguageEvidenceAuthorityByLessonId: { 'lesson-1': authority },
      instructionalPlan: instancePlan({
        title: 'Two-Way Tables',
        concept: 'Conditional proportions',
        objective: 'Calculate conditional proportions and interpret a bounded association.',
      }),
    });

    expect(contract.status).toBe('needs-evidence');
    expect(contract.byLessonId['lesson-1'].admissionDiagnostics.authenticLanguageEvidence).toEqual({
      status: 'supplemental-only',
      reasons: ['lesson-intent-semantic-mismatch'],
    });
  });

  it('does not admit a shipped data-provenance kernel to a two-way-tables lesson on generic verbs', () => {
    const linked = {
      lessonId: 'lesson-1',
      facts: [
        'Inspecting provenance helps determine whether information is trustworthy.',
        'A provenance review identifies the people and activities that shaped the dataset.',
        'Provenance records provide context for later interpretation.',
      ],
      conceptProvenance: {
        source: 'genome-linked',
        fullyAnchored: true,
        citations: [
          {
            displayTitle: 'W3C Provenance Data Model',
            sourceUrl: 'https://www.w3.org/TR/prov-dm/',
            license: 'W3C Document License',
          },
        ],
      },
    };
    const contract = createScionEvidenceAuthorityContract({
      lessonIndices: [0],
      genomeLessonContent: { 'lesson-1': linked },
      instructionalPlan: {
        lessonIntents: [
          {
            id: 'lesson-1',
            title: 'Two-Way Tables',
            focusConcepts: ['Contingency table', 'Categorical variable'],
            learnerAction: 'Inspect the table and interpret one bounded association.',
          },
        ],
      },
    });

    expect(contract.status).toBe('needs-evidence');
    expect(contract.byLessonId['lesson-1'].admissionDiagnostics.shipped.reasons).toContain(
      'lesson-intent-semantic-mismatch',
    );
  });

  it('retains exact glossary definitions when a research receipt has many passage claims', () => {
    const checks = Array.from({ length: 30 }, (_, index) => ({
      sourceId: 'doaj:contextual-inquiry',
      locator: `abstract-${index + 1}`,
      quote: `Verified passage ${index + 1} describes a bounded contextual inquiry observation in its source record.`,
      claim: `Verified passage ${index + 1} describes a bounded contextual inquiry observation in its source record.`,
      quoteInSnapshot: true,
      entailed: true,
      semanticSupport: true,
    }));
    const crowded = payload({
      lessonId: 'lesson-1',
      conceptProvenance: {
        ...payload().conceptProvenance,
        citations: [
          {
            ...payload().conceptProvenance.citations[0],
            supportReceipt: {
              ...payload().conceptProvenance.citations[0].supportReceipt,
              checks,
            },
          },
        ],
      },
    });
    const contract = createScionEvidenceAuthorityContract({
      lessonIndices: [0],
      evidenceOverlay: { byLessonId: { 'lesson-1': scionEvidenceLessonFromComposedPayload(crowded) } },
    });

    expect(contract.byLessonId['lesson-1'].claims).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ text: 'Contextual inquiry: A field method.', claimRole: 'definition' }),
        expect.objectContaining({ text: checks[29].claim, claimRole: 'source-passage' }),
      ]),
    );
  });

  it('gives evidence discovery the lesson topic, objectives, and assessment context', () => {
    expect(
      buildScionEvidenceLessonPrompt(
        {
          lessons: [
            {
              title: 'Policy implementation evidence',
              sections: [
                {
                  topicSection: 'Administrative data and causal claims',
                  learningGoals: 'Distinguish implementation from outcome evidence',
                  learningObjectives: 'Audit one policy claim against its supporting dataset',
                  weeklyAssessments: 'Write a bounded evidence memo',
                  supportingResources: 'Inspectable administrative dataset with provenance.',
                  evaluateDesign: 'Check that the claim uses the same evidence as the memo.',
                },
              ],
            },
          ],
        },
        0,
      ),
    ).toEqual({
      lessonId: 'lesson-1',
      title: 'Policy implementation evidence',
      topics: ['Administrative data and causal claims', 'Distinguish implementation from outcome evidence'],
      objectives: ['Audit one policy claim against its supporting dataset', 'Write a bounded evidence memo'],
      evidenceIntent: [
        'Inspectable administrative dataset with provenance.',
        'Check that the claim uses the same evidence as the memo.',
      ],
    });
  });

  it('asks research from the frozen instructional intent instead of only the stale course-map prose', () => {
    const prompt = buildScionEvidenceLessonPrompt(
      {
        lessons: [
          {
            title: 'Two-Way Tables',
            sections: [
              {
                topicSection: 'Two-Way Tables Analysis',
                learningObjectives: 'Apply the main concepts to a course task.',
              },
            ],
          },
        ],
      },
      0,
      {
        id: 'lesson-1',
        focusConcepts: ['Two-Way Tables', 'Conditional proportions'],
        targetObjectives: ['Compare conditional proportions for two categorical variables.'],
        learnerAction: 'Name the conditioning denominator and state a noncausal association conclusion.',
        expectedEvidence: {
          evidenceRequirement: 'four cell counts, row totals, conditional proportions, and a causal boundary',
          successCriteria: ['Uses compatible conditioning denominators.'],
        },
      },
    );

    expect(prompt.topics).toEqual(['Two-Way Tables', 'Conditional proportions', 'Two-Way Tables Analysis']);
    expect(prompt.objectives[0]).toMatch(/two categorical variables/i);
    expect(prompt.evidenceIntent.join(' ')).toMatch(/conditioning denominator/i);
    expect(prompt.evidenceIntent.join(' ')).toMatch(/four cell counts/i);
  });

  it('translates fully anchored composed evidence into Scion’s immutable source-ledger contract', () => {
    const lesson = scionEvidenceLessonFromComposedPayload(payload());
    expect(lesson).toMatchObject({
      lessonId: 'lesson-2',
      sourceFactPolicy: 'numbered-source-ledger-v1',
      evidenceOrigin: 'verified-open-research',
    });
    expect(lesson.sourceFacts).toHaveLength(5);
    expect(lesson.sourceConcepts).toHaveLength(3);
    expect(lesson.sourceLedgerAttribution.author).toBe('Example University');
    expect(lesson.scionEvidenceReceipts[0].sourceUrl).toBe('https://example.edu/contextual-inquiry');
    expect(lesson.scionEvidenceReceipts[0]).toMatchObject({
      id: 'doaj:contextual-inquiry',
      provider: 'doaj',
      topic: 'Contextual inquiry',
      sourceTier: 1,
      supportReceipt: {
        checks: [
          expect.objectContaining({
            sourceId: 'doaj:contextual-inquiry',
          }),
        ],
      },
    });
  });

  it('rejects evidence without complete anchoring instead of laundering it through Scion', () => {
    expect(
      scionEvidenceLessonFromComposedPayload(
        payload({ conceptProvenance: { ...payload().conceptProvenance, fullyAnchored: false } }),
      ),
    ).toBeNull();
  });

  it('fails open on malformed optional composer output and reports honest coverage', () => {
    const overlay = createScionEvidenceOverlay({
      text: '{broken',
      requested: 2,
      uncovered: ['lesson-1', 'lesson-2'],
    });
    expect(overlay.admitted).toBe(0);
    expect(overlay.requested).toBe(2);
    expect(overlay.uncovered).toEqual(['lesson-1', 'lesson-2']);
  });

  it('keeps only bounded counts in the compiler-facing evidence summary', () => {
    expect(
      summarizeScionEvidenceOverlay({
        protocol: 'scion-evidence-prepass-v1',
        requested: 2,
        admitted: 1,
        researched: 1,
        cachedResearch: 0,
        uncovered: ['lesson-2'],
        byLessonId: { 'lesson-1': payload() },
        researchReceipt: { queries: ['private implementation detail'] },
      }),
    ).toEqual({
      protocol: 'scion-evidence-prepass-v1',
      requested: 2,
      admitted: 1,
      researched: 1,
      cachedResearch: 0,
      uncovered: ['lesson-2'],
    });
  });

  it('names every admitted lesson that must override the older content-source shortcut', () => {
    expect(
      scionEvidenceLessonIds({
        byLessonId: {
          'lesson-1': payload({ lessonId: 'lesson-1' }),
          'lesson-4': payload({ lessonId: 'lesson-4' }),
        },
      }),
    ).toEqual(['lesson-1', 'lesson-4']);
  });

  it('selects researched facts over a richer-looking older ledger and binds only exact provenance', () => {
    const evidence = scionEvidenceLessonFromComposedPayload(payload());
    const overlay = { byLessonId: { 'lesson-2': evidence } };
    const oldPayload = {
      kernel: {
        facts: [
          'An older generally related claim remains well formed but does not come from the current research ledger.',
          'A second older claim also has enough words and punctuation to look structurally complete.',
          'A third older claim proves why structure alone cannot decide provenance identity.',
        ],
      },
    };
    const researchedPayload = { kernel: { facts: [...evidence.sourceFacts] } };
    const picked = selectScionEvidenceCandidate(overlay, 'lesson-2', oldPayload, researchedPayload, () => oldPayload);

    expect(picked).toBe(researchedPayload);
    expect(scionPayloadMatchesEvidence(evidence, researchedPayload)).toBe(true);
    expect(scionPayloadMatchesEvidence(evidence, oldPayload)).toBe(false);
  });

  it('restores the exact admitted ledger when both fluent candidates paraphrase or invent claims', () => {
    const evidence = scionEvidenceLessonFromComposedPayload(payload());
    const overlay = { byLessonId: { 'lesson-2': evidence } };
    const previous = {
      kernel: {
        facts: evidence.sourceFacts.map((fact) => fact.replace(/\.$/, ' in practice.')),
      },
      scenario: { setup: 'A plausible but unverified scenario.' },
    };
    const candidate = {
      kernel: {
        facts: [
          ...evidence.sourceFacts.slice(0, 4),
          'The model adds one reasonable claim that the admitted sources never established.',
        ],
      },
      quizItems: [{ question: 'An unsupported item must not survive the trust boundary.' }],
    };

    const selected = selectScionEvidenceCandidate(overlay, 'lesson-2', previous, candidate, () => candidate);

    expect(selected.kernel.facts).toEqual(evidence.sourceFacts);
    expect(selected.conceptProvenance).toEqual(evidence.conceptProvenance);
    expect(selected).not.toHaveProperty('scenario');
    expect(selected).not.toHaveProperty('quizItems');
    expect(selected.evidenceRecoveryReceipt).toMatchObject({
      status: 'exact-ledger-restored',
      admittedFactCount: 5,
      rejectedCandidateFieldNames: ['quizItems'],
    });
  });

  it('does not widen a thin research ledger with authority-only neighboring claims', () => {
    const evidence = {
      lessonId: 'lesson-2',
      evidenceOrigin: 'verified-open-research',
      sourceFacts: [
        'A corpus is a structured collection of language records.',
        'A reproducible corpus audit documents how records enter the sample.',
      ],
      sourceConcepts: [],
      conceptProvenance: { source: 'algi-researched', fullyAnchored: true, citations: [] },
    };
    const overlay = { byLessonId: { 'lesson-2': evidence } };
    const authority = {
      status: 'admitted',
      claims: [
        {
          id: 'claim-3',
          text: 'An annotation protocol defines the fields applied consistently to every selected record',
          sourceIds: ['curated-corpus-source'],
        },
      ],
    };

    const rejectedCandidate = { kernel: { facts: ['A fluent unsupported replacement must be rejected.'] } };
    const selected = selectScionEvidenceCandidate(
      overlay,
      'lesson-2',
      null,
      rejectedCandidate,
      (_previous, candidate) => candidate,
      authority,
    );

    expect(selected).toMatchObject({
      sourceFactAuthority: 'model-provisional',
      semanticAdmissionReceipt: { status: 'model-provisional' },
    });
    expect(selected.kernel.facts).not.toContain(authority.claims[0].text);
  });

  it('binds a compact exact subset but rejects one invented or paraphrased fact', () => {
    const evidence = scionEvidenceLessonFromComposedPayload(payload());
    const compact = { kernel: { facts: evidence.sourceFacts.slice(0, 4) } };
    const mixed = {
      kernel: {
        facts: [
          ...evidence.sourceFacts.slice(0, 3),
          'A plausible but unverified extra claim must not inherit the source citations.',
        ],
      },
    };

    expect(scionPayloadMatchesEvidence(evidence, compact)).toBe(true);
    expect(scionPayloadMatchesEvidence(evidence, mixed)).toBe(false);
  });

  it('gives shipped-source receipts only to an exact immutable fact ledger', () => {
    const composed = payload({
      conceptProvenance: { ...payload().conceptProvenance, source: 'genome-linked' },
    });
    const evidence = scionEvidenceLessonFromComposedPayload(composed);
    const overlay = { byLessonId: { 'lesson-2': evidence } };
    const exact = { kernel: { facts: [...evidence.sourceFacts] } };
    const mixed = {
      kernel: {
        facts: [
          ...evidence.sourceFacts.slice(0, 4),
          'A plausible substituted statement is not the source ledger that earned these citations.',
        ],
      },
    };

    expect(selectScionEvidenceCandidate(overlay, 'lesson-2', mixed, exact, () => mixed)).toBe(exact);
    expect(bindScionEvidenceProvenance(overlay, 'lesson-2', exact)).toMatchObject({
      enrichmentSource: 'scion-source-library',
      keyTerms: evidence.sourceConcepts,
      kernel: { keyTerms: evidence.sourceConcepts },
      conceptProvenance: evidence.conceptProvenance,
    });
    expect(bindScionEvidenceProvenance(overlay, 'lesson-2', mixed)).toMatchObject({
      kernel: { facts: evidence.sourceFacts },
      conceptProvenance: evidence.conceptProvenance,
      evidenceRecoveryReceipt: { status: 'exact-ledger-restored' },
    });
  });

  it('replaces model glossary claims with the exact source-anchored concepts before drafting', () => {
    const evidence = scionEvidenceLessonFromComposedPayload(payload());
    const overlay = { byLessonId: { 'lesson-2': evidence } };
    const candidate = {
      facts: evidence.sourceFacts.slice(0, 4),
      keyTerms: [{ tr: 'Invented term', df: 'A fluent but unsupported definition.' }],
    };

    const bound = bindScionEvidenceProvenance(overlay, 'lesson-2', candidate);
    expect(bound.keyTerms).toEqual(evidence.sourceConcepts);
    expect(bound.keyTerms).not.toEqual(candidate.keyTerms);
  });

  it('stays offline and reports uncovered lessons when no local evidence is available', async () => {
    const structuredPrompt = {
      courseName: 'Principles of Economics',
      lessons: [
        { lessonId: 'lesson-1', title: 'Price Elasticity of Demand' },
        { lessonId: 'lesson-2', title: 'Circular Flow of Income' },
      ],
    };
    const overlay = await prepareScionEvidenceLayer({
      structuredPrompt,
      researchEnabled: false,
    });
    expect(overlay.requested).toBe(2);
    expect(overlay.admitted).toBe(0);
    expect(overlay.researched).toBe(0);
    expect(overlay.uncovered).toEqual(['lesson-1', 'lesson-2']);
  });

  it('reports one product-neutral generation decision from the lazy evidence transaction', async () => {
    const events = [];
    const result = await prepareScionEvidenceForGeneration({
      courseMap: {
        courseName: 'Novel Local Course',
        lessons: [{ title: 'Counterfactual lattice gardening' }],
      },
      lessonIndices: [0],
      researchEnabled: false,
      recordEvent: (event) => events.push(event),
    });

    expect(result.stageDecision).toBe('ran (0/1 ledgers, on-device)');
    expect(result.summary).toMatchObject({ requested: 1, admitted: 0, researched: 0 });
    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'pipelineDecision',
        label: 'Scion evidence retrieval',
      }),
    );
    expect(JSON.stringify(events)).not.toMatch(/Algi/);
  });

  it('researches an authoritative-method gap even when the shipped genome payload is structurally complete', async () => {
    const result = await prepareScionEvidenceForGeneration({
      courseMap: {
        courseName: 'Digital Accessibility for Product Teams',
        lessons: [{ title: 'Evidence-based accessibility testing and remediation' }],
      },
      lessonIndices: [0],
      genomeLessonContent: {
        'lesson-1': {
          kernel: {
            facts: [
              'WCAG organizes accessibility around perceivable, operable, understandable, and robust principles.',
              'Usability sessions can reveal barriers that a conformance review does not expose.',
              'A reviewer should bound conclusions to the evidence collected from participants.',
            ],
          },
          conceptProvenance: {
            citations: [
              {
                displayTitle: 'WCAG 2.2',
                sourceUrl: 'https://www.w3.org/TR/WCAG22/',
                evidence: 'WCAG principles provide general accessibility guidance.',
                topic: 'WCAG principles',
              },
            ],
          },
        },
      },
      researchEnabled: false,
    });

    expect(result.stageDecision).toBe('ran (0/1 ledgers, on-device)');
    expect(result.summary).toMatchObject({ requested: 1 });
  });

  it('lets the authority contract force acquisition when a cache heuristic sees a complete payload', async () => {
    const result = await prepareScionEvidenceForGeneration({
      courseMap: {
        courseName: 'Local Methods Course',
        lessons: [{ title: 'Counterfactual lattice gardening' }],
      },
      lessonIndices: [0],
      authorityRequiredLessonIndices: [0],
      genomeLessonContent: {
        'lesson-1': {
          kernel: {
            facts: [
              'A complete-looking local claim can still lack a governing source receipt.',
              'A second complete-looking claim must not suppress authoritative evidence acquisition.',
              'A third complete-looking claim remains non-authoritative without an admitted source.',
            ],
          },
          conceptProvenance: { source: 'model-authored', fullyAnchored: false, citations: [] },
        },
      },
      researchEnabled: false,
    });

    expect(result.summary).toMatchObject({ requested: 1, admitted: 0 });
    expect(result.stageDecision).toBe('ran (0/1 ledgers, on-device)');
  });

  it('keeps the AppFlow handoff compact when no optional evidence is admitted', async () => {
    const result = await prepareScionEvidenceGenerationHandoff({
      courseMap: {
        courseName: 'Novel Local Course',
        lessons: [{ title: 'Counterfactual lattice gardening' }],
      },
      lessonIndices: [0],
    });

    expect(result.stageDecision).toBe(
      '0/1 lesson source authorities admitted for drafting · ran (0/1 ledgers, on-device)',
    );
    expect(result.promptOptions).toEqual({});
    expect(result.contentSourceOverrideLessonIds).toEqual([]);
    expect(result.knowledgeBackboneEvent).toBeNull();
    expect(result.bindProvenance('lesson-1', { facts: ['kept'] })).toMatchObject({
      facts: ['kept'],
      sourceFactAuthority: 'model-provisional',
    });
    expect(
      result.selectCandidate('lesson-1', { facts: ['old'] }, { facts: ['new'] }, (previous) => previous),
    ).toMatchObject({
      facts: ['old'],
      sourceFactAuthority: 'model-provisional',
    });
  });
});
