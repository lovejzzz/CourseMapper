#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { compareQuizProjects, quizContrastDimensions } from '../src/lib/quality/quizContrast.js';

function parseArgs(argv) {
  const args = {
    candidate: '',
    reference: '',
    candidateLabel: 'candidate',
    referenceLabel: 'reference',
    output: path.join(process.cwd(), 'verification-output', 'quiz-contrast'),
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--candidate') args.candidate = argv[++index] || '';
    else if (arg === '--reference') args.reference = argv[++index] || '';
    else if (arg === '--candidate-label') args.candidateLabel = argv[++index] || args.candidateLabel;
    else if (arg === '--reference-label') args.referenceLabel = argv[++index] || args.referenceLabel;
    else if (arg === '--output') args.output = path.resolve(argv[++index] || args.output);
    else if (arg === '--help' || arg === '-h') args.help = true;
  }
  return args;
}

function percent(metric) {
  return `${metric.count}/${metric.total} (${metric.percent.toFixed(1)}%)`;
}

function renderMarkdown(report, args) {
  const rows = quizContrastDimensions.map(({ key, label }) => {
    const candidate = report.candidate.metrics[key];
    const reference = report.reference.metrics[key];
    const delta = (candidate.share - reference.share) * 100;
    return `| ${label} | ${percent(candidate)} | ${percent(reference)} | ${delta >= 0 ? '+' : ''}${delta.toFixed(1)} pp |`;
  });
  return [
    '# Quiz authoring contrast',
    '',
    `- Candidate: ${report.candidate.label} (${args.candidate})`,
    `- Reference: ${report.reference.label} (${args.reference})`,
    `- Generated: ${new Date().toISOString()}`,
    '',
    `> ${report.claimBoundary}`,
    '',
    '| Behavior | Candidate | Reference | Candidate delta |',
    '| --- | ---: | ---: | ---: |',
    ...rows,
    '',
    `- Average scenario length: ${report.candidate.metrics.averageScenarioWords.value} vs ${report.reference.metrics.averageScenarioWords.value} words`,
    '',
    '## Learn from the reference',
    '',
    ...(report.learning.learn.length > 0
      ? report.learning.learn.map((item) => `- **${item.label}** (${item.gapPoints} pp gap): ${item.recommendation}`)
      : ['- No measured reference advantage cleared the 10-point learning threshold.']),
    '',
    '## Preserve candidate advantages',
    '',
    ...(report.learning.preserve.length > 0
      ? report.learning.preserve.map((item) => `- **${item.label}** (${item.advantagePoints} pp candidate advantage).`)
      : ['- No measured candidate advantage cleared the 10-point threshold.']),
    '',
    '## Shared weaknesses',
    '',
    ...(report.learning.shared.length > 0
      ? report.learning.shared.map((item) => `- **${item.label}:** ${item.recommendation}`)
      : ['- None of the measured behaviors were below 50% in both outputs.']),
    '',
  ].join('\n');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(
      'Usage: node scripts/quizContrastAudit.mjs --candidate project.json --reference project.json [--candidate-label Scion] [--reference-label Luna]',
    );
    return;
  }
  if (!args.candidate || !args.reference)
    throw new Error('--candidate and --reference project.json paths are required');
  const [candidate, reference] = await Promise.all([
    fs.readFile(path.resolve(args.candidate), 'utf8').then(JSON.parse),
    fs.readFile(path.resolve(args.reference), 'utf8').then(JSON.parse),
  ]);
  const report = compareQuizProjects(candidate, reference, args);
  await fs.mkdir(args.output, { recursive: true });
  await Promise.all([
    fs.writeFile(path.join(args.output, 'latest.json'), `${JSON.stringify(report, null, 2)}\n`),
    fs.writeFile(path.join(args.output, 'latest.md'), `${renderMarkdown(report, args)}\n`),
  ]);
  console.log(`Quiz contrast: ${report.candidate.label} vs ${report.reference.label}`);
  console.log(`Reference advantages: ${report.learning.learn.length}`);
  console.log(`Candidate advantages: ${report.learning.preserve.length}`);
  console.log(`Shared weaknesses: ${report.learning.shared.length}`);
  console.log(`Report: ${path.join(args.output, 'latest.md')}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
