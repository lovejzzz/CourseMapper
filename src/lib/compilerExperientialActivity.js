import { EXPERIENTIAL_ACTIVITY_PROTOCOL } from './experientialActivityContract';

const clean = (value) =>
  String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();

const list = (value) => (Array.isArray(value) ? value : []);

const unique = (values, limit = Infinity) => {
  const seen = new Set();
  const result = [];
  for (const value of values) {
    const text = clean(value);
    const key = text.toLowerCase();
    if (!text || seen.has(key)) continue;
    seen.add(key);
    result.push(text);
    if (result.length >= limit) break;
  }
  return result;
};

export function resolveExperientialActivity(lesson = {}) {
  const activity = lesson?.enrichment?.experientialActivity;
  if (!activity || activity.protocol !== EXPERIENTIAL_ACTIVITY_PROTOCOL) return null;
  if (
    !clean(activity.scenario) ||
    list(activity.roles).length < 2 ||
    list(activity.evidence).length < 2 ||
    list(activity.updates).length < 1 ||
    list(activity.timing).length < 4 ||
    !clean(activity.artifact?.title) ||
    list(activity.artifact?.requirements).length < 3 ||
    list(activity.debriefPrompts).length < 2 ||
    !clean(activity.safetyBoundary)
  ) {
    return null;
  }
  return activity;
}

export function hasExperientialActivity(lesson = {}) {
  return Boolean(resolveExperientialActivity(lesson));
}

/**
 * Fit model-authored phase weights to the real class clock. The phase names
 * and relative emphasis remain authored; the compiler changes integers only.
 */
export function normalizeExperientialActivityTiming(timing = [], sessionMinutes = 75) {
  const rows = list(timing)
    .map((row, index) => ({
      phase: clean(row?.phase) || `Phase ${index + 1}`,
      minutes: Math.max(1, Math.round(Number(row?.minutes) || 1)),
    }))
    .filter((row) => row.phase);
  if (rows.length === 0) return [];

  const requestedTarget = Math.max(rows.length, Math.round(Number(sessionMinutes) || 75));
  const distributable = requestedTarget - rows.length;
  const weightTotal = rows.reduce((sum, row) => sum + row.minutes, 0) || rows.length;
  const allocations = rows.map((row, index) => {
    const exact = (row.minutes / weightTotal) * distributable;
    return {
      ...row,
      index,
      minutes: 1 + Math.floor(exact),
      remainder: exact - Math.floor(exact),
    };
  });
  let unassigned = requestedTarget - allocations.reduce((sum, row) => sum + row.minutes, 0);
  for (const row of [...allocations].sort(
    (left, right) => right.remainder - left.remainder || left.index - right.index,
  )) {
    if (unassigned <= 0) break;
    row.minutes += 1;
    unassigned -= 1;
  }
  return allocations.sort((left, right) => left.index - right.index).map(({ phase, minutes }) => ({ phase, minutes }));
}

export function buildExperientialActivityPacket({ activity, sessionMinutes = 75 } = {}) {
  if (!activity) return null;
  const timing = normalizeExperientialActivityTiming(activity.timing, sessionMinutes);
  return {
    protocol: EXPERIENTIAL_ACTIVITY_PROTOCOL,
    activityType: clean(activity.activityType),
    scenario: clean(activity.scenario),
    roles: list(activity.roles).map((role) => ({
      name: clean(role?.name),
      goal: clean(role?.goal),
      constraint: clean(role?.constraint),
      privateInformation: clean(role?.privateInformation),
    })),
    evidence: unique(activity.evidence, 6),
    phases: list(activity.updates).map((update) => ({
      title: clean(update?.title),
      information: clean(update?.information),
      requiredDecision: clean(update?.requiredDecision),
    })),
    artifact: {
      title: clean(activity.artifact?.title),
      requirements: unique(activity.artifact?.requirements, 5),
    },
    timing,
    totalMinutes: timing.reduce((sum, row) => sum + row.minutes, 0),
    activityLogFields: [
      'Phase and time',
      'Evidence inspected',
      'Constraint or uncertainty',
      'Decision, action, interpretation, or revision',
      'Reason and next check',
    ],
    debriefPrompts: unique(activity.debriefPrompts, 4),
    safetyBoundary: clean(activity.safetyBoundary),
  };
}

export function buildExperientialActivityMaterials({ activity, readings = [] } = {}) {
  if (!activity) return unique(readings);
  return unique(
    [
      ...readings,
      `${clean(activity.activityType)} activity briefing`,
      `Evidence set: ${list(activity.evidence).map(clean).filter(Boolean).join('; ')}`,
      `Participant or working-role cards: ${list(activity.roles)
        .map((role) => clean(role?.name))
        .filter(Boolean)
        .join(', ')}`,
      `${clean(activity.artifact?.title)} template`,
      'Activity timing and evidence log',
    ],
    8,
  );
}

function phaseContent(packet, index) {
  const lastIndex = packet.timing.length - 1;
  const phase = packet.timing[index];
  if (index === 0) {
    return {
      activity: phase.phase,
      type: 'Activity briefing',
      description: `Situation: ${packet.scenario} Inspect this evidence before acting: ${packet.evidence.join(
        ' ',
      )} Activity clock: ${packet.timing.map((row) => `${row.phase} — ${row.minutes} minutes`).join('; ')}. Total time: ${
        packet.totalMinutes
      } minutes.`,
      instructorNotes: `Introduce the ${packet.activityType}. Safety and evidence boundary: ${packet.safetyBoundary}`,
      instructorRole: 'Orient participants, make the evidence visible, and confirm the activity boundary.',
      grouping: 'Whole class, then assigned participant or working roles',
      bloomsLevel: 'Analyze',
    };
  }
  if (index === 1) {
    return {
      activity: phase.phase,
      type: 'Role or working-position setup',
      description: `Participant or working roles: ${packet.roles
        .map(
          (role) =>
            `${role.name}. Goal: ${role.goal} Constraint: ${role.constraint}${
              role.privateInformation ? ` Role-only information: ${role.privateInformation}` : ''
            }`,
        )
        .join(' ')}`,
      instructorNotes:
        'Confirm each participant can name the role goal, constraint, available evidence, and allowed form of contribution.',
      instructorRole: 'Assign roles or working positions and verify that their constraints remain distinct.',
      grouping: 'Assigned participant or working roles',
      bloomsLevel: 'Analyze',
    };
  }
  if (index === lastIndex) {
    return {
      activity: phase.phase,
      type: 'Artifact and debrief',
      description: `Student artifact: ${packet.artifact.title}. Artifact requirements: ${packet.artifact.requirements.join(
        ' ',
      )}`,
      instructorNotes: `Structured debrief: ${packet.debriefPrompts.join(' ')}`,
      instructorRole: 'Collect the named artifact and debrief evidence, constraints, decisions, and revisions.',
      grouping: 'Individual or team artifact, followed by structured debrief',
      bloomsLevel: 'Evaluate',
    };
  }
  if (index === 2) {
    const assignedUpdates = updatesForActivityPhase(packet, index);
    const updatesCopy =
      assignedUpdates.length > 0
        ? ` Synchronized updates: ${assignedUpdates
            .map(
              (update) =>
                `${update.title}. ${update.information} Required decision or action: ${update.requiredDecision}`,
            )
            .join(' ')}`
        : '';
    return {
      activity: phase.phase,
      type: 'Evidence and activity-log setup',
      description: `Inspect the shared evidence before acting: ${packet.evidence.join(
        ' ',
      )} Activity log fields: ${packet.activityLogFields.join('; ')}.${updatesCopy}`,
      instructorNotes:
        'Require a visible initial record that separates supplied evidence, an active constraint or uncertainty, and the first decision or action. Release any synchronized updates named in this phase only after that initial record is visible.',
      instructorRole: 'Check the evidence record before releasing any later phase information.',
      grouping: 'Assigned roles or working positions with one evidence recorder',
      bloomsLevel: 'Analyze',
    };
  }
  const assignedUpdates = updatesForActivityPhase(packet, index);
  return {
    activity: phase.phase,
    type: 'Activity phase',
    description:
      assignedUpdates.length > 0
        ? assignedUpdates
            .map(
              (update) =>
                `Synchronized update — ${update.title}. ${update.information} Required decision or action: ${update.requiredDecision}`,
            )
            .join(' ')
        : `Work within the assigned role constraints and advance ${packet.artifact.title}. Record an evidence-traceable action for ${phase.phase}.`,
    instructorNotes: `Keep the activity log current using these fields: ${packet.activityLogFields.join('; ')}.`,
    instructorRole: 'Release the phase information, enforce constraints, and require a visible decision or action.',
    grouping: 'Assigned participant or working roles',
    bloomsLevel: 'Apply',
  };
}

function updatesForActivityPhase(packet, timingIndex) {
  const lastIndex = packet.timing.length - 1;
  const activeSlotCount = Math.max(1, lastIndex - 2);
  const slotIndex = Math.max(0, timingIndex - 2);
  const start = Math.floor((slotIndex * packet.phases.length) / activeSlotCount);
  const end = Math.floor(((slotIndex + 1) * packet.phases.length) / activeSlotCount);
  return packet.phases.slice(start, end);
}

export function buildExperientialActivityOutline({ activity, sessionMinutes = 75 } = {}) {
  const packet = buildExperientialActivityPacket({ activity, sessionMinutes });
  if (!packet) return [];
  return packet.timing.map((row, index) => ({
    time: `${row.minutes} minutes`,
    ...phaseContent(packet, index),
  }));
}

export function buildExperientialActivityLessonPlanProfile({ activity, sessionMinutes = 75, outcomes = [] } = {}) {
  const packet = buildExperientialActivityPacket({ activity, sessionMinutes });
  if (!packet) return null;
  return {
    objectives: unique(
      [
        ...outcomes,
        `Use the supplied evidence and role constraints to complete ${packet.artifact.title}.`,
        'Revise a decision, action, interpretation, or design response when a later phase changes the available evidence.',
      ],
      5,
    ),
    formativeCheck: {
      type: 'Activity evidence check',
      prompt: `Before the final phase, record the evidence used, the constraint that mattered, and the decision or action that follows for ${packet.artifact.title}.`,
      objectiveAligned: outcomes[0] || `Complete ${packet.artifact.title} with an inspectable evidence trail.`,
      instructorAction:
        'Return a response that names an outcome without showing the evidence, constraint, and reasoning that produced it.',
    },
    udlNotes: {
      representation:
        'Provide the activity briefing, role or working constraints, evidence set, phase updates, timing, and artifact requirements in accessible digital and print formats.',
      engagement:
        'Offer equivalent participation through speaking, observing, evidence tracking, documenting, operating tools, or presenting while preserving the same evidence and artifact requirements.',
      expression: `Allow accessible production methods for ${packet.artifact.title} while keeping every listed requirement inspectable.`,
    },
    homework: {
      title: `${packet.artifact.title} follow-through`,
      description:
        'If the named artifact is not completed in class, finish only its remaining required evidence or revision trace; this is completion of the same activity artifact, not an additional assignment.',
      estimatedTime: '15 minutes',
      connectionToNext:
        'Bring the activity evidence, decision or action, and debrief note forward so the next lesson can test what should be retained or revised.',
    },
    closingActivity: `Close with one debrief prompt: ${packet.debriefPrompts[0]}`,
  };
}

export function buildExperientialActivityAssignmentBrief({
  lessonNumber = 1,
  relatedLessonTitle = '',
  activity,
  sessionMinutes = 75,
  outcomes = [],
  sourceGrounding = null,
} = {}) {
  const packet = buildExperientialActivityPacket({ activity, sessionMinutes });
  if (!packet) return null;
  return {
    title: `${packet.artifact.title} — activity packet`,
    lessonNumber,
    courseMapRef: `Course Map L${lessonNumber} · in-class ${packet.activityType}`,
    assignmentType: 'Experiential activity packet',
    relatedLessons: [relatedLessonTitle].filter(Boolean),
    dueWeek: `Week ${lessonNumber}`,
    estimatedTime: `${packet.totalMinutes} minutes in class`,
    bloomsLevel: 'Apply · Analyze · Evaluate · Create',
    overview: packet.scenario,
    description:
      'Use the shared briefing, participant or working-role constraints, evidence, timed phases, activity log, named artifact, and debrief below as one coherent activity.',
    objectives: unique(
      [
        ...outcomes,
        `Complete ${packet.artifact.title} with a traceable connection among evidence, constraints, and action.`,
      ],
      5,
    ),
    activityPacket: packet,
    instructions: [
      'Read the situation, safety or evidence boundary, and assigned participant or working-role constraints.',
      'Inspect the supplied evidence before recording an initial decision, action, interpretation, or design response.',
      'Follow the phase clock and record how each update changes—or does not change—the work.',
      `Complete ${packet.artifact.title} and every listed requirement.`,
      'Use the debrief to compare evidence use, constraints, decisions, and revisions rather than personal performance.',
    ],
    formatRequirements: {
      length: `One completed ${packet.artifact.title} plus the activity evidence log.`,
      format: 'Use the course-appropriate format named in the activity artifact requirements.',
      submissionPlatform: 'In class or the official course site, as directed by the instructor.',
    },
    deliverables: [packet.artifact.title, 'Completed activity evidence log'],
    selfAssessmentRubric: [
      'Evidence: the artifact points to the records, observations, passages, measurements, designs, or supplied facts used.',
      'Constraint fidelity: the work makes the assigned limitation, responsibility, trade-off, or boundary visible.',
      'Action: the required decision, revision, interpretation, or performance is concrete and inspectable.',
      'Revision: the activity log shows what changed after later phases or why the original response remained defensible.',
    ],
    accessibilityAndUDL:
      'Provide equivalent ways to access the evidence and contribute to the activity while holding every participant to the same artifact and evidence standards.',
    ...(sourceGrounding ? { sourceGrounding } : {}),
    tags: unique(['experiential activity', packet.activityType, packet.artifact.title], 10),
  };
}

export function mergeExperientialActivityBriefs(briefs = []) {
  const merged = [];
  for (const brief of briefs.filter(Boolean)) {
    if (!brief.activityPacket) {
      merged.push(brief);
      continue;
    }
    const matchIndex = merged.findIndex(
      (candidate) =>
        Number(candidate.lessonNumber || candidate.dueSession || 0) === Number(brief.lessonNumber || 0) &&
        !candidate.activityPacket,
    );
    if (matchIndex < 0) {
      merged.push(brief);
      continue;
    }
    const existing = merged[matchIndex];
    merged[matchIndex] = {
      ...existing,
      activityPacket: brief.activityPacket,
      activityType: brief.activityPacket.activityType,
      instructions: unique([...(existing.instructions || []), ...(brief.instructions || [])], 12),
      deliverables: unique([...(existing.deliverables || []), ...(brief.deliverables || [])], 12),
      accessibilityAndUDL: brief.accessibilityAndUDL || existing.accessibilityAndUDL,
      tags: unique([...(existing.tags || []), ...(brief.tags || [])], 10),
    };
  }
  return merged;
}

export function buildExperientialActivitySlideFrames({
  title = 'Experiential activity',
  activity,
  sessionMinutes = 75,
} = {}) {
  const packet = buildExperientialActivityPacket({ activity, sessionMinutes });
  if (!packet) return [];
  const source = EXPERIENTIAL_ACTIVITY_PROTOCOL;
  const lastIndex = packet.timing.length - 1;
  return packet.timing.map((row, index) => {
    const assignedUpdates = updatesForActivityPhase(packet, index);
    let bullets;
    let notes;
    let bloom = 'Analyze';
    if (index === 0) {
      bullets = [
        `Situation: ${packet.scenario}`,
        `Safety and evidence boundary: ${packet.safetyBoundary}`,
        `Activity clock: ${packet.timing.map((phase) => `${phase.phase} — ${phase.minutes} minutes`).join('; ')}. Total time: ${
          packet.totalMinutes
        } minutes.`,
      ];
      notes = `Introduce the ${packet.activityType}, make the activity boundary explicit, and show the complete clock before assigning roles.`;
      bloom = null;
    } else if (index === 1) {
      bullets = [
        'Participant or working roles:',
        ...packet.roles.map(
          (role) =>
            `${role.name}: ${role.goal} Constraint: ${role.constraint}${role.privateInformation ? ` Private information: ${role.privateInformation}` : ''}`,
        ),
      ];
      notes = 'Confirm that every participant can name the role goal, constraint, and available evidence.';
    } else if (index === lastIndex) {
      bullets = [
        `Student artifact — ${packet.artifact.title}. Artifact requirements: ${packet.artifact.requirements.join('; ')}`,
        ...packet.debriefPrompts.map((prompt) => `Structured debrief: ${prompt}`),
      ];
      notes = 'Collect the named artifact and debrief evidence, constraints, decisions, and revisions.';
      bloom = 'Evaluate';
    } else if (index === 2) {
      bullets = [
        'Inspect the shared evidence before acting:',
        ...packet.evidence.map((item) => `Evidence: ${item}`),
        `Activity log: ${packet.activityLogFields.join('; ')}`,
        ...assignedUpdates.flatMap((update) => [
          `Synchronized update — ${update.title}: ${update.information}`,
          `Required decision or action: ${update.requiredDecision}`,
        ]),
      ];
      notes =
        'Require a visible initial record that separates supplied evidence, an active constraint or uncertainty, and the first decision or action. Release any update on this frame only after that record is visible.';
    } else {
      bullets = [
        ...assignedUpdates.flatMap((update) => [
          `Synchronized update — ${update.title}: ${update.information}`,
          `Required decision or action: ${update.requiredDecision}`,
        ]),
        'Log the evidence used, active constraint, decision or revision, and next check.',
      ];
      notes =
        'Release this phase information to all roles at the same time and require a visible response before continuing.';
      bloom = 'Apply';
    }
    return {
      // The opening frame carries the situation, evidence boundary, and exact
      // clock. A title layout renders only its first bullet on screen and in
      // PPTX, hiding two required mechanics. Keep every live phase—including
      // the briefing—on the activity layout; reserve closing only for the
      // artifact/debrief frame.
      type: index === lastIndex ? 'closing' : 'activity',
      title: index === 0 ? title : row.phase,
      bullets,
      notes,
      minutes: row.minutes,
      bloom,
      objective: index === 0 ? null : bullets[0],
      activity: row.phase,
      enrichmentSource: source,
    };
  });
}
