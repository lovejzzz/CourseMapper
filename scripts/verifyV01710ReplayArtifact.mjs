import fs from 'node:fs';
import path from 'node:path';

import { verifyReplayArtifact } from './lib/v01710ReplayArtifactVerifier.mjs';

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : '';
}

const receiptPath = path.resolve(argument('--receipt'));
const zipPath = path.resolve(argument('--zip'));
if (!argument('--receipt') || !argument('--zip') || !fs.existsSync(receiptPath) || !fs.existsSync(zipPath)) {
  throw new Error('Usage: node scripts/verifyV01710ReplayArtifact.mjs --receipt <receipt.json> --zip <package.zip>');
}

const result = await verifyReplayArtifact({
  receipt: JSON.parse(fs.readFileSync(receiptPath, 'utf8')),
  zipBytes: fs.readFileSync(zipPath),
});
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
