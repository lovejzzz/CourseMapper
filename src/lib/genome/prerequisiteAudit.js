/**
 * prerequisiteAudit.js — CurriculumOS V1: curriculum-gap detection.
 *
 * The genome's prerequisite edges encode the physics of teachability: you
 * cannot understand p-values before sampling distributions. Once a course's
 * lessons are resolved to concept ids, the compiler can walk those edges
 * against lesson order and flag, deterministically, two real defects:
 *
 *  - missing-prerequisite: a lesson requires a concept that no lesson in the
 *    course teaches at all (a genuine hole),
 *  - out-of-order: a lesson requires a concept taught later in the course
 *    (right material, wrong sequence).
 *
 * This is QM-grade alignment auditing, computed — no model is trusted to do
 * it. Findings feed the readiness report and the TA digest as observations,
 * never auto-edits.
 *
 * See docs/CURRICULUMOS_V1_DESIGN.md §5.2.
 */

/**
 * @param {object[]} perLesson — resolver output: [{ lessonIndex, conceptRefs:[{id}] }]
 * @param {object} library — getKernel(id) → concept kernel with edges.requires
 * @returns {{ findings, conceptsByLesson }}
 */
export function auditPrerequisites(perLesson = [], library) {
  if (!library?.getKernel) return { findings: [], conceptsByLesson: new Map() };

  // First lesson index at which each concept is introduced.
  const introducedAt = new Map();
  for (const entry of perLesson) {
    for (const ref of entry.conceptRefs || []) {
      if (!introducedAt.has(ref.id)) introducedAt.set(ref.id, entry.lessonIndex);
    }
  }

  const findings = [];
  for (const entry of perLesson) {
    const lessonIndex = entry.lessonIndex;
    for (const ref of entry.conceptRefs || []) {
      const kernel = library.getKernel(ref.id);
      const requires = kernel?.edges?.requires || [];
      for (const prereqId of requires) {
        const introIndex = introducedAt.get(prereqId);
        const prereqKernel = library.getKernel(prereqId);
        const prereqTerm = prereqKernel?.term || prereqId;
        if (introIndex === undefined) {
          findings.push({
            type: 'missing-prerequisite',
            lessonIndex,
            conceptId: ref.id,
            conceptTerm: kernel?.term || ref.id,
            prerequisiteId: prereqId,
            prerequisiteTerm: prereqTerm,
            message: `Lesson ${lessonIndex + 1} teaches "${kernel?.term || ref.id}", which builds on "${prereqTerm}" — but no lesson in this course covers it.`,
          });
        } else if (introIndex > lessonIndex) {
          findings.push({
            type: 'out-of-order',
            lessonIndex,
            conceptId: ref.id,
            conceptTerm: kernel?.term || ref.id,
            prerequisiteId: prereqId,
            prerequisiteTerm: prereqTerm,
            introducedAtLesson: introIndex,
            message: `Lesson ${lessonIndex + 1} teaches "${kernel?.term || ref.id}" before its prerequisite "${prereqTerm}" (introduced in Lesson ${introIndex + 1}).`,
          });
        }
      }
    }
  }

  return { findings, conceptsByLesson: introducedAt };
}
