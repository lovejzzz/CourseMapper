import { describe, expect, it } from 'vitest';

import {
  SAVED_GENOME_EVIDENCE_HYDRATION_PROTOCOL,
  hydrateSavedGenomeEvidence,
  sanitizeSavedResearchClaimReplay,
} from '../genomeEvidenceHydration.js';
import { sha256HexSync } from '../sha256Sync.js';

function manifestFixture() {
  const sourceId = 'fixture:source';
  const quote = 'A verified source passage anchors this saved genome claim.';
  const bytes = new TextEncoder().encode(quote).byteLength;
  return {
    references: {
      [sourceId]: {
        displayTitle: 'Fixture source',
        sourceUrl: 'https://example.org/fixture',
        license: 'CC BY 4.0',
        attribution: 'Fixture author',
        provider: 'openstax',
        sourceSnapshot: {
          protocol: 'retrieved-source-snapshot-sha256-v2',
          sources: [
            {
              sourceId,
              normalizedSnapshotText: quote,
              retrievedSnapshotSha256: sha256HexSync(quote),
              retrievedSnapshotBytes: bytes,
            },
          ],
          claims: [
            {
              sourceId,
              locator: 'paragraph 1',
              quote,
              retrievedSnapshotSha256: sha256HexSync(quote),
              retrievedSnapshotBytes: bytes,
              quoteByteStart: 0,
              quoteByteEnd: bytes,
              quoteSha256: sha256HexSync(quote),
            },
          ],
        },
      },
    },
  };
}

function graphFixture(citationId = 'fixture:source') {
  return {
    sessions: [
      {
        id: 'session-1',
        resourceRefs: ['resource-valid', 'resource-stale'],
        sections: [{ resourceRefs: ['resource-valid', 'resource-stale'] }],
      },
    ],
    resources: [
      {
        id: 'resource-valid',
        origin: 'genome',
        evidence: 'A verified source passage anchors this saved genome claim.',
      },
      {
        id: 'resource-stale',
        origin: 'genome',
        evidence: 'This unsupported saved resource must not survive hydration.',
      },
      { id: 'resource-syllabus', origin: 'syllabus', citation: 'Instructor-supplied reading' },
    ],
    concepts: [
      {
        id: 'concept-1',
        kernel: {
          conceptProvenance: {
            source: 'genome-linked',
            fullyAnchored: true,
            citations: [{ id: citationId, displayTitle: 'Old metadata' }],
          },
          keyTerms: [
            {
              term: 'Anchored claim',
              definition: 'A verified source passage anchors this saved genome claim.',
            },
            { term: 'Unsupported term', definition: 'This unsupported definition must not survive hydration.' },
          ],
          quizItems: [{ stem: 'An unsupported saved question must not survive hydration.' }],
          kernel: {
            facts: [
              'A verified source passage anchors this saved genome claim.',
              'This unsupported saved fact must not survive hydration.',
            ],
            provenance: {
              source: 'compiler-owned-exact-source-ledger',
              copiedFactsVerbatim: true,
              factCount: 2,
            },
          },
        },
      },
    ],
    enrichmentOverlay: {
      lessonContent: {
        'lesson-1': {
          conceptProvenance: {
            source: 'genome-linked',
            fullyAnchored: true,
            citations: [{ id: citationId, displayTitle: 'Old metadata' }],
          },
          kernel: {
            facts: [
              'A verified source passage anchors this saved genome claim.',
              'This unsupported saved fact must not survive hydration.',
            ],
            provenance: {
              source: 'compiler-owned-exact-source-ledger',
              copiedFactsVerbatim: true,
              factCount: 1,
            },
          },
        },
      },
    },
  };
}

describe('saved genome evidence hydration', () => {
  it('quarantines context-dependent claims when replaying older open-research payloads', () => {
    const weakClaim = 'Combining one secondary color and a primary color in the same manner produces a tertiary color.';
    const safeClaim = 'A secondary color is made by mixing two primary colors in even proportions.';
    const snapshot = `${safeClaim} ${weakClaim}`;
    const payload = {
      enrichmentSource: 'compiler-owned-exact-source-ledger',
      conceptProvenance: {
        source: 'algi-researched',
        fullyAnchored: true,
        citations: [
          {
            id: 'source:color',
            sourceUrl: 'https://example.org/color',
            attribution: 'Fixture author',
            evidence: weakClaim,
            supportReceipt: {
              status: 'passed',
              checkedClaims: 2,
              minimumScore: 1,
              sourceSnapshot: { normalizedSnapshotText: snapshot },
              checks: [
                { claim: safeClaim, quote: safeClaim, score: 1 },
                { claim: weakClaim, quote: weakClaim, score: 1 },
              ],
            },
          },
        ],
      },
      kernel: {
        facts: [safeClaim, weakClaim],
        provenance: { authority: 'verified-open-research', factCount: 2 },
      },
      keyTerms: [{ term: 'Secondary color', definition: safeClaim, example: weakClaim }],
    };

    const replayed = sanitizeSavedResearchClaimReplay(payload);
    expect(replayed.kernel.facts).toEqual([safeClaim]);
    expect(replayed.kernel.provenance.factCount).toBe(1);
    expect(replayed.keyTerms).toEqual([{ term: 'Secondary color', definition: safeClaim }]);
    expect(replayed.conceptProvenance.citations[0].evidence).toBe(safeClaim);
    expect(replayed.conceptProvenance.citations[0].supportReceipt.checks).toHaveLength(1);
    expect(replayed.conceptProvenance.citations[0].supportReceipt.sourceSnapshot.normalizedSnapshotText).toBe(snapshot);
    expect(replayed.semanticAdmissionReceipt).toMatchObject({
      savedResearchReplayProtocol: 'coursemapper-saved-research-claim-replay-v1',
      quarantinedContextDependentClaimCount: 2,
    });
  });

  it('quarantines saved research citations with coerced attribution or no inspectable source URL', () => {
    const payload = {
      conceptProvenance: {
        source: 'algi-researched',
        citations: [
          {
            id: 'legacy:broken',
            attribution: '[object Object]',
            sourceUrl: '',
            evidence: 'A complete-looking old claim should not bypass current source identity checks.',
            supportReceipt: {
              checks: [
                {
                  claim: 'A complete-looking old claim should not bypass current source identity checks.',
                  quote: 'A complete-looking old claim should not bypass current source identity checks.',
                  score: 1,
                },
              ],
            },
          },
        ],
      },
      kernel: { facts: ['A complete-looking old claim should not bypass current source identity checks.'] },
    };

    const replayed = sanitizeSavedResearchClaimReplay(payload);
    expect(replayed.conceptProvenance.citations).toEqual([]);
    expect(JSON.stringify(replayed)).not.toContain('[object Object]');
  });

  it('replays current manifest hashes and exact quote offsets into saved citations', () => {
    const hydrated = hydrateSavedGenomeEvidence(graphFixture(), manifestFixture());
    const lesson = hydrated.enrichmentOverlay.lessonContent['lesson-1'];
    expect(lesson.sourceFactAuthority).toBe('shipped-source-library');
    expect(lesson.semanticAdmissionReceipt).toMatchObject({
      protocol: SAVED_GENOME_EVIDENCE_HYDRATION_PROTOCOL,
      status: 'current-manifest-replayed',
      admittedCitationCount: 1,
      rejectedCitationIds: [],
    });
    expect(lesson.conceptProvenance.citations[0]).toMatchObject({
      id: 'fixture:source',
      sourceUrl: 'https://example.org/fixture',
      supportReceipt: {
        sourceIdentityVerified: true,
        semanticAdmissionVerified: true,
        artifactVisibilityVerified: false,
        semanticSupport: true,
        readinessEligible: false,
      },
    });
    expect(lesson.conceptProvenance.citations[0].supportReceipt.checks[0]).toMatchObject({
      claim: 'A verified source passage anchors this saved genome claim.',
      quoteInSnapshot: true,
      entailed: true,
    });
    expect(lesson.kernel.facts).toEqual(['A verified source passage anchors this saved genome claim.']);
    expect(hydrated.concepts[0].kernel.kernel.facts).toEqual([
      'A verified source passage anchors this saved genome claim.',
    ]);
    expect(hydrated.concepts[0].kernel.keyTerms).toEqual([
      expect.objectContaining({
        term: 'Anchored claim',
        definition: 'A verified source passage anchors this saved genome claim.',
      }),
    ]);
    expect(hydrated.concepts[0].kernel.quizItems).toBeUndefined();
    expect(hydrated.resources.map((resource) => resource.id)).toEqual(['resource-valid', 'resource-syllabus']);
    expect(hydrated.sessions[0].resourceRefs).toEqual(['resource-valid']);
    expect(hydrated.sessions[0].sections[0].resourceRefs).toEqual(['resource-valid']);
  });

  it('quarantines removed or hash-invalid saved citations instead of grandfathering them', () => {
    const badManifest = manifestFixture();
    badManifest.references['fixture:source'].sourceSnapshot.sources[0].retrievedSnapshotSha256 = '0'.repeat(64);
    const hydrated = hydrateSavedGenomeEvidence(graphFixture(), badManifest);
    const lesson = hydrated.enrichmentOverlay.lessonContent['lesson-1'];
    expect(lesson.sourceFactAuthority).toBe('model-provisional');
    expect(lesson.conceptProvenance.citations).toEqual([]);
    expect(lesson.conceptProvenance.fullyAnchored).toBe(false);
    expect(lesson.semanticAdmissionReceipt).toMatchObject({
      status: 'stale-genome-quarantined',
      rejectedCitationIds: ['fixture:source'],
    });
    expect(lesson.kernel.facts).toEqual([]);
    expect(hydrated.concepts[0].kernel.kernel.facts).toEqual([]);
    expect(hydrated.concepts[0].kernel.keyTerms).toEqual([]);
    expect(hydrated.concepts[0].kernel.quizItems).toBeUndefined();
    expect(hydrated.resources.map((resource) => resource.id)).toEqual(['resource-syllabus']);
    expect(hydrated.sessions[0].resourceRefs).toEqual([]);
    expect(hydrated.sessions[0].sections[0].resourceRefs).toEqual([]);
  });
});
