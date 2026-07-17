/**
 * @vitest-environment happy-dom
 *
 * v0.14.5 WS-C deck visual layer (C1-C3) — docs/V0.14.5_GROUNDING_ROADMAP.md.
 *
 * C1: the keyTerm concept-map descriptor (hub + ≤6 spokes) renders as REAL
 *     ellipses + connector lines on a fixed per-count slot table
 *     (CONCEPT_MAP_GEOMETRY — deterministic positions, no auto-layout);
 *     >6 spokes or an unusable hub keeps today's text rendering.
 * C2: a worked-example slide whose steps/result compute 2-6 labeled numbers
 *     gains a `wePlot` descriptor at compile time (extractWorkedExamplePairs,
 *     conservative — ambiguity or <2 pairs → NO descriptor) and the exporter
 *     draws a native pptxgenjs bar chart from it. Zero new AI calls; absent
 *     data never becomes a placeholder chart.
 * C3: every rendered visual carries a 'cmViz'-prefixed shape name and each
 *     deck's first slide stamps the 'cmVizLayer' feature marker; the grader's
 *     native-visual bar ARMS only on packages carrying a cmViz marker, so
 *     stored pre-feature Crucible rounds are never graded on visuals.
 *
 * All deterministic — every visual renders data already authored.
 */
import { describe, expect, it, beforeAll, vi } from 'vitest';
import JSZip from 'jszip';

import {
  buildCourseBlueprint,
  compileBlueprintDeliverable,
  extractWorkedExamplePairs,
} from '../src/lib/courseBlueprintCompiler';
import { buildSlideDeckPptxBlob, CONCEPT_MAP_GEOMETRY, WE_PLOT_GEOMETRY } from '../src/lib/exporters/pptxExporter.js';
import { SLIDE_W, SLIDE_H } from '../src/lib/exporters/slideTextFit.js';
import { grade } from '../src/lib/quality/deepQualityGrader.js';
import { createMemoryFileProvider } from '../src/lib/quality/fileProviders.js';
import { getNativeConceptMap } from '../src/lib/nativeConceptMapPreview.js';

// happy-dom's canvas getContext('2d') returns null; stub the minimal 2D
// context slideTextFit needs (same approach as pptxVisualExport.test.js).
function install2dContextStub() {
  const fakeCtxFactory = () => {
    let font = '12px sans';
    return {
      get font() {
        return font;
      },
      set font(v) {
        font = v;
      },
      measureText(text) {
        const match = String(font).match(/(\d+(?:\.\d+)?)px/);
        const px = match ? parseFloat(match[1]) : 12;
        return { width: String(text || '').length * px * 0.55 };
      },
      fillText() {},
      strokeText() {},
      save() {},
      restore() {},
      translate() {},
      scale() {},
      rotate() {},
      getImageData: () => ({ data: new Uint8ClampedArray(4) }),
    };
  };
  if (globalThis.HTMLCanvasElement) {
    HTMLCanvasElement.prototype.getContext = function (type) {
      return type === '2d' ? fakeCtxFactory() : null;
    };
  }
  if (globalThis.OffscreenCanvas) {
    OffscreenCanvas.prototype.getContext = function (type) {
      return type === '2d' ? fakeCtxFactory() : null;
    };
  }
}

beforeAll(() => {
  install2dContextStub();
});

const count = (xml, needle) => (xml.match(new RegExp(needle, 'g')) || []).length;

async function unzipPptx(blob) {
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const numeric = (p) => parseInt(p.match(/(\d+)\.xml$/)?.[1] || '0', 10);
  const slidePaths = Object.keys(zip.files)
    .filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p))
    .sort((a, b) => numeric(a) - numeric(b));
  const slideXmls = await Promise.all(slidePaths.map((p) => zip.files[p].async('string')));
  const allXml = {};
  for (const name of Object.keys(zip.files)) {
    if (/^ppt\/.*\.xml$/.test(name)) allXml[name] = await zip.files[name].async('string');
  }
  return { zip, slideXmls, allXml };
}

// ── (1) C2: extractWorkedExamplePairs — real kernel shapes ──────────────────
// Fixtures mirror public/genome shards verbatim: astro-intro carries the
// Kepler / telescope / parallax / Hubble workedExamples, nutrition-intro the
// granola-bar kcal example. geo-intro ships no workedExamples today, so the
// discharge case ("N m³/s") uses the shape a geo kernel would author.

describe('C2 — extractWorkedExamplePairs (conservative, real kernel shapes)', () => {
  it('extracts the Kepler chain equations (astro-intro verbatim)', () => {
    const pairs = extractWorkedExamplePairs({
      problem:
        "Mars orbits the Sun with a period of 1.88 Earth years. Use Kepler's third law to find the semimajor axis of its orbit in astronomical units.",
      steps: [
        'Write the law in year-AU units: P² = a³.',
        'Square the period: P² = 1.88² = 3.53.',
        'Set a³ = 3.53 and take the cube root: a = 3.53^(1/3) ≈ 1.52.',
      ],
      result: 'a ≈ 1.52 AU — Mars orbits about 50% farther from the Sun than Earth.',
    });
    // The variable wins as the label; the symbolic step (P² = a³) and the
    // result's restatement of a ≈ 1.52 are both skipped.
    expect(pairs).toEqual([
      { label: 'P²', value: 3.53 },
      { label: 'a', value: 1.52 },
    ]);
  });

  it('extracts the kcal macronutrient lines with units (nutrition-intro verbatim)', () => {
    const pairs = extractWorkedExamplePairs({
      problem:
        'A granola bar lists 29 g of carbohydrate, 6 g of protein, and 9 g of fat. Estimate its energy content in kilocalories using the 4/4/9 rule.',
      steps: [
        'Carbohydrate: 29 g × 4 kcal/g = 116 kcal.',
        'Protein: 6 g × 4 kcal/g = 24 kcal.',
        'Fat: 9 g × 9 kcal/g = 81 kcal.',
        'Sum the three: 116 + 24 + 81 = 221 kcal.',
      ],
      result: 'About 221 kilocalories — fat contributes over a third of the energy from under a fifth of the grams.',
    });
    expect(pairs).toEqual([
      { label: 'Carbohydrate', value: 116, unit: 'kcal' },
      { label: 'Protein', value: 24, unit: 'kcal' },
      { label: 'Fat', value: 81, unit: 'kcal' },
      { label: 'Sum the three', value: 221, unit: 'kcal' },
    ]);
  });

  it('extracts the telescope ratio steps (astro-intro verbatim)', () => {
    const pairs = extractWorkedExamplePairs({
      problem: 'How much more light does a 4-meter telescope collect than a 1-meter telescope?',
      steps: [
        'Collecting power scales with mirror area, and area scales with diameter squared.',
        'Compute the diameter ratio: 4 / 1 = 4.',
        'Square it: 4² = 16.',
      ],
      result: '16 times as much light — which is why observatories chase aperture, not magnification.',
    });
    expect(pairs).toEqual([
      { label: 'Compute the diameter ratio', value: 4 },
      { label: 'Square it', value: 16 },
    ]);
  });

  it('extracts discharge-shaped labeled values and dedupes the result echo', () => {
    const pairs = extractWorkedExamplePairs({
      problem: 'A stream channel is 8 m wide and 2.5 m deep, flowing at 2 m/s. Estimate the discharge.',
      steps: [
        'Channel width: 8 m × depth 2.5 m gives the cross-section.',
        'Cross-section area: A = 20 m².',
        'Multiply by velocity: Q = 20 m² × 2 m/s = 40 m³/s.',
      ],
      result: 'Discharge: 40 m³/s.',
    });
    // The result restates the final step's value — it charts once.
    expect(pairs).toEqual([
      { label: 'A', value: 20, unit: 'm²' },
      { label: 'Q', value: 40, unit: 'm³/s' },
    ]);
  });

  it('yields NOTHING for single-value examples (Hubble, parallax — <2 pairs)', () => {
    // Hubble: only "Multiply: v = 2200." is a terminal computation; the
    // substitution line ends in an expression and the result ends in prose.
    expect(
      extractWorkedExamplePairs({
        steps: ["Write Hubble's law: v = H × d.", 'Substitute: v = 22 km/s per Mly × 100 Mly.', 'Multiply: v = 2200.'],
        result: 'v ≈ 2200 km/s away from us.',
      }),
    ).toEqual([]);
    // Parallax: "D = 1 / 0.1" ends in an expression; only the result line
    // carries a terminal value.
    expect(
      extractWorkedExamplePairs({
        steps: [
          'Use the parallax-distance relation: D = 1/p, with p in arcseconds.',
          'Substitute the measurement: D = 1 / 0.1.',
          'Check the inverse logic: a star at 0.05 arcsecond would be twice as far.',
        ],
        result: 'D = 10 parsecs (about 32.6 light-years).',
      }),
    ).toEqual([]);
  });

  it('yields NOTHING for prose, mid-sentence percentages, and absent data', () => {
    expect(
      extractWorkedExamplePairs({
        steps: ['Read the passage aloud.', 'Discuss the imagery with a partner.'],
        result: 'Students annotate the theme.',
      }),
    ).toEqual([]);
    // The nutrition-intro cracker-label example: every numeric mention is
    // mid-sentence — exactly one terminal pair, so no descriptor.
    expect(
      extractWorkedExamplePairs({
        steps: [
          'Convert crackers to servings: 40 ÷ 20 = 2 servings.',
          "Scale the %DV: 2 × 10% DV = 20% of the day's recommended sodium.",
          'Judge one serving with the rule of thumb: 10% sits between 5 (low) and 20 (high), so a single serving is moderate in sodium.',
        ],
        result:
          "Forty crackers deliver 20 percent of the day's sodium; one serving, at 10 percent DV, is neither low nor high.",
      }),
    ).toEqual([]);
    expect(extractWorkedExamplePairs(null)).toEqual([]);
    expect(extractWorkedExamplePairs({})).toEqual([]);
  });

  it('caps extraction at six pairs (labels stay digit-free authored leads)', () => {
    const names = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta', 'Eta', 'Theta', 'Iota'];
    const steps = names.map((name, i) => `${name} load: ${i + 1} × 10 = ${(i + 1) * 10} kg.`);
    const pairs = extractWorkedExamplePairs({ steps, result: 'Total mass grows linearly.' });
    expect(pairs).toHaveLength(6);
    expect(pairs[0]).toEqual({ label: 'Alpha load', value: 10, unit: 'kg' });
    expect(pairs[5]).toEqual({ label: 'Zeta load', value: 60, unit: 'kg' });
  });
});

// ── (2) compiler descriptor derivation ──────────────────────────────────────

function geologyCourseMap(lessonCount = 2) {
  return {
    courseName: 'Physical Geology',
    lessons: Array.from({ length: lessonCount }, (_, index) => ({
      title: `Lesson ${index + 1}: Stream Topic ${index + 1}`,
      sections: [
        {
          topicSection: `${index + 1}.1: stream discharge`,
          learningObjectives:
            'Analyze stream discharge with channel measurements.\nEvaluate flood risk from discharge records.',
          weeklyAssessments: `1. Week ${index + 1} quiz: applied discharge problems.`,
          asyncActivities: 'Read the streams chapter.',
          syncActivities: 'Lab: compute discharge from field data.',
          supportingResources: 'Stream table guide',
        },
      ],
    })),
  };
}

// keyTerms WITHOUT example fields: enrichedEvidenceTableRows stays empty, so
// the evidence-slide integrity pass swaps in the kernel worked example
// (v0.14.1 5.2c) — the surface the wePlot descriptor rides.
function dischargeLessonPayload() {
  return {
    keyTerms: [
      { term: 'Discharge', definition: 'The volume of water passing a cross-section per unit time.' },
      { term: 'Cross-section', definition: 'The area of the channel slice perpendicular to flow.' },
      { term: 'Flow velocity', definition: 'How fast the water moves downstream.' },
    ],
    workedExample: {
      problem: 'A stream channel is 8 m wide and 2.5 m deep, flowing at 2 m/s. Estimate the discharge.',
      steps: [
        'Channel width: 8 m × depth 2.5 m gives the cross-section.',
        'Cross-section area: A = 20 m².',
        'Multiply by velocity: Q = 20 m² × 2 m/s = 40 m³/s.',
      ],
      result: 'Discharge: 40 m³/s.',
    },
    mcWalkthrough: {
      question: 'A gauging station reads double the usual stage height. What should you compute first?',
      options: ['The new cross-section area', 'The water temperature', 'The sediment color', 'The channel age'],
      answerIndex: 0,
      explanation: 'Stage height changes the cross-section, and discharge follows from area times velocity.',
    },
  };
}

describe('C1/C2 — compiler slide-visual descriptors', () => {
  const blueprint = buildCourseBlueprint(geologyCourseMap(), {
    enrichment: { source: 'test-enrichment', lessonContent: { 'lesson-1': dischargeLessonPayload() } },
  });
  const decks = compileBlueprintDeliverable('slideDecks', blueprint, { skipLanguageFinalizer: true });
  const deck = decks.decks[0];

  it('keeps the hub/spokes passthrough intact on the keyTerm descriptor (v0.13.3)', () => {
    const keyTermSlide = deck.slides.find((slide) => slide.type === 'keyTerm' && slide.visual?.kind === 'concept map');
    expect(keyTermSlide).toBeTruthy();
    expect(typeof keyTermSlide.visual.hub).toBe('string');
    expect(keyTermSlide.visual.hub.length).toBeGreaterThan(0);
    expect(keyTermSlide.visual.hub.length).toBeLessThanOrEqual(36);
    expect(Array.isArray(keyTermSlide.visual.spokes)).toBe(true);
    expect(keyTermSlide.visual.spokes.length).toBeGreaterThanOrEqual(2);
    expect(keyTermSlide.visual.spokes.length).toBeLessThanOrEqual(6);
    expect(getNativeConceptMap(keyTermSlide)).toEqual({
      hub: keyTermSlide.visual.hub,
      spokes: keyTermSlide.visual.spokes,
    });
  });

  it('arms the in-app concept-map preview only for a complete descriptor', () => {
    expect(getNativeConceptMap({ visual: { kind: 'concept map', hub: 'Discharge', spokes: ['Area'] } })).toBeNull();
    expect(
      getNativeConceptMap({ visual: { kind: 'table', hub: 'Discharge', spokes: ['Area', 'Velocity'] } }),
    ).toBeNull();
  });

  it('caps derived spokes at six even when the lesson carries more short terms', () => {
    const manyTerms = Array.from({ length: 9 }, (_, i) => ({
      term: `Term ${i + 1}`,
      definition: `Definition for term ${i + 1} in the stream unit.`,
    }));
    const richBlueprint = buildCourseBlueprint(geologyCourseMap(), {
      enrichment: { source: 'test-enrichment', lessonContent: { 'lesson-1': { keyTerms: manyTerms } } },
    });
    const richDecks = compileBlueprintDeliverable('slideDecks', richBlueprint, { skipLanguageFinalizer: true });
    const keyTermSlide = richDecks.decks[0].slides.find(
      (slide) => slide.type === 'keyTerm' && Array.isArray(slide.visual?.spokes),
    );
    expect(keyTermSlide).toBeTruthy();
    expect(keyTermSlide.visual.spokes.length).toBeLessThanOrEqual(6);
  });

  it('derives wePlot on the kernel worked-example slide from its own computed pairs', () => {
    const workedSlide = deck.slides.find((slide) => slide.enrichmentSource === 'kernel-worked-example');
    expect(workedSlide).toBeTruthy();
    expect(workedSlide.visual.kind).toBe('worked example walkthrough');
    expect(workedSlide.visual.wePlot).toEqual({
      kind: 'bar',
      pairs: [
        { label: 'A', value: 20, unit: 'm²' },
        { label: 'Q', value: 40, unit: 'm³/s' },
      ],
    });
  });

  it('never attaches wePlot to the mc-walkthrough slide despite the shared title prefix', () => {
    const walkthrough = deck.slides.find((slide) => slide.enrichmentSource === 'kernel-mc-walkthrough');
    expect(walkthrough).toBeTruthy();
    expect(/^Worked example: /.test(walkthrough.title)).toBe(true);
    expect(walkthrough.visual.wePlot).toBeUndefined();
  });

  it('attaches NO descriptor when the worked example is ambiguous prose', () => {
    const payload = dischargeLessonPayload();
    payload.workedExample = {
      problem: 'Describe how a flood reshapes a meandering channel over a season.',
      steps: [
        'Sketch the channel before the flood.',
        'Mark where the cut bank erodes fastest.',
        'Explain where the point bar grows.',
      ],
      result: 'The meander migrates outward and downstream.',
    };
    const proseBlueprint = buildCourseBlueprint(geologyCourseMap(), {
      enrichment: { source: 'test-enrichment', lessonContent: { 'lesson-1': payload } },
    });
    const proseDecks = compileBlueprintDeliverable('slideDecks', proseBlueprint, { skipLanguageFinalizer: true });
    const workedSlide = proseDecks.decks[0].slides.find((slide) => slide.enrichmentSource === 'kernel-worked-example');
    expect(workedSlide).toBeTruthy();
    expect(workedSlide.visual.wePlot).toBeUndefined();
  });
});

// ── (3) C3 overflow guard: pure geometry for every spoke count ──────────────

describe('C1 — concept-map geometry (pure, all spoke counts)', () => {
  const { zone, hub, spokeH, slots, maxSpokes } = CONCEPT_MAP_GEOMETRY;
  const within = (box, outer) =>
    box.x >= outer.x - 1e-9 &&
    box.y >= outer.y - 1e-9 &&
    box.x + box.w <= outer.x + outer.w + 1e-9 &&
    box.y + box.h <= outer.y + outer.h + 1e-9;
  const intersects = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

  it('keeps the zone and hub inside the slide, and the hub inside the zone', () => {
    const slide = { x: 0, y: 0, w: SLIDE_W, h: SLIDE_H };
    expect(within(zone, slide)).toBe(true);
    expect(within(hub, zone)).toBe(true);
  });

  it('has a slot table for every spoke count 1-6 with the right slot count', () => {
    expect(maxSpokes).toBe(6);
    for (let n = 1; n <= maxSpokes; n++) {
      expect(Array.isArray(slots[n]), `slots[${n}]`).toBe(true);
      expect(slots[n]).toHaveLength(n);
    }
  });

  it('keeps every slot inside the zone, clear of the hub, and pairwise disjoint', () => {
    const hubBox = { x: hub.x, y: hub.y, w: hub.w, h: hub.h };
    for (let n = 1; n <= maxSpokes; n++) {
      const boxes = slots[n].map((slot) => ({ x: slot.x, y: slot.y, w: slot.w, h: spokeH }));
      for (const box of boxes) {
        expect(within(box, zone), `count ${n}: slot inside zone`).toBe(true);
        expect(intersects(box, hubBox), `count ${n}: slot clear of hub`).toBe(false);
      }
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          expect(intersects(boxes[i], boxes[j]), `count ${n}: slots ${i}/${j} disjoint`).toBe(false);
        }
      }
    }
  });

  it('keeps the worked-example chart box inside the slide content area', () => {
    expect(within(WE_PLOT_GEOMETRY, { x: 0, y: 0, w: SLIDE_W, h: SLIDE_H })).toBe(true);
    // Clear of the title band (ends at y 1.1) and the slide-number chip
    // (starts at y 5.185).
    expect(WE_PLOT_GEOMETRY.y).toBeGreaterThanOrEqual(1.1);
    expect(WE_PLOT_GEOMETRY.y + WE_PLOT_GEOMETRY.h).toBeLessThanOrEqual(5.18);
  });
});

// ── (4) PPTX render integration through the real exporter ───────────────────

const EMU_PER_IN = 914400;

function cmVizBoxesFromXml(xml) {
  const boxes = [];
  const pattern = /name="(cmViz\w+)"[\s\S]*?<a:off x="(-?\d+)" y="(-?\d+)"\/><a:ext cx="(\d+)" cy="(\d+)"\/>/g;
  let match = pattern.exec(xml);
  while (match) {
    boxes.push({
      name: match[1],
      x: Number(match[2]) / EMU_PER_IN,
      y: Number(match[3]) / EMU_PER_IN,
      w: Number(match[4]) / EMU_PER_IN,
      h: Number(match[5]) / EMU_PER_IN,
    });
    match = pattern.exec(xml);
  }
  return boxes;
}

const RENDER_FIXTURE = {
  decks: [
    {
      lessonTitle: 'Lesson 3: Streams and Discharge',
      slides: [
        { title: 'Lesson 3', type: 'title', bullets: ['Week 3'], speakerNotes: 'Kick off.' },
        // Concept map from descriptor hub + 5 spokes → narrow-top ellipse layout
        {
          title: 'Stream Discharge',
          type: 'keyTerm',
          bullets: ['The volume of water passing a cross-section of channel per unit time.'],
          speakerNotes: 'Anchor the definition.',
          visual: {
            kind: 'concept map',
            description: 'Concept map linking discharge to its measurement terms',
            altText: 'Hub-and-spoke diagram centered on stream discharge.',
            hub: 'Stream discharge',
            spokes: [
              'Cross-section area',
              'Flow velocity',
              'Stage height',
              'Gauging station flood record',
              'Flood recurrence',
            ],
          },
        },
        // Worked-example slide with a wePlot descriptor → native bar chart
        {
          title: 'Worked example: estimate the discharge of a stream channel',
          type: 'content',
          bullets: [
            'Problem: A stream channel is 8 m wide and 2.5 m deep, flowing at 2 m/s.',
            'Step 1: Cross-section area: A = 20 m².',
            'Step 2: Multiply by velocity: Q = 20 m² × 2 m/s = 40 m³/s.',
            'Result: Discharge: 40 m³/s.',
          ],
          speakerNotes: 'Work the example on the board.',
          visual: {
            kind: 'worked example walkthrough',
            description: 'Worked example walkthrough: model the discharge solution path.',
            altText: 'Step-by-step discharge computation.',
            wePlot: {
              kind: 'bar',
              pairs: [
                { label: 'A', value: 20, unit: 'm²' },
                { label: 'Q', value: 40, unit: 'm³/s' },
              ],
            },
          },
        },
        // 7 spokes → exceeds the slot table → text fallback
        {
          title: 'Watershed',
          type: 'keyTerm',
          bullets: ['The land area that drains to a common outlet.'],
          speakerNotes: 'Too many spokes.',
          visual: {
            kind: 'concept map',
            description: 'Concept map with too many spokes',
            altText: 'Overfull hub-and-spoke diagram.',
            hub: 'Watershed',
            spokes: ['Divide', 'Tributary', 'Outlet', 'Base level', 'Relief', 'Drainage density', 'Stream order'],
          },
        },
        // Worked-example kind WITHOUT wePlot → no chart
        {
          title: 'Worked example: describe the meander migration',
          type: 'content',
          bullets: [
            'Problem: a flood reshapes the channel.',
            'Step 1: sketch the channel.',
            'Result: the meander migrates.',
          ],
          speakerNotes: 'No numbers, no chart.',
          visual: {
            kind: 'worked example walkthrough',
            description: 'Worked example walkthrough: meander migration.',
            altText: 'Qualitative worked example.',
          },
        },
      ],
    },
  ],
};

describe('C1/C2 — native rendering through the real exporter', () => {
  let slideXmls;
  let allXml;
  let zip;

  beforeAll(async () => {
    const blob = await buildSlideDeckPptxBlob(RENDER_FIXTURE, 'Geology 101', 0);
    ({ zip, slideXmls, allXml } = await unzipPptx(blob));
  }, 30_000);

  it('renders the concept map as named ellipses with one connector per spoke', () => {
    const xml = slideXmls[1];
    expect(count(xml, 'name="cmVizHub"')).toBe(1);
    expect(count(xml, 'name="cmVizSpoke"')).toBe(5);
    expect(count(xml, 'name="cmVizConn"')).toBe(5);
    // Hub + spokes are real ellipse geometry (progress dots add more).
    expect(count(xml, 'prst="ellipse"')).toBeGreaterThanOrEqual(6);
    // Native seven-segment slide counters also use line geometry; the named
    // connector count above is the stable concept-map invariant.
    expect(count(xml, 'prst="line"')).toBeGreaterThanOrEqual(5);
    // Hub text and concise spoke labels remain complete.
    expect(xml).toContain('Stream discharge');
    expect(xml).toContain('Cross-section area');
    expect(xml).toContain('Gauging station flood record');
  });

  it('keeps every cmViz shape inside the slide bounds (geometry from the XML)', () => {
    for (const xml of slideXmls) {
      for (const box of cmVizBoxesFromXml(xml)) {
        expect(box.x, `${box.name} x`).toBeGreaterThanOrEqual(-1e-6);
        expect(box.y, `${box.name} y`).toBeGreaterThanOrEqual(-1e-6);
        expect(box.x + box.w, `${box.name} right edge`).toBeLessThanOrEqual(SLIDE_W + 0.01);
        expect(box.y + box.h, `${box.name} bottom edge`).toBeLessThanOrEqual(SLIDE_H + 0.01);
      }
    }
  });

  it('renders the wePlot as a native bar chart with the cmVizChart frame', async () => {
    // Chart graphic frame on the worked-example slide
    expect(slideXmls[2]).toContain('name="cmVizChart"');
    expect(slideXmls[2]).toContain('graphicFrame');
    // A real chart part exists with the bar type and the pair labels
    const chartPath = Object.keys(zip.files).find((p) => /^ppt\/charts\/chart\d+\.xml$/.test(p));
    expect(chartPath).toBeTruthy();
    const chartXml = await zip.files[chartPath].async('string');
    expect(chartXml).toContain('<c:barChart>');
    expect(chartXml).toContain('A');
    expect(chartXml).toContain('Q');
    expect(chartXml).toContain('<c:v>20</c:v>');
    expect(chartXml).toContain('<c:v>40</c:v>');
    // Single series, no legend, value labels on
    expect(count(chartXml, '<c:ser>')).toBe(1);
    expect(chartXml).not.toContain('<c:legend>');
    expect(chartXml).toContain('<c:showVal val="1"/>');
  });

  it('falls back to text for 7 spokes and for a worked example without pairs', () => {
    // Slide 4 (index 3): 7 spokes — no native group at all
    expect(slideXmls[3]).not.toContain('name="cmVizHub"');
    expect(slideXmls[3]).not.toContain('name="cmVizSpoke"');
    // The definition still renders as text
    expect(slideXmls[3]).toContain('drains to a common outlet');
    // Slide 5 (index 4): no wePlot descriptor — no chart frame
    expect(slideXmls[4]).not.toContain('name="cmVizChart"');
    expect(count(Object.keys(zip.files).join('\n'), 'ppt/charts/chart')).toBeLessThanOrEqual(2); // chart1.xml + colors/style parts never multiply
  });

  it('stamps the cmVizLayer feature marker on the deck first slide', () => {
    expect(slideXmls[0]).toContain('name="cmVizLayer"');
  });

  it('ships every ppt XML part eastAsia-clean (the v0.14.1 strip pass covers shape and chart runs)', () => {
    for (const [name, xml] of Object.entries(allXml)) {
      expect(/<a:ea typeface="(?:Georgia|Trebuchet MS)"/.test(xml), name).toBe(false);
    }
  });

  it('counts native visuals on the multi-deck PPTX audit line (C3a)', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      await buildSlideDeckPptxBlob(
        {
          decks: [
            RENDER_FIXTURE.decks[0],
            {
              lessonTitle: 'Lesson 4: Plain Deck',
              slides: [
                { title: 'Lesson 4', type: 'title', bullets: ['Week 4'], speakerNotes: 'Plain.' },
                { title: 'No visuals here', type: 'content', bullets: ['Just text.'], speakerNotes: 'Plain.' },
              ],
            },
          ],
        },
        'Geology 101',
        0,
      );
      const auditLine = logSpy.mock.calls.map((call) => call.join(' ')).find((line) => /PPTX audit/.test(line));
      expect(auditLine).toBeTruthy();
      // Deck 1 renders the concept map + the wePlot chart = 2 native visuals.
      expect(auditLine).toMatch(/2 decks, \d+ total slides, 2 native visuals/);
    } finally {
      logSpy.mockRestore();
    }
  });
});

// ── (5) C3: grader arming rule ──────────────────────────────────────────────

async function pptxFileMapFromBlob(blob, path) {
  return { [path]: new Uint8Array(await blob.arrayBuffer()) };
}

async function findingsFor(fileMap) {
  const result = await grade({ fileProvider: createMemoryFileProvider(fileMap), course: {} });
  return result.findings.filter((finding) => /renders no native visual/.test(finding.detail));
}

describe('C3 — grader native-visual bar (self-arming on the cmViz marker)', () => {
  it('stays quiet on pre-feature deck XML (no cmViz marker → not graded on visuals)', async () => {
    // An old-style deck: enriched slide title, plain shape names, no markers
    // — the shape every stored pre-v0.14.5 Crucible round has.
    const zip = new JSZip();
    zip.file(
      'ppt/slides/slide1.xml',
      '<p:sld><p:cSld><p:spTree><p:sp><p:nvSpPr><p:cNvPr id="2" name="Shape 1"/></p:nvSpPr>' +
        '<p:txBody><a:p><a:r><a:t>Worked example: estimate the discharge of a stream channel</a:t></a:r></a:p></p:txBody>' +
        '</p:sp></p:spTree></p:cSld></p:sld>',
    );
    const buffer = await zip.generateAsync({ type: 'uint8array' });
    const findings = await findingsFor({ 'Slide Decks/Lesson 1 - Streams.pptx': buffer });
    expect(findings).toEqual([]);
  });

  it('flags an armed enriched deck that renders zero native visuals (P2)', async () => {
    // Feature-era deck (cmVizLayer marker on slide 1) whose worked-example
    // slide rendered as text — below the bar.
    const blob = await buildSlideDeckPptxBlob(
      {
        decks: [
          {
            lessonTitle: 'Lesson 1: Streams',
            slides: [
              { title: 'Lesson 1', type: 'title', bullets: ['Week 1'], speakerNotes: 'Open.' },
              {
                title: 'Worked example: describe the meander migration',
                type: 'content',
                bullets: ['Problem: a flood reshapes the channel.', 'Step 1: sketch the channel before the flood.'],
                speakerNotes: 'Qualitative example.',
                visual: {
                  kind: 'worked example walkthrough',
                  description: 'Worked example walkthrough: meander migration.',
                  altText: 'Qualitative worked example.',
                },
              },
            ],
          },
        ],
      },
      'Geology 101',
      0,
    );
    const findings = await findingsFor(await pptxFileMapFromBlob(blob, 'Slide Decks/Lesson 1 - Streams.pptx'));
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe('P2');
    expect(findings[0].dimension).toBe('format');
    expect(findings[0].evidence).toContain('Worked example');
  });

  it('passes an armed enriched deck that renders a native visual', async () => {
    const blob = await buildSlideDeckPptxBlob(RENDER_FIXTURE, 'Geology 101', 0);
    const findings = await findingsFor(await pptxFileMapFromBlob(blob, 'Slide Decks/Lesson 3 - Streams.pptx'));
    expect(findings).toEqual([]);
  });

  it('never flags an armed deck that carries no kernel-derived slides', async () => {
    const blob = await buildSlideDeckPptxBlob(
      {
        decks: [
          {
            lessonTitle: 'Lesson 2: Plain Lecture',
            slides: [
              { title: 'Lesson 2', type: 'title', bullets: ['Week 2'], speakerNotes: 'Open.' },
              { title: 'A plain content slide', type: 'content', bullets: ['Just text.'], speakerNotes: 'Plain.' },
            ],
          },
        ],
      },
      'Geology 101',
      0,
    );
    const findings = await findingsFor(await pptxFileMapFromBlob(blob, 'Slide Decks/Lesson 2 - Plain.pptx'));
    expect(findings).toEqual([]);
  });
});
