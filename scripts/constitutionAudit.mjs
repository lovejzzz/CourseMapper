#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const CONTRACT_PATH = path.join(ROOT, 'quality-constitution', 'v1.json');
const OUTPUT_DIR = path.join(ROOT, 'verification-output', 'constitution-audit');
const REQUIRED_RULE_IDS = ['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7'];

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

function words(text) {
  return String(text || '').match(/[A-Za-z][A-Za-z'-]*/g) || [];
}

function lower(value) {
  return String(value || '').toLowerCase();
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean))).sort();
}

function countManifestFindings(quality = {}) {
  const counts = quality.findingCounts || {};
  return Number(counts.p0 || 0) + Number(counts.p1 || 0) + Number(counts.p2 || 0);
}

function packageText(pkg) {
  return [
    pkg.courseTitle,
    pkg.qualityReport,
    JSON.stringify(pkg.manifest || {}),
    JSON.stringify(pkg.digest || {}),
    ...Object.values(pkg.files || {}),
  ].join('\n');
}

function reportOrManifestText(pkg) {
  return [pkg.qualityReport, JSON.stringify(pkg.manifest?.pipeline || {}), JSON.stringify(pkg.manifest?.quality || {})]
    .join('\n')
    .toLowerCase();
}

function add(violations, ruleId, detail, evidence = '') {
  violations.push({ ruleId, detail, evidence: String(evidence || '').slice(0, 240) });
}

function checkC1(violations, pkg) {
  const courseTitle = String(pkg.courseTitle || '').trim();
  const manifestTitle = String(pkg.manifest?.courseName || '').trim();
  if (!courseTitle || !manifestTitle || courseTitle !== manifestTitle) {
    add(
      violations,
      'C1',
      'course title differs between fixture and PACKAGE_MANIFEST.json',
      `${courseTitle} / ${manifestTitle}`,
    );
  }
  if (/mandarin|chinese/i.test(courseTitle) && !/[一-鿿㐀-䶿]|pinyin|tones?/i.test(packageText(pkg))) {
    add(violations, 'C1', 'language course has no visible target-language evidence', courseTitle);
  }
}

function checkC2(violations, pkg) {
  if (!pkg.manifest || typeof pkg.manifest !== 'object') add(violations, 'C2', 'PACKAGE_MANIFEST.json is missing');
  if (!String(pkg.qualityReport || '').trim()) add(violations, 'C2', 'QUALITY_REPORT.md is missing');
  const files = pkg.files || {};
  for (const file of pkg.manifest?.files || []) {
    if (!file?.path || !(file.path in files))
      add(violations, 'C2', 'manifest file row has no matching exported file', file?.path);
  }
  const gates = pkg.digest?.gates || {};
  if (String(gates.exportStatus || '').toLowerCase() === 'failed' || Number(gates.exportFailed || 0) > 0) {
    add(violations, 'C2', 'run digest says export verification failed', JSON.stringify(gates));
  }
}

function checkC3(violations, pkg) {
  const files = pkg.files || {};
  const caveatText = lower([pkg.qualityReport, JSON.stringify(pkg.digest?.gates || {})].join('\n'));
  const disclosedInClassOnly = /no dedicated artifact|in-class lesson-plan activities|in-class activities/.test(
    caveatText,
  );
  for (const assessment of pkg.manifest?.assessments || []) {
    if (assessment?.artifact && !(assessment.artifact in files) && !disclosedInClassOnly) {
      add(violations, 'C3', 'assessment artifact is named but absent from export', assessment.artifact);
    }
  }
}

function digestCaveats(pkg) {
  const digest = pkg.digest || {};
  const rows = [];
  const pipeline = digest.pipeline || {};
  for (const key of ['nativeAuthoring', 'enrichment', 'knowledgeBackbone', 'judgment', 'voicePass']) {
    const value = String(pipeline[key] || '');
    if (
      /fell back|fallback|partial|template|limited|warning|failed/i.test(value) ||
      (/\bgaps?\b/i.test(value) && !/\bno\b.{0,24}\bgaps?\b/i.test(value))
    ) {
      rows.push(`${key}: ${value}`);
    }
  }
  for (const check of digest.gates?.flaggedChecks || []) {
    const message = String(check?.message || check || '');
    if (message) rows.push(message);
  }
  const gates = digest.gates || {};
  if (String(gates.exportStatus || '').toLowerCase() === 'failed' || Number(gates.exportFailed || 0) > 0) {
    rows.push(`export verification ${gates.exportStatus || 'failed'} failed=${gates.exportFailed ?? '?'}`);
  }
  return rows;
}

function checkC4(violations, pkg) {
  const disclosure = reportOrManifestText(pkg);
  for (const caveat of digestCaveats(pkg)) {
    const text = lower(caveat);
    const disclosed =
      (/native|prose|fallback|fell back/.test(text) && /native|prose|fallback|fell back/.test(disclosure)) ||
      (/partial|template/.test(text) && /partial|template|fallback|fell back/.test(disclosure)) ||
      (/gap|warning|limited/.test(text) && /gap|warning|limited|finding/.test(disclosure)) ||
      (/export/.test(text) && /export|failed|verification/.test(disclosure));
    if (!disclosed) add(violations, 'C4', 'digest caveat is absent from manifest and quality report', caveat);
  }
}

function checkC5(violations, pkg) {
  const title = lower(pkg.courseTitle);
  const wetLabCourse = /\b(biology|chemistry|geology|anatomy|physiology|microbiology|wet lab|laboratory)\b/.test(title);
  const requiredAssets = Object.entries(pkg.files || {})
    .filter(([file]) => /required assets/i.test(file))
    .map(([, text]) => text)
    .join('\n');
  if (
    !wetLabCourse &&
    /\b(specimen|specimens|chemical samples?|streak plates?|safety goggles|hand lenses?|field notebook|lab bench)\b/i.test(
      requiredAssets,
    )
  ) {
    add(violations, 'C5', 'non-wet-lab course requires wet-lab or field-lab assets', requiredAssets);
  }
}

function checkC6(violations, pkg) {
  for (const [file, text] of Object.entries(pkg.files || {})) {
    if (/required assets/i.test(file)) continue;
    const wordCount = words(text).length;
    if (wordCount < 18 || /\b(placeholder|title only|add .*later|lorem ipsum|todo)\b/i.test(text)) {
      add(violations, 'C6', 'artifact is too thin or placeholder-like for instructor use', `${file}: ${text}`);
    }
  }
}

function checkC7(violations, pkg) {
  const report = String(pkg.qualityReport || '');
  if (!/overall/i.test(report) || !/findings/i.test(report)) {
    add(violations, 'C7', 'quality report lacks overall status or findings section', report);
  }
  if (countManifestFindings(pkg.manifest?.quality) > 0 && /\bnone\b/i.test(report) && !/\bP[012]\b/.test(report)) {
    add(violations, 'C7', 'manifest records findings but quality report says none', report);
  }
  const readiness = pkg.manifest?.readiness || {};
  if (
    (String(readiness.status || '').toLowerCase() !== 'ready' || Number(readiness.blockers || 0) > 0) &&
    !/blocker|not ready|warning/i.test(report)
  ) {
    add(violations, 'C7', 'non-ready manifest state is not visible in quality report', JSON.stringify(readiness));
  }
}

function evaluateFixture(fixture) {
  const violations = [];
  const pkg = fixture.package || {};
  checkC1(violations, pkg);
  checkC2(violations, pkg);
  checkC3(violations, pkg);
  checkC4(violations, pkg);
  checkC5(violations, pkg);
  checkC6(violations, pkg);
  checkC7(violations, pkg);
  return violations;
}

function validateContract(contract) {
  const failures = [];
  const principleIds = (contract.principles || []).map((principle) => principle.id);
  for (const id of REQUIRED_RULE_IDS) {
    if (!principleIds.includes(id)) failures.push(`missing principle ${id}`);
  }
  if (contract.fastGateCommand !== 'npm run audit:constitution')
    failures.push('fastGateCommand must be npm run audit:constitution');
  if (contract.broadRegressionCommand !== 'npm run audit:gold')
    failures.push('broadRegressionCommand must be npm run audit:gold');
  if (!Array.isArray(contract.fixtures) || contract.fixtures.length < 3 || contract.fixtures.length > 5) {
    failures.push('fixture list must contain 3-5 canonical fixtures');
  }
  return failures;
}

function compareFixture(fixture, violations) {
  const actual = unique(violations.map((violation) => violation.ruleId));
  const expected = unique(fixture.expected?.violations || []);
  const expectedStatus = fixture.expected?.status || (expected.length > 0 ? 'fail' : 'pass');
  const actualStatus = actual.length > 0 ? 'fail' : 'pass';
  const missing = expected.filter((id) => !actual.includes(id));
  const unexpected = actual.filter((id) => !expected.includes(id));
  return {
    id: fixture.id,
    kind: fixture.kind,
    title: fixture.title,
    status: missing.length === 0 && unexpected.length === 0 && actualStatus === expectedStatus ? 'pass' : 'fail',
    expectedStatus,
    actualStatus,
    expectedViolations: expected,
    actualViolations: actual,
    missing,
    unexpected,
    details: violations,
  };
}

function renderMarkdown(payload) {
  return [
    '# Teacher-Ready Constitution Audit',
    '',
    `Generated: ${payload.generatedAt}`,
    `Status: ${payload.status}`,
    `Contract: ${payload.contract.version}`,
    '',
    '## Fixtures',
    '',
    '| Fixture | Kind | Status | Expected | Actual |',
    '| --- | --- | --- | --- | --- |',
    ...payload.fixtures.map(
      (fixture) =>
        `| ${fixture.id} | ${fixture.kind} | ${fixture.status} | ${fixture.expectedViolations.join(', ') || 'none'} | ${
          fixture.actualViolations.join(', ') || 'none'
        } |`,
    ),
    '',
    '## Failures',
    '',
    ...payload.fixtures
      .filter((fixture) => fixture.status !== 'pass')
      .flatMap((fixture) => [
        `- ${fixture.id}: expected ${fixture.expectedViolations.join(', ') || 'none'}, got ${
          fixture.actualViolations.join(', ') || 'none'
        }`,
        ...fixture.details.map((detail) => `  - ${detail.ruleId}: ${detail.detail} (${detail.evidence})`),
      ]),
    ...(payload.fixtures.every((fixture) => fixture.status === 'pass') ? ['- None.'] : []),
    '',
  ].join('\n');
}

async function main() {
  const contract = await readJson(CONTRACT_PATH);
  const failures = validateContract(contract);
  const fixtureDir = path.join(ROOT, contract.fixturePolicy?.fixtureDirectory || 'quality-constitution/fixtures');
  const fixtureResults = [];

  for (const fixtureId of contract.fixtures || []) {
    const fixturePath = path.join(fixtureDir, `${fixtureId}.json`);
    const fixture = await readJson(fixturePath);
    if (fixture.id !== fixtureId) failures.push(`${fixturePath} id must be ${fixtureId}`);
    fixtureResults.push(compareFixture(fixture, evaluateFixture(fixture)));
  }

  for (const result of fixtureResults) {
    if (result.status !== 'pass') failures.push(`${result.id} expectation mismatch`);
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    status: failures.length > 0 ? 'fail' : 'pass',
    failures,
    contract: {
      version: contract.version,
      doc: contract.doc,
      fastGateCommand: contract.fastGateCommand,
      broadRegressionCommand: contract.broadRegressionCommand,
      principleCount: contract.principles?.length || 0,
    },
    fixtures: fixtureResults,
  };

  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  await fs.writeFile(path.join(OUTPUT_DIR, 'latest.json'), `${JSON.stringify(payload, null, 2)}\n`);
  await fs.writeFile(path.join(OUTPUT_DIR, 'latest.md'), `${renderMarkdown(payload)}\n`);

  console.log(`Teacher-ready constitution audit: ${payload.status}`);
  console.log(`Fixtures: ${fixtureResults.length}`);
  console.log(`Report: ${path.join(OUTPUT_DIR, 'latest.md')}`);
  if (failures.length > 0) {
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
