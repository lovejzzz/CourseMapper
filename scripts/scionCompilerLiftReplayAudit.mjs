#!/usr/bin/env node
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { repairScionMcItem } from '../src/lib/scionAnswerKeyAlignment.js';
import { assessScionKeyTerm, assessScionMcItem } from '../src/lib/scionPreferenceGate.js';
import {
  canonicalJson,
  materializeSourceCaptureCampaign,
  parseSourceAtomResponse,
  verifySourceCaptureProject,
} from './lib/scionSourceCapture.mjs';

const DEFAULT_RECEIPT = 'evaluation/scion-adapters/evidence/compiler-cross-arm-replay-v0.16.26.json';
const CAMPAIGNS = [
  {
    id: 'primary',
    manifest: 'evaluation/scion-source-capture-campaign.json',
    evidenceDir: 'evaluation/scion-source-capture-evidence',
  },
  {
    id: 'expansion',
    manifest: 'evaluation/scion-source-capture-expansion-v0.16.17.json',
    evidenceDir: 'evaluation/scion-source-capture-expansion-evidence',
  },
];
const ARMS = ['local', 'reference'];
const EXPECTED_MODELS = {
  local: {
    provider: 'local',
    id: 'google/gemma-4-E2B-it-qat-q4_0-unquantized',
    name: 'Scion base (Gemma 4 E2B)',
    revision: '1ca4dd94b623b6e0dd9da00c2239ab84b4f3e5ce',
    route: 'mlx-vlm-base-only',
    decoding: 'greedy-json-schema',
    maxOutputTokens: 2200,
  },
  reference: {
    provider: 'openai',
    id: 'gpt-5.4-mini',
    name: 'gpt-5.4-mini',
    route: 'responses-api',
    reasoningEffort: 'low',
    maxOutputTokens: 4000,
  },
};
const IMPLEMENTATION_FILES = [
  'scripts/scionCompilerLiftReplayAudit.mjs',
  'scripts/lib/scionSourceCapture.mjs',
  'src/lib/blueprintEnrichmentPass.js',
  'src/lib/courseGraph/blueprintFromGraph.js',
  'src/lib/itemAdmissionLint.js',
  'src/lib/publicScionProvider.js',
  'src/lib/scionAnswerKeyAlignment.js',
  'src/lib/scionLocalProvider.js',
  'src/lib/scionPreferenceGate.js',
  'src/hooks/useStreamReader.js',
];
const EXPECTED_CAMPAIGNS = {
  primary: {
    groups: 8,
    prompts: 24,
    expectedAtomsPerArm: 96,
    local: { raw: { mc: 26, keyTerms: 36, total: 62 }, compiled: { mc: 41, keyTerms: 37, total: 78 } },
    reference: { raw: { mc: 43, keyTerms: 48, total: 91 }, compiled: { mc: 44, keyTerms: 48, total: 92 } },
  },
  expansion: {
    groups: 4,
    prompts: 24,
    expectedAtomsPerArm: 96,
    local: { raw: { mc: 25, keyTerms: 45, total: 70 }, compiled: { mc: 45, keyTerms: 45, total: 90 } },
    reference: { raw: { mc: 38, keyTerms: 48, total: 86 }, compiled: { mc: 42, keyTerms: 48, total: 90 } },
  },
};
const EXPECTED_SUMMARY = {
  campaigns: 2,
  groups: 12,
  promptsPerArm: 48,
  expectedAtomsPerArm: 192,
  local: {
    raw: { mc: 51, keyTerms: 81, total: 132 },
    compiled: { mc: 86, keyTerms: 82, total: 168 },
    lift: { mc: 35, keyTerms: 1, total: 36, percentagePoints: 18.75 },
  },
  reference: {
    raw: { mc: 81, keyTerms: 96, total: 177 },
    compiled: { mc: 86, keyTerms: 96, total: 182 },
    lift: { mc: 5, keyTerms: 0, total: 5, percentagePoints: 2.6042 },
  },
  rawReferenceAdvantage: { atoms: 45, percentagePoints: 23.4375 },
  compiledReferenceAdvantage: { atoms: 14, percentagePoints: 7.2917 },
  measuredGapClosedByCompiler: { atoms: 31, rate: 0.688889 },
  mcContractAdmission: {
    local: 86,
    reference: 86,
    expectedPerArm: 96,
    difference: 0,
  },
  remainingAdmissionGap: {
    atoms: 14,
    kind: 'local-key-term-contract-admission',
    accounting: {
      correctionRepeatsDefinition: 12,
      invalidSourceFactIndex: 1,
      missingExpectedSeat: 1,
    },
  },
};

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function canonical(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function sourceIndexesValid(item, sourceClaimCount) {
  return (
    Array.isArray(item?.sourceFactIndexes) &&
    item.sourceFactIndexes.length > 0 &&
    item.sourceFactIndexes.every((index) => Number.isInteger(index) && index >= 0 && index < sourceClaimCount)
  );
}

function assessCandidate(kind, candidate, sourceClaimCount) {
  const result = kind === 'mc' ? assessScionMcItem(candidate) : assessScionKeyTerm(candidate);
  const issues = [...result.issues];
  if (!sourceIndexesValid(candidate, sourceClaimCount)) issues.push('source-fact-index');
  return { eligible: issues.length === 0, issues: [...new Set(issues)] };
}

function addIssues(histogram, issues) {
  for (const issue of issues) histogram[issue] = (histogram[issue] || 0) + 1;
}

function sortedHistogram(histogram) {
  return Object.fromEntries(Object.entries(histogram).sort(([left], [right]) => left.localeCompare(right)));
}

function responseCandidates(call) {
  if (!call?.response) return { mc: [], keyTerms: [] };
  const response = parseSourceAtomResponse(call.response);
  return {
    mc: Array.isArray(response?.mcItems) ? response.mcItems.slice(0, 2) : [],
    keyTerms: Array.isArray(response?.keyTerms) ? response.keyTerms.slice(0, 2) : [],
  };
}

function emptyCounts() {
  return { mc: 0, keyTerms: 0, total: 0 };
}

function addCounts(target, source) {
  target.mc += source.mc;
  target.keyTerms += source.keyTerms;
  target.total += source.total;
}

function withTotal({ mc, keyTerms }) {
  return { mc, keyTerms, total: mc + keyTerms };
}

function measurePrompt({ rawCall, recoveryCall, prompt, repairHistogram, remainingIssues }) {
  const sourceClaimCount = prompt.sourceClaims.length;
  const rawCandidates = responseCandidates(rawCall);
  const raw = { mc: 0, keyTerms: 0 };
  const compiled = { mc: 0, keyTerms: 0 };

  rawCandidates.mc.forEach((item, itemIndex) => {
    if (assessCandidate('mc', item, sourceClaimCount).eligible) raw.mc += 1;
    const repaired = repairScionMcItem(item, { lessonId: prompt.id, itemIndex });
    for (const repair of repaired.repairs) {
      repairHistogram[repair.pass] = (repairHistogram[repair.pass] || 0) + 1;
    }
    const assessment = assessCandidate('mc', repaired.item, sourceClaimCount);
    if (assessment.eligible) compiled.mc += 1;
    else addIssues(remainingIssues.mc, assessment.issues);
  });
  rawCandidates.keyTerms.forEach((term) => {
    const assessment = assessCandidate('key-term', term, sourceClaimCount);
    if (assessment.eligible) {
      raw.keyTerms += 1;
      compiled.keyTerms += 1;
    } else {
      addIssues(remainingIssues.keyTerms, assessment.issues);
    }
  });

  const trackedRaw = {
    mc: Number(rawCall?.assessment?.counts?.admittedMcItems || 0),
    keyTerms: Number(rawCall?.assessment?.counts?.admittedKeyTerms || 0),
  };
  if (canonicalJson(raw) !== canonicalJson(trackedRaw)) {
    throw new Error(
      `${prompt.id} raw admission mismatch: tracked ${canonicalJson(trackedRaw)}, replayed ${canonicalJson(raw)}.`,
    );
  }

  const recoveryUsed = { mc: 0, keyTerms: 0 };
  if (recoveryCall) {
    const recoveryCandidates = responseCandidates(recoveryCall);
    for (const [itemIndex, item] of recoveryCandidates.mc.entries()) {
      if (compiled.mc >= 2) break;
      const repaired = repairScionMcItem(item, { lessonId: prompt.id, itemIndex: 2 + itemIndex });
      for (const repair of repaired.repairs) {
        repairHistogram[repair.pass] = (repairHistogram[repair.pass] || 0) + 1;
      }
      const assessment = assessCandidate('mc', repaired.item, sourceClaimCount);
      if (assessment.eligible) {
        compiled.mc += 1;
        recoveryUsed.mc += 1;
      } else {
        addIssues(remainingIssues.mc, assessment.issues);
      }
    }
    for (const term of recoveryCandidates.keyTerms) {
      if (compiled.keyTerms >= 2) break;
      const assessment = assessCandidate('key-term', term, sourceClaimCount);
      if (assessment.eligible) {
        compiled.keyTerms += 1;
        recoveryUsed.keyTerms += 1;
      } else {
        addIssues(remainingIssues.keyTerms, assessment.issues);
      }
    }
  }

  return {
    raw: withTotal(raw),
    compiled: withTotal(compiled),
    recoveryUsed: withTotal(recoveryUsed),
  };
}

function assertExact(label, received, expected) {
  if (canonicalJson(received) !== canonicalJson(expected)) {
    throw new Error(`${label} changed unexpectedly.\nExpected: ${canonical(expected)}Received: ${canonical(received)}`);
  }
}

function armLift(raw, compiled, expectedAtoms) {
  return {
    mc: compiled.mc - raw.mc,
    keyTerms: compiled.keyTerms - raw.keyTerms,
    total: compiled.total - raw.total,
    percentagePoints: Number((((compiled.total - raw.total) / expectedAtoms) * 100).toFixed(4)),
  };
}

export async function buildScionCompilerLiftReplayReport({ cwd = process.cwd(), generatedAt } = {}) {
  const implementation = [];
  for (const file of IMPLEMENTATION_FILES) {
    const bytes = await fs.readFile(path.join(cwd, file));
    implementation.push({ file, bytes: bytes.length, sha256: sha256(bytes) });
  }

  const campaigns = [];
  const aggregate = {
    groups: 0,
    promptsPerArm: 0,
    expectedAtomsPerArm: 0,
    local: { raw: emptyCounts(), compiled: emptyCounts(), recoveryUsed: emptyCounts() },
    reference: { raw: emptyCounts(), compiled: emptyCounts(), recoveryUsed: emptyCounts() },
  };
  const aggregateRepairHistogram = { local: {}, reference: {} };
  const aggregateRemainingIssues = {
    local: { mc: {}, keyTerms: {} },
    reference: { mc: {}, keyTerms: {} },
  };

  for (const campaignConfig of CAMPAIGNS) {
    const campaign = await materializeSourceCaptureCampaign({ cwd, manifestPath: campaignConfig.manifest });
    const campaignResult = {
      id: campaignConfig.id,
      manifest: {
        file: campaign.manifestPath,
        sha256: campaign.manifestSha256,
        promptSetSha256: campaign.promptSetSha256,
      },
      groups: campaign.groups.length,
      prompts: campaign.summary.prompts,
      expectedAtomsPerArm: campaign.summary.expectedCandidates,
      arms: {},
    };
    aggregate.groups += campaignResult.groups;
    aggregate.promptsPerArm += campaignResult.prompts;
    aggregate.expectedAtomsPerArm += campaignResult.expectedAtomsPerArm;
    assertExact(
      `${campaignConfig.id} topology`,
      {
        groups: campaignResult.groups,
        prompts: campaignResult.prompts,
        expectedAtomsPerArm: campaignResult.expectedAtomsPerArm,
      },
      {
        groups: EXPECTED_CAMPAIGNS[campaignConfig.id].groups,
        prompts: EXPECTED_CAMPAIGNS[campaignConfig.id].prompts,
        expectedAtomsPerArm: EXPECTED_CAMPAIGNS[campaignConfig.id].expectedAtomsPerArm,
      },
    );

    for (const arm of ARMS) {
      const raw = emptyCounts();
      const compiled = emptyCounts();
      const recoveryUsed = emptyCounts();
      const evidence = [];
      const repairHistogram = {};
      const remainingIssues = { mc: {}, keyTerms: {} };

      for (const group of campaign.groups) {
        const file = path.posix.join(campaignConfig.evidenceDir, `${group.id}-${arm}.json`);
        const bytes = await fs.readFile(path.join(cwd, file));
        const project = JSON.parse(bytes.toString('utf8'));
        const verification = verifySourceCaptureProject(project, {
          campaign,
          group,
          arm,
          model: EXPECTED_MODELS[arm],
        });
        if (!verification.valid) {
          throw new Error(`${file} failed immutable source-capture verification: ${verification.issues.join(', ')}`);
        }
        evidence.push({ file, bytes: bytes.length, sha256: sha256(bytes) });

        const capture = project.scionSourceCapture;
        const rawByPrompt = new Map(capture.compilerRecovery.rawCalls.map((call) => [call.promptId, call]));
        const recoveryByPrompt = new Map(capture.compilerRecovery.recoveryCalls.map((call) => [call.promptId, call]));
        const recoveredPromptIds = new Set(capture.compilerRecovery.recoveredPromptIds);
        for (const prompt of group.prompts) {
          const rawCall = rawByPrompt.get(prompt.id);
          if (!rawCall) throw new Error(`${file} is missing raw call ${prompt.id}.`);
          const recoveryCall = recoveredPromptIds.has(prompt.id) ? recoveryByPrompt.get(prompt.id) : null;
          const measured = measurePrompt({ rawCall, recoveryCall, prompt, repairHistogram, remainingIssues });
          addCounts(raw, measured.raw);
          addCounts(compiled, measured.compiled);
          addCounts(recoveryUsed, measured.recoveryUsed);
        }
      }

      const result = {
        model: EXPECTED_MODELS[arm],
        evidence,
        raw,
        compiled,
        lift: armLift(raw, compiled, campaignResult.expectedAtomsPerArm),
        recoveryUsed,
        repairHistogram: sortedHistogram(repairHistogram),
        remainingIssueHistogram: {
          mc: sortedHistogram(remainingIssues.mc),
          keyTerms: sortedHistogram(remainingIssues.keyTerms),
        },
      };
      campaignResult.arms[arm] = result;
      assertExact(`${campaignConfig.id} ${arm}`, { raw, compiled }, EXPECTED_CAMPAIGNS[campaignConfig.id][arm]);
      addCounts(aggregate[arm].raw, raw);
      addCounts(aggregate[arm].compiled, compiled);
      addCounts(aggregate[arm].recoveryUsed, recoveryUsed);
      for (const [issue, count] of Object.entries(repairHistogram)) {
        aggregateRepairHistogram[arm][issue] = (aggregateRepairHistogram[arm][issue] || 0) + count;
      }
      for (const kind of ['mc', 'keyTerms']) {
        for (const [issue, count] of Object.entries(remainingIssues[kind])) {
          aggregateRemainingIssues[arm][kind][issue] = (aggregateRemainingIssues[arm][kind][issue] || 0) + count;
        }
      }
    }
    campaigns.push(campaignResult);
  }

  const localLift = armLift(aggregate.local.raw, aggregate.local.compiled, aggregate.expectedAtomsPerArm);
  const referenceLift = armLift(aggregate.reference.raw, aggregate.reference.compiled, aggregate.expectedAtomsPerArm);
  const rawReferenceAdvantage = aggregate.reference.raw.total - aggregate.local.raw.total;
  const compiledReferenceAdvantage = aggregate.reference.compiled.total - aggregate.local.compiled.total;
  const gapClosed = rawReferenceAdvantage - compiledReferenceAdvantage;
  const summary = {
    campaigns: campaigns.length,
    groups: aggregate.groups,
    promptsPerArm: aggregate.promptsPerArm,
    expectedAtomsPerArm: aggregate.expectedAtomsPerArm,
    local: { raw: aggregate.local.raw, compiled: aggregate.local.compiled, lift: localLift },
    reference: { raw: aggregate.reference.raw, compiled: aggregate.reference.compiled, lift: referenceLift },
    rawReferenceAdvantage: {
      atoms: rawReferenceAdvantage,
      percentagePoints: Number(((rawReferenceAdvantage / aggregate.expectedAtomsPerArm) * 100).toFixed(4)),
    },
    compiledReferenceAdvantage: {
      atoms: compiledReferenceAdvantage,
      percentagePoints: Number(((compiledReferenceAdvantage / aggregate.expectedAtomsPerArm) * 100).toFixed(4)),
    },
    measuredGapClosedByCompiler: {
      atoms: gapClosed,
      rate: Number((gapClosed / rawReferenceAdvantage).toFixed(6)),
    },
    mcContractAdmission: {
      local: aggregate.local.compiled.mc,
      reference: aggregate.reference.compiled.mc,
      expectedPerArm: aggregate.expectedAtomsPerArm / 2,
      difference: aggregate.reference.compiled.mc - aggregate.local.compiled.mc,
    },
    remainingAdmissionGap: {
      atoms: compiledReferenceAdvantage,
      kind: 'local-key-term-contract-admission',
      accounting: {
        correctionRepeatsDefinition: aggregateRemainingIssues.local.keyTerms['correction-repeats-definition'] || 0,
        invalidSourceFactIndex: aggregateRemainingIssues.local.keyTerms['source-fact-index'] || 0,
        missingExpectedSeat:
          aggregate.expectedAtomsPerArm / 2 -
          aggregate.local.compiled.keyTerms -
          Object.values(aggregateRemainingIssues.local.keyTerms).reduce((sum, count) => sum + count, 0),
      },
    },
  };
  assertExact('aggregate summary', summary, EXPECTED_SUMMARY);

  return {
    protocol: 'scion-cross-arm-compiler-lift-replay-v1',
    release: 'v0.16.26',
    generatedAt: generatedAt || new Date().toISOString(),
    status: 'cross-arm-compiler-lift-measured',
    implementation,
    campaigns,
    summary,
    aggregateMechanics: {
      recoveryUsed: {
        local: aggregate.local.recoveryUsed,
        reference: aggregate.reference.recoveryUsed,
      },
      repairHistogram: {
        local: sortedHistogram(aggregateRepairHistogram.local),
        reference: sortedHistogram(aggregateRepairHistogram.reference),
      },
      remainingIssueHistogram: {
        local: {
          mc: sortedHistogram(aggregateRemainingIssues.local.mc),
          keyTerms: sortedHistogram(aggregateRemainingIssues.local.keyTerms),
        },
        reference: {
          mc: sortedHistogram(aggregateRemainingIssues.reference.mc),
          keyTerms: sortedHistogram(aggregateRemainingIssues.reference.keyTerms),
        },
      },
    },
    interpretation: {
      compilerBenefit: 'Both retained model arms improve under the same deterministic compiler replay.',
      asymmetricLift:
        'The local arm gains 36 admitted atoms while the paid-reference arm gains 5, so the compiler compensates for substantially more contract failure in the smaller local model.',
      modelGap:
        'MC contract admission reaches 86/96 in both arms. The remaining 14-atom admission difference is entirely local key-term output, primarily misconception/correction contract failures; that is the highest-value adapter target exposed by this replay.',
    },
    qualityBoundary: {
      evidenceType: 'deterministic-cross-arm-replay-of-immutable-model-responses',
      claim: 'compiler-contract-admission-lift-only',
      details:
        'The audit verifies retained projects, source packets, prompts, responses, and implementation bytes; makes no new model calls; repairs MC items only through existing sentence retention and decisive explanation/key alignment; and counts an already-retained recovery response without rewriting evidence.',
      doesNotProve: [
        'factual-superiority',
        'educational-quality-win',
        'model-or-adapter-win',
        'held-out-domain-win',
        'paid-reference-quality-parity',
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

export async function runScionCompilerLiftReplayAudit(options = {}) {
  const cwd = options.cwd || process.cwd();
  const receipt = options.receipt || DEFAULT_RECEIPT;
  const receiptPath = path.join(cwd, receipt);
  if (options.write) {
    const report = await buildScionCompilerLiftReplayReport({ cwd });
    await fs.mkdir(path.dirname(receiptPath), { recursive: true });
    await fs.writeFile(receiptPath, canonical(report));
    return { report, receipt, wrote: true };
  }
  const tracked = JSON.parse(await fs.readFile(receiptPath, 'utf8'));
  const report = await buildScionCompilerLiftReplayReport({ cwd, generatedAt: tracked.generatedAt });
  if (canonical(report) !== canonical(tracked)) {
    throw new Error(`${receipt} does not match the immutable evidence replay and implementation hashes.`);
  }
  return { report, receipt, wrote: false };
}

async function main() {
  const result = await runScionCompilerLiftReplayAudit(parseArgs(process.argv.slice(2)));
  const { summary } = result.report;
  console.log(`Scion cross-arm compiler replay: ${result.report.status}`);
  console.log(
    `Local ${summary.local.raw.total}/${summary.expectedAtomsPerArm} -> ${summary.local.compiled.total}/${summary.expectedAtomsPerArm} (+${summary.local.lift.total}); reference ${summary.reference.raw.total}/${summary.expectedAtomsPerArm} -> ${summary.reference.compiled.total}/${summary.expectedAtomsPerArm} (+${summary.reference.lift.total}).`,
  );
  console.log(
    `Measured admission gap ${summary.rawReferenceAdvantage.atoms} -> ${summary.compiledReferenceAdvantage.atoms}; compiler closes ${(summary.measuredGapClosedByCompiler.rate * 100).toFixed(2)}%.`,
  );
  console.log(
    'Boundary: deterministic contract admission only; no model, adapter, factual, or educational-quality win.',
  );
  console.log(`${result.wrote ? 'Wrote' : 'Verified'}: ${result.receipt}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
