import { exportDeliverableCsv } from './csvExporter.js';
import { exportDeliverablePdf } from './pdfExporter.js';
import { exportDeliverableDocx } from './docxExporter.js';
import { exportDeliverableToGoogleDocs, exportDeliverableToGoogleSheets } from './googleExporter.js';

// ════════════════════════════════════════════════════════════════
// EXPORT ALL
// ════════════════════════════════════════════════════════════════

export async function exportAllDeliverables(format, deliverables, courseName, courseMap, columns) {
  const results = [];
  // Include course map if available
  if (courseMap && format !== 'gsheets' && format !== 'gdocs') {
    try {
      if (format === 'csv') {
        const { generateCsv } = await import('../exporters.js');
        results.push(await generateCsv(courseMap, columns));
      } else if (format === 'pdf') {
        const { generatePdf } = await import('../exporters.js');
        results.push(await generatePdf(courseMap, columns));
      } else if (format === 'docx') {
        const { generateDocx } = await import('../docxGenerator.js');
        results.push(await generateDocx(courseMap, columns));
      }
    } catch (e) { console.warn('Course map export failed:', e); }
  }

  for (const [featureId, entry] of Object.entries(deliverables)) {
    if (!entry?.data || entry.status !== 'done') continue;
    try {
      if (format === 'csv') results.push(await exportDeliverableCsv(featureId, entry.data, courseName));
      else if (format === 'pdf') results.push(await exportDeliverablePdf(featureId, entry.data, courseName));
      else if (format === 'docx') results.push(await exportDeliverableDocx(featureId, entry.data, courseName));
      else if (format === 'gdocs') results.push(await exportDeliverableToGoogleDocs(featureId, entry.data, courseName));
      else if (format === 'gsheets') results.push(await exportDeliverableToGoogleSheets(featureId, entry.data, courseName));
    } catch (e) { console.warn(`Export ${featureId} failed:`, e); }
  }
  return results;
}

