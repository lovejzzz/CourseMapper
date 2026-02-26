import { useState, useCallback } from 'react';
import { generateXlsx, buildXlsxBuffer } from '../lib/xlsxGenerator';
import { generateCsv, generatePdf } from '../lib/exporters';
import { generateDocx } from '../lib/docxGenerator';
import { saveToGoogleDocs, saveToGoogleSheets } from '../lib/googleDrive';

/**
 * Handles exporting the course map in various formats.
 * downloadedFile state is managed externally in App.jsx to avoid circular deps.
 */
export default function useExport(courseMap, columns, setError) {
  const [showExportMenu, setShowExportMenu] = useState(false);

  const handleDownload = useCallback(async (format) => {
    if (!courseMap) return;
    setShowExportMenu(false);
    try {
      if (format === 'csv') {
        await generateCsv(courseMap, columns);
      } else if (format === 'pdf') {
        await generatePdf(courseMap, columns);
      } else if (format === 'docx') {
        await generateDocx(courseMap, columns);
      } else if (format === 'gdocs') {
        await saveToGoogleDocs(courseMap, columns);
      } else if (format === 'gsheets') {
        const buffer = await buildXlsxBuffer(courseMap, columns);
        const cName = courseMap.courseName || 'Course';
        const semester = courseMap.semester || 'TBD';
        const stamp = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        const fileName = `${cName} Course Map (${semester}) – ${stamp}.xlsx`;
        await saveToGoogleSheets(buffer, fileName, cName);
      } else {
        await generateXlsx(courseMap, columns);
      }
    } catch (err) {
      setError('Failed to export: ' + err.message);
      setTimeout(() => setError(''), 6000);
    }
  }, [courseMap, columns, setError]);

  const resetExport = useCallback(() => {
    setShowExportMenu(false);
  }, []);

  return {
    showExportMenu,
    setShowExportMenu,
    handleDownload,
    resetExport,
  };
}
