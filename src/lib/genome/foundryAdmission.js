/**
 * foundryAdmission.js — CurriculumOS V1: the genome admission gate.
 *
 * The single bar every atom must clear to enter the Curriculum Genome,
 * whether it comes from the OpenStax foundry or an opt-in user contribution:
 *
 *  1. ANCHOR CHECK (the honesty mechanism): a source-anchored atom's verbatim
 *     quote must actually appear in the cited source text. We trust retrieval,
 *     never the model's claim. No quote match → the anchor is stripped and the
 *     atom drops to a lower tier (or is rejected if it claimed T2+).
 *  2. SCHEMA: the kernel normalizes (kernelSchema).
 *  3. ITEM LINT: every MC item passes the test-wiseness battery + the
 *     enrichment item rules.
 *
 * Shared by scripts/foundry (build time) and the contribution queue.
 * See docs/CURRICULUMOS_V1_DESIGN.md §6, §7.2.
 */

import { normalizeConceptKernel, TRUST_TIERS } from './kernelSchema';
import { lintItemAdmission } from '../itemAdmissionLint';

function normalizeForMatch(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Mechanical anchor check: is the quote present in the source text?
 * Whitespace- and smart-quote-normalized substring match — deliberately
 * strict (no fuzzy paraphrase) so admission cannot be gamed by a model
 * rewording its own claim.
 */
export function quoteFoundInSource(quote, sourceText) {
  const q = normalizeForMatch(quote);
  if (q.length < 12) return false;
  return normalizeForMatch(sourceText).includes(q);
}

function checkAnchoredField(field, sources) {
  // Returns { ok, anchored } — ok=false means it claimed an anchor that failed.
  if (!field?.anchor) return { ok: true, anchored: false };
  const sourceText = sources?.[field.anchor.src];
  if (sourceText && quoteFoundInSource(field.anchor.quote, sourceText)) {
    return { ok: true, anchored: true };
  }
  return { ok: false, anchored: false };
}

/**
 * Admit a raw kernel into the genome.
 * @param {object} rawKernel
 * @param {object} options
 *   - sources: { [src]: fullSourceText } for anchor verification
 *   - requireAnchors: if true (foundry default), an atom that claims tier ≥2
 *     but fails its anchor is rejected; if false (consensus contributions),
 *     the anchor is stripped and the atom drops to T1.
 * @returns {{ admitted, kernel, rejections, tier }}
 */
export function admitKernel(rawKernel, { sources = {}, requireAnchors = true } = {}) {
  const rejections = [];

  // Verify/strip anchors before normalization so the resulting tiers are honest.
  const working = JSON.parse(JSON.stringify(rawKernel || {}));
  const enforce = (field, label) => {
    if (!field?.anchor) return field;
    const { ok } = checkAnchoredField(field, sources);
    if (ok) return field;
    rejections.push(`anchor-failed:${label}`);
    if (requireAnchors && Number(field.tier) >= TRUST_TIERS.SOURCE_ANCHORED) {
      // Claimed source-anchored but the quote is not in the source → drop the
      // whole atom by clearing it; caller sees the rejection.
      return null;
    }
    // Lenient mode: strip the anchor, demote to consensus.
    return { ...field, anchor: null, tier: Math.min(Number(field.tier) || 0, TRUST_TIERS.CONSENSUS) };
  };

  if (working.definition) {
    const checked = enforce(working.definition, 'definition');
    if (!checked) return { admitted: false, kernel: null, rejections, tier: TRUST_TIERS.MODEL };
    working.definition = checked;
  }
  if (Array.isArray(working.facts)) {
    working.facts = working.facts.map((fact, index) => enforce(fact, `fact[${index}]`)).filter(Boolean);
  }
  if (Array.isArray(working.misconceptions)) {
    working.misconceptions = working.misconceptions.map((m, index) => {
      const checked = enforce(m, `misconception[${index}]`);
      return checked || { ...m, anchor: null, tier: TRUST_TIERS.CONSENSUS };
    });
  }

  // MC item lint (test-wiseness battery + structural rules).
  if (Array.isArray(working.mcBank)) {
    working.mcBank = working.mcBank.filter((item, index) => {
      const issues = lintItemAdmission({ question: item.stem, options: item.options, answerIndex: item.answerIndex });
      const structural = !Array.isArray(item.options) || item.options.length !== 4;
      if (issues.length > 0 || structural) {
        rejections.push(`mc[${index}]:${[...issues, structural ? 'option-count' : ''].filter(Boolean).join(',')}`);
        return false;
      }
      return true;
    });
  }

  const { kernel, issues } = normalizeConceptKernel(working);
  if (!kernel) {
    return { admitted: false, kernel: null, rejections: [...rejections, ...issues], tier: TRUST_TIERS.MODEL };
  }

  return {
    admitted: true,
    kernel,
    rejections,
    tier: kernel.definition?.tier ?? TRUST_TIERS.CONSENSUS,
  };
}

// Generic connective words that carry no disambiguating signal in a surface.
const SURFACE_STOPWORDS = new Set([
  'the',
  'a',
  'an',
  'of',
  'and',
  'or',
  'to',
  'in',
  'for',
  'on',
  'as',
  'is',
  'are',
  'its',
  'it',
  'that',
  'this',
  'what',
  'where',
  'when',
  'how',
  'why',
  'with',
  'from',
  'by',
  'were',
  'was',
  'came',
  'come',
  'into',
  'onto',
  'over',
  'per',
  'about',
  'their',
  'they',
  'them',
]);

function surfaceTokens(text) {
  return normalizeForMatch(text)
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 4 && !SURFACE_STOPWORDS.has(token));
}

function disciplineOf(id) {
  return String(id || '').split('/')[0];
}

/**
 * Cross-discipline alias-collision lint (warning-only; never rejects).
 *
 * Kernel resolution is token-coverage based, so two kernels in DIFFERENT
 * disciplines that share surface vocabulary cross-resolve in a mixed-discipline
 * course (a real defect found in refine-loop iter 15: a history "source
 * criticism" kernel was pulled into a statistics data lesson because "source"/
 * "provenance" overlapped). This flags every surface of kernel A (≥1 meaningful
 * token after stripping stopwords and tokens < 4 chars) whose token set is a
 * SUBSET of the combined surface tokens of a kernel B in another discipline —
 * the exact condition under which B's lesson can fully match A's surface.
 *
 * @returns {{ surface, of, containedIn }[]} collisions (empty when clean)
 */
export function findAliasCollisions(kernels = []) {
  const entries = kernels
    .filter((kernel) => kernel && kernel.id)
    .map((kernel) => {
      const perSurface = [kernel.term, ...(kernel.aliases || [])]
        .filter(Boolean)
        .map((surface) => ({ surface, tokens: new Set(surfaceTokens(surface)) }))
        .filter((entry) => entry.tokens.size > 0);
      const all = new Set();
      for (const entry of perSurface) for (const token of entry.tokens) all.add(token);
      return { id: kernel.id, discipline: disciplineOf(kernel.id), perSurface, all };
    });

  const collisions = [];
  for (const a of entries) {
    for (const b of entries) {
      if (a.id === b.id || a.discipline === b.discipline) continue;
      for (const { surface, tokens } of a.perSurface) {
        if ([...tokens].every((token) => b.all.has(token))) {
          collisions.push({ surface, of: a.id, containedIn: b.id });
        }
      }
    }
  }
  return collisions;
}

/** Admit a batch; returns admitted kernels + a rejection report + alias collisions. */
export function admitBatch(rawKernels = [], options = {}) {
  const admitted = [];
  const report = [];
  for (const raw of rawKernels) {
    const result = admitKernel(raw, options);
    if (result.admitted) admitted.push(result.kernel);
    if (result.rejections.length > 0 || !result.admitted) {
      report.push({ id: raw?.id || '(no id)', admitted: result.admitted, rejections: result.rejections });
    }
  }
  return { admitted, report, aliasCollisions: findAliasCollisions(admitted) };
}
