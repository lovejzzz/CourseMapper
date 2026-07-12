#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import {
  compareQuizProjects,
  quizContrastDimensions,
  surfaceContrastDimensions,
} from '../src/lib/quality/quizContrast.js';

function parseArgs(argv) {
  const args = {
    candidate: '',
    reference: '',
    candidateLabel: 'candidate',
    referenceLabel: 'reference',
    output: path.join(process.cwd(), 'verification-output', 'quiz-contrast'),
    strict: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--candidate') args.candidate = argv[++index] || '';
    else if (arg === '--reference') args.reference = argv[++index] || '';
    else if (arg === '--candidate-label') args.candidateLabel = argv[++index] || args.candidateLabel;
    else if (arg === '--reference-label') args.referenceLabel = argv[++index] || args.referenceLabel;
    else if (arg === '--output') args.output = path.resolve(argv[++index] || args.output);
    else if (arg === '--strict') args.strict = true;
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
  const surfaceRows = surfaceContrastDimensions.map(({ key, label }) => {
    const records = report.surfaceDifferenceLab.records.filter((record) => record.dimension === key);
    const candidateCount = records.reduce((sum, record) => sum + record.candidate.count, 0);
    const referenceCount = records.reduce((sum, record) => sum + record.reference.count, 0);
    const total = records.length;
    const candidatePercent = total > 0 ? (candidateCount / total) * 100 : 0;
    const referencePercent = total > 0 ? (referenceCount / total) * 100 : 0;
    return `| ${label} | ${candidateCount}/${total} (${candidatePercent.toFixed(1)}%) | ${referenceCount}/${total} (${referencePercent.toFixed(1)}%) | ${candidatePercent - referencePercent >= 0 ? '+' : ''}${(candidatePercent - referencePercent).toFixed(1)} pp |`;
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
    `- Derived scenario fallbacks: ${report.candidate.metrics.derivedScenarioFallbacks.count}/${report.candidate.metrics.derivedScenarioFallbacks.total} vs ${report.reference.metrics.derivedScenarioFallbacks.count}/${report.reference.metrics.derivedScenarioFallbacks.total}`,
    `- First candidate scenario failure: ${report.candidate.examples.weakScenarioIssues.join(', ') || 'none'}`,
    `- First reference scenario failure: ${report.reference.examples.weakScenarioIssues.join(', ') || 'none'}`,
    '',
    '## Candidate release bars',
    '',
    `**${report.releaseBars.status.toUpperCase()}**`,
    '',
    ...report.releaseBars.checks.map(
      (check) => `- ${check.passed ? 'PASS' : 'FAIL'} — ${check.label}: ${check.display}`,
    ),
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
    '## Lesson-level difference lab',
    '',
    `> ${report.differenceLab.trainingBoundary}`,
    '',
    `- Learn: ${report.differenceLab.outcomes.learn}`,
    `- Preserve: ${report.differenceLab.outcomes.preserve}`,
    `- Repair both: ${report.differenceLab.outcomes.repair}`,
    `- Parity: ${report.differenceLab.outcomes.parity}`,
    `- Uncertain: ${report.differenceLab.outcomes.uncertain}`,
    '',
    ...report.differenceLab.records
      .filter((record) => ['learn', 'preserve', 'repair'].includes(record.outcome))
      .slice(0, 30)
      .map(
        (record) =>
          `- **${record.outcome.toUpperCase()} · ${record.lessonId} · ${record.label}:** candidate ${(record.candidate.share * 100).toFixed(1)}%, reference ${(record.reference.share * 100).toFixed(1)}%. ${record.recommendation}`,
      ),
    '',
    '## Multi-surface authoring difference lab',
    '',
    `> ${report.surfaceDifferenceLab.trainingBoundary}`,
    '',
    '| Authored behavior | Candidate | Reference | Candidate delta |',
    '| --- | ---: | ---: | ---: |',
    ...surfaceRows,
    '',
    `- Learn: ${report.surfaceDifferenceLab.outcomes.learn}`,
    `- Preserve: ${report.surfaceDifferenceLab.outcomes.preserve}`,
    `- Repair both: ${report.surfaceDifferenceLab.outcomes.repair}`,
    `- Parity: ${report.surfaceDifferenceLab.outcomes.parity}`,
    `- Uncertain: ${report.surfaceDifferenceLab.outcomes.uncertain}`,
    '',
    ...report.surfaceDifferenceLab.records
      .filter((record) => ['learn', 'preserve', 'repair'].includes(record.outcome))
      .slice(0, 30)
      .map(
        (record) =>
          `- **${record.outcome.toUpperCase()} · ${record.lessonId} · ${record.label}:** ${record.recommendation}`,
      ),
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
    fs.writeFile(
      path.join(args.output, 'learning-ledger.jsonl'),
      `${report.differenceLab.records.map((record) => JSON.stringify(record)).join('\n')}\n`,
    ),
    fs.writeFile(
      path.join(args.output, 'surface-learning-ledger.jsonl'),
      `${report.surfaceDifferenceLab.records.map((record) => JSON.stringify(record)).join('\n')}\n`,
    ),
  ]);
  console.log(`Quiz contrast: ${report.candidate.label} vs ${report.reference.label}`);
  console.log(`Reference advantages: ${report.learning.learn.length}`);
  console.log(`Candidate advantages: ${report.learning.preserve.length}`);
  console.log(`Shared weaknesses: ${report.learning.shared.length}`);
  console.log(`Lesson-level learning records: ${report.differenceLab.records.length}`);
  console.log(`Multi-surface learning records: ${report.surfaceDifferenceLab.records.length}`);
  console.log(`Release bars: ${report.releaseBars.status}`);
  console.log(`Report: ${path.join(args.output, 'latest.md')}`);
  if (args.strict && report.releaseBars.status !== 'passed') process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
