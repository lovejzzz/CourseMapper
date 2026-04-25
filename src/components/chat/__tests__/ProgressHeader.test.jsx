import { describe, it, expect } from 'vitest';
import { getDeliverableDoneCount, getProgressDisplayStatus } from '../ProgressHeader';

describe('ProgressHeader progress helpers', () => {
  it('uses live progress counts while deliverables are still generating', () => {
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

    expect(count).toBe(2);
  });

  it('caps live progress counts at the declared total', () => {
    const count = getDeliverableDoneCount({
      delivRows: [],
      delivProgress: { done: 99, total: 3 },
      isDelivGenerating: true,
    });

    expect(count).toBe(3);
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

  it('shows a row as done when per-feature progress completes before state catches up', () => {
    expect(getProgressDisplayStatus('pending', 'done')).toBe('done');
    expect(getProgressDisplayStatus('error', 'merging')).toBe('error');
  });
});
