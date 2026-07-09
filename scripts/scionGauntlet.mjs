#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  SCION_MODEL_ID,
  buildScionGauntletSummary,
  latestCrucibleRound,
  parseScionGauntletArgs,
  repoRoot,
  runCrucibleForScion,
  writeScionGauntletReport,
} from './lib/scionGauntlet.mjs';

function usage() {
  return [
    'Usage:',
    '  node scripts/scionGauntlet.mjs --round-dir <verification-output/crucible/round-...> [--courses scion12]',
    '  node scripts/scionGauntlet.mjs --latest [--courses music-theory,cs-python]',
    '  node scripts/scionGauntlet.mjs --run [--courses scion12] [--adapter trellis/tendril/distill/adapters-scion] [--external-server]',
    '',
    'Course spec accepts any Crucible --courses value plus "scion12" (music-theory, cs-python, geology, world-lit-readings).',
  ].join('\n');
}

async function main(argv = process.argv.slice(2)) {
  const options = parseScionGauntletArgs(argv);
  if (options.help) {
    console.log(usage());
    return 0;
  }

  const courses = options.courses || 'scion12';
  const provider = options.provider || 'local';
  const model = options.model || SCION_MODEL_ID;
  let roundDir = options.roundDir ? path.resolve(repoRoot, options.roundDir) : null;
  let runResult = null;

  if (options.run) {
    runResult = await runCrucibleForScion({
      courses,
      provider,
      model,
      concurrency: Number(options.concurrency) || 1,
      adapter: options.adapter || '',
      externalServer: Boolean(options.externalServer),
    });
    roundDir = await latestCrucibleRound();
  } else if (options.latest) {
    roundDir = await latestCrucibleRound();
  }

  if (!roundDir) {
    console.error(usage());
    console.error('\nMissing --round-dir, --latest, or --run.');
    return 2;
  }

  const label = options.label || `gauntlet-${path.basename(roundDir).replace(/^round-/, '')}`;
  const summary = await buildScionGauntletSummary({
    roundDir,
    courses,
    provider,
    modelId: model,
    label,
  });
  if (runResult) summary.crucibleRun = runResult;

  const paths = await writeScionGauntletReport(summary);
  console.log(`[scion-gauntlet] ${summary.evaluation.passed ? 'PASS' : 'FAIL'} ${paths.mdPath}`);
  if (runResult && runResult.exitCode !== 0) {
    console.error(`[scion-gauntlet] Crucible exited ${runResult.exitCode}; see ${summary.roundDir}`);
    return runResult.exitCode;
  }
  return summary.evaluation.passed ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((code) => {
    process.exitCode = code;
  });
}

export { main };
