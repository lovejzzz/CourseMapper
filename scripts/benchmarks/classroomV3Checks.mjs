// Independent evidence checks: no product imports or product quality scores.
// Evaluator annotations are separate from the frozen product input. Passing
// these checks is not a semantic, visual, or classroom acceptance judgment.
import { createHash } from 'node:crypto';

export const CHECKER_VERSION = 'classroom-v3-evidence-checks-1';
const features = [
  'syllabus',
  'lessonPlans',
  'slideDecks',
  'assignments',
  'rubrics',
  'discussions',
  'quizBank',
  'studyGuides',
  'courseFaq',
];
const stable = (value) =>
  JSON.stringify(value, (_, v) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, v[k]]),
        )
      : v,
  );
const digest = (value) => createHash('sha256').update(stable(value)).digest('hex');
const at = (value, path) => path.reduce((v, key) => v?.[key], value);
function occurrenceAt(text, quote, occurrence) {
  let start = -1;
  if (!Number.isInteger(occurrence) || occurrence < 0 || !quote) return -1;
  for (let n = 0; n <= occurrence; n++) {
    start = text.indexOf(quote, start + 1);
    if (start < 0) break;
  }
  return start;
}
function walk(value, visit, path = []) {
  if (!value || typeof value !== 'object') return;
  visit(value, path);
  for (const [key, child] of Object.entries(value)) walk(child, visit, [...path, key]);
}

// A deliberately small arithmetic language. Never evaluate model text as JS.
export function arithmetic(text) {
  const clean = String(text).replace(/\s/g, '');
  if (!clean || clean.length > 300 || /[^\d.+*/()%−–×÷-]/u.test(clean)) throw Error('Unsupported arithmetic');
  const normalized = clean.replace(/[−–]/g, '-').replace(/×/g, '*').replace(/÷/g, '/');
  const tokens = normalized.match(/\d+(?:\.\d+)?|[()+*/%-]/g) || [];
  if (tokens.join('') !== normalized) throw Error('Invalid token');
  let i = 0;
  function atom() {
    let result;
    if (tokens[i] === '-') {
      i++;
      return -atom();
    }
    if (tokens[i] === '(') {
      i++;
      result = sum();
      if (tokens[i++] !== ')') throw Error('Missing parenthesis');
    } else {
      const token = tokens[i++];
      if (!/^\d+(?:\.\d+)?$/.test(token || '')) throw Error('Missing number');
      result = Number(token);
    }
    if (tokens[i] === '%') {
      i++;
      result /= 100;
    }
    return result;
  }
  function product() {
    let v = atom();
    while (['*', '/'].includes(tokens[i])) {
      const op = tokens[i++],
        rhs = atom();
      v = op === '*' ? v * rhs : v / rhs;
    }
    return v;
  }
  function sum() {
    let v = product();
    while (['+', '-'].includes(tokens[i])) {
      const op = tokens[i++],
        rhs = product();
      v = op === '+' ? v + rhs : v - rhs;
    }
    return v;
  }
  const result = sum();
  if (i !== tokens.length || !Number.isFinite(result)) throw Error('Invalid arithmetic');
  return result;
}

export function checkClassroomV3Evidence(project, input, annotations = {}, extras = {}) {
  const checks = [],
    revisions = new Map(),
    taskCopies = new Map();
  const check = (id, pass, location, detail, severity = 'major') =>
    checks.push({ id, status: pass ? 'pass' : 'fail', location, detail, severity });
  const outputs = Object.fromEntries(
    features.map((f) => [f, project?.deliverables?.[f]?.data ?? project?.deliverables?.[f]]),
  );
  const sources = Array.isArray(input?.sources) ? input.sources : [];
  check(
    'input-source-contract',
    sources.length > 0 &&
      sources.every((s) => typeof s.id === 'string' && s.id && typeof s.text === 'string' && s.text.trim()) &&
      new Set(sources.map((s) => s.id)).size === sources.length,
    'input.sources',
    'Independent original source records must be present and uniquely identified.',
  );
  const materialText = (source) => [source.text, `${source.id}: ${source.text}`];
  for (const feature of features) {
    const data = outputs[feature];
    check('material-present', Boolean(data && typeof data === 'object'), feature, 'Actual material data must exist.');
    if (!data) continue;
    for (const task of data.teachingTaskSources || []) {
      const copies = taskCopies.get(task.id) || [];
      copies.push({ feature, task });
      taskCopies.set(task.id, copies);
      const inputMap = new Map();
      check(
        'unique-input-identity',
        new Set((task.inputs || []).map((r) => r.id)).size === task.inputs?.length,
        `${feature}.${task.id}`,
        'Source IDs may not be duplicated.',
      );
      for (const record of task.inputs || []) {
        const original = sources.filter((s) => materialText(s).includes(record.text));
        check(
          'source-verbatim',
          original.length === 1,
          `${feature}.${task.id}.${record.id}`,
          'Source must exactly match one original record (optional original ID prefix).',
          'critical',
        );
        if (original.length === 1) inputMap.set(record.id, { record, original: original[0] });
      }
      for (const role of Object.keys(annotations.bindings?.[task.id] || {}))
        check(
          'reviewed-binding-present',
          Boolean(task.operationPlan?.bindings?.[role]),
          `${feature}.${task.id}.${role}`,
          'An independently required source role may not be omitted.',
        );
      for (const [role, span] of Object.entries(task.operationPlan?.bindings || {})) {
        const record = inputMap.get(span?.inputId)?.record;
        const valid =
          record &&
          Number.isInteger(span.start) &&
          Number.isInteger(span.end) &&
          span.start >= 0 &&
          span.end > span.start &&
          span.end <= record.text.length;
        check(
          'source-span',
          Boolean(valid),
          `${feature}.${task.id}.${role}`,
          'Binding must address a nonempty original source span.',
          'critical',
        );
        const expected = annotations.bindings?.[task.id]?.[role];
        if (expected)
          check(
            'source-role-attribution',
            Boolean(
              valid &&
              inputMap.get(span.inputId).original.id === expected.sourceId &&
              record.text.slice(span.start, span.end) === expected.quote,
            ),
            `${feature}.${task.id}.${role}`,
            'Compare source identity and quotation with independent role review.',
            'critical',
          );
        if (expected?.occurrence !== undefined) {
          const original = inputMap.get(span?.inputId)?.original;
          const offset = valid ? record.text.length - original.text.length : 0;
          check(
            'source-role-occurrence',
            Boolean(valid && occurrenceAt(original.text, expected.quote, expected.occurrence) === span.start - offset),
            `${feature}.${task.id}.${role}`,
            'The quotation must identify the independently reviewed occurrence, not another identical count.',
            'critical',
          );
        }
      }
    }
    walk(data, (row, path) => {
      if (Array.isArray(row.sourceEvidenceBrief?.claims)) {
        const permitted = [...sources.flatMap(materialText), ...(annotations.additionalSourceTexts || [])];
        for (const [index, claim] of row.sourceEvidenceBrief.claims.entries())
          check(
            'displayed-source-verbatim',
            permitted.includes(claim),
            `${feature}.${path.join('.')}.sourceEvidenceBrief.claims.${index}`,
            'Displayed evidence must match the original packet or an independently reviewed additional case.',
            'critical',
          );
      }
      if (typeof row.taskId === 'string' && typeof row.taskRevision === 'string') {
        const list = revisions.get(row.taskId) || [];
        list.push({ feature, path, revision: row.taskRevision });
        revisions.set(row.taskId, list);
      }
    });
  }
  check(
    'shared-task-present',
    taskCopies.size > 0,
    'materials',
    'Material presence alone does not prove a common task.',
  );
  for (const [id, copies] of taskCopies) {
    check(
      'shared-source-consistency',
      new Set(copies.map((c) => digest(c.task))).size === 1,
      id,
      'All stored task source copies must agree.',
    );
    check(
      'shared-source-coverage',
      new Set(copies.map((c) => c.feature)).size === features.length,
      id,
      'Every derived material must retain the shared task source.',
    );
  }
  for (const [id, copies] of revisions)
    check(
      'material-revision-consistency',
      new Set(copies.map((c) => c.revision)).size === 1,
      id,
      'Mixed task revisions need review; retained conflicts do not count as fully synchronized.',
    );
  for (const expected of annotations.scoring || []) {
    const row = at(outputs, expected.path),
      actual = row?.criteria?.map((c) => c.criterionId);
    check(
      'scoring-coverage',
      Array.isArray(actual) && stable([...actual].sort()) === stable([...expected.requirementIds].sort()),
      expected.path.join('.'),
      'Scoring must contain exactly the independently reviewed assigned requirements.',
    );
  }
  for (const expected of annotations.answers || []) {
    const text = at(outputs, expected.path);
    // Reviewers identify actual reference-answer fields, excluding quoted
    // misconceptions and student question stems from arithmetic truth checks.
    const equation = typeof text === 'string' ? text.match(new RegExp(expected.equationPattern))?.[0] : null;
    let valid = false;
    try {
      const values = equation?.split('=').map(arithmetic);
      const result = arithmetic(expected.independentExpression);
      valid = values?.length >= 2 && values.every((v) => Math.abs(v - result) <= (expected.tolerance ?? 0.00005));
    } catch {
      /* Failed/unsupported equations remain failures, never passes. */
    }
    check(
      'independent-answer-calculation',
      Boolean(valid),
      expected.path.join('.'),
      'All sides of the selected answer equation must equal an independently supplied calculation.',
      'critical',
    );
  }
  for (const assertion of annotations.exactValues || [])
    check(
      assertion.id,
      stable(at(outputs, assertion.path)) === stable(assertion.expected),
      assertion.path.join('.'),
      'Independent review of an actual stored value.',
    );
  for (const transition of extras.transitions || []) {
    for (const path of transition.preservePaths || [])
      check(
        'teacher-content-preserved',
        at(transition.before, path) !== undefined &&
          stable(at(transition.before, path)) === stable(at(transition.after, path)),
        `${transition.id}.${path.join('.')}`,
        'Compare actual before/after teacher-owned content.',
        'critical',
      );
    if (transition.applied)
      check(
        'stale-preview-rejected',
        transition.previewRevision === transition.currentRevision,
        transition.id,
        'An applied preview must target the current revision.',
        'critical',
      );
  }
  for (const artifact of extras.studentExports || []) {
    check(
      'student-export-readable',
      typeof artifact.text === 'string' && artifact.text.trim().length > 0,
      artifact.name,
      'Text must be extracted from the actual exported artifact.',
    );
    for (const forbidden of artifact.teacherOnlyText || [])
      check(
        'student-answer-isolation',
        !artifact.text?.includes(forbidden),
        artifact.name,
        'An independently identified teacher-only passage must not appear in the student artifact.',
        'critical',
      );
  }
  return {
    version: CHECKER_VERSION,
    projectSha256: digest(project),
    inputSha256: digest(input),
    annotationsSha256: digest(annotations),
    checks,
    failures: checks.filter((c) => c.status === 'fail'),
    educationalAcceptance: 'pending',
    coverage: {
      roleAttribution: annotations.bindings ? 'annotated-roles-only' : 'pending',
      scoring: annotations.scoring?.length ? 'annotated-requirements-only' : 'pending',
      answers: annotations.answers?.length ? 'annotated-equations-only' : 'pending',
      transitions: extras.transitions?.length ? 'provided-snapshots-only' : 'pending',
      studentIsolation: extras.studentExports?.length ? 'identified-passages-only' : 'pending',
      semanticReview: 'pending',
      visualReview: 'pending',
    },
    limitation:
      'This checker cannot establish semantic role correctness, rubric fairness, or exported layout without independent annotations and review. No product acceptance rate is calculated.',
  };
}
