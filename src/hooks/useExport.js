import { useState, useCallback } from 'react';
import { generateXlsx } from '../lib/xlsxGenerator';
import { generateCsv, generatePdf } from '../lib/exporters';

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
        generateCsv(courseMap, columns);
      } else if (format === 'pdf') {
        generatePdf(courseMap, columns);
      } else {
        await generateXlsx(courseMap, columns);
      }
    } catch (err) {
      setError('Failed to export: ' + err.message);
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
