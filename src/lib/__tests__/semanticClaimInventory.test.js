import { describe, expect, it } from 'vitest';

import { buildInstructionalInstanceContract } from '../instructionalInstanceContract.js';
import { buildSemanticClaimInventory } from '../semanticClaimInventory.js';

const VERIFIED_DEFINITION = 'Head movement raises a syntactic head to a higher head position.';

function sourceLedger() {
  return [
    {
      id: 'source-1',
      supportReceipt: {
        sourceIdentityVerified: true,
        semanticAdmissionVerified: true,
        artifactVisibilityVerified: true,
        semanticSupport: true,
        checks: [
          {
            claimId: 'source-1:claim-1',
            claim: VERIFIED_DEFINITION,
            sourceId: 'source-1',
            locator: 'Head movement',
            sourcePassageSha256: 'a'.repeat(64),
            renderedLocation: 'Study Guides/Lesson 01 - Syntax - Study Guides.docx',
            sourceIdentityVerified: true,
            entailed: true,
            semanticAdmissionVerified: true,
            artifactVisibilityVerified: true,
            semanticSupport: true,
          },
        ],
      },
    },
  ];
}

describe('semantic claim inventory', () => {
  it('binds claims to the final evidence-grounded instructional instance', async () => {
    const intent = {
      id: 'lesson-1',
      lessonNumber: 1,
      title: 'Observation',
      focusConcepts: ['observation'],
      targetObjectives: ['Distinguish an observation from an inference.'],
      learnerAction: 'Classify one visible record.',
      expectedEvidence: {
        artifact: 'observation note',
        evidenceRequirement: 'one visible detail',
        successCriteria: ['Separates observation from inference.'],
      },
      evidenceNeedKind: 'operation-specimen',
    };
    const curriculum = buildInstructionalInstanceContract({
      course: { name: 'Evidence Studio', lessonCount: 1 },
      lessonIntents: [intent],
      planningAuthority: { phase: 'curriculum' },
    });
    const grounded = buildInstructionalInstanceContract({
      course: { name: 'Evidence Studio', lessonCount: 1 },
      lessonIntents: [intent],
      planningAuthority: { phase: 'evidence-grounded' },
    });
    const boundary = 'A compiler-verified observation record keeps the visible detail separate from the inference.';
    const inventory = await buildSemanticClaimInventory({
      courseGraph: {
        preDraftInstructionalPlan: { instructionalInstanceContract: curriculum },
        instructionalIntentGraph: { instructionalInstanceContract: grounded },
      },
      deliverables: {
        lessonPlans: {
          data: {
            lessonPlans: [
              {
                lessonNumber: 1,
                workedExample: {
                  protocol: 'coursemapper-operation-qualified-evidence-v1',
                  authority: 'compiler-verified-calculation',
                  boundary,
                },
              },
            ],
          },
        },
      },
      renderedArtifacts: [{ path: 'Lesson Plans/Lesson 01.docx', text: boundary }],
    });

    expect(curriculum.instances[0].instructionalInstanceId).not.toBe(grounded.instances[0].instructionalInstanceId);
    expect(inventory.items[0].instructionalInstanceId).toBe(grounded.instances[0].instructionalInstanceId);
  });

  it('admits a long exact clause split from a verified compound source sentence', async () => {
    const compound =
      'A descriptive statistic is a summary statistic that quantitatively describes a collection of information, while descriptive statistics is the process of using and analysing those statistics.';
    const clause = 'Descriptive statistics is the process of using and analysing those statistics.';
    const ledger = sourceLedger();
    ledger[0].supportReceipt.checks[0] = {
      ...ledger[0].supportReceipt.checks[0],
      claim: compound,
      renderedLocation: 'Study Guides/Lesson 01 - Statistics - Study Guides.docx',
    };
    const inventory = await buildSemanticClaimInventory({
      courseGraph: {
        enrichmentOverlay: {
          lessonContent: {
            'lesson-1': { sourceFactAuthority: 'verified-open-research', facts: [compound] },
          },
        },
      },
      sourceLedger: ledger,
      renderedArtifacts: [{ path: 'Study Guides/Lesson 01 - Statistics - Study Guides.docx', text: clause }],
    });

    expect(inventory.items).toContainEqual(
      expect.objectContaining({ surface: compound, status: 'verified', requiresSourcePassage: true }),
    );
  });

  it('excludes learner directions that mention claims or begin with study', async () => {
    const inventory = await buildSemanticClaimInventory({
      courseGraph: { enrichmentOverlay: { lessonContent: {} } },
      renderedArtifacts: [
        {
          path: 'Course FAQ/Lesson 01.docx',
          text: 'Those are the load-bearing claims — connect each one to the evidence explanation, and be ready to say what evidence supports it.',
        },
        {
          path: 'Slide Decks/Lesson 04.pptx',
          text: 'Study the native specimen, then annotate one feature or compare two paths; mark the exact feature that supports the observation.',
        },
        {
          path: 'Slide Decks/Lesson 09.pptx',
          text: 'Display this claim: For Language Acquisition, the tempting error is turning a supported observation into an unlimited conclusion.',
        },
      ],
      sourceLedger: [],
    });

    expect(inventory.items).toEqual([]);
  });

  it('excludes closed compiler check directions without exempting factual evidence-check prose', async () => {
    const sourceFact = 'Auditory perception shows how an acoustic signal can shape a listener interpretation.';
    const inventory = await buildSemanticClaimInventory({
      courseGraph: {
        enrichmentOverlay: {
          lessonContent: {
            'lesson-1': {
              sourceFactAuthority: 'verified-open-research',
              facts: [
                sourceFact,
                'Inference check: explain what Auditory Perception shows and what remains unobserved.',
                'Evidence check: locate Lexical Semantics and state the narrow claim it supports.',
                'Evidence check: Auditory perception shows how an acoustic signal can shape a listener interpretation.',
              ],
            },
          },
        },
      },
      renderedArtifacts: [
        {
          path: 'Slide Decks/Lesson 01 - Language - Slide Decks.pptx',
          text: [
            'Inference check: explain what Auditory Perception shows and what remains unobserved.',
            'Evidence check: locate Lexical Semantics and state the narrow claim it supports.',
            'Evidence check: Auditory perception shows how an acoustic signal can shape a listener interpretation.',
          ].join('\n'),
        },
      ],
      sourceLedger: [],
    });

    expect(inventory.items).toHaveLength(1);
    expect(inventory.items[0]).toEqual(
      expect.objectContaining({
        surface:
          'Evidence check: Auditory perception shows how an acoustic signal can shape a listener interpretation.',
        category: 'factualClaims',
        requiresSourcePassage: true,
        status: 'review-required',
      }),
    );
  });

  it('does not project repeated lesson content into another lesson artifact', async () => {
    const repeatedBoundary =
      'Accept a different supported convention only when the learner names it and applies it consistently.';
    const inventory = await buildSemanticClaimInventory({
      deliverables: {
        lessonPlans: {
          data: {
            lessonPlans: [
              {
                lessonNumber: 1,
                workedExample: {
                  protocol: 'coursemapper-operation-qualified-evidence-v1',
                  authority: 'compiler-verified-calculation',
                  boundary: repeatedBoundary,
                },
              },
              {
                lessonNumber: 2,
                workedExample: {
                  protocol: 'coursemapper-operation-qualified-evidence-v1',
                  authority: 'compiler-verified-calculation',
                  boundary: repeatedBoundary,
                },
              },
            ],
          },
        },
      },
      renderedArtifacts: [
        { path: 'Lesson Plans/Lesson 01 - First - Lesson Plans.docx', text: repeatedBoundary },
        { path: 'Lesson Plans/Lesson 02 - Second - Lesson Plans.docx', text: repeatedBoundary },
      ],
    });

    const rows = inventory.items.filter((item) => item.surface === repeatedBoundary);
    expect(rows).toHaveLength(2);
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ lessonNumber: 1, artifactPath: expect.stringContaining('Lesson 01') }),
        expect.objectContaining({ lessonNumber: 2, artifactPath: expect.stringContaining('Lesson 02') }),
      ]),
    );
    expect(rows.some((row) => row.lessonNumber === 1 && row.artifactPath.includes('Lesson 02'))).toBe(false);
    expect(rows.some((row) => row.lessonNumber === 2 && row.artifactPath.includes('Lesson 01'))).toBe(false);
  });

  it('does not project a quiz key into another artifact family that repeats the same fact', async () => {
    const repeatedKey = 'The sampling distribution describes a statistic across repeated samples.';
    const inventory = await buildSemanticClaimInventory({
      deliverables: {
        quizBank: {
          data: {
            quizzes: [
              {
                lessonNumber: 7,
                questions: [{ options: [repeatedKey, 'Wrong B', 'Wrong C', 'Wrong D'], answer: 'A' }],
              },
            ],
          },
        },
      },
      renderedArtifacts: [
        { path: 'Quiz & Exam Bank/Lesson 07 - Sampling - Quiz & Exam Bank.docx', text: repeatedKey },
        { path: 'Assignment Briefs/Lesson 07 - Sampling - Assignment Briefs.docx', text: repeatedKey },
        { path: 'Study Guides/Lesson 07 - Sampling - Study Guides.docx', text: repeatedKey },
      ],
    });

    const keyedRows = inventory.items.filter((item) => item.category === 'keyedAnswers');
    expect(keyedRows).toHaveLength(1);
    expect(keyedRows[0]).toMatchObject({
      lessonNumber: 7,
      artifactPath: expect.stringContaining('Quiz & Exam Bank/'),
    });
  });

  it('separates source provenance, artifact visibility, and semantic entailment', async () => {
    const inventory = await buildSemanticClaimInventory({
      courseGraph: {
        enrichmentOverlay: {
          lessonContent: {
            'lesson-1': { sourceFactAuthority: 'verified-open-research' },
          },
        },
      },
      deliverables: {
        studyGuides: {
          data: {
            guides: [
              {
                lessonNumber: 1,
                keyTerms: [{ definition: VERIFIED_DEFINITION, enrichmentSource: 'fact-ledger-projection' }],
              },
            ],
          },
        },
      },
      sourceLedger: sourceLedger(),
      renderedArtifacts: [
        {
          path: 'Study Guides/Lesson 01 - Syntax - Study Guides.docx',
          text: `Key term. ${VERIFIED_DEFINITION}`,
        },
      ],
    });

    const definition = inventory.items.find((item) => item.category === 'definitions');
    expect(definition).toMatchObject({
      requiresSourcePassage: true,
      provenanceVerified: true,
      artifactVisibilityVerified: true,
      semanticEntailmentVerified: true,
      status: 'verified',
    });
    expect(definition.sourceBindings[0]).toMatchObject({
      sourceLedgerId: 'source-1',
      sourceClaimId: 'source-1:claim-1',
      sourcePassageSha256: 'a'.repeat(64),
    });
  });

  it('keeps lesson-local bindings when the same source claim renders in a later capstone', async () => {
    const ledger = sourceLedger();
    ledger[0].supportReceipt.checks.unshift({
      ...ledger[0].supportReceipt.checks[0],
      renderedLocation: 'Lesson Plans/Lesson 14 - Capstone - Lesson Plans.docx',
    });
    const inventory = await buildSemanticClaimInventory({
      courseGraph: {
        enrichmentOverlay: {
          lessonContent: { 'lesson-1': { sourceFactAuthority: 'verified-open-research' } },
        },
      },
      deliverables: {
        studyGuides: {
          data: {
            guides: [{ lessonNumber: 1, keyTerms: [{ definition: VERIFIED_DEFINITION }] }],
          },
        },
      },
      sourceLedger: ledger,
      renderedArtifacts: [
        { path: 'Study Guides/Lesson 01 - Syntax - Study Guides.docx', text: VERIFIED_DEFINITION },
        { path: 'Lesson Plans/Lesson 14 - Capstone - Lesson Plans.docx', text: VERIFIED_DEFINITION },
      ],
    });

    const definition = inventory.items.find((item) => item.category === 'definitions');
    expect(definition).toMatchObject({ lessonNumber: 1, status: 'verified' });
    expect(definition.sourceBindings).toContainEqual(
      expect.objectContaining({ artifactPath: 'Study Guides/Lesson 01 - Syntax - Study Guides.docx' }),
    );
  });

  it('holds a model-provisional definition that has no authoritative passage', async () => {
    const unsupported = 'Head movement broadly rearranges every constituent in a sentence.';
    const inventory = await buildSemanticClaimInventory({
      courseGraph: {
        enrichmentOverlay: {
          lessonContent: {
            'lesson-1': { sourceFactAuthority: 'model-provisional' },
          },
        },
      },
      deliverables: {
        studyGuides: {
          data: {
            guides: [
              {
                lessonNumber: 1,
                keyTerms: [{ definition: unsupported, enrichmentSource: 'fact-ledger-projection' }],
              },
            ],
          },
        },
      },
      sourceLedger: sourceLedger(),
      renderedArtifacts: [{ path: 'Study Guides/Lesson 01.docx', text: unsupported }],
    });

    const definition = inventory.items.find((item) => item.category === 'definitions' && item.surface === unsupported);
    expect(definition).toMatchObject({
      authority: 'model-provisional',
      requiresSourcePassage: true,
      provenanceVerified: false,
      artifactVisibilityVerified: false,
      semanticEntailmentVerified: false,
      sourceBindings: [],
      status: 'review-required',
    });
    expect(inventory.summary.reviewRequired).toBeGreaterThan(0);
  });

  it('enumerates the correct option rather than a bare answer letter', async () => {
    const ledger = sourceLedger();
    ledger[0].supportReceipt.checks[0].renderedLocation = 'Quiz & Exam Bank/Lesson 01.docx';
    const inventory = await buildSemanticClaimInventory({
      deliverables: {
        quizBank: {
          data: {
            quizzes: [
              {
                lessonNumber: 1,
                questions: [
                  {
                    options: ['A. First choice', `B. ${VERIFIED_DEFINITION}`, 'C. Third choice', 'D. Fourth choice'],
                    answer: 'B',
                    enrichmentSource: 'lesson-content-enrichment',
                  },
                ],
              },
            ],
          },
        },
      },
      sourceLedger: ledger,
      renderedArtifacts: [{ path: 'Quiz & Exam Bank/Lesson 01.docx', text: VERIFIED_DEFINITION }],
    });

    expect(inventory.items).toContainEqual(
      expect.objectContaining({
        category: 'keyedAnswers',
        surface: VERIFIED_DEFINITION,
        requiresSourcePassage: true,
        status: 'verified',
      }),
    );
    expect(inventory.items.some((item) => item.surface === 'B')).toBe(false);
  });

  it('holds incidental learner-visible factual prose from a model-provisional lesson', async () => {
    const unsupported = 'Head movement describes the mechanism by which whole phrases shift positions.';
    const inventory = await buildSemanticClaimInventory({
      courseGraph: {
        enrichmentOverlay: {
          lessonContent: {
            'lesson-12': {
              sourceFactAuthority: 'model-provisional',
              kernel: { facts: [unsupported] },
            },
          },
        },
      },
      deliverables: {},
      sourceLedger: sourceLedger(),
      renderedArtifacts: [
        {
          path: 'Lesson Plans/Lesson 12 - Advanced Syntax - Lesson Plans.docx',
          text: `Instructor Notes: ${unsupported} Compare two examples and explain your decision.`,
        },
      ],
    });

    expect(inventory.items).toContainEqual(
      expect.objectContaining({
        category: 'factualClaims',
        surface: unsupported,
        authority: 'model-provisional',
        origin: 'rendered-model-provisional-prose',
        requiresSourcePassage: true,
        provenanceVerified: false,
        semanticEntailmentVerified: false,
        status: 'review-required',
      }),
    );
  });

  it('excludes a contextualized learner directive even when its object contains a declarative verb', async () => {
    const directive =
      'For Visual Hierarchy, separate observation from interpretation: describe what the specimen shows before explaining how it changes the annotated comparison.';
    const inventory = await buildSemanticClaimInventory({
      courseGraph: {
        enrichmentOverlay: {
          lessonContent: {
            'lesson-1': {
              sourceFactAuthority: 'model-provisional',
              kernel: { facts: [directive] },
            },
          },
        },
      },
      deliverables: {},
      sourceLedger: [],
      renderedArtifacts: [{ path: 'Slide Decks/Lesson 01.pptx', text: directive }],
    });

    expect(inventory.items).toHaveLength(0);
    expect(inventory.summary.reviewRequired).toBe(0);
  });

  it('excludes a compiler-authored decision check joined to a takeaway label', async () => {
    const directive =
      'Key Takeaway: Decision check: use both claims to bound what Rule of Thirds Application supports, then name one limit.';
    const inventory = await buildSemanticClaimInventory({
      courseGraph: {
        enrichmentOverlay: {
          lessonContent: {
            'lesson-1': {
              sourceFactAuthority: 'verified-open-research',
              kernel: { facts: [directive] },
            },
          },
        },
      },
      deliverables: {},
      sourceLedger: [],
      renderedArtifacts: [{ path: 'Slide Decks/Lesson 01.pptx', text: directive }],
    });

    expect(inventory.items).toHaveLength(0);
    expect(inventory.summary.reviewRequired).toBe(0);
  });

  it('verifies learner-visible prose from a shipped source lesson only when its exact passage is bound', async () => {
    const shippedClaim = 'Head movement is a syntactic operation that places a head in a higher head position.';
    const ledger = sourceLedger();
    ledger[0].supportReceipt.checks[0].claim = shippedClaim;
    const inventory = await buildSemanticClaimInventory({
      courseGraph: {
        enrichmentOverlay: {
          lessonContent: {
            'lesson-1': {
              sourceFactAuthority: 'shipped-source-library',
              kernel: { facts: [shippedClaim] },
            },
          },
        },
      },
      deliverables: {},
      sourceLedger: ledger,
      renderedArtifacts: [
        {
          path: 'Study Guides/Lesson 01 - Syntax - Study Guides.docx',
          text: shippedClaim,
        },
      ],
    });

    expect(inventory.items).toContainEqual(
      expect.objectContaining({
        surface: shippedClaim,
        authority: 'shipped-source-library',
        origin: 'rendered-shipped-source-library-prose',
        requiresSourcePassage: true,
        provenanceVerified: true,
        semanticEntailmentVerified: true,
        status: 'verified',
      }),
    );
    expect(inventory.summary.sourceRequired).toBe(1);
    expect(inventory.summary.sourceRequiredVerified).toBe(1);
  });

  it('treats exporter-owned paragraph labels as structure rather than unsupported prose', async () => {
    const shippedClaim = 'Head movement is a syntactic operation that places a head in a higher head position.';
    const ledger = sourceLedger();
    ledger[0].supportReceipt.checks[0].claim = shippedClaim;
    const inventory = await buildSemanticClaimInventory({
      courseGraph: {
        enrichmentOverlay: {
          lessonContent: {
            'lesson-1': {
              sourceFactAuthority: 'shipped-source-library',
              kernel: { facts: [shippedClaim] },
            },
          },
        },
      },
      deliverables: {},
      sourceLedger: ledger,
      renderedArtifacts: [
        {
          path: 'Study Guides/Lesson 01 - Syntax - Study Guides.docx',
          text: `CONCEPT SUMMARY ${shippedClaim}`,
        },
      ],
    });

    expect(inventory.items).toContainEqual(
      expect.objectContaining({
        surface: shippedClaim,
        status: 'verified',
      }),
    );
  });

  it('does not let a structural label hide unsupported prose appended to a bound claim', async () => {
    const shippedClaim = 'Head movement is a syntactic operation that places a head in a higher head position.';
    const unsupported = 'This proves every phrase can move without restriction.';
    const ledger = sourceLedger();
    ledger[0].supportReceipt.checks[0].claim = shippedClaim;
    const inventory = await buildSemanticClaimInventory({
      courseGraph: {
        enrichmentOverlay: {
          lessonContent: {
            'lesson-1': {
              sourceFactAuthority: 'shipped-source-library',
              kernel: { facts: [`${shippedClaim} ${unsupported}`] },
            },
          },
        },
      },
      deliverables: {},
      sourceLedger: ledger,
      renderedArtifacts: [
        {
          path: 'Study Guides/Lesson 01 - Syntax - Study Guides.docx',
          text: `KEY CONCEPT ${shippedClaim} ${unsupported}`,
        },
      ],
    });

    expect(inventory.items).toContainEqual(
      expect.objectContaining({
        surface: unsupported,
        status: 'review-required',
        sourceBindings: [],
      }),
    );
  });

  it('holds unbound learner-visible prose from a shipped source lesson for review', async () => {
    const unsupported = 'Head movement represents an unrestricted transformation of every phrase in a sentence.';
    const inventory = await buildSemanticClaimInventory({
      courseGraph: {
        enrichmentOverlay: {
          lessonContent: {
            'lesson-1': {
              sourceFactAuthority: 'shipped-source-library',
              kernel: { facts: [unsupported] },
            },
          },
        },
      },
      deliverables: {},
      sourceLedger: sourceLedger(),
      renderedArtifacts: [
        {
          path: 'Study Guides/Lesson 01 - Syntax - Study Guides.docx',
          text: unsupported,
        },
      ],
    });

    expect(inventory.items).toContainEqual(
      expect.objectContaining({
        surface: unsupported,
        authority: 'shipped-source-library',
        origin: 'rendered-shipped-source-library-prose',
        requiresSourcePassage: true,
        provenanceVerified: false,
        semanticEntailmentVerified: false,
        status: 'review-required',
      }),
    );
    expect(inventory.summary.reviewRequired).toBe(1);
  });

  it('does not let a valid source fragment certify unsupported surrounding prose', async () => {
    const unsupported = 'This proves that every phrase moves without restriction.';
    const wrapped = `${VERIFIED_DEFINITION} ${unsupported}`;
    const inventory = await buildSemanticClaimInventory({
      courseGraph: {
        enrichmentOverlay: {
          lessonContent: {
            'lesson-1': {
              sourceFactAuthority: 'shipped-source-library',
              kernel: { facts: [wrapped] },
            },
          },
        },
      },
      deliverables: {},
      sourceLedger: sourceLedger(),
      renderedArtifacts: [
        {
          path: 'Study Guides/Lesson 01 - Syntax - Study Guides.docx',
          text: wrapped,
        },
      ],
    });

    const wrappedClaim = inventory.items.find((item) => item.surface === unsupported);
    expect(wrappedClaim).toMatchObject({
      authority: 'shipped-source-library',
      requiresSourcePassage: true,
      provenanceVerified: false,
      semanticEntailmentVerified: false,
      sourceBindings: [],
      status: 'review-required',
    });
  });

  it('inventories the exact claim behind closed exporter wrappers rather than the wrapper itself', async () => {
    const claim = 'Head movement is a syntactic operation that raises a head to a higher head position.';
    const paths = [
      'Course FAQ/Lesson 01 - Syntax - Course FAQ.docx',
      'Quiz & Exam Bank/Lesson 01 - Syntax - Quiz & Exam Bank.docx',
      'Study Guides/Lesson 01 - Syntax - Study Guides.docx',
      'Slide Decks/Lesson 01 - Syntax - Slide Decks.pptx',
      'Lesson Plans/Lesson 01 - Syntax - Lesson Plans.docx',
      'Slide Decks/Lesson 01 - Syntax - Evidence Slide.pptx',
      'Study Guides/Lesson 01 - Syntax - Evidence Guide.docx',
      'Quiz & Exam Bank/Lesson 01 - Syntax - Evidence Quiz.docx',
      'Slide Decks/Lesson 01 - Syntax - Concept Trace.pptx',
    ];
    const ledger = sourceLedger();
    ledger[0].supportReceipt.checks = paths.map((renderedLocation) => ({
      ...ledger[0].supportReceipt.checks[0],
      claim,
      renderedLocation,
    }));
    const wrappedSurfaces = [
      `A concrete case: ${claim}`,
      `The source frames Syntax through this source-backed statement: ${claim}`,
      `php/JML/article/view/3617 — License: CC0 1.0 (article metadata) KEY TERMS Term Definition Head movement ${claim}`,
      `Source claim 2: ${claim}`,
      `Build the model from these source-supported statements: 1) ${claim}`,
      `What the evidence shows about Syntax Before deciding, evaluate what this source statement supports: ${claim}`,
      `CONCEPT SUMMARY Recheck the documented evidence on Syntax ${claim}`,
      `Key supporting evidence: ${claim}`,
      `Concept trace: Syntax and Morphology Before deciding, evaluate what this source statement supports: ${claim}`,
    ];
    const inventory = await buildSemanticClaimInventory({
      courseGraph: {
        enrichmentOverlay: {
          lessonContent: {
            'lesson-1': {
              sourceFactAuthority: 'verified-open-research',
              kernel: { facts: [claim] },
            },
          },
        },
      },
      deliverables: {},
      sourceLedger: ledger,
      renderedArtifacts: paths.map((path, index) => ({ path, text: wrappedSurfaces[index] })),
    });

    const wrapperItems = inventory.items.filter((item) => wrappedSurfaces.includes(item.surface));
    expect(wrapperItems).toHaveLength(0);
    const exactItems = inventory.items.filter((item) => item.surface === claim);
    expect(exactItems).toHaveLength(paths.length);
    expect(exactItems.every((item) => item.status === 'verified')).toBe(true);
  });

  it('does not classify mirrored grounding metadata through an unrelated visible title collision', async () => {
    const title = 'Worked example: Visual Hierarchy Structure';
    const inventory = await buildSemanticClaimInventory({
      deliverables: {
        assignments: {
          data: {
            assignments: [
              {
                lessonNumber: 2,
                title,
                sourceGrounding: {
                  assessmentArchitecture: {
                    weightProvenance: { rationale: title },
                  },
                },
              },
            ],
          },
        },
      },
      renderedArtifacts: [
        {
          path: 'Assignment Briefs/Lesson 02 - Visual Hierarchy Structure - Assignment Briefs.docx',
          text: title,
        },
      ],
    });

    expect(inventory.items.some((item) => item.surface === title)).toBe(false);
  });

  it('normalizes only closed Office labels, determiners, initialisms, and lesson-title punctuation', async () => {
    const cases = [
      {
        path: 'Course FAQ/Lesson 01 - Composition - Course FAQ.docx',
        claim: 'The rule of thirds is a rule of thumb for composing visual art and photographs.',
        surface: 'Rule of thirds is a rule of thumb for composing visual art and photographs.',
      },
      {
        path: 'Course FAQ/Lesson 01 - Composition - Course FAQ.docx',
        claim: 'A license is an official permission or permit to use or own something.',
        surface: 'License is an official permission or permit to use or own something.',
      },
      {
        path: 'Study Guides/Lesson 01 - Composition - Study Guides.docx',
        claim: 'A Creative Commons license is produced by a U.S. non-profit corporation for public use.',
        surface:
          'org/wiki/Creative_Commons_license — License: CC BY-SA 4.0 KEY TERMS Term Definition Creative Commons license A Creative Commons license is produced by a U.S. Non-profit corporation for public use.',
      },
      {
        path: 'Quiz & Exam Bank/Lesson 01 - Composition - Quiz & Exam Bank.docx',
        claim: 'In statistics, Poisson regression is used to model count data and contingency tables.',
        surface:
          'Definition for Poisson regression: In statistics, Poisson regression is used to model count data and contingency tables.',
      },
      {
        path: 'Quiz & Exam Bank/Lesson 01 - Composition - Quiz & Exam Bank.docx',
        claim:
          'Latin hypercube sampling is a statistical method for generating a near-random sample from a multidimensional distribution.',
        surface:
          'Start with this Producing Data: Sampling evidence: Latin hypercube sampling is a statistical method for generating a near-random sample from a multidimensional distribution.',
      },
    ];
    const ledger = sourceLedger();
    ledger[0].supportReceipt.checks = cases.map(({ claim, path }, index) => ({
      ...ledger[0].supportReceipt.checks[0],
      claimId: `source-1:claim-${index + 1}`,
      claim,
      renderedLocation: path,
    }));
    const inventory = await buildSemanticClaimInventory({
      courseGraph: {
        enrichmentOverlay: {
          lessonContent: {
            'lesson-1': {
              sourceFactAuthority: 'verified-open-research',
              kernel: { facts: cases.map(({ claim }) => claim) },
            },
          },
        },
      },
      deliverables: {},
      sourceLedger: ledger,
      renderedArtifacts: [...new Set(cases.map(({ path }) => path))].map((path) => ({
        path,
        text: cases
          .filter((entry) => entry.path === path)
          .map(({ surface }) => surface)
          .join('\n'),
      })),
    });

    for (const { claim } of cases) {
      expect(inventory.items).toContainEqual(expect.objectContaining({ surface: claim, status: 'verified' }));
    }
  });

  it('reuses a lesson-local admitted passage across exact Office occurrences while retaining occurrence paths', async () => {
    const claim = 'A confidence interval is an interval estimate of an unknown parameter computed from sample data.';
    const ledger = sourceLedger();
    ledger[0].supportReceipt.checks[0] = {
      ...ledger[0].supportReceipt.checks[0],
      claim,
      renderedLocation: 'Lesson Plans/Lesson 01 - Intervals - Lesson Plans.docx',
    };
    const paths = [
      'Lesson Plans/Lesson 01 - Intervals - Lesson Plans.docx',
      'Slide Decks/Lesson 01 - Intervals - Slide Decks.pptx',
      'Study Guides/Lesson 01 - Intervals - Study Guides.docx',
    ];
    const inventory = await buildSemanticClaimInventory({
      courseGraph: {
        enrichmentOverlay: {
          lessonContent: {
            'lesson-1': { sourceFactAuthority: 'verified-open-research', kernel: { facts: [claim] } },
          },
        },
      },
      deliverables: {},
      sourceLedger: ledger,
      renderedArtifacts: paths.map((path) => ({ path, text: claim })),
    });

    const occurrences = inventory.items.filter((item) => item.surface === claim);
    expect(occurrences).toHaveLength(3);
    expect(occurrences.every((item) => item.status === 'verified')).toBe(true);
    expect(occurrences.map((item) => item.sourceBindings[0].artifactPath).sort()).toEqual([...paths].sort());
    expect(occurrences.every((item) => item.sourceBindings[0].sourceArtifactPath === paths[0])).toBe(true);
  });

  it('recognizes exact research claims after closed slide and glossary labels', async () => {
    const claim = 'Credible intervals are typically used to characterize posterior probability distributions.';
    const ledger = sourceLedger();
    ledger[0].supportReceipt.checks[0] = { ...ledger[0].supportReceipt.checks[0], claim };
    const paths = [
      'Slide Decks/Lesson 01 - Intervals - Slide Decks.pptx',
      'Study Guides/Lesson 01 - Intervals - Study Guides.docx',
    ];
    const surfaces = [`Key Takeaway: Evidence: ${claim}`, `Confidence intervals ${claim}`];
    const inventory = await buildSemanticClaimInventory({
      courseGraph: {
        enrichmentOverlay: {
          lessonContent: {
            'lesson-1': { sourceFactAuthority: 'verified-open-research', kernel: { facts: [claim] } },
          },
        },
      },
      deliverables: {},
      sourceLedger: ledger,
      renderedArtifacts: paths.map((path, index) => ({ path, text: surfaces[index] })),
    });

    expect(inventory.items.filter((item) => surfaces.includes(item.surface))).toEqual(
      expect.arrayContaining(surfaces.map((surface) => expect.objectContaining({ surface, status: 'verified' }))),
    );
  });

  it('keeps the same source claim accountable in each lesson where it appears', async () => {
    const ledger = sourceLedger();
    ledger[0].supportReceipt.checks.push({
      ...ledger[0].supportReceipt.checks[0],
      renderedLocation: 'Study Guides/Lesson 02 - Movement - Study Guides.docx',
    });
    const inventory = await buildSemanticClaimInventory({
      courseGraph: {
        enrichmentOverlay: {
          lessonContent: {
            'lesson-1': { sourceFactAuthority: 'shipped-source-library' },
            'lesson-2': { sourceFactAuthority: 'shipped-source-library' },
          },
        },
      },
      deliverables: {},
      sourceLedger: ledger,
      renderedArtifacts: [
        { path: 'Study Guides/Lesson 01 - Syntax - Study Guides.docx', text: VERIFIED_DEFINITION },
        { path: 'Study Guides/Lesson 02 - Movement - Study Guides.docx', text: VERIFIED_DEFINITION },
      ],
    });

    const occurrences = inventory.items.filter((item) => item.surface === VERIFIED_DEFINITION);
    expect(occurrences).toHaveLength(2);
    expect(occurrences.map((item) => item.lessonNumber)).toEqual([1, 2]);
    expect(occurrences.every((item) => item.status === 'verified')).toBe(true);
  });

  it('creates a separate review obligation for each Office-family occurrence', async () => {
    const paths = [
      'Study Guides/Lesson 01 - Syntax - Study Guides.docx',
      'Quiz & Exam Bank/Lesson 01 - Syntax - Quiz & Exam Bank.docx',
    ];
    const ledger = sourceLedger();
    ledger[0].supportReceipt.checks = paths.map((renderedLocation) => ({
      ...ledger[0].supportReceipt.checks[0],
      renderedLocation,
    }));
    const inventory = await buildSemanticClaimInventory({
      courseGraph: {
        enrichmentOverlay: {
          lessonContent: { 'lesson-1': { sourceFactAuthority: 'shipped-source-library' } },
        },
      },
      deliverables: {},
      sourceLedger: ledger,
      renderedArtifacts: paths.map((path) => ({ path, text: VERIFIED_DEFINITION })),
    });

    const occurrences = inventory.items.filter((item) => item.surface === VERIFIED_DEFINITION);
    expect(occurrences).toHaveLength(2);
    expect(occurrences.map((item) => item.artifactPath).sort()).toEqual([...paths].sort());
    expect(occurrences.every((item) => item.artifactPaths.length === 1 && item.status === 'verified')).toBe(true);
    expect(inventory.summary.byArtifactFamily).toMatchObject({
      'Study Guides': { total: 1, verified: 1, reviewRequired: 0 },
      'Quiz & Exam Bank': { total: 1, verified: 1, reviewRequired: 0 },
      Syllabus: { total: 0, verified: 0, reviewRequired: 0 },
    });
  });

  it('does not turn procedural classroom directions into factual claims', async () => {
    const inventory = await buildSemanticClaimInventory({
      courseGraph: {
        enrichmentOverlay: {
          lessonContent: {
            'lesson-2': { sourceFactAuthority: 'model-provisional' },
          },
        },
      },
      deliverables: {},
      renderedArtifacts: [
        {
          path: 'Lesson Plans/Lesson 02 - Practice - Lesson Plans.docx',
          text: 'Compare two examples and explain which conclusion is supported. Treat the rights disclosure as if it were observational support. Students should submit one paragraph.',
        },
      ],
    });

    expect(inventory.items).toHaveLength(0);
  });

  it('does not turn a flattened evidence-slide heading and learner direction into a factual claim', async () => {
    const inventory = await buildSemanticClaimInventory({
      courseGraph: {
        enrichmentOverlay: {
          lessonContent: {
            'lesson-1': {
              sourceFactAuthority: 'verified-open-research',
              kernel: { facts: ['Composition evidence must remain tied to an inspectable source passage.'] },
            },
          },
        },
      },
      deliverables: {},
      sourceLedger: [],
      renderedArtifacts: [
        {
          path: 'Slide Decks/Lesson 01 - Composition - Slide Decks.pptx',
          text: 'What the evidence shows about Composition Before deciding, evaluate what this source statement supports: the documented evidence on composition techniques in photography.',
        },
      ],
    });

    expect(inventory.items).toHaveLength(0);
  });

  it('does not treat a learner self-check wrapper as an independent factual claim', async () => {
    const claim = 'A normal distribution is a continuous probability distribution for a real-valued variable.';
    const inventory = await buildSemanticClaimInventory({
      courseGraph: {
        enrichmentOverlay: {
          lessonContent: {
            'lesson-3': {
              sourceFactAuthority: 'verified-open-research',
              kernel: { facts: [claim] },
            },
          },
        },
      },
      deliverables: {},
      sourceLedger: [],
      renderedArtifacts: [
        {
          path: 'Course FAQ/Lesson 03 - Normal Distribution - Course FAQ.docx',
          text: `You are ready when you can state, without notes, that ${claim} — and then apply it to one case.`,
        },
      ],
    });

    expect(inventory.items).toHaveLength(0);
  });

  it('does not misclassify evidence-reference scaffolds as subject-matter claims', async () => {
    const inventory = await buildSemanticClaimInventory({
      courseGraph: {
        enrichmentOverlay: {
          lessonContent: {
            'lesson-2': {
              sourceFactAuthority: 'model-provisional',
              kernel: {
                facts: [
                  'After that, they cite the distribution detail that supports it.',
                  'The distribution evidence brief shows the selected classroom example.',
                  'Shows relevant Describing Distributions with Numbers detail.',
                  'Lists ideas about Describing Distributions with Numbers (2.4) without showing which source evidence supports the claim or decision.',
                ],
              },
            },
          },
        },
      },
      deliverables: {},
      renderedArtifacts: [
        {
          path: 'Slide Decks/Lesson 02 - Distribution - Slide Decks.pptx',
          text: [
            'After that, they cite the distribution detail that supports it.',
            'The distribution evidence brief shows the selected classroom example.',
            'Shows relevant Describing Distributions with Numbers detail.',
            'Lists ideas about Describing Distributions with Numbers (2.4) without showing which source evidence supports the claim or decision.',
          ].join(' '),
        },
      ],
    });
    expect(inventory.items).toHaveLength(0);
  });

  it('keeps decimal section numbers from splitting nonvisual alt-text scaffolds into fake claims', async () => {
    const altText =
      'Nonvisual summary for "From Properties of the Normal Distribution (3.4) to Scatterplots and Correlation": Scatterplots and Correlation evidence supports weekly homework: Scatterplots and Correlation.';
    const inventory = await buildSemanticClaimInventory({
      courseGraph: {
        enrichmentOverlay: {
          lessonContent: {
            'lesson-4': {
              sourceFactAuthority: 'model-provisional',
              kernel: { facts: [altText] },
            },
          },
        },
      },
      deliverables: {},
      renderedArtifacts: [
        {
          path: 'Slide Decks/Lesson 04 - Scatterplots and Correlation - Slide Decks.pptx',
          text: altText,
        },
      ],
    });

    expect(inventory.items).toHaveLength(0);
  });

  it('inventories rendered rubric weights, performance bands, and scoring anchors without treating them as facts', async () => {
    const criterion = 'Evidence selection supports the proposed revision';
    const exemplary = 'Uses two inspectable details and explains how each changes the revision.';
    const proficient = 'Uses one relevant detail and connects it to the revision with a minor gap.';
    const developing = 'Names evidence but leaves its effect on the revision partly implicit.';
    const beginning = 'Offers a general opinion without inspectable evidence for the revision.';
    const strongSample = 'Strong anchor: identifies the evidence, decision, and remaining limitation.';
    const inventory = await buildSemanticClaimInventory({
      deliverables: {
        rubrics: {
          data: {
            rubrics: [
              {
                lessonNumber: 3,
                criteria: [{ criterion, weight: 40, exemplary, proficient, developing, beginning }],
                anchorExamples: { strongSample },
              },
            ],
          },
        },
      },
      renderedArtifacts: [
        {
          path: 'Rubrics/Lesson 03 - Evidence - Rubrics.docx',
          text: `${criterion} 40% ${exemplary} ${proficient} ${developing} ${beginning} ${strongSample}`,
        },
      ],
    });

    const scoring = inventory.items.filter((item) => item.category === 'scoringClaims');
    expect(scoring.map((item) => item.surface)).toEqual(
      expect.arrayContaining([`${criterion} 40%`, exemplary, proficient, developing, beginning, strongSample]),
    );
    expect(
      scoring.every(
        (item) =>
          item.requiresSourcePassage === false &&
          item.status === 'structurally-verified' &&
          item.semanticEntailmentVerified === null,
      ),
    ).toBe(true);
    expect(inventory.summary.byArtifactFamily.Rubrics.total).toBe(scoring.length);
  });

  it('inventories explicit discussion evaluation criteria but excludes the non-evaluative prompt', async () => {
    const prompt = 'Which revision should the team defend, and why?';
    const criteria = [
      'Uses one concrete source detail instead of unsupported opinion.',
      'Responds to a peer by extending or refining the evidence used.',
    ];
    const inventory = await buildSemanticClaimInventory({
      deliverables: {
        discussions: {
          data: { discussions: [{ lessonTitle: 'Lesson 2: Evidence', prompt, evaluationCriteria: criteria }] },
        },
      },
      renderedArtifacts: [
        {
          path: 'Discussion Prompts/Lesson 02 - Evidence - Discussion Prompts.docx',
          text: `${prompt} ${criteria.join(' ')}`,
        },
      ],
    });

    expect(inventory.items.map((item) => item.surface)).toEqual(expect.arrayContaining(criteria));
    expect(inventory.items.some((item) => item.surface === prompt)).toBe(false);
    expect(inventory.summary.byArtifactFamily['Discussion Prompts']).toMatchObject({
      total: 2,
      verified: 0,
      structurallyVerified: 2,
      reviewRequired: 0,
    });
  });

  it('binds every assessment stem, distractor set, and answer-key mapping without claiming semantic validity', async () => {
    const question = 'Which source detail most directly supports the proposed revision?';
    const options = [
      'The detail that names the observed change and its boundary.',
      'The lesson title by itself.',
      'A preference unrelated to the supplied evidence.',
      'A broad claim that ignores the source limitation.',
    ];
    const inventory = await buildSemanticClaimInventory({
      deliverables: {
        quizBank: {
          data: { quizItems: [{ lessonNumber: 4, question, options, answer: 'A' }] },
        },
      },
      renderedArtifacts: [
        {
          path: 'Quiz & Exam Bank/Lesson 04 - Evidence - Quiz & Exam Bank.docx',
          text: `${question} ${options.join(' ')}`,
        },
      ],
    });

    expect(inventory.assessmentTupleIntegrity).toMatchObject({
      protocol: 'coursemapper-assessment-tuple-integrity-v1',
      total: 1,
      structurallyComplete: 1,
      reviewRequired: 0,
    });
    expect(inventory.assessmentTupleIntegrity.rows[0]).toMatchObject({
      lessonNumber: 4,
      optionCount: 4,
      uniqueOptionCount: 4,
      correctIndex: 0,
      distractorCount: 3,
      artifactVisibilityVerified: true,
      status: 'structurally-complete',
      semanticBoundary: expect.stringContaining('does not establish disciplinary correctness'),
    });
    expect(inventory.assessmentTupleIntegrity.rows[0].optionSha256).toHaveLength(4);
  });
});
