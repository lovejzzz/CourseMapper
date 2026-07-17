function clean(value) {
  return String(value ?? '').trim();
}

export function parseScionConsoleEvents(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((line) => {
      const jsonStart = line.indexOf('{');
      if (jsonStart < 0) return null;
      try {
        return JSON.parse(line.slice(jsonStart));
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function increment(target, key, amount = 1) {
  if (!key) return;
  target[key] = (target[key] || 0) + amount;
}

function qualityActions(events) {
  const rows = [];
  for (const event of events) {
    if (event?.label !== 'Scion quality passes') continue;
    for (const detail of clean(event.detail).split(' · ').filter(Boolean)) {
      const match =
        /^(?<pass>[A-Za-z][A-Za-z0-9]*):(?<lessonId>[^ ]+) (?<action>[a-z-]+)(?: \[(?<reason>[^\]]+)\])?$/.exec(detail);
      if (!match?.groups) {
        rows.push({ raw: detail, parsed: false });
        continue;
      }
      rows.push({
        parsed: true,
        pass: match.groups.pass,
        lessonId: match.groups.lessonId,
        action: match.groups.action,
        reasons: clean(match.groups.reason).split(',').map(clean).filter(Boolean),
      });
    }
  }
  return rows;
}

export function summarizeScionCompilerBurden(events, { lessonCount = 0 } = {}) {
  const providerRequests = events.filter((event) => event?.type === 'providerRequestStart');
  const providerResponses = events.filter((event) => event?.type === 'providerResponseDone');
  const providerErrors = events.filter((event) =>
    ['providerRequestError', 'providerError', 'providerResponseError'].includes(event?.type),
  );
  const taskCalls = {};
  for (const event of providerRequests) increment(taskCalls, clean(event.task) || 'unknown');
  const scionCalls = taskCalls.scionPass || 0;
  const instrumentedCalls = events.filter((event) => event?.label === 'Scion pass call');
  const byCallType = {};
  for (const event of instrumentedCalls) increment(byCallType, clean(event.detail) || 'unknown');
  const actions = qualityActions(events);
  const parsedActions = actions.filter((action) => action.parsed);
  const byPass = {};
  const byAction = {};
  const rejectionReasons = {};
  for (const action of parsedActions) {
    increment(byPass, action.pass);
    increment(byAction, action.action);
    if (['rejected', 'failed'].includes(action.action)) {
      for (const reason of action.reasons) increment(rejectionReasons, reason);
    }
  }
  const lessons = Number(lessonCount) || 0;
  const mcItemCalls = Number(byCallType.mc_item) || 0;
  const mcBatchCalls = Number(byCallType.mc_verify_repair_batch) || 0;
  const mcRepairCalls = mcItemCalls + mcBatchCalls;
  const verifiedMcRepairs = parsedActions.filter(
    (action) => action.pass === 'mcVerify' && action.action === 'regenerated',
  ).length;
  return {
    schemaVersion: 1,
    lessonCount: lessons,
    provider: {
      requests: providerRequests.length,
      responses: providerResponses.length,
      errors: providerErrors.length,
      retries: providerRequests.filter((event) => Number(event.attempt) > 1).length,
      unpairedRequests: Math.max(0, providerRequests.length - providerResponses.length),
      taskCalls,
    },
    scion: {
      calls: scionCalls,
      callsPerLesson: lessons ? Number((scionCalls / lessons).toFixed(2)) : null,
      attributedCalls: instrumentedCalls.length,
      unattributedCalls: Math.max(0, scionCalls - instrumentedCalls.length),
      byCallType,
      qualityActions: parsedActions.length,
      unparsedQualityActions: actions.length - parsedActions.length,
      actionsPerLesson: lessons ? Number((parsedActions.length / lessons).toFixed(2)) : null,
      byPass,
      byAction,
      rejectionReasons,
      mcRepairEfficiency: {
        calls: mcRepairCalls,
        individualCalls: mcItemCalls,
        batchCalls: mcBatchCalls,
        verifiedRepairs: verifiedMcRepairs,
        yield: mcRepairCalls > 0 ? Number((verifiedMcRepairs / mcRepairCalls).toFixed(3)) : null,
        callsWithoutVerifiedRepair: Math.max(0, mcRepairCalls - verifiedMcRepairs),
      },
    },
  };
}

export function compareScionCompilerBurden(candidate, control) {
  const candidateCalls = Number(candidate?.scion?.calls) || 0;
  const controlCalls = Number(control?.scion?.calls) || 0;
  const callAmplification = controlCalls > 0 ? Number((candidateCalls / controlCalls).toFixed(3)) : null;
  const candidateRejected = Number(candidate?.scion?.byAction?.rejected) || 0;
  const controlRejected = Number(control?.scion?.byAction?.rejected) || 0;
  const findings = [];
  if (callAmplification !== null && callAmplification > 1.25) {
    findings.push({
      severity: 'P1',
      code: 'candidate-call-amplification',
      detail: `Candidate required ${callAmplification.toFixed(2)}x the control's Scion quality-pass calls.`,
    });
  }
  const combinedNotApplied =
    (Number(candidate?.scion?.rejectionReasons?.['not-applied']) || 0) +
    (Number(control?.scion?.rejectionReasons?.['not-applied']) || 0);
  const combinedLessons = (Number(candidate?.lessonCount) || 0) + (Number(control?.lessonCount) || 0);
  if (combinedLessons > 0 && combinedNotApplied / combinedLessons >= 1) {
    findings.push({
      severity: 'P1',
      code: 'shared-applied-depth-waste',
      detail: `${combinedNotApplied} applied-depth drafts were rejected as not applied across ${combinedLessons} lesson seats.`,
    });
  }
  if ((candidate?.scion?.unattributedCalls || 0) > 0 || (control?.scion?.unattributedCalls || 0) > 0) {
    findings.push({
      severity: 'P2',
      code: 'unattributed-scion-calls',
      detail: 'The retained logs predate per-schema Scion call attribution; new runs emit it.',
    });
  }
  for (const [side, burden] of [
    ['candidate', candidate],
    ['control', control],
  ]) {
    const efficiency = burden?.scion?.mcRepairEfficiency;
    if (Number(efficiency?.calls) >= 5 && Number(efficiency?.yield) < 0.25) {
      findings.push({
        severity: 'P1',
        code: `${side}-low-yield-mc-repair`,
        detail:
          `${side === 'candidate' ? 'Candidate' : 'Control'} admitted ${efficiency.verifiedRepairs} verified MC ` +
          `repair(s) from ${efficiency.calls} repair generation call(s) (${(efficiency.yield * 100).toFixed(1)} repairs per 100 calls; ` +
          `${Number(efficiency.individualCalls) || 0} individual, ${Number(efficiency.batchCalls) || 0} batched).`,
      });
    }
  }
  return {
    schemaVersion: 1,
    callAmplification,
    candidateCallDelta: candidateCalls - controlCalls,
    rejectedActionDelta: candidateRejected - controlRejected,
    findings,
  };
}
