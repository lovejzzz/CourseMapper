#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import {
  compareScionCompilerBurden,
  parseScionConsoleEvents,
  summarizeScionCompilerBurden,
} from './lib/scionCompilerBurden.mjs';

const DEFAULT_OUTPUT = 'verification-output/scion-compiler-burden';

async function loadCourseBurden(courseDir) {
  const [course, consoleText] = await Promise.all([
    fs.readFile(path.join(courseDir, 'course.json'), 'utf8').then(JSON.parse),
    fs.readFile(path.join(courseDir, 'console.log'), 'utf8'),
  ]);
  return {
    courseDir: path.relative(process.cwd(), courseDir),
    modelId: course.modelId,
    sourceModelId: course?.localModel?.sourceModelId || '',
    ...summarizeScionCompilerBurden(parseScionConsoleEvents(consoleText), {
      lessonCount: Number(course.lessonCount) || 0,
    }),
  };
}

export function compilerBurdenFromEvidence(evidence, { domain = '' } = {}) {
  const courses = Array.isArray(evidence?.fullCourses) ? evidence.fullCourses : [];
  const course = domain ? courses.find((entry) => entry.domain === domain || entry.courseId === domain) : courses[0];
  if (!course) {
    throw new Error(
      domain ? `No full-course evidence matches domain "${domain}".` : 'The evidence file contains no full course.',
    );
  }
  if (!course.compilerBurden)
    throw new Error(`Full-course evidence for ${course.domain || course.courseId} has no burden data.`);
  return {
    courseDir: course.sourceArtifact || '',
    modelId: evidence.candidateId || '',
    sourceModelId: evidence.servingModelId || '',
    ...course.compilerBurden,
  };
}

async function loadBurdenSource(source, { domain = '' } = {}) {
  const resolved = path.resolve(source);
  const stat = await fs.stat(resolved);
  if (stat.isDirectory()) return loadCourseBurden(resolved);
  const evidence = JSON.parse(await fs.readFile(resolved, 'utf8'));
  return compilerBurdenFromEvidence(evidence, { domain });
}

export async function runScionCompilerBurdenAudit({
  candidateDir,
  controlDir,
  domain = '',
  outputDir = DEFAULT_OUTPUT,
}) {
  if (!candidateDir || !controlDir) throw new Error('Both candidateDir and controlDir are required.');
  const [candidate, control] = await Promise.all([
    loadBurdenSource(candidateDir, { domain }),
    loadBurdenSource(controlDir, { domain }),
  ]);
  const comparison = compareScionCompilerBurden(candidate, control);
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    status: comparison.findings.some((finding) => finding.severity === 'P1') ? 'compiler-debt-found' : 'clean',
    candidate,
    control,
    comparison,
  };
  const markdown = [
    '# Scion compiler burden audit',
    '',
    `Status: ${report.status}`,
    '',
    '| Route | Source weights | Lessons | Scion calls | Calls / lesson | Rejected actions | Regenerated actions | MC repair yield |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |',
    ...[
      ['Candidate', candidate],
      ['Control', control],
    ].map(
      ([label, row]) =>
        `| ${label} | ${row.sourceModelId || row.modelId || 'unknown'} | ${row.lessonCount} | ${row.scion.calls} | ${row.scion.callsPerLesson ?? '—'} | ${row.scion.byAction.rejected || 0} | ${row.scion.byAction.regenerated || 0} | ${row.scion.mcRepairEfficiency?.yield == null ? '—' : `${(row.scion.mcRepairEfficiency.yield * 100).toFixed(1)}%`} |`,
    ),
    '',
    `- Candidate call amplification: ${comparison.callAmplification?.toFixed(2) || 'n/a'}x`,
    `- Candidate call delta: ${comparison.candidateCallDelta >= 0 ? '+' : ''}${comparison.candidateCallDelta}`,
    `- Candidate rejected-action delta: ${comparison.rejectedActionDelta >= 0 ? '+' : ''}${comparison.rejectedActionDelta}`,
    '',
    '## Findings',
    '',
    ...(comparison.findings.length
      ? comparison.findings.map((finding) => `- **${finding.severity} ${finding.code}:** ${finding.detail}`)
      : ['- none']),
    '',
    '## Rejection reasons',
    '',
    ...['candidate', 'control'].flatMap((side) => {
      const row = report[side];
      const reasons = Object.entries(row.scion.rejectionReasons).sort((left, right) => right[1] - left[1]);
      return [
        `### ${side === 'candidate' ? 'Candidate' : 'Control'}`,
        '',
        ...(reasons.length ? reasons.map(([reason, count]) => `- ${reason}: ${count}`) : ['- none']),
        '',
      ];
    }),
  ].join('\n');
  await fs.mkdir(outputDir, { recursive: true });
  await Promise.all([
    fs.writeFile(path.join(outputDir, 'latest.json'), `${JSON.stringify(report, null, 2)}\n`),
    fs.writeFile(path.join(outputDir, 'latest.md'), `${markdown}\n`),
  ]);
  return report;
}

function parseArgs(argv) {
  const args = { candidateDir: '', controlDir: '', domain: '', outputDir: DEFAULT_OUTPUT };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--candidate') args.candidateDir = argv[++index] || '';
    else if (argv[index] === '--control') args.controlDir = argv[++index] || '';
    else if (argv[index] === '--domain') args.domain = argv[++index] || '';
    else if (argv[index] === '--output') args.outputDir = argv[++index] || args.outputDir;
  }
  return args;
}

async function main() {
  const report = await runScionCompilerBurdenAudit(parseArgs(process.argv.slice(2)));
  console.log(`Scion compiler burden: ${report.status}`);
  console.log(
    `Candidate ${report.candidate.scion.calls} calls vs control ${report.control.scion.calls} (${report.comparison.callAmplification?.toFixed(2) || 'n/a'}x)`,
  );
  console.log(`Report: ${path.join(parseArgs(process.argv.slice(2)).outputDir, 'latest.md')}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
