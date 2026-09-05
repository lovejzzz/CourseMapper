/**
 * leanCourseMap.js — v0.8.6 lean course-map atoms (flag-gated)
 *
 * In lean mode the model emits compact atoms (arrays of terse phrases) instead
 * of instructor-facing prose, and this module deterministically renders the
 * standard course-map cell text the rest of the app expects. The downstream
 * contract (validators, blueprint compiler, UI, exports) is unchanged.
 *
 * Token effect: the repeated stems, numbering boilerplate, and full-sentence
 * scaffolding move from model output into compiler code.
 *
 * Enable with generationPlan.leanCourseMapAtoms === true. Expansion is
 * idempotent: string cells pass through untouched, so mixed or legacy model
 * output (and continuation chunks still on the verbose contract) stay safe.
 */

export const LEAN_COLUMN_DEFS = {
  learningGoals: 'Array of short goal phrases (no sentences). Order matters: goal 1, goal 2, ...',
  topicSection: 'One numbered subsection title string (e.g., "1.1: Historical Overview").',
  learningObjectives:
    'Array of measurable objective phrases, each starting with a Bloom\'s verb (e.g., "Analyze the impact of immigration policy on communities"). Prefix with goal references like "1a." / "2b." when there are multiple goals. NO stem sentence — the app adds "Students will be able to:" automatically.',
  weeklyAssessments:
    'Array of short assessment atoms, each "Type: focus" (e.g., "Reflection Paper: impact of policy on communities"). Each must map to an objective.',
  asyncActivities: 'Array of short activity atoms, each "Verb: object" (e.g., "Read: Chapter 5 on policy frameworks").',
  syncActivities: 'Array of short in-class activity atoms (e.g., "Debate: immigration policy impacts").',
  technologyNeeded: 'Array of tool atoms, each "Tool (purpose)" (e.g., "Zoom (synchronous session)").',
  presentationFormat: 'One short concrete delivery label string (e.g., "Case discussion"). Never empty.',
  supportingResources: 'Array of specific reading/resource citations extracted from the syllabus where available.',
  evaluateDesign: 'Array of 1-3 short self-check sentences on objective/assessment/activity alignment.',
};

// v0.9.11 P3b: columns the compiler derives deterministically in lean mode —
// the model is not asked for them at all. evaluateDesign is rendered from the
// section's actual objective/assessment/activity mapping (computed alignment
// instead of asserted alignment); presentationFormat and technologyNeeded
// decode from the activity atoms, plus the optional specialTools escape hatch
// for syllabus-named software/equipment.
export const COMPILER_OWNED_LEAN_KEYS = ['evaluateDesign', 'presentationFormat', 'technologyNeeded'];

export const LEAN_SPECIAL_TOOLS_DEF =
  'OPTIONAL array of tool names ONLY when the syllabus explicitly names concrete software/equipment for this section (e.g., "SPSS", "ArcGIS", "Logic Pro"). Omit the key otherwise.';

// v0.14.5 WS-A (A1): the readings registry's wire format — an OPTIONAL
// per-section array of VERBATIM work/reading titles exactly as the source
// names them. HARD traceability rule: only works the source actually names;
// never invent, never normalize or shorten a title; omit the key when the
// source names none. The registry (graph.readings) consumes this key — it is
// NEVER rendered into prose cells here (supportingResources cells gain the
// names through the graph render, the single write path).
export const LEAN_READINGS_DEF =
  'OPTIONAL array of assigned works/readings ONLY when the source names them for this section, each the VERBATIM title AS NAMED (e.g., "OpenStax Ch. 4: Cell Structure", "course packet pp. 12-30"). Never invent or alter titles. Omit the key when the source names none.';

const NUMBERED_LIST_KEYS = new Set([
  'weeklyAssessments',
  'asyncActivities',
  'syncActivities',
  'technologyNeeded',
  'supportingResources',
]);
const SINGLE_VALUE_KEYS = new Set(['topicSection', 'presentationFormat']);

export const LEAN_SYSTEM_ADDITION = `LEAN OUTPUT MODE (overrides any earlier prose-formatting rules):
- Return compact atoms, not instructor-facing prose. Most section fields are ARRAYS of short phrases.
- Do NOT write stem sentences ("Students will be able to:"), line numbering, or filler — the application renders those deterministically.
- Keep every atom specific to the lesson and the source materials. Terse but concrete beats long and generic.`;

function cleanAtom(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function atomList(value) {
  return (Array.isArray(value) ? value : [value]).map(cleanAtom).filter(Boolean);
}

function hasListPrefix(text) {
  return /^\d+[a-z]?[.):]\s/i.test(text) || /^[-•]\s/.test(text);
}

function renderNumberedLines(items) {
  return items.map((item, index) => (hasListPrefix(item) ? item : `${index + 1}. ${item}`)).join('\n');
}

function renderLearningGoals(items) {
  if (items.length <= 1) return items[0] || '';
  return renderNumberedLines(items);
}

function renderLearningObjectives(items) {
  if (items.length === 0) return '';
  // v0.12.1: the stem never lives in the cell — the readiness repair strips
  // it (logging a fake per-lesson "repair") and the pedagogical validator
  // treats it as non-publishable. Exporters/preview render the stem.
  // v0.14.1 (1.14): no bare numeric prefixes either — the readiness
  // normalize pass stripped them right back out while logging 30 fake
  // "repairs" per run, and preview/exporters re-derive numbering anyway.
  // Model-authored goal-reference prefixes ("1a.", "2b.") pass through
  // intact: deriveFromCourseMap maps outcomes to goals through them.
  return items.join('\n');
}

// v0.14.1 (1.15a): the OUTPUT-V014 Mandarin run shipped raw JSON
// ('topicSection": "') inside a course-map cell after a malformed
// wire-format section was spliced into atom text. Any section value carrying
// JSON syntax fragments is rejected wholesale (set to '') so the readiness
// repair fills the clean per-column template instead of propagating fragment
// text into cells, briefs, and the syllabus.
const JSON_SPLICE_RE = /"\s*:\s*["[]/;
const JSON_KEY_FRAGMENT_RE =
  /\b(?:topicSection|learningGoals|learningObjectives|weeklyAssessments|asyncActivities|syncActivities|technologyNeeded|presentationFormat|supportingResources|evaluateDesign|specialTools|readings)"/;
const LEAN_WIRE_FIELD_NAMES = [
  'topicSection',
  'learningGoals',
  'learningObjectives',
  'weeklyAssessments',
  'asyncActivities',
  'syncActivities',
  'technologyNeeded',
  'presentationFormat',
  'supportingResources',
  'evaluateDesign',
  'specialTools',
  'readings',
];
const LEAN_WIRE_FIELD_SOURCE = LEAN_WIRE_FIELD_NAMES.join('|');
const JSON_BARE_KEY_FRAGMENT_RE = new RegExp(`(?:^|,)\\s*(?:${LEAN_WIRE_FIELD_SOURCE})\\s*,?\\s*:\\s*,?`, 'i');

function textLooksLikeJsonFragment(value) {
  const textValue = String(value ?? '');
  if (!textValue) return false;
  if (
    JSON_SPLICE_RE.test(textValue) ||
    JSON_KEY_FRAGMENT_RE.test(textValue) ||
    JSON_BARE_KEY_FRAGMENT_RE.test(textValue)
  ) {
    return true;
  }
  // Structural imbalance betrays a spliced fragment — but only when paired
  // with wire-format residue, so prose with a stray quote stays untouched.
  const quoteCount = (textValue.match(/"/g) || []).length;
  if (quoteCount % 2 === 1 && /[:[{]/.test(textValue)) return true;
  const openCount = (textValue.match(/[[{]/g) || []).length;
  const closeCount = (textValue.match(/[\]}]/g) || []).length;
  return openCount !== closeCount && textValue.includes('"');
}

export function leanSectionValueIsCorrupt(value) {
  if (Array.isArray(value)) {
    return value.some((atom) => textLooksLikeJsonFragment(atom)) || textLooksLikeJsonFragment(value.join(','));
  }
  return typeof value === 'string' && textLooksLikeJsonFragment(value);
}

function recoveredWireAtoms(value) {
  return String(value || '')
    .split(',')
    .map((atom) => atom.replace(/^[\s"'\[\]{}]+|[\s"'\[\]{}]+$/g, '').trim())
    .filter((atom) => atom && atom !== ':');
}

function hasLeanWireValue(value) {
  return Array.isArray(value) ? value.some((atom) => cleanAtom(atom)) : Boolean(cleanAtom(value));
}

/**
 * Recover the exact bare-key splice Gemma can emit when an array closer is
 * lost, for example learningObjectives:["A","B",weeklyAssessments,:,"Quiz…"].
 * The repair activates only when a known field name is followed by a colon,
 * never on ordinary course prose. If recovery is not possible, the corruption
 * guard below still quarantines the entire value.
 */
export function recoverLeanSectionWireSplice(section = {}) {
  for (const [sourceKey, sourceValue] of Object.entries(section)) {
    if (!Array.isArray(sourceValue)) continue;
    const serialized = sourceValue.map(cleanAtom).join(',');
    const markerPattern = new RegExp(`(?:^|,)\\s*(${LEAN_WIRE_FIELD_SOURCE})\\s*,?\\s*:\\s*,?`, 'gi');
    const markers = [...serialized.matchAll(markerPattern)];
    if (markers.length === 0) continue;

    const next = { ...section };
    const prefix = serialized.slice(0, markers[0].index).replace(/,\s*$/, '');
    next[sourceKey] = recoveredWireAtoms(prefix);
    for (let index = 0; index < markers.length; index += 1) {
      const marker = markers[index];
      const fieldKey = LEAN_WIRE_FIELD_NAMES.find((name) => name.toLowerCase() === marker[1].toLowerCase());
      if (!fieldKey) continue;
      const start = marker.index + marker[0].length;
      const end = markers[index + 1]?.index ?? serialized.length;
      const atoms = recoveredWireAtoms(serialized.slice(start, end));
      if (atoms.length > 0 && !hasLeanWireValue(next[fieldKey])) next[fieldKey] = atoms;
    }
    return { section: next, recovered: true };
  }
  return { section, recovered: false };
}

export function expandLeanSectionField(key, value) {
  if (!Array.isArray(value)) return value;
  // specialTools stays an atom array — deriveCompilerOwnedColumns consumes it.
  if (key === 'specialTools') return value;
  // v0.14.5 (A1): readings stays a VERBATIM atom array — the readings
  // registry (deriveCourseGraphFromCourseMap) consumes it. It never expands
  // into prose: supportingResources cells gain the names through the graph
  // render (renderCourseMapFromGraph), the single write path, so no title
  // ever rides a prose splice.
  if (key === 'readings') return value;
  const items = atomList(value);
  if (key === 'learningObjectives') return renderLearningObjectives(items);
  if (key === 'learningGoals') return renderLearningGoals(items);
  if (key === 'evaluateDesign') return items.join(' ');
  if (SINGLE_VALUE_KEYS.has(key)) return items.join('; ');
  if (NUMBERED_LIST_KEYS.has(key)) return renderNumberedLines(items);
  // Custom columns default to numbered lines when the model sent atoms.
  return renderNumberedLines(items);
}

export function expandLeanCourseMap(courseMap) {
  if (!courseMap || !Array.isArray(courseMap.lessons)) return courseMap;
  let changed = false;
  const lessons = courseMap.lessons.map((lesson) => {
    if (!lesson || !Array.isArray(lesson.sections)) return lesson;
    let lessonChanged = false;
    const sections = lesson.sections.map((section) => {
      if (!section || typeof section !== 'object') return section;
      const wireRecovery = recoverLeanSectionWireSplice(section);
      const sourceSection = wireRecovery.section;
      let sectionChanged = wireRecovery.recovered;
      const next = {};
      for (const [key, value] of Object.entries(sourceSection)) {
        // v0.14.5 (A1): readings is strictly additive — a malformed or
        // corrupt readings value NEVER breaks or degrades the run. Anything
        // that is not a clean array of verbatim title strings is dropped
        // wholesale (omit-when-absent everywhere downstream).
        if (key === 'readings') {
          if (!Array.isArray(value) || leanSectionValueIsCorrupt(value)) {
            sectionChanged = true;
            continue;
          }
          const titles = value.map(cleanAtom).filter(Boolean);
          if (titles.length === 0) {
            sectionChanged = true;
            continue;
          }
          if (titles.length !== value.length || titles.some((title, index) => title !== value[index])) {
            sectionChanged = true;
          }
          next.readings = titles;
          continue;
        }
        // Corrupted values never reach a cell: the empty cell is repaired
        // from the clean template downstream (repairCourseMapReadiness).
        if (leanSectionValueIsCorrupt(value)) {
          sectionChanged = true;
          next[key] = '';
          continue;
        }
        const expanded = expandLeanSectionField(key, value);
        if (expanded !== value) sectionChanged = true;
        next[key] = expanded;
      }
      if (sectionChanged) {
        lessonChanged = true;
        return next;
      }
      return section;
    });
    if (!lessonChanged) return lesson;
    changed = true;
    return { ...lesson, sections };
  });
  return changed ? { ...courseMap, lessons } : courseMap;
}

export function isLeanCourseMapEnabled(generationPlan) {
  return generationPlan?.leanCourseMapAtoms === true;
}

// ════════════════════════════════════════════════════════════════════════════
// Compiler-owned columns (v0.9.11 P3b)
//
// In lean mode the model is not asked for evaluateDesign, presentationFormat,
// or technologyNeeded. These derivations fill the cells deterministically from
// the section's own content. evaluateDesign cites the section's actual
// objective verbs, assessment, and activity — computed alignment, not asserted
// prose. Idempotent: cells that already have content are never overwritten.
// ════════════════════════════════════════════════════════════════════════════

function hasCellContent(value) {
  return typeof value === 'string' && value.trim().length >= 3;
}

function cellLines(value) {
  if (Array.isArray(value)) return value.map(cleanAtom).filter(Boolean);
  return String(value ?? '')
    .split('\n')
    .map((line) =>
      line
        .replace(/^\s*\d+[a-z]?[.):]\s*/i, '')
        .replace(/^[-•]\s*/, '')
        .trim(),
    )
    .filter(Boolean);
}

function clipPhrase(text, maxWords = 9) {
  return cleanAtom(text)
    .split(/\s+/)
    .slice(0, maxWords)
    .join(' ')
    .replace(/[.,;:]+$/, '');
}

function objectiveVerbs(objectivesCell) {
  const verbs = [];
  for (const line of cellLines(objectivesCell)) {
    if (/^students will be able to/i.test(line)) continue;
    const match = line.replace(/^\d+[a-z]?\.\s*/i, '').match(/^([a-z]+)\b/i);
    if (!match) continue;
    const verb = match[1].toLowerCase();
    if (verb.length > 2 && !verbs.includes(verb)) verbs.push(verb);
    if (verbs.length >= 3) break;
  }
  return verbs;
}

function derivePresentationFormat(section, lessonIndex) {
  const sync = cellLines(section.syncActivities).join(' ').toLowerCase();
  const async = cellLines(section.asyncActivities).join(' ').toLowerCase();
  const assessments = cellLines(section.weeklyAssessments).join(' ').toLowerCase();
  if (/\b(lab|workshop|simulation|hands-on|studio|practice session)\b/.test(sync)) {
    return 'Workshop + guided practice';
  }
  if (/\b(case|scenario)\b/.test(sync)) return 'Case discussion + applied analysis';
  if (/\b(present|critique|peer review|showcase|pitch)\b/.test(sync)) return 'Presentation + peer critique';
  if (/\b(debate|discussion|seminar)\b/.test(sync)) {
    return /\bread\b/.test(async) ? 'Interactive seminar + reading' : 'Interactive seminar + discussion';
  }
  if (/\b(watch|video|screencast|lecture)\b/.test(async)) {
    return /\bquiz\b/.test(assessments) ? 'Video lecture + quiz' : 'Video lecture + discussion';
  }
  const fallbacks = ['Interactive lecture + discussion', 'Guided practice + debrief', 'Seminar + applied exercise'];
  return fallbacks[lessonIndex % fallbacks.length];
}

function deriveTechnologyNeeded(section) {
  const sync = cellLines(section.syncActivities).join(' ');
  const combined = [
    sync,
    cellLines(section.asyncActivities).join(' '),
    cellLines(section.weeklyAssessments).join(' '),
  ].join(' ');
  const tools = ['LMS (readings, submissions, announcements)'];
  if (sync.trim()) tools.push('Video conferencing (synchronous session)');
  if (/\b(group|collaborat\w*|peer|team)\b/i.test(combined)) tools.push('Shared documents (group work)');
  if (/\b(video|watch|screencast|documentary)\b/i.test(combined)) {
    tools.push('Streaming video platform (assigned media)');
  }
  // v0.10.1 (live-run audit): lab courses derived only LMS + video — surface
  // the bench reality when activities are clearly laboratory work.
  if (
    /\b(lab|laboratory|experiment\w*|titration|spectroscop\w+|chromatograph\w+|microscop\w+|synthesis|reagent|specimen|dissect\w+|assay|recrystalliz\w+)\b/i.test(
      combined,
    )
  ) {
    tools.push('Laboratory equipment and instrumentation (see experiment list)');
  }
  for (const tool of cellLines(section.specialTools)) {
    if (!tools.some((existing) => existing.toLowerCase().startsWith(tool.toLowerCase()))) tools.push(tool);
  }
  return tools.map((tool, index) => `${index + 1}. ${tool}`).join('\n');
}

// v0.14.1 (1.8): evaluateDesign is COMPUTED from the section's actual
// objective↔assessment↔activity lexical overlap — the four rotating
// always-positive templates asserted alignment they never checked. The
// course-level alignmentLint (courseGraph/alignmentLint.js) checks graph
// edges; these are the deterministic section-local equivalents, run on the
// raw cells before any graph exists.
const ALIGNMENT_STOPWORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'from',
  'into',
  'onto',
  'about',
  'their',
  'this',
  'that',
  'these',
  'those',
  'through',
  'using',
  'between',
  'within',
  'where',
  'which',
  'while',
  'will',
  'have',
  'each',
  'than',
  'then',
  'them',
  'they',
  'your',
  'one',
  'two',
  'how',
  'course',
  'week',
  'weekly',
  'lesson',
  'section',
  'student',
  'students',
  'chapter',
]);

function alignmentWords(line) {
  return (
    cleanAtom(line)
      .toLowerCase()
      .match(/[a-z]{3,}/g) || []
  ).filter((word) => !ALIGNMENT_STOPWORDS.has(word));
}

function stemOf(word) {
  const stripped = word.replace(/(?:ations?|ements?|ings?|ities|ity|ies|ers?|ed|es|s)$/, '');
  return stripped.length >= 3 ? stripped : word;
}

function wordsShareStem(a, b) {
  const stemA = stemOf(a);
  const stemB = stemOf(b);
  if (stemA.length < 3 || stemB.length < 3) return stemA === stemB;
  return stemA.startsWith(stemB) || stemB.startsWith(stemA);
}

function poolReflectsObjective(poolWords, objectiveWords) {
  return objectiveWords.some((objectiveWord) => poolWords.some((poolWord) => wordsShareStem(poolWord, objectiveWord)));
}

export function deriveEvaluateDesign(section) {
  const objectives = cellLines(section.learningObjectives).filter((line) => !/^students will be able to/i.test(line));
  const assessmentLines = cellLines(section.weeklyAssessments);
  const activityLines = [...cellLines(section.syncActivities), ...cellLines(section.asyncActivities)];
  const assessmentWords = assessmentLines.flatMap(alignmentWords);
  const activityWords = activityLines.flatMap(alignmentWords);

  const findings = [];
  if (objectives.length === 0) {
    findings.push('No learning objectives are stated for this section, so alignment cannot be confirmed.');
  }
  if (assessmentLines.length === 0) {
    findings.push('No assessment is listed for this section, so its objectives are not measured.');
  }
  if (objectives.length > 0 && assessmentLines.length > 0) {
    for (const objective of objectives) {
      const objectiveWords = alignmentWords(objective);
      if (objectiveWords.length === 0) continue;
      const label = clipPhrase(objective, 9);
      if (!poolReflectsObjective(assessmentWords, objectiveWords)) {
        findings.push(`Objective '${label}' has no matching assessment in this section.`);
      } else if (activityLines.length > 0 && !poolReflectsObjective(activityWords, objectiveWords)) {
        findings.push(`Objective '${label}' has no supporting activity in this section.`);
      }
    }
  }
  if (findings.length > 0) return findings.join(' ');

  const verbs = objectiveVerbs(section.learningObjectives);
  const verbList = verbs.length > 0 ? ` (${verbs.join(', ')})` : '';
  if (activityLines.length === 0) {
    return `Each objective verb${verbList} is measured by an assessment; no activities are listed to rehearse it first.`;
  }
  return `Each objective verb${verbList} is exercised by an activity and measured by an assessment.`;
}

export function deriveCompilerOwnedColumns(courseMap) {
  if (!courseMap || !Array.isArray(courseMap.lessons)) return courseMap;
  let changed = false;
  const lessons = courseMap.lessons.map((lesson, lessonIndex) => {
    if (!lesson || !Array.isArray(lesson.sections)) return lesson;
    const derivedKeys = new Set(Array.isArray(lesson.compilerDerived) ? lesson.compilerDerived : []);
    let lessonChanged = false;
    const sections = lesson.sections.map((section) => {
      if (!section || typeof section !== 'object') return section;
      const next = { ...section };
      let sectionChanged = false;
      if (!hasCellContent(next.presentationFormat)) {
        next.presentationFormat = derivePresentationFormat(next, lessonIndex);
        derivedKeys.add('presentationFormat');
        sectionChanged = true;
      }
      if (!hasCellContent(next.technologyNeeded)) {
        next.technologyNeeded = deriveTechnologyNeeded(next);
        derivedKeys.add('technologyNeeded');
        sectionChanged = true;
      }
      if (!hasCellContent(next.evaluateDesign)) {
        next.evaluateDesign = deriveEvaluateDesign(next);
        derivedKeys.add('evaluateDesign');
        sectionChanged = true;
      }
      if ('specialTools' in next) {
        delete next.specialTools;
        sectionChanged = true;
      }
      if (sectionChanged) {
        lessonChanged = true;
        return next;
      }
      return section;
    });
    if (!lessonChanged) return lesson;
    changed = true;
    return derivedKeys.size > 0
      ? { ...lesson, sections, compilerDerived: [...derivedKeys].sort() }
      : { ...lesson, sections };
  });
  return changed ? { ...courseMap, lessons } : courseMap;
}
