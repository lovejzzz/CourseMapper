/**
 * kernelSchema.js — CurriculumOS V1: the concept kernel contract.
 *
 * A concept kernel is the atom of the Curriculum Genome — universal,
 * source-anchored disciplinary knowledge keyed by a stable `discipline/slug`
 * id. Lessons compose kernels; kernels never depend on a course.
 *
 * This module validates and normalizes kernels at every boundary: foundry
 * output, shard load, contribution candidates, and the local cache. A kernel
 * that does not validate never reaches the compiler.
 *
 * See docs/CURRICULUMOS_V1_DESIGN.md §3.
 */

export const TRUST_TIERS = {
  MODEL: 0, // T0 — never enters the genome; lives only inside one course
  CONSENSUS: 1, // T1 — multi-model agreement
  SOURCE_ANCHORED: 2, // T2 — citation + verbatim quote found in source
  INSTRUCTOR_VERIFIED: 3, // T3 — verified instructor confirmed in-app
  EDITORIAL: 4, // T4 — curated golden set
};

export const TRUST_TIER_LABELS = {
  0: 'AI-generated — review before use',
  1: 'machine-verified',
  2: 'source-cited',
  3: 'instructor-verified',
  4: 'editorially pinned',
};

const DISCIPLINE_SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*\/[a-z0-9]+(?:-[a-z0-9]+)*$/;
const VALID_LEVELS = new Set(['intro', 'intermediate', 'advanced']);
const EDGE_KINDS = ['requires', 'recommends', 'refines', 'contrasts'];

function cleanText(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function asArray(value) {
  return Array.isArray(value) ? value : value === undefined || value === null || value === '' ? [] : [value];
}

function normalizeAnchor(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const src = cleanText(raw.src);
  const quote = cleanText(raw.quote);
  if (!src || quote.length < 12) return null; // an anchor without a real quote is not an anchor
  return { src, loc: cleanText(raw.loc), quote };
}

function tierFor(raw, hasAnchor) {
  const tier = Number(raw?.tier);
  if (Number.isInteger(tier) && tier >= 0 && tier <= 4) return tier;
  return hasAnchor ? TRUST_TIERS.SOURCE_ANCHORED : TRUST_TIERS.CONSENSUS;
}

function normalizeFact(raw) {
  const text = cleanText(raw?.text ?? raw);
  if (text.length < 12) return null;
  const anchor = normalizeAnchor(raw?.anchor);
  return {
    text,
    anchor,
    tier: tierFor(raw, Boolean(anchor)),
    verifiedBy: Math.max(0, Number(raw?.verifiedBy) || 0),
    contested: raw?.contested === true,
  };
}

function normalizeMisconception(raw) {
  const text = cleanText(raw?.text ?? raw);
  if (text.length < 12) return null;
  const anchor = normalizeAnchor(raw?.anchor);
  return {
    text,
    corrective: cleanText(raw?.corrective),
    anchor,
    tier: tierFor(raw, Boolean(anchor)),
  };
}

function normalizeExample(raw) {
  const text = cleanText(raw?.text ?? raw);
  if (text.length < 8) return null;
  return { text, domain: cleanText(raw?.domain), anchor: normalizeAnchor(raw?.anchor) };
}

// v0.13.3: quantitative worked example — a numeric problem solved step by
// step, authored once per concept (the genome buys math once; the compiler
// projects it into lesson plans and study guides).
function normalizeWorkedExample(raw) {
  const problem = cleanText(raw?.problem);
  const steps = asArray(raw?.steps).map(cleanText).filter(Boolean);
  const result = cleanText(raw?.result);
  if (problem.length < 15 || steps.length < 2 || !result) return null;
  return { problem, steps, result, anchor: normalizeAnchor(raw?.anchor) };
}

function normalizeMcItem(raw, factCount, misconceptionCount) {
  const stem = cleanText(raw?.stem ?? raw?.question);
  const options = asArray(raw?.options).map(cleanText).filter(Boolean);
  const answerIndex = Number(raw?.answerIndex);
  if (stem.length < 12 || options.length !== 4) return null;
  if (!Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex >= options.length) return null;
  // explanation/rationales reference the kernel's own facts/misconceptions by
  // index (knowledge stored once); out-of-range refs are dropped to null.
  const explanationFactRef =
    Number.isInteger(raw?.explanationFactRef) && raw.explanationFactRef >= 0 && raw.explanationFactRef < factCount
      ? raw.explanationFactRef
      : null;
  const rationaleRefs = asArray(raw?.rationaleRefs).map((ref) =>
    Number.isInteger(ref) && ref >= 0 && ref < misconceptionCount ? ref : null,
  );
  return { stem, options, answerIndex, explanationFactRef, rationaleRefs };
}

const ARCHETYPE_ID_RE = /^(?:structure|method|epistemic|interpretive|process)\/[a-z0-9]+(?:-[a-z0-9]+)*$/;

function normalizeInstanceOf(raw) {
  // Layer 2: a concept's instanceOf edges link it to archetypes with an
  // explicit slot mapping (the discipline skin). The mapping is grounded-lint
  // checked at composition time; here we just keep well-formed entries.
  return asArray(raw)
    .map((entry) => {
      const archetype = cleanText(entry?.archetype).toLowerCase();
      if (!ARCHETYPE_ID_RE.test(archetype)) return null;
      const mapping =
        entry?.mapping && typeof entry.mapping === 'object'
          ? Object.fromEntries(Object.entries(entry.mapping).map(([slot, fill]) => [slot, cleanText(fill)]))
          : {};
      const confidence = Number(entry?.confidence);
      return {
        archetype,
        confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0.7,
        mapping,
        verified: entry?.verified === true,
      };
    })
    .filter(Boolean);
}

function normalizeEdges(raw) {
  const edges = {};
  for (const kind of EDGE_KINDS) {
    const ids = asArray(raw?.[kind])
      .map(cleanText)
      .filter((id) => DISCIPLINE_SLUG_RE.test(id));
    if (ids.length > 0) edges[kind] = [...new Set(ids)];
  }
  const instanceOf = normalizeInstanceOf(raw?.instanceOf);
  if (instanceOf.length > 0) edges.instanceOf = instanceOf;
  return edges;
}

/**
 * Validate + normalize a raw kernel. Returns the clean kernel or null with a
 * reason list. A kernel is usable when it has an id, a term, a definition, and
 * at least some teachable substance (facts or an MC bank).
 */
export function normalizeConceptKernel(raw) {
  const issues = [];
  const id = cleanText(raw?.id).toLowerCase();
  if (!DISCIPLINE_SLUG_RE.test(id)) issues.push('bad-id');
  const term = cleanText(raw?.term);
  if (term.length < 2) issues.push('term-missing');

  const definitionText = cleanText(raw?.definition?.text ?? raw?.definition);
  const definitionAnchor = normalizeAnchor(raw?.definition?.anchor);
  if (definitionText.length < 20) issues.push('definition-too-short');

  const facts = asArray(raw?.facts).map(normalizeFact).filter(Boolean);
  const misconceptions = asArray(raw?.misconceptions).map(normalizeMisconception).filter(Boolean);
  const examples = asArray(raw?.examples).map(normalizeExample).filter(Boolean);
  const workedExamples = asArray(raw?.workedExamples).map(normalizeWorkedExample).filter(Boolean);
  const mcBank = asArray(raw?.mcBank)
    .map((item) => normalizeMcItem(item, facts.length, misconceptions.length))
    .filter(Boolean);

  if (facts.length === 0 && mcBank.length === 0) issues.push('no-substance');
  if (issues.length > 0) return { kernel: null, issues };

  const discipline = id.split('/')[0];
  const level = VALID_LEVELS.has(raw?.level) ? raw.level : 'intro';
  const difficulty = Math.max(1, Math.min(5, Number(raw?.difficulty) || 2));

  return {
    kernel: {
      id,
      rev: Math.max(1, Number(raw?.rev) || 1),
      term,
      aliases: [...new Set(asArray(raw?.aliases).map(cleanText).filter(Boolean))],
      discipline,
      tags: [...new Set(asArray(raw?.tags).map(cleanText).filter(Boolean))],
      level,
      difficulty,
      bloomCeiling: cleanText(raw?.bloomCeiling) || 'Analyze',
      definition: {
        text: definitionText,
        anchor: definitionAnchor,
        tier: tierFor(raw?.definition, Boolean(definitionAnchor)),
        verifiedBy: Math.max(0, Number(raw?.definition?.verifiedBy) || 0),
      },
      facts,
      misconceptions,
      examples,
      workedExamples,
      mcBank,
      edges: normalizeEdges(raw?.edges),
      variants: asArray(raw?.variants),
      freshness:
        raw?.freshness && typeof raw.freshness === 'object'
          ? {
              sourceEdition: cleanText(raw.freshness.sourceEdition),
              reviewBy: cleanText(raw.freshness.reviewBy),
              volatility: ['low', 'annual', 'fast-moving'].includes(raw.freshness.volatility)
                ? raw.freshness.volatility
                : 'low',
            }
          : { sourceEdition: '', reviewBy: '', volatility: 'low' },
      license: cleanText(raw?.license) || 'CC-BY-4.0',
      attribution: asArray(raw?.attribution).map(cleanText).filter(Boolean),
      // v0.14 P2: competency/standards tags — curated, link-checked, never
      // model-asserted. Each: { framework, code, label, url }.
      standards: asArray(raw?.standards).map(normalizeStandard).filter(Boolean),
    },
    issues: [],
  };
}

function normalizeStandard(raw) {
  const framework = cleanText(raw?.framework);
  const code = cleanText(raw?.code);
  if (!framework || !code) return null;
  return {
    framework,
    code,
    label: cleanText(raw?.label),
    url: cleanText(raw?.url),
  };
}

/** The highest trust tier present across a kernel's atoms (for display/audit). */
export function kernelTrustTier(kernel) {
  if (!kernel) return TRUST_TIERS.MODEL;
  const tiers = [
    kernel.definition?.tier ?? 0,
    ...asArray(kernel.facts).map((fact) => fact.tier ?? 0),
    ...asArray(kernel.misconceptions).map((misconception) => misconception.tier ?? 0),
  ];
  return tiers.length > 0 ? Math.max(...tiers) : TRUST_TIERS.MODEL;
}

/** True when every fact and the definition carry a usable source anchor. */
export function kernelIsFullyAnchored(kernel) {
  if (!kernel) return false;
  if (!kernel.definition?.anchor) return false;
  const facts = asArray(kernel.facts);
  return facts.length > 0 && facts.every((fact) => Boolean(fact.anchor));
}

export function isValidConceptId(id) {
  // Strict: a canonical id is already lowercase discipline/slug. The normalizer
  // lowercases lenient input; this validates the canonical form.
  return DISCIPLINE_SLUG_RE.test(cleanText(id));
}
