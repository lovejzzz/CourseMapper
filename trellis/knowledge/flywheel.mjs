// The flywheel — docs/TRELLIS.md §2/D2: gap-fill kernel extraction for
// concepts the genome does not cover, so no hand-curated shard is ever
// load-bearing. Extracted facts are provenance-marked (they are model
// knowledge, not anchored quotes) and the trust classes stay honest:
// flywheel facts ground prose as AUTHORED-GROUNDED only after a human or
// contribution round-trip verifies them; until then the coverage report
// says 'flywheel-unverified'.

import { callModel } from '../providers.mjs';

const EXTRACTION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['concepts'],
  properties: {
    concepts: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['conceptId', 'kernelFacts', 'misconception'],
        properties: {
          conceptId: { type: 'string' },
          kernelFacts: { type: 'array', minItems: 2, maxItems: 4, items: { type: 'string', minLength: 30 } },
          misconception: {
            type: ['object', 'null'],
            additionalProperties: false,
            required: ['statement', 'beliefForm', 'corrective'],
            properties: {
              statement: { type: 'string', minLength: 20 },
              beliefForm: { type: 'string', minLength: 12 },
              corrective: { type: 'string', minLength: 30 },
            },
          },
        },
      },
    },
  },
};

function validateExtraction(uncoveredIds) {
  return (parsed) => {
    const errors = [];
    if (!Array.isArray(parsed?.concepts)) return ['concepts must be an array'];
    const returned = new Set(parsed.concepts.map((c) => c.conceptId));
    for (const id of uncoveredIds) {
      if (!returned.has(id)) errors.push(`missing conceptId "${id}"`);
    }
    for (const entry of parsed.concepts) {
      if (!uncoveredIds.includes(entry.conceptId))
        errors.push(`unknown conceptId "${entry.conceptId}" — do not invent concepts`);
      if (!Array.isArray(entry.kernelFacts) || entry.kernelFacts.length < 2) {
        errors.push(`${entry.conceptId}: need ≥2 kernel facts`);
      }
      // The v013-cs-review judge found the literal placeholder 'X does Y'
      // spliced into four lessons' options — nano copied the prompt's old
      // format example verbatim as a beliefForm. Stub belief forms are
      // rejected in the retry loop; a real wrong belief names real things.
      const belief = entry.misconception?.beliefForm;
      if (belief && (belief.length < 20 || /\bX does Y\b/i.test(belief) || /^[A-Z] .{0,12} [A-Z]\.?$/.test(belief))) {
        errors.push(
          `${entry.conceptId}: beliefForm "${belief}" is a stub — state the actual wrong belief with the concept's own terms (e.g. "Dividing two integers always yields an integer")`,
        );
      }
    }
    return errors;
  };
}

export async function flywheelFill(graph, uncoveredIds, { tier = 'cheap', ledger = null, budgetUsd = null } = {}) {
  if (uncoveredIds.length === 0) return { filled: [], provenance: null };
  const byId = new Map(graph.concepts.map((c) => [c.id, c]));
  const wanted = uncoveredIds.map((id) => ({ id, name: byId.get(id)?.name ?? id }));

  const { result } = await callModel({
    tier,
    stage: 'flywheel',
    ledger,
    budgetUsd,
    schema: EXTRACTION_SCHEMA,
    schemaName: 'kernel_extraction',
    validate: validateExtraction(uncoveredIds),
    system:
      `You extract teaching-kernel facts for undergraduate course concepts in ${graph.course.subject}. ` +
      `For each concept: 2-4 precise, checkable facts a textbook would state (no fluff, no "students will"), and the single most common documented student misconception WITH (a) its beliefForm — the wrong belief stated AS a claim a student could pick on a quiz — a full sentence using the concept's own terms, like "Dividing two integers always yields an integer" — never 'students think…' and never a placeholder — and (b) its corrective (how an instructor repairs it). ` +
      `If a concept has no well-known misconception, return null for misconception. Never invent citations.`,
    user: `Course: ${graph.course.title} (${graph.course.level}).\nConcepts needing kernels:\n${wanted
      .map((w) => `- ${w.id}: ${w.name}`)
      .join('\n')}`,
  });

  const filled = [];
  let counter = 0;
  for (const entry of result.concepts) {
    const concept = byId.get(entry.conceptId);
    if (!concept) continue;
    concept.kernelFacts = entry.kernelFacts;
    concept.genomeRef = null; // model knowledge, not a shard link — honest
    if (entry.misconception) {
      counter += 1;
      const id = `m-flywheel-${concept.id}-${counter}`;
      graph.misconceptions.push({
        kind: 'misconception',
        id,
        conceptId: concept.id,
        statement: entry.misconception.statement,
        beliefForm: entry.misconception.beliefForm,
        corrective: entry.misconception.corrective,
      });
      concept.misconceptionIds.push(id);
    }
    filled.push(concept.id);
  }
  return { filled, provenance: 'flywheel-unverified (model-extracted; contribute + verify to promote)' };
}

// Roadmap 3.3 — flywheel fact verification. Cross-family verification is
// key-gated (no anthropic/google keys in this environment), so a SECOND
// MODEL (mini) checks the nano/mini-extracted facts — disclosed as
// same-family verification, not claimed as cross-family. Dubious facts are
// removed; a concept left factless becomes an honest declaredGap.
const VERIFY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['verdicts'],
  properties: {
    verdicts: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['index', 'accurate'],
        properties: { index: { type: 'integer', minimum: 0 }, accurate: { type: 'boolean' } },
      },
    },
  },
};

export async function verifyFlywheelFacts(graph, filledIds, { tier = 'cheap', ledger = null, budgetUsd = null } = {}) {
  if (filledIds.length === 0) return { checked: 0, removed: 0, gapped: [] };
  const byId = new Map(graph.concepts.map((c) => [c.id, c]));
  const rows = [];
  for (const id of filledIds) {
    const concept = byId.get(id);
    for (const [factIndex, fact] of (concept?.kernelFacts ?? []).entries()) {
      rows.push({ index: rows.length, conceptId: id, factIndex, concept: concept.name, fact });
    }
  }
  if (rows.length === 0) return { checked: 0, removed: 0, gapped: [] };
  const { result } = await callModel({
    tier,
    stage: 'flywheelVerify',
    ledger,
    budgetUsd,
    schema: VERIFY_SCHEMA,
    schemaName: 'fact_verdicts',
    validate: (parsed) => (Array.isArray(parsed?.verdicts) ? [] : ['verdicts must be an array']),
    maxOutputTokens: 2000,
    system:
      `You are fact-checking teaching statements for an undergraduate ${graph.course.subject} course. ` +
      'For each numbered fact, answer accurate=true only if the statement is correct as written for an introductory course; false if wrong, misleading, or too contested to teach as fact.',
    user: JSON.stringify(
      rows.map(({ index, concept, fact }) => ({ index, concept, fact })),
      null,
      1,
    ),
  });
  const inaccurate = new Set((result.verdicts ?? []).filter((v) => v.accurate === false).map((v) => v.index));
  let removed = 0;
  const gapped = [];
  for (const row of rows) {
    if (!inaccurate.has(row.index)) continue;
    const concept = byId.get(row.conceptId);
    concept.kernelFacts = concept.kernelFacts.filter((f) => f !== row.fact);
    removed += 1;
    if (concept.kernelFacts.length === 0) {
      concept.declaredGap = true;
      gapped.push(concept.id);
    }
  }
  return { checked: rows.length, removed, gapped };
}
