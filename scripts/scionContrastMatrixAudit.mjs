#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { buildScionContrastMatrix } from '../src/lib/quality/scionContrastMatrix.js';

function parseArgs(argv) {
  const args = {
    manifest: path.join(process.cwd(), 'evaluation', 'scion-contrast-matrix.json'),
    output: path.join(process.cwd(), 'verification-output', 'scion-contrast-matrix'),
  };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--manifest') args.manifest = path.resolve(argv[++index] || args.manifest);
    else if (argv[index] === '--output') args.output = path.resolve(argv[++index] || args.output);
    else if (argv[index] === '--help' || argv[index] === '-h') args.help = true;
  }
  return args;
}

function percent(value) {
  return `${(Number(value || 0) * 100).toFixed(1)}%`;
}

function renderDimensionTable(dimensions) {
  return [
    '| Behavior | Candidate | Reference | Candidate delta |',
    '| --- | ---: | ---: | ---: |',
    ...dimensions.map(
      (row) =>
        `| ${row.label} | ${row.candidate.count}/${row.candidate.total} (${percent(row.candidate.share)}) | ${row.reference.count}/${row.reference.total} (${percent(row.reference.share)}) | ${row.candidateDeltaPoints >= 0 ? '+' : ''}${row.candidateDeltaPoints.toFixed(1)} pp |`,
    ),
  ];
}

function renderOutcomes(label, outcomes) {
  return `- ${label}: learn ${outcomes.learn} · preserve ${outcomes.preserve} · repair ${outcomes.repair} · parity ${outcomes.parity} · uncertain ${outcomes.uncertain}`;
}

function renderMarkdown(matrix, manifestPath) {
  const lines = [
    '# Scion contrast matrix',
    '',
    `Generated: ${matrix.generatedAt}`,
    `Manifest: ${manifestPath}`,
    `Pairs: ${matrix.pairCount} across ${matrix.domainCount} domains`,
    '',
    `> ${matrix.claimBoundary}`,
    '',
    '## Pair inventory',
    '',
    '| Pair | Domain | Candidate route | Candidate | Reference | Evidence | Quiz bar |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...matrix.rows.map(
      (row) =>
        `| ${row.id} | ${row.domain} | ${row.candidateRoute} | ${row.candidateModel} | ${row.referenceModel} | ${row.artifactStatus} | ${row.report.releaseBars.status} |`,
    ),
    '',
  ];
  for (const [route, summary] of Object.entries(matrix.routes)) {
    lines.push(
      `## ${route}`,
      '',
      `Pairs: ${summary.pairs} · domains: ${summary.domains.join(', ')}`,
      '',
      renderOutcomes('Quiz records', summary.quizOutcomes),
      renderOutcomes('Surface records', summary.surfaceOutcomes),
      renderOutcomes('Cross-artifact records', summary.crossArtifactOutcomes),
      '',
      '### Quiz behaviors',
      '',
      ...renderDimensionTable(summary.quizDimensions),
      '',
      '### Multi-surface behaviors',
      '',
      ...renderDimensionTable(summary.surfaceDimensions),
      '',
      '### Cross-artifact consistency',
      '',
      ...renderDimensionTable(summary.crossArtifactDimensions),
      '',
    );
  }
  return `${lines.join('\n')}\n`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log('Usage: node scripts/scionContrastMatrixAudit.mjs [--manifest evaluation/scion-contrast-matrix.json]');
    return;
  }
  const manifest = JSON.parse(await fs.readFile(args.manifest, 'utf8'));
  const pairs = await Promise.all(
    (manifest.pairs || []).map(async (pair) => {
      const [candidateProject, referenceProject] = await Promise.all([
        fs.readFile(path.resolve(pair.candidate), 'utf8').then(JSON.parse),
        fs.readFile(path.resolve(pair.reference), 'utf8').then(JSON.parse),
      ]);
      return { ...pair, candidateProject, referenceProject };
    }),
  );
  const matrix = buildScionContrastMatrix(pairs);
  await fs.mkdir(args.output, { recursive: true });
  await Promise.all([
    fs.writeFile(path.join(args.output, 'latest.json'), `${JSON.stringify(matrix, null, 2)}\n`),
    fs.writeFile(path.join(args.output, 'latest.md'), renderMarkdown(matrix, args.manifest)),
  ]);
  console.log(`Scion contrast matrix: ${matrix.pairCount} pairs / ${matrix.domainCount} domains`);
  for (const [route, summary] of Object.entries(matrix.routes)) {
    console.log(
      `${route}: ${summary.pairs} pair(s), quiz learn/preserve ${summary.quizOutcomes.learn}/${summary.quizOutcomes.preserve}, surface learn/preserve ${summary.surfaceOutcomes.learn}/${summary.surfaceOutcomes.preserve}, cross learn/preserve ${summary.crossArtifactOutcomes.learn}/${summary.crossArtifactOutcomes.preserve}`,
    );
  }
  console.log(`Report: ${path.join(args.output, 'latest.md')}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
