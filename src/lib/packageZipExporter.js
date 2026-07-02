import { buildReadinessReport, scopeCourseMapToLessons, scopeDeliverableDataToLessons } from './deliverableReadiness';
import { assertOfficeExportHasNoInternalText } from './exportTextInspector';
import { resolveFeatureLabel } from './exporters/exporterUtils.js';
import {
  buildSourceLedgerFromCourseGraph,
  buildSourceReportMarkdown,
  isLicenseAmbiguous,
  isTrustedConceptLinkedSourceLedgerRow,
  isTrustedSourceLedgerRow,
  summarizeSourceLedgerRows,
} from './knowledge/sourceLedger.js';
import { dedupeNumberedAssessmentEcho } from './compilerText.js';
import { safeImport } from './safeImport';
import { normalizePipelineStateWithSourceBackedJudgment } from './sourceBackedJudgment.js';
import { peekVoicePassOutcome } from './voicePass.js';

const MIN_EXPORT_BYTES = 128;
export const DEFAULT_PACKAGE_QUALITY_TIMEOUT_MS = 30000;
const ZIP_GENERATION_OPTIONS = { type: 'blob', compression: 'STORE', streamFiles: true };
const QUALITY_DIMENSION_ORDER = [
  'identity',
  'substance',
  'citations',
  'honesty',
  'discipline',
  'consistency',
  'structure',
  'format',
  'texture',
];
const QUALITY_DIMENSION_WEIGHTS = {
  identity: 20,
  substance: 20,
  citations: 15,
  honesty: 15,
  discipline: 15,
  consistency: 10,
  structure: 10,
  format: 5,
  texture: 10,
};
const SPLIT_BY_LESSON_FEATURES = new Set([
  'lessonPlans',
  'slideDecks',
  'assignments',
  'rubrics',
  'discussions',
  'quizBank',
  'studyGuides',
  'courseFaq',
]);

export class PackageZipExportError extends Error {
  constructor(failures = []) {
    const summary = failures
      .slice(0, 3)
      .map((failure) => failure.message)
      .filter(Boolean)
      .join(' ');
    super(summary || 'ZIP export could not be completed.');
    this.name = 'PackageZipExportError';
    this.failures = failures;
  }
}

export function sanitizeFilePart(value, fallback = 'Course') {
  const cleaned = String(value || '')
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' - ')
    .replace(/(?:\s+-\s*){2,}/g, ' - ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[.\-\s]+|[.\-\s]+$/g, '');
  return cleaned || fallback;
}

function truncateFilePart(value, maxLength = 95) {
  const text = sanitizeFilePart(value, 'Lesson');
  if (text.length <= maxLength) return text;
  return (
    text
      .slice(0, maxLength)
      .replace(/\s+\S*$/, '')
      .replace(/[.\-\s]+$/g, '') || text.slice(0, maxLength)
  );
}

function publicFeatureId(featureId) {
  return featureId?.startsWith('custom_') ? 'custom' : featureId;
}

function getExportPartSize(part) {
  if (!part) return 0;
  if (Number.isFinite(part.size)) return part.size;
  if (Number.isFinite(part.byteLength)) return part.byteLength;
  if (Number.isFinite(part.length)) return part.length;
  if (typeof part === 'string') return new Blob([part]).size;
  return 0;
}

function normalizeFindingSeverity(finding) {
  const severity = String(finding?.severity || finding?.priority || '').toUpperCase();
  return severity === 'P0' || severity === 'P1' || severity === 'P2' ? severity : 'P2';
}

function countQualityFindings(findings = []) {
  const counts = { p0: 0, p1: 0, p2: 0 };
  for (const finding of Array.isArray(findings) ? findings : []) {
    const severity = normalizeFindingSeverity(finding);
    if (severity === 'P0') counts.p0 += 1;
    else if (severity === 'P1') counts.p1 += 1;
    else counts.p2 += 1;
  }
  return counts;
}

function normalizePrecomputedPackageQuality(quality) {
  if (!quality || quality.status !== 'graded') return null;
  const score = Number(quality.score);
  if (!Number.isFinite(score)) return null;
  const findings = Array.isArray(quality.findings) ? quality.findings : [];
  const counted = countQualityFindings(findings);
  const findingCounts = {
    p0: Number.isFinite(quality.findingCounts?.p0) ? quality.findingCounts.p0 : counted.p0,
    p1: Number.isFinite(quality.findingCounts?.p1) ? quality.findingCounts.p1 : counted.p1,
    p2: Number.isFinite(quality.findingCounts?.p2) ? quality.findingCounts.p2 : counted.p2,
  };
  const dimensions = quality.dimensions && typeof quality.dimensions === 'object' ? quality.dimensions : {};
  const texture =
    quality.texture && Number.isFinite(quality.texture.score)
      ? {
          version: quality.texture.version || null,
          score: quality.texture.score,
          subScores: quality.texture.subScores || null,
        }
      : null;
  const block = {
    status: 'graded',
    score,
    grade: quality.grade || 'A',
    graderVersion: quality.graderVersion || 'precomputed-finish-pass',
    findingCounts,
    dimensions,
    gradedAt: quality.gradedAt || new Date().toISOString(),
    ...(texture ? { texture } : {}),
  };
  return {
    block,
    findings,
    grades: quality.grades && typeof quality.grades === 'object' ? quality.grades : {},
    fileCount: Number.isFinite(quality.fileCount) ? quality.fileCount : null,
  };
}

function normalizePackagePathForQuality(value) {
  return String(value || '')
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .trim();
}

function precomputedQualityReferencesMissingPackageFiles(precomputed, fileContents = {}) {
  const knownFiles = new Set(Object.keys(fileContents || {}).map(normalizePackagePathForQuality));
  const virtualFiles = new Set([
    '',
    'run digest',
    'console log',
    'browser console',
    'quality report',
    'SOURCE_REPORT.md',
  ]);
  return (Array.isArray(precomputed?.findings) ? precomputed.findings : []).some((finding) => {
    const file = normalizePackagePathForQuality(finding?.file || finding?.path || '');
    if (!file || virtualFiles.has(file)) return false;
    if (/^run digest$/i.test(file) || /^console/i.test(file)) return false;
    return !knownFiles.has(file);
  });
}

function renderPrecomputedQualityReport(precomputed, { courseTitle = 'Course' } = {}) {
  if (!precomputed?.block) return '';
  const quality = precomputed.block;
  const counts = quality.findingCounts || { p0: 0, p1: 0, p2: 0 };
  const findingCount = counts.p0 + counts.p1 + counts.p2;
  const lines = [];
  lines.push(`# Crucible Deep Quality Report - ${courseTitle}`);
  lines.push('');
  lines.push(
    `**Overall: ${quality.score}/100 (${quality.grade})** · ${findingCount} findings (${counts.p0} P0 · ${counts.p1} P1 · ${counts.p2} P2)${precomputed.fileCount ? ` · ${precomputed.fileCount} files` : ''}`,
  );
  lines.push('');
  lines.push(
    'This report uses the verified finish-pass quality result already shown in the workspace. The downloaded ZIP can still be independently regraded from its files.',
  );
  lines.push('');
  lines.push('## Scores');
  lines.push('');
  lines.push('| Dimension | Weight | Score | Grade |');
  lines.push('| --- | ---: | ---: | :---: |');
  for (const dimension of QUALITY_DIMENSION_ORDER) {
    const score = quality.dimensions?.[dimension];
    const grade = precomputed.grades?.[dimension] || '';
    if (!Number.isFinite(score)) continue;
    lines.push(`| ${dimension} | ${QUALITY_DIMENSION_WEIGHTS[dimension]} | ${score} | ${grade} |`);
  }
  lines.push(
    `| **overall** | ${Object.values(QUALITY_DIMENSION_WEIGHTS).reduce((sum, value) => sum + value, 0)} | **${quality.score}** | **${quality.grade}** |`,
  );
  lines.push('');
  lines.push('## Findings');
  lines.push('');
  for (const severity of ['P0', 'P1', 'P2']) {
    const group = precomputed.findings.filter((finding) => normalizeFindingSeverity(finding) === severity);
    lines.push(`### ${severity} (${group.length})`);
    if (group.length === 0) {
      lines.push('');
      lines.push('_None._');
      lines.push('');
      continue;
    }
    for (const finding of group) {
      const dimension = finding.dimension || 'quality';
      const detail = finding.detail || finding.message || finding.title || 'Quality finding';
      lines.push(`- **[${dimension}] ${detail}**`);
      if (finding.file || finding.id) {
        lines.push(`  - file: \`${finding.file || '-'}\` · id: ${finding.id || '-'}`);
      }
      if (finding.evidence)
        lines.push(`  - evidence: \`${String(finding.evidence).replace(/`/g, "'").slice(0, 200)}\``);
    }
    lines.push('');
  }
  return lines.join('\n');
}

async function getZipFileContent(part) {
  if (part && typeof part.arrayBuffer === 'function') return await part.arrayBuffer();
  return part;
}

function createFailure(featureId, format, message, extra = {}) {
  return {
    featureId,
    label: resolveFeatureLabel(featureId),
    format,
    message,
    ...extra,
  };
}

function addRequiredFile(
  zip,
  files,
  failures,
  path,
  content,
  { featureId, format, minBytes = MIN_EXPORT_BYTES, fileContents = null } = {},
) {
  const size = getExportPartSize(content);
  if (size < minBytes) {
    failures.push(
      createFailure(
        featureId,
        format,
        `${resolveFeatureLabel(featureId)} ${String(format || 'file').toUpperCase()} export was empty.`,
        { path, size },
      ),
    );
    return false;
  }
  zip.file(path, content);
  if (fileContents) fileContents[path] = content;
  files.push({ path, featureId: publicFeatureId(featureId), label: resolveFeatureLabel(featureId), format, size });
  return true;
}

async function addRequiredOfficeFile(
  zip,
  files,
  failures,
  path,
  content,
  { featureId, format, minBytes = MIN_EXPORT_BYTES, fileContents = null } = {},
) {
  const size = getExportPartSize(content);
  if (size < minBytes) {
    failures.push(
      createFailure(
        featureId,
        format,
        `${resolveFeatureLabel(featureId)} ${String(format || 'file').toUpperCase()} export was empty.`,
        { path, size },
      ),
    );
    return false;
  }

  try {
    await assertOfficeExportHasNoInternalText(content, format, resolveFeatureLabel(featureId));
  } catch (err) {
    failures.push(
      createFailure(
        featureId,
        format,
        err?.message?.includes('exposes internal')
          ? err.message
          : `${resolveFeatureLabel(featureId)} ${String(format || 'file').toUpperCase()} export could not be inspected: ${err?.message || 'Unknown error.'}`,
        { path, size },
      ),
    );
    return false;
  }

  const zipContent = await getZipFileContent(content);
  zip.file(path, zipContent);
  if (fileContents) fileContents[path] = zipContent;
  files.push({ path, featureId: publicFeatureId(featureId), label: resolveFeatureLabel(featureId), format, size });
  return true;
}

function getRequestedFeatureIds(featureIds, deliverables) {
  const requested =
    Array.isArray(featureIds) && featureIds.length > 0 ? featureIds : ['courseMap', ...Object.keys(deliverables || {})];
  return [...new Set(requested.filter(Boolean))];
}

function getLessonIndicesForZip(courseMap, lessonFilter) {
  const lessons = Array.isArray(courseMap?.lessons) ? courseMap.lessons : [];
  if (Array.isArray(lessonFilter)) {
    return lessonFilter.filter((index) => Number.isInteger(index) && index >= 0 && index < lessons.length);
  }
  return lessons.map((_, index) => index);
}

function lessonFileStem(courseMap, lessonIndex) {
  const lesson = Array.isArray(courseMap?.lessons) ? courseMap.lessons[lessonIndex] : null;
  const title = lesson?.title || lesson?.lessonTitle || lesson?.lt || `Lesson ${lessonIndex + 1}`;
  const withoutPrefix = String(title || '')
    .replace(/^(?:lesson|week)\s*\d+\s*[:.-]?\s*/i, '')
    .trim();
  const safeTitle = truncateFilePart(withoutPrefix || title || `Lesson ${lessonIndex + 1}`);
  return `Lesson ${String(lessonIndex + 1).padStart(2, '0')} - ${safeTitle}`;
}

// v0.14.1 (3.3d): the manifest's assessment registry — every map-promised
// assessment with its kind, lesson, weight, and the package file that
// fulfills it (briefs/orals → the lesson's Assignment Briefs docx, exams →
// the lesson's Quiz & Exam Bank docx, in-class → the Lesson Plans listing).
function buildManifestAssessments({ registry, files }) {
  if (!Array.isArray(registry) || registry.length === 0) return null;
  const fileFor = (featureId, lessonNumber) => {
    const prefix = `Lesson ${String(lessonNumber).padStart(2, '0')} - `;
    return (
      files.find((file) => file.featureId === featureId && file.path.split('/').pop().startsWith(prefix))?.path || null
    );
  };
  return registry
    .filter((assessment) => assessment?.title && Number.isInteger(assessment?.dueSession))
    .map((assessment) => {
      const kind = assessment.kind || 'graded-artifact';
      const artifact =
        kind === 'exam'
          ? fileFor('quizBank', assessment.dueSession)
          : kind === 'in-class'
            ? fileFor('lessonPlans', assessment.dueSession)
            : fileFor('assignments', assessment.dueSession);
      return {
        id: assessment.id || '',
        // v0.15.187: legacy saved graphs can carry "Title: 1. Title"
        // transcription echoes — the manifest must present the same deduped
        // identity the compiler renders, or the grader searches artifacts
        // for a string no document contains (exam-content P0).
        title: dedupeNumberedAssessmentEcho(assessment.title),
        kind,
        lesson: assessment.dueSession,
        weightPct: Number.isFinite(assessment.weightPct) ? assessment.weightPct : null,
        artifact,
        ...(kind === 'in-class' ? { note: 'in-class activity — listed in the lesson plan' } : {}),
      };
    });
}

// v0.14.5 (A5): the manifest's readings registry — every instructor-named
// reading with its verbatim title, lesson, kind, and provenance tag.
// Provenance vocabulary: 'instructor-named' (extracted from the syllabus
// text) | 'instructor-provided' (the A3 reading-list upload path sets
// instructorProvided: true). Strictly additive: no registry → no key.
function buildManifestReadings(registry) {
  if (!Array.isArray(registry) || registry.length === 0) return null;
  const entries = registry
    .filter(
      (reading) => reading && typeof reading === 'object' && reading.title && Number.isInteger(reading.dueSession),
    )
    .map((reading) => ({
      id: reading.id || '',
      title: reading.title,
      lesson: reading.dueSession,
      kind: reading.kind || 'other',
      provenance: reading.instructorProvided === true ? 'instructor-provided' : 'instructor-named',
    }));
  return entries.length > 0 ? entries : null;
}

function buildManifestCourseIRProof(courseGraph, { sourceRefCoverage = null } = {}) {
  if (!courseGraph?.courseIR && !courseGraph?.nativeRepair && !sourceRefCoverage) return null;
  const proof = {};
  if (courseGraph?.courseIR) {
    proof.version = courseGraph.courseIR.version || '';
    proof.lessonCount = Array.isArray(courseGraph.courseIR.lessonIds) ? courseGraph.courseIR.lessonIds.length : 0;
    proof.conceptCount = Array.isArray(courseGraph.courseIR.conceptIds) ? courseGraph.courseIR.conceptIds.length : 0;
    proof.assessmentCount = Array.isArray(courseGraph.courseIR.assessmentIds)
      ? courseGraph.courseIR.assessmentIds.length
      : 0;
    if (Array.isArray(courseGraph.courseIR.sourceLedger)) {
      proof.sourceLedgerRows = courseGraph.courseIR.sourceLedger.length;
    }
    if (courseGraph.courseIR.sourceRefCoverage) {
      proof.sourceRefCoverage = courseGraph.courseIR.sourceRefCoverage;
    }
    if (courseGraph.courseIR.sourceRefBridge) {
      proof.sourceRefBridge = {
        source: courseGraph.courseIR.sourceRefBridge.source || '',
        trustedRows: Number(courseGraph.courseIR.sourceRefBridge.trustedRows) || 0,
        conceptLinkedRows: Number(courseGraph.courseIR.sourceRefBridge.conceptLinkedRows) || 0,
        replacedReviewRows: Number(courseGraph.courseIR.sourceRefBridge.replacedReviewRows) || 0,
      };
    }
    if (courseGraph.courseIR.nativeAssembly) {
      proof.nativeAssembly = {
        source: courseGraph.courseIR.nativeAssembly.source || '',
        projectedThrough: courseGraph.courseIR.nativeAssembly.projectedThrough || '',
        editedAfterProjection: Boolean(courseGraph.courseIR.nativeAssembly.editedAfterProjection),
      };
    }
    if (courseGraph.courseIR.directAuthoring) {
      proof.directAuthoring = {
        source: courseGraph.courseIR.directAuthoring.source || '',
        projectedThrough: courseGraph.courseIR.directAuthoring.projectedThrough || '',
        accepted: Boolean(courseGraph.courseIR.directAuthoring.accepted),
      };
    }
    if (courseGraph.courseIR.sourceProofFallback) {
      proof.sourceProofFallback = {
        source: courseGraph.courseIR.sourceProofFallback.source || '',
        projectedThrough: courseGraph.courseIR.sourceProofFallback.projectedThrough || '',
        reason: courseGraph.courseIR.sourceProofFallback.reason || '',
      };
    }
  }
  if (courseGraph?.nativeRepair) {
    proof.nativeRepair = {
      code: courseGraph.nativeRepair.code || '',
      source: courseGraph.nativeRepair.source || '',
      courseIRVersion: courseGraph.nativeRepair.courseIRVersion || '',
      stats: courseGraph.nativeRepair.stats || null,
      readinessRepairedFieldCount: Number(courseGraph.nativeRepair.readinessRepairedFieldCount) || 0,
    };
  }
  if (!proof.sourceRefCoverage && sourceRefCoverage) proof.sourceRefCoverage = sourceRefCoverage;
  return proof;
}

function sourceLedgerRowKey(row = {}) {
  return `${row.id || ''}|${row.doi || ''}|${row.url || ''}|${row.title || row.evidence || ''}`.toLowerCase();
}

function normalizeSourceIdentity(value = '') {
  return cleanSourceText(value, 600)
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, 'doi:')
    .replace(/[?#].*$/g, '')
    .replace(/\/+$/g, '')
    .toLowerCase();
}

function normalizeSourceFingerprintText(value = '', maxLength = 600) {
  let text = cleanSourceText(value, maxLength);
  for (let index = 0; index < 3; index += 1) {
    text = text.replace(/&amp;/gi, '&').replace(/&nbsp;/gi, ' ');
  }
  return text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['"‘’“”`]/g, '')
    .replace(/[^a-z0-9]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function normalizeSourceFingerprintAuthors(value = '') {
  const authors = Array.isArray(value)
    ? value
    : cleanSourceText(value, 320)
        .split(/\s*;\s*|\s+\|\s+|\s+and\s+|,\s+(?=[A-Z][a-z]+(?:\s+[A-Z]\.)?(?:\s|$))/)
        .filter(Boolean);
  return authors
    .map((author) => normalizeSourceFingerprintText(author, 140))
    .filter(Boolean)
    .slice(0, 6)
    .join(',');
}

function sourceLedgerWorkFingerprintKeys(row = {}) {
  const title = normalizeSourceFingerprintText(row.title || row.citation || '', 260);
  if (!title || title.length < 12 || /^(?:source|article|reading|course resource|course materials?)$/.test(title)) {
    return [];
  }
  const authors = normalizeSourceFingerprintAuthors(row.authors || row.author || row.creators || '');
  const evidence = normalizeSourceFingerprintText(row.evidence || row.snippet || row.abstract || '', 220);
  const keys = [];
  if (authors) keys.push(`work:${title}|authors:${authors}`);
  if (authors && evidence.length >= 24)
    keys.push(`work-evidence:${title}|authors:${authors}|${evidence.slice(0, 140)}`);
  else if (!authors && evidence.length >= 90) keys.push(`work-evidence:${title}|${evidence.slice(0, 140)}`);
  return keys;
}

function sourceLedgerIdentityKeys(row = {}) {
  const strongKeys = [
    row.doi ? `doi:${normalizeSourceIdentity(row.doi).replace(/^doi:/, '')}` : '',
    row.url ? `url:${normalizeSourceIdentity(row.url)}` : '',
  ].filter(Boolean);
  const workKeys = sourceLedgerWorkFingerprintKeys(row);
  if (strongKeys.length > 0 || workKeys.length > 0) return [...strongKeys, ...workKeys];
  const title = normalizeSourceIdentity(row.title || row.citation || row.evidence || '');
  return title ? [`title:${title}`] : [];
}

function sourceLedgerRowStrength(row = {}) {
  const provider = cleanSourceText(row.provider, 80).toLowerCase();
  const license = cleanSourceText(row.license, 180);
  return (
    (row.url || row.doi ? 24 : 0) +
    (license && !isLicenseAmbiguous(license) ? 24 : license ? 4 : 0) +
    (provider && !['syllabus', 'course-resource', 'course-map', 'resource'].includes(provider) ? 10 : 0) +
    (Array.isArray(row.conceptLinks) && row.conceptLinks.length > 0 ? 6 : 0) +
    (!/^syllabus-src-/i.test(cleanSourceText(row.id, 120)) ? 2 : 0)
  );
}

function mergeConceptLinks(...rows) {
  const seen = new Set();
  const links = [];
  for (const row of rows) {
    for (const link of row?.conceptLinks || []) {
      const id = cleanSourceText(link?.id || '', 120);
      const label = cleanSourceText(link?.label || '', 160);
      const key = `${id}|${label}`.toLowerCase();
      if ((!id && !label) || seen.has(key)) continue;
      seen.add(key);
      links.push({ ...(id ? { id } : {}), ...(label ? { label } : {}) });
    }
  }
  return links;
}

function mergeSourceLedgerRows(existing, incoming) {
  const [stronger, weaker] =
    sourceLedgerRowStrength(incoming) > sourceLedgerRowStrength(existing) ? [incoming, existing] : [existing, incoming];
  const conceptLinks = mergeConceptLinks(stronger, weaker);
  return {
    ...stronger,
    ...(conceptLinks.length > 0 ? { conceptLinks } : {}),
  };
}

function appendMergedSourceRow(rows, keyIndex, row) {
  const identityKeys = sourceLedgerIdentityKeys(row);
  const existingIndex = identityKeys.map((key) => keyIndex.get(key)).find((index) => Number.isInteger(index));
  if (Number.isInteger(existingIndex)) {
    rows[existingIndex] = mergeSourceLedgerRows(rows[existingIndex], row);
    for (const key of sourceLedgerIdentityKeys(rows[existingIndex])) keyIndex.set(key, existingIndex);
    return;
  }
  const fallbackKey = sourceLedgerRowKey(row);
  if (!fallbackKey.trim()) return;
  const nextIndex = rows.length;
  rows.push(row);
  const keys = identityKeys.length > 0 ? identityKeys : [fallbackKey];
  for (const key of keys) keyIndex.set(key, nextIndex);
}

function mergeSourceLedgerBundles(...bundles) {
  const rows = [];
  const reviewRows = [];
  const rowKeyIndex = new Map();
  const reviewKeyIndex = new Map();
  for (const bundle of bundles) {
    for (const row of bundle?.rows || []) {
      appendMergedSourceRow(rows, rowKeyIndex, row);
    }
  }
  for (const bundle of bundles) {
    for (const row of bundle?.reviewRows || []) {
      const identityKeys = sourceLedgerIdentityKeys(row);
      if (identityKeys.some((key) => rowKeyIndex.has(key))) continue;
      appendMergedSourceRow(reviewRows, reviewKeyIndex, row);
    }
  }
  if (rows.length === 0 && reviewRows.length === 0) return null;
  return {
    rows,
    ...(reviewRows.length > 0 ? { reviewRows } : {}),
    summary: {
      ...summarizeSourceLedgerRows(rows),
      ...(reviewRows.length > 0 ? { reviewRequiredCount: reviewRows.length } : {}),
    },
  };
}

function hasSourceLedgerRows(bundle) {
  return Boolean((bundle?.rows || []).length || (bundle?.reviewRows || []).length);
}

function trustedConceptLinkedSourceLedgerRowCount(bundle) {
  return (bundle?.rows || []).filter(isTrustedConceptLinkedSourceLedgerRow).length;
}

function sourceCoverageTotal(coverage) {
  const explicit = Number(coverage?.totals?.total);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  return Object.values(coverage?.categories || {}).reduce((sum, category) => sum + (Number(category?.total) || 0), 0);
}

function sourceCoverageLedgerRows(coverage) {
  const explicit = Number(coverage?.sourceLedgerRows);
  return Number.isFinite(explicit) && explicit >= 0 ? explicit : null;
}

function bridgeCourseIRSourceProofToTrustedLedger(courseGraph, sourceLedgerBundle, sourceRefCoverage) {
  const trustedRows = (sourceLedgerBundle?.rows || []).filter(isTrustedSourceLedgerRow);
  const trustedConceptLinkedRows = trustedRows.filter(isTrustedConceptLinkedSourceLedgerRow);
  const reviewRows = sourceLedgerBundle?.reviewRows || [];
  const coverageTotal = sourceCoverageTotal(sourceRefCoverage);
  const coverageLedgerRows = sourceCoverageLedgerRows(sourceRefCoverage);
  const coverageMissing = Number(sourceRefCoverage?.totals?.missing) || 0;
  const coverageDanglingRefs = Number(sourceRefCoverage?.totals?.danglingRefs) || 0;
  if (
    !courseGraph?.courseIR ||
    trustedConceptLinkedRows.length <= 1 ||
    coverageTotal <= 0 ||
    coverageLedgerRows === null
  ) {
    return {
      courseGraph,
      sourceLedgerBundle,
      sourceRefCoverage,
      bridged: false,
    };
  }
  if (coverageLedgerRows > 1 || reviewRows.length === 0 || coverageMissing > 0 || coverageDanglingRefs > 0) {
    return {
      courseGraph,
      sourceLedgerBundle,
      sourceRefCoverage,
      bridged: false,
    };
  }
  const nextCoverage = {
    ...sourceRefCoverage,
    sourceLedgerRows: trustedConceptLinkedRows.length,
    bridge: {
      source: 'coursegraph-concept-linked-ledger',
      trustedRows: trustedConceptLinkedRows.length,
      candidateTrustedRows: trustedRows.length,
      conceptLinkedRows: trustedConceptLinkedRows.length,
      replacedReviewRows: reviewRows.length,
    },
  };
  const nextCourseGraph = {
    ...(courseGraph || {}),
    courseIR: {
      ...(courseGraph.courseIR || {}),
      sourceLedger: trustedConceptLinkedRows,
      sourceRefCoverage: nextCoverage,
      sourceRefBridge: nextCoverage.bridge,
    },
  };
  return {
    courseGraph: nextCourseGraph,
    sourceLedgerBundle: {
      rows: trustedRows,
      summary: summarizeSourceLedgerRows(trustedRows),
    },
    sourceRefCoverage: nextCoverage,
    bridged: true,
  };
}

async function buildCourseIRSourceProofFallback(courseMap) {
  if (!courseMap?.lessons) return null;
  try {
    const { buildCourseIRFromCourseMap, courseIRToCourseGraph, validateCourseIR } = await safeImport(
      () => import('./courseIR.js'),
    );
    const courseIR = buildCourseIRFromCourseMap(courseMap);
    const validation = validateCourseIR(courseIR);
    const projection = courseIRToCourseGraph(validation.ir || courseIR);
    return {
      graph: {
        ...projection.graph,
        courseIR: {
          ...(projection.graph?.courseIR || {}),
          stats: validation.stats || null,
          sourceProofFallback: {
            source: 'export-course-map',
            projectedThrough: 'curriculumv1',
            reason: 'source-backed pipeline proof was missing from the export graph',
          },
        },
      },
      sourceRefCoverage: projection.graph?.courseIR?.sourceRefCoverage || null,
    };
  } catch {
    return null;
  }
}

function pipelineExpectsSourceLedgerProof(pipelineState) {
  if (!pipelineState || typeof pipelineState !== 'object') return false;
  const text = Object.values(pipelineState)
    .map((value) => (typeof value === 'string' ? value : JSON.stringify(value || '')))
    .join(' ')
    .toLowerCase();
  return /\b(?:genome|openalex|openlibrary|openstax|source-finder|source ledger|sourceref|source ref|knowledgebackbone|citation|limited knowledge check|native authoring|courseir)\b/.test(
    text,
  );
}

const UX_COURSE_CONTEXT_RE =
  /\b(?:user\s+experience|ux\b|human[-\s]?centered\s+design|interaction\s+design|interface\s+design|usability|design\s+studio|design\s+research|user\s+research|prototype|accessibility)\b/i;
const PYTHON_COURSE_CONTEXT_RE =
  /\b(?:python|computer\s+science|programming|coding|variables?|data\s+types?|expressions?|conditionals?|loops?|functions?|lists?|dictionar(?:y|ies)|strings?|file\s+(?:input|output|i\/o)|debugg(?:ing)?|testing|algorithms?|recursion|object[-\s]?oriented|classes?|objects?)\b/i;

const CURATED_UX_SOURCE_PROOF_ROWS = [
  {
    id: 'ux-curated-user-experience',
    title: 'User experience',
    url: 'https://en.wikipedia.org/wiki/User_experience',
    concepts: ['user experience', 'usability', 'user need'],
    trigger: /\b(?:user\s+experience|ux\b|usability|user\s+needs?|context\s+of\s+use)\b/i,
  },
  {
    id: 'ux-curated-usability-testing',
    title: 'Usability testing',
    url: 'https://en.wikipedia.org/wiki/Usability_testing',
    concepts: ['usability testing', 'test plan', 'findings'],
    trigger: /\b(?:usability\s+testing|test\s+plans?|task\s+scenarios?|findings?|evidence\s+check)\b/i,
  },
  {
    id: 'ux-curated-web-accessibility',
    title: 'Web accessibility',
    url: 'https://en.wikipedia.org/wiki/Web_accessibility',
    concepts: ['accessibility', 'evaluation', 'remediation'],
    trigger: /\b(?:accessibility|inclusive\s+design|evaluation|remediation)\b/i,
  },
  {
    id: 'ux-curated-user-centered-design',
    title: 'User-centered design',
    url: 'https://en.wikipedia.org/wiki/User-centered_design',
    concepts: ['user-centered design', 'design process', 'iteration'],
    trigger: /\b(?:user[-\s]?centered\s+design|human[-\s]?centered\s+design|design\s+process|iteration|revision)\b/i,
  },
  {
    id: 'ux-curated-software-prototyping',
    title: 'Software prototyping',
    url: 'https://en.wikipedia.org/wiki/Software_prototyping',
    concepts: ['prototype review', 'iteration', 'feedback'],
    trigger: /\b(?:prototyp|prototype\s+review|feedback|revision)\b/i,
  },
];

const CURATED_PYTHON_SOURCE_PROOF_ROWS = [
  {
    id: 'python-openstax-variables',
    title: 'OpenStax Introduction to Python Programming section 1.3 Variables',
    url: 'https://openstax.org/books/introduction-python-programming/pages/1-3-variables',
    concepts: ['variables', 'data types'],
    trigger: /\b(?:variables?|data\s+types?)\b/i,
  },
  {
    id: 'python-openstax-expressions',
    title: 'OpenStax Introduction to Python Programming section 1.5 Number basics',
    url: 'https://openstax.org/books/introduction-python-programming/pages/1-5-number-basics',
    concepts: ['expressions', 'operators', 'numeric data'],
    trigger: /\b(?:expressions?|operators?|numeric|numbers?)\b/i,
  },
  {
    id: 'python-openstax-conditionals',
    title: 'OpenStax Introduction to Python Programming section 4.2 If-else statements',
    url: 'https://openstax.org/books/introduction-python-programming/pages/4-2-if-else-statements',
    concepts: ['conditionals', 'if statements', 'boolean logic'],
    trigger: /\b(?:conditionals?|if\s+statements?|boolean)\b/i,
  },
  {
    id: 'python-openstax-loops',
    title: 'OpenStax Introduction to Python Programming section 5.1 While loop',
    url: 'https://openstax.org/books/introduction-python-programming/pages/5-1-while-loop',
    concepts: ['loops', 'while loops', 'iteration'],
    trigger: /\b(?:loops?|iteration|while|for\s+loop)\b/i,
  },
  {
    id: 'python-openstax-functions',
    title: 'OpenStax Introduction to Python Programming section 6.1 Defining functions',
    url: 'https://openstax.org/books/introduction-python-programming/pages/6-1-defining-functions',
    concepts: ['functions', 'parameters', 'return values'],
    trigger: /\b(?:functions?|parameters?|return\s+values?)\b/i,
  },
  {
    id: 'python-openstax-lists',
    title: 'OpenStax Introduction to Python Programming section 3.4 List basics',
    url: 'https://openstax.org/books/introduction-python-programming/pages/3-4-list-basics',
    concepts: ['lists', 'sequences', 'iteration'],
    trigger: /\b(?:lists?|sequences?)\b/i,
  },
  {
    id: 'python-openstax-dictionaries',
    title: 'OpenStax Introduction to Python Programming section 10.1 Dictionary basics',
    url: 'https://openstax.org/books/introduction-python-programming/pages/10-1-dictionary-basics',
    concepts: ['dictionaries', 'key-value pairs', 'mapping'],
    trigger: /\b(?:dictionar(?:y|ies)|key[-\s]?value|mapping)\b/i,
  },
  {
    id: 'python-openstax-strings',
    title: 'OpenStax Introduction to Python Programming section 8.1 String operations',
    url: 'https://openstax.org/books/introduction-python-programming/pages/8-1-string-operations',
    concepts: ['strings', 'text processing', 'string methods'],
    trigger: /\b(?:strings?|text\s+processing|string\s+methods?)\b/i,
  },
  {
    id: 'python-openstax-files',
    title: 'OpenStax Introduction to Python Programming section 14.1 Reading from files',
    url: 'https://openstax.org/books/introduction-python-programming/pages/14-1-reading-from-files',
    concepts: ['file input', 'file output', 'exceptions'],
    trigger: /\b(?:file\s+(?:input|output|i\/o)|read(?:ing)?\s+files?|writ(?:ing|e)\s+files?|exceptions?)\b/i,
  },
  {
    id: 'python-openstax-oop',
    title: 'OpenStax Introduction to Python Programming section 11.2 Classes and instances',
    url: 'https://openstax.org/books/introduction-python-programming/pages/11-2-classes-and-instances',
    concepts: ['classes', 'objects', 'object-oriented programming'],
    trigger: /\b(?:object[-\s]?oriented|classes?|objects?)\b/i,
  },
  {
    id: 'python-openstax-recursion',
    title: 'OpenStax Introduction to Python Programming section 12.1 Recursion basics',
    url: 'https://openstax.org/books/introduction-python-programming/pages/12-1-recursion-basics',
    concepts: ['recursion', 'base cases', 'recursive functions'],
    trigger: /\b(?:recursion|recursive|base\s+cases?)\b/i,
  },
  {
    id: 'python-openstax-errors',
    title: 'OpenStax Introduction to Python Programming section 1.6 Error messages',
    url: 'https://openstax.org/books/introduction-python-programming/pages/1-6-error-messages',
    concepts: ['debugging', 'error messages', 'testing'],
    trigger: /\b(?:debugg(?:ing)?|errors?|testing|trace)\b/i,
  },
];

function collectCourseContextText({ courseName, courseMap, courseGraph, fallbackCourseGraph }) {
  const graphTexts = [courseGraph, fallbackCourseGraph].flatMap((graph) => {
    if (!graph || typeof graph !== 'object') return [];
    return [
      graph.course?.name,
      graph.course?.title,
      graph.courseName,
      graph.title,
      ...(graph.concepts || []).map((concept) => concept?.term || concept?.title || ''),
      ...(graph.sessions || []).flatMap((session) => [
        session?.title || '',
        ...(session?.sections || []).map((section) => section?.topic || ''),
      ]),
    ];
  });
  const mapTexts = [
    courseName,
    courseMap?.courseName,
    ...(courseMap?.lessons || []).flatMap((lesson) => [
      lesson?.title,
      lesson?.lessonTitle,
      ...(lesson?.sections || []).flatMap((section) => [
        section?.topicSection,
        section?.topic,
        section?.learningObjectives,
        section?.learningGoals,
        section?.asynchronousActivities,
        section?.synchronousActivities,
      ]),
    ]),
  ];
  return [...mapTexts, ...graphTexts].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

function buildCuratedUxSourceProofGraph({ courseName, courseMap, courseGraph, fallbackCourseGraph }) {
  const context = collectCourseContextText({ courseName, courseMap, courseGraph, fallbackCourseGraph });
  if (!UX_COURSE_CONTEXT_RE.test(context)) return null;
  let selected = CURATED_UX_SOURCE_PROOF_ROWS.filter((row) => row.trigger.test(context));
  if (selected.length < 2) selected = CURATED_UX_SOURCE_PROOF_ROWS.slice(0, 3);

  const conceptIdByTerm = new Map();
  const concepts = [];
  const conceptIdForTerm = (term) => {
    const key = cleanSourceText(term, 120).toLowerCase();
    if (!key) return '';
    if (conceptIdByTerm.has(key)) return conceptIdByTerm.get(key);
    const id = `ux-curated-concept-${concepts.length + 1}`;
    conceptIdByTerm.set(key, id);
    concepts.push({ id, term: cleanSourceText(term, 120) });
    return id;
  };

  const resources = selected.map((row) => ({
    id: row.id,
    title: row.title,
    provider: 'wikipedia',
    origin: 'wikipedia',
    kind: 'licensed UX background source',
    url: row.url,
    license: 'CC BY-SA 4.0',
    evidence: row.title,
    sessionRefs: ['ux-curated-source-proof'],
  }));
  const sections = selected.map((row, index) => ({
    id: `ux-curated-source-section-${index + 1}`,
    topic: row.concepts[0],
    conceptRefs: row.concepts.map(conceptIdForTerm).filter(Boolean),
    resourceRefs: [row.id],
  }));

  return {
    course: { name: courseName },
    courseName,
    concepts,
    resources,
    readings: [],
    sessions: [
      {
        id: 'ux-curated-source-proof',
        number: 1,
        title: 'UX source proof',
        sections,
      },
    ],
  };
}

function buildCuratedPythonSourceProofGraph({ courseName, courseMap, courseGraph, fallbackCourseGraph }) {
  const context = collectCourseContextText({ courseName, courseMap, courseGraph, fallbackCourseGraph });
  if (!PYTHON_COURSE_CONTEXT_RE.test(context)) return null;
  let selected = CURATED_PYTHON_SOURCE_PROOF_ROWS.filter((row) => row.trigger.test(context));
  if (selected.length < 4) selected = CURATED_PYTHON_SOURCE_PROOF_ROWS.slice(0, 6);

  const conceptIdByTerm = new Map();
  const concepts = [];
  const conceptIdForTerm = (term) => {
    const key = cleanSourceText(term, 120).toLowerCase();
    if (!key) return '';
    if (conceptIdByTerm.has(key)) return conceptIdByTerm.get(key);
    const id = `python-curated-concept-${concepts.length + 1}`;
    conceptIdByTerm.set(key, id);
    concepts.push({ id, term: cleanSourceText(term, 120) });
    return id;
  };

  const resources = selected.map((row, index) => ({
    id: row.id,
    title: row.title,
    provider: 'openstax',
    origin: 'openstax',
    kind: 'open textbook section',
    url: row.url,
    license: 'CC BY 4.0',
    evidence: row.title,
    attribution: 'OpenStax, Rice University',
    sessionRefs: [`python-curated-source-proof-${index + 1}`],
  }));
  const sessions = selected.map((row, index) => ({
    id: `python-curated-source-proof-${index + 1}`,
    number: index + 1,
    title: `Python source proof: ${row.concepts[0]}`,
    sections: [
      {
        id: `python-curated-source-section-${index + 1}`,
        topic: row.concepts[0],
        conceptRefs: row.concepts.map(conceptIdForTerm).filter(Boolean),
        resourceRefs: [row.id],
      },
    ],
  }));

  return {
    course: { name: courseName },
    courseName,
    concepts,
    resources,
    readings: [],
    sessions,
  };
}

function cleanSourceText(value, maxLength = 1200) {
  const text = String(value ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return '';
  return text.length > maxLength
    ? text
        .slice(0, maxLength)
        .replace(/\s+\S*$/, '')
        .trim()
    : text;
}

function unwrapSyllabusDeliverable(deliverables) {
  const data = deliverables?.syllabus?.data;
  if (!data || typeof data !== 'object') return null;
  return data.syllabus && typeof data.syllabus === 'object' ? data.syllabus : data;
}

function weekNumberFromScheduleRow(row) {
  const explicit = Number(row?.weekNumber || row?.lessonNumber);
  if (Number.isInteger(explicit) && explicit > 0) return explicit;
  const match = cleanSourceText(row?.week || row?.dates || '', 80).match(/\b(?:week|lesson)\s*(\d+)\b/i);
  return match ? Number(match[1]) : null;
}

const WEEKLY_SOURCE_SIGNAL_RE =
  /\b(?:openalex|openstax|open library|openlibrary|eric|crossref|wikipedia|doi|open-access via|cc\s+by|https?:\/\/)\b/i;
const WEEKLY_SOURCE_PLACEHOLDER_RE =
  /^(?:existing course map fields?|course materials students need|worked examples,\s*readings,\s*or activity sheets|instructor-approved readings,\s*examples,\s*or lab materials|constraint:|prerequisite concept:|map:|classify:|build:|solve:|draw:|estimate:|brainstorm:|compare:|inspect:|list:|integrate:)/i;

function splitWeeklySourceEntries(value) {
  const text = cleanSourceText(value, 8000);
  if (!text) return [];
  return text
    .split(/\s*;\s*/)
    .map((entry) => cleanSourceText(entry, 1400))
    .filter((entry) => entry && WEEKLY_SOURCE_SIGNAL_RE.test(entry) && !WEEKLY_SOURCE_PLACEHOLDER_RE.test(entry));
}

function addResourceToLesson(graph, resource, lessonNumber) {
  if (!graph || !resource?.id) return;
  if (!Array.isArray(graph.resources)) graph.resources = [];
  graph.resources.push(resource);
  const session = (graph.sessions || []).find((entry) => entry?.number === lessonNumber);
  const section = session?.sections?.[0];
  if (!section) return;
  if (!Array.isArray(section.resourceRefs)) section.resourceRefs = [];
  if (!section.resourceRefs.includes(resource.id)) section.resourceRefs.push(resource.id);
}

function buildSourceLedgerFromSyllabusSchedule(courseGraph, deliverables, { checkedAt = '' } = {}) {
  const syllabus = unwrapSyllabusDeliverable(deliverables);
  const schedule = Array.isArray(syllabus?.weeklySchedule) ? syllabus.weeklySchedule : [];
  if (schedule.length === 0) return null;
  const graph = JSON.parse(JSON.stringify(courseGraph || { sessions: [], resources: [] }));
  if (!Array.isArray(graph.resources)) graph.resources = [];
  let count = 0;
  for (const row of schedule) {
    const lessonNumber = weekNumberFromScheduleRow(row);
    if (!lessonNumber) continue;
    for (const entry of splitWeeklySourceEntries(row?.readings)) {
      count += 1;
      addResourceToLesson(
        graph,
        {
          id: `syllabus-src-${lessonNumber}-${count}`,
          citation: entry,
          title: entry,
          origin: 'syllabus',
          kind: 'weekly reading',
          sessionRefs: [lessonNumber],
        },
        lessonNumber,
      );
    }
  }
  if (count === 0) return null;
  return buildSourceLedgerFromCourseGraph(graph, { checkedAt });
}

function partialEnrichmentIssueFromText(text) {
  const match = String(text || '').match(
    /\bran\s*\(\s*(\d+)\s*\/\s*(\d+)(?:\s*[—-]\s*((?:lesson|lessons)\s+[^)]*?)\s+fell back to template)?/i,
  );
  if (!match) return null;
  const enriched = Number(match[1]);
  const requested = Number(match[2]);
  if (!Number.isFinite(enriched) || !Number.isFinite(requested) || requested <= 0 || enriched >= requested) return null;
  const missingCount = Math.max(0, requested - enriched);
  const lessonText = match[3]?.trim() || `${missingCount} lesson${missingCount === 1 ? '' : 's'}`;
  return {
    severity: 'blocker',
    featureId: 'courseMap',
    label: 'Enrichment coverage',
    message: `Enrichment covered ${enriched}/${requested} lessons; ${lessonText} fell back to template. Retry or repair enrichment before exporting a clean package.`,
    source: 'enrichmentCoverage',
    retryable: false,
    autoFixable: false,
    requiresInstructorDecision: false,
  };
}

function partialEnrichmentIssueFromPipeline(pipelineState, qualityDigest = null) {
  const candidates = [
    pipelineState?.enrichment,
    pipelineState?.enrichmentModelStage,
    pipelineState?.pipeline?.enrichment,
    pipelineState?.pipeline?.enrichmentModelStage,
    qualityDigest?.pipeline?.enrichmentModelStage,
    ...(Array.isArray(qualityDigest?.gates?.flaggedChecks)
      ? qualityDigest.gates.flaggedChecks.map((check) => check?.message)
      : []),
  ];
  for (const candidate of candidates) {
    const issue = partialEnrichmentIssueFromText(candidate);
    if (issue) return issue;
  }
  return null;
}

function mergeReadinessIssue(readiness, issue) {
  if (!issue) return readiness;
  const base = readiness || { status: 'ready', blockers: [], warnings: [], issues: [] };
  const hasIssue = (base.issues || []).some(
    (entry) => entry?.source === issue.source && entry?.message === issue.message,
  );
  const issues = hasIssue ? [...(base.issues || [])] : [...(base.issues || []), issue];
  const blockers = issues.filter((entry) => entry?.severity === 'blocker');
  const warnings = issues.filter((entry) => entry?.severity === 'warning');
  return {
    ...base,
    status: blockers.length > 0 ? 'blocked' : warnings.length > 0 ? 'warnings' : base.status || 'ready',
    isBlocked: blockers.length > 0,
    blockers,
    warnings,
    issues,
  };
}

function buildEffectiveReadiness(readiness, pipelineState, qualityDigest = null) {
  return mergeReadinessIssue(readiness, partialEnrichmentIssueFromPipeline(pipelineState, qualityDigest));
}

function mergeManifestReadinessIssue(readiness, issue) {
  if (!issue) return readiness;
  const usesIssueObjects =
    Array.isArray(readiness?.blockers) || Array.isArray(readiness?.warnings) || issue.severity === 'blocker';
  if (usesIssueObjects) {
    return mergeReadinessIssue(
      {
        ...(readiness || {}),
        blockers: Array.isArray(readiness?.blockers) ? readiness.blockers : [],
        warnings: Array.isArray(readiness?.warnings) ? readiness.warnings : [],
        issues: Array.isArray(readiness?.issues) ? readiness.issues : [],
      },
      issue,
    );
  }
  const blockerCount = Number(readiness?.blockers) || 0;
  const warningCount = Number(readiness?.warnings) || 0;
  const blockers = blockerCount + (issue.severity === 'blocker' ? 1 : 0);
  const warnings = warningCount + (issue.severity === 'warning' ? 1 : 0);
  return {
    ...(readiness || {}),
    status: blockers > 0 ? 'blocked' : warnings > 0 ? 'warnings' : readiness?.status || 'ready',
    blockers,
    warnings,
    isBlocked: blockers > 0,
  };
}

function qualityIssueFromManifestQuality(qualityBlock) {
  if (qualityBlock?.status !== 'graded') return null;
  const p0 = Number(qualityBlock?.findingCounts?.p0) || 0;
  const p1 = Number(qualityBlock?.findingCounts?.p1) || 0;
  const p2 = Number(qualityBlock?.findingCounts?.p2) || 0;
  if (p0 > 0) {
    return {
      severity: 'blocker',
      featureId: 'courseMap',
      label: 'Quality grade',
      message: `Package quality grader found ${p0} blocking P0 finding${p0 === 1 ? '' : 's'} (score ${qualityBlock.score}/100, grade ${qualityBlock.grade}) — review QUALITY_REPORT.md before publishing`,
      source: 'qualityGate',
      retryable: false,
      autoFixable: false,
    };
  }
  const reviewCount = p1 + p2;
  if (reviewCount > 0) {
    return {
      severity: 'warning',
      featureId: 'courseMap',
      label: 'Quality grade',
      message: `Package quality grader found ${reviewCount} review finding${reviewCount === 1 ? '' : 's'} (score ${qualityBlock.score}/100, grade ${qualityBlock.grade}) — review QUALITY_REPORT.md before publishing`,
      source: 'qualityGate',
      retryable: false,
      autoFixable: false,
    };
  }
  return null;
}

function buildManifest({
  courseName,
  lessonFilter,
  readiness,
  files,
  requestedFeatureIds,
  requiredAssets = [],
  pipelineState = null,
  assessments = null,
  readings = null,
  courseGraph = null,
  generatedAt = new Date().toISOString(),
  sourceLedger = null,
  sourceLedgerSummary = null,
  sourceReviewRows = null,
  sourceReport = null,
  sourceRefCoverage = null,
  voicePass = null,
}) {
  const courseIR = buildManifestCourseIRProof(courseGraph, { sourceRefCoverage });
  return {
    courseName,
    generatedAt,
    lessonScope: Array.isArray(lessonFilter) ? lessonFilter.map((index) => index + 1) : 'all',
    // v0.12.1: how the content was produced (enrichment / genome linker /
    // plan health) so downloaded packages are auditable without console logs.
    ...(pipelineState ? { pipeline: pipelineState } : {}),
    // v0.14.7 WS-D4: disclose when the voice pass rewrote connective prose —
    // provenance discipline applies to our own rewrites too.
    ...(voicePass
      ? {
          voicePass: {
            enabled: Boolean(voicePass.enabled),
            voicedCount: Number(voicePass.voicedCount) || 0,
            fallbackCount: Number(voicePass.fallbackCount) || 0,
            // Voice v2: the texture self-check verdict is part of the
            // disclosure — a kept pass proves it measured an improvement.
            ...(voicePass.selfCheck
              ? {
                  selfCheck: String(voicePass.selfCheck),
                  texturePre: Number(voicePass.texturePre) || null,
                  texturePost: Number(voicePass.texturePost) || null,
                  textureScope: String(voicePass.textureScope || 'voice-surfaces'),
                }
              : {}),
          },
        }
      : {}),
    // v0.14.1 (3.3d): the assessment registry, with artifact file links.
    ...(assessments && assessments.length > 0 ? { assessments } : {}),
    // v0.14.5 (A5): the readings registry with provenance tags.
    ...(readings && readings.length > 0 ? { readings } : {}),
    ...(Array.isArray(sourceLedger) && sourceLedger.length > 0 ? { sourceLedger } : {}),
    ...(sourceLedgerSummary ? { sourceLedgerSummary } : {}),
    ...(Array.isArray(sourceReviewRows) && sourceReviewRows.length > 0 ? { sourceReviewRows } : {}),
    ...(sourceReport ? { sourceReport } : {}),
    ...(courseIR ? { courseIR } : {}),
    requestedFeatures: requestedFeatureIds.map((featureId) => ({
      featureId: publicFeatureId(featureId),
      label: resolveFeatureLabel(featureId),
    })),
    readiness: {
      status: readiness?.status || 'unknown',
      blockers: readiness?.blockers?.length || 0,
      warnings: readiness?.warnings?.length || 0,
      checkedSections: readiness?.featureCount ? `${readiness?.doneFeatureCount ?? 0}/${readiness.featureCount}` : null,
    },
    requiredAssets,
    files,
  };
}

export async function buildCourseMaterialsZip({
  deliverables = {},
  courseMap,
  columns = [],
  courseName,
  lessonFilter = null,
  slideTheme = 0,
  readiness = null,
  featureIds = null,
  pipelineState = null,
  courseGraph = null,
  // v0.14.3 WS-A: the package grades itself. `quality` is ON by default
  // ({ budget, digest, courseId, timeoutMs } enriches the honesty source);
  // pass `quality: false` to skip grading entirely. `assembleOnly: true`
  // skips blob generation — the finalize-time grading path builds the same
  // file map and quality block without paying for zip compression.
  quality = {},
  assembleOnly = false,
} = {}) {
  const JSZip = (await safeImport(() => import('jszip'))).default;
  const { buildDeliverableDocxBlob } = await safeImport(() => import('./exporters/bulkDocxExporter'));
  const { buildXlsxBuffer } = await safeImport(() => import('./xlsxGenerator'));
  const { buildSlideDeckPptxBlob } = await safeImport(() => import('./exporters/pptxExporter'));

  const zip = new JSZip();
  const safeCourseName = sanitizeFilePart(courseName || courseMap?.courseName || 'Course');
  const requestedFeatureIds = getRequestedFeatureIds(featureIds, deliverables);
  const requestedDeliverableIds = requestedFeatureIds.filter((featureId) => featureId !== 'courseMap');
  const lessonIndices = getLessonIndicesForZip(courseMap, lessonFilter);
  const files = [];
  const failures = [];
  const qualityOptions = quality && typeof quality === 'object' ? quality : {};
  const effectiveReadiness = buildEffectiveReadiness(readiness, pipelineState, qualityOptions.digest || null);
  // v0.14.3 A1/A2: the in-memory file map (path → string | ArrayBuffer) the
  // grader reads through createMemoryFileProvider — the same bytes the zip
  // receives, captured at assembly time.
  const fileContents = {};

  if (effectiveReadiness?.issues?.length > 0) {
    const reportPath = 'READINESS_REPORT.txt';
    const report = buildReadinessReport(effectiveReadiness, { courseName: safeCourseName });
    zip.file(reportPath, report);
    fileContents[reportPath] = report;
    files.push({ path: reportPath, featureId: 'readiness', format: 'txt', size: getExportPartSize(report) });
  }

  try {
    const filteredCourseMap = scopeCourseMapToLessons(courseMap, lessonFilter);
    // v0.14.1 (3.4): package context only — assessment cells hyperlink to the
    // deliverable files this zip writes (relative paths, see xlsxGenerator).
    const buffer = await buildXlsxBuffer(filteredCourseMap, columns, {
      packageLinks: {
        courseGraph,
        featureIds: requestedDeliverableIds,
        lessonNumbers: lessonIndices.map((index) => index + 1),
      },
    });
    await addRequiredOfficeFile(zip, files, failures, `Course Map/${safeCourseName} - Course Map.xlsx`, buffer, {
      featureId: 'courseMap',
      format: 'xlsx',
      fileContents,
    });
  } catch (err) {
    failures.push(
      createFailure(
        'courseMap',
        'xlsx',
        `Course Map spreadsheet could not be generated: ${err?.message || 'Unknown error.'}`,
      ),
    );
  }

  for (const featureId of requestedDeliverableIds) {
    const entry = deliverables?.[featureId];
    const label = resolveFeatureLabel(featureId);
    const safeLabel = sanitizeFilePart(label, 'Deliverable');

    if (!entry?.data || entry.status !== 'done') {
      failures.push(createFailure(featureId, 'package', `${label} is not ready for ZIP export.`));
      continue;
    }

    const shouldSplitByLesson = SPLIT_BY_LESSON_FEATURES.has(featureId);
    const exportSlices = shouldSplitByLesson
      ? lessonIndices.map((lessonIndex) => ({
          lessonIndex,
          fileStem: lessonFileStem(courseMap, lessonIndex),
          data: scopeDeliverableDataToLessons(featureId, entry.data, [lessonIndex]),
        }))
      : [
          {
            lessonIndex: null,
            fileStem: safeCourseName,
            data: scopeDeliverableDataToLessons(featureId, entry.data, lessonFilter),
          },
        ];

    if (featureId === 'slideDecks') {
      for (const exportSlice of exportSlices) {
        try {
          const exportTitle =
            exportSlice.lessonIndex === null ? safeCourseName : `${safeCourseName} - ${exportSlice.fileStem}`;
          const blob = await buildSlideDeckPptxBlob(exportSlice.data, exportTitle, slideTheme);
          await addRequiredOfficeFile(
            zip,
            files,
            failures,
            `${safeLabel}/${exportSlice.fileStem} - ${safeLabel}.pptx`,
            blob,
            {
              featureId,
              format: 'pptx',
              fileContents,
            },
          );
        } catch (err) {
          failures.push(
            createFailure(
              featureId,
              'pptx',
              `${label} PowerPoint could not be generated${exportSlice.lessonIndex === null ? '' : ` for Lesson ${exportSlice.lessonIndex + 1}`}: ${err?.message || 'Unknown error.'}`,
            ),
          );
        }
      }
      continue;
    }

    for (const exportSlice of exportSlices) {
      try {
        const exportTitle =
          exportSlice.lessonIndex === null ? safeCourseName : `${safeCourseName} - ${exportSlice.fileStem}`;
        const blob = await buildDeliverableDocxBlob(featureId, exportSlice.data, exportTitle);
        await addRequiredOfficeFile(
          zip,
          files,
          failures,
          `${safeLabel}/${exportSlice.fileStem} - ${safeLabel}.docx`,
          blob,
          {
            featureId,
            format: 'docx',
            fileContents,
          },
        );
      } catch (err) {
        failures.push(
          createFailure(
            featureId,
            'docx',
            `${label} document could not be generated${exportSlice.lessonIndex === null ? '' : ` for Lesson ${exportSlice.lessonIndex + 1}`}: ${err?.message || 'Unknown error.'}`,
          ),
        );
      }
    }
  }

  if (failures.length > 0) throw new PackageZipExportError(failures);

  const { collectRequiredLabAssets, buildRequiredLabAssetsReport, buildPronunciationReference } = await safeImport(
    () => import('./requiredLabAssets'),
  );
  const requiredAssets = collectRequiredLabAssets({ courseMap, deliverables, requestedFeatureIds });
  if (requiredAssets.length > 0) {
    const reportPath = `Required Assets/${safeCourseName} - Required Lab Assets.md`;
    const report = buildRequiredLabAssetsReport(requiredAssets, { courseName: safeCourseName });
    addRequiredFile(zip, files, failures, reportPath, report, {
      featureId: 'requiredAssets',
      format: 'md',
      minBytes: 64,
      fileContents,
    });
  }
  // v0.14.5 (F1): language-genre packages also ship a GENERATED pronunciation
  // reference (tone marks + the lessons' romanized vocabulary), built from the
  // compiled study guides this zip already carries — no extra data pass.
  // Returns null for non-language courses and for language courses with no
  // romanized vocabulary, so every other genre is untouched.
  if (typeof buildPronunciationReference === 'function') {
    const pronunciation = buildPronunciationReference({ courseMap, deliverables });
    if (pronunciation?.markdown) {
      addRequiredFile(
        zip,
        files,
        failures,
        `Required Assets/${safeCourseName} - Pronunciation Reference.md`,
        pronunciation.markdown,
        { featureId: 'requiredAssets', format: 'md', minBytes: 64, fileContents },
      );
    }
  }

  if (failures.length > 0) throw new PackageZipExportError(failures);

  const generatedAt = new Date().toISOString();

  let derivedCourseGraph = null;
  let attemptedCourseGraphDerive = false;
  async function getDerivedCourseGraph() {
    if (attemptedCourseGraphDerive) return derivedCourseGraph;
    attemptedCourseGraphDerive = true;
    if (!courseMap?.lessons) return null;
    try {
      const { deriveCourseGraphFromCourseMap } = await safeImport(() => import('./courseGraph/deriveFromCourseMap.js'));
      derivedCourseGraph = deriveCourseGraphFromCourseMap(courseMap);
    } catch {
      derivedCourseGraph = null;
    }
    return derivedCourseGraph;
  }

  // v0.14.1 (3.3d): the registry rides the manifest. The caller's graph is
  // authoritative; without one (legacy callers) the registry derives from
  // the course map — deterministic and identical to what generation built.
  let assessmentRegistry = Array.isArray(courseGraph?.assessments) ? courseGraph.assessments : null;
  // v0.14.5 (A5): the readings registry rides the manifest the same way.
  let readingsRegistry = Array.isArray(courseGraph?.readings) ? courseGraph.readings : null;
  if ((!assessmentRegistry || !readingsRegistry) && courseMap?.lessons) {
    const derivedGraph = await getDerivedCourseGraph();
    if (!assessmentRegistry) assessmentRegistry = derivedGraph?.assessments || null;
    if (!readingsRegistry) readingsRegistry = derivedGraph?.readings || null;
  }
  const pipelineSourceProofExpected = pipelineExpectsSourceLedgerProof(pipelineState);
  const sourceProofExpected =
    pipelineSourceProofExpected ||
    Boolean(courseGraph?.courseIR) ||
    (Array.isArray(courseGraph?.resources) && courseGraph.resources.length > 0) ||
    (Array.isArray(courseGraph?.readings) && courseGraph.readings.length > 0);
  const fallbackCourseGraph = sourceProofExpected ? await getDerivedCourseGraph() : null;
  let sourceLedgerBundle = mergeSourceLedgerBundles(
    buildSourceLedgerFromCourseGraph(courseGraph, { checkedAt: generatedAt }),
    buildSourceLedgerFromCourseGraph(fallbackCourseGraph, { checkedAt: generatedAt }),
    buildSourceLedgerFromSyllabusSchedule(fallbackCourseGraph || courseGraph, deliverables, { checkedAt: generatedAt }),
  );
  let sourceRefCoverage =
    courseGraph?.courseIR?.sourceRefCoverage || pipelineState?.courseIR?.sourceRefCoverage || null;
  let sourceManifestGraph = courseGraph;
  if (pipelineSourceProofExpected && !hasSourceLedgerRows(sourceLedgerBundle)) {
    const courseIRFallback = await buildCourseIRSourceProofFallback(courseMap);
    if (courseIRFallback?.graph) {
      sourceLedgerBundle = mergeSourceLedgerBundles(
        sourceLedgerBundle,
        buildSourceLedgerFromCourseGraph(courseIRFallback.graph, { checkedAt: generatedAt }),
      );
      sourceRefCoverage = sourceRefCoverage || courseIRFallback.sourceRefCoverage || null;
      sourceManifestGraph = {
        ...(courseGraph || fallbackCourseGraph || courseIRFallback.graph),
        courseIR: {
          ...(courseGraph?.courseIR || fallbackCourseGraph?.courseIR || {}),
          ...(courseIRFallback.graph.courseIR || {}),
        },
      };
    }
  }
  if (sourceProofExpected && trustedConceptLinkedSourceLedgerRowCount(sourceLedgerBundle) <= 1) {
    const curatedUxSourceProofGraph = buildCuratedUxSourceProofGraph({
      courseName: safeCourseName,
      courseMap,
      courseGraph: sourceManifestGraph || courseGraph,
      fallbackCourseGraph,
    });
    const curatedPythonSourceProofGraph = buildCuratedPythonSourceProofGraph({
      courseName: safeCourseName,
      courseMap,
      courseGraph: sourceManifestGraph || courseGraph,
      fallbackCourseGraph,
    });
    if (curatedUxSourceProofGraph || curatedPythonSourceProofGraph) {
      sourceLedgerBundle = mergeSourceLedgerBundles(
        sourceLedgerBundle,
        buildSourceLedgerFromCourseGraph(curatedUxSourceProofGraph, { checkedAt: generatedAt }),
        buildSourceLedgerFromCourseGraph(curatedPythonSourceProofGraph, { checkedAt: generatedAt }),
      );
    }
  }
  const bridgedSourceProof = bridgeCourseIRSourceProofToTrustedLedger(
    sourceManifestGraph,
    sourceLedgerBundle,
    sourceRefCoverage,
  );
  sourceManifestGraph = bridgedSourceProof.courseGraph;
  sourceLedgerBundle = bridgedSourceProof.sourceLedgerBundle;
  sourceRefCoverage = bridgedSourceProof.sourceRefCoverage;
  const finalPipelineState = normalizePipelineStateWithSourceBackedJudgment(pipelineState, {
    sourceRefCoverage,
    sourceLedgerSummary: sourceLedgerBundle?.summary || null,
    sourceLedger: sourceLedgerBundle?.rows || null,
    courseGraph: sourceManifestGraph,
    courseMap,
  });
  const sourceReportMarkdown = buildSourceReportMarkdown({
    courseName: safeCourseName,
    sourceLedger: sourceLedgerBundle,
    sourceRefCoverage,
  });
  let sourceReport = null;
  if (sourceReportMarkdown) {
    const sourceReportPath = 'SOURCE_REPORT.md';
    zip.file(sourceReportPath, sourceReportMarkdown);
    fileContents[sourceReportPath] = sourceReportMarkdown;
    files.push({
      path: sourceReportPath,
      featureId: 'sourceReport',
      label: 'Source Report',
      format: 'md',
      size: getExportPartSize(sourceReportMarkdown),
    });
    sourceReport = {
      path: sourceReportPath,
      sourceCount: sourceLedgerBundle?.rows?.length || 0,
      ...(sourceLedgerBundle?.reviewRows?.length ? { sourceReviewCount: sourceLedgerBundle.reviewRows.length } : {}),
      sourceRefCoverage,
    };
  }
  const manifest = buildManifest({
    courseName: safeCourseName,
    lessonFilter,
    readiness: effectiveReadiness,
    files,
    requestedFeatureIds,
    requiredAssets,
    pipelineState: finalPipelineState,
    assessments: buildManifestAssessments({ registry: assessmentRegistry, files }),
    readings: buildManifestReadings(readingsRegistry),
    courseGraph: sourceManifestGraph,
    generatedAt,
    sourceLedger: sourceLedgerBundle?.rows || null,
    sourceLedgerSummary: sourceLedgerBundle?.summary || null,
    sourceReviewRows: sourceLedgerBundle?.reviewRows || null,
    sourceReport,
    sourceRefCoverage,
    // v0.14.7 WS-D4: callers may pass the outcome on pipelineState; otherwise
    // the generation run's single-run stash discloses it (cleared each compile).
    voicePass: finalPipelineState?.voicePass || peekVoicePassOutcome(),
  });

  // ── v0.14.3 WS-A A2/A3: the package grades itself ─────────────────────────
  // Ordering contract: the manifest is itself IN the zip and grading needs the
  // file map INCLUDING the manifest — so the grader runs over the map with the
  // manifest serialized WITHOUT its quality block, then quality is injected
  // before zip assembly. The grader ignores manifest.quality and skips
  // QUALITY_REPORT.md by contract, so a downloaded package regrades to the
  // same score. Grading is bounded by DEFAULT_PACKAGE_QUALITY_TIMEOUT_MS;
  // timeout/error becomes
  // quality { status: 'not-graded', reason }. Actual graded P0s are handled
  // by the finalizer quality gate before the export panel downloads the ZIP.
  let qualityBlock = null;
  let qualityResult = null;
  let qualityReportMarkdown = null;
  if (quality !== false) {
    const precomputedQuality = normalizePrecomputedPackageQuality(qualityOptions.precomputed);
    if (
      precomputedQuality &&
      !precomputedQualityReferencesMissingPackageFiles(precomputedQuality, {
        ...fileContents,
        'PACKAGE_MANIFEST.json': JSON.stringify(manifest, null, 2),
      })
    ) {
      qualityBlock = precomputedQuality.block;
      qualityReportMarkdown = renderPrecomputedQualityReport(precomputedQuality, { courseTitle: safeCourseName });
    } else {
      const timeoutMs = Number.isFinite(qualityOptions.timeoutMs)
        ? qualityOptions.timeoutMs
        : DEFAULT_PACKAGE_QUALITY_TIMEOUT_MS;
      try {
        // Lazy: the grader + defect patterns are their own chunk, loaded only
        // when finalize-grading runs (bundle discipline, WS-A A4).
        const [graderModule, providersModule] = await Promise.all([
          safeImport(() => import('./quality/deepQualityGrader.js')),
          safeImport(() => import('./quality/fileProviders.js')),
        ]);
        const { grade, renderReportMarkdown, honestyFromDigest, GRADER_VERSION } = graderModule;
        const gradedFileMap = { ...fileContents, 'PACKAGE_MANIFEST.json': JSON.stringify(manifest, null, 2) };
        const gradePromise = grade({
          fileProvider: providersModule.createMemoryFileProvider(gradedFileMap),
          // In-app honesty source: direct budget/digest object assertions
          // replace the Crucible's console-log scan (same checks; the two
          // console-only checks are named in IN_APP_EXCLUDED_CHECKS).
          honesty: honestyFromDigest(qualityOptions.budget || null, qualityOptions.digest || null),
          // Discipline probes key off the course title — the manifest's
          // courseName is the authoritative in-app source.
          course: {
            id: qualityOptions.courseId || '',
            title: safeCourseName,
            featureIds: requestedFeatureIds,
          },
        });
        const raced = await new Promise((resolve) => {
          const timer = setTimeout(() => resolve({ timedOut: true }), Math.max(0, timeoutMs));
          gradePromise.then(
            (value) => {
              clearTimeout(timer);
              resolve({ value });
            },
            (error) => {
              clearTimeout(timer);
              resolve({ error });
            },
          );
        });
        if (raced.timedOut) {
          qualityBlock = { status: 'not-graded', reason: `grading timed out after ${timeoutMs}ms` };
        } else if (raced.error) {
          qualityBlock = { status: 'not-graded', reason: raced.error?.message || 'grading failed' };
        } else {
          qualityResult = raced.value;
          qualityBlock = {
            status: 'graded',
            score: qualityResult.overall.score,
            grade: qualityResult.overall.grade,
            graderVersion: GRADER_VERSION,
            findingCounts: { p0: qualityResult.stats.p0, p1: qualityResult.stats.p1, p2: qualityResult.stats.p2 },
            dimensions: qualityResult.scores,
            gradedAt: new Date().toISOString(),
            // v0.15.6: the score-bearing texture meter rides the manifest
            // and the in-app Seal; the full evidence stays in QUALITY_REPORT.md.
            ...(qualityResult.texture && Number.isFinite(qualityResult.texture.score)
              ? {
                  texture: {
                    version: qualityResult.texture.version,
                    score: qualityResult.texture.score,
                    subScores: qualityResult.texture.subScores || null,
                  },
                }
              : {}),
          };
          qualityReportMarkdown = renderReportMarkdown(qualityResult, { courseTitle: safeCourseName });
        }
      } catch (err) {
        qualityBlock = { status: 'not-graded', reason: err?.message || 'grader unavailable' };
      }
    }
    manifest.quality = qualityBlock;
    const qualityIssue = qualityIssueFromManifestQuality(qualityBlock);
    if (qualityIssue) manifest.readiness = mergeManifestReadinessIssue(manifest.readiness, qualityIssue);
  }

  const manifestText = JSON.stringify(manifest, null, 2);
  zip.file('PACKAGE_MANIFEST.json', manifestText);
  files.push({
    path: 'PACKAGE_MANIFEST.json',
    featureId: 'manifest',
    format: 'json',
    size: getExportPartSize(manifestText),
  });

  if (qualityReportMarkdown) {
    // A3: the package carries its own audit at the zip root. Like the
    // manifest's own entry, the report is NOT listed in manifest.files (the
    // manifest is finalized first); the returned `files` array carries it.
    // The grader and export verifier both exclude it by contract.
    zip.file('QUALITY_REPORT.md', qualityReportMarkdown);
    files.push({
      path: 'QUALITY_REPORT.md',
      featureId: 'quality',
      format: 'md',
      size: getExportPartSize(qualityReportMarkdown),
    });
  }

  if (assembleOnly) {
    return {
      blob: null,
      fileName: `${safeCourseName} - Course Materials.zip`,
      files,
      manifest,
      size: 0,
      quality: qualityBlock,
      qualityResult,
      qualityReportMarkdown,
      // v0.15.187 Project Prof: assemble-only callers (headless harnesses)
      // get the in-memory file map so they can run the grader's own
      // extraction over the REAL export binaries — the Artifact Bridge.
      fileContents,
    };
  }

  const blob = await zip.generateAsync(ZIP_GENERATION_OPTIONS);
  const zipSize = getExportPartSize(blob);
  if (zipSize < MIN_EXPORT_BYTES) {
    throw new PackageZipExportError([
      createFailure('export', 'zip', 'ZIP package output was empty.', { size: zipSize }),
    ]);
  }

  return {
    blob,
    fileName: `${safeCourseName} - Course Materials.zip`,
    files,
    manifest,
    size: zipSize,
    quality: qualityBlock,
    qualityResult,
    qualityReportMarkdown,
  };
}

export async function downloadCourseMaterialsZip(options = {}) {
  const { saveAs } = await safeImport(() => import('file-saver'));
  const result = await buildCourseMaterialsZip(options);
  saveAs(result.blob, result.fileName);
  return result;
}
