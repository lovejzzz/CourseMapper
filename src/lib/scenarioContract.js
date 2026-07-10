const GENERIC_MATERIALS_RE =
  /^(?:the\s+)?(?:scenario|case|lesson|course|source)?\s*(?:evidence|materials?|example|data|text|artifact)s?\.?$/i;

const DECISION_RE =
  /\b(?:decid(?:e|es|ed|ing)|choos(?:e|es|ing)|select(?:s|ed|ing)?|recommend(?:s|ed|ing|ation)?|prioriti[sz](?:e|es|ed|ing)|determin(?:e|es|ed|ing)|revise|revision|next step|respond|resolve|which\b[^?.]{0,60}\b(?:best|next|remains?|requires?|should|warrants?)|whether)\b/i;
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
  ['data', /\b(?:data|dataset|metric|rate|tim(?:e|es|ing)|score|measurement)\b/i],
  ['record', /\b(?:record|log|transcript|interview|survey|report|result|finding|comment|response|quote|note)s?\b/i],
  [
    'design',
    /\b(?:prototype|wireframe|mockup|interface|screen|form|flow|map|diagram|passage|text|policy|plan|profile)s?\b/i,
  ],
  ['claim', /\b(?:claim|interpretation|misconception|correction|example|case)\b/i],
];

function text(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function wordCount(value) {
  return text(value).match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g)?.length || 0;
}

function ensureSentence(value) {
  const cleaned = text(value).replace(/[.!?]+$/, '');
  return cleaned ? `${cleaned}.` : '';
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
  return wordCount(materialText) >= 4 && !GENERIC_MATERIALS_RE.test(materialText);
}

export function analyzeDecisionScenario(scenario) {
  const setup = text(scenario?.setup || scenario?.su);
  const materials = text(scenario?.materials || scenario?.ma);
  const combined = `${setup} ${materials}`.trim();
  const evidenceKinds = EVIDENCE_KINDS.filter(([, pattern]) => pattern.test(combined)).map(([kind]) => kind);
  const segments = materialSegments(materials);
  const explicitDecision = DECISION_RE.test(setup);
  const actionableProblem = ACTIONABLE_PROBLEM_RE.test(setup);
  const checks = {
    context: wordCount(setup) >= 20,
    decision: explicitDecision || actionableProblem,
    evidencePacket: evidenceKinds.length >= 2 || (evidenceKinds.length >= 1 && segments.length >= 2),
    tension: TENSION_RE.test(setup) || actionableProblem || explicitDecision,
    materials: isConcreteScenarioMaterials(materials),
  };
  const issueByCheck = {
    context: setup ? 'scenario-context-too-thin' : 'scenario-missing',
    decision: 'scenario-missing-decision',
    evidencePacket: 'scenario-missing-evidence-packet',
    tension: 'scenario-missing-tension',
    materials: 'scenario-materials-not-concrete',
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

export function deriveDecisionScenario(kernel) {
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

  const fact = [...facts].sort(
    (left, right) =>
      overlap(`${term.term} ${term.definition} ${term.example}`, right) -
      overlap(`${term.term} ${term.definition} ${term.example}`, left),
  )[0];
  const variant = scenarioSeed([term.term, term.example, fact]) % 3;
  const caseSentence = [
    `A reviewer examines this case: ${text(term.example)}`,
    `A team must interpret this case: ${text(term.example)}`,
    `An analyst reviews the following case: ${text(term.example)}`,
  ][variant];
  const comparisonSentence = [
    `One interpretation applies ${text(term.term)}; a competing interpretation repeats the misconception that ${text(term.misconception)}`,
    `The evidence must distinguish ${text(term.term)} from the misconception that ${text(term.misconception)}`,
    `Two readings are on the table: ${text(term.term)}, or the misconception that ${text(term.misconception)}`,
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
    materials: `the ${text(term.term)} case example, the related source claim, and the misconception-correction pair`,
    source: 'derived-kernel-fallback',
  };
  return analyzeDecisionScenario(derived).ready ? derived : null;
}

export function resolveDecisionScenario(kernel) {
  const existing = analyzeDecisionScenario(kernel?.scenario);
  if (existing.ready) {
    return {
      setup: existing.setup,
      materials: existing.materials,
      source: existing.source,
    };
  }
  return deriveDecisionScenario(kernel);
}
