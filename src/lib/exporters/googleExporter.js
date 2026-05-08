import { resolveFeatureLabel } from './exporterUtils.js';
import { buildDeliverableDocxBlob } from './bulkDocxExporter.js';
import { deliverableToCsvRows } from './csvExporter.js';
import { buildXlsxWorkbook } from '../lightweightXlsx.js';

// GOOGLE DOCS / SHEETS
// ════════════════════════════════════════════════════════════════

export async function exportDeliverableToGoogleDocs(featureId, data, courseName, preOpenedTab = null) {
  // Build a rich DOCX blob (identical formatting to the local download) and upload to Google Drive.
  // Google Drive automatically converts the .docx to a Google Doc, preserving tables, headings,
  // bullets, and all rich formatting — as good as the local preview.
  //
  // preOpenedTab: caller should open a tab synchronously BEFORE any await, then pass it here
  // so the popup-blocker doesn't kill it.
  const label = resolveFeatureLabel(featureId);
  const { updateTabStatus } = await import('../googleDrive.js');
  updateTabStatus(preOpenedTab, 'build');
  const blob = await buildDeliverableDocxBlob(featureId, data, courseName);
  const { saveToGoogleDocsBlob } = await import('../googleDrive.js');
  const stamp = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const fileName = `${courseName || 'Course'} - ${label} (${stamp})`;
  return await saveToGoogleDocsBlob(blob, fileName, courseName, preOpenedTab);
}

export async function exportDeliverableToGoogleSheets(featureId, data, courseName, preOpenedTab = null) {
  const { headers, rows } = deliverableToCsvRows(featureId, data);
  if (rows.length === 0) throw new Error('No data to export');

  const { updateTabStatus } = await import('../googleDrive.js');
  updateTabStatus(preOpenedTab, 'build');

  const label = resolveFeatureLabel(featureId);
  const buffer = await buildXlsxWorkbook({
    title: `${courseName || 'Course'} - ${label}`,
    sheets: [
      {
        name: label,
        columns: headers.map((header) => {
          const len = String(header).length;
          return { width: Math.max(15, Math.min(45, len * 1.4 + 4)) };
        }),
        rows: [headers, ...rows],
        frozenRows: 1,
        rowOptions: [{ height: 28 }],
        getStyle(rowIndex) {
          if (rowIndex === 0) return 'header';
          return rowIndex % 2 === 0 ? 'alt' : 'data';
        },
      },
    ],
  });
  const { saveToGoogleSheets } = await import('../googleDrive.js');
  const stamp = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const fileName = `${courseName || 'Course'} - ${label} (${stamp}).xlsx`;
  return await saveToGoogleSheets(buffer, fileName, courseName, preOpenedTab);
}
