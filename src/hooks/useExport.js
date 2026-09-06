import { useState, useCallback } from 'react';

/**
 * Handles exporting the course map in various formats.
 * Export libraries are loaded on-demand to reduce initial bundle size.
 * downloadedFile state is managed externally in App.jsx to avoid circular deps.
 */
export default function useExport(courseMap, columns) {
  const [showExportMenu, setShowExportMenu] = useState(false);

  const handleDownload = useCallback(
    async (format, courseMapOverride = null) => {
      const exportCourseMap = courseMapOverride || courseMap;
      if (!exportCourseMap) return;
      setShowExportMenu(false);
      // The export sidebar owns success and failure. Let errors reach it;
      // a download failure must not change the model's generation status.
      if (format === 'csv') {
        const { generateCsv } = await import('../lib/exporters');
        await generateCsv(exportCourseMap, columns);
      } else if (format === 'pdf') {
        const { generatePdf } = await import('../lib/exporters');
        await generatePdf(exportCourseMap, columns);
      } else if (format === 'docx') {
        const { generateDocx } = await import('../lib/docxGenerator');
        await generateDocx(exportCourseMap, columns);
      } else if (format === 'gdocs') {
        const { saveToGoogleDocs } = await import('../lib/googleDrive');
        await saveToGoogleDocs(exportCourseMap, columns);
      } else if (format === 'gsheets') {
        const { buildXlsxBuffer } = await import('../lib/xlsxGenerator');
        const { saveToGoogleSheets } = await import('../lib/googleDrive');
        const buffer = await buildXlsxBuffer(exportCourseMap, columns);
        const cName = exportCourseMap.courseName || 'Course';
        const semester = exportCourseMap.semester || 'TBD';
        const stamp = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        const fileName = `${cName} Course Map (${semester}) – ${stamp}.xlsx`;
        await saveToGoogleSheets(buffer, fileName, cName);
      } else {
        const { generateXlsx } = await import('../lib/xlsxGenerator');
        await generateXlsx(exportCourseMap, columns);
      }
    },
    [courseMap, columns],
  );

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
