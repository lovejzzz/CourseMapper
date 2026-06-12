/**
 * WorkspaceQualityChip — v0.14.4 WS-B2: quality to the crown.
 *
 * The package grade's PRIMARY surface, rendered in the workspace header
 * immediately right of the course title cluster. States:
 *
 *   - grading…   (finish/grade pass running — subtle pulse, slate)
 *   - Quality 100 · A  (graded — emerald for A/B with zero P0s, amber when
 *     any P0 landed or the grade is C or below; click opens the full
 *     findings report modal hosted by ExportSidePanel)
 *   - Not graded (grading skipped/failed — slate, reason in the tooltip)
 *
 * Data source is the SAME packageQualityPass state the export panel reads
 * (AppFlow's finalize pass attaches the grade result as `quality`) — no new
 * plumbing, just the existing value passed to the header JSX.
 */

// Same grade result shape ExportSidePanel's report modal consumes.
function issueCount(quality) {
  if (Number.isFinite(quality?.findingCount)) return quality.findingCount;
  const counts = quality?.findingCounts || {};
  return (counts.p0 || 0) + (counts.p1 || 0) + (counts.p2 || 0);
}

// ≥32px click/read target (min-h) while keeping the trust-chip visual scale.
const CHIP_BASE =
  'inline-flex min-h-[32px] shrink-0 items-center gap-1 rounded-full border px-2.5 text-[10px] font-bold';

export default function WorkspaceQualityChip({ packageQualityPass, onOpenReport }) {
  const status = packageQualityPass?.status || 'idle';
  const quality = packageQualityPass?.quality || null;

  if (status === 'running') {
    return (
      <span
        data-testid="workspace-quality-chip-grading"
        aria-label="Package quality: grading in progress"
        title="The finish-package pass is checking, repairing, and grading the package."
        className={`${CHIP_BASE} animate-pulse border-slate-200 bg-slate-50 text-slate-500`}
      >
        Grading…
      </span>
    );
  }

  if (!quality) return null;

  if (quality.status !== 'graded') {
    const reason = quality.reason || 'unknown reason';
    return (
      <span
        data-testid="workspace-quality-chip-not-graded"
        aria-label={`Package quality: not graded — ${reason}`}
        title={`Quality grading did not run: ${reason}`}
        className={`${CHIP_BASE} border-slate-200 bg-slate-50 text-slate-500`}
      >
        Not graded
      </span>
    );
  }

  const p0 = quality.findingCounts?.p0 || 0;
  const issues = issueCount(quality);
  const healthy = (quality.grade === 'A' || quality.grade === 'B') && p0 === 0;
  const tone = healthy
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
    : 'border-amber-200 bg-amber-50 text-amber-700';
  return (
    <button
      type="button"
      data-testid="workspace-quality-chip"
      onClick={onOpenReport}
      aria-label={`Package quality: ${quality.score} out of 100, grade ${quality.grade}, ${issues} issue${
        issues === 1 ? '' : 's'
      }${p0 > 0 ? ` including ${p0} critical` : ''} — open the quality report`}
      title={`Deterministic package grade ${quality.score}/100 (${quality.grade}) · ${issues} issue${
        issues === 1 ? '' : 's'
      } — click for the full report (also shipped as QUALITY_REPORT.md in the ZIP)`}
      className={`${CHIP_BASE} ${tone} tactile transition-colors hover:brightness-95`}
    >
      Quality {quality.score} · {quality.grade}
    </button>
  );
}
