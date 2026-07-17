#!/usr/bin/env node
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { findScionExplanationKeyConflict, repairScionMcItem } from '../src/lib/scionAnswerKeyAlignment.js';
import { assessScionMcItem } from '../src/lib/scionPreferenceGate.js';

const DEFAULT_RECEIPT = 'evaluation/scion-adapters/evidence/compiler-mc-recovery-v0.16.22.json';
const EVIDENCE = [
  {
    domain: 'geology',
    file: 'evaluation/scion-source-capture-expansion-evidence/earth-materials-history-lab-local.json',
  },
  {
    domain: 'computer-science',
    file: 'evaluation/scion-source-capture-expansion-evidence/python-program-architecture-studio-local.json',
  },
  {
    domain: 'music-theory',
    file: 'evaluation/scion-source-capture-expansion-evidence/tonal-analysis-integration-studio-local.json',
  },
  {
    domain: 'user-experience-design',
    file: 'evaluation/scion-source-capture-expansion-evidence/ux-evidence-to-prototype-capstone-local.json',
  },
];
const IMPLEMENTATION_FILES = [
  'scripts/scionMcContractRecoveryAudit.mjs',
  'src/lib/blueprintEnrichmentPass.js',
  'src/lib/courseGraph/blueprintFromGraph.js',
  'src/lib/publicScionProvider.js',
  'src/lib/scionAnswerKeyAlignment.js',
  'src/lib/scionLocalProvider.js',
  'src/lib/scionPreferenceGate.js',
  'src/hooks/useStreamReader.js',
];
const EXPECTED_SUMMARY = {
  domains: 4,
  calls: 24,
  mcItems: 48,
  historicalAdmitted: 25,
  afterConservativeKeyAlignment: 33,
  afterIncompleteTailRecovery: 45,
  recoveredByExistingKeyAlignment: 8,
  recoveredByIncompleteTailRecovery: 12,
  totalRecovered: 20,
  historicalBurdenItems: 23,
  remainingBurdenItems: 3,
  burdenReductionRate: 0.869565,
};

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function canonical(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function responseObject(value) {
  if (value && typeof value === 'object') return value;
  return JSON.parse(String(value || ''));
}

function sourceIndexesValid(item, factCount) {
  return (
    Array.isArray(item?.sourceFactIndexes) &&
    item.sourceFactIndexes.length > 0 &&
    item.sourceFactIndexes.every((index) => Number.isInteger(index) && index >= 0 && index < factCount)
  );
}

// This v0.16.22 replay must preserve the admission clock that produced its
// historical receipt. Later rules (currently explicit answer cues and
// placeholder-option rejection) are measured by their own release receipts;
// they must not rewrite which raw items the frozen capture said it admitted.
function assessHistoricalItem(item, factCount) {
  const issues = [...assessScionMcItem(item, { semanticAdmission: false }).issues];
  if (!sourceIndexesValid(item, factCount)) issues.push('source-fact-index');
  const legacyConflict = findScionExplanationKeyConflict(item, {
    allowExplicitCues: false,
    rejectNegativeEvidence: false,
  });
  const filteredIssues = issues.filter(
    (issue) => issue !== 'placeholder-options' && !(issue === 'explanation-key-conflict' && legacyConflict === null),
  );
  return { eligible: filteredIssues.length === 0, issues: filteredIssues };
}

function addIssues(histogram, issues) {
  for (const issue of issues) histogram[issue] = (histogram[issue] || 0) + 1;
}

function assertExpectedSummary(summary) {
  if (JSON.stringify(summary) !== JSON.stringify(EXPECTED_SUMMARY)) {
    throw new Error(
      `Recovery replay changed unexpectedly.\nExpected: ${JSON.stringify(EXPECTED_SUMMARY)}\nReceived: ${JSON.stringify(summary)}`,
    );
  }
}

export async function buildScionMcContractRecoveryReport({ cwd = process.cwd(), generatedAt } = {}) {
  const implementation = [];
  for (const file of IMPLEMENTATION_FILES) {
    const bytes = await fs.readFile(path.join(cwd, file));
    implementation.push({ file, bytes: bytes.length, sha256: sha256(bytes) });
  }

  const domains = [];
  const repairHistogram = {};
  const remainingIssueHistogram = {};
  for (const entry of EVIDENCE) {
    const absolute = path.join(cwd, entry.file);
    const bytes = await fs.readFile(absolute);
    const project = JSON.parse(bytes.toString('utf8'));
    const capture = project?.scionSourceCapture;
    if (capture?.protocol !== 'scion-source-grounded-atom-capture-v1') {
      throw new Error(`${entry.file} is not a source-grounded Scion capture.`);
    }
    const sourceClaimCountByKernel = new Map(
      // Capture prompts number the kernel definition first, followed by facts.
      (capture?.sourcePacket?.kernels || []).map((kernel) => [kernel.id, 1 + (kernel.facts || []).length]),
    );
    const metrics = {
      calls: 0,
      mcItems: 0,
      historicalAdmitted: 0,
      afterConservativeKeyAlignment: 0,
      afterIncompleteTailRecovery: 0,
    };

    for (const call of capture.calls || []) {
      metrics.calls += 1;
      const response = responseObject(call.response);
      const candidates = Array.isArray(response?.mcItems) ? response.mcItems.slice(0, 2) : [];
      const sourceClaimCount = sourceClaimCountByKernel.get(call.kernelId);
      if (!Number.isInteger(sourceClaimCount))
        throw new Error(`${entry.file} has no source kernel for ${call.kernelId}.`);
      let callHistoricalAdmitted = 0;

      for (const [itemIndex, rawItem] of candidates.entries()) {
        metrics.mcItems += 1;
        const historical = assessHistoricalItem(rawItem, sourceClaimCount);
        if (historical.eligible) {
          metrics.historicalAdmitted += 1;
          callHistoricalAdmitted += 1;
        }

        const keyOnly = repairScionMcItem(rawItem, {
          lessonId: call.promptId,
          itemIndex,
          recoverIncompleteExplanation: false,
          keyConflictOptions: { allowExplicitCues: false, rejectNegativeEvidence: false },
          // v0.16.47 production correctly refuses lexical-only key mutation.
          // This immutable v0.16.22 replay must opt into the historical rule
          // explicitly so its old receipt remains reproducible, never active.
          allowUnverifiedLexicalRepair: true,
        });
        if (assessHistoricalItem(keyOnly.item, sourceClaimCount).eligible) {
          metrics.afterConservativeKeyAlignment += 1;
        }

        const recovered = repairScionMcItem(rawItem, {
          lessonId: call.promptId,
          itemIndex,
          keyConflictOptions: { allowExplicitCues: false, rejectNegativeEvidence: false },
          allowUnverifiedLexicalRepair: true,
        });
        for (const repair of recovered.repairs) {
          repairHistogram[repair.pass] = (repairHistogram[repair.pass] || 0) + 1;
        }
        const finalAssessment = assessHistoricalItem(recovered.item, sourceClaimCount);
        if (finalAssessment.eligible) metrics.afterIncompleteTailRecovery += 1;
        else addIssues(remainingIssueHistogram, finalAssessment.issues);
      }

      const tracked = Number(call?.assessment?.counts?.admittedMcItems || 0);
      if (tracked !== callHistoricalAdmitted) {
        throw new Error(
          `${entry.file} ${call.promptId} historical admission mismatch: tracked ${tracked}, replayed ${callHistoricalAdmitted}.`,
        );
      }
    }

    domains.push({
      domain: entry.domain,
      evidence: { file: entry.file, bytes: bytes.length, sha256: sha256(bytes) },
      ...metrics,
      recoveredByExistingKeyAlignment: metrics.afterConservativeKeyAlignment - metrics.historicalAdmitted,
      recoveredByIncompleteTailRecovery: metrics.afterIncompleteTailRecovery - metrics.afterConservativeKeyAlignment,
      remainingBurdenItems: metrics.mcItems - metrics.afterIncompleteTailRecovery,
    });
  }

  const totals = domains.reduce(
    (sum, domain) => {
      for (const key of [
        'calls',
        'mcItems',
        'historicalAdmitted',
        'afterConservativeKeyAlignment',
        'afterIncompleteTailRecovery',
      ]) {
        sum[key] += domain[key];
      }
      return sum;
    },
    { calls: 0, mcItems: 0, historicalAdmitted: 0, afterConservativeKeyAlignment: 0, afterIncompleteTailRecovery: 0 },
  );
  const historicalBurdenItems = totals.mcItems - totals.historicalAdmitted;
  const remainingBurdenItems = totals.mcItems - totals.afterIncompleteTailRecovery;
  const summary = {
    domains: domains.length,
    ...totals,
    recoveredByExistingKeyAlignment: totals.afterConservativeKeyAlignment - totals.historicalAdmitted,
    recoveredByIncompleteTailRecovery: totals.afterIncompleteTailRecovery - totals.afterConservativeKeyAlignment,
    totalRecovered: totals.afterIncompleteTailRecovery - totals.historicalAdmitted,
    historicalBurdenItems,
    remainingBurdenItems,
    burdenReductionRate: Number(((historicalBurdenItems - remainingBurdenItems) / historicalBurdenItems).toFixed(6)),
  };
  assertExpectedSummary(summary);
  if (JSON.stringify(remainingIssueHistogram) !== JSON.stringify({ 'longest-option-cue': 3 })) {
    throw new Error(`Unexpected remaining issue histogram: ${JSON.stringify(remainingIssueHistogram)}`);
  }

  return {
    protocol: 'scion-mc-contract-recovery-audit-v1',
    release: 'v0.16.22',
    generatedAt: generatedAt || new Date().toISOString(),
    status: 'compiler-contract-recovery-proven',
    implementation,
    domains,
    summary,
    repairHistogram,
    remainingIssueHistogram,
    qualityBoundary: {
      evidenceType: 'deterministic-replay-of-immutable-local-model-responses',
      claim: 'compiler-contract-recovery-only',
      details:
        'Recovery retains existing complete sentences and aligns only decisive explanation/key contradictions. It makes no new factual claim and does not rewrite the historical capture artifacts.',
      doesNotProve: [
        'adapter-quality-win',
        'held-out-domain-win',
        'paid-reference-parity',
        'independent-review',
        'human-or-instructor-validation',
      ],
    },
  };
}

function parseArgs(argv) {
  const options = { write: false, receipt: DEFAULT_RECEIPT };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--write') options.write = true;
    else if (argv[index] === '--receipt') options.receipt = argv[++index] || options.receipt;
  }
  return options;
}

export async function runScionMcContractRecoveryAudit(options = {}) {
  const cwd = options.cwd || process.cwd();
  const receipt = options.receipt || DEFAULT_RECEIPT;
  const receiptPath = path.join(cwd, receipt);
  if (options.write) {
    const report = await buildScionMcContractRecoveryReport({ cwd });
    await fs.mkdir(path.dirname(receiptPath), { recursive: true });
    await fs.writeFile(receiptPath, canonical(report));
    return { report, receipt, wrote: true };
  }

  const tracked = JSON.parse(await fs.readFile(receiptPath, 'utf8'));
  if (
    tracked.protocol !== 'scion-mc-contract-recovery-audit-v1' ||
    tracked.release !== 'v0.16.22' ||
    tracked.status !== 'compiler-contract-recovery-proven' ||
    canonical(tracked.summary) !== canonical(EXPECTED_SUMMARY)
  ) {
    throw new Error(`${receipt} historical identity or summary changed.`);
  }
  if (canonical(tracked.implementation?.map((entry) => entry.file)) !== canonical(IMPLEMENTATION_FILES)) {
    throw new Error(`${receipt} historical implementation inventory changed.`);
  }
  for (const entry of tracked.implementation || []) {
    if (!Number.isInteger(entry.bytes) || entry.bytes <= 0 || !/^[a-f0-9]{64}$/.test(String(entry.sha256 || ''))) {
      throw new Error(`Historical implementation binding is malformed: ${entry.file}`);
    }
  }
  for (const expected of EVIDENCE) {
    const domain = tracked.domains?.find((entry) => entry.domain === expected.domain);
    if (!domain || domain.evidence?.file !== expected.file) {
      throw new Error(`${receipt} is missing historical evidence for ${expected.domain}.`);
    }
    const bytes = await fs.readFile(path.join(cwd, expected.file));
    if (bytes.length !== domain.evidence.bytes || sha256(bytes) !== domain.evidence.sha256) {
      throw new Error(`Historical MC recovery evidence changed: ${expected.file}`);
    }
  }
  // Later compiler releases are allowed to change current implementation
  // bytes. The historical audit retains its exact measured summary and proves
  // the immutable input artifacts instead of relabeling a new replay as v0.16.22.
  return { report: tracked, receipt, wrote: false };
}

async function main() {
  const result = await runScionMcContractRecoveryAudit(parseArgs(process.argv.slice(2)));
  const summary = result.report.summary;
  console.log(`Scion MC contract recovery: ${result.report.status}`);
  console.log(
    `Historical ${summary.historicalAdmitted}/${summary.mcItems} -> key-aligned ${summary.afterConservativeKeyAlignment}/${summary.mcItems} -> recovered ${summary.afterIncompleteTailRecovery}/${summary.mcItems}`,
  );
  console.log(
    `Recovered ${summary.totalRecovered}/${summary.historicalBurdenItems} burden items (${(summary.burdenReductionRate * 100).toFixed(2)}%); ${summary.remainingBurdenItems} longest-option cues remain rejected.`,
  );
  console.log(`${result.wrote ? 'Wrote' : 'Verified'}: ${result.receipt}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
