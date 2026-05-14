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
  blocked: {
    wrapper: 'border-red-200/70 bg-red-50/70',
    icon: 'bg-red-100 text-red-600',
    title: 'text-red-800',
    badge: 'border-red-200 bg-red-100/80 text-red-700',
    body: 'text-red-700',
  },
};

function PackageIcon({ ready }) {
  if (ready) {
    return (
      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.4} d="m5 13 4 4L19 7" />
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

export default function PackageSummaryCard({ summary }) {
  if (!summary) return null;

  const tone = TONES[summary.tone] || TONES.assumptions;
  const repairText =
    summary.repairsApplied > 0
      ? `${summary.repairsApplied} safe repair${summary.repairsApplied === 1 ? '' : 's'} applied`
      : 'No automatic repairs needed';
  const issueText =
    summary.blockerCount > 0
      ? `${summary.blockerCount} blocker${summary.blockerCount === 1 ? '' : 's'} remaining`
      : summary.warningCount > 0
        ? `${summary.warningCount} assumption${summary.warningCount === 1 ? '' : 's'} to review`
        : 'No readiness blockers';

  return (
    <div className={`ml-8 mr-1 rounded-lg border ${tone.wrapper} shadow-sm animate-spring-in overflow-hidden`}>
      <div className="px-3 py-2.5">
        <div className="flex items-start gap-2.5">
          <div className={`mt-0.5 flex h-6 w-6 items-center justify-center rounded-full ${tone.icon}`}>
            <PackageIcon ready={summary.ready} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className={`text-[12px] font-semibold ${tone.title}`}>Package readiness</p>
              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${tone.badge}`}>
                {summary.confidence}
              </span>
            </div>
            <p className={`mt-1 text-[11px] leading-relaxed ${tone.body}`}>{summary.nextAction}</p>
            <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] font-medium">
              <span className="rounded-full bg-white/60 px-2 py-0.5 text-slate-600">{repairText}</span>
              <span className="rounded-full bg-white/60 px-2 py-0.5 text-slate-600">{issueText}</span>
              {summary.checkedSections && (
                <span className="rounded-full bg-white/60 px-2 py-0.5 text-slate-600">
                  {summary.checkedSections} sections checked
                </span>
              )}
              {summary.lessonCount && (
                <span className="rounded-full bg-white/60 px-2 py-0.5 text-slate-600">
                  {summary.lessonCount} lessons
                </span>
              )}
            </div>
          </div>
        </div>

        {summary.topIssues?.length > 0 && (
          <div className="mt-2 border-t border-white/70 pt-2">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
              Agent attention list
            </p>
            <div className="space-y-1">
              {summary.topIssues.map((issue, index) => (
                <div key={`${issue.label}-${index}`} className="flex gap-2 text-[11px] leading-snug text-slate-600">
                  <span
                    className={`mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full ${
                      issue.severity === 'error' ? 'bg-red-500' : 'bg-amber-500'
                    }`}
                    aria-hidden="true"
                  />
                  <span>
                    <span className="font-semibold text-slate-700">{issue.label}: </span>
                    {issue.message}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
