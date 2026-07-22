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
  // v0.15.3 D1: the ":reference" doc-id tail on foundry-contributed srcIds
  // ("writing-about-literature:reference") is bookkeeping too — leaking it
  // into compiled text produces the exact ":reference §" raw-shard-key
  // pattern the deep grader's citation hygiene check flags (caught live by
  // the depth A/B: the deep lit arm shipped it inside an exit ticket and
  // graded 98 to flat's 99). Milne/Open Geology prefixes get the same
  // readable treatment as OpenStax/UH OER.
  const wikiTitle = String(anchor.src).match(/^https?:\/\/[^/]+\/wiki\/([^#?]+)/i)?.[1];
  const src = (wikiTitle ? decodeURIComponent(wikiTitle).replace(/_/g, ' ') : anchor.src)
    .replace(/#.*$/, '')
    .replace(/:reference$/i, '')
    .replace(/^openstax:/, 'OpenStax ')
    .replace(/^uh-oer:/, 'UH OER ')
    .replace(/^milne:/, 'Milne OER ')
    .replace(/^opengeology:/, 'Open Geology ')
    .replace(/-/g, ' ');
  return anchor.loc ? `${src} §${anchor.loc}` : src;
}

function citationProvenance(anchor, kernel, sourceReferences = {}) {
  const label = citationLabel(anchor);
  if (!label) return null;
  // Foundry anchors may carry a section fragment in `src` while the genome
  // manifest stores one verified bibliographic row for the underlying work.
  // Resolve both identities so a precise `#3.1` content anchor does not lose
  // the book URL and fall into the exported source-review quarantine.
  const sourceKey = String(anchor?.src || '');
  const metadata = sourceReferences?.[sourceKey] || sourceReferences?.[sourceKey.replace(/#.*$/, '')];
  if (!metadata?.sourceUrl) return label;
  const locator = cleanText(anchor?.loc);
  const displayTitle = cleanText(metadata.displayTitle) || label;
  const attribution = Array.isArray(kernel?.attribution)
    ? kernel.attribution.map(cleanText).filter(Boolean).join('; ')
    : cleanText(kernel?.attribution);
  return {
    key: label,
    displayTitle: locator ? `${displayTitle} §${locator}` : displayTitle,
    sourceUrl: cleanText(metadata.sourceUrl),
    license: cleanText(kernel?.license),
    attribution: attribution || displayTitle,
    kind: /^openstax:/i.test(String(anchor?.src || '')) ? 'open textbook' : 'open resource',
    evidence: cleanText(anchor?.quote),
    sourceTier: anchor?.tier ?? kernel?.definition?.tier ?? kernelTrustTier(kernel),
    conceptLinks: [{ id: cleanText(kernel?.id), label: cleanText(kernel?.term) }].filter(
      (link) => link.id || link.label,
    ),
  };
}

function citationProvenanceKey(entry) {
  if (!entry) return '';
  if (typeof entry === 'object') return cleanText(entry.key || entry.sourceUrl || entry.displayTitle).toLowerCase();
  return cleanText(entry).toLowerCase();
}

/**
 * Merge concept kernels into one lesson-level kernel in the shape
 * projectKernelToSurfaces expects, then project. The course-specific layer is
 * spliced in verbatim — it is the only part that is allowed to be local.
 *
 * @param {object[]} conceptKernels — resolved concept kernels (kernelSchema shape)
 * @param {object} courseLayer — { scenario, discussionPrompt, assignmentCore } (optional)
 * @param {object} options — { itemPlan, getArchetype, mcOffsets, singleMcBank, excludeWorkedExampleConcepts }
 *   - mcOffsets: Map (or plain object) conceptId → first unused mcBank index.
 *     v0.14.1 (4.6): the linker's course-level cursor — a concept repeated in
 *     a later lesson draws the NEXT unused items instead of restarting at 0.
 *   - singleMcBank: when true, the first non-exhausted relevance-ranked
 *     concept owns this lesson's source-backed assessment seats. Secondary
 *     concepts still contribute facts and terms, but their banks remain
 *     available for later lessons where they may be the primary concept.
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
      factSources.push({ anchor: fact.anchor || null, kernel });
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
  const assessmentKernels = options.singleMcBank
    ? kernels.filter((kernel) => (kernel.mcBank || []).length > offsetFor(kernel.id)).slice(0, 1)
    : kernels;
  for (const kernel of assessmentKernels) {
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
  // v0.14.3 D1(b)+D3: the projection now also consumes a contiguous prefix of
  // the unused tail — one walkthrough item (the deck's second application
  // slide) plus up to two flagged extension quiz items (weekly-quiz slots
  // 7-8). Counting them here is what keeps the course-level cursor honest:
  // a concept repeated in a later lesson must never re-draw an item that
  // shipped on a slide or in an extended quiz.
  const mcSlotCount = (options.itemPlan || []).filter((slot) => slot.type === 'multiple_choice').length;
  const extensionCount = (payload.quizItems || []).filter((item) => item.extension === true).length;
  const mcConsumedCount = Math.min(mcSlotCount, mc.length) + (payload.mcWalkthrough ? 1 : 0) + extensionCount;
  const mcConsumed = {};
  for (const conceptId of mcSourceConcepts.slice(0, mcConsumedCount)) {
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
  const citationCandidates = [
    ...kernels.map((kernel) => citationProvenance(kernel.definition?.anchor, kernel, options.sourceReferences)),
    ...factSources.map(({ anchor, kernel }) => citationProvenance(anchor, kernel, options.sourceReferences)),
  ].filter(Boolean);
  const citations = [];
  const seenCitationKeys = new Set();
  for (const entry of citationCandidates) {
    const key = citationProvenanceKey(entry);
    if (!key || seenCitationKeys.has(key)) continue;
    seenCitationKeys.add(key);
    citations.push(entry);
  }
  // v0.14 P2: competency data rides along so the syllabus can build a
  // Course Competency Map — Bloom level (owned data) + curated standards tags.
  const competencies = kernels.map((kernel) => ({
    term: cleanText(kernel.term),
    // A lesson may resolve through a curated exact alias (for example,
    // "functional fixedness" into the broader source-anchored
    // "Problem-solving strategies" kernel). Preserve that identity evidence
    // so downstream semantic admission does not mistake a valid subtopic for
    // stale cross-lesson content.
    aliases: Array.isArray(kernel.aliases) ? kernel.aliases.map(cleanText).filter(Boolean) : [],
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
    fullyAnchored: factSources.length > 0 && factSources.every(({ anchor }) => Boolean(anchor)),
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
 *  - keyTerms: lesson-specific model/fact-ledger terms lead. Genome terms
 *    remain cited supplements instead of displacing the lesson identity.
 *  - quizItems: verified genome multiple-choice atoms retain priority; for
 *    constructed responses, the lesson-specific model/fact-ledger item leads
 *    so a reusable genome scenario cannot become every lesson's writing task.
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
  const termIndexByKey = new Map();
  const modelTerms = modelPayload.keyTerms || [];
  const genomeTerms = genomePartial.keyTerms || [];
  for (const [origin, terms] of [
    ['lesson', modelTerms],
    ['genome', genomeTerms],
  ]) {
    for (const term of terms) {
      const key = termKey(term);
      if (!key) continue;
      if (seenTerms.has(key)) {
        // The lesson-authored definition keeps identity priority, but a
        // duplicate genome concept can still supply the citation that made
        // it trustworthy. Preserve that provenance without replacing the
        // lesson-specific wording or reclassifying the term as supplemental.
        if (origin === 'genome') {
          const existingIndex = termIndexByKey.get(key);
          const existing = keyTerms[existingIndex];
          if (existing) {
            keyTerms[existingIndex] = {
              ...term,
              ...existing,
              ...(cleanText(term?.source) ? { source: term.source } : {}),
              ...(cleanText(term?.citation) ? { citation: term.citation } : {}),
              ...(cleanText(term?.sourceUrl) ? { sourceUrl: term.sourceUrl } : {}),
              ...(cleanText(term?.doi) ? { doi: term.doi } : {}),
              ...(cleanText(term?.license) ? { license: term.license } : {}),
              ...(Number.isFinite(Number(term?.sourceTier)) ? { sourceTier: Number(term.sourceTier) } : {}),
            };
          }
        }
        continue;
      }
      seenTerms.add(key);
      termIndexByKey.set(key, keyTerms.length);
      keyTerms.push({
        ...term,
        augmentationRole: origin === 'lesson' ? 'lesson-primary' : 'genome-supplement',
        ...(origin === 'genome' && modelTerms.length > 0 ? { supplemental: true } : {}),
      });
    }
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
  const appendItems = (origin, items) => {
    for (const item of items || []) {
      const key = stemKey(item);
      if (!key || seenStems.has(key)) continue;
      seenStems.add(key);
      const type = item.type || 'multiple_choice';
      if (!queuesByType.has(type)) queuesByType.set(type, []);
      queuesByType.get(type).push({
        item: {
          ...item,
          augmentationRole: origin === 'model' ? 'lesson-primary' : 'genome-supplement',
        },
        origin,
      });
    }
  };
  // Source-verified MC knowledge remains authoritative. Constructed response
  // scenarios are contextual, so the current lesson's fact ledger owns them.
  appendItems(
    'genome',
    (genomePartial.quizItems || []).filter((item) => (item.type || 'multiple_choice') === 'multiple_choice'),
  );
  appendItems(
    'model',
    (modelPayload.quizItems || []).filter((item) => (item.type || 'multiple_choice') === 'multiple_choice'),
  );
  appendItems(
    'model',
    (modelPayload.quizItems || []).filter((item) => (item.type || 'multiple_choice') !== 'multiple_choice'),
  );
  appendItems(
    'genome',
    (genomePartial.quizItems || []).filter((item) => (item.type || 'multiple_choice') !== 'multiple_choice'),
  );
  const quizItems = [];
  const slotIndices = [...slotTypeByIndex.keys()].sort((a, b) => a - b);
  for (const index of slotIndices) {
    const queue = queuesByType.get(slotTypeByIndex.get(index)) || [];
    const entry = queue.shift();
    if (entry) quizItems.push({ ...entry.item, index });
  }
  let overflowIndex = slotIndices.length > 0 ? slotIndices[slotIndices.length - 1] + 1 : 0;
  for (const queue of queuesByType.values()) {
    for (const entry of queue) {
      if (entry.origin !== 'genome') continue;
      quizItems.push({ ...entry.item, index: overflowIndex++ });
    }
  }

  const genomeScaffolds = genomePartial.reasoningScaffolds || [];
  const reasoningScaffolds = [
    ...genomeScaffolds,
    ...(modelPayload.reasoningScaffolds || []).filter(
      (scaffold) => !genomeScaffolds.some((genome) => genome.archetypeName === scaffold.archetypeName),
    ),
  ];
  const facts = [...new Set([...(modelPayload.kernel?.facts || []), ...(genomePartial.kernel?.facts || [])])];

  return {
    ...modelPayload,
    keyTerms,
    quizItems,
    // The genome's worked example is source-anchored math bought once in the
    // library — it outranks a model-written walkthrough.
    ...(genomePartial.workedExample ? { workedExample: genomePartial.workedExample } : {}),
    // v0.14.3 D1(b): the unused-bank walkthrough item rides the merge — its
    // consumption was already counted against the genome cursor when the
    // partial composition shipped.
    ...(genomePartial.mcWalkthrough ? { mcWalkthrough: genomePartial.mcWalkthrough } : {}),
    ...(!modelPayload.slideContent && genomePartial.slideContent ? { slideContent: genomePartial.slideContent } : {}),
    ...(!modelPayload.discussionPrompt && genomePartial.discussionPrompt
      ? { discussionPrompt: genomePartial.discussionPrompt }
      : {}),
    ...(!modelPayload.assignmentCore && genomePartial.assignmentCore
      ? { assignmentCore: genomePartial.assignmentCore }
      : {}),
    ...(!modelPayload.studyGuide && genomePartial.studyGuide ? { studyGuide: genomePartial.studyGuide } : {}),
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
