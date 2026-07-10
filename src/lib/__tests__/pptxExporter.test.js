import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import JSZip from 'jszip';
import { buildSlideDeckPptxBlob, accentFamilyForCourse, ACCENT_FAMILIES } from '../exporters/pptxExporter';
import { autoFitFontSize } from '../exporters/slideTextFit';

function installCanvasStub() {
  const context = {
    font: '',
    measureText: (text) => ({ width: String(text || '').length * 7 }),
  };
  globalThis.OffscreenCanvas = class OffscreenCanvas {
    getContext() {
      return context;
    }
  };
}

async function loadPptxZip(blob) {
  const payload = typeof blob?.arrayBuffer === 'function' ? await blob.arrayBuffer() : blob;
  return JSZip.loadAsync(payload);
}

function slideNames(zip) {
  return Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => Number(a.match(/slide(\d+)/)?.[1] || 0) - Number(b.match(/slide(\d+)/)?.[1] || 0));
}

describe('pptxExporter', () => {
  beforeEach(() => {
    installCanvasStub();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not add extra divider slides between lesson decks', async () => {
    const blob = await buildSlideDeckPptxBlob(
      {
        decks: [
          {
            lessonTitle: 'Lesson 1: Foundations',
            slides: [
              {
                title: 'Foundations overview',
                type: 'content',
                bullets: ['Set expectations', 'Review workflow'],
                notes: 'Use this slide to orient learners to the workflow.',
              },
              {
                title: 'Foundations activity',
                type: 'activity',
                bullets: ['Apply the workflow'],
                notes: 'Guide learners through a short practice task.',
              },
            ],
          },
          {
            lessonTitle: 'Lesson 2: Research',
            slides: [
              {
                title: 'Research overview',
                type: 'content',
                bullets: ['Plan inquiry', 'Gather evidence'],
                notes: 'Use this slide to introduce the research focus.',
              },
              {
                title: 'Research activity',
                type: 'activity',
                bullets: ['Draft questions'],
                notes: 'Guide learners through question drafting.',
              },
            ],
          },
        ],
      },
      'Export Audit',
      0,
    );

    const zip = await loadPptxZip(blob);

    expect(slideNames(zip)).toHaveLength(4);
  });

  it('punctuates example-slide key takeaway callouts in rendered PPTX XML', async () => {
    const blob = await buildSlideDeckPptxBlob(
      {
        decks: [
          {
            lessonTitle: 'Lesson 5: Information architecture',
            slides: [
              {
                title: 'EXAMPLE user flow',
                type: 'example',
                bullets: [
                  'Browse events → select an event → reserve a spot → receive confirmation',
                  'Poor labeling makes even well-organized content hard to use',
                ],
                notes: 'Use this example to compare structure and labeling choices.',
              },
            ],
          },
        ],
      },
      'User Experience Design Studio',
      0,
    );

    const zip = await loadPptxZip(blob);
    const xml = await zip.file('ppt/slides/slide1.xml').async('string');

    expect(xml).toContain('Key Takeaway: Poor labeling makes even well-organized content hard to use.');
    expect(xml).not.toContain('Key Takeaway: Poor labeling makes even well-organized content hard to use<');
  });

  it('punctuates long example-slide body bullets in rendered PPTX XML', async () => {
    const blob = await buildSlideDeckPptxBlob(
      {
        decks: [
          {
            lessonTitle: 'Lesson 10: Accessibility',
            slides: [
              {
                title: 'EXAMPLE',
                type: 'example',
                bullets: [
                  'Accessibility is part of overall usability, not an optional add-on',
                  'Making a form usable with a screen reader and with low vision.',
                  'Interface state ↔ assistive technology feedback remains visible',
                  'Key review point',
                ],
                notes: 'Use this example to connect accessibility choices to usability evidence.',
              },
            ],
          },
        ],
      },
      'User Experience Design Studio',
      0,
    );

    const zip = await loadPptxZip(blob);
    const xml = await zip.file('ppt/slides/slide1.xml').async('string');

    expect(xml).toContain('Accessibility is part of overall usability, not an optional add-on.');
    expect(xml).not.toContain('Accessibility is part of overall usability, not an optional add-on<');
    expect(xml).toContain('Interface state ↔ assistive technology feedback remains visible');
    expect(xml).not.toContain('Interface state ↔ assistive technology feedback remains visible.');
  });

  describe('per-course accent palette (v0.12.1)', () => {
    it('is deterministic — same course name always maps to the same family', () => {
      const a = accentFamilyForCourse('Introduction to Microeconomics');
      const b = accentFamilyForCourse('Introduction to Microeconomics');
      expect(a).toBe(b);
      expect(ACCENT_FAMILIES).toContain(a);
      // Normalization: case and surrounding whitespace do not change the pick
      expect(accentFamilyForCourse('  introduction to microeconomics ')).toBe(a);
    });

    it('spreads different course names across more than one accent family', () => {
      const names = [
        'Introduction to Microeconomics',
        'Foundations of Nutrition',
        'Nursing Fundamentals',
        'Educational Psychology',
        'Introduction to Statistics',
        'World History to 1500',
      ];
      const accents = new Set(names.map((n) => accentFamilyForCourse(n).accent));
      expect(accents.size).toBeGreaterThan(1);
    });

    it('threads the course-derived accent into the exported slide XML', async () => {
      const deckFor = () => ({
        decks: [
          {
            lessonTitle: 'Lesson 1: Kickoff',
            slides: [
              {
                title: 'Welcome',
                type: 'title',
                bullets: ['A course subtitle line'],
                notes: 'Open the course.',
              },
            ],
          },
        ],
      });
      // Pick two course names that hash to different families so the decks
      // are visibly distinct; derived from the same function the exporter
      // uses, so the test stays valid if families are ever re-ordered.
      const nameA = 'Introduction to Microeconomics';
      const candidates = [
        'Foundations of Nutrition',
        'Nursing Fundamentals',
        'Educational Psychology',
        'Introduction to Statistics',
        'World History to 1500',
      ];
      const nameB = candidates.find((n) => accentFamilyForCourse(n).accent !== accentFamilyForCourse(nameA).accent);
      expect(nameB).toBeTruthy();

      const xmlFor = async (name) => {
        const blob = await buildSlideDeckPptxBlob(deckFor(name), name, 0);
        const zip = await loadPptxZip(blob);
        return zip.file('ppt/slides/slide1.xml').async('string');
      };
      const [xmlA, xmlB] = await Promise.all([xmlFor(nameA), xmlFor(nameB)]);

      expect(xmlA).toContain(accentFamilyForCourse(nameA).accent);
      expect(xmlB).toContain(accentFamilyForCourse(nameB).accent);
      expect(xmlA).not.toContain(accentFamilyForCourse(nameB).accent);
    });
  });

  describe('auto-fit text (v0.12.1)', () => {
    it('returns a size below max for a long title in a shallow box', () => {
      const longTitle =
        'A deliberately long lesson title that keeps going well past the point where a forty-point ' +
        'heading could ever fit inside the allotted box on the slide';
      const size = autoFitFontSize(longTitle, 5.8, 0.6, 'Trebuchet MS', 16, 12, 1.5);
      expect(size).toBeLessThan(16);
      expect(size).toBeGreaterThanOrEqual(12);
    });

    it('unifies agenda rows to one shared font size (the min of the rows)', async () => {
      const longRow =
        'This is a deliberately much longer agenda item that should force the shared agenda font size down for every row, ' +
        'because the unified list size must come from the row that needs the most shrinking rather than from each row alone';
      const blob = await buildSlideDeckPptxBlob(
        {
          decks: [
            {
              lessonTitle: 'Lesson 1: Agenda Sizing',
              slides: [
                {
                  title: 'Session Overview',
                  type: 'agenda',
                  bullets: ['Short item', 'Another short one', longRow],
                  notes: 'Walk the agenda.',
                },
              ],
            },
          ],
        },
        'Agenda Course',
        0,
      );
      const zip = await loadPptxZip(blob);
      const xml = await zip.file('ppt/slides/slide1.xml').async('string');
      const exportedLongRow = `${longRow}.`;

      // Find the run font size (`sz` in hundredths of a point) immediately
      // preceding each agenda row's text in the slide XML.
      const runSizeFor = (text) => {
        const idx = xml.indexOf(`<a:t>${text}</a:t>`);
        expect(idx, `run for "${text}" not found`).toBeGreaterThan(-1);
        const before = xml.slice(0, idx);
        const szIdx = before.lastIndexOf('sz="');
        expect(szIdx).toBeGreaterThan(-1);
        return Number(before.slice(szIdx + 4).match(/^\d+/)[0]);
      };

      const sizes = [runSizeFor('Short item'), runSizeFor('Another short one'), runSizeFor(exportedLongRow)];
      // All rows share one size…
      expect(new Set(sizes).size).toBe(1);
      // …and it is the shrunken size the long row forced, not the 16pt max —
      // proving short rows adopted the min instead of keeping their own fit.
      expect(sizes[0]).toBeLessThan(1600);
    });

    it('shrinks long summary checklists as one list so they stay above the footer', async () => {
      const longCheck =
        'Name the specific evidence that changed your interpretation, explain the design consequence, and identify the next action you will take before the following critique';
      const blob = await buildSlideDeckPptxBlob(
        {
          decks: [
            {
              lessonTitle: 'Lesson 3: Contextual interviews',
              slides: [
                {
                  title: 'Carry the evidence forward',
                  type: 'summary',
                  bullets: [
                    longCheck,
                    `${longCheck} while connecting the observation to the research question`,
                    `${longCheck} and state what would disconfirm your current assumption`,
                    `${longCheck} in the next interview`,
                  ],
                  notes: 'Close with an evidence-based next-use check.',
                },
              ],
            },
          ],
        },
        'User Experience Design Studio',
        0,
      );
      const zip = await loadPptxZip(blob);
      const xml = await zip.file('ppt/slides/slide1.xml').async('string');

      const runSizes = [...xml.matchAll(/<a:rPr[^>]*\bsz="(\d+)"/g)].map((match) => Number(match[1]));
      const summarySizes = runSizes.filter((size) => size >= 1100 && size <= 1600);

      expect(summarySizes.length).toBeGreaterThanOrEqual(4);
      expect(new Set(summarySizes)).toEqual(new Set([1100]));
      expect(xml).not.toMatch(/following critique[^<]*\n<\/a:t>/);
    });

    it('does not double-space dense content bullets with redundant literal newlines', async () => {
      const bullets = [
        'Students may assume contextual inquiry is only about watching users, not asking questions; the correction is that it combines observation with guided questioning.',
        'A weak claim says think-aloud only records verbal output; stronger reasoning connects the narration to mental models and decision points.',
        'Thinking elicitation is not a yes-or-no prompt; it uses iterative, open-ended questions to reveal nuanced reasoning.',
      ];
      const blob = await buildSlideDeckPptxBlob(
        {
          decks: [
            {
              lessonTitle: 'Lesson 3: Contextual interviews',
              slides: [
                {
                  title: 'Common pitfalls in contextual interviews and observation',
                  type: 'content',
                  bullets,
                  notes: 'Correct each misconception with evidence.',
                },
              ],
            },
          ],
        },
        'User Experience Design Studio',
        0,
      );
      const zip = await loadPptxZip(blob);
      const xml = await zip.file('ppt/slides/slide1.xml').async('string');

      expect(xml).not.toMatch(/guided questioning[^<]*\n<\/a:t>/);
      expect(xml).not.toMatch(/decision points[^<]*\n<\/a:t>/);
      expect(xml).not.toMatch(/nuanced reasoning[^<]*\n<\/a:t>/);
    });
  });
});
