export default function AgentQualityControl({ quality, trustStatus, onOpen }) {
  if (!quality) return null;

  const tone = trustStatus?.blocked
    ? 'border-red-200 bg-red-50 text-red-700'
    : trustStatus?.clean
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : 'border-amber-200 bg-amber-50 text-amber-700';
  const scoreLabel = Number.isFinite(quality.readiness?.score)
    ? `Evidence ${quality.readiness.score}/${quality.readiness.maxScore || 100}`
    : `Conformance ${quality.score} · ${quality.grade}`;

  return (
    <div
      data-testid="agent-quality-control"
      className="mb-2 flex min-h-10 items-center justify-between gap-3 rounded-xl border border-slate-200/70 bg-white/86 px-3 shadow-sm"
    >
      <span className="text-[11px] font-semibold text-slate-500">Agent quality report</span>
      <button
        type="button"
        data-testid="agent-quality-score"
        onClick={onOpen}
        className={`inline-flex min-h-8 items-center rounded-full border px-2.5 text-[10px] font-bold transition-colors hover:brightness-95 ${tone}`}
        aria-label="Open the honest package quality score, reasons, and improvement actions"
      >
        {scoreLabel}
      </button>
    </div>
  );
}
