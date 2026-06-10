// ─── Deliverable Export Utilities (façade) ───
// The single implementation of every deliverable export format lives in
// ./exporters/* (csvExporter, pdfExporter, docxExporter, bulkDocxExporter).
// This module re-exports that surface for the UI and keeps only the flows
// that compose them: Google Docs/Sheets upload, export-all, and the rubric
// gradebook CSV.
//
// History: until v0.12.0 this file carried a full parallel copy of the
// CSV/PDF/DOCX builders. The copies drifted — direct downloads silently
// missed the themed DOCX design and the CurriculumOS receipts (key-term
// source citations, reasoning routines) that the ZIP path already had.
// Never reintroduce a second implementation here.

import { deliverableToCsvRows, exportDeliverableCsv } from './exporters/csvExporter.js';
import { exportDeliverablePdf } from './exporters/pdfExporter.js';
import { exportDeliverableDocx } from './exporters/docxExporter.js';
import { buildDeliverableDocxBlob } from './exporters/bulkDocxExporter.js';
import { FEATURE_LABELS, resolveFeatureLabel } from './exporters/exporterUtils.js';
import { assertCsvRowsHaveNoInternalExportLanguage } from './exportTextInspector.js';
import { buildXlsxWorkbook } from './lightweightXlsx.js';
import { expandKeys } from './keyMaps';

export {
  deliverableToCsvRows,
  exportDeliverableCsv,
  exportDeliverablePdf,
  exportDeliverableDocx,
  buildDeliverableDocxBlob,
  FEATURE_LABELS,
};

// ════════════════════════════════════════════════════════════════
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
  const { updateTabStatus } = await import('./googleDrive.js');
  updateTabStatus(preOpenedTab, 'build');
  const blob = await buildDeliverableDocxBlob(featureId, data, courseName);
  const { saveToGoogleDocsBlob } = await import('./googleDrive.js');
  const stamp = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const fileName = `${courseName || 'Course'} - ${label} (${stamp})`;
  return await saveToGoogleDocsBlob(blob, fileName, courseName, preOpenedTab);
}

export async function exportDeliverableToGoogleSheets(featureId, data, courseName, preOpenedTab = null) {
  const { headers, rows } = deliverableToCsvRows(featureId, data);
  if (rows.length === 0) throw new Error('No data to export');
  assertCsvRowsHaveNoInternalExportLanguage({ headers, rows }, resolveFeatureLabel(featureId));

  const { updateTabStatus } = await import('./googleDrive.js');
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
  const { saveToGoogleSheets } = await import('./googleDrive.js');
  const stamp = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const fileName = `${courseName || 'Course'} - ${label} (${stamp}).xlsx`;
  return await saveToGoogleSheets(buffer, fileName, courseName, preOpenedTab);
}

// ════════════════════════════════════════════════════════════════
// EXPORT ALL
// ════════════════════════════════════════════════════════════════

export async function exportAllDeliverables(format, deliverables, courseName, courseMap, columns) {
  const results = [];
  // Include course map if available
  if (courseMap && format !== 'gsheets' && format !== 'gdocs') {
    try {
      if (format === 'csv') {
        const { generateCsv } = await import('./exporters.js');
        results.push(await generateCsv(courseMap, columns));
      } else if (format === 'pdf') {
        const { generatePdf } = await import('./exporters.js');
        results.push(await generatePdf(courseMap, columns));
      } else if (format === 'docx') {
        const { generateDocx } = await import('./docxGenerator.js');
        results.push(await generateDocx(courseMap, columns));
      }
    } catch (e) {
      console.warn('Course map export failed:', e);
    }
  }

  for (const [featureId, entry] of Object.entries(deliverables)) {
    if (!entry?.data || entry.status !== 'done') continue;
    try {
      if (format === 'csv') results.push(await exportDeliverableCsv(featureId, entry.data, courseName));
      else if (format === 'pdf') results.push(await exportDeliverablePdf(featureId, entry.data, courseName));
      else if (format === 'docx') results.push(await exportDeliverableDocx(featureId, entry.data, courseName));
      else if (format === 'gdocs') results.push(await exportDeliverableToGoogleDocs(featureId, entry.data, courseName));
      else if (format === 'gsheets')
        results.push(await exportDeliverableToGoogleSheets(featureId, entry.data, courseName));
    } catch (e) {
      console.warn(`Export ${featureId} failed:`, e);
    }
  }
  return results;
}

// ─── Feature 7.4: Rubric → Gradebook CSV ────────────────────────────────────

/**
 * Export rubric data as a Gradebook CSV for Canvas/Gradescope.
 * Format:
 *   Row 1: metadata header (criterion name, max points, weight)
 *   Row 2: column header (Student Name, [criterion]…, Total, Feedback)
 *   Row 3+: one row per placeholder student
 *
 * @param {object} rubricData  — { rubrics: RubricShape[] }
 * @param {number} studentCount — how many blank student rows to include (default 30)
 */
export function exportRubricGradebook(rubricData, studentCount = 30) {
  const expanded = expandKeys('rubrics', rubricData || {});
  const rubrics = expanded.rubrics || [];
  if (rubrics.length === 0) return;

  const rows = [];

  rubrics.forEach((rubric, ri) => {
    const criteria = rubric.criteria || [];
    const title = rubric.title || `Rubric ${ri + 1}`;

    // Row 1: rubric metadata
    const metaRow = [`${title} (Metadata)`, 'Max Points', ...criteria.map((c) => c.points ?? ''), '', ''];
    rows.push(metaRow);

    // Row 2: weights sub-header
    const weightRow = ['', 'Weight %', ...criteria.map((c) => `${c.weight ?? ''}%`), '', ''];
    rows.push(weightRow);

    // Row 3: column headers
    const headerRow = [
      'Student Name',
      ...criteria.map((c) => c.criterion || c.name || `Criterion ${criteria.indexOf(c) + 1}`),
      'Total Score',
      'Feedback',
    ];
    rows.push(headerRow);

    // Student rows
    for (let s = 0; s < studentCount; s++) {
      const studentRow = [`Student ${s + 1}`, ...criteria.map(() => ''), '', ''];
      rows.push(studentRow);
    }

    // Blank separator between rubrics
    rows.push([]);
  });

  const csvContent = rows
    .map((row) =>
      row
        .map((cell) => {
          const s = String(cell ?? '');
          if (s.includes(',') || s.includes('"') || s.includes('\n')) {
            return '"' + s.replace(/"/g, '""') + '"';
          }
          return s;
        })
        .join(','),
    )
    .join('\r\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'rubric_gradebook.csv';
  a.click();
  URL.revokeObjectURL(url);
}
