import { useState, useCallback, useRef, useEffect } from 'react';

/**
 * Handles exporting the course map in various formats.
 * Export libraries are loaded on-demand to reduce initial bundle size.
 * downloadedFile state is managed externally in App.jsx to avoid circular deps.
 */
export default function useExport(courseMap, columns, setError) {
  const [showExportMenu, setShowExportMenu] = useState(false);
  const errorTimerRef = useRef(null);

  // Cleanup error dismiss timer on unmount
  useEffect(() => {
    return () => { clearTimeout(errorTimerRef.current); };
  }, []);

  const handleDownload = useCallback(async (format) => {
    if (!courseMap) return;
    setShowExportMenu(false);
    try {
      if (format === 'csv') {
        const { generateCsv } = await import('../lib/exporters');
        await generateCsv(courseMap, columns);
      } else if (format === 'pdf') {
        const { generatePdf } = await import('../lib/exporters');
        await generatePdf(courseMap, columns);
      } else if (format === 'docx') {
        const { generateDocx } = await import('../lib/docxGenerator');
        await generateDocx(courseMap, columns);
      } else if (format === 'gdocs') {
        const { saveToGoogleDocs } = await import('../lib/googleDrive');
        await saveToGoogleDocs(courseMap, columns);
      } else if (format === 'gsheets') {
        const { buildXlsxBuffer } = await import('../lib/xlsxGenerator');
        const { saveToGoogleSheets } = await import('../lib/googleDrive');
        const buffer = await buildXlsxBuffer(courseMap, columns);
        const cName = courseMap.courseName || 'Course';
        const semester = courseMap.semester || 'TBD';
        const stamp = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        const fileName = `${cName} Course Map (${semester}) – ${stamp}.xlsx`;
        await saveToGoogleSheets(buffer, fileName, cName);
      } else {
        const { generateXlsx } = await import('../lib/xlsxGenerator');
        await generateXlsx(courseMap, columns);
      }
    } catch (err) {
      setError('Failed to export: ' + err.message);
      clearTimeout(errorTimerRef.current);
      errorTimerRef.current = setTimeout(() => setError(''), 6000);
    }
  }, [courseMap, columns, setError]);

  const resetExport = useCallback(() => {
    setShowExportMenu(false);
    clearTimeout(errorTimerRef.current);
  }, []);

  return {
    showExportMenu,
    setShowExportMenu,
    handleDownload,
    resetExport,
  };
}
