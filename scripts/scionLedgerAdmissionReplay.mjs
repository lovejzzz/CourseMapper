#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { lintKernelFact } from '../src/lib/blueprintEnrichmentPass.js';
import { assessPublicScionKernelResponse } from '../src/lib/publicScionProvider.js';

function valueAfter(flag, fallback = '') {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const logPath = valueAfter('--log') || process.argv[2];
const skip = Math.max(0, Number(valueAfter('--skip', '0')) || 0);
if (!logPath) {
  console.error('Usage: npx vite-node scripts/scionLedgerAdmissionReplay.mjs --log /path/to/shim.jsonl [--skip N]');
  process.exitCode = 2;
} else {
  const absolutePath = path.resolve(logPath);
  const rows = fs
    .readFileSync(absolutePath, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .slice(skip)
    .map((line) => JSON.parse(line));
  const results = [];
  for (const [rowIndex, row] of rows.entries()) {
    if (row?.adapterRoute?.taskFamily !== 'lesson-kernel-synthesis') continue;
    let parsed = null;
    try {
      parsed = JSON.parse(row.response || '');
    } catch {
      // Keep malformed transport visible in the report.
    }
    const lesson = parsed?.lessons?.[0] || {};
    const factResults = (lesson.facts || []).map((fact, factIndex) => ({
      factIndex,
      fact,
      issues: lintKernelFact(fact),
    }));
    const transport = assessPublicScionKernelResponse(
      row.response || '',
      row.originalCompilerUser || row.user || '',
      'blueprintEnrichment',
    );
    results.push({
      rowIndex: rowIndex + skip,
      lessonId: lesson.lessonId || null,
      modelCalls: Number(row?.adapterRoute?.modelCalls) || 0,
      transportIssues: transport.issues || [],
      canonicalFactIssues: factResults.filter((entry) => entry.issues.length > 0),
      canonicalFactCount: factResults.filter((entry) => entry.issues.length === 0).length,
      factCount: factResults.length,
    });
  }
  console.log(
    JSON.stringify(
      {
        schemaVersion: 1,
        logPath: absolutePath,
        skip,
        lessonResponses: results.length,
        canonicalClean: results.filter((entry) => entry.canonicalFactIssues.length === 0).length,
        results,
      },
      null,
      2,
    ),
  );
}
