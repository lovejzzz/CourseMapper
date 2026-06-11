import { safeImport } from './safeImport.js';
import { assertOfficeExportHasNoInternalText, sanitizeInternalExportLanguage } from './exportTextInspector.js';
import { buildXlsxWorkbook, columnName, XLSX_MIME } from './lightweightXlsx.js';
import { resolveFeatureLabel } from './exporters/exporterUtils.js';
import { sanitizeFilePart } from './packageZipExporter.js';

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

// ── v0.14.1 (3.4): package-context hyperlinks on assessment cells ───────────
// Inside a downloaded package the course map indexes the deliverables, so each
// Weekly Assessments cell links to the package file that fulfills it.
//
// Variant choice (Excel allows ONE hyperlink per CELL, not per line): the cell
// text stays exactly as rendered — each line already carries its own
// "→ Assignment Briefs / Lesson NN" / "→ Quiz & Exam Bank" reference from
// 3.3a — and the whole cell links to the lesson's PRIMARY artifact file:
// the lesson's Assignment Briefs docx when the section has any graded/oral
// entry (after 3a's zip-naming decision one file carries all of that lesson's
// briefs), else the lesson's Quiz & Exam Bank docx when the section carries an
// exam. In-class-only cells get no link (they live inside the session).
//
// Links are OPT-IN via buildXlsxBuffer options.packageLinks — the standalone
// course-map download and the Google Sheets upload build the same workbook
// without options and must never carry dead relative links.

const HYPERLINK_REL_TYPE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink';

function escapeXmlAttr(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Mirrors packageZipExporter's truncateFilePart + lessonFileStem (not exported
// there); any change to the zip naming must be mirrored here so the relative
// targets keep matching the real file names the zip writes.
function truncateLessonFilePart(value, maxLength = 95) {
  const text = sanitizeFilePart(value, 'Lesson');
  if (text.length <= maxLength) return text;
  return (
    text
      .slice(0, maxLength)
      .replace(/\s+\S*$/, '')
      .replace(/[.\-\s]+$/g, '') || text.slice(0, maxLength)
  );
}

// "../Assignment Briefs/Lesson 08 - <title> - Assignment Briefs.docx" — the
// path of the lesson's deliverable docx RELATIVE to the xlsx, which lives one
// folder deep ("Course Map/<name>.xlsx") inside the extracted package.
function lessonArtifactRelativePath(lessonTitle, lessonNumber, featureId) {
  const label = sanitizeFilePart(resolveFeatureLabel(featureId), 'Deliverable');
  const withoutPrefix = String(lessonTitle || '')
    .replace(/^(?:lesson|week)\s*\d+\s*[:.-]?\s*/i, '')
    .trim();
  const safeTitle = truncateLessonFilePart(withoutPrefix || lessonTitle || `Lesson ${lessonNumber}`);
  return `../${label}/Lesson ${String(lessonNumber).padStart(2, '0')} - ${safeTitle} - ${label}.docx`;
}

/**
 * Resolve the registry the hyperlinks read from. The caller's graph is
 * authoritative when it maps 1:1 onto the rendered map; a lesson-filtered map
 * (its sessions no longer align by index) falls back to deriving from the
 * rendered map itself — the same deterministic path the package exporter uses
 * for its manifest registry.
 */
async function buildPackageLinkContext(courseMap, packageLinks) {
  if (!packageLinks || typeof packageLinks !== 'object') return null;
  const requested = Array.isArray(packageLinks.featureIds) ? packageLinks.featureIds : ['assignments', 'quizBank'];
  const linkableFeatures = new Set(requested.filter((id) => id === 'assignments' || id === 'quizBank'));
  if (linkableFeatures.size === 0) return null;

  const lessons = Array.isArray(courseMap?.lessons) ? courseMap.lessons : [];
  if (lessons.length === 0) return null;

  let graph = null;
  const provided = packageLinks.courseGraph;
  if (Array.isArray(provided?.assessments) && provided?.sessions?.length === lessons.length) {
    graph = provided;
  } else {
    try {
      const { deriveCourseGraphFromCourseMap } = await safeImport(() => import('./courseGraph/deriveFromCourseMap.js'));
      graph = deriveCourseGraphFromCourseMap(courseMap);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(graph?.assessments) || graph.assessments.length === 0) return null;

  return {
    graph,
    linkableFeatures,
    // Original lesson numbers per rendered row block (lesson-filtered package
    // exports renumber positions but keep the zip's per-lesson file names).
    lessonNumbers: Array.isArray(packageLinks.lessonNumbers) ? packageLinks.lessonNumbers : null,
  };
}

// One linkable feature per cell: graded/oral entries win (briefs), then exams.
function sectionLinkFeature(entries, linkableFeatures) {
  if (entries.some((entry) => entry.kind === 'graded-artifact' || entry.kind === 'oral')) {
    if (linkableFeatures.has('assignments')) return 'assignments';
  }
  if (entries.some((entry) => entry.kind === 'exam') && linkableFeatures.has('quizBank')) return 'quizBank';
  return null;
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
    const lines = text.split('\n').reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / charsPerLine)), 0);
    maxLines = Math.max(maxLines, lines);
  });
  return Math.min(MAX_ROW_HEIGHT, Math.max(MIN_ROW_HEIGHT, maxLines * LINE_HEIGHT_PT + ROW_PADDING_PT));
}

/**
 * Build xlsx buffer without downloading (for Google Sheets upload and the
 * package zip).
 *
 * @param {object} [options] — { packageLinks } (v0.14.1 3.4): present ONLY in
 *   the package-export context; assessment cells then hyperlink to the
 *   package's deliverable files. Shape: { courseGraph?, featureIds?,
 *   lessonNumbers? } — see buildPackageLinkContext.
 */
export async function buildXlsxBuffer(courseMap, customColumns, options = {}) {
  const linkContext = await buildPackageLinkContext(courseMap, options.packageLinks);
  const { columns, rows, merges, bandedRowIndexes, hyperlinks } = buildCourseMapSheet(
    courseMap,
    customColumns,
    linkContext,
  );
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
  return await polishCourseMapWorkbook(buffer, columnName(columns.length), hyperlinks);
}

// Workbook polish that the shared lightweight builder has no API for:
// universal fonts, centered header labels, tab color, autofilter, print setup,
// and (v0.14.1 3.4, package context only) cell hyperlinks + their rels part.
async function polishCourseMapWorkbook(buffer, lastColumn, hyperlinks = []) {
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

  // v0.14.1 (3.4): one external hyperlink per assessment cell. Targets are
  // package-relative with forward slashes (URI-encoded so "Quiz & Exam Bank"
  // survives), so they resolve wherever the zip is extracted. The <hyperlinks>
  // block must precede pageMargins per the CT_Worksheet element order.
  if (hyperlinks.length > 0) {
    const relIdByTarget = new Map();
    const relationships = [];
    const hyperlinkXml = hyperlinks
      .map(({ ref, target, tooltip }) => {
        let relId = relIdByTarget.get(target);
        if (!relId) {
          relId = `rIdHl${relIdByTarget.size + 1}`;
          relIdByTarget.set(target, relId);
          relationships.push(
            `<Relationship Id="${relId}" Type="${HYPERLINK_REL_TYPE}" Target="${escapeXmlAttr(encodeURI(target))}" TargetMode="External"/>`,
          );
        }
        const tooltipAttr = tooltip ? ` tooltip="${escapeXmlAttr(tooltip)}"` : '';
        return `<hyperlink ref="${ref}" r:id="${relId}"${tooltipAttr}/>`;
      })
      .join('');
    sheet = sheet.replace('</worksheet>', `<hyperlinks>${hyperlinkXml}</hyperlinks></worksheet>`);
    zip.file(
      'xl/worksheets/_rels/sheet1.xml.rels',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relationships.join('')}</Relationships>`,
    );
  }

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

function buildCourseMapSheet(courseMap, customColumns, linkContext = null) {
  const columns = stripEmptyColumns(buildColumns(customColumns), courseMap);
  const rows = [columns.map((col) => sanitizeInternalExportLanguage(col.header))];
  const merges = [];
  // Alternate the soft band fill per LESSON block (lesson 1 plain, lesson 2
  // banded, ...) so each lesson's section rows read as one group.
  const bandedRowIndexes = new Set();
  // v0.14.1 (3.4): package-context hyperlinks \u2014 { ref, target, tooltip }.
  const hyperlinks = [];
  const assessmentColumnIndex = columns.findIndex((col) => col.key === 'weeklyAssessments');
  const assessmentsById = linkContext
    ? new Map(linkContext.graph.assessments.map((assessment) => [assessment.id, assessment]))
    : null;

  let currentRowNumber = 2;
  let lessonIndex = 0;
  for (const lesson of courseMap.lessons || []) {
    const startRowNumber = currentRowNumber;
    const sections = lesson.sections && lesson.sections.length > 0 ? lesson.sections : [{}];
    let sectionIndex = 0;
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

      if (linkContext && assessmentColumnIndex >= 0 && toStr(section.weeklyAssessments)) {
        const registrySection = linkContext.graph.sessions?.[lessonIndex]?.sections?.[sectionIndex];
        const entries = (registrySection?.assessmentRefs || [])
          .map((id) => assessmentsById.get(id))
          .filter(Boolean);
        const featureId = sectionLinkFeature(entries, linkContext.linkableFeatures);
        if (featureId) {
          const lessonNumber = linkContext.lessonNumbers?.[lessonIndex] ?? lessonIndex + 1;
          hyperlinks.push({
            ref: `${columnName(assessmentColumnIndex + 1)}${currentRowNumber}`,
            target: lessonArtifactRelativePath(lesson.title, lessonNumber, featureId),
            tooltip: `Open ${resolveFeatureLabel(featureId)} for Lesson ${String(lessonNumber).padStart(2, '0')}`,
          });
        }
      }

      currentRowNumber++;
      sectionIndex++;
    }

    const endRowNumber = currentRowNumber - 1;
    if (endRowNumber > startRowNumber) {
      merges.push(`A${startRowNumber}:${columnName(1)}${endRowNumber}`);
    }
    lessonIndex++;
  }

  return { columns, rows, merges, bandedRowIndexes, hyperlinks };
}
