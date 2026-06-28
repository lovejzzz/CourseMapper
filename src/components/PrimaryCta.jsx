/**
 * PrimaryCta — v0.14.7 WS-F1: the morphing header CTA. One verb.
 *
 * The workspace header carries exactly ONE primary action, driven by the
 * pipeline machine's ribbon model:
 *
 *   running                  → "Building…" (disabled — the ribbon narrates)
 *   ready + package          → "Download ZIP" (routes to the export panel's
 *                              doExport('zip') via a window event — the panel
 *                              stays the ONE export executor)
 *   ready + reviews pending  → "Review N" only when the package is not yet
 *                              downloadable
 *   anything else            → nothing (the pre-generation header stays as-is)
 *
 * v0.15.88 calm pass: this component no longer carries its own More menu, and
 * the workspace disclosure is project/file-only. Package export stays here/the
 * export panel; material creation and edit history stay with their own rows.
 */
import React from 'react';

// The dark primary style the standalone Finish package button carried —
// Download ZIP and the disabled Building… state inherit it unchanged.
const PRIMARY_DARK =
  'tactile inline-flex items-center gap-2 rounded-md bg-slate-950 px-3.5 py-2 text-xs font-bold text-white shadow-sm transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200 dark:disabled:bg-slate-800 dark:disabled:text-slate-500';

function Spinner() {
  return (
    <svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

export default function PrimaryCta({ ribbonModel, reviewCount = 0, canDownload = false, onDownload, onReview }) {
  const running = Boolean(ribbonModel?.running);
  const ready = !running && ribbonModel?.stage === 'ready';
  const state = running ? 'building' : ready && canDownload ? 'download' : ready && reviewCount > 0 ? 'review' : null;
  // No package yet (fresh/restored-idle workspace) or blocked with nothing to
  // review — the header shows no verb; the export panel keeps full controls.
  if (!state) return null;

  if (state === 'building') {
    return (
      <button type="button" data-testid="primary-cta" disabled className={PRIMARY_DARK}>
        <Spinner />
        Building…
      </button>
    );
  }
  if (state === 'review') {
    return (
      <button
        type="button"
        data-testid="primary-cta"
        onClick={onReview}
        title="Open the review queue"
        className="tactile inline-flex items-center gap-2 rounded-md bg-indigo-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm transition-colors hover:bg-indigo-700"
      >
        Review {reviewCount}
      </button>
    );
  }
  return (
    <button
      type="button"
      data-testid="primary-cta"
      onClick={onDownload}
      title="Download the finished package as a ZIP"
      className={PRIMARY_DARK}
    >
      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
        />
      </svg>
      Download ZIP
    </button>
  );
}
