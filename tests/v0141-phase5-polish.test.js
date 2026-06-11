/**
 * V0.14.1 Phase 5 — slide and document polish (roadmap items 5.1-5.4).
 *
 * Failure shapes lifted from the OUTPUT-V014 four-course audit (all 58 decks
 * shipped the same rigid 12-slide frame):
 *  - 5.1 markdown backticks rendered verbatim in slide and docx text
 *        ("`{'name': 'Ava', 'age': 19}` maps labels to data").
 *  - 5.2a slides 11 and 12 both titled "KEY TAKEAWAYS".
 *  - 5.2b slide 10's decision table shipped a trailing EMPTY cell in every
 *        deck ("…: Reteach | <empty>").
 *  - 5.2c slide 6 "EVIDENCE TABLE" rows paired claims with unrelated
 *        leftover strings; worked examples had no slide presence.
 *  - 5.2d long complete bullets were stripped of terminal punctuation,
 *        making them indistinguishable from truncations (the reason the
 *        output gate's truncated-bullet check stayed expected-fail).
 *  - 5.3 speaker notes repeated the full lesson title 6-10x per slide.
 *  - 5.4 every quiz claimed "Bloom's Coverage: Remember, Apply, Analyze,
 *        Evaluate, Create" verbatim; tags were keyword-driven wrong
 *        ("Produce the four tones in isolated syllables" tagged Create).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import JSZip from 'jszip';

import {
  bloomLevelFromStemVerb,
  buildCourseBlueprint,
  buildQuizAtomsForLesson,
  compileBlueprintDeliverable,
} from '../src/lib/courseBlueprintCompiler.js';
import { finalizeCompiledDeliverableLanguage } from '../src/lib/compiledLanguageFinalizer.js';
import { buildSlideDeckPptxBlob } from '../src/lib/exporters/pptxExporter.js';

const BACKTICK_EXAMPLE = "`{'name': 'Ava', 'age': 19}` maps labels to data values";

function programmingCourseMap() {
  return {
    courseName: 'Introduction to Programming',
    lessons: [
      {
        title: 'Lesson 1: Dictionaries',
        sections: [
          {
            topicSection: 'key lookup; dictionary methods',
            learningObjectives:
              'Analyze key lookup using the starter code.\nEvaluate how dictionary methods change the weekly build.',
            weeklyAssessments: 'Week 1 lab: applied key lookup exercises.',
            asyncActivities: 'Read the chapter on dictionaries.',
            syncActivities: 'Workshop: trace key lookup examples together.',
            supportingResources: 'Starter repository for dictionaries',
          },
        ],
      },
    ],
  };
}

function enrichedKeyTermPayload() {
  return {
    source: 'test-enrichment',
    lessonContent: {
      'lesson-1': {
        quizItems: [],
        keyTerms: [
          {
            term: 'Dictionary',
            definition: 'maps each label to a stored data value',
            example: BACKTICK_EXAMPLE,
          },
          {
            term: 'Key lookup',
            definition: 'retrieves the value stored under a label',
            example: "`ages['Ava']` returns 19 from the record",
          },
        ],
        slideContent: [
          {
            title: 'A dictionary maps labels to stored values',
            bullets: [
              BACKTICK_EXAMPLE,
              'Adding a new key creates a new entry in the structure.',
              'Lookups by key run in constant time on average.',
            ],
            notes: 'Walk through the record example and trace one lookup by hand.',
          },
        ],
      },
    },
  };
}

function workedExamplePayload() {
  return {
    source: 'test-enrichment',
    lessonContent: {
      'lesson-1': {
        quizItems: [],
        // Mismatched leftovers: definitions without their examples — no
        // atom carries both halves, so no genuine claim/evidence row exists.
        keyTerms: [
          { term: 'Dictionary', definition: 'maps each label to a stored data value' },
          { term: 'Key lookup', definition: 'retrieves the value stored under a label' },
        ],
        workedExample: {
          problem: 'Count how often each word appears in a list of words',
          steps: [
            'Start with an empty dictionary for the counts',
            'For each word, add 1 to its entry, creating it at 0 when missing',
            'Print each word with its final count',
          ],
          result: 'A dictionary mapping every distinct word to its frequency',
        },
      },
    },
  };
}

const LONG_ACTIVITY =
  'Students compare three streamflow datasets from the county gauges and then identify which gauge shows the most variance before they defend the monitoring recommendation they would give the county water board ahead of the storm season';

function hydrologyCourseMap() {
  return {
    courseName: 'Watershed Hydrology',
    lessons: [
      {
        title: 'Lesson 1: Streamflow and Sediment Transport',
        sections: [
          {
            topicSection: 'Streamflow measurement; sediment transport; channel morphology',
            learningObjectives:
              'Evaluate how sediment transport interacts with channel morphology by tracing one storm event through the full watershed course pattern and run the comparison against the historical gauge record from the assigned basin packet\nAnalyze gauge records to justify one monitoring decision.',
            weeklyAssessments: 'Watershed brief: defend one monitoring recommendation with gauge evidence.',
            asyncActivities: `${LONG_ACTIVITY}.`,
            syncActivities: `${LONG_ACTIVITY}; compare findings with a partner team and revise the recommendation.`,
            supportingResources: 'County gauge data packet',
          },
        ],
      },
    ],
  };
}

async function slideXmlsFor(deckData, courseName) {
  const blob = await buildSlideDeckPptxBlob(deckData, courseName, 0);
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const names = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => Number(a.match(/slide(\d+)/)[1]) - Number(b.match(/slide(\d+)/)[1]));
  return Promise.all(names.map((name) => zip.file(name).async('string')));
}

function tableCellTexts(xml) {
  return (xml.match(/<a:tc[^>]*>[\s\S]*?<\/a:tc>/g) || []).map((cell) =>
    cell
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
  );
}

beforeEach(() => {
  // The pptx text-fit pass measures with OffscreenCanvas — stub it the same
  // way pptxExporter.test.js does so the suite runs in a node env.
  const context = { font: '', measureText: (text) => ({ width: String(text || '').length * 7 }) };
  globalThis.OffscreenCanvas = class OffscreenCanvas {
    getContext() {
      return context;
    }
  };
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

describe('5.1 — paired backticks are stripped, content kept (finalizer choke point)', () => {
  it('cleans a compiled slide bullet and a study-guide term example', () => {
    const blueprint = JSON.parse(
      JSON.stringify(buildCourseBlueprint(programmingCourseMap(), { enrichment: enrichedKeyTermPayload() })),
    );
    const decks = compileBlueprintDeliverable('slideDecks', blueprint);
    const deckText = JSON.stringify(decks);
    expect(deckText).not.toContain('`');
    // Content survives — only the delimiters go.
    const enrichedBullets = decks.decks[0].slides.flatMap((slide) => slide.bullets || []);
    expect(enrichedBullets.join(' ')).toContain("{'name': 'Ava', 'age': 19}");

    const guides = compileBlueprintDeliverable('studyGuides', blueprint);
    const example = guides.studyGuides[0].keyTerms[0].example;
    expect(example).not.toContain('`');
    expect(example).toContain("{'name': 'Ava', 'age': 19}");
  });

  it('leaves a lone backtick character alone', () => {
    const data = { syllabus: { note: 'The grave accent ` is on the key left of 1.' } };
    finalizeCompiledDeliverableLanguage('syllabus', data, {});
    expect(data.syllabus.note).toContain('`');
  });
});

describe('5.2a — no duplicate KEY TAKEAWAYS kickers', () => {
  it('labels the readiness-check slide READINESS CHECK and only the carry-forward KEY TAKEAWAYS', async () => {
    const blueprint = buildCourseBlueprint(programmingCourseMap());
    const decks = compileBlueprintDeliverable('slideDecks', blueprint);
    const xmls = await slideXmlsFor(decks, 'Introduction to Programming');

    const takeaways = xmls.filter((xml) => xml.includes('KEY TAKEAWAYS'));
    const readiness = xmls.filter((xml) => xml.includes('READINESS CHECK'));
    expect(takeaways).toHaveLength(1);
    expect(readiness).toHaveLength(1);
    expect(takeaways[0]).not.toBe(readiness[0]);
    // The readiness kicker sits on the readiness-check summary slide; the
    // takeaways kicker on the Carry Forward closing slide.
    expect(readiness[0]).toMatch(/readiness check/i);
    expect(takeaways[0]).toContain('Carry Forward');
  });
});

describe('5.2b — tables never ship an empty cell', () => {
  it('emits content in every table cell of every compiled deck slide', async () => {
    const blueprint = JSON.parse(
      JSON.stringify(buildCourseBlueprint(programmingCourseMap(), { enrichment: enrichedKeyTermPayload() })),
    );
    const decks = compileBlueprintDeliverable('slideDecks', blueprint);
    const xmls = await slideXmlsFor(decks, 'Introduction to Programming');

    let cellsChecked = 0;
    for (const xml of xmls) {
      for (const cell of tableCellTexts(xml)) {
        cellsChecked += 1;
        expect(cell, 'table cell must carry content').not.toBe('');
      }
    }
    // The fixture must exercise real tables (decision matrix + evidence
    // table), otherwise this test proves nothing.
    expect(cellsChecked).toBeGreaterThan(4);
  });

  it('renders an odd third discussion option as a full-width row, not a half-empty pair', async () => {
    const blueprint = buildCourseBlueprint(programmingCourseMap());
    const decks = compileBlueprintDeliverable('slideDecks', blueprint);
    const discussionIndex = decks.decks[0].slides.findIndex((slide) => slide.type === 'discussion');
    expect(decks.decks[0].slides[discussionIndex].bullets).toHaveLength(3);
    const xmls = await slideXmlsFor(decks, 'Introduction to Programming');
    const discussionXml = xmls[discussionIndex];
    // Two tables: the 2-cell pair row and the single-cell leftover row.
    const rows = discussionXml.match(/<a:tr[^>]*>[\s\S]*?<\/a:tr>/g) || [];
    expect(rows.length).toBe(2);
    expect(tableCellTexts(rows[0])).toHaveLength(2);
    expect(tableCellTexts(rows[1])).toHaveLength(1);
    expect(tableCellTexts(rows[1])[0]).not.toBe('');
  });
});

describe('5.2c — evidence table rows are genuine claim/evidence pairs or the slide falls back', () => {
  it('builds rows only from atoms carrying both halves (term + definition + example)', () => {
    const blueprint = JSON.parse(
      JSON.stringify(buildCourseBlueprint(programmingCourseMap(), { enrichment: enrichedKeyTermPayload() })),
    );
    const decks = compileBlueprintDeliverable('slideDecks', blueprint);
    const tableSlide = decks.decks[0].slides.find((slide) => Array.isArray(slide.visual?.rows));
    expect(tableSlide).toBeTruthy();
    const rows = tableSlide.visual.rows;
    expect(rows.length).toBeGreaterThanOrEqual(2);
    // Each row pairs the SAME atom's claim and evidence.
    expect(rows[0][0]).toBe('Dictionary');
    expect(rows[0][1]).toContain('maps each label to a stored data value');
    expect(rows[0][1]).toContain("{'name': 'Ava', 'age': 19}");
    expect(rows[1][0]).toBe('Key lookup');
    expect(rows[1][1]).toContain("ages['Ava']");
  });

  it('collapses the table slide to the worked example when no genuine rows exist', () => {
    const blueprint = JSON.parse(
      JSON.stringify(buildCourseBlueprint(programmingCourseMap(), { enrichment: workedExamplePayload() })),
    );
    const decks = compileBlueprintDeliverable('slideDecks', blueprint);
    const slides = decks.decks[0].slides;
    expect(slides.some((slide) => Array.isArray(slide.visual?.rows))).toBe(false);
    const workedSlide = slides.find((slide) => /^Worked example:/i.test(slide.title));
    expect(workedSlide).toBeTruthy();
    expect(workedSlide.bullets[0]).toMatch(/^Problem: /);
    expect(workedSlide.bullets.join(' ')).toContain('Step 1:');
    expect(workedSlide.bullets.join(' ')).toContain('empty dictionary for the counts');
    expect(workedSlide.visual.kind).not.toMatch(/table/i);
  });

  it('never fabricates a table from mismatched leftover bullets (exporter side)', async () => {
    // A deck shaped like the audited defect: colon-bearing bullets on a
    // content slide whose descriptor asks for an evidence table, but no
    // pre-paired rows. The old exporter split these into fake claim/evidence
    // pairs; now the slide keeps its plain text layout.
    const xmls = await slideXmlsFor(
      {
        decks: [
          {
            lessonTitle: 'Lesson 1: Dictionaries',
            slides: [
              {
                title: 'Evidence that can support the weekly lab',
                type: 'content',
                bullets: [
                  'Adding a new key: creates a new entry in the structure.',
                  "Key lookup: {'name': 'Ava', 'age': 19} maps labels to data.",
                  'Constant time: lookups by key stay fast as the data grows.',
                ],
                notes: 'Compare the evidence choices before students draft.',
                visual: { kind: 'evidence table', description: 'Evidence table.', altText: 'Evidence table.' },
              },
            ],
          },
        ],
      },
      'Introduction to Programming',
    );
    expect(xmls[0]).not.toContain('<a:tbl>');
    // The bullets still render as text.
    expect(xmls[0]).toContain('creates a new entry');
  });
});

describe('5.2d — long bullets keep punctuation, short labels stay bare, cuts end in ellipsis', () => {
  it('punctuates every >=60-char display bullet and leaves short labels unpunctuated', () => {
    const blueprint = buildCourseBlueprint(hydrologyCourseMap());
    const compiled = compileBlueprintDeliverable('slideDecks', blueprint);
    const bullets = compiled.decks.flatMap((deck) => deck.slides.flatMap((slide) => slide.bullets || []));
    expect(bullets.length).toBeGreaterThan(20);

    const longBullets = bullets.filter((bullet) => bullet.length >= 60);
    expect(longBullets.length).toBeGreaterThan(3);
    for (const bullet of longBullets) {
      expect(bullet, `long bullet must end punctuated: "${bullet}"`).toMatch(/[.!?…;:]$/);
    }

    const shortLabels = bullets.filter((bullet) => bullet.length < 60 && !/[.!?…;:]$/.test(bullet));
    expect(shortLabels.length, 'short labels/fragments stay unpunctuated').toBeGreaterThan(0);

    const truncated = bullets.filter((bullet) => bullet.endsWith('…'));
    expect(truncated.length, 'the long-activity fixture must produce ellipsis-marked cuts').toBeGreaterThan(0);
  });
});

describe('5.3 — speaker-note lesson-title density', () => {
  const lessonTitle = 'Lesson 3: Photosynthesis and Energy Flow';
  const titleMentionNote = Array.from(
    { length: 8 },
    (_, index) => `Point ${index + 1}: connect ${lessonTitle} to the worked example.`,
  ).join(' ');

  function deckFixture() {
    return {
      decks: [
        {
          lessonTitle,
          slides: [
            {
              title: lessonTitle,
              type: 'content',
              bullets: [`Frame ${lessonTitle} with one inspectable example.`, 'Compare the two evidence choices.'],
              notes: titleMentionNote,
            },
          ],
        },
      ],
    };
  }

  const blueprint = {
    lessons: [
      {
        lessonNumber: 3,
        title: lessonTitle,
        studentArtifact: 'Energy flow lab worksheet',
      },
    ],
  };

  it('keeps at most 2 full title mentions per note and alternates compressed forms', () => {
    const data = deckFixture();
    finalizeCompiledDeliverableLanguage('slideDecks', data, blueprint);
    const note = data.decks[0].slides[0].notes;
    const fullMentions = note.match(/Lesson 3: Photosynthesis and Energy Flow/g) || [];
    expect(fullMentions).toHaveLength(2);
    expect(note.match(/this lesson/g).length).toBeGreaterThanOrEqual(2);
    expect(note.match(/today's topic/g).length).toBeGreaterThanOrEqual(2);
    // 8 mentions in, 8 references out — none dropped, only compressed.
    expect(note.match(/Lesson 3: Photosynthesis and Energy Flow|this lesson|today's topic/g)).toHaveLength(8);
  });

  it('never compresses titles or bullets, and never partial-word matches', () => {
    const data = deckFixture();
    data.decks[0].slides[0].notes = `${titleMentionNote} Beware Lesson 3: Photosynthesis and Energy Flowcharts.`;
    finalizeCompiledDeliverableLanguage('slideDecks', data, blueprint);
    const slide = data.decks[0].slides[0];
    // The slide title (heading) keeps the full lesson title.
    expect(slide.title).toBe(lessonTitle);
    // Bullets keep their mention (within the keep budget) untouched.
    expect(slide.bullets[0]).toContain(lessonTitle);
    // The partial-word tail ("…Flowcharts") is not a mention and survives.
    expect(slide.notes).toContain('Energy Flowcharts');
  });
});

describe("5.4 — Bloom's tags follow the stem verb; coverage states only what's present", () => {
  it('derives the coverage line from the actual item tags, taxonomy-ordered and deduped', () => {
    const blueprint = buildCourseBlueprint(programmingCourseMap());
    const compiled = compileBlueprintDeliverable('quizBank', blueprint);
    const quiz = compiled.quizzes[0];
    const itemLevels = new Set(quiz.questions.map((question) => question.bloomsLevel));
    expect(new Set(quiz.bloomsCoverage)).toEqual(itemLevels);
    const order = ['Remember', 'Understand', 'Apply', 'Analyze', 'Evaluate', 'Create'];
    expect(quiz.bloomsCoverage).toEqual(order.filter((level) => itemLevels.has(level)));
    // The audited verbatim five-level claim is gone unless the items earn it.
    expect(quiz.bloomsCoverage.length).toBe(itemLevels.size);
  });

  it('never tags a recall-stem item Analyze/Evaluate/Create, even on a high-demand frame', () => {
    const blueprint = JSON.parse(
      JSON.stringify(
        buildCourseBlueprint(programmingCourseMap(), {
          enrichment: {
            source: 'test-enrichment',
            lessonContent: {
              'lesson-1': {
                quizItems: [
                  {
                    // Frame 4 is the quality-evaluation slot (planned
                    // Evaluate) — the recall stem must win.
                    index: 4,
                    type: 'multiple_choice',
                    question: 'Identify the statement that correctly defines a dictionary in Python.',
                    options: [
                      'A structure that maps unique keys to values',
                      'An ordered list addressed only by position',
                      'A function that sorts records alphabetically',
                      'A loop that repeats until a condition fails',
                    ],
                    answerIndex: 0,
                    distractorRationales: [
                      'Confuses dict with list',
                      'Confuses dict with sort',
                      'Confuses dict with loop',
                    ],
                    explanation: 'A dictionary maps unique keys to stored values.',
                  },
                ],
                keyTerms: [],
              },
            },
          },
        }),
      ),
    );
    const lesson = blueprint.lessons[0];
    const atoms = buildQuizAtomsForLesson(lesson, blueprint, { assessment: {} });
    expect(atoms[4].question).toContain('Identify the statement');
    expect(atoms[4].bloomsLevel).toBe('Remember');
    expect(['Analyze', 'Evaluate', 'Create']).not.toContain(atoms[4].bloomsLevel);
    // The planned level survives as provenance only.
    expect(atoms[4].quizPlan.bloom).toBe('Evaluate');
  });

  it('maps "Produce the four tones in isolated syllables" to Apply in the syllabus alignment table', () => {
    expect(bloomLevelFromStemVerb('Produce the four tones in isolated syllables')).toBe('Apply');

    const blueprint = buildCourseBlueprint({
      courseName: 'Beginning Mandarin',
      lessons: [
        {
          title: 'Lesson 1: Tones and Pinyin',
          sections: [
            {
              topicSection: 'four tones; pinyin initials',
              learningObjectives: 'Produce the four tones in isolated syllables.\nDescribe the pinyin system.',
              weeklyAssessments: 'Oral drill: record the four tones.',
              asyncActivities: 'Listen to the tone pairs audio.',
              syncActivities: 'Practice tones in pairs.',
              supportingResources: 'Tone chart',
            },
          ],
        },
      ],
    });
    const compiled = compileBlueprintDeliverable('syllabus', blueprint);
    const row = compiled.syllabus.outcomeAlignmentMatrix.find((entry) => /four tones/i.test(entry.outcome));
    expect(row).toBeTruthy();
    expect(row.bloomsLevel).toBe('Apply');
    const describeRow = compiled.syllabus.outcomeAlignmentMatrix.find((entry) => /pinyin system/i.test(entry.outcome));
    expect(describeRow.bloomsLevel).toBe('Understand');
  });
});
