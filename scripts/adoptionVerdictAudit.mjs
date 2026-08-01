#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import JSZip from 'jszip';

import { buildAdoptionVerdict } from './professor-adoption/adoptionVerdict.mjs';

const ROOT = process.cwd();
const DEFAULT_OUTPUT_DIR = path.join(ROOT, 'verification-output', 'adoption-verdict');
const DEFAULT_PROFESSOR_REPORT = path.join(ROOT, 'verification-output', 'professor-adoption', 'latest.json');

function parseArgs(argv) {
  const args = {
    zipPath: '',
    logPath: '',
    professorReportPath: DEFAULT_PROFESSOR_REPORT,
    outputDir: DEFAULT_OUTPUT_DIR,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--zip') args.zipPath = path.resolve(argv[++index] || '');
    else if (arg === '--log') args.logPath = path.resolve(argv[++index] || '');
    else if (arg === '--professor-report') args.professorReportPath = path.resolve(argv[++index] || '');
    else if (arg === '--output') args.outputDir = path.resolve(argv[++index] || args.outputDir);
    else if (arg === '--help' || arg === '-h') args.help = true;
  }
  return args;
}

async function readTextIfPresent(filePath) {
  if (!filePath) return '';
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch {
    return '';
  }
}

async function readJsonIfPresent(filePath) {
  const text = await readTextIfPresent(filePath);
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function findPackageFile(zip, predicate) {
  return Object.keys(zip.files)
    .filter((name) => !zip.files[name].dir)
    .find(predicate);
}

export async function extractPackageEvidence(zipPath) {
  if (!zipPath) throw new Error('Missing --zip path.');
  const zip = await JSZip.loadAsync(await fs.readFile(zipPath));
  const manifestName = findPackageFile(zip, (name) => /(^|\/)PACKAGE_MANIFEST\.json$/i.test(name));
  if (!manifestName) throw new Error('PACKAGE_MANIFEST.json not found in package ZIP.');
  const qualityName = findPackageFile(zip, (name) => /(^|\/)QUALITY_REPORT\.md$/i.test(name));
  const scoreLedgerName = findPackageFile(zip, (name) => /(^|\/)SCORE_LEDGER\.json$/i.test(name));
  const packageManifest = JSON.parse(await zip.file(manifestName).async('string'));
  const qualityReport = qualityName ? await zip.file(qualityName).async('string') : '';
  const scoreLedger = scoreLedgerName ? JSON.parse(await zip.file(scoreLedgerName).async('string')) : null;
  return {
    zipPath,
    manifestName,
    qualityName: qualityName || null,
    scoreLedgerName: scoreLedgerName || null,
    packageManifest,
    qualityReport,
    scoreLedger,
  };
}

function sourceCoverageFromProfessorReport(report = null) {
  const summary = report?.summary || null;
  if (!summary) return null;
  return {
    status: summary.status,
    caseCount: Number(summary.caseCount || 0),
    source: 'public-source professor-adoption benchmark',
    substituteForGenome: Number(summary.caseCount || 0) >= 30,
    evidence: `${summary.caseCount || 0} public-source professor-adoption case(s), status=${summary.status || 'unknown'}, minimumScore=${
      summary.minimumScore ?? 'unknown'
    }`,
  };
}

function renderMarkdown(payload = {}) {
  const verdict = payload.verdict || {};
  const dimensions = verdict.dimensions || {};
  const rows = [
    ['Tier', verdict.tierLabel || verdict.tier || 'unknown'],
    ['Status', verdict.status || 'unknown'],
    ['Confidence', verdict.confidence || 'unknown'],
    ['Package', payload.package?.zipPath || 'unknown'],
    [
      'Quality',
      `status=${dimensions.packageQuality?.status || 'unknown'}, score=${dimensions.packageQuality?.score ?? 'n/a'}`,
    ],
    [
      'Knowledge',
      `status=${dimensions.knowledgeCoverage?.status || 'unknown'}, genomeLinked=${
        dimensions.knowledgeCoverage?.genome?.linked ?? 'n/a'
      }`,
    ],
    ['Source coverage', dimensions.sourceStandardCoverage?.evidence || 'not attached'],
    [
      'Professor adoption',
      `status=${dimensions.professorAdoption?.status || 'unknown'}, cases=${dimensions.professorAdoption?.caseCount || 0}`,
    ],
  ];
  const caps = verdict.caps || [];
  const blockers = verdict.blockingReasons || [];
  return [
    '# Adoption Verdict Audit',
    '',
    `Generated: ${payload.meta?.generatedAt || 'unknown'}`,
    '',
    '| Field | Value |',
    '| --- | --- |',
    ...rows.map(([label, value]) => `| ${String(label).replace(/\|/g, '/')} | ${String(value).replace(/\|/g, '/')} |`),
    '',
    '## Minimum-Gate Policy',
    '',
    verdict.minimumGatePolicy?.note || 'Caps and blockers determine the maximum tier.',
    '',
    '## Caps',
    '',
    ...(caps.length ? caps.map((cap) => `- ${cap.id} -> ${cap.tierCap}: ${cap.reason}`) : ['- None.']),
    '',
    '## Blocking Reasons',
    '',
    ...(blockers.length ? blockers.map((blocker) => `- ${blocker.id}: ${blocker.reason}`) : ['- None.']),
    '',
  ].join('\n');
}

export async function buildAdoptionVerdictAudit({
  zipPath,
  logPath = '',
  professorReportPath = DEFAULT_PROFESSOR_REPORT,
  outputDir = DEFAULT_OUTPUT_DIR,
} = {}) {
  const packageEvidence = await extractPackageEvidence(zipPath);
  const logText = await readTextIfPresent(logPath);
  const professorReport = await readJsonIfPresent(professorReportPath);
  const sourceCoverage = sourceCoverageFromProfessorReport(professorReport) || {};
  const verdict = buildAdoptionVerdict({
    packageManifest: packageEvidence.packageManifest,
    assessmentRegistry: packageEvidence.packageManifest.assessments,
    qualityReport: packageEvidence.qualityReport,
    scoreLedger: packageEvidence.scoreLedger,
    logText,
    professorAdoptionSummary: professorReport?.summary || null,
    professorAdoptionResults: professorReport?.results || [],
    sourceCoverage,
  });
  const payload = {
    meta: {
      generatedAt: new Date().toISOString(),
      professorReportPath: professorReport ? professorReportPath : null,
      logPath: logText ? logPath : null,
    },
    package: {
      zipPath: packageEvidence.zipPath,
      manifestName: packageEvidence.manifestName,
      qualityName: packageEvidence.qualityName,
      scoreLedgerName: packageEvidence.scoreLedgerName,
      courseName: packageEvidence.packageManifest.courseName || '',
    },
    verdict,
  };
  await fs.mkdir(outputDir, { recursive: true });
  const jsonPath = path.join(outputDir, 'latest.json');
  const markdownPath = path.join(outputDir, 'latest.md');
  await fs.writeFile(jsonPath, `${JSON.stringify(payload, null, 2)}\n`);
  await fs.writeFile(markdownPath, `${renderMarkdown(payload)}\n`);
  return { payload, jsonPath, markdownPath };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.zipPath) {
    console.log(
      'Usage: node scripts/adoptionVerdictAudit.mjs --zip /path/course.zip [--log /path/browser.log] [--professor-report verification-output/professor-adoption/latest.json] [--output DIR]',
    );
    return;
  }
  const { payload, jsonPath, markdownPath } = await buildAdoptionVerdictAudit(args);
  console.log(`Adoption verdict: ${payload.verdict.tierLabel} (${payload.verdict.status})`);
  console.log(`Confidence: ${payload.verdict.confidence}`);
  console.log(`Report: ${markdownPath}`);
  console.log(`JSON: ${jsonPath}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
