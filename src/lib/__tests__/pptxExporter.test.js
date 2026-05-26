import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import JSZip from 'jszip';
import { buildSlideDeckPptxBlob } from '../exporters/pptxExporter';

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
});
