const normalize = (value) =>
  String(value || '')
    .normalize('NFKC')
    .replace(/\s+/g, '')
    .toLowerCase();

/** A treatment setting cannot include the selected competing setting. Also
 * usable while other proposal fields are still missing or malformed. */
export function comparisonConditionOverlapIssues(bindings) {
  return ['first', 'second'].flatMap((prefix) => {
    const treatment = bindings[`${prefix}Treatment`],
      other = bindings[`${prefix}Other`];
    return treatment &&
      other &&
      treatment.inputId === other.inputId &&
      Math.max(treatment.start, other.start) < Math.min(treatment.end, other.end)
      ? [
          {
            code: 'plan-comparison-role',
            binding: `${prefix}Treatment`,
            message: `The ${prefix}Treatment and ${prefix}Other excerpts overlap. Quote the treatment setting separately from the competing setting.`,
          },
        ]
      : [];
  });
}

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
  issues.push(...comparisonConditionOverlapIssues(plan.bindings));
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
