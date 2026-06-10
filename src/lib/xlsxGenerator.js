import { safeImport } from './safeImport.js';
import { assertOfficeExportHasNoInternalText, sanitizeInternalExportLanguage } from './exportTextInspector.js';
import { buildXlsxWorkbook, columnName, XLSX_MIME } from './lightweightXlsx.js';

// Lazy-loaded download helper
let _saveAs;
async function getSaveAs() {
  if (!_saveAs) _saveAs = (await safeImport(() => import('file-saver'))).saveAs;
  return _saveAs;
}

// Lazy-loaded zip helper (for the post-build workbook polish pass)
let _JSZip;
async function getJSZip() {
  if (!_JSZip) _JSZip = (await safeImport(() => import('jszip'))).default;
  return _JSZip;
}

// Default header descriptions for known column keys
const DEFAULT_HEADERS = {
  learningGoals: 'Learning Goals',
  topicSection: 'Topic/Section',
  learningObjectives: 'Learning Objectives',
  weeklyAssessments: 'Weekly Assessments',
  asyncActivities: 'Asynchronous Activities',
  syncActivities: 'Synchronous Activities',
  technologyNeeded: 'Technology Needed',
  presentationFormat: 'Presentation Format',
  supportingResources: 'Supporting Resources',
  evaluateDesign: 'Evaluate Design',
};

// Per-column widths sized from the v0.12 production audit: A holds 78-char
// lesson titles, Learning Objectives / Evaluate Design hold 225-358 chars,
// Presentation Format tops out around 39 chars.
const COLUMN_WIDTHS = {
  weekModule: 34,
  topicSection: 30,
  learningObjectives: 46,
  presentationFormat: 22,
  evaluateDesign: 46,
};
const DEFAULT_COLUMN_WIDTH = 35;

function columnWidth(key) {
  return COLUMN_WIDTHS[key] || DEFAULT_COLUMN_WIDTH;
}

function buildColumns(customColumns) {
  // Always start with the Week/Module column
  const cols = [{ key: 'weekModule', header: 'Week or Module', width: columnWidth('weekModule') }];

  if (customColumns && customColumns.length > 0) {
    for (const col of customColumns) {
      if (col.enabled === false) continue; // skip disabled columns
      cols.push({
        key: col.key,
        header: DEFAULT_HEADERS[col.key] || col.label,
        width: columnWidth(col.key),
      });
    }
  } else {
    // Fallback to all defaults
    for (const [key, header] of Object.entries(DEFAULT_HEADERS)) {
      cols.push({ key, header, width: columnWidth(key) });
    }
  }

  return cols;
}

// Flatten a cell value to a plain string (handles arrays from AI responses)
function toStr(val) {
  if (val == null) return '';
  if (Array.isArray(val)) return sanitizeInternalExportLanguage(val.map((v) => String(v)).join('\n'));
  return sanitizeInternalExportLanguage(val);
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
  await assertOfficeExportHasNoInternalText(buffer, 'xlsx', 'Course Map');
  const fileName = `${courseMap.courseName || 'Course'} Course Map (${courseMap.semester || 'TBD'}).xlsx`;
  const blob = new Blob([buffer], { type: XLSX_MIME });
  saveAs(blob, fileName);

  return fileName;
}

// Row sizing: Excel only honors stored heights, so estimate one per row from
// wrapped line counts. ~13pt per line at 10pt type, clamped to a sane range.
const HEADER_ROW_HEIGHT = 32;
const LINE_HEIGHT_PT = 13;
const ROW_PADDING_PT = 6;
const MIN_ROW_HEIGHT = 28;
const MAX_ROW_HEIGHT = 220;

const HEADER_TAB_COLOR = 'FF4472C4'; // matches the header band fill

function estimateRowHeight(row, columns) {
  let maxLines = 1;
  row.forEach((value, colIndex) => {
    const text = String(value ?? '');
    if (!text) return;
    // Excel column width is roughly characters-per-line at this type size
    const charsPerLine = Math.max(8, Math.round(columns[colIndex]?.width || DEFAULT_COLUMN_WIDTH));
    const lines = text
      .split('\n')
      .reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / charsPerLine)), 0);
    maxLines = Math.max(maxLines, lines);
  });
  return Math.min(MAX_ROW_HEIGHT, Math.max(MIN_ROW_HEIGHT, maxLines * LINE_HEIGHT_PT + ROW_PADDING_PT));
}

/**
 * Build xlsx buffer without downloading (for Google Sheets upload).
 */
export async function buildXlsxBuffer(courseMap, customColumns) {
  const { columns, rows, merges, bandedRowIndexes } = buildCourseMapSheet(courseMap, customColumns);
  const buffer = await buildXlsxWorkbook({
    title: `${courseMap.courseName || 'Course'} Course Map`,
    sheets: [
      {
        name: 'Course Map',
        columns: columns.map((col) => ({ width: col.width })),
        rows,
        merges,
        frozenRows: 1,
        rowOptions: rows.map((row, rowIndex) =>
          rowIndex === 0 ? { height: HEADER_ROW_HEIGHT } : { height: estimateRowHeight(row, columns) },
        ),
        getStyle(rowIndex, colIndex) {
          if (rowIndex === 0) return 'header';
          if (colIndex === 0) return 'lesson';
          return bandedRowIndexes.has(rowIndex) ? 'alt' : 'data';
        },
      },
    ],
  });
  return await polishCourseMapWorkbook(buffer, columnName(columns.length));
}

// Workbook polish that the shared lightweight builder has no API for:
// universal fonts, centered header labels, tab color, autofilter, print setup.
async function polishCourseMapWorkbook(buffer, lastColumn) {
  const JSZip = await getJSZip();
  const zip = await JSZip.loadAsync(buffer);

  // Inter is not universally installed; the export design system requires Calibri body type.
  let styles = await zip.file('xl/styles.xml').async('string');
  styles = styles.replaceAll('name val="Inter"', 'name val="Calibri"');
  // Vertically center the short header labels inside the 32pt blue band.
  styles = styles.replace(
    /(<xf numFmtId="0" fontId="1" fillId="2"[^>]*><alignment vertical=")top("[^>]*\/><\/xf>)/,
    '$1center$2',
  );
  zip.file('xl/styles.xml', styles);

  let sheet = await zip.file('xl/worksheets/sheet1.xml').async('string');
  sheet = sheet.replace(
    '<sheetViews>',
    `<sheetPr><tabColor rgb="${HEADER_TAB_COLOR}"/><pageSetUpPr fitToPage="1"/></sheetPr><sheetViews>`,
  );
  sheet = sheet.replace('</sheetData>', `</sheetData><autoFilter ref="A1:${lastColumn}1"/>`);
  sheet = sheet.replace(
    '</worksheet>',
    '<pageMargins left="0.25" right="0.25" top="0.5" bottom="0.5" header="0.3" footer="0.3"/>' +
      '<pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/></worksheet>',
  );
  zip.file('xl/worksheets/sheet1.xml', sheet);

  // Repeat the header row on every printed page.
  let workbook = await zip.file('xl/workbook.xml').async('string');
  workbook = workbook.replace(
    '</sheets>',
    `</sheets>\n  <definedNames><definedName name="_xlnm.Print_Titles" localSheetId="0">'Course Map'!$1:$1</definedName></definedNames>`,
  );
  zip.file('xl/workbook.xml', workbook);

  return await zip.generateAsync({ type: 'arraybuffer', mimeType: XLSX_MIME });
}

function buildCourseMapSheet(courseMap, customColumns) {
  const columns = stripEmptyColumns(buildColumns(customColumns), courseMap);
  const rows = [columns.map((col) => sanitizeInternalExportLanguage(col.header))];
  const merges = [];
  // Alternate the soft band fill per LESSON block (lesson 1 plain, lesson 2
  // banded, ...) so each lesson's section rows read as one group.
  const bandedRowIndexes = new Set();

  let currentRowNumber = 2;
  let lessonIndex = 0;
  for (const lesson of courseMap.lessons || []) {
    const startRowNumber = currentRowNumber;
    const sections = lesson.sections && lesson.sections.length > 0 ? lesson.sections : [{}];
    for (const section of sections) {
      rows.push(
        columns.map((col) => {
          if (col.key === 'weekModule') {
            return section === sections[0] ? sanitizeInternalExportLanguage(lesson.title) : '';
          }
          if (col.key === 'evaluateDesign') {
            if (section[col.key] === true || section[col.key] === 'true') return '\u2713';
            if (section[col.key] === false || section[col.key] === 'false') return '';
          }
          return toStr(section[col.key]);
        }),
      );
      if (lessonIndex % 2 === 1) bandedRowIndexes.add(rows.length - 1);
      currentRowNumber++;
    }

    const endRowNumber = currentRowNumber - 1;
    if (endRowNumber > startRowNumber) {
      merges.push(`A${startRowNumber}:${columnName(1)}${endRowNumber}`);
    }
    lessonIndex++;
  }

  return { columns, rows, merges, bandedRowIndexes };
}
