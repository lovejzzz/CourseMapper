#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

export const SCION_SEMANTIC_ADMISSION_PROTOCOL = 'scion-semantic-admission-replay-v1';
export const SCION_SEMANTIC_ADMISSION_RELEASE = 'v0.16.47';
export const SCION_SEMANTIC_ADMISSION_CORPUS =
  'evaluation/scion-adapters/evidence/codex-approved-preferences-v0.16.42.jsonl';
export const SCION_SEMANTIC_ADMISSION_CAMPAIGN = 'evaluation/scion-adapters/evidence/judge-campaign-v0.16.42.json';
export const SCION_SEMANTIC_ADMISSION_BASELINE =
  'evaluation/scion-adapters/evidence/semantic-admission-baseline-v0.16.42.json';
export const SCION_SEMANTIC_ADMISSION_RECEIPT =
  'evaluation/scion-adapters/evidence/semantic-admission-replay-v0.16.47.json';
export const SCION_SEMANTIC_ADMISSION_PREVIOUS_RECEIPT =
  'evaluation/scion-adapters/evidence/semantic-admission-replay-v0.16.46.json';
export const SCION_SEMANTIC_ADMISSION_SOURCE_WORKBOOK_RECEIPT =
  'evaluation/scion-adapters/evidence/fresh-a-b-workbook-v0.16.41.json';
export const SCION_SEMANTIC_ADMISSION_SOURCE_WORKBOOK_DIR =
  'evaluation/scion-adapters/handoffs/fresh-a-b-workbook-v0.16.41';

const IMPLEMENTATION_SOURCES = [
  'src/lib/scionAnswerKeyAlignment.js',
  'src/lib/scionKeyTermContract.js',
  'src/lib/scionPreferenceGate.js',
  'src/lib/blueprintEnrichmentPass.js',
  'scripts/lib/scionSourceCapture.mjs',
];

const EXPECTED_CURRENT = {
  reviewedStableLosses: 46,
  acceptedWithoutInterception: 26,
  intercepted: 20,
  repaired: 5,
  rejectedForRegeneration: 15,
  responseTextMutations: 0,
  repairFieldMutations: 5,
  issues: {
    'claim-marker-residue': 4,
    'duplicate-options': 2,
    'explanation-key-conflict': 3,
    'explanation-repeats-answer': 4,
    'misconception-repeats-known-fact': 3,
  },
};

const EXPECTED_PREVIOUS = {
  reviewedStableLosses: 46,
  acceptedWithoutInterception: 26,
  intercepted: 20,
  repaired: 8,
  rejectedForRegeneration: 12,
  responseTextMutations: 0,
  repairFieldMutations: 8,
  issues: {
    'claim-marker-residue': 4,
    'duplicate-options': 2,
    'explanation-repeats-answer': 4,
    'misconception-repeats-known-fact': 3,
  },
  repairCues: {
    'explicit-affirmative-lead': 2,
    'explicit-option-text': 1,
    'first-sentence-lexical-margin': 3,
    'source-question-option-alignment': 2,
  },
  byDomain: {
    'computer-science': 3,
    geology: 3,
    'music-theory': 10,
    'user-experience-design': 4,
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

async function loadSourceContexts(root) {
  const receiptPath = path.join(root, SCION_SEMANTIC_ADMISSION_SOURCE_WORKBOOK_RECEIPT);
  const receiptRaw = await fs.readFile(receiptPath, 'utf8');
  const receipt = JSON.parse(receiptRaw);
  const sourceContexts = new Map();
  const files = [];
  for (const chunk of receipt.chunks || []) {
    const relativePath = path.join(SCION_SEMANTIC_ADMISSION_SOURCE_WORKBOOK_DIR, chunk.templateFile);
    const raw = await fs.readFile(path.join(root, relativePath), 'utf8');
    const expected = receipt.files?.[chunk.templateFile];
    if (!expected || expected.bytes !== Buffer.byteLength(raw) || expected.sha256 !== sha256(raw)) {
      throw new Error(`Semantic admission source workbook drifted: ${chunk.templateFile}.`);
    }
    const batch = JSON.parse(raw);
    for (const review of batch.reviews || []) {
      const sourceContextSha256 = sha256(JSON.stringify(review.sourceContext || null));
      if (review.sourceContextSha256 !== sourceContextSha256) {
        throw new Error(`Semantic admission source context hash drifted: ${review.pairId}.`);
      }
      const prior = sourceContexts.get(review.pairId);
      if (prior && JSON.stringify(prior) !== JSON.stringify(review.sourceContext)) {
        throw new Error(`Semantic admission source context is not unique: ${review.pairId}.`);
      }
      sourceContexts.set(review.pairId, review.sourceContext);
    }
    files.push({ path: relativePath, bytes: Buffer.byteLength(raw), sha256: sha256(raw) });
  }
  if (sourceContexts.size !== receipt.selectedCases) {
    throw new Error(
      `Semantic admission source workbook is incomplete: expected ${receipt.selectedCases}, received ${sourceContexts.size}.`,
    );
  }
  return {
    sourceContexts,
    receipt: {
      path: SCION_SEMANTIC_ADMISSION_SOURCE_WORKBOOK_RECEIPT,
      bytes: Buffer.byteLength(receiptRaw),
      sha256: sha256(receiptRaw),
      release: receipt.release,
      order: receipt.order,
      selectedCases: receipt.selectedCases,
    },
    files,
  };
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
  if (
    issues.includes('misconception-repeats-known-fact') &&
    !/(?:not a misconception|correct definition|source-supported description|defines? .* as|self-contradictory|conflat\w* .* ratio)/i.test(
      defects,
    )
  ) {
    throw new Error(`${row.reviewPairId} misconception rejection is not supported by the retained judge defects.`);
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
  const [corpusRaw, campaignRaw, sourceWorkbook] = await Promise.all([
    fs.readFile(path.join(root, SCION_SEMANTIC_ADMISSION_CORPUS), 'utf8'),
    fs.readFile(path.join(root, SCION_SEMANTIC_ADMISSION_CAMPAIGN), 'utf8'),
    loadSourceContexts(root),
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
    const sourceContext = sourceWorkbook.sourceContexts.get(row.reviewPairId);
    if (!sourceContext || sha256(JSON.stringify(sourceContext)) !== evidence.sourceContextSha256) {
      throw new Error(`${row.reviewPairId} source context no longer matches the paired-order evidence.`);
    }

    const rejected = JSON.parse(row.rejected);
    const repair =
      row.kind === 'mc-item'
        ? repairScionMcItem(rejected, { sourceClaims: sourceContext.claims || [] })
        : { item: rejected, repairs: [] };
    const admission =
      row.kind === 'mc-item'
        ? assessScionMcItem(repair.item, { sourceClaims: sourceContext.claims || [] })
        : assessScionKeyTerm(repair.item, { knownFacts: sourceContext.claims || [] });
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
        containment: entry.preferenceEvidence?.containment,
        relevantSourceClaimIndexes: entry.preferenceEvidence?.relevantSourceClaimIndexes,
        questionClaimScore: entry.preferenceEvidence?.questionClaimScore,
        minimumBestScore: entry.preferenceEvidence?.minimumBestScore,
        minimumQuestionClaimScore: entry.preferenceEvidence?.minimumQuestionClaimScore,
        minimumOptionScore: entry.preferenceEvidence?.minimumOptionScore,
        minimumOptionContainment: entry.preferenceEvidence?.minimumOptionContainment,
        maximumDeclaredOptionScore: entry.preferenceEvidence?.maximumDeclaredOptionScore,
        minimumMargin: entry.preferenceEvidence?.minimumMargin,
        evidenceSentence: entry.preferenceEvidence?.evidenceSentence,
      })),
      remainingIssues: issues,
      evidenceSupport: {
        retainedJudgeDefectAligned: issues.some((issue) => issue !== 'claim-marker-residue'),
        deterministicVisibleClaimResidue: issues.includes('claim-marker-residue'),
        judgeExplicitlyNamedClaimResidue:
          issues.includes('claim-marker-residue') &&
          /(?:claim\s*0|claim label|claim number|claim marker)/i.test(
            (row.preferenceEvidence?.decisionDefects || []).join(' '),
          ),
      },
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
    assertExact('v0.16.47 semantic admission summary', summary, {
      ...EXPECTED_CURRENT,
      repairCues: {
        'explicit-affirmative-lead': 2,
        'explicit-option-text': 1,
        'source-question-option-alignment': 2,
      },
      byDomain: {
        'computer-science': 3,
        geology: 3,
        'music-theory': 10,
        'user-experience-design': 4,
      },
    });
  }

  const previousRaw = await fs.readFile(path.join(root, SCION_SEMANTIC_ADMISSION_PREVIOUS_RECEIPT), 'utf8');
  const previous = JSON.parse(previousRaw);
  if (previous.release !== 'v0.16.46') throw new Error('Semantic admission previous-release identity drifted.');
  assertExact('v0.16.46 semantic admission summary', previous.summary, EXPECTED_PREVIOUS);
  if (previous.inputs?.corpus?.sha256 !== corpusSha256) {
    throw new Error('Semantic admission previous release used a different stable-loss corpus.');
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
      sourceWorkbook: {
        receipt: sourceWorkbook.receipt,
        files: sourceWorkbook.files,
        matchedPreferenceRows: rows.length,
      },
      implementation: await Promise.all(IMPLEMENTATION_SOURCES.map((file) => fileReceipt(root, file))),
      baseline,
      previousRelease: {
        path: SCION_SEMANTIC_ADMISSION_PREVIOUS_RECEIPT,
        bytes: Buffer.byteLength(previousRaw),
        sha256: sha256(previousRaw),
        release: previous.release,
        summary: previous.summary,
      },
    },
    summary,
    intercepted,
    unresolvedStableLosses: rows.length - intercepted.length,
    productBehavior: {
      repairs:
        'Only the answer-index field changes when an exact affirmative cue or a uniquely question-relevant supplied source claim supports another option. Lexical-only conflicts are rejected for regeneration.',
      rejections:
        'Cosmetic duplicate options, answer-only feedback, internal claim markers, and source facts mislabeled as misconceptions are rejected at shared admission and enter the existing regeneration path.',
      modelNeutralBenefit:
        'The shared admission rejections apply to Scion and paid-model outputs; the local Scion parser additionally records conservative answer-key repairs.',
    },
    claimBoundary:
      'This replay measures interception of defects in stable paired-order losses from one Codex model. Five answer keys are conservatively repaired from explicit or source-bound evidence; three lexical-only conflicts are rejected for regeneration after a live Astronomy package proved that overlap can point at a false distractor. Three misconception failures align with retained judge defects; four directly visible internal claim markers are deterministic process residue, and one was explicitly named by the judge. It is not human, independent, classroom, adapter, paid-reference-parity, or broad factual-correctness evidence. Twenty-six stable losses remain unresolved.',
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
