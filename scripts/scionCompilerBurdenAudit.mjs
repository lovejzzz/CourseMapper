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

export async function runScionCompilerBurdenAudit({ candidateDir, controlDir, outputDir = DEFAULT_OUTPUT }) {
  if (!candidateDir || !controlDir) throw new Error('Both candidateDir and controlDir are required.');
  const [candidate, control] = await Promise.all([
    loadCourseBurden(path.resolve(candidateDir)),
    loadCourseBurden(path.resolve(controlDir)),
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
    '| Route | Source weights | Lessons | Scion calls | Calls / lesson | Rejected actions | Regenerated actions |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: |',
    ...[
      ['Candidate', candidate],
      ['Control', control],
    ].map(
      ([label, row]) =>
        `| ${label} | ${row.sourceModelId || row.modelId || 'unknown'} | ${row.lessonCount} | ${row.scion.calls} | ${row.scion.callsPerLesson ?? '—'} | ${row.scion.byAction.rejected || 0} | ${row.scion.byAction.regenerated || 0} |`,
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
  const args = { candidateDir: '', controlDir: '', outputDir: DEFAULT_OUTPUT };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--candidate') args.candidateDir = argv[++index] || '';
    else if (argv[index] === '--control') args.controlDir = argv[++index] || '';
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
