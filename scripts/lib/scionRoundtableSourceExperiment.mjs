export const SCION_SOURCE_TEACHER_MAX_ATTEMPTS = 3;

export function withholdRejectedCorrection(term = {}) {
  return Object.fromEntries(Object.entries(term).filter(([field]) => field !== 'cx' && field !== 'correction'));
}

export function shouldContinueSourceTeacherDrafting(assessment = {}) {
  if (assessment.eligible) return false;
  return (assessment.issues || []).some((issue) => String(issue).startsWith('correction-'));
}

export function sourceTeacherTargetResolved(entry = {}, assessment = {}) {
  if (!assessment.term || (assessment.issues || []).some((issue) => String(issue).startsWith('parse:'))) return false;
  const remaining = new Set(assessment.issues || []);
  return (entry.originalIssues || []).every((issue) => !remaining.has(issue));
}

const EXPLICIT_CORRECTION_CONTRAST_RE =
  /\b(?:not|rather(?:\s+than)?|instead|unlike|whereas|contrasting|distinct\s+from|only\s+when|depends?\s+on|determined\s+by|cannot|without)\b/i;
const PEDAGOGICAL_TOKEN_STOP = new Set(
  'a an and are as at be been by for from in into is it its of on or the to with'.split(' '),
);

function pedagogicalTokens(value) {
  return (
    String(value || '')
      .toLowerCase()
      .match(/[a-z0-9]+/g) || []
  ).filter((token) => token.length > 2 && !PEDAGOGICAL_TOKEN_STOP.has(token));
}

function longestCommonSubsequenceLength(left, right) {
  const prior = new Array(right.length + 1).fill(0);
  for (const leftToken of left) {
    let diagonal = 0;
    for (let index = 1; index <= right.length; index += 1) {
      const above = prior[index];
      prior[index] = leftToken === right[index - 1] ? diagonal + 1 : Math.max(prior[index], prior[index - 1]);
      diagonal = above;
    }
  }
  return prior[right.length];
}

export function assessSourceTeacherPedagogy(assessment = {}) {
  const term = assessment.term;
  if (!term) return { ...assessment, contractEligible: assessment.eligible === true, pedagogicalIssues: [] };
  const correction = String(term.cx || term.correction || '');
  const misconception = String(term.mi || term.misconception || '');
  const pedagogicalIssues = [];
  if (!EXPLICIT_CORRECTION_CONTRAST_RE.test(correction)) {
    pedagogicalIssues.push('correction-lacks-explicit-contrast');
  }
  const misconceptionTokens = pedagogicalTokens(misconception);
  const correctionTokens = pedagogicalTokens(correction);
  const commonSequence = longestCommonSubsequenceLength(misconceptionTokens, correctionTokens);
  if (misconceptionTokens.length >= 5 && commonSequence >= 4 && commonSequence / misconceptionTokens.length >= 0.5) {
    pedagogicalIssues.push('correction-reuses-misconception-structure');
  }
  const issues = [...new Set([...(assessment.issues || []), ...pedagogicalIssues])];
  return {
    ...assessment,
    contractEligible: assessment.eligible === true,
    pedagogicalIssues,
    eligible: issues.length === 0,
    issues,
  };
}

function pairedAdmission(leftRows, rightRows) {
  return {
    gains: leftRows.filter((left, index) => !left.assessment.eligible && rightRows[index].assessment.eligible).length,
    losses: leftRows.filter((left, index) => left.assessment.eligible && !rightRows[index].assessment.eligible).length,
    tiesAdmitted: leftRows.filter((left, index) => left.assessment.eligible && rightRows[index].assessment.eligible)
      .length,
    tiesRejected: leftRows.filter((left, index) => !left.assessment.eligible && !rightRows[index].assessment.eligible)
      .length,
  };
}

export function summarizeSourceTeacherRows(rows = []) {
  const baselineAdmitted = rows.filter((row) => row.baseline.assessment.eligible).length;
  const advisedAdmitted = rows.filter((row) => row.advised.assessment.eligible).length;
  const matchedControlAdmitted = rows.filter((row) => row.matchedControl?.assessment.eligible).length;
  const originalVerifierIssuesRemoved = rows.filter((row) => row.advised.originalVerifierIssuesRemoved).length;
  const domains = [...new Set(rows.map((row) => row.domain))];
  const byDomain = Object.fromEntries(
    domains.map((domain) => {
      const domainRows = rows.filter((row) => row.domain === domain);
      const baseline = domainRows.filter((row) => row.baseline.assessment.eligible).length;
      const advised = domainRows.filter((row) => row.advised.assessment.eligible).length;
      return [
        domain,
        { cases: domainRows.length, baselineAdmitted: baseline, advisedAdmitted: advised, delta: advised - baseline },
      ];
    }),
  );
  const matchedByDomain = rows.every((row) => row.matchedControl)
    ? Object.fromEntries(
        domains.map((domain) => {
          const domainRows = rows.filter((row) => row.domain === domain);
          const control = domainRows.filter((row) => row.matchedControl.assessment.eligible).length;
          const teacher = domainRows.filter((row) => row.advised.assessment.eligible).length;
          return [
            domain,
            {
              cases: domainRows.length,
              matchedControlAdmitted: control,
              teacherAdmitted: teacher,
              delta: teacher - control,
            },
          ];
        }),
      )
    : null;
  return {
    realSourceBoundCases: rows.length,
    domains,
    baselineAdmitted,
    advisedAdmitted,
    matchedControlAdmitted,
    absoluteGain: advisedAdmitted - baselineAdmitted,
    baselineRate: rows.length ? Math.round((100 * baselineAdmitted) / rows.length) : 0,
    advisedRate: rows.length ? Math.round((100 * advisedAdmitted) / rows.length) : 0,
    originalVerifierIssuesRemoved,
    originalVerifierIssueRemovalRate: rows.length ? Math.round((100 * originalVerifierIssuesRemoved) / rows.length) : 0,
    baselineProviderCalls: rows.length,
    matchedControlProviderCalls: rows.reduce((sum, row) => sum + (row.matchedControl?.attemptCount || 0), 0),
    advisedProviderCalls: rows.reduce((sum, row) => sum + row.advised.attemptCount, 0),
    advisedAttemptHistogram: Object.fromEntries(
      [1, 2, 3].map((count) => [count, rows.filter((row) => row.advised.attemptCount === count).length]),
    ),
    pairedAdmission: pairedAdmission(
      rows.map((row) => row.baseline),
      rows.map((row) => row.advised),
    ),
    matchedTeacherComparison: rows.every((row) => row.matchedControl)
      ? {
          absoluteGain: advisedAdmitted - matchedControlAdmitted,
          firstAttempt: {
            matchedControlAdmitted: rows.filter((row) => row.matchedControl.attempts?.[0]?.assessment.eligible).length,
            teacherAdmitted: rows.filter((row) => row.advised.attempts?.[0]?.assessment.eligible).length,
          },
          pairedAdmission: pairedAdmission(
            rows.map((row) => row.matchedControl),
            rows.map((row) => row.advised),
          ),
          byDomain: matchedByDomain,
        }
      : null,
    safeLearnerRetention: rows.every((row) => row.matchedControl)
      ? {
          admitted: rows.filter((row) => row.advised.assessment.eligible || row.matchedControl.assessment.eligible)
            .length,
          teacherRescues: rows.filter(
            (row) => !row.matchedControl.assessment.eligible && row.advised.assessment.eligible,
          ).length,
          controlRetentions: rows.filter(
            (row) => row.matchedControl.assessment.eligible && !row.advised.assessment.eligible,
          ).length,
          claimBoundary:
            'This is deterministic candidate retention, not additional model learning or evidence that either candidate is factually correct.',
        }
      : null,
    byDomain,
  };
}
