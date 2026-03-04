import { loadPdfLibs, getDocx, getSaveAs, resolveFeatureLabel } from './exporterUtils.js';
import { exportDeliverableDocx } from './docxExporter.js';
import { exportDeliverableCsv } from './csvExporter.js';

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

  // Build a styled XLSX workbook (matching course map quality)
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Course Mapper';
  workbook.created = new Date();

  const label = resolveFeatureLabel(featureId);
  const sheet = workbook.addWorksheet(label);

  // ── Column widths — based on header text length ──
  sheet.columns = headers.map((h) => {
    const len = String(h).length;
    const width = Math.max(15, Math.min(45, len * 1.4 + 4));
    return { width };
  });

  // ── Styling constants (matching xlsxGenerator.js) ──
  const HEADER_FILL  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
  const HEADER_FONT  = { name: 'Inter', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
  const DATA_FONT    = { name: 'Inter', size: 10 };
  const BORDER       = { top: { style: 'thin', color: { argb: 'FFB4C6E7' } }, left: { style: 'thin', color: { argb: 'FFB4C6E7' } }, bottom: { style: 'thin', color: { argb: 'FFB4C6E7' } }, right: { style: 'thin', color: { argb: 'FFB4C6E7' } } };
  const ALT_ROW_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F6FC' } };

  // ── Header row ──
  const headerRow = sheet.addRow(headers);
  headerRow.height = 28;
  headerRow.eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
    cell.alignment = { vertical: 'top', horizontal: 'left', wrapText: true };
    cell.border = BORDER;
  });

  // ── Data rows ──
  rows.forEach((row, idx) => {
    const r = sheet.addRow(row);
    r.eachCell((cell) => {
      cell.font = DATA_FONT;
      cell.alignment = { vertical: 'top', horizontal: 'left', wrapText: true };
      cell.border = BORDER;
      // Alternating row color (even data rows = light blue)
      if (idx % 2 === 1) cell.fill = ALT_ROW_FILL;
    });
  });

  // ── Freeze header row ──
  sheet.views = [{ state: 'frozen', ySplit: 1 }];

  const buffer = await workbook.xlsx.writeBuffer();
  const { saveToGoogleSheets } = await import('../googleDrive.js');
  const stamp = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const fileName = `${courseName || 'Course'} - ${label} (${stamp}).xlsx`;
  return await saveToGoogleSheets(buffer, fileName, courseName, preOpenedTab);
}

