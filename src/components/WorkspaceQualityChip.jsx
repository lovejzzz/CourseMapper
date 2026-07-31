/**
 * WorkspaceQualityChip — v0.14.4 WS-B2: quality to the crown.
 *
 * The package grade's PRIMARY surface, rendered in the workspace header
 * immediately right of the course title cluster. States:
 *
 *   - grading…   (finish/grade pass running — subtle pulse, slate)
 *   - Readiness 62/100 (graded — automated signal with an honest evidence
 *     ceiling of 69; technical conformance remains available in the report)
 *     any P0 landed or the grade is C or below; click opens the full
 *     findings report modal hosted by ExportSidePanel)
 *   - Quality proof unavailable (grading failed — blocked red control that
 *     opens the report, with the reason in its accessible text and tooltip)
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

// Keep the compact desktop seal while giving touch layouts a full 44px target.
const CHIP_BASE =
  'inline-flex min-h-11 shrink-0 items-center gap-1 rounded-full border px-2.5 text-[10px] font-bold sm:min-h-[32px]';

export default function WorkspaceQualityChip({ packageQualityPass, onOpenReport }) {
  const status = finishStatusOf(packageQualityPass);
  const quality = packageQualityPass?.quality || null;
  const trustStatus = getPackageTrustStatus({ packageQualityPass });

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

  if (quality.status !== 'graded' && trustStatus.blocked) {
    const reason = quality.reason || 'unknown reason';
    return (
      <button
        type="button"
        data-testid="workspace-quality-chip-not-graded"
        onClick={onOpenReport}
        aria-label={`Package quality proof unavailable — ${reason}; export paused — open the quality report`}
        title={`Quality proof is unavailable: ${reason}. Export is paused; click to review the report and retry finalization.`}
        className={`${CHIP_BASE} border-red-200 bg-red-50 text-red-700 tactile transition-colors hover:brightness-95`}
      >
        Quality proof unavailable
      </button>
    );
  }

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
  const textureScore = Number.isFinite(quality.texture?.score) ? quality.texture.score : null;
  const readinessScore = Number.isFinite(quality.readiness?.score) ? quality.readiness.score : null;
  const readinessMax = Number.isFinite(quality.readiness?.maxScore) ? quality.readiness.maxScore : 100;
  const readinessCeiling = Number.isFinite(quality.readiness?.evidenceCeiling) ? quality.readiness.evidenceCeiling : 69;
  if (trustStatus.blocked) {
    const refinementItems = Math.max(1, Number(trustStatus.blockerCount) || Number(packageQualityPass?.blockers) || 0);
    const refinementText = `${refinementItems} item${refinementItems === 1 ? '' : 's'} to refine`;
    return (
      <button
        type="button"
        data-testid="workspace-quality-chip"
        onClick={onOpenReport}
        aria-label={`Package quality: export paused for ${refinementText}; ${
          readinessScore !== null
            ? `automated readiness signal ${readinessScore} out of ${readinessMax}`
            : `conformance result ${quality.score} out of 100, grade ${quality.grade}`
        }${p0 > 0 ? `, including ${p0} critical` : ''}${
          textureScore !== null ? `, texture ${textureScore} out of 100` : ''
        } — open the quality report`}
        title={`Export is paused for ${refinementText}. ${
          readinessScore !== null
            ? `Automated readiness is ${readinessScore}/${readinessMax} with a ${readinessCeiling} automated ceiling; package conformance is ${quality.score}/100 (${quality.grade})`
            : `Package conformance is ${quality.score}/100 (${quality.grade})`
        }${p0 > 0 ? ` including ${p0} critical finding${p0 === 1 ? '' : 's'}` : ''}${
          textureScore !== null ? ` · Texture ${textureScore}/100` : ''
        }; click for the quality report and remaining action.`}
        className={`${CHIP_BASE} border-red-200 bg-red-50 text-red-700 tactile transition-colors hover:brightness-95`}
      >
        <span>
          {readinessScore !== null
            ? `Readiness ${readinessScore}/${readinessMax}`
            : `Conformance ${quality.score} · ${quality.grade}`}
        </span>
        {textureScore !== null && (
          <span data-testid="workspace-texture-meter" className="font-semibold text-slate-500 dark:text-slate-400">
            · Texture {textureScore}
          </span>
        )}
      </button>
    );
  }
  const tone = trustStatus.clean
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
    : 'border-amber-200 bg-amber-50 text-amber-700';
  // v0.15.6: the two-number Seal stays visible, but texture now counts
  // lightly in the grade so a heavily templated package cannot still wear
  // "100/A" with no findings.
  return (
    <button
      type="button"
      data-testid="workspace-quality-chip"
      onClick={onOpenReport}
      aria-label={`Package quality: ${
        readinessScore !== null
          ? `automated readiness signal ${readinessScore} out of ${readinessMax}`
          : `conformance ${quality.score} out of 100, grade ${quality.grade}`
      }, ${issues} issue${issues === 1 ? '' : 's'}${p0 > 0 ? ` including ${p0} critical` : ''}${
        textureScore !== null ? `, texture ${textureScore} out of 100` : ''
      } — open the quality report`}
      title={`${
        readinessScore !== null
          ? `Automated readiness ${readinessScore}/${readinessMax} (automated ceiling ${readinessCeiling}) · package conformance ${quality.score}/100 (${quality.grade})`
          : `Package conformance ${quality.score}/100 (${quality.grade})`
      } · ${issues} issue${issues === 1 ? '' : 's'}${
        textureScore !== null
          ? ` · Texture ${textureScore}/100 — style and repetition meter; counted lightly in the grade`
          : ''
      } — click for the full report (also shipped as QUALITY_REPORT.md in the ZIP)`}
      className={`${CHIP_BASE} ${tone} tactile transition-colors hover:brightness-95`}
    >
      {readinessScore !== null ? (
        <>
          <span>
            Readiness {readinessScore}/{readinessMax}
          </span>
          {textureScore !== null && (
            <span data-testid="workspace-texture-meter" className="font-semibold text-slate-500 dark:text-slate-400">
              · Texture {textureScore}
            </span>
          )}
        </>
      ) : (
        <>
          <span>
            Conformance {quality.score} · {quality.grade}
          </span>
          {textureScore !== null && (
            <span data-testid="workspace-texture-meter" className="font-semibold text-slate-500 dark:text-slate-400">
              · Texture {textureScore}
            </span>
          )}
        </>
      )}
    </button>
  );
}
