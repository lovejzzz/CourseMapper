import { sha256HexSync } from './sha256Sync.js';
import { SOURCE_LEDGER_AUTHORITIES } from './sourceLedgerProvenance.js';
import { isStandaloneSourceClaim } from './knowledge/claimEntailment.js';

export const SAVED_GENOME_EVIDENCE_HYDRATION_PROTOCOL = 'coursemapper-saved-genome-evidence-hydration-v1';

const clean = (value) =>
  String(value || '')
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim();
const claimKey = (value) =>
  clean(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const SAVED_RESEARCH_LINEAGES = new Set(['algi-researched', 'scion-source-researched']);

function claimSurface(value) {
  if (typeof value === 'string') return clean(value);
  return clean(value?.text ?? value?.claim ?? value?.quote);
}

function isSavedResearchPayload(payload = null) {
  if (!payload || typeof payload !== 'object') return false;
  return (
    SAVED_RESEARCH_LINEAGES.has(clean(payload?.conceptProvenance?.source)) ||
    clean(payload?.sourceFactAuthority) === SOURCE_LEDGER_AUTHORITIES.VERIFIED_OPEN_RESEARCH ||
    clean(payload?.kernel?.provenance?.authority) === SOURCE_LEDGER_AUTHORITIES.VERIFIED_OPEN_RESEARCH
  );
}

function sanitizeSavedResearchCitation(citation = {}) {
  const attribution = clean(citation?.attribution);
  const sourceUrl = clean(citation?.sourceUrl || citation?.url);
  // Older Foundry payloads could stringify structured attribution metadata as
  // "[object Object]". A saved research citation with broken attribution or
  // no inspectable HTTPS identity is not source-complete and must not re-enter
  // a current package merely because an old entailment receipt exists.
  if (/^\[object Object\]$/i.test(attribution) || !/^https:\/\//i.test(sourceUrl)) return null;
  const receipt = citation?.supportReceipt;
  const sourceChecks = Array.isArray(receipt?.checks) ? receipt.checks : [];
  const checks = sourceChecks.filter(
    (check) =>
      isStandaloneSourceClaim(claimSurface(check?.claim)) && isStandaloneSourceClaim(claimSurface(check?.quote)),
  );
  if (checks.length === 0) return null;
  const evidence = isStandaloneSourceClaim(citation?.evidence)
    ? clean(citation.evidence)
    : claimSurface(checks[0]?.claim || checks[0]?.quote);
  return {
    ...citation,
    ...(evidence ? { evidence } : {}),
    supportReceipt: {
      ...receipt,
      checkedClaims: checks.length,
      minimumScore: Math.min(...checks.map((check) => Number(check?.score) || 0)),
      checks,
    },
  };
}

/**
 * Revalidate verified-open-research claims when loading a saved project.
 * Full source snapshots remain byte-for-byte intact for provenance; only
 * standalone teaching selections and their receipt rows are quarantined.
 */
export function sanitizeSavedResearchClaimReplay(payload = null) {
  if (!isSavedResearchPayload(payload)) return payload;
  const sourceCitations = Array.isArray(payload?.conceptProvenance?.citations)
    ? payload.conceptProvenance.citations
    : [];
  const citations = sourceCitations.map(sanitizeSavedResearchCitation).filter(Boolean);
  const facts = (Array.isArray(payload?.kernel?.facts) ? payload.kernel.facts : []).filter((fact) =>
    isStandaloneSourceClaim(claimSurface(fact)),
  );
  const keyTerms = (Array.isArray(payload?.keyTerms) ? payload.keyTerms : [])
    .map((term) => {
      const definitionKey = Object.prototype.hasOwnProperty.call(term || {}, 'definition') ? 'definition' : 'df';
      const exampleKey = Object.prototype.hasOwnProperty.call(term || {}, 'example') ? 'example' : 'eg';
      const definition = claimSurface(term?.[definitionKey]);
      if (!definition || !isStandaloneSourceClaim(definition)) return null;
      const next = { ...term, [definitionKey]: definition };
      if (term?.[exampleKey] != null && !isStandaloneSourceClaim(claimSurface(term[exampleKey]))) {
        delete next[exampleKey];
      }
      return next;
    })
    .filter(Boolean);
  const retainedChecksByCitationId = new Map(
    citations.map((citation) => [clean(citation?.id), citation?.supportReceipt?.checks?.length || 0]),
  );
  const quarantinedClaimCount =
    sourceCitations.reduce(
      (count, citation) =>
        count +
        Math.max(
          0,
          (Array.isArray(citation?.supportReceipt?.checks) ? citation.supportReceipt.checks.length : 0) -
            (retainedChecksByCitationId.get(clean(citation?.id)) || 0),
        ),
      0,
    ) + Math.max(0, (payload?.kernel?.facts?.length || 0) - facts.length);
  return {
    ...payload,
    conceptProvenance: {
      ...(payload.conceptProvenance || {}),
      citations,
      fullyAnchored: citations.length > 0,
    },
    keyTerms,
    kernel: {
      ...(payload.kernel || {}),
      facts,
      provenance: {
        ...(payload.kernel?.provenance || {}),
        factCount: facts.length,
      },
    },
    semanticAdmissionReceipt: {
      ...(payload.semanticAdmissionReceipt || {}),
      savedResearchReplayProtocol: 'coursemapper-saved-research-claim-replay-v1',
      quarantinedContextDependentClaimCount: quarantinedClaimCount,
    },
  };
}

function uniqueClaims(values, limit = 128) {
  const seen = new Set();
  const output = [];
  for (const value of values) {
    const surface = clean(value);
    const key = claimKey(surface);
    if (!surface || !key || seen.has(key)) continue;
    seen.add(key);
    output.push(surface);
    if (output.length >= limit) break;
  }
  return output;
}

function hydratedSupportReceipt(citationId, reference = {}) {
  const snapshot = reference?.sourceSnapshot;
  const source = (Array.isArray(snapshot?.sources) ? snapshot.sources : []).find(
    (entry) => clean(entry?.sourceId) === citationId,
  );
  const text = clean(source?.normalizedSnapshotText);
  const bytes = new TextEncoder().encode(text);
  if (
    snapshot?.protocol !== 'retrieved-source-snapshot-sha256-v2' ||
    !text ||
    !/^[a-f0-9]{64}$/i.test(clean(source?.retrievedSnapshotSha256)) ||
    clean(source.retrievedSnapshotSha256) !== sha256HexSync(text) ||
    Number(source?.retrievedSnapshotBytes) !== bytes.byteLength
  ) {
    return null;
  }
  const checks = (Array.isArray(snapshot?.claims) ? snapshot.claims : [])
    .map((claim, index) => {
      const quote = clean(claim?.quote);
      const start = Number(claim?.quoteByteStart);
      const end = Number(claim?.quoteByteEnd);
      if (
        clean(claim?.sourceId) !== citationId ||
        !clean(claim?.locator) ||
        !quote ||
        clean(claim?.retrievedSnapshotSha256) !== clean(source.retrievedSnapshotSha256) ||
        Number(claim?.retrievedSnapshotBytes) !== bytes.byteLength ||
        !Number.isInteger(start) ||
        !Number.isInteger(end) ||
        start < 0 ||
        end <= start ||
        end > bytes.byteLength ||
        clean(new TextDecoder().decode(bytes.slice(start, end))) !== quote ||
        clean(claim?.quoteSha256) !== sha256HexSync(quote)
      ) {
        return null;
      }
      return {
        claimId: `${citationId}:manifest-claim-${index + 1}`,
        claim: quote,
        quote,
        sourceId: citationId,
        locator: clean(claim.locator),
        retrievedSnapshotSha256: clean(source.retrievedSnapshotSha256),
        retrievedSnapshotBytes: bytes.byteLength,
        quoteByteStart: start,
        quoteByteEnd: end,
        sourcePassageSha256: clean(claim.quoteSha256),
        quoteInSnapshot: true,
        entailed: true,
        score: 1,
        reason: 'exact-source-claim-identity',
        method: 'exact-source-claim-v1',
        construct: 'source-claim-identity',
        sourceIdentityVerified: true,
        semanticAdmissionVerified: true,
        semanticSupport: true,
      };
    })
    .filter(Boolean);
  if (checks.length === 0 || checks.length !== (snapshot.claims || []).length) return null;
  return {
    status: 'passed',
    checkedClaims: checks.length,
    minimumScore: 1,
    method: 'exact-source-claim-v1',
    construct: 'source-extraction-integrity',
    sourceIdentityVerified: true,
    semanticAdmissionVerified: true,
    artifactVisibilityVerified: false,
    semanticSupport: true,
    readinessEligible: false,
    sourceSnapshot: {
      protocol: 'retrieved-source-snapshot-sha256-v2',
      sourceId: citationId,
      retrievedSnapshotSha256: clean(source.retrievedSnapshotSha256),
      retrievedSnapshotBytes: bytes.byteLength,
      normalizedSnapshotText: text,
      contentVerified: false,
      sourceIdentityVerified: true,
      semanticAdmissionVerified: true,
      artifactVisibilityVerified: false,
    },
    claimBoundary:
      'This migration replays a current shipped source snapshot and exact quote offsets for a saved genome citation. Rendered visibility is verified later from exported Office bytes.',
    checks,
  };
}

function hydrateCitation(citation = {}, references = {}) {
  const id = clean(citation?.id || citation?.sourceId);
  const reference = references[id];
  if (!id || !reference || reference?.deprecatedInvalidAttribution === true) return null;
  const sourceUrl = clean(reference?.sourceUrl);
  const license = clean(reference?.license);
  const supportReceipt = hydratedSupportReceipt(id, reference);
  if (!/^https:\/\//i.test(sourceUrl) || !license || !supportReceipt) return null;
  return {
    ...citation,
    id,
    displayTitle: clean(reference?.displayTitle || citation?.displayTitle || citation?.title || id),
    sourceUrl,
    license,
    attribution: clean(reference?.attribution || citation?.attribution),
    ...(clean(reference?.provider) ? { provider: clean(reference.provider) } : {}),
    supportReceipt,
  };
}

function restrictPayloadToHydratedClaims(payload = {}) {
  const claims = uniqueClaims(
    (Array.isArray(payload?.conceptProvenance?.citations) ? payload.conceptProvenance.citations : [])
      .flatMap((citation) => citation?.supportReceipt?.checks || [])
      .filter(
        (check) =>
          check?.sourceIdentityVerified === true &&
          check?.semanticAdmissionVerified === true &&
          check?.semanticSupport === true &&
          check?.quoteInSnapshot === true,
      )
      .flatMap((check) => [check?.claim, check?.quote])
      .filter((claim) => {
        const words = clean(claim).split(/\s+/).filter(Boolean).length;
        return words >= 6 && words <= 40;
      }),
  );
  const claimByKey = new Map(claims.map((claim) => [claimKey(claim), claim]));
  const boundClaim = (value) => claimByKey.get(claimKey(value)) || '';
  const exactFacts = uniqueClaims(
    [...(Array.isArray(payload?.kernel?.facts) ? payload.kernel.facts.map(boundClaim).filter(Boolean) : []), ...claims],
    5,
  );
  const safeTerms = (Array.isArray(payload?.keyTerms) ? payload.keyTerms : [])
    .map((term) => {
      const definition = boundClaim(term?.definition || term?.df);
      if (!clean(term?.term || term?.tr) || !definition || /;/.test(definition)) return null;
      const example = boundClaim(term?.example || term?.eg);
      return {
        ...term,
        definition,
        ...(example ? { example } : { example: definition }),
        misconception: '',
        correction: '',
      };
    })
    .filter(Boolean);
  const quarantinedFields = [
    'quizItems',
    'keyTermFallbacks',
    'slideContent',
    'coreFallbacks',
    'surfaceFallbacks',
    'discussionPrompt',
    'assignmentCore',
    'studyGuide',
    'workedExample',
    'mcWalkthrough',
    'dialogue',
    'reasoningScaffolds',
    'structuralConnections',
    'structuralBridges',
    'prerequisitePrimers',
  ].filter((field) => payload[field] != null);
  const next = { ...payload, keyTerms: safeTerms };
  for (const field of quarantinedFields) delete next[field];
  next.kernel = {
    ...(payload.kernel || {}),
    facts: exactFacts,
    scenario: null,
    provenance: {
      ...(payload.kernel?.provenance || {}),
      factCount: exactFacts.length,
    },
  };
  next.semanticAdmissionReceipt = {
    ...(payload.semanticAdmissionReceipt || {}),
    fieldAuthorityBoundary: 'exact-admitted-source-claim-v1',
    admittedClaimCount: claims.length,
    retainedFactCount: exactFacts.length,
    retainedTermCount: safeTerms.length,
    quarantinedUnboundFields: quarantinedFields,
  };
  return next;
}

function hydrateGenomeLinkedPayload(payload = null, references = {}) {
  if (!payload || typeof payload !== 'object' || payload?.conceptProvenance?.source !== 'genome-linked') {
    return payload;
  }
  const sourceCitations = Array.isArray(payload?.conceptProvenance?.citations)
    ? payload.conceptProvenance.citations
    : [];
  const citations = sourceCitations.map((citation) => hydrateCitation(citation, references)).filter(Boolean);
  const rejectedCitationIds = sourceCitations
    .map((citation) => clean(citation?.id || citation?.sourceId))
    .filter((id) => id && !citations.some((citation) => citation.id === id));
  const authoritative = citations.length > 0;
  const authority = authoritative
    ? SOURCE_LEDGER_AUTHORITIES.SHIPPED_SOURCE_LIBRARY
    : SOURCE_LEDGER_AUTHORITIES.MODEL_PROVISIONAL;
  return restrictPayloadToHydratedClaims({
    ...payload,
    sourceFactAuthority: authority,
    conceptProvenance: {
      ...(payload.conceptProvenance || {}),
      authority,
      citations,
      fullyAnchored: authoritative,
    },
    kernel: {
      ...(payload.kernel || {}),
      provenance: {
        ...(payload.kernel?.provenance || {}),
        authority,
      },
    },
    semanticAdmissionReceipt: {
      ...(payload.semanticAdmissionReceipt || {}),
      protocol: SAVED_GENOME_EVIDENCE_HYDRATION_PROTOCOL,
      admittedCitationCount: citations.length,
      rejectedCitationIds,
      status: authoritative ? 'current-manifest-replayed' : 'stale-genome-quarantined',
    },
  });
}

function admittedClaimKeys(payload = null) {
  return new Set(
    (Array.isArray(payload?.conceptProvenance?.citations) ? payload.conceptProvenance.citations : [])
      .flatMap((citation) => citation?.supportReceipt?.checks || [])
      .filter(
        (check) =>
          check?.sourceIdentityVerified === true &&
          check?.semanticAdmissionVerified === true &&
          check?.semanticSupport === true &&
          check?.quoteInSnapshot === true,
      )
      .flatMap((check) => [check?.claim, check?.quote])
      .map(claimKey)
      .filter(Boolean),
  );
}

/**
 * Saved CourseMapper projects may predate field-level genome receipts. Replay
 * only citations still present in the current shipped manifest; stale,
 * removed, or hash-invalid references are rejected rather than grandfathered.
 * The compiler subsequently keeps only claims covered by these exact receipts.
 */
export function hydrateSavedGenomeEvidence(courseGraph = null, genomeManifest = null) {
  if (!courseGraph || typeof courseGraph !== 'object' || !genomeManifest?.references) return courseGraph;
  const lessonContent = courseGraph?.enrichmentOverlay?.lessonContent;
  if (!lessonContent || typeof lessonContent !== 'object') return courseGraph;
  const nextLessonContent = {};
  for (const [lessonId, payload] of Object.entries(lessonContent)) {
    nextLessonContent[lessonId] = sanitizeSavedResearchClaimReplay(
      hydrateGenomeLinkedPayload(payload, genomeManifest.references),
    );
  }
  const nextConcepts = Array.isArray(courseGraph.concepts)
    ? courseGraph.concepts.map((concept) => ({
        ...concept,
        kernel: sanitizeSavedResearchClaimReplay(
          hydrateGenomeLinkedPayload(concept?.kernel, genomeManifest.references),
        ),
      }))
    : courseGraph.concepts;
  const admittedGenomeClaimKeys = new Set([
    ...Object.values(nextLessonContent).flatMap((payload) => [...admittedClaimKeys(payload)]),
    ...(Array.isArray(nextConcepts) ? nextConcepts.flatMap((concept) => [...admittedClaimKeys(concept?.kernel)]) : []),
  ]);
  const sourceResources = Array.isArray(courseGraph.resources) ? courseGraph.resources : [];
  const resources = sourceResources.filter(
    (resource) => resource?.origin !== 'genome' || admittedGenomeClaimKeys.has(claimKey(resource?.evidence)),
  );
  const retainedResourceIds = new Set(resources.map((resource) => clean(resource?.id)).filter(Boolean));
  const removedResourceIds = new Set(
    sourceResources.map((resource) => clean(resource?.id)).filter((id) => id && !retainedResourceIds.has(id)),
  );
  const retainResourceRefs = (refs) =>
    Array.isArray(refs) ? refs.filter((reference) => !removedResourceIds.has(clean(reference))) : refs;
  const sessions = Array.isArray(courseGraph.sessions)
    ? courseGraph.sessions.map((session) => ({
        ...session,
        resourceRefs: retainResourceRefs(session?.resourceRefs),
        sections: Array.isArray(session?.sections)
          ? session.sections.map((section) => ({
              ...section,
              resourceRefs: retainResourceRefs(section?.resourceRefs),
            }))
          : session?.sections,
      }))
    : courseGraph.sessions;
  return {
    ...courseGraph,
    concepts: nextConcepts,
    resources,
    sessions,
    enrichmentOverlay: {
      ...(courseGraph.enrichmentOverlay || {}),
      lessonContent: nextLessonContent,
    },
  };
}
