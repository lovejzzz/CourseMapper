/**
 * v0.14.1 Phase 1 batch C — exporter and projection integrity:
 *   1.5  sample answers engage their own scenario (composeScenarioAnswer)
 *   1.11 bulk DOCX cover meta uses the feature's own noun, never "N sections"
 *        for lesson-rooted features
 *   1.12 Required Assets are genre-gated (no .parquet lists for Mandarin;
 *        wet-lab courses get a wet-lab list instead of nothing)
 *   1.13 CJK font safety — no w:eastAsia="Calibri/Georgia" in DOCX runs, no
 *        run-level <a:ea typeface="Georgia/Trebuchet MS"> in PPTX
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import JSZip from 'jszip';

import { composeScenarioAnswer, projectKernelToSurfaces } from '../src/lib/kernelProjection';
import { buildDeliverableDocxBlob } from '../src/lib/exporters/bulkDocxExporter';
import { buildSlideDeckPptxBlob } from '../src/lib/exporters/pptxExporter';
import { classifyCourseAssetGenre, collectRequiredLabAssets } from '../src/lib/requiredLabAssets';

async function readZipEntries(blob, pattern) {
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const entries = {};
  for (const name of Object.keys(zip.files)) {
    if (pattern.test(name)) entries[name] = await zip.file(name).async('string');
  }
  return entries;
}

const KERNEL = {
  facts: [
    'Water expands by about nine percent when it freezes.',
    'Daily freeze-thaw cycles occur more than 100 times per year in alpine climates.',
    'Frost wedging splits granite along existing joints.',
  ],
  keyTerms: [
    {
      term: 'frost wedging',
      definition: 'Frost wedging is the widening of rock cracks as freezing water expands.',
      example: 'Granite boulders splitting after repeated hard winters',
      misconception: 'Students think rocks crack from cold alone rather than from water expanding inside them.',
    },
    {
      term: 'mechanical weathering',
      definition: 'Mechanical weathering is the physical breakdown of rock without chemical change.',
      example: 'Talus slopes below cliff faces',
      misconception: 'Students conflate mechanical weathering with erosion, which moves material away.',
    },
  ],
  scenario: {
    setup: 'A farmer notices that granite boulders in her field crack and split after several freezing winters.',
    materials: 'photos of the cracked boulders',
  },
  discussionPrompt: {
    prompt: 'Is mechanical weathering more important than chemical weathering in shaping cold-climate landscapes',
    tension: 'Rate versus total work done over geologic time.',
    positions: [
      'Mechanical weathering dominates in cold climates.',
      'Chemical weathering does more total work worldwide.',
    ],
  },
  mc: [],
};

// ── 1.5 sample answers engage the scenario ─────────────────────────────────
describe('1.5 composeScenarioAnswer', () => {
  it('builds the answer around the scenario subject with no doubled periods', () => {
    const answer = composeScenarioAnswer(KERNEL.scenario, KERNEL.keyTerms[0], KERNEL.facts[2]);
    // References the scenario's own subject, not just the bare definition.
    expect(answer).toContain('granite boulders');
    expect(answer).toContain('frost wedging');
    // The definition is applied as a clause, not glued term-first.
    expect(answer).toContain('this is a case of frost wedging');
    // The fact rides as supporting evidence.
    expect(answer.toLowerCase()).toContain('supporting evidence');
    // Grader scaffold closes the answer.
    expect(answer).toMatch(/limitation|opposing view/);
    expect(answer).not.toMatch(/\.\./);
    expect(answer).not.toMatch(/\s{2,}/);
  });

  it('stays grammatical for empty and partial inputs', () => {
    for (const answer of [
      composeScenarioAnswer(null, null, ''),
      composeScenarioAnswer({ setup: '', materials: '' }, { term: '', definition: '' }, ''),
      composeScenarioAnswer(
        null,
        { term: 'osmosis', definition: 'Osmosis is diffusion of water across a membrane.' },
        '',
      ),
      composeScenarioAnswer(
        { setup: 'Consider a tide pool that warms by ten degrees at noon.' },
        { term: 'thermal stress' },
        'Some fact.',
      ),
    ]) {
      expect(answer.length).toBeGreaterThan(0);
      expect(answer).toMatch(/[.!?]$/);
      expect(answer).not.toMatch(/\.\./);
    }
  });

  it('projects scenario-engaged short-answer and essay sample answers', () => {
    const payload = projectKernelToSurfaces(KERNEL, {
      itemPlan: [
        { type: 'short_answer', index: 4 },
        { type: 'essay', index: 5 },
      ],
    });
    const shortAnswer = payload.quizItems.find((item) => item.type === 'short_answer');
    const essay = payload.quizItems.find((item) => item.type === 'essay');

    expect(shortAnswer).toBeTruthy();
    // The answer engages the stem's own scenario — the audit found the bare
    // definition of weathering shipped twice as a "Sample Answer".
    expect(shortAnswer.answer).toContain('granite boulders');
    expect(shortAnswer.answer).toContain('frost wedging');
    expect(shortAnswer.answer).not.toBe(KERNEL.keyTerms[0].definition);
    expect(shortAnswer.answer).not.toMatch(/\.\./);

    expect(essay).toBeTruthy();
    // The essay answer takes the position the stem demands and engages the
    // counterposition.
    expect(essay.answer).toContain('Mechanical weathering dominates in cold climates');
    expect(essay.answer.toLowerCase()).toContain('opposing view');
    expect(essay.answer.toLowerCase()).toContain('chemical weathering does more total work worldwide');
    expect(essay.answer).not.toMatch(/\.\./);
  });
});

// ── 1.11 cover meta noun ────────────────────────────────────────────────────
describe('1.11 bulk DOCX cover meta', () => {
  it('says "15 assignment briefs", never "15 sections", for assignment briefs', async () => {
    const assignments = Array.from({ length: 15 }, (_, i) => ({
      title: `Assignment ${i + 1}: Field Brief`,
      overview: `Investigate topic ${i + 1} and report the evidence.`,
    }));
    const blob = await buildDeliverableDocxBlob('assignments', { assignments }, 'Physical Geology');
    const { 'word/document.xml': xml } = await readZipEntries(blob, /^word\/document\.xml$/);

    expect(xml).not.toContain('15 sections');
    expect(xml).toMatch(/15 (lessons|assignment briefs)/);
  });
});

// ── 1.12 Required Assets genre gate ─────────────────────────────────────────
describe('1.12 required assets genre gate', () => {
  const mandarinCourseMap = {
    courseName: 'Beginning Mandarin Chinese I',
    description: 'An introductory world language course in Mandarin Chinese.',
    lessons: [
      {
        title: 'Lesson 1: Greetings and Introductions',
        sections: [
          {
            topicSection: 'Pinyin and tones',
            learningObjectives: 'Pronounce initials and finals accurately.',
            // The stray pedagogy words that fooled the old gate.
            asyncActivities: 'Rehearse the model dialogues; review the phrase dataset from the textbook.',
          },
        ],
      },
    ],
  };

  const dataScienceCourseMap = {
    courseName: 'Intro to Data Science',
    lessons: [
      {
        title: 'Lesson 1: Loading and Inspecting Data',
        sections: [
          {
            topicSection: 'Working with tabular data',
            learningObjectives: 'Load the course .csv with pandas and inspect the dataframe.',
            weeklyAssessments: 'Notebook exercise on data inspection.',
          },
        ],
      },
    ],
  };

  const geologyCourseMap = {
    courseName: 'Physical Geology',
    lessons: [
      {
        title: 'Lesson 3: Minerals',
        sections: [
          {
            topicSection: 'Mineral identification',
            syncActivities: 'Lab: mineral identification using hand lens and streak plate (see experiment list).',
            technologyNeeded: 'Laboratory equipment and rock and mineral samples.',
          },
        ],
      },
    ],
  };

  it('ships no data-science assets to a Mandarin course with stray "model"/"dataset" prose', () => {
    expect(classifyCourseAssetGenre({ courseMap: mandarinCourseMap })).toBe('language');
    const requirements = collectRequiredLabAssets({ courseMap: mandarinCourseMap });
    const ids = requirements.map((item) => item.id);
    expect(ids).not.toContain('course-dataset');
    expect(ids).not.toContain('data-dictionary');
    expect(ids).not.toContain('starter-notebook');
    const formats = requirements.flatMap((item) => item.formats);
    expect(formats).not.toContain('.parquet');
    expect(formats).not.toContain('.ipynb');
  });

  it('keeps the data-science list for a genuine data-science course', () => {
    expect(classifyCourseAssetGenre({ courseMap: dataScienceCourseMap })).toBe('data-science');
    const ids = collectRequiredLabAssets({ courseMap: dataScienceCourseMap }).map((item) => item.id);
    expect(ids).toEqual(expect.arrayContaining(['course-dataset', 'data-dictionary', 'starter-notebook']));
  });

  it('gives a wet-lab course a wet-lab asset list instead of nothing', () => {
    expect(classifyCourseAssetGenre({ courseMap: geologyCourseMap })).toBe('wet-lab');
    const ids = collectRequiredLabAssets({ courseMap: geologyCourseMap }).map((item) => item.id);
    expect(ids).toEqual(
      expect.arrayContaining(['specimen-kit', 'experiment-list', 'lab-safety', 'field-notebook-template']),
    );
    expect(ids).not.toContain('course-dataset');
  });
});

// ── 1.13 CJK font safety ────────────────────────────────────────────────────
describe('1.13 CJK font safety', () => {
  beforeEach(() => {
    // The pptx text-fit pass measures with OffscreenCanvas — stub it the
    // same way output-artifact-gate.test.js does so the build runs in node.
    const context = { font: '', measureText: (text) => ({ width: String(text || '').length * 7 }) };
    globalThis.OffscreenCanvas = class OffscreenCanvas {
      getContext() {
        return context;
      }
    };
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('emits no w:eastAsia="Calibri/Georgia" overrides in DOCX runs or styles', async () => {
    const blob = await buildDeliverableDocxBlob(
      'studyGuides',
      {
        studyGuides: [
          {
            lessonTitle: '第一课: 你好',
            summary: '你好。这是一份学习指南，覆盖问候语与自我介绍。',
            keyTerms: [{ term: '你好', definition: 'Hello — the standard greeting.' }],
          },
        ],
      },
      '中文入门',
    );
    const entries = await readZipEntries(blob, /^word\/(document|styles)\.xml$/);
    expect(Object.keys(entries).length).toBeGreaterThan(0);
    for (const [name, xml] of Object.entries(entries)) {
      expect(xml, name).not.toContain('w:eastAsia="Calibri"');
      expect(xml, name).not.toContain('w:eastAsia="Georgia"');
    }
    // The CJK text itself survives the export.
    expect(entries['word/document.xml']).toContain('你好');
    // Latin slots are still pinned to the designed faces.
    expect(entries['word/document.xml']).toContain('w:ascii="Calibri"');
  });

  it('emits no run-level <a:ea> Latin overrides in PPTX slide XML', async () => {
    const blob = await buildSlideDeckPptxBlob(
      {
        decks: [
          {
            lessonTitle: '第一课: 你好',
            slides: [
              { title: '你好世界', bullets: ['你好 — the standard greeting', '再见 — goodbye'] },
              { title: 'Tones', bullets: ['Four tones change meaning', 'Practice with minimal pairs'] },
            ],
          },
        ],
      },
      '中文入门',
    );
    const entries = await readZipEntries(blob, /^ppt\/.*\.xml$/);
    expect(Object.keys(entries).length).toBeGreaterThan(0);
    for (const [name, xml] of Object.entries(entries)) {
      expect(xml, name).not.toMatch(/<a:ea typeface="(?:Georgia|Trebuchet MS)"/);
    }
    // The Latin typefaces themselves are untouched.
    const slideXml = Object.entries(entries).find(([name]) => /^ppt\/slides\/slide\d+\.xml$/.test(name))?.[1];
    expect(slideXml).toContain('<a:latin typeface="Georgia"');
  });
});
