const normalize = (value) =>
  String(value || '')
    .normalize('NFKC')
    .replace(/\s+/g, '')
    .toLowerCase();

/** Check roles and resource arithmetic only. A teacher must still establish
 * that the two records describe comparable units and manipulable conditions. */
export function validateComparisonBindings(plan, values) {
  const issues = [];
  const add = (code, message, binding) => issues.push({ code, message, ...(binding ? { binding } : {}) });
  for (const [role, owner] of [
    ['firstTreatment', 'firstRecord'],
    ['firstOther', 'firstRecord'],
    ['secondTreatment', 'secondRecord'],
    ['secondOther', 'secondRecord'],
    ...['factor', 'otherFactor', 'unit', 'availableUnits', 'controls', 'measurement', 'outcome'].map((role) => [
      role,
      'designRecord',
    ]),
  ]) {
    if (plan.bindings[role]?.inputId !== plan.bindings[owner]?.inputId)
      add('plan-record-ownership', `The ${role} must come from the ${owner}.`, role);
  }
  const ids = ['firstRecord', 'secondRecord', 'designRecord'].map((role) => plan.bindings[role]?.inputId);
  if (new Set(ids).size !== 3)
    add('plan-comparison-records', 'Use separate records for the two observed conditions and the new-test resources.');
  for (const [a, b] of [
    ['firstTreatment', 'secondTreatment'],
    ['firstOther', 'secondOther'],
    ['factor', 'otherFactor'],
  ]) {
    if (values[a] && values[b] && normalize(values[a]) === normalize(values[b]))
      add('plan-comparison-contrast', `The ${a} and ${b} do not describe distinct conditions or factors.`, b);
  }
  for (const [a, b] of [
    ['firstTreatment', 'firstOther'],
    ['secondTreatment', 'secondOther'],
  ]) {
    const first = plan.bindings[a],
      second = plan.bindings[b];
    if (first && second && first.inputId === second.inputId && first.start === second.start && first.end === second.end)
      add('plan-comparison-role', 'The treatment and competing condition cannot reuse the same source occurrence.', b);
  }
  if (/^\d+$/.test(values.availableUnits || '') && Number(values.availableUnits) < 4)
    add(
      'plan-comparison-replication',
      'This procedure needs at least four independent assignable units, with at least two per treatment.',
      'availableUnits',
    );
  if (plan.admission?.kind === 'legacy-explicit-rule')
    add(
      'plan-comparison-review',
      'Review the manipulable conditions, experimental units and measurement before admitting this comparison.',
    );
  return issues;
}

export function evaluateComparison(values) {
  const total = Number(values.availableUnits);
  const first = Math.floor(total / 2),
    second = total - first;
  return {
    allocation: { total, first, second, unit: values.unit, method: 'random-shuffle-with-fixed-group-counts' },
    steps: [
      {
        id: 'observed-conditions',
        uses: ['firstRecord', 'secondRecord', 'firstTreatment', 'secondTreatment', 'firstOther', 'secondOther'],
        result: {
          treatment: [values.firstTreatment, values.secondTreatment],
          otherCondition: [values.firstOther, values.secondOther],
        },
      },
      {
        id: 'confounded-effect',
        dependsOn: ['observed-conditions'],
        uses: ['factor', 'otherFactor', 'outcome'],
        result: { effect: 'not-isolated', alternativeExplanation: values.otherFactor },
      },
      {
        id: 'proposed-allocation',
        uses: ['designRecord', 'unit', 'availableUnits'],
        result: { total, first, second, measuredResults: 'not-supplied' },
      },
      {
        id: 'proposed-comparison',
        dependsOn: ['confounded-effect', 'proposed-allocation'],
        uses: ['controls', 'measurement', 'outcome'],
        result: {
          commonOtherSetting: values.firstOther,
          treatment: [values.firstTreatment, values.secondTreatment],
          outcome: values.outcome,
          futureEffect: 'unknown',
        },
      },
    ],
  };
}
