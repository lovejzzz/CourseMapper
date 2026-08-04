#!/usr/bin/env node
import fs from 'node:fs/promises';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';

import { scionLessonKernelSha256 } from './lib/scionLessonKernelCampaign.mjs';
import { buildScionTruthGateReviewAuthority, buildScionTruthGateReviewReceipt } from './lib/scionTruthGate.mjs';

const PACKET = 'evaluation/scion-adapters/evidence/scion-truth-gate-pilot-packet-v0.17.13.json';
const OUTPUT = 'evaluation/scion-adapters/evidence/scion-truth-gate-pilot-review-bundle-v0.17.13.json';
const execFile = promisify(execFileCallback);

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : null;
}

function identityFor(value) {
  const copy = structuredClone(value);
  delete copy.identity;
  return { algorithm: 'sha256-canonical-json', sha256: scionLessonKernelSha256(copy) };
}

async function main() {
  const bridgeUrl = argument('bridge') || process.env.ROUNDTABLE_BRIDGE_URL;
  const token = process.env.ROUNDTABLE_BRIDGE_TOKEN;
  const sessionId = argument('session');
  if (!bridgeUrl || !token || !sessionId) {
    throw new Error('Provide --bridge, --session, and ROUNDTABLE_BRIDGE_TOKEN');
  }
  const packet = JSON.parse(await fs.readFile(PACKET, 'utf8'));
  try {
    await execFile('git', ['diff', '--quiet', 'HEAD', '--', PACKET]);
  } catch {
    throw new Error('Pilot packet must be committed and unchanged before independent review import');
  }
  const { stdout: commitStdout } = await execFile('git', ['log', '-1', '--format=%H', '--', PACKET]);
  const pilotPacketGitCommit = commitStdout.trim();
  if (!/^[a-f0-9]{40}$/.test(pilotPacketGitCommit)) {
    throw new Error('Pilot packet has no immutable git preregistration commit');
  }
  const { stdout: committedPacketText } = await execFile('git', ['show', `${pilotPacketGitCommit}:${PACKET}`], {
    maxBuffer: 2_000_000,
  });
  if (scionLessonKernelSha256(JSON.parse(committedPacketText)) !== scionLessonKernelSha256(packet)) {
    throw new Error('Working pilot packet does not match its preregistration commit');
  }
  const expectedSeedSha256s = packet.seeds.map((seed) => seed.identity.sha256);
  const trustedBridgePublicKeyFingerprints = packet.trustedReviewAuthorityFingerprints || [];
  if (trustedBridgePublicKeyFingerprints.length !== 1) {
    throw new Error('Pilot packet must pre-register exactly one Roundtable bridge fingerprint before review');
  }
  const response = await fetch(`${bridgeUrl.replace(/\/$/, '')}/sessions/${sessionId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error(`Roundtable snapshot request failed with HTTP ${response.status}`);
  const snapshot = await response.json();
  if (snapshot.id !== sessionId || snapshot.phase !== 'complete') {
    throw new Error('Roundtable review session is not complete or has the wrong identity');
  }
  const candidates = (snapshot.messages || []).filter(
    (message) =>
      message.stage === 'sealed' && message.round === 1 && ['codex', 'claude', 'antigravity'].includes(message.role),
  );
  const reviewAuthorities = [];
  const rejectedMessages = [];
  for (const message of candidates) {
    try {
      reviewAuthorities.push(
        buildScionTruthGateReviewAuthority({
          message,
          expectedSeedSha256s,
          trustedBridgePublicKeyFingerprints,
        }),
      );
    } catch (error) {
      rejectedMessages.push({ role: message.role, reason: error.message });
    }
  }
  const distinctReviewers = new Set(reviewAuthorities.map((authority) => authority.reviewerRef));
  const distinctSessions = new Set(reviewAuthorities.map((authority) => authority.reviewSessionRef));
  const distinctRawReviews = new Set(reviewAuthorities.map((authority) => authority.rawReviewSha256));
  if (
    reviewAuthorities.length < 2 ||
    distinctReviewers.size < 2 ||
    distinctSessions.size < 2 ||
    distinctRawReviews.size < 2
  ) {
    throw new Error(
      `Need two distinct signed sealed reviews; accepted ${reviewAuthorities.length}, rejected ${JSON.stringify(rejectedMessages)}`,
    );
  }
  const receipts = packet.seeds.flatMap((seed) =>
    reviewAuthorities.map((reviewAuthority) => buildScionTruthGateReviewReceipt({ seed, reviewAuthority })),
  );
  const bundle = {
    schemaVersion: 1,
    protocol: 'scion-truth-gate-pilot-review-bundle-v1',
    pilotPacketSha256: packet.identity.sha256,
    pilotPacketGitCommit,
    roundtableSessionId: sessionId,
    importedAt: new Date().toISOString(),
    reviewAuthorities,
    receipts,
    rejectedMessages,
    productionEligible: false,
    trainingEligible: false,
    claimBoundary:
      'These receipts are derived from bridge-signed sealed review messages. Signatures prove message provenance, not reviewer correctness or Scion quality.',
  };
  bundle.identity = identityFor(bundle);
  await fs.writeFile(OUTPUT, `${JSON.stringify(bundle, null, 2)}\n`);
  console.log(
    JSON.stringify(
      {
        sessionId,
        authorityCount: reviewAuthorities.length,
        receiptCount: receipts.length,
        rejectedMessages,
        output: OUTPUT,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
