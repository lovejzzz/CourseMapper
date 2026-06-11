import { buildReadinessReport, scopeCourseMapToLessons, scopeDeliverableDataToLessons } from './deliverableReadiness';
import { assertOfficeExportHasNoInternalText } from './exportTextInspector';
import { resolveFeatureLabel } from './exporters/exporterUtils.js';
import { safeImport } from './safeImport';

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

function addRequiredFile(zip, files, failures, path, content, { featureId, format, minBytes = MIN_EXPORT_BYTES } = {}) {
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
  files.push({ path, featureId: publicFeatureId(featureId), label: resolveFeatureLabel(featureId), format, size });
  return true;
}

async function addRequiredOfficeFile(
  zip,
  files,
  failures,
  path,
  content,
  { featureId, format, minBytes = MIN_EXPORT_BYTES } = {},
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

  zip.file(path, await getZipFileContent(content));
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

function buildManifest({
  courseName,
  lessonFilter,
  readiness,
  files,
  requestedFeatureIds,
  requiredAssets = [],
  pipelineState = null,
  assessments = null,
}) {
  return {
    courseName,
    generatedAt: new Date().toISOString(),
    lessonScope: Array.isArray(lessonFilter) ? lessonFilter.map((index) => index + 1) : 'all',
    // v0.12.1: how the content was produced (enrichment / genome linker /
    // plan health) so downloaded packages are auditable without console logs.
    ...(pipelineState ? { pipeline: pipelineState } : {}),
    // v0.14.1 (3.3d): the assessment registry, with artifact file links.
    ...(assessments && assessments.length > 0 ? { assessments } : {}),
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

  if (readiness?.issues?.length > 0) {
    const reportPath = 'READINESS_REPORT.txt';
    const report = buildReadinessReport(readiness, { courseName: safeCourseName });
    zip.file(reportPath, report);
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

  const { collectRequiredLabAssets, buildRequiredLabAssetsReport } = await safeImport(
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
    });
  }

  if (failures.length > 0) throw new PackageZipExportError(failures);

  // v0.14.1 (3.3d): the registry rides the manifest. The caller's graph is
  // authoritative; without one (legacy callers) the registry derives from
  // the course map — deterministic and identical to what generation built.
  let assessmentRegistry = Array.isArray(courseGraph?.assessments) ? courseGraph.assessments : null;
  if (!assessmentRegistry && courseMap?.lessons) {
    try {
      const { deriveCourseGraphFromCourseMap } = await safeImport(() => import('./courseGraph/deriveFromCourseMap.js'));
      assessmentRegistry = deriveCourseGraphFromCourseMap(courseMap)?.assessments || null;
    } catch {
      assessmentRegistry = null;
    }
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
  });
  const manifestText = JSON.stringify(manifest, null, 2);
  zip.file('PACKAGE_MANIFEST.json', manifestText);
  files.push({
    path: 'PACKAGE_MANIFEST.json',
    featureId: 'manifest',
    format: 'json',
    size: getExportPartSize(manifestText),
  });

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
  };
}

export async function downloadCourseMaterialsZip(options = {}) {
  const { saveAs } = await safeImport(() => import('file-saver'));
  const result = await buildCourseMaterialsZip(options);
  saveAs(result.blob, result.fileName);
  return result;
}
