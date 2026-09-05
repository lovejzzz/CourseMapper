import { sha256HexSync } from './sha256Sync';

export const FUNCTIONAL_VISUAL_TASK_CONTRACT_PROTOCOL = 'coursemapper-functional-visual-task-contract-v1';

function clean(value = '') {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function hashPayload(value) {
  return sha256HexSync(canonicalJson(value));
}

export function functionalVisualConstructFamily(concept = '', secondary = '') {
  const normalized = `${clean(concept)} ${clean(secondary)}`.toLowerCase();
  if (/perspective|framing|viewpoint|crop|vanishing/.test(normalized)) return 'frame-perspective-comparison';
  if (/ethic|context|attribution|provenance|interpret|caption|representation/.test(normalized)) {
    return 'context-boundary-comparison';
  }
  if (/color|contrast|tone|value|saturation|legib|accessib/.test(normalized)) {
    return 'contrast-encoding-comparison';
  }
  if (/hierarch|priority|emphasis|salien|rank|sequence|focal|attention/.test(normalized)) return 'hierarchy-ranking';
  if (/composition|balance|alignment|layout|space|proportion/.test(normalized)) return 'spatial-composition';
  return 'evidence-relationship';
}

const CONTRACT_DEFINITIONS = Object.freeze({
  'spatial-composition': {
    observableIds: ['primary-mass', 'secondary-mass', 'focal-anchor', 'thirds-frame'],
    predicates: [
      { id: 'primary-exceeds-secondary', operator: 'area-greater-than', left: 'primary-mass', right: 'secondary-mass' },
      {
        id: 'primary-directs-attention',
        operator: 'directed-relation',
        from: 'primary-mass',
        relationType: 'directs-attention-to',
        to: 'focal-anchor',
      },
      {
        id: 'secondary-counterbalances',
        operator: 'directed-relation',
        from: 'secondary-mass',
        relationType: 'counterbalances',
        to: 'primary-mass',
      },
    ],
    counterexample: {
      stateId: 'secondary-counterweight-state',
      baseState: { expectedPredicateOutcomes: { 'primary-exceeds-secondary': true } },
      mutation: { operator: 'scale', entityId: 'secondary-mass', widthFactor: 2, heightFactor: 2 },
      expectedPredicateOutcomes: { 'primary-exceeds-secondary': false },
    },
  },
  'frame-perspective-comparison': {
    observableIds: ['frame-wide', 'frame-tight', 'subject-wide', 'subject-tight', 'vanishing-point'],
    predicates: [
      { id: 'subjects-match', operator: 'same-size', left: 'subject-wide', right: 'subject-tight', tolerance: 0.01 },
      { id: 'wide-subject-contained', operator: 'contained-by', inner: 'subject-wide', outer: 'frame-wide' },
      { id: 'tight-subject-contained', operator: 'contained-by', inner: 'subject-tight', outer: 'frame-tight' },
      { id: 'frames-differ', operator: 'dimensions-differ', left: 'frame-wide', right: 'frame-tight', tolerance: 0.01 },
      {
        id: 'tight-frame-reframes',
        // A frame contains the subject it reframes. Arrow direction between
        // nested boxes is not a meaningful or stable rendered measurement;
        // the differing frame geometry and containment predicates carry the
        // visual evidence while this predicate binds the declared relation.
        operator: 'declared-relation',
        from: 'frame-tight',
        relationType: 'reframes',
        to: 'subject-tight',
      },
    ],
    counterexample: {
      stateId: 'tight-frame-state',
      baseState: { expectedPredicateOutcomes: { 'frames-differ': true } },
      mutation: { operator: 'copy-geometry', entityId: 'frame-tight', fromEntityId: 'frame-wide' },
      expectedPredicateOutcomes: { 'frames-differ': false },
    },
  },
  'context-boundary-comparison': {
    observableIds: ['image-a', 'image-b', 'image-token-a', 'image-token-b', 'context-card', 'missing-card'],
    predicates: [
      { id: 'tokens-match', operator: 'same-size', left: 'image-token-a', right: 'image-token-b', tolerance: 0.01 },
      { id: 'context-labels-differ', operator: 'text-differs', left: 'context-card', right: 'missing-card' },
      { id: 'token-a-contained', operator: 'contained-by', inner: 'image-token-a', outer: 'image-a' },
      { id: 'token-b-contained', operator: 'contained-by', inner: 'image-token-b', outer: 'image-b' },
      {
        id: 'context-changes-boundary',
        operator: 'directed-relation',
        from: 'context-card',
        relationType: 'changes-claim-boundary',
        to: 'image-b',
      },
    ],
    counterexample: {
      stateId: 'withheld-context-state',
      baseState: { expectedPredicateOutcomes: { 'context-labels-differ': true } },
      mutation: { operator: 'copy-text', entityId: 'context-card', fromEntityId: 'missing-card' },
      expectedPredicateOutcomes: { 'context-labels-differ': false },
    },
  },
  'contrast-encoding-comparison': {
    observableIds: ['field-high', 'field-low', 'mark-high', 'mark-low'],
    predicates: [
      { id: 'marks-match', operator: 'same-size', left: 'mark-high', right: 'mark-low', tolerance: 0.01 },
      { id: 'mark-styles-match', operator: 'same-style', left: 'mark-high', right: 'mark-low' },
      {
        id: 'high-contrast-exceeds-low',
        operator: 'contrast-greater-than',
        leftForeground: 'mark-high',
        leftBackground: 'field-high',
        rightForeground: 'mark-low',
        rightBackground: 'field-low',
        tolerance: 0.1,
      },
      { id: 'high-mark-contained', operator: 'contained-by', inner: 'mark-high', outer: 'field-high' },
      { id: 'low-mark-contained', operator: 'contained-by', inner: 'mark-low', outer: 'field-low' },
      {
        id: 'high-separation-bound',
        // Tonal separation is encoded by matched marks, fill contrast, and
        // containment—not by a spatial arrow from a mark to its containing
        // field. Require the typed relation to be rendered without inventing
        // a geometric direction for a non-directional construct.
        operator: 'declared-relation',
        from: 'mark-high',
        relationType: 'tonal-separation',
        to: 'field-high',
      },
      {
        id: 'low-separation-bound',
        operator: 'declared-relation',
        from: 'mark-low',
        relationType: 'tonal-separation',
        to: 'field-low',
      },
    ],
    counterexample: {
      stateId: 'low-separation-state',
      baseState: { expectedPredicateOutcomes: { 'high-contrast-exceeds-low': true } },
      mutation: { operator: 'copy-style', entityId: 'field-high', fromEntityId: 'field-low' },
      expectedPredicateOutcomes: { 'high-contrast-exceeds-low': false },
    },
  },
  'hierarchy-ranking': {
    observableIds: ['rank-1', 'rank-2', 'rank-3', 'attention-anchor'],
    predicates: [
      { id: 'rank-1-exceeds-rank-2', operator: 'area-greater-than', left: 'rank-1', right: 'rank-2' },
      { id: 'rank-2-exceeds-rank-3', operator: 'area-greater-than', left: 'rank-2', right: 'rank-3' },
      {
        id: 'rank-1-precedes-rank-2',
        operator: 'directed-relation',
        from: 'rank-1',
        relationType: 'precedes',
        to: 'rank-2',
      },
      {
        id: 'rank-2-precedes-rank-3',
        operator: 'directed-relation',
        from: 'rank-2',
        relationType: 'precedes',
        to: 'rank-3',
      },
    ],
    counterexample: {
      stateId: 'tertiary-attention-state',
      baseState: { expectedPredicateOutcomes: { 'rank-2-exceeds-rank-3': true } },
      mutation: { operator: 'scale', entityId: 'rank-3', widthFactor: 2, heightFactor: 2 },
      expectedPredicateOutcomes: { 'rank-2-exceeds-rank-3': false },
    },
  },
  'evidence-relationship': {
    observableIds: ['evidence-a', 'evidence-b', 'claim-anchor'],
    predicates: [
      {
        id: 'primary-supports',
        operator: 'directed-relation',
        from: 'evidence-a',
        relationType: 'supports',
        to: 'claim-anchor',
      },
      {
        id: 'comparison-qualifies',
        operator: 'directed-relation',
        from: 'evidence-b',
        relationType: 'qualifies',
        to: 'claim-anchor',
      },
    ],
    counterexample: {
      stateId: 'qualifying-evidence-state',
      baseState: { expectedPredicateOutcomes: { 'comparison-qualifies': true } },
      mutation: { operator: 'reverse-relation', relationId: 'b-qualifies-claim' },
      expectedPredicateOutcomes: { 'comparison-qualifies': false },
    },
  },
});

export function buildFunctionalVisualTaskContract({
  lessonNumber,
  lessonTitle,
  objectives = [],
  concept,
  secondary,
  productActions = [],
  learnerArtifact,
  successCriterion,
} = {}) {
  const constructFamily = functionalVisualConstructFamily(concept, secondary);
  const definition = CONTRACT_DEFINITIONS[constructFamily];
  const upstreamRequirement = {
    lessonNumber: Number(lessonNumber),
    lessonTitle: clean(lessonTitle),
    objectives: [...new Set((Array.isArray(objectives) ? objectives : [objectives]).map(clean).filter(Boolean))],
    conceptBinding: clean(concept),
    secondaryBinding: clean(secondary),
    processAction: 'analyze',
    productActions: [
      ...new Set((Array.isArray(productActions) ? productActions : [productActions]).map(clean).filter(Boolean)),
    ],
    learnerArtifact: clean(learnerArtifact),
    successCriterion: clean(successCriterion),
  };
  const upstreamRequirementSha256 = hashPayload(upstreamRequirement);
  const body = {
    protocol: FUNCTIONAL_VISUAL_TASK_CONTRACT_PROTOCOL,
    contractId: `VTC-L${String(Number(lessonNumber)).padStart(2, '0')}`,
    lessonNumber: Number(lessonNumber),
    upstreamRequirement,
    upstreamRequirementSha256,
    constructFamily,
    observables: definition.observableIds.map((selector) => ({
      id: `observable:${selector}`,
      renderedSelector: `cmEntity_${selector}`,
      entityId: selector,
      measurement: 'normalized-slide-geometry',
      units: 'percent-of-specimen-canvas',
      tolerance: 0.01,
    })),
    predicates: definition.predicates,
    counterexample: { required: true, ...definition.counterexample },
    inference: {
      id: `inference:${constructFamily}`,
      predicateIds: definition.predicates.map((predicate) => predicate.id),
      validityBoundary:
        'Predicate satisfaction supports only the frozen task inference; disciplinary validity requires separate attestation.',
    },
    claimBoundary:
      'This generator-authored contract can prove source-record identity, compiler-to-render consistency, predicate direction, and counterexample presence. It cannot establish disciplinary relevance or pedagogical validity.',
  };
  return { ...body, contractSha256: hashPayload(body) };
}

export function buildFunctionalVisualInstructionalIntent(input = {}) {
  const contract = buildFunctionalVisualTaskContract(input);
  const concept = clean(input.concept || input.lessonTitle || 'the visual construct');
  const artifact = clean(input.learnerArtifact || 'evidence-based visual annotation');
  const productActions = contract.upstreamRequirement.productActions;
  const productAction = productActions.length > 1 ? productActions.join(' or ') : productActions[0] || 'annotate';
  const observableLabels = contract.observables
    .slice(0, 4)
    .map((observable) => observable.entityId.replace(/-/g, ' '))
    .join(', ');
  const construct = contract.constructFamily.replace(/-/g, ' ');
  const objectiveFrames = {
    'spatial-composition': `Measure the primary-to-secondary mass relationship in a concrete ${concept} specimen and defend a composition claim in ${artifact} after testing its counterweight state.`,
    'hierarchy-ranking': `Rank the visible attention cues in a concrete ${concept} specimen and defend where its hierarchy changes in ${artifact} after testing the first cue reversal.`,
    'contrast-encoding-comparison': `Compare measured high- and low-separation states in a concrete ${concept} specimen and justify the legibility boundary in ${artifact} after testing the contrast reversal.`,
    'frame-perspective-comparison': `Trace what wide and tight boundaries include or exclude in a concrete ${concept} specimen and justify the reframing claim in ${artifact} after testing the alternate view.`,
    'context-boundary-comparison': `Distinguish what contextual evidence permits or prevents in a concrete ${concept} specimen and bound the ethical interpretation in ${artifact} after testing the context-removed state.`,
    'evidence-relationship': `Map the visible evidence paths in a concrete ${concept} specimen and justify only the supported relationship in ${artifact} after testing the counterexample path.`,
  };
  const learnerActions = {
    'spatial-composition': `On the matched ${concept} specimen, ${productAction} the primary and secondary masses; then test the counterweight state and explain how the measured area relationship changes the interpretation.`,
    'hierarchy-ranking': `Rank the visible attention cues in the matched ${concept} specimen, ${productAction} the first break in that order, and use the counterexample to explain which size relationship changed.`,
    'contrast-encoding-comparison': `Compare the matched high- and low-separation ${concept} fields, ${productAction} the evidence that changes legibility, and use the counterexample to identify the measured contrast reversal.`,
    'frame-perspective-comparison': `Trace the wide and tight boundaries in the matched ${concept} views, ${productAction} what the reframing includes or excludes, and use the counterexample to explain the changed interpretation.`,
    'context-boundary-comparison': `Audit the matched ${concept} images with and without contextual evidence, ${productAction} the claim boundary that changes, and use the counterexample to state what can no longer be inferred.`,
    'evidence-relationship': `Map the two visible evidence paths in the matched ${concept} specimen, ${productAction} how each path supports or qualifies the claim, and use the counterexample to bound the inference.`,
  };
  return {
    kind: 'functional-visual',
    objective:
      objectiveFrames[contract.constructFamily] ||
      `Map the visible evidence paths in a concrete ${construct} specimen for ${concept} and justify only the supported relationship in ${artifact}.`,
    learnerAction: learnerActions[contract.constructFamily],
    evidenceRequirement: `The ${artifact} must identify ${observableLabels}, test the declared visual relationship, compare the counterexample state, and preserve the supplied attribution or original-native disclosure.`,
    taskContract: contract,
  };
}

export function functionalVisualTaskContractHash(contract = {}) {
  const body = { ...contract };
  delete body.contractSha256;
  return hashPayload(body);
}

export function functionalVisualUpstreamRequirementHash(requirement = {}) {
  return hashPayload(requirement);
}
