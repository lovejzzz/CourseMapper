#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

import {
  buildScionAdapterDataset,
  SCION_ADAPTER_DEFAULT_HELDOUT_BENCHMARK,
  SCION_ADAPTER_DEFAULT_SOURCES,
} from './scionAdapterDataset.mjs';

const DEFAULT_EVIDENCE = 'evaluation/scion-adapters/evidence/training-corpus-readiness-v0.16.33.json';

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
  const args = { evidence: DEFAULT_EVIDENCE, write: false, generatedAt: '' };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--evidence') args.evidence = argv[++index];
    else if (argv[index] === '--write') args.write = true;
    else if (argv[index] === '--generated-at') args.generatedAt = argv[++index];
    else throw new Error(`Unknown corpus-readiness option: ${argv[index]}`);
  }
  return args;
}

function snapshot(manifest, generatedAt) {
  const value = {
    schemaVersion: 1,
    protocol: 'scion-adapter-corpus-readiness-v1',
    release: 'v0.16.33',
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
    conclusion: {
      strongestAllowedLane: manifest.status,
      usablePairs: manifest.counts.total,
      requiredResearchPairs: manifest.gate.profiles.research.minimumPairs,
      admissibleModelJudgePairs: manifest.counts.singleModelJudgePairs,
      requiredResearchModelJudgePairs: manifest.gate.profiles.research.minimumModelJudgePairs,
      researchBlockers: manifest.gate.profiles.research.issues,
      nextEvidenceStep:
        'Complete two identity-matched, fresh-session A/B and B/A Codex passes over source-bound, holdout-disjoint candidates before research training.',
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

async function buildSnapshot(generatedAt) {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'scion-corpus-readiness-'));
  try {
    const { manifest } = await buildScionAdapterDataset({
      sources: SCION_ADAPTER_DEFAULT_SOURCES,
      outputDir: temporary,
      heldoutBenchmarkPath: SCION_ADAPTER_DEFAULT_HELDOUT_BENCHMARK,
      allowResearch: true,
      allowSmoke: true,
      generatedAt,
    });
    return snapshot(manifest, generatedAt);
  } finally {
    await fs.rm(temporary, { recursive: true, force: true });
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  let expected = null;
  if (!args.write) expected = JSON.parse(await fs.readFile(args.evidence, 'utf8'));
  const generatedAt = args.generatedAt || expected?.generatedAt || new Date().toISOString();
  const observed = await buildSnapshot(generatedAt);
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

main().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
