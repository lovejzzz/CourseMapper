import { canonicalJson } from './canonicalJson.js';
import { sha256HexSync } from './sha256Sync.js';

const object = (value) => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const text = (value) => typeof value === 'string' && Boolean(value.trim());
const digest = (value) => sha256HexSync(canonicalJson(value));

/** These are references to the existing CourseGraph outcomes, not a second
 * editable curriculum. A digest detects a changed or recycled target ID. */
export function teachingOutcomeRevision(outcome) {
  return digest({
    id: outcome.id,
    text: outcome.text,
    label: outcome.label || '',
    level: outcome.level || '',
    sessionRef: outcome.sessionRef || null,
  });
}

export function teachingOutcomeChoices(graph, lessonNumber) {
  const sessions = new Map((graph?.sessions || []).map((session) => [session.id, session]));
  return (graph?.outcomes || [])
    .filter(
      (outcome) =>
        text(outcome?.id) &&
        text(outcome?.text) &&
        (outcome.level === 'course' || sessions.get(outcome.sessionRef)?.number === lessonNumber),
    )
    .map((outcome) => ({
      id: outcome.id,
      text: outcome.text,
      label: outcome.label || '',
      level: outcome.level || 'session',
      revision: teachingOutcomeRevision(outcome),
    }));
}

export function teachingRequirementRevision(requirements) {
  // Reweighting an unchanged performance does not silently change what goal
  // it supports. Adding/removing/rewording a performance does require review.
  return digest(requirements.map(({ weight: _weight, ...requirement }) => requirement));
}

export function editableTeachingGoalAlignment(value) {
  return (
    object(value) &&
    value.version === 1 &&
    Array.isArray(value.targets) &&
    value.targets.every((target) => object(target) && text(target.outcomeRef) && text(target.revision)) &&
    Array.isArray(value.requirementLinks) &&
    value.requirementLinks.every(
      (link) =>
        object(link) && text(link.requirementId) && Array.isArray(link.outcomeRefs) && link.outcomeRefs.every(text),
    )
  );
}

/** Structural checks cannot prove that a student performance satisfies the
 * meaning of a target. The teacher reviews that relationship in the UI. */
export function validateTeachingGoalAlignment(value, requirements, objective) {
  const issues = [];
  const push = (code, message) => issues.push({ code, message });
  if (!Array.isArray(requirements) || requirements.some((entry) => !object(entry) || !text(entry.id)))
    return {
      valid: false,
      issues: [
        { code: 'goal-alignment-requirements', message: 'The task requirements need review before linking targets.' },
      ],
    };
  if (!editableTeachingGoalAlignment(value))
    return {
      valid: false,
      issues: [
        {
          code: 'goal-alignment-shape',
          message: 'The learning-target links cannot be read. Review the target selection.',
        },
      ],
    };
  const targetIds = value.targets.map((target) => target.outcomeRef);
  const requirementIds = requirements.map((requirement) => requirement.id);
  const linkedIds = value.requirementLinks.map((link) => link.requirementId);
  if (!targetIds.length || new Set(targetIds).size !== targetIds.length)
    push('goal-alignment-targets', 'Choose identified learning targets without duplicate references.');
  if (
    linkedIds.length !== requirementIds.length ||
    new Set(linkedIds).size !== linkedIds.length ||
    requirementIds.some((id) => !linkedIds.includes(id))
  )
    push('goal-alignment-requirements', 'Link each current teaching requirement to its learning target.');
  const used = new Set();
  for (const link of value.requirementLinks) {
    if (
      !link.outcomeRefs.length ||
      new Set(link.outcomeRefs).size !== link.outcomeRefs.length ||
      link.outcomeRefs.some((id) => !targetIds.includes(id))
    )
      push(
        'goal-alignment-requirement-target',
        `Requirement ${link.requirementId} needs valid learning-target references.`,
      );
    link.outcomeRefs.forEach((id) => used.add(id));
  }
  if (targetIds.some((id) => !used.has(id)))
    push('goal-alignment-unused-target', 'A selected target has no corresponding teaching requirement.');
  if (value.objective !== objective || value.requirementRevision !== teachingRequirementRevision(requirements))
    push(
      'goal-alignment-stale-performances',
      'Review the target links against the current task objective and requirements.',
    );
  return { valid: !issues.length, issues };
}

export function checkTeachingGoalAlignment(value, requirements, objective, graph, lessonNumber) {
  const checked = validateTeachingGoalAlignment(value, requirements, objective);
  if (!checked.valid) return checked;
  const choices = new Map(teachingOutcomeChoices(graph, lessonNumber).map((choice) => [choice.id, choice]));
  const issues = value.targets.flatMap((target) => {
    const current = choices.get(target.outcomeRef);
    if (!current)
      return [
        {
          code: 'goal-alignment-missing-target',
          message: 'A linked learning target is no longer available for this lesson. Review its current targets.',
        },
      ];
    if (current.revision !== target.revision)
      return [
        {
          code: 'goal-alignment-changed-target',
          message: `The learning target “${current.text}” changed. Review which requirements and practice now support it.`,
        },
      ];
    return [];
  });
  return { valid: !issues.length, issues };
}

/** Called while preparing an explicit review; never refreshes a stale target
 * reference by itself. The UI must show and reselect its current version. */
export function prepareTeachingGoalAlignment(value, requirements, objective, graph, lessonNumber) {
  const candidate = {
    ...structuredClone(value),
    objective,
    requirementRevision: teachingRequirementRevision(requirements),
  };
  const checked = checkTeachingGoalAlignment(candidate, requirements, objective, graph, lessonNumber);
  if (!checked.valid) throw new Error(checked.issues.map((issue) => issue.message).join(' '));
  return candidate;
}

export function reconcileTeachingGoalLinks(value, requirements) {
  const links = requirements.map((requirement) => ({
    requirementId: requirement.id,
    outcomeRefs: value.requirementLinks.find((link) => link.requirementId === requirement.id)?.outcomeRefs || [],
  }));
  const used = new Set(links.flatMap((link) => link.outcomeRefs));
  return { ...value, requirementLinks: links, targets: value.targets.filter((target) => used.has(target.outcomeRef)) };
}
