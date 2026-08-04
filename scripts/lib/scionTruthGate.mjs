import { createHash, createPublicKey, verify as verifyBytes } from 'node:crypto';

import { assessScionKeyTermContract } from '../../src/lib/scionKeyTermContract.js';
import { assessSourceTeacherPedagogy } from './scionRoundtableSourceExperiment.mjs';
import { scionLessonKernelSha256 } from './scionLessonKernelCampaign.mjs';

export const SCION_TRUTH_GATE_SEED_PROTOCOL = 'scion-truth-gate-seed-v1';
export const SCION_TRUTH_GATE_REVIEW_PROTOCOL = 'scion-truth-gate-review-receipt-v1';
export const SCION_TRUTH_GATE_ASSESSMENT_PROTOCOL = 'scion-truth-gate-assessment-v1';

const SHA256_RE = /^[a-f0-9]{64}$/;
const DOMAINS = new Set(['computer-science', 'geology', 'music-theory']);
const VERDICTS = new Set(['accept', 'reject']);
const REVIEW_RESPONSE_PROTOCOL = 'scion-truth-gate-review-response-v1';
const REVIEW_RECEIPT_KEYS = [
  'blindness',
  'claimBoundary',
  'identity',
  'inputSha256',
  'protocol',
  'rawReviewSha256',
  'reasons',
  'reviewAuthorityRef',
  'reviewSessionRef',
  'reviewedAt',
  'reviewerRef',
  'reviewerSeat',
  'schemaVersion',
  'seedSha256',
  'sourcePacketSha256',
  'verdicts',
].sort();

function clean(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function sha256Hex(value) {
  return createHash('sha256').update(value).digest('hex');
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function withoutIdentity(value = {}) {
  const copy = structuredClone(value);
  delete copy.identity;
  return copy;
}

function identityFor(value) {
  return {
    algorithm: 'sha256-canonical-json',
    sha256: scionLessonKernelSha256(withoutIdentity(value)),
  };
}

function identityValid(value = {}) {
  return value.identity?.algorithm === 'sha256-canonical-json' &&
    value.identity?.sha256 === scionLessonKernelSha256(withoutIdentity(value));
}

function validIsoInstant(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}

export function normalizeScionTruthGateSourceClaim(value) {
  return clean(value).toLowerCase();
}

export function scionTruthGateSourceClaimSha256(value) {
  return scionLessonKernelSha256(normalizeScionTruthGateSourceClaim(value));
}

export function canonicalScionTruthGateSourceUrl(value) {
  try {
    const url = new URL(value);
    url.hash = '';
    url.hostname = url.hostname.toLowerCase();
    url.searchParams.sort();
    if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, '');
    return url.toString();
  } catch {
    return clean(value);
  }
}

function sourcePacketPayload(sourcePacket = {}) {
  const rawCaptures = Array.isArray(sourcePacket.sourceEvidence?.captures)
    ? sourcePacket.sourceEvidence.captures
    : [{
        locator: sourcePacket.sourceEvidence?.locator,
        capturedText: sourcePacket.sourceEvidence?.capturedText,
      }];
  const captures = rawCaptures.map((capture) => {
    const capturedText = clean(capture?.capturedText);
    return {
      locator: clean(capture?.locator),
      capturedText,
      capturedTextSha256: scionLessonKernelSha256(capturedText),
    };
  });
  return {
    sourceId: clean(sourcePacket.sourceId),
    url: clean(sourcePacket.url),
    title: clean(sourcePacket.title),
    publisher: clean(sourcePacket.publisher),
    retrievedAt: sourcePacket.retrievedAt,
    claims: (sourcePacket.claims || []).map(clean),
    sourceEvidence: { captures },
  };
}

function validateSourcePacket(sourcePacket = {}) {
  const issues = [];
  const payload = sourcePacketPayload(sourcePacket);
  if (!/^[a-z0-9][a-z0-9-]{5,95}$/.test(payload.sourceId)) issues.push('invalid-source-id');
  try {
    const url = new URL(payload.url);
    if (url.protocol !== 'https:') issues.push('source-url-not-https');
  } catch {
    issues.push('invalid-source-url');
  }
  if (!payload.title || !payload.publisher) issues.push('missing-source-metadata');
  if (!validIsoInstant(payload.retrievedAt)) issues.push('invalid-source-retrieval-time');
  if (payload.claims.length === 0 || payload.claims.some((claim) => claim.length < 24)) {
    issues.push('missing-or-underspecified-source-claims');
  }
  if (unique(payload.claims.map(normalizeScionTruthGateSourceClaim)).length !== payload.claims.length) {
    issues.push('duplicate-source-claims');
  }
  const captures = payload.sourceEvidence.captures;
  const evidenceWordCounts = captures.map((capture) => capture.capturedText.split(/\s+/).filter(Boolean).length);
  if (
    captures.length < 1 ||
    captures.length > 3 ||
    captures.some((capture, index) => !capture.locator || evidenceWordCounts[index] < 6 || evidenceWordCounts[index] > 35) ||
    evidenceWordCounts.reduce((sum, count) => sum + count, 0) > 80 ||
    unique(captures.map((capture) => capture.capturedTextSha256)).length !== captures.length
  ) {
    issues.push('invalid-bounded-source-evidence');
  }
  return { issues: unique(issues), payload };
}

export function buildScionTruthGateSeed({
  caseId,
  projectId,
  promptId,
  domain,
  sourcePacket,
  term,
  createdAt = new Date().toISOString(),
} = {}) {
  const source = validateSourcePacket(sourcePacket);
  if (source.issues.length > 0) throw new Error(`Invalid Truth Gate source packet: ${source.issues.join(', ')}`);
  if (!/^[a-z0-9][a-z0-9:/-]{7,127}$/.test(caseId || '')) throw new Error('Invalid Truth Gate case id');
  if (!/^[a-z0-9][a-z0-9-]{5,95}$/.test(projectId || '')) throw new Error('Invalid Truth Gate project id');
  if (!/^[a-z0-9][a-z0-9:/-]{7,127}$/.test(promptId || '')) throw new Error('Invalid Truth Gate prompt id');
  if (!DOMAINS.has(domain)) throw new Error('Invalid Truth Gate domain');
  if (!validIsoInstant(createdAt)) throw new Error('Invalid Truth Gate seed creation time');
  const authorizedIndexes = [...new Set(term?.sourceFactIndexes || [])];
  if (
    authorizedIndexes.length === 0 ||
    authorizedIndexes.some((index) => !Number.isInteger(index) || index < 0 || source.payload.claims[index] === undefined)
  ) {
    throw new Error('Truth Gate seeds require valid authorized source indexes');
  }
  const seed = {
    schemaVersion: 1,
    protocol: SCION_TRUTH_GATE_SEED_PROTOCOL,
    status: 'awaiting-independent-review',
    createdAt,
    caseId,
    projectId,
    promptId,
    domain,
    sourcePacket: source.payload,
    sourcePacketSha256: scionLessonKernelSha256(source.payload),
    sourceClaimSha256s: source.payload.claims.map(scionTruthGateSourceClaimSha256),
    term: structuredClone(term),
    inputSha256: scionLessonKernelSha256({ sourceClaims: source.payload.claims, term }),
    trainingEligible: false,
    productionEligible: false,
    claimBoundary:
      'This is a review candidate. Structural admission and source binding do not establish factual or pedagogical truth.',
  };
  seed.identity = identityFor(seed);
  return seed;
}

export function validateScionTruthGateSeed(seed = {}) {
  const issues = [];
  if (seed.protocol !== SCION_TRUTH_GATE_SEED_PROTOCOL || seed.schemaVersion !== 1) issues.push('invalid-seed-protocol');
  if (!identityValid(seed)) issues.push('invalid-seed-identity');
  if (!DOMAINS.has(seed.domain)) issues.push('invalid-seed-domain');
  if (!validIsoInstant(seed.createdAt)) issues.push('invalid-seed-created-at');
  const source = validateSourcePacket(seed.sourcePacket);
  issues.push(...source.issues);
  const expectedPacketSha256 = scionLessonKernelSha256(source.payload);
  if (seed.sourcePacketSha256 !== expectedPacketSha256) issues.push('source-packet-binding-mismatch');
  const expectedClaimSha256s = source.payload.claims.map(scionTruthGateSourceClaimSha256);
  if (scionLessonKernelSha256(seed.sourceClaimSha256s || []) !== scionLessonKernelSha256(expectedClaimSha256s)) {
    issues.push('source-claim-binding-mismatch');
  }
  if (seed.inputSha256 !== scionLessonKernelSha256({ sourceClaims: source.payload.claims, term: seed.term })) {
    issues.push('seed-input-binding-mismatch');
  }
  const authorizedClaims = (seed.term?.sourceFactIndexes || [])
    .filter((index) => Number.isInteger(index) && source.payload.claims[index] !== undefined)
    .map((index) => source.payload.claims[index]);
  if (authorizedClaims.length === 0 || authorizedClaims.length !== new Set(seed.term?.sourceFactIndexes || []).size) {
    issues.push('invalid-authorized-source-indexes');
  }
  const contract = assessScionKeyTermContract(seed.term, {
    definitionMin: 45,
    knownFacts: authorizedClaims,
    semanticProfile: 'source-strict-v6',
  });
  const pedagogy = assessSourceTeacherPedagogy(contract);
  if (!contract.eligible) issues.push(...contract.issues.map((issue) => `source-strict:${issue}`));
  if (!pedagogy.eligible) issues.push(...pedagogy.pedagogicalIssues.map((issue) => `pedagogy:${issue}`));
  if (seed.trainingEligible !== false || seed.productionEligible !== false) issues.push('unsafe-seed-eligibility');
  return {
    valid: unique(issues).length === 0,
    issues: unique(issues),
    sourceStrictIssues: contract.issues,
    pedagogicalIssues: pedagogy.pedagogicalIssues,
    authorizedSourceClaims: authorizedClaims,
  };
}

function roundtableMessageAttestationPayload(message, sessionId) {
  return {
    protocol: 'roundtable-message-attestation-v1',
    sessionId,
    messageId: message.id,
    author: message.author,
    role: message.role,
    body: message.body,
    at: message.at,
    round: message.round ?? null,
    model: message.model ?? null,
    effort: message.effort ?? null,
    stage: message.stage ?? null,
  };
}

export function verifyRoundtableTruthGateReviewMessage(message = {}) {
  const attestation = message.bridgeAttestation;
  if (
    attestation?.protocol !== 'roundtable-message-attestation-v1' ||
    attestation?.algorithm !== 'Ed25519' ||
    !attestation.sessionId ||
    !attestation.publicKeySpkiBase64 ||
    !attestation.signatureBase64 ||
    !SHA256_RE.test(attestation.publicKeyFingerprintSha256 || '') ||
    !SHA256_RE.test(attestation.payloadSha256 || '')
  ) {
    return false;
  }
  const material = JSON.stringify(roundtableMessageAttestationPayload(message, attestation.sessionId));
  if (sha256Hex(material) !== attestation.payloadSha256) return false;
  try {
    const publicKeyBytes = Buffer.from(attestation.publicKeySpkiBase64, 'base64');
    if (sha256Hex(publicKeyBytes) !== attestation.publicKeyFingerprintSha256) return false;
    const publicKey = createPublicKey({ key: publicKeyBytes, format: 'der', type: 'spki' });
    return verifyBytes(null, Buffer.from(material), publicKey, Buffer.from(attestation.signatureBase64, 'base64'));
  } catch {
    return false;
  }
}

export function parseScionTruthGateReviewResponse(body = '') {
  const match = String(body).match(/```scion-truth-gate-review\s*\n([\s\S]*?)\n```/);
  if (!match) throw new Error('Signed review is missing a scion-truth-gate-review block');
  const parsed = JSON.parse(match[1]);
  if (
    parsed?.protocol !== REVIEW_RESPONSE_PROTOCOL ||
    parsed?.schemaVersion !== 1 ||
    !Array.isArray(parsed.reviews) ||
    parsed.reviews.length === 0
  ) {
    throw new Error('Signed review has an invalid Truth Gate response schema');
  }
  const expectedKeys = [
    'factual',
    'modelOutcomesHidden',
    'pedagogical',
    'peerResponsesHidden',
    'reason',
    'seedSha256',
    'sourceSupport',
  ].sort();
  const reviews = parsed.reviews.map((review) => {
    if (Object.keys(review || {}).sort().join(',') !== expectedKeys.join(',')) {
      throw new Error('Signed review entry has an invalid schema');
    }
    if (
      !SHA256_RE.test(review.seedSha256 || '') ||
      ![review.factual, review.pedagogical, review.sourceSupport].every((value) => VERDICTS.has(value)) ||
      review.peerResponsesHidden !== true ||
      review.modelOutcomesHidden !== true ||
      clean(review.reason).length < 24 ||
      clean(review.reason).length > 500
    ) {
      throw new Error('Signed review entry has invalid verdict, blindness, or reason fields');
    }
    return { ...review, reason: clean(review.reason) };
  });
  if (unique(reviews.map((review) => review.seedSha256)).length !== reviews.length) {
    throw new Error('Signed review contains duplicate seed verdicts');
  }
  return { schemaVersion: 1, protocol: REVIEW_RESPONSE_PROTOCOL, reviews };
}

function expectedReviewAuthorityFields(message) {
  const publicKeyFingerprintSha256 = message.bridgeAttestation.publicKeyFingerprintSha256;
  const parsed = parseScionTruthGateReviewResponse(message.body);
  return {
    bridgePublicKeyFingerprintSha256: publicKeyFingerprintSha256,
    reviewerRef: scionLessonKernelSha256({
      authority: 'roundtable-bridge-ed25519-v1',
      publicKeyFingerprintSha256,
      role: message.role,
      model: message.model,
    }),
    reviewSessionRef: scionLessonKernelSha256({
      sessionId: message.bridgeAttestation.sessionId,
      messageId: message.id,
    }),
    reviewerSeat: message.role,
    reviewedAt: message.at,
    rawReviewSha256: scionLessonKernelSha256(message.body),
    reviewAuthorityRef: scionLessonKernelSha256({
      protocol: message.bridgeAttestation.protocol,
      sessionId: message.bridgeAttestation.sessionId,
      messageId: message.id,
      publicKeyFingerprintSha256,
      payloadSha256: message.bridgeAttestation.payloadSha256,
      signatureBase64: message.bridgeAttestation.signatureBase64,
    }),
    reviewedSeedSha256s: parsed.reviews.map((review) => review.seedSha256).sort(),
  };
}

function validateReviewAuthority(authority = {}) {
  if (
    authority.protocol !== 'scion-truth-gate-roundtable-review-authority-v1' ||
    !identityValid(authority) ||
    !verifyRoundtableTruthGateReviewMessage(authority.message) ||
    authority.message?.stage !== 'sealed' ||
    authority.message?.round !== 1 ||
    !['codex', 'claude', 'antigravity'].includes(authority.message?.role)
  ) {
    return ['invalid-review-authority'];
  }
  const issues = [];
  try {
    const expected = expectedReviewAuthorityFields(authority.message);
    for (const [key, value] of Object.entries(expected)) {
      if (scionLessonKernelSha256(authority[key]) !== scionLessonKernelSha256(value)) {
        issues.push(`review-authority-${key}-mismatch`);
      }
    }
  } catch {
    issues.push('invalid-signed-review-response');
  }
  return unique(issues);
}

export function buildScionTruthGateReviewAuthority({
  message,
  expectedSeedSha256s = [],
  trustedBridgePublicKeyFingerprints = [],
} = {}) {
  if (!verifyRoundtableTruthGateReviewMessage(message)) throw new Error('Truth Gate review authority requires a valid Roundtable bridge signature');
  if (message.stage !== 'sealed' || message.round !== 1 || !['codex', 'claude', 'antigravity'].includes(message.role)) {
    throw new Error('Truth Gate review authority requires a sealed independent participant opening');
  }
  if (!validIsoInstant(message.at)) throw new Error('Truth Gate review authority requires a valid message time');
  if (!trustedBridgePublicKeyFingerprints.includes(message.bridgeAttestation.publicKeyFingerprintSha256)) {
    throw new Error('Truth Gate review authority requires a pre-registered Roundtable bridge fingerprint');
  }
  const expected = expectedReviewAuthorityFields(message);
  if (
    scionLessonKernelSha256(expected.reviewedSeedSha256s) !==
    scionLessonKernelSha256([...expectedSeedSha256s].sort())
  ) {
    throw new Error('Truth Gate review authority must contain exactly one verdict for every frozen seed hash');
  }
  const authority = {
    protocol: 'scion-truth-gate-roundtable-review-authority-v1',
    ...expected,
    message,
  };
  authority.identity = identityFor(authority);
  const issues = validateReviewAuthority(authority);
  if (issues.length > 0) throw new Error(`Invalid Truth Gate review authority: ${issues.join(', ')}`);
  return authority;
}

function validateReviewReceiptSchema(receipt = {}) {
  const issues = [];
  if (Object.keys(receipt).sort().join(',') !== REVIEW_RECEIPT_KEYS.join(',')) issues.push('review-receipt-schema-mismatch');
  if (receipt.protocol !== SCION_TRUTH_GATE_REVIEW_PROTOCOL || receipt.schemaVersion !== 1 || !identityValid(receipt)) {
    issues.push('invalid-review-receipt');
  }
  if (![receipt.reviewerRef, receipt.reviewSessionRef, receipt.reviewAuthorityRef, receipt.rawReviewSha256].every((value) => SHA256_RE.test(value || ''))) {
    issues.push('invalid-review-references');
  }
  if (!/^[a-z0-9][a-z0-9-]{2,63}$/.test(receipt.reviewerSeat || '') || !validIsoInstant(receipt.reviewedAt)) {
    issues.push('invalid-reviewer-seat-or-time');
  }
  if (
    Object.keys(receipt.blindness || {}).sort().join(',') !== 'modelOutcomesHidden,peerResponsesHidden' ||
    receipt.blindness?.peerResponsesHidden !== true ||
    receipt.blindness?.modelOutcomesHidden !== true
  ) {
    issues.push('invalid-review-blindness');
  }
  if (
    Object.keys(receipt.verdicts || {}).sort().join(',') !== 'factual,pedagogical,sourceSupport' ||
    !Object.values(receipt.verdicts || {}).every((value) => VERDICTS.has(value))
  ) {
    issues.push('invalid-review-verdicts');
  }
  if (
    !Array.isArray(receipt.reasons) ||
    receipt.reasons.length < 1 ||
    receipt.reasons.length > 6 ||
    receipt.reasons.some((reason) => clean(reason).length < 24 || clean(reason).length > 500)
  ) {
    issues.push('invalid-review-reasons');
  }
  return unique(issues);
}

export function buildScionTruthGateReviewReceipt({
  seed,
  reviewAuthority,
} = {}) {
  if (!validateScionTruthGateSeed(seed).valid) throw new Error('A review receipt requires an identity-valid Truth Gate seed');
  if (
    validateReviewAuthority(reviewAuthority).length > 0 ||
    !reviewAuthority.reviewedSeedSha256s.includes(seed.identity.sha256)
  ) {
    throw new Error('A review receipt requires signed Roundtable authority bound to the seed');
  }
  if (Date.parse(reviewAuthority.reviewedAt) < Date.parse(seed.createdAt)) {
    throw new Error('A review receipt must be timestamped after its seed was frozen');
  }
  const response = parseScionTruthGateReviewResponse(reviewAuthority.message.body);
  const signedReview = response.reviews.find((review) => review.seedSha256 === seed.identity.sha256);
  if (!signedReview) throw new Error('Signed Roundtable authority has no verdict for this seed');
  const receipt = {
    schemaVersion: 1,
    protocol: SCION_TRUTH_GATE_REVIEW_PROTOCOL,
    reviewedAt: reviewAuthority.reviewedAt,
    reviewerRef: reviewAuthority.reviewerRef,
    reviewSessionRef: reviewAuthority.reviewSessionRef,
    reviewerSeat: reviewAuthority.reviewerSeat,
    reviewAuthorityRef: reviewAuthority.reviewAuthorityRef,
    seedSha256: seed.identity.sha256,
    sourcePacketSha256: seed.sourcePacketSha256,
    inputSha256: seed.inputSha256,
    blindness: {
      peerResponsesHidden: signedReview.peerResponsesHidden,
      modelOutcomesHidden: signedReview.modelOutcomesHidden,
    },
    verdicts: {
      factual: signedReview.factual,
      pedagogical: signedReview.pedagogical,
      sourceSupport: signedReview.sourceSupport,
    },
    reasons: [signedReview.reason],
    rawReviewSha256: reviewAuthority.rawReviewSha256,
    claimBoundary:
      'This receipt binds a verdict to a bridge-signed sealed participant message. The signature proves provenance, not factual correctness.',
  };
  receipt.identity = identityFor(receipt);
  const receiptIssues = validateReviewReceiptSchema(receipt);
  if (receiptIssues.length > 0) throw new Error(`Invalid Truth Gate review receipt: ${receiptIssues.join(', ')}`);
  return receipt;
}

const SOURCE_OVERLAP_STOP = new Set('a an and are as at be by for from has have in is it of on or that the their this to was were when while with'.split(' '));

function sourceSemanticTokens(value) {
  return new Set(
    (normalizeScionTruthGateSourceClaim(value).match(/[a-z0-9]+/g) || [])
      .filter((token) => token.length > 2 && !SOURCE_OVERLAP_STOP.has(token))
      .map((token) => token.replace(/(?:ies|es|s)$/, (suffix) => (suffix === 'ies' ? 'y' : ''))),
  );
}

export function scionTruthGateSourceClaimSimilarity(left, right) {
  const leftTokens = sourceSemanticTokens(left);
  const rightTokens = sourceSemanticTokens(right);
  if (leftTokens.size < 5 || rightTokens.size < 5) return 0;
  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  return intersection / Math.max(1, Math.min(leftTokens.size, rightTokens.size));
}

export function assessScionTruthGate({
  seeds = [],
  receipts = [],
  reviewAuthorities = [],
  trustedReviewAuthorityFingerprints = [],
  priorSourceContentHashes = [],
  priorSourceClaims = [],
  priorSourceIds = [],
  priorSourceUrls = [],
  priorSourceEvidenceHashes = [],
  priorSourcePacketSha256s = [],
  excludedProjectIds = [],
  excludedPromptIds = [],
  requiredDomains = ['computer-science', 'geology', 'music-theory'],
  requiredCasesPerDomain = 2,
  minimumIndependentReceipts = 2,
  assessedAt = new Date().toISOString(),
  mode = 'pilot',
} = {}) {
  if (!validIsoInstant(assessedAt)) throw new Error('Invalid Truth Gate assessment time');
  const issues = [];
  const seedIds = new Set();
  const seedHashes = new Set();
  const promptIds = new Set();
  const projectIds = new Set();
  const sourceHashes = new Set();
  const sourceIds = new Set();
  const sourceUrls = new Set();
  const sourceEvidenceHashes = new Set();
  const currentSourceClaims = [];
  const priorSources = new Set(priorSourceContentHashes);
  const priorIds = new Set(priorSourceIds.map(clean));
  const priorUrls = new Set(priorSourceUrls.map(canonicalScionTruthGateSourceUrl));
  const priorEvidence = new Set(priorSourceEvidenceHashes);
  const priorPackets = new Set(priorSourcePacketSha256s);
  const excludedProjects = new Set(excludedProjectIds);
  const excludedPrompts = new Set(excludedPromptIds);
  const seedAssessments = [];
  const receiptsBySeed = new Map();
  const authorityByRef = new Map();

  for (const authority of reviewAuthorities) {
    const validAuthority =
      validateReviewAuthority(authority).length === 0 &&
      trustedReviewAuthorityFingerprints.includes(authority.bridgePublicKeyFingerprintSha256);
    if (!validAuthority || authorityByRef.has(authority?.reviewAuthorityRef)) {
      issues.push('invalid-or-duplicate-review-authority');
      continue;
    }
    authorityByRef.set(authority.reviewAuthorityRef, authority);
  }

  for (const receipt of receipts) {
    const receiptIssues = validateReviewReceiptSchema(receipt);
    const authority = authorityByRef.get(receipt?.reviewAuthorityRef);
    if (
      !authority ||
      receipt?.reviewerRef !== authority.reviewerRef ||
      receipt?.reviewSessionRef !== authority.reviewSessionRef ||
      receipt?.reviewerSeat !== authority.reviewerSeat ||
      receipt?.reviewedAt !== authority.reviewedAt ||
      receipt?.rawReviewSha256 !== authority.rawReviewSha256 ||
      !String(authority.message?.body || '').includes(receipt?.seedSha256 || '')
    ) {
      receiptIssues.push('review-authority-binding-mismatch');
    }
    if (!seedHashes.has(receipt?.seedSha256) && !seeds.some((seed) => seed.identity?.sha256 === receipt?.seedSha256)) {
      receiptIssues.push('review-references-unknown-seed');
    }
    if (receiptIssues.length > 0) issues.push(...receiptIssues);
    const bucket = receiptsBySeed.get(receipt?.seedSha256) || [];
    bucket.push(receipt);
    receiptsBySeed.set(receipt?.seedSha256, bucket);
  }

  for (const seed of seeds) {
    const seedIssues = [...validateScionTruthGateSeed(seed).issues];
    if (seedIds.has(seed.caseId)) seedIssues.push('duplicate-case-id');
    if (seedHashes.has(seed.identity?.sha256)) seedIssues.push('duplicate-seed');
    if (promptIds.has(seed.promptId)) seedIssues.push('duplicate-prompt-id');
    if (projectIds.has(seed.projectId)) seedIssues.push('duplicate-project-id');
    seedIds.add(seed.caseId);
    seedHashes.add(seed.identity?.sha256);
    promptIds.add(seed.promptId);
    projectIds.add(seed.projectId);
    if (excludedProjects.has(seed.projectId)) seedIssues.push('excluded-project-overlap');
    if (excludedPrompts.has(seed.promptId)) seedIssues.push('excluded-prompt-overlap');
    if (priorIds.has(seed.sourcePacket?.sourceId)) seedIssues.push('prior-source-id-overlap');
    if (priorUrls.has(canonicalScionTruthGateSourceUrl(seed.sourcePacket?.url))) seedIssues.push('prior-source-url-overlap');
    if (priorPackets.has(seed.sourcePacketSha256)) seedIssues.push('prior-source-packet-overlap');
    if (sourceIds.has(seed.sourcePacket?.sourceId)) seedIssues.push('duplicate-source-id');
    const canonicalSourceUrl = canonicalScionTruthGateSourceUrl(seed.sourcePacket?.url);
    if (sourceUrls.has(canonicalSourceUrl)) seedIssues.push('duplicate-source-url');
    const capturedEvidenceHashes = (seed.sourcePacket?.sourceEvidence?.captures || [])
      .map((capture) => capture.capturedTextSha256);
    if (capturedEvidenceHashes.some((sha256) => priorEvidence.has(sha256))) {
      seedIssues.push('prior-source-evidence-overlap');
    }
    if (capturedEvidenceHashes.some((sha256) => sourceEvidenceHashes.has(sha256))) {
      seedIssues.push('duplicate-source-evidence');
    }
    sourceIds.add(seed.sourcePacket?.sourceId);
    sourceUrls.add(canonicalSourceUrl);
    capturedEvidenceHashes.forEach((sha256) => sourceEvidenceHashes.add(sha256));
    for (const claim of seed.sourcePacket?.claims || []) {
      if (priorSourceClaims.some((priorClaim) => scionTruthGateSourceClaimSimilarity(claim, priorClaim) >= 0.72)) {
        seedIssues.push('prior-source-semantic-overlap');
      }
      if (currentSourceClaims.some((priorClaim) => scionTruthGateSourceClaimSimilarity(claim, priorClaim) >= 0.72)) {
        seedIssues.push('pilot-source-semantic-overlap');
      }
      currentSourceClaims.push(claim);
    }
    for (const claimSha256 of seed.sourceClaimSha256s || []) {
      if (priorSources.has(claimSha256)) seedIssues.push('prior-source-content-overlap');
      if (sourceHashes.has(claimSha256)) seedIssues.push('pilot-source-content-overlap');
      sourceHashes.add(claimSha256);
    }
    const seedReceipts = receiptsBySeed.get(seed.identity?.sha256) || [];
    const validReceipts = [];
    for (const receipt of seedReceipts) {
      const authority = authorityByRef.get(receipt?.reviewAuthorityRef);
      let expectedReceiptSha256 = null;
      try {
        expectedReceiptSha256 = buildScionTruthGateReviewReceipt({ seed, reviewAuthority: authority }).identity.sha256;
      } catch {
        // Invalid authorities and signed review bodies fail closed below.
      }
      const bound =
        validateReviewReceiptSchema(receipt).length === 0 &&
        authority &&
        receipt.identity?.sha256 === expectedReceiptSha256 &&
        receipt.seedSha256 === seed.identity.sha256 &&
        receipt.sourcePacketSha256 === seed.sourcePacketSha256 &&
        receipt.inputSha256 === seed.inputSha256 &&
        receipt.blindness?.peerResponsesHidden === true &&
        receipt.blindness?.modelOutcomesHidden === true &&
        validIsoInstant(receipt.reviewedAt) &&
        Date.parse(receipt.reviewedAt) >= Date.parse(seed.createdAt) &&
        SHA256_RE.test(receipt.reviewerRef || '') &&
        SHA256_RE.test(receipt.reviewSessionRef || '') &&
        SHA256_RE.test(receipt.rawReviewSha256 || '') &&
        receipt.rawReviewSha256 === authority.rawReviewSha256 &&
        receipt.reviewerRef === authority.reviewerRef &&
        receipt.reviewSessionRef === authority.reviewSessionRef &&
        receipt.reviewerSeat === authority.reviewerSeat &&
        String(authority.message?.body || '').includes(seed.identity.sha256);
      if (!bound) {
        seedIssues.push('unbound-or-invalid-review-receipt');
        continue;
      }
      validReceipts.push(receipt);
      if (Object.values(receipt.verdicts || {}).some((verdict) => verdict !== 'accept')) {
        seedIssues.push('negative-review-verdict');
      }
    }
    const reviewerRefs = unique(validReceipts.map((receipt) => receipt.reviewerRef));
    const reviewSessionRefs = unique(validReceipts.map((receipt) => receipt.reviewSessionRef));
    const reviewAuthorityRefs = unique(validReceipts.map((receipt) => receipt.reviewAuthorityRef));
    const rawReviewSha256s = unique(validReceipts.map((receipt) => receipt.rawReviewSha256));
    if (validReceipts.length < minimumIndependentReceipts) seedIssues.push('insufficient-review-receipts');
    if (validReceipts.length >= minimumIndependentReceipts && reviewerRefs.length < minimumIndependentReceipts) {
      seedIssues.push('duplicate-reviewer');
    }
    if (validReceipts.length >= minimumIndependentReceipts && reviewSessionRefs.length < minimumIndependentReceipts) {
      seedIssues.push('duplicate-review-session');
    }
    if (validReceipts.length >= minimumIndependentReceipts && reviewAuthorityRefs.length < minimumIndependentReceipts) {
      seedIssues.push('duplicate-review-authority');
    }
    if (validReceipts.length >= minimumIndependentReceipts && rawReviewSha256s.length < minimumIndependentReceipts) {
      seedIssues.push('duplicate-raw-review-evidence');
    }
    seedAssessments.push({
      caseIdSha256: scionLessonKernelSha256(seed.caseId),
      seedSha256: seed.identity?.sha256,
      domain: seed.domain,
      status: unique(seedIssues).length === 0 ? 'admitted' : 'quarantined',
      issues: unique(seedIssues),
      validReceiptCount: validReceipts.length,
      distinctReviewerCount: reviewerRefs.length,
      reviewerSetSha256: scionLessonKernelSha256(reviewerRefs.sort()),
    });
    issues.push(...seedIssues.map((issue) => `${seed.caseId}:${issue}`));
  }

  const availableByDomain = Object.fromEntries(
    requiredDomains.map((domain) => [domain, seedAssessments.filter((entry) => entry.domain === domain && entry.status === 'admitted').length]),
  );
  const deficits = Object.fromEntries(
    requiredDomains.map((domain) => [domain, Math.max(0, requiredCasesPerDomain - availableByDomain[domain])]),
  );
  if (seeds.some((seed) => !requiredDomains.includes(seed.domain))) issues.push('unexpected-domain');
  if (Object.values(deficits).some((count) => count > 0)) issues.push('domain-quota-not-met');
  if (seeds.length !== requiredDomains.length * requiredCasesPerDomain) issues.push('unexpected-seed-count');
  const gateEligible = unique(issues).length === 0;
  const assessment = {
    schemaVersion: 1,
    protocol: SCION_TRUTH_GATE_ASSESSMENT_PROTOCOL,
    mode,
    assessedAt,
    status: gateEligible ? 'truth-gate-pilot-passed' : 'blocked-truth-gate',
    gateEligible,
    holdoutPreregistrationEligible: gateEligible && mode === 'full-holdout',
    productionEligible: false,
    trainingEligible: false,
    requirements: {
      requiredDomains,
      requiredCasesPerDomain,
      minimumIndependentReceipts,
      requireUnanimousPositiveVerdicts: true,
      requirePeerAndOutcomeBlindness: true,
      requireBridgeSignedReviewAuthority: true,
      requirePreregisteredBridgePublicKeyFingerprint: true,
      requireDistinctSignedMessagesAndRawEvidence: true,
      requireBoundedSourceEvidenceCapture: true,
      requireProjectPromptExactAndSemanticSourceDisjointness: true,
    },
    availableByDomain,
    deficits,
    seedAssessments,
    issues: unique(issues),
    claimBoundary:
      'Passing proves only that the review gate behaved correctly for this frozen corpus. It is not Scion learning, model-quality, production, or training evidence.',
  };
  assessment.identity = identityFor(assessment);
  return assessment;
}

export function decideScionTruthGatePreflight({ discoveryDeficits = {}, receiptAssessment } = {}) {
  const discoverySufficient = Object.values(discoveryDeficits).every((count) => count === 0);
  const receiptGateValid =
    receiptAssessment?.protocol === SCION_TRUTH_GATE_ASSESSMENT_PROTOCOL &&
    identityValid(receiptAssessment) &&
    receiptAssessment.mode === 'full-holdout' &&
    receiptAssessment.gateEligible === true &&
    receiptAssessment.holdoutPreregistrationEligible === true &&
    receiptAssessment.productionEligible === false &&
    receiptAssessment.trainingEligible === false;
  const ready = discoverySufficient && receiptGateValid;
  return {
    status: ready ? 'ready-to-preregister' : 'blocked-truth-gate',
    ready,
    discoverySufficient,
    receiptGateValid,
    issues: [
      ...(!discoverySufficient ? ['source-discovery-quota-not-met'] : []),
      ...(!receiptGateValid ? ['independent-semantic-review-not-executably-admitted'] : []),
    ],
  };
}
