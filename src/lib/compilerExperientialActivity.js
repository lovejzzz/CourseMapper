import { EXPERIENTIAL_ACTIVITY_PROTOCOL } from './experientialActivityContract';

const clean = (value) =>
  String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();

const list = (value) => (Array.isArray(value) ? value : []);
const stripTerminalListPunctuation = (value) => clean(value).replace(/[.;:,]+$/g, '');
const escapeRegExp = (value) => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

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

const genericArtifactTitle =
  /^(?:role assignment|activity (?:artifact|log|response|worksheet)|final response|group response|worksheet|response|notes?)$/i;

function activityTextTokens(value) {
  return new Set(
    clean(value)
      .toLowerCase()
      .match(/[a-z][a-z0-9'-]{3,}/g)
      ?.filter(
        (token) =>
          ![
            'activity',
            'decision',
            'evidence',
            'from',
            'must',
            'participants',
            'record',
            'scenario',
            'that',
            'their',
            'this',
            'with',
          ].includes(token),
      ) || [],
  );
}

function activityTextOverlaps(left, right) {
  const leftText = clean(left).toLowerCase();
  const rightText = clean(right).toLowerCase();
  if (!leftText || !rightText) return false;
  if (
    (leftText.length >= 20 && rightText.includes(leftText)) ||
    (rightText.length >= 20 && leftText.includes(rightText))
  ) {
    return true;
  }
  const leftTokens = activityTextTokens(leftText);
  const rightTokens = activityTextTokens(rightText);
  if (leftTokens.size < 4 || rightTokens.size < 4) return false;
  const overlap = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  return overlap / Math.min(leftTokens.size, rightTokens.size) >= 0.75;
}

function safeInitialScenario(activity = {}) {
  const scenario = clean(activity.scenario);
  const leaksUpdate = list(activity.updates).some(
    (update) =>
      activityTextOverlaps(scenario, update?.information) || activityTextOverlaps(scenario, update?.requiredDecision),
  );
  if (!leaksUpdate) return scenario;
  const activityType = clean(activity.activityType) || 'experiential activity';
  const evidence = unique(activity.evidence, 2).map(stripTerminalListPunctuation);
  const evidenceCue =
    evidence.length > 0 ? `the supplied ${evidence.length === 1 ? 'record' : 'records'}` : 'the supplied evidence';
  return `In this ${activityType}, participants must make and document an initial decision using ${evidenceCue} while working within assigned role constraints. They must record the reasoning before any later update is released.`;
}

function concreteActivityArtifact(activity = {}) {
  const authoredTitle = clean(activity.artifact?.title);
  const authoredRequirements = unique(activity.artifact?.requirements, 5);
  const contractRequirements = [
    'Record the supplied evidence and role constraint behind the initial decision.',
    'Show how the synchronized update changed or confirmed the final decision, citing the new evidence.',
    'Name one unresolved uncertainty and the next evidence check.',
  ];
  const requirementText = authoredRequirements.join(' ');
  const requirementsMeetContract =
    /\b(?:evidence|record|observation|passage|measurement|data)\b/i.test(requirementText) &&
    /\b(?:constraint|role|limitation|boundary|trade-?off)\b/i.test(requirementText) &&
    /\b(?:update|revis(?:e|ion)|changed?|confirmed?)\b/i.test(requirementText) &&
    /\b(?:uncertaint|next (?:evidence )?check)\b/i.test(requirementText);
  if (authoredTitle && !genericArtifactTitle.test(authoredTitle)) {
    return {
      title: authoredTitle,
      requirements: requirementsMeetContract ? authoredRequirements : contractRequirements,
    };
  }
  const activityType = clean(activity.activityType) || 'Activity';
  const subject =
    clean(
      activityType.replace(
        /\b(?:simulation|role[- ]?play|case exercise|studio critique|design review|design exercise|laboratory investigation|lab(?:oratory)?|field exercise|structured debate|mock hearing|mock trial|negotiation)\b/gi,
        ' ',
      ),
    ) || activityType;
  const product = /\b(?:lab|laboratory|investigation|field)\b/i.test(activityType)
    ? 'findings record'
    : /\b(?:critique|design|studio)\b/i.test(activityType)
      ? 'revision record'
      : 'decision record';
  return {
    title: `${subject.charAt(0).toUpperCase()}${subject.slice(1)} ${product}`,
    requirements: contractRequirements,
  };
}

function normalizeActivityRoles(roles = []) {
  const seenConstraints = new Set();
  return list(roles).map((role) => {
    const name = clean(role?.name);
    const goal = clean(role?.goal);
    const authoredConstraint = clean(role?.constraint);
    const constraintKey = authoredConstraint.toLowerCase();
    const statedOutcome = stripTerminalListPunctuation(goal || 'advance a defensible course of action');
    const studentFacingOutcome = `${statedOutcome.charAt(0).toLowerCase()}${statedOutcome.slice(1)}`;
    const constraint =
      constraintKey && !seenConstraints.has(constraintKey)
        ? authoredConstraint
        : `${name || 'This role'} must prioritize this outcome: ${studentFacingOutcome}. The role must also name any supplied evidence that limits the recommendation.`;
    if (constraintKey) seenConstraints.add(constraintKey);
    return {
      name,
      goal,
      constraint,
      privateInformation: clean(role?.privateInformation),
    };
  });
}

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
  const artifact = concreteActivityArtifact(activity);
  return {
    protocol: EXPERIENTIAL_ACTIVITY_PROTOCOL,
    activityType: clean(activity.activityType),
    scenario: safeInitialScenario(activity),
    roles: normalizeActivityRoles(activity.roles),
    evidence: unique(activity.evidence, 6),
    phases: list(activity.updates).map((update) => ({
      title: clean(update?.title),
      information: clean(update?.information),
      requiredDecision: activityTextOverlaps(update?.information, update?.requiredDecision)
        ? `Record how this update changes or confirms ${artifact.title}, citing the evidence used and one remaining uncertainty.`
        : clean(update?.requiredDecision),
    })),
    artifact,
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
  const packet = buildExperientialActivityPacket({ activity });
  const normalizedReadings = unique(
    readings.map((reading) =>
      clean(reading).replace(/^The (.+?) focus (?=(?:activity|simulation|lab|studio|case)\b)/i, '$1 '),
    ),
  );
  const prunedReadings = normalizedReadings.filter(
    (reading, index, values) =>
      !values.some(
        (other, otherIndex) =>
          otherIndex !== index &&
          other.length > reading.length + 6 &&
          other.toLowerCase().includes(reading.toLowerCase()),
      ),
  );
  return unique(
    [
      ...prunedReadings,
      `${packet.activityType} activity briefing`,
      `Evidence set: ${packet.evidence.map(stripTerminalListPunctuation).join('; ')}`,
      `Participant or working-role cards: ${packet.roles
        .map((role) => clean(role?.name))
        .filter(Boolean)
        .join(', ')}`,
      `${packet.artifact.title} template`,
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
      description: `Situation: ${packet.scenario} Inspect this evidence before acting: ${packet.evidence
        .map(stripTerminalListPunctuation)
        .join('; ')}. Activity clock: ${packet.timing
        .map((row) => `${row.phase} — ${row.minutes} minutes`)
        .join('; ')}. Total time: ${packet.totalMinutes} minutes.`,
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
      instructorNotes: `Structured debrief: ${packet.debriefPrompts
        .map((prompt) => (/[\p{P}]$/u.test(clean(prompt)) ? clean(prompt) : `${clean(prompt)}.`))
        .join(' ')}`,
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
      description: `Inspect the shared evidence before acting: ${packet.evidence
        .map(stripTerminalListPunctuation)
        .join('; ')}. Activity log fields: ${packet.activityLogFields.join('; ')}.${updatesCopy}`,
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
      objectiveAligned: `Complete ${packet.artifact.title} with an inspectable evidence trail.`,
      instructorAction:
        'Ask students to revise any response that names an outcome without showing the evidence, constraint, and reasoning that produced it.',
    },
    udlNotes: {
      representation:
        'Provide the briefing, roles, evidence, phase updates, clock, and artifact requirements in accessible digital and print formats.',
      engagement:
        'Offer equivalent roles in speaking, observing, evidence tracking, documenting, operating tools, or presenting.',
      expression: `Permit accessible production methods for ${packet.artifact.title} while keeping every requirement inspectable.`,
    },
    closingActivity: `Close with one debrief prompt: ${
      /[\p{P}]$/u.test(clean(packet.debriefPrompts[0]))
        ? clean(packet.debriefPrompts[0])
        : `${clean(packet.debriefPrompts[0])}.`
    } Retain the evidence log and debrief note for the next lesson.`,
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
    const packet = brief.activityPacket;
    const rawActivityLabel = String(packet.activityType || 'experiential activity').trim();
    const activityLabelRoot = rawActivityLabel.replace(/\s+focus$/i, '').trim() || 'course';
    const activityLabel = /\b(?:activity|simulation|lab|studio|exercise|debate|negotiation)\b/i.test(activityLabelRoot)
      ? activityLabelRoot
      : `${activityLabelRoot} experiential activity`;
    const artifactTitle = String(packet.artifact?.title || 'activity artifact').trim();
    const artifactReference = /^the\b/i.test(artifactTitle) ? artifactTitle : `the ${artifactTitle}`;
    const legacyTitle = clean(existing.title);
    const weightSuffix = legacyTitle.match(/\(\s*\d+(?:\.\d+)?\s*%\s*\)\s*$/)?.[0] || '';
    const assignmentTitle = `${artifactTitle}${weightSuffix ? ` ${weightSuffix}` : ''}`;
    const rewriteLegacyCopy = (value) => {
      if (Array.isArray(value)) return value.map(rewriteLegacyCopy);
      if (value && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, rewriteLegacyCopy(nested)]));
      }
      if (typeof value !== 'string') return value;
      let text = value;
      if (legacyTitle) text = text.replace(new RegExp(escapeRegExp(legacyTitle), 'gi'), assignmentTitle);
      text = text
        .replace(/\bWeek\s+\d+\s+assignment\b/gi, artifactTitle)
        .replace(/\b([A-Z][\w'-]*(?:\s+[A-Z][\w'-]*){0,4}) focus\b/g, '$1')
        .replace(/\busing course evidence evidence\b/gi, 'using supplied course evidence')
        .replace(/\bevidence evidence\b/gi, 'evidence')
        .replace(/\bbefore (?:students|they) draft\b/gi, 'before students submit')
        .replace(/\bdraft\b/gi, 'working version');
      return clean(text);
    };
    const preserved = rewriteLegacyCopy(existing);
    // The complete packet already supplies the briefing, clock, roles,
    // evidence, updates, artifact, and debrief. Keep the student-facing
    // directions native to that experience instead of wrapping them in a
    // generic weekly-assignment template.
    const activityInstructions = unique(
      [
        'Read the situation, safety or evidence boundary, and assigned role constraints before the clock starts.',
        `Inspect the supplied evidence and record the initial decision or interpretation for ${artifactReference} before any update is released.`,
        'Keep the activity evidence log current during every phase: name the evidence, active constraint, decision, reason, and next check.',
        `When the synchronized update arrives, revise ${artifactReference}, cite the new evidence, and record one changed decision or conclusion.`,
        `Complete every requirement listed for ${artifactReference}; do not add claims the supplied record cannot support.`,
        'Answer the debrief prompts by comparing evidence use, constraints, decisions, and revisions—not personal performance.',
        `Submit ${artifactReference}, the completed activity evidence log, and a concise debrief note.`,
      ].filter(Boolean),
      7,
    );
    const activityMilestones = [
      {
        milestone: 'Briefing and initial record',
        description:
          'Confirm the role constraint, inspect the supplied evidence, and record an initial decision before the update.',
        feedback:
          'The instructor checks that evidence, constraint, and initial reasoning are visible before releasing the update.',
        uploadChecklist: ['Role constraint and initial evidence source recorded'],
      },
      {
        milestone: 'Update-responsive revision',
        description: `Revise ${artifactReference} after the synchronized update and identify the evidence that changed or confirmed the decision.`,
        feedback: 'The instructor checks the evidence link, changed decision or conclusion, and remaining uncertainty.',
        uploadChecklist: ['Update evidence cited', 'Changed decision or conclusion visible'],
      },
      {
        milestone: 'Artifact and debrief',
        description: `Submit ${artifactReference}, the completed activity evidence log, and a concise debrief note.`,
        feedback: 'Feedback identifies the strongest evidence-to-decision link and one next evidence check.',
        uploadChecklist: [`${artifactTitle} complete`, 'Activity evidence log complete', 'Debrief note complete'],
      },
    ];
    merged[matchIndex] = {
      ...preserved,
      title: assignmentTitle,
      assignmentType: 'Experiential activity',
      bloomsLevel: brief.bloomsLevel,
      estimatedTime: brief.estimatedTime,
      overview: `${packet.scenario} Participants will produce ${artifactReference} with a visible trail from supplied evidence and role constraints to the initial decision and update-responsive revision.`,
      description:
        'This experiential activity combines the briefing, roles, evidence, phase clock, synchronized update, named artifact, and structured debrief in one coherent in-class experience.',
      objectives: [
        `Use supplied evidence and role constraints to complete ${artifactReference}.`,
        'Record an initial decision or interpretation before later information is released.',
        `Revise ${artifactReference} after the synchronized update and identify the evidence that changed or confirmed the response.`,
        'Explain one remaining uncertainty and the next evidence check.',
      ],
      activityPacket: packet,
      activityType: packet.activityType,
      instructions: activityInstructions,
      formatRequirements: {
        length: `One completed ${artifactTitle}, the activity evidence log, and a concise debrief note.`,
        format: `Use the ${artifactTitle} template and keep every artifact requirement inspectable.`,
        citationStyle: 'Cite supplied activity evidence by its exact record, item, or update label.',
        submissionPlatform:
          preserved.formatRequirements?.submissionPlatform ||
          'Submit in class or through the official course site, as directed by the instructor.',
        latePolicy:
          'If access, illness, or scheduling prevents participation, contact the instructor before the activity closes to arrange an equivalent evidence-based pathway.',
      },
      gradingCriteria: [
        'Evidence accuracy and source traceability',
        'Decision logic within the assigned role constraint',
        'Update-responsive revision with one remaining uncertainty',
        `Clarity and completeness of ${artifactReference}`,
      ],
      selfAssessmentRubric: [
        'Evidence accuracy (30%): Each claim cites a supplied record or update and separates fact from assumption.',
        'Decision logic (30%): Evidence and constraints support a clear decision with one limitation.',
        'Update response (20%): The final version shows what changed—or remained defensible—after the synchronized update.',
        `Artifact quality (20%): Every requirement for ${artifactReference} is complete and easy to inspect.`,
      ],
      feedbackLoop:
        'Use feedback to strengthen the evidence trail, decision logic, and next evidence check in the next course activity.',
      scaffoldingMilestones: activityMilestones,
      supportResources: [
        'Activity briefing, synchronized update, and supplied evidence',
        `Participant role constraints, requirements for ${artifactReference}, and the activity evidence log`,
        'Activity clock, debrief prompts, and scoring criteria',
      ],
      academicIntegrityStatement: 'Submit original work; credit outside sources and approved tools.',
      sourceUsePlan: {
        ...(existing.sourceUsePlan || {}),
        studentAttributionMove:
          'Name the supplied record, update, or course source behind each claim before explaining what it supports.',
        noInventedSources:
          'Use only source details that appear in the supplied activity evidence or assigned materials. Do not invent authors, URLs, pages, studies, or real-world facts.',
        sourceEvaluationPrompt:
          'Ask what the supplied activity evidence can support, what it cannot prove, and which uncertainty remains.',
        localReplacementCue:
          'If the work will be published beyond class, replace classroom case materials with the official sources required by the instructor.',
      },
      deliverables: [artifactTitle, 'Completed activity evidence log', 'Concise debrief note'],
      progressTracking:
        'Use the phase clock and activity evidence log to make each evidence, constraint, decision, and revision visible.',
      accessibilityAndUDL: brief.accessibilityAndUDL || existing.accessibilityAndUDL,
      tags: unique(['experiential activity', activityLabel, artifactTitle], 6),
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
      const artifactRequirements = packet.artifact.requirements
        .map(stripTerminalListPunctuation)
        .filter(Boolean)
        .join('; ');
      bullets = [
        `Student artifact — ${packet.artifact.title}. Artifact requirements: ${artifactRequirements}.`,
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
