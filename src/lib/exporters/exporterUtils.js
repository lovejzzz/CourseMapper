import { getCustomDeliverable } from '../customDeliverableLibrary.js';
import { loadPdfRuntime } from '../pdfRuntime.js';
import { safeImport } from '../safeImport.js';

let _docx, _saveAs;

export async function loadPdfLibs() {
  return await loadPdfRuntime();
}

export async function getDocx() {
  if (!_docx) {
    _docx = await safeImport(() => import('docx'));
  }
  return _docx;
}

export async function getSaveAs() {
  if (!_saveAs) {
    const fs = await safeImport(() => import('file-saver'));
    _saveAs = fs.saveAs || fs.default.saveAs || fs.default;
  }
  return _saveAs;
}

export const FEATURE_LABELS = {
  courseMap: 'Course Map',
  lessonPlans: 'Lesson Plans',
  rubrics: 'Rubrics',
  slideDecks: 'Slide Decks',
  quizBank: 'Quiz & Exam Bank',
  discussions: 'Discussion Prompts',
  assignments: 'Assignment Briefs',
  studyGuides: 'Study Guides',
  syllabus: 'Syllabus',
  courseFaq: 'Course FAQ',
};

const INTERNAL_EXPORT_METADATA_KEYS = new Set([
  'sourceGrounding',
  'blueprintGrounding',
  'compilerDecision',
  'compilerDecisionMatrix',
  'reviewActionability',
  'qualityReceipt',
  'qualitySummary',
  'blueprintQualityReceipt',
  'sourceEvidenceTrace',
  'sourceAnchors',
  'sourceRisk',
  'sourceRiskRegister',
  'sourceConflictReport',
  'blueprintAssumptionLedger',
  'packageCoherenceMatrix',
  'provenance',
  'internalMetadata',
]);

export function isInternalExportMetadataKey(key) {
  return INTERNAL_EXPORT_METADATA_KEYS.has(String(key || ''));
}

export function resolveFeatureLabel(id) {
  if (FEATURE_LABELS[id]) return FEATURE_LABELS[id];
  const custom = getCustomDeliverable(id);
  if (custom) return custom.name;
  if (id?.startsWith('custom_')) return 'Custom Deliverable';
  return id.replace(/([A-Z])/g, ' $1').replace(/^./, (str) => str.toUpperCase());
}
