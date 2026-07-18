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
  it('keeps an honest narrative when a restored build has no current event label', () => {
    const html = renderToStaticMarkup(<BuildRibbon model={makeModel()} />);

    expect(html).toContain('Preparing the next course material…');
  });

  it('uses compact stage labels only below the 360px breakpoint', () => {
    const html = renderToStaticMarkup(<BuildRibbon model={makeModel()} />);

    expect(html).toContain('text-[10px]');
    expect(html).toContain('min-[360px]:text-[12px]');
    for (const label of STEP_LABELS) expect(html).toContain(`>${label}</span>`);
  });
});
