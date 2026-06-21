import { buildReadinessReport, scopeCourseMapToLessons, scopeDeliverableDataToLessons } from './deliverableReadiness';
import { assertOfficeExportHasNoInternalText } from './exportTextInspector';
import { resolveFeatureLabel } from './exporters/exporterUtils.js';
import {
  buildSourceLedgerFromCourseGraph,
  buildSourceReportMarkdown,
  summarizeSourceLedgerRows,
} from './knowledge/sourceLedger.js';
import { safeImport } from './safeImport';
import { peekVoicePassOutcome } from './voicePass.js';

const MIN_EXPORT_BYTES = 128;
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
        title: assessment.title,
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

function mergeSourceLedgerBundles(...bundles) {
  const rows = [];
  const reviewRows = [];
  const seen = new Set();
  const reviewSeen = new Set();
  for (const bundle of bundles) {
    for (const row of bundle?.rows || []) {
      const key = sourceLedgerRowKey(row);
      if (!key.trim() || seen.has(key)) continue;
      seen.add(key);
      rows.push(row);
    }
    for (const row of bundle?.reviewRows || []) {
      const key = sourceLedgerRowKey(row);
      if (!key.trim() || reviewSeen.has(key)) continue;
      reviewSeen.add(key);
      reviewRows.push(row);
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
  const trustedRows = sourceLedgerBundle?.rows || [];
  const reviewRows = sourceLedgerBundle?.reviewRows || [];
  const coverageTotal = sourceCoverageTotal(sourceRefCoverage);
  const coverageLedgerRows = sourceCoverageLedgerRows(sourceRefCoverage);
  const coverageMissing = Number(sourceRefCoverage?.totals?.missing) || 0;
  const coverageDanglingRefs = Number(sourceRefCoverage?.totals?.danglingRefs) || 0;
  if (!courseGraph?.courseIR || trustedRows.length <= 1 || coverageTotal <= 0 || coverageLedgerRows === null) {
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
  const conceptLinkedRows = trustedRows.filter((row) => (row?.conceptLinks || []).length > 0);
  if (conceptLinkedRows.length === 0) {
    return {
      courseGraph,
      sourceLedgerBundle,
      sourceRefCoverage,
      bridged: false,
    };
  }

  const nextCoverage = {
    ...sourceRefCoverage,
    sourceLedgerRows: trustedRows.length,
    bridge: {
      source: 'coursegraph-concept-linked-ledger',
      trustedRows: trustedRows.length,
      conceptLinkedRows: conceptLinkedRows.length,
      replacedReviewRows: reviewRows.length,
    },
  };
  const nextCourseGraph = {
    ...(courseGraph || {}),
    courseIR: {
      ...(courseGraph.courseIR || {}),
      sourceLedger: trustedRows,
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
  // v0.14.3 A1/A2: the in-memory file map (path → string | ArrayBuffer) the
  // grader reads through createMemoryFileProvider — the same bytes the zip
  // receives, captured at assembly time.
  const fileContents = {};

  if (readiness?.issues?.length > 0) {
    const reportPath = 'READINESS_REPORT.txt';
    const report = buildReadinessReport(readiness, { courseName: safeCourseName });
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
  const bridgedSourceProof = bridgeCourseIRSourceProofToTrustedLedger(
    sourceManifestGraph,
    sourceLedgerBundle,
    sourceRefCoverage,
  );
  sourceManifestGraph = bridgedSourceProof.courseGraph;
  sourceLedgerBundle = bridgedSourceProof.sourceLedgerBundle;
  sourceRefCoverage = bridgedSourceProof.sourceRefCoverage;
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
    readiness,
    files,
    requestedFeatureIds,
    requiredAssets,
    pipelineState,
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
    voicePass: pipelineState?.voicePass || peekVoicePassOutcome(),
  });

  // ── v0.14.3 WS-A A2/A3: the package grades itself ─────────────────────────
  // Ordering contract: the manifest is itself IN the zip and grading needs the
  // file map INCLUDING the manifest — so the grader runs over the map with the
  // manifest serialized WITHOUT its quality block, then quality is injected
  // before zip assembly. The grader ignores manifest.quality and skips
  // QUALITY_REPORT.md by contract, so a downloaded package regrades to the
  // same score. Grading is bounded (10s default); timeout/error becomes
  // quality { status: 'not-graded', reason }. Actual graded P0s are handled
  // by the finalizer quality gate before the export panel downloads the ZIP.
  let qualityBlock = null;
  let qualityResult = null;
  let qualityReportMarkdown = null;
  if (quality !== false) {
    const qualityOptions = quality && typeof quality === 'object' ? quality : {};
    const timeoutMs = Number.isFinite(qualityOptions.timeoutMs) ? qualityOptions.timeoutMs : 10000;
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
    manifest.quality = qualityBlock;
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
    };
  }

  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
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
