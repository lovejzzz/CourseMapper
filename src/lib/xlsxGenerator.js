import { safeImport } from './safeImport.js';
import { buildXlsxWorkbook, columnName, XLSX_MIME } from './lightweightXlsx.js';

// Lazy-loaded download helper
let _saveAs;
async function getSaveAs() {
  if (!_saveAs) _saveAs = (await safeImport(() => import('file-saver'))).saveAs;
  return _saveAs;
}

// Default header descriptions for known column keys
const DEFAULT_HEADERS = {
  learningGoals:
    'Learning Goals\n\nWhat are the big ideas and questions to be addressed in the course? (Derived from Values, Knowledge, Skills, Behaviors and Competencies outlined in syllabus)',
  topicSection: 'Topic/Section',
  learningObjectives:
    "Learning Objectives\n\nWhat students will know or be able to do by the end of the lesson, using active verbs from Revised Bloom's taxonomy.",
  weeklyAssessments:
    'Weekly Assessments\n\n...by doing or demonstrating through some kind of task or activity...\n\nState the Evidence that student has achieved to demonstrate the desired learning objective.',
  asyncActivities:
    'ASYNCHRONOUS Activities & Instructional Strategies\n\nWhat must students do or see demonstrated in order to perform effectively and achieve desired results?',
  syncActivities:
    'SYNCHRONOUS Activities & Instructional Strategies\n\nWhat must students do or see demonstrated in order to perform effectively and achieve desired results?',
  technologyNeeded:
    'Technology Needed\n\nIdentify specific platforms or types of technology that will be needed to facilitate the assessments and activities.',
  presentationFormat:
    'Presentation Format of Instructional Material\n\nWhat kind of media or delivery format will be most effective for communicating the instructional material?',
  supportingResources:
    'Supporting Resources\n\nAdditional materials and resources aligned to the lesson goals, activities, and assessments.',
  evaluateDesign: 'Evaluate Design\n\nAlignment check for goals, objectives, assessments, activities, and resources.',
};

function buildColumns(customColumns) {
  // Always start with the Week/Module column
  const cols = [{ key: 'weekModule', header: 'Week or Module', width: 28 }];

  if (customColumns && customColumns.length > 0) {
    for (const col of customColumns) {
      if (col.enabled === false) continue; // skip disabled columns
      cols.push({
        key: col.key,
        header: DEFAULT_HEADERS[col.key] || col.label,
        width: col.key === 'topicSection' ? 30 : 35,
      });
    }
  } else {
    // Fallback to all defaults
    for (const [key, header] of Object.entries(DEFAULT_HEADERS)) {
      cols.push({
        key,
        header,
        width: key === 'evaluateDesign' ? 18 : key === 'technologyNeeded' ? 25 : key === 'presentationFormat' ? 22 : 35,
      });
    }
  }

  return cols;
}

// Flatten a cell value to a plain string (handles arrays from AI responses)
function toStr(val) {
  if (val == null) return '';
  if (Array.isArray(val)) return val.map((v) => String(v)).join('\n');
  return String(val);
}

// Remove columns that are entirely empty across all data rows (e.g. unused "Evaluate Design")
function stripEmptyColumns(columns, courseMap) {
  if (!courseMap?.lessons?.length) return columns;
  const populated = new Set(['weekModule']); // always keep the lesson title column
  for (const lesson of courseMap.lessons) {
    for (const section of lesson.sections?.length ? lesson.sections : [{}]) {
      for (const col of columns) {
        if (populated.has(col.key)) continue;
        const val = section[col.key];
        if (val != null && val !== '' && val !== false && val !== 0 && !(Array.isArray(val) && val.length === 0)) {
          populated.add(col.key);
        }
      }
    }
  }
  return columns.filter((col) => populated.has(col.key));
}

/**
 * Generate a formatted xlsx from course map data and trigger download.
 * @param {object} courseMap - The course map data
 * @param {Array} [customColumns] - Custom columns from ColumnEditor
 */
export async function generateXlsx(courseMap, customColumns) {
  const saveAs = await getSaveAs();
  const buffer = await buildXlsxBuffer(courseMap, customColumns);
  const fileName = `${courseMap.courseName || 'Course'} Course Map (${courseMap.semester || 'TBD'}).xlsx`;
  const blob = new Blob([buffer], { type: XLSX_MIME });
  saveAs(blob, fileName);

  return fileName;
}

/**
 * Build xlsx buffer without downloading (for Google Sheets upload).
 */
export async function buildXlsxBuffer(courseMap, customColumns) {
  const { columns, rows, merges, evaluateDesignColumnIndex } = buildCourseMapSheet(courseMap, customColumns);
  return await buildXlsxWorkbook({
    title: `${courseMap.courseName || 'Course'} Course Map`,
    sheets: [
      {
        name: 'Course Map',
        columns: columns.map((col) => ({ width: col.width })),
        rows,
        merges,
        frozenRows: 1,
        rowOptions: [{ height: 120 }],
        getStyle(rowIndex, colIndex) {
          if (rowIndex === 0) return 'header';
          if (colIndex === 0) return 'lesson';
          if (colIndex === evaluateDesignColumnIndex) return 'center';
          return 'data';
        },
      },
    ],
  });
}

function buildCourseMapSheet(courseMap, customColumns) {
  const columns = stripEmptyColumns(buildColumns(customColumns), courseMap);
  const rows = [columns.map((col) => col.header)];
  const merges = [];
  const evaluateDesignColumnIndex = columns.findIndex((col) => col.key === 'evaluateDesign');

  let currentRowNumber = 2;
  for (const lesson of courseMap.lessons || []) {
    const startRowNumber = currentRowNumber;
    const sections = lesson.sections && lesson.sections.length > 0 ? lesson.sections : [{}];
    for (const section of sections) {
      rows.push(
        columns.map((col) => {
          if (col.key === 'weekModule') return section === sections[0] ? lesson.title : '';
          if (col.key === 'evaluateDesign') {
            if (section[col.key] === true || section[col.key] === 'true') return '\u2713';
            if (section[col.key] === false || section[col.key] === 'false') return '';
          }
          return toStr(section[col.key]);
        }),
      );
      currentRowNumber++;
    }

    const endRowNumber = currentRowNumber - 1;
    if (endRowNumber > startRowNumber) {
      merges.push(`A${startRowNumber}:${columnName(1)}${endRowNumber}`);
    }
  }

  return { columns, rows, merges, evaluateDesignColumnIndex };
}
