import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useCourse } from '../contexts/CourseContext';
import { safeImport } from '../lib/safeImport';
import { summarizeReadiness } from '../lib/deliverableReadiness';
import { evaluateStrictPackageReadiness } from '../lib/packageFinalizer';
import { normalizeReadinessIssue } from '../lib/readinessIssueSchema';
import ReviewQueue from './ReviewQueue';
import { isFinishPassActive, isPackageReady } from '../lib/pipelineMachine';
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
import { downloadCourseMaterialsZip } from '../lib/packageZipExporter';

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
  { id: 'xlsx', label: '.xlsx', color: 'emerald' },
  { id: 'docx', label: '.docx', color: 'blue' },
  { id: 'pdf', label: '.pdf', color: 'red' },
  { id: 'csv', label: '.csv', color: 'slate' },
];
const CLOUD_FORMATS = [
  { id: 'gdocs', label: 'Google Docs', color: 'gdocs' },
  { id: 'gsheets', label: 'Google Sheets', color: 'gsheets' },
];

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
  const colorMap = {
    emerald: 'text-slate-600 bg-white/60 border border-slate-200/50 hover:bg-white/80',
    blue: 'text-slate-600 bg-white/60 border border-slate-200/50 hover:bg-white/80',
    red: 'text-slate-600 bg-white/60 border border-slate-200/50 hover:bg-white/80',
    slate: 'text-slate-600 bg-white/60 border border-slate-200/50 hover:bg-white/80',
    gdocs: 'text-[#1967D2] bg-[#E8F0FE]/80 border border-[#4285F4]/20 hover:bg-[#D2E3FC]',
    gsheets: 'text-[#188038] bg-[#E6F4EA]/80 border border-[#34A853]/20 hover:bg-[#CEEAD6]',
    pptx: 'text-slate-600 bg-white/60 border border-slate-200/50 hover:bg-white/80',
    gslides: 'text-[#F4B400] bg-[#FFF8E1]/80 border border-[#FBBC04]/30 hover:bg-[#FFF0B3]',
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
    ? 'text-[#F4B400] bg-[#FFF8E1]/80 border border-[#FBBC04]/30 hover:bg-[#FFF0B3]'
    : isSheets
      ? 'text-[#188038] bg-[#E6F4EA]/80 border border-[#34A853]/20 hover:bg-[#CEEAD6]'
      : 'text-[#1967D2] bg-[#E8F0FE]/80 border border-[#4285F4]/20 hover:bg-[#D2E3FC]';
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

function plural(count, singular, pluralValue = `${singular}s`) {
  return `${count} ${count === 1 ? singular : pluralValue}`;
}

function severityCount(count, label) {
  return `${count} ${label}`;
}

function buildQualityReviewIssue(quality) {
  if (quality?.status !== 'graded') return null;
  const counts = quality.findingCounts || {};
  const p0 = Number(counts.p0) || 0;
  const p1 = Number(counts.p1) || 0;
  const p2 = Number(counts.p2) || 0;
  const findingCount = p0 + p1 + p2;
  const score = Number(quality.score);
  const textureScore = Number(quality.texture?.score);
  const scoreNeedsReview = Number.isFinite(score) && score < 100;
  const textureNeedsReview = Number.isFinite(textureScore) && textureScore < 100;
  if (findingCount === 0 && !scoreNeedsReview && !textureNeedsReview) return null;

  const parts = [];
  if (p0 > 0) parts.push(severityCount(p0, 'P0'));
  if (p1 > 0) parts.push(severityCount(p1, 'P1'));
  if (p2 > 0) parts.push(severityCount(p2, 'P2'));
  if (findingCount === 0 && scoreNeedsReview) parts.push(`quality ${score}/100`);
  if (textureNeedsReview) parts.push(`texture ${textureScore}/100`);

  return {
    label: 'Quality',
    message: `${parts.join(' · ')} remain; open the quality report before publishing.`,
    count: findingCount || 1,
    severity: p0 > 0 ? 'blocker' : 'warning',
  };
}

function buildExportWarningIssues(packageReceipt) {
  if (packageReceipt?.exportWarning) {
    return [
      {
        label: 'Export warning',
        message: packageReceipt.exportWarning,
        severity: 'warning',
      },
    ];
  }
  const warnings = Array.isArray(packageReceipt?.exportWarnings) ? packageReceipt.exportWarnings : [];
  if (warnings.length > 0) {
    return warnings.slice(0, 3).map((warning) => ({
      label: warning.label || FEATURE_LABELS[warning.featureId] || 'Export warning',
      message: warning.message || 'Export verification found a warning.',
      severity: 'warning',
    }));
  }
  const warningCount = Number(packageReceipt?.exportWarningCount) || 0;
  if (warningCount <= 0) return [];
  return [
    {
      label: 'Export warning',
      message: `${plural(warningCount, 'warning')} found; review the package report before publishing.`,
      severity: 'warning',
    },
  ];
}

function summarizeReviewMeta({ qualityIssue, exportIssues }) {
  const parts = [];
  if (qualityIssue) parts.push(plural(qualityIssue.count, 'quality issue'));
  if (exportIssues.length > 0) parts.push(plural(exportIssues.length, 'export warning'));
  return parts.join(' · ');
}

function ReadinessPanel({
  readiness,
  onIssueClick,
  quality = null,
  onOpenQuality = null,
  finishSummary = '',
  packageReceipt = null,
}) {
  if (!readiness || readiness.featureCount === 0) return null;

  const qualityIssue = buildQualityReviewIssue(quality);
  const exportIssues = buildExportWarningIssues(packageReceipt);
  const packageReviewIssues = [qualityIssue, ...exportIssues].filter(Boolean);
  const isBlocked = readiness.blockers.length > 0 || qualityIssue?.severity === 'blocker';
  const hasWarnings = readiness.warnings.length > 0 || packageReviewIssues.length > 0;
  const issuesToShow = isBlocked
    ? [...readiness.blockers, ...(qualityIssue?.severity === 'blocker' ? [qualityIssue] : [])].slice(0, 3)
    : [...readiness.warnings, ...packageReviewIssues].slice(0, 3);
  const hasPackageOnlyReview = packageReviewIssues.length > 0 && readiness.warnings.length === 0;
  const helperText =
    issuesToShow.length === 0
      ? summarizeReadiness(readiness)
      : isBlocked
        ? 'Finish package fixes safe items and stops for decisions.'
        : hasPackageOnlyReview
          ? 'Download is available, but review these caveats before publishing.'
          : 'Finish package retries safe fixes before export.';
  const canNavigate = (issue) => typeof onIssueClick === 'function' && issue?.target;
  const tone = isBlocked
    ? {
        wrap: 'border-red-100 bg-red-50/70 text-red-700',
        icon: 'bg-red-100 text-red-600',
        title: 'Finish package',
        meta: `${readiness.blockers.length} critical issue${readiness.blockers.length === 1 ? '' : 's'}`,
      }
    : hasWarnings
      ? {
          wrap: 'border-amber-100 bg-amber-50/70 text-amber-700',
          icon: 'bg-amber-100 text-amber-600',
          title: 'Review before download',
          meta:
            summarizeReviewMeta({ qualityIssue, exportIssues }) ||
            `${readiness.warnings.length} issue${readiness.warnings.length === 1 ? '' : 's'} to fix`,
        }
      : {
          wrap: 'border-emerald-100 bg-emerald-50/70 text-emerald-700',
          icon: 'bg-emerald-100 text-emerald-600',
          title: 'Ready to download',
          meta: `${readiness.doneFeatureCount}/${readiness.featureCount} materials checked`,
        };

  return (
    <div data-testid="readiness-panel" className={`rounded-lg border px-3 py-2.5 ${tone.wrap}`}>
      <div className="flex items-start gap-2">
        <span
          className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-xs ${tone.icon}`}
        >
          {isBlocked ? '!' : hasWarnings ? '•' : '✓'}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <p data-testid="readiness-status" className="text-xs font-bold">
              {tone.title}
            </p>
            <span className="text-xs font-semibold opacity-70">{tone.meta}</span>
            {/* v0.14.4 WS-B2: the download card carries the compact grade
                stamp; the full chip lives in the workspace header. */}
            {!isBlocked && <QualityStamp quality={quality} onOpen={onOpenQuality} />}
          </div>
          {/* v0.14.6 calm pass: when everything is green the ✓ + meta already
              say it — restating "All selected materials passed…" was noise. */}
          {(isBlocked || hasWarnings) && <p className="mt-0.5 text-xs leading-snug opacity-80">{helperText}</p>}
          {/* v0.14.4 WS-B3: the repairs/warnings receipt folded into the
              download card's detail line — the only place this info lives
              now that the in-panel stage narration is gone. */}
          {!isBlocked && !hasWarnings && finishSummary && (
            <p data-testid="readiness-finish-summary" className="mt-0.5 text-xs leading-snug opacity-70">
              {finishSummary}
            </p>
          )}
          {issuesToShow.length > 0 && (
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
  const tone = (() => {
    if (!canRetryPackage) {
      return {
        wrap: isBlocked ? 'border-red-200 bg-red-50/80 text-red-800' : 'border-amber-200 bg-amber-50/80 text-amber-800',
        reviewButton: isBlocked ? 'border-red-200 text-red-700' : 'border-amber-200 text-amber-700',
        title: 'Needs attention before export',
        description: 'Automatic finishing ran. Open the remaining issue, then export again.',
      };
    }
    return isBlocked
      ? {
          wrap: 'border-red-200 bg-red-50/80 text-red-800',
          reviewButton: 'border-red-200 text-red-700',
          title: 'Finish package before export',
          description: isZipExport ? 'Repair safe issues and re-check the ZIP.' : 'Repair safe issues and re-check.',
        }
      : {
          wrap: 'border-amber-200 bg-amber-50/80 text-amber-800',
          reviewButton: 'border-amber-200 text-amber-700',
          title: 'Finish package before export',
          description: isZipExport ? 'Retry safe fixes and prepare the ZIP.' : 'Retry safe fixes and prepare export.',
        };
  })();

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
            {finishPackageBusy ? 'Finishing package...' : 'Finish package'}
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
export function QualityStamp({ quality, onOpen }) {
  if (quality?.status !== 'graded') return null;
  const p0 = quality.findingCounts?.p0 || 0;
  const tone =
    (quality.grade === 'A' || quality.grade === 'B') && p0 === 0
      ? 'border-emerald-200 bg-white/70 text-emerald-700'
      : 'border-amber-200 bg-white/70 text-amber-700';
  return (
    <button
      type="button"
      data-testid="quality-stamp"
      onClick={onOpen}
      title={`Deterministic package grade ${quality.score}/100 (${quality.grade}) — click for the full report`}
      aria-label={`Package quality ${quality.score} out of 100, grade ${quality.grade} — open the quality report`}
      className={`inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 font-mono text-[10px] font-bold transition-colors hover:brightness-95 ${tone}`}
    >
      {quality.score} · {quality.grade}
    </button>
  );
}

const QUALITY_SEVERITY_TONES = {
  P0: 'bg-rose-100 text-rose-700',
  P1: 'bg-amber-100 text-amber-700',
  P2: 'bg-slate-100 text-slate-600',
};

function QualityReportModal({ quality, onClose }) {
  if (!quality || quality.status !== 'graded') return null;
  const dimensions = Object.entries(quality.dimensions || {});
  const findings = Array.isArray(quality.findings) ? quality.findings : [];
  const counts = quality.findingCounts || {};
  return (
    <div
      data-testid="quality-report-modal"
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/30 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="bg-white/95 backdrop-blur-lg rounded-lg shadow-2xl border border-slate-200/60 w-full max-w-lg mx-4 max-h-[80vh] flex flex-col animate-in slide-in-from-bottom-4 duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-800">
              Package quality — {quality.score}/100 ({quality.grade})
            </p>
            <p className="text-xs text-slate-400">
              {counts.p0 || 0} P0 · {counts.p1 || 0} P1 · {counts.p2 || 0} P2 · grader v{quality.graderVersion}
              {quality.gradedAt ? ` · ${new Date(quality.gradedAt).toLocaleString()}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close quality report"
            className="ml-3 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4 space-y-4">
          <div>
            <p className="text-xs font-semibold text-slate-500 mb-1.5">Dimension scores</p>
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
  );
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
  onCourseMapExport, // handleDownload from useExport
  onSaveProject, // save full session as .coursemapper
  onReadinessIssueClick,
  onAutoRepairReadiness,
  onFinishPackage,
  canFinishPackage = false,
  packageQualityPass,
  courseGraph = null,
  // v0.14.4 WS-B2: the findings modal can be driven by the workspace header
  // chip — when the parent passes an open-state handler the modal runs in
  // controlled mode; otherwise the panel keeps its own local state.
  qualityModalOpen: qualityModalOpenProp,
  onQualityModalOpenChange = null,
  isPackageGenerationRunning = false,
  preferPackageScope = false,
  getPipelineState = null, // v0.12.1: () => manifest pipeline block, read at export time
  getQualityContext = null, // v0.14.3: () => { budget, digest } — the ZIP grade's honesty source
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
  const { courseMap, columns, selectedFeatures, slideTheme } = useCourse();
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
  // v0.14.4 WS-B3: "5 safe repairs applied · 1 export warning" — the
  // finish-pass receipt details that exist nowhere else once the in-panel
  // stage narration card is removed (the ribbon narrates stages, not these).
  const finishSummary = useMemo(() => {
    if (!isPackageReady(packageQualityPass)) return '';
    const repairs = Number(packageQualityPass?.repairsApplied) || 0;
    const exportWarnings = Number(packageQualityPass?.receipt?.exportWarningCount) || 0;
    const parts = [];
    if (repairs > 0) parts.push(`${repairs} safe repair${repairs === 1 ? '' : 's'} applied`);
    if (exportWarnings > 0) parts.push(`${exportWarnings} export warning${exportWarnings === 1 ? '' : 's'}`);
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
        },
        { includeClassroomReadiness: true, blockOnClassroomWarnings: false },
      ),
    [columns, courseMap, deliverables, effectiveLessonFilter, selectedFeatures],
  );
  const currentReadiness = useMemo(
    () =>
      evaluateStrictReadiness({
        courseMap,
        deliverables,
        selectedFeatures: [activeTab],
        columns,
        lessonFilter: null,
      }),
    [activeTab, columns, courseMap, deliverables],
  );
  const activeReadiness = scope === 'all' ? workspaceReadiness : currentReadiness;
  const zipPendingReadiness = pendingReadinessExport?.format === 'zip';
  const displayedReadiness =
    pendingReadinessExport?.scope === scope ? pendingReadinessExport.readiness : getDownloadReadiness(activeReadiness);
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
    !readinessRepairAttempts.has(readinessIssueSignature);
  const showReadinessFinalizing =
    canAutoRepairReadiness || autoRepairingReadiness || isPackageWorkflowRunning || finishPackageBusy;

  useEffect(() => {
    if (!pendingReadinessExport) return;
    if (pendingReadinessExport.scope === scope && (activeReadiness?.blockers?.length || 0) === 0) {
      setPendingReadinessExport(null);
      setLastNotice('');
      return;
    }
    readinessConfirmRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [activeReadiness, pendingReadinessExport, scope]);

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
    let repairsApplied = pendingExport?.repairsApplied || 0;
    let finishOutcome = null;

    if (exportScope === 'all' && typeof onFinishPackage === 'function') {
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
    } else if (typeof onAutoRepairReadiness === 'function') {
      const repairResult = onAutoRepairReadiness({
        selectedFeatureIds: getExportFeatureIds(exportScope),
        lessonFilter: exportScope === 'all' ? effectiveLessonFilter : null,
      });
      repairsApplied += repairResult?.applied || 0;
      exportCourseMap = repairResult?.courseMap || exportCourseMap;
      exportDeliverables = repairResult?.deliverables || exportDeliverables;
      exportReadiness = getReadinessSnapshot({ exportCourseMap, exportDeliverables, exportScope });
    }

    if (hasBlockingReadinessIssues(exportReadiness)) {
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

    const downloadReadiness = getDownloadReadiness(exportReadiness);
    setPendingReadinessExport(null);
    setLastNotice(
      repairsApplied > 0
        ? `Auto-fixed ${repairsApplied} safe issue${repairsApplied === 1 ? '' : 's'} before export.`
        : '',
    );
    // For Google exports we must open a tab BEFORE any await (popup blocker)
    // Course map exports open their own tab internally via useExport → saveToGoogleDocs/Sheets
    const needsTab = (format === 'gdocs' || format === 'gsheets' || format === 'gslides') && activeTab !== 'courseMap';
    const preTab = needsTab ? openTabNow() : null;

    setBusy(format);
    setLastError('');
    setLastOk('');
    try {
      if (exportScope === 'all') {
        // All mode: only ZIP is available
        if (format === 'zip') {
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
            quality: typeof getQualityContext === 'function' ? { ...(getQualityContext() || {}) } : {},
          });
          setLastOk(`ZIP downloaded with ${zipResult.files.length} file${zipResult.files.length === 1 ? '' : 's'}.`);
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
  const zipPendingNeedsAttention = zipPendingReadiness && pendingReadinessExport?.canFinishPackageAgain === false;
  const zipCanFinishPackage =
    scope === 'all' && activeHasReadinessIssues && canFinishPackage && !zipPendingNeedsAttention;
  const zipButtonLabel = finishPackageBusy
    ? 'Finishing package'
    : zipCanFinishPackage
      ? 'Finish package'
      : zipPendingNeedsAttention
        ? 'Needs attention'
        : zipPendingReadiness
          ? 'Finish package'
          : 'Download ZIP';
  // The ZIP button's guards, hoisted so the header CTA's request shares them.
  const zipDownloadDisabled =
    !!busy ||
    isPackageQualityRunning ||
    finishPackageBusy ||
    (zipPendingReadiness && !canFinishPackage) ||
    zipPendingNeedsAttention ||
    allReadyCount === 0 ||
    !courseMap ||
    (selectedLessons !== null && selectedLessons.length === 0);
  // Export ownership stays in the side panel. The header/overview can still
  // request a ZIP through the event bridge, but they should not hide this
  // canonical package action.
  const headerOwnsZipCta = false;

  // v0.14.7 WS-F1: the workspace header's Download ZIP routes HERE — one
  // export executor. The ref keeps the listener bound once while reading the
  // current guards + doExport closure on every request.
  const requestZipDownloadRef = useRef(() => {});
  requestZipDownloadRef.current = () => {
    if (zipDownloadDisabled) return;
    doExport('zip');
  };
  useEffect(() => {
    const onRequestZipDownload = () => requestZipDownloadRef.current();
    window.addEventListener('coursemapper:request-zip-download', onRequestZipDownload);
    return () => window.removeEventListener('coursemapper:request-zip-download', onRequestZipDownload);
  }, []);

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
            <p className="text-xs font-bold text-slate-800">Finish package</p>
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
                {allReadyCount} material{allReadyCount !== 1 ? 's' : ''}
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
            quality={packageQualityPass?.quality || null}
            onOpenQuality={() => setQualityModalOpen(true)}
            finishSummary={finishSummary}
            packageReceipt={packageQualityPass?.receipt || null}
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
                  All {allLessons.length} lessons · Edit
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

            {!headerOwnsZipCta && (
              <div>
                <p className="text-xs font-semibold text-slate-500 mb-1.5">Package ZIP</p>
                <button
                  data-testid="export-download-zip"
                  onClick={() => doExport('zip')}
                  disabled={zipDownloadDisabled}
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
              </div>
            )}

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
                fmt={{ id: 'pptx', label: '.pptx', color: 'pptx' }}
                disabled={isPackageQualityRunning || isDisabled('pptx')}
                busy={busy === 'pptx'}
                onClick={() => doExport('pptx')}
              />
              <FmtBtn
                fmt={{ id: 'slidepdf', label: '.pdf', color: 'slidepdf' }}
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
            className="text-xs font-semibold text-emerald-600 bg-emerald-50 rounded-lg px-2 py-1.5 animate-spring-in"
          >
            ✓ {lastOk}
          </p>
        )}
        {lastError && (
          <p
            data-testid="export-error"
            className="text-xs font-semibold text-red-500 bg-red-50 rounded-lg px-2 py-1.5 animate-spring-in"
          >
            ✗ {lastError}
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
