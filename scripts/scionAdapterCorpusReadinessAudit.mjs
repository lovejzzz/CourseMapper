#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { buildScionAdapterDataset, SCION_ADAPTER_LEGACY_SOURCES } from './scionAdapterDataset.mjs';

export const SCION_ADAPTER_CORPUS_READINESS_RELEASE = 'v0.16.46';
export const SCION_ADAPTER_CORPUS_READINESS_EVIDENCE =
  'evaluation/scion-adapters/evidence/training-corpus-readiness-v0.16.46.json';
const SOURCE_AWARE_RELEASE = 'v0.16.45';
const SOURCE_AWARE_EVIDENCE = 'evaluation/scion-adapters/evidence/training-corpus-readiness-v0.16.45.json';
const FIRST_SENTENCE_RELEASE = 'v0.16.44';
const FIRST_SENTENCE_EVIDENCE = 'evaluation/scion-adapters/evidence/training-corpus-readiness-v0.16.44.json';
const SEMANTIC_RELEASE = 'v0.16.43';
const SEMANTIC_EVIDENCE = 'evaluation/scion-adapters/evidence/training-corpus-readiness-v0.16.43.json';
const PAIRED_RELEASE = 'v0.16.42';
const PAIRED_EVIDENCE = 'evaluation/scion-adapters/evidence/training-corpus-readiness-v0.16.42.json';
const LEGACY_RELEASE = 'v0.16.40';
const LEGACY_EVIDENCE = 'evaluation/scion-adapters/evidence/training-corpus-readiness-v0.16.40.json';
const LEGACY_SOURCES = [
  'trellis/tendril/distill/data-g4-orpo/train.jsonl',
  'trellis/tendril/distill/data-g4-orpo/app-flywheel.jsonl',
  'evaluation/scion-reviewed-preferences.jsonl',
  'evaluation/scion-codex-reviewed-preferences.jsonl',
];
const CURRENT_SOURCE_REPLAY_EVIDENCE = 'evaluation/scion-adapters/evidence/source-compiler-replay-v0.16.46.json';
const SOURCE_AWARE_REPLAY_EVIDENCE = 'evaluation/scion-adapters/evidence/source-compiler-replay-v0.16.45.json';
const FIRST_SENTENCE_SOURCE_REPLAY_EVIDENCE = 'evaluation/scion-adapters/evidence/source-compiler-replay-v0.16.44.json';
const SEMANTIC_SOURCE_REPLAY_EVIDENCE = 'evaluation/scion-adapters/evidence/source-compiler-replay-v0.16.43.json';
const HISTORICAL_SOURCE_REPLAY_EVIDENCE = 'evaluation/scion-adapters/evidence/source-compiler-replay-v0.16.40.json';
const SOURCE_REVIEW_PACKET = 'evaluation/scion-adapters/evidence/source-review-packet-v0.16.40.json';
const PAIRED_CAMPAIGN_EVIDENCE = 'evaluation/scion-adapters/evidence/judge-campaign-v0.16.42.json';
const APPROVED_CORPUS = 'evaluation/scion-adapters/evidence/codex-approved-preferences-v0.16.42.jsonl';
// Every profile in this historical auditor predates the implementation-bound
// v2 ruler. Pin v1 explicitly so a newer default benchmark cannot silently
// rewrite old corpus identities or make their receipts unreconstructable.
const LEGACY_HELDOUT_BENCHMARK = 'evaluation/scion-adapters/held-out-course-benchmark-v1.json';

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalize(value[key])]),
  );
}

function stableJson(value) {
  return JSON.stringify(canonicalize(value));
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function parseArgs(argv) {
  const args = { profile: SCION_ADAPTER_CORPUS_READINESS_RELEASE, evidence: '', write: false, generatedAt: '' };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--evidence') args.evidence = argv[++index];
    else if (argv[index] === '--profile') args.profile = argv[++index];
    else if (argv[index] === '--write') args.write = true;
    else if (argv[index] === '--generated-at') args.generatedAt = argv[++index];
    else throw new Error(`Unknown corpus-readiness option: ${argv[index]}`);
  }
  if (
    ![
      LEGACY_RELEASE,
      PAIRED_RELEASE,
      SEMANTIC_RELEASE,
      FIRST_SENTENCE_RELEASE,
      SOURCE_AWARE_RELEASE,
      SCION_ADAPTER_CORPUS_READINESS_RELEASE,
    ].includes(args.profile)
  ) {
    throw new Error(`Unsupported corpus-readiness profile: ${args.profile}`);
  }
  if (!args.evidence) {
    args.evidence =
      args.profile === LEGACY_RELEASE
        ? LEGACY_EVIDENCE
        : args.profile === PAIRED_RELEASE
          ? PAIRED_EVIDENCE
          : args.profile === SEMANTIC_RELEASE
            ? SEMANTIC_EVIDENCE
            : args.profile === FIRST_SENTENCE_RELEASE
              ? FIRST_SENTENCE_EVIDENCE
              : args.profile === SOURCE_AWARE_RELEASE
                ? SOURCE_AWARE_EVIDENCE
                : SCION_ADAPTER_CORPUS_READINESS_EVIDENCE;
  }
  return args;
}

function snapshot(manifest, generatedAt, release, judgeCampaign) {
  const pairedOrderCampaignComplete =
    judgeCampaign.status === 'paired-orders-evidence-shortfall' ||
    judgeCampaign.status === 'paired-orders-research-ready';
  const value = {
    schemaVersion: 1,
    protocol: 'scion-adapter-corpus-readiness-v1',
    release,
    generatedAt,
    sources: manifest.sourceReceipts,
    dataset: {
      schemaVersion: manifest.schemaVersion,
      identity: manifest.identity,
      status: manifest.status,
      promotable: manifest.promotable,
      counts: manifest.counts,
      domains: manifest.domains,
      evidenceCounts: manifest.evidenceCounts,
      domainGroupCounts: manifest.domainGroupCounts,
      modelJudgeDomainCounts: manifest.modelJudgeDomainCounts,
      holdoutBoundary: manifest.holdoutBoundary,
      gateProfiles: manifest.gate.profiles,
    },
    judgeCampaign,
    conclusion: {
      strongestAllowedLane: manifest.status,
      usablePairs: manifest.counts.total,
      requiredResearchPairs: manifest.gate.profiles.research.minimumPairs,
      admissibleModelJudgePairs: manifest.counts.singleModelJudgePairs,
      requiredResearchModelJudgePairs: manifest.gate.profiles.research.minimumModelJudgePairs,
      judgePacketReady: judgeCampaign.status === 'ready-for-fresh-dual-order-judgment' || pairedOrderCampaignComplete,
      ...(pairedOrderCampaignComplete ? { pairedOrderCampaignComplete: true } : {}),
      researchBlockers: manifest.gate.profiles.research.issues,
      nextEvidenceStep: pairedOrderCampaignComplete
        ? judgeCampaign.nextEvidenceStep
        : 'Complete one fresh-session A/B Codex pass and one distinct fresh-session B/A pass over the exact 100-case source-only packet, then ingest only stable above-floor same-identity preferences before research training.',
    },
    claimBoundary: {
      adapterTrained: false,
      adapterVersusBaseWin: false,
      paidReferenceParity: false,
      humanEvidence: false,
      productionPromotion: false,
    },
  };
  value.identity = {
    algorithm: 'sha256-canonical-corpus-readiness-v1',
    sha256: sha256(stableJson(value)),
  };
  return value;
}

function baseCampaignEvidence(replayRaw, packetRaw, replayPath, release) {
  const replay = JSON.parse(replayRaw);
  const packet = JSON.parse(packetRaw);
  const replayReady =
    replay.summary?.responseMutationCount === 0 &&
    (release === SCION_ADAPTER_CORPUS_READINESS_RELEASE
      ? replay.summary?.priorReleaseDelta?.previousRelease === SOURCE_AWARE_RELEASE &&
        replay.summary?.priorReleaseDelta?.newlyRejectedForRetry === 1 &&
        replay.summary?.repairEvolution?.sourceAnswerAlignment === 10
      : release === SOURCE_AWARE_RELEASE
        ? replay.summary?.priorReleaseDelta?.previousRelease === FIRST_SENTENCE_RELEASE &&
          replay.summary?.priorReleaseDelta?.newlyRejectedForRetry === 10
        : replay.summary?.recoveredAtoms >= 8);
  const packetReady =
    packet.status === 'ready-for-model-judge-research' &&
    packet.requireSourceContext === true &&
    packet.selectedCases === 100 &&
    packet.selectedSourceContextCases === packet.selectedCases &&
    packet.requiredModelJudgePasses === 200 &&
    packet.courseGroupCount >= 12 &&
    packet.domains?.length === 4 &&
    Object.values(packet.domainCounts || {}).every((count) => count >= 25) &&
    replayReady;
  if (!packetReady) throw new Error('Source-only Codex judge campaign is not ready');
  return {
    compilerReplay: {
      path: replayPath,
      sha256: sha256(replayRaw),
      identity: replay.identity,
      responseMutationCount: replay.summary.responseMutationCount,
      recoveredAtoms: replay.summary.recoveredAtoms,
      burdenAtomReduction: replay.summary.burdenAtomReduction,
      ...(replay.summary.priorReleaseDelta ? { priorReleaseDelta: replay.summary.priorReleaseDelta } : {}),
      ...(release === SCION_ADAPTER_CORPUS_READINESS_RELEASE && replay.summary.repairCounts
        ? { repairCounts: replay.summary.repairCounts }
        : {}),
      ...(release === SCION_ADAPTER_CORPUS_READINESS_RELEASE && replay.summary.repairEvolution
        ? { repairEvolution: replay.summary.repairEvolution }
        : {}),
    },
    sourcePacket: {
      path: SOURCE_REVIEW_PACKET,
      sha256: sha256(packetRaw),
      packetId: packet.packetId,
      packetDigest: packet.packetDigest,
      selectedCases: packet.selectedCases,
      selectedSourceContextCases: packet.selectedSourceContextCases,
      availableSourceContextCandidates: packet.availableSourceContextCandidates,
      domainCounts: packet.domainCounts,
      courseGroupCount: packet.courseGroupCount,
      requiredModelJudgePasses: packet.requiredModelJudgePasses,
    },
  };
}

function legacyJudgeCampaign(baseEvidence) {
  return {
    protocol: 'scion-source-only-codex-campaign-readiness-v1',
    status: 'ready-for-fresh-dual-order-judgment',
    ...baseEvidence,
    completedOrders: 0,
    requiredOrders: ['A/B', 'B/A'],
    contextResetSessionsRequired: 2,
    claimBoundary:
      'The packet is ready, but it contains no judgment. It proves no preferred atom, research-ready corpus, trained adapter, adapter-versus-base win, or paid-reference parity.',
  };
}

function pairedJudgeCampaign(manifest, baseEvidence, campaignRaw) {
  const campaign = JSON.parse(campaignRaw);
  const corpusReceipt = manifest.sourceReceipts.find((source) => source.path === APPROVED_CORPUS);
  const classified =
    (campaign.analysis?.stableWinners || 0) +
    (campaign.analysis?.stableTies || 0) +
    (campaign.analysis?.winnerTieDisagreements || 0) +
    (campaign.analysis?.oppositeWinnerDisagreements || 0) +
    (campaign.analysis?.insufficientOrInvalid || 0);
  const valid =
    campaign.protocol === 'scion-codex-paired-order-campaign-v1' &&
    campaign.release === PAIRED_RELEASE &&
    campaign.benchmarkProtocol === 'honest-quality-benchmark-v1' &&
    campaign.evidenceClass === 'single-model-judge-same-identity-paired-order' &&
    campaign.humanEvidence === false &&
    campaign.independentEvidence === false &&
    JSON.stringify(campaign.completedOrders) === JSON.stringify(['A/B', 'B/A']) &&
    campaign.completedPerCasePasses === 200 &&
    campaign.remainingPerCasePasses === 0 &&
    campaign.packet?.packetId === baseEvidence.sourcePacket.packetId &&
    campaign.packet?.packetDigest === baseEvidence.sourcePacket.packetDigest &&
    campaign.packet?.sourceBackedCases === baseEvidence.sourcePacket.selectedCases &&
    campaign.qualifyingTrainingRows === manifest.counts.singleModelJudgePairs &&
    campaign.approvedTrainingPairs === manifest.counts.singleModelJudgePairs &&
    JSON.stringify(campaign.analysis?.byDomain || {}) !== '{}' &&
    JSON.stringify(campaign.approvedCorpus?.path) === JSON.stringify(APPROVED_CORPUS) &&
    campaign.approvedCorpus?.rows === manifest.counts.singleModelJudgePairs &&
    campaign.approvedCorpus?.bytes === corpusReceipt?.bytes &&
    campaign.approvedCorpus?.sha256 === corpusReceipt?.sha256 &&
    JSON.stringify(campaign.analysis?.stableWinnerByModel) === JSON.stringify({ 'GPT-5.4-mini': 46 }) &&
    classified === campaign.packet?.sourceBackedCases &&
    campaign.researchTrainingReady === false &&
    campaign.minimumResearchPreferences === 100 &&
    campaign.qualifyingTrainingRows === 46;
  if (!valid) throw new Error('Paired-order campaign does not match the current adapter corpus');
  return {
    protocol: 'scion-paired-order-corpus-readiness-v1',
    status: campaign.status,
    path: PAIRED_CAMPAIGN_EVIDENCE,
    sha256: sha256(campaignRaw),
    ...baseEvidence,
    evidenceClass: campaign.evidenceClass,
    completedOrders: campaign.completedOrders,
    completedPerCasePasses: campaign.completedPerCasePasses,
    stablePreferences: campaign.stablePreferences,
    stableTies: campaign.analysis.stableTies,
    orderSensitiveCases: campaign.analysis.winnerTieDisagreements + campaign.analysis.oppositeWinnerDisagreements,
    approvedTrainingPairs: campaign.approvedTrainingPairs,
    qualifyingTrainingRows: campaign.qualifyingTrainingRows,
    minimumResearchPreferences: campaign.minimumResearchPreferences,
    researchTrainingReady: campaign.researchTrainingReady,
    modelJudgeDomainCounts: manifest.modelJudgeDomainCounts,
    approvedCorpus: campaign.approvedCorpus,
    judge: campaign.judge,
    nextEvidenceStep: campaign.nextGate,
    claimBoundary: campaign.claimBoundary,
  };
}

export async function buildScionAdapterCorpusReadinessSnapshot({ generatedAt, profile }) {
  const release = profile || SCION_ADAPTER_CORPUS_READINESS_RELEASE;
  const sources = release === LEGACY_RELEASE ? LEGACY_SOURCES : SCION_ADAPTER_LEGACY_SOURCES;
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'scion-corpus-readiness-'));
  try {
    const { manifest } = await buildScionAdapterDataset({
      sources,
      outputDir: temporary,
      heldoutBenchmarkPath: LEGACY_HELDOUT_BENCHMARK,
      allowResearch: true,
      allowSmoke: true,
      generatedAt,
      semanticAdmission:
        [SEMANTIC_RELEASE, FIRST_SENTENCE_RELEASE, SCION_ADAPTER_CORPUS_READINESS_RELEASE].includes(release) ||
        release === SOURCE_AWARE_RELEASE,
      allowFirstSentenceLexicalCue: [
        FIRST_SENTENCE_RELEASE,
        SOURCE_AWARE_RELEASE,
        SCION_ADAPTER_CORPUS_READINESS_RELEASE,
      ].includes(release),
      sourceBoundPrompt: false,
      requireSourceBoundModelJudge: false,
      legacyTrainingContract: true,
      // Reproduce the release's original v1.0.2 ruler without reopening that
      // semantic margin in current corpus or browser admission.
      legacyCorrectionRepeatMargin: true,
    });
    const replayPath =
      release === SCION_ADAPTER_CORPUS_READINESS_RELEASE
        ? CURRENT_SOURCE_REPLAY_EVIDENCE
        : release === SOURCE_AWARE_RELEASE
          ? SOURCE_AWARE_REPLAY_EVIDENCE
          : release === FIRST_SENTENCE_RELEASE
            ? FIRST_SENTENCE_SOURCE_REPLAY_EVIDENCE
            : release === SEMANTIC_RELEASE
              ? SEMANTIC_SOURCE_REPLAY_EVIDENCE
              : HISTORICAL_SOURCE_REPLAY_EVIDENCE;
    const [replayRaw, packetRaw, campaignRaw] = await Promise.all([
      fs.readFile(replayPath, 'utf8'),
      fs.readFile(SOURCE_REVIEW_PACKET, 'utf8'),
      release === LEGACY_RELEASE ? Promise.resolve('') : fs.readFile(PAIRED_CAMPAIGN_EVIDENCE, 'utf8'),
    ]);
    const baseEvidence = baseCampaignEvidence(replayRaw, packetRaw, replayPath, release);
    const judgeCampaign =
      release === LEGACY_RELEASE
        ? legacyJudgeCampaign(baseEvidence)
        : pairedJudgeCampaign(manifest, baseEvidence, campaignRaw);
    return snapshot(manifest, generatedAt, release, judgeCampaign);
  } finally {
    await fs.rm(temporary, { recursive: true, force: true });
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  let expected = null;
  if (!args.write) expected = JSON.parse(await fs.readFile(args.evidence, 'utf8'));
  const generatedAt = args.generatedAt || expected?.generatedAt || new Date().toISOString();
  const observed = await buildScionAdapterCorpusReadinessSnapshot({ generatedAt, profile: args.profile });
  if (args.write) {
    await fs.mkdir(path.dirname(args.evidence), { recursive: true });
    await fs.writeFile(args.evidence, `${JSON.stringify(observed, null, 2)}\n`);
  } else if (stableJson(observed) !== stableJson(expected)) {
    throw new Error('Tracked Scion corpus-readiness evidence does not match a fresh rebuild.');
  }
  console.log(
    `Scion adapter corpus readiness: ${observed.dataset.status}; ${observed.dataset.counts.total}/${observed.dataset.counts.loaded} usable; ${observed.dataset.counts.singleModelJudgePairs} model-judge preferences; holdout ${observed.dataset.holdoutBoundary.status}.`,
  );
  console.log(`Evidence: ${args.evidence}`);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  main().catch((error) => {
    console.error(error?.stack || error);
    process.exitCode = 1;
  });
}
