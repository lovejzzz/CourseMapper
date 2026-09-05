import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import BuildRibbon from '../BuildRibbon';

const STEP_LABELS = ['Model', 'Map', 'Enrich', 'Compile', 'Verify', 'Grade'];

function makeModel(overrides = {}) {
  return {
    compilerState: 'live',
    progressPct: 32,
    activeStartedAt: 0,
    stageLabel: '',
    steps: STEP_LABELS.map((label, index) => ({
      id: label.toLowerCase(),
      label,
      status: index < 2 ? 'done' : index === 2 ? 'active' : 'pending',
    })),
    pipelineChips: [],
    compilerArtifacts: [],
    elapsedDisplay: '',
    spendDisplay: '',
    ...overrides,
  };
}

describe('BuildRibbon', () => {
  it('does not label a running sync complete when it inherits 100 percent from the finished package', () => {
    const html = renderToStaticMarkup(
      <BuildRibbon model={makeModel({ running: true, progressPct: 100, activeStartedAt: 1000 })} />,
    );
    expect(html).toContain('Build 99%');
    expect(html).not.toContain('Build complete');
    expect(html).toContain('Overall course build progress: 99%');
  });
  it('keeps an honest narrative when a restored build has no current event label', () => {
    const html = renderToStaticMarkup(<BuildRibbon model={makeModel()} />);

    expect(html).toContain('Preparing the next course material…');
  });

  it('keeps stage labels at the product 12px readability floor', () => {
    const html = renderToStaticMarkup(<BuildRibbon model={makeModel()} />);

    expect(html).toContain('text-[12px]');
    expect(html).not.toContain('text-[10px]');
    for (const label of STEP_LABELS) expect(html).toContain(`>${label}</span>`);
  });

  it('uses compact, readable labels below 360px without shrinking the type floor', () => {
    const html = renderToStaticMarkup(<BuildRibbon model={makeModel()} />);

    expect(html).toContain('Build details');
    expect(html).not.toContain('Living Course Compiler');
    for (const label of ['AI', 'Map', 'Enrich', 'Build', 'Check', 'Grade']) {
      expect(html).toContain(`>${label}</span>`);
    }
    expect(html).toContain('min-[360px]:hidden');
    expect(html).not.toContain('text-[11px]');
  });
});
