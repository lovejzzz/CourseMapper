const GENERIC_MATERIALS_RE =
  /^(?:the\s+)?(?:scenario|case|lesson|course|source)?\s*(?:evidence|materials?|example|data|text|artifact)s?\.?$/i;

const SCENARIO_TEMPLATE_RESIDUE = new Set([
  'a concrete two sentence subject context with an actionable problem and one real constraint',
  'the specific notation recording data records design or passage students inspect',
]);

const DECISION_RE =
  /\b(?:decid(?:e|es|ed|ing)|choos(?:e|es|ing)|select(?:s|ed|ing)?|recommend(?:s|ed|ing|ation)?|prioriti[sz](?:e|es|ed|ing)|determin(?:e|es|ed|ing)|classif(?:y|ies|ied|ying|ication)|label(?:s|ed|ing)?|nam(?:e|es|ed|ing)|identif(?:y|ies|ied|ying)|infer(?:s|red|ring|ence)?|revise|revision|next step|respond|resolve|which\b[^?.]{0,60}\b(?:best|next|remains?|requires?|should|warrants?)|whether)\b/i;
const ACTIONABLE_PROBLEM_RE =
  /\b(?:bottleneck|complaint|conflict|constraint|delay(?:s|ed)?|difficult(?:y|ies)?|error|fail(?:s|ed|ure)?|missing|unclear|confus(?:e|ed|ing|ion)|cannot|unable|low[- ]contrast|misread(?:ing)?|skip(?:s|ped|ping)?|slow(?:er|down)?|wait(?:s|ed|ing)?|risk|problem|trade-?off|uncertain|unsure)\b/i;
const TENSION_RE =
  /\b(?:but|however|while|whereas|although|between|versus|vs\.?|either|or|whether|trade-?off|constraint|conflict|cannot|must decide|which)\b/i;

const EVIDENCE_KINDS = [
  [
    'number',
    /\b\d+(?:\.\d+)?(?:%|:\d+|\s+(?:participants?|users?|minutes?|seconds?|hours?|days?|weeks?|items?|records?))?\b/i,
  ],
  ['quote', /["“”][^"“”]{3,}["“”]/],
  ['observation', /\b(?:observ(?:e|es|ed|ation|ations)|behavior|behaviour|field notes?)\b/i],
  ['data', /\b(?:data|dataset|metric|rate|tim(?:e|es|ing)|score|measurements?|counts?|distances?|steps?)\b/i],
  ['record', /\b(?:record|log|transcript|interview|survey|report|result|finding|comment|response|quote|note)s?\b/i],
  [
    'design',
    /\b(?:prototype|wireframe|mockup|interface|screen|form|flow|map|diagram|notation|passage|text|policy|plan|profile)s?\b/i,
  ],
  ['claim', /\b(?:claim|interpretation|misconception|correction|example|case)\b/i],
];

function text(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function scenarioTemplateIdentity(value) {
  return text(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasScenarioTemplateResidue(setup, materials) {
  return [setup, materials].some((value) => {
    const identity = scenarioTemplateIdentity(value);
    return (
      /^replace\b/.test(identity) ||
      /\b(?:inspectable\s+)?source\s+detail\s+(?:one|two)\b/.test(identity) ||
      SCENARIO_TEMPLATE_RESIDUE.has(identity)
    );
  });
}

function wordCount(value) {
  return text(value).match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g)?.length || 0;
}

function ensureSentence(value) {
  const cleaned = text(value).replace(/[.!?]+$/, '');
  return cleaned ? `${cleaned}.` : '';
}

function learnerFacingMisconception(value) {
  const raw = text(value).replace(/[.!?]+$/, '');
  const withoutNarrator = raw
    .replace(/^(?:students?|learners?)\s+(?:(?:often|sometimes|may|might|mistakenly)\s+)?/i, '')
    .replace(/^(?:assume|think|believe|expect|conclude)(?:\s+that)?\s+/i, '');
  return withoutNarrator || raw;
}

function sentenceCase(value) {
  const cleaned = text(value);
  return cleaned ? cleaned.charAt(0).toUpperCase() + cleaned.slice(1) : '';
}

function contentWords(value) {
  return new Set(
    text(value)
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, ' ')
      .split(/\s+/)
      .filter((word) => word.length >= 4),
  );
}

function overlap(left, right) {
  const leftWords = contentWords(left);
  const rightWords = contentWords(right);
  let count = 0;
  for (const word of leftWords) if (rightWords.has(word)) count += 1;
  return count;
}

function materialSegments(value) {
  return text(value)
    .split(/\s*(?:,|;|\band\b)\s*/i)
    .map(text)
    .filter((segment) => wordCount(segment) >= 2);
}

export function isConcreteScenarioMaterials(value) {
  const materialText = text(value);
  return (
    wordCount(materialText) >= 4 &&
    !GENERIC_MATERIALS_RE.test(materialText) &&
    !hasScenarioTemplateResidue('', materialText)
  );
}

export function analyzeDecisionScenario(scenario, { evaluationProfile = 'current' } = {}) {
  const setup = text(scenario?.setup || scenario?.su);
  const materials = text(scenario?.materials || scenario?.ma);
  const combined = `${setup} ${materials}`.trim();
  const evidenceKinds = EVIDENCE_KINDS.filter(([, pattern]) => pattern.test(combined)).map(([kind]) => kind);
  const segments = materialSegments(materials);
  // The public prompt deliberately allows the decision, evidence, and
  // constraint to be distributed across su and ma. Validate that combined
  // contract instead of falsely rejecting a concrete labeling/selection ask
  // merely because it appears in the materials sentence.
  const decisionSurface = evaluationProfile === 'v0.16.58' ? setup : combined;
  const explicitDecision = DECISION_RE.test(decisionSurface);
  const actionableProblem = ACTIONABLE_PROBLEM_RE.test(decisionSurface);
  const templateResidue = hasScenarioTemplateResidue(setup, materials);
  const checks = {
    context: wordCount(setup) >= 20,
    decision: explicitDecision || actionableProblem,
    evidencePacket: evidenceKinds.length >= 2 || (evidenceKinds.length >= 1 && segments.length >= 2),
    tension: TENSION_RE.test(decisionSurface) || actionableProblem || explicitDecision,
    materials: isConcreteScenarioMaterials(materials),
  };
  const issueByCheck = {
    context: setup ? 'scenario-context-too-thin' : 'scenario-missing',
    decision: 'scenario-missing-decision',
    evidencePacket: 'scenario-missing-evidence-packet',
    tension: 'scenario-missing-tension',
    materials: templateResidue ? 'scenario-template-residue' : 'scenario-materials-not-concrete',
  };
  const issues = Object.entries(checks)
    .filter(([, passed]) => !passed)
    .map(([check]) => issueByCheck[check]);
  return {
    ready: issues.length === 0,
    setup,
    materials,
    checks,
    issues,
    evidenceKinds,
    materialSegmentCount: segments.length,
    templateResidue,
    source: text(scenario?.source) || 'authored',
  };
}

export function lintDecisionScenario(scenario) {
  return analyzeDecisionScenario(scenario).issues;
}

function scenarioSeed(parts) {
  const value = parts.map(text).join('|');
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  return hash;
}

function deriveFactLedgerComparisonScenario(term, facts, { compactFactLedgerScenarios = true } = {}) {
  if (term?.source !== 'fact-ledger-projection' || facts.length < 3) return null;
  if (compactFactLedgerScenarios) {
    const [claimA, claimB] = facts;
    const derived = {
      setup: [
        ensureSentence(`Claim A: ${claimA}`),
        ensureSentence(`Claim B: ${claimB}`),
        ensureSentence(
          'Identify the course concept that best organizes these claims, explain how the claims differ or connect, and state what they do not establish',
        ),
      ].join(' '),
      materials: 'the two supplied claim cards labeled Claim A and Claim B',
      source: 'derived-kernel-fallback',
    };
    return analyzeDecisionScenario(derived).ready ? derived : null;
  }

  const claims = facts.slice(0, 3);
  const labeledClaims = claims.map((fact, index) =>
    ensureSentence(`Claim ${String.fromCharCode(65 + index)}: ${fact}`),
  );
  const derived = {
    setup: [
      ensureSentence(`A student is evaluating three supplied claims about ${text(term.term)}`),
      ...labeledClaims,
      ensureSentence(
        'The student must decide whether the claims support one conclusion, expose a tension, or require a qualified answer, then identify what remains unresolved',
      ),
    ].join(' '),
    materials: 'the three supplied claim cards labeled Claim A, Claim B, and Claim C',
    source: 'derived-kernel-fallback',
  };
  return analyzeDecisionScenario(derived).ready ? derived : null;
}

export function deriveDecisionScenario(kernel, { compactFactLedgerScenarios = true } = {}) {
  const terms = Array.isArray(kernel?.keyTerms) ? kernel.keyTerms : [];
  const term = terms.find(
    (candidate) =>
      text(candidate?.term) &&
      text(candidate?.example) &&
      text(candidate?.misconception) &&
      text(candidate?.correction),
  );
  const facts = Array.isArray(kernel?.facts) ? kernel.facts.map(text).filter(Boolean) : [];
  if (!term || facts.length === 0) return null;

  const factLedgerScenario = deriveFactLedgerComparisonScenario(term, facts, { compactFactLedgerScenarios });
  if (factLedgerScenario) return factLedgerScenario;

  const exampleIdentity = scenarioTemplateIdentity(term.example);
  const distinctFacts = facts.filter((candidate) => scenarioTemplateIdentity(candidate) !== exampleIdentity);
  const fact = [...(distinctFacts.length > 0 ? distinctFacts : facts)].sort(
    (left, right) =>
      overlap(`${term.term} ${term.definition} ${term.example}`, right) -
      overlap(`${term.term} ${term.definition} ${term.example}`, left),
  )[0];
  const misconception = learnerFacingMisconception(term.misconception);
  const syntheticPeerContrast = /\bare interchangeable descriptions(?: of the same concept)?\b/i.test(misconception);
  const variant = scenarioSeed([term.term, term.example, fact]) % 3;
  const caseSentence = [
    `A reviewer examines this case: ${text(term.example)}`,
    `A team must interpret this case: ${text(term.example)}`,
    `An analyst reviews the following case: ${text(term.example)}`,
  ][variant];
  // Algi creates a source-grounded peer contrast when an article states no
  // misconception of its own. That contrast already receives one dedicated
  // correction item in the quiz. Repeating the same sentence inside the case
  // turns the scenario into a second misconception check; use the admitted
  // facts to test claim scope instead.
  const comparisonSentence = syntheticPeerContrast
    ? [
        `One interpretation applies ${text(term.term)} only to the supplied evidence; a competing interpretation extends the conclusion to an unexamined neighbouring concept`,
        `The evidence must distinguish a bounded use of ${text(term.term)} from a broader claim the supplied facts do not establish`,
        `Two readings are on the table: one stays within the documented scope of ${text(term.term)}, while the other treats the evidence as universally transferable`,
      ][variant]
    : [
        `One interpretation applies ${text(term.term)}; a competing interpretation follows this mistaken claim: ${sentenceCase(misconception)}`,
        `The evidence must distinguish ${text(term.term)} from this misconception: ${sentenceCase(misconception)}`,
        `Two readings are on the table: ${text(term.term)}, or this misconception: ${sentenceCase(misconception)}`,
      ][variant];
  const decisionSentence = [
    'The reviewer must decide which interpretation the evidence supports and what it cannot establish',
    'The team must choose the defensible interpretation and name the boundary of the supplied evidence',
    'The analyst must determine which reading is supported and what additional evidence would still be needed',
  ][variant];

  const derived = {
    setup: [
      ensureSentence(caseSentence),
      ensureSentence(comparisonSentence),
      ensureSentence(`The record also states: ${fact}`),
      ensureSentence(decisionSentence),
    ].join(' '),
    // This label is rendered in lesson plans and study guides. Keep it useful
    // to a learner: implementation language such as "misconception-correction
    // pair" and repeating the term ("Connect X to the X case") made an
    // otherwise strong source-grounded activity sound machine-assembled.
    materials: 'the source-backed case example, related claim, and claim-boundary note',
    source: 'derived-kernel-fallback',
  };
  return analyzeDecisionScenario(derived).ready ? derived : null;
}

export function resolveDecisionScenario(kernel, { compactFactLedgerScenarios = true } = {}) {
  const existing = analyzeDecisionScenario(kernel?.scenario);
  if (existing.ready) {
    return {
      setup: existing.setup,
      materials: existing.materials,
      source: existing.source,
    };
  }
  return deriveDecisionScenario(kernel, { compactFactLedgerScenarios });
}
