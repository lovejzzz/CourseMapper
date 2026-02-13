// Lazy-loaded heavy dependencies
let _jsPDF, _autoTable, _saveAs;
async function loadPdfLibs() {
  if (!_jsPDF) {
    const jsMod = await import('jspdf');
    _jsPDF = jsMod.jsPDF;
    const atMod = await import('jspdf-autotable');
    _autoTable = atMod.default || atMod.autoTable || atMod;
  }
  return { jsPDF: _jsPDF, autoTable: _autoTable };
}
async function getSaveAs() {
  if (!_saveAs) _saveAs = (await import('file-saver')).saveAs;
  return _saveAs;
}

// Flatten a cell value to a plain string (handles arrays from AI responses)
function toStr(val) {
  if (val == null) return '';
  if (Array.isArray(val)) return val.map(v => String(v)).join('\n');
  return String(val);
}

/**
 * Export course map as CSV.
 */
export async function generateCsv(courseMap, customColumns) {
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
    const sections = (lesson.sections && lesson.sections.length > 0) ? lesson.sections : [{}];
    for (let i = 0; i < sections.length; i++) {
      const section = sections[i];
      const weekModule = i === 0 ? lesson.title : '';
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
    const sections = (lesson.sections && lesson.sections.length > 0) ? lesson.sections : [{}];
    for (let i = 0; i < sections.length; i++) {
      const section = sections[i];
      const weekModule = i === 0 ? lesson.title : '';
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

  const { jsPDF, autoTable } = await loadPdfLibs();
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a3' });

  // Title
  const title = `${courseMap.courseName || 'Course Map'} \u2014 ${courseMap.semester || ''}`;
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
