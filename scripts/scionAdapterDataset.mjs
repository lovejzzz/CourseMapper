#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { assessCorpusRow } from './scionPreferenceCorpusAudit.mjs';
import { sha256File } from './scionAdapterPackage.mjs';
import { validateScionHeldoutBenchmark } from './scionAdapterPairedEvidence.mjs';
import { deriveDeterministicContractEvidence } from '../src/lib/scionPreferenceGate.js';
import { validateScionCodexTrainingPreferenceEvidence } from '../src/lib/scionCodexTrainingEvidence.js';

export const SCION_ADAPTER_DEFAULT_SOURCES = [
  'trellis/tendril/distill/data-g4-orpo/train.jsonl',
  'trellis/tendril/distill/data-g4-orpo/app-flywheel.jsonl',
  'evaluation/scion-reviewed-preferences.jsonl',
  'evaluation/scion-adapters/evidence/codex-approved-preferences-v0.16.42.jsonl',
];
const DEFAULT_OUTPUT = 'trellis/tendril/distill/data-g4-orpo/curated';
const DEFAULT_DOMAIN_MAP = 'evaluation/scion-course-domain-map.json';
export const SCION_ADAPTER_DEFAULT_HELDOUT_BENCHMARK = 'evaluation/scion-adapters/held-out-course-benchmark-v1.json';
const DEFAULT_SOURCES = SCION_ADAPTER_DEFAULT_SOURCES;
const DEFAULT_HELDOUT_BENCHMARK = SCION_ADAPTER_DEFAULT_HELDOUT_BENCHMARK;
export const SCION_ORPO_TRAINING_FORMAT = Object.freeze({
  protocol: 'scion-orpo-conversations-v1',
  columns: Object.freeze(['chosen', 'rejected', 'provenance']),
  sequence: Object.freeze(['user', 'assistant']),
  promptIncludedInBothSequences: true,
});

function normalize(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim();
}

function stableHash(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalize(value[key])]),
  );
}

function stableJson(value) {
  return JSON.stringify(canonicalize(value));
}

export function computeScionAdapterDatasetIdentity(manifest) {
  const sourceReceipts = Array.isArray(manifest?.sourceReceipts)
    ? manifest.sourceReceipts.map((entry) => ({
        status: entry?.status,
        ...(entry?.status === 'verified' ? { bytes: entry?.bytes, sha256: entry?.sha256 } : {}),
      }))
    : [];
  return stableHash(
    stableJson({
      protocol: 'scion-adapter-dataset-identity-v2',
      schemaVersion: manifest?.schemaVersion,
      status: manifest?.status,
      promotable: manifest?.promotable,
      primaryPreferenceEvidence: manifest?.primaryPreferenceEvidence,
      sourceReceipts,
      domainMap: {
        entries: manifest?.domainMap?.entries,
        sha256: manifest?.domainMap?.sha256 || null,
      },
      holdoutBoundary: manifest?.holdoutBoundary,
      counts: manifest?.counts,
      domains: manifest?.domains,
      evidenceCounts: manifest?.evidenceCounts,
      instructorDomainCounts: manifest?.instructorDomainCounts,
      modelJudgeDomainCounts: manifest?.modelJudgeDomainCounts,
      domainGroupCounts: manifest?.domainGroupCounts,
      groupIdentity: manifest?.groupIdentity,
      splitIdentity: manifest?.splitIdentity,
      trainingFormat: manifest?.trainingFormat,
      gate: manifest?.gate,
      leakage: manifest?.leakage,
      files: manifest?.files,
    }),
  );
}

function parsed(value) {
  if (value && typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function pairFingerprint(row) {
  return stableHash(
    JSON.stringify({
      kind: row.kind || row.pass || '',
      prompt: normalize(row.prompt),
      chosen: parsed(row.chosen),
      rejected: parsed(row.rejected),
    }),
  );
}

function inferDomain(row, domainMap = {}) {
  const explicit = normalize(row?.context?.domain || row?.context?.discipline || row?.domain).toLowerCase();
  if (explicit) return { domain: explicit, source: 'row' };
  const group = explicitGroupIdentity(row);
  const mapped = normalize(domainMap[group]).toLowerCase();
  return { domain: mapped || 'unknown', source: mapped ? 'registry' : 'missing' };
}

function explicitGroupIdentity(row) {
  const context = row?.context || {};
  return normalize(
    context.courseId ||
      context.projectId ||
      context.courseName ||
      context.course ||
      row.courseId ||
      row.projectId ||
      row.courseName,
  ).toLowerCase();
}

function splitForGroup(group) {
  const bucket = Number.parseInt(stableHash(group).slice(0, 8), 16) % 100;
  if (bucket < 10) return 'test';
  if (bucket < 20) return 'valid';
  return 'train';
}

function assignGroupSplits(entries) {
  const byDomain = new Map();
  for (const entry of entries) {
    if (!byDomain.has(entry.domain)) byDomain.set(entry.domain, new Set());
    byDomain.get(entry.domain).add(entry.group);
  }
  const assignments = new Map();
  for (const domain of [...byDomain.keys()].sort()) {
    const groups = [...byDomain.get(domain)].sort((left, right) => {
      const hashOrder = stableHash(left).localeCompare(stableHash(right));
      return hashOrder || left.localeCompare(right);
    });
    if (groups.length >= 3) {
      assignments.set(groups[0], 'test');
      assignments.set(groups[1], 'valid');
      for (const group of groups.slice(2)) assignments.set(group, 'train');
    } else {
      for (const group of groups) assignments.set(group, splitForGroup(group));
    }
  }
  return assignments;
}

async function readJsonl(source) {
  try {
    const text = await fs.readFile(source, 'utf8');
    return text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line, index) => ({ row: JSON.parse(line), source, line: index + 1 }));
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
}

async function inspectDatasetSource(source) {
  try {
    const stats = await fs.lstat(source);
    if (!stats.isFile() || stats.isSymbolicLink()) {
      throw new Error(`Dataset source must be a regular file: ${source}`);
    }
    return {
      path: source,
      status: 'verified',
      bytes: stats.size,
      sha256: await sha256File(source),
    };
  } catch (error) {
    if (error?.code === 'ENOENT') return { path: source, status: 'missing' };
    throw error;
  }
}

function pairKind(row) {
  if (['lesson', 'mc-item', 'key-term'].includes(row?.kind)) return row.kind;
  if (row?.pass && row?.chosen && row?.rejected) return 'mc-item';
  return '';
}

function lessonValue(value) {
  const object = parsed(value);
  return object?.lessons?.[0] ?? object;
}

function trainingText(value) {
  if (typeof value === 'string') return value.trim();
  return stableJson(value);
}

export function toScionOrpoTrainingRow(entry) {
  const row = entry?.row || entry;
  const prompt = trainingText(row?.prompt);
  const sequence = (response) => [
    { role: 'user', content: prompt },
    { role: 'assistant', content: trainingText(response) },
  ];
  return {
    chosen: sequence(row?.chosen),
    rejected: sequence(row?.rejected),
    provenance: {
      pairSha256: entry?.fingerprint || pairFingerprint(row),
      sourceIndex: Number.isSafeInteger(entry?.sourceIndex) ? entry.sourceIndex : -1,
      sourceLine: Number.isSafeInteger(entry?.line) ? entry.line : -1,
      split: entry?.split || '',
      domain: entry?.domain || normalize(row?.context?.domain).toLowerCase(),
      courseGroupSha256: entry?.group ? stableHash(entry.group) : '',
      domainSource: normalize(row?.context?.domainSource),
      pairKind: pairKind(row),
      preferenceEvidenceKind: normalize(row?.preferenceEvidence?.kind),
      preferenceEvidenceScope: normalize(row?.preferenceEvidence?.scope),
    },
  };
}

function withDerivedContractEvidence(
  row,
  { semanticAdmission = true, allowFirstSentenceLexicalCue = semanticAdmission } = {},
) {
  if (
    row?.preferenceEvidence?.kind === 'single-model-judge-preference' &&
    validateScionCodexTrainingPreferenceEvidence(row.preferenceEvidence).valid
  ) {
    return row;
  }
  const kind = pairKind(row);
  if (!kind) return row;
  const chosen = kind === 'lesson' ? lessonValue(row.chosen) : parsed(row.chosen);
  const rejected = kind === 'lesson' ? lessonValue(row.rejected) : parsed(row.rejected);
  const evidence = deriveDeterministicContractEvidence(
    { kind, chosen, rejected },
    { semanticAdmission, allowFirstSentenceLexicalCue },
  );
  if (!evidence) return row;
  return {
    ...row,
    preferenceEvidence: {
      ...evidence,
      ...(row.preferenceEvidence?.kind ? { supersedesEvidenceKind: row.preferenceEvidence.kind } : {}),
    },
  };
}

async function readDomainMap(domainMapPath) {
  try {
    const value = JSON.parse(await fs.readFile(domainMapPath, 'utf8'));
    const courses = value?.courses && typeof value.courses === 'object' ? value.courses : {};
    return Object.fromEntries(
      Object.entries(courses)
        .map(([course, domain]) => [normalize(course).toLowerCase(), normalize(domain).toLowerCase()])
        .filter(([course, domain]) => course && domain),
    );
  } catch (error) {
    if (error?.code === 'ENOENT') return {};
    throw error;
  }
}

async function readHeldoutBoundary(benchmarkPath) {
  const stats = await fs.lstat(benchmarkPath);
  if (!stats.isFile() || stats.isSymbolicLink()) {
    throw new Error(`Held-out benchmark must be a regular file: ${benchmarkPath}`);
  }
  const benchmark = JSON.parse(await fs.readFile(benchmarkPath, 'utf8'));
  const validation = validateScionHeldoutBenchmark(benchmark);
  if (!validation.valid) {
    throw new Error(`Held-out benchmark failed validation: ${validation.issues.join(', ')}`);
  }
  const courses = benchmark.courses.map((course) => ({
    courseId: normalize(course.courseId).toLowerCase(),
    domain: normalize(course.domain).toLowerCase(),
  }));
  return {
    benchmark,
    receipt: {
      protocol: 'scion-training-holdout-firewall-v1',
      status: 'pass',
      manifestPath: benchmarkPath,
      manifestSha256: await sha256File(benchmarkPath),
      benchmarkId: benchmark.id,
      frozenAt: benchmark.frozenAt,
      domainDisjointRequired: true,
      courseGroupDisjointRequired: true,
      domains: [...new Set(courses.map((course) => course.domain))].sort(),
      domainCount: new Set(courses.map((course) => course.domain)).size,
      courseGroupCount: courses.length,
      admittedDomainOverlapCount: 0,
      admittedCourseGroupOverlapCount: 0,
      excludedPairCount: 0,
      excludedDomainPairCount: 0,
      excludedCourseGroupPairCount: 0,
    },
    domainSet: new Set(courses.map((course) => course.domain)),
    courseIdSet: new Set(courses.map((course) => course.courseId)),
  };
}

export async function buildScionAdapterDataset({
  sources = DEFAULT_SOURCES,
  outputDir = DEFAULT_OUTPUT,
  minimumPairs = 3000,
  minimumDomains = 5,
  minimumGroupsPerDomain = 3,
  minimumModelJudgePairs = 100,
  minimumModelJudgeDomains = 5,
  minimumModelJudgePairsPerDomain = 20,
  allowSmoke = false,
  allowResearch = false,
  researchMinimumPairs = 100,
  researchMinimumDomains = 4,
  researchMinimumGroupsPerDomain = 3,
  researchMinimumModelJudgePairs = 100,
  researchMinimumModelJudgeDomains = 4,
  researchMinimumModelJudgePairsPerDomain = 20,
  domainMapPath = DEFAULT_DOMAIN_MAP,
  heldoutBenchmarkPath = DEFAULT_HELDOUT_BENCHMARK,
  generatedAt = new Date().toISOString(),
  semanticAdmission = true,
  allowFirstSentenceLexicalCue = semanticAdmission,
} = {}) {
  const sourceReceipts = await Promise.all(sources.map(inspectDatasetSource));
  const loaded = (await Promise.all(sources.map(readJsonl))).flat();
  const domainMap = await readDomainMap(domainMapPath);
  const holdout = await readHeldoutBoundary(heldoutBenchmarkPath);
  const eligible = [];
  const quarantine = [];
  const seen = new Set();
  for (const entry of loaded) {
    const admissionOptions = { semanticAdmission, allowFirstSentenceLexicalCue };
    const auditedRow = withDerivedContractEvidence(entry.row, admissionOptions);
    const assessment = assessCorpusRow(auditedRow, entry.source, admissionOptions);
    if (!assessment.eligible) {
      quarantine.push({ source: entry.source, line: entry.line, issues: assessment.issues });
      continue;
    }
    const { domain, source: domainSource } = inferDomain(auditedRow, domainMap);
    const groupIdentity = explicitGroupIdentity(auditedRow);
    const identityIssues = [
      ...(domain === 'unknown' ? ['missing-domain'] : []),
      ...(!groupIdentity ? ['missing-course-group'] : []),
    ];
    if (identityIssues.length > 0) {
      quarantine.push({ source: entry.source, line: entry.line, issues: identityIssues });
      continue;
    }
    const holdoutIssues = [
      ...(holdout.domainSet.has(domain) ? [`heldout-domain:${domain}`] : []),
      ...(holdout.courseIdSet.has(groupIdentity) ? [`heldout-course-group:${groupIdentity}`] : []),
    ];
    if (holdoutIssues.length > 0) {
      holdout.receipt.excludedPairCount += 1;
      if (holdout.domainSet.has(domain)) holdout.receipt.excludedDomainPairCount += 1;
      if (holdout.courseIdSet.has(groupIdentity)) holdout.receipt.excludedCourseGroupPairCount += 1;
      quarantine.push({ source: entry.source, line: entry.line, issues: holdoutIssues });
      continue;
    }
    const fingerprint = pairFingerprint(auditedRow);
    if (seen.has(fingerprint)) {
      quarantine.push({ source: entry.source, line: entry.line, issues: ['duplicate-pair'] });
      continue;
    }
    seen.add(fingerprint);
    const group = `${domain}:${groupIdentity}`;
    const curatedRow = {
      ...auditedRow,
      context: {
        ...(auditedRow.context && typeof auditedRow.context === 'object' ? auditedRow.context : {}),
        domain,
        courseId: groupIdentity,
        domainSource,
      },
    };
    eligible.push({
      ...entry,
      sourceIndex: sources.indexOf(entry.source),
      row: curatedRow,
      fingerprint,
      group,
      domain,
    });
  }

  const groupSplits = assignGroupSplits(eligible);
  for (const entry of eligible) entry.split = groupSplits.get(entry.group);
  const splitRows = { train: [], valid: [], test: [] };
  for (const entry of eligible) splitRows[entry.split].push(toScionOrpoTrainingRow(entry));
  const domains = [...new Set(eligible.map((entry) => entry.domain).filter((domain) => domain !== 'unknown'))].sort();
  const evidenceCounts = Object.fromEntries(
    [...new Set(eligible.map((entry) => normalize(entry.row?.preferenceEvidence?.kind) || 'missing'))]
      .sort()
      .map((kind) => [
        kind,
        eligible.filter((entry) => (normalize(entry.row?.preferenceEvidence?.kind) || 'missing') === kind).length,
      ]),
  );
  const blindInstructorPairs = Number(evidenceCounts['blind-instructor-preference'] || 0);
  const singleModelJudgePairs = Number(evidenceCounts['single-model-judge-preference'] || 0);
  const instructorDomainCounts = Object.fromEntries(
    domains.map((domain) => [
      domain,
      eligible.filter(
        (entry) =>
          entry.domain === domain && normalize(entry.row?.preferenceEvidence?.kind) === 'blind-instructor-preference',
      ).length,
    ]),
  );
  const blindInstructorDomains = Object.values(instructorDomainCounts).filter((count) => count > 0).length;
  const modelJudgeDomainCounts = Object.fromEntries(
    domains.map((domain) => [
      domain,
      eligible.filter(
        (entry) =>
          entry.domain === domain && normalize(entry.row?.preferenceEvidence?.kind) === 'single-model-judge-preference',
      ).length,
    ]),
  );
  const singleModelJudgeDomains = Object.values(modelJudgeDomainCounts).filter((count) => count > 0).length;
  const groups = [...new Set(eligible.map((entry) => entry.group))];
  const groupHashes = groups.map(stableHash).sort();
  const courseIdHashes = [...new Set(eligible.map((entry) => explicitGroupIdentity(entry.row)))].map(stableHash).sort();
  const splitGroups = Object.fromEntries(
    Object.keys(splitRows).map((split) => [
      split,
      [...new Set(eligible.filter((entry) => entry.split === split).map((entry) => entry.group))].sort(),
    ]),
  );
  const domainGroupCounts = Object.fromEntries(
    domains.map((domain) => [
      domain,
      new Set(eligible.filter((entry) => entry.domain === domain).map((entry) => entry.group)).size,
    ]),
  );
  const splitDomains = Object.fromEntries(
    Object.keys(splitRows).map((split) => [
      split,
      [...new Set(eligible.filter((entry) => entry.split === split).map((entry) => entry.domain))].sort(),
    ]),
  );
  const leakage = Object.entries(splitGroups).flatMap(([split, values]) =>
    values.flatMap((group) =>
      Object.entries(splitGroups)
        .filter(([otherSplit, otherValues]) => otherSplit !== split && otherValues.includes(group))
        .map(([otherSplit]) => ({ group, splits: [split, otherSplit].sort() })),
    ),
  );

  const sharedIssues = [];
  for (const split of ['train', 'valid', 'test'])
    if (splitRows[split].length === 0) sharedIssues.push(`${split}-empty`);
  if (leakage.length > 0) sharedIssues.push('group-leakage');
  const profileGate = ({
    pairs,
    domainCount,
    groupsPerDomain,
    modelJudgePairs,
    modelJudgeDomains,
    modelJudgePairsPerDomain,
  }) => {
    const issues = [...sharedIssues];
    if (eligible.length < pairs) issues.push(`verified-pairs:${eligible.length}<${pairs}`);
    if (domains.length < domainCount) issues.push(`domains:${domains.length}<${domainCount}`);
    if (singleModelJudgePairs < modelJudgePairs) {
      issues.push(`single-model-judge-pairs:${singleModelJudgePairs}<${modelJudgePairs}`);
    }
    const qualifiedModelJudgeDomains = Object.values(modelJudgeDomainCounts).filter(
      (count) => count >= modelJudgePairsPerDomain,
    ).length;
    if (qualifiedModelJudgeDomains < modelJudgeDomains) {
      issues.push(`single-model-judge-qualified-domains:${qualifiedModelJudgeDomains}<${modelJudgeDomains}`);
    }
    for (const [domain, count] of Object.entries(domainGroupCounts)) {
      if (count < groupsPerDomain) issues.push(`domain-groups:${domain}:${count}<${groupsPerDomain}`);
    }
    return { issues, qualifiedModelJudgeDomains };
  };
  const productionGate = profileGate({
    pairs: minimumPairs,
    domainCount: minimumDomains,
    groupsPerDomain: minimumGroupsPerDomain,
    modelJudgePairs: minimumModelJudgePairs,
    modelJudgeDomains: minimumModelJudgeDomains,
    modelJudgePairsPerDomain: minimumModelJudgePairsPerDomain,
  });
  const researchGate = profileGate({
    pairs: researchMinimumPairs,
    domainCount: researchMinimumDomains,
    groupsPerDomain: researchMinimumGroupsPerDomain,
    modelJudgePairs: researchMinimumModelJudgePairs,
    modelJudgeDomains: researchMinimumModelJudgeDomains,
    modelJudgePairsPerDomain: researchMinimumModelJudgePairsPerDomain,
  });
  const productionIssues = productionGate.issues;
  const researchIssues = researchGate.issues;
  const status =
    productionIssues.length === 0
      ? 'ready'
      : allowResearch && researchIssues.length === 0
        ? 'research-ready'
        : allowSmoke && eligible.length > 0
          ? 'smoke-only'
          : 'blocked';
  const gateIssues = status === 'research-ready' ? researchIssues : productionIssues;

  const absoluteOutput = path.resolve(outputDir);
  await fs.mkdir(absoluteOutput, { recursive: true });
  const fileNames = { train: 'train.jsonl', valid: 'valid.jsonl', test: 'test.jsonl' };
  for (const [split, fileName] of Object.entries(fileNames)) {
    const text = splitRows[split].map((row) => JSON.stringify(row)).join('\n');
    await fs.writeFile(path.join(absoluteOutput, fileName), text ? `${text}\n` : '');
  }
  const files = {};
  for (const [split, fileName] of Object.entries(fileNames)) {
    const filePath = path.join(absoluteOutput, fileName);
    const stats = await fs.stat(filePath);
    files[split] = {
      path: fileName,
      bytes: stats.size,
      sha256: await sha256File(filePath),
      rows: splitRows[split].length,
    };
  }
  const manifest = {
    schemaVersion: 4,
    status,
    promotable: status === 'ready',
    primaryPreferenceEvidence: 'single-model-judge',
    generatedAt,
    sources,
    sourceReceipts,
    domainMap: {
      path: domainMapPath,
      entries: Object.keys(domainMap).length,
      ...(Object.keys(domainMap).length > 0 ? { sha256: await sha256File(domainMapPath) } : {}),
    },
    holdoutBoundary: holdout.receipt,
    counts: {
      loaded: loaded.length,
      total: eligible.length,
      quarantined: quarantine.length,
      domains: domains.length,
      groups: groups.length,
      train: splitRows.train.length,
      valid: splitRows.valid.length,
      test: splitRows.test.length,
      trainDomains: splitDomains.train.length,
      validDomains: splitDomains.valid.length,
      testDomains: splitDomains.test.length,
      blindInstructorPairs,
      blindInstructorDomains,
      singleModelJudgePairs,
      singleModelJudgeDomains,
    },
    domains,
    evidenceCounts,
    instructorDomainCounts,
    modelJudgeDomainCounts,
    domainGroupCounts,
    groupIdentity: {
      algorithm: 'sha256-domain-colon-course-id',
      hashes: groupHashes,
      courseIdAlgorithm: 'sha256-course-id',
      courseIdHashes,
    },
    splitIdentity: {
      strategy: 'domain-stratified-hash-v1',
      groups: Object.fromEntries(
        Object.entries(splitGroups).map(([split, splitGroupValues]) => [
          split,
          splitGroupValues.map(stableHash).sort(),
        ]),
      ),
      domains: splitDomains,
    },
    trainingFormat: SCION_ORPO_TRAINING_FORMAT,
    gate: {
      minimumPairs,
      minimumDomains,
      minimumGroupsPerDomain,
      primaryPreferenceEvidence: 'single-model-judge',
      minimumModelJudgePairs,
      minimumModelJudgeDomains,
      minimumModelJudgePairsPerDomain,
      issues: gateIssues,
      profiles: {
        production: {
          minimumPairs,
          minimumDomains,
          minimumGroupsPerDomain,
          minimumModelJudgePairs,
          minimumModelJudgeDomains,
          minimumModelJudgePairsPerDomain,
          qualifiedModelJudgeDomains: productionGate.qualifiedModelJudgeDomains,
          issues: productionIssues,
        },
        research: {
          minimumPairs: researchMinimumPairs,
          minimumDomains: researchMinimumDomains,
          minimumGroupsPerDomain: researchMinimumGroupsPerDomain,
          minimumModelJudgePairs: researchMinimumModelJudgePairs,
          minimumModelJudgeDomains: researchMinimumModelJudgeDomains,
          minimumModelJudgePairsPerDomain: researchMinimumModelJudgePairsPerDomain,
          qualifiedModelJudgeDomains: researchGate.qualifiedModelJudgeDomains,
          issues: researchIssues,
        },
      },
    },
    leakage: { groupOverlapCount: leakage.length, overlaps: leakage },
    files,
    quarantine,
  };
  manifest.identity = {
    protocol: 'scion-adapter-dataset-identity-v2',
    sha256: computeScionAdapterDatasetIdentity(manifest),
  };
  const manifestPath = path.join(absoluteOutput, 'dataset-manifest.json');
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return { manifest, manifestPath };
}

function parseArgs(argv) {
  const args = {
    sources: [],
    outputDir: DEFAULT_OUTPUT,
    minimumPairs: 3000,
    minimumDomains: 5,
    minimumGroupsPerDomain: 3,
    minimumModelJudgePairs: 100,
    minimumModelJudgeDomains: 5,
    minimumModelJudgePairsPerDomain: 20,
    researchMinimumPairs: 100,
    researchMinimumDomains: 4,
    researchMinimumGroupsPerDomain: 3,
    researchMinimumModelJudgePairs: 100,
    researchMinimumModelJudgeDomains: 4,
    researchMinimumModelJudgePairsPerDomain: 20,
    domainMapPath: DEFAULT_DOMAIN_MAP,
    heldoutBenchmarkPath: DEFAULT_HELDOUT_BENCHMARK,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--source') args.sources.push(argv[++index]);
    else if (arg === '--output') args.outputDir = argv[++index];
    else if (arg === '--minimum-pairs') args.minimumPairs = Number(argv[++index]);
    else if (arg === '--minimum-domains') args.minimumDomains = Number(argv[++index]);
    else if (arg === '--minimum-groups-per-domain') args.minimumGroupsPerDomain = Number(argv[++index]);
    else if (arg === '--minimum-model-judge-pairs') args.minimumModelJudgePairs = Number(argv[++index]);
    else if (arg === '--minimum-model-judge-domains') args.minimumModelJudgeDomains = Number(argv[++index]);
    else if (arg === '--minimum-model-judge-pairs-per-domain') {
      args.minimumModelJudgePairsPerDomain = Number(argv[++index]);
    } else if (arg === '--research-minimum-pairs') args.researchMinimumPairs = Number(argv[++index]);
    else if (arg === '--research-minimum-domains') args.researchMinimumDomains = Number(argv[++index]);
    else if (arg === '--research-minimum-groups-per-domain') {
      args.researchMinimumGroupsPerDomain = Number(argv[++index]);
    } else if (arg === '--research-minimum-model-judge-pairs') {
      args.researchMinimumModelJudgePairs = Number(argv[++index]);
    } else if (arg === '--research-minimum-model-judge-domains') {
      args.researchMinimumModelJudgeDomains = Number(argv[++index]);
    } else if (arg === '--research-minimum-model-judge-pairs-per-domain') {
      args.researchMinimumModelJudgePairsPerDomain = Number(argv[++index]);
    } else if (arg === '--domain-map') args.domainMapPath = argv[++index];
    else if (arg === '--heldout-benchmark') args.heldoutBenchmarkPath = argv[++index];
    else if (arg === '--generated-at') args.generatedAt = argv[++index];
    else if (arg === '--allow-smoke') args.allowSmoke = true;
    else if (arg === '--research') args.allowResearch = true;
  }
  if (args.sources.length === 0) args.sources = DEFAULT_SOURCES;
  return args;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const result = await buildScionAdapterDataset(options);
  console.log(`Scion adapter dataset: ${result.manifest.status}`);
  console.log(`Eligible: ${result.manifest.counts.total}/${result.manifest.counts.loaded}`);
  console.log(`Splits: ${result.manifest.counts.train}/${result.manifest.counts.valid}/${result.manifest.counts.test}`);
  console.log(`Manifest: ${result.manifestPath}`);
  if (result.manifest.status === 'blocked') process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
