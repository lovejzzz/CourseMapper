/**
 * PackageTrustStrip — v0.8.6 trust surface, slimmed to ALERTS in v0.14.9 B3.
 *
 * The crown is status, not receipts: "N compiled", "N custom", "N auto-fixed",
 * and "N cited sources" are provenance facts that already live in the digest,
 * the finish receipt, and QUALITY_REPORT.md — they no longer occupy the
 * header. What remains here is only what needs ATTENTION right now: stale
 * deliverables (resync) and failed generations (retry). A calm package
 * renders nothing.
 *
 * summarizePackageTrust still computes the full provenance summary — receipt
 * surfaces consume it; this component just stopped wearing it.
 */

// Standard deliverables produced by the deterministic blueprint compiler.
// Mirrors BLUEPRINT_COMPILED_FEATURES without importing the compiler bundle.
import { finishStatusOf } from '../lib/pipelineMachine';

const COMPILED_FEATURE_IDS = new Set([
  'syllabus',
  'lessonPlans',
  'slideDecks',
  'rubrics',
  'assignments',
  'discussions',
  'quizBank',
  'studyGuides',
  'courseFaq',
]);

export function summarizePackageTrust({ deliverables = {}, selectedFeatures = [], packageQualityPass = null } = {}) {
  const featureIds = selectedFeatures.filter((id) => id && id !== 'courseMap');
  let compiled = 0;
  let custom = 0;
  let failed = 0;
  let stale = 0;
  let done = 0;
  for (const featureId of featureIds) {
    const entry = deliverables[featureId];
    if (!entry) continue;
    if (entry.status === 'error') {
      failed += 1;
      continue;
    }
    if (entry.status !== 'done') continue;
    done += 1;
    if (entry.stale) stale += 1;
    if (COMPILED_FEATURE_IDS.has(featureId)) compiled += 1;
    else custom += 1;
  }
  return {
    done,
    compiled,
    custom,
    failed,
    stale,
    repairsApplied: Number(packageQualityPass?.repairsApplied) || 0,
    finishStatus: finishStatusOf(packageQualityPass),
  };
}

function Chip({ tone = 'slate', title, testId, children }) {
  const tones = {
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    amber: 'border-amber-200 bg-amber-50 text-amber-700',
    rose: 'border-rose-200 bg-rose-50 text-rose-700',
    slate: 'border-slate-200 bg-slate-50 text-slate-600',
  };
  return (
    <span
      data-testid={testId}
      title={title}
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${tones[tone] || tones.slate}`}
    >
      {children}
    </span>
  );
}

export default function PackageTrustStrip({ deliverables, selectedFeatures, packageQualityPass }) {
  const trust = summarizePackageTrust({ deliverables, selectedFeatures, packageQualityPass });
  if (trust.stale === 0 && trust.failed === 0) return null;

  return (
    <span
      data-testid="package-trust-strip"
      className="inline-flex min-w-0 flex-wrap items-center gap-1.5"
      aria-label="Package attention summary"
    >
      {trust.stale > 0 && (
        <Chip tone="amber" testId="trust-chip-stale" title="Affected by course-map edits — resync to update">
          {trust.stale} stale
        </Chip>
      )}
      {trust.failed > 0 && (
        <Chip tone="rose" testId="trust-chip-failed" title="Generation failed — retry from the deliverable tab">
          {trust.failed} failed
        </Chip>
      )}
    </span>
  );
}
