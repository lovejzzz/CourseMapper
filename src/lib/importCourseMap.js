// Lazy-loaded heavy dependency
let _ExcelJS;
async function getExcelJS() {
  if (!_ExcelJS) {
    const mod = await import('exceljs');
    _ExcelJS = mod.default || mod;
  }
  return _ExcelJS;
}

/**
 * Import a course map from an .xlsx or .csv file.
 * Expects a table with a "Week/Module" first column and section data columns.
 * Returns a courseMap object: { courseName, semester, lessons: [...] }
 */
export async function importCourseMap(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  let rows;

  if (ext === 'xlsx') {
    rows = await parseXlsxRows(file);
  } else if (ext === 'xls') {
    throw new Error('Legacy .xls course-map import is not supported. Convert it to .xlsx or .csv first.');
  } else if (ext === 'csv') {
    const text = await file.text();
    rows = parseCSVRows(text);
  } else {
    throw new Error('Unsupported import format. Use .xlsx or .csv.');
  }

  if (!rows || rows.length < 2) {
    throw new Error('File appears empty or has no data rows.');
  }

  // First row is headers
  const headers = rows[0].map((h) => String(h || '').trim());
  const dataRows = rows.slice(1).filter((r) => r.some((cell) => String(cell || '').trim()));

  if (dataRows.length === 0) {
    throw new Error('No data rows found after header.');
  }

  // Map header names to known column keys
  const colMap = headers.map((h, i) => ({
    index: i,
    header: h,
    key: guessColumnKey(h),
  }));

  // Build lessons — group by the first column (Week/Module)
  const lessons = [];
  let currentLesson = null;

  for (const row of dataRows) {
    const weekModule = String(row[0] || '').trim();

    // If first column has content, start a new lesson
    if (weekModule) {
      currentLesson = { title: weekModule, sections: [] };
      lessons.push(currentLesson);
    }

    // If no lesson started yet, create one
    if (!currentLesson) {
      currentLesson = { title: 'Lesson 1', sections: [] };
      lessons.push(currentLesson);
    }

    // Build section from remaining columns
    const section = {};
    for (const col of colMap) {
      if (col.index === 0) continue; // skip Week/Module column
      if (!col.key) continue;
      const val = String(row[col.index] || '').trim();
      if (col.key === 'evaluateDesign') {
        section[col.key] = val === '✓' || val === 'true' || val === 'yes' || val === '1';
      } else {
        section[col.key] = val;
      }
    }

    // Only add section if it has at least one non-empty field
    if (Object.values(section).some((v) => v && v !== false)) {
      currentLesson.sections.push(section);
    }
  }

  // Filter out lessons with no sections
  const validLessons = lessons.filter((l) => l.sections.length > 0);
  if (validLessons.length === 0) {
    throw new Error('Could not parse any lessons from the file.');
  }

  // Try to extract course name from file name
  const courseName =
    file.name
      .replace(/\.(xlsx|xls|csv)$/i, '')
      .replace(/Course\s*Map/i, '')
      .replace(/\(.*?\)/g, '')
      .trim() || 'Imported Course';

  return {
    courseName,
    semester: 'TBD',
    lessons: validLessons,
  };
}

async function parseXlsxRows(file) {
  const ExcelJS = await getExcelJS();
  const arrayBuffer = await file.arrayBuffer();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(arrayBuffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];

  const rows = [];
  let maxCol = 0;
  sheet.eachRow({ includeEmpty: true }, (row) => {
    maxCol = Math.max(maxCol, row.cellCount);
  });

  sheet.eachRow({ includeEmpty: true }, (row) => {
    const values = [];
    for (let col = 1; col <= maxCol; col += 1) {
      values.push(formatCellValue(row.getCell(col).value));
    }
    rows.push(values);
  });

  return rows;
}

function formatCellValue(value) {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value !== 'object') return String(value);
  if (Array.isArray(value.richText)) return value.richText.map((part) => part.text || '').join('');
  if ('result' in value) return formatCellValue(value.result);
  if ('text' in value) return formatCellValue(value.text);
  if ('hyperlink' in value && value.hyperlink) return formatCellValue(value.hyperlink);
  return String(value);
}

// Map common header text to our internal column keys
const HEADER_MAPPINGS = {
  'learning goals': 'learningGoals',
  'learning goal': 'learningGoals',
  topic: 'topicSection',
  'topic/section': 'topicSection',
  'topic section': 'topicSection',
  'learning objectives': 'learningObjectives',
  'learning objective': 'learningObjectives',
  objectives: 'learningObjectives',
  assessments: 'weeklyAssessments',
  'weekly assessments': 'weeklyAssessments',
  assessment: 'weeklyAssessments',
  'async activities': 'asyncActivities',
  'asynchronous activities': 'asyncActivities',
  asynchronous: 'asyncActivities',
  'sync activities': 'syncActivities',
  'synchronous activities': 'syncActivities',
  synchronous: 'syncActivities',
  technology: 'technologyNeeded',
  'technology needed': 'technologyNeeded',
  format: 'presentationFormat',
  'presentation format': 'presentationFormat',
  resources: 'supportingResources',
  'supporting resources': 'supportingResources',
  evaluate: 'evaluateDesign',
  'evaluate design': 'evaluateDesign',
};

function guessColumnKey(header) {
  if (!header) return null;
  const lower = header
    .toLowerCase()
    .replace(/[^a-z0-9\s/]/g, '')
    .trim();

  // Skip the first "week/module" column
  if (lower.includes('week') || lower.includes('module')) return null;

  // Exact/partial match
  if (HEADER_MAPPINGS[lower]) return HEADER_MAPPINGS[lower];

  // Fuzzy: check if any mapping key is contained
  for (const [pattern, key] of Object.entries(HEADER_MAPPINGS)) {
    if (lower.includes(pattern) || pattern.includes(lower)) {
      return key;
    }
  }

  // Unknown column — use a sanitized key
  return lower.replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '') || null;
}

function parseCSVRows(text) {
  const rows = [];
  let current = [];
  let inQuote = false;
  let field = '';

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuote) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuote = false;
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') {
        inQuote = true;
      } else if (ch === ',') {
        current.push(field);
        field = '';
      } else if (ch === '\n' || (ch === '\r' && text[i + 1] === '\n')) {
        current.push(field);
        field = '';
        rows.push(current);
        current = [];
        if (ch === '\r') i++;
      } else if (ch === '\r') {
        current.push(field);
        field = '';
        rows.push(current);
        current = [];
      } else {
        field += ch;
      }
    }
  }
  if (field || current.length > 0) {
    current.push(field);
    rows.push(current);
  }
  return rows;
}
