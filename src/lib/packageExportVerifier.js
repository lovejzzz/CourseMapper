import { scopeCourseMapToLessons, scopeDeliverableDataToLessons } from './deliverableReadiness';
import {
  assertTableRowsHaveNoInternalExportLanguage,
  findInternalExportText,
  findInternalOfficeXmlText,
  OFFICE_TEXT_PATH_PATTERNS,
  sanitizeInternalExportLanguage,
} from './exportTextInspector';
import { expandKeys } from './keyMaps';
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

function getFailureFormat(featureId) {
  if (featureId === 'courseMap') return 'xlsx/pdf';
  if (featureId === 'slideDecks') return 'pptx/pdf/csv';
  return 'docx/pdf/csv';
}

function toStr(value) {
  if (value == null) return '';
  if (Array.isArray(value)) return sanitizeInternalExportLanguage(value.map((item) => String(item)).join('\n'));
  return sanitizeInternalExportLanguage(value);
}

function buildCourseMapPdfRows(courseMap, columns) {
  const enabledColumns =
    Array.isArray(columns) && columns.length > 0 ? columns.filter((column) => column.enabled !== false) : null;
  const columnKeys = enabledColumns
    ? enabledColumns.map((column) => column.key)
    : [
        'learningGoals',
        'topicSection',
        'learningObjectives',
        'weeklyAssessments',
        'asyncActivities',
        'syncActivities',
        'technologyNeeded',
        'presentationFormat',
        'supportingResources',
        'evaluateDesign',
      ];
  const headers = enabledColumns
    ? ['Week/Module', ...enabledColumns.map((column) => column.label)]
    : [
        'Week/Module',
        'Learning Goals',
        'Topic/Section',
        'Learning Objectives',
        'Assessments',
        'Async Activities',
        'Sync Activities',
        'Technology',
        'Format',
        'Resources',
        'Evaluate',
      ];
  const rows = [];
  for (const lesson of courseMap?.lessons || []) {
    const sections = lesson.sections && lesson.sections.length > 0 ? lesson.sections : [{}];
    for (let sectionIndex = 0; sectionIndex < sections.length; sectionIndex += 1) {
      const section = sections[sectionIndex];
      const row = [sectionIndex === 0 ? toStr(lesson.title) : ''];
      for (const key of columnKeys) {
        row.push(
          key === 'evaluateDesign'
            ? section[key] === true || section[key] === 'true'
              ? 'Yes'
              : ''
            : toStr(section[key]),
        );
      }
      rows.push(row);
    }
  }
  return { headers, rows };
}

function buildSlideDeckPdfRows(data) {
  const expanded = expandKeys('slideDecks', data);
  const decks = expanded.slideDecks || expanded.decks || [];
  const rows = [];
  decks.forEach((deck, deckIndex) => {
    rows.push(['Lesson', deck.lessonTitle || deck.title || `Lesson ${deckIndex + 1}`]);
    (deck.slides || []).forEach((slide, slideIndex) => {
      rows.push(['Slide Title', slide.title || '']);
      const bullets = slide.bullets || slide.content || [];
      bullets.forEach((bullet) => rows.push([`Slide ${slideIndex + 1} Bullet`, String(bullet || '')]));
      rows.push(['Speaker Notes', slide.speakerNotes || slide.notes || '']);
    });
  });
  return { headers: ['Field', 'Content'], rows };
}

function verifyPdfRows(featureId, rows, subject) {
  const headerCount = rows?.headers?.length || 0;
  const rowCount = rows?.rows?.length || 0;
  if (headerCount === 0) {
    return createCheck(featureId, 'pdf', 'failed', 'PDF export has no text headers.', { rowCount });
  }
  if (rowCount === 0) {
    return createCheck(featureId, 'pdf', 'warning', 'PDF export has headers but no text rows.', { rowCount });
  }
  try {
    assertTableRowsHaveNoInternalExportLanguage(rows, subject, 'PDF');
  } catch (err) {
    return createCheck(featureId, 'pdf', 'failed', err.message || 'PDF export exposes internal proof language.', {
      rowCount,
    });
  }
  return createCheck(featureId, 'pdf', 'passed', 'PDF export text can be generated.', { rowCount });
}

async function verifyCourseMapExport({ courseMap, columns, lessonFilter }) {
  if (!courseMap?.lessons?.length) {
    return [createCheck('courseMap', 'xlsx', 'failed', 'Course map has no lessons to export.')];
  }

  const checks = [];
  const scopedCourseMap = scopeCourseMapToLessons(courseMap, lessonFilter);
  const { buildXlsxBuffer } = await import('./xlsxGenerator');
  const buffer = await buildXlsxBuffer(scopedCourseMap, columns);
  const size = getBufferSize(buffer);
  if (size <= 128) {
    return [createCheck('courseMap', 'xlsx', 'failed', 'Course map spreadsheet output was empty.', { size })];
  }
  const internalText = await findInternalOfficeXmlText(buffer, OFFICE_TEXT_PATH_PATTERNS.xlsx);
  if (internalText) {
    return [
      createCheck(
        'courseMap',
        'xlsx',
        'failed',
        `Course map spreadsheet exposes internal ${internalText.label} language in ${internalText.path}.`,
        { size, internalText },
      ),
    ];
  }
  checks.push(createCheck('courseMap', 'xlsx', 'passed', 'Course map spreadsheet can be generated.', { size }));
  checks.push(verifyPdfRows('courseMap', buildCourseMapPdfRows(scopedCourseMap, columns), 'Course Map'));
  return checks;
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
  if (size <= 128) {
    return createCheck(featureId, 'docx', 'failed', 'DOCX export output was empty.', { size });
  }
  const internalText = await findInternalOfficeXmlText(blob, OFFICE_TEXT_PATH_PATTERNS.docx);
  if (internalText) {
    return createCheck(
      featureId,
      'docx',
      'failed',
      `DOCX export exposes internal ${internalText.label} language in ${internalText.path}.`,
      { size, internalText },
    );
  }
  const { auditOfficeBlobRepetition, auditOfficeAccessibility } = await import('./exportRenderedTextAudit');
  const repetition = await auditOfficeBlobRepetition(blob, 'docx');
  if (repetition) {
    return createCheck(featureId, 'docx', 'warning', `DOCX export generated, but ${repetition.message}`, {
      size,
      repetition,
    });
  }
  const accessibility = await auditOfficeAccessibility(blob, 'docx');
  if (accessibility) {
    return createCheck(featureId, 'docx', 'warning', `DOCX export generated, but ${accessibility.message}`, {
      size,
      accessibility,
    });
  }
  return createCheck(featureId, 'docx', 'passed', 'DOCX export can be generated.', { size });
}

async function verifyPptxExport(data, courseName, slideTheme) {
  const { buildSlideDeckPptxBlob } = await import('./exporters/pptxExporter');
  const blob = await buildSlideDeckPptxBlob(data, courseName, slideTheme || 0);
  const size = getBlobSize(blob);
  if (size <= 128) {
    return createCheck('slideDecks', 'pptx', 'failed', 'Slide deck PowerPoint output was empty.', { size });
  }
  const internalText = await findInternalOfficeXmlText(blob, OFFICE_TEXT_PATH_PATTERNS.pptx);
  if (internalText) {
    return createCheck(
      'slideDecks',
      'pptx',
      'failed',
      `Slide deck PowerPoint export exposes internal ${internalText.label} language in ${internalText.path}.`,
      { size, internalText },
    );
  }
  const { auditOfficeBlobRepetition, auditOfficeAccessibility } = await import('./exportRenderedTextAudit');
  const repetition = await auditOfficeBlobRepetition(blob, 'pptx');
  if (repetition) {
    return createCheck('slideDecks', 'pptx', 'warning', `PPTX export generated, but ${repetition.message}`, {
      size,
      repetition,
    });
  }
  const accessibility = await auditOfficeAccessibility(blob, 'pptx');
  if (accessibility) {
    return createCheck('slideDecks', 'pptx', 'warning', `PPTX export generated, but ${accessibility.message}`, {
      size,
      accessibility,
    });
  }
  return createCheck('slideDecks', 'pptx', 'passed', 'Slide deck PowerPoint export can be generated.', { size });
}

async function verifyDeliverableExport({ featureId, entry, courseMap, lessonFilter, slideTheme }) {
  if (!entry?.data) {
    return [createCheck(featureId, 'package', 'warning', `${resolveFeatureLabel(featureId)} has no generated data.`)];
  }

  const courseName = courseMap?.courseName || 'Course';
  const scopedData = scopeDeliverableDataToLessons(featureId, entry.data, lessonFilter);
  const checks = [];

  const { auditDeliverableContentQuality } = await import('./contentQualityChecks');
  const contentQuality = auditDeliverableContentQuality(featureId, scopedData);
  checks.push(
    createCheck(
      featureId,
      'content',
      contentQuality.findings.length > 0 ? 'warning' : 'passed',
      contentQuality.summary,
      contentQuality.findings.length > 0 ? { findings: contentQuality.findings.slice(0, 10) } : undefined,
    ),
  );

  checks.push(await verifyCsvExport(featureId, scopedData));
  if (featureId === 'slideDecks') {
    checks.push(await verifyPptxExport(scopedData, courseName, slideTheme));
    checks.push(verifyPdfRows(featureId, buildSlideDeckPdfRows(scopedData), resolveFeatureLabel(featureId)));
  } else {
    checks.push(await verifyDocxExport(featureId, scopedData, courseName));
    const { deliverableToCsvRows } = await import('./exporters/csvExporter');
    checks.push(verifyPdfRows(featureId, deliverableToCsvRows(featureId, scopedData), resolveFeatureLabel(featureId)));
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
      checks.push(createCheck(featureId, getFailureFormat(featureId), 'failed', err.message || 'Export check failed.'));
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
