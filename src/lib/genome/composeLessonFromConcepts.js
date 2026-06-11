/**
 * composeLessonFromConcepts.js — CurriculumOS V1: the Linker's composition step.
 *
 * Turns a lesson's resolved concept kernels (universal, source-anchored) plus
 * its course-specific layer (scenario / discussion tension / assignment task —
 * always local, never from the library) into the EXACT enrichment payload the
 * v0.9.1/v0.9.11 overlays already consume. Because the output shape is
 * identical to the model-enrichment path, the compiler integration is
 * unchanged — the overlays cannot tell whether knowledge came from a model or
 * the genome.
 *
 * Citations and trust tiers ride along on a `conceptProvenance` block and on
 * per-keyTerm `source` fields so the compiler can render "Source: …" receipts.
 *
 * See docs/CURRICULUMOS_V1_DESIGN.md §5.1.
 */

import { projectKernelToSurfaces } from '../kernelProjection';
import { kernelTrustTier, TRUST_TIER_LABELS } from './kernelSchema';
import { instantiateArchetype } from './archetypeInstantiation';

function cleanText(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function citationLabel(anchor) {
  if (!anchor?.src) return '';
  // "openstax:astronomy-2e#2" → "OpenStax astronomy 2e" (+ " §loc").
  // The #chapter fragment is internal anchor bookkeeping, not citation text.
  const src = anchor.src
    .replace(/#.*$/, '')
    .replace(/^openstax:/, 'OpenStax ')
    .replace(/^uh-oer:/, 'UH OER ')
    .replace(/-/g, ' ');
  return anchor.loc ? `${src} §${anchor.loc}` : src;
}

/**
 * Merge concept kernels into one lesson-level kernel in the shape
 * projectKernelToSurfaces expects, then project. The course-specific layer is
 * spliced in verbatim — it is the only part that is allowed to be local.
 *
 * @param {object[]} conceptKernels — resolved concept kernels (kernelSchema shape)
 * @param {object} courseLayer — { scenario, discussionPrompt, assignmentCore } (optional)
 * @param {object} options — { itemPlan, getArchetype, mcOffsets, excludeWorkedExampleConcepts }
 *   - mcOffsets: Map (or plain object) conceptId → first unused mcBank index.
 *     v0.14.1 (4.6): the linker's course-level cursor — a concept repeated in
 *     a later lesson draws the NEXT unused items instead of restarting at 0.
 *   - excludeWorkedExampleConcepts: Set of conceptIds whose worked example
 *     already shipped in an earlier lesson (first-occurrence-only).
 * @returns {{ payload, conceptProvenance, consumption }|null}
 *   consumption = { mcConsumed: { [conceptId]: count }, workedExampleConceptId }
 *   — what THIS composition actually drew from each bank, so the linker can
 *   advance its cursors only when the composition ships.
 */
export function composeLessonFromConcepts(conceptKernels = [], courseLayer = {}, options = {}) {
  const kernels = conceptKernels.filter((kernel) => kernel && kernel.id);
  if (kernels.length === 0) return null;
  const getArchetype = typeof options.getArchetype === 'function' ? options.getArchetype : () => null;
  // v0.14.1 (4.6): per-concept mcBank offsets. This loop is the true choke
  // point for cross-lesson quiz dedupe: it is the LAST place concept identity
  // exists — below, the per-kernel banks flatten into one `mc` pool, and
  // kernelProjection's `mcItems.slice(0, mcSlots.length)` only narrows that
  // already-offset pool to the lesson's slots.
  const rawOffsets = options.mcOffsets || null;
  const offsetFor = (id) => {
    if (!rawOffsets) return 0;
    const raw = typeof rawOffsets.get === 'function' ? rawOffsets.get(id) : rawOffsets[id];
    return Number.isInteger(raw) && raw > 0 ? raw : 0;
  };
  const excludedWorkedExamples = options.excludeWorkedExampleConcepts || null;
  const workedExampleExcluded = (id) =>
    Boolean(
      excludedWorkedExamples &&
        (typeof excludedWorkedExamples.has === 'function'
          ? excludedWorkedExamples.has(id)
          : Array.isArray(excludedWorkedExamples) && excludedWorkedExamples.includes(id)),
    );

  // Layer 2: instantiate each concept's verified archetype mapping into
  // template-priced misconceptions and a structural task item. Grounded
  // mappings only — instantiateArchetype enforces the forced-analogy guard.
  const archetypeMisconceptions = []; // { term, definition, example, misconception }
  const archetypeTaskItems = []; // { stem, bloom, rubricFocus }
  const archetypesUsed = [];
  const reasoningScaffolds = []; // { term, archetypeName, moves } — the expert routine
  for (const kernel of kernels) {
    const conceptText = `${kernel.definition?.text || ''} ${(kernel.facts || []).map((f) => f.text).join(' ')}`;
    for (const instance of kernel.edges?.instanceOf || []) {
      const archetype = getArchetype(instance.archetype);
      if (!archetype) continue;
      const { misconceptions, taskItems, status } = instantiateArchetype(archetype, instance, conceptText);
      if (status !== 'verified-ready') continue;
      archetypesUsed.push(instance.archetype);
      for (const text of misconceptions) {
        archetypeMisconceptions.push({
          term: cleanText(kernel.term),
          definition: cleanText(kernel.definition?.text),
          example: cleanText((kernel.examples || [])[0]?.text),
          misconception: text,
        });
      }
      if (taskItems[0]) archetypeTaskItems.push(taskItems[0]);
      // The archetype's reasoning moves are the expert's thinking routine for
      // this deep structure — metacognitive scaffolding that turns recall into
      // understanding. Currently the highest-value archetype data with no
      // surface; render it as a "how to reason about this" study-guide block.
      const moves = (archetype.reasoningMoves || []).map(cleanText).filter(Boolean);
      if (moves.length >= 2 && !reasoningScaffolds.some((s) => s.archetypeName === archetype.name)) {
        reasoningScaffolds.push({ term: cleanText(kernel.term), archetypeName: archetype.name, moves });
      }
    }
  }

  // facts: union across concepts, anchored ones first so slides/explanations
  // prefer cited claims.
  const facts = [];
  const factSources = [];
  for (const kernel of kernels) {
    for (const fact of kernel.facts || []) {
      facts.push(cleanText(fact.text));
      factSources.push(fact.anchor || null);
    }
  }

  // Each concept becomes a key term; its definition carries the citation.
  const keyTerms = kernels.map((kernel) => ({
    term: cleanText(kernel.term),
    definition: cleanText(kernel.definition?.text),
    example: cleanText((kernel.examples || [])[0]?.text),
    misconception: cleanText((kernel.misconceptions || [])[0]?.text),
    // v0.13.3: the genome's corrective travels with the term so study guides
    // pair the misconception with a real correction.
    correction: cleanText((kernel.misconceptions || [])[0]?.corrective),
    source: citationLabel(kernel.definition?.anchor),
    tier: kernel.definition?.tier ?? kernelTrustTier(kernel),
  }));

  // MC bank: dereference each item's fact/misconception refs into the prose
  // the projection's quiz overlay expects. v0.14.1 (4.6): each kernel's bank
  // starts at its course-level offset — items an earlier lesson already
  // shipped never enter this lesson's pool (the World Lit L7=L14 dup). An
  // exhausted bank contributes nothing; the compiler's deterministic frames
  // fill un-overlaid slots downstream.
  const mc = [];
  const mcSourceConcepts = []; // parallel to mc: which concept supplied each item
  for (const kernel of kernels) {
    for (const item of (kernel.mcBank || []).slice(offsetFor(kernel.id))) {
      const explanation =
        item.explanationFactRef != null
          ? cleanText(kernel.facts?.[item.explanationFactRef]?.text)
          : cleanText(kernel.definition?.text);
      mc.push({
        question: cleanText(item.stem),
        options: (item.options || []).map(cleanText),
        answerIndex: Number(item.answerIndex) || 0,
        explanation,
      });
      mcSourceConcepts.push(kernel.id);
    }
  }

  // Misconceptions union (for distractor-rationale matching + study guide),
  // enriched with template-priced archetype-instantiated misconceptions.
  const mergedMisconceptions = [
    ...kernels.flatMap((kernel) =>
      (kernel.misconceptions || []).map((misconception) => ({
        term: cleanText(kernel.term),
        definition: cleanText(kernel.definition?.text),
        example: cleanText((kernel.examples || [])[0]?.text),
        misconception: cleanText(misconception.text),
        correction: cleanText(misconception.corrective),
      })),
    ),
    ...archetypeMisconceptions,
  ];

  // v0.13.3: the first concept carrying a worked example supplies the
  // lesson's quantitative walkthrough (math bought once in the genome).
  // v0.14.1 (4.6): first-occurrence-only across the run — a concept whose
  // example shipped in an earlier lesson is skipped (the v0.12.1
  // seenScaffolds rule), so a repeated concept recaps its term without
  // re-shipping the identical walkthrough.
  let workedExample = null;
  let workedExampleConceptId = null;
  for (const kernel of kernels) {
    if (workedExampleExcluded(kernel.id)) continue;
    const example = (kernel.workedExamples || [])[0];
    if (!example) continue;
    workedExample = example;
    workedExampleConceptId = kernel.id;
    break;
  }

  const lessonKernel = {
    facts,
    keyTerms: mergedMisconceptions.length > keyTerms.length ? mergedMisconceptions : keyTerms,
    scenario: courseLayer?.scenario || null,
    discussionPrompt: courseLayer?.discussionPrompt || null,
    assignmentCore: courseLayer?.assignmentCore || null,
    mc,
    workedExample,
  };

  const payload = projectKernelToSurfaces(lessonKernel, { itemPlan: options.itemPlan || [] });

  // v0.14.1 (4.6): report what the projection actually consumed so the linker
  // advances its course-level cursors by truth, not by pool size. The
  // projection emits exactly the first mcSlotCount pool items
  // (kernelProjection's `mcItems.slice(0, mcSlots.length)`), and
  // mcSourceConcepts is parallel to the pool, so attribution is positional.
  const mcSlotCount = (options.itemPlan || []).filter((slot) => slot.type === 'multiple_choice').length;
  const mcConsumed = {};
  for (const conceptId of mcSourceConcepts.slice(0, mcSlotCount)) {
    mcConsumed[conceptId] = (mcConsumed[conceptId] || 0) + 1;
  }

  // Restore the citation-bearing key terms (projection strips extra fields).
  payload.keyTerms = keyTerms;

  // Metacognitive scaffold: the expert reasoning routine for this structure.
  if (reasoningScaffolds.length > 0) payload.reasoningScaffolds = reasoningScaffolds;

  // Append one archetype-schema task item as a short-answer question — a
  // proven task form for the structure, slot-filled to this discipline.
  if (archetypeTaskItems[0] && Array.isArray(payload.quizItems)) {
    const task = archetypeTaskItems[0];
    const maxIndex = payload.quizItems.reduce((max, item) => Math.max(max, item.index ?? 0), -1);
    payload.quizItems.push({
      index: maxIndex + 1,
      type: 'short_answer',
      question: task.stem,
      options: [],
      answerIndex: 0,
      distractorRationales: [],
      answer: '',
      explanation: '',
      scoringGuidance: task.rubricFocus
        ? `Full credit ${task.rubricFocus}.`
        : 'Full credit applies the structure correctly to this lesson with course evidence.',
      bloom: task.bloom,
      enrichmentSource: 'archetype-schema',
    });
  }

  // Provenance: tiers, citations, and the concept ids that fed this lesson.
  const tier = Math.max(0, ...kernels.map((kernel) => kernelTrustTier(kernel)));
  const citations = [
    ...new Set(
      [...kernels.map((kernel) => citationLabel(kernel.definition?.anchor)), ...factSources.map(citationLabel)].filter(
        Boolean,
      ),
    ),
  ];
  // v0.14 P2: competency data rides along so the syllabus can build a
  // Course Competency Map — Bloom level (owned data) + curated standards tags.
  const competencies = kernels.map((kernel) => ({
    term: cleanText(kernel.term),
    bloom: cleanText(kernel.bloomCeiling) || 'Analyze',
    standards: Array.isArray(kernel.standards) ? kernel.standards : [],
  }));

  const conceptProvenance = {
    source: 'genome-linked',
    conceptIds: kernels.map((kernel) => kernel.id),
    tier,
    tierLabel: TRUST_TIER_LABELS[tier],
    citations,
    competencies,
    fullyAnchored: factSources.length > 0 && factSources.every(Boolean),
    ...(archetypesUsed.length > 0
      ? { archetypes: [...new Set(archetypesUsed)], archetypeMisconceptionCount: archetypeMisconceptions.length }
      : {}),
  };

  // v0.14.1 (4.6): the worked example counts as shipped only if it survived
  // the projection (an empty `problem` is dropped there).
  const consumption = {
    mcConsumed,
    workedExampleConceptId: payload.workedExample ? workedExampleConceptId : null,
  };

  return { payload: { ...payload, conceptProvenance }, conceptProvenance, consumption };
}

/**
 * v0.14.1 (4.5): merge a thin genome composition (the linker's partial
 * overlay) with the model's kernel payload for the same lesson — the genome
 * AUGMENTS the model, never displaces it. The v0.14 audit showed linked
 * lessons shipping 1 key term while model-enriched neighbours got 3-4.
 *
 * Merge rules:
 *  - keyTerms: genome terms FIRST (they carry citations), model terms fill
 *    to par, deduped by term name. Misconceptions/corrections ride inside
 *    the terms, so the dedup unions them too.
 *  - quizItems: genome-first within each item type, deduped by stem, slotted
 *    back onto the item plan's indices (the quiz overlay maps strictly by
 *    slot index and type); leftovers append after the plan.
 *  - genome-only blocks (reasoningScaffolds, prerequisitePrimers, structural
 *    bridges, worked example) are preserved; scaffolds union by archetype.
 *  - enrichmentSource becomes 'genome-augmented' and conceptProvenance is
 *    preserved so the genomeLink edge writer (4.4) still writes edges.
 *
 * @param {object|null} genomePartial — composed genome payload (may be null)
 * @param {object|null} modelPayload — parsed model kernel payload (may be null)
 * @returns {object|null} the merged enrichment payload
 */
export function mergeLessonPayloads(genomePartial, modelPayload) {
  if (!genomePartial || typeof genomePartial !== 'object') return modelPayload || null;
  if (!modelPayload || typeof modelPayload !== 'object') return genomePartial;

  const termKey = (term) => cleanText(term?.term).toLowerCase();
  const keyTerms = [];
  const seenTerms = new Set();
  for (const term of [...(genomePartial.keyTerms || []), ...(modelPayload.keyTerms || [])]) {
    const key = termKey(term);
    if (!key || seenTerms.has(key)) continue;
    seenTerms.add(key);
    keyTerms.push(term);
  }

  // Slot map: the model payload was projected with the live item plan, so its
  // index/type pairs are authoritative; genome-only indices fill any gap.
  const slotTypeByIndex = new Map();
  for (const item of [...(modelPayload.quizItems || []), ...(genomePartial.quizItems || [])]) {
    const index = Number(item?.index);
    if (!Number.isFinite(index) || slotTypeByIndex.has(index)) continue;
    slotTypeByIndex.set(index, item.type || 'multiple_choice');
  }
  const stemKey = (item) => cleanText(item?.question).toLowerCase();
  const queuesByType = new Map();
  const seenStems = new Set();
  for (const item of [...(genomePartial.quizItems || []), ...(modelPayload.quizItems || [])]) {
    const key = stemKey(item);
    if (!key || seenStems.has(key)) continue;
    seenStems.add(key);
    const type = item.type || 'multiple_choice';
    if (!queuesByType.has(type)) queuesByType.set(type, []);
    queuesByType.get(type).push(item);
  }
  const quizItems = [];
  const slotIndices = [...slotTypeByIndex.keys()].sort((a, b) => a - b);
  for (const index of slotIndices) {
    const queue = queuesByType.get(slotTypeByIndex.get(index)) || [];
    const item = queue.shift();
    if (item) quizItems.push({ ...item, index });
  }
  let overflowIndex = slotIndices.length > 0 ? slotIndices[slotIndices.length - 1] + 1 : 0;
  for (const queue of queuesByType.values()) {
    for (const item of queue) quizItems.push({ ...item, index: overflowIndex++ });
  }

  const genomeScaffolds = genomePartial.reasoningScaffolds || [];
  const reasoningScaffolds = [
    ...genomeScaffolds,
    ...(modelPayload.reasoningScaffolds || []).filter(
      (scaffold) => !genomeScaffolds.some((genome) => genome.archetypeName === scaffold.archetypeName),
    ),
  ];
  const facts = [...new Set([...(genomePartial.kernel?.facts || []), ...(modelPayload.kernel?.facts || [])])];

  return {
    ...modelPayload,
    keyTerms,
    quizItems,
    // The genome's worked example is source-anchored math bought once in the
    // library — it outranks a model-written walkthrough.
    ...(genomePartial.workedExample ? { workedExample: genomePartial.workedExample } : {}),
    ...(!modelPayload.slideContent && genomePartial.slideContent ? { slideContent: genomePartial.slideContent } : {}),
    ...(!modelPayload.discussionPrompt && genomePartial.discussionPrompt
      ? { discussionPrompt: genomePartial.discussionPrompt }
      : {}),
    ...(!modelPayload.assignmentCore && genomePartial.assignmentCore
      ? { assignmentCore: genomePartial.assignmentCore }
      : {}),
    ...(reasoningScaffolds.length > 0 ? { reasoningScaffolds } : {}),
    ...(genomePartial.prerequisitePrimers ? { prerequisitePrimers: genomePartial.prerequisitePrimers } : {}),
    ...(genomePartial.structuralConnections ? { structuralConnections: genomePartial.structuralConnections } : {}),
    ...(genomePartial.structuralBridges ? { structuralBridges: genomePartial.structuralBridges } : {}),
    kernel: {
      ...(modelPayload.kernel || {}),
      facts,
      scenario: modelPayload.kernel?.scenario || genomePartial.kernel?.scenario || null,
    },
    enrichmentSource: 'genome-augmented',
    conceptProvenance: genomePartial.conceptProvenance,
  };
}
