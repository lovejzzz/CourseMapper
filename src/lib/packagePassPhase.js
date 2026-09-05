/**
 * packagePassPhase — v0.14.6: one status, two meanings, split.
 *
 * packageQualityPass.status === 'running' has always covered TWO phases:
 * the whole-pipeline umbrella set at generation start (so export buttons
 * disable and the workspace knows a run is live) and the actual
 * finish/grade pass at the end. Surfaces that narrate the finish pass
 * specifically (build ribbon step checks, the "Grading…" header chip, the
 * "Finishing" button label, the agent panel's "Finishing package" card)
 * were reading the umbrella as "finishing" — green Compile checks during
 * Map, "Grading…" before anything exists.
 *
 * Setters now stamp `phase: 'generation' | 'finish'` next to
 * status:'running'. A missing phase is treated as 'finish' so the existing
 * finalizer states keep their meaning.
 */
export function isFinishPassRunning(packageQualityPass) {
  return packageQualityPass?.status === 'running' && packageQualityPass?.phase !== 'generation';
}

export function isGenerationPhaseRunning(packageQualityPass) {
  return packageQualityPass?.status === 'running' && packageQualityPass?.phase === 'generation';
}
