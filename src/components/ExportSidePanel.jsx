import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import FocusTrap from 'focus-trap-react';
import { useCourse } from '../contexts/CourseContext';
import { safeImport } from '../lib/safeImport';
import { summarizeReadiness } from '../lib/deliverableReadiness';
import { evaluateStrictPackageReadiness } from '../lib/packageFinalizer';
import { normalizeReadinessIssue } from '../lib/readinessIssueSchema';
import ReviewQueue from './ReviewQueue';
import { finishStatusOf, isFinishPassActive, isPackageBlocked, isPackageReady } from '../lib/pipelineMachine';
import NoticeBanner from './NoticeBanner';
import {
  exportDeliverableCsv,
  exportDeliverablePdf,
  exportDeliverableDocx,
  exportDeliverableToGoogleDocs,
  exportDeliverableToGoogleSheets,
  FEATURE_LABELS,
} from '../lib/deliverableExporters';
import { openTabNow, saveToGoogleSlides } from '../lib/googleDrive';
import { exportSlideDeckPptx, buildSlideDeckPptxBlob } from '../lib/exporters/pptxExporter';
import { buildPackageReadinessBinding, downloadCourseMaterialsZip } from '../lib/packageZipExporter';
import { getPackageTrustStatus } from '../lib/packageTrustStatus';
import { buildPackageFinishDomains } from '../lib/packageFinishEvidence';

// ── Which formats each deliverable supports ─────────────────────────────────
// courseMap handled separately via useExport (xlsx, csv, pdf, docx, gsheets, gdocs)
const FORMAT_SUPPORT = {
  courseMap: { xlsx: true, csv: true, pdf: true, docx: true, gdocs: true, gsheets: true, pptx: false, slidepdf: false },
  syllabus: {
    xlsx: false,
    csv: true,
    pdf: true,
    docx: true,
    gdocs: true,
    gsheets: true,
    pptx: false,
    slidepdf: false,
  },
  lessonPlans: {
    xlsx: false,
    csv: true,
    pdf: true,
    docx: true,
    gdocs: true,
    gsheets: true,
    pptx: false,
    slidepdf: false,
  },
  slideDecks: {
    xlsx: false,
    csv: false,
    pdf: false,
    docx: false,
    gdocs: false,
    gsheets: false,
    pptx: true,
    slidepdf: true,
    gslides: true,
  },
  assignments: {
    xlsx: false,
    csv: true,
    pdf: true,
    docx: true,
    gdocs: true,
    gsheets: true,
    pptx: false,
    slidepdf: false,
  },
  rubrics: { xlsx: false, csv: true, pdf: true, docx: true, gdocs: true, gsheets: true, pptx: false, slidepdf: false },
  discussions: {
    xlsx: false,
    csv: true,
    pdf: true,
    docx: true,
    gdocs: true,
    gsheets: true,
    pptx: false,
    slidepdf: false,
  },
  quizBank: { xlsx: false, csv: true, pdf: true, docx: true, gdocs: true, gsheets: true, pptx: false, slidepdf: false },
  studyGuides: {
    xlsx: false,
    csv: true,
    pdf: true,
    docx: true,
    gdocs: true,
    gsheets: true,
    pptx: false,
    slidepdf: false,
  },
  courseFaq: {
    xlsx: false,
    csv: true,
    pdf: true,
    docx: true,
    gdocs: true,
    gsheets: true,
    pptx: false,
    slidepdf: false,
  },
};

// Formats for non-slideDecks current tab
const DOWNLOAD_FORMATS = [
  { id: 'xlsx', label: 'Excel (.xlsx)', color: 'emerald' },
  { id: 'docx', label: 'Word (.docx)', color: 'blue' },
  { id: 'pdf', label: 'PDF (.pdf)', color: 'red' },
  { id: 'csv', label: 'CSV (.csv)', color: 'slate' },
];
const CLOUD_FORMATS = [
  { id: 'gdocs', label: 'Google Docs', color: 'gdocs' },
  { id: 'gsheets', label: 'Google Sheets', color: 'gsheets' },
];

function yieldForExportPaint() {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => setTimeout(resolve, 0));
      return;
    }
    setTimeout(resolve, 0);
  });
}

// ── Spinner ──────────────────────────────────────────────────────────────────
function Spin() {
  return (
    <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

// ── Format button ─────────────────────────────────────────────────────────────
// All download format buttons use the same neutral ghost style for consistency.
// Cloud (Google) buttons retain their brand colors via GDriveBtn.
function FmtBtn({ fmt, label, disabled, busy, onClick }) {
  // Google brand combos come from the design-system gbrand palette
  // (tailwind.config.js) — the single source for every export surface.
  const colorMap = {
    emerald: 'text-slate-600 bg-white/60 border border-slate-200/50 hover:bg-white/80',
    blue: 'text-slate-600 bg-white/60 border border-slate-200/50 hover:bg-white/80',
    red: 'text-slate-600 bg-white/60 border border-slate-200/50 hover:bg-white/80',
    slate: 'text-slate-600 bg-white/60 border border-slate-200/50 hover:bg-white/80',
    gdocs:
      'text-gbrand-docs bg-gbrand-docs-soft/80 border border-gbrand-docs-accent/20 hover:bg-gbrand-docs-hover dark:bg-blue-950/45 dark:border-blue-800/60 dark:text-blue-300 dark:hover:bg-blue-900/55',
    gsheets:
      'text-gbrand-sheets bg-gbrand-sheets-soft/80 border border-gbrand-sheets-accent/20 hover:bg-gbrand-sheets-hover dark:bg-emerald-950/45 dark:border-emerald-800/60 dark:text-emerald-300 dark:hover:bg-emerald-900/55',
    pptx: 'text-slate-600 bg-white/60 border border-slate-200/50 hover:bg-white/80',
    gslides:
      'text-gbrand-slides-accent bg-gbrand-slides-soft/80 border border-gbrand-slides-accent/30 hover:bg-gbrand-slides-hover dark:bg-amber-950/45 dark:border-amber-800/60 dark:text-amber-300 dark:hover:bg-amber-900/55',
    slidepdf: 'text-slate-600 bg-white/60 border border-slate-200/50 hover:bg-white/80',
  };
  const displayLabel = label || fmt.label;
  return (
    <button
      data-testid={`export-format-${fmt.id}`}
      onClick={onClick}
      disabled={disabled || busy}
      className={`tactile flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all duration-200 w-full
        ${disabled ? 'opacity-30 cursor-not-allowed bg-slate-100 text-slate-400 border border-slate-200/40' : colorMap[fmt.color]}
        ${busy ? 'opacity-70' : ''}`}
    >
      {busy ? <Spin /> : null}
      {displayLabel}
    </button>
  );
}

// ── Google Drive icon buttons ─────────────────────────────────────────────────
function GDriveBtn({ fmt, label, disabled, busy, onClick }) {
  const isSheets = fmt.id === 'gsheets';
  const isSlides = fmt.id === 'gslides';
  const displayLabel = label || fmt.label;
  const btnClass = isSlides
    ? 'text-gbrand-slides-accent bg-gbrand-slides-soft/80 border border-gbrand-slides-accent/30 hover:bg-gbrand-slides-hover dark:bg-amber-950/45 dark:border-amber-800/60 dark:text-amber-300 dark:hover:bg-amber-900/55'
    : isSheets
      ? 'text-gbrand-sheets bg-gbrand-sheets-soft/80 border border-gbrand-sheets-accent/20 hover:bg-gbrand-sheets-hover dark:bg-emerald-950/45 dark:border-emerald-800/60 dark:text-emerald-300 dark:hover:bg-emerald-900/55'
      : 'text-gbrand-docs bg-gbrand-docs-soft/80 border border-gbrand-docs-accent/20 hover:bg-gbrand-docs-hover dark:bg-blue-950/45 dark:border-blue-800/60 dark:text-blue-300 dark:hover:bg-blue-900/55';
  return (
    <button
      data-testid={`export-format-${fmt.id}`}
      onClick={onClick}
      disabled={disabled || busy}
      className={`tactile flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-all duration-200 w-full
        ${disabled ? 'opacity-30 cursor-not-allowed bg-slate-100 text-slate-400 border border-slate-200/40' : btnClass}`}
    >
      {busy ? (
        <Spin />
      ) : isSlides ? (
        // Google Slides icon (presentation)
        <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="none">
          <rect x="3" y="4" width="18" height="14" rx="2" fill="#FBBC04" fillOpacity="0.25" />
          <rect x="3" y="4" width="18" height="14" rx="2" stroke="#F4B400" strokeWidth="1.2" />
          <path d="M8 8l5 4-5 4V8z" fill="#F4B400" />
        </svg>
      ) : isSheets ? (
        <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="none">
          <rect x="4" y="3" width="16" height="18" rx="2" fill="#34A853" fillOpacity="0.15" />
          <path d="M4 9h16M4 13h16M4 17h16M10 9v12M15 9v12" stroke="#34A853" strokeWidth="1" strokeLinecap="round" />
        </svg>
      ) : (
        <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="none">
          <path d="M6 3a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9l-6-6H6z" fill="#4285F4" fillOpacity="0.15" />
          <path d="M14 3l6 6h-4a2 2 0 01-2-2V3z" fill="#4285F4" fillOpacity="0.3" />
          <path d="M7 12h10M7 15h7" stroke="#4285F4" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      )}
      {displayLabel}
    </button>
  );
}

function formatReadinessIssue(issue) {
  if (!issue?.label) return issue?.message || '';
  const message = issue.message || '';
  if (message.toLowerCase().startsWith(issue.label.toLowerCase())) return message;
  return `${issue.label}: ${message}`;
}

function evaluateStrictReadiness(
  options = {},
  { includeClassroomReadiness = false, blockOnClassroomWarnings = false } = {},
) {
  return evaluateStrictPackageReadiness(options, {
    includeClassroomReadiness,
    blockOnClassroomWarnings,
    includePedagogicalValidation: true,
    blockOnValidationWarnings: false,
  });
}

function mergeExportVerificationIssues(readiness, verification) {
  const checks = Array.isArray(verification?.checks) ? verification.checks : [];
  const issues = checks
    .filter((check) => check?.status === 'failed' || check?.status === 'warning')
    .map((check) =>
      normalizeReadinessIssue({
        featureId: check.featureId || 'export',
        label: check.label || 'Export',
        severity: check.status === 'failed' ? 'blocker' : 'warning',
        message: `${check.format ? `${String(check.format).toUpperCase()}: ` : ''}${
          check.message || 'Export verification did not pass.'
        }`,
        source: 'exportVerification',
      }),
    );

  if (issues.length === 0) return readiness;
  const blockers = issues.filter((issue) => issue.severity === 'blocker');
  const warnings = issues.filter((issue) => issue.severity !== 'blocker');
  return {
    ...readiness,
    issues: [...(readiness?.issues || []), ...issues],
    blockers: [...(readiness?.blockers || []), ...blockers],
    warnings: [...(readiness?.warnings || []), ...warnings],
  };
}

function mergePackageExportFailureIssues(readiness, exportError) {
  const failures = Array.isArray(exportError?.failures) ? exportError.failures : [];
  if (failures.length === 0) return readiness;
  const issues = failures.map((failure) =>
    normalizeReadinessIssue({
      featureId: failure.featureId || 'export',
      label: failure.label || 'Export',
      severity: 'blocker',
      message: `${failure.format ? `${String(failure.format).toUpperCase()}: ` : ''}${
        failure.message || 'ZIP export could not include this file.'
      }`,
      source: 'packageZipExport',
    }),
  );
  return {
    ...readiness,
    issues: [...(readiness?.issues || []), ...issues],
    blockers: [...(readiness?.blockers || []), ...issues],
  };
}

function mergeFinalizerRetryIssues(readiness, finishResult) {
  const retryActions = Array.isArray(finishResult?.retryActions) ? finishResult.retryActions : [];
  if (finishResult?.status !== 'needs_retry' || retryActions.length === 0) return readiness;
  const exhausted = finishResult?.retryExhausted || finishResult?.retryNoProgress;
  const issues = retryActions.map((action) => {
    const lessonLabel = Number.isInteger(action.lessonIndex)
      ? `Lesson ${action.lessonIndex + 1}`
      : FEATURE_LABELS[action.featureId] || 'This material';
    return normalizeReadinessIssue({
      featureId: action.featureId,
      label: FEATURE_LABELS[action.featureId] || action.featureId || 'Deliverable',
      severity: 'warning',
      message: exhausted
        ? `${lessonLabel} still needs instructor review; automatic retry already ran without progress.`
        : `${lessonLabel} needs one more targeted retry before export.`,
      lessonIndex: Number.isInteger(action.lessonIndex) ? action.lessonIndex : null,
      target: Number.isInteger(action.lessonIndex)
        ? { type: 'lesson', featureId: action.featureId, lessonIndex: action.lessonIndex }
        : undefined,
      source: 'finalizerRetry',
    });
  });
  return {
    ...readiness,
    issues: [...(readiness?.issues || []), ...issues],
    warnings: [...(readiness?.warnings || []), ...issues],
  };
}

function hasBlockingReadinessIssues(readiness) {
  return (readiness?.blockers?.length || 0) > 0;
}

function getDownloadReadiness(readiness) {
  if (!readiness || hasBlockingReadinessIssues(readiness)) return readiness;
  return {
    ...readiness,
    status: 'ready',
    isBlocked: false,
    blockers: [],
    warnings: [],
    issues: [],
  };
}

function hasFinishedPackageReceipt(packageQualityPass) {
  if (isPackageReady(packageQualityPass)) return true;
  // A terminal ready package may retain calm review notes. Those notes are
  // carried in `warnings`, so isPackageReady() (which intentionally means
  // pristine green) returns false even though export verification already
  // produced a receipt. Treat the receipt—not a zero-warning presentation
  // state—as the proof that finishing completed. Otherwise clicking ZIP
  // starts the complete finalizer again after the UI said "Ready to export".
  if (finishStatusOf(packageQualityPass) === 'ready' && packageQualityPass?.receipt) return true;
  return isPackageBlocked(packageQualityPass) && Boolean(packageQualityPass?.quality || packageQualityPass?.receipt);
}

function hasPackageExportFailure(packageQualityPass) {
  const receipt = packageQualityPass?.receipt || {};
  const exportReceipt = receipt.packageReadinessReceipt?.exportVerification || {};
  const failed = Number(exportReceipt.failed ?? receipt.exportFailed ?? 0);
  return (
    (Number.isFinite(failed) && failed > 0) ||
    String(exportReceipt.status || receipt.exportStatus || '').toLowerCase() === 'failed'
  );
}

/**
 * Content readiness and file exportability are different promises. A finished
 * package may still need instructor edits while its already-built files have
 * passed every export check. Keep that quality state visible for publishing,
 * but never trap the user's work in the browser: the verified ZIP carries the
 * same readiness and quality report for offline refinement.
 */
export function hasDownloadableVerifiedPackage(packageQualityPass, finishOutcome = null) {
  const verification = finishOutcome?.exportVerification || null;
  const receipt = finishOutcome?.receipt || packageQualityPass?.receipt || {};
  const embeddedVerification = receipt.packageReadinessReceipt?.exportVerification || {};
  const completedQuality = finishOutcome ? finishOutcome.quality : packageQualityPass?.quality;
  const qualityStatus = String(completedQuality?.status || '').toLowerCase();
  // A verified file map is recoverable evidence, but it is not a download
  // override when an attempted package grade explicitly failed or timed out.
  // Preserve legacy receipts that predate embedded quality; fail closed only
  // on an explicit non-graded state.
  if ((finishOutcome && qualityStatus !== 'graded') || (qualityStatus && qualityStatus !== 'graded')) return false;
  const checked = Number(verification?.checked ?? embeddedVerification.checked ?? receipt.exportChecked ?? 0);
  const warningCount = Number(
    verification?.warningCount ?? embeddedVerification.warningCount ?? receipt.exportWarningCount ?? 0,
  );
  const explicitStatus = String(
    verification?.status || embeddedVerification.status || receipt.exportStatus || '',
  ).toLowerCase();
  // v0.16.61-0.16.63 receipts persisted the checked/failed counters but
  // accidentally omitted exportStatus. Recover those already-finished
  // projects without making the user regenerate a course.
  const status = explicitStatus || (checked > 0 ? (warningCount > 0 ? 'warnings' : 'passed') : '');
  const failed = Number(verification?.failed ?? embeddedVerification.failed ?? receipt.exportFailed ?? 0);
  const finished = Boolean(finishOutcome) || hasFinishedPackageReceipt(packageQualityPass);
  const receiptV2 = receipt.packageReadinessReceipt;
  const v2DownloadSafetyVerified =
    !receiptV2 ||
    receiptV2.protocol !== 'coursemapper-package-readiness-receipt-v2' ||
    (receiptV2.downloadSafety?.status === 'verified' && Number(receiptV2.downloadSafety?.blockerCount) === 0);
  return (
    finished &&
    checked > 0 &&
    ['passed', 'warnings'].includes(status) &&
    Number.isFinite(failed) &&
    failed === 0 &&
    v2DownloadSafetyVerified
  );
}

function ReadinessPanel({
  readiness,
  onIssueClick,
  finishSummary = '',
  packageReceipt = null,
  packageQualityPass = null,
  exportPrepared = false,
  packageScope = false,
}) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  if (!readiness || readiness.featureCount === 0) return null;

  const structuralReadinessBlockers = readiness.blockers.filter((issue) => issue?.source !== 'qualityGate');
  const exportFailureIssue = getPackageTrustStatus({
    receipt: packageReceipt,
    packageQualityPass,
    featureLabels: FEATURE_LABELS,
  }).exportFailureIssue;
  const operationalBlockers = [...structuralReadinessBlockers, exportFailureIssue].filter(Boolean);
  // Export answers one operational question: are verified bytes prepared for
  // download? Content quality is a separate, honest review surface in Agent.
  // A verified receipt therefore owns this card even when Agent correctly
  // retains quality findings for the instructor.
  const isBlocked = !exportPrepared && operationalBlockers.length > 0;
  const issuesToShow = isBlocked ? operationalBlockers.slice(0, 3) : [];
  const helperText = isBlocked
    ? 'Preparation fixes safe items automatically; decisions and quality reasons stay in Agent.'
    : summarizeReadiness(readiness);
  const showIssueDetails = isBlocked && issuesToShow.length > 0;
  const canNavigate = (issue) => typeof onIssueClick === 'function' && issue?.target;
  const tone = exportPrepared
    ? {
        wrap: 'border-emerald-100 bg-emerald-50/70 text-emerald-700 dark:border-emerald-800/50 dark:bg-emerald-950/30 dark:text-emerald-200',
        icon: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/70 dark:text-emerald-200',
        title: 'Ready to download',
        meta: `${readiness.doneFeatureCount}/${readiness.featureCount} materials checked`,
      }
    : packageScope || isBlocked
      ? {
          wrap: 'border-sky-100 bg-sky-50/70 text-sky-800 dark:border-sky-800/50 dark:bg-sky-950/30 dark:text-sky-200',
          icon: 'bg-sky-100 text-sky-700 dark:bg-sky-900/70 dark:text-sky-200',
          title: 'Prepare package',
          meta: 'Safe fixes run before download',
        }
      : {
          wrap: 'border-emerald-100 bg-emerald-50/70 text-emerald-700 dark:border-emerald-800/50 dark:bg-emerald-950/30 dark:text-emerald-200',
          icon: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/70 dark:text-emerald-200',
          title: 'Ready to export',
          meta: `${readiness.doneFeatureCount}/${readiness.featureCount} materials checked`,
        };

  return (
    <div data-testid="readiness-panel" className={`rounded-lg border px-3 py-2.5 ${tone.wrap}`}>
      <div className="flex items-start gap-2">
        <span
          className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-xs ${tone.icon}`}
        >
          {exportPrepared || (!packageScope && !isBlocked) ? '✓' : 'i'}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <p data-testid="readiness-status" className="text-xs font-bold">
              {tone.title}
            </p>
            <span className="text-xs font-semibold opacity-70">{tone.meta}</span>
            {/* Quality scores and reasons live in Agent/Quality. Export stays
                action-only and reports only preparation/download state. */}
          </div>
          {/* v0.14.6 calm pass: when everything is green the ✓ + meta already
              say it — restating "All selected materials passed…" was noise. */}
          {isBlocked && <p className="mt-0.5 text-xs leading-snug opacity-80">{helperText}</p>}
          {/* v0.14.4 WS-B3: the repairs/warnings receipt folded into the
              download card's detail line — the only place this info lives
              now that the in-panel stage narration is gone. */}
          {!isBlocked && finishSummary && (
            <p data-testid="readiness-finish-summary" className="mt-0.5 text-xs leading-snug opacity-70">
              {finishSummary}
            </p>
          )}
          {showIssueDetails && issuesToShow.length > 0 && (
            <ul className="mt-1.5 space-y-1">
              {issuesToShow.map((issue, index) => (
                <li
                  key={`${issue.featureId}-${issue.message}-${index}`}
                  data-testid="readiness-issue"
                  className="text-xs leading-snug"
                >
                  {canNavigate(issue) ? (
                    <button
                      type="button"
                      onClick={() => onIssueClick(issue)}
                      className="w-full rounded-md px-1 py-0.5 text-left font-medium underline decoration-current/30 underline-offset-2 transition-colors hover:bg-white/50 hover:decoration-current"
                      title="Jump to this issue"
                    >
                      {formatReadinessIssue(issue)}
                      <span className="ml-1 font-bold opacity-70">Jump</span>
                    </button>
                  ) : (
                    formatReadinessIssue(issue)
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function ReadinessConfirm({
  pendingExport,
  onCancel,
  onIssueClick,
  onFinishPackage,
  canFinishPackage,
  finishPackageBusy,
  confirmRef,
}) {
  if (!pendingExport?.readiness) return null;
  const { readiness } = pendingExport;
  const isBlocked = readiness.blockers.length > 0;
  const isZipExport = pendingExport.format === 'zip';
  const issues = (isBlocked ? readiness.blockers : readiness.issues).slice(0, 5);
  const firstNavigableIssue = issues.find((issue) => issue?.target);
  const canRetryPackage = canFinishPackage && pendingExport.canFinishPackageAgain !== false;
  const canNavigate = (issue) => typeof onIssueClick === 'function' && issue?.target;
  const tone = {
    wrap: 'border-sky-200 bg-sky-50/80 text-sky-800 dark:border-sky-800/60 dark:bg-sky-950/30 dark:text-sky-200',
    reviewButton: 'border-sky-200 text-sky-700 dark:border-sky-700 dark:text-sky-200',
    title: canRetryPackage ? 'Prepare package' : 'Preparation needs attention',
    description: canRetryPackage
      ? isZipExport
        ? 'Safe fixes and verification run before the ZIP is offered.'
        : 'Safe fixes and verification run before export.'
      : 'Automatic preparation ran. Open the first remaining issue or review the full reasons in Agent.',
  };

  return (
    <div ref={confirmRef} data-testid="readiness-confirm" className={`rounded-lg border px-3 py-3 ${tone.wrap}`}>
      <p className="text-xs font-bold">{tone.title}</p>
      <p className="mt-1 text-xs leading-snug">{tone.description}</p>
      {pendingExport.repairsApplied > 0 && (
        <p className="mt-1 text-xs font-semibold">
          Auto-fixed {pendingExport.repairsApplied} safe issue
          {pendingExport.repairsApplied === 1 ? '' : 's'} before this check.
        </p>
      )}
      <ul className="mt-2 space-y-1">
        {issues.map((issue, index) => (
          <li key={`${issue.featureId}-${issue.message}-${index}`} className="text-xs leading-snug">
            {canNavigate(issue) ? (
              <button
                type="button"
                onClick={() => {
                  onIssueClick(issue);
                  onCancel();
                }}
                className="w-full rounded-md px-1 py-0.5 text-left font-medium underline decoration-current/30 underline-offset-2 transition-colors hover:bg-white/50 hover:decoration-current"
              >
                {formatReadinessIssue(issue)}
                <span className="ml-1 font-bold opacity-70">Jump</span>
              </button>
            ) : (
              formatReadinessIssue(issue)
            )}
          </li>
        ))}
      </ul>
      {readiness.issues.length > issues.length && (
        <p className="mt-1 text-xs font-semibold opacity-70">
          +{readiness.issues.length - issues.length} more issue
          {readiness.issues.length - issues.length === 1 ? '' : 's'}
        </p>
      )}
      <div className="mt-2 grid grid-cols-1 gap-1.5">
        {canRetryPackage ? (
          <button
            type="button"
            data-testid="readiness-finish-package"
            onClick={() => onFinishPackage?.(pendingExport.format, readiness, pendingExport.scope)}
            disabled={finishPackageBusy}
            className={`rounded-lg border bg-white/70 px-2 py-1.5 text-xs font-bold hover:bg-white disabled:cursor-not-allowed disabled:opacity-60 ${tone.reviewButton}`}
          >
            {finishPackageBusy ? 'Preparing package...' : 'Prepare package'}
          </button>
        ) : firstNavigableIssue ? (
          <button
            type="button"
            data-testid="readiness-review-materials"
            onClick={() => {
              if (typeof onIssueClick === 'function') {
                onIssueClick(firstNavigableIssue);
              }
              onCancel();
            }}
            className={`rounded-lg border bg-white/70 px-2 py-1.5 text-xs font-bold hover:bg-white ${tone.reviewButton}`}
          >
            Open first issue
          </button>
        ) : null}
      </div>
    </div>
  );
}

// ── Quality stamp (v0.14.4 WS-B2) ─────────────────────────────────────────────
// The PRIMARY quality chip moved to the workspace header (WorkspaceQualityChip
// beside the course title); the panel keeps only this compact "100 · A" stamp
// on the Ready-to-download card. Click opens the same report modal — which
// stays in this file: it renders a STRUCTURED summary from the grade result
// object instead of markdown — the app's markdown renderer lives in the chat
// chunk (MessageBubble) and pulling it into the export panel chunk would be
// heavier than the data it formats; the full markdown report ships in the
// ZIP as QUALITY_REPORT.md.
export function QualityStamp({ quality, onOpen, trustStatus = null, informational = false }) {
  if (quality?.status !== 'graded') return null;
  const readinessScore = Number.isFinite(quality.readiness?.score) ? quality.readiness.score : null;
  const readinessMax = Number.isFinite(quality.readiness?.maxScore) ? quality.readiness.maxScore : 100;
  const unobservedPoints = Number.isFinite(quality.readiness?.points?.unobserved)
    ? quality.readiness.points.unobserved
    : null;
  const status = trustStatus || getPackageTrustStatus({ packageQualityPass: { status: 'ready', quality } });
  const tone = informational
    ? 'border-sky-200 bg-white/70 text-sky-700'
    : status.clean
      ? 'border-emerald-200 bg-white/70 text-emerald-700'
      : 'border-amber-200 bg-white/70 text-amber-700';
  return (
    <button
      type="button"
      data-testid="quality-stamp"
      onClick={onOpen}
      title={`${
        readinessScore !== null
          ? `Deterministic package evidence ${readinessScore}/${readinessMax} earned${unobservedPoints !== null ? `, ${unobservedPoints} unobserved` : ''}; package conformance ${quality.score}/100 (${quality.grade})`
          : `Package conformance ${quality.score}/100 (${quality.grade})`
      } — click for the full report`}
      aria-label={`Package quality ${
        readinessScore !== null
          ? `deterministic package evidence ${readinessScore} earned out of ${readinessMax}`
          : `${quality.score} out of 100, grade ${quality.grade}`
      } — open the quality report`}
      className={`inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 font-mono text-[10px] font-bold transition-colors hover:brightness-95 ${tone}`}
    >
      {readinessScore !== null ? `${readinessScore}/${readinessMax}` : `${quality.score} · ${quality.grade}`}
    </button>
  );
}

const QUALITY_SEVERITY_TONES = {
  P0: 'bg-rose-100 text-rose-700',
  P1: 'bg-amber-100 text-amber-700',
  P2: 'bg-slate-100 text-slate-600',
};

function humanizeReadinessLabel(value) {
  const spaced = String(value || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[-_]+/g, ' ')
    .trim()
    .toLowerCase();
  return spaced ? spaced.charAt(0).toUpperCase() + spaced.slice(1) : '';
}

function QualityReportModal({ quality, onClose }) {
  useEffect(() => {
    if (!quality || quality.status !== 'graded') return undefined;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose?.();
    };
    globalThis.addEventListener?.('keydown', handleKeyDown);
    return () => globalThis.removeEventListener?.('keydown', handleKeyDown);
  }, [onClose, quality]);

  if (!quality || quality.status !== 'graded') return null;
  const dimensions = Object.entries(quality.dimensions || {});
  const readiness = quality.readiness || null;
  const readinessComponents = Object.entries(readiness?.components || {});
  const findings = Array.isArray(quality.findings) ? quality.findings : [];
  const counts = quality.findingCounts || {};
  const modal = (
    <FocusTrap focusTrapOptions={{ clickOutsideDeactivates: true, escapeDeactivates: false }}>
      <div
        data-testid="quality-report-modal"
        className="fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden bg-black/30 p-4 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={onClose}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="quality-report-title"
          aria-describedby="quality-report-summary"
          className="flex max-h-[calc(100dvh-2rem)] w-full max-w-lg flex-col overflow-hidden rounded-lg border border-slate-200/60 bg-white/95 shadow-2xl backdrop-blur-lg animate-in slide-in-from-bottom-4 duration-300 sm:max-h-[80vh]"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <div className="min-w-0">
              <p id="quality-report-title" className="text-sm font-bold text-slate-800">
                {readiness
                  ? `Deterministic package evidence — ${readiness.points?.earned ?? readiness.score}/100 earned`
                  : `Package conformance — ${quality.score}/100 (${quality.grade})`}
              </p>
              <p id="quality-report-summary" className="text-xs text-slate-400">
                Package conformance {quality.score}/100 ({quality.grade}) · {counts.p0 || 0} P0 · {counts.p1 || 0} P1 ·{' '}
                {counts.p2 || 0} P2 · grader v{quality.graderVersion}
                {quality.gradedAt ? ` · ${new Date(quality.gradedAt).toLocaleString()}` : ''}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close quality report"
              autoFocus
              className="ml-3 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="overflow-y-auto px-5 py-4 space-y-4">
            {readiness && (
              <div data-testid="automated-readiness-summary" className="rounded-lg border border-sky-100 bg-sky-50 p-3">
                <p className="text-xs font-semibold text-sky-800">
                  {humanizeReadinessLabel(readiness.band)} · {readiness.points?.earned ?? readiness.score} earned ·{' '}
                  {readiness.points?.lost ?? 'unknown'} lost · {readiness.points?.unobserved ?? 'unknown'} unobserved
                </p>
                {Number.isFinite(readiness.positiveValidationEarned) && (
                  <p className="mt-1 text-xs leading-relaxed text-sky-800">
                    {readiness.positiveValidationEarned}/{readiness.positiveValidationCoverage} from narrow positive
                    metrics · {readiness.negativeEvidenceEarned}/{readiness.negativeEvidenceCoverage} from no encoded
                    defect firing · {readiness.points?.unobserved ?? 'unknown'}/100 unobserved
                  </p>
                )}
                <p className="mt-1 text-xs leading-relaxed text-sky-700">
                  {readiness.claimBoundary} Missing evidence stays in the fixed 100-point potential and never improves
                  the score.
                </p>
                {readinessComponents.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {readinessComponents.map(([component, value]) => (
                      <div key={component} className="rounded-md bg-white/70 px-2 py-1.5 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-sky-700">
                            {value.label || humanizeReadinessLabel(component)}
                          </span>
                          <span className="font-bold text-sky-900">
                            {value.points?.earned ?? '—'}/{value.points?.max ?? value.weight} earned
                          </span>
                        </div>
                        <p className="mt-0.5 leading-snug text-sky-700">{value.reason}</p>
                        <p className="mt-0.5 leading-snug text-sky-900">Improve: {value.action}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            <div>
              <p className="text-xs font-semibold text-slate-500 mb-1.5">Package conformance checks</p>
              <div className="grid grid-cols-2 gap-1">
                {dimensions.map(([dimension, score]) => (
                  <div
                    key={dimension}
                    className="flex items-center justify-between rounded-lg bg-slate-50 px-2 py-1 text-xs"
                  >
                    <span className="text-slate-500 capitalize">{dimension}</span>
                    <span className="font-bold text-slate-700">
                      {score}
                      {quality.grades?.[dimension] ? ` · ${quality.grades[dimension]}` : ''}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            {Number.isFinite(quality.texture?.score) && (
              <div data-testid="quality-texture-row">
                <p className="text-xs font-semibold text-slate-500 mb-1.5">
                  Texture {quality.texture.score}/100
                  <span className="ml-1.5 font-medium text-slate-400">style and repetition, counted lightly</span>
                </p>
                <div className="grid grid-cols-3 gap-1">
                  {['sameness', 'openers', 'tails'].map((subKey) => (
                    <div
                      key={subKey}
                      className="flex items-center justify-between rounded-lg bg-slate-50 px-2 py-1 text-xs"
                    >
                      <span className="text-slate-500 capitalize">{subKey}</span>
                      <span className="font-bold text-slate-700">
                        {Number.isFinite(quality.texture.subScores?.[subKey]) ? quality.texture.subScores[subKey] : '—'}
                      </span>
                    </div>
                  ))}
                </div>
                {Array.isArray(quality.texture.evidence) && quality.texture.evidence.length > 0 && (
                  <p className="mt-1 rounded bg-slate-50 px-1.5 py-1 font-mono text-xs leading-snug text-slate-500 break-words">
                    Most repeated: “{quality.texture.evidence[0].shingle}” — {quality.texture.evidence[0].docCount} of{' '}
                    {quality.texture.evidence[0].docTotal} {quality.texture.evidence[0].feature} documents
                  </p>
                )}
              </div>
            )}
            <div>
              <p className="text-xs font-semibold text-slate-500 mb-1.5">Findings ({findings.length})</p>
              {findings.length === 0 ? (
                <p className="rounded-lg bg-emerald-50 px-2 py-1.5 text-xs font-semibold text-emerald-700">
                  No detectable defects — every deterministic check passed.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {findings.map((finding) => (
                    <li key={finding.id} className="rounded-lg border border-slate-100 bg-white px-2 py-1.5">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`rounded px-1 py-0.5 text-[10px] font-bold ${
                            QUALITY_SEVERITY_TONES[finding.severity] || QUALITY_SEVERITY_TONES.P2
                          }`}
                        >
                          {finding.severity}
                        </span>
                        <span className="text-xs font-semibold capitalize text-slate-400">{finding.dimension}</span>
                      </div>
                      <p className="mt-0.5 text-xs leading-snug text-slate-700">{finding.detail}</p>
                      {finding.file ? <p className="text-xs text-slate-400 break-all">{finding.file}</p> : null}
                      {finding.evidence ? (
                        <p className="mt-0.5 rounded bg-slate-50 px-1.5 py-1 font-mono text-xs leading-snug text-slate-500 break-words">
                          {finding.evidence}
                        </p>
                      ) : null}
                      {finding.reason ? <p className="mt-1 text-xs text-slate-600">Why: {finding.reason}</p> : null}
                      {finding.action ? (
                        <p className="mt-0.5 text-xs text-slate-700">Improve: {finding.action}</p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <p className="text-xs text-slate-400 leading-snug">
              The full markdown report ships inside the package ZIP as QUALITY_REPORT.md, and the manifest carries this
              grade under <span className="font-mono">quality</span>.
            </p>
          </div>
        </div>
      </div>
    </FocusTrap>
  );
  // The export panel lives inside responsive/transformed workspace shells.
  // A fixed descendant of those shells can be clipped and positioned against
  // the side panel instead of the viewport. Portal the report to <body> so it
  // is genuinely viewport-centered at every desktop/mobile layout.
  return typeof document === 'undefined' ? modal : createPortal(modal, document.body);
}

// v0.14.4 WS-B3: ReadinessFinalizingPanel removed — the in-panel stage
// narration ("Finishing package / Generating, repairing…") now lives in ONE
// place, the build ribbon under the workspace header. While a finish pass
// runs the panel simply withholds the readiness card (its data is mid-repair)
// instead of narrating.

// ── Main Component ────────────────────────────────────────────────────────────
export default function ExportSidePanel({
  activeTab,
  activeTabLabel,
  deliverables,
  readinessDeliverableConfig = null,
  onCourseMapExport, // handleDownload from useExport
  onSaveProject, // save full session as .coursemapper
  onReadinessIssueClick,
  onAutoRepairReadiness,
  onFinishPackage,
  canFinishPackage = false,
  packageQualityPass,
  onPackageQualityPassUpdate = null,
  courseGraph = null,
  // v0.14.4 WS-B2: the findings modal can be driven by the workspace header
  // chip — when the parent passes an open-state handler the modal runs in
  // controlled mode; otherwise the panel keeps its own local state.
  qualityModalOpen: qualityModalOpenProp,
  onQualityModalOpenChange = null,
  isPackageGenerationRunning = false,
  preferPackageScope = false,
  getPipelineState = null, // v0.12.1: () => manifest pipeline block, read at export time
  getQualityContext = null, // v0.14.3+: () => { budget, digest, expectedSessionMinutes } — ZIP audit context
  // v0.14.9 B1: THE review queue is built and owned by AppFlow (one queue
  // object feeds the header CTA's headline count, this drawer, and the agent
  // digest entry) — the panel stopped building a rival queue, which is how
  // the header and drawer once showed two different numbers. Progress and
  // marking live with the queue's owner; this panel only hosts the drawer.
  reviewQueue = null,
  reviewProgress = null,
  onReviewMark = null,
  onReviewMarkAll = null,
  reviewQueueOpen: reviewQueueOpenProp,
  onReviewQueueOpenChange = null,
  reviewQueueFocusId = null,
  // v0.14.7 WS-G4: the pending sync approval executor.
  onExecuteSync = null,
}) {
  const { courseMap, columns, selectedFeatures, deliverableConfig: storedDeliverableConfig, slideTheme } = useCourse();
  const deliverableConfig = readinessDeliverableConfig || storedDeliverableConfig;
  const [scope, setScope] = useState('current'); // 'current' | 'all'
  const [scopeWasChosen, setScopeWasChosen] = useState(false);
  const [busy, setBusy] = useState(null); // format string or 'zip'
  const [lastError, setLastError] = useState('');
  const [lastOk, setLastOk] = useState('');
  const [lastNotice, setLastNotice] = useState('');
  const [pendingReadinessExport, setPendingReadinessExport] = useState(null);
  const [autoRepairingReadiness, setAutoRepairingReadiness] = useState(false);
  const [finishPackageBusy, setFinishPackageBusy] = useState(false);
  const [qualityModalOpenLocal, setQualityModalOpenLocal] = useState(false);
  const qualityModalControlled = typeof onQualityModalOpenChange === 'function';
  const qualityModalOpen = qualityModalControlled ? Boolean(qualityModalOpenProp) : qualityModalOpenLocal;
  const setQualityModalOpen = qualityModalControlled ? onQualityModalOpenChange : setQualityModalOpenLocal;
  const [readinessRepairAttempts, setReadinessRepairAttempts] = useState(() => new Set());
  const readinessConfirmRef = useRef(null);
  const isPackageQualityRunning = isFinishPassActive(packageQualityPass);
  const isPackageWorkflowRunning = isPackageGenerationRunning || isPackageQualityRunning;
  // Export reports completed preparation only. Export warnings and quality
  // reasons remain available in Agent, where they can be explained without
  // turning the delivery surface into a second audit panel.
  const finishSummary = useMemo(() => {
    if (!hasFinishedPackageReceipt(packageQualityPass)) return '';
    const repairs = Number(packageQualityPass?.repairsApplied) || 0;
    const parts = [];
    if (repairs > 0) parts.push(`${repairs} safe repair${repairs === 1 ? '' : 's'} applied`);
    return parts.join(' · ');
  }, [packageQualityPass]);

  // All-tab lesson filter (null = all lessons)
  const allLessons = courseMap?.lessons || [];
  const [selectedLessons, setSelectedLessons] = useState(null); // null = all
  // v0.14.9 B5: the checkbox wall hides behind "All N lessons · Edit" while
  // every lesson is in scope — editing or a partial scope reveals it.
  const [editingLessonScope, setEditingLessonScope] = useState(false);

  const courseName = courseMap?.courseName || 'Course';

  // ── Review queue drawer hosting (v0.14.9 B1: the queue itself arrives as
  // a prop from AppFlow — see the props block).
  const [reviewQueueOpenLocal, setReviewQueueOpenLocal] = useState(false);
  const [reviewQueueFocusLocal, setReviewQueueFocusLocal] = useState(null);
  const reviewQueueControlled = typeof onReviewQueueOpenChange === 'function';
  const reviewQueueOpen = reviewQueueControlled ? Boolean(reviewQueueOpenProp) : reviewQueueOpenLocal;
  const effectiveReviewFocusId = reviewQueueControlled ? reviewQueueFocusId : reviewQueueFocusLocal;
  const openReviewQueue = (focusId = null) => {
    if (reviewQueueControlled) {
      onReviewQueueOpenChange(true, focusId);
    } else {
      setReviewQueueFocusLocal(focusId);
      setReviewQueueOpenLocal(true);
    }
  };
  const closeReviewQueue = () => {
    if (reviewQueueControlled) {
      onReviewQueueOpenChange(false, null);
    } else {
      setReviewQueueOpenLocal(false);
      setReviewQueueFocusLocal(null);
    }
  };

  // ── Determine what we're exporting ──────────────────────────────────────────
  const isCurrentCourseMap = scope === 'current' && activeTab === 'courseMap';
  const isCurrentSlideDecks = scope === 'current' && activeTab === 'slideDecks';
  const isCurrentDeliverable = scope === 'current' && activeTab !== 'courseMap';
  const currentDeliverable = deliverables?.[activeTab];
  const currentHasData = isCurrentDeliverable && currentDeliverable?.status === 'done' && currentDeliverable?.data;

  // Format support for current tab (custom deliverables get csv/pdf/docx/gdocs)
  const CUSTOM_FORMAT_SUPPORT = {
    xlsx: false,
    csv: true,
    pdf: true,
    docx: true,
    gdocs: true,
    gsheets: true,
    pptx: false,
    slidepdf: false,
  };
  const currentSupport = FORMAT_SUPPORT[activeTab] || (activeTab?.startsWith('custom_') ? CUSTOM_FORMAT_SUPPORT : {});

  // Count ready deliverables for "All" mode
  const allReadyCount = getExportFeatureIds('all').filter((featureId) =>
    featureId === 'courseMap' ? Boolean(courseMap) : deliverables?.[featureId]?.status === 'done',
  ).length;
  const allPackagePartCount = getExportFeatureIds('all').length;

  useEffect(() => {
    if (!preferPackageScope || scopeWasChosen || scope === 'all') return;
    setScope('all');
    clearPendingReadinessExport();
  }, [preferPackageScope, scope, scopeWasChosen]);

  // Effective lesson filter for ZIP
  const effectiveLessonFilter = selectedLessons; // null means no filter (all)
  const workspaceReadiness = useMemo(
    () =>
      evaluateStrictReadiness(
        {
          courseMap,
          deliverables,
          selectedFeatures,
          columns,
          lessonFilter: effectiveLessonFilter,
          deliverableConfig,
        },
        { includeClassroomReadiness: true, blockOnClassroomWarnings: false },
      ),
    [columns, courseMap, deliverableConfig, deliverables, effectiveLessonFilter, selectedFeatures],
  );
  const currentReadiness = useMemo(
    () =>
      evaluateStrictReadiness({
        courseMap,
        deliverables,
        selectedFeatures: [activeTab],
        columns,
        lessonFilter: null,
        deliverableConfig,
      }),
    [activeTab, columns, courseMap, deliverableConfig, deliverables],
  );
  const activeReadiness = scope === 'all' ? workspaceReadiness : currentReadiness;
  const zipPendingReadiness = pendingReadinessExport?.format === 'zip';
  const displayedReadiness =
    pendingReadinessExport?.scope === scope ? pendingReadinessExport.readiness : getDownloadReadiness(activeReadiness);
  const verifiedPackageReceipt = scope === 'all' && hasDownloadableVerifiedPackage(packageQualityPass);
  const activeExportFeatureIds = useMemo(
    () => (scope === 'all' ? selectedFeatures : [activeTab]),
    [activeTab, scope, selectedFeatures],
  );
  const readinessIssueSignature = useMemo(() => {
    const issues = activeReadiness?.blockers || [];
    if (issues.length === 0) return '';
    const lessonScopeKey = effectiveLessonFilter === null ? 'all' : effectiveLessonFilter.join(',');
    return [
      scope,
      activeTab,
      lessonScopeKey,
      issues.map((issue) => `${issue.severity}:${issue.featureId}:${issue.message}`).join('|'),
    ].join('::');
  }, [activeReadiness, activeTab, effectiveLessonFilter, scope]);
  const canAutoRepairReadiness =
    typeof onAutoRepairReadiness === 'function' &&
    Boolean(readinessIssueSignature) &&
    !isPackageWorkflowRunning &&
    // A package whose files already passed export verification is immutable
    // at download time, even when its saved review queue still contains a
    // content note. Auto-repairing that note here races the user's click,
    // flips "Download ZIP" back to "Finishing package", and can make the
    // archive differ from the receipt that certified it.
    !(scope === 'all' && hasDownloadableVerifiedPackage(packageQualityPass)) &&
    !readinessRepairAttempts.has(readinessIssueSignature);
  const showReadinessFinalizing =
    canAutoRepairReadiness || autoRepairingReadiness || isPackageWorkflowRunning || finishPackageBusy;

  useEffect(() => {
    if (!pendingReadinessExport) return;
    if (
      pendingReadinessExport.scope === scope &&
      ((activeReadiness?.blockers?.length || 0) === 0 || verifiedPackageReceipt)
    ) {
      setPendingReadinessExport(null);
      setLastNotice('');
      setLastError('');
      return;
    }
    readinessConfirmRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [activeReadiness, pendingReadinessExport, scope, verifiedPackageReceipt]);

  useEffect(() => {
    if (!verifiedPackageReceipt) return;
    // A newer immutable export receipt supersedes any warning/error left by
    // an earlier preparation attempt. Quality findings remain untouched and
    // visible in Agent; only stale export narration is cleared here.
    setPendingReadinessExport(null);
    setLastError('');
    setLastNotice('');
  }, [verifiedPackageReceipt, packageQualityPass?.receipt]);

  useEffect(() => {
    if (!canAutoRepairReadiness || isPackageWorkflowRunning || finishPackageBusy) {
      if (!isPackageWorkflowRunning) setAutoRepairingReadiness(false);
      return;
    }

    const signature = readinessIssueSignature;
    setAutoRepairingReadiness(true);
    const timer = window.setTimeout(() => {
      try {
        onAutoRepairReadiness({
          selectedFeatureIds: activeExportFeatureIds,
          lessonFilter: scope === 'all' ? effectiveLessonFilter : null,
        });
      } finally {
        setReadinessRepairAttempts((prev) => {
          const next = new Set(prev);
          next.add(signature);
          return next;
        });
        setAutoRepairingReadiness(false);
      }
    }, 0);

    return () => window.clearTimeout(timer);
  }, [
    activeExportFeatureIds,
    canAutoRepairReadiness,
    effectiveLessonFilter,
    finishPackageBusy,
    isPackageWorkflowRunning,
    onAutoRepairReadiness,
    readinessIssueSignature,
    scope,
  ]);

  function getExportFeatureIds(exportScope = scope) {
    return exportScope === 'all' ? selectedFeatures : [activeTab];
  }

  function getReadinessSnapshot({
    exportScope = scope,
    exportCourseMap = courseMap,
    exportDeliverables = deliverables,
  } = {}) {
    return evaluateStrictReadiness(
      {
        courseMap: exportCourseMap,
        deliverables: exportDeliverables,
        selectedFeatures: getExportFeatureIds(exportScope),
        columns,
        lessonFilter: exportScope === 'all' ? effectiveLessonFilter : null,
        deliverableConfig,
      },
      { includeClassroomReadiness: exportScope === 'all', blockOnClassroomWarnings: false },
    );
  }

  function clearPendingReadinessExport() {
    setPendingReadinessExport(null);
    setLastNotice('');
  }

  async function finishPackageForExport(format = 'zip', readiness = displayedReadiness, exportScope = scope) {
    if (!canFinishPackage || typeof onFinishPackage !== 'function') return false;
    await doExport(format, {
      pendingExport: {
        format,
        readiness,
        scope: exportScope,
        repairsApplied: 0,
      },
    });
    return true;
  }

  async function doExport(format, { pendingExport = null } = {}) {
    if (isPackageWorkflowRunning) {
      setLastNotice(
        isPackageGenerationRunning
          ? 'Course materials are still generating. Export will be available after the package check finishes.'
          : 'Finishing package is repairing and checking materials before export.',
      );
      return;
    }

    const exportScope = pendingExport?.scope || scope;
    let exportCourseMap = courseMap;
    let exportDeliverables = deliverables || {};
    let exportCourseGraph = courseGraph;
    let exportReadiness = getReadinessSnapshot({ exportCourseMap, exportDeliverables, exportScope });
    let repairsApplied =
      pendingExport?.repairsApplied ??
      (hasFinishedPackageReceipt(packageQualityPass) ? Number(packageQualityPass?.repairsApplied) || 0 : 0);
    let finishOutcome = null;
    const verifiedPackageAvailableAtStart =
      format === 'zip' && exportScope === 'all' && hasDownloadableVerifiedPackage(packageQualityPass);

    const shouldFinishPackageBeforeExport =
      exportScope === 'all' &&
      typeof onFinishPackage === 'function' &&
      (Boolean(pendingExport) ||
        !hasFinishedPackageReceipt(packageQualityPass) ||
        (hasBlockingReadinessIssues(exportReadiness) && !verifiedPackageAvailableAtStart));

    if (shouldFinishPackageBeforeExport) {
      setPendingReadinessExport(null);
      setLastError('');
      setLastOk('');
      setLastNotice('Finishing, verifying, and preparing the package for export.');
      setFinishPackageBusy(true);
      try {
        const finishResult = await onFinishPackage({
          format,
          scope: exportScope,
          selectedFeatureIds: getExportFeatureIds(exportScope),
          lessonFilter: effectiveLessonFilter,
          readiness: exportReadiness,
        });

        if (finishResult === false) {
          setLastNotice('Package finishing could not start. Open the remaining issue that needs attention.');
          return;
        }

        if (finishResult && typeof finishResult === 'object') {
          finishOutcome = finishResult;
          repairsApplied += finishResult.repairsApplied || 0;
          exportCourseMap = finishResult.courseMap || exportCourseMap;
          exportDeliverables = finishResult.deliverables || exportDeliverables;
          exportCourseGraph = finishResult.courseGraph || exportCourseGraph;
          exportReadiness =
            finishResult.readiness || getReadinessSnapshot({ exportCourseMap, exportDeliverables, exportScope });
          exportReadiness = mergeFinalizerRetryIssues(exportReadiness, finishResult);
          exportReadiness = mergeExportVerificationIssues(exportReadiness, finishResult.exportVerification);
        } else {
          exportReadiness = getReadinessSnapshot({ exportCourseMap, exportDeliverables, exportScope });
        }
      } catch (err) {
        setLastError(err?.message || 'Could not finish the package for export.');
        return;
      } finally {
        setFinishPackageBusy(false);
      }
    } else if (!verifiedPackageAvailableAtStart && typeof onAutoRepairReadiness === 'function') {
      // A package that already earned a ready finish receipt and 38/38 export
      // verification is immutable at download time. Running another repair
      // here could make the ZIP differ from the state that was verified and
      // would make the green card and download receipt report different
      // repair counts.
      const repairResult = onAutoRepairReadiness({
        selectedFeatureIds: getExportFeatureIds(exportScope),
        lessonFilter: exportScope === 'all' ? effectiveLessonFilter : null,
      });
      repairsApplied += repairResult?.applied || 0;
      exportCourseMap = repairResult?.courseMap || exportCourseMap;
      exportDeliverables = repairResult?.deliverables || exportDeliverables;
      exportReadiness = getReadinessSnapshot({ exportCourseMap, exportDeliverables, exportScope });
    }

    const verifiedPackageAvailable =
      format === 'zip' && exportScope === 'all' && hasDownloadableVerifiedPackage(packageQualityPass, finishOutcome);
    if (hasBlockingReadinessIssues(exportReadiness) && !verifiedPackageAvailable) {
      const canFinishPackageAgain =
        !finishOutcome || ((finishOutcome.retryActions?.length || 0) > 0 && !finishOutcome.retryExhausted);
      const pendingExport = {
        format,
        readiness: exportReadiness,
        scope: exportScope,
        courseMap: exportCourseMap,
        deliverables: exportDeliverables,
        repairsApplied,
        canFinishPackageAgain,
      };
      setPendingReadinessExport({
        ...pendingExport,
      });
      setLastError('');
      setLastOk('');
      setLastNotice(
        finishOutcome && !canFinishPackageAgain
          ? `${repairsApplied > 0 ? `Auto-fixed ${repairsApplied} safe issue${repairsApplied === 1 ? '' : 's'}. ` : ''}Automatic finishing ran. Open the remaining issue before exporting.`
          : `${repairsApplied > 0 ? `Auto-fixed ${repairsApplied} safe issue${repairsApplied === 1 ? '' : 's'}. ` : ''}${
              format === 'zip'
                ? 'Finish the issues above before downloading the ZIP.'
                : 'Finish the issues above before exporting.'
            }`,
      );
      return;
    }

    // Preserve review items in a verified package. PACKAGE_MANIFEST.json and
    // QUALITY_REPORT.md must explain why it needs refinement before publishing
    // even though its physical files passed export verification.
    const downloadReadiness = verifiedPackageAvailable ? exportReadiness : getDownloadReadiness(exportReadiness);
    setPendingReadinessExport(null);
    // Safe automatic repairs are a successful system outcome, not an amber
    // attention state. The completed download receipt below reports them in
    // the green success message; amber remains reserved for an unresolved
    // decision or export warning.
    setLastNotice('');
    // For Google exports we must open a tab BEFORE any await (popup blocker)
    // Course map exports open their own tab internally via useExport → saveToGoogleDocs/Sheets
    const needsTab = (format === 'gdocs' || format === 'gsheets' || format === 'gslides') && activeTab !== 'courseMap';
    const preTab = needsTab ? openTabNow() : null;

    setBusy(format);
    setLastError('');
    setLastOk('');
    // ZIP assembly is intentionally local, but Office rendering and
    // compression can occupy the main thread for several seconds. Yield one
    // paint before starting so the click releases, the spinner appears, and
    // the user sees an honest local-work status instead of a dead button.
    if (format === 'zip') await yieldForExportPaint();
    try {
      if (exportScope === 'all') {
        // All mode: only ZIP is available
        if (format === 'zip') {
          const qualityContext = typeof getQualityContext === 'function' ? { ...(getQualityContext() || {}) } : {};
          // A same-click finish produces fresher proof than the captured
          // React prop. Carry that exact proof into ZIP assembly so the
          // download cannot race a second grader or export stale evidence.
          const completedQuality = finishOutcome ? finishOutcome.quality : packageQualityPass?.quality;
          if (completedQuality?.status === 'graded') {
            qualityContext.precomputed = {
              ...completedQuality,
              packageReadinessBinding: buildPackageReadinessBinding(downloadReadiness),
            };
          }
          const zipResult = await downloadCourseMaterialsZip({
            deliverables: exportDeliverables || {},
            courseMap: exportCourseMap,
            columns,
            courseName: exportCourseMap?.courseName || courseName,
            lessonFilter: effectiveLessonFilter,
            slideTheme,
            readiness: downloadReadiness,
            featureIds: getExportFeatureIds(exportScope),
            courseGraph: exportCourseGraph,
            pipelineState: typeof getPipelineState === 'function' ? getPipelineState() : null,
            // v0.14.3 WS-A: the ZIP grades itself before assembly — budget +
            // digest feed the in-app honesty checks (manifest.quality +
            // QUALITY_REPORT.md ride the download).
            quality: qualityContext,
          });
          if (zipResult.downloaded === false) {
            if (typeof onPackageQualityPassUpdate === 'function' && zipResult.quality) {
              onPackageQualityPassUpdate((previous) => ({
                ...previous,
                status: 'blocked',
                blockers: Math.max(1, Number(previous?.blockers) || 0),
                quality: zipResult.quality,
                ...(previous?.blockerDomains
                  ? {
                      blockerDomains: {
                        ...previous.blockerDomains,
                        quality: Math.max(1, Number(previous.blockerDomains.quality) || 0),
                        total:
                          (Number(previous.blockerDomains.readiness) || 0) +
                          Math.max(1, Number(previous.blockerDomains.quality) || 0) +
                          (Number(previous.blockerDomains.export) || 0),
                      },
                    }
                  : {}),
              }));
            }
            const reason = zipResult.quality?.reason || zipResult.quality?.error || 'the quality check did not finish';
            setLastError(
              `The package could not be prepared because quality proof is unavailable: ${reason}. Try again.`,
            );
            return;
          }
          if (typeof onPackageQualityPassUpdate === 'function' && zipResult.quality?.status === 'graded') {
            const exportedQuality = {
              ...zipResult.quality,
              grades: zipResult.qualityResult?.grades || completedQuality?.grades || {},
              findings: zipResult.qualityResult?.findings || completedQuality?.findings || [],
              findingCount: zipResult.qualityResult?.stats?.findingCount ?? completedQuality?.findingCount ?? 0,
              fileCount: zipResult.qualityResult?.stats?.fileCount ?? completedQuality?.fileCount ?? null,
              texture:
                zipResult.qualityResult?.texture || zipResult.quality.texture || completedQuality?.texture || null,
            };
            const exportReceipt = zipResult.packageReadinessReceipt?.exportVerification || {};
            onPackageQualityPassUpdate((previous) => {
              const previousReceipt = previous?.receipt || {};
              const receiptCount = (key, fallbackKey) => {
                const value = exportReceipt?.[key];
                return value == null || value === ''
                  ? Math.max(0, Number(previousReceipt?.[fallbackKey]) || 0)
                  : Math.max(0, Number(value) || 0);
              };
              const exportChecked = receiptCount('checked', 'exportChecked');
              const exportFailed = receiptCount('failed', 'exportFailed');
              const exportWarningCount = receiptCount('warningCount', 'exportWarningCount');
              const finishDomains = buildPackageFinishDomains({
                readiness: downloadReadiness,
                retryWarningCount: previous?.warningDomains?.retry || 0,
                exportWarningCount,
                exportFailureCount: exportFailed,
                quality: exportedQuality,
              });
              return {
                ...previous,
                status: finishDomains.blockerDomains.total > 0 ? 'blocked' : 'ready',
                phase: 'complete',
                blockers: finishDomains.blockerDomains.total,
                warnings: finishDomains.warningDomains.total,
                ...finishDomains,
                receipt: {
                  ...previousReceipt,
                  ...(zipResult.packageReadinessReceipt
                    ? { packageReadinessReceipt: zipResult.packageReadinessReceipt }
                    : {}),
                  exportStatus: exportReceipt.status || previousReceipt.exportStatus || '',
                  exportChecked,
                  exportFailed,
                  exportWarningCount,
                },
                quality: exportedQuality,
              };
            });
          }
          setLastOk(
            `ZIP downloaded with ${zipResult.files.length} file${
              zipResult.files.length === 1 ? '' : 's'
            }.${repairsApplied > 0 ? ` ${repairsApplied} safe fix${repairsApplied === 1 ? '' : 'es'} applied.` : ''}${
              verifiedPackageAvailable ? ' Review notes are included in the package.' : ''
            }`,
          );
        }
      } else {
        // Current tab
        if (activeTab === 'courseMap') {
          await onCourseMapExport(format, exportCourseMap);
        } else if (activeTab === 'slideDecks') {
          // Slide decks: pptx, pdf, or google slides
          const exportDeliverable = exportDeliverables?.[activeTab] || currentDeliverable;
          if (!exportDeliverable?.data) throw new Error('No slide data yet');
          if (format === 'pptx') {
            await exportSlideDeckPptx(exportDeliverable.data, exportCourseMap?.courseName || courseName, slideTheme);
          } else if (format === 'slidepdf') {
            const { exportSlideDeckPdf } = await safeImport(() => import('../lib/exporters/slideDeckPdfExporter'));
            await exportSlideDeckPdf(exportDeliverable.data, exportCourseMap?.courseName || courseName);
          } else if (format === 'gslides') {
            const blob = await buildSlideDeckPptxBlob(
              exportDeliverable.data,
              exportCourseMap?.courseName || courseName,
              slideTheme,
            );
            const stamp = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            await saveToGoogleSlides(
              blob,
              `${exportCourseMap?.courseName || courseName} - Slide Decks (${stamp})`,
              exportCourseMap?.courseName || courseName,
              preTab,
            );
          }
        } else {
          const exportDeliverable = exportDeliverables?.[activeTab] || currentDeliverable;
          if (!exportDeliverable?.data) throw new Error('No data yet');
          if (format === 'csv')
            await exportDeliverableCsv(activeTab, exportDeliverable.data, exportCourseMap?.courseName || courseName);
          if (format === 'pdf')
            await exportDeliverablePdf(activeTab, exportDeliverable.data, exportCourseMap?.courseName || courseName);
          if (format === 'docx')
            await exportDeliverableDocx(activeTab, exportDeliverable.data, exportCourseMap?.courseName || courseName);
          if (format === 'gdocs')
            await exportDeliverableToGoogleDocs(
              activeTab,
              exportDeliverable.data,
              exportCourseMap?.courseName || courseName,
              preTab,
            );
          if (format === 'gsheets')
            await exportDeliverableToGoogleSheets(
              activeTab,
              exportDeliverable.data,
              exportCourseMap?.courseName || courseName,
              preTab,
            );
        }
        setLastOk('Done!');
      }
    } catch (err) {
      if (preTab && !preTab.closed) preTab.close();
      if (format === 'zip' && exportScope === 'all' && Array.isArray(err?.failures) && err.failures.length > 0) {
        const failureReadiness = mergePackageExportFailureIssues(exportReadiness, err);
        setPendingReadinessExport({
          format,
          readiness: failureReadiness,
          scope: exportScope,
          courseMap: exportCourseMap,
          deliverables: exportDeliverables,
          repairsApplied,
          canFinishPackageAgain: false,
        });
        setLastNotice('ZIP export stopped before download because required files could not be built.');
        setLastError(err.message || 'ZIP export failed before download.');
      } else {
        setLastError(err.message || 'Export failed');
      }
    } finally {
      setBusy(null);
      setTimeout(() => {
        setLastOk('');
        setLastError('');
        setLastNotice('');
      }, 4000);
    }
  }

  // What's disabled in "current" mode
  function isDisabled(formatId) {
    if (activeTab === 'courseMap') return !FORMAT_SUPPORT.courseMap[formatId] || !courseMap;
    if (activeTab === 'slideDecks') {
      if (formatId === 'pptx' || formatId === 'slidepdf' || formatId === 'gslides') return !currentHasData;
      return true; // other formats not supported for slide decks
    }
    if (!currentHasData) return true;
    return !currentSupport[formatId];
  }

  const tabLabel =
    activeTabLabel || (activeTab === 'courseMap' ? 'Course Map' : FEATURE_LABELS[activeTab] || activeTab);

  // Toggle a lesson in/out of selectedLessons
  function toggleLesson(idx) {
    clearPendingReadinessExport();
    setSelectedLessons((prev) => {
      if (prev === null) {
        // Currently all selected — deselect just this one
        return allLessons.map((_, i) => i).filter((i) => i !== idx);
      }
      if (prev.includes(idx)) {
        // Deselect — allow empty array (all unchecked)
        const next = prev.filter((i) => i !== idx);
        return next.length === allLessons.length ? null : next;
      } else {
        // Select — if now all selected, normalize to null
        const next = [...prev, idx].sort((a, b) => a - b);
        return next.length === allLessons.length ? null : next;
      }
    });
  }

  const allSelected = selectedLessons === null;
  const selectedCount = selectedLessons === null ? allLessons.length : selectedLessons.length;
  const activeHasReadinessIssues = hasBlockingReadinessIssues(displayedReadiness);
  const zipHasExportFailure = scope === 'all' && hasPackageExportFailure(packageQualityPass);
  const terminalPackageTrust = getPackageTrustStatus({
    packageQualityPass,
    quality: packageQualityPass?.quality || null,
    receipt: packageQualityPass?.receipt || null,
    featureLabels: FEATURE_LABELS,
  });
  const zipHasTerminalTrustBlocker = scope === 'all' && terminalPackageTrust.blocked;
  const zipHasVerifiedReceipt = scope === 'all' && hasDownloadableVerifiedPackage(packageQualityPass);
  const zipCanDownloadReviewedPackage = scope === 'all' && zipHasTerminalTrustBlocker && zipHasVerifiedReceipt;
  const zipPendingNeedsAttention = zipPendingReadiness && pendingReadinessExport?.canFinishPackageAgain === false;
  const zipCanFinishPackage =
    scope === 'all' &&
    activeHasReadinessIssues &&
    canFinishPackage &&
    !zipPendingNeedsAttention &&
    !zipHasExportFailure &&
    !zipHasTerminalTrustBlocker &&
    !zipHasVerifiedReceipt;
  const zipButtonLabel =
    busy === 'zip'
      ? 'Preparing ZIP…'
      : finishPackageBusy
        ? 'Finishing package'
        : zipCanFinishPackage
          ? 'Prepare package'
          : zipCanDownloadReviewedPackage
            ? 'Download ZIP'
            : zipPendingNeedsAttention || zipHasExportFailure || zipHasTerminalTrustBlocker
              ? 'Prepare package'
              : zipPendingReadiness
                ? 'Prepare package'
                : 'Download ZIP';
  // The export panel is the single ZIP owner.
  const zipDownloadDisabled =
    !!busy ||
    isPackageQualityRunning ||
    finishPackageBusy ||
    zipHasExportFailure ||
    (zipHasTerminalTrustBlocker && !zipCanDownloadReviewedPackage) ||
    (zipPendingReadiness && !canFinishPackage) ||
    zipPendingNeedsAttention ||
    allReadyCount === 0 ||
    !courseMap ||
    (selectedLessons !== null && selectedLessons.length === 0);
  const panelTitle = isPackageGenerationRunning ? 'Building package' : 'Export package';
  return (
    <div
      data-testid="export-side-panel"
      className="export-side-panel flex flex-col gap-4 w-full lg:w-64 lg:flex-shrink-0"
    >
      {/* ── Panel card ── */}
      <div className="rounded-lg border border-slate-200/70 bg-white p-4 shadow-sm space-y-4">
        {/* Header */}
        <div className="flex items-start gap-2">
          <div className="w-7 h-7 rounded-lg bg-slate-950 dark:bg-white flex items-center justify-center flex-shrink-0 shadow-sm">
            <svg
              className="w-3.5 h-3.5 text-white dark:text-slate-950"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
          </div>
          <div className="min-w-0">
            <p data-testid="export-panel-title" className="text-xs font-bold text-slate-800">
              {panelTitle}
            </p>
          </div>
        </div>

        {qualityModalOpen && (
          <QualityReportModal quality={packageQualityPass?.quality} onClose={() => setQualityModalOpen(false)} />
        )}

        <ReviewQueue
          open={reviewQueueOpen}
          queue={reviewQueue}
          progress={reviewProgress}
          focusItemId={effectiveReviewFocusId}
          onClose={closeReviewQueue}
          onMark={onReviewMark}
          onMarkAll={onReviewMarkAll}
          onExecuteSync={onExecuteSync}
        />

        {/* v0.14.7.1 deep clean: the review ENTRY moved out of this panel
            entirely — the header's morphing CTA ("Review N") and the agent
            panel's one-line report are the queue entries; the drawer above
            still lives here. The panel is actions-only. */}

        {/* ── Scope toggle ── */}
        <div className="flex items-center bg-slate-100/80 rounded-lg p-0.5 gap-0.5">
          {[
            { id: 'current', label: 'This tab' },
            { id: 'all', label: 'Package' },
          ].map((s) => (
            <button
              key={s.id}
              data-testid={`export-scope-${s.id}`}
              onClick={() => {
                setScopeWasChosen(true);
                setScope(s.id);
                clearPendingReadinessExport();
              }}
              className={`flex-1 py-1.5 rounded-md text-xs font-semibold transition-all duration-200 ${
                scope === s.id ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Scope description */}
        <p className="text-xs text-slate-400 leading-snug -mt-1">
          {scope === 'current' ? (
            <>
              <span className="font-semibold text-slate-600">{tabLabel}</span> only
            </>
          ) : (
            <>
              <span className="font-semibold text-slate-600">
                {allReadyCount}/{allPackagePartCount} package parts
              </span>{' '}
              ready
            </>
          )}
        </p>

        {/* v0.14.4 WS-B3: while a finish/generation pass runs, the build
            ribbon narrates — the panel shows nothing here instead of a
            duplicate "Finishing package…" card. */}
        {!showReadinessFinalizing && (
          <ReadinessPanel
            readiness={displayedReadiness}
            onIssueClick={onReadinessIssueClick}
            finishSummary={finishSummary}
            packageReceipt={packageQualityPass?.receipt || null}
            packageQualityPass={packageQualityPass}
            exportPrepared={zipHasVerifiedReceipt}
            packageScope={scope === 'all'}
          />
        )}

        <ReadinessConfirm
          pendingExport={pendingReadinessExport}
          onCancel={clearPendingReadinessExport}
          onIssueClick={onReadinessIssueClick}
          onFinishPackage={finishPackageForExport}
          canFinishPackage={canFinishPackage}
          finishPackageBusy={finishPackageBusy}
          confirmRef={readinessConfirmRef}
        />

        {/* ────────────────────────────────────────────────────────────── */}
        {/* ALL MODE: Lesson scope + ZIP download + Save Project file     */}
        {/* ────────────────────────────────────────────────────────────── */}
        {scope === 'all' && (
          <div className="space-y-3">
            {/* Lesson scope selector — v0.14.9 B5: the common case (all
                lessons) is ONE calm line; the checkbox wall renders only
                while editing scope or while a partial scope is active. */}
            {allLessons.length > 0 && allSelected && !editingLessonScope && (
              <div className="flex items-center justify-between" data-testid="lesson-scope-collapsed">
                <p className="text-xs font-semibold text-slate-500">Lesson scope</p>
                <button
                  data-testid="lesson-scope-edit"
                  onClick={() => setEditingLessonScope(true)}
                  className="text-xs font-semibold text-indigo-500 hover:text-indigo-700 transition-colors"
                >
                  {allLessons.length === 1 ? '1 lesson' : `All ${allLessons.length} lessons`} · Edit
                </button>
              </div>
            )}
            {allLessons.length > 0 && (!allSelected || editingLessonScope) && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-xs font-semibold text-slate-500">Lesson scope</p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setSelectedLessons(allSelected ? [] : null)}
                      className="text-xs font-semibold text-indigo-500 hover:text-indigo-700 transition-colors"
                    >
                      {allSelected ? 'Uncheck all' : 'Select all'}
                    </button>
                    {allSelected && (
                      <button
                        data-testid="lesson-scope-done"
                        onClick={() => setEditingLessonScope(false)}
                        className="text-xs font-semibold text-slate-400 hover:text-slate-600 transition-colors"
                      >
                        Done
                      </button>
                    )}
                  </div>
                </div>
                <div className="space-y-0.5 max-h-36 overflow-y-auto pr-0.5">
                  {allLessons.map((lesson, idx) => {
                    const isOn = allSelected || selectedLessons?.includes(idx);
                    const title = lesson.title || lesson.lessonTitle || `Lesson ${idx + 1}`;
                    return (
                      <button
                        key={idx}
                        onClick={() => toggleLesson(idx)}
                        className={`w-full flex items-center gap-1.5 px-2 py-1 rounded-md text-xs text-left transition-colors ${
                          isOn ? 'bg-indigo-50 text-indigo-700' : 'text-slate-400 hover:bg-slate-50'
                        }`}
                      >
                        <span
                          className={`w-3.5 h-3.5 rounded flex-shrink-0 border flex items-center justify-center ${
                            isOn ? 'bg-indigo-500 border-indigo-500' : 'border-slate-300 dark:border-slate-600'
                          }`}
                        >
                          {isOn && (
                            <svg className="w-2 h-2 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </span>
                        <span className="truncate">{title}</span>
                      </button>
                    );
                  })}
                </div>
                {!allSelected && (
                  <p className="text-xs text-slate-400 mt-1">
                    {selectedCount} of {allLessons.length} lessons selected
                  </p>
                )}
              </div>
            )}

            <div>
              <p className="text-xs font-semibold text-slate-500 mb-1.5">Package ZIP</p>
              <button
                data-testid="export-download-zip"
                onClick={() => doExport('zip')}
                disabled={zipDownloadDisabled}
                aria-busy={busy === 'zip'}
                className="tactile flex w-full items-center justify-center gap-2 rounded-lg bg-slate-950 py-2.5 text-xs font-bold text-white shadow-sm transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200 dark:disabled:bg-slate-800 dark:disabled:text-slate-500"
              >
                {busy === 'zip' ? (
                  <Spin />
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                    />
                  </svg>
                )}
                {zipButtonLabel}
              </button>
              {busy === 'zip' && (
                <p role="status" aria-live="polite" className="mt-2 text-xs leading-5 text-slate-500">
                  Assembling the verified course files locally. Large packages can take 10–20 seconds.
                </p>
              )}
            </div>

            {/* v0.14.7.1: Save .coursemapper moved to the header's one More
                menu — the panel keeps export verbs only. */}
          </div>
        )}

        {/* ────────────────────────────────────────────────────────────── */}
        {/* CURRENT MODE — SLIDE DECKS: .pptx + .pdf + Google Slides     */}
        {/* ────────────────────────────────────────────────────────────── */}
        {scope === 'current' && activeTab === 'slideDecks' && (
          <>
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-500">Download</p>
              <FmtBtn
                fmt={{ id: 'pptx', label: 'PowerPoint (.pptx)', color: 'pptx' }}
                disabled={isPackageQualityRunning || isDisabled('pptx')}
                busy={busy === 'pptx'}
                onClick={() => doExport('pptx')}
              />
              <FmtBtn
                fmt={{ id: 'slidepdf', label: 'PDF (.pdf)', color: 'slidepdf' }}
                disabled={isPackageQualityRunning || isDisabled('slidepdf')}
                busy={busy === 'slidepdf'}
                onClick={() => doExport('slidepdf')}
              />
            </div>
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-500">Google Drive</p>
              <GDriveBtn
                fmt={{ id: 'gslides', label: 'Google Slides' }}
                disabled={isPackageQualityRunning || isDisabled('gslides')}
                busy={busy === 'gslides'}
                onClick={() => doExport('gslides')}
              />
            </div>
          </>
        )}

        {/* ────────────────────────────────────────────────────────────── */}
        {/* CURRENT MODE — COURSE MAP: xlsx/csv/pdf/docx + gdocs/gsheets  */}
        {/* ────────────────────────────────────────────────────────────── */}
        {scope === 'current' && activeTab === 'courseMap' && (
          <>
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-500">Download</p>
              <div className="grid grid-cols-2 gap-1.5">
                {DOWNLOAD_FORMATS.map((fmt) => (
                  <FmtBtn
                    key={fmt.id}
                    fmt={fmt}
                    disabled={isPackageQualityRunning || isDisabled(fmt.id)}
                    busy={busy === fmt.id}
                    onClick={() => doExport(fmt.id)}
                  />
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-500">Google Drive</p>
              <div className="flex flex-col gap-1.5">
                {CLOUD_FORMATS.map((fmt) => (
                  <GDriveBtn
                    key={fmt.id}
                    fmt={fmt}
                    disabled={isPackageQualityRunning || isDisabled(fmt.id)}
                    busy={busy === fmt.id}
                    onClick={() => doExport(fmt.id)}
                  />
                ))}
              </div>
            </div>
          </>
        )}

        {/* ────────────────────────────────────────────────────────────── */}
        {/* CURRENT MODE — OTHER DELIVERABLES: relevant formats only       */}
        {/* ────────────────────────────────────────────────────────────── */}
        {scope === 'current' && activeTab !== 'courseMap' && activeTab !== 'slideDecks' && (
          <>
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-500">Download</p>
              <div className="grid grid-cols-2 gap-1.5">
                {DOWNLOAD_FORMATS.filter((fmt) => !isDisabled(fmt.id)).map((fmt) => (
                  <FmtBtn
                    key={fmt.id}
                    fmt={fmt}
                    disabled={isPackageQualityRunning}
                    busy={busy === fmt.id}
                    onClick={() => doExport(fmt.id)}
                  />
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-500">Google Drive</p>
              <div className="flex flex-col gap-1.5">
                {CLOUD_FORMATS.filter((fmt) => !isDisabled(fmt.id)).map((fmt) => (
                  <GDriveBtn
                    key={fmt.id}
                    fmt={fmt}
                    disabled={isPackageQualityRunning}
                    busy={busy === fmt.id}
                    onClick={() => doExport(fmt.id)}
                  />
                ))}
                {CLOUD_FORMATS.every((fmt) => isDisabled(fmt.id)) && (
                  <p className="text-xs text-slate-300 italic">No cloud export available</p>
                )}
              </div>
            </div>
          </>
        )}

        {/* ── Feedback ── */}
        {lastOk && (
          <p
            data-testid="export-success"
            role="status"
            className="rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-xs font-semibold text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200"
          >
            ✓ {lastOk}
          </p>
        )}
        {lastError && (
          <p
            data-testid="export-error"
            role="alert"
            className="rounded-lg border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs font-semibold text-amber-800 animate-spring-in dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-200"
          >
            {lastError}
          </p>
        )}
        {lastNotice && !lastError && (
          // WS-E2: the export panel's amber notice shares the NoticeBanner
          // shell with the agent panel's "Worth a look" card — one attention
          // component, not two.
          <NoticeBanner severity="warning" dataTestId="export-notice" className="animate-spring-in">
            <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">{lastNotice}</p>
          </NoticeBanner>
        )}
      </div>
    </div>
  );
}
