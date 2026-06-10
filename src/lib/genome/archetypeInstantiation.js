/**
 * archetypeInstantiation.js — CurriculumOS Layer 2: turn an archetype's
 * misconception SHAPES and task SCHEMAS into concrete, discipline-skinned
 * content by filling {slots} from a concept's instanceOf mapping.
 *
 * This is the cost lever: the genome's most valuable assessment atoms —
 * misconceptions (which drive distractor quality) and well-formed task stems —
 * are produced deterministically from a verified mapping, at template prices,
 * instead of being bought from the model for every course.
 *
 * Quality line: a shape only instantiates when the mapping is grounded
 * (lintInstanceMapping verified-ready), so the result is plausible-by-design
 * and course-specific, never a generic template echo.
 *
 * See docs/CURRICULUMOS_ARCHETYPE_LAYER_DESIGN.md §4.
 */

import { lintInstanceMapping, templateSlots } from './archetypeSchema';

function cleanText(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function fillTemplate(template, mapping) {
  return cleanText(String(template || '').replace(/\{([^{}]+)\}/g, (_, slot) => mapping[slot.trim()] ?? `{${slot}}`));
}

function fullyFilled(template, mapping) {
  return templateSlots(template).every((slot) => cleanText(mapping[slot]));
}

/**
 * Instantiate one concept's archetype mapping into ready-to-use content.
 * @param {object} archetype — normalized archetype
 * @param {object} instance — { mapping, confidence, verified } from a kernel edge
 * @param {string} conceptText — the concept's own text (definition + facts) for grounding
 * @returns {{ misconceptions: string[], taskItems: [{stem,bloom,rubricFocus}], status }}
 */
export function instantiateArchetype(archetype, instance, conceptText = '') {
  if (!archetype || !instance?.mapping) return { misconceptions: [], taskItems: [], status: 'rejected' };
  const { status } = lintInstanceMapping(instance.mapping, archetype, conceptText);
  // Only verified-ready mappings (or explicitly verified edges) instantiate
  // student-facing content — forced/partial analogies never render.
  if (status !== 'verified-ready' && instance.verified !== true) {
    return { misconceptions: [], taskItems: [], status };
  }
  const mapping = instance.mapping;

  const misconceptions = [];
  for (const shape of archetype.misconceptionShapes || []) {
    if (!fullyFilled(shape.template, mapping)) continue;
    misconceptions.push(fillTemplate(shape.template, mapping));
  }

  const taskItems = [];
  for (const schema of archetype.taskSchemas || []) {
    if (!fullyFilled(schema.stemTemplate, mapping)) continue;
    taskItems.push({
      stem: fillTemplate(schema.stemTemplate, mapping),
      bloom: schema.bloom || 'Apply',
      rubricFocus: cleanText(schema.rubricFocus),
      schema: schema.schema,
    });
  }

  return { misconceptions, taskItems, status: 'verified-ready' };
}

/**
 * Build the scaffold block injected into a kernel prompt when a lesson resolves
 * to an archetype. The model receives the structure and is asked only to fill
 * the slot mapping + skin the atoms — not to invent the structure.
 */
export function buildArchetypeScaffold(archetype) {
  if (!archetype) return '';
  const shapes = (archetype.misconceptionShapes || [])
    .map((shape) => `  - ${shape.shape}: ${shape.template}`)
    .join('\n');
  const oneSchema = (archetype.taskSchemas || [])[0];
  return [
    `DEEP STRUCTURE (${archetype.name}): ${archetype.abstract}`,
    `Map these slots to THIS lesson's specifics: ${archetype.slots.join(', ')}.`,
    "Universal misconception shapes for this structure (instantiate them in the lesson's own terms):",
    shapes,
    oneSchema ? `A proven task form for this structure: ${oneSchema.stemTemplate}` : '',
    'Return your slot mapping plus the discipline-specific atoms; do not restate the abstract structure.',
  ]
    .filter(Boolean)
    .join('\n');
}
