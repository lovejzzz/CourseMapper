import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  AUTOMATED_READINESS_CEILING,
  AUTOMATED_READINESS_PROTOCOL,
  computeAutomatedReadinessSignal,
} from '../src/lib/quality/automatedReadinessSignal.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURE_PATH = path.join(ROOT, 'evaluation/automated-readiness/v1/cases.json');
const OUTPUT_PATH = path.join(ROOT, 'verification-output/automated-readiness-v1/latest.json');

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function conformance(score) {
  return {
    overall: { score, grade: score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : 'D' },
    scores: {
      identity: score,
      substance: score,
      citations: score,
      honesty: score,
      discipline: score,
      consistency: score,
      structure: score,
      format: score,
      texture: score,
    },
  };
}

function trustedRows(count, lessonTitles) {
  return Array.from({ length: count }, (_, index) => ({
    id: `benchmark-source-${index + 1}`,
    title: `Bound source ${index + 1}`,
    provider: 'wikipedia',
    url: `https://en.wikipedia.org/wiki/Urban_heat_island?benchmark=${index + 1}`,
    license: 'CC BY-SA 4.0',
    conceptLinks: [
      {
        id: `lesson-${(index % Math.max(1, lessonTitles.length)) + 1}`,
        label: lessonTitles[index % Math.max(1, lessonTitles.length)] || `Lesson ${index + 1}`,
      },
    ],
  }));
}

function runCase(entry) {
  const manifest = {
    pipeline: entry.pipeline,
    sourceLedger: trustedRows(entry.trustedSourceCount, entry.lessonTitles),
    ...(entry.sourceCoverage
      ? {
          sourceReport: {
            sourceRefCoverage: {
              totals: entry.sourceCoverage,
              ...(entry.trustedSourceCoverage
                ? {
                    trusted: {
                      sourceLedgerRows: entry.trustedSourceCount,
                      totals: entry.trustedSourceCoverage,
                    },
                  }
                : {}),
            },
          },
        }
      : {}),
  };
  const result = computeAutomatedReadinessSignal({
    manifest,
    course: { prompt: entry.coursePrompt },
    lessonTitles: entry.lessonTitles,
    conformance: conformance(entry.conformanceScore),
    texture: { score: entry.textureScore },
  });
  const failures = [];
  if (result.protocol !== AUTOMATED_READINESS_PROTOCOL) failures.push(`protocol ${result.protocol}`);
  if (!Number.isFinite(entry.expected.score)) {
    failures.push('missing finite frozen expected.score');
  } else if (result.score !== entry.expected.score) {
    failures.push(`score ${result.score} != frozen ${entry.expected.score}`);
  }
  if (result.band !== entry.expected.band) failures.push(`band ${result.band} != ${entry.expected.band}`);
  if (result.score > AUTOMATED_READINESS_CEILING) failures.push(`score exceeds ${AUTOMATED_READINESS_CEILING}`);
  return {
    id: entry.id,
    origin: entry.origin,
    expected: entry.expected,
    actual: result,
    passed: failures.length === 0,
    failures,
  };
}

const fixture = JSON.parse(await fs.readFile(FIXTURE_PATH, 'utf8'));
if (fixture.protocol !== AUTOMATED_READINESS_PROTOCOL) {
  throw new Error(`Fixture protocol ${fixture.protocol} does not match ${AUTOMATED_READINESS_PROTOCOL}`);
}
const { canonicalSha256, ...fixtureCanonical } = fixture;
const observedFixtureSha256 = sha256(stableJson(fixtureCanonical));
if (!/^[a-f0-9]{64}$/.test(canonicalSha256 || '') || canonicalSha256 !== observedFixtureSha256) {
  throw new Error(
    `Fixture canonical SHA-256 mismatch: expected ${canonicalSha256 || '(missing)'}, observed ${observedFixtureSha256}`,
  );
}
const cases = fixture.cases.map(runCase);
const report = {
  protocol: AUTOMATED_READINESS_PROTOCOL,
  fixtureVersion: fixture.version,
  generatedAt: new Date().toISOString(),
  passed: cases.every((entry) => entry.passed),
  caseCount: cases.length,
  cases,
};

if (process.argv.includes('--write')) {
  await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await fs.writeFile(OUTPUT_PATH, `${JSON.stringify(report, null, 2)}\n`);
}

console.log('Automated readiness benchmark v1');
for (const entry of cases) {
  console.log(
    `${entry.passed ? 'PASS' : 'FAIL'} ${entry.id}: ${entry.actual.score}/100 (${entry.actual.band}; ceiling ${entry.actual.evidenceCeiling}); conformance fixture ${fixture.cases.find((item) => item.id === entry.id)?.conformanceScore}/100`,
  );
  for (const failure of entry.failures) console.log(`  ${failure}`);
}
console.log(`Result: ${report.passed ? 'PASS' : 'FAIL'} (${cases.length} cases)`);

if (!report.passed) process.exitCode = 1;
