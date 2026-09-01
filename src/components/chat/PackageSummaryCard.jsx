import React from 'react';

const TONES = {
  excellent: {
    wrapper: 'border-emerald-200/70 bg-emerald-50/70',
    icon: 'bg-emerald-100 text-emerald-600',
    title: 'text-emerald-800',
    badge: 'border-emerald-200 bg-emerald-100/80 text-emerald-700',
    body: 'text-emerald-700',
  },
  assumptions: {
    wrapper: 'border-amber-200/70 bg-amber-50/70',
    icon: 'bg-amber-100 text-amber-600',
    title: 'text-amber-900',
    badge: 'border-amber-200 bg-amber-100/80 text-amber-800',
    body: 'text-amber-800',
  },
  notes: {
    wrapper: 'border-sky-200/70 bg-sky-50/70 dark:border-sky-800/60 dark:bg-sky-950/30',
    icon: 'bg-sky-100 text-sky-600 dark:bg-sky-900/70 dark:text-sky-200',
    title: 'text-sky-900 dark:text-sky-100',
    badge: 'border-sky-200 bg-sky-100/80 text-sky-800 dark:border-sky-700 dark:bg-sky-900/70 dark:text-sky-100',
    body: 'text-sky-800 dark:text-sky-200',
  },
};

function PackageIcon({ ready, notes = false }) {
  if (ready) {
    return (
      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.4} d="m5 13 4 4L19 7" />
      </svg>
    );
  }
  if (notes) {
    return (
      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2.2}
          d="M8 6h8M8 10h8m-8 4h5m-7 6h12a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2Z"
        />
      </svg>
    );
  }
  return (
    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2.2}
        d="M12 9v4m0 4h.01M4.93 19h14.14c1.54 0 2.5-1.67 1.73-3L13.73 4a2 2 0 00-3.46 0L3.2 16c-.77 1.33.19 3 1.73 3z"
      />
    </svg>
  );
}

export default function PackageSummaryCard({ summary, embedded = false }) {
  const [expanded, setExpanded] = React.useState(false);
  // Blocked package diagnostics already live in Review, Evidence, and the
  // export panel. Repeating the full issue ledger in chat turns the Agent into
  // a warning dashboard instead of a direct, Codex-like collaborator.
  if (!summary || (!summary.ready && !summary.downloadable)) return null;

  const hasNonBlockingNotes = summary.downloadable && !summary.ready;
  const tone = hasNonBlockingNotes ? TONES.notes : TONES[summary.tone] || TONES.assumptions;
  const outcomeTitle = summary.ready ? 'Ready to download' : 'Package notes';
  const badgeText = summary.ready ? 'Done' : 'Notes saved';
  const repairText =
    summary.repairsApplied > 0
      ? `${summary.repairsApplied} safe repair pass${summary.repairsApplied === 1 ? '' : 'es'} applied`
      : 'No automatic repairs needed';
  const issueText =
    summary.blockerCount > 0
      ? `${summary.blockerCount} issue${summary.blockerCount === 1 ? '' : 's'} to fix`
      : summary.warningCount > 0
        ? `${summary.warningCount} review note${summary.warningCount === 1 ? '' : 's'}`
        : 'No issues to fix';
  const exportText =
    summary.exportChecked > 0
      ? summary.exportFailed > 0
        ? `${summary.exportFailed} export issue${summary.exportFailed === 1 ? '' : 's'}`
        : summary.exportWarningCount > 0
          ? `${summary.exportWarningCount} export note${summary.exportWarningCount === 1 ? '' : 's'}`
          : 'Exports verified'
      : null;
  const classroomText =
    summary.classroomBlockerCount > 0
      ? `${summary.classroomBlockerCount} classroom issue${summary.classroomBlockerCount === 1 ? '' : 's'}`
      : summary.classroomWarningCount > 0
        ? `${summary.classroomWarningCount} classroom issue${summary.classroomWarningCount === 1 ? '' : 's'}`
        : summary.classroomStatus
          ? 'Classroom checks passed'
          : null;
  const spendText =
    typeof summary.apiSpendSummary === 'string' ? summary.apiSpendSummary : summary.apiSpendSummary?.label || '';
  const compilerSummary = summary.compilerSummary || null;
  const repairEvidenceText = summary.repairSummary && summary.repairSummary !== 'none' ? summary.repairSummary : '';
  const reviewRecommendation = summary.reviewRecommendation || '';
  const reviewActions = Array.isArray(summary.reviewActions)
    ? summary.reviewActions.filter((item) => item?.label && item?.action).slice(0, 5)
    : [];
  const statusText = summary.ready
    ? `${summary.checkedSections || 'All selected'} materials checked — download anytime.`
    : 'Review notes are saved in the package report before publishing.';
  const reviewText = summary.ready
    ? 'Before class, confirm dates, policies, and official readings.'
    : reviewRecommendation;
  const primaryChips = [
    summary.repairsApplied > 0 ? repairText : null,
    summary.blockerCount > 0 || summary.warningCount > 0 ? issueText : null,
    summary.exportFailed > 0 || summary.exportWarningCount > 0 || summary.ready ? exportText : null,
  ].filter(Boolean);
  // v0.14.6 calm pass: details list only what the chips above DON'T already
  // say. The full receipt (trust boundary, per-feature cost drivers) lives in
  // the run digest and the quality report — repeating it here built the
  // "wall of receipts" the ready state drowned in.
  const detailChips = [
    summary.classroomBlockerCount > 0 || summary.classroomWarningCount > 0 ? classroomText : null,
    summary.lessonCount ? `${summary.lessonCount} lessons` : null,
    spendText,
    compilerSummary?.label,
  ].filter(Boolean);
  const hasDetails =
    detailChips.length > 0 ||
    Boolean(repairEvidenceText && summary.repairsApplied > 0) ||
    Boolean(reviewText) ||
    reviewActions.length > 0 ||
    summary.topIssues?.length > 0;
  return (
    <div
      data-testid="package-summary-card"
      className={`${embedded ? '' : 'ml-8 mr-1'} rounded-lg border ${tone.wrapper} shadow-sm animate-spring-in overflow-hidden`}
    >
      <div className="px-3 py-2.5">
        <div className="flex items-start gap-2.5">
          <div className={`mt-0.5 flex h-6 w-6 items-center justify-center rounded-full ${tone.icon}`}>
            <PackageIcon ready={summary.ready} notes={hasNonBlockingNotes} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className={`text-[12px] font-semibold ${tone.title}`}>{outcomeTitle}</p>
              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${tone.badge}`}>{badgeText}</span>
            </div>
            <p className={`mt-1 text-[11px] leading-relaxed ${tone.body}`}>{statusText}</p>
            <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] font-medium">
              {primaryChips.map((chip) => (
                <span key={chip} className="rounded-full bg-white/60 px-2 py-0.5 text-slate-600">
                  {chip}
                </span>
              ))}
            </div>
            {hasDetails && (
              <button
                type="button"
                onClick={() => setExpanded((value) => !value)}
                className="tactile mt-2 rounded-md px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 hover:bg-white/70 hover:text-slate-700"
                aria-expanded={expanded}
              >
                {expanded ? 'Hide notes' : summary.ready ? 'Details' : 'Show notes'}
              </button>
            )}
            {expanded && detailChips.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] font-medium">
                {detailChips.map((chip) => (
                  <span key={chip} className="rounded-full bg-white/60 px-2 py-0.5 text-slate-600">
                    {chip}
                  </span>
                ))}
              </div>
            )}
            {expanded && repairEvidenceText && summary.repairsApplied > 0 && (
              <p className="mt-1 text-[10px] font-medium leading-snug text-slate-500">
                Fields adjusted in those passes: {repairEvidenceText}
              </p>
            )}
            {expanded && reviewText && (
              <p className="mt-1 text-[10px] font-medium leading-snug text-slate-500">{reviewText}</p>
            )}
            {expanded && reviewActions.length > 0 && (
              <div data-testid="package-review-actions" className="mt-2 space-y-1">
                {reviewActions.map((item, index) => (
                  <div
                    key={`${item.label}-${index}`}
                    className="rounded-md bg-white/55 px-2 py-1 text-[10px] text-slate-600"
                  >
                    <span className="font-semibold text-slate-700">{item.label}: </span>
                    {item.action}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
