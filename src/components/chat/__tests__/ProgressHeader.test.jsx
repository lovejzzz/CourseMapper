/**
 * @vitest-environment happy-dom
 */
import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, it, expect, vi } from 'vitest';
import ProgressHeader, {
  getDeliverableDoneCount,
  getPendingSyncWorkCount,
  getProgressDisplayStatus,
  getProgressPhaseLabel,
} from '../ProgressHeader';

let mountedRoot = null;
let mountedContainer = null;

afterEach(() => {
  if (mountedRoot) {
    act(() => mountedRoot.unmount());
  }
  mountedRoot = null;
  mountedContainer?.remove();
  mountedContainer = null;
});

describe('ProgressHeader progress helpers', () => {
  it('does not pass the click event into deliverable cancellation', () => {
    const onStopDeliverables = vi.fn();
    mountedContainer = document.createElement('div');
    document.body.appendChild(mountedContainer);
    mountedRoot = createRoot(mountedContainer);
    act(() => {
      mountedRoot.render(
        <ProgressHeader
          currentStep="done"
          deliverables={{ lessonPlans: { status: 'streaming' } }}
          delivProgress={{ done: 0, total: 1, perFeature: {} }}
          currentDelivFeatures={new Set(['lessonPlans'])}
          isDelivGenerating
          onStopDeliverables={onStopDeliverables}
        />,
      );
    });

    const expand = mountedContainer.querySelector('button[aria-expanded="false"]');
    act(() => expand.click());
    const stop = [...mountedContainer.querySelectorAll('button')].find(
      (button) => button.textContent.trim() === 'Stop',
    );
    act(() => stop.click());

    expect(onStopDeliverables).toHaveBeenCalledTimes(1);
    expect(onStopDeliverables).toHaveBeenCalledWith();
  });

  it('uses persisted done status while deliverables are still generating', () => {
    const delivRows = [
      { id: 'lessonPlans', status: 'done' },
      { id: 'quizBank', status: 'pending' },
      { id: 'rubrics', status: 'pending' },
    ];
    const count = getDeliverableDoneCount({
      delivRows,
      delivProgress: { done: 2, total: 3 },
      isDelivGenerating: true,
    });

    expect(count).toBe(1);
  });

  it('does not count transient progress without persisted rows', () => {
    const count = getDeliverableDoneCount({
      delivRows: [],
      delivProgress: { done: 99, total: 3 },
      isDelivGenerating: true,
    });

    expect(count).toBe(0);
  });

  it('falls back to persisted row status after generation', () => {
    const delivRows = [
      { id: 'lessonPlans', status: 'done' },
      { id: 'quizBank', status: 'done' },
      { id: 'rubrics', status: 'pending' },
    ];
    const count = getDeliverableDoneCount({
      delivRows,
      delivProgress: { done: 1, total: 3 },
      isDelivGenerating: false,
    });

    expect(count).toBe(2);
  });

  it('does not count terminal error rows as ready', () => {
    const delivRows = [
      { id: 'lessonPlans', status: 'done' },
      { id: 'quizBank', status: 'error' },
      { id: 'rubrics', status: 'pending' },
    ];
    const count = getDeliverableDoneCount({
      delivRows,
      delivProgress: { done: 1, total: 3 },
      isDelivGenerating: false,
    });

    expect(count).toBe(1);
  });

  it('does not count live terminal progress without persisted done status', () => {
    const count = getDeliverableDoneCount({
      delivRows: [
        { id: 'lessonPlans', status: 'done' },
        { id: 'quizBank', status: 'streaming' },
        { id: 'rubrics', status: 'streaming' },
      ],
      delivProgress: {
        done: 1,
        total: 3,
        perFeature: {
          lessonPlans: { status: 'done' },
          quizBank: { status: 'error' },
          rubrics: { status: 'generating' },
        },
      },
      isDelivGenerating: true,
    });

    expect(count).toBe(1);
  });

  it('keeps rows finalizing until persisted state catches up', () => {
    expect(getProgressDisplayStatus('pending', 'done')).toBe('finalizing');
    expect(getProgressDisplayStatus('error', 'merging')).toBe('error');
    expect(getProgressDisplayStatus('done', 'merging')).toBe('done');
  });

  it('counts stale deliverables as pending sync work', () => {
    expect(
      getPendingSyncWorkCount({
        deliverables: {
          lessonPlans: { status: 'done', stale: true },
          slideDecks: { status: 'done', stale: false },
        },
        pendingSyncCount: 0,
      }),
    ).toBe(1);
  });

  it('does not show ready to download while completed deliverables need sync', () => {
    const label = getProgressPhaseLabel({
      isDone: true,
      hasPendingSyncWork: true,
      everythingDone: false,
      delivDoneCount: 1,
      delivRowCount: 1,
    });

    expect(label).toBe('Sync needed');
  });

  it('routes caveated package completion to a neutral review-notes label', () => {
    const label = getProgressPhaseLabel({
      isDone: true,
      hasPackageQualityWarnings: true,
      everythingDone: false,
      delivDoneCount: 1,
      delivRowCount: 1,
    });

    expect(label).toBe('Ready · review notes');
  });
});
