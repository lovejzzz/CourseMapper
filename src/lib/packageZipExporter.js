import { buildReadinessReport, scopeCourseMapToLessons, scopeDeliverableDataToLessons } from './deliverableReadiness';
import { assertOfficeExportHasNoInternalText, sanitizeInternalExportLanguage } from './exportTextInspector';
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
import { classifyAssessmentKind } from './courseGraph/deriveFromCourseMap.js';
import { isDeliverableNotApplicable } from './deliverableApplicability.js';
import { safeImport } from './safeImport';
import { normalizePipelineStateWithSourceBackedJudgment } from './sourceBackedJudgment.js';
import { peekVoicePassOutcome } from './voicePass.js';
import { APP_VERSION } from './appVersion.js';
import { SCION_BROWSER_GEMMA4_GGUF } from './scionBrowserConstants.js';
import { resolveScionLiteratureSourceProfiles } from './scionLiteratureKnowledge.js';
import { isAlgiModel } from './algiIdentity.js';

const MIN_EXPORT_BYTES = 128;
// A full package pass assembles the same DOCX/PPTX/XLSX payload that users
// download before the deterministic grader reads it. Real browser runs on
// modest laptops can spend more than 30 seconds in that export+grade boundary
// even when grading is healthy, so keep the honest ceiling at one minute.
export const DEFAULT_PACKAGE_QUALITY_TIMEOUT_MS = 60000;
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
  texture: 25,
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
const PACKAGE_MANIFEST_VERSION = 2;

function isScionRunDigest(digest) {
  const provider = String(digest?.run?.provider || '').trim();
  const models = (Array.isArray(digest?.run?.models) ? digest.run.models : []).map(String);
  return (
    !models.some((model) => isAlgiModel(model)) &&
    (provider === 'public' || models.some((model) => /scion/i.test(model)))
  );
}

function publicizeScionResearchVocabulary(value) {
  if (typeof value === 'string') {
    return value.replace(/\balgi-researched\b/gi, 'scion-researched').replace(/\balgi-research\b/gi, 'scion-research');
  }
  if (Array.isArray(value)) return value.map(publicizeScionResearchVocabulary);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, publicizeScionResearchVocabulary(entry)]),
    );
  }
  return value;
}

function buildManifestGenerator(digest, pipelineState) {
  const provider = String(digest?.run?.provider || '').trim();
  const models = [
    ...new Set((Array.isArray(digest?.run?.models) ? digest.run.models : []).map(String).filter(Boolean)),
  ];
  const generationAppVersion = String(digest?.appVersion || '').trim();
  const appVersion = APP_VERSION;
  const isAlgi = models.some((model) => isAlgiModel(model));
  const isScion = !isAlgi && (provider === 'public' || models.some((model) => /scion/i.test(model)));
  const generator = {
    app: 'CourseMapper',
    appVersion,
    ...(generationAppVersion && generationAppVersion !== appVersion ? { generationAppVersion } : {}),
    ...(digest?.runId ? { runId: String(digest.runId) } : {}),
    ...(digest?.finishRunId ? { finishRunId: String(digest.finishRunId) } : {}),
    ...(provider ? { provider } : {}),
    ...(models.length > 0 ? { models } : {}),
  };
  if (isAlgi) {
    const pipelineText = JSON.stringify(pipelineState || {}).toLowerCase();
    generator.algi = {
      product: 'Algi V0',
      architecture: 'deterministic source-and-genome course compiler',
      modelInference: false,
      modelWeights: false,
      localCompiler: true,
      sourceResearch: /source-researched|algi-research|source research/.test(pipelineText),
    };
    return generator;
  }
  if (!isScion) return generator;

  const declaredRuntime = digest?.scionRuntime || digest?.run?.scionRuntime || pipelineState?.scionRuntime || null;
  const declaredAdapter = declaredRuntime?.adapter || null;
  const executionText = String(
    pipelineState?.scionExecution || digest?.pipeline?.scionExecution || digest?.run?.scionExecution || '',
  );
  const usedEvidenceCompiler = /(?:evidence compiler|zero model (?:download|inference))/i.test(executionText);
  generator.scion = {
    product: `Scion V${appVersion}`,
    compiler: 'model-neutral Scion compiler',
    localOnly: true,
    execution: usedEvidenceCompiler
      ? {
          lane: 'evidence-compiler',
          modelInference: false,
          modelWeightsDownloaded: false,
          sourceResearch: /source-researched|scion evidence.*research|source research/i.test(
            JSON.stringify(pipelineState || {}),
          ),
        }
      : {
          lane: 'local-gemma',
          modelInference: true,
          modelWeightsDownloaded: 'cache-dependent',
        },
    ...(usedEvidenceCompiler
      ? {
          adapter: {
            status: 'not-used',
            qualified: false,
            reason: 'This run used Scion’s zero-download evidence compiler, so no neural adapter was active.',
          },
        }
      : {
          trainingBase: { ...SCION_BROWSER_GEMMA4_GGUF.trainingBase },
          runtimeArtifact: { ...SCION_BROWSER_GEMMA4_GGUF.runtimeArtifact },
          runtime: { ...SCION_BROWSER_GEMMA4_GGUF.runtime },
          adapter: declaredAdapter
            ? { ...declaredAdapter }
            : {
                status: 'base-only',
                qualified: false,
                reason: 'No qualified Scion adapter was declared for this generation run.',
              },
        }),
  };
  return generator;
}

function buildManifestExportVerification(digest) {
  const gates = digest?.gates;
  if (!gates || (!gates.exportStatus && gates.exportChecked == null)) return null;
  return {
    status: String(gates.exportStatus || 'unknown'),
    checked: Number(gates.exportChecked) || 0,
    failed: Number(gates.exportFailed) || 0,
    warnings: Number(gates.exportWarnings) || 0,
  };
}

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

const AUTOMATED_QUALITY_CLAIM_BOUNDARY =
  'Absence of encoded findings is not proof of factual accuracy, accessibility, teachability, or independent validation.';

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
  const readiness =
    quality.readiness && Number.isFinite(quality.readiness.score) && Number.isFinite(quality.readiness.maxScore)
      ? quality.readiness
      : null;
  const block = {
    status: 'graded',
    evidenceClass: quality.evidenceClass || 'deterministic',
    validationTier: quality.validationTier || 'automated-signal',
    construct: quality.construct || 'encoded-package-defect-conformance',
    claimBoundary: quality.claimBoundary || AUTOMATED_QUALITY_CLAIM_BOUNDARY,
    score,
    grade: quality.grade || 'A',
    graderVersion: quality.graderVersion || 'precomputed-finish-pass',
    findingCounts,
    dimensions,
    gradedAt: quality.gradedAt || new Date().toISOString(),
    ...(readiness ? { readiness } : {}),
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
    // Grader findings also name logical teaching surfaces such as `quizBank`,
    // `slideDecks`, `studyGuides`, or `lesson sequence`. They are evidence
    // channels, not literal ZIP paths. Treat only path-like or extension-
    // bearing references as files; otherwise a valid finish receipt is thrown
    // away and the ZIP silently computes a different readiness score.
    if (!/[\\/]/.test(file) && !/\.[a-z0-9]{2,8}$/i.test(file)) return false;
    return !knownFiles.has(file);
  });
}

function precomputedQualityMissesReadiness(precomputed, readiness) {
  const blockerCount = Array.isArray(readiness?.blockers)
    ? readiness.blockers.length
    : Math.max(0, Number(readiness?.blockers) || 0);
  if (blockerCount === 0) return false;
  return !(precomputed?.findings || []).some((finding) => {
    const detail = String(finding?.detail || finding?.message || '');
    return /package readiness reports \d+ blocker/i.test(detail);
  });
}

function renderPrecomputedQualityReport(precomputed, { courseTitle = 'Course' } = {}) {
  if (!precomputed?.block) return '';
  const quality = precomputed.block;
  const counts = quality.findingCounts || { p0: 0, p1: 0, p2: 0 };
  const findingCount = counts.p0 + counts.p1 + counts.p2;
  const lines = [];
  lines.push(`# CourseMapper Quality Evidence Report - ${courseTitle}`);
  lines.push('');
  if (quality.readiness) {
    lines.push(
      `**Automated readiness signal: ${quality.readiness.score}/100 (${quality.readiness.band}; automated ceiling ${quality.readiness.evidenceCeiling || 69})**`,
    );
    lines.push('');
    lines.push(
      `${quality.readiness.claimBoundary || AUTOMATED_QUALITY_CLAIM_BOUNDARY} Scores from 70–100 require a higher evidence tier with independent review or observed use.`,
    );
    lines.push('');
  }
  lines.push(
    `**Package conformance: ${quality.score}/100 (${quality.grade})** · ${findingCount} encoded findings (${counts.p0} P0 · ${counts.p1} P1 · ${counts.p2} P2)${precomputed.fileCount ? ` · ${precomputed.fileCount} files` : ''}`,
  );
  lines.push('');
  lines.push(
    `**Evidence class:** ${quality.evidenceClass || 'deterministic'} package-defect conformance · **Validation tier:** ${quality.validationTier || 'automated-signal'} · ${quality.claimBoundary || AUTOMATED_QUALITY_CLAIM_BOUNDARY}`,
  );
  lines.push('');
  lines.push(
    'This report uses the verified finish-pass quality result already shown in the workspace. The downloaded ZIP can still be independently regraded from its files.',
  );
  lines.push('');
  if (quality.readiness?.components) {
    lines.push('## Automated readiness components');
    lines.push('');
    lines.push('| Component | Weight | Signal |');
    lines.push('| --- | ---: | ---: |');
    for (const [component, value] of Object.entries(quality.readiness.components)) {
      const label = component
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .replace(/[-_]+/g, ' ')
        .toLowerCase();
      lines.push(`| ${label.charAt(0).toUpperCase()}${label.slice(1)} | ${value.weight} | ${value.score}/100 |`);
    }
    lines.push('');
  }
  lines.push('## Package conformance checks');
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

function materializedLessonNumber(courseMap, lessonIndex) {
  const lesson = Array.isArray(courseMap?.lessons) ? courseMap.lessons[lessonIndex] : null;
  const sourceNumber = Number(lesson?.sourceLessonNumber);
  if (Number.isInteger(sourceNumber) && sourceNumber > 0) return sourceNumber;
  const titleNumber = Number(String(lesson?.title || '').match(/^(?:lesson|week|module)\s*(\d{1,3})\b/i)?.[1]);
  return Number.isInteger(titleNumber) && titleNumber > 0 ? titleNumber : lessonIndex + 1;
}

function lessonFileStem(courseMap, lessonIndex) {
  const lesson = Array.isArray(courseMap?.lessons) ? courseMap.lessons[lessonIndex] : null;
  const title = lesson?.title || lesson?.lessonTitle || lesson?.lt || `Lesson ${lessonIndex + 1}`;
  const withoutPrefix = String(title || '')
    .replace(/^(?:lesson|week)\s*\d+\s*[:.-]?\s*/i, '')
    .trim();
  const safeTitle = truncateFilePart(withoutPrefix || title || `Lesson ${lessonIndex + 1}`);
  return `Lesson ${String(materializedLessonNumber(courseMap, lessonIndex)).padStart(2, '0')} - ${safeTitle}`;
}

// v0.16.1: the manifest's weights must MATCH the compile. The compiler's
// registry bridge (buildRegistryAssessmentAnchors in courseBlueprintCompiler)
// keeps graded entries whose lesson is in the compiled scope and
// re-normalizes their weights to sum 100 whenever any weight is missing or
// the raw total drifts. The manifest used to emit the RAW derived registry
// (every row, raw exam weights) while the syllabus rendered the bridged one
// — one registry, two contradicting stories (41 rows @ 7% exams vs 27 rows
// @ 10%). This mirrors the bridge arithmetic exactly — keep in sync with
// distributeWeightedPercent + buildRegistryAssessmentAnchors.
function distributeManifestWeightedPercent(rawWeights = []) {
  if (rawWeights.length === 0) return [];
  const safeWeights = rawWeights.map((weight) => Math.max(1, Number(weight || 0)));
  const total = safeWeights.reduce((sum, weight) => sum + weight, 0);
  const exact = safeWeights.map((weight) => (weight / total) * 100);
  const floored = exact.map((weight) => Math.floor(weight));
  let remainder = 100 - floored.reduce((sum, weight) => sum + weight, 0);
  const order = exact
    .map((weight, index) => ({ index, fraction: weight - floored[index] }))
    .sort((a, b) => b.fraction - a.fraction);
  for (const item of order) {
    if (remainder <= 0) break;
    floored[item.index] += 1;
    remainder -= 1;
  }
  return floored;
}

function bridgeManifestRegistryWeights(registry, lessonNumbers) {
  const lessonSet = new Set(Array.isArray(lessonNumbers) ? lessonNumbers : []);
  const graded = registry.filter((entry) => entry && entry.kind !== 'in-class' && lessonSet.has(entry.dueSession));
  if (graded.length === 0) return { weightByEntry: new Map(), gradedCount: 0, gradedWeightTotal: 0 };
  const known = graded.reduce((sum, entry) => sum + (Number.isFinite(entry.weightPct) ? entry.weightPct : 0), 0);
  const unknown = graded.filter((entry) => !Number.isFinite(entry.weightPct));
  let weights = graded.map((entry) => (Number.isFinite(entry.weightPct) ? entry.weightPct : 0));
  if (unknown.length > 0 || known !== 100) {
    weights = distributeManifestWeightedPercent(
      graded.map((entry) =>
        Number.isFinite(entry.weightPct) && entry.weightPct > 0
          ? entry.weightPct
          : entry.kind === 'exam'
            ? 3
            : entry.kind === 'oral'
              ? 2
              : 1,
      ),
    );
  }
  const weightByEntry = new Map();
  graded.forEach((entry, index) => weightByEntry.set(entry, weights[index]));
  return {
    weightByEntry,
    gradedCount: graded.length,
    gradedWeightTotal: weights.reduce((sum, weight) => sum + weight, 0),
  };
}

// v0.14.1 (3.3d): the manifest's assessment registry — every map-promised
// assessment with its kind, lesson, weight, and the package file that
// fulfills it (briefs/orals → the lesson's Assignment Briefs docx, exams →
// the lesson's Quiz & Exam Bank docx, in-class → the Lesson Plans listing).
function buildManifestAssessments({ registry, files, lessonNumbers = null }) {
  if (!Array.isArray(registry) || registry.length === 0) return null;
  const fileFor = (featureId, lessonNumber) => {
    const prefix = `Lesson ${String(lessonNumber).padStart(2, '0')} - `;
    return (
      files.find((file) => file.featureId === featureId && file.path.split('/').pop().startsWith(prefix))?.path || null
    );
  };
  const rows = registry
    .filter((assessment) => assessment?.title && Number.isInteger(assessment?.dueSession))
    .map((assessment) => {
      const title = dedupeNumberedAssessmentEcho(assessment.title);
      // The compiler reclassifies old generated section checks as in-class;
      // the manifest must cross the same boundary or it will promise briefs
      // that the correctly compiled package intentionally does not contain.
      const kind = classifyAssessmentKind(title) === 'in-class' ? 'in-class' : assessment.kind;
      return { ...assessment, title, kind };
    });
  const bridge = bridgeManifestRegistryWeights(
    rows,
    Array.isArray(lessonNumbers) ? lessonNumbers : rows.map((assessment) => assessment.dueSession),
  );
  const entries = rows.map((assessment) => {
    const kind = assessment.kind || 'graded-artifact';
    const artifact =
      kind === 'exam'
        ? fileFor('quizBank', assessment.dueSession)
        : kind === 'in-class'
          ? fileFor('lessonPlans', assessment.dueSession)
          : fileFor('assignments', assessment.dueSession);
    const bridgedWeight = bridge.weightByEntry.has(assessment) ? bridge.weightByEntry.get(assessment) : null;
    return {
      id: assessment.id || '',
      // v0.15.187: legacy saved graphs can carry "Title: 1. Title"
      // transcription echoes — the manifest must present the same deduped
      // identity the compiler renders, or the grader searches artifacts
      // for a string no document contains (exam-content P0).
      title: assessment.title,
      kind,
      lesson: assessment.dueSession,
      // v0.16.1: graded rows carry the BRIDGED weight (the number the
      // syllabus grading table and the briefs' course-map stamps render);
      // in-class and out-of-scope rows keep their raw registry value.
      weightPct:
        kind === 'in-class'
          ? 0
          : bridgedWeight !== null
            ? bridgedWeight
            : Number.isFinite(assessment.weightPct)
              ? assessment.weightPct
              : null,
      artifact,
      ...(kind === 'in-class' ? { note: 'in-class activity — listed in the lesson plan' } : {}),
    };
  });
  return {
    entries,
    summary: {
      total: entries.length,
      graded: bridge.gradedCount,
      inClass: entries.filter((entry) => entry.kind === 'in-class').length,
      gradedWeightTotal: bridge.gradedWeightTotal,
      weightSource: 'course-map-bridge',
    },
  };
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
    (row.attribution ? 4 : 0) +
    (row.revisionId ? 4 : 0) +
    (row.revisionTimestamp ? 2 : 0) +
    (row.evidence ? 2 : 0) +
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

function mergeSourceSessionRefs(...rows) {
  return [
    ...new Set(
      rows
        .flatMap((row) => row?.sessionRefs || [])
        .map((ref) => cleanSourceText(ref, 120))
        .filter(Boolean),
    ),
  ];
}

function mergeSourceLedgerRows(existing, incoming) {
  const [stronger, weaker] =
    sourceLedgerRowStrength(incoming) > sourceLedgerRowStrength(existing) ? [incoming, existing] : [existing, incoming];
  const conceptLinks = mergeConceptLinks(stronger, weaker);
  const sessionRefs = mergeSourceSessionRefs(stronger, weaker);
  return {
    ...stronger,
    ...(!stronger.attribution && weaker.attribution ? { attribution: weaker.attribution } : {}),
    ...(!stronger.revisionId && weaker.revisionId ? { revisionId: weaker.revisionId } : {}),
    ...(!stronger.revisionTimestamp && weaker.revisionTimestamp ? { revisionTimestamp: weaker.revisionTimestamp } : {}),
    ...(!stronger.evidence && weaker.evidence ? { evidence: weaker.evidence } : {}),
    ...(!stronger.authors?.length && weaker.authors?.length ? { authors: weaker.authors } : {}),
    ...(sessionRefs.length > 0 ? { sessionRefs } : {}),
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

function sourceLedgerConceptKeys(row = {}) {
  return (row?.conceptLinks || [])
    .flatMap((link) =>
      typeof link === 'string' ? [link] : [cleanSourceText(link?.id, 120), cleanSourceText(link?.label, 160)],
    )
    .map((value) => cleanSourceText(value, 160).toLowerCase())
    .filter(Boolean);
}

function isGeneratedSyllabusReviewRow(row = {}) {
  return (
    cleanSourceText(row?.origin || row?.sourceOrigin, 80).toLowerCase() === 'syllabus' ||
    /^syllabus-src-/i.test(cleanSourceText(row?.id, 120))
  );
}

function reviewRowCoveredByTrustedSources(row, trustedRows) {
  if (!isGeneratedSyllabusReviewRow(row)) return false;
  const reviewKeys = sourceLedgerConceptKeys(row);
  if (reviewKeys.length === 0) return false;
  const trustedKeys = new Set(
    trustedRows.filter(isTrustedConceptLinkedSourceLedgerRow).flatMap(sourceLedgerConceptKeys),
  );
  return reviewKeys.every((key) => trustedKeys.has(key));
}

export function mergeSourceLedgerBundles(...bundles) {
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
      // A derived/fallback graph can reintroduce a generated syllabus
      // placeholder after the primary graph has already supplied trusted,
      // concept-linked research proof. Do not export that covered placeholder
      // as an unresolved review note.
      if (reviewRowCoveredByTrustedSources(row, rows)) continue;
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
// Do not classify a course as Python from generic instructional words such as
// “iteration”, “testing”, “functions”, “objects”, or “classes”. Those appear
// naturally in UX studios and many other domains. Curated Python proof is
// eligible only when the curriculum itself names the language/discipline or
// an unmistakable programming construct.
// This proof source is Python-specific. "Computer science", "algorithms",
// or generic programming constructs do not prove that a course uses Python
// (quantum computing exposed that false assumption in a real Algi ZIP).
const PYTHON_COURSE_CONTEXT_RE = /\bpython\b/i;
const MUSIC_INTERVAL_COURSE_CONTEXT_RE =
  /(?=.*\b(?:music(?:al)?(?:\s+theory)?|aural\s+skills?|ear\s+training|pitch|semitones?|notation)\b)(?=.*\bintervals?\b)/i;

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

const CURATED_MUSIC_INTERVAL_SOURCE_PROOF_ROWS = [
  {
    id: 'music-omt-intervals',
    title: 'Open Music Theory: Intervals',
    url: 'https://viva.pressbooks.pub/openmusictheory/chapter/intervals/',
    concepts: ['generic interval', 'interval quality', 'semitone', 'interval inversion'],
    trigger:
      /\b(?:generic\s+interval|interval\s+quality|semitone|inclusive\s+letter|written\s+interval|heard\s+interval)\b/i,
  },
  {
    id: 'music-omt-intervals-worksheet-e',
    title: 'Open Music Theory: Intervals E worksheet',
    url: 'https://viva.pressbooks.pub/app/uploads/sites/12/2025/07/WK-Intervals-E.pdf',
    concepts: ['compound interval', 'simple interval', 'interval inversion', 'quality exchange'],
    trigger: /\b(?:compound\s+interval|simple\s+interval|interval\s+inversion|sum\s+to\s+nine|quality\s+exchange)\b/i,
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

function buildCuratedMusicIntervalSourceProofGraph({ courseName, courseMap, courseGraph, fallbackCourseGraph }) {
  const context = collectCourseContextText({ courseName, courseMap, courseGraph, fallbackCourseGraph });
  if (!MUSIC_INTERVAL_COURSE_CONTEXT_RE.test(context)) return null;
  let selected = CURATED_MUSIC_INTERVAL_SOURCE_PROOF_ROWS.filter((row) => row.trigger.test(context));
  if (selected.length < 2) selected = CURATED_MUSIC_INTERVAL_SOURCE_PROOF_ROWS;

  const conceptIdByTerm = new Map();
  const concepts = [];
  const conceptIdForTerm = (term) => {
    const key = cleanSourceText(term, 120).toLowerCase();
    if (!key) return '';
    if (conceptIdByTerm.has(key)) return conceptIdByTerm.get(key);
    const id = `music-curated-concept-${concepts.length + 1}`;
    conceptIdByTerm.set(key, id);
    concepts.push({ id, term: cleanSourceText(term, 120) });
    return id;
  };

  const resources = selected.map((row, index) => ({
    id: row.id,
    title: row.title,
    provider: 'open-music-theory',
    origin: 'open-music-theory',
    kind: row.url.endsWith('.pdf') ? 'open worksheet' : 'open textbook chapter',
    url: row.url,
    license: 'CC BY-SA 4.0',
    evidence: row.title,
    attribution:
      'Open Music Theory contributors: Mark Gotham, Kyle Gullings, Chelsey Hamm, Bryn Hughes, Brian Jarvis, Megan Lavengood, and John Peterson',
    sessionRefs: [`music-curated-source-proof-${index + 1}`],
  }));
  const sessions = selected.map((row, index) => ({
    id: `music-curated-source-proof-${index + 1}`,
    number: index + 1,
    title: `Music interval source proof: ${row.concepts[0]}`,
    sections: [
      {
        id: `music-curated-source-section-${index + 1}`,
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

function buildCuratedLiteratureSourceProofGraph({ courseName, courseGraph, fallbackCourseGraph, readings }) {
  const declaredReadings = [
    ...(Array.isArray(readings) ? readings : []),
    ...(Array.isArray(courseGraph?.readings) ? courseGraph.readings : []),
    ...(Array.isArray(fallbackCourseGraph?.readings) ? fallbackCourseGraph.readings : []),
  ]
    .map((reading) => (reading && typeof reading === 'object' ? reading.title || reading.name : reading))
    .filter(Boolean);
  const profiles = resolveScionLiteratureSourceProfiles({ readings: declaredReadings });
  if (profiles.length === 0) return null;

  const concepts = [];
  const resources = [];
  const sessions = [];
  for (const [profileIndex, profile] of profiles.entries()) {
    const sourceNumber = profileIndex + 1;
    const sourceId = `literature-curated-source-${sourceNumber}`;
    const sessionId = `literature-curated-source-proof-${sourceNumber}`;
    const conceptRefs = profile.concepts.map((concept, conceptIndex) => {
      const id = `literature-curated-concept-${sourceNumber}-${conceptIndex + 1}`;
      concepts.push({ id, term: cleanSourceText(concept.term, 120) });
      return id;
    });
    resources.push({
      id: sourceId,
      title: profile.source.title,
      author: profile.source.author,
      provider: profile.source.provider,
      origin: profile.source.provider,
      kind:
        profile.source.provider === 'gutenberg'
          ? 'public-domain literary primary text'
          : 'licensed literary reading reference',
      url: profile.source.url,
      license: profile.source.license,
      evidence: profile.source.title,
      sessionRefs: [sessionId],
    });
    sessions.push({
      id: sessionId,
      number: sourceNumber,
      title: `Reading source proof: ${profile.source.title}`,
      sections: [
        {
          id: `literature-curated-source-section-${sourceNumber}`,
          topic: profile.source.title,
          conceptRefs,
          resourceRefs: [sourceId],
        },
      ],
    });
  }

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
  lessonNumbers = null,
  readiness,
  files,
  requestedFeatureIds,
  requiredAssets = [],
  pipelineState = null,
  assessments = null,
  assessmentSummary = null,
  readings = null,
  courseGraph = null,
  generatedAt = new Date().toISOString(),
  sourceLedger = null,
  sourceLedgerSummary = null,
  sourceReviewRows = null,
  sourceReport = null,
  sourceRefCoverage = null,
  voicePass = null,
  digest = null,
  generationConstraints = null,
}) {
  const courseIR = buildManifestCourseIRProof(courseGraph, { sourceRefCoverage });
  const exportVerification = buildManifestExportVerification(digest);
  return {
    manifestVersion: PACKAGE_MANIFEST_VERSION,
    courseName,
    generatedAt,
    generator: buildManifestGenerator(digest, pipelineState),
    ...(exportVerification ? { exportVerification } : {}),
    lessonScope:
      Array.isArray(lessonFilter) || lessonNumbers?.some((number, index) => number !== index + 1)
        ? lessonNumbers || lessonFilter.map((index) => index + 1)
        : 'all',
    ...(generationConstraints ? { generationConstraints } : {}),
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
            skippedCount: Number(voicePass.skippedCount) || 0,
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
    // v0.16.1: the bridged registry's counts and weight total — the same
    // numbers the syllabus grading table renders.
    ...(assessmentSummary ? { assessmentSummary } : {}),
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
  const lessonNumbers = lessonIndices.map((index) => materializedLessonNumber(courseMap, index));
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
        lessonNumbers,
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

    // A compiler-routed empty material is one course-level handoff, not one
    // repeated empty document per lesson. Repeating the same "no assignment"
    // note inflated the package, lowered texture quality, and made absence
    // look like three unfinished artifacts.
    const shouldSplitByLesson =
      SPLIT_BY_LESSON_FEATURES.has(featureId) && !isDeliverableNotApplicable(featureId, entry.data);
    const exportSlices = shouldSplitByLesson
      ? lessonIndices.map((lessonIndex) => ({
          lessonIndex,
          fileStem: lessonFileStem(courseMap, lessonIndex),
          data: scopeDeliverableDataToLessons(featureId, entry.data, [lessonIndex], courseMap),
        }))
      : [
          {
            lessonIndex: null,
            fileStem: safeCourseName,
            data: scopeDeliverableDataToLessons(featureId, entry.data, lessonFilter, courseMap),
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
    const curatedMusicIntervalSourceProofGraph = buildCuratedMusicIntervalSourceProofGraph({
      courseName: safeCourseName,
      courseMap,
      courseGraph: sourceManifestGraph || courseGraph,
      fallbackCourseGraph,
    });
    const curatedLiteratureSourceProofGraph = buildCuratedLiteratureSourceProofGraph({
      courseName: safeCourseName,
      courseGraph: sourceManifestGraph || courseGraph,
      fallbackCourseGraph,
      readings: readingsRegistry,
    });
    if (
      curatedUxSourceProofGraph ||
      curatedPythonSourceProofGraph ||
      curatedMusicIntervalSourceProofGraph ||
      curatedLiteratureSourceProofGraph
    ) {
      sourceLedgerBundle = mergeSourceLedgerBundles(
        sourceLedgerBundle,
        buildSourceLedgerFromCourseGraph(curatedUxSourceProofGraph, { checkedAt: generatedAt }),
        buildSourceLedgerFromCourseGraph(curatedPythonSourceProofGraph, { checkedAt: generatedAt }),
        buildSourceLedgerFromCourseGraph(curatedMusicIntervalSourceProofGraph, { checkedAt: generatedAt }),
        buildSourceLedgerFromCourseGraph(curatedLiteratureSourceProofGraph, { checkedAt: generatedAt }),
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
  // Persist the run digest's wider pipeline disclosure in the ZIP. The
  // normalized package state stays authoritative for overlapping fields, but
  // native-authoring fallbacks and grounding metrics must survive without the
  // browser console so an offline regrade can reach the same verdict.
  const disclosedPipelineState =
    qualityOptions.digest?.pipeline || finalPipelineState
      ? {
          ...(qualityOptions.digest?.pipeline || {}),
          ...(finalPipelineState || {}),
        }
      : null;
  const sourceReportMarkdown = sanitizeInternalExportLanguage(
    buildSourceReportMarkdown({
      courseName: safeCourseName,
      sourceLedger: isScionRunDigest(qualityOptions.digest)
        ? publicizeScionResearchVocabulary(sourceLedgerBundle)
        : sourceLedgerBundle,
      sourceRefCoverage,
    }),
  );
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
  const manifestAssessments = buildManifestAssessments({
    registry: assessmentRegistry,
    files,
    // v0.16.1: the bridge scopes to the same lessons the compile used.
    lessonNumbers,
  });
  const publicScionRun = isScionRunDigest(qualityOptions.digest);
  const manifestPipelineState = publicScionRun
    ? publicizeScionResearchVocabulary(disclosedPipelineState)
    : disclosedPipelineState;
  const manifestSourceLedgerBundle = publicScionRun
    ? publicizeScionResearchVocabulary(sourceLedgerBundle)
    : sourceLedgerBundle;
  const manifest = buildManifest({
    courseName: safeCourseName,
    lessonFilter,
    lessonNumbers,
    readiness: effectiveReadiness,
    files,
    requestedFeatureIds,
    requiredAssets,
    pipelineState: manifestPipelineState,
    assessments: manifestAssessments?.entries || null,
    assessmentSummary: manifestAssessments?.summary || null,
    readings: buildManifestReadings(readingsRegistry),
    courseGraph: sourceManifestGraph,
    generatedAt,
    sourceLedger: manifestSourceLedgerBundle?.rows || null,
    sourceLedgerSummary: manifestSourceLedgerBundle?.summary || null,
    sourceReviewRows: manifestSourceLedgerBundle?.reviewRows || null,
    sourceReport,
    sourceRefCoverage,
    // v0.14.7 WS-D4: callers may pass the outcome on pipelineState; otherwise
    // the generation run's single-run stash discloses it (cleared each compile).
    voicePass: finalPipelineState?.voicePass || peekVoicePassOutcome(),
    digest: qualityOptions.digest || null,
    generationConstraints: Number.isFinite(Number(qualityOptions.expectedSessionMinutes))
      ? { sessionMinutes: Number(qualityOptions.expectedSessionMinutes) }
      : null,
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
      !precomputedQualityMissesReadiness(precomputedQuality, effectiveReadiness) &&
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
            prompt: qualityOptions.coursePrompt || '',
            featureIds: requestedFeatureIds,
            expectedSessionMinutes: qualityOptions.expectedSessionMinutes || null,
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
            evidenceClass: qualityResult.evidenceClass || 'deterministic',
            validationTier: qualityResult.validationTier || 'automated-signal',
            construct: qualityResult.construct || 'encoded-package-defect-conformance',
            claimBoundary: qualityResult.claimBoundary || AUTOMATED_QUALITY_CLAIM_BOUNDARY,
            score: qualityResult.overall.score,
            grade: qualityResult.overall.grade,
            graderVersion: GRADER_VERSION,
            findingCounts: { p0: qualityResult.stats.p0, p1: qualityResult.stats.p1, p2: qualityResult.stats.p2 },
            dimensions: qualityResult.scores,
            gradedAt: new Date().toISOString(),
            ...(qualityResult.readiness ? { readiness: qualityResult.readiness } : {}),
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
  // Artifact-Bridge callers receive exactly the same file map as the ZIP.
  // The old assemble-only path omitted the manifest even though its contract
  // said otherwise, so deterministic compiler replays could not be graded
  // under the same registry/readiness/provenance checks as a download.
  fileContents['PACKAGE_MANIFEST.json'] = manifestText;
  files.push({
    path: 'PACKAGE_MANIFEST.json',
    featureId: 'manifest',
    format: 'json',
    size: getExportPartSize(manifestText),
  });

  if (qualityReportMarkdown) {
    qualityReportMarkdown = sanitizeInternalExportLanguage(qualityReportMarkdown);
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
