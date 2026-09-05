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

function cleanText(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Anchor → human citation label, matching composeLessonFromConcepts so a
// primer's "Source: …" reads identically to a key term's. ("openstax:
// astronomy-2e#2" → "OpenStax astronomy 2e §2.1").
function citationLabel(anchor) {
  if (!anchor?.src) return '';
  const src = anchor.src
    .replace(/#.*$/, '')
    .replace(/^openstax:/, 'OpenStax ')
    .replace(/^uh-oer:/, 'UH OER ')
    .replace(/-/g, ' ');
  return anchor.loc ? `${src} §${anchor.loc}` : src;
}

/**
 * V0.14 P1: turn prerequisite DETECTION into JUDGMENT.
 *
 * Classifies every missing-prerequisite finding by what the genome can do
 * about it, and for the ones it CAN fill, builds a quote-anchored
 * "prerequisite primer" (definition + one fact + citation) so the gap is not
 * just flagged but closed, with receipts, at zero AI cost.
 *
 *  - bridgeable      — the missing prerequisite IS a kernel in the genome.
 *  - assumed-background — named by a `requires` edge but no kernel exists
 *    (a foundational concept outside the current genome); flagged honestly,
 *    no primer.
 *
 * @param {object[]} findings — auditPrerequisites output
 * @param {object} library — getKernel(id)
 * @returns {{ findings, primers, summary }}
 */
export function buildPrerequisiteJudgment(findings = [], library) {
  const classified = [];
  const primers = [];
  const primerSeen = new Set();

  for (const finding of findings) {
    if (finding.type !== 'missing-prerequisite') {
      classified.push(finding);
      continue;
    }
    const prereqKernel = library?.getKernel?.(finding.prerequisiteId);
    if (!prereqKernel) {
      classified.push({ ...finding, gapClass: 'assumed-background' });
      continue;
    }
    classified.push({ ...finding, gapClass: 'bridgeable' });

    // One primer per (missing prerequisite → the lesson that needs it).
    const primerKey = `${finding.prerequisiteId}->${finding.lessonIndex}`;
    if (primerSeen.has(primerKey)) continue;
    primerSeen.add(primerKey);

    const definition = cleanText(prereqKernel.definition?.text);
    const keyFact = cleanText((prereqKernel.facts || [])[0]?.text);
    const source = citationLabel(prereqKernel.definition?.anchor);
    primers.push({
      prerequisiteId: finding.prerequisiteId,
      prerequisiteTerm: finding.prerequisiteTerm,
      neededForId: finding.conceptId,
      neededForTerm: finding.conceptTerm,
      neededForLessonIndex: finding.lessonIndex,
      definition,
      keyFact,
      source,
      tier: prereqKernel.definition?.tier ?? 0,
      whyNote: `You need "${finding.prerequisiteTerm}" to follow "${finding.conceptTerm}" in Lesson ${finding.lessonIndex + 1}.`,
    });
  }

  const missing = classified.filter((f) => f.type === 'missing-prerequisite');
  const summary = {
    total: classified.length,
    missing: missing.length,
    outOfOrder: classified.filter((f) => f.type === 'out-of-order').length,
    bridgeable: missing.filter((f) => f.gapClass === 'bridgeable').length,
    assumedBackground: missing.filter((f) => f.gapClass === 'assumed-background').length,
    primersBuilt: primers.length,
  };
  return { findings: classified, primers, summary };
}
