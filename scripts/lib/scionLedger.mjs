import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(here, '../..');
export const DEFAULT_FLYWHEEL_INPUT = path.join(
  repoRoot,
  'trellis',
  'tendril',
  'distill',
  'data-g4-orpo',
  'app-flywheel.jsonl',
);
export const DEFAULT_SCION_LEDGER_OUTPUT = path.join(
  repoRoot,
  'verification-output',
  'scion-ledger',
  'scion-eval-ledger.jsonl',
);

function stableHash(value) {
  let hash = 2166136261;
  for (const char of String(value || '')) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash >>> 0;
}

function deterministicSplit(row) {
  const basis = JSON.stringify({
    pass: row.pass,
    lessonId: row.lessonId,
    item: row.item,
    at: row.at,
    chosen: row.chosen,
    rejected: row.rejected,
  });
  return stableHash(basis) % 10 === 0 ? 'eval' : 'train';
}

function compactContext(context = {}) {
  return {
    ...(context.course ? { course: String(context.course).slice(0, 160) } : {}),
    ...(Array.isArray(context.chunk) ? { chunk: context.chunk.map(String).slice(0, 32) } : {}),
  };
}

export function normalizeFlywheelRow(row = {}, { index = 0, includePayload = true } = {}) {
  const hasChosen = row.chosen !== undefined && row.chosen !== null;
  const hasRejected = row.rejected !== undefined && row.rejected !== null;
  const kind = hasChosen && hasRejected ? 'preference-pair' : 'pass-event';
  const normalized = {
    ledgerVersion: 1,
    source: 'app-flywheel',
    sourceIndex: index,
    kind,
    split: deterministicSplit(row),
    pass: row.pass || 'unknown',
    action: row.action || '',
    reason: row.reason || '',
    lessonId: row.lessonId || '',
    item: Number.isFinite(Number(row.item)) ? Number(row.item) : null,
    context: compactContext(row.context || {}),
    at: row.at || '',
  };
  if (includePayload && hasChosen) normalized.chosen = row.chosen;
  if (includePayload && hasRejected) normalized.rejected = row.rejected;
  return normalized;
}

export async function readJsonl(filePath) {
  const raw = await fs.readFile(filePath, 'utf8').catch((error) => {
    if (error?.code === 'ENOENT') return '';
    throw error;
  });
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

export async function writeScionLedger({
  inputPath = DEFAULT_FLYWHEEL_INPUT,
  outputPath = DEFAULT_SCION_LEDGER_OUTPUT,
  includePayload = true,
} = {}) {
  const rows = await readJsonl(inputPath);
  const normalized = rows.map((row, index) => normalizeFlywheelRow(row, { index, includePayload }));
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${normalized.map((row) => JSON.stringify(row)).join('\n')}\n`);
  const summary = normalized.reduce(
    (acc, row) => {
      acc.total += 1;
      acc.byKind[row.kind] = (acc.byKind[row.kind] || 0) + 1;
      acc.bySplit[row.split] = (acc.bySplit[row.split] || 0) + 1;
      acc.byPass[row.pass] = (acc.byPass[row.pass] || 0) + 1;
      return acc;
    },
    { total: 0, byKind: {}, bySplit: {}, byPass: {} },
  );
  return { inputPath, outputPath, includePayload, summary };
}
