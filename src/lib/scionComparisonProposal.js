export const SCION_COMPARISON_PROPOSAL_PROTOCOL = 'scion-comparison-source-groups-v2';
export const LEGACY_SCION_COMPARISON_PROPOSAL_PROTOCOL = 'scion-comparison-source-groups-v1';

const observationFields = ['treatment', 'otherSetting'];
const designFields = ['factor', 'otherFactor', 'unit', 'availableUnits', 'controls', 'measurement', 'outcome'];
const record = (value) => value && typeof value === 'object' && !Array.isArray(value);

export function comparisonProposalFieldPath(role) {
  return (
    {
      firstRecord: 'firstObservation.source',
      secondRecord: 'secondObservation.source',
      designRecord: 'newTest.source',
      firstTreatment: 'firstObservation.treatment',
      firstOther: 'firstObservation.otherSetting',
      secondTreatment: 'secondObservation.treatment',
      secondOther: 'secondObservation.otherSetting',
    }[role] || (designFields.includes(role) ? `newTest.${role}` : role)
  );
}

/** Transport grouping supplies source ownership, never semantic approval. The
 * shared assessor still verifies every quote and the complete operation. */
export function normalizeComparisonProposal(value, protocol = SCION_COMPARISON_PROPOSAL_PROTOCOL) {
  const legacy = protocol === LEGACY_SCION_COMPARISON_PROPOSAL_PROTOCOL;
  const observationKeys = legacy ? ['observations'] : ['firstObservation', 'secondObservation'];
  const fail = () => {
    throw new Error(
      `Return only ${observationKeys.join(', ')}, newTest and unknowns, using the specified source and phrase fields.`,
    );
  };
  if (
    !record(value) ||
    Object.keys(value).some((key) => ![...observationKeys, 'newTest', 'unknowns'].includes(key)) ||
    (legacy
      ? !Array.isArray(value.observations) || value.observations.length !== 2
      : observationKeys.some((key) => !Object.hasOwn(value, key))) ||
    !Object.hasOwn(value, 'newTest')
  )
    fail();
  const bindings = {};
  const group = (value, owner, roles) => {
    if (value === null) {
      bindings[owner] = null;
      for (const target of Object.values(roles)) bindings[target] = null;
      return;
    }
    if (
      !record(value) ||
      typeof value.source !== 'string' ||
      Object.keys(value).some((key) => key !== 'source' && !Object.hasOwn(roles, key))
    )
      fail();
    bindings[owner] = { source: value.source };
    for (const [field, target] of Object.entries(roles)) {
      const quote = value[field];
      if (quote === null) bindings[target] = null;
      else if (typeof quote === 'string') bindings[target] = { source: value.source, quote };
      else if (record(quote) && Object.keys(quote).every((key) => ['quote', 'occurrence'].includes(key)))
        bindings[target] = { source: value.source, quote: quote.quote, occurrence: quote.occurrence };
      else if (!record(quote)) bindings[target] = { source: value.source, quote };
      else fail();
    }
  };
  for (const [index, prefix] of ['first', 'second'].entries())
    group(
      legacy ? value.observations[index] : value[observationKeys[index]],
      `${prefix}Record`,
      Object.fromEntries(observationFields.map((field, i) => [field, `${prefix}${i ? 'Other' : 'Treatment'}`])),
    );
  group(value.newTest, 'designRecord', Object.fromEntries(designFields.map((name) => [name, name])));
  return { bindings, unknowns: value.unknowns };
}
