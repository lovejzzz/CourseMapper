/**
 * archetypeSchema.js — CurriculumOS Layer 2: the archetype kernel contract.
 *
 * An archetype is a deep structure that repeats across disciplines
 * (equilibrium, feedback, sampling-and-inference, evidence-vs-claim, …): the
 * compression that lets one instructor teach five courses. Each archetype
 * carries the abstract structure, named SLOTS, universal misconception
 * SHAPES (templates instantiated per discipline), assessment task schemas,
 * and reasoning moves.
 *
 * Honesty note: genesis archetypes ship at tier 4 (editorially curated, with
 * literature REFERENCES). Verbatim quote-anchoring against licensed source
 * snapshots is the foundry data-run's job — we never invent quotes.
 *
 * See docs/CURRICULUMOS_ARCHETYPE_LAYER_DESIGN.md §2.
 */

const FAMILY_VALUES = new Set(['systems', 'quantitative', 'epistemic', 'interpretive', 'process']);
const ARCHETYPE_ID_RE = /^(?:structure|method|epistemic|interpretive|process)\/[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SLOT_RE = /\{([^{}]+)\}/g;

function cleanText(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function asArray(value) {
  return Array.isArray(value) ? value : value === undefined || value === null || value === '' ? [] : [value];
}

/** All {slot} references inside a template string. */
export function templateSlots(template) {
  const slots = [];
  let match;
  SLOT_RE.lastIndex = 0;
  while ((match = SLOT_RE.exec(String(template || ''))) !== null) slots.push(match[1].trim());
  return slots;
}

function lintTemplateAgainstSlots(template, slots, issues, label) {
  for (const slot of templateSlots(template)) {
    if (!slots.includes(slot)) issues.push(`unknown-slot:${label}:{${slot}}`);
  }
}

/**
 * Validate + normalize an archetype. Returns { archetype, issues }; archetype
 * is null when unusable. The slot-template lint is the load-bearing check:
 * every {slot} referenced by any template must be declared.
 */
export function normalizeArchetype(raw) {
  const issues = [];
  const id = cleanText(raw?.id).toLowerCase();
  if (!ARCHETYPE_ID_RE.test(id)) issues.push('bad-id');
  const name = cleanText(raw?.name);
  if (name.length < 3) issues.push('name-missing');
  const family = cleanText(raw?.family);
  if (!FAMILY_VALUES.has(family)) issues.push('bad-family');
  const abstract = cleanText(raw?.abstract);
  if (abstract.length < 40) issues.push('abstract-too-short');

  const slots = asArray(raw?.slots).map(cleanText).filter(Boolean);
  if (slots.length < 2) issues.push('too-few-slots');
  const triggerVocabulary = asArray(raw?.triggerVocabulary).map(cleanText).filter(Boolean);
  if (triggerVocabulary.length < 2) issues.push('too-few-triggers');

  const misconceptionShapes = asArray(raw?.misconceptionShapes)
    .map((shape) => ({
      shape: cleanText(shape?.shape),
      template: cleanText(shape?.template),
      corrective: cleanText(shape?.corrective),
    }))
    .filter((shape) => shape.shape && shape.template.length >= 20);
  misconceptionShapes.forEach((shape) => lintTemplateAgainstSlots(shape.template, slots, issues, shape.shape));
  if (misconceptionShapes.length === 0) issues.push('no-misconception-shapes');

  const taskSchemas = asArray(raw?.taskSchemas)
    .map((schema) => ({
      schema: cleanText(schema?.schema),
      bloom: cleanText(schema?.bloom) || 'Apply',
      stemTemplate: cleanText(schema?.stemTemplate),
      rubricFocus: cleanText(schema?.rubricFocus),
    }))
    .filter((schema) => schema.schema && schema.stemTemplate.length >= 20);
  taskSchemas.forEach((schema) => lintTemplateAgainstSlots(schema.stemTemplate, slots, issues, schema.schema));
  if (taskSchemas.length === 0) issues.push('no-task-schemas');

  if (issues.length > 0) return { archetype: null, issues };

  return {
    archetype: {
      id,
      rev: Math.max(1, Number(raw?.rev) || 1),
      name,
      family,
      abstract,
      slots,
      triggerVocabulary,
      misconceptionShapes,
      reasoningMoves: asArray(raw?.reasoningMoves).map(cleanText).filter(Boolean),
      taskSchemas,
      pedagogyBindings: asArray(raw?.pedagogyBindings).map(cleanText).filter(Boolean),
      exemplars: asArray(raw?.exemplars)
        .map((exemplar) => ({ conceptId: cleanText(exemplar?.conceptId), skin: cleanText(exemplar?.skin) }))
        .filter((exemplar) => exemplar.conceptId),
      references: asArray(raw?.references).map(cleanText).filter(Boolean),
      tier: Number.isInteger(raw?.tier) ? raw.tier : 4,
    },
    issues: [],
  };
}

const MAPPING_STOP_WORDS = new Set(['the', 'and', 'with', 'that', 'this', 'from', 'into', 'over']);

function contentWords(text) {
  return cleanText(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 3 && !MAPPING_STOP_WORDS.has(word));
}

/**
 * Mapping lint (design §6): an instanceOf mapping is usable only when every
 * archetype slot is filled AND the fills are grounded in the concept's own
 * text — forced analogies with invented nouns never pass. Returns
 * { status: 'verified-ready'|'suggested'|'rejected', issues }.
 */
export function lintInstanceMapping(mapping, archetype, conceptText = '') {
  const issues = [];
  if (!mapping || typeof mapping !== 'object') return { status: 'rejected', issues: ['no-mapping'] };
  if (!archetype) return { status: 'rejected', issues: ['no-archetype'] };
  const conceptVocab = new Set(contentWords(conceptText));

  let filled = 0;
  let grounded = 0;
  for (const slot of archetype.slots) {
    const fill = cleanText(mapping[slot]);
    if (!fill) {
      issues.push(`missing-slot:{${slot}}`);
      continue;
    }
    filled += 1;
    const fillWords = contentWords(fill);
    if (conceptVocab.size === 0 || fillWords.some((word) => conceptVocab.has(word))) grounded += 1;
    else issues.push(`ungrounded-slot:{${slot}}`);
  }

  if (filled === 0) return { status: 'rejected', issues };
  if (filled < archetype.slots.length || grounded < filled) return { status: 'suggested', issues };
  return { status: 'verified-ready', issues: [] };
}

/** Build the index used by the archetype resolver (trigger vocabulary → ids). */
export function buildArchetypeIndex(archetypes = []) {
  const postings = new Map();
  const byId = new Map();
  for (const raw of archetypes) {
    const { archetype } = normalizeArchetype(raw);
    if (!archetype) continue;
    byId.set(archetype.id, archetype);
    for (const trigger of archetype.triggerVocabulary) {
      for (const word of contentWords(trigger)) {
        if (!postings.has(word)) postings.set(word, new Set());
        postings.get(word).add(archetype.id);
      }
    }
  }
  return { postings, archetypes: byId };
}
