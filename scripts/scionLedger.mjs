#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { DEFAULT_FLYWHEEL_INPUT, DEFAULT_SCION_LEDGER_OUTPUT, repoRoot, writeScionLedger } from './lib/scionLedger.mjs';

function parseArgs(argv = []) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith('--')) continue;
    const [rawKey, inlineValue] = arg.slice(2).split('=');
    const key = rawKey.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    if (inlineValue !== undefined) {
      options[key] = inlineValue;
      continue;
    }
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      options[key] = true;
      continue;
    }
    options[key] = next;
    index += 1;
  }
  return options;
}

function resolveRepoPath(value, fallback) {
  if (!value) return fallback;
  return path.isAbsolute(value) ? value : path.resolve(repoRoot, value);
}

function usage() {
  return [
    'Usage:',
    '  node scripts/scionLedger.mjs [--input trellis/tendril/distill/data-g4-orpo/app-flywheel.jsonl] [--output verification-output/scion-ledger/scion-eval-ledger.jsonl]',
    '  node scripts/scionLedger.mjs --metadata-only',
    '',
    'This is explicit corpus-building. Normal Scion runs do not write this ledger.',
  ].join('\n');
}

async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    console.log(usage());
    return 0;
  }
  const result = await writeScionLedger({
    inputPath: resolveRepoPath(options.input, DEFAULT_FLYWHEEL_INPUT),
    outputPath: resolveRepoPath(options.output, DEFAULT_SCION_LEDGER_OUTPUT),
    includePayload: options.metadataOnly !== true,
  });
  console.log(JSON.stringify(result, null, 2));
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((code) => {
    process.exitCode = code;
  });
}

export { main };
