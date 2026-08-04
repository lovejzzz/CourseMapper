import { createHash, generateKeyPairSync, sign as signBytes } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { scionLessonKernelSha256 } from '../lib/scionLessonKernelCampaign.mjs';
import {
  assessScionTruthGate,
  buildScionTruthGateReviewAuthority,
  buildScionTruthGateReviewReceipt,
  buildScionTruthGateSeed,
  decideScionTruthGatePreflight,
  scionTruthGateSourceClaimSha256,
} from '../lib/scionTruthGate.mjs';

const CREATED_AT = '2026-08-04T18:00:00.000Z';
const REVIEWED_AT = '2026-08-04T18:30:00.000Z';
const ASSESSED_AT = '2026-08-04T19:00:00.000Z';
const DOMAINS = ['computer-science', 'geology', 'music-theory'];
const FACTS = {
  'computer-science-1':
    'A stable sorting algorithm preserves the original relative order of records whose comparison keys are equal.',
  'computer-science-2':
    'A cache hit returns a previously stored result for the same lookup key without recomputing the original operation.',
  'geology-1':
    'Cross-cutting relationships show that a geologic feature cutting another rock body formed after the body it cuts.',
  'geology-2':
    'Rounded sediment grains have experienced abrasion during transport that removed sharp corners from the particles.',
  'music-theory-1':
    'A perfect authentic cadence places dominant before tonic with both chords in root position and soprano ending on tonic.',
  'music-theory-2':
    'Melodic sequence repeats a musical pattern at successively higher or lower pitch levels while preserving its recognizable shape.',
};
const TERM_NAMES = {
  'computer-science-1': 'Stable sorting algorithm',
  'computer-science-2': 'Cache hit',
  'geology-1': 'Cross-cutting relationship',
  'geology-2': 'Rounded sediment grains',
  'music-theory-1': 'Perfect authentic cadence',
  'music-theory-2': 'Melodic sequence',
};

function sha256Hex(value) {
  return createHash('sha256').update(value).digest('hex');
}

function identityFor(value) {
  const copy = structuredClone(value);
  delete copy.identity;
  return { algorithm: 'sha256-canonical-json', sha256: scionLessonKernelSha256(copy) };
}

function seedFor(domain, index) {
  const label = `${domain}-${index}`;
  const claim = FACTS[label];
  const termName = TERM_NAMES[label];
  return buildScionTruthGateSeed({
    caseId: `truth-gate/${label}:key-term-0`,
    projectId: `truth-gate-${label}`,
    promptId: `truth-gate/${label}`,
    domain,
    createdAt: CREATED_AT,
    sourcePacket: {
      sourceId: `source-${label}`,
      url: `https://example.edu/${label}`,
      title: `Source ${label}`,
      publisher: 'Example University',
      retrievedAt: CREATED_AT,
      claims: [claim],
      sourceEvidence: {
        locator: `Example section ${index}`,
        capturedText: claim.split(/\s+/).slice(0, 18).join(' '),
      },
    },
    term: {
      tr: termName,
      df: `${termName} means that ${claim.charAt(0).toLowerCase()}${claim.slice(1)}`,
      eg: `A learner applies ${termName} only after observing the source condition described in the evidence.`,
      mi: `${termName} always applies when the source condition is absent or reversed.`,
      cx: `The source condition must be present as described, rather than absent or reversed as the misconception claims.`,
      sourceFactIndexes: [0],
    },
  });
}

function signedAuthority(seeds, reviewerIndex, reviewOverrides = {}) {
  const role = reviewerIndex === 1 ? 'codex' : 'antigravity';
  const response = {
    schemaVersion: 1,
    protocol: 'scion-truth-gate-review-response-v1',
    reviews: seeds.map((seed) => ({
      seedSha256: seed.identity.sha256,
      factual: 'accept',
      pedagogical: 'accept',
      sourceSupport: 'accept',
      peerResponsesHidden: true,
      modelOutcomesHidden: true,
      reason: `The source-bound atom for ${seed.domain} states one supported fact and corrects its explicit misconception.`,
      ...(reviewOverrides[seed.identity.sha256] || {}),
    })),
  };
  const body = `Independent review by ${role}.\n\n\`\`\`scion-truth-gate-review\n${JSON.stringify(response)}\n\`\`\``;
  const sessionId = `roundtable-test-session-${reviewerIndex}`;
  const message = {
    id: `message-${reviewerIndex}`,
    author: role === 'codex' ? 'Codex' : 'Antigravity',
    role,
    body,
    at: REVIEWED_AT,
    round: 1,
    model: `test-model-${reviewerIndex}`,
    effort: 'high',
    stage: 'sealed',
  };
  const payload = {
    protocol: 'roundtable-message-attestation-v1',
    sessionId,
    messageId: message.id,
    author: message.author,
    role: message.role,
    body: message.body,
    at: message.at,
    round: message.round,
    model: message.model,
    effort: message.effort,
    stage: message.stage,
  };
  const material = JSON.stringify(payload);
  const keys = generateKeyPairSync('ed25519');
  const publicKey = keys.publicKey.export({ format: 'der', type: 'spki' });
  message.bridgeAttestation = {
    protocol: 'roundtable-message-attestation-v1',
    algorithm: 'Ed25519',
    sessionId,
    publicKeySpkiBase64: publicKey.toString('base64'),
    publicKeyFingerprintSha256: sha256Hex(publicKey),
    payloadSha256: sha256Hex(material),
    signatureBase64: signBytes(null, Buffer.from(material), keys.privateKey).toString('base64'),
    claimBoundary: 'The bridge witnessed this participant output; it does not establish correctness.',
  };
  return buildScionTruthGateReviewAuthority({
    message,
    expectedSeedSha256s: seeds.map((seed) => seed.identity.sha256),
    trustedBridgePublicKeyFingerprints: [message.bridgeAttestation.publicKeyFingerprintSha256],
  });
}

function validPilot(authorityOverrides = {}) {
  const seeds = DOMAINS.flatMap((domain) => [seedFor(domain, 1), seedFor(domain, 2)]);
  const reviewAuthorities = [
    signedAuthority(seeds, 1, authorityOverrides[1]),
    signedAuthority(seeds, 2, authorityOverrides[2]),
  ];
  const receipts = seeds.flatMap((seed) =>
    reviewAuthorities.map((reviewAuthority) => buildScionTruthGateReviewReceipt({ seed, reviewAuthority })),
  );
  return {
    seeds,
    receipts,
    reviewAuthorities,
    trustedReviewAuthorityFingerprints: reviewAuthorities.map(
      (authority) => authority.bridgePublicKeyFingerprintSha256,
    ),
  };
}

function assess(overrides = {}) {
  return assessScionTruthGate({
    ...validPilot(),
    assessedAt: ASSESSED_AT,
    requiredDomains: DOMAINS,
    requiredCasesPerDomain: 2,
    ...overrides,
  });
}

describe('Scion Truth Gate', () => {
  it('admits a six-seed pilot only with two distinct signed positive reviews per seed', () => {
    const result = assess();
    expect(result).toMatchObject({
      status: 'truth-gate-pilot-passed',
      gateEligible: true,
      holdoutPreregistrationEligible: false,
      productionEligible: false,
      trainingEligible: false,
      availableByDomain: { 'computer-science': 2, geology: 2, 'music-theory': 2 },
    });
    expect(result.seedAssessments.every((entry) => entry.status === 'admitted')).toBe(true);
  });

  it('fails closed when one receipt is missing', () => {
    const pilot = validPilot();
    pilot.receipts.pop();
    const result = assessScionTruthGate({ ...pilot, assessedAt: ASSESSED_AT, requiredCasesPerDomain: 2 });
    expect(result.issues.some((issue) => issue.includes('insufficient-review-receipts'))).toBe(true);
  });

  it('fails closed when two receipts reuse one signed reviewer message', () => {
    const pilot = validPilot();
    const seed = pilot.seeds[0];
    const duplicate = pilot.receipts.find((receipt) => receipt.seedSha256 === seed.identity.sha256);
    pilot.receipts = pilot.receipts.filter((receipt) => receipt.seedSha256 !== seed.identity.sha256);
    pilot.receipts.push(duplicate, structuredClone(duplicate));
    const result = assessScionTruthGate({ ...pilot, assessedAt: ASSESSED_AT, requiredCasesPerDomain: 2 });
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.stringContaining('duplicate-reviewer'),
        expect.stringContaining('duplicate-review-session'),
        expect.stringContaining('duplicate-raw-review-evidence'),
      ]),
    );
  });

  it('derives a negative verdict from the signed review and fails closed', () => {
    const seeds = DOMAINS.flatMap((domain) => [seedFor(domain, 1), seedFor(domain, 2)]);
    const target = seeds[0];
    const first = signedAuthority(seeds, 1);
    const second = signedAuthority(seeds, 2, { [target.identity.sha256]: { factual: 'reject' } });
    const result = assessScionTruthGate({
      seeds,
      reviewAuthorities: [first, second],
      trustedReviewAuthorityFingerprints: [first, second].map(
        (authority) => authority.bridgePublicKeyFingerprintSha256,
      ),
      receipts: seeds.flatMap((seed) =>
        [first, second].map((authority) => buildScionTruthGateReviewReceipt({ seed, reviewAuthority: authority })),
      ),
      assessedAt: ASSESSED_AT,
      requiredCasesPerDomain: 2,
    });
    expect(result.issues.some((issue) => issue.includes('negative-review-verdict'))).toBe(true);
  });

  it('fails closed when a receipt is tampered after review', () => {
    const pilot = validPilot();
    pilot.receipts[0].sourcePacketSha256 = '0'.repeat(64);
    const result = assessScionTruthGate({ ...pilot, assessedAt: ASSESSED_AT, requiredCasesPerDomain: 2 });
    expect(result.issues).toContain('invalid-review-receipt');
    expect(result.issues.some((issue) => issue.includes('unbound-or-invalid-review-receipt'))).toBe(true);
  });

  it('rejects an identity-valid receipt with an empty verdict object', () => {
    const pilot = validPilot();
    pilot.receipts[0].verdicts = {};
    pilot.receipts[0].identity = identityFor(pilot.receipts[0]);
    const result = assessScionTruthGate({ ...pilot, assessedAt: ASSESSED_AT, requiredCasesPerDomain: 2 });
    expect(result.issues).toContain('invalid-review-verdicts');
  });

  it('rejects unsigned or body-tampered review authority', () => {
    const pilot = validPilot();
    const authority = structuredClone(pilot.reviewAuthorities[0]);
    authority.message.body += ' tampered';
    authority.identity = identityFor(authority);
    expect(() => buildScionTruthGateReviewReceipt({ seed: pilot.seeds[0], reviewAuthority: authority })).toThrow(
      /signed Roundtable authority/,
    );
  });

  it('rejects a valid self-signed review whose bridge key was not pre-registered', () => {
    const pilot = validPilot();
    const result = assessScionTruthGate({
      ...pilot,
      trustedReviewAuthorityFingerprints: [],
      assessedAt: ASSESSED_AT,
      requiredCasesPerDomain: 2,
    });
    expect(result.issues).toContain('invalid-or-duplicate-review-authority');
    expect(result.gateEligible).toBe(false);
  });

  it('fails closed on exact and semantic prior source overlap', () => {
    const pilot = validPilot();
    const claim = pilot.seeds[0].sourcePacket.claims[0];
    const rearranged = claim.replace(
      'A stable sorting algorithm preserves',
      'Equal-key records retain their relative order because a stable sorting algorithm preserves',
    );
    const exact = assessScionTruthGate({
      ...pilot,
      assessedAt: ASSESSED_AT,
      requiredCasesPerDomain: 2,
      priorSourceContentHashes: [scionTruthGateSourceClaimSha256(claim)],
    });
    const semantic = assessScionTruthGate({
      ...pilot,
      assessedAt: ASSESSED_AT,
      requiredCasesPerDomain: 2,
      priorSourceClaims: [rearranged],
    });
    expect(exact.issues.some((issue) => issue.includes('prior-source-content-overlap'))).toBe(true);
    expect(semantic.issues.some((issue) => issue.includes('prior-source-semantic-overlap'))).toBe(true);
  });

  it('fails closed when an excluded project or prompt reappears', () => {
    const pilot = validPilot();
    const result = assessScionTruthGate({
      ...pilot,
      assessedAt: ASSESSED_AT,
      requiredCasesPerDomain: 2,
      excludedProjectIds: [pilot.seeds[0].projectId],
      excludedPromptIds: [pilot.seeds[1].promptId],
    });
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.stringContaining('excluded-project-overlap'),
        expect.stringContaining('excluded-prompt-overlap'),
      ]),
    );
  });

  it('does not declare preregistration ready from discovery counts or a pilot alone', () => {
    const decision = decideScionTruthGatePreflight({
      discoveryDeficits: { 'computer-science': 0, geology: 0, 'music-theory': 0 },
      receiptAssessment: assess(),
    });
    expect(decision).toMatchObject({
      status: 'blocked-truth-gate',
      ready: false,
      discoverySufficient: true,
      receiptGateValid: false,
      issues: ['independent-semantic-review-not-executably-admitted'],
    });
  });
});
