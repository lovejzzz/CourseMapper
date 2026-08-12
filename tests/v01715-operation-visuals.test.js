/**
 * @vitest-environment happy-dom
 */
import { beforeAll, describe, expect, it } from 'vitest';
import JSZip from 'jszip';

import { workedExampleVisualDescriptor } from '../src/lib/courseBlueprintCompiler.js';
import { buildSlideDeckPptxBlob } from '../src/lib/exporters/pptxExporter.js';

beforeAll(() => {
  const context = {
    font: '12px sans',
    measureText(text) {
      return { width: String(text || '').length * 6.6 };
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
  if (globalThis.HTMLCanvasElement) HTMLCanvasElement.prototype.getContext = () => context;
});

const examples = {
  distribution: {
    operation: 'summarize-and-interpret-distribution',
    inputs: ['sorted observations = [2, 3, 3, 4, 4, 4, 5, 9]', 'n = 8'],
    result: 'Mean = 4.25, median = 4, IQR = 1.5.',
  },
  correlation: {
    operation: 'calculate-and-interpret-correlation',
    inputs: ['x = [1, 2, 3]', 'y = [1, 3, 2]'],
    result: 'Pearson correlation r = 0.50.',
  },
  regression: {
    operation: 'fit-and-interpret-simple-linear-regression',
    inputs: ['x = [1, 2, 3]', 'y = [2, 4, 5]'],
    result: 'Fitted line: predicted y = 0.67 + 1.50x.',
  },
  table: {
    operation: 'calculate-and-interpret-two-way-table',
    inputs: ['Group A: yes = 18, no = 12', 'Group B: yes = 12, no = 18'],
    result: 'Conditional yes proportions are 0.60 and 0.40.',
  },
  normal: {
    operation: 'standardize-and-interpret-normal-observation',
    inputs: ['mean = 50', 'standard deviation = 10', 'observation x = 65'],
    result: 'The observation has z = 1.5.',
  },
  interval: {
    operation: 'calculate-and-interpret-confidence-interval',
    inputs: ['sample proportion p-hat = 0.58'],
    result: 'Approximate 95% confidence interval: [0.484, 0.676].',
  },
  sample: {
    operation: 'construct-and-audit-probability-sample',
    inputs: ['target population IDs = [01, 02, 03, 04, 05, 06, 07, 08, 09, 10, 11, 12]'],
    result: 'Selected sample = [02, 05, 08, 11]; frame coverage = 12/12.',
  },
};

describe('operation-qualified worked-example visuals', () => {
  it('selects a semantic visual family from the admitted operation', () => {
    expect(workedExampleVisualDescriptor(examples.distribution)).toMatchObject({ kind: 'dotplot' });
    expect(workedExampleVisualDescriptor(examples.correlation)).toMatchObject({ kind: 'scatter', showFit: false });
    expect(workedExampleVisualDescriptor(examples.regression)).toMatchObject({ kind: 'scatter', showFit: true });
    expect(workedExampleVisualDescriptor(examples.table)).toMatchObject({
      kind: 'contingency-table',
      columns: ['Group', 'Yes', 'No'],
    });
    expect(workedExampleVisualDescriptor(examples.normal)).toMatchObject({ kind: 'number-line' });
    expect(workedExampleVisualDescriptor(examples.interval)).toMatchObject({
      kind: 'interval',
      low: 0.484,
      center: 0.58,
      high: 0.676,
    });
    expect(workedExampleVisualDescriptor(examples.sample)).toMatchObject({
      kind: 'sampling-frame',
      selected: [2, 5, 8, 11],
    });
  });

  it('renders every semantic family as named, accessible native geometry', async () => {
    const descriptors = Object.values(examples).map(workedExampleVisualDescriptor);
    const data = {
      decks: [
        {
          lessonTitle: 'Operation visual audit',
          slides: [
            { title: 'Operation visual audit', type: 'title', bullets: ['Synthetic fixtures'], speakerNotes: 'Audit.' },
            ...descriptors.map((wePlot, index) => ({
              title: `Worked example: operation ${index + 1}`,
              type: 'content',
              bullets: [
                'Problem: inspect the synthetic fixture.',
                'Step: preserve its admitted operation.',
                'Result: interpret within the stated boundary.',
              ],
              speakerNotes: 'Use the native visual.',
              visual: {
                kind: 'worked example walkthrough',
                description: 'Operation-bound native visual.',
                altText: 'Synthetic operation evidence.',
                wePlot,
              },
            })),
          ],
        },
      ],
    };
    const blob = await buildSlideDeckPptxBlob(data, 'Operation Visual Audit', 0);
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const slideXml = (
      await Promise.all(
        Object.keys(zip.files)
          .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
          .sort((left, right) => Number(left.match(/\d+/)?.[0]) - Number(right.match(/\d+/)?.[0]))
          .map((name) => zip.files[name].async('string')),
      )
    ).join('\n');

    expect(slideXml).toContain('name="cmVizDotPlotFrame"');
    expect(slideXml).toContain('name="cmVizScatterFrame"');
    expect(slideXml).toContain('name="cmVizRegressionLine"');
    expect(slideXml).toContain('name="cmVizContingencyTable"');
    expect(slideXml).toContain('name="cmVizNumberLineFrame"');
    expect(slideXml).toContain('name="cmVizIntervalBand"');
    expect(slideXml).toContain('name="cmVizSamplingFrame"');
    expect(slideXml).toContain('name="cmVizSelectedUnit"');
    expect(slideXml).toContain('descr="Scatterplot of');
    expect(slideXml).toContain('descr="Two-way table with');
  });
});
