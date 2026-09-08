import { sha256HexSync } from './sha256Sync.js';
import { solveTeachingProportion } from './teachingTaskArithmetic.js';
import { parseSourceCount, countSpanCutsNumber } from './sourceCount.js';
import { validateComparisonBindings, evaluateComparison } from './teachingOperationComparison.js';
import { validateTeachingGoalAlignment } from './teachingGoalAlignment.js';
import {
  AUTHORED_REQUIREMENTS_PLAN_VERSION,
  performanceSourceRevision,
  validatePerformanceRequirements,
} from './teachingPerformanceRequirements.js';

export const TEACHING_OPERATION_PLAN_VERSION = 1;

/** Check a supplied equality/rounded value beside a bound fraction. A
 * reviewed population label cannot make contradictory arithmetic valid. */
function sourceFractionIssue(text, numerator, denominator, values) {
  const first = numerator.start < denominator.start ? numerator : denominator;
  const second = first === numerator ? denominator : numerator;
  const pair = /^\s*\/\s*$/.test(text.slice(first.end, second.start));
  if (pair && first !== numerator) return 'The selected roles reverse the fraction stated in the source.';
  const touchesSlash = (span) => /\/\s*$/.test(text.slice(0, span.start)) || /^\s*\//.test(text.slice(span.end));
  if (
    (!pair && [numerator, denominator].some(touchesSlash)) ||
    (pair && (/\/\s*$/.test(text.slice(0, first.start)) || /^\s*\//.test(text.slice(second.end))))
  )
    return 'Bind a single part/whole fraction, not a fragment of a nested fraction.';
  if (!pair || !/^\d{1,9}$/.test(values.numerator) || !/^\d{1,9}$/.test(values.denominator)) return null;
  const n = BigInt(values.numerator),
    d = BigInt(values.denominator);
  if (d === 0n) return null; // Reported by the part/whole precondition.
  let tail = text.slice(second.end);
  while (/^\s*[=≈]/.test(tail)) {
    const assertion = tail.match(/^\s*([=≈])\s*(\d{1,12}(?:\.\d{1,18})?)\s*(%)?(?![\d%])/);
    if (!assertion) return 'The source equation needs review; its asserted value cannot be checked.';
    const [, relation, number, percent] = assertion;
    const fraction = number.split('.')[1] || '';
    const scale = 10n ** BigInt(fraction.length);
    const stated = BigInt(number.replace('.', ''));
    const scaled = n * scale * (percent ? 100n : 1n);
    const valid = relation === '=' ? scaled === d * stated : (2n * scaled + d) / (2n * d) === stated;
    if (!valid)
      return 'The source equation contradicts the bound counts or its stated rounding. Review the source before applying it.';
    tail = tail.slice(assertion[0].length);
    if (/^[\d\/%]|^\.[\d]|^[eE][+\-]?\d/.test(tail))
      return 'The source equation contains an unsupported numeric expression.';
  }
  return null;
}

// These are executable input contracts, not topic names or free-form claims
// of correctness. New operations must provide their own premise checks.
export const TEACHING_OPERATION_SPECS = {
  'paired-condition-confound': {
    family: 'experiment',
    taskKind: 'evidence-experiment',
    defaultPracticeMinutes: 25,
    bindings: {
      firstRecord: 'record',
      secondRecord: 'record',
      designRecord: 'record',
      firstTreatment: 'text',
      secondTreatment: 'text',
      firstOther: 'text',
      secondOther: 'text',
      factor: 'text',
      otherFactor: 'text',
      unit: 'text',
      availableUnits: 'count',
      controls: 'text',
      measurement: 'text',
      outcome: 'text',
    },
    requirements: ['evidence', 'reasoning', 'boundary'],
    defaultWeights: [25, 40, 35],
  },
  'observed-proportion': {
    family: 'quantity',
    taskKind: 'source-proportion',
    bindings: {
      countRecord: 'record',
      numerator: 'ratio-count',
      denominator: 'ratio-count',
      observedGroup: 'text',
      countedOutcome: 'text',
      scopeRecord: 'record',
      missingGroup: 'text',
      targetGroup: 'text',
    },
    requirements: ['part-whole', 'conversion', 'scope'],
    defaultWeights: [25, 40, 35],
  },
  'record-amendment': {
    family: 'source-analysis',
    taskKind: 'evidence-source-analysis',
    bindings: {
      priorRecord: 'record',
      amendedRecord: 'record',
      priorValue: 'count',
      amendedValue: 'count',
      priorUnit: 'text',
      amendedUnit: 'text',
      effectiveDate: 'date-text',
      observationLimit: 'record',
    },
    requirements: ['evidence', 'reasoning', 'boundary'],
  },
};

const object = (value) => value && typeof value === 'object' && !Array.isArray(value);
const nonempty = (value) => typeof value === 'string' && Boolean(value.trim());
const issue = (code, message, binding) => ({ code, message, ...(binding ? { binding } : {}) });
export const operationInputRevision = (input) => sha256HexSync(input.text);
const statedDate = (text) =>
  /^(?:\d{4}-\d{2}-\d{2}|\d{1,2} (?:January|February|March|April|May|June|July|August|September|October|November|December)(?: \d{4})?|(?:\d{4}年)?\d{1,2}月\d{1,2}日)$/i.test(
    text,
  );

/** Offsets are UTF-16 string positions, matching the browser editor. A span
 * resolves against one exact input revision; a quote alone is not identity. */
export function validateTeachingOperationPlan(plan, inputs, objective) {
  const issues = [];
  if (!object(plan) || ![TEACHING_OPERATION_PLAN_VERSION, AUTHORED_REQUIREMENTS_PLAN_VERSION].includes(plan.version))
    return { valid: false, issues: [issue('plan-version', 'The teaching operation version is not supported.')] };
  const spec = Object.hasOwn(TEACHING_OPERATION_SPECS, plan.operation)
    ? TEACHING_OPERATION_SPECS[plan.operation]
    : null;
  if (!spec) return { valid: false, issues: [issue('plan-operation', 'This teaching operation is not supported.')] };
  if (
    plan.presentationVersion !== undefined &&
    !(
      plan.operation === 'observed-proportion'
        ? [1, 2, 3]
        : plan.operation === 'paired-condition-confound'
          ? [3, 4]
          : [3]
    ).includes(plan.presentationVersion)
  )
    issues.push(issue('plan-presentation', 'This teaching presentation version is not supported.'));
  if (
    !Array.isArray(inputs) ||
    !inputs.length ||
    inputs.some((input) => !object(input) || !nonempty(input.id) || !nonempty(input.text)) ||
    new Set(inputs.map((input) => input.id)).size !== inputs.length
  )
    return { valid: false, issues: [issue('plan-inputs', 'The operation needs uniquely identified source records.')] };
  if (!object(plan.bindings) || !object(plan.inputRevisions))
    return { valid: false, issues: [issue('plan-bindings', 'The operation has no complete source bindings.')] };
  const byId = new Map(inputs.map((input) => [input.id, input]));
  if (Object.keys(plan.inputRevisions).length !== inputs.length)
    issues.push(issue('plan-source-set', 'The operation was bound to a different set of source records.'));
  for (const input of inputs)
    if (plan.inputRevisions[input.id] !== operationInputRevision(input))
      issues.push(issue('plan-stale-input', `Source ${input.id} has changed since this operation was bound.`));
  const values = {};
  for (const [name, type] of Object.entries(spec.bindings)) {
    const span = plan.bindings[name];
    const input = byId.get(span?.inputId);
    if (
      !input ||
      !Number.isInteger(span.start) ||
      !Number.isInteger(span.end) ||
      span.start < 0 ||
      span.end <= span.start ||
      span.end > input.text.length
    ) {
      issues.push(issue('plan-span', `Locate the ${name} in its source record.`, name));
      continue;
    }
    const text = input.text.slice(span.start, span.end);
    values[name] = text;
    const count = ['count', 'ratio-count'].includes(type) ? parseSourceCount(text) : null;
    if (count !== null && !/^\d{1,9}$/.test(text)) values[name] = String(count);
    if (!text.trim() || (type === 'record' && (span.start !== 0 || span.end !== input.text.length)))
      issues.push(issue('plan-record', `The ${name} must retain its complete source record.`, name));
    if (
      ['count', 'ratio-count'].includes(type) &&
      (count === null ||
        countSpanCutsNumber(input.text, span.start, span.end) ||
        (type === 'count' ? /[\da-z.,+\-−/]/i : /[\da-z.,+\-−]/i).test(input.text[span.start - 1] || '') ||
        (type === 'count' ? /[\da-z.,%+\-−/]/i : /[\da-z%+\-−]/i).test(input.text[span.end] || '') ||
        (type === 'ratio-count' && /^(?:[.,]\d|\s*%)/.test(input.text.slice(span.end))) ||
        /[+\-−]\s*$/.test(input.text.slice(0, span.start)))
    )
      issues.push(
        issue('plan-count', `The ${name} must bind one nonnegative whole count, not an entire sentence.`, name),
      );
    if (type === 'date-text' && (!/\d/.test(text) || text.length > 120 || /[\n\r]/.test(text)))
      issues.push(issue('plan-date', 'Locate the stated effective date; do not infer missing calendar context.', name));
  }
  if (Object.keys(plan.bindings).some((name) => !Object.hasOwn(spec.bindings, name)))
    issues.push(issue('plan-extra-binding', 'This operation contains a binding it does not understand.'));
  if (plan.version === AUTHORED_REQUIREMENTS_PLAN_VERSION) {
    issues.push(...validatePerformanceRequirements(plan, inputs, objective).issues);
    if (plan.admission?.kind === 'legacy-explicit-rule')
      issues.push(issue('performance-admission', 'Authored teaching requirements need their own review.'));
  } else if (
    plan.practiceInputs !== undefined ||
    plan.contentReview !== undefined ||
    !Array.isArray(plan.requirements) ||
    plan.requirements.length !== spec.requirements.length ||
    new Set(plan.requirements.map((entry) => entry?.id)).size !== spec.requirements.length ||
    plan.requirements.some(
      (entry) =>
        !spec.requirements.includes(entry?.id) ||
        !Number.isInteger(entry?.weight) ||
        entry.weight <= 0 ||
        entry.action !== undefined ||
        entry.transfer !== undefined,
    ) ||
    plan.requirements.reduce((sum, entry) => sum + (entry?.weight || 0), 0) !== 100
  )
    issues.push(issue('plan-requirements', 'Each required performance needs one positive scoring weight; total 100.'));
  if (!['legacy-explicit-rule', 'teacher-confirmed', 'model-proposal'].includes(plan.admission?.kind))
    issues.push(issue('plan-admission', 'Record how the teaching relationship was proposed or confirmed.'));
  if (plan.goalAlignment !== undefined)
    issues.push(
      ...validateTeachingGoalAlignment(
        plan.goalAlignment,
        plan.requirements,
        objective ?? plan.goalAlignment?.objective,
      ).issues,
    );
  // The stored provenance is a workflow record, not authenticated proof that
  // a person reviewed an imported project or that its facts are true.
  if (plan.operation === 'paired-condition-confound') issues.push(...validateComparisonBindings(plan, values));
  if (plan.operation === 'observed-proportion') {
    for (const [name, recordName] of [
      ['numerator', 'countRecord'],
      ['denominator', 'countRecord'],
      ['observedGroup', 'countRecord'],
      ['countedOutcome', 'countRecord'],
      ['missingGroup', 'scopeRecord'],
      ['targetGroup', 'scopeRecord'],
    ]) {
      if (plan.bindings[name]?.inputId !== plan.bindings[recordName]?.inputId)
        issues.push(issue('plan-record-ownership', `The ${name} must come from the ${recordName}.`, name));
    }
    const n = Number(values.numerator),
      d = Number(values.denominator);
    if (Number.isFinite(d) && d === 0)
      issues.push(issue('plan-empty-whole', 'An empty observed group has no defined observed proportion.'));
    if (Number.isFinite(n) && Number.isFinite(d) && n > d)
      issues.push(
        issue(
          'plan-subset-count',
          'The counted subset exceeds its observed whole. Reconcile the counts before calculating.',
        ),
      );
    // A source fraction can be bound in either prose or n/d notation, but
    // selecting its digits must not reverse the source's stated relationship.
    const numerator = plan.bindings.numerator,
      denominator = plan.bindings.denominator;
    if (numerator?.inputId === denominator?.inputId && values.countRecord) {
      const text = byId.get(numerator.inputId)?.text || '';
      const problem = sourceFractionIssue(text, numerator, denominator, values);
      if (problem) issues.push(issue('plan-source-fraction', problem));
    }
    if (plan.admission?.kind === 'legacy-explicit-rule')
      issues.push(
        issue('plan-scope-review', 'Observed and missing groups require source-role review before admission.'),
      );
  }
  if (plan.operation === 'record-amendment') {
    for (const [name, recordName] of [
      ['priorValue', 'priorRecord'],
      ['priorUnit', 'priorRecord'],
      ['amendedValue', 'amendedRecord'],
      ['amendedUnit', 'amendedRecord'],
      ['effectiveDate', 'amendedRecord'],
    ])
      if (plan.bindings[name]?.inputId !== plan.bindings[recordName]?.inputId)
        issues.push(issue('plan-record-ownership', `The ${name} must come from the ${recordName}.`, name));
    if (values.priorUnit && values.amendedUnit && values.priorUnit.toLowerCase() !== values.amendedUnit.toLowerCase())
      issues.push(issue('plan-unit-mismatch', 'The two values use different units; specify their relationship first.'));
    if (values.priorValue && values.amendedValue && Number(values.priorValue) === Number(values.amendedValue))
      issues.push(
        issue('plan-no-value-change', 'This operation requires a changed value; review the task relationship.'),
      );
  }
  return { valid: !issues.length, issues, values };
}

export function createTeachingOperationPlan({
  operation,
  inputs,
  bindings,
  admission,
  requirements,
  version = TEACHING_OPERATION_PLAN_VERSION,
  practiceInputs,
  objective,
  goalAlignment,
}) {
  const spec = Object.hasOwn(TEACHING_OPERATION_SPECS, operation) ? TEACHING_OPERATION_SPECS[operation] : null;
  const plan = {
    version,
    operation,
    // Missing replays the original development wording. V2 improves proportion
    // reasoning; V3 also separates study-guide roles. A fresh review opts in,
    // while saved versions remain reproducible for three-way merges.
    presentationVersion: operation === 'paired-condition-confound' ? 4 : 3,
    bindings: structuredClone(bindings),
    inputRevisions: Object.fromEntries(inputs.map((input) => [input.id, operationInputRevision(input)])),
    admission: structuredClone(admission || { kind: 'model-proposal' }),
    ...(goalAlignment !== undefined ? { goalAlignment: structuredClone(goalAlignment) } : {}),
    requirements: structuredClone(
      requirements ||
        (spec?.requirements || []).map((id, index) => ({ id, weight: (spec.defaultWeights || [30, 35, 35])[index] })),
    ),
    ...(version === AUTHORED_REQUIREMENTS_PLAN_VERSION
      ? {
          practiceInputs: structuredClone(practiceInputs),
          contentReview: { sourceRevision: performanceSourceRevision(inputs), objective },
        }
      : {}),
  };
  const result = validateTeachingOperationPlan(plan, inputs);
  if (!result.valid) throw new Error(result.issues.map((entry) => entry.message).join(' '));
  return plan;
}

export function evaluateTeachingOperationPlan(plan, inputs) {
  const validation = validateTeachingOperationPlan(plan, inputs);
  if (!validation.valid) return { status: 'needs-review', issues: validation.issues };
  if (plan.admission.kind === 'model-proposal')
    return {
      status: 'needs-review',
      issues: [
        issue('plan-unconfirmed', 'Review the proposed source roles and relationship before compiling answers.'),
      ],
    };
  if (plan.operation === 'paired-condition-confound') {
    return {
      status: 'ready',
      operation: plan.operation,
      values: validation.values,
      ...evaluateComparison(validation.values),
      scope:
        'Checks source-role structure and proposed group counts; comparability, manipulability and measurement validity require teaching review. A proposed experiment has no observed effect.',
    };
  }
  if (plan.operation === 'observed-proportion') {
    const { numerator, denominator, observedGroup, countedOutcome, missingGroup, targetGroup } = validation.values;
    const calculation = solveTeachingProportion(numerator, denominator);
    if (!calculation)
      return {
        status: 'needs-review',
        issues: [issue('plan-proportion', 'The bound counts cannot form a proportion.')],
      };
    return {
      status: 'ready',
      operation: plan.operation,
      values: validation.values,
      calculation,
      steps: [
        {
          id: 'observed-whole',
          uses: ['countRecord', 'denominator', 'observedGroup'],
          result: { count: denominator, group: observedGroup },
        },
        {
          id: 'observed-part',
          uses: ['countRecord', 'numerator', 'countedOutcome'],
          dependsOn: ['observed-whole'],
          result: { count: numerator, outcome: countedOutcome, subsetOf: observedGroup },
        },
        { id: 'proportion', dependsOn: ['observed-part', 'observed-whole'], result: calculation },
        {
          id: 'population-boundary',
          uses: ['scopeRecord', 'missingGroup', 'targetGroup'],
          dependsOn: ['proportion'],
          result: {
            observedGroup,
            missingGroup,
            targetGroup,
            populationRate: 'not-established',
            missingOutcomes: 'unknown',
          },
        },
      ],
      scope:
        'Exact arithmetic over reviewed part/whole bindings. Sampling validity and source truth require separate review.',
    };
  }
  const { priorValue, amendedValue, priorUnit, effectiveDate } = validation.values;
  return {
    status: 'ready',
    operation: plan.operation,
    values: validation.values,
    steps: [
      {
        id: 'prior-state',
        uses: ['priorRecord', 'priorValue', 'priorUnit'],
        result: { value: priorValue, unit: priorUnit },
      },
      {
        id: 'amended-state',
        uses: ['amendedRecord', 'amendedValue', 'amendedUnit', 'effectiveDate'],
        result: { value: amendedValue, unit: priorUnit, from: effectiveDate },
      },
      {
        id: 'version-relation',
        dependsOn: ['prior-state', 'amended-state'],
        result: { relationship: 'effective-change', earlierRecordDisproved: false },
      },
      {
        id: 'observation-scope',
        uses: ['observationLimit'],
        dependsOn: ['version-relation'],
        result: { applicableVersion: 'unresolved', missing: 'observation-date-and-rule-in-force' },
      },
    ],
    scope: 'Checks the bound operation; source truth and semantic role admission remain separate review questions.',
  };
}

/** Remap parser-local record IDs to persistent task input identities once. */
export function remapTeachingOperationInputs(plan, beforeInputs, nextInputs) {
  if (
    beforeInputs.length !== nextInputs.length ||
    beforeInputs.some((input, index) => input.text !== nextInputs[index].text)
  )
    return null;
  const ids = new Map(beforeInputs.map((input, index) => [input.id, nextInputs[index].id]));
  return {
    ...structuredClone(plan),
    bindings: Object.fromEntries(
      Object.entries(plan.bindings).map(([name, span]) => [name, { ...span, inputId: ids.get(span.inputId) }]),
    ),
    inputRevisions: Object.fromEntries(nextInputs.map((input) => [input.id, operationInputRevision(input)])),
    ...(plan.version === AUTHORED_REQUIREMENTS_PLAN_VERSION
      ? {
          contentReview: { ...plan.contentReview, sourceRevision: performanceSourceRevision(nextInputs) },
        }
      : {}),
  };
}

/** Only a replacement inside one bound count/date is an automatic source
 * transaction. Changing attribution, modality, units, or unknowns invalidates
 * semantic admission. No regex re-routing can silently select another task. */
export function rebindTeachingOperationEdit(plan, beforeInputs, nextInputs) {
  if (!validateTeachingOperationPlan(plan, beforeInputs).valid) return null;
  if (beforeInputs.length !== nextInputs.length) return null;
  // A count edit can also invalidate an authored interpretation. Do not
  // silently re-confirm teacher prose just because arithmetic can be solved.
  if (
    plan.version === AUTHORED_REQUIREMENTS_PLAN_VERSION &&
    performanceSourceRevision(beforeInputs) !== performanceSourceRevision(nextInputs)
  )
    return null;
  let next = structuredClone(plan);
  for (const before of beforeInputs) {
    const after = nextInputs.find((input) => input.id === before.id);
    if (!after || typeof after.text !== 'string') return null;
    if (after.text === before.text) continue;
    let start = 0;
    while (start < before.text.length && start < after.text.length && before.text[start] === after.text[start]) start++;
    let oldEnd = before.text.length,
      newEnd = after.text.length;
    while (oldEnd > start && newEnd > start && before.text[oldEnd - 1] === after.text[newEnd - 1]) {
      oldEnd--;
      newEnd--;
    }
    const candidates = Object.entries(next.bindings).filter(
      ([name, span]) =>
        ['count', 'ratio-count', 'date-text'].includes(TEACHING_OPERATION_SPECS[next.operation].bindings[name]) &&
        span.inputId === before.id &&
        start >= span.start &&
        oldEnd <= span.end,
    );
    if (candidates.length !== 1) return null;
    const [changedName, changedSpan] = candidates[0];
    if (
      TEACHING_OPERATION_SPECS[next.operation].bindings[changedName] === 'date-text' &&
      (!statedDate(before.text.slice(changedSpan.start, changedSpan.end)) ||
        !statedDate(after.text.slice(changedSpan.start, changedSpan.end + newEnd - oldEnd)))
    )
      return null;
    const delta = newEnd - oldEnd;
    for (const span of Object.values(next.bindings)) {
      if (span.inputId !== before.id) continue;
      if (span.start <= start && span.end >= oldEnd) span.end += delta;
      else if (span.start >= oldEnd) {
        span.start += delta;
        span.end += delta;
      } else if (span.end > start) return null;
    }
    next.inputRevisions[before.id] = operationInputRevision(after);
  }
  return validateTeachingOperationPlan(next, nextInputs).valid ? next : null;
}
