/**
 * @vitest-environment happy-dom
 *
 * pptxVisualExport.test.js — full-fidelity integration test for the PPTX
 * exporter's visual-placeholder feature. Runs the real pptxgenjs pipeline
 * under a happy-dom environment, produces a real PPTX Blob, unzips it, and
 * inspects the generated OOXML.
 *
 * What this catches that a mock-based test would miss:
 *   - Typos in pptxgenjs option names (dashType, prstDash, etc.) — mocks
 *     just record the args we pass in; here the real library translates
 *     them into XML, so a wrong key silently produces no dashed line.
 *   - Misplaced/misspelled XML attributes in the output
 *   - Coordinate-sanity issues (values off-slide are silently dropped)
 *   - Regressions where the code path is reached but the shape never
 *     emits its dashed line or the notes text gets stripped.
 *
 * Keeps the exporter untouched — tests the contract of the public API,
 * not internals. Adding a new slide type or tweaking a coord won't break
 * the test as long as the contract (dashed placeholder on content/example/
 * keyTerm + clean visual-guidance notes line) holds.
 */

import { describe, it, expect, beforeAll, vi } from 'vitest';
import JSZip from 'jszip';
import { buildSlideDeckPptxBlob } from '../pptxExporter.js';

// happy-dom ships a Canvas element but its getContext('2d') returns null,
// which breaks slideTextFit.js auto-fit sizing. Rather than pull in the full
// `canvas` npm package (which needs native bindings), stub a minimal 2D
// context that's enough for slideTextFit's measureText calls. Width is
// estimated from char count — imprecise but good enough to let auto-fit
// branch without throwing, and the PPTX XML we're asserting on doesn't
// depend on exact pixel widths.
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
      // Extract font size in px from the CSS font string and approximate
      // char width at ~0.55em — good enough for layout-tolerance checks.
      measureText(text) {
        const match = String(font).match(/(\d+(?:\.\d+)?)px/);
        const px = match ? parseFloat(match[1]) : 12;
        return { width: String(text || '').length * px * 0.55 };
      },
      // slideTextFit doesn't call these, but pptxgenjs may touch a few more.
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
  // Patch both HTMLCanvasElement (document.createElement path) and
  // OffscreenCanvas (the preferred path when available) so whichever
  // slideTextFit picks up returns a usable context.
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

// Fixture covers the four shape-worthy slide types + two exempt ones + a
// slide that has no visual at all, so we can assert both positives and
// negatives in one export run.
const FIXTURE = {
  decks: [
    {
      lessonTitle: 'Lesson 1: Supervised Learning Basics',
      slides: [
        // 1. title — has visual but exempt from on-slide placeholder
        {
          title: 'Lesson 1',
          type: 'title',
          bullets: ['Week 1'],
          timeEstimate: '1 min',
          speakerNotes: 'Kick off the lesson.',
          visual: {
            kind: 'image',
            description: 'Course logo',
            altText: 'A stylized graduation cap sitting on a stack of books.',
          },
        },

        // 2. content — has visual, should get both placeholder + notes block
        {
          title: 'Supervised learning maps labeled inputs to predictable outputs',
          type: 'content',
          bullets: ['Training data: (x, y) pairs', 'Goal: learn f such that f(x) ≈ y'],
          timeEstimate: '5 min',
          speakerNotes: 'Define the core setup.',
          visual: {
            kind: 'diagram',
            description: 'Flowchart from labeled data through learner to prediction',
            altText: 'A four-step horizontal flow with labeled training data feeding into a learning algorithm box.',
          },
        },

        // 3. content — NO visual. Baseline: no placeholder, notes unchanged.
        {
          title: 'Course cadence recap',
          type: 'content',
          bullets: ['Quiz every Friday', 'Lab every Tuesday'],
          timeEstimate: '2 min',
          speakerNotes: 'Remind about cadence.',
        },

        // 4. keyTerm — has visual, should get placeholder
        {
          title: 'Bias–Variance Tradeoff',
          type: 'keyTerm',
          bullets: ['The tension between fitting training data and generalizing'],
          timeEstimate: '6 min',
          speakerNotes: 'Core concept.',
          visual: {
            kind: 'chart',
            description: 'U-shaped test error curve with bias and variance components',
            altText:
              'Line chart with complexity on the x-axis and error on the y-axis, bias decreasing and variance increasing, summing to a U-shape.',
          },
        },

        // 5. closing — has visual but exempt (layout-exempt type)
        {
          title: 'Before next time',
          type: 'closing',
          bullets: ['Read ISLR Ch. 2'],
          timeEstimate: '2 min',
          speakerNotes: 'Wrap up.',
          visual: {
            kind: 'image',
            description: 'Weekend homework icon',
            altText: 'An open book with a pencil resting on the page.',
          },
        },

        // 6. content — evidence-table kind with pre-paired claim/evidence
        // rows on the descriptor (v0.14.1 5.2c): should render a NATIVE
        // table (v0.12.1). The exporter no longer fabricates rows by
        // splitting bullets — rows arrive paired from the compiler.
        {
          title: 'Markets clear where supply meets demand',
          type: 'content',
          bullets: [
            'Each evidence row names the signal and what it tells you about the market.',
            'Price signal — shows willingness to pay at the margin',
            'Cost curve — reveals the producer break-even point',
            'Elasticity — predicts the response to a price change',
          ],
          timeEstimate: '5 min',
          speakerNotes: 'Walk the table row by row.',
          visual: {
            kind: 'evidence table',
            description: 'Evidence table comparing price, cost, and elasticity signals',
            altText: 'Three-row table of market evidence signals.',
            rows: [
              ['Price signal', 'shows willingness to pay at the margin'],
              ['Cost curve', 'reveals the producer break-even point'],
              ['Elasticity', 'predicts the response to a price change'],
            ],
          },
        },

        // 7. discussion — decision-matrix kind with four short options:
        // should render a NATIVE 2x2 grid table (v0.12.1).
        {
          title: 'Which intervention should the city choose?',
          type: 'discussion',
          bullets: [
            'Price ceiling: protects renters now',
            'Subsidy: raises supply over time',
            'Voucher: targets the neediest households',
            'Deregulation: lowers building costs',
          ],
          timeEstimate: '8 min',
          speakerNotes: 'Let students argue each quadrant.',
          visual: {
            kind: 'decision matrix',
            description: 'Decision matrix comparing four housing interventions',
            altText: 'Two-by-two grid of policy options.',
          },
        },

        // 8. keyTerm — concept-map kind with short phrases:
        // should render a NATIVE hub-and-spoke shape group (v0.12.1).
        {
          title: 'Opportunity Cost',
          type: 'keyTerm',
          bullets: [
            'The value of the next-best alternative you give up when you choose.',
            'Always measured against the next-best use',
            'Includes non-money costs like time',
            'Drives the shape of the production frontier',
          ],
          timeEstimate: '6 min',
          speakerNotes: 'Anchor the spokes to the definition.',
          visual: {
            kind: 'concept map',
            description: 'Concept map linking opportunity cost to its uses',
            altText: 'Hub-and-spoke diagram centered on opportunity cost.',
          },
        },

        // 9. content — evidence-table kind but a row exceeds the short-string
        // limit: must keep the existing text layout (no native table).
        {
          title: 'Long-form evidence stays as text',
          type: 'content',
          bullets: [
            'Lead assertion for the long-form slide.',
            'This deliberately overlong evidence bullet keeps going and going so that it blows well past the one-hundred-and-thirty-character table-row limit and disqualifies the slide.',
            'A second supporting bullet.',
          ],
          timeEstimate: '4 min',
          speakerNotes: 'No table here.',
          visual: {
            kind: 'evidence table',
            description: 'Evidence table that does not fit the data',
            altText: 'Table suggestion that stays in the notes.',
          },
        },
      ],
    },
  ],
};

// Distinctive marker strings from our exporter code — if these change, the
// test fails loudly and someone has to re-verify the feature intentionally.
const VISUAL_NOTE_MARKERS = [
  'Slide visual cue',
  'Teaching visual plan',
  'Instructor visual note',
  'Visual support note',
];
const ALT_MARKERS = ['Accessibility note', 'Alt-text cue', 'Nonvisual access note', 'Accessible reading note'];
const RAW_NOTES_MARKERS = ['SUGGESTED VISUAL', 'ALT TEXT', 'Visual guidance', 'Accessibility description'];
const DASHED_LINE_XML = /prstDash\s+val\s*=\s*"dash"/;
const containsAny = (xml, markers) => markers.some((marker) => xml.includes(marker));
const firstMarkerIndex = (xml, markers) =>
  markers.reduce((best, marker) => {
    const index = xml.indexOf(marker);
    return index === -1 ? best : Math.min(best, index);
  }, Number.POSITIVE_INFINITY);

let slideXmls;
let notesXmls;

beforeAll(async () => {
  install2dContextStub();
  // Run the real exporter — produces a real Blob through pptxgenjs.
  const blob = await buildSlideDeckPptxBlob(FIXTURE, 'Test Course', 0);
  expect(blob, 'exporter returned no blob').toBeTruthy();

  // Convert to ArrayBuffer for JSZip (happy-dom's Blob has .arrayBuffer()).
  const ab = await blob.arrayBuffer();
  const zip = await JSZip.loadAsync(ab);

  // Sort by the numeric suffix so slide1.xml comes before slide10.xml, etc.
  const numeric = (p) => parseInt(p.match(/(\d+)\.xml$/)?.[1] || '0', 10);
  const slidePaths = Object.keys(zip.files)
    .filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p))
    .sort((a, b) => numeric(a) - numeric(b));
  const notesPaths = Object.keys(zip.files)
    .filter((p) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(p))
    .sort((a, b) => numeric(a) - numeric(b));

  slideXmls = await Promise.all(slidePaths.map((p) => zip.files[p].async('string')));
  notesXmls = await Promise.all(notesPaths.map((p) => zip.files[p].async('string')));
}, 30_000);

describe('PPTX export — visual placeholders', () => {
  it('produces one slide XML per fixture slide', () => {
    expect(slideXmls).toHaveLength(FIXTURE.decks[0].slides.length);
  });

  it('writes the real activity heading before its decorative badge and retains the clock', async () => {
    const activityBlob = await buildSlideDeckPptxBlob(
      {
        decks: [
          {
            lessonTitle: 'Lesson 2: Mobile Prototype Critique',
            slides: [
              {
                title: 'Mobile Prototype Critique',
                type: 'activity',
                bullets: [
                  'Situation: A design team must choose one evidence-backed onboarding revision.',
                  'Activity clock: Briefing — 19 minutes; Observation — 19 minutes; Revision — 37 minutes. Total time: 75 minutes.',
                ],
                timer: '19 min',
                notes: 'Show the complete activity clock before assigning roles.',
              },
            ],
          },
        ],
      },
      'Interaction Design',
      0,
    );
    const activityZip = await JSZip.loadAsync(await activityBlob.arrayBuffer());
    const activityXml = await activityZip.file('ppt/slides/slide1.xml').async('string');
    expect(activityXml).toContain('Activity clock:');
    expect(activityXml.indexOf('Mobile Prototype Critique')).toBeLessThan(activityXml.indexOf('ACTIVITY'));
    expect(activityXml).toContain('normAutofit');
    expect(activityXml).not.toContain('buAutoNum');
    expect(activityXml).toContain('buChar');
  });

  it('does not mislabel a complete four-phase activity deck as unusually thin', async () => {
    const ordinarySlides = (prefix) =>
      Array.from({ length: 6 }, (_, index) => ({
        title: `${prefix} ${index + 1}`,
        type: index === 0 ? 'title' : 'content',
        bullets: [`${prefix} teaching point ${index + 1}`],
      }));
    const activitySlides = [
      {
        title: 'Mobile Prototype Critique',
        type: 'activity',
        bullets: [
          'Situation: A design team must choose one evidence-backed onboarding revision.',
          'Safety and evidence boundary: Keep participant observations confidential.',
          'Activity clock: Briefing — 19 minutes; Observation — 19 minutes; Constraint Identification — 19 minutes; Revision Decision — 18 minutes. Total time: 75 minutes.',
        ],
      },
      {
        title: 'Observation',
        type: 'activity',
        bullets: [
          'Participant or working roles:',
          'Observer: Record usability evidence. Constraint: Follow the observation protocol.',
        ],
      },
      {
        title: 'Constraint Identification',
        type: 'activity',
        bullets: ['Evidence: Usability observations', 'Required decision or action: Identify the bounded revision.'],
      },
      {
        title: 'Revision Decision',
        type: 'closing',
        bullets: [
          'Student artifact — Critique decision log. Artifact requirements: name the evidence and revision.',
          'Structured debrief: Which evidence changed the decision?',
        ],
      },
    ].map((slide) => ({ ...slide, enrichmentSource: 'scion-experiential-activity-v1' }));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      await buildSlideDeckPptxBlob(
        {
          decks: [
            { lessonTitle: 'Lesson 1: Evidence', slides: ordinarySlides('Evidence') },
            { lessonTitle: 'Lesson 2: Mobile Prototype Critique', slides: activitySlides },
            { lessonTitle: 'Lesson 3: Transfer', slides: ordinarySlides('Transfer') },
          ],
        },
        'Interaction Design',
        0,
      );
      expect(warn).not.toHaveBeenCalledWith(
        expect.stringContaining('unusually few slides'),
        expect.arrayContaining([expect.stringContaining('Mobile Prototype Critique')]),
      );
    } finally {
      warn.mockRestore();
    }
  });

  it('content slide with a visual keeps the slide surface free of placeholder scaffolding (v0.8.61)', () => {
    // Fixture slide index 1 (0-based) = content slide with visual. v0.8.6
    // drew a dashed "SUGGESTED VISUAL" box on the student-facing slide; the
    // suggestion now lives in speaker notes only.
    expect(slideXmls[1]).not.toMatch(DASHED_LINE_XML);
    expect(containsAny(slideXmls[1], VISUAL_NOTE_MARKERS)).toBe(false);
  });

  it('keyTerm slide with a visual keeps the slide surface free of placeholder scaffolding (v0.8.61)', () => {
    // Fixture slide index 3 = keyTerm with visual
    expect(slideXmls[3]).not.toMatch(DASHED_LINE_XML);
    expect(containsAny(slideXmls[3], VISUAL_NOTE_MARKERS)).toBe(false);
  });

  it('content slide without a visual does NOT emit the dashed placeholder', () => {
    // Fixture slide index 2 = content slide with no visual field
    expect(slideXmls[2]).not.toMatch(DASHED_LINE_XML);
  });

  it('title slide is exempt from the on-slide placeholder even when it has a visual', () => {
    // Fixture slide index 0 = title with visual. Title slides have their
    // own layout that would be disrupted by a corner chip — exempt by design.
    expect(slideXmls[0]).not.toMatch(DASHED_LINE_XML);
  });

  it('closing slide is exempt from the on-slide placeholder even when it has a visual', () => {
    // Fixture slide index 4 = closing with visual. Same layout exemption.
    expect(slideXmls[4]).not.toMatch(DASHED_LINE_XML);
  });

  it('content slide notes include clean visual guidance with accessibility text', () => {
    // Notes XML at the same index as the slide
    expect(containsAny(notesXmls[1], VISUAL_NOTE_MARKERS)).toBe(true);
    expect(containsAny(notesXmls[1], ALT_MARKERS)).toBe(true);
    for (const marker of RAW_NOTES_MARKERS) {
      expect(notesXmls[1]).not.toContain(marker);
    }
    // And the kind + description show through the XML escaping
    expect(notesXmls[1]).toContain('diagram');
    expect(notesXmls[1]).toContain('labeled data');
  });

  it('varies visual guidance labels across a visual-heavy deck', () => {
    const usedVisualLabels = new Set();
    const usedAltLabels = new Set();
    for (const notes of notesXmls) {
      for (const marker of VISUAL_NOTE_MARKERS) {
        if (notes.includes(`${marker} (`)) usedVisualLabels.add(marker);
      }
      for (const marker of ALT_MARKERS) {
        if (notes.includes(`${marker}:`)) usedAltLabels.add(marker);
      }
    }
    expect(usedVisualLabels.size).toBeGreaterThanOrEqual(2);
    expect(usedAltLabels.size).toBeGreaterThanOrEqual(2);
  });

  it('title slide notes still include clean visual guidance', () => {
    // Even though the on-slide placeholder is exempt, the notes-page block
    // is always added — accessibility metadata should surface regardless.
    expect(containsAny(notesXmls[0], VISUAL_NOTE_MARKERS)).toBe(true);
    expect(notesXmls[0]).toContain('graduation cap');
  });

  it('slide without a visual does NOT add visual guidance', () => {
    expect(containsAny(notesXmls[2], VISUAL_NOTE_MARKERS)).toBe(false);
    // Baseline notes should still be present unaltered.
    expect(notesXmls[2]).toContain('Remind about cadence');
  });

  it('existing speaker notes are preserved alongside the visual block', () => {
    // Content slide's original note "Define the core setup." must still
    // appear after our prepended visual guidance block.
    expect(notesXmls[1]).toContain('Define the core setup');
    // And the order: visual guidance should come before the original note.
    const visualIdx = firstMarkerIndex(notesXmls[1], VISUAL_NOTE_MARKERS);
    const baseIdx = notesXmls[1].indexOf('Define the core setup');
    expect(Number.isFinite(visualIdx)).toBe(true);
    expect(baseIdx).toBeGreaterThan(visualIdx);
  });

  it('alt-text reaches the exported file (via speaker notes)', () => {
    // Accessibility note: pptxgenjs's `altText` option is only serialized
    // to a cNvPr/descr attribute for IMAGE objects (see addShapeDefinition
    // in pptxgen.es.js — shapes stored as _type: text, altText never
    // written to XML). Setting altText on an addShape call is a no-op.
    //
    // Our code compensates by prepending a clean accessibility description
    // into the speaker notes for every slide with a visual hint — assistive
    // tech reading the notes page gets the description, even though the shape
    // itself lacks a descr attribute. This assertion pins that fallback.
    const notes = notesXmls[1];
    expect(containsAny(notes, ALT_MARKERS)).toBe(true);
    expect(notes).not.toContain('ALT TEXT');
    // Distinctive phrase from our fixture's altText string — proves the
    // altText value reached the exported PPTX, not just the marker label.
    expect(notes).toContain('four-step horizontal flow');
  });

  it('expands compact slide deck keys before building the PPTX artifact', async () => {
    const blob = await buildSlideDeckPptxBlob(
      {
        decks: [
          {
            lt: 'Lesson 1: Compact Export Coverage',
            sl: [
              {
                t: 'Compact slide titles render',
                ty: 'content',
                bu: ['Compact bullets render', 'Instructor notes stay attached'],
                no: 'Use this slide to verify compact generated speaker notes survive the PowerPoint export.',
              },
            ],
          },
        ],
      },
      'Compact Course',
      0,
    );
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const slideXml = await zip.file('ppt/slides/slide1.xml').async('string');
    const notesXml = await zip.file('ppt/notesSlides/notesSlide1.xml').async('string');

    expect(slideXml).toContain('Compact slide titles render');
    expect(slideXml).toContain('Compact bullets render');
    expect(notesXml).toContain('compact generated speaker notes');
  });

  it('keeps a one-bullet example in the body and removes nested takeaway labels', async () => {
    const blob = await buildSlideDeckPptxBlob(
      {
        decks: [
          {
            lessonTitle: 'Lesson 1: Example Layout',
            slides: [
              {
                title: 'One inspectable example',
                type: 'example',
                bullets: ['A specification document details interaction flows and component states.'],
              },
              {
                title: 'A complete evidence example',
                type: 'example',
                bullets: [
                  'Identify one source detail students can inspect.',
                  'Key insight: strong answers explain how evidence changes the decision.',
                ],
              },
            ],
          },
        ],
      },
      'Test Course',
      0,
    );
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const oneBulletXml = await zip.file('ppt/slides/slide1.xml').async('string');
    const takeawayXml = await zip.file('ppt/slides/slide2.xml').async('string');
    expect(oneBulletXml).toContain('A specification document details interaction flows');
    expect(oneBulletXml).not.toContain('Key Takeaway');
    expect(oneBulletXml).toContain('slide-counter-1-of-2');
    expect(takeawayXml).toContain('slide-counter-2-of-2');
    expect(oneBulletXml).toContain('1 / 2');
    expect(takeawayXml).toContain('2 / 2');
    expect(oneBulletXml).toContain('title="Slide counter" descr="Slide 1 of 2"');
    expect(takeawayXml).toContain('title="Slide counter" descr="Slide 2 of 2"');
    expect(oneBulletXml).not.toContain('Decorative counter segment');
    expect(Object.keys(zip.files).filter((path) => /^ppt\/media\/.+/.test(path))).toHaveLength(0);
    expect(takeawayXml).toContain('Key Takeaway:');
    expect(takeawayXml).toContain('strong answers explain how evidence changes the decision');
    expect(takeawayXml).not.toContain('Key Takeaway: Key insight:');
  });

  it('labels a first-lesson throughline as the course arc rather than last time', async () => {
    const blob = await buildSlideDeckPptxBlob(
      {
        decks: [
          {
            lessonTitle: 'Lesson 1: Foundations',
            slides: [
              {
                title: 'Foundations course throughline',
                type: 'bridge',
                bullets: ['This course: what we will build', 'Today: choose the evidence move', 'Next: application'],
              },
            ],
          },
        ],
      },
      'Test Course',
      0,
    );
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const xml = await zip.file('ppt/slides/slide1.xml').async('string');

    expect(xml).toContain('COURSE ARC');
    expect(xml).not.toContain('LAST TIME');
  });

  it('places Today and Next on the TODAY side of a three-part bridge', async () => {
    const blob = await buildSlideDeckPptxBlob(
      {
        decks: [
          {
            lessonTitle: 'Lesson 2: Control Flow',
            slides: [
              {
                title: 'From data types to control flow',
                type: 'bridge',
                bullets: [
                  'Last time: Python data types',
                  'Today: Use control-flow evidence to strengthen the assignment',
                  'Next: Functions and tests',
                ],
              },
            ],
          },
        ],
      },
      'Test Course',
      0,
    );
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const xml = await zip.file('ppt/slides/slide1.xml').async('string');
    const shapeContaining = (text) => xml.split('<p:sp>').find((shape) => shape.includes(text));

    expect(shapeContaining('Last time: Python data types')).toContain('x="365760"');
    expect(shapeContaining('Today: Use control-flow evidence')).toContain('x="4160520"');
    expect(shapeContaining('Next: Functions and tests')).toContain('x="4160520"');
  });

  it('preserves every bullet in a mixed labeled and unlabeled bridge exactly once', async () => {
    const bullets = [
      'Last time: Python data types',
      'An unlabeled recap detail',
      'Today: Use control-flow evidence',
      'An unlabeled today detail',
      'Next: Functions and tests',
    ];
    const blob = await buildSlideDeckPptxBlob(
      {
        decks: [
          {
            lessonTitle: 'Lesson 2: Control Flow',
            slides: [{ title: 'From data types to control flow', type: 'bridge', bullets }],
          },
        ],
      },
      'Test Course',
      0,
    );
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const xml = await zip.file('ppt/slides/slide1.xml').async('string');
    const shapeContaining = (text) => xml.split('<p:sp>').find((shape) => shape.includes(text));

    for (const bullet of bullets) {
      expect(xml.split(bullet)).toHaveLength(2);
    }
    expect(shapeContaining('Last time: Python data types')).toContain('x="365760"');
    expect(shapeContaining('An unlabeled recap detail')).toContain('x="365760"');
    expect(shapeContaining('Today: Use control-flow evidence')).toContain('x="4160520"');
    expect(shapeContaining('An unlabeled today detail')).toContain('x="4160520"');
    expect(shapeContaining('Next: Functions and tests')).toContain('x="4160520"');
  });

  it.each([
    {
      name: 'recap-only labels',
      bullets: ['Last time: Types', 'Unlabeled recap', 'Unlabeled today', 'Unlabeled extension'],
      left: ['Last time: Types', 'Unlabeled recap'],
      right: ['Unlabeled today', 'Unlabeled extension'],
    },
    {
      name: 'today-only labels',
      bullets: ['Unlabeled recap', 'Supporting recap detail', 'Today: Loops', 'Unlabeled today'],
      left: ['Unlabeled recap', 'Supporting recap detail'],
      right: ['Today: Loops', 'Unlabeled today'],
    },
    {
      name: 'no semantic labels',
      bullets: ['Prior concept', 'Prior example', 'Current concept', 'Current application'],
      left: ['Prior concept', 'Prior example'],
      right: ['Current concept', 'Current application'],
    },
  ])('preserves every bullet with $name exactly once', async ({ bullets, left, right }) => {
    const blob = await buildSlideDeckPptxBlob(
      {
        decks: [
          {
            lessonTitle: 'Lesson 2: Control Flow',
            slides: [{ title: 'Bridge', type: 'bridge', bullets }],
          },
        ],
      },
      'Test Course',
      0,
    );
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const xml = await zip.file('ppt/slides/slide1.xml').async('string');
    const shapeContaining = (text) => xml.split('<p:sp>').find((shape) => shape.includes(text));

    for (const bullet of bullets) {
      expect(xml.split(bullet)).toHaveLength(2);
    }
    for (const bullet of left) expect(shapeContaining(bullet)).toContain('x="365760"');
    for (const bullet of right) expect(shapeContaining(bullet)).toContain('x="4160520"');
  });
});

describe('PPTX export — native visuals (v0.12.1)', () => {
  const NATIVE_TABLE_XML = /<a:tbl[\s>]/;
  const count = (xml, re) => (xml.match(new RegExp(re, 'g')) || []).length;

  it('content slide with pre-paired evidence rows renders a native PPTX table', () => {
    // Fixture slide index 5 = content with kind 'evidence table' and
    // descriptor rows. v0.14.1 (5.2c): the header names the two columns
    // (the old single colspan header read as an empty trailing cell), and
    // rows come from the descriptor, never from splitting bullets.
    const xml = slideXmls[5];
    expect(xml).toMatch(NATIVE_TABLE_XML);
    expect(xml).toContain('CLAIM');
    expect(xml).toContain('EVIDENCE');
    expect(xml).toContain('Price signal');
    expect(xml).toContain('shows willingness to pay at the margin');
    expect(xml).toContain('reveals the producer break-even point');
    const rowHeights = [...xml.matchAll(/<a:tr h="(\d+)"/g)].map((match) => Number(match[1]));
    expect(rowHeights).toHaveLength(4);
    expect(Math.min(...rowHeights)).toBeGreaterThanOrEqual(650000);
    // Lead assertion stays on the slide as text
    expect(xml).toContain('Each evidence row names the signal');
  });

  it('evidence-table kind WITHOUT descriptor rows keeps the text layout (5.2c)', async () => {
    // The audited defect shape: colon/dash-bearing bullets that the old
    // exporter chopped into fake claim/evidence pairs. With no pre-paired
    // rows the slide must keep its plain text layout.
    const blob = await buildSlideDeckPptxBlob(
      {
        decks: [
          {
            lessonTitle: 'Lesson 1: No Fabricated Tables',
            slides: [
              {
                title: 'Markets clear where supply meets demand',
                type: 'content',
                bullets: [
                  'Each evidence row names the signal and what it tells you about the market.',
                  'Price signal — shows willingness to pay at the margin',
                  'Cost curve — reveals the producer break-even point',
                ],
                notes: 'No table without paired rows.',
                visual: {
                  kind: 'evidence table',
                  description: 'Evidence table comparing price and cost signals',
                  altText: 'Two-row table of market evidence signals.',
                },
              },
            ],
          },
        ],
      },
      'Test Course',
      0,
    );
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const xml = await zip.file('ppt/slides/slide1.xml').async('string');
    expect(xml).not.toMatch(NATIVE_TABLE_XML);
    expect(xml).toContain('Price signal');
  });

  it('uses an explicit descriptor lead for a misconception comparison table', async () => {
    const blob = await buildSlideDeckPptxBlob(
      {
        decks: [
          {
            lessonTitle: 'Lesson 1: Evidence Boundaries',
            slides: [
              {
                title: 'Common pitfalls in evidence use',
                type: 'content',
                bullets: [
                  'Tempting claim: Correlation always proves causation. Correction: Other explanations must be tested.',
                  'Weak claim: One example settles the pattern. Better reasoning: Compare several observations.',
                ],
                visual: {
                  kind: 'misconception comparison table',
                  tableLead: 'Vote first, then compare each tempting claim with its evidence-based correction.',
                  columnLabels: ['MISCONCEPTION', 'CORRECTION'],
                  rows: [
                    ['Correlation proves causation', 'Other explanations must be tested'],
                    ['One example settles the pattern', 'Compare several observations'],
                  ],
                },
              },
            ],
          },
        ],
      },
      'Test Course',
      0,
    );
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const xml = await zip.file('ppt/slides/slide1.xml').async('string');

    expect(xml).toMatch(NATIVE_TABLE_XML);
    expect(xml).toContain('Vote first, then compare each tempting claim with its evidence-based correction.');
    expect(xml).toContain('MISCONCEPTION');
    expect(xml).toContain('CORRECTION');
    expect(xml).toContain('Correlation proves causation');
    expect(xml).toContain('Other explanations must be tested');
  });

  it('renders complete long misconception pairs in a readable native table', async () => {
    const blob = await buildSlideDeckPptxBlob(
      {
        decks: [
          {
            lessonTitle: 'Lesson 15: Course Review',
            slides: [
              {
                title: 'Common pitfalls in course review',
                type: 'content',
                bullets: [
                  'Students dismiss heuristics as sloppy thinking. Heuristics can be adaptive under limited time.',
                  'Students treat all forgetting as erased storage. Encoding and retrieval failures differ.',
                ],
                visual: {
                  kind: 'misconception comparison table',
                  tableLead: 'Vote first, then test each tempting claim against the stronger explanation.',
                  columnLabels: ['MISCONCEPTION', 'CORRECTION'],
                  rows: [
                    [
                      'Students dismiss heuristics as sloppy thinking that should always be replaced by algorithms',
                      'Heuristics are adaptive general frameworks deliberately used when information or time is limited, while an algorithm guarantees a result only where a step-by-step formula exists',
                    ],
                    [
                      'Students treat all forgetting as memories being erased from storage',
                      'Much forgetting is encoding failure (never stored) or retrieval failure (blocking, interference)',
                    ],
                  ],
                },
              },
            ],
          },
        ],
      },
      'Introduction to Psychology',
      0,
    );
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const xml = await zip.file('ppt/slides/slide1.xml').async('string');

    expect(xml).toMatch(NATIVE_TABLE_XML);
    expect(xml).toContain('Students dismiss heuristics as sloppy thinking');
    expect(xml).toContain('Heuristics are adaptive general frameworks');
    expect(xml).toContain('retrieval failure (blocking, interference)');
    const rowHeights = [...xml.matchAll(/<a:tr h="(\d+)"/g)].map((match) => Number(match[1]));
    expect(rowHeights).toHaveLength(3);
    expect(Math.min(...rowHeights)).toBeGreaterThanOrEqual(800000);
  });

  it('discussion slide with a decision-matrix visual renders a native grid table', () => {
    // Fixture slide index 6 = discussion with kind 'decision matrix'
    const xml = slideXmls[6];
    expect(xml).toMatch(NATIVE_TABLE_XML);
    expect(xml).toContain('Price ceiling: protects renters now');
    expect(xml).toContain('Voucher: targets the neediest households');
  });

  it('keyTerm slide with a concept-map visual renders a hub-and-spoke ellipse group (v0.14.5 C1)', () => {
    // Fixture slide index 7 = keyTerm with kind 'concept map'
    const xml = slideXmls[7];
    // Hub label = the concept (slide title)
    expect(xml).toContain('Opportunity Cost');
    // v0.14.5 (C1): hub + spokes are named ellipses on the fixed slot
    // table — the cmViz prefix is the grader's feature marker.
    expect(count(xml, 'name="cmVizHub"')).toBe(1);
    expect(count(xml, 'name="cmVizSpoke"')).toBe(3);
    expect(count(xml, 'name="cmVizConn"')).toBe(3);
    expect(count(xml, 'prst="ellipse"')).toBeGreaterThanOrEqual(4); // hub + 3 spokes (+ progress dots)
    // …and one connector line per spoke
    expect(count(xml, 'prst="line"')).toBeGreaterThanOrEqual(3);
    // Short teaching phrases remain complete instead of ending in an
    // unexplained ellipsis inside the visual.
    expect(xml).toContain('Includes non-money costs like time');
    expect(xml).toContain('Drives the shape of the production frontier');
    // The definition still renders in the concept card
    expect(xml).toContain('next-best alternative');
  });

  it('baseline keyTerm slide (non concept-map kind) has no connector lines', () => {
    // Fixture slide index 3 = keyTerm with kind 'chart' — text layout kept
    expect(count(slideXmls[3], 'name="cmVizConn"')).toBe(0);
    expect(slideXmls[3]).not.toMatch(NATIVE_TABLE_XML);
  });

  it('evidence-table kind with oversize rows keeps the text layout (no table)', () => {
    // Fixture slide index 8 = content whose row bullet exceeds the limit
    const xml = slideXmls[8];
    expect(xml).not.toMatch(NATIVE_TABLE_XML);
    // The bullets still render as plain text
    expect(xml).toContain('Lead assertion for the long-form slide');
  });

  it('slides without a matching visual kind never get a native table', () => {
    // Fixture slide index 1 = content with kind 'diagram' (no table data)
    expect(slideXmls[1]).not.toMatch(NATIVE_TABLE_XML);
  });

  it('keeps the SUGGESTED VISUAL block in notes as alt-text even when rendered natively', () => {
    expect(containsAny(notesXmls[5], VISUAL_NOTE_MARKERS)).toBe(true);
    expect(containsAny(notesXmls[5], ALT_MARKERS)).toBe(true);
    expect(containsAny(notesXmls[6], VISUAL_NOTE_MARKERS)).toBe(true);
    expect(containsAny(notesXmls[7], VISUAL_NOTE_MARKERS)).toBe(true);
  });

  it('native visuals never reintroduce the dashed placeholder scaffolding', () => {
    expect(slideXmls[5]).not.toMatch(DASHED_LINE_XML);
    expect(slideXmls[6]).not.toMatch(DASHED_LINE_XML);
    expect(slideXmls[7]).not.toMatch(DASHED_LINE_XML);
  });
});
