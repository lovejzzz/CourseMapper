import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { verifyReplayArtifact } from './lib/v01710ReplayArtifactVerifier.mjs';

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : '';
}

const receiptPath = path.resolve(argument('--receipt'));
const zipPath = path.resolve(argument('--zip'));
const inputPath = path.resolve(argument('--input'));
if (
  !argument('--receipt') ||
  !argument('--zip') ||
  !argument('--input') ||
  !fs.existsSync(receiptPath) ||
  !fs.existsSync(zipPath) ||
  !fs.existsSync(inputPath)
) {
  throw new Error(
    'Usage: node scripts/verifyV01710ReplayArtifact.mjs --receipt <receipt.json> --zip <package.zip> --input <fixture.json.gz>',
  );
}

const root = process.cwd();
const replayScript = path.join(root, 'scripts/v01710OutputQualityReplay.mjs');
const viteNodeCli = path.join(root, 'node_modules/vite-node/dist/cli.mjs');
const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'edutool-v01710-fresh-replay-'));

function generateFreshReplay(runNumber) {
  const outputPath = path.join(temporaryDirectory, `replay-${runNumber}.zip`);
  const command = spawnSync(process.execPath, [viteNodeCli, replayScript, '--input', inputPath, '--zip', outputPath], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (command.status !== 0 || !fs.existsSync(outputPath)) {
    const diagnostic = `${command.stderr || command.stdout || ''}`.trim().slice(-4000);
    throw new Error(`Fresh replay generation ${runNumber} failed.${diagnostic ? `\n${diagnostic}` : ''}`);
  }
  return fs.readFileSync(outputPath);
}

try {
  const result = await verifyReplayArtifact({
    receipt: JSON.parse(fs.readFileSync(receiptPath, 'utf8')),
    zipBytes: fs.readFileSync(zipPath),
    reproducedZipBytes: [generateFreshReplay(1), generateFreshReplay(2)],
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} finally {
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
}
