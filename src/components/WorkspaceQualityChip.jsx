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

import { finishStatusOf } from '../lib/pipelineMachine';
import { countQualityFindings, getPackageTrustStatus } from '../lib/packageTrustStatus';

// Same grade result shape ExportSidePanel's report modal consumes.
function issueCount(quality) {
  return countQualityFindings(quality);
}

// ≥32px click/read target (min-h) while keeping the trust-chip visual scale.
const CHIP_BASE =
  'inline-flex min-h-[32px] shrink-0 items-center gap-1 rounded-full border px-2.5 text-[10px] font-bold';

export default function WorkspaceQualityChip({ packageQualityPass, onOpenReport }) {
  const status = finishStatusOf(packageQualityPass);
  const quality = packageQualityPass?.quality || null;

  // During the generation phase the build ribbon narrates progress and no
  // grading has started — claiming "Grading…" then was a lie the user caught.
  if (status === 'running' && packageQualityPass?.phase === 'generation') return null;

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
  const trustStatus = getPackageTrustStatus({ packageQualityPass });
  const tone = trustStatus.clean
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
    : 'border-amber-200 bg-amber-50 text-amber-700';
  // v0.15.6: the two-number Seal stays visible, but texture now counts
  // lightly in the grade so a heavily templated package cannot still wear
  // "100/A" with no findings.
  const textureScore = Number.isFinite(quality.texture?.score) ? quality.texture.score : null;
  return (
    <button
      type="button"
      data-testid="workspace-quality-chip"
      onClick={onOpenReport}
      aria-label={`Package quality: ${quality.score} out of 100, grade ${quality.grade}, ${issues} issue${
        issues === 1 ? '' : 's'
      }${p0 > 0 ? ` including ${p0} critical` : ''}${
        textureScore !== null ? `, texture ${textureScore} out of 100` : ''
      } — open the quality report`}
      title={`Deterministic package grade ${quality.score}/100 (${quality.grade}) · ${issues} issue${
        issues === 1 ? '' : 's'
      }${
        textureScore !== null
          ? ` · Texture ${textureScore}/100 — style and repetition meter; counted lightly in the grade`
          : ''
      } — click for the full report (also shipped as QUALITY_REPORT.md in the ZIP)`}
      className={`${CHIP_BASE} ${tone} tactile transition-colors hover:brightness-95`}
    >
      {textureScore !== null ? (
        <>
          <span>Quality {quality.score}</span>
          <span data-testid="workspace-texture-meter" className="font-semibold text-slate-500 dark:text-slate-400">
            · Texture {textureScore}
          </span>
        </>
      ) : (
        <span>
          Quality {quality.score} · {quality.grade}
        </span>
      )}
    </button>
  );
}
