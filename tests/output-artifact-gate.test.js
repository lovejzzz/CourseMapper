/**
 * v0.12.1 output artifact gate — the release-gate greps from
 * docs/V0.12.1_ENRICHMENT_ACTIVATION_AND_EXPORT_POLISH_ROADMAP.md as a
 * permanent regression test.
 *
 * Compiles two full fixture packages (every blueprint deliverable) through
 * the REAL exporters (DOCX/PPTX/XLSX), extracts all rendered text, and
 * asserts zero hits for every deterministic artifact class the v0.12
 * four-course audit found in production files.
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

async function extractRenderedText(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const texts = [];
  for (const name of Object.keys(zip.files)) {
    if (/\.(xml|rels)$/.test(name)) {
      const xml = await zip.file(name).async('string');
      texts.push(xml.replace(/<[^>]+>/g, ' '));
    }
  }
  return texts.join('\n');
}

describe('output artifact gate (v0.12.1)', () => {
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

  it('ships zero deterministic text artifacts across all compiled export surfaces', async () => {
    const failures = [];
    for (const course of COURSES) {
      const courseMap = fixtureCourseMap(course);
      const blueprint = buildCourseBlueprint(courseMap);
      const features = getBlueprintCompiledFeatures(
        [
          'syllabus',
          'lessonPlans',
          'slideDecks',
          'assignments',
          'rubrics',
          'discussions',
          'quizBank',
          'studyGuides',
          'courseFaq',
        ],
        { enabled: true },
      );
      const surfaces = [];
      for (const featureId of features) {
        const data = compileBlueprintDeliverable(featureId, blueprint);
        const blob =
          featureId === 'slideDecks'
            ? await buildSlideDeckPptxBlob(data, course.courseName, 0)
            : await buildDeliverableDocxBlob(featureId, data, course.courseName);
        surfaces.push([featureId, await extractRenderedText(await blob.arrayBuffer())]);
      }
      surfaces.push(['courseMap.xlsx', await extractRenderedText(buildXlsxBuffer(courseMap, []))]);

      for (const [surface, text] of surfaces) {
        for (const [pattern, label] of ARTIFACT_PATTERNS) {
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
    expect(failures, failures.join('\n')).toEqual([]);
  }, 120000);
});
