import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';

// Default header descriptions for known column keys
const DEFAULT_HEADERS = {
  learningGoals: 'Learning Goals\n\nWhat are the big ideas and questions to be addressed in the course? (Derived from Values, Knowledge, Skills, Behaviors and Competencies outlined in syllabus)',
  topicSection: 'Topic/Section',
  learningObjectives: "Learning Objectives\n\nStudents will be able to...\n\n[Learning Objective: Describe what students will need to be able to know and do using active verbs from Revised Bloom's taxonomy]",
  weeklyAssessments: 'Weekly Assessments\n\n...by doing or demonstrating through some kind of task or activity...\n\nState the Evidence that student has achieved to demonstrate the desired learning objective.',
  asyncActivities: 'ASYNCHRONOUS Activities & Instructional Strategies\n\nWhat must students do or see demonstrated in order to perform effectively and achieve desired results?',
  syncActivities: 'SYNCHRONOUS Activities & Instructional Strategies\n\nWhat must students do or see demonstrated in order to perform effectively and achieve desired results?',
  technologyNeeded: 'Technology Needed\n\nIdentify specific platforms or types of technology that will be needed to facilitate the assessments and activities.',
  presentationFormat: 'Presentation Format of Instructional Material\n\nWhat kind of media or delivery format will be most effective for communicating the instructional material?',
  supportingResources: 'Supporting Resources\n\nWhat additional materials and resources are best suited to accomplish these goals?\n\n[Provide supporting resources for the content & instruction]',
  evaluateDesign: 'Evaluate Design\n\n[Ask yourself: Is everything in this row aligned and coherent?]',
};

function buildColumns(customColumns) {
  // Always start with the Week/Module column
  const cols = [
    { key: 'weekModule', header: 'Week or Module [Topic]', width: 28 },
  ];

  if (customColumns && customColumns.length > 0) {
    for (const col of customColumns) {
      cols.push({
        key: col.key,
        header: DEFAULT_HEADERS[col.key] || col.label,
        width: col.key === 'topicSection' ? 30 : 35,
      });
    }
  } else {
    // Fallback to all defaults
    for (const [key, header] of Object.entries(DEFAULT_HEADERS)) {
      cols.push({ key, header, width: key === 'evaluateDesign' ? 18 : key === 'technologyNeeded' ? 25 : key === 'presentationFormat' ? 22 : 35 });
    }
  }

  return cols;
}

const HEADER_FILL = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FF4472C4' },
};

const HEADER_FONT = {
  name: 'Inter',
  size: 10,
  bold: true,
  color: { argb: 'FFFFFFFF' },
};

const DATA_FONT = {
  name: 'Inter',
  size: 10,
};

const BORDER_STYLE = {
  top: { style: 'thin', color: { argb: 'FFB4C6E7' } },
  left: { style: 'thin', color: { argb: 'FFB4C6E7' } },
  bottom: { style: 'thin', color: { argb: 'FFB4C6E7' } },
  right: { style: 'thin', color: { argb: 'FFB4C6E7' } },
};

const LESSON_FILL = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFD9E2F3' },
};

/**
 * Generate a formatted xlsx from course map data and trigger download.
 * @param {object} courseMap - The course map data
 * @param {Array} [customColumns] - Custom columns from ColumnEditor
 */
export async function generateXlsx(courseMap, customColumns) {
  const COLUMNS = buildColumns(customColumns);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Course Mapper';
  workbook.created = new Date();

  const sheetName = 'Course Map';
  const worksheet = workbook.addWorksheet(sheetName);

  // Set columns
  worksheet.columns = COLUMNS.map((col) => ({
    key: col.key,
    width: col.width,
  }));

  // Add header row
  const headerRow = worksheet.addRow(
    COLUMNS.reduce((obj, col) => {
      obj[col.key] = col.header;
      return obj;
    }, {})
  );

  // Style header row
  headerRow.height = 120;
  headerRow.eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
    cell.alignment = { vertical: 'top', horizontal: 'left', wrapText: true };
    cell.border = BORDER_STYLE;
  });

  // Track rows for merging column A
  let currentRow = 2; // Row 1 is header

  for (const lesson of courseMap.lessons) {
    const startRow = currentRow;

    for (const section of lesson.sections) {
      const rowData = { weekModule: section === lesson.sections[0] ? lesson.title : '' };
      for (const col of COLUMNS) {
        if (col.key === 'weekModule') continue;
        if (col.key === 'evaluateDesign') {
          rowData[col.key] = section[col.key] === true || section[col.key] === 'true' ? '✓' : '';
        } else {
          rowData[col.key] = section[col.key] || '';
        }
      }
      const row = worksheet.addRow(rowData);

      row.eachCell((cell, colNumber) => {
        cell.font = DATA_FONT;
        cell.alignment = { vertical: 'top', horizontal: 'left', wrapText: true };
        cell.border = BORDER_STYLE;
        // Center the Evaluate Design column
        const colDef = COLUMNS[colNumber - 1];
        if (colDef && colDef.key === 'evaluateDesign') {
          cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: false };
          cell.font = { ...DATA_FONT, size: 14 };
        }
      });

      // Light blue background for the lesson title column
      row.getCell('weekModule').fill = LESSON_FILL;
      row.getCell('weekModule').font = { ...DATA_FONT, bold: true };

      currentRow++;
    }

    const endRow = currentRow - 1;

    // Merge column A for this lesson if multiple sections
    if (endRow > startRow) {
      worksheet.mergeCells(startRow, 1, endRow, 1);
    }
  }

  // Freeze header row
  worksheet.views = [{ state: 'frozen', ySplit: 1 }];

  // Generate the file
  const buffer = await workbook.xlsx.writeBuffer();
  const fileName = `${courseMap.courseName || 'Course'} Course Map (${courseMap.semester || 'TBD'}).xlsx`;
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  saveAs(blob, fileName);

  return fileName;
}
