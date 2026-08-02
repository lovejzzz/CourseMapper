const RESEARCH_LINEAGE_SOURCES = new Set(['algi-researched', 'scion-source-researched']);

const DATA_PACKET_TEMPLATES = [
  (term) => `the ${term} dataset record, transformation log, competing claims, and documented uncertainty`,
  (term) => `the ${term} data extract, cleaning record, rival interpretations, and stated uncertainty limit`,
  (term) => `the ${term} dataset excerpt, documented transformation steps, alternative claims, and scope note`,
  (term) => `the ${term} source data, processing log, competing explanations, and recorded uncertainty boundary`,
  (term) => `the ${term} data sample, change history, candidate conclusions, and evidence-limit note`,
  (term) => `the ${term} supplied records, documented transformations, competing readings, and uncertainty statement`,
];

const COMPACT_DATA_PACKET_TEMPLATES = [
  (term) => `the ${term} data records behind Claim A and Claim B, the transformation log, and the claim under review`,
  (term) => `the ${term} dataset excerpts for Claim A and Claim B, the cleaning record, and the disputed conclusion`,
  (term) => `the ${term} source rows for Claim A and Claim B, the processing note, and the claim boundary`,
];

function clean(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function stableVariantIndex(value, size) {
  let hash = 2166136261;
  for (const char of String(value || '')) {
    hash ^= char.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % size;
}

export function buildDataScenarioMaterials(term, variantSeed = term, { compact = false } = {}) {
  const subject = clean(term) || 'lesson';
  const templates = compact ? COMPACT_DATA_PACKET_TEMPLATES : DATA_PACKET_TEMPLATES;
  return templates[stableVariantIndex(variantSeed, templates.length)](subject);
}

function researchPayloadLineage(payload) {
  return clean(payload?.conceptProvenance?.source || payload?.enrichmentSource).toLowerCase();
}

function isCompilerDataScenario(scenario) {
  if (clean(scenario?.source) !== 'derived-kernel-fallback') return false;
  const materials = clean(scenario?.materials);
  return (
    /\b(?:data|dataset|records?)\b/i.test(materials) &&
    /\b(?:cleaning|change|processing|transformation|transformations)\b/i.test(materials)
  );
}

function registerResearchPayload(payload, materials) {
  if (!payload || typeof payload !== 'object') return;
  if (!RESEARCH_LINEAGE_SOURCES.has(researchPayloadLineage(payload))) return;
  const scenario = payload?.kernel?.scenario;
  if (!isCompilerDataScenario(scenario)) return;
  const value = clean(scenario.materials);
  const term = clean(payload?.keyTerms?.[0]?.term) || 'lesson';
  materials.set(value, term);
}

/** Authorize only derived data packets carried by a research-backed graph. */
export function collectCompilerScenarioMaterials(courseGraph) {
  const materials = new Map();
  const lessonContent = courseGraph?.enrichmentOverlay?.lessonContent;
  if (lessonContent && typeof lessonContent === 'object') {
    Object.values(lessonContent).forEach((payload) => registerResearchPayload(payload, materials));
  }
  for (const concept of Array.isArray(courseGraph?.concepts) ? courseGraph.concepts : []) {
    registerResearchPayload(concept?.kernel, materials);
  }
  return materials;
}

export function compactCompilerScenarioMaterials(value, { authorizedMaterials = null, variantSeed = '' } = {}) {
  if (typeof value !== 'string' || !(authorizedMaterials instanceof Map) || authorizedMaterials.size === 0) {
    return value;
  }
  let repaired = value;
  const authorized = [...authorizedMaterials.entries()].sort(([left], [right]) => right.length - left.length);
  for (const [materials, term] of authorized) {
    if (!materials || !repaired.includes(materials)) continue;
    repaired = repaired.split(materials).join(buildDataScenarioMaterials(term, `${variantSeed}:${term}`));
  }
  return repaired;
}
