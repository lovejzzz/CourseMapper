#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

export const SCION_SEMANTIC_ADMISSION_PROTOCOL = 'scion-semantic-admission-replay-v1';
export const SCION_SEMANTIC_ADMISSION_RELEASE = 'v0.16.44';
export const SCION_SEMANTIC_ADMISSION_CORPUS =
  'evaluation/scion-adapters/evidence/codex-approved-preferences-v0.16.42.jsonl';
export const SCION_SEMANTIC_ADMISSION_CAMPAIGN = 'evaluation/scion-adapters/evidence/judge-campaign-v0.16.42.json';
export const SCION_SEMANTIC_ADMISSION_BASELINE =
  'evaluation/scion-adapters/evidence/semantic-admission-baseline-v0.16.42.json';
export const SCION_SEMANTIC_ADMISSION_RECEIPT =
  'evaluation/scion-adapters/evidence/semantic-admission-replay-v0.16.44.json';

const IMPLEMENTATION_SOURCES = [
  'src/lib/scionAnswerKeyAlignment.js',
  'src/lib/scionPreferenceGate.js',
  'src/lib/blueprintEnrichmentPass.js',
];

const EXPECTED_CURRENT = {
  reviewedStableLosses: 46,
  acceptedWithoutInterception: 34,
  intercepted: 12,
  repaired: 6,
  rejectedForRegeneration: 6,
  responseTextMutations: 0,
  repairFieldMutations: 6,
  issues: {
    'duplicate-options': 2,
    'explanation-repeats-answer': 4,
  },
};

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function canonical(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function fileReceipt(root, relativePath) {
  const raw = await fs.readFile(path.join(root, relativePath));
  return { path: relativePath, bytes: raw.length, sha256: sha256(raw) };
}

function histogram(values) {
  const counts = {};
  for (const value of values) counts[value] = (counts[value] || 0) + 1;
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)));
}

function differingTopLevelFields(before, after) {
  const fields = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
  return [...fields].filter((field) => JSON.stringify(before?.[field]) !== JSON.stringify(after?.[field])).sort();
}

function assertExact(label, actual, expected) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label} changed. Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}.`);
  }
}

function judgeDefectsSupportInterception(row, issues, repairs) {
  const defects = (row.preferenceEvidence?.decisionDefects || []).join(' ');
  if (
    repairs.length > 0 &&
    !/(?:answer|key).*(?:wrong|contradict|disagree)|(?:wrong|contradict).*(?:answer|key)/i.test(defects)
  ) {
    throw new Error(`${row.reviewPairId} repair is not supported by the retained judge defects.`);
  }
  if (
    issues.includes('duplicate-options') &&
    !/(?:duplicate|identical|two (?:correct|defensible)|near-synonym)/i.test(defects)
  ) {
    throw new Error(`${row.reviewPairId} duplicate rejection is not supported by the retained judge defects.`);
  }
  if (
    issues.includes('explanation-repeats-answer') &&
    !/(?:bare repetition|bare sentence|only the answer|repeating the correct option|lacks explanatory|no rationale|no reasoning|feedback beyond repeating)/i.test(
      defects,
    )
  ) {
    throw new Error(`${row.reviewPairId} thin-feedback rejection is not supported by the retained judge defects.`);
  }
}

export async function buildScionSemanticAdmissionReport({
  implementationRoot = process.cwd(),
  release = SCION_SEMANTIC_ADMISSION_RELEASE,
  generatedAt,
  baselinePath = SCION_SEMANTIC_ADMISSION_BASELINE,
} = {}) {
  if (!generatedAt || !Number.isFinite(Date.parse(generatedAt))) {
    throw new Error('Semantic admission replay requires a stable generatedAt timestamp.');
  }
  const root = path.resolve(implementationRoot);
  const [{ repairScionMcItem }, { assessScionKeyTerm, assessScionMcItem }] = await Promise.all([
    import(`${pathToFileURL(path.join(root, 'src/lib/scionAnswerKeyAlignment.js')).href}?release=${release}`),
    import(`${pathToFileURL(path.join(root, 'src/lib/scionPreferenceGate.js')).href}?release=${release}`),
  ]);
  const [corpusRaw, campaignRaw] = await Promise.all([
    fs.readFile(path.join(root, SCION_SEMANTIC_ADMISSION_CORPUS), 'utf8'),
    fs.readFile(path.join(root, SCION_SEMANTIC_ADMISSION_CAMPAIGN), 'utf8'),
  ]);
  const campaign = JSON.parse(campaignRaw);
  const corpusSha256 = sha256(corpusRaw);
  if (campaign.approvedCorpus?.sha256 !== corpusSha256) {
    throw new Error('Semantic admission corpus no longer matches the paired-order campaign.');
  }
  const rows = corpusRaw
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  if (rows.length !== campaign.approvedCorpus?.rows) throw new Error('Semantic admission corpus row count drifted.');

  const intercepted = [];
  const repairKinds = [];
  const rejectionIssues = [];
  let responseTextMutations = 0;
  let repairFieldMutations = 0;

  for (const row of rows) {
    const evidence = row.preferenceEvidence || {};
    if (
      evidence.kind !== 'single-model-judge-preference' ||
      evidence.stable !== true ||
      evidence.humanEvidence !== false ||
      evidence.independentEvidence !== false ||
      !Array.isArray(evidence.orders) ||
      evidence.orders.join('|') !== 'A/B|B/A'
    ) {
      throw new Error(`${row.reviewPairId || 'unknown row'} is outside the stable paired single-model-judge lane.`);
    }
    if (sha256(row.rejected) !== evidence.rejectedArtifactSha256) {
      throw new Error(`${row.reviewPairId} rejected artifact hash drifted.`);
    }
    if (sha256(row.chosen) !== evidence.chosenArtifactSha256) {
      throw new Error(`${row.reviewPairId} chosen artifact hash drifted.`);
    }

    const rejected = JSON.parse(row.rejected);
    const repair = row.kind === 'mc-item' ? repairScionMcItem(rejected) : { item: rejected, repairs: [] };
    const admission = row.kind === 'mc-item' ? assessScionMcItem(repair.item) : assessScionKeyTerm(repair.item);
    const changedFields = differingTopLevelFields(rejected, repair.item);
    if (changedFields.length > 0) {
      repairFieldMutations += changedFields.length;
      if (changedFields.length !== 1 || !['ai', 'answerIndex'].includes(changedFields[0])) {
        throw new Error(`${row.reviewPairId} changed fields outside the answer index: ${changedFields.join(', ')}.`);
      }
      const withoutAnswerBefore = { ...rejected };
      const withoutAnswerAfter = { ...repair.item };
      delete withoutAnswerBefore.ai;
      delete withoutAnswerBefore.answerIndex;
      delete withoutAnswerAfter.ai;
      delete withoutAnswerAfter.answerIndex;
      if (JSON.stringify(withoutAnswerBefore) !== JSON.stringify(withoutAnswerAfter)) responseTextMutations += 1;
    }
    if (repair.repairs.length === 0 && admission.eligible) continue;

    const issues = admission.issues || [];
    judgeDefectsSupportInterception(row, issues, repair.repairs);
    repairKinds.push(
      ...repair.repairs.map(
        (entry) =>
          entry.preferenceEvidence?.explicitCues?.[0]?.type || entry.preferenceEvidence?.supportMethod || entry.pass,
      ),
    );
    rejectionIssues.push(...issues);
    intercepted.push({
      reviewPairId: row.reviewPairId,
      domain: row.domain,
      kind: row.kind,
      action: repair.repairs.length > 0 ? 'answer-index-repaired' : 'rejected-for-regeneration',
      changedFields,
      originalArtifactSha256: evidence.rejectedArtifactSha256,
      admittedArtifactSha256: sha256(JSON.stringify(repair.item)),
      repairs: repair.repairs.map((entry) => ({
        pass: entry.pass,
        action: entry.action,
        supportMethod: entry.preferenceEvidence?.supportMethod || '',
        explicitCueTypes: (entry.preferenceEvidence?.explicitCues || []).map((cue) => cue.type),
        declaredIndex: entry.preferenceEvidence?.declaredIndex,
        supportedIndex: entry.preferenceEvidence?.supportedIndex,
        scores: entry.preferenceEvidence?.scores,
        minimumBestScore: entry.preferenceEvidence?.minimumBestScore,
        minimumMargin: entry.preferenceEvidence?.minimumMargin,
        evidenceSentence: entry.preferenceEvidence?.evidenceSentence,
      })),
      remainingIssues: issues,
      judgeDefectCount: evidence.decisionDefects.length,
    });
  }

  const summary = {
    reviewedStableLosses: rows.length,
    acceptedWithoutInterception: rows.length - intercepted.length,
    intercepted: intercepted.length,
    repaired: intercepted.filter((entry) => entry.action === 'answer-index-repaired').length,
    rejectedForRegeneration: intercepted.filter((entry) => entry.action === 'rejected-for-regeneration').length,
    responseTextMutations,
    repairFieldMutations,
    issues: histogram(rejectionIssues),
    repairCues: histogram(repairKinds),
    byDomain: histogram(intercepted.map((entry) => entry.domain)),
  };

  let baseline = null;
  if (release !== 'v0.16.42') {
    const baselineRaw = await fs.readFile(path.join(root, baselinePath), 'utf8');
    const parsedBaseline = JSON.parse(baselineRaw);
    assertExact('v0.16.42 baseline summary', parsedBaseline.summary, {
      reviewedStableLosses: 46,
      acceptedWithoutInterception: 46,
      intercepted: 0,
      repaired: 0,
      rejectedForRegeneration: 0,
      responseTextMutations: 0,
      repairFieldMutations: 0,
      issues: {},
      repairCues: {},
      byDomain: {},
    });
    if (parsedBaseline.inputs?.corpus?.sha256 !== corpusSha256) {
      throw new Error('Semantic admission baseline used a different preference corpus.');
    }
    baseline = {
      path: baselinePath,
      bytes: Buffer.byteLength(baselineRaw),
      sha256: sha256(baselineRaw),
      release: parsedBaseline.release,
      acceptedWithoutInterception: parsedBaseline.summary.acceptedWithoutInterception,
    };
    assertExact('v0.16.44 semantic admission summary', summary, {
      ...EXPECTED_CURRENT,
      repairCues: {
        'explicit-affirmative-lead': 2,
        'explicit-option-text': 1,
        'first-sentence-lexical-margin': 3,
      },
      byDomain: {
        'computer-science': 3,
        geology: 1,
        'music-theory': 7,
        'user-experience-design': 1,
      },
    });
  }

  const report = {
    schemaVersion: 1,
    protocol: SCION_SEMANTIC_ADMISSION_PROTOCOL,
    release,
    generatedAt,
    benchmarkProtocol: 'honest-quality-benchmark-v1',
    evidenceClass: 'single-model-judge-same-identity-paired-order-replay',
    inputs: {
      corpus: {
        path: SCION_SEMANTIC_ADMISSION_CORPUS,
        bytes: Buffer.byteLength(corpusRaw),
        sha256: corpusSha256,
        rows: rows.length,
      },
      campaign: {
        path: SCION_SEMANTIC_ADMISSION_CAMPAIGN,
        bytes: Buffer.byteLength(campaignRaw),
        sha256: sha256(campaignRaw),
        packetId: campaign.packet?.packetId,
        completedOrders: campaign.completedOrders,
      },
      implementation: await Promise.all(IMPLEMENTATION_SOURCES.map((file) => fileReceipt(root, file))),
      baseline,
    },
    summary,
    intercepted,
    unresolvedStableLosses: rows.length - intercepted.length,
    productBehavior: {
      repairs:
        'Only the answer-index field changes when an exact affirmative cue or a unique first-sentence lexical margin supports another option.',
      rejections:
        'Cosmetic duplicate options and answer-only feedback are rejected at shared admission and enter the existing regeneration path.',
      modelNeutralBenefit:
        'The shared admission rejections apply to Scion and paid-model outputs; the local Scion parser additionally records conservative answer-key repairs.',
    },
    claimBoundary:
      'This replay measures interception of defects already identified in stable paired-order judgments from one Codex model. It is not human, independent, classroom, adapter, paid-reference-parity, or broad factual-correctness evidence. Thirty-four stable losses remain unresolved.',
  };
  report.identity = {
    algorithm: 'sha256-canonical-scion-semantic-admission-replay-v1',
    sha256: sha256(canonical(report)),
  };
  return report;
}

async function writeReport(options, output) {
  const report = await buildScionSemanticAdmissionReport(options);
  await fs.mkdir(path.dirname(path.resolve(output)), { recursive: true });
  await fs.writeFile(output, canonical(report));
  return report;
}

async function verifyTracked(options, output) {
  const expectedRaw = await fs.readFile(output, 'utf8');
  const expected = JSON.parse(expectedRaw);
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'scion-semantic-admission-'));
  try {
    const generated = path.join(temporary, 'report.json');
    const report = await writeReport(
      { ...options, generatedAt: expected.generatedAt, release: expected.release },
      generated,
    );
    const generatedRaw = await fs.readFile(generated, 'utf8');
    if (generatedRaw !== expectedRaw) throw new Error('Tracked semantic admission replay is stale.');
    return report;
  } finally {
    await fs.rm(temporary, { recursive: true, force: true });
  }
}

function parseArgs(argv) {
  const args = {
    mode: 'verify',
    implementationRoot: process.cwd(),
    release: SCION_SEMANTIC_ADMISSION_RELEASE,
    generatedAt: '',
    output: SCION_SEMANTIC_ADMISSION_RECEIPT,
    baselinePath: SCION_SEMANTIC_ADMISSION_BASELINE,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--write') args.mode = 'write';
    else if (arg === '--verify') args.mode = 'verify';
    else if (arg === '--implementation-root') args.implementationRoot = argv[++index] || args.implementationRoot;
    else if (arg === '--release') args.release = argv[++index] || args.release;
    else if (arg === '--generated-at') args.generatedAt = argv[++index] || args.generatedAt;
    else if (arg === '--output') args.output = argv[++index] || args.output;
    else if (arg === '--baseline') args.baselinePath = argv[++index] || args.baselinePath;
    else throw new Error(`Unknown semantic admission option: ${arg}`);
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const options = {
    implementationRoot: args.implementationRoot,
    release: args.release,
    generatedAt: args.generatedAt,
    baselinePath: args.baselinePath,
  };
  const report =
    args.mode === 'write' ? await writeReport(options, args.output) : await verifyTracked(options, args.output);
  console.log(
    `Scion semantic admission ${args.mode === 'write' ? 'built' : 'verified'}: ${report.summary.intercepted}/${report.summary.reviewedStableLosses} stable losses intercepted (${report.summary.repaired} repaired, ${report.summary.rejectedForRegeneration} rejected).`,
  );
  console.log(`Evidence: ${args.output}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((error) => {
    console.error(error?.stack || error);
    process.exitCode = 1;
  });
}
