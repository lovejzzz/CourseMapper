import { safeImport } from './safeImport.js';
import {
  assertTableRowsHaveNoInternalExportLanguage,
  assertTextHasNoInternalExportLanguage,
  sanitizeInternalExportLanguage,
} from './exportTextInspector.js';

// Lazy-loaded heavy dependencies
let _saveAs;
async function getSaveAs() {
  if (!_saveAs) _saveAs = (await safeImport(() => import('file-saver'))).saveAs;
  return _saveAs;
}

// Flatten a cell value to a plain string (handles arrays from AI responses)
function toStr(val) {
  if (val == null) return '';
  if (Array.isArray(val)) return sanitizeInternalExportLanguage(val.map((v) => String(v)).join('\n'));
  return sanitizeInternalExportLanguage(val);
}

/**
 * Export course map as CSV.
 */
export async function generateCsv(courseMap, customColumns) {
  const enabledColumns =
    customColumns && customColumns.length > 0 ? customColumns.filter((c) => c.enabled !== false) : null;

  const colKeys = enabledColumns
    ? enabledColumns.map((c) => c.key)
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

  const colHeaders = enabledColumns
    ? ['Week/Module', ...enabledColumns.map((c) => c.label)]
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

  const escape = (val) => {
    const str = String(val || '').replace(/"/g, '""');
    return str.includes(',') || str.includes('\n') || str.includes('"') ? `"${str}"` : str;
  };

  const rows = [colHeaders.map(escape).join(',')];

  for (const lesson of courseMap.lessons) {
    const sections = lesson.sections && lesson.sections.length > 0 ? lesson.sections : [{}];
    for (let i = 0; i < sections.length; i++) {
      const section = sections[i];
      const weekModule = i === 0 ? toStr(lesson.title) : '';
      const row = [escape(weekModule)];
      for (const key of colKeys) {
        if (key === 'evaluateDesign') {
          row.push(section[key] === true || section[key] === 'true' ? '✓' : '');
        } else {
          row.push(escape(toStr(section[key])));
        }
      }
      rows.push(row.join(','));
    }
  }

  const csvContent = rows.join('\n');
  assertTextHasNoInternalExportLanguage(csvContent, 'Course Map', 'CSV');
  const saveAs = await getSaveAs();
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const fileName = `${courseMap.courseName || 'Course'} Course Map (${courseMap.semester || 'TBD'}).csv`;
  saveAs(blob, fileName);
  return fileName;
}

/**
 * Export course map as PDF.
 */
export async function generatePdf(courseMap, customColumns) {
  const enabledColumns =
    customColumns && customColumns.length > 0 ? customColumns.filter((c) => c.enabled !== false) : null;

  const colKeys = enabledColumns
    ? enabledColumns.map((c) => c.key)
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

  const colHeaders = enabledColumns
    ? ['Week/Module', ...enabledColumns.map((c) => c.label)]
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

  const body = [];
  for (const lesson of courseMap.lessons) {
    const sections = lesson.sections && lesson.sections.length > 0 ? lesson.sections : [{}];
    for (let i = 0; i < sections.length; i++) {
      const section = sections[i];
      const weekModule = i === 0 ? toStr(lesson.title) : '';
      const row = [weekModule];
      for (const key of colKeys) {
        if (key === 'evaluateDesign') {
          row.push(section[key] === true || section[key] === 'true' ? '✓' : '');
        } else {
          row.push(toStr(section[key]));
        }
      }
      body.push(row);
    }
  }
  assertTableRowsHaveNoInternalExportLanguage({ headers: colHeaders, rows: body }, 'Course Map', 'PDF');

  const { classroomPdfDefinition, downloadClassroomPdf } = await import('./exporters/classroomPdf.js');
  const content = [
    { text: 'COURSE MAP', fontSize: 10, bold: true, color: '#2B579A', margin: [0, 0, 0, 5] },
    { text: courseMap.courseName || 'Course', fontSize: 20, bold: true, margin: [0, 0, 0, 12] },
  ];
  body.forEach((row, index) => {
    content.push({
      text: row[0] || `Section ${index + 1}`,
      fontSize: 14,
      bold: true,
      headlineLevel: 1,
      margin: [0, 12, 0, 6],
    });
    row.slice(1).forEach((value, column) => {
      if (value)
        content.push({
          text: [{ text: `${colHeaders[column + 1]}: `, bold: true }, { text: value }],
          margin: [0, 0, 0, 7],
        });
    });
  });
  const fileName = `${courseMap.courseName || 'Course'} Course Map (${courseMap.semester || 'TBD'}).pdf`;
  await downloadClassroomPdf(classroomPdfDefinition(content, courseMap.courseName, 'Course Map'), fileName);
  return fileName;
}
