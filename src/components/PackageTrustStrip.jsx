/**
 * PackageTrustStrip — v0.8.6 trust surface.
 *
 * Compact package-level provenance chips for the workspace header: how many
 * deliverables were deterministically compiled vs custom/model-generated,
 * safe repairs applied by the last finish run, stale and failed counts.
 * The compiler already tracks all of this — this strip just makes it visible
 * without opening receipts or audit reports.
 */

// Standard deliverables produced by the deterministic blueprint compiler.
// Mirrors BLUEPRINT_COMPILED_FEATURES without importing the compiler bundle.
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
    finishStatus: packageQualityPass?.status || 'idle',
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
  if (trust.done === 0 && trust.failed === 0) return null;

  return (
    <span
      data-testid="package-trust-strip"
      className="inline-flex min-w-0 flex-wrap items-center gap-1.5"
      aria-label="Package trust summary"
    >
      {trust.compiled > 0 && (
        <Chip
          tone="emerald"
          testId="trust-chip-compiled"
          title="Deterministically compiled from your course blueprint — repeatable and reviewable, no model improvisation"
        >
          {trust.compiled} compiled
        </Chip>
      )}
      {trust.custom > 0 && (
        <Chip tone="slate" testId="trust-chip-custom" title="Custom deliverables outside the standard compiled set">
          {trust.custom} custom
        </Chip>
      )}
      {trust.repairsApplied > 0 && (
        <Chip
          tone="slate"
          testId="trust-chip-repairs"
          title="Safe deterministic repairs applied by the last finish-package run"
        >
          {trust.repairsApplied} auto-fixed
        </Chip>
      )}
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
