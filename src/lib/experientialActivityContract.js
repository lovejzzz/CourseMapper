const EXPERIENTIAL_ACTIVITY_KINDS = [
  {
    id: 'simulation',
    request: /\b(?:simulation|mock (?:hearing|trial|briefing|negotiation|interview))\b/i,
    label: /\b(?:simulation|mock (?:hearing|trial|briefing|negotiation|interview))\b/i,
  },
  {
    id: 'role-play',
    request: /\brole[- ]?play\b/i,
    label: /\brole[- ]?play\b/i,
  },
  {
    id: 'case-exercise',
    request: /\bcase (?:exercise|workshop|conference)\b/i,
    label: /\bcase (?:exercise|workshop|conference)\b/i,
  },
  {
    id: 'studio-critique',
    request: /\b(?:studio critique|design review)\b/i,
    label: /\b(?:studio critique|design review)\b/i,
  },
  {
    id: 'design-exercise',
    request: /\bdesign (?:charrette|sprint)\b/i,
    label: /\bdesign (?:charrette|sprint|exercise)\b/i,
  },
  {
    id: 'laboratory',
    request: /\blab(?:oratory)?(?: (?:practical|investigation|challenge))?\b/i,
    label: /\blab(?:oratory)?(?: (?:practical|investigation|challenge))?\b/i,
  },
  {
    id: 'field-exercise',
    request: /\bfield (?:exercise|observation)\b/i,
    label: /\bfield (?:exercise|observation)\b/i,
  },
  {
    id: 'structured-debate',
    request: /\bstructured debate\b/i,
    label: /\b(?:structured )?debate\b/i,
  },
];

const EXPERIENCE_CUE_RE = new RegExp(EXPERIENTIAL_ACTIVITY_KINDS.map(({ request }) => request.source).join('|'), 'i');

const EXACT_PLACEHOLDER_VALUE_RE =
  /^(?:tbd|to be determined|role [a-d]|stakeholder [a-d]|evidence (?:item|source|detail) [1-9]|scenario evidence|(?:the )?evidence packet|(?:the )?course materials|(?:the )?instructor[- ](?:selected|provided)(?: materials)?|generic (?:case|scenario)|course-specific activity type|specific participant or working role|the role goal in this activity|a real constraint, trade-off, or responsibility|named activity phase)[.!?]?$/i;
const GENERIC_PLACEHOLDER_ACTION_RE =
  /^(?:review|use|inspect|consult|read|analy[sz]e|refer to)\b.{0,120}\b(?:evidence packet|course materials|instructor[- ](?:selected|provided)(?: materials)?)\b/i;
const TEMPLATE_PLACEHOLDER_RESIDUE_RE =
  /\b(?:new information, task condition, critique input, or observation released in this phase|concrete decision, action, revision, or interpretation participants must record|three to five inspectable artifact requirements)\b/i;

const META_RE = /\b(?:as an ai|language model|prompt|json|schema|compiler|generated content)\b/i;
const GENERIC_ACTIVITY_TYPE_RE =
  /^(?:simulation(?: and decision[- ]making)?|case exercise|lab(?:oratory)?(?: investigation| practical)?|studio critique|critique|role[- ]?play|field exercise|structured debate)$/i;

const compact = (value) =>
  String(value || '')
    .replace(/\s+/g, ' ')
    .trim();

const list = (value) => (Array.isArray(value) ? value : []);

const activityVisibleStrings = (raw = {}) =>
  [
    raw?.activityType,
    raw?.scenario,
    ...list(raw?.roles).flatMap((role) => [role?.name, role?.goal, role?.constraint, role?.privateInformation]),
    ...list(raw?.evidence),
    ...list(raw?.updates).flatMap((update) => [update?.title, update?.information, update?.requiredDecision]),
    raw?.artifact?.title,
    ...list(raw?.artifact?.requirements),
    ...list(raw?.timing).map((row) => row?.phase),
    ...list(raw?.debriefPrompts),
    raw?.safetyBoundary,
  ]
    .map(compact)
    .filter(Boolean);

function hasPlaceholderContent(raw = {}) {
  return activityVisibleStrings(raw).some(
    (value) =>
      EXACT_PLACEHOLDER_VALUE_RE.test(value) ||
      GENERIC_PLACEHOLDER_ACTION_RE.test(value) ||
      TEMPLATE_PLACEHOLDER_RESIDUE_RE.test(value) ||
      /\b(?:tbd|to be determined)\b/i.test(value),
  );
}

function completeActivityScenario(seed, roles = [], updates = []) {
  let scenario = compact(seed);
  if (scenario && !/[.!?]$/.test(scenario)) scenario = `${scenario}.`;
  const additions = [
    { kind: 'information', value: updates[0]?.information },
    { kind: 'decision', value: updates[0]?.requiredDecision },
    { kind: 'goal', value: roles[0]?.goal },
    { kind: 'constraint', value: roles[0]?.constraint },
  ];
  for (const { kind, value } of additions) {
    const sentenceCount = (scenario.match(/[.!?](?:\s|$)/g) || []).length;
    if (scenario.length >= 80 && sentenceCount >= 2) break;
    const authored = compact(value);
    if (!authored || scenario.toLowerCase().includes(authored.toLowerCase())) continue;
    let addition = authored;
    if (
      !/^[A-Z][^.!?]{2,100}\b(?:must|should|will|records?|revises?|selects?|decides?|confirms?|reveals?|shows?)\b/i.test(
        addition,
      )
    ) {
      if (kind === 'decision') {
        addition = `Participants must ${addition.charAt(0).toLowerCase()}${addition.slice(1)}`;
      } else if (kind === 'goal') {
        addition = `The activity goal is to ${addition.charAt(0).toLowerCase()}${addition.slice(1)}`;
      } else if (kind === 'constraint') {
        addition = `Work must honor this constraint: ${addition.charAt(0).toLowerCase()}${addition.slice(1)}`;
      }
    }
    scenario = compact(`${scenario} ${addition}${/[.!?]$/.test(addition) ? '' : '.'}`);
  }
  return scenario;
}

const uniqueStrings = (values, limit = Infinity) => {
  const seen = new Set();
  const result = [];
  for (const value of values) {
    const text = compact(value);
    const key = text.toLowerCase();
    if (!text || seen.has(key)) continue;
    seen.add(key);
    result.push(text);
    if (result.length >= limit) break;
  }
  return result;
};

const hasDuplicateStrings = (values) => {
  const normalized = list(values).map(compact).filter(Boolean);
  return uniqueStrings(normalized).length !== normalized.length;
};

export const EXPERIENTIAL_ACTIVITY_PROTOCOL = 'scion-experiential-activity-v1';

function experientialRequestText(lesson = {}) {
  return [
    lesson.title,
    lesson.topics,
    lesson.objectives,
    lesson.goal,
    lesson.activityBrief,
    ...(list(lesson.sync) || []),
    ...(list(lesson.async) || []),
    lesson.syncActivities,
    lesson.asyncActivities,
    lesson.activityType,
    lesson.modalityCue,
  ]
    .flat()
    .filter(Boolean)
    .join(' ');
}

export function requestedExperientialActivityKinds(lesson = {}) {
  const text = experientialRequestText(lesson);
  return EXPERIENTIAL_ACTIVITY_KINDS.filter(({ request }) => request.test(text)).map(({ id }) => id);
}

const ACTIVITY_KIND_LABELS = {
  simulation: 'simulation',
  'role-play': 'role-play',
  'case-exercise': 'case exercise',
  'studio-critique': 'studio critique',
  'design-exercise': 'design exercise',
  laboratory: 'laboratory investigation',
  'field-exercise': 'field exercise',
  'structured-debate': 'structured debate',
};

function requestedExperientialActivityFormLabel(lesson = {}) {
  const text = experientialRequestText(lesson);
  for (const { request } of EXPERIENTIAL_ACTIVITY_KINDS) {
    const matched = text.match(request)?.[0];
    if (matched) return compact(matched).toLowerCase();
  }
  const [requestedKind] = requestedExperientialActivityKinds(lesson);
  return ACTIVITY_KIND_LABELS[requestedKind] || '';
}

export function experientialActivityTypeHint(lesson = {}) {
  const [requestedKind] = requestedExperientialActivityKinds(lesson);
  if (!requestedKind) return '';
  const requestedLabel = requestedExperientialActivityFormLabel(lesson) || ACTIVITY_KIND_LABELS[requestedKind];
  const source =
    compact(lesson?.title)
      .replace(/^lesson\s*\d+\s*[:.\-–—]\s*/i, '')
      .replace(new RegExp(EXPERIENCE_CUE_RE.source, 'gi'), ' ')
      .replace(/[—–:;|]+/g, ' ') ||
    compact(lesson?.topics) ||
    compact(lesson?.objectives);
  const subject = compact(source).split(/\s+/).filter(Boolean).slice(0, 7).join(' ');
  return compact(`${subject} ${requestedLabel}`).slice(0, 80);
}

export function requestsExperientialActivity(lesson = {}) {
  return requestedExperientialActivityKinds(lesson).length > 0;
}

export function experientialLessonIds(lessons = []) {
  return list(lessons)
    .filter(requestsExperientialActivity)
    .map((lesson) => compact(lesson?.lessonId))
    .filter(Boolean);
}

export function compactActivityBlueprintShape(lessonId = 'lesson-1', lesson = {}) {
  const emptyRole = () => ({
    nm: '',
    go: '',
    co: '',
  });
  const emptyTiming = () => ({
    ph: '',
    mn: 1,
  });
  return {
    lessonId,
    ty: experientialActivityTypeHint(lesson),
    sc: '',
    // Gemma follows the visible template more reliably than prose-only
    // cardinality instructions. Give it the minimum runnable seats while
    // keeping every value empty so no compiler-authored scenario leaks in.
    ro: [emptyRole(), emptyRole()],
    ev: ['', ''],
    up: [
      {
        ti: '',
        in: '',
        rd: '',
      },
    ],
    ar: {
      ti: '',
      rq: ['', '', ''],
    },
    tm: [emptyTiming(), emptyTiming(), emptyTiming(), emptyTiming()],
    db: ['', ''],
    sb: '',
  };
}

export function compactActivityBlueprintJsonSchema(lessonIds = []) {
  const ids = uniqueStrings(lessonIds);
  return {
    type: 'array',
    items: {
      type: 'object',
      properties: {
        lessonId: ids.length > 0 ? { type: 'string', enum: ids } : { type: 'string' },
        ty: {
          type: 'string',
          minLength: 16,
          maxLength: 80,
          description: 'The lesson topic combined with the requested activity form.',
        },
        sc: {
          type: 'string',
          minLength: 80,
          maxLength: 700,
          description:
            'Two or three complete sentences with a course-specific situation, required decision or action, and real constraint.',
        },
        ro: {
          type: 'array',
          minItems: 2,
          maxItems: 2,
          items: {
            type: 'object',
            properties: {
              nm: { type: 'string', minLength: 3, maxLength: 80 },
              go: { type: 'string', minLength: 12, maxLength: 260 },
              co: { type: 'string', minLength: 12, maxLength: 260 },
            },
            required: ['nm', 'go', 'co'],
            additionalProperties: false,
          },
        },
        ev: {
          type: 'array',
          minItems: 2,
          maxItems: 2,
          items: { type: 'string', minLength: 12, maxLength: 240 },
        },
        up: {
          type: 'array',
          minItems: 1,
          maxItems: 1,
          items: {
            type: 'object',
            properties: {
              ti: { type: 'string', minLength: 3, maxLength: 80 },
              in: { type: 'string', minLength: 20, maxLength: 320 },
              rd: { type: 'string', minLength: 20, maxLength: 320 },
            },
            required: ['ti', 'in', 'rd'],
            additionalProperties: false,
          },
        },
        ar: {
          type: 'object',
          properties: {
            ti: { type: 'string', minLength: 3, maxLength: 100 },
            rq: {
              type: 'array',
              minItems: 3,
              maxItems: 3,
              items: { type: 'string', minLength: 10, maxLength: 220 },
            },
          },
          required: ['ti', 'rq'],
          additionalProperties: false,
        },
        tm: {
          type: 'array',
          minItems: 4,
          maxItems: 4,
          items: {
            type: 'object',
            properties: {
              ph: { type: 'string', minLength: 3, maxLength: 80 },
              mn: { type: 'integer', minimum: 1, maximum: 180 },
            },
            required: ['ph', 'mn'],
            additionalProperties: false,
          },
        },
        db: {
          type: 'array',
          minItems: 2,
          maxItems: 2,
          items: { type: 'string', minLength: 12, maxLength: 240 },
        },
        sb: { type: 'string', minLength: 20, maxLength: 300 },
      },
      required: ['lessonId', 'ty', 'sc', 'ro', 'ev', 'up', 'ar', 'tm', 'db', 'sb'],
      additionalProperties: false,
    },
    minItems: ids.length || 1,
    maxItems: ids.length || 1,
  };
}

function activityGroundingText({ promptLesson = {}, facts = [] } = {}) {
  return [
    promptLesson.title,
    promptLesson.topics,
    promptLesson.objectives,
    promptLesson.goal,
    promptLesson.activityBrief,
    ...list(promptLesson.sync),
    ...list(promptLesson.async),
    ...list(promptLesson.requiredReadings),
    promptLesson.readings,
    ...list(facts),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function meaningfulTokens(value) {
  return new Set(
    compact(value)
      .toLowerCase()
      .match(/[a-z][a-z0-9'-]{3,}/g)
      ?.filter(
        (token) =>
          ![
            'after',
            'another',
            'activity',
            'artifact',
            'before',
            'compare',
            'course',
            'decision',
            'does',
            'evidence',
            'from',
            'have',
            'identify',
            'into',
            'lesson',
            'must',
            'only',
            'other',
            'participants',
            'record',
            'review',
            'scenario',
            'students',
            'than',
            'that',
            'their',
            'then',
            'this',
            'under',
            'using',
            'when',
            'where',
            'which',
            'will',
            'with',
          ].includes(token),
      ) || [],
  );
}

function hasGroundingOverlap(value, grounding) {
  const normalizedValue = compact(value).toLowerCase();
  const normalizedGrounding = compact(grounding).toLowerCase();
  if (normalizedValue && normalizedGrounding.includes(normalizedValue)) return true;
  const groundingTokens = meaningfulTokens(grounding);
  return [...meaningfulTokens(value)].some((token) => groundingTokens.has(token));
}

function activityTypeSubjectText(value) {
  let subject = compact(value);
  for (const { label } of EXPERIENTIAL_ACTIVITY_KINDS) {
    subject = subject.replace(new RegExp(label.source, 'gi'), ' ');
  }
  return compact(
    subject.replace(
      /\b(?:activity|exercise|investigation|practice|decision[- ]making|decision|making|session|experience|and|the)\b/gi,
      ' ',
    ),
  );
}

function groundGenericActivityType(value, promptLesson = {}) {
  const activityType = compact(value);
  if (!GENERIC_ACTIVITY_TYPE_RE.test(activityType)) return activityType;
  const titleWords = compact(promptLesson?.title)
    .replace(/^lesson\s*\d+\s*[:.\-–—]\s*/i, '')
    .replace(EXPERIENCE_CUE_RE, ' ')
    .replace(/[—–:;|]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 6);
  if (titleWords.length === 0) return activityType;
  return compact(`${titleWords.join(' ')} ${activityType}`).slice(0, 80);
}

function collapseRepeatedRequestedActivityForm(value, promptLesson = {}) {
  const activityType = compact(value);
  const [requestedKind] = requestedExperientialActivityKinds(promptLesson);
  const requestedLabel = requestedExperientialActivityFormLabel(promptLesson) || ACTIVITY_KIND_LABELS[requestedKind];
  const kind = EXPERIENTIAL_ACTIVITY_KINDS.find(({ id }) => id === requestedKind);
  if (!requestedLabel || !kind) return activityType;
  const escapedLabel = requestedLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const trailingLabel = new RegExp(`\\s+${escapedLabel}\\s*$`, 'i');
  if (!trailingLabel.test(activityType)) return activityType;
  const withoutTrailingDuplicate = compact(activityType.replace(trailingLabel, ''));
  return kind.label.test(withoutTrailingDuplicate) ? withoutTrailingDuplicate : activityType;
}

export function lintExperientialActivityBlueprint(
  raw = {},
  { expectedLessonIds = [], promptLesson = {}, facts = [] } = {},
) {
  const issues = [];
  const lessonId = compact(raw?.lessonId);
  const expected = new Set(uniqueStrings(expectedLessonIds));
  if (!lessonId) issues.push('missing-lesson-id');
  else if (expected.size > 0 && !expected.has(lessonId)) issues.push('unexpected-lesson-id');
  const activityType = compact(raw?.activityType);
  const scenario = compact(raw?.scenario);
  if (!activityType) issues.push('missing-activity-type');
  else if (activityType.length < 4 || activityType.length > 80) issues.push('activity-type-length');
  else if (GENERIC_ACTIVITY_TYPE_RE.test(activityType)) issues.push('activity-type-generic');
  if (scenario.length < 80) issues.push('scenario-too-thin');
  else if (scenario.length > 700) issues.push('scenario-too-long');
  else if ((scenario.match(/[.!?](?:\s|$)/g) || []).length < 2) issues.push('scenario-sentence-count');

  const roles = list(raw?.roles);
  if (roles.length < 2 || roles.length > 5) issues.push('roles-count');
  if (hasDuplicateStrings(roles.map((role) => role?.name))) issues.push('roles-duplicate-name');
  roles.forEach((role, index) => {
    const name = compact(role?.name);
    const goal = compact(role?.goal);
    const constraint = compact(role?.constraint);
    const privateInformation = compact(role?.privateInformation);
    if (name.length < 3 || name.length > 80) issues.push(`role-${index + 1}-name`);
    if (goal.length < 12 || goal.length > 260) issues.push(`role-${index + 1}-goal`);
    if (constraint.length < 12 || constraint.length > 260) issues.push(`role-${index + 1}-constraint`);
    if (privateInformation.length > 260) issues.push(`role-${index + 1}-private-information`);
  });

  const evidence = list(raw?.evidence).map(compact).filter(Boolean);
  if (evidence.length < 2 || evidence.length > 6) issues.push('evidence-count');
  if (hasDuplicateStrings(evidence)) issues.push('evidence-duplicate');
  evidence.forEach((item, index) => {
    if (item.length < 12 || item.length > 240) issues.push(`evidence-${index + 1}-length`);
  });
  const updates = list(raw?.updates);
  if (updates.length < 1 || updates.length > 4) issues.push('updates-count');
  if (hasDuplicateStrings(updates.map((update) => update?.title))) issues.push('updates-duplicate-title');
  updates.forEach((update, index) => {
    const title = compact(update?.title);
    const information = compact(update?.information);
    const requiredDecision = compact(update?.requiredDecision);
    if (title.length < 3 || title.length > 80) issues.push(`update-${index + 1}-title`);
    if (information.length < 20 || information.length > 320) issues.push(`update-${index + 1}-information`);
    if (requiredDecision.length < 20 || requiredDecision.length > 320) {
      issues.push(`update-${index + 1}-decision`);
    }
  });

  const artifactTitle = compact(raw?.artifact?.title);
  const artifactRequirements = list(raw?.artifact?.requirements).map(compact).filter(Boolean);
  if (artifactTitle.length < 3 || artifactTitle.length > 100) issues.push('artifact-title');
  if (artifactRequirements.length < 3 || artifactRequirements.length > 5) issues.push('artifact-requirements');
  if (hasDuplicateStrings(artifactRequirements)) issues.push('artifact-requirements-duplicate');
  artifactRequirements.forEach((requirement, index) => {
    if (requirement.length < 10 || requirement.length > 220) {
      issues.push(`artifact-requirement-${index + 1}-length`);
    }
  });

  const timing = list(raw?.timing);
  if (timing.length < 4 || timing.length > 8) issues.push('timing-count');
  if (
    timing.some(
      (row) =>
        compact(row?.phase).length < 3 ||
        compact(row?.phase).length > 80 ||
        !Number.isInteger(row?.minutes) ||
        row.minutes < 1 ||
        row.minutes > 180,
    )
  ) {
    issues.push('timing-row');
  }
  if (new Set(timing.map((row) => compact(row?.phase).toLowerCase()).filter(Boolean)).size !== timing.length) {
    issues.push('timing-duplicate-phase');
  }
  const debriefPrompts = list(raw?.debriefPrompts).map(compact).filter(Boolean);
  if (debriefPrompts.length < 2 || debriefPrompts.length > 4) issues.push('debrief-count');
  if (hasDuplicateStrings(debriefPrompts)) issues.push('debrief-duplicate');
  debriefPrompts.forEach((prompt, index) => {
    if (prompt.length < 12 || prompt.length > 240) issues.push(`debrief-${index + 1}-length`);
  });
  const safetyBoundary = compact(raw?.safetyBoundary);
  if (safetyBoundary.length < 20 || safetyBoundary.length > 300) issues.push('safety-boundary');

  const visible = JSON.stringify(raw);
  if (hasPlaceholderContent(raw)) issues.push('placeholder-content');
  if (META_RE.test(visible)) issues.push('meta-content');

  const grounding = activityGroundingText({ promptLesson, facts });
  const activityTypeSubject = activityTypeSubjectText(activityType);
  if (grounding && (!activityTypeSubject || !hasGroundingOverlap(activityTypeSubject, grounding))) {
    issues.push('activity-type-grounding');
  }
  const requestedKinds = requestedExperientialActivityKinds(promptLesson);
  if (
    requestedKinds.length > 0 &&
    !EXPERIENTIAL_ACTIVITY_KINDS.some(({ id, label }) => requestedKinds.includes(id) && label.test(activityType))
  ) {
    issues.push('activity-type-mode-mismatch');
  }
  if (grounding && !hasGroundingOverlap([raw?.activityType, raw?.scenario, ...evidence].join(' '), grounding)) {
    issues.push('course-grounding');
  }
  for (const [index, evidenceItem] of evidence.entries()) {
    if (grounding && !hasGroundingOverlap(evidenceItem, grounding)) issues.push(`evidence-${index + 1}-grounding`);
  }

  return [...new Set(issues)];
}

export function normalizeExperientialActivityBlueprint(
  raw = {},
  { expectedLessonIds = [], promptLesson = {}, facts = [] } = {},
) {
  const roles = list(raw?.roles).map((role) => ({
    name: compact(role?.name),
    goal: compact(role?.goal),
    constraint: compact(role?.constraint),
    privateInformation: compact(role?.privateInformation),
  }));
  const updates = list(raw?.updates).map((update) => ({
    title: compact(update?.title),
    information: compact(update?.information),
    requiredDecision: compact(update?.requiredDecision),
  }));
  const candidate = {
    protocol: EXPERIENTIAL_ACTIVITY_PROTOCOL,
    lessonId: compact(raw?.lessonId),
    activityType: collapseRepeatedRequestedActivityForm(
      groundGenericActivityType(raw?.activityType, promptLesson),
      promptLesson,
    ),
    scenario: completeActivityScenario(raw?.scenario, roles, updates),
    roles,
    evidence: list(raw?.evidence).map(compact).filter(Boolean),
    updates,
    artifact: {
      title: compact(raw?.artifact?.title),
      requirements: list(raw?.artifact?.requirements).map(compact).filter(Boolean),
    },
    timing: list(raw?.timing).map((row) => ({
      phase: compact(row?.phase),
      minutes: row?.minutes,
    })),
    debriefPrompts: list(raw?.debriefPrompts).map(compact).filter(Boolean),
    safetyBoundary: compact(raw?.safetyBoundary),
  };
  const issues = lintExperientialActivityBlueprint(candidate, {
    expectedLessonIds,
    promptLesson,
    facts,
  });
  const blueprint =
    issues.length === 0
      ? {
          ...candidate,
          evidence: uniqueStrings(candidate.evidence),
          artifact: {
            ...candidate.artifact,
            requirements: uniqueStrings(candidate.artifact.requirements),
          },
          debriefPrompts: uniqueStrings(candidate.debriefPrompts),
          timing: candidate.timing.map((row) => ({ ...row, minutes: Number(row.minutes) })),
        }
      : null;
  return { blueprint, issues };
}
