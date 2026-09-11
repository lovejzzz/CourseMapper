import { buildBuildRibbonModel } from '../../lib/buildRibbonModel';
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
  it('shows a settled review state without suggesting that a background build is still progressing', () => {
    const html = renderToStaticMarkup(
      <BuildRibbon model={makeModel({ compilerState: 'review', running: false, progressPct: 99 })} />,
    );
    expect(html).toContain('Review required');
    expect(html).not.toContain('role="progressbar"');
    expect(html).not.toContain('Build complete');
  });
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

it('hides historical build progress when the restored course has no material job', () => {
  const input = {
    budget: { recentEvents: [{ type: 'model-request-start', at: 1 }] },
    generation: { progressStep: 'done', mappedLessonCount: 1, lessonCount: 1 },
    deliverables: { isGenerating: false, doneCount: 0, totalCount: 0 },
  };
  expect(buildBuildRibbonModel(input)).toBeNull();
  expect(buildBuildRibbonModel({ ...input, deliverables: { isGenerating: true, totalCount: 1 } })).not.toBeNull();
});

it('shows stopped material failures instead of preparing knowledge, including after restore', () => {
  const input = {
    generation: { progressStep: 'done', mappedLessonCount: 12, lessonCount: 12 },
    deliverables: { isGenerating: false, doneCount: 0, failedCount: 2, totalCount: 9 },
  };
  const model = buildBuildRibbonModel(input);
  expect(model).toMatchObject({ running: false, compilerState: 'error', stage: 'compile' });
  expect(model.steps.find((step) => step.id === 'compile').status).toBe('error');
  const html = renderToStaticMarkup(<BuildRibbon model={model} />);
  expect(html).toContain('2 materials failed. Retry from their tabs.');
  expect(html).toContain('Stopped at');
  expect(html).not.toContain('Preparing lesson knowledge');
  expect(html).not.toContain('animate-pulse');
  expect(html).not.toContain('Build complete');
  const retry = buildBuildRibbonModel({ ...input, deliverables: { ...input.deliverables, isGenerating: true } });
  expect(retry.running).toBe(true);
  expect(retry.compilerState).toBe('live');
});
