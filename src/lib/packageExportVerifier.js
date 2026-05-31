import { scopeCourseMapToLessons, scopeDeliverableDataToLessons } from './deliverableReadiness';
import { resolveFeatureLabel } from './exporters/exporterUtils.js';

const DEFAULT_FEATURES = [
  'courseMap',
  'syllabus',
  'lessonPlans',
  'slideDecks',
  'assignments',
  'rubrics',
  'discussions',
  'quizBank',
  'studyGuides',
  'courseFaq',
];

const INTERNAL_EXPORT_TEXT_PATTERNS = [
  { label: 'compiler decision', pattern: /\bcompiler decision(?:s)?\b/i },
  { label: 'compiler path', pattern: /\bcompiler path\b/i },
  { label: 'deterministic blueprint', pattern: /\bdeterministic[- ]blueprint\b/i },
  { label: 'model-use policy', pattern: /\bmodel[- ]use policy\b/i },
  { label: 'source grounding', pattern: /\bsource grounding\b/i },
  { label: 'source confidence', pattern: /\bsource confidence\b/i },
  { label: 'publish gate', pattern: /\bpublish(?:ing)? gate\b/i },
  { label: 'handoff review focus', pattern: /\bhandoff[- ]review focus\b/i },
  { label: 'local-review', pattern: /\blocal-review\b|\blocal review (?:action|gate|focus|required)\b/i },
  { label: 'source-review-required', pattern: /\bsource[- ]review[- ]required\b/i },
  { label: 'proof packet', pattern: /\bproof packet\b/i },
  { label: 'audit gate', pattern: /\baudit gate\b/i },
];

function getBlobSize(blob) {
  if (!blob) return 0;
  if (Number.isFinite(blob.size)) return blob.size;
  if (Number.isFinite(blob.byteLength)) return blob.byteLength;
  return 0;
}

function getBufferSize(buffer) {
  if (!buffer) return 0;
  if (Number.isFinite(buffer.byteLength)) return buffer.byteLength;
  if (Number.isFinite(buffer.length)) return buffer.length;
  return 0;
}

function getSelectedFeatures(selectedFeatures, deliverables) {
  if (Array.isArray(selectedFeatures) && selectedFeatures.length > 0) return selectedFeatures;
  const generated = Object.entries(deliverables || {})
    .filter(([, entry]) => entry?.status === 'done' && entry?.data)
    .map(([featureId]) => featureId);
  return generated.length > 0 ? ['courseMap', ...generated] : DEFAULT_FEATURES;
}

function createCheck(featureId, format, status, message, extra = {}) {
  return {
    featureId,
    label: resolveFeatureLabel(featureId),
    format,
    status,
    message,
    ...extra,
  };
}

function findInternalExportText(rows) {
  const headers = Array.isArray(rows?.headers) ? rows.headers : [];
  const dataRows = Array.isArray(rows?.rows) ? rows.rows : [];
  for (const [rowIndex, row] of dataRows.entries()) {
    for (const [columnIndex, value] of (Array.isArray(row) ? row : []).entries()) {
      const text = String(value || '');
      const match = INTERNAL_EXPORT_TEXT_PATTERNS.find(({ pattern }) => pattern.test(text));
      if (match) {
        return {
          label: match.label,
          rowIndex,
          columnIndex,
          column: headers[columnIndex] || `Column ${columnIndex + 1}`,
        };
      }
    }
  }
  return null;
}

async function verifyCourseMapExport({ courseMap, columns, lessonFilter }) {
  if (!courseMap?.lessons?.length) {
    return [createCheck('courseMap', 'xlsx', 'failed', 'Course map has no lessons to export.')];
  }

  const scopedCourseMap = scopeCourseMapToLessons(courseMap, lessonFilter);
  const { buildXlsxBuffer } = await import('./xlsxGenerator');
  const buffer = await buildXlsxBuffer(scopedCourseMap, columns);
  const size = getBufferSize(buffer);
  return [
    createCheck(
      'courseMap',
      'xlsx',
      size > 128 ? 'passed' : 'failed',
      size > 128 ? 'Course map spreadsheet can be generated.' : 'Course map spreadsheet output was empty.',
      { size },
    ),
  ];
}

async function verifyCsvExport(featureId, data) {
  const { deliverableToCsvRows } = await import('./exporters/csvExporter');
  const rows = deliverableToCsvRows(featureId, data);
  const headerCount = rows?.headers?.length || 0;
  const rowCount = rows?.rows?.length || 0;
  if (headerCount === 0) {
    return createCheck(featureId, 'csv', 'failed', 'CSV export has no headers.', { rowCount });
  }
  if (rowCount === 0) {
    return createCheck(featureId, 'csv', 'warning', 'CSV export has headers but no data rows.', { rowCount });
  }
  const internalText = findInternalExportText(rows);
  if (internalText) {
    return createCheck(
      featureId,
      'csv',
      'failed',
      `CSV export exposes internal ${internalText.label} language in ${internalText.column}.`,
      { rowCount, internalText },
    );
  }
  return createCheck(featureId, 'csv', 'passed', 'CSV export can be generated.', { rowCount });
}

async function verifyDocxExport(featureId, data, courseName) {
  const { buildDeliverableDocxBlob } = await import('./exporters/bulkDocxExporter');
  const blob = await buildDeliverableDocxBlob(featureId, data, courseName);
  const size = getBlobSize(blob);
  return createCheck(
    featureId,
    'docx',
    size > 128 ? 'passed' : 'failed',
    size > 128 ? 'DOCX export can be generated.' : 'DOCX export output was empty.',
    { size },
  );
}

async function verifyPptxExport(data, courseName, slideTheme) {
  const { buildSlideDeckPptxBlob } = await import('./exporters/pptxExporter');
  const blob = await buildSlideDeckPptxBlob(data, courseName, slideTheme || 0);
  const size = getBlobSize(blob);
  return createCheck(
    'slideDecks',
    'pptx',
    size > 128 ? 'passed' : 'failed',
    size > 128 ? 'Slide deck PowerPoint export can be generated.' : 'Slide deck PowerPoint output was empty.',
    { size },
  );
}

async function verifyDeliverableExport({ featureId, entry, courseMap, lessonFilter, slideTheme }) {
  if (!entry?.data) {
    return [createCheck(featureId, 'package', 'warning', `${resolveFeatureLabel(featureId)} has no generated data.`)];
  }

  const courseName = courseMap?.courseName || 'Course';
  const scopedData = scopeDeliverableDataToLessons(featureId, entry.data, lessonFilter);
  const checks = [];

  checks.push(await verifyCsvExport(featureId, scopedData));
  if (featureId === 'slideDecks') {
    checks.push(await verifyPptxExport(scopedData, courseName, slideTheme));
  } else {
    checks.push(await verifyDocxExport(featureId, scopedData, courseName));
  }

  return checks;
}

export async function verifyPackageExports({
  courseMap,
  deliverables,
  selectedFeatures,
  columns,
  lessonFilter,
  slideTheme,
} = {}) {
  const checks = [];
  const features = getSelectedFeatures(selectedFeatures, deliverables);

  for (const featureId of features) {
    try {
      if (featureId === 'courseMap') {
        checks.push(...(await verifyCourseMapExport({ courseMap, columns, lessonFilter })));
        continue;
      }
      checks.push(
        ...(await verifyDeliverableExport({
          featureId,
          entry: deliverables?.[featureId],
          courseMap,
          lessonFilter,
          slideTheme,
        })),
      );
    } catch (err) {
      checks.push(
        createCheck(
          featureId,
          featureId === 'slideDecks' ? 'pptx/docx/csv' : 'docx/csv',
          'failed',
          err.message || 'Export check failed.',
        ),
      );
    }
  }

  const failed = checks.filter((check) => check.status === 'failed');
  const warnings = checks.filter((check) => check.status === 'warning');
  const passed = checks.filter((check) => check.status === 'passed');

  return {
    status: failed.length > 0 ? 'failed' : warnings.length > 0 ? 'warnings' : 'passed',
    checked: checks.length,
    passed: passed.length,
    failed: failed.length,
    warningCount: warnings.length,
    checks,
  };
}
