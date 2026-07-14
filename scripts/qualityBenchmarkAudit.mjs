#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import {
  aggregateQualityReviews,
  calibrateModelJudge,
  validateQualityReview,
  validateRubric,
} from './lib/qualityBenchmark.mjs';

const ROOT = process.cwd();
const DEFAULT_MANIFEST = path.join(ROOT, 'evaluation', 'quality-benchmark', 'v1', 'manifest.json');
const DEFAULT_OUTPUT = path.join(ROOT, 'verification-output', 'quality-benchmark');
const SHA256 = /^[a-f0-9]{64}$/i;
const REQUIRED_INSTRUCTION_CONTEXTS = [
  'introductory',
  'advanced',
  'quantitative',
  'writing-intensive',
  'laboratory',
  'professional',
  'language',
  'discussion-centered',
];
const REQUIRED_SOURCE_CONDITIONS = ['sparse', 'messy', 'contradictory', 'high-quality'];

async function fileSha256(filePath) {
  const bytes = await fs.readFile(filePath);
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

async function loadJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

function normalizedSourceDigest(sourceCase) {
  const content = (sourceCase?.sourcePacket || [])
    .map((row) =>
      String(row.content || '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .sort()
    .join('\n');
  return crypto.createHash('sha256').update(content).digest('hex');
}

function requiredCaseFields(sourceCase) {
  const issues = [];
  for (const field of ['id', 'split', 'title', 'disciplineFamily', 'modality', 'level', 'learners', 'coursePurpose']) {
    if (typeof sourceCase?.[field] !== 'string' || sourceCase[field].trim().length < 3) issues.push(`missing ${field}`);
  }
  if (!Number.isInteger(sourceCase?.lessonCount) || sourceCase.lessonCount < 1)
    issues.push('lessonCount must be positive');
  for (const field of [
    'outcomes',
    'assessmentArchitecture',
    'sourcePacket',
    'requiredDeliverables',
    'localConstraints',
    'adversarialConditions',
  ]) {
    if (!Array.isArray(sourceCase?.[field]) || sourceCase[field].length === 0)
      issues.push(`${field} must be non-empty`);
  }
  if (!sourceCase?.rights?.basis || sourceCase.rights.thirdPartyContent !== false) {
    issues.push('rights must state a permission basis and explicitly identify the absence of third-party content');
  }
  if (sourceCase?.requiredDeliverables?.includes('custom-declared')) {
    const declarations = sourceCase.customDeliverableDeclarations || [];
    if (!declarations.length) issues.push('custom-declared requires a customDeliverableDeclarations contract');
    for (const declaration of declarations) {
      for (const field of ['id', 'name', 'purpose', 'construct', 'successEvidence', 'accessibilityAndSafety']) {
        if (typeof declaration?.[field] !== 'string' || declaration[field].trim().length < 8) {
          issues.push(`custom deliverable declaration requires concrete ${field}`);
        }
      }
      for (const field of ['users', 'requiredFields', 'failureConditions', 'localDependencies']) {
        if (!Array.isArray(declaration?.[field]) || declaration[field].length === 0) {
          issues.push(`custom deliverable declaration requires non-empty ${field}`);
        }
      }
    }
  }
  if (sourceCase?.sourceConditions !== undefined) {
    if (!Array.isArray(sourceCase.sourceConditions) || sourceCase.sourceConditions.length === 0) {
      issues.push('sourceConditions must be a non-empty array when declared');
    } else {
      for (const condition of sourceCase.sourceConditions) {
        if (!REQUIRED_SOURCE_CONDITIONS.includes(condition)) issues.push(`unknown source condition ${condition}`);
      }
    }
  }
  return issues;
}

async function loadReviews(caseRecord) {
  const reviews = [];
  const issues = [];
  for (const reviewPath of caseRecord.reviewFiles || []) {
    const absolute = path.resolve(ROOT, reviewPath);
    try {
      const parsed = await loadJson(absolute);
      reviews.push(...(Array.isArray(parsed) ? parsed : [parsed]));
    } catch (error) {
      issues.push(`${reviewPath}: ${error.message}`);
    }
  }
  return { reviews, issues };
}

function renderMarkdown(report) {
  const caseRows = report.cases.map(
    (row) =>
      `| ${row.id} | ${row.split} | ${row.disciplineFamily || '—'} | ${row.modality || '—'} | ${row.lessonCount || '—'} | ${row.hashMatches ? 'yes' : 'no'} | ${row.reviewCount} | ${row.validationTier} | ${row.reportedScore ?? '—'} | ${row.issues.length ? row.issues.join('; ') : '—'} |`,
  );
  return [
    '# CourseMapper Quality Benchmark v1',
    '',
    `Generated: ${report.generatedAt}`,
    `Mode: ${report.mode}`,
    `Protocol status: **${report.summary.protocolStatus}**`,
    `Validation status: **${report.summary.validationStatus}**`,
    '',
    `Corpus: ${report.summary.validCorpusCases}/${report.summary.corpusCases} hash- and schema-valid cases`,
    `Splits: dev ${report.summary.splits.dev || 0}, calibration ${report.summary.splits.calibration || 0}, heldout ${report.summary.splits.heldout || 0}`,
    `Specialized deliverable rubrics: ${report.summary.deliverableRubrics}`,
    `Qualified independently validated held-out cases: ${report.summary.validatedHeldoutCases}`,
    '',
    `> ${report.claimBoundary}`,
    '',
    'Held-out note: these cases are public-governed, not secret. Explicit unlock controls process discipline but does not remove pretraining or repository-exposure risk.',
    '',
    '| Case | Split | Discipline | Modality | Lessons | Hash | Reviews | Tier | Score | Issues |',
    '| --- | --- | --- | --- | ---: | --- | ---: | --- | ---: | --- |',
    ...caseRows,
    '',
    '## Reliability and evidence rules',
    '',
    '- Scores preserve the nine-dimension profile, evidence coverage, caps, and critical failures.',
    '- Automated and model-judge evidence is provisional and cannot satisfy independent validation.',
    '- Qualified validation requires two independent domain-matched instructors and acceptable ordinal agreement.',
    '- A reported 100 additionally requires a held-out case, verified sources and exports, full applicable anchors, and no findings.',
    '',
    ...(report.summary.issues.length
      ? ['## Protocol issues', '', ...report.summary.issues.map((issue) => `- ${issue}`), '']
      : []),
  ].join('\n');
}

export async function runQualityBenchmarkAudit({
  manifestPath = DEFAULT_MANIFEST,
  outputDir = DEFAULT_OUTPUT,
  mode = 'structure',
  unlockHeldout = false,
  bootstrapSamples = 1000,
} = {}) {
  const manifest = await loadJson(path.resolve(manifestPath));
  const rubricPath = path.resolve(ROOT, manifest.rubricPath);
  const rubric = await loadJson(rubricPath);
  const observedRubricSha256 = await fileSha256(rubricPath);
  const rubricValidation = validateRubric(rubric);
  const issues = [...rubricValidation.issues.map((issue) => `rubric: ${issue}`)];
  const heldoutAccess = {
    gitCommit: process.env.QUALITY_BENCHMARK_GIT_COMMIT || '',
    dirtyTree: process.env.QUALITY_BENCHMARK_DIRTY_TREE || '',
    contaminationDeclaration: process.env.QUALITY_BENCHMARK_CONTAMINATION_DECLARATION || '',
  };
  if (unlockHeldout) {
    if (!/^[a-f0-9]{7,40}$/i.test(heldoutAccess.gitCommit))
      issues.push('held-out unlock requires QUALITY_BENCHMARK_GIT_COMMIT');
    if (!['true', 'false'].includes(heldoutAccess.dirtyTree))
      issues.push('held-out unlock requires QUALITY_BENCHMARK_DIRTY_TREE=true|false');
    if (!heldoutAccess.contaminationDeclaration.trim() || heldoutAccess.contaminationDeclaration === 'NOT_PROVIDED')
      issues.push('held-out unlock requires QUALITY_BENCHMARK_CONTAMINATION_DECLARATION');
  }
  if (manifest.rubricVersion !== rubric.rubricVersion)
    issues.push('manifest rubricVersion does not match rubric content');
  if (!SHA256.test(String(manifest.rubricSha256 || '')) || manifest.rubricSha256 !== observedRubricSha256) {
    issues.push('rubric content hash does not match the benchmark manifest');
  }
  for (const schema of manifest.schemas || []) {
    const absoluteSchemaPath = path.resolve(ROOT, schema.path || '');
    try {
      await loadJson(absoluteSchemaPath);
      const observedSchemaSha256 = await fileSha256(absoluteSchemaPath);
      if (!SHA256.test(String(schema.sha256 || '')) || schema.sha256 !== observedSchemaSha256) {
        issues.push(`${schema.kind || schema.path} schema hash does not match the benchmark manifest`);
      }
    } catch (error) {
      issues.push(`${schema.kind || schema.path} schema cannot be loaded: ${error.message}`);
    }
  }
  if ((manifest.schemas || []).length < 2) issues.push('benchmark must bind review and comparison schemas');
  const singleModelJudgePolicy = manifest.singleModelJudgePolicy || {};
  for (const [label, filePath, expectedSha256] of [
    ['single-model-judge template', singleModelJudgePolicy.templatePath, singleModelJudgePolicy.templateSha256],
    ['single-model-judge prompt', singleModelJudgePolicy.promptPath, singleModelJudgePolicy.promptSha256],
  ]) {
    try {
      const observedSha256 = await fileSha256(path.resolve(ROOT, filePath || ''));
      if (!SHA256.test(String(expectedSha256 || '')) || observedSha256 !== expectedSha256) {
        issues.push(`${label} hash does not match the benchmark manifest`);
      }
    } catch (error) {
      issues.push(`${label} cannot be loaded: ${error.message}`);
    }
  }
  if (
    !String(singleModelJudgePolicy.claimBoundary || '').includes('never becomes human') ||
    !String(singleModelJudgePolicy.claimBoundary || '').includes('multi-judge evidence')
  ) {
    issues.push('single-model-judge policy must preserve the non-human and non-multi-judge claim boundary');
  }
  const deliverableIds = new Set((rubric.deliverableRubrics || []).map((row) => row.id));
  const caseIds = new Set();
  const sourceDigests = new Map();
  const coveredDeliverables = new Set();
  const caseSourceConditions = new Map();
  const caseResults = [];
  const allReviews = [];

  for (const caseRecord of manifest.cases || []) {
    const caseIssues = [];
    if (caseIds.has(caseRecord.id)) caseIssues.push('duplicate case id');
    caseIds.add(caseRecord.id);
    if (!['dev', 'calibration', 'heldout'].includes(caseRecord.split)) caseIssues.push('invalid split');
    if (!SHA256.test(String(caseRecord.sha256 || ''))) caseIssues.push('manifest sha256 is invalid');
    if (!caseRecord.permissionBasis) caseIssues.push('manifest permission basis is missing');
    const absolute = path.resolve(ROOT, caseRecord.path || '');
    let sourceCase = null;
    let observedSha256 = '';
    try {
      observedSha256 = await fileSha256(absolute);
      sourceCase = await loadJson(absolute);
    } catch (error) {
      caseIssues.push(`cannot read source packet: ${error.message}`);
    }
    const hashMatches = observedSha256 === caseRecord.sha256;
    if (observedSha256 && !hashMatches) caseIssues.push('source packet hash does not match manifest');
    if (sourceCase) {
      if (sourceCase.id !== caseRecord.id) caseIssues.push('source id does not match manifest');
      if (sourceCase.split !== caseRecord.split) caseIssues.push('source split does not match manifest');
      caseIssues.push(...requiredCaseFields(sourceCase));
      caseSourceConditions.set(caseRecord.id, new Set(sourceCase.sourceConditions || []));
      for (const deliverableId of sourceCase.requiredDeliverables || []) {
        coveredDeliverables.add(deliverableId);
        if (!deliverableIds.has(deliverableId))
          caseIssues.push(`required deliverable ${deliverableId} has no specialized rubric`);
      }
      const digest = normalizedSourceDigest(sourceCase);
      const duplicate = sourceDigests.get(digest);
      if (duplicate) caseIssues.push(`source content duplicates ${duplicate}`);
      sourceDigests.set(digest, caseRecord.id);
    }
    if (caseRecord.split === 'heldout' && caseRecord.publicExposure !== 'public-governed') {
      caseIssues.push('held-out case must declare its public exposure or use an external sealed commitment');
    }
    const loaded = await loadReviews(caseRecord);
    allReviews.push(...loaded.reviews);
    caseIssues.push(...loaded.issues);
    const reviewValidationIssues = loaded.reviews.flatMap(
      (review) =>
        validateQualityReview(review, rubric, {
          benchmarkCase: { ...caseRecord, source: { sha256: caseRecord.sha256 } },
        }).issues,
    );
    const scorecard = loaded.reviews.length
      ? aggregateQualityReviews(loaded.reviews, rubric, {
          benchmarkCase: {
            ...caseRecord,
            source: { sha256: caseRecord.sha256, verified: hashMatches },
            exportVerified: caseRecord.exportVerified === true,
          },
          bootstrapSamples,
        })
      : null;
    caseResults.push({
      id: caseRecord.id,
      split: caseRecord.split,
      disciplineFamily: sourceCase?.disciplineFamily || '',
      modality: sourceCase?.modality || '',
      lessonCount: sourceCase?.lessonCount || null,
      path: caseRecord.path,
      sha256: caseRecord.sha256,
      observedSha256,
      hashMatches,
      heldoutExecutionUnlocked: caseRecord.split !== 'heldout' || unlockHeldout,
      reviewCount: loaded.reviews.length,
      validationTier: scorecard?.validation?.tier || 'unscored',
      reportedScore: scorecard?.scores?.reportedScore ?? null,
      scorecard,
      issues: [...new Set([...caseIssues, ...reviewValidationIssues])],
    });
  }

  const splits = caseResults.reduce((rows, row) => ({ ...rows, [row.split]: (rows[row.split] || 0) + 1 }), {});
  for (const deliverableId of deliverableIds) {
    if (deliverableId === 'package') continue;
    if (!coveredDeliverables.has(deliverableId))
      issues.push(`corpus does not exercise specialized deliverable rubric ${deliverableId}`);
  }
  const coverageMap = manifest.sampling?.coverageMap || {};
  for (const context of REQUIRED_INSTRUCTION_CONTEXTS) {
    const coveredCaseIds = coverageMap.instructionContexts?.[context];
    if (!Array.isArray(coveredCaseIds) || coveredCaseIds.length === 0) {
      issues.push(`corpus coverage map is missing instruction context ${context}`);
      continue;
    }
    for (const caseId of coveredCaseIds) {
      if (!caseIds.has(caseId)) issues.push(`instruction context ${context} references unknown case ${caseId}`);
    }
  }
  for (const condition of REQUIRED_SOURCE_CONDITIONS) {
    const coveredCaseIds = coverageMap.sourceConditions?.[condition];
    if (!Array.isArray(coveredCaseIds) || coveredCaseIds.length === 0) {
      issues.push(`corpus coverage map is missing source condition ${condition}`);
      continue;
    }
    for (const caseId of coveredCaseIds) {
      if (!caseIds.has(caseId)) issues.push(`source condition ${condition} references unknown case ${caseId}`);
      else if (!caseSourceConditions.get(caseId)?.has(condition)) {
        issues.push(`source condition ${condition} is not declared by case ${caseId}`);
      }
    }
  }
  const validCases = caseResults.filter((row) => row.hashMatches && row.issues.length === 0);
  const validatedHeldout = caseResults.filter(
    (row) => row.split === 'heldout' && row.validationTier === 'independently-validated',
  );
  const corpusReady =
    rubricValidation.valid &&
    validCases.length === caseResults.length &&
    splits.dev >= 4 &&
    splits.calibration >= 4 &&
    splits.heldout >= 4;
  if (new Set(caseResults.map((row) => row.disciplineFamily)).size < 8)
    issues.push('corpus must cover at least eight discipline families');
  if (new Set(caseResults.map((row) => row.modality)).size < 6)
    issues.push('corpus must cover at least six modalities');
  const validationReady = unlockHeldout && validatedHeldout.length >= manifest.splitPolicy.minimumValidatedHeldoutCases;
  const protocolStatus = corpusReady && issues.length === 0 ? 'pass' : 'fail';
  const validationStatus = !unlockHeldout
    ? 'heldout-locked'
    : validationReady
      ? 'independently-validated-for-heldout-scope'
      : 'unverified-awaiting-qualified-heldout-reviews';
  const modelJudgeCalibration = calibrateModelJudge(allReviews, rubric, { bootstrapSamples });
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    mode,
    manifestPath: path.relative(ROOT, path.resolve(manifestPath)),
    claimBoundary: manifest.claimBoundary,
    summary: {
      status: mode === 'validation' ? (protocolStatus === 'pass' && validationReady ? 'pass' : 'fail') : protocolStatus,
      protocolStatus,
      validationStatus,
      corpusCases: caseResults.length,
      validCorpusCases: validCases.length,
      splits,
      disciplineFamilies: new Set(caseResults.map((row) => row.disciplineFamily)).size,
      modalities: new Set(caseResults.map((row) => row.modality)).size,
      deliverableRubrics: rubricValidation.deliverableCount,
      rubricCriteria: rubricValidation.criterionCount,
      validatedHeldoutCases: validatedHeldout.length,
      heldoutUnlocked: unlockHeldout,
      modelJudgeCalibrationStatus: modelJudgeCalibration.status,
      issues,
    },
    rubric: { ...rubricValidation, expectedSha256: manifest.rubricSha256, observedSha256: observedRubricSha256 },
    modelJudgeCalibration,
    cases: caseResults,
  };
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(path.join(outputDir, 'latest.json'), `${JSON.stringify(report, null, 2)}\n`);
  await fs.writeFile(path.join(outputDir, 'latest.md'), `${renderMarkdown(report)}\n`);
  if (unlockHeldout && !issues.some((issue) => issue.startsWith('held-out unlock requires'))) {
    const accessRecord = {
      schemaVersion: 1,
      benchmarkVersion: manifest.benchmarkVersion,
      accessedAt: report.generatedAt,
      access: 'heldout-unlocked',
      operator: process.env.USER || 'unknown',
      gitCommit: heldoutAccess.gitCommit,
      dirtyTree: heldoutAccess.dirtyTree === 'true',
      contaminationDeclaration: heldoutAccess.contaminationDeclaration,
      warning: manifest.leakageControls.knownLimitation,
    };
    await fs.appendFile(path.join(outputDir, 'heldout-access.jsonl'), `${JSON.stringify(accessRecord)}\n`);
  }
  return report;
}

function parseArgs(argv) {
  const args = { mode: 'structure', manifestPath: DEFAULT_MANIFEST, outputDir: DEFAULT_OUTPUT, unlockHeldout: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--manifest') args.manifestPath = path.resolve(argv[++index] || args.manifestPath);
    else if (arg === '--output') args.outputDir = path.resolve(argv[++index] || args.outputDir);
    else if (arg === '--mode') args.mode = argv[++index] || args.mode;
    else if (arg === '--unlock-heldout') args.unlockHeldout = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!['structure', 'validation'].includes(args.mode)) throw new Error('Expected --mode structure|validation');
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log('Usage: node scripts/qualityBenchmarkAudit.mjs [--mode structure|validation] [--unlock-heldout]');
    return;
  }
  const report = await runQualityBenchmarkAudit(args);
  console.log(`Quality benchmark protocol: ${report.summary.protocolStatus}`);
  console.log(`Quality benchmark validation: ${report.summary.validationStatus}`);
  console.log(`Corpus: ${report.summary.validCorpusCases}/${report.summary.corpusCases}`);
  console.log(`Report: ${path.join(args.outputDir, 'latest.md')}`);
  if (
    report.summary.protocolStatus !== 'pass' ||
    (args.mode === 'validation' && !report.summary.validationStatus.startsWith('independently-validated'))
  ) {
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
