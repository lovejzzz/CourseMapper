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
  const src = anchor.src.replace(/^openstax:/, 'OpenStax ').replace(/-/g, ' ');
  return anchor.loc ? `${src} §${anchor.loc}` : src;
}

/**
 * Merge concept kernels into one lesson-level kernel in the shape
 * projectKernelToSurfaces expects, then project. The course-specific layer is
 * spliced in verbatim — it is the only part that is allowed to be local.
 *
 * @param {object[]} conceptKernels — resolved concept kernels (kernelSchema shape)
 * @param {object} courseLayer — { scenario, discussionPrompt, assignmentCore } (optional)
 * @param {object} options — { itemPlan }
 * @returns {{ payload, conceptProvenance }|null}
 */
export function composeLessonFromConcepts(conceptKernels = [], courseLayer = {}, options = {}) {
  const kernels = conceptKernels.filter((kernel) => kernel && kernel.id);
  if (kernels.length === 0) return null;
  const getArchetype = typeof options.getArchetype === 'function' ? options.getArchetype : () => null;

  // Layer 2: instantiate each concept's verified archetype mapping into
  // template-priced misconceptions and a structural task item. Grounded
  // mappings only — instantiateArchetype enforces the forced-analogy guard.
  const archetypeMisconceptions = []; // { term, definition, example, misconception }
  const archetypeTaskItems = []; // { stem, bloom, rubricFocus }
  const archetypesUsed = [];
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
    source: citationLabel(kernel.definition?.anchor),
    tier: kernel.definition?.tier ?? kernelTrustTier(kernel),
  }));

  // MC bank: dereference each item's fact/misconception refs into the prose
  // the projection's quiz overlay expects.
  const mc = [];
  for (const kernel of kernels) {
    for (const item of kernel.mcBank || []) {
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
      })),
    ),
    ...archetypeMisconceptions,
  ];

  const lessonKernel = {
    facts,
    keyTerms: mergedMisconceptions.length > keyTerms.length ? mergedMisconceptions : keyTerms,
    scenario: courseLayer?.scenario || null,
    discussionPrompt: courseLayer?.discussionPrompt || null,
    assignmentCore: courseLayer?.assignmentCore || null,
    mc,
  };

  const payload = projectKernelToSurfaces(lessonKernel, { itemPlan: options.itemPlan || [] });

  // Restore the citation-bearing key terms (projection strips extra fields).
  payload.keyTerms = keyTerms;

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
  const conceptProvenance = {
    source: 'genome-linked',
    conceptIds: kernels.map((kernel) => kernel.id),
    tier,
    tierLabel: TRUST_TIER_LABELS[tier],
    citations,
    fullyAnchored: factSources.length > 0 && factSources.every(Boolean),
    ...(archetypesUsed.length > 0
      ? { archetypes: [...new Set(archetypesUsed)], archetypeMisconceptionCount: archetypeMisconceptions.length }
      : {}),
  };

  return { payload: { ...payload, conceptProvenance }, conceptProvenance };
}
