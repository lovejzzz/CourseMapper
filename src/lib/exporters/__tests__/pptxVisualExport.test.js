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
 * keyTerm + SUGGESTED VISUAL notes line) holds.
 */

import { describe, it, expect, beforeAll } from 'vitest';
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
      ],
    },
  ],
};

// Distinctive marker strings from our exporter code — if these change, the
// test fails loudly and someone has to re-verify the feature intentionally.
const NOTES_MARKER = 'SUGGESTED VISUAL';
const ALT_MARKER = 'ALT TEXT';
const DASHED_LINE_XML = /prstDash\s+val\s*=\s*"dash"/;

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

  it('content slide with a visual emits a dashed-line shape', () => {
    // Fixture slide index 1 (0-based) = content slide with visual
    expect(slideXmls[1]).toMatch(DASHED_LINE_XML);
  });

  it('keyTerm slide with a visual emits a dashed-line shape', () => {
    // Fixture slide index 3 = keyTerm with visual
    expect(slideXmls[3]).toMatch(DASHED_LINE_XML);
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

  it('content slide notes include the SUGGESTED VISUAL block with alt text', () => {
    // Notes XML at the same index as the slide
    expect(notesXmls[1]).toContain(NOTES_MARKER);
    expect(notesXmls[1]).toContain(ALT_MARKER);
    // And the kind + description show through the XML escaping
    expect(notesXmls[1]).toContain('diagram');
    expect(notesXmls[1]).toContain('labeled data');
  });

  it('title slide notes STILL include the SUGGESTED VISUAL block', () => {
    // Even though the on-slide placeholder is exempt, the notes-page block
    // is always added — accessibility metadata should surface regardless.
    expect(notesXmls[0]).toContain(NOTES_MARKER);
    expect(notesXmls[0]).toContain('graduation cap');
  });

  it('slide without a visual does NOT pollute notes with a SUGGESTED VISUAL block', () => {
    expect(notesXmls[2]).not.toContain(NOTES_MARKER);
    // Baseline notes should still be present unaltered.
    expect(notesXmls[2]).toContain('Remind about cadence');
  });

  it('existing speaker notes are preserved alongside the visual block', () => {
    // Content slide's original note "Define the core setup." must still
    // appear after our prepended SUGGESTED VISUAL block.
    expect(notesXmls[1]).toContain('Define the core setup');
    // And the order: SUGGESTED VISUAL should come before the original note.
    const visualIdx = notesXmls[1].indexOf(NOTES_MARKER);
    const baseIdx = notesXmls[1].indexOf('Define the core setup');
    expect(visualIdx).toBeGreaterThanOrEqual(0);
    expect(baseIdx).toBeGreaterThan(visualIdx);
  });

  it('alt-text reaches the exported file (via speaker notes)', () => {
    // Accessibility note: pptxgenjs's `altText` option is only serialized
    // to a cNvPr/descr attribute for IMAGE objects (see addShapeDefinition
    // in pptxgen.es.js — shapes stored as _type: text, altText never
    // written to XML). Setting altText on an addShape call is a no-op.
    //
    // Our code compensates by prepending "ALT TEXT: …" into the speaker
    // notes for every slide with a visual hint — assistive tech reading
    // the notes page gets the description, even though the shape itself
    // lacks a descr attribute. This assertion pins that fallback.
    const notes = notesXmls[1];
    expect(notes).toContain('ALT TEXT');
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
});
