export default function AgentQualityControl({ quality, trustStatus, onOpen }) {
  if (!quality) return null;

  const hasReadinessScore = Number.isFinite(quality.readiness?.score);
  const grade = typeof quality.grade === 'string' ? quality.grade.trim() : '';
  const hasConformanceScore = Number.isFinite(quality.score) && Boolean(grade);
  const hasGradedScore = quality.status === 'graded' && hasConformanceScore;
  const tone = trustStatus?.blocked
    ? 'border-red-200 bg-red-50 text-red-700'
    : trustStatus?.clean
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : 'border-amber-200 bg-amber-50 text-amber-700';
  const scoreLabel = hasReadinessScore
    ? `Evidence ${quality.readiness.score}/${quality.readiness.maxScore || 100}`
    : `Conformance ${quality.score} · ${grade}`;

  if (!hasGradedScore) {
    const reason = String(quality.reason || '').trim() || 'The quality grader did not return a complete result.';
    return (
      <div
        data-testid="agent-quality-control"
        role="status"
        className="mb-2 flex min-h-12 items-center justify-between gap-3 rounded-xl border border-slate-200/70 bg-white/86 px-3 py-1.5 shadow-sm"
      >
        <span className="min-w-0 text-[11px] text-slate-600">
          <strong className="font-semibold text-slate-700">Agent quality report</strong>
          <span data-testid="agent-quality-reason" className="mt-0.5 block break-words">
            {reason} Run Prepare package again.
          </span>
        </span>
        <span
          data-testid="agent-quality-unavailable"
          className={`inline-flex min-h-8 shrink-0 items-center rounded-full border px-2.5 text-[10px] font-bold ${tone}`}
        >
          Quality unavailable
        </span>
      </div>
    );
  }

  return (
    <div
      data-testid="agent-quality-control"
      className="mb-2 flex min-h-10 items-center justify-between gap-3 rounded-xl border border-slate-200/70 bg-white/86 px-3 shadow-sm"
    >
      <span className="text-[11px] font-semibold text-slate-500">Agent quality report</span>
      <button
        type="button"
        data-testid="agent-quality-score"
        onClick={() => onOpen?.(true)}
        className={`inline-flex min-h-8 items-center rounded-full border px-2.5 text-[10px] font-bold transition-colors hover:brightness-95 ${tone}`}
        aria-label="Open the honest package quality score, reasons, and improvement actions"
      >
        {scoreLabel}
      </button>
    </div>
  );
}
