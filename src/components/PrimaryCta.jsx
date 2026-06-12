/**
 * PrimaryCta — v0.14.7 WS-F1: the morphing header CTA. One verb.
 *
 * The workspace header carries exactly ONE primary action, driven by the
 * pipeline machine's ribbon model:
 *
 *   running                  → "Building…" (disabled — the ribbon narrates)
 *   ready + reviews pending  → "Review N" (opens the review queue)
 *   ready + clear + package  → "Download ZIP" (routes to the export panel's
 *                              doExport('zip') via a window event — the panel
 *                              stays the ONE export executor)
 *   anything else            → nothing (the pre-generation header stays as-is)
 *
 * Finish package and Save .coursemapper demote into the More disclosure —
 * still real buttons, still keyboard-reachable, no longer competing verbs.
 */
import React, { useEffect, useRef, useState } from 'react';

// The dark primary style the standalone Finish package button carried —
// Download ZIP and the disabled Building… state inherit it unchanged.
const PRIMARY_DARK =
  'tactile inline-flex items-center gap-2 rounded-md bg-slate-950 px-3.5 py-2 text-xs font-bold text-white shadow-sm transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200 dark:disabled:bg-slate-800 dark:disabled:text-slate-500';

const MENU_ITEM =
  'flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40';

function Spinner() {
  return (
    <svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

export default function PrimaryCta({
  ribbonModel,
  reviewCount = 0,
  canDownload = false,
  onDownload,
  onReview,
  onFinishPackage,
  finishPackageDisabled = false,
  finishPackageTitle = '',
  finishRunning = false,
  onSaveProject,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  // Close on outside click — the UserMenu house pattern.
  useEffect(() => {
    if (!menuOpen) return undefined;
    const onMouseDown = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [menuOpen]);

  const running = Boolean(ribbonModel?.running);
  const ready = !running && ribbonModel?.stage === 'ready';
  const state = running ? 'building' : ready && reviewCount > 0 ? 'review' : ready && canDownload ? 'download' : null;
  // No package yet (fresh/restored-idle workspace) or blocked with nothing to
  // review — the header shows no verb; the export panel keeps full controls.
  if (!state) return null;

  return (
    <div className="relative flex items-center gap-2" ref={menuRef}>
      {state === 'building' && (
        <button type="button" data-testid="primary-cta" disabled className={PRIMARY_DARK}>
          <Spinner />
          Building…
        </button>
      )}
      {state === 'review' && (
        <button
          type="button"
          data-testid="primary-cta"
          onClick={onReview}
          title="Open the review queue"
          className="tactile inline-flex items-center gap-2 rounded-md bg-indigo-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm transition-colors hover:bg-indigo-700"
        >
          Review {reviewCount}
        </button>
      )}
      {state === 'download' && (
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
      )}

      <button
        type="button"
        data-testid="primary-cta-more"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((open) => !open)}
        className="tactile flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-50 dark:hover:border-slate-600"
      >
        More
        <svg
          className={`h-3.5 w-3.5 transition-transform ${menuOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m19 9-7 7-7-7" />
        </svg>
      </button>

      {menuOpen && (
        <div
          role="menu"
          data-testid="primary-cta-menu"
          className="absolute right-0 top-full z-30 mt-2 w-56 overflow-hidden rounded-lg border border-slate-200 bg-white p-1.5 shadow-xl shadow-slate-950/10"
        >
          <button
            type="button"
            role="menuitem"
            data-testid="workspace-finish-package"
            onClick={() => {
              setMenuOpen(false);
              onFinishPackage?.();
            }}
            disabled={finishPackageDisabled}
            title={finishPackageTitle}
            className={MENU_ITEM}
          >
            {finishRunning ? 'Finishing' : 'Finish package'}
          </button>
          <button
            type="button"
            role="menuitem"
            data-testid="primary-cta-save-project"
            onClick={() => {
              setMenuOpen(false);
              onSaveProject?.();
            }}
            className={MENU_ITEM}
          >
            Save .coursemapper
          </button>
        </div>
      )}
    </div>
  );
}
