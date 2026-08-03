import { buildReadinessReport, scopeCourseMapToLessons, scopeDeliverableDataToLessons } from './deliverableReadiness';
import { assertOfficeExportHasNoInternalText, sanitizeInternalExportLanguage } from './exportTextInspector';
import { resolveFeatureLabel } from './exporters/exporterUtils.js';
import {
  buildSourceLedgerFromCourseGraph,
  buildSourceReportMarkdown,
  bindRenderedClaimSupport,
  isClaimBoundSourceLedgerRow,
  isLicenseAmbiguous,
  isTrustedConceptLinkedSourceLedgerRow,
  isTrustedSourceLedgerRow,
  summarizeSourceLedgerRows,
} from './knowledge/sourceLedger.js';
import { dedupeNumberedAssessmentEcho, stripLessonPrefix } from './compilerText.js';
import { classifyAssessmentKind } from './courseGraph/deriveFromCourseMap.js';
import { isDeliverableNotApplicable } from './deliverableApplicability.js';
import { safeImport } from './safeImport';
import { normalizePipelineStateWithSourceBackedJudgment } from './sourceBackedJudgment.js';
import { peekVoicePassOutcome } from './voicePass.js';
import { APP_VERSION } from './appVersion.js';
import { SCION_BROWSER_GEMMA4_GGUF } from './scionBrowserConstants.js';
import { isAlgiModel } from './algiIdentity.js';
import { GRADER_VERSION } from './quality/graderVersion.js';
import { TEXTURE_VERSION } from './quality/textureMetric.js';
import { verifyScoreLedger } from './quality/scoreLedgerVerifier.js';
import { buildAssessmentCoherenceReceipt } from './quality/assessmentCoherence.js';
import { extractExplicitLessonSequence } from './explicitLessonSequence.js';
import {
  buildPackageReadinessBinding,
  buildPackageReadinessReceipt,
  hasVerifiedPackageDownloadReceipt,
} from './packageReadinessReceipt.js';

export { buildPackageReadinessBinding, buildPackageReadinessReceipt, hasVerifiedPackageDownloadReceipt };

const MIN_EXPORT_BYTES = 128;
// A full package pass assembles the same DOCX/PPTX/XLSX payload that users
// download before the deterministic grader reads it. Real browser runs on
// modest laptops can spend more than 30 seconds in that export+grade boundary
// even when grading is healthy, so keep the honest ceiling at one minute.
export const DEFAULT_PACKAGE_QUALITY_TIMEOUT_MS = 60000;
const DETERMINISTIC_ARCHIVE_TIMESTAMP = '2000-01-01T00:00:00.000Z';
const DETERMINISTIC_OFFICE_TIMESTAMP = '2000-01-01T00:00:00Z';
const ZIP_GENERATION_OPTIONS = {
  type: 'blob',
  compression: 'STORE',
  streamFiles: true,
  platform: 'DOS',
};
const OFFICE_ZIP_GENERATION_OPTIONS = {
  type: 'uint8array',
  compression: 'DEFLATE',
  compressionOptions: { level: 6 },
  streamFiles: true,
  platform: 'DOS',
};
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
const PACKAGE_QUALITY_SCOPE_ALGORITHM = 'sha256-canonical-package-input-v1';

function stableQualityStringify(value, seen = new WeakSet()) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (seen.has(value)) return '"[Circular]"';
  seen.add(value);
  if (Array.isArray(value)) {
    const serialized = `[${value.map((item) => stableQualityStringify(item, seen)).join(',')}]`;
    seen.delete(value);
    return serialized;
  }
  const serialized = `{${Object.keys(value)
    .filter((key) => value[key] !== undefined && typeof value[key] !== 'function')
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableQualityStringify(value[key], seen)}`)
    .join(',')}}`;
  seen.delete(value);
  return serialized;
}

async function sha256QualityText(value) {
  const bytes = new TextEncoder().encode(value);
  return sha256QualityBytes(bytes);
}

async function sha256QualityBytes(bytes) {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength),
  );
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function qualityArtifactBytes(value) {
  if (typeof value === 'string') return new TextEncoder().encode(value);
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  if (value && typeof value.arrayBuffer === 'function') return new Uint8Array(await value.arrayBuffer());
  return new TextEncoder().encode(stableQualityStringify(value));
}

const EVIDENCE_ENVELOPE_PATHS = new Set([
  'PACKAGE_MANIFEST.json',
  'SCORE_LEDGER.json',
  'QUALITY_FINDINGS.json',
  'PACKAGE_READINESS.json',
  'QUALITY_REPORT.md',
]);

/**
 * Bind the exact teaching and support artifacts without creating a circular
 * hash dependency on the evidence envelope that describes them. Auditors can
 * pass every extracted ZIP entry directly; these five protocol-defined
 * envelope files are excluded by the algorithm rather than reconstructed from
 * an undocumented pre-grading state.
 */
export async function buildEvidenceArtifactBinding(fileMap = {}) {
  const entries = [];
  const paths = Object.keys(fileMap)
    .map((sourcePath) => ({ sourcePath, path: sourcePath.replace(/\\/g, '/') }))
    .filter(({ path }) => !EVIDENCE_ENVELOPE_PATHS.has(path))
    .sort((left, right) => left.path.localeCompare(right.path));
  for (const { sourcePath, path } of paths) {
    const bytes = await qualityArtifactBytes(fileMap[sourcePath]);
    entries.push({ path, byteLength: bytes.byteLength, sha256: await sha256QualityBytes(bytes) });
  }
  return {
    algorithm: 'sha256-sorted-teaching-artifact-bytes-inventory-v2',
    rootSha256: await sha256QualityText(stableQualityStringify(entries)),
    excludedPaths: [...EVIDENCE_ENVELOPE_PATHS],
    entries,
  };
}

async function buildPackageQualityScopeBinding({
  courseMap,
  deliverables,
  columns,
  lessonFilter,
  slideTheme,
  requestedFeatureIds,
  lessonNumbers,
  pipelineState,
  courseGraph,
  effectiveReadiness,
  qualityOptions,
}) {
  const requestedDeliverableIds = requestedFeatureIds.filter((featureId) => featureId !== 'courseMap');
  const scopedDeliverables = Object.fromEntries(
    requestedDeliverableIds.map((featureId) => {
      const entry = deliverables?.[featureId] || null;
      return [
        featureId,
        entry
          ? {
              status: entry.status || null,
              data: scopeDeliverableDataToLessons(featureId, entry.data, lessonFilter, courseMap),
            }
          : null,
      ];
    }),
  );
  const payload = {
    algorithm: PACKAGE_QUALITY_SCOPE_ALGORITHM,
    appVersion: APP_VERSION,
    graderVersion: GRADER_VERSION,
    textureVersion: TEXTURE_VERSION,
    requestedFeatureIds,
    lessonNumbers,
    lessonFilter: Array.isArray(lessonFilter) ? [...lessonFilter] : null,
    slideTheme,
    courseMap: scopeCourseMapToLessons(courseMap, lessonFilter),
    deliverables: scopedDeliverables,
    columns,
    pipelineState,
    courseGraph,
    readiness: effectiveReadiness,
    qualityInputs: {
      budget: qualityOptions?.budget || null,
      digest: qualityOptions?.digest || null,
      courseId: qualityOptions?.courseId || '',
      coursePrompt: qualityOptions?.coursePrompt || '',
      expectedSessionMinutes: qualityOptions?.expectedSessionMinutes || null,
    },
  };
  return {
    algorithm: PACKAGE_QUALITY_SCOPE_ALGORITHM,
    sha256: await sha256QualityText(stableQualityStringify(payload)),
    appVersion: APP_VERSION,
    graderVersion: GRADER_VERSION,
    textureVersion: TEXTURE_VERSION,
    featureIds: requestedFeatureIds.map(publicFeatureId),
    lessonNumbers: [...lessonNumbers],
  };
}

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
    contentDisposition: String(gates.exportContentDisposition || ''),
    checked: Number(gates.exportChecked) || 0,
    failed: Number(gates.exportFailed) || 0,
    warnings: Number(gates.exportWarnings) || 0,
  };
}

function buildManifestHandoffTrust(digest) {
  const gates = digest?.gates;
  if (!gates?.trustState && !gates?.warningDomains && !gates?.blockerDomains) return null;
  return {
    finishStatus: String(gates.finalStatus || ''),
    trustState: String(gates.trustState || ''),
    warningDomains: gates.warningDomains || null,
    blockerDomains: gates.blockerDomains || null,
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

function renderUnavailableQualityReport(quality, { courseTitle = 'Course' } = {}) {
  const reason = String(quality?.reason || 'quality grading did not complete')
    .replace(/\s+/g, ' ')
    .trim();
  return [
    `# CourseMapper Quality Evidence Report - ${courseTitle}`,
    '',
    '**Status: NOT GRADED — quality proof unavailable**',
    '',
    `**Reason:** ${reason}`,
    '',
    `**Attempted:** ${quality?.attemptedAt || 'timestamp unavailable'}`,
    '',
    AUTOMATED_QUALITY_CLAIM_BOUNDARY,
    '',
    'This package has not earned an automated conformance result. Run package finalization again before downloading or sharing it as ready.',
    '',
  ].join('\n');
}

function normalizePrecomputedPackageQuality(quality, fallbackTimestamp = new Date().toISOString()) {
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
    gradedAt: quality.gradedAt || fallbackTimestamp,
    ...(quality.scopeBinding ? { scopeBinding: quality.scopeBinding } : {}),
    ...(readiness ? { readiness } : {}),
    ...(texture ? { texture } : {}),
  };
  return {
    block,
    findings,
    grades: quality.grades && typeof quality.grades === 'object' ? quality.grades : {},
    fileCount: Number.isFinite(quality.fileCount) ? quality.fileCount : null,
    packageReadinessBinding: quality.packageReadinessBinding || null,
    scoreLedger:
      quality.scoreLedger && typeof quality.scoreLedger === 'object'
        ? quality.scoreLedger
        : quality.readiness?.ledger
          ? {
              protocol: 'coursemapper-score-ledger-v1',
              deterministicPackageEvidence: quality.readiness.ledger,
              encodedDefectConformance: quality.conformanceLedger || null,
            }
          : null,
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
  return (
    JSON.stringify(precomputed?.packageReadinessBinding || null) !==
    JSON.stringify(buildPackageReadinessBinding(readiness))
  );
}

function precomputedQualityMissesCurrentGrader(precomputed) {
  return precomputed?.block?.graderVersion !== GRADER_VERSION;
}

function precomputedQualityMissesCurrentTexture(precomputed) {
  return precomputed?.block?.texture?.version !== TEXTURE_VERSION;
}

function precomputedQualityMissesScope(precomputed, scopeBinding) {
  const prior = precomputed?.block?.scopeBinding;
  return (
    !prior ||
    prior.algorithm !== scopeBinding?.algorithm ||
    prior.sha256 !== scopeBinding?.sha256 ||
    prior.graderVersion !== scopeBinding?.graderVersion ||
    prior.textureVersion !== scopeBinding?.textureVersion
  );
}

function precomputedQualityMissesEvidenceArtifacts(precomputed, evidenceArtifacts) {
  const prior = precomputed?.scoreLedger?.bindings?.evidenceArtifacts;
  return (
    !prior || prior.algorithm !== evidenceArtifacts?.algorithm || prior.rootSha256 !== evidenceArtifacts?.rootSha256
  );
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
      `**Deterministic package evidence: ${quality.readiness.points?.earned ?? quality.readiness.score}/100 earned · ${quality.readiness.points?.lost ?? 'unknown'} lost · ${quality.readiness.points?.unobserved ?? 'unknown'} unobserved (${quality.readiness.band})**`,
    );
    lines.push('');
    lines.push(
      `${quality.readiness.claimBoundary || AUTOMATED_QUALITY_CLAIM_BOUNDARY} Missing evidence remains in the fixed 100-point potential and can never improve this result.`,
    );
    lines.push('');
    if (quality.readiness.reconstructionDisclosure?.repairedFieldCount > 0) {
      lines.push(
        `**Deterministic reconstruction disclosure:** ${quality.readiness.reconstructionDisclosure.repairedFieldCount} CurriculumV1 fields were reconstructed after model authoring. This is provenance, not independent evidence.`,
      );
      lines.push('');
    }
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
    if (Number.isFinite(quality.readiness.positiveValidationEarned)) {
      lines.push(
        `**Evidence decomposition:** ${quality.readiness.positiveValidationEarned}/${quality.readiness.positiveValidationCoverage} from narrow positive metrics · ${quality.readiness.negativeEvidenceEarned}/${quality.readiness.negativeEvidenceCoverage} from negative-evidence-only conformance · ${quality.readiness.points?.unobserved ?? 0}/100 unobserved.`,
      );
      lines.push('');
    }
    lines.push('## Deterministic package evidence rules');
    lines.push('');
    lines.push('| Component | Status | Earned | Lost | Unobserved | Why | How to improve |');
    lines.push('| --- | --- | ---: | ---: | ---: | --- | --- |');
    for (const [component, value] of Object.entries(quality.readiness.components)) {
      const fallbackLabel = component
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .replace(/[-_]+/g, ' ')
        .toLowerCase();
      const label = value.label || `${fallbackLabel.charAt(0).toUpperCase()}${fallbackLabel.slice(1)}`;
      lines.push(
        `| ${label} | ${value.status || 'unverifiable-legacy'} | ${value.points?.earned ?? '-'} / ${value.points?.max ?? value.weight} | ${value.points?.lost ?? '-'} | ${value.points?.unobserved ?? '-'} | ${String(value.reason || 'Legacy result has no serialized rule reason.').replace(/\|/g, '\\|')} | ${String(value.action || 'Regrade with the current protocol.').replace(/\|/g, '\\|')} |`,
      );
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
      if (finding.reason) lines.push(`  - reason: ${finding.reason}`);
      if (finding.action) lines.push(`  - improve: ${finding.action}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

async function getZipFileContent(part) {
  if (part && typeof part.arrayBuffer === 'function') return await part.arrayBuffer();
  return part;
}

function applyDeterministicArchiveDates(zip) {
  for (const entry of Object.values(zip.files || {})) {
    entry.date = new Date(DETERMINISTIC_ARCHIVE_TIMESTAMP);
  }
}

export async function normalizeOfficeArchiveForPackage(content, JSZipOverride = null) {
  const JSZip = JSZipOverride || (await safeImport(() => import('jszip'))).default;
  const officeZip = await JSZip.loadAsync(await getZipFileContent(content));
  const coreProperties = officeZip.file('docProps/core.xml');
  if (coreProperties) {
    let xml = await coreProperties.async('string');
    for (const tag of ['created', 'modified']) {
      xml = xml.replace(
        new RegExp(`(<dcterms:${tag}\\b[^>]*>)[\\s\\S]*?(<\\/dcterms:${tag}>)`, 'gi'),
        `$1${DETERMINISTIC_OFFICE_TIMESTAMP}$2`,
      );
    }
    officeZip.file('docProps/core.xml', xml);
  }
  applyDeterministicArchiveDates(officeZip);
  return await officeZip.generateAsync(OFFICE_ZIP_GENERATION_OPTIONS);
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
  { featureId, format, minBytes = MIN_EXPORT_BYTES, fileContents = null, zipLibrary = null } = {},
) {
  let zipContent;
  try {
    zipContent = await normalizeOfficeArchiveForPackage(content, zipLibrary);
  } catch (err) {
    failures.push(
      createFailure(
        featureId,
        format,
        `${resolveFeatureLabel(featureId)} ${String(format || 'file').toUpperCase()} export could not be normalized: ${err?.message || 'Unknown error.'}`,
        { path, size: getExportPartSize(content) },
      ),
    );
    return false;
  }

  const size = getExportPartSize(zipContent);
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
    await assertOfficeExportHasNoInternalText(zipContent, format, resolveFeatureLabel(featureId));
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

const EXTERNAL_EVIDENCE_REQUIREMENT_PATTERNS = [
  {
    kind: 'recording-or-transcript',
    label: 'recording or transcript',
    pattern:
      /\b(?:supplied|provided|assigned|attached|official)\s+(?:(?:audio|video|interview)\s+)?(?:recording|transcript|recording\s*\/\s*transcript|transcript excerpt)\b/i,
    // "Interview" is a topic as often as it is an artifact name; accepting it
    // made an assignment DOCX titled "Interview Evidence" falsely satisfy its
    // own recording/transcript dependency.
    assetPattern: /\b(?:recording|transcript|audio|video)\b/i,
  },
  {
    kind: 'dataset',
    label: 'dataset',
    pattern:
      /\b(?:supplied|provided|assigned|attached|official)\s+(?:course\s+)?(?:dataset|data set|spreadsheet|csv)\b/i,
    assetPattern: /\b(?:dataset|data set|spreadsheet|csv)\b/i,
  },
  {
    kind: 'handout-or-packet',
    label: 'handout or packet',
    pattern: /\b(?:supplied|provided|assigned|attached|official)\s+(?:course\s+)?(?:handout|packet|source packet)\b/i,
    assetPattern: /\b(?:handout|packet)\b/i,
  },
  {
    kind: 'assigned-source',
    label: 'assigned source',
    pattern: /\b(?:supplied|provided|assigned|attached|official)\s+(?:course\s+)?(?:source|reading|article|passage)\b/i,
    assetPattern: /\b(?:source|reading|article|passage)\b/i,
  },
];

function compactDependencyEvidence(text, matchIndex) {
  const source = String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
  const start = Math.max(0, source.lastIndexOf('.', Math.max(0, matchIndex - 1)) + 1);
  const nextPeriod = source.indexOf('.', matchIndex);
  const end = nextPeriod >= 0 ? nextPeriod + 1 : Math.min(source.length, matchIndex + 180);
  return source.slice(start, end).trim().slice(0, 220);
}

function graphSessionForLesson(courseGraph, lessonNumber, lessonIndex) {
  const sessions = Array.isArray(courseGraph?.sessions) ? courseGraph.sessions : [];
  return (
    sessions.find((session) => Number(session?.number) === lessonNumber) ||
    sessions.find((session) => String(session?.id || '').toLowerCase() === `s${lessonNumber}`) ||
    sessions[lessonIndex] ||
    null
  );
}

function sessionResourceRefs(session) {
  return [
    ...(Array.isArray(session?.resourceRefs) ? session.resourceRefs : []),
    ...(Array.isArray(session?.sections)
      ? session.sections.flatMap((section) => (Array.isArray(section?.resourceRefs) ? section.resourceRefs : []))
      : []),
  ]
    .map(String)
    .filter(Boolean);
}

const DEPENDENCY_SURFACE_KEYS = {
  assignments: new Set([
    'instructions',
    'instruction',
    'prompt',
    'task',
    'requirements',
    'requiredMaterials',
    'steps',
    'deliverables',
  ]),
  discussions: new Set(['prompt', 'question', 'questions', 'instructions', 'requirements']),
  quizBank: new Set(['question', 'prompt', 'stem', 'instructions', 'passage', 'scenario']),
  slideDecks: new Set(['bullets', 'content', 'activityPrompt']),
  studyGuides: new Set(['practiceActivities', 'reviewQuestions', 'assignedReadings']),
  lessonPlans: new Set(['materials', 'requiredMaterials', 'activity', 'instructions']),
};

function collectDependencySurfaceStrings(node, admittedKeys, active = false, output = []) {
  if (typeof node === 'string') {
    if (active) output.push(node);
    return output;
  }
  if (Array.isArray(node)) {
    node.forEach((entry) => collectDependencySurfaceStrings(entry, admittedKeys, active, output));
    return output;
  }
  if (!node || typeof node !== 'object') return output;
  for (const [key, value] of Object.entries(node)) {
    collectDependencySurfaceStrings(value, admittedKeys, active || admittedKeys.has(key), output);
  }
  return output;
}

function dependencySurfaceText(featureId, data) {
  const admittedKeys = DEPENDENCY_SURFACE_KEYS[featureId];
  if (!admittedKeys) return '';
  return collectDependencySurfaceStrings(data, admittedKeys).join(' ');
}

function buildLessonEvidenceDependencies({
  courseMap,
  courseGraph,
  deliverables,
  lessonIndices,
  sourceLedger,
  sourceReviewRows,
  assessments,
  requiredAssets,
  files,
}) {
  const ledgerRows = [
    ...(Array.isArray(sourceLedger) ? sourceLedger : []),
    ...(Array.isArray(sourceReviewRows) ? sourceReviewRows : []),
  ];
  const trustedRows = ledgerRows.filter(isTrustedSourceLedgerRow);
  const trustedById = new Map(trustedRows.map((row) => [String(row?.id || ''), row]));
  const ledgerById = new Map(ledgerRows.map((row) => [String(row?.id || ''), row]));
  const graphResourceById = new Map(
    (Array.isArray(courseGraph?.resources) ? courseGraph.resources : []).map((resource) => [
      String(resource?.id || resource?.resourceId || ''),
      resource,
    ]),
  );
  const packageAssetText = [
    ...(Array.isArray(requiredAssets) ? requiredAssets : []),
    ...(Array.isArray(files) ? files : []),
  ]
    .map((entry) =>
      typeof entry === 'string'
        ? entry
        : `${entry?.path || ''} ${entry?.title || ''} ${entry?.label || ''} ${entry?.kind || ''}`,
    )
    .join(' ');
  const lessons = (Array.isArray(lessonIndices) ? lessonIndices : []).map((lessonIndex) => {
    const lesson = courseMap?.lessons?.[lessonIndex] || {};
    const lessonNumber = materializedLessonNumber(courseMap, lessonIndex);
    const session = graphSessionForLesson(courseGraph, lessonNumber, lessonIndex);
    const resourceRefs = [...new Set(sessionResourceRefs(session))];
    const lessonSourceRows = resourceRefs.map((ref) => trustedById.get(ref)).filter(Boolean);
    const claimBoundLessonSourceRows = lessonSourceRows.filter(isClaimBoundSourceLedgerRow);
    const scopedText = Object.entries(deliverables || {})
      .filter(([featureId, entry]) => SPLIT_BY_LESSON_FEATURES.has(featureId) && entry?.data)
      .map(([featureId, entry]) =>
        dependencySurfaceText(
          featureId,
          scopeDeliverableDataToLessons(featureId, entry.data, [lessonIndex], courseMap),
        ),
      )
      .join(' ');
    const requirements = [];

    if (resourceRefs.length > 0) {
      const unresolvedRefs = resourceRefs.filter((ref) => !ledgerById.has(ref) && !graphResourceById.has(ref));
      const reviewRefs = resourceRefs.filter((ref) => {
        if (unresolvedRefs.includes(ref)) return false;
        const trustedRow = trustedById.get(ref);
        return !trustedRow || !isClaimBoundSourceLedgerRow(trustedRow);
      });
      requirements.push({
        kind: 'source-references',
        label: 'lesson source references',
        status: unresolvedRefs.length > 0 ? 'unresolved' : reviewRefs.length > 0 ? 'review-required' : 'resolved',
        refs: resourceRefs,
        ...(unresolvedRefs.length > 0 ? { unresolvedRefs } : {}),
        ...(reviewRefs.length > 0 ? { reviewRefs } : {}),
      });
    }

    for (const requirement of EXTERNAL_EVIDENCE_REQUIREMENT_PATTERNS) {
      const match = requirement.pattern.exec(scopedText);
      if (!match) continue;
      const evidence = compactDependencyEvidence(scopedText, match.index);
      // Attribution scaffolds often list "packet item, assigned reading,
      // class activity, or instructor note" as interchangeable citation
      // choices. That does not promise one particular assigned source and
      // must not be upgraded into a missing-artifact blocker.
      if (
        requirement.kind === 'assigned-source' &&
        /(?:packet item|lesson materials).{0,100}assigned reading.{0,100}(?:class activity|instructor note)|(?:one of|either).{0,100}assigned (?:source|reading)/i.test(
          evidence,
        )
      ) {
        continue;
      }
      const sourceAssetText = lessonSourceRows
        .map((row) => `${row?.title || ''} ${row?.citation || ''} ${row?.url || ''} ${row?.kind || ''}`)
        .join(' ');
      const resolved =
        requirement.kind === 'assigned-source'
          ? claimBoundLessonSourceRows.length > 0
          : requirement.assetPattern.test(`${packageAssetText} ${sourceAssetText}`);
      requirements.push({
        kind: requirement.kind,
        label: requirement.label,
        status: resolved ? 'resolved' : 'unresolved',
        evidence,
      });
    }

    for (const assessment of (Array.isArray(assessments) ? assessments : []).filter(
      (entry) => Number(entry?.lesson) === lessonNumber,
    )) {
      requirements.push({
        kind: 'assessment-artifact',
        label: assessment.title || 'assessment artifact',
        status: assessment.artifact ? 'resolved' : 'unresolved',
        artifact: assessment.artifact || null,
      });
    }

    const unresolved = requirements.filter((requirement) => requirement.status === 'unresolved').length;
    const reviewRequired = requirements.filter((requirement) => requirement.status === 'review-required').length;
    return {
      lesson: lessonNumber,
      title: lesson?.title || `Lesson ${lessonNumber}`,
      status:
        unresolved > 0
          ? 'unresolved'
          : reviewRequired > 0
            ? 'review-required'
            : requirements.length > 0
              ? 'resolved'
              : 'not-required',
      unresolved,
      reviewRequired,
      requirements,
    };
  });
  const requirementCount = lessons.reduce((sum, lesson) => sum + lesson.requirements.length, 0);
  const unresolvedCount = lessons.reduce((sum, lesson) => sum + lesson.unresolved, 0);
  const reviewRequiredCount = lessons.reduce((sum, lesson) => sum + lesson.reviewRequired, 0);
  return {
    version: 'coursemapper-lesson-evidence-dependencies-v1',
    status: unresolvedCount > 0 ? 'unresolved' : reviewRequiredCount > 0 ? 'review-required' : 'resolved',
    lessonCount: lessons.length,
    requirementCount,
    unresolvedCount,
    reviewRequiredCount,
    lessons,
  };
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
        ...(typeof courseGraph.courseIR.sourceProofFallback.valid === 'boolean'
          ? { valid: courseGraph.courseIR.sourceProofFallback.valid }
          : {}),
        ...(Array.isArray(courseGraph.courseIR.sourceProofFallback.issueCodes)
          ? { issueCodes: courseGraph.courseIR.sourceProofFallback.issueCodes }
          : {}),
      };
    }
    if (typeof courseGraph.courseIR.valid === 'boolean') {
      proof.valid = courseGraph.courseIR.valid;
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
  const receiptStrength = (receipt) =>
    (receipt?.readinessEligible === true ? 1000 : 0) +
    (receipt?.semanticSupport === true ? 100 : 0) +
    (Array.isArray(receipt?.checks) ? receipt.checks.length : 0);
  const receiptCandidates = [stronger?.supportReceipt, weaker?.supportReceipt].filter(Boolean);
  const supportReceipt = receiptCandidates.length
    ? (() => {
        const strongestReceipt = [...receiptCandidates].sort(
          (left, right) => receiptStrength(right) - receiptStrength(left),
        )[0];
        const checks = [];
        const seenChecks = new Set();
        for (const receipt of receiptCandidates) {
          for (const check of receipt?.checks || []) {
            const key = [check?.sourceId, check?.locator, check?.claim, check?.quote]
              .map((value) =>
                String(value || '')
                  .trim()
                  .toLowerCase(),
              )
              .join('|');
            if (!key.replace(/\|/g, '') || seenChecks.has(key)) continue;
            seenChecks.add(key);
            checks.push(check);
          }
        }
        return {
          ...strongestReceipt,
          checkedClaims: Math.max(Number(strongestReceipt?.checkedClaims) || 0, checks.length),
          semanticSupport: receiptCandidates.some((receipt) => receipt?.semanticSupport === true),
          readinessEligible: receiptCandidates.some((receipt) => receipt?.readinessEligible === true),
          ...(checks.length > 0 ? { checks } : {}),
        };
      })()
    : null;
  return {
    ...stronger,
    ...(!stronger.attribution && weaker.attribution ? { attribution: weaker.attribution } : {}),
    ...(!stronger.revisionId && weaker.revisionId ? { revisionId: weaker.revisionId } : {}),
    ...(!stronger.revisionTimestamp && weaker.revisionTimestamp ? { revisionTimestamp: weaker.revisionTimestamp } : {}),
    ...(!stronger.evidence && weaker.evidence ? { evidence: weaker.evidence } : {}),
    ...(!stronger.authors?.length && weaker.authors?.length ? { authors: weaker.authors } : {}),
    ...(sessionRefs.length > 0 ? { sessionRefs } : {}),
    ...(conceptLinks.length > 0 ? { conceptLinks } : {}),
    ...(supportReceipt ? { supportReceipt } : {}),
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
  const { trusted: _staleTrustedCoverage, ...structuralCoverage } = sourceRefCoverage;
  const nextCoverage = {
    ...structuralCoverage,
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
    if (!validation.valid) {
      const issueCodes = (validation.issues || [])
        .filter((issue) => issue?.severity === 'blocker')
        .map((issue) => issue.code)
        .filter(Boolean);
      return {
        graph: null,
        reviewCourseIR: {
          version: validation.ir?.version || courseIR.version || '',
          lessonIds: (validation.ir?.lessons || []).map((lesson) => lesson.id),
          conceptIds: (validation.ir?.concepts || []).map((concept) => concept.id),
          assessmentIds: (validation.ir?.assessments || []).map((assessment) => assessment.id),
          sourceLedger: validation.ir?.sourceLedger || courseIR.sourceLedger || [],
          stats: validation.stats || null,
          valid: false,
          sourceProofFallback: {
            source: 'export-course-map',
            projectedThrough: 'curriculumv1',
            reason: 'source-backed pipeline proof was missing and the fallback CourseIR failed validation',
            valid: false,
            issueCodes,
          },
        },
        sourceRefCoverage: null,
      };
    }
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
  if (!qualityBlock) return null;
  if (qualityBlock.status !== 'graded') {
    const reason = String(qualityBlock.reason || 'quality grading did not complete')
      .replace(/\s+/g, ' ')
      .trim();
    return {
      severity: 'blocker',
      featureId: 'courseMap',
      label: 'Quality proof unavailable',
      message: `Package quality proof is unavailable (${reason}) — run finalization again before downloading`,
      source: 'qualityGate',
      retryable: false,
      autoFixable: false,
    };
  }
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
  lessons = [],
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
  evidenceDependencies = null,
  assessmentCoherence = null,
}) {
  const courseIR = buildManifestCourseIRProof(courseGraph, { sourceRefCoverage });
  const exportVerification = buildManifestExportVerification(digest);
  const handoffTrust = buildManifestHandoffTrust(digest);
  return {
    manifestVersion: PACKAGE_MANIFEST_VERSION,
    courseName,
    generatedAt,
    generator: buildManifestGenerator(digest, pipelineState),
    ...(exportVerification ? { exportVerification } : {}),
    ...(handoffTrust ? { handoffTrust } : {}),
    lessonScope:
      Array.isArray(lessonFilter) || lessonNumbers?.some((number, index) => number !== index + 1)
        ? lessonNumbers || lessonFilter.map((index) => index + 1)
        : 'all',
    lessons,
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
    ...(assessmentCoherence ? { assessmentCoherence } : {}),
    // v0.14.5 (A5): the readings registry with provenance tags.
    ...(readings && readings.length > 0 ? { readings } : {}),
    ...(Array.isArray(sourceLedger) && sourceLedger.length > 0 ? { sourceLedger } : {}),
    ...(sourceLedgerSummary ? { sourceLedgerSummary } : {}),
    ...(Array.isArray(sourceReviewRows) && sourceReviewRows.length > 0 ? { sourceReviewRows } : {}),
    ...(sourceReport ? { sourceReport } : {}),
    ...(courseIR ? { courseIR } : {}),
    ...(evidenceDependencies ? { evidenceDependencies } : {}),
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

function manifestLessonObjectives(lesson) {
  const lessonFocus = stripLessonPrefix(lesson?.title || lesson?.topic || 'this lesson') || 'this lesson';
  const values = [
    `Apply ${lessonFocus} in one practical example and justify one evidence-based revision.`,
    lesson?.learningObjectives,
    lesson?.objectives,
    ...(Array.isArray(lesson?.sections)
      ? lesson.sections.flatMap((section) => [section?.learningObjectives, section?.objectives])
      : []),
  ];
  return [
    ...new Set(
      values
        .flatMap((value) => (Array.isArray(value) ? value : String(value || '').split(/\n+/)))
        .map((value) => String(value || '').trim())
        .filter(Boolean),
    ),
  ];
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
  generatedAt: requestedGeneratedAt = null,
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
  const qualityScopeBinding = await buildPackageQualityScopeBinding({
    courseMap,
    deliverables,
    columns,
    lessonFilter,
    slideTheme,
    requestedFeatureIds,
    lessonNumbers,
    pipelineState,
    courseGraph,
    effectiveReadiness,
    qualityOptions,
  });
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
      zipLibrary: JSZip,
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
              zipLibrary: JSZip,
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
            zipLibrary: JSZip,
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

  const {
    collectRequiredLabAssets,
    buildBundledRequiredLabAssets,
    buildRequiredLabAssetsReport,
    buildPronunciationReference,
  } = await safeImport(() => import('./requiredLabAssets'));
  let requiredAssets = collectRequiredLabAssets({ courseMap, deliverables, requestedFeatureIds });
  if (requiredAssets.length > 0) {
    const bundledAssets = buildBundledRequiredLabAssets(requiredAssets, { courseName: safeCourseName });
    const bundledByRequirement = new Map();
    for (const asset of bundledAssets) {
      addRequiredFile(zip, files, failures, asset.path, asset.content, {
        featureId: 'requiredAssets',
        format: asset.format,
        minBytes: 32,
        fileContents,
      });
      bundledByRequirement.set(asset.requirementId, asset.path);
    }
    requiredAssets = requiredAssets.map((requirement) => {
      const path = bundledByRequirement.get(requirement.id);
      return path ? { ...requirement, status: 'bundled-starter', path } : { ...requirement, status: 'unresolved' };
    });
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

  const generatedAt = Number.isFinite(Date.parse(requestedGeneratedAt || ''))
    ? new Date(requestedGeneratedAt).toISOString()
    : new Date().toISOString();

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
  // Some runtime graphs carry retrieval state but omit course identity. Bind
  // the exported course name before source admission so a false friend cannot
  // bypass the course-aware gate merely because identity lives in courseMap.
  const courseAwareSourceGraph = courseGraph
    ? {
        ...courseGraph,
        course: {
          ...(courseGraph.course || {}),
          name: courseGraph?.course?.name || courseGraph?.course?.title || safeCourseName,
        },
        courseName: courseGraph.courseName || safeCourseName,
      }
    : courseGraph;
  let sourceLedgerBundle = mergeSourceLedgerBundles(
    buildSourceLedgerFromCourseGraph(courseAwareSourceGraph, { checkedAt: generatedAt }),
    buildSourceLedgerFromCourseGraph(fallbackCourseGraph, { checkedAt: generatedAt }),
    buildSourceLedgerFromSyllabusSchedule(fallbackCourseGraph || courseGraph, deliverables, { checkedAt: generatedAt }),
  );
  let sourceRefCoverage =
    courseGraph?.courseIR?.sourceRefCoverage || pipelineState?.courseIR?.sourceRefCoverage || null;
  let sourceManifestGraph = courseAwareSourceGraph;
  if (pipelineSourceProofExpected && !hasSourceLedgerRows(sourceLedgerBundle)) {
    const courseIRFallback = await buildCourseIRSourceProofFallback(courseMap);
    const fallbackSourceGraph = courseIRFallback?.graph
      ? courseIRFallback.graph
      : courseIRFallback?.reviewCourseIR
        ? { courseIR: courseIRFallback.reviewCourseIR }
        : null;
    if (fallbackSourceGraph) {
      sourceLedgerBundle = mergeSourceLedgerBundles(
        sourceLedgerBundle,
        buildSourceLedgerFromCourseGraph(fallbackSourceGraph, { checkedAt: generatedAt }),
      );
      sourceRefCoverage = sourceRefCoverage || courseIRFallback.sourceRefCoverage || null;
      sourceManifestGraph = {
        ...(courseGraph || fallbackCourseGraph || courseIRFallback.graph || {}),
        courseIR: {
          ...(courseGraph?.courseIR || fallbackCourseGraph?.courseIR || {}),
          ...(courseIRFallback.graph?.courseIR || courseIRFallback.reviewCourseIR || {}),
        },
      };
    }
  }
  // Export is a provenance boundary, not a retrieval pass. A thin run ledger
  // stays thin and review-required; the exporter never invents source rows to
  // make the package appear better researched than the authoring run was.
  const bridgedSourceProof = bridgeCourseIRSourceProofToTrustedLedger(
    sourceManifestGraph,
    sourceLedgerBundle,
    sourceRefCoverage,
  );
  sourceManifestGraph = bridgedSourceProof.courseGraph;
  sourceLedgerBundle = bridgedSourceProof.sourceLedgerBundle;
  sourceRefCoverage = bridgedSourceProof.sourceRefCoverage;
  // Scion's learner memory is not score evidence until the authored claim is
  // visible in the actual Office bytes. Complete that transaction here, after
  // every DOCX/PPTX exists but before the manifest and grader are assembled.
  // Unsupported paraphrases, deleted claims, and compiler-only receipts stay
  // unbound and cannot raise the deterministic evidence score.
  const { extractOfficeVisibleText } = await safeImport(() => import('./exportRenderedTextAudit.js'));
  const renderedOfficeArtifacts = [];
  for (const file of files) {
    if (!['docx', 'pptx'].includes(file?.format) || !fileContents[file.path]) continue;
    const text = await extractOfficeVisibleText(fileContents[file.path], file.format);
    if (!text) continue;
    const bytes = await qualityArtifactBytes(fileContents[file.path]);
    renderedOfficeArtifacts.push({
      path: file.path,
      featureId: file.featureId || null,
      text,
      sha256: await sha256QualityBytes(bytes),
    });
  }
  if (sourceLedgerBundle?.rows?.length > 0) {
    const rows = await bindRenderedClaimSupport(sourceLedgerBundle.rows, renderedOfficeArtifacts);
    sourceLedgerBundle = {
      ...sourceLedgerBundle,
      rows,
      summary: {
        ...summarizeSourceLedgerRows(rows),
        ...(sourceLedgerBundle.reviewRows?.length ? { reviewRequiredCount: sourceLedgerBundle.reviewRows.length } : {}),
      },
    };
  }
  // Do not invent a source-pipeline claim for callers that supplied neither a
  // pipeline receipt nor source proof. The old unconditional normalization
  // emitted "not evaluated (0 genome-linked lessons)" for a plain headless
  // compile; the grader then (correctly) interpreted the word "genome" as a
  // promise of source-ledger evidence and capped an otherwise clean package at
  // 89/B. Preserve an explicit limitation when a pipeline/source path exists,
  // but keep evidence-free deterministic compiles honestly unclaimed.
  const finalPipelineState =
    pipelineState || sourceProofExpected
      ? normalizePipelineStateWithSourceBackedJudgment(pipelineState, {
          sourceRefCoverage,
          sourceLedgerSummary: sourceLedgerBundle?.summary || null,
          sourceLedger: sourceLedgerBundle?.rows || null,
          courseGraph: sourceManifestGraph,
          courseMap,
        })
      : null;
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
  const manifestLessons = lessonIndices.map((lessonIndex, index) => ({
    lessonNumber: lessonNumbers[index],
    title: String(courseMap?.lessons?.[lessonIndex]?.title || '').trim(),
    objectives: manifestLessonObjectives(courseMap?.lessons?.[lessonIndex]),
  }));
  const assessmentCoherence = buildAssessmentCoherenceReceipt({
    lessons: manifestLessons,
    assessments: manifestAssessments?.entries || [],
    artifacts: renderedOfficeArtifacts,
  });
  const evidenceDependencies = buildLessonEvidenceDependencies({
    courseMap,
    courseGraph: sourceManifestGraph,
    deliverables,
    lessonIndices,
    sourceLedger: sourceLedgerBundle?.rows || [],
    sourceReviewRows: sourceLedgerBundle?.reviewRows || [],
    assessments: manifestAssessments?.entries || [],
    requiredAssets,
    files,
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
    lessons: manifestLessons,
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
    generationConstraints: (() => {
      const explicitLessonSequence = extractExplicitLessonSequence(qualityOptions.coursePrompt || '');
      const sessionMinutes = Number(qualityOptions.expectedSessionMinutes);
      const constraints = {
        ...(Number.isFinite(sessionMinutes) ? { sessionMinutes } : {}),
        ...(explicitLessonSequence.length >= 2 ? { explicitLessonSequence } : {}),
      };
      return Object.keys(constraints).length > 0 ? constraints : null;
    })(),
    evidenceDependencies,
    assessmentCoherence,
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
  let scoreLedger = null;
  let qualityFindings = [];
  let packageReadinessReceipt = null;
  if (quality !== false) {
    const gradedFileMap = { ...fileContents, 'PACKAGE_MANIFEST.json': JSON.stringify(manifest, null, 2) };
    const evidenceArtifactsBinding = await buildEvidenceArtifactBinding(gradedFileMap);
    const precomputedQuality = normalizePrecomputedPackageQuality(qualityOptions.precomputed, generatedAt);
    packageReadinessReceipt = buildPackageReadinessReceipt({
      readiness: effectiveReadiness,
      quality: precomputedQuality?.block || null,
      exportVerification: manifest.exportVerification || null,
    });
    const precomputedVerification = precomputedQuality
      ? await verifyScoreLedger({
          ledger: precomputedQuality.scoreLedger,
          quality: precomputedQuality.block,
          findings: precomputedQuality.findings,
          packageReadinessReceipt,
          currentGraderVersion: GRADER_VERSION,
          gradingScope: qualityScopeBinding,
          evidenceArtifacts: evidenceArtifactsBinding,
        })
      : null;
    if (
      precomputedQuality &&
      precomputedVerification?.status === 'verified' &&
      !precomputedQualityMissesCurrentGrader(precomputedQuality) &&
      !precomputedQualityMissesCurrentTexture(precomputedQuality) &&
      !precomputedQualityMissesScope(precomputedQuality, qualityScopeBinding) &&
      !precomputedQualityMissesEvidenceArtifacts(precomputedQuality, evidenceArtifactsBinding) &&
      !precomputedQualityMissesReadiness(precomputedQuality, effectiveReadiness) &&
      !precomputedQualityReferencesMissingPackageFiles(precomputedQuality, {
        ...fileContents,
        'PACKAGE_MANIFEST.json': JSON.stringify(manifest, null, 2),
      })
    ) {
      qualityBlock = precomputedQuality.block;
      qualityFindings = precomputedQuality.findings;
      scoreLedger = {
        ...precomputedQuality.scoreLedger,
        bindings: {
          ...(precomputedQuality.scoreLedger?.bindings || {}),
          packageReadiness: buildPackageReadinessBinding(effectiveReadiness),
        },
      };
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
          qualityBlock = {
            status: 'not-graded',
            reason: `grading timed out after ${timeoutMs}ms`,
            attemptedAt: generatedAt,
          };
        } else if (raced.error) {
          qualityBlock = {
            status: 'not-graded',
            reason: raced.error?.message || 'grading failed',
            attemptedAt: generatedAt,
          };
        } else {
          qualityResult = raced.value;
          qualityFindings = Array.isArray(qualityResult.findings) ? qualityResult.findings : [];
          scoreLedger = qualityResult.scoreLedger || null;
          if (scoreLedger) {
            scoreLedger.bindings = {
              gradingScope: qualityScopeBinding,
              evidenceArtifacts: evidenceArtifactsBinding,
              packageReadiness: buildPackageReadinessBinding(effectiveReadiness),
            };
          }
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
            gradedAt: generatedAt,
            scopeBinding: qualityScopeBinding,
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
        qualityBlock = {
          status: 'not-graded',
          reason: err?.message || 'grader unavailable',
          attemptedAt: generatedAt,
        };
      }
    }
    if (qualityBlock?.status !== 'graded' && !qualityReportMarkdown) {
      qualityReportMarkdown = renderUnavailableQualityReport(qualityBlock, { courseTitle: safeCourseName });
    }
    if (qualityBlock?.status !== 'graded') {
      // A rejected cached grade is verification input, never fallback truth.
      // If fresh grading fails or times out, replace its provisional receipt
      // so callers cannot display the rejected score as current evidence.
      packageReadinessReceipt = buildPackageReadinessReceipt({
        readiness: effectiveReadiness,
        quality: qualityBlock,
        exportVerification: manifest.exportVerification || null,
      });
    }
    if (qualityBlock?.status === 'graded' && scoreLedger) {
      packageReadinessReceipt = buildPackageReadinessReceipt({
        readiness: effectiveReadiness,
        quality: qualityBlock,
        exportVerification: manifest.exportVerification || null,
      });
      const packageReadinessText = JSON.stringify(packageReadinessReceipt, null, 2);
      const packageReadinessSha256 = await sha256QualityText(packageReadinessText);
      scoreLedger.bindings = {
        ...(scoreLedger.bindings || {}),
        packageReadiness: packageReadinessReceipt.readiness,
        packageReadinessReceipt: {
          algorithm: 'sha256',
          path: 'PACKAGE_READINESS.json',
          sha256: packageReadinessSha256,
        },
      };
      zip.file('PACKAGE_READINESS.json', packageReadinessText);
      fileContents['PACKAGE_READINESS.json'] = packageReadinessText;
      files.push({
        path: 'PACKAGE_READINESS.json',
        featureId: 'qualityEvidence',
        format: 'json',
        size: getExportPartSize(packageReadinessText),
      });
      const qualityFindingsReceipt = {
        protocol: 'coursemapper-quality-findings-v1',
        graderVersion: qualityBlock.graderVersion,
        findingCount: qualityFindings.length,
        findings: qualityFindings,
      };
      const qualityFindingsText = JSON.stringify(qualityFindingsReceipt, null, 2);
      const qualityFindingsSha256 = await sha256QualityText(qualityFindingsText);
      scoreLedger.bindings = {
        ...(scoreLedger.bindings || {}),
        qualityFindings: {
          algorithm: 'sha256',
          path: 'QUALITY_FINDINGS.json',
          sha256: qualityFindingsSha256,
          count: qualityFindings.length,
        },
      };
      zip.file('QUALITY_FINDINGS.json', qualityFindingsText);
      fileContents['QUALITY_FINDINGS.json'] = qualityFindingsText;
      files.push({
        path: 'QUALITY_FINDINGS.json',
        featureId: 'qualityEvidence',
        format: 'json',
        size: getExportPartSize(qualityFindingsText),
      });
      const scoreLedgerText = JSON.stringify(scoreLedger, null, 2);
      const scoreLedgerSha256 = await sha256QualityText(scoreLedgerText);
      qualityBlock.scoreLedger = {
        protocol: scoreLedger.protocol || 'coursemapper-score-ledger-v1',
        path: 'SCORE_LEDGER.json',
        sha256: scoreLedgerSha256,
        deterministicPackageEvidence: scoreLedger.deterministicPackageEvidence?.points || null,
        encodedDefectConformance: scoreLedger.encodedDefectConformance?.overall || null,
        bindings: scoreLedger.bindings || null,
      };
      zip.file('SCORE_LEDGER.json', scoreLedgerText);
      fileContents['SCORE_LEDGER.json'] = scoreLedgerText;
      files.push({
        path: 'SCORE_LEDGER.json',
        featureId: 'qualityEvidence',
        format: 'json',
        size: getExportPartSize(scoreLedgerText),
      });
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
      qualityScopeBinding,
      packageReadinessReceipt,
      // v0.15.187 Project Prof: assemble-only callers (headless harnesses)
      // get the in-memory file map so they can run the grader's own
      // extraction over the REAL export binaries — the Artifact Bridge.
      fileContents,
    };
  }

  applyDeterministicArchiveDates(zip);
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
    qualityScopeBinding,
    packageReadinessReceipt,
  };
}

export async function downloadCourseMaterialsZip(options = {}) {
  const { saveAs } = await safeImport(() => import('file-saver'));
  const result = await buildCourseMaterialsZip(options);
  // Building the artifact is recoverable work; releasing it to the user's
  // Downloads folder is the trust boundary. When grading was requested, an
  // explicit timeout/error must pause that release even though the ZIP and
  // its unavailable-quality report were assembled successfully. Callers keep
  // the result so they can present/retry without losing the expensive build.
  if (options.quality !== false && result.quality?.status !== 'graded') {
    return { ...result, downloaded: false, downloadFailure: { code: 'quality-proof-unavailable' } };
  }
  // The save call is the final trust boundary, so it must independently
  // enforce the exact receipt-v2 export proof. UI eligibility is advisory and
  // legacy receipts may enter the rebuild path; only the newly assembled
  // package receipt can authorize a user-facing download.
  if (options.quality !== false && !hasVerifiedPackageDownloadReceipt(result.packageReadinessReceipt)) {
    return { ...result, downloaded: false, downloadFailure: { code: 'package-safety-unverified' } };
  }
  saveAs(result.blob, result.fileName);
  return { ...result, downloaded: true };
}
