/**
 * glossaryGraph.js — CurriculumOS V1: one canonical definition per concept.
 *
 * When a course resolves multiple lessons to the same genome concept, the
 * compiler can do two things no per-lesson model pass could:
 *  - guarantee ONE canonical definition across quiz, slides, and study guide
 *    (first introduction wins), killing the divergent-definition defect class,
 *  - emit spiral references for later appearances ("builds on X from Week 3"),
 *    turning repetition into deliberate reinforcement.
 *
 * Pure data in → glossary + spiral notes out. The compiler renders them.
 * See docs/CURRICULUMOS_V1_DESIGN.md §5.2.
 */

/**
 * @param {object[]} perLesson — resolver output [{ lessonIndex, conceptRefs:[{id}] }]
 * @param {object} library — getKernel(id)
 * @returns {{ glossary, spiralReferences }}
 *   glossary: [{ id, term, definition, source, tier, firstLesson }]
 *   spiralReferences: Map<lessonIndex, [{ conceptId, term, firstLesson, note }]>
 */
export function buildGlossaryGraph(perLesson = [], library) {
  const glossary = new Map();
  const spiralReferences = new Map();
  if (!library?.getKernel) return { glossary: [], spiralReferences };

  for (const entry of perLesson) {
    const lessonIndex = entry.lessonIndex;
    for (const ref of entry.conceptRefs || []) {
      const kernel = library.getKernel(ref.id);
      if (!kernel) continue;
      if (!glossary.has(ref.id)) {
        // First introduction wins — this is the canonical entry.
        glossary.set(ref.id, {
          id: ref.id,
          term: kernel.term,
          definition: kernel.definition?.text || '',
          source: kernel.definition?.anchor
            ? `${kernel.definition.anchor.src}${kernel.definition.anchor.loc ? ` §${kernel.definition.anchor.loc}` : ''}`
            : '',
          tier: kernel.definition?.tier ?? 0,
          firstLesson: lessonIndex,
        });
      } else {
        // Later appearance → spiral reference back to the introduction.
        const canonical = glossary.get(ref.id);
        if (canonical.firstLesson !== lessonIndex) {
          if (!spiralReferences.has(lessonIndex)) spiralReferences.set(lessonIndex, []);
          spiralReferences.get(lessonIndex).push({
            conceptId: ref.id,
            term: kernel.term,
            firstLesson: canonical.firstLesson,
            note: `Builds on ${kernel.term}, introduced in Lesson ${canonical.firstLesson + 1}.`,
          });
        }
      }
    }
  }

  return { glossary: [...glossary.values()], spiralReferences };
}
