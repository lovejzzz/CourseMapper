// Scion's private evidence prepass.
//
// This reuses the strongest source-consolidation machinery developed behind
// the historical Algi experiment, but exposes one product: Scion. Evidence is
// admitted before local inference, then bound to Scion's existing immutable
// source-ledger contract. External research is caller-controlled and OFF by
// default; this module never decides consent.

import { sha256HexSync } from './sha256Sync.js';
import {
  isLessonRelevantSemanticSurface,
  semanticIdentityTokens,
  sourceIdentityScopeMismatch,
} from './lessonSemanticRelevance.js';
import {
  EXACT_SOURCE_LEDGER_PROVENANCE,
  hasExactSourceLedgerProvenance,
  sourceLedgerAuthority,
  SOURCE_LEDGER_AUTHORITIES,
} from './sourceLedgerProvenance.js';
import { bindAdmittedSourcesToTeachingSurfaces } from './admittedSourceBinding.js';
import {
  buildInstructionalInstanceContract,
  instanceByLessonId,
  instructionalInstanceContractReceiptMatches,
  instructionalInstanceReceiptMatches,
} from './instructionalInstanceContract.js';

function clean(value = '') {
  return String(value || '')
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim();
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function instanceBoundCandidateReceipt({
  instructionalInstance,
  normalizedQuestion,
  allowedCoverageNodes = [],
  sourceSnapshots = [],
  locators = [],
  passageText = '',
  retrievalPolicyVersion = 'scion-evidence-admission-v2',
  queryProtocol = 'scion-instance-query-v1',
  candidateProtocol = 'scion-instance-candidate-v1',
} = {}) {
  const queryPayload = {
    protocol: queryProtocol,
    instructionalInstanceId: instructionalInstance.instructionalInstanceId,
    normalizedQuestion: clean(normalizedQuestion),
    allowedCoverageNodes: [...new Set(allowedCoverageNodes.map(clean).filter(Boolean))],
    retrievalPolicyVersion,
  };
  const queryId = sha256HexSync(canonicalJson(queryPayload));
  const candidatePayload = {
    protocol: candidateProtocol,
    queryId,
    sourceSnapshots: [...new Set(sourceSnapshots.map(clean).filter(Boolean))].sort(),
    locators: [...new Set(locators.map(clean).filter(Boolean))].sort(),
    passageSha256: sha256HexSync(clean(passageText)),
  };
  const candidateId = sha256HexSync(canonicalJson(candidatePayload));
  return {
    queryId,
    candidateId,
    queryReceipt: { ...queryPayload, queryId },
    candidateReceipt: { ...candidatePayload, candidateId },
  };
}

function instructionalInstanceForIntent(intent = null, instructionalPlan = null, lessonId = '') {
  if (instructionalInstanceReceiptMatches(intent?.instructionalInstance)) return intent.instructionalInstance;
  const fromContract = instanceByLessonId(instructionalPlan?.instructionalInstanceContract)?.[lessonId];
  if (instructionalInstanceReceiptMatches(fromContract)) return fromContract;
  const fallbackIntent = intent || {
    id: lessonId,
    lessonNumber: Number(String(lessonId).match(/(\d+)$/)?.[1]) || 1,
    title: lessonId,
    focusConcepts: [lessonId],
    targetObjectives: ['Use the admitted source evidence.'],
    learnerAction: 'Use the admitted source evidence.',
    expectedEvidence: {
      artifact: 'source evidence response',
      evidenceRequirement: 'Use exact admitted evidence.',
      successCriteria: ['Use admitted evidence.', 'Keep the conclusion bounded.'],
    },
    evidenceNeedKind: 'source-claims',
  };
  const fallbackContract = buildInstructionalInstanceContract({
    course: instructionalPlan?.course || { name: '', lessonCount: 1 },
    lessonIntents: instructionalPlan?.lessonIntents || [fallbackIntent],
    planningAuthority: instructionalPlan?.planningAuthority || null,
  });
  return instanceByLessonId(fallbackContract)[lessonId] || null;
}

function validFact(value) {
  const text = clean(value);
  return text.length >= 20 && text.length <= 400 && /[.!?]$/.test(text);
}

function factsFromKernelPayload(payload = {}) {
  const values = Array.isArray(payload?.kernel?.facts)
    ? payload.kernel.facts
    : Array.isArray(payload?.facts)
      ? payload.facts
      : Array.isArray(payload?.sourceFacts)
        ? payload.sourceFacts
        : [];
  return values.map((fact) => clean(typeof fact === 'string' ? fact : fact?.text)).filter(Boolean);
}

function conceptClaimsFromPayload(payload = {}) {
  const values = Array.isArray(payload?.sourceConcepts)
    ? payload.sourceConcepts
    : Array.isArray(payload?.keyTerms)
      ? payload.keyTerms
      : [];
  return values
    .map((concept) => {
      if (typeof concept === 'string') return clean(concept);
      const term = clean(concept?.term || concept?.tr);
      const rawDefinition = concept?.definition ?? concept?.df;
      const definition = clean(typeof rawDefinition === 'string' ? rawDefinition : rawDefinition?.text);
      return term && definition ? `${term}: ${definition}` : '';
    })
    .filter(Boolean);
}

function verifiedPassageClaimsFromPayload(payload = {}) {
  const citations = Array.isArray(payload?.conceptProvenance?.citations)
    ? payload.conceptProvenance.citations
    : Array.isArray(payload?.scionEvidenceReceipts)
      ? payload.scionEvidenceReceipts
      : [];
  return citations
    .flatMap((citation) => citation?.supportReceipt?.checks || [])
    .filter(
      (check) =>
        check?.quoteInSnapshot === true &&
        check?.entailed === true &&
        clean(check?.sourceId) &&
        clean(check?.quote) &&
        clean(check?.claim),
    )
    .map((check) => clean(check.claim));
}

export function scionPayloadMatchesEvidence(evidence = null, payload = null) {
  const expected = (Array.isArray(evidence?.sourceFacts) ? evidence.sourceFacts : []).map(clean).filter(Boolean);
  const actual = factsFromKernelPayload(payload);
  if (expected.length < 3 || actual.length < 3 || actual.length > expected.length) return false;
  const admitted = new Set(expected);
  // Scion's compact contract may select four of a five-fact evidence ledger.
  // A bounded exact subset remains source-immutable; any paraphrase or added
  // claim still fails the transaction and cannot inherit the citations.
  return new Set(actual).size === actual.length && actual.every((fact) => admitted.has(fact));
}

/**
 * A researched ledger may displace a generally related shipped ledger only
 * when the candidate copies only immutable facts exactly. This keeps the
 * research decision and the final lesson payload in one trust transaction:
 * citations are never rebound onto older facts merely because both payloads
 * look structurally complete.
 */
export function selectScionEvidenceCandidate(
  overlay,
  lessonId,
  previous,
  candidate,
  fallbackPick = (_previous, next) => next,
  evidenceAuthority = null,
) {
  if (isExactInstructorLedger(candidate)) return candidate;
  const evidence = overlay?.byLessonId?.[lessonId];
  if (evidenceAuthorityExplicitlyRejected(evidenceAuthority)) {
    return markScionCandidateModelProvisional(fallbackPick(previous, candidate), evidenceAuthority);
  }
  if (!evidence) {
    return fallbackPick(previous, candidate);
  }
  // Structural retrieval completeness is not semantic authority. When the
  // generation handoff supplies an explicit rejected research authority, do
  // not let those exact-but-off-intent passages replace the model/compiler
  // candidate merely because they came from a real page.
  if (scionPayloadMatchesEvidence(evidence, candidate)) return candidate;
  if (scionPayloadMatchesEvidence(evidence, previous)) return previous;
  // A fluent paraphrase is not a failed formatting preference; it is a
  // rejected evidence transaction. Restore the exact admitted ledger instead
  // of allowing the older fallback heuristic to select unsupported claims.
  // Downstream compilers can author pedagogy from these atoms, but they may
  // not draft first and ask provenance to catch up later.
  return materializeScionEvidencePayload(evidence, candidate || previous, evidenceAuthority);
}

export function materializeScionEvidencePayload(evidence = null, rejectedPayload = null, evidenceAuthority = null) {
  const authorityFacts =
    evidenceAuthority?.status === 'admitted' && Array.isArray(evidenceAuthority?.claims)
      ? evidenceAuthority.claims
          .filter(
            (claim) =>
              clean(claim?.id) &&
              clean(claim?.text) &&
              Array.isArray(claim?.sourceIds) &&
              claim.sourceIds.some((sourceId) => clean(sourceId)),
          )
          .map((claim) => clean(claim.text))
          .filter((claim) => claim.length >= 20 && claim.length <= 400)
      : [];
  // Research authority may retain neighboring exact passages that were useful
  // during retrieval but did not survive the stricter operation-bound lesson
  // ledger. Do not widen the teaching kernel back to those claims. Curated
  // local authorities keep the additive path used for separately verified
  // authentic records.
  const additiveAuthorityFacts = evidence?.evidenceOrigin === 'verified-open-research' ? [] : authorityFacts;
  const facts = [
    ...new Set([
      ...(Array.isArray(evidence?.sourceFacts) ? evidence.sourceFacts : []).map(clean).filter(validFact),
      ...additiveAuthorityFacts,
    ]),
  ].slice(0, 8);
  if (!evidence?.lessonId || facts.length < 3 || !evidence?.conceptProvenance) return rejectedPayload;
  const keyTerms = Array.isArray(evidence?.sourceConcepts) ? structuredClone(evidence.sourceConcepts) : [];
  const rejectedFields = Object.keys(rejectedPayload || {}).filter(
    (field) => !['lessonId', 'kernel', 'facts', 'sourceFacts', 'keyTerms', 'conceptProvenance'].includes(field),
  );
  return {
    lessonId: evidence.lessonId,
    ...(instructionalInstanceReceiptMatches(evidence?.instructionalInstance)
      ? {
          instructionalInstanceId: evidence.instructionalInstance.instructionalInstanceId,
          planBodySha256: evidence.instructionalInstance.planBodySha256,
          instructionalInstance: structuredClone(evidence.instructionalInstance),
        }
      : {}),
    facts: [...facts],
    sourceFacts: [...facts],
    keyTerms,
    kernel: {
      facts: [...facts],
      keyTerms: structuredClone(keyTerms),
      provenance: {
        source: EXACT_SOURCE_LEDGER_PROVENANCE,
        authority: evidence.sourceFactAuthority || evidence.evidenceOrigin || '',
        copiedFactsVerbatim: true,
        factCount: facts.length,
      },
    },
    sourceFactPolicy: evidence.sourceFactPolicy || 'numbered-source-ledger-v1',
    sourceFactAuthority: evidence.sourceFactAuthority || '',
    enrichmentSource:
      evidence.evidenceOrigin === 'verified-open-research' ? 'scion-source-researched' : 'scion-source-library',
    conceptProvenance: structuredClone(evidence.conceptProvenance),
    scionEvidenceReceipts: structuredClone(evidence.scionEvidenceReceipts || []),
    ...(evidenceAuthority?.status === 'admitted'
      ? { evidenceAuthorityReceipt: structuredClone(evidenceAuthority) }
      : {}),
    evidenceRecoveryReceipt: {
      protocol: 'scion-evidence-ledger-restoration-v1',
      status: 'exact-ledger-restored',
      rejectedCandidateFieldNames: rejectedFields.sort(),
      admittedFactCount: facts.length,
      admittedTermCount: keyTerms.length,
    },
  };
}

/**
 * Preserve every admitted evidence ledger as compiler input before Scion is
 * asked to organize it. A provider response may be missing or rejected, but
 * that must never make an already admitted lesson disappear from the saved
 * CourseGraph and exported source audit.
 */
export function materializeScionEvidenceLessonContent(overlay = null, evidenceAuthorityByLessonId = {}) {
  return Object.fromEntries(
    Object.entries(overlay?.byLessonId || {})
      .map(([lessonId, evidence]) => [
        lessonId,
        evidenceAuthorityExplicitlyRejected(evidenceAuthorityByLessonId?.[lessonId])
          ? null
          : materializeScionEvidencePayload(evidence, null, evidenceAuthorityByLessonId?.[lessonId]),
      ])
      .filter(([, payload]) => payload?.lessonId),
  );
}

function normalizeCitation(entry = {}) {
  const sourceUrl = clean(entry.sourceUrl);
  const displayTitle = clean(entry.displayTitle || entry.key);
  const id = clean(
    entry.id ||
      entry.sourceId ||
      entry.sourceRefId ||
      entry.supportReceipt?.checks?.find?.((check) => clean(check?.sourceId))?.sourceId,
  );
  if (!displayTitle || (sourceUrl && !/^https:\/\//i.test(sourceUrl))) return null;
  return {
    ...(id ? { id } : {}),
    displayTitle,
    sourceUrl,
    license: clean(entry.license),
    attribution: clean(entry.attribution),
    kind: clean(entry.kind || entry.sourceKind || 'open source'),
    evidence: clean(entry.evidence),
    ...(clean(entry.provider || entry.providerId) ? { provider: clean(entry.provider || entry.providerId) } : {}),
    ...(clean(entry.topic) ? { topic: clean(entry.topic) } : {}),
    ...(Number.isFinite(Number(entry.sourceTier)) ? { sourceTier: Number(entry.sourceTier) } : {}),
    ...(Array.isArray(entry.conceptLinks) ? { conceptLinks: entry.conceptLinks } : {}),
    ...(clean(entry.revisionId) ? { revisionId: clean(entry.revisionId) } : {}),
    ...(clean(entry.revisionTimestamp) ? { revisionTimestamp: clean(entry.revisionTimestamp) } : {}),
    ...(entry.supportReceipt ? { supportReceipt: entry.supportReceipt } : {}),
  };
}

function authoritySourcesFromPayload(payload = {}, authorityKind = '', idPrefix = 'source') {
  const citations = Array.isArray(payload?.conceptProvenance?.citations)
    ? payload.conceptProvenance.citations
    : Array.isArray(payload?.scionEvidenceReceipts)
      ? payload.scionEvidenceReceipts
      : [];
  return citations
    .map((citation, index) => {
      if (typeof citation === 'string') {
        const title = clean(citation);
        return title ? { id: `${idPrefix}-source-${index + 1}`, title, authorityKind } : null;
      }
      const normalized = normalizeCitation(citation);
      if (!normalized) return null;
      return {
        id: normalized.id || `${idPrefix}-source-${index + 1}`,
        title: normalized.displayTitle,
        ...(normalized.topic ? { topic: normalized.topic } : {}),
        ...(normalized.sourceUrl ? { url: normalized.sourceUrl } : {}),
        ...(normalized.license ? { license: normalized.license } : {}),
        ...(normalized.attribution ? { attribution: normalized.attribution } : {}),
        ...(normalized.provider ? { provider: normalized.provider } : {}),
        ...(normalized.kind ? { kind: normalized.kind } : {}),
        ...(normalized.supportReceipt ? { supportReceipt: structuredClone(normalized.supportReceipt) } : {}),
        sourceSnapshotSha256: sha256HexSync(
          canonicalJson(
            normalized.supportReceipt || {
              id: normalized.id || '',
              title: normalized.displayTitle,
              url: normalized.sourceUrl || '',
            },
          ),
        ),
        authorityKind,
      };
    })
    .filter(Boolean);
}

function sourceIsInstructionallyRelevant(source = {}, intent = null) {
  if (!intent) return true;
  return strictInstructionalSurfaceMatch([source?.title, source?.topic].map(clean).filter(Boolean).join(' · '), intent);
}

function sourceIdentityAdmissionTokens(source = {}, intent = null) {
  if (!intent) return { matchedTokens: [], unsupportedSpecializationTokens: [] };
  const stableTitle = clean(source?.title).replace(/\s*\([^)]{1,80}\)\s*$/, '');
  const surfaceTokens = new Set(
    semanticIdentityTokens([stableTitle, source?.topic].map(clean).filter(Boolean).join(' · ')),
  );
  const authorizedTokens = new Set(
    semanticIdentityTokens(
      [
        intent.title,
        ...(intent.focusConcepts || []),
        ...(intent.targetObjectives || []),
        intent?.learnerAction,
        intent?.expectedEvidence?.artifact,
        intent?.expectedEvidence?.evidenceRequirement,
        ...(intent?.expectedEvidence?.successCriteria || []),
        ...evidenceOperationIdentityTerms(intent),
      ]
        .map(clean)
        .filter(Boolean)
        .join(' · '),
    ),
  );
  return {
    matchedTokens: [...surfaceTokens].filter((token) => authorizedTokens.has(token)),
    unsupportedSpecializationTokens: [...surfaceTokens].filter(
      (token) => !authorizedTokens.has(token) && !GENERIC_INSTRUCTIONAL_SCOPE_TOKENS.has(token),
    ),
  };
}

function sourceConflictsWithInstructionalScope(source = {}, intent = null) {
  if (!intent) return false;
  const lessonIdentity = [
    intent.title,
    ...(intent.focusConcepts || []),
    ...(intent.targetObjectives || []),
    intent?.learnerAction,
    intent?.expectedEvidence?.artifact,
    intent?.expectedEvidence?.evidenceRequirement,
    ...(intent?.expectedEvidence?.successCriteria || []),
    ...evidenceOperationIdentityTerms(intent),
  ]
    .map(clean)
    .filter(Boolean)
    .join(' · ');
  const verifiedPassageIdentity = (source?.supportReceipt?.checks || [])
    .filter(
      (check) =>
        check?.quoteInSnapshot === true &&
        check?.entailed === true &&
        check?.semanticSupport === true &&
        clean(check?.claim),
    )
    .flatMap((check) => [check?.claim, check?.quote]);
  const sourceIdentity = [source?.title, source?.topic, source?.url, ...verifiedPassageIdentity]
    .map(clean)
    .filter(Boolean)
    .join(' · ');
  return sourceIdentityScopeMismatch({ lessonIdentity, sourceIdentity }).mismatch;
}

function claimLocator(payload = {}, claimText = '', sourceId = '') {
  const citations = Array.isArray(payload?.conceptProvenance?.citations)
    ? payload.conceptProvenance.citations
    : Array.isArray(payload?.scionEvidenceReceipts)
      ? payload.scionEvidenceReceipts
      : [];
  for (const citation of citations) {
    for (const check of citation?.supportReceipt?.checks || []) {
      if (clean(check?.claim) === clean(claimText) && (!sourceId || clean(check?.sourceId) === clean(sourceId))) {
        return clean(check?.locator) || 'verified-passage';
      }
    }
  }
  return 'source-ledger';
}

function verifiedSourceIdsByClaim(payload = {}, sources = []) {
  const citations = Array.isArray(payload?.conceptProvenance?.citations)
    ? payload.conceptProvenance.citations
    : Array.isArray(payload?.scionEvidenceReceipts)
      ? payload.scionEvidenceReceipts
      : [];
  const sourceByIdentity = new Map();
  for (const source of sources) {
    for (const identity of [source?.id, source?.url, source?.title].map(clean).filter(Boolean)) {
      sourceByIdentity.set(identity, source.id);
    }
  }
  const byClaim = new Map();
  citations.forEach((citation, index) => {
    const normalized = normalizeCitation(citation);
    const sourceId =
      sourceByIdentity.get(clean(normalized?.id)) ||
      sourceByIdentity.get(clean(normalized?.sourceUrl)) ||
      sourceByIdentity.get(clean(normalized?.displayTitle)) ||
      sources[index]?.id;
    if (!sourceId) return;
    for (const check of citation?.supportReceipt?.checks || []) {
      if (check?.quoteInSnapshot !== true || check?.entailed !== true || check?.semanticSupport !== true) {
        continue;
      }
      for (const text of [check?.claim, check?.quote].map(clean).filter(Boolean)) {
        const ids = byClaim.get(text) || new Set();
        ids.add(sourceId);
        byClaim.set(text, ids);
      }
    }
  });
  return byClaim;
}

function citationHasVerifiedPassageSupport(citation = {}) {
  const receipt = citation?.supportReceipt;
  const checks = Array.isArray(receipt?.checks) ? receipt.checks : [];
  return (
    receipt?.status === 'passed' &&
    checks.length > 0 &&
    checks.every(
      (check) =>
        check?.quoteInSnapshot === true &&
        check?.entailed === true &&
        clean(check?.sourceId) &&
        clean(check?.quote) &&
        clean(check?.claim),
    )
  );
}

function evidenceOperationIdentityTerms(intent = null) {
  const values = [
    intent?.learnerAction,
    intent?.expectedEvidence?.artifact,
    intent?.expectedEvidence?.evidenceRequirement,
    ...(intent?.expectedEvidence?.successCriteria || []),
  ];
  return [
    ...new Set(
      values
        .flatMap((value) => [
          ...String(value || '').matchAll(
            /\b([A-Z][\p{L}\p{N}'’.-]*\s+(?:[\p{L}\p{N}'’.-]+\s+){0,3}(?:examples?|records?|datasets?|corpora?))\b/gu,
          ),
        ])
        .map((match) => clean(match[1]))
        .filter(Boolean),
    ),
  ];
}

function lessonShapeFromIntent(intent = null) {
  if (!intent) return null;
  return {
    title: intent.title,
    keyConcepts: intent.focusConcepts || [],
    // These terms come from the frozen, hash-bound pre-draft evidence
    // operation. They may route a verified source to the intended learner
    // task, but they never supply factual authority themselves.
    semanticIdentityTerms: evidenceOperationIdentityTerms(intent),
    sections: [
      {
        topicSection: (intent.focusConcepts || []).join(' · '),
      },
    ],
  };
}

const GENERIC_INSTRUCTIONAL_SCOPE_TOKENS = new Set(
  [
    'analysis',
    'concept',
    'context',
    'course',
    'data',
    'evidence',
    'example',
    'execution',
    'form',
    'implementation',
    'interpretation',
    'language',
    'lesson',
    'method',
    'process',
    'processing',
    'project',
    'record',
    'semantic',
    'semantics',
    'source',
    'structure',
    'system',
    'topic',
  ].flatMap(semanticIdentityTokens),
);

function strictInstructionalSurfaceMatch(surface = '', intent = null) {
  if (!intent) return true;
  const identity = [
    intent.title,
    ...(intent.focusConcepts || []),
    ...(intent.targetObjectives || []),
    intent?.expectedEvidence?.evidenceRequirement,
    ...(intent?.expectedEvidence?.successCriteria || []),
    intent?.evidenceBoundary?.limitation,
    ...evidenceOperationIdentityTerms(intent),
  ]
    .map(clean)
    .filter(Boolean)
    .join(' · ');
  if (sourceIdentityScopeMismatch({ lessonIdentity: identity, sourceIdentity: surface }).mismatch) return false;
  const identityTokens = new Set(semanticIdentityTokens(identity));
  const surfaceTokens = new Set(semanticIdentityTokens(surface));
  const distinguishingOverlap = [...surfaceTokens].filter(
    (token) => identityTokens.has(token) && !GENERIC_INSTRUCTIONAL_SCOPE_TOKENS.has(token),
  );
  if (distinguishingOverlap.length > 0) return true;
  const normalizedSurface = clean(surface).toLowerCase();
  return [
    intent.title,
    ...(intent.focusConcepts || []),
    ...(intent.targetObjectives || []),
    intent?.expectedEvidence?.evidenceRequirement,
    ...(intent?.expectedEvidence?.successCriteria || []),
    intent?.evidenceBoundary?.limitation,
    ...evidenceOperationIdentityTerms(intent),
  ]
    .map((value) => clean(value).toLowerCase())
    .filter((value) => value.length >= 4)
    .some((value) => normalizedSurface === value || normalizedSurface.includes(value));
}

function authorityReceiptIsFresh(authority = null) {
  if (authority?.status !== 'admitted' || !clean(authority?.receiptSha256)) return false;
  const { receiptSha256, ...payload } = authority;
  return sha256HexSync(JSON.stringify(payload)) === receiptSha256;
}

function evidenceAuthorityExplicitlyRejected(authority = null) {
  return authority != null && !authorityReceiptIsFresh(authority);
}

function isExactInstructorLedger(payload) {
  return (
    hasExactSourceLedgerProvenance(payload) &&
    sourceLedgerAuthority(payload) === SOURCE_LEDGER_AUTHORITIES.INSTRUCTOR_SUPPLIED
  );
}

function markScionCandidateModelProvisional(payload = null, authority = null) {
  if (!payload || typeof payload !== 'object') return payload;
  // A research miss concerns the retrieved material. It cannot revoke an
  // independent instructor ledger that the canonical parser copied exactly.
  // This preserves source identity; it does not certify factual correctness
  // or grant the failed research any citation/teaching authority.
  if (isExactInstructorLedger(payload)) return payload;
  const factCount = [
    ...(Array.isArray(payload?.facts) ? payload.facts : []),
    ...(Array.isArray(payload?.sourceFacts) ? payload.sourceFacts : []),
    ...(Array.isArray(payload?.kernel?.facts) ? payload.kernel.facts : []),
  ].filter((fact) => clean(fact)).length;
  return {
    ...payload,
    sourceFactAuthority: 'model-provisional',
    enrichmentSource: 'scion-model-provisional',
    conceptProvenance: {
      ...(payload.conceptProvenance || {}),
      source: 'scion-model-provisional',
      authority: 'model-provisional',
      fullyAnchored: false,
      citations: [],
      admittedCitations: [],
    },
    kernel: {
      ...(payload.kernel || {}),
      provenance: {
        ...(payload.kernel?.provenance || {}),
        source: 'scion-model-provisional',
        authority: 'model-provisional',
        copiedFactsVerbatim: false,
        factCount,
      },
    },
    semanticAdmissionReceipt: {
      protocol: 'scion-evidence-authority-quarantine-v1',
      status: 'model-provisional',
      evidenceAuthorityStatus: clean(authority?.status || 'needs-evidence'),
      claimBoundary:
        'The model payload may organize pedagogy, but its semantic fields are not learner-visible factual authority.',
    },
  };
}

function authenticAuthoritySupportsIntent(authority = null, intent = null) {
  if (
    !intent ||
    !authorityReceiptIsFresh(authority) ||
    authority?.protocol !== 'coursemapper-evidence-authority-v1' ||
    authority?.authorityKind !== 'curated-authentic-language-evidence' ||
    authority?.admissionPolicyVersion !== 'scion-authentic-language-evidence-admission-v1' ||
    authority?.authenticEvidenceReceipt?.protocol !== 'scion-authentic-language-evidence-transaction-v1' ||
    !/^[a-f0-9]{64}$/.test(clean(authority?.authenticEvidenceReceipt?.taskContractSha256)) ||
    !/^[a-f0-9]{64}$/.test(clean(authority?.authenticEvidenceReceipt?.payloadSha256))
  ) {
    return false;
  }
  const claims = Array.isArray(authority?.claims) ? authority.claims : [];
  const sources = Array.isArray(authority?.sources) ? authority.sources : [];
  if (
    claims.length < 2 ||
    sources.length < 1 ||
    sources.some(
      (source) =>
        !clean(source?.id) || !clean(source?.title) || !/^[a-f0-9]{64}$/.test(clean(source?.sourceRecordSha256)),
    )
  ) {
    return false;
  }
  const sourceIds = new Set(sources.map((source) => clean(source.id)));
  if (
    claims.some(
      (claim) =>
        !clean(claim?.text) ||
        !Array.isArray(claim?.sourceIds) ||
        claim.sourceIds.length === 0 ||
        claim.sourceIds.some((sourceId) => !sourceIds.has(clean(sourceId))),
    )
  ) {
    return false;
  }
  return [...claims.map((claim) => claim.text), ...sources.flatMap((source) => [source.title, source.topic])]
    .map(clean)
    .filter(Boolean)
    .some((surface) => strictInstructionalSurfaceMatch(surface, intent));
}

function evidenceIntentAdmission(payload = {}, intent = null) {
  if (!intent) return { status: 'not-checked', conceptMatches: 0, claimMatches: 0, sourceIdentityMatches: 0 };
  const lesson = lessonShapeFromIntent(intent);
  const concepts = (
    Array.isArray(payload?.sourceConcepts)
      ? payload.sourceConcepts
      : Array.isArray(payload?.keyTerms)
        ? payload.keyTerms
        : []
  )
    .map((concept) => clean(typeof concept === 'string' ? concept : concept?.term || concept?.tr))
    .filter(Boolean);
  const claims = [...factsFromKernelPayload(payload), ...conceptClaimsFromPayload(payload)];
  const verifiedSourceIdentities = [
    ...new Set(
      (Array.isArray(payload?.conceptProvenance?.citations) ? payload.conceptProvenance.citations : [])
        .filter(citationHasVerifiedPassageSupport)
        .flatMap((citation) => [citation?.displayTitle, citation?.topic])
        .map(clean)
        .filter(Boolean),
    ),
  ];
  const conceptMatches = concepts.filter((concept) => isLessonRelevantSemanticSurface(concept, lesson)).length;
  const claimMatches = claims.filter((claim) => isLessonRelevantSemanticSurface(claim, lesson)).length;
  const sourceIdentityMatches = verifiedSourceIdentities.filter((sourceIdentity) =>
    isLessonRelevantSemanticSurface(sourceIdentity, lesson),
  ).length;
  return {
    // A glossary entry is a presentation convenience, not an independent
    // truth requirement. Conversely, an exact admitted source concept can
    // establish the stable lesson identity even when its later, byte-exact
    // passage sentences use local cohesion instead of repeating the title.
    // Every atom still needs its own passage receipt; this identity check only
    // decides whether that already-verified ledger belongs to this lesson.
    // A verified source identity can establish which lesson owns a set of
    // exact passage claims even when cohesive follow-on sentences do not
    // repeat the source title. The citation must first pass the complete
    // passage-support receipt; an unverified search-result title never earns
    // this authority. Individual facts remain exact, receipt-bound atoms.
    status: claimMatches >= 1 || conceptMatches >= 1 || sourceIdentityMatches >= 1 ? 'passed' : 'failed',
    admissionBasis:
      claimMatches >= 1
        ? conceptMatches >= 1
          ? 'concept-and-claim'
          : 'claim-ledger'
        : conceptMatches >= 1
          ? 'source-concept-ledger'
          : sourceIdentityMatches >= 1
            ? 'verified-source-identity'
            : 'none',
    conceptMatches,
    claimMatches,
    sourceIdentityMatches,
  };
}

function evidenceAuthorityAdmissionDiagnostic(payload = {}, intent = null) {
  const facts = factsFromKernelPayload(payload).filter(validFact).slice(0, 8);
  const provenanceSource = clean(payload?.conceptProvenance?.source).toLowerCase();
  const citations = Array.isArray(payload?.conceptProvenance?.citations) ? payload.conceptProvenance.citations : [];
  const normalizedSources = authoritySourcesFromPayload(payload, '', 'diagnostic');
  const scopeMismatchCount = normalizedSources.filter((source) =>
    sourceConflictsWithInstructionalScope(source, intent),
  ).length;
  const unsupportedCitationCount = citations.filter((citation) => !citationHasVerifiedPassageSupport(citation)).length;
  const authorityKind = admitAuthorityKind(payload);
  const intentAdmission = evidenceIntentAdmission(payload, intent);
  const reasons = [];
  if (facts.length < 3) reasons.push('fewer-than-three-valid-facts');
  if (citations.length === 0) reasons.push('missing-citations');
  if (normalizedSources.length === 0) reasons.push('missing-inspectable-source-identity');
  if (normalizedSources.length > 0 && scopeMismatchCount === normalizedSources.length) {
    reasons.push('source-identity-scope-mismatch');
  }
  if (payload?.conceptProvenance?.fullyAnchored !== true) reasons.push('claims-not-fully-anchored');
  if (!authorityKind) {
    if (['algi-researched', 'verified-open-research'].includes(provenanceSource) && unsupportedCitationCount > 0) {
      reasons.push('research-passage-receipt-not-verified');
    } else {
      reasons.push('unrecognized-source-authority');
    }
  }
  if (intentAdmission.status === 'failed') reasons.push('lesson-intent-semantic-mismatch');
  return {
    status: reasons.length === 0 ? 'admitted' : 'rejected',
    provenanceSource,
    factCount: facts.length,
    citationCount: citations.length,
    inspectableSourceCount: normalizedSources.length,
    scopeMismatchCount,
    unsupportedCitationCount,
    fullyAnchored: payload?.conceptProvenance?.fullyAnchored === true,
    reasons,
    intentAdmission,
  };
}

function admitAuthorityKind(payload = {}) {
  const provenanceSource = clean(payload?.conceptProvenance?.source).toLowerCase();
  const citations = Array.isArray(payload?.conceptProvenance?.citations) ? payload.conceptProvenance.citations : [];
  if (
    ['algi-researched', 'verified-open-research'].includes(provenanceSource) &&
    citations.length > 0 &&
    citations.every(citationHasVerifiedPassageSupport)
  ) {
    return 'verified-open-research';
  }
  if (['genome-linked', 'genome-augmented'].includes(provenanceSource) && citations.length > 0) {
    return 'shipped-source-library';
  }
  return '';
}

function evidenceAuthorityFromPayload(lessonId, payload = {}, intent = null, instructionalInstance = null) {
  const facts = factsFromKernelPayload(payload).filter(validFact).slice(0, 8);
  // Retrieval metadata never gets to self-declare authority. This is the
  // Stage-4 admission decision: policy examines immutable provenance and
  // passage-support receipts, then assigns the authoritative class.
  const authorityKind = admitAuthorityKind(payload);
  const candidateSources = authoritySourcesFromPayload(payload, authorityKind, `${lessonId}-${authorityKind}`);
  const enforceResearchSourceAdmission = authorityKind === 'verified-open-research';
  // A verified passage can look locally relevant while belonging to a
  // neighboring discipline (for example, a generic comparison sentence from
  // a programming-language source inside a human-language lesson). Filter the
  // source identity before claim admission so the signed authority and its
  // later replay projection enforce the same boundary. Do not reject an
  // otherwise sound lesson ledger merely because one mixed search result was
  // out of scope; reject only the atoms whose exact support disappears.
  const sourceAdmissionRows = candidateSources.map((source) => {
    const tokenAdmission = enforceResearchSourceAdmission
      ? sourceIdentityAdmissionTokens(source, intent)
      : { matchedTokens: [], unsupportedSpecializationTokens: [] };
    return {
      source,
      scopeMismatch: sourceConflictsWithInstructionalScope(source, intent),
      baseRelevant: !enforceResearchSourceAdmission || sourceIsInstructionallyRelevant(source, intent),
      ...tokenAdmission,
    };
  });
  const exactOrAuthorizedRootPresent = sourceAdmissionRows.some(
    (row) => !row.scopeMismatch && row.baseRelevant && row.unsupportedSpecializationTokens.length === 0,
  );
  const sourceAdmissionDecisions = sourceAdmissionRows.map((row) => {
    const admitted =
      !row.scopeMismatch &&
      row.baseRelevant &&
      (!exactOrAuthorizedRootPresent || row.unsupportedSpecializationTokens.length === 0);
    return {
      sourceId: row.source.id,
      titleSha256: sha256HexSync(clean(row.source.title)),
      sourceSnapshotSha256: row.source.sourceSnapshotSha256,
      locators: [
        ...new Set((row.source?.supportReceipt?.checks || []).map((check) => clean(check?.locator)).filter(Boolean)),
      ],
      admitted,
      reason: row.scopeMismatch
        ? 'source-identity-scope-mismatch'
        : !row.baseRelevant
          ? 'lesson-intent-semantic-mismatch'
          : exactOrAuthorizedRootPresent && row.unsupportedSpecializationTokens.length > 0
            ? 'undeclared-source-specialization'
            : 'lesson-identity-or-plan-authorized',
      unsupportedSpecializationTokens: row.unsupportedSpecializationTokens,
      matchedIdentityTokens: row.matchedTokens,
    };
  });
  const admittedSourceDecisionIds = new Set(
    sourceAdmissionDecisions.filter((decision) => decision.admitted).map((decision) => decision.sourceId),
  );
  const conflictingSourceIds = new Set(
    sourceAdmissionDecisions.filter((decision) => !decision.admitted).map((decision) => decision.sourceId),
  );
  const sources = candidateSources.filter((source) => !conflictingSourceIds.has(source.id));
  const fullyAnchored = payload?.conceptProvenance?.fullyAnchored === true;
  const intentAdmission = evidenceIntentAdmission(payload, intent);
  const payloadInstance = payload?.instructionalInstance;
  const instanceFresh = instructionalInstanceReceiptMatches(instructionalInstance);
  const payloadInstanceMatches =
    !payloadInstance ||
    (instructionalInstanceReceiptMatches(payloadInstance) &&
      payloadInstance.instructionalInstanceId === instructionalInstance?.instructionalInstanceId &&
      payloadInstance.lessonId === lessonId);
  if (
    facts.length < 3 ||
    sources.length === 0 ||
    !fullyAnchored ||
    !authorityKind ||
    intentAdmission.status === 'failed' ||
    !instanceFresh ||
    !payloadInstanceMatches
  ) {
    return null;
  }
  const sourceIds = sources.map((source) => source.id);
  const verifiedClaimSources = verifiedSourceIdsByClaim(payload, candidateSources);
  // Research definitions are admitted source atoms too: fullyAnchored means
  // every selected definition and fact carries a source anchor. The canonical
  // blueprint renders a glossary atom as `term: definition`, so bind that exact
  // visible string now instead of later misclassifying it as model invention.
  // Any paraphrased definition still fails the exact equality check in the
  // instructional intent graph.
  // The enrichment projection intentionally carries both compact teaching
  // facts and the longer exact source-passage claims behind them. Bind both
  // representations to the same admission transaction so post-enrichment
  // planning can distinguish a verified passage from an invented expansion.
  // Preserve every atom the local author can project before retaining longer
  // passage variants. A high-volume research receipt previously filled the
  // bounded claim window with source passages and dropped an exact glossary
  // definition that the same admitted payload later rendered.
  const passageClaims = verifiedPassageClaimsFromPayload(payload);
  const conceptClaims = conceptClaimsFromPayload(payload);
  const factSet = new Set(facts);
  const passageSet = new Set(passageClaims);
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const relevantSourceIds = new Set(
    sources.filter((source) => sourceIsInstructionallyRelevant(source, intent)).map((source) => source.id),
  );
  const claimTexts = [...new Set([...facts, ...conceptClaims, ...passageClaims])].slice(0, 64);
  const rejectedAtoms = [];
  const claims = claimTexts.flatMap((text) => {
    const originalExactSourceIds = [...(verifiedClaimSources.get(text) || [])];
    const exactSourceIds = originalExactSourceIds.filter((sourceId) => !conflictingSourceIds.has(sourceId));
    const directlyRelevant = !intent || strictInstructionalSurfaceMatch(text, intent);
    const boundSourceIds =
      originalExactSourceIds.length > 0
        ? exactSourceIds
        : directlyRelevant && relevantSourceIds.size > 0
          ? [...relevantSourceIds]
          : sourceIds;
    const supportedByRelevantSource = boundSourceIds.some((sourceId) => relevantSourceIds.has(sourceId));
    if (boundSourceIds.length === 0 || (!directlyRelevant && !supportedByRelevantSource)) {
      rejectedAtoms.push({
        textSha256: sha256HexSync(text),
        sourceIds: originalExactSourceIds.length > 0 ? originalExactSourceIds : [...boundSourceIds],
        reason:
          originalExactSourceIds.length > 0 && exactSourceIds.length === 0
            ? 'source-identity-scope-mismatch'
            : 'instructional-instance-semantic-mismatch',
      });
      return [];
    }
    const normalizedQuestion = clean(
      boundSourceIds
        .map((sourceId) => sourceById.get(sourceId))
        .flatMap((source) => [source?.topic, source?.title])
        .filter(Boolean)
        .join(' · ') || intent?.focusConcepts?.join(' · '),
    );
    const candidateBinding = instanceBoundCandidateReceipt({
      instructionalInstance,
      normalizedQuestion,
      allowedCoverageNodes: intent?.focusConcepts || [],
      sourceSnapshots: boundSourceIds
        .map((sourceId) => sourceById.get(sourceId)?.sourceSnapshotSha256 || '')
        .filter(Boolean),
      locators: boundSourceIds.map((sourceId) => claimLocator(payload, text, sourceId)),
      passageText: text,
    });
    return [
      {
        id: `claim-${candidateBinding.candidateId.slice(0, 24)}`,
        candidateId: candidateBinding.candidateId,
        queryId: candidateBinding.queryId,
        queryReceipt: candidateBinding.queryReceipt,
        candidateReceipt: candidateBinding.candidateReceipt,
        instructionalInstanceId: instructionalInstance.instructionalInstanceId,
        text,
        // Exact passage support narrows a teaching claim to the source that
        // actually earned it. Legacy shipped ledgers without per-claim support
        // remain bound to their complete admitted source set.
        sourceIds: boundSourceIds,
        authorityKind,
        claimRole: factSet.has(text) ? 'fact' : passageSet.has(text) ? 'source-passage' : 'definition',
        admissionPolicyVersion: 'scion-evidence-admission-v2',
      },
    ];
  });
  const admittedFactCount = claims.filter((claim) => claim.claimRole === 'fact').length;
  if (admittedFactCount < 3) return null;
  const admittedSourceIds = new Set(claims.flatMap((claim) => claim.sourceIds || []));
  const admittedSources = sources.filter((source) => admittedSourceIds.has(source.id));
  if (admittedSources.length === 0) return null;
  const exactPayload = {
    protocol: 'coursemapper-evidence-authority-v1',
    lessonId,
    instructionalInstanceId: instructionalInstance.instructionalInstanceId,
    planBodySha256: instructionalInstance.planBodySha256,
    instructionalInstance: structuredClone(instructionalInstance),
    status: 'admitted',
    authorityKind,
    admissionPolicyVersion: 'scion-evidence-admission-v2',
    claims,
    sources: admittedSources,
    intentAdmission,
    atomAdmission: {
      protocol: 'scion-evidence-atom-admission-v1',
      admittedAtomCount: claims.length,
      rejectedAtomCount: rejectedAtoms.length,
      rejectedAtoms,
    },
    sourceAdmission: {
      protocol: 'scion-evidence-source-admission-v1',
      lessonIdentityTokens: [
        ...new Set(semanticIdentityTokens([intent?.title, ...(intent?.focusConcepts || [])].join(' · '))),
      ],
      instructionalInstanceId: instructionalInstance.instructionalInstanceId,
      governingPlanBodySha256: instructionalInstance.planBodySha256,
      governingPlanningContextSha256: instructionalInstance.planningContextSha256,
      exactOrAuthorizedRootPresent,
      admittedSourceCount: admittedSourceDecisionIds.size,
      rejectedSourceCount: sourceAdmissionDecisions.length - admittedSourceDecisionIds.size,
      decisions: sourceAdmissionDecisions,
    },
  };
  return {
    ...exactPayload,
    receiptSha256: sha256HexSync(JSON.stringify(exactPayload)),
  };
}

function mergeEvidenceAuthorities(lessonId, authorities = [], instructionalInstance = null) {
  if (!instructionalInstanceReceiptMatches(instructionalInstance)) return null;
  const admitted = authorities.filter((authority) => {
    if (!authorityReceiptIsFresh(authority) || authority?.lessonId !== lessonId) return false;
    if (authority?.instructionalInstanceId) {
      return (
        authority.instructionalInstanceId === instructionalInstance.instructionalInstanceId &&
        instructionalInstanceReceiptMatches(authority?.instructionalInstance)
      );
    }
    return authority?.authorityKind === 'curated-authentic-language-evidence';
  });
  if (admitted.length === 0) return null;
  if (admitted.length === 1 && admitted[0].instructionalInstanceId === instructionalInstance.instructionalInstanceId) {
    return admitted[0];
  }
  const sources = [];
  const sourceIds = new Set();
  for (const authority of admitted) {
    for (const source of authority.sources || []) {
      if (!source?.id || sourceIds.has(source.id)) continue;
      sourceIds.add(source.id);
      sources.push({
        ...source,
        sourceSnapshotSha256:
          clean(source?.sourceSnapshotSha256) ||
          sha256HexSync(
            canonicalJson({
              id: clean(source?.id),
              title: clean(source?.title),
              url: clean(source?.url),
              supportReceipt: source?.supportReceipt || null,
            }),
          ),
      });
    }
  }
  const claimByCandidate = new Map();
  for (const authority of admitted) {
    for (const claim of authority.claims || []) {
      const text = clean(claim?.text);
      if (!text) continue;
      const sourceById = new Map((authority.sources || []).map((source) => [source.id, source]));
      const inheritedCandidateId = clean(claim?.candidateId);
      const inheritedQueryId = clean(claim?.queryId);
      const inheritedReceiptComplete =
        /^[a-f0-9]{64}$/.test(inheritedCandidateId) &&
        /^[a-f0-9]{64}$/.test(inheritedQueryId) &&
        claim?.candidateReceipt?.candidateId === inheritedCandidateId &&
        claim?.queryReceipt?.queryId === inheritedQueryId;
      const generatedBinding = inheritedReceiptComplete
        ? null
        : instanceBoundCandidateReceipt({
            instructionalInstance,
            normalizedQuestion: `Supplemental exact authority ${authority.receiptSha256}`,
            allowedCoverageNodes: [],
            sourceSnapshots: (claim?.sourceIds || [])
              .map((sourceId) => sourceById.get(sourceId)?.sourceSnapshotSha256 || '')
              .filter(Boolean),
            locators: (claim?.sourceIds || []).map(() => 'supplemental-source-ledger'),
            passageText: text,
            queryProtocol: 'scion-supplemental-query-v1',
            candidateProtocol: 'scion-supplemental-candidate-v1',
          });
      const candidateId = inheritedReceiptComplete ? inheritedCandidateId : generatedBinding.candidateId;
      if (
        claim?.instructionalInstanceId &&
        claim.instructionalInstanceId !== instructionalInstance.instructionalInstanceId
      ) {
        continue;
      }
      const existing = claimByCandidate.get(candidateId);
      if (existing) {
        existing.sourceIds = [...new Set([...(existing.sourceIds || []), ...(claim.sourceIds || [])])];
        continue;
      }
      claimByCandidate.set(candidateId, {
        ...claim,
        id: clean(claim?.id) || `claim-${candidateId.slice(0, 24)}`,
        candidateId,
        queryId: inheritedReceiptComplete ? inheritedQueryId : generatedBinding.queryId,
        queryReceipt: inheritedReceiptComplete ? structuredClone(claim.queryReceipt) : generatedBinding.queryReceipt,
        candidateReceipt: inheritedReceiptComplete
          ? structuredClone(claim.candidateReceipt)
          : generatedBinding.candidateReceipt,
        instructionalInstanceId: instructionalInstance.instructionalInstanceId,
        sourceIds: [...new Set(claim.sourceIds || [])],
      });
    }
  }
  const authorityKinds = [...new Set(admitted.map((authority) => authority.authorityKind).filter(Boolean))];
  const mergedClaims = [...claimByCandidate.values()].slice(0, 96);
  const rejectedAtoms = admitted.flatMap((authority) => authority?.atomAdmission?.rejectedAtoms || []);
  const exactPayload = {
    protocol: 'coursemapper-evidence-authority-v1',
    lessonId,
    instructionalInstanceId: instructionalInstance.instructionalInstanceId,
    planBodySha256: instructionalInstance.planBodySha256,
    instructionalInstance: structuredClone(instructionalInstance),
    status: 'admitted',
    authorityKind: authorityKinds.length === 1 ? authorityKinds[0] : 'composite-source-authority',
    admissionPolicyVersion: 'scion-evidence-admission-v2',
    claims: mergedClaims,
    sources,
    atomAdmission: {
      protocol: 'scion-evidence-atom-admission-v1',
      admittedAtomCount: mergedClaims.length,
      rejectedAtomCount: rejectedAtoms.length,
      rejectedAtoms,
    },
    predecessorAuthorityReceipts: admitted.map((authority) => authority.receiptSha256),
    sourceAdmissionReceipts: admitted
      .map((authority) => authority?.sourceAdmission)
      .filter((receipt) => receipt?.protocol === 'scion-evidence-source-admission-v1'),
  };
  return {
    ...exactPayload,
    receiptSha256: sha256HexSync(JSON.stringify(exactPayload)),
  };
}

/**
 * Convert retrieval/linker output into the only contract that can authorize
 * semantic drafting. Course titles, topics, objectives, and source labels are
 * deliberately absent: a lesson earns authority only from exact claims with
 * attached source receipts.
 */
export function createScionEvidenceAuthorityContract({
  lessonIndices = [],
  genomeLessonContent = {},
  evidenceOverlay = null,
  authenticLanguageEvidenceAuthorityByLessonId = {},
  instructionalPlan = null,
} = {}) {
  const byLessonId = {};
  const intentByLessonId = new Map(
    (instructionalPlan?.lessonIntents || []).map((intent) => [clean(intent?.id), intent]),
  );
  for (const lessonIndex of lessonIndices) {
    const lessonId = `lesson-${lessonIndex + 1}`;
    const intent = intentByLessonId.get(lessonId) || null;
    const instructionalInstance = instructionalInstanceForIntent(intent, instructionalPlan, lessonId);
    const researched = evidenceOverlay?.byLessonId?.[lessonId];
    const linked = genomeLessonContent?.[lessonId];
    // Research and the shipped source library are independently admitted
    // ledgers. The local compiler may select either exact payload later, so
    // the pre-draft transaction must authorize their exact union. Preferring
    // one here let a sound linked payload fail against an unrelated but valid
    // research receipt; widening only to the two verified ledgers preserves
    // the fail-closed boundary for every other claim.
    const researchedAuthority = evidenceAuthorityFromPayload(lessonId, researched, intent, instructionalInstance);
    const linkedAuthority = evidenceAuthorityFromPayload(lessonId, linked, intent, instructionalInstance);
    const authenticAuthority = authenticLanguageEvidenceAuthorityByLessonId?.[lessonId];
    // Authentic-language authority is not a topical retrieval heuristic: its
    // hash also binds the exact lesson task contract produced by the planning
    // transaction. Keep that replayable task authority distinct from genome
    // and open-research payloads, which must clear strict lesson-identity
    // admission before they can authorize drafting.
    // A curated authentic-language transaction contains exact source records,
    // visible examples, and its answer-key boundary. It can therefore lead the
    // subject ledger when (and only when) the fresh receipt is structurally
    // complete and an exact claim or source identity matches this frozen
    // instructional intent. Unrelated or stale packets remain supplemental.
    const authenticCanLead = authenticAuthoritySupportsIntent(authenticAuthority, intent);
    const subjectMatterAuthority = mergeEvidenceAuthorities(
      lessonId,
      [researchedAuthority, linkedAuthority, ...(authenticCanLead ? [authenticAuthority] : [])],
      instructionalInstance,
    );
    const authority = subjectMatterAuthority
      ? authenticCanLead
        ? subjectMatterAuthority
        : mergeEvidenceAuthorities(lessonId, [subjectMatterAuthority, authenticAuthority], instructionalInstance)
      : null;
    byLessonId[lessonId] =
      authority ||
      Object.freeze({
        protocol: 'coursemapper-evidence-authority-v1',
        lessonId,
        instructionalInstanceId: instructionalInstance?.instructionalInstanceId || '',
        planBodySha256: instructionalInstance?.planBodySha256 || '',
        ...(instructionalInstance ? { instructionalInstance: structuredClone(instructionalInstance) } : {}),
        status: 'needs-evidence',
        authorityKind: '',
        claims: [],
        sources: [],
        admissionDiagnostics: {
          researched: evidenceAuthorityAdmissionDiagnostic(researched, intent),
          shipped: evidenceAuthorityAdmissionDiagnostic(linked, intent),
          authenticLanguageEvidence: authenticAuthority
            ? authorityReceiptIsFresh(authenticAuthority)
              ? {
                  status: 'supplemental-only',
                  reasons: [
                    authenticAuthoritySupportsIntent(authenticAuthority, intent)
                      ? 'instructional-instance-binding-failed'
                      : 'lesson-intent-semantic-mismatch',
                  ],
                }
              : { status: 'rejected', reasons: ['authority-receipt-missing-or-stale'] }
            : { status: 'not-applicable', reasons: [] },
        },
        receiptSha256: '',
      });
  }
  const admittedLessonIds = Object.entries(byLessonId)
    .filter(([, authority]) => authority.status === 'admitted')
    .map(([lessonId]) => lessonId);
  const contractWithoutReceipt = {
    protocol: 'coursemapper-governing-source-contract-v1',
    status: admittedLessonIds.length === lessonIndices.length ? 'admitted' : 'needs-evidence',
    predecessor: {
      curriculumPlanSha256: clean(instructionalPlan?.receipt?.exactInputSha256),
      evidenceNeedsSha256: clean(instructionalPlan?.evidenceNeedsPlan?.receipt?.exactInputSha256),
      instructionalInstanceContractSha256: instructionalInstanceContractReceiptMatches(
        instructionalPlan?.instructionalInstanceContract,
      )
        ? instructionalPlan.instructionalInstanceContract.receiptSha256
        : null,
    },
    requestedLessonCount: lessonIndices.length,
    admittedLessonIds,
    byLessonId,
  };
  return {
    ...contractWithoutReceipt,
    receiptSha256: sha256HexSync(JSON.stringify(contractWithoutReceipt)),
  };
}

function evidenceRankingTokens(value = '') {
  return clean(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 4)
    .map((token) => token.replace(/(?:ments?|ing|ed|es|s)$/i, ''))
    .filter(
      (token) =>
        token &&
        !/^(?:about|apply|course|evidenc|explain|introduct|language|lesson|learn|source|student|topic|visual|week)$/.test(
          token,
        ),
    );
}

function rankOperationBoundEvidenceFacts(payload = {}, lessonPrompt = null) {
  const originalFacts = (Array.isArray(payload?.facts) ? payload.facts : []).map(clean).filter(validFact);
  if (!lessonPrompt) return [...new Set(originalFacts)].slice(0, 5);
  const citations = Array.isArray(payload?.conceptProvenance?.citations) ? payload.conceptProvenance.citations : [];
  const identityTokens = new Set(
    evidenceRankingTokens(
      [
        lessonPrompt.title,
        ...(lessonPrompt.topics || []),
        ...(lessonPrompt.objectives || []),
        ...(lessonPrompt.evidenceIntent || []),
      ].join(' '),
    ),
  );
  const verifiedClaimEntries = citations.flatMap((citation, citationIndex) => {
    const sourceTokens = evidenceRankingTokens(citation?.displayTitle || citation?.key || citation?.topic || '');
    const sourceMatchesIdentity = sourceTokens.some((token) => identityTokens.has(token));
    const sourceKey = clean(citation?.id || citation?.sourceId || citation?.sourceUrl) || `source-${citationIndex + 1}`;
    return (citation?.supportReceipt?.checks || [])
      .filter(
        (check) =>
          check?.quoteInSnapshot === true &&
          check?.entailed === true &&
          check?.semanticSupport === true &&
          clean(check?.claim) === clean(check?.quote),
      )
      .map((check) => ({ claim: clean(check.claim), sourceKey, sourceMatchesIdentity }))
      .filter(
        ({ claim }) =>
          validFact(claim) && !claim.includes(';') && claim.split(/\s+/).length >= 6 && claim.split(/\s+/).length <= 40,
      );
  });
  const hasIdentityMatchedSource = verifiedClaimEntries.some((entry) => entry.sourceMatchesIdentity);
  const eligibleClaimEntries = hasIdentityMatchedSource
    ? verifiedClaimEntries.filter((entry) => entry.sourceMatchesIdentity)
    : verifiedClaimEntries;
  const eligibleClaims = new Set(eligibleClaimEntries.map((entry) => entry.claim));
  // Once at least three exact, lesson-identity-matched passages are available,
  // broad retrieval facts may no longer re-enter merely because they share a
  // domain word. Sparse legacy receipts retain their original facts so this
  // remains fail-soft without pretending one passage is a complete ledger.
  const operationFacts =
    eligibleClaims.size >= 3 ? originalFacts.filter((fact) => eligibleClaims.has(fact)) : originalFacts;
  const candidates = [...new Set([...operationFacts, ...eligibleClaims])];
  const titleTokens = new Set(evidenceRankingTokens(lessonPrompt.title));
  const operationTokens = new Set(
    evidenceRankingTokens(
      [
        ...(Array.isArray(lessonPrompt.topics) ? lessonPrompt.topics : []),
        ...(Array.isArray(lessonPrompt.objectives) ? lessonPrompt.objectives : []),
        ...(Array.isArray(lessonPrompt.evidenceIntent) ? lessonPrompt.evidenceIntent : []),
      ].join(' '),
    ),
  );
  const lessonShape = {
    title: lessonPrompt.title,
    keyConcepts: lessonPrompt.topics || [],
    outcomes: lessonPrompt.objectives || [],
    semanticIdentityTerms: lessonPrompt.evidenceIntent || [],
  };
  const ranked = candidates
    .map((fact, index) => {
      const factTokens = new Set(evidenceRankingTokens(fact));
      const operationOverlap = [...factTokens].filter((token) => operationTokens.has(token)).length;
      const titleOverlap = [...factTokens].filter((token) => titleTokens.has(token)).length;
      return {
        fact,
        index,
        score:
          operationOverlap * 12 +
          titleOverlap * 5 +
          (isLessonRelevantSemanticSurface(fact, lessonShape) ? 20 : 0) +
          (originalFacts.includes(fact) ? 2 : 0),
      };
    })
    .sort((left, right) => right.score - left.score || left.index - right.index);
  const selected = [];
  const selectedFacts = new Set();
  for (const sourceKey of [...new Set(eligibleClaimEntries.map((entry) => entry.sourceKey))]) {
    const sourceClaims = new Set(
      eligibleClaimEntries.filter((entry) => entry.sourceKey === sourceKey).map((entry) => entry.claim),
    );
    const best = ranked.find((entry) => sourceClaims.has(entry.fact) && !selectedFacts.has(entry.fact));
    if (!best || selected.length >= 5) continue;
    selected.push(best.fact);
    selectedFacts.add(best.fact);
  }
  for (const entry of ranked) {
    if (selected.length >= 5) break;
    if (selectedFacts.has(entry.fact)) continue;
    selected.push(entry.fact);
    selectedFacts.add(entry.fact);
  }
  return selected;
}

export function scionEvidenceLessonFromComposedPayload(payload = {}, lessonPrompt = null) {
  const lessonId = clean(payload.lessonId);
  const facts = rankOperationBoundEvidenceFacts(payload, lessonPrompt);
  const sourceConcepts = (Array.isArray(payload.keyTerms) ? payload.keyTerms : []).filter(Boolean).slice(0, 6);
  const citations = (Array.isArray(payload?.conceptProvenance?.citations) ? payload.conceptProvenance.citations : [])
    .map(normalizeCitation)
    .filter(Boolean)
    .slice(0, 8);
  if (!lessonId || facts.length < 3 || citations.length === 0 || payload?.conceptProvenance?.fullyAnchored !== true) {
    return null;
  }
  const licenses = [...new Set(citations.map((citation) => citation.license).filter(Boolean))];
  const attribution = citations.map((citation) => citation.attribution).find(Boolean) || 'EduTool source library';
  return {
    lessonId,
    ...(instructionalInstanceReceiptMatches(lessonPrompt?.instructionalInstance)
      ? {
          instructionalInstanceId: lessonPrompt.instructionalInstance.instructionalInstanceId,
          planBodySha256: lessonPrompt.instructionalInstance.planBodySha256,
          instructionalInstance: structuredClone(lessonPrompt.instructionalInstance),
        }
      : {}),
    sourceFactPolicy: 'numbered-source-ledger-v1',
    sourceFactAuthority:
      payload?.conceptProvenance?.source === 'algi-researched' ? 'verified-open-research' : 'shipped-source-library',
    sourceFacts: facts,
    ...(sourceConcepts.length > 0 ? { sourceConcepts } : {}),
    sourceLedgerAttribution: {
      title: `Scion evidence ledger for ${lessonId}`,
      author: attribution,
      license: licenses.join('; '),
      url: citations.map((citation) => citation.sourceUrl).find(Boolean) || '',
    },
    scionEvidenceReceipts: citations,
    conceptProvenance: {
      ...payload.conceptProvenance,
      citations,
      fullyAnchored: true,
    },
    evidenceOrigin:
      payload?.conceptProvenance?.source === 'algi-researched' ? 'verified-open-research' : 'shipped-source-library',
  };
}

export function createScionEvidenceOverlay(composed = {}, structuredPrompt = null) {
  let parsed = { lessons: [] };
  try {
    parsed = typeof composed?.text === 'string' && composed.text.trim() ? JSON.parse(composed.text) : parsed;
  } catch {
    // A malformed optional prepass is an evidence miss, never a build failure.
  }
  const lessonPrompts = new Map(
    (Array.isArray(structuredPrompt?.lessons) ? structuredPrompt.lessons : []).map((lesson) => [
      clean(lesson?.lessonId),
      lesson,
    ]),
  );
  const lessons = (Array.isArray(parsed?.lessons) ? parsed.lessons : [])
    .map((lesson) => scionEvidenceLessonFromComposedPayload(lesson, lessonPrompts.get(clean(lesson?.lessonId))))
    .filter(Boolean);
  return {
    protocol: 'scion-evidence-prepass-v1',
    byLessonId: Object.fromEntries(lessons.map((lesson) => [lesson.lessonId, lesson])),
    admitted: lessons.length,
    requested: Math.max(0, Number(composed?.requested) || 0),
    uncovered: Array.isArray(composed?.uncovered) ? [...composed.uncovered] : [],
    researched: Math.max(0, Number(composed?.researched) || 0),
    cachedResearch: Math.max(0, Number(composed?.cachedResearch) || 0),
    researchReceipt: composed?.researchReceipt || null,
  };
}

export function mergeScionEvidenceOverlays(primary = null, revision = null) {
  if (!primary) return revision;
  if (!revision) return primary;
  const byLessonId = {
    ...(primary.byLessonId || {}),
    ...(revision.byLessonId || {}),
  };
  const admittedLessonIds = new Set(Object.keys(byLessonId));
  const uncovered = [...new Set([...(primary.uncovered || []), ...(revision.uncovered || [])].filter(Boolean))].filter(
    (lessonId) => !admittedLessonIds.has(lessonId),
  );
  const researchReceipts = [
    ...(Array.isArray(primary.researchReceipts) ? primary.researchReceipts : [primary.researchReceipt]),
    ...(Array.isArray(revision.researchReceipts) ? revision.researchReceipts : [revision.researchReceipt]),
  ].filter(Boolean);
  return {
    ...primary,
    protocol: 'scion-evidence-prepass-v1',
    byLessonId,
    admitted: admittedLessonIds.size,
    requested: Math.max(Number(primary.requested) || 0, admittedLessonIds.size + uncovered.length),
    uncovered,
    researched: (Number(primary.researched) || 0) + (Number(revision.researched) || 0),
    cachedResearch: (Number(primary.cachedResearch) || 0) + (Number(revision.cachedResearch) || 0),
    researchReceipt: researchReceipts.at(-1) || null,
    ...(researchReceipts.length > 1 ? { researchReceipts } : {}),
  };
}

export function excludeRejectedEvidenceSeeds(payloadByLessonId = {}, rejectedLessonIndices = []) {
  const rejectedLessonIds = new Set(rejectedLessonIndices.map((lessonIndex) => `lesson-${Number(lessonIndex) + 1}`));
  return Object.fromEntries(
    Object.entries(payloadByLessonId || {}).filter(([lessonId]) => !rejectedLessonIds.has(clean(lessonId))),
  );
}

export async function prepareScionEvidenceLayer({
  structuredPrompt,
  researchEnabled = false,
  researchStorage,
  forceResearchLessonIds = [],
  researchProvider: sharedResearchProvider,
  signal,
  onResearchProgress,
} = {}) {
  const [{ composeAlgiLessonKernels }, { buildResearchProvider }] = await Promise.all([
    import('./algiKernelComposer'),
    import('./algiComposer'),
  ]);
  const requestedLessons = Array.isArray(structuredPrompt?.lessons) ? structuredPrompt.lessons.length : 0;
  // Direct callers use the same bounded course budget as the public handoff.
  // The handoff supplies a shared transport so repairs cannot reset it.
  const researchProvider =
    sharedResearchProvider ||
    buildResearchProvider({
      enabled: researchEnabled,
      signal,
      maxRequests: Math.min(96, 8 + requestedLessons * 6),
      maxDurationMs: Math.min(60000, 16000 + requestedLessons * 4000),
    });
  const composed = await composeAlgiLessonKernels({
    structuredPrompt,
    factCount: 5,
    researchProvider,
    courseContext: structuredPrompt?.courseName || '',
    researchStorage,
    forceResearchLessonIds,
    onResearchProgress,
    signal,
  });
  return createScionEvidenceOverlay(composed, structuredPrompt);
}

export function summarizeScionEvidenceOverlay(overlay = null) {
  if (!overlay) return null;
  return {
    protocol: overlay.protocol,
    requested: overlay.requested,
    admitted: overlay.admitted,
    researched: overlay.researched,
    cachedResearch: overlay.cachedResearch,
    uncovered: overlay.uncovered,
  };
}

export function scionEvidenceLessonIds(overlay = null) {
  return Object.keys(overlay?.byLessonId || {}).filter((lessonId) => clean(lessonId));
}

export function bindScionEvidenceProvenance(overlay, lessonId, payload, evidenceAuthority = null) {
  if (isExactInstructorLedger(payload)) return payload;
  const evidence = overlay?.byLessonId?.[lessonId];
  if (evidenceAuthorityExplicitlyRejected(evidenceAuthority)) {
    return markScionCandidateModelProvisional(payload, evidenceAuthority);
  }
  if (!evidence?.conceptProvenance) {
    return payload;
  }
  if (!payload || !scionPayloadMatchesEvidence(evidence, payload)) {
    return materializeScionEvidencePayload(evidence, payload, evidenceAuthority);
  }
  const sourceConcepts = Array.isArray(evidence.sourceConcepts) ? structuredClone(evidence.sourceConcepts) : [];
  return {
    ...payload,
    // The local model may organize and explain admitted facts, but it may not
    // silently replace the source-anchored glossary with plausible definitions
    // from its weights. Project the exact admitted concepts into both payload
    // shapes consumed downstream. A ledger-only lesson intentionally carries
    // an empty glossary instead of laundering model-authored terminology.
    keyTerms: sourceConcepts,
    ...(payload?.kernel ? { kernel: { ...payload.kernel, keyTerms: structuredClone(sourceConcepts) } } : {}),
    enrichmentSource:
      evidence.evidenceOrigin === 'verified-open-research' ? 'scion-source-researched' : 'scion-source-library',
    conceptProvenance: evidence.conceptProvenance,
    ...(evidenceAuthority?.status === 'admitted'
      ? { evidenceAuthorityReceipt: structuredClone(evidenceAuthority) }
      : {}),
  };
}

export function buildScionEvidenceLessonPrompt(courseMap = {}, lessonIndex = 0, instructionalIntent = null) {
  const lesson = courseMap?.lessons?.[lessonIndex] || {};
  const sections = Array.isArray(lesson.sections) ? lesson.sections : [];
  const columnValues = (...keys) =>
    keys
      .flatMap((key) => [lesson?.[key], ...sections.map((section) => section?.[key])])
      .map(clean)
      .filter(Boolean);
  const courseMapEvidenceIntent = instructionalIntent
    ? columnValues('asynchronousActivities', 'synchronousActivities', 'evaluateDesign')
    : columnValues('asynchronousActivities', 'synchronousActivities', 'supportingResources', 'evaluateDesign');
  const plannedFocusConcepts = Array.isArray(instructionalIntent?.focusConcepts)
    ? instructionalIntent.focusConcepts.map(clean).filter(Boolean)
    : [];
  const plannedObjectives = Array.isArray(instructionalIntent?.targetObjectives)
    ? instructionalIntent.targetObjectives.map(clean).filter(Boolean)
    : [];
  const evidenceIntent = [
    clean(instructionalIntent?.expectedEvidence?.evidenceRequirement),
    clean(instructionalIntent?.learnerAction),
    ...(Array.isArray(instructionalIntent?.expectedEvidence?.successCriteria)
      ? instructionalIntent.expectedEvidence.successCriteria.map(clean)
      : []),
    ...courseMapEvidenceIntent,
  ].filter(Boolean);
  return {
    lessonId: `lesson-${lessonIndex + 1}`,
    ...(instructionalInstanceReceiptMatches(instructionalIntent?.instructionalInstance)
      ? {
          instructionalInstanceId: instructionalIntent.instructionalInstanceId,
          instructionalInstance: structuredClone(instructionalIntent.instructionalInstance),
        }
      : {}),
    title: clean(lesson.title) || `Lesson ${lessonIndex + 1}`,
    topics: [
      ...new Set([
        ...plannedFocusConcepts,
        ...columnValues('topicSection'),
        ...(instructionalIntent ? [] : columnValues('learningGoals')),
      ]),
    ],
    objectives: [...new Set([...plannedObjectives, ...columnValues('learningObjectives', 'weeklyAssessments')])],
    ...(evidenceIntent.length > 0 ? { evidenceIntent } : {}),
  };
}

export async function prepareScionEvidenceForGeneration({
  courseMap,
  lessonIndices = [],
  authorityRequiredLessonIndices = [],
  genomeLessonContent = {},
  genomePartialOverlays = {},
  instructionalPlan = null,
  researchEnabled = false,
  currentResearchRequired = false,
  researchStorage,
  researchProvider,
  signal,
  recordEvent,
  appendLog,
} = {}) {
  const { needsAuthoritativeSourceResearch } = await import('./algiKernelComposer');
  const authorityRequired = new Set(authorityRequiredLessonIndices);
  const unresolvedLessonIndices = lessonIndices.filter((lessonIndex) => {
    const lessonId = `lesson-${lessonIndex + 1}`;
    const existing = genomeLessonContent?.[lessonId];
    return (
      authorityRequired.has(lessonIndex) ||
      !existing ||
      Boolean(genomePartialOverlays?.[lessonId]) ||
      needsAuthoritativeSourceResearch(courseMap?.lessons?.[lessonIndex], existing)
    );
  });
  if (unresolvedLessonIndices.length === 0) {
    return {
      overlay: null,
      summary: null,
      researchReady: false,
      stageDecision: 'not needed: shipped source library covered the course',
      bindProvenance: (_lessonId, payload) => payload,
    };
  }
  const structuredPrompt = {
    courseName: courseMap?.courseName || '',
    lessons: unresolvedLessonIndices.map((lessonIndex) => {
      const lessonId = `lesson-${lessonIndex + 1}`;
      const instructionalIntent = (instructionalPlan?.lessonIntents || []).find(
        (intent) => clean(intent?.id) === lessonId,
      );
      return {
        ...buildScionEvidenceLessonPrompt(courseMap, lessonIndex, instructionalIntent),
        currentResearchRequired,
      };
    }),
  };
  const overlay = await prepareScionEvidenceLayer({
    structuredPrompt,
    researchEnabled,
    researchStorage,
    researchProvider,
    forceResearchLessonIds: unresolvedLessonIndices
      .filter((lessonIndex) => authorityRequired.has(lessonIndex))
      .map((lessonIndex) => `lesson-${lessonIndex + 1}`),
    signal,
    onResearchProgress: (progress = {}) => {
      recordEvent?.({
        type: 'scionEvidenceProgress',
        stage: 'scion-evidence',
        label: progress.label || 'Checking current lesson evidence',
        detail: progress.detail || '',
        featureId: 'blueprintEnrichment',
        task: 'blueprintEnrichment',
        progress: Math.max(0, Math.min(1, Number(progress.progress) || 0)),
      });
    },
  });
  recordEvent?.({
    type: 'pipelineDecision',
    stage: 'scionEvidence',
    label: 'Scion evidence retrieval',
    detail: `${overlay.admitted}/${overlay.requested} unresolved lesson ledgers structurally complete before lesson-intent admission · ${overlay.researched} researched · ${overlay.cachedResearch} reused from local research memory`,
    featureId: 'blueprintEnrichment',
    task: 'blueprintEnrichment',
  });
  if (overlay.admitted > 0) {
    appendLog?.(
      `✓ Scion retrieved ${overlay.admitted} structurally complete lesson ledger${overlay.admitted === 1 ? '' : 's'} for semantic admission${overlay.researched > 0 ? ` (${overlay.researched} from verified current sources)` : ''}`,
      'done',
    );
  }
  return {
    overlay,
    summary: summarizeScionEvidenceOverlay(overlay),
    researchReady: overlay.researched > 0 || overlay.cachedResearch > 0,
    stageDecision: `ran (${overlay.admitted}/${overlay.requested} ledgers${researchEnabled ? `, ${overlay.researched} researched` : ', on-device'})`,
    bindProvenance: (lessonId, payload) => bindScionEvidenceProvenance(overlay, lessonId, payload),
  };
}

export async function prepareScionEvidenceGenerationHandoff(options = {}) {
  try {
    // Discovery, provider fallback and targeted repair share ONE budget.
    // Recovery cannot restart the clock or bypass a provider circuit breaker.
    const { buildResearchProvider } = await import('./algiComposer');
    const lessonCount = options.lessonIndices?.length || 0;
    options = {
      ...options,
      researchProvider:
        options.researchProvider ||
        buildResearchProvider({
          enabled: options.researchEnabled === true,
          signal: options.signal,
          maxRequests: Math.min(96, 8 + lessonCount * 6),
          maxDurationMs: Math.min(60000, 16000 + lessonCount * 4000),
        }),
    };
    // Structural completeness is not source authority. Inspect the exact
    // contract first so a cached/model-shaped payload cannot suppress the
    // research pass merely because it happens to contain enough fields.
    const preAcquisitionContract = createScionEvidenceAuthorityContract({
      lessonIndices: options.lessonIndices,
      genomeLessonContent: options.genomeLessonContent,
      authenticLanguageEvidenceAuthorityByLessonId: options.authenticLanguageEvidenceAuthorityByLessonId,
      instructionalPlan: options.instructionalPlan,
    });
    const authorityRequiredLessonIndices = (options.lessonIndices || []).filter(
      (lessonIndex) => preAcquisitionContract.byLessonId?.[`lesson-${lessonIndex + 1}`]?.status !== 'admitted',
    );
    let result = await prepareScionEvidenceForGeneration({
      ...options,
      authorityRequiredLessonIndices,
    });
    let governingSourceContract = createScionEvidenceAuthorityContract({
      lessonIndices: options.lessonIndices,
      genomeLessonContent: options.genomeLessonContent,
      evidenceOverlay: result.overlay,
      authenticLanguageEvidenceAuthorityByLessonId: options.authenticLanguageEvidenceAuthorityByLessonId,
      instructionalPlan: options.instructionalPlan,
    });
    const rejectedLessonIndices = (options.lessonIndices || []).filter(
      (lessonIndex) => governingSourceContract.byLessonId?.[`lesson-${lessonIndex + 1}`]?.status !== 'admitted',
    );
    // One targeted recovery attempt uses the remaining shared provider
    // budget and bypasses stale local research memory. It never loops and it
    // never changes the authority policy: revised evidence must independently
    // satisfy the same exact-source and semantic-admission checks.
    if (
      options.researchEnabled &&
      rejectedLessonIndices.length > 0 &&
      (options.researchProvider?.diagnostics?.().remainingMs ?? 0) > 1000 &&
      (options.researchProvider?.diagnostics?.().requestCount ?? 0) <
        (options.researchProvider?.diagnostics?.().maxRequests ?? 0)
    ) {
      options.recordEvent?.({
        type: 'pipelineDecision',
        stage: 'scionEvidenceRecovery',
        label: 'Asking rejected lessons narrower source questions',
        detail: `${rejectedLessonIndices.length} lesson${rejectedLessonIndices.length === 1 ? '' : 's'} receiving one cache-bypassed recovery pass`,
        featureId: 'blueprintEnrichment',
        task: 'blueprintEnrichment',
      });
      const revision = await prepareScionEvidenceForGeneration({
        ...options,
        lessonIndices: rejectedLessonIndices,
        authorityRequiredLessonIndices: rejectedLessonIndices,
        // A recovery pass exists because these lesson payloads already failed
        // authority admission. Do not seed the retry with those same shipped
        // or partial overlays: doing so can reproduce the rejected ledger and
        // then overwrite a stronger research transaction during merge.
        genomeLessonContent: excludeRejectedEvidenceSeeds(options.genomeLessonContent, rejectedLessonIndices),
        genomePartialOverlays: excludeRejectedEvidenceSeeds(options.genomePartialOverlays, rejectedLessonIndices),
        researchStorage: null,
      });
      const overlay = mergeScionEvidenceOverlays(result.overlay, revision.overlay);
      result = {
        ...result,
        overlay,
        summary: summarizeScionEvidenceOverlay(overlay),
        researchReady: result.researchReady || revision.researchReady,
        stageDecision: `${result.stageDecision}; targeted recovery ${revision.stageDecision}`,
      };
      governingSourceContract = createScionEvidenceAuthorityContract({
        lessonIndices: options.lessonIndices,
        genomeLessonContent: options.genomeLessonContent,
        evidenceOverlay: result.overlay,
        authenticLanguageEvidenceAuthorityByLessonId: options.authenticLanguageEvidenceAuthorityByLessonId,
        instructionalPlan: options.instructionalPlan,
      });
    }
    const evidenceByLessonId = Object.fromEntries(
      (governingSourceContract.admittedLessonIds || [])
        .map((lessonId) => [lessonId, result.overlay?.byLessonId?.[lessonId]])
        .filter(([, evidence]) => evidence),
    );
    const requestedLessonCount = options.lessonIndices?.length || 0;
    const admittedLessonCount = governingSourceContract.admittedLessonIds.length;
    const rejectedLessonDetails = Object.entries(governingSourceContract.byLessonId || {})
      .filter(([, authority]) => authority?.status !== 'admitted')
      .map(([lessonId, authority]) => {
        const reasons = [
          ...(authority?.admissionDiagnostics?.researched?.reasons || []),
          ...(authority?.admissionDiagnostics?.shipped?.reasons || []),
          ...(authority?.admissionDiagnostics?.authenticLanguageEvidence?.reasons || []),
        ].filter((reason, index, entries) => reason && entries.indexOf(reason) === index);
        return `${lessonId}${reasons.length > 0 ? ` (${reasons.join(', ')})` : ''}`;
      });
    options.recordEvent?.({
      type: 'pipelineDecision',
      stage: 'scionEvidenceAdmission',
      label: 'Lesson-intent evidence admission',
      detail: `${admittedLessonCount}/${requestedLessonCount} lessons authorized to draft${
        rejectedLessonDetails.length > 0 ? ` · ${rejectedLessonDetails.join('; ')}` : ''
      }`,
      featureId: 'blueprintEnrichment',
      task: 'blueprintEnrichment',
    });
    return {
      stageDecision: `${admittedLessonCount}/${requestedLessonCount} lesson source authorit${admittedLessonCount === 1 ? 'y' : 'ies'} admitted for drafting · ${result.stageDecision}`,
      evidenceAcquisitionReceipt: result.overlay?.researchReceipt || null,
      evidenceAcquisitionSummary: result.summary || null,
      researchTransaction: options.researchProvider?.diagnostics?.() || null,
      governingSourceContract,
      bindTeachingSurfaces: (courseMap, courseGraph) =>
        governingSourceContract.status === 'admitted'
          ? bindAdmittedSourcesToTeachingSurfaces(courseMap, courseGraph, governingSourceContract)
          : null,
      lessonContent: materializeScionEvidenceLessonContent(result.overlay, governingSourceContract.byLessonId),
      promptOptions: evidenceByLessonId && Object.keys(evidenceByLessonId).length > 0 ? { evidenceByLessonId } : {},
      contentSourceOverrideLessonIds: [...(governingSourceContract.admittedLessonIds || [])],
      bindProvenance: (lessonId, payload) =>
        bindScionEvidenceProvenance(result.overlay, lessonId, payload, governingSourceContract.byLessonId?.[lessonId]),
      selectCandidate: (lessonId, previous, candidate, fallbackPick) =>
        selectScionEvidenceCandidate(
          result.overlay,
          lessonId,
          previous,
          candidate,
          fallbackPick,
          governingSourceContract.byLessonId?.[lessonId],
        ),
      knowledgeBackboneEvent: result.researchReady
        ? {
            type: 'pipelineDecision',
            stage: 'knowledgeBackbone',
            label: 'Scion source receipts ready',
            detail:
              'Skipped duplicate open-reading discovery · Scion research sources and verification receipts are already attached',
          }
        : null,
    };
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    return {
      stageDecision: `failed open: ${error?.message || 'unknown'}`,
      evidenceAcquisitionReceipt: null,
      evidenceAcquisitionSummary: null,
      governingSourceContract: createScionEvidenceAuthorityContract({
        lessonIndices: options.lessonIndices,
        genomeLessonContent: options.genomeLessonContent,
        authenticLanguageEvidenceAuthorityByLessonId: options.authenticLanguageEvidenceAuthorityByLessonId,
        instructionalPlan: options.instructionalPlan,
      }),
      bindTeachingSurfaces: () => null,
      lessonContent: {},
      promptOptions: {},
      contentSourceOverrideLessonIds: [],
      bindProvenance: (_lessonId, payload) => payload,
      selectCandidate: (_lessonId, previous, candidate, fallbackPick) =>
        typeof fallbackPick === 'function' ? fallbackPick(previous, candidate) : candidate || previous,
      knowledgeBackboneEvent: null,
    };
  }
}
