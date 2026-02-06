import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { saveAs } from 'file-saver';

/**
 * Export course map as CSV.
 */
export function generateCsv(courseMap, customColumns) {
  const colKeys = customColumns && customColumns.length > 0
    ? customColumns.map(c => c.key)
    : ['learningGoals', 'topicSection', 'learningObjectives', 'weeklyAssessments',
       'asyncActivities', 'syncActivities', 'technologyNeeded', 'presentationFormat',
       'supportingResources', 'evaluateDesign'];

  const colHeaders = customColumns && customColumns.length > 0
    ? ['Week/Module', ...customColumns.map(c => c.label)]
    : ['Week/Module', 'Learning Goals', 'Topic/Section', 'Learning Objectives',
       'Assessments', 'Async Activities', 'Sync Activities', 'Technology',
       'Format', 'Resources', 'Evaluate'];

  const escape = (val) => {
    const str = String(val || '').replace(/"/g, '""');
    return str.includes(',') || str.includes('\n') || str.includes('"') ? `"${str}"` : str;
  };

  const rows = [colHeaders.map(escape).join(',')];

  for (const lesson of courseMap.lessons) {
    for (let i = 0; i < (lesson.sections || []).length; i++) {
      const section = lesson.sections[i];
      const weekModule = i === 0 ? lesson.title : '';
      const row = [escape(weekModule)];
      for (const key of colKeys) {
        if (key === 'evaluateDesign') {
          row.push(section[key] === true || section[key] === 'true' ? '✓' : '');
        } else {
          row.push(escape(section[key] || ''));
        }
      }
      rows.push(row.join(','));
    }
  }

  const csvContent = rows.join('\n');
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const fileName = `${courseMap.courseName || 'Course'} Course Map (${courseMap.semester || 'TBD'}).csv`;
  saveAs(blob, fileName);
  return fileName;
}

/**
 * Export course map as PDF.
 */
export function generatePdf(courseMap, customColumns) {
  const colKeys = customColumns && customColumns.length > 0
    ? customColumns.map(c => c.key)
    : ['learningGoals', 'topicSection', 'learningObjectives', 'weeklyAssessments',
       'asyncActivities', 'syncActivities', 'technologyNeeded', 'presentationFormat',
       'supportingResources', 'evaluateDesign'];

  const colHeaders = customColumns && customColumns.length > 0
    ? ['Week/Module', ...customColumns.map(c => c.label)]
    : ['Week/Module', 'Learning Goals', 'Topic/Section', 'Learning Objectives',
       'Assessments', 'Async Activities', 'Sync Activities', 'Technology',
       'Format', 'Resources', 'Evaluate'];

  const body = [];
  for (const lesson of courseMap.lessons) {
    for (let i = 0; i < (lesson.sections || []).length; i++) {
      const section = lesson.sections[i];
      const weekModule = i === 0 ? lesson.title : '';
      const row = [weekModule];
      for (const key of colKeys) {
        if (key === 'evaluateDesign') {
          row.push(section[key] === true || section[key] === 'true' ? '✓' : '');
        } else {
          row.push(section[key] || '');
        }
      }
      body.push(row);
    }
  }

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a3' });

  // Title
  const title = `${courseMap.courseName || 'Course Map'} — ${courseMap.semester || ''}`;
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(title, 14, 15);

  autoTable(doc, {
    head: [colHeaders],
    body,
    startY: 22,
    styles: {
      fontSize: 6.5,
      cellPadding: 2,
      overflow: 'linebreak',
      lineWidth: 0.1,
      lineColor: [180, 198, 231],
      valign: 'top',
    },
    headStyles: {
      fillColor: [68, 114, 196],
      textColor: 255,
      fontStyle: 'bold',
      fontSize: 7,
    },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 28, fillColor: [217, 226, 243] },
    },
    alternateRowStyles: {
      fillColor: [245, 247, 252],
    },
    margin: { top: 22, left: 8, right: 8 },
    tableWidth: 'auto',
  });

  const fileName = `${courseMap.courseName || 'Course'} Course Map (${courseMap.semester || 'TBD'}).pdf`;
  doc.save(fileName);
  return fileName;
}
