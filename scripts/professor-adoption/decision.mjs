function severityRank(severity) {
  return severity === 'P0' ? 0 : severity === 'P1' ? 1 : severity === 'P2' ? 2 : 3;
}

function actionTypeForFinding(finding = {}) {
  if (finding.failureClass === 'unsupported-approval-claim') return 'repair-claims';
  if (finding.failureClass === 'source-access-failed') return 'blocked-source-access';
  if (/^source-/.test(finding.failureClass || '') || finding.artifact === 'source manifest') {
    return 'repair-source-manifest';
  }
  return 'repair-code';
}

function groupFindings(results = []) {
  const grouped = new Map();
  for (const result of results) {
    for (const finding of result.findings || []) {
      if (finding.severity === 'P3') continue;
      const key = finding.requiredRepairAction || `${finding.dimension}:${finding.failureClass}`;
      const current = grouped.get(key) || {
        id: key,
        priority: finding.severity || 'P2',
        type: actionTypeForFinding(finding),
        status: 'required',
        targetArea: finding.suspectedOwner || 'compiler',
        affectedCases: [],
        evidence: [],
        acceptanceCriteria: [],
        commands: [],
      };
      if (severityRank(finding.severity) < severityRank(current.priority)) current.priority = finding.severity;
      current.affectedCases.push(result.caseId);
      current.evidence.push({
        caseId: result.caseId,
        dimension: finding.dimension,
        severity: finding.severity,
        message: finding.message,
        evidence: finding.evidence || finding.observedOutput || '',
      });
      for (const criterion of finding.acceptanceCriteria || []) {
        if (criterion && !current.acceptanceCriteria.includes(criterion)) current.acceptanceCriteria.push(criterion);
      }
      for (const command of finding.proofCommands || []) {
        if (command && !current.commands.includes(command)) current.commands.push(command);
      }
      grouped.set(key, current);
    }
  }
  return Array.from(grouped.values())
    .map((action) => ({
      ...action,
      affectedCases: Array.from(new Set(action.affectedCases)).sort(),
      acceptanceCriteria:
        action.acceptanceCriteria.length > 0
          ? action.acceptanceCriteria
          : ['The cited professor-adoption finding no longer appears.'],
      commands:
        action.commands.length > 0
          ? action.commands
          : ['npm run audit:professor-adoption:smoke', 'npm run audit:professor-adoption'],
    }))
    .sort(
      (a, b) => severityRank(a.priority) - severityRank(b.priority) || b.affectedCases.length - a.affectedCases.length,
    );
}

export function buildProfessorAdoptionDecision({ summary = {}, results = [], profile = 'full' } = {}) {
  const required = groupFindings(results);
  const p0Count = required.filter((action) => action.priority === 'P0').length;
  const p1Count = required.filter((action) => action.priority === 'P1').length;
  if (summary.caseCount === 0) {
    return {
      status: 'blocked-source-access',
      nextAction: 'expand-benchmark',
      requiresHumanInterpretation: false,
      rationale: 'No professor-adoption cases were selected.',
      actions: { required: [], tracked: [] },
      stoppingRule: {
        stopRecommended: true,
        nextAction: 'expand-benchmark',
        reason: 'The audit cannot run without source manifests.',
      },
    };
  }
  if (required.length > 0) {
    const top = required[0];
    return {
      status: summary.status,
      nextAction: top.type,
      requiresHumanInterpretation: false,
      rationale:
        p0Count > 0
          ? `The benchmark found ${p0Count} hard-blocking claim/source boundary action(s).`
          : p1Count > 0
            ? `The benchmark found ${p1Count} high-priority professor-adoption gap(s).`
            : `The benchmark found ${required.length} repair action(s) before ${profile} can be treated as green.`,
      actions: {
        required,
        tracked:
          profile === 'smoke'
            ? [
                {
                  id: 'expand-smoke-to-full-manifest-run',
                  priority: 'P3',
                  type: 'expand-benchmark',
                  status: 'tracked',
                  targetArea: 'coverage',
                  affectedCases: [],
                  acceptanceCriteria: ['Run `npm run audit:professor-adoption` against the full manifest pack.'],
                  commands: ['npm run audit:professor-adoption'],
                },
              ]
            : [],
      },
      stoppingRule: {
        stopRecommended: false,
        nextAction: top.type,
        reason: `Required autonomous action remains: ${top.id}.`,
      },
    };
  }
  return {
    status: 'pass',
    nextAction: profile === 'smoke' ? 'rerun-full' : 'no-action',
    requiresHumanInterpretation: false,
    rationale:
      profile === 'smoke'
        ? 'The smoke professor-adoption cases passed; expand to the full manifest run.'
        : 'All selected public-source professor-adoption cases passed deterministic scoring.',
    actions: {
      required: [],
      tracked:
        profile === 'smoke'
          ? [
              {
                id: 'expand-smoke-to-full-manifest-run',
                priority: 'P3',
                type: 'expand-benchmark',
                status: 'tracked',
                targetArea: 'coverage',
                affectedCases: [],
                acceptanceCriteria: ['Run `npm run audit:professor-adoption` against the full manifest pack.'],
                commands: ['npm run audit:professor-adoption'],
              },
            ]
          : [],
    },
    stoppingRule: {
      stopRecommended: profile !== 'smoke',
      nextAction: profile === 'smoke' ? 'rerun-full' : 'no-action',
      reason:
        profile === 'smoke'
          ? 'Smoke passed, but full manifest evidence is still needed.'
          : 'No required professor-adoption repair actions remain for selected cases.',
    },
  };
}
