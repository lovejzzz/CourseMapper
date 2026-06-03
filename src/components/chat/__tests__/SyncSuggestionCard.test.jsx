/**
 * @vitest-environment happy-dom
 */
import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SyncSuggestionCard from '../SyncSuggestionCard';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function renderCard(container, props = {}) {
  const root = createRoot(container);
  act(() => {
    root.render(<SyncSuggestionCard {...props} />);
  });
  return root;
}

function buttonByText(container, text) {
  return [...container.querySelectorAll('button')].find((button) => button.textContent.trim() === text);
}

describe('SyncSuggestionCard', () => {
  let container;
  let root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root.unmount();
      });
    }
    container.remove();
  });

  it('shows explicit local-vs-blueprint choices for canonical artifact sync', async () => {
    const sourcePlan = {
      featureId: 'lessonPlans',
      lessonIndices: [3],
      canonicalPatches: [{ lessonIndex: 3, field: 'learningObjectives', label: 'learning objectives' }],
    };
    const relatedPlan = { featureId: 'slideDecks', lessonIndices: [3], canonicalPatches: sourcePlan.canonicalPatches };
    const onApprove = vi.fn();
    const onSkip = vi.fn();

    root = renderCard(container, {
      suggestion: {
        id: 'sync-1',
        status: 'pending',
        editSource: 'artifactBlueprint',
        editSummary: {
          fields: ['learning objectives'],
          lessonIndices: [3],
          sourceFeatureId: 'lessonPlans',
        },
        plan: [sourcePlan, relatedPlan],
      },
      onApprove,
      onSkip,
    });

    expect(container.textContent).toContain('Keep this edit only here, or sync it through the course blueprint?');
    expect(buttonByText(container, 'Keep local')).not.toBeNull();
    expect(buttonByText(container, 'Sync this lesson')).not.toBeNull();
    expect(buttonByText(container, 'Sync related materials')).not.toBeNull();

    await act(async () => {
      buttonByText(container, 'Sync this lesson').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onApprove).toHaveBeenLastCalledWith('sync-1', [sourcePlan]);

    await act(async () => {
      buttonByText(container, 'Sync related materials').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onApprove).toHaveBeenLastCalledWith('sync-1', [sourcePlan, relatedPlan]);

    await act(async () => {
      buttonByText(container, 'Keep local').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onSkip).toHaveBeenCalledWith('sync-1');
  });

  it('shows the same blueprint choices for model-fallback patch requests', () => {
    const patchRequest = {
      sourceFeatureId: 'lessonPlans',
      lessonIndex: 3,
      editPath: ['lessonPlans', 3, 'customInstruction'],
      label: 'course-design edit',
    };

    root = renderCard(container, {
      suggestion: {
        id: 'sync-request-1',
        status: 'pending',
        editSource: 'artifactBlueprint',
        editSummary: {
          fields: ['course-design edit'],
          lessonIndices: [3],
          sourceFeatureId: 'lessonPlans',
        },
        plan: [
          {
            featureId: 'lessonPlans',
            lessonIndices: [3],
            canonicalPatchRequests: [patchRequest],
          },
        ],
      },
      onApprove: vi.fn(),
      onSkip: vi.fn(),
    });

    expect(container.textContent).toContain('Keep this edit only here, or sync it through the course blueprint?');
    expect(buttonByText(container, 'Keep local')).not.toBeNull();
    expect(buttonByText(container, 'Sync this lesson')).not.toBeNull();
    expect(buttonByText(container, 'Sync related materials')).not.toBeNull();
  });
});
