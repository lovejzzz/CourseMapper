#!/usr/bin/env node
import path from 'node:path';
import process from 'node:process';

import {
  appendActivityEntry,
  readActivityLog,
  readLatestPayload,
  summarizeQualityResults,
  writeQualityDashboard,
} from './qualityDashboard.mjs';

const ROOT = process.cwd();
const OUTPUT_DIR = path.join(ROOT, 'verification-output', 'internal-quality-loop');

function parseArgs(argv) {
  const args = {
    summary: '',
    type: 'note',
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--summary') args.summary = argv[++i] || '';
    else if (arg === '--type') args.type = argv[++i] || args.type;
  }

  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const latest = await readLatestPayload(OUTPUT_DIR);
  let activityLog = await readActivityLog(OUTPUT_DIR);

  if (args.summary.trim()) {
    activityLog = await appendActivityEntry(OUTPUT_DIR, {
      type: args.type,
      summary: args.summary.trim(),
      stats: summarizeQualityResults(latest.results || [], Number(latest.meta?.target || 90)),
    });
  }

  const dashboardPath = await writeQualityDashboard(OUTPUT_DIR, latest, activityLog);
  console.log(`Wrote ${path.relative(ROOT, dashboardPath)}`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exitCode = 1;
});
