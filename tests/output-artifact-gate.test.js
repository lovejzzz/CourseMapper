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
// v0.14.1: the armed defect-class patterns now live in one shared, importable
// module so the live-run deep quality grader checks the SAME tables this gate
// pins. The tuple views ([regex, label]) keep scanSurfaces byte-identical.
import {
  ARTIFACT_PATTERN_TUPLES,
  JSON_SYNTAX_PATTERN_TUPLES,
  FUSED_TITLE_PATTERN_TUPLES,
  ARMED_INTERNAL_VOCAB_PATTERN_TUPLES,
  PENDING_INTERNAL_VOCAB_PATTERN_TUPLES,
  COVER_META_PATTERN_TUPLES,
  SHOULD_BE_LESSON_ROOTED,
  EAST_ASIA_OVERRIDE_PATTERN,
  isTruncatedBulletLine,
  findWeekLabelMismatches as findWeekLabelMismatchDescriptors,
} from './lib/artifactDefectPatterns.js';

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

// The armed defect-class tables now live in src/lib/quality/
// artifactDefectPatterns.js (v0.14.3 A1 — app-loadable, imported here via
// the tests/lib shim; shared with the live-run deep quality grader). The
// gate consumes the tuple views so scanSurfaces stays byte-identical.
const ARTIFACT_PATTERNS = ARTIFACT_PATTERN_TUPLES;
const JSON_SYNTAX_PATTERNS = JSON_SYNTAX_PATTERN_TUPLES;
const FUSED_TITLE_PATTERNS = FUSED_TITLE_PATTERN_TUPLES;
const ARMED_INTERNAL_VOCAB_PATTERNS = ARMED_INTERNAL_VOCAB_PATTERN_TUPLES;
const PENDING_INTERNAL_VOCAB_PATTERNS = PENDING_INTERNAL_VOCAB_PATTERN_TUPLES;

// Week-label consistency (item 1.1): the shared findWeekLabelMismatches
// returns rich descriptors; the gate wants the one-line `detail` strings it
// always compared, so adapt the descriptor shape here.
function findWeekLabelMismatches(data, courseName, surface) {
  return findWeekLabelMismatchDescriptors(data, courseName, surface).map((failure) => failure.detail);
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
    const failures = await scanSurfaces(COVER_META_PATTERN_TUPLES, {
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

// v0.14.3 WS-A A5(2): every generated package ships its own audit — the gate
// builds a real package zip from the healthy fixture and asserts the quality
// surface (QUALITY_REPORT.md at the zip root + manifest.quality with the
// graded score) the way a downloaded package carries it.
describe('package quality surface (v0.14.3 WS-A)', () => {
  it('ships QUALITY_REPORT.md and a manifest.quality block (score ≥ 85) on the healthy fixture package', async () => {
    const { compileBlueprintDeliverables } = await import('../src/lib/courseBlueprintCompiler');
    const { deriveCourseGraphFromCourseMap, buildBlueprintFromGraph, renderCourseMapFromGraph } =
      await import('../src/lib/courseGraph');
    const { buildCourseMaterialsZip } = await import('../src/lib/packageZipExporter.js');

    const course = COURSES[0];
    const courseMap = fixtureCourseMap(course);
    const graph = deriveCourseGraphFromCourseMap(courseMap);
    const blueprint = buildBlueprintFromGraph(graph);
    const compiled = compileBlueprintDeliverables(blueprint, GATE_FEATURES);
    const deliverables = {};
    for (const featureId of GATE_FEATURES) {
      deliverables[featureId] = { status: 'done', data: compiled[featureId] };
    }
    const result = await buildCourseMaterialsZip({
      courseMap: renderCourseMapFromGraph(graph, { assessmentReferences: true }),
      courseName: course.courseName,
      deliverables,
      featureIds: ['courseMap', ...GATE_FEATURES],
      courseGraph: graph,
    });

    expect(result.quality?.status).toBe('graded');
    expect(result.quality.score, JSON.stringify(result.qualityResult?.findings || [])).toBeGreaterThanOrEqual(85);
    expect(result.quality.findingCounts.p0).toBe(0);

    const zip = await JSZip.loadAsync(await result.blob.arrayBuffer());
    expect(zip.file('QUALITY_REPORT.md')).toBeTruthy();
    const manifest = JSON.parse(await zip.file('PACKAGE_MANIFEST.json').async('string'));
    expect(manifest.quality).toEqual(result.quality);
    expect(manifest.quality.graderVersion).toBeTruthy();
    expect(Object.keys(manifest.quality.dimensions || {}).length).toBeGreaterThan(0);
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
