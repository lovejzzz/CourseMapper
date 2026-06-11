/**
 * v0.12.1 output artifact gate — the release-gate greps from
 * docs/V0.12.1_ENRICHMENT_ACTIVATION_AND_EXPORT_POLISH_ROADMAP.md as a
 * permanent regression test.
 *
 * Compiles two full fixture packages (every blueprint deliverable) through
 * the REAL exporters (DOCX/PPTX/XLSX), extracts all rendered text, and
 * asserts zero hits for every deterministic artifact class the v0.12
 * four-course audit found in production files.
 *
 * v0.14.1 Phase 0.2 — gate extensions for the OUTPUT-V014 four-course audit
 * defect classes (docs/V0.14.1_OUTPUT_INTEGRITY_ROADMAP.md). Check status:
 *
 * ARMED (fixtures verified clean today — any hit fails the suite):
 *   - JSON syntax leaking into cell/paragraph text (Mandarin row 26)
 *   - Fused-title interior-lowercase casing ("Grammar Check and oral Drill")
 *   - Internal vocabulary, armed subset: "Lab Evidence Thread",
 *     "Preference profile:"
 *   - Week-label consistency ("the Week N quiz" vs the enclosing lesson)
 *   - Cover meta "N sections" on lesson-rooted features (item 1.11)
 *   - Internal vocabulary, pending subset: "evidence routine",
 *     "Evidence Thread packet item" (item 1.10)
 *   - Truncated slide bullets (items 1.3 + 5.2d: cuts end in "…", long
 *     complete bullets keep terminal punctuation)
 *   - eastAsia font override (docx w:eastAsia / pptx a:ea) (item 1.13)
 *
 * All v0.14.1 phase 0.2 gates are armed — zero it.fails markers remain.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import JSZip from 'jszip';

import {
  buildCourseBlueprint,
  compileBlueprintDeliverable,
  getBlueprintCompiledFeatures,
} from '../src/lib/courseBlueprintCompiler';
import { buildDeliverableDocxBlob } from '../src/lib/exporters/bulkDocxExporter';
import { buildSlideDeckPptxBlob } from '../src/lib/exporters/pptxExporter';
import { buildXlsxBuffer } from '../src/lib/xlsxGenerator';

const COURSES = [
  {
    courseName: 'Introduction to Nutrition',
    topics: [
      ['Foundations of Nutrition Science', 'Macronutrients', 'Diet log baseline'],
      ['Carbohydrates and Energy from Food', 'Carbohydrate types', 'Glycemic response'],
      ['Lipids and Proteins', 'Fat quality', 'Protein adequacy'],
      ['Digestion and Absorption', 'GI tract function', 'Nutrient transport'],
      ['Energy Balance and Metabolism', 'Energy expenditure', 'Metabolic adaptation'],
    ],
  },
  {
    courseName: 'Principles of Microeconomics',
    topics: [
      ['Scarcity and Economic Thinking', 'Opportunity cost', 'Marginal analysis'],
      ['Demand and Supply Basics', 'Demand curve', 'Market equilibrium'],
      ['Elasticity and Market Responsiveness', 'Price elasticity of demand', 'Tax incidence'],
      ['Consumer Choice and Demand', 'Utility maximization', 'Budget constraints'],
      ['Production and Costs', 'Marginal product', 'Cost curves'],
    ],
  },
];

const GATE_FEATURES = [
  'syllabus',
  'lessonPlans',
  'slideDecks',
  'assignments',
  'rubrics',
  'discussions',
  'quizBank',
  'studyGuides',
  'courseFaq',
];

function fixtureCourseMap({ courseName, topics }) {
  return {
    courseName,
    lessons: topics.map(([title, c1, c2], i) => ({
      title: `Lesson ${i + 1}: ${title}`,
      sections: [
        {
          learningGoals: `1. Build working knowledge of ${title.toLowerCase()} for applied decisions.`,
          topicSection: `${i + 1}.1: ${c1}`,
          learningObjectives: `Analyze ${c1.toLowerCase()} using course evidence.\nEvaluate how ${c2.toLowerCase()} changes a real decision.`,
          weeklyAssessments: `1. Week ${i + 1} quiz: applied ${c1.toLowerCase()} problems.`,
          asyncActivities: `1. Read: assigned chapter on ${title.toLowerCase()}.`,
          syncActivities: `1. Workshop: ${c2.toLowerCase()} case analysis.`,
          supportingResources: `OpenStax chapter on ${title.toLowerCase()}`,
        },
      ],
    })),
  };
}

// Every entry mirrors a defect class shipped in the v0.12 production audit.
const ARTIFACT_PATTERNS = [
  // Same letter twice ("A. A. Option"), not preceded by an author-list comma —
  // v0.13.5's cited references legitimately print APA initials ("H. L.",
  // "Adesope, O. O.") which the original any-two-initials pattern flagged.
  [/(?<!, )\b([A-Z])\. \1\. /, 'doubled option letters "A. A."'],
  [/\bits the /i, 'slot grammar "its the"'],
  [/\bname one the /i, '"name one the Week N quiz"'],
  [/[a-z]\.\.(?!\.)/, 'double period'],
  [/Learning {2}Objectives/, 'double-space column label'],
  [/Instructor-provided course materials/i, 'unresolved source placeholder'],
  [/multiple_choice|short_answer/, 'raw enum id in print'],
  // Echo chains only — "Practice with X: For X" / "X: X". A plain
  // ": For Week 1 quiz, …" is legitimate English and must not trip the gate.
  [/\b([A-Z][\w &'-]{3,50}): For \1\b/, '"X: For X" echo chain'],
  [/\b([A-Z][\w &'-]{3,50}): \1\b/, '"X: X" echo chain'],
];

// ── v0.14.1 Phase 0.2 pattern tables (OUTPUT-V014 defect classes) ──────────

// Raw JSON syntax rendered as visible cell text — the Mandarin course map
// shipped `topicSection": "` inside row 26 and the corruption propagated
// into the brief and syllabus (roadmap item 1.15).
const JSON_SYNTAX_PATTERNS = [
  [/\b(topicSection|learningObjectives|weeklyAssessments)"\s*:/, 'raw course-map JSON key in cell text'],
  [/"\s*:\s*\[/, 'JSON array syntax `": [` in cell text'],
];

// Two assessment atoms fused with `and` + first-char-lowercased second label
// (courseBlueprintCompiler fusion, roadmap item 1.2): "Grammar Check and
// oral Drill", "Participation Check and exit Ticket", and the colon-title
// form "Quiz: plate boundary evidence and map Activity".
const FUSED_TITLE_PATTERNS = [
  [/\b[A-Z][a-z]+ and [a-z]+ [A-Z][a-z]+/, 'fused title with interior-lowercase label'],
  [/: [a-z][a-z ]+ and [a-z]+ [A-Z][a-z]+/, 'fused colon-title with interior-lowercase label'],
];

// Internal pipeline vocabulary in student-facing text (roadmap item 1.10).
// Both subsets are armed since item 1.10 landed; the split is kept so the
// detector self-tests below keep naming which audit string each table owns.
const ARMED_INTERNAL_VOCAB_PATTERNS = [
  [/Lab Evidence Thread/, 'internal projectName "Lab Evidence Thread"'],
  [/Preference profile:/, 'raw bucket token "Preference profile:"'],
];
const PENDING_INTERNAL_VOCAB_PATTERNS = [
  [/Evidence Thread packet item/, 'internal phrase "Evidence Thread packet item"'],
  [/\bevidence routine\b/, 'internal modality id "evidence routine"'],
];

// Features whose root array is one-entry-per-lesson; their docx covers must
// say "N lessons", never the neutral "N sections". `assignments` is the
// audited bug — missing from bulkDocxExporter's LESSON_ROOTED_FEATURES
// (item 1.11, which should also audit rubrics/faqs).
const SHOULD_BE_LESSON_ROOTED = ['lessonPlans', 'slideDecks', 'quizBank', 'studyGuides', 'discussions', 'assignments'];

// docx string fonts expand to all four w:rFonts slots including eastAsia,
// and the pptx run properties pin a:ea — both force CJK glyphs into
// Calibri/Georgia, which have none (item 1.13). The attribute is emitted
// deterministically regardless of content, so the English fixtures are a
// valid probe surface.
const EAST_ASIA_OVERRIDE_PATTERN = /w:eastAsia="(?:Calibri|Georgia)"|<a:ea typeface="(?:Calibri|Georgia)"/;

// Truncated slide bullet heuristic (item 1.3): the compiler caps bullets at
// 78/112 chars and cuts at a word boundary, leaving content words dangling
// ("…adapts the course pattern: run"). A bullet >= 60 chars that ends in a
// bare lowercase letter has no terminal punctuation by definition; lines
// under 60 chars (legitimately unpunctuated short labels) and ALL-CAPS
// headers (never end in [a-z]) are exempt.
function isTruncatedBulletLine(line) {
  return line.length >= 60 && /[a-z]$/.test(line);
}

// Week-label consistency (item 1.1): the language finalizer dedupes
// replacement targets by pattern text, so titles shared across lessons all
// rewrite to the first lesson's week — CS shipped "the Week 2 quiz" inside
// lessons 3–14, 1,064 times. Any "the Week N quiz/check/exam/paper" inside
// a lesson-scoped compiled item must match that item's lesson number.
// ("the next Week 1 quiz" is a forward reference and does not match.)
function findWeekLabelMismatches(data, courseName, surface) {
  const failures = [];
  for (const value of Object.values(data || {})) {
    if (!Array.isArray(value)) continue;
    for (const item of value) {
      if (!item || typeof item !== 'object') continue;
      const scope = item.lessonTitle || (Array.isArray(item.relatedLessons) ? item.relatedLessons[0] : '') || '';
      const scopeMatch = /Lesson (\d+)\b/.exec(String(scope));
      const lessonNumber = scopeMatch
        ? Number(scopeMatch[1])
        : item.blueprintGrounding?.lessonNumber || item.sourceGrounding?.lessonNumber;
      if (!lessonNumber) continue;
      const itemText = JSON.stringify(item);
      for (const ref of itemText.matchAll(/\bthe Week (\d+) (?:quiz|check|exam|paper)/gi)) {
        if (Number(ref[1]) !== lessonNumber) {
          failures.push(`${courseName} / ${surface}: lesson ${lessonNumber} references "${ref[0]}"`);
        }
      }
    }
  }
  return failures;
}

async function extractRenderedParts(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const xmls = [];
  for (const name of Object.keys(zip.files)) {
    if (/\.(xml|rels)$/.test(name)) {
      xmls.push(await zip.file(name).async('string'));
    }
  }
  const rawXml = xmls.join('\n');
  // Paragraph-level lines (docx </w:p>, pptx </a:p>) for per-bullet checks.
  const paragraphs = [];
  for (const xml of xmls) {
    for (const para of xml.split(/<\/(?:w|a):p>/)) {
      const line = para
        .replace(/<[^>]+>/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      if (line) paragraphs.push(line);
    }
  }
  return { rawXml, text: rawXml.replace(/<[^>]+>/g, ' '), paragraphs };
}

// Compile + render each fixture course once and share the surfaces across
// every gate test. Each surface: { surface, data, rawXml, text, paragraphs }
// (data is null for the xlsx course map — it has no compiled deliverable).
const surfaceCache = new Map();
function getCourseSurfaces(course) {
  if (!surfaceCache.has(course.courseName)) {
    surfaceCache.set(
      course.courseName,
      (async () => {
        const courseMap = fixtureCourseMap(course);
        const blueprint = buildCourseBlueprint(courseMap);
        const features = getBlueprintCompiledFeatures(GATE_FEATURES, { enabled: true });
        const surfaces = [];
        for (const featureId of features) {
          const data = compileBlueprintDeliverable(featureId, blueprint);
          const blob =
            featureId === 'slideDecks'
              ? await buildSlideDeckPptxBlob(data, course.courseName, 0)
              : await buildDeliverableDocxBlob(featureId, data, course.courseName);
          const parts = await extractRenderedParts(await blob.arrayBuffer());
          surfaces.push({ surface: featureId, data, ...parts });
        }
        const xlsxParts = await extractRenderedParts(buildXlsxBuffer(courseMap, []));
        surfaces.push({ surface: 'courseMap.xlsx', data: null, ...xlsxParts });
        return surfaces;
      })(),
    );
  }
  return surfaceCache.get(course.courseName);
}

// Scan every rendered surface of every fixture course against a pattern
// table, returning one annotated failure line per hit.
async function scanSurfaces(patterns, { surfaceFilter } = {}) {
  const failures = [];
  for (const course of COURSES) {
    for (const { surface, text } of await getCourseSurfaces(course)) {
      if (surfaceFilter && !surfaceFilter(surface)) continue;
      for (const [pattern, label] of patterns) {
        const match = text.match(pattern);
        if (match) {
          const at = Math.max(0, match.index - 70);
          failures.push(
            `${course.courseName} / ${surface}: ${label} — …${text.slice(at, match.index + 90).replace(/\s+/g, ' ')}…`,
          );
        }
      }
    }
  }
  return failures;
}

beforeEach(() => {
  // The pptx text-fit pass measures with OffscreenCanvas — stub it the
  // same way pptxExporter.test.js does so the gate runs in a node env.
  const context = { font: '', measureText: (text) => ({ width: String(text || '').length * 7 }) };
  globalThis.OffscreenCanvas = class OffscreenCanvas {
    getContext() {
      return context;
    }
  };
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

describe('output artifact gate (v0.12.1)', () => {
  it('ships zero deterministic text artifacts across all compiled export surfaces', async () => {
    const failures = await scanSurfaces(ARTIFACT_PATTERNS);
    expect(failures, failures.join('\n')).toEqual([]);
  }, 120000);
});

describe('output artifact gate extensions (v0.14.1 phase 0.2)', () => {
  it('ships zero raw JSON syntax in rendered cell or paragraph text', async () => {
    const failures = await scanSurfaces(JSON_SYNTAX_PATTERNS);
    expect(failures, failures.join('\n')).toEqual([]);
  }, 120000);

  it('ships zero fused titles with interior-lowercase casing', async () => {
    const failures = await scanSurfaces(FUSED_TITLE_PATTERNS);
    expect(failures, failures.join('\n')).toEqual([]);
  }, 120000);

  it('ships zero armed internal-vocabulary strings in student-facing text', async () => {
    const failures = await scanSurfaces(ARMED_INTERNAL_VOCAB_PATTERNS);
    expect(failures, failures.join('\n')).toEqual([]);
  }, 120000);

  it('keeps every "the Week N" reference consistent with its enclosing lesson', async () => {
    const failures = [];
    for (const course of COURSES) {
      for (const { surface, data } of await getCourseSurfaces(course)) {
        if (!data) continue;
        failures.push(...findWeekLabelMismatches(data, course.courseName, surface));
      }
    }
    expect(failures, failures.join('\n')).toEqual([]);
  }, 120000);

  // V0.14.1 item 1.11 landed (bulkDocxExporter COVER_NOUNS) — active gate.
  it('renders no "N sections" cover meta on lesson-rooted features', async () => {
    const failures = await scanSurfaces([[/\b\d+ sections\b/, 'neutral "N sections" cover meta']], {
      surfaceFilter: (surface) => SHOULD_BE_LESSON_ROOTED.includes(surface),
    });
    expect(failures, failures.join('\n')).toEqual([]);
  }, 120000);

  // V0.14.1 item 1.10 landed (preference display phrases, modality routine
  // labels, human throughline names in courseBlueprintCompiler) — active gate.
  it('ships zero pending internal-vocabulary strings in student-facing text', async () => {
    const failures = await scanSurfaces(PENDING_INTERNAL_VOCAB_PATTERNS);
    expect(failures, failures.join('\n')).toEqual([]);
  }, 120000);

  // V0.14.1 items 1.3 + 5.2d landed (ellipsis-marked cuts + long complete
  // bullets keep terminal punctuation in courseBlueprintCompiler's
  // compactSlideDisplayBullet/punctuateDisplayBullet) — active gate: a
  // >=60-char line ending in a bare lowercase word is now a true defect.
  it('ships zero truncated slide bullets ending in a bare content word', async () => {
    const failures = [];
    for (const course of COURSES) {
      for (const { surface, data, paragraphs } of await getCourseSurfaces(course)) {
        if (surface !== 'slideDecks') continue;
        // Narrow exemption (5.2d): slide TITLES are headings — heading style
        // is legitimately unpunctuated at any length, and 5.2d punctuates
        // body bullets only. Exempt exact title lines taken from the same
        // compiled deck data the blob was rendered from; everything else on
        // the slide (bullets, notes, table cells) stays in scope.
        const titleLines = new Set(
          (data?.decks || []).flatMap((deck) =>
            [deck.lessonTitle, ...(deck.slides || []).map((slide) => slide.title)].map((title) =>
              String(title || '')
                .replace(/\s+/g, ' ')
                .trim(),
            ),
          ),
        );
        for (const line of paragraphs) {
          if (titleLines.has(line)) continue;
          if (isTruncatedBulletLine(line)) {
            failures.push(`${course.courseName} / ${surface}: truncated bullet — "…${line.slice(-80)}"`);
          }
        }
      }
    }
    expect(failures, failures.join('\n')).toEqual([]);
  }, 120000);

  // V0.14.1 item 1.13 landed (object run fonts + pptx a:ea strip) — active gate.
  it('writes no eastAsia font override pinned to a non-CJK body font', async () => {
    const failures = [];
    for (const course of COURSES) {
      for (const { surface, rawXml } of await getCourseSurfaces(course)) {
        const match = rawXml.match(EAST_ASIA_OVERRIDE_PATTERN);
        if (match) {
          failures.push(`${course.courseName} / ${surface}: eastAsia override — ${match[0]}`);
        }
      }
    }
    expect(failures, failures.join('\n')).toEqual([]);
  }, 120000);
});

// Negative fixtures: every detector must trip on the literal defect strings
// the OUTPUT-V014 audit pulled from shipped files — and stay quiet on the
// healthy near-misses that previously caused false positives.
describe('v0.14.1 detector self-tests (audited defect strings must trip)', () => {
  const matchesAny = (patterns, sample) => patterns.some(([pattern]) => pattern.test(sample));

  it('flags raw JSON syntax from the Mandarin row-26 corruption', () => {
    const defects = [
      'Estimated speaking practice topicSection": "26.1: Oral assessment prep',
      'learningObjectives": Recognize 60 characters in context',
      'weeklyAssessments": 1. Oral drill check',
      'sections": [{"topicSection": "26.1"',
    ];
    for (const sample of defects) {
      expect(matchesAny(JSON_SYNTAX_PATTERNS, sample), sample).toBe(true);
    }
    expect(matchesAny(JSON_SYNTAX_PATTERNS, 'Topic Section 26.1: Oral assessment prep')).toBe(false);
  });

  it('flags the "N sections" cover meta string', () => {
    expect(/\b\d+ sections\b/.test('Assignment Briefs — 15 sections')).toBe(true);
    expect(/\b\d+ sections\b/.test('Assignment Briefs — 15 lessons')).toBe(false);
  });

  it('flags the audited fused-title casing defects', () => {
    const defects = [
      'Grammar Check and oral Drill',
      'Quiz: plate boundary evidence and map Activity',
      'Participation Check and exit Ticket',
    ];
    for (const sample of defects) {
      expect(matchesAny(FUSED_TITLE_PATTERNS, sample), sample).toBe(true);
    }
    for (const healthy of [
      'Grammar Check and Oral Drill',
      'Carbohydrates and Energy from Food',
      'Demand and Supply Basics',
      'Workshop: price elasticity of demand and tax incidence',
    ]) {
      expect(matchesAny(FUSED_TITLE_PATTERNS, healthy), healthy).toBe(false);
    }
  });

  it('flags all four audited internal-vocabulary strings', () => {
    const allVocab = [...ARMED_INTERNAL_VOCAB_PATTERNS, ...PENDING_INTERNAL_VOCAB_PATTERNS];
    const defects = [
      'Lab Evidence Thread',
      'Evidence Thread packet item',
      'Preference profile: criterion-specific',
      'lecture exam evidence routine',
    ];
    for (const sample of defects) {
      expect(matchesAny(allVocab, sample), sample).toBe(true);
    }
    expect(matchesAny(allVocab, 'Students follow the weekly evidence checklist')).toBe(false);
  });

  it('flags the CS "the Week 2 quiz" label inside a lesson 3 item', () => {
    const defect = {
      quizzes: [
        {
          lessonTitle: 'Lesson 3: Control Flow and Loops',
          formativeFeedbackNote: 'Use the result to plan one revision before the Week 2 quiz.',
        },
      ],
    };
    expect(findWeekLabelMismatches(defect, 'CS', 'quizBank')).toHaveLength(1);
    const healthy = {
      quizzes: [
        {
          lessonTitle: 'Lesson 2: Variables and Types',
          formativeFeedbackNote: 'Use the result to plan one revision before the Week 2 quiz.',
        },
        {
          lessonTitle: 'Lesson 3: Control Flow and Loops',
          // Forward reference without an enclosing-week label — must not trip.
          intendedUse: 'review distractor choices before the next Week 1 quiz.',
        },
      ],
    };
    expect(findWeekLabelMismatches(healthy, 'CS', 'quizBank')).toEqual([]);
  });

  it('flags the audited truncated-bullet tails and exempts healthy lines', () => {
    const defects = [
      'Practice: Introduction to Computer Science with Python adapts the course pattern: run',
      'Physical Geology: Feedback on the Week 3 lab checkpoint should point',
      'Reviewing the autograded checkpoint before submission asks students',
      'World Literature close reading practice: Move students from naming',
    ];
    for (const sample of defects) {
      expect(isTruncatedBulletLine(sample), sample).toBe(true);
    }
    for (const healthy of [
      'Today students improve: Week 3 quiz', // short label — legitimately unpunctuated
      'KEY TERMS AND CORE DEFINITIONS FOR THE WEEK THIRTEEN REVIEW SESSION', // ALL-CAPS header
      'Students compare the two evidence choices and explain the stronger one.',
      'Decision cue: choose the professional decision for Week 2 quiz?',
    ]) {
      expect(isTruncatedBulletLine(healthy), healthy).toBe(false);
    }
  });

  it('flags eastAsia overrides pinned to Calibri/Georgia in both office XML dialects', () => {
    const defects = [
      '<w:rFonts w:ascii="Georgia" w:hAnsi="Georgia" w:cs="Georgia" w:eastAsia="Georgia"/>',
      '<w:rFonts w:ascii="Calibri" w:eastAsia="Calibri"/>',
      '<a:ea typeface="Georgia"/>',
    ];
    for (const sample of defects) {
      expect(EAST_ASIA_OVERRIDE_PATTERN.test(sample), sample).toBe(true);
    }
    for (const healthy of [
      '<w:rFonts w:ascii="Georgia" w:hAnsi="Georgia" w:cs="Georgia"/>',
      '<w:rFonts w:eastAsia="Yu Mincho"/>',
      '<a:ea typeface="+mn-ea"/>',
    ]) {
      expect(EAST_ASIA_OVERRIDE_PATTERN.test(healthy), healthy).toBe(false);
    }
  });
});
