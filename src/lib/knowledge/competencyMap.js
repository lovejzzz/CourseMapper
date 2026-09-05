/**
 * knowledge/competencyMap.js — v0.14 P2: the competency & standards crosswalk.
 *
 * The crosswalk institutions pay consultants to build, generated from data
 * CourseMapper owns: every genome concept carries a Bloom ceiling
 * (`bloomCeiling`) and an optional curated `standards` tag set. This module
 * collects them across a compiled course's lessons into a per-concept
 * competency table plus a coverage summary, with nothing model-asserted —
 * Bloom is owned data, standards are curated and link-checked.
 *
 * Consumed by compileSyllabus (the "Course Competency Map" section) and the
 * judgment surface (Bloom span, concepts mapped to standards).
 */

const BLOOM_ORDER = ['Remember', 'Understand', 'Apply', 'Analyze', 'Evaluate', 'Create'];

function cleanText(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function bloomRank(level) {
  const index = BLOOM_ORDER.indexOf(cleanText(level));
  return index === -1 ? 3 : index; // default to Analyze-tier when unknown
}

/**
 * Collect competency rows from a blueprint's per-lesson enrichment payloads.
 * Each genome-linked lesson contributes its concepts' Bloom level + standards.
 *
 * @param {object} blueprint — compiled blueprint with lessons[].enrichment
 * @returns {{ rows, bloomSpan, standardsCount, frameworks, conceptsMapped }|null}
 */
export function buildCompetencyMap(blueprint) {
  if (!blueprint || !Array.isArray(blueprint.lessons)) return null;
  const rows = [];
  const seen = new Set();

  for (const lesson of blueprint.lessons) {
    const competencies = lesson.enrichment?.conceptProvenance?.competencies;
    if (!Array.isArray(competencies)) continue;
    const lessonLabel = cleanText(lesson.title) || `Lesson ${lesson.lessonNumber}`;
    for (const competency of competencies) {
      const term = cleanText(competency.term);
      if (!term || seen.has(term.toLowerCase())) continue;
      seen.add(term.toLowerCase());
      rows.push({
        concept: term,
        lesson: lessonLabel,
        bloom: cleanText(competency.bloom) || 'Analyze',
        standards: (competency.standards || [])
          .map((standard) => ({
            framework: cleanText(standard.framework),
            code: cleanText(standard.code),
            label: cleanText(standard.label),
            url: cleanText(standard.url),
          }))
          .filter((standard) => standard.framework && standard.code),
      });
    }
  }

  if (rows.length === 0) return null;

  const ranks = rows.map((row) => bloomRank(row.bloom));
  const bloomSpan = {
    lowest: BLOOM_ORDER[Math.min(...ranks)],
    highest: BLOOM_ORDER[Math.max(...ranks)],
    distribution: BLOOM_ORDER.reduce((dist, level) => {
      const count = rows.filter((row) => row.bloom === level).length;
      if (count > 0) dist[level] = count;
      return dist;
    }, {}),
  };
  const frameworks = [...new Set(rows.flatMap((row) => row.standards.map((s) => s.framework)))];
  const conceptsMapped = rows.filter((row) => row.standards.length > 0).length;

  return { rows, bloomSpan, standardsCount: frameworks.length, frameworks, conceptsMapped };
}

/** All standards URLs in a competency map (for knowledge:audit link checking). */
export function competencyStandardsUrls(competencyMap) {
  if (!competencyMap?.rows) return [];
  return [...new Set(competencyMap.rows.flatMap((row) => row.standards.map((s) => s.url)).filter(Boolean))];
}
