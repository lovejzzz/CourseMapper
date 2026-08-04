/**
 * PrimaryCta — v0.14.7 WS-F1: the morphing header CTA. One verb.
 *
 * The workspace header carries exactly ONE primary action, driven by the
 * pipeline machine's ribbon model:
 *
 *   running                  → nothing (the ribbon is the sole narrator)
 *   ready + reviews pending  → "Review N" only when the package is not yet
 *                              downloadable
 *   anything else            → nothing (the pre-generation header stays as-is)
 *
 * v0.16.34: downloadable packages no longer grow a second ZIP action here.
 * Export belongs to the export panel; this header surface only narrates an
 * active build or opens a blocking review queue.
 */
import React from 'react';

export default function PrimaryCta({ ribbonModel, reviewCount = 0, canDownload = false, onReview }) {
  const running = Boolean(ribbonModel?.running);
  const ready = !running && ribbonModel?.stage === 'ready';
  const state = ready && !canDownload && reviewCount > 0 ? 'review' : null;
  // No package yet (fresh/restored-idle workspace) or blocked with nothing to
  // review — the header shows no verb; the export panel keeps full controls.
  if (!state) return null;

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
  return null;
}
