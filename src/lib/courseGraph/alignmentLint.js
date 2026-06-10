/**
 * courseGraph/alignmentLint.js — v0.13 P6: alignment as structural
 * constraints instead of asserted prose.
 *
 * The deepest content failures in the v0.12 audit were misalignments the
 * prose pipeline could not see (a dosage-calculation lesson whose quiz
 * tested no dosage concept). On the graph these are checkable edges. Lint
 * findings are advisory warnings surfaced in the generation log and the
 * run digest — never blockers.
 */

export function lintCourseGraphAlignment(graph) {
  const findings = [];
  if (!graph || typeof graph !== 'object') return findings;
  const push = (code, message) => findings.push({ code, message, severity: 'warning' });

  const sessions = [...(graph.sessions || [])].sort((a, b) => (a.number || 0) - (b.number || 0));
  const outcomes = graph.outcomes || [];
  const assessments = graph.assessments || [];
  const assessedOutcomeIds = new Set((graph.edges?.assesses || []).map(([, outcomeId]) => outcomeId));
  const outcomesBySession = new Map();
  for (const outcome of outcomes) {
    if (!outcome?.sessionRef) continue;
    outcomesBySession.set(outcome.sessionRef, (outcomesBySession.get(outcome.sessionRef) || 0) + 1);
  }

  // Every session teaches toward at least one outcome.
  for (const session of sessions) {
    if (!outcomesBySession.get(session.id)) {
      push('session-without-outcomes', `${session.title || `Session ${session.number}`} has no learning outcomes.`);
    }
  }

  // Every outcome is assessed by something (QM 3.1 as an edge, not a sentence).
  const unassessed = outcomes.filter((outcome) => !assessedOutcomeIds.has(outcome.id));
  if (unassessed.length > 0) {
    const sample = unassessed[0];
    push(
      'unassessed-outcomes',
      `${unassessed.length} outcome${unassessed.length === 1 ? ' is' : 's are'} never assessed (e.g., "${String(sample.text || '').slice(0, 80)}").`,
    );
  }

  // Assessments never come due before the session that teaches their outcomes.
  const sessionNumberById = new Map(sessions.map((session) => [session.id, session.number]));
  const outcomeSessionNumber = new Map(
    outcomes.map((outcome) => [outcome.id, sessionNumberById.get(outcome.sessionRef) ?? null]),
  );
  for (const [assessmentId, outcomeId] of graph.edges?.assesses || []) {
    const assessment = assessments.find((entry) => entry.id === assessmentId);
    const taughtIn = outcomeSessionNumber.get(outcomeId);
    if (!assessment || !Number.isInteger(assessment.dueSession) || !Number.isInteger(taughtIn)) continue;
    if (assessment.dueSession < taughtIn) {
      push(
        'assessed-before-taught',
        `"${String(assessment.title || '').slice(0, 60)}" is due in session ${assessment.dueSession} but assesses an outcome taught in session ${taughtIn}.`,
      );
    }
  }

  // Declared weights should account for the whole grade.
  const weighted = assessments.filter((assessment) => Number.isFinite(assessment.weightPct));
  if (weighted.length >= 3) {
    const total = weighted.reduce((sum, assessment) => sum + assessment.weightPct, 0);
    if (total < 95 || total > 105) {
      push('weights-do-not-sum', `Declared assessment weights sum to ${Math.round(total)}%, not 100%.`);
    }
  }

  return findings;
}
