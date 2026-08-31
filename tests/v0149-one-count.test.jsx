/**
 * @vitest-environment happy-dom
 *
 * v0.14.9 B1 — ONE review count.
 *
 * The live v0.14.8 screenshot showed the header saying "Review 3" while the
 * panel counted 26: two builders (AppFlow's queue omitted the spot-check
 * checklist; the panel's included it) producing two truths. The fix is
 * definitional, and this matrix pins the definition:
 *
 *   headline  = items needing JUDGMENT (sync + observations + structural)
 *   total     = headline + spot-checks (routine confirmations)
 *
 * The header CTA shows the headline; the drawer shows everything (with a
 * Confirm-all for the spot-check class). Both render from ONE queue object,
 * so this file builds one fixture queue and renders BOTH surfaces from it.
 */
import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  JUDGMENT_CLASS_KEYS,
  REVIEW_CLASS_KEYS,
  buildReviewQueue,
  selectOutstandingQueue,
} from '../src/lib/reviewQueueModel.js';
import PrimaryCta from '../src/components/PrimaryCta.jsx';
import ReviewQueue from '../src/components/ReviewQueue.jsx';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

function render(element) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(element);
  });
  return {
    container,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

let mounted = [];
afterEach(() => {
  mounted.forEach((m) => m.unmount());
  mounted = [];
});

function mount(element) {
  const m = render(element);
  mounted.push(m);
  return m;
}

const READY_MODEL = { stage: 'ready', running: false };

// One observation + two structural + one sync = 4 judgment items, plus three
// spot-checks that must NOT inflate the headline.
function buildFixtureQueue() {
  return buildReviewQueue({
    reviewItems: [
      { id: 'spot-1', label: 'Skim lesson 3 quiz options', detail: '', confirmed: false },
      { id: 'spot-2', label: 'Check week 5 reading list', detail: '', confirmed: false },
      { id: 'spot-3', label: 'Verify rubric weights', detail: '', confirmed: false },
    ],
    observations: [{ id: 'obs-1', observation: 'Lesson 9 leans hard on one source', whyItMatters: 'Variety.' }],
    finalizerResult: {
      gates: {
        flaggedChecks: [
          { status: 'warning', featureId: 'quizBank', message: 'Two stems repeat a phrase.' },
          { status: 'failed', featureId: 'syllabus', message: 'Heading depth exceeds template.' },
        ],
      },
    },
    qualityPass: null,
    syncSuggestion: {
      id: 'sync-1',
      plan: [{ featureId: 'lessonPlans', lessonIndices: [2], changes: [{ summary: 'Retitle lesson 3' }] }],
      changedFieldsSummary: 'title',
    },
  });
}

describe('B1 — the headline definition', () => {
  it('headline counts judgment items only; total still counts everything', () => {
    const queue = buildFixtureQueue();
    expect(queue.counts.sync).toBe(1);
    expect(queue.counts.observations).toBe(1);
    expect(queue.counts.structural).toBe(2);
    expect(queue.counts.spotChecks).toBe(3);
    expect(queue.counts.headline).toBe(4); // 1 + 1 + 2 — never + 3
    expect(queue.total).toBe(7);
  });

  it('JUDGMENT_CLASS_KEYS is exactly the non-spot-check classes', () => {
    expect(JUDGMENT_CLASS_KEYS).toEqual(['sync', 'observations', 'structural']);
    expect(REVIEW_CLASS_KEYS.filter((key) => key !== 'spotChecks')).toEqual(JUDGMENT_CLASS_KEYS);
  });

  it('outstanding selection keeps the same headline semantics as it drains', () => {
    const queue = buildFixtureQueue();
    const obsId = queue.classes.observations[0].id;
    const spotId = queue.classes.spotChecks[0].id;
    const outstanding = selectOutstandingQueue(queue, { reviewed: [obsId, spotId], dismissed: [] });
    // One judgment item reviewed → headline drops; the reviewed spot-check
    // changes total but never the headline.
    expect(outstanding.counts.headline).toBe(3);
    expect(outstanding.counts.spotChecks).toBe(2);
    expect(outstanding.total).toBe(5);
  });
});

describe('B1 — both surfaces render from the one queue object', () => {
  it('header CTA shows the headline while the drawer shows every class', () => {
    const queue = buildFixtureQueue();
    const outstanding = selectOutstandingQueue(queue, { reviewed: [], dismissed: [] });

    const cta = mount(
      <PrimaryCta
        ribbonModel={READY_MODEL}
        reviewCount={outstanding.counts.headline}
        canDownload={false}
        onReview={() => {}}
      />,
    );
    expect(cta.container.querySelector('[data-testid="primary-cta"]').textContent).toContain('Review 4');

    const drawer = mount(
      <ReviewQueue
        open
        queue={queue}
        progress={{ reviewed: [], dismissed: [] }}
        onClose={() => {}}
        onMark={() => {}}
      />,
    );
    const items = drawer.container.querySelectorAll('[data-testid="review-queue-item"]');
    expect(items.length).toBe(queue.total); // 7 — the drawer hides nothing
    expect(drawer.container.querySelector('[data-testid="review-queue-class-spotChecks"]')).toBeTruthy();
    expect(drawer.container.querySelector('[data-testid="review-queue-progress"]').textContent).toBe(
      '4 decisions · 3 routine spot-checks',
    );
  });

  it('a downloadable package leaves ZIP ownership to the export panel', () => {
    const queue = buildFixtureQueue();
    // All judgment items handled, all spot-checks still open.
    const judged = [...queue.classes.sync, ...queue.classes.observations, ...queue.classes.structural].map(
      (item) => item.id,
    );
    const outstanding = selectOutstandingQueue(queue, { reviewed: judged, dismissed: [] });
    expect(outstanding.counts.headline).toBe(0);
    expect(outstanding.counts.spotChecks).toBe(3);

    const cta = mount(<PrimaryCta ribbonModel={READY_MODEL} reviewCount={outstanding.counts.headline} canDownload />);
    expect(cta.container.querySelector('[data-testid="primary-cta"]')).toBeNull();
  });

  it('the spot-check class header carries Confirm all, wired to every open item', () => {
    const queue = buildFixtureQueue();
    const onMarkAll = vi.fn();
    const drawer = mount(
      <ReviewQueue
        open
        queue={queue}
        progress={{ reviewed: [queue.classes.spotChecks[0].id], dismissed: [] }}
        onClose={() => {}}
        onMark={() => {}}
        onMarkAll={onMarkAll}
      />,
    );
    const confirmAll = drawer.container.querySelector('[data-testid="review-queue-confirm-all"]');
    expect(confirmAll).toBeTruthy();
    act(() => {
      confirmAll.click();
    });
    expect(onMarkAll).toHaveBeenCalledTimes(1);
    const [items, mark] = onMarkAll.mock.calls[0];
    expect(mark).toBe('reviewed');
    // Only the two still-open spot-checks — the already-reviewed one is excluded.
    expect(items.map((item) => item.id)).toEqual(queue.classes.spotChecks.slice(1).map((item) => item.id));
  });

  it('the sync class exposes one clearly batch-scoped action', () => {
    const queue = buildFixtureQueue();
    const onExecuteSync = vi.fn();
    const drawer = mount(
      <ReviewQueue
        open
        queue={queue}
        progress={{ reviewed: [], dismissed: [] }}
        onClose={() => {}}
        onMark={() => {}}
        onExecuteSync={onExecuteSync}
      />,
    );

    const actions = drawer.container.querySelectorAll('[data-testid="review-queue-sync-now"]');
    expect(actions).toHaveLength(1);
    expect(actions[0].textContent).toBe(`Sync all ${queue.classes.sync.length}`);
    act(() => actions[0].click());
    expect(onExecuteSync).toHaveBeenCalledTimes(1);
  });
});

describe('B1 — surface contracts (source scans)', () => {
  it('the queue has ONE owner (the hook); AppFlow consumes it; the panel builds nothing', () => {
    const appFlow = read('src/AppFlow.jsx');
    const owner = read('src/hooks/useReviewQueueOwner.js');
    const panel = read('src/components/ExportSidePanel.jsx');
    // v0.15.1 C1: the builder lives in the hook now — the contract is the
    // same: one buildReviewQueue call in the codebase's UI layer.
    expect(owner).toContain('buildReviewQueue({');
    expect(appFlow).not.toContain('buildReviewQueue(');
    expect(appFlow).toContain('useReviewQueueOwner({');
    expect(appFlow).toContain('reviewCount={outstandingReview.counts.headline}');
    expect(appFlow).toContain('reviewQueue={reviewQueue}');
    expect(panel).not.toContain('buildReviewQueue');
    expect(panel).not.toContain('buildPreExportChecklist');
    expect(panel).not.toContain('loadReviewProgress');
  });
});
