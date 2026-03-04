import { getDocx, resolveFeatureLabel } from './exporterUtils.js';
import { _buildDocxContentShared, FONT, ACCENT, BODY_SIZE, H1_SIZE, LINE_SP } from './docxExporter.js';

// ════════════════════════════════════════════════════════════════
// BLOB-ONLY DOCX (for ZIP bundling — no file-save)
// ════════════════════════════════════════════════════════════════

/**
 * Build a DOCX blob for a deliverable without triggering a browser download.
 * Used by zipExporter.js to bundle deliverables into a ZIP archive.
 */
export async function buildDeliverableDocxBlob(featureId, data, courseName) {
  const {
    Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType,
    Table, TableRow, TableCell, WidthType, BorderStyle, ShadingType, TableLayoutType,
  } = await getDocx();

  const label = resolveFeatureLabel(featureId);
  const THIN_BORDER = { style: BorderStyle.SINGLE, size: 4, color: 'D0D0D0' };
  const children = [];

  // Title header (same as exportDeliverableDocx)
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { line: LINE_SP, after: 120 },
    children: [new TextRun({ text: `${courseName || 'Course'} — ${label}`, bold: true, size: H1_SIZE, font: FONT, color: ACCENT })],
  }));
  children.push(new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 300 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'CCCCCC', space: 8 } },
    children: [],
  }));

  // Build content using shared helper
  _buildDocxContentShared(featureId, data, children, { Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, ShadingType, TableLayoutType, BorderStyle, THIN_BORDER });

  const doc = new Document({
    styles: { default: { document: { run: { font: FONT, size: BODY_SIZE } } } },
    sections: [{ children }],
  });

  return await Packer.toBlob(doc);
}

