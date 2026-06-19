import { getDocx, resolveFeatureLabel } from './exporterUtils.js';
import { getArrayKey } from '../syncDependencies.js';
import { _buildDocxContentShared, buildDocxDocument, buildDocxTitleChildren } from './docxExporter.js';

// Cover-meta noun per feature. v0.14.1 (1.11): assignments/rubrics/courseFaq
// were missing from the old lesson-rooted set, so a 15-brief export said
// "15 sections" on its cover. Features whose root array is strictly
// one-entry-per-lesson say "N lessons"; features counted by their own unit
// use the feature-label noun; anything unknown (custom deliverables) keeps
// the neutral "N sections".
const COVER_NOUNS = {
  lessonPlans: 'lessons',
  slideDecks: 'lessons',
  quizBank: 'lessons',
  studyGuides: 'lessons',
  discussions: 'lessons',
  courseFaq: 'lessons',
  assignments: 'assignment briefs',
  rubrics: 'rubrics',
};

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
  const rootKey = getArrayKey(featureId, data);
  const rootArray = Array.isArray(data?.[rootKey])
    ? data[rootKey]
    : Object.values(data || {}).find((value) => Array.isArray(value)) || [];
  const itemCount = rootArray.length;
  const coverNoun = COVER_NOUNS[featureId] || 'sections';
  const children = buildDocxTitleChildren(docx, courseName, label, {
    cover: itemCount >= 4,
    coverMeta: itemCount >= 4 ? `${itemCount} ${coverNoun}` : '',
  });

  // Build content using shared helper
  _buildDocxContentShared(featureId, data, children, { ...docx, THIN_BORDER, exportTitle: courseName });

  // v0.12.1: rubrics render landscape so the 6-column matrix gets usable
  // column widths (portrait crushed 280-char level cells into 1.1in columns).
  const doc = buildDocxDocument(docx, children, { courseName, label, landscape: featureId === 'rubrics' });

  return await Packer.toBlob(doc);
}
