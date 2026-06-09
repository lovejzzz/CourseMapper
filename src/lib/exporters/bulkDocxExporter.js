import { getDocx, resolveFeatureLabel } from './exporterUtils.js';
import { _buildDocxContentShared, buildDocxDocument, buildDocxTitleChildren } from './docxExporter.js';

// ════════════════════════════════════════════════════════════════
// BLOB-ONLY DOCX (for ZIP bundling — no file-save)
// ════════════════════════════════════════════════════════════════

/**
 * Build a DOCX blob for a deliverable without triggering a browser download.
 * Used by zipExporter.js to bundle deliverables into a ZIP archive.
 */
export async function buildDeliverableDocxBlob(featureId, data, courseName) {
  const docx = await getDocx();
  const { Packer, BorderStyle } = docx;

  const label = resolveFeatureLabel(featureId);
  const THIN_BORDER = { style: BorderStyle.SINGLE, size: 4, color: 'D0D0D0' };
  const children = buildDocxTitleChildren(docx, courseName, label);

  // Build content using shared helper
  _buildDocxContentShared(featureId, data, children, { ...docx, THIN_BORDER });

  const doc = buildDocxDocument(docx, children, { courseName, label });

  return await Packer.toBlob(doc);
}
