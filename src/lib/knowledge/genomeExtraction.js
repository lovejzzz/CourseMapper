/**
 * genomeExtraction.js — V0.14.7 WS-E (E2): on-miss kernel extraction.
 *
 * When the genome linker misses (a lesson resolves zero library concepts),
 * this module lets ONE low-reasoning model call propose kernel-shaped concept
 * candidates — definition, facts, misconceptions, a worked example,
 * prerequisite edges, and citation CANDIDATES. Two hard rules, both inherited
 * from the foundry (src/lib/genome/foundryAdmission.js):
 *
 *  1. CITATIONS ARE NEVER MODEL-TRUSTED. Every citation candidate must
 *     resolve through the existing knowledge providers
 *     (src/lib/knowledge/providers.js — OpenAlex / Open Library) before
 *     anything persists. Unverifiable citations are dropped; a candidate with
 *     ZERO verified citations is rejected entirely.
 *  2. NOTHING EXTRACTED EVER CLAIMS A SOURCE ANCHOR. There is no snapshot to
 *     quote from, so model-supplied anchors are stripped and every atom is
 *     capped at trust tier T1 (CONSENSUS) — the same honesty boundary the
 *     admission gate enforces on foundry proposals that fail their quotes.
 *
 * FLAG-GATED, DEFAULT OFF (this release): the caller reads localStorage key
 * GENOME_EXTRACTION_FLAG ('coursemapper-genome-extract') and passes the raw
 * value in; shouldOfferExtraction() is the single gate. No extraction call
 * may run without it.
 *
 * INTENDED CALL SITE (deliberately NOT wired in V0.14.7 — the generation
 * pipeline is owned by another workstream this release): in
 * src/hooks/useDeliverables.js, immediately after runGenomeLinker() returns
 * with misses, call runOnMissGenomeExtraction() with the missed lessons'
 * concept names, the app's model caller, and the runtime providers; merge the
 * returned entries via kernelLibrary.addKernels(entries, { source:
 * 'extracted' }) so the SAME course recompiles against them, and queue them
 * for the commons contribution flow (kernels only — the privacy boundary
 * drawn for commons applies verbatim, roadmap E3).
 *
 * Pure functions throughout: the model caller and the providers are
 * injected; this module performs no fetch of its own.
 */

import { admitKernel } from '../genome/foundryAdmission';
import { TRUST_TIERS } from '../genome/kernelSchema';

export const GENOME_EXTRACTION_FLAG = 'coursemapper-genome-extract';

function cleanText(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The flag is enabled only for an explicit opt-in value — default OFF. */
export function isExtractionFlagEnabled(flagValue) {
  if (flagValue === true) return true;
  const normalized = cleanText(flagValue).toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'on';
}

/**
 * The single gate: offer extraction only when the flag is explicitly enabled
 * AND the linker actually missed. `linkResult` is runGenomeLinker()'s return
 * value — telemetry.misses counts true tier-3 misses; missingIndices is the
 * fallback when telemetry is absent (it also carries partial overlays, which
 * still go to the model path).
 */
export function shouldOfferExtraction({ flagValue, linkResult } = {}) {
  if (!isExtractionFlagEnabled(flagValue)) return false;
  if (!linkResult || typeof linkResult !== 'object') return false;
  const telemetryMisses = Number(linkResult.telemetry?.misses);
  if (Number.isFinite(telemetryMisses)) return telemetryMisses > 0;
  return Array.isArray(linkResult.missingIndices) && linkResult.missingIndices.length > 0;
}

const CANDIDATE_SHAPE = `{
  "id": "<discipline>/<slug>", "term": "...", "aliases": [], "tags": [],
  "level": "intro", "difficulty": 1-5, "bloomCeiling": "Apply|Analyze|Evaluate",
  "definition": { "text": "<2-3 sentence definition in your own words>" },
  "facts": [ { "text": "<one teachable fact>" } ],
  "misconceptions": [ { "text": "<the wrong belief students hold>", "corrective": "<the fix>" } ],
  "workedExample": { "problem": "...", "steps": ["..."], "result": "..." },
  "edges": { "requires": ["<discipline>/<slug>"] },
  "citationCandidates": [ { "kind": "scholarly|book", "title": "<exact published title>", "authors": "...", "year": 2010 } ]
}`;

/**
 * One low-reasoning prompt proposing kernel-shaped candidates for the missed
 * concepts. The reply must be a JSON array (the word "JSON" is load-bearing:
 * some providers require it to enable JSON output modes).
 */
export function buildExtractionPrompt({ conceptNames = [], courseTitle = '', discipline = '' } = {}) {
  const names = conceptNames.map(cleanText).filter(Boolean).slice(0, 8);
  const disciplinePrefix = cleanText(discipline).toLowerCase() || 'general';
  return `You are proposing concept-kernel candidates for a curriculum knowledge library.

Course: "${cleanText(courseTitle)}" (discipline "${disciplinePrefix}").
The library has no entry for these lesson concepts:
${names.map((name) => `- ${name}`).join('\n')}

Propose one candidate per concept as a JSON array. Each candidate uses exactly this shape:
${CANDIDATE_SHAPE}

HARD RULES:
- Do NOT invent quotes, page numbers, or source anchors — there is no source text here, and every claim will be treated as unverified consensus knowledge pending review.
- citationCandidates are PROPOSALS ONLY: name real published works (textbooks or peer-reviewed papers) that genuinely cover the concept. Each one will be independently verified against scholarly databases, and any candidate whose citations cannot be verified is discarded entirely.
- 2-4 facts per candidate. 1-2 misconceptions WITH correctives. workedExample only for genuinely quantitative concepts (otherwise omit it).
- "edges.requires" lists prerequisite concept ids using the "${disciplinePrefix}/<slug>" form, only when the prerequisite is one of the concepts listed above or a universally standard one.
- Return ONLY the JSON array.`;
}

/** Extract the first JSON array from a model reply. Returns [] when absent. */
export function parseExtractionCandidates(text) {
  const match = String(text || '').match(/\[[\s\S]*\]/);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[0]);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeTitleForMatch(title) {
  return cleanText(title)
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * A provider result verifies a citation candidate only when the titles
 * genuinely match: normalized equality or full containment (with a length
 * floor so "calculus" cannot "verify" against any calculus-titled work by
 * accident of brevity).
 */
function titlesMatch(candidateTitle, resultTitle) {
  const a = normalizeTitleForMatch(candidateTitle);
  const b = normalizeTitleForMatch(resultTitle);
  if (a.length < 10 || b.length < 10) return a.length > 0 && a === b;
  return a === b || a.includes(b) || b.includes(a);
}

async function verifyCitationCandidate(citation, providers, { discipline } = {}) {
  const title = cleanText(citation?.title);
  if (!title) return null;
  const kind = cleanText(citation?.kind).toLowerCase();
  try {
    if (kind === 'book') {
      const results = await providers.searchBookMetadata(title, { limit: 3 });
      const match = (results || []).find((result) => titlesMatch(title, result.title));
      return match ? { ...match, verifiedAgainst: 'openlibrary' } : null;
    }
    const results = await providers.searchScholarlyReadings(title, { limit: 3, anchor: discipline });
    const match = (results || []).find((result) => titlesMatch(title, result.title));
    return match ? { ...match, verifiedAgainst: 'openalex' } : null;
  } catch {
    return null; // provider failure ⇒ unverifiable ⇒ dropped, never trusted
  }
}

/**
 * Strip everything the model must not be trusted with: anchors (no snapshot
 * exists to verify a quote against) and any tier claim above T1.
 */
function stripUntrustedClaims(candidate) {
  const capTier = (atom) => {
    if (!atom || typeof atom !== 'object') return atom;
    const { anchor: _anchor, ...rest } = atom;
    return { ...rest, anchor: null, tier: Math.min(Number(rest.tier) || TRUST_TIERS.CONSENSUS, TRUST_TIERS.CONSENSUS) };
  };
  const working = { ...candidate };
  if (working.definition) {
    working.definition = capTier(
      typeof working.definition === 'object' ? working.definition : { text: working.definition },
    );
  }
  if (Array.isArray(working.facts)) working.facts = working.facts.map(capTier);
  if (Array.isArray(working.misconceptions)) working.misconceptions = working.misconceptions.map(capTier);
  // The candidate shape carries ONE workedExample; the kernel schema takes an array.
  if (working.workedExample && !Array.isArray(working.workedExamples)) {
    working.workedExamples = [working.workedExample];
  }
  delete working.workedExample;
  return working;
}

function citationAttribution(verified) {
  const parts = [verified.title, verified.authors, verified.year ? `(${verified.year})` : '']
    .map(cleanText)
    .filter(Boolean);
  return `${parts.join(', ')} — verified via ${verified.verifiedAgainst === 'openlibrary' ? 'Open Library' : 'OpenAlex'}`;
}

/**
 * Verify every candidate's citations through the injected providers, then run
 * the survivors through the REAL admission gate (admitKernel — schema + item
 * lint; anchors were stripped above, so nothing can claim T2+).
 *
 * @param {object} args
 *  - candidates: parsed model proposals
 *  - providers: { searchScholarlyReadings, searchBookMetadata } — the
 *    src/lib/knowledge/providers.js contract, injected for testability
 *  - discipline: relevance anchor folded into scholarly searches (the
 *    v0.14.1 citation-relevance gate's discipline anchoring, unchanged)
 * @returns {{ admitted: [{ kernel, verifiedCitations, droppedCitations }], rejected: [{ id, reasons }] }}
 */
export async function verifyAndAdmitCandidates({ candidates = [], providers, discipline = '' } = {}) {
  const admitted = [];
  const rejected = [];
  if (!providers?.searchScholarlyReadings || !providers?.searchBookMetadata) {
    return {
      admitted,
      rejected: candidates.map((candidate) => ({
        id: cleanText(candidate?.id) || '(no id)',
        reasons: ['no-providers'],
      })),
    };
  }

  for (const candidate of candidates) {
    const id = cleanText(candidate?.id) || '(no id)';
    const citationCandidates = Array.isArray(candidate?.citationCandidates)
      ? candidate.citationCandidates.slice(0, 4)
      : [];
    const verifiedCitations = [];
    const droppedCitations = [];
    for (const citation of citationCandidates) {
      const verified = await verifyCitationCandidate(citation, providers, { discipline });
      if (verified) verifiedCitations.push(verified);
      else droppedCitations.push({ title: cleanText(citation?.title) });
    }

    // The roadmap bar: nothing model-invented persists unverified. Zero
    // verified citations ⇒ the whole candidate is rejected, not demoted.
    if (verifiedCitations.length === 0) {
      rejected.push({ id, reasons: ['no-verified-citations'] });
      continue;
    }

    const shaped = stripUntrustedClaims(candidate);
    shaped.attribution = [
      ...(Array.isArray(shaped.attribution) ? shaped.attribution : []),
      ...verifiedCitations.map(citationAttribution),
    ];
    const result = admitKernel(shaped, { sources: {}, requireAnchors: true });
    if (!result.admitted) {
      rejected.push({ id, reasons: result.rejections.length > 0 ? result.rejections : ['schema-rejected'] });
      continue;
    }
    admitted.push({ kernel: result.kernel, verifiedCitations, droppedCitations });
  }

  return { admitted, rejected };
}

/**
 * Shape admitted candidates exactly like the kernel entries buildShards.mjs
 * emits into public/genome/<discipline>-<level>.json (`shard.kernels[i]`) —
 * admitKernel already ran them through the same normalizeConceptKernel the
 * foundry uses, so the runtime cache (kernelLibrary.addKernels) merges them
 * like any shard load.
 */
export function toCachedShardEntries(admitted = []) {
  return admitted.map((entry) => entry.kernel).filter(Boolean);
}

/**
 * The integration entry point (NOT wired this release — see header).
 * Orchestrates gate → prompt → injected model call → citation verification →
 * admission → cache-ready entries. Never calls the model when the gate says
 * no.
 *
 * @param {object} args
 *  - flagValue: raw localStorage value of GENOME_EXTRACTION_FLAG
 *  - linkResult: runGenomeLinker() return value
 *  - conceptNames, courseTitle, discipline: prompt context for the misses
 *  - callModel: async (prompt) => replyText — the app's model caller, injected
 *  - providers: the knowledge provider contract (see verifyAndAdmitCandidates)
 * @returns {{ offered, candidateCount, admitted, rejected, entries }}
 */
export async function runOnMissGenomeExtraction({
  flagValue,
  linkResult,
  conceptNames = [],
  courseTitle = '',
  discipline = '',
  callModel,
  providers,
} = {}) {
  if (!shouldOfferExtraction({ flagValue, linkResult }) || typeof callModel !== 'function') {
    return { offered: false, candidateCount: 0, admitted: [], rejected: [], entries: [] };
  }
  const prompt = buildExtractionPrompt({ conceptNames, courseTitle, discipline });
  const reply = await callModel(prompt);
  const candidates = parseExtractionCandidates(reply);
  const { admitted, rejected } = await verifyAndAdmitCandidates({ candidates, providers, discipline });
  return {
    offered: true,
    candidateCount: candidates.length,
    admitted,
    rejected,
    entries: toCachedShardEntries(admitted),
  };
}
