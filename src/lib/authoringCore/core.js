import * as compiledValidators from './validators.generated.js';
import lessonSchema from './contracts/lesson-bundle.schema.json' with { type: 'json' };
import requestSchema from './contracts/new-request.schema.json' with { type: 'json' };
import catalog from './contracts/tools.proposed.json' with { type: 'json' };

import { LIMITS, AuthoringError, assert, bytes, canonical, clone } from './primitives.js';
export * from './primitives.js';
export const tools = catalog.tools;
export { lessonSchema, requestSchema };
const validators = new Map([
  [lessonSchema, compiledValidators.lessonBundle],
  [requestSchema, compiledValidators.newRequest],
  ...tools.map((tool, index) => [tool.inputSchema, compiledValidators[`tool${index}`]]),
]);
export function validateShape(schema, value) {
  const validate = validators.get(schema);
  assert(validate, 'UNSUPPORTED_SCHEMA', 'This contract has no compiled validator.');
  assert(
    validate(value),
    'INVALID_INPUT',
    'Content does not match the authoring contract.',
    (validate.errors || []).map((e) => ({ path: e.instancePath, message: e.message })),
  );
}
export function safeInput(value, limit = LIMITS.submitBytes) {
  assert(bytes(value) <= limit, 'PAYLOAD_TOO_LARGE', 'Split the content into smaller lesson submissions.');
  function walk(v, depth = 0) {
    assert(depth < 40, 'INVALID_INPUT', 'Content is nested too deeply.');
    if (typeof v === 'string') {
      assert(
        !/<\s*\/?\s*(script|iframe|object|embed|svg|html)\b|javascript\s*:|\bon\w+\s*=/i.test(v),
        'UNSAFE_CONTENT',
        'Active HTML is not accepted.',
      );
    } else if (v && typeof v === 'object') {
      for (const [key, child] of Object.entries(v)) {
        assert(
          !/^(?:__proto__|prototype|constructor|teacherConfirmed|verified|admitted|ownerUid|accessToken|refreshToken|permissions|applicationReceipt)$/i.test(
            key,
          ),
          'RESERVED_FIELD',
          'Authority fields cannot be supplied by an author.',
        );
        walk(child, depth + 1);
      }
    }
  }
  walk(value);
}
export function validateBundle(bundle, { lesson, sources = [], conceptIds = [] } = {}) {
  safeInput(bundle);
  validateShape(lessonSchema, bundle);
  const issues = [];
  const check = (ok, path, message) => {
    if (!ok) issues.push({ path, message });
  };
  const objectives = new Set(lesson?.objectives.map((o) => o.id) || bundle.objectiveIds);
  check(!lesson || bundle.lessonId === lesson.id, '/lessonId', 'Lesson does not belong to this contract.');
  const concepts = new Set([...conceptIds, ...bundle.concepts.map((c) => c.clientId)]);
  const assessments = new Set(bundle.assessments.map((a) => a.clientId));
  check(
    bundle.objectiveIds.length === objectives.size && new Set(bundle.objectiveIds).size === objectives.size,
    '/objectiveIds',
    'The bundle must cover every objective in its lesson contract.',
  );
  for (const objective of objectives)
    check(
      bundle.assessments.some((a) => a.objectiveIds.includes(objective)),
      '/assessments',
      'Every lesson objective needs an assessment.',
    );
  for (const [index, criterion] of bundle.rubric.entries()) {
    const linked = bundle.assessments.filter((a) => criterion.assessmentClientIds.includes(a.clientId));
    check(
      criterion.objectiveIds.every((o) => linked.some((a) => a.objectiveIds.includes(o))),
      `/rubric/${index}/objectiveIds`,
      'Rubric objectives must belong to the linked assessments.',
    );
  }
  for (const [index, assessment] of bundle.assessments.entries()) {
    const criteria = bundle.rubric.filter((c) => c.assessmentClientIds.includes(assessment.clientId));
    check(
      assessment.objectiveIds.every((o) => criteria.some((c) => c.objectiveIds.includes(o))),
      `/assessments/${index}/objectiveIds`,
      'Each assessed objective needs a linked rubric criterion.',
    );
  }
  for (const [name, items] of Object.entries({
    concepts: bundle.concepts,
    examples: bundle.examples,
    assessments: bundle.assessments,
    rubric: bundle.rubric,
    blocks: bundle.lessonPlan.blocks,
  })) {
    check(new Set(items.map((x) => x.clientId)).size === items.length, `/${name}`, 'Duplicate entity IDs.');
  }
  function walk(v, path = '') {
    if (!v || typeof v !== 'object') return;
    if (v.objectiveIds)
      check(
        v.objectiveIds.every((x) => objectives.has(x)),
        `${path}/objectiveIds`,
        'Unknown objective reference.',
      );
    if (v.assessmentClientIds)
      check(
        v.assessmentClientIds.every((x) => assessments.has(x)),
        `${path}/assessmentClientIds`,
        'Unknown assessment reference.',
      );
    if (v.prerequisiteConceptIds)
      check(
        v.prerequisiteConceptIds.every((x) => concepts.has(x) && x !== v.clientId),
        `${path}/prerequisiteConceptIds`,
        'Unknown or self-referencing prerequisite.',
      );
    if (v.evidenceRefs)
      for (const ref of v.evidenceRefs)
        check(
          sources.some(
            (s) =>
              s.sourceId === ref.sourceId &&
              s.sourceRevision === ref.sourceRevision &&
              s.excerpts?.some((e) => e.excerptId === ref.excerptId),
          ),
          `${path}/evidenceRefs`,
          'Unknown source, revision, or excerpt.',
        );
    for (const [k, child] of Object.entries(v)) walk(child, `${path}/${k}`);
  }
  walk(bundle);
  check(
    bundle.lessonPlan.blocks.reduce((n, b) => n + b.durationMinutes, 0) === bundle.lessonPlan.sessionMinutes,
    '/lessonPlan',
    'Activity times must equal the session duration.',
  );
  check(
    !lesson?.sessionMinutes || bundle.lessonPlan.sessionMinutes === lesson.sessionMinutes,
    '/lessonPlan/sessionMinutes',
    'Duration differs from the request.',
  );
  check(
    Math.abs(bundle.rubric.reduce((n, c) => n + c.weightPercent, 0) - 100) < 0.001,
    '/rubric',
    'Rubric weights must sum to 100.',
  );
  for (const criterion of bundle.rubric)
    check(
      new Set(criterion.bands.map((b) => b.level)).size === 4,
      '/rubric/bands',
      'Each band level must appear once.',
    );
  for (const a of bundle.assessments)
    check(
      bundle.rubric.some((c) => c.assessmentClientIds.includes(a.clientId)),
      '/rubric',
      'Every assessment needs a rubric criterion.',
    );
  assert(!issues.length, 'CONTENT_INVALID', 'Correct the listed content issues.', issues);
  return {
    valid: true,
    warnings: [
      'Content requires teacher review; references are not independent verification.',
      ...bundle.uncertainties.map((u) => u.message),
    ],
  };
}

export function validateConceptGraph(bundles) {
  const nodes = new Map(),
    issues = [];
  for (const bundle of Object.values(bundles)) {
    for (const concept of bundle.concepts) {
      const path = `/lessons/${bundle.lessonId}/concepts/${concept.clientId}`;
      if (nodes.has(concept.clientId))
        issues.push({
          path,
          message:
            'Concept IDs must be unique across the course; refer to a prerequisite instead of redefining its ID.',
        });
      else nodes.set(concept.clientId, { concept, path });
    }
  }
  const state = new Map();
  function visit(key) {
    if (state.get(key) === 'done') return;
    const node = nodes.get(key);
    if (!node) return;
    if (state.get(key) === 'visiting') {
      issues.push({ path: node.path, message: 'Prerequisite concepts form a cycle.' });
      return;
    }
    state.set(key, 'visiting');
    for (const prerequisite of node.concept.prerequisiteConceptIds) {
      if (!nodes.has(prerequisite))
        issues.push({ path: node.path, message: 'Prerequisite concept is missing from the course.' });
      else visit(prerequisite);
    }
    state.set(key, 'done');
  }
  for (const key of nodes.keys()) visit(key);
  assert(!issues.length, 'CONTENT_INVALID', 'Correct the course prerequisite graph.', issues);
  return { valid: true };
}

// Arrays are semantic units: independent reordering/deletion produces a conflict,
// never an index-based merge that attaches answers to another question.
export function mergeThreeWay(base, current, proposed, path = '') {
  if (canonical(current) === canonical(base)) return { value: clone(proposed), conflicts: [] };
  if (canonical(proposed) === canonical(base) || canonical(current) === canonical(proposed))
    return { value: clone(current), conflicts: [] };
  if ([base, current, proposed].every((v) => v && typeof v === 'object' && !Array.isArray(v))) {
    const value = {},
      conflicts = [];
    for (const k of new Set([...Object.keys(base), ...Object.keys(current), ...Object.keys(proposed)])) {
      const next = mergeThreeWay(base[k], current[k], proposed[k], `${path}/${k}`);
      if (next.value !== undefined) value[k] = next.value;
      conflicts.push(...next.conflicts);
    }
    return { value, conflicts };
  }
  return { value: clone(current), conflicts: [{ path, base, current, proposed }] };
}
