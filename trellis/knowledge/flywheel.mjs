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
      `For each concept: 2-4 precise, checkable facts a textbook would state (no fluff, no "students will"), and the single most common documented student misconception WITH (a) its beliefForm — the wrong belief stated AS a claim a student could pick on a quiz ('X does Y'), never 'students think…' — and (b) its corrective (how an instructor repairs it). ` +
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
