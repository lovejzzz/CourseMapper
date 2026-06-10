import { getDocx, resolveFeatureLabel } from './exporterUtils.js';
import { getArrayKey } from '../syncDependencies.js';
import { _buildDocxContentShared, buildDocxDocument, buildDocxTitleChildren } from './docxExporter.js';

// Features whose root array is one-entry-per-lesson; their covers can say
// "N lessons". Everything else gets the neutral "N sections".
const LESSON_ROOTED_FEATURES = new Set(['lessonPlans', 'slideDecks', 'quizBank', 'studyGuides', 'discussions']);

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
  // Cover page when the document bundles several top-level entries.
  // v0.10.1 fix: count the feature's ROOT array, not the largest nested
  // array — a single-lesson quiz with 48 questions printed "48 lessons".
  const rootKey = getArrayKey(featureId);
  const rootArray = Array.isArray(data?.[rootKey])
    ? data[rootKey]
    : Object.values(data || {}).find((value) => Array.isArray(value)) || [];
  const itemCount = rootArray.length;
  const coverNoun = LESSON_ROOTED_FEATURES.has(featureId) ? 'lessons' : 'sections';
  const children = buildDocxTitleChildren(docx, courseName, label, {
    cover: itemCount >= 4,
    coverMeta: itemCount >= 4 ? `${itemCount} ${coverNoun}` : '',
  });

  // Build content using shared helper
  _buildDocxContentShared(featureId, data, children, { ...docx, THIN_BORDER });

  const doc = buildDocxDocument(docx, children, { courseName, label });

  return await Packer.toBlob(doc);
}
