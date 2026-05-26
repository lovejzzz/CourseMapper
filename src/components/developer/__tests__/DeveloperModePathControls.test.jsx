/**
 * @vitest-environment happy-dom
 */
import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DeveloperDiagnosticsPanel from '../DeveloperDiagnosticsPanel';
import DeveloperModeSidebar from '../DeveloperModeSidebar';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('Developer Mode path controls', () => {
  let container;
  let root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.clearAllMocks();
  });

  function render(node) {
    act(() => {
      root.render(node);
    });
  }

  function click(selector) {
    const element = container.querySelector(selector);
    expect(element).not.toBeNull();
    act(() => {
      element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
  }

  function typeInto(selector, value) {
    const element = container.querySelector(selector);
    expect(element).not.toBeNull();
    const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    act(() => {
      valueSetter.call(element, value);
      element.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
    });
  }

  it('copies health-check diagnostic JSON paths without jumping the editor', () => {
    const onDiagnosticPathCopy = vi.fn();
    const onDiagnosticPathClick = vi.fn();

    render(
      <DeveloperDiagnosticsPanel
        snapshot={{
          courseMap: { lessons: [] },
          selectedFeatures: [],
          columns: [],
          deliverables: {},
          provider: 'openai',
          modelId: 'gpt-4o-mini',
        }}
        dirtySections={new Set()}
        onDiagnosticPathClick={onDiagnosticPathClick}
        onDiagnosticPathCopy={onDiagnosticPathCopy}
      />,
    );

    click('[data-testid="developer-diagnostic-copy-path"][data-path="courseMap.lessons"]');

    expect(onDiagnosticPathCopy).toHaveBeenCalledWith('courseMap.lessons');
    expect(onDiagnosticPathClick).not.toHaveBeenCalled();
  });

  it('copies runtime risk JSON paths', () => {
    const onDiagnosticPathCopy = vi.fn();

    render(
      <DeveloperDiagnosticsPanel
        snapshot={{
          courseMap: { lessons: [{ title: 'Week 1', sections: [{ learningGoals: 'Goals' }] }] },
          selectedFeatures: ['courseMap'],
          columns: [{ key: 'learningGoals', label: 'Learning Goals', enabled: true }],
          deliverables: {},
        }}
        dirtySections={new Set()}
        onDiagnosticPathCopy={onDiagnosticPathCopy}
      />,
    );

    click('[data-testid="developer-runtime-risk-copy-path"][data-path="provider"]');

    expect(onDiagnosticPathCopy).toHaveBeenCalledWith('provider');
  });

  it('copies validation finding JSON paths from the sidebar', () => {
    const onFindingPathCopy = vi.fn();
    const onFindingClick = vi.fn();

    render(
      <DeveloperModeSidebar
        isEditorSection
        query=""
        onQueryChange={vi.fn()}
        onFindNext={vi.fn()}
        matchCount={0}
        activeValidation={{
          ok: false,
          message: 'columns[0].key: Column key is required.',
          findings: [
            {
              level: 'error',
              path: 'columns[0].key',
              message: 'Column key is required.',
            },
          ],
        }}
        onFindingClick={onFindingClick}
        onFindingPathCopy={onFindingPathCopy}
      />,
    );

    click('[data-testid="developer-validation-copy-path"][data-path="columns[0].key"]');

    expect(onFindingPathCopy).toHaveBeenCalledWith(
      expect.objectContaining({
        path: 'columns[0].key',
        message: 'Column key is required.',
      }),
    );
    expect(onFindingClick).not.toHaveBeenCalled();
  });

  it('filters developer history by saved section and change path', () => {
    render(
      <DeveloperModeSidebar
        isEditorSection={false}
        activeValidation={{ ok: true, message: 'Current section is valid.', findings: [] }}
        checkpointName="Pre-release audit"
        onCheckpointNameChange={vi.fn()}
        canNameCheckpoint
        developerHistory={[
          {
            id: 'course-save',
            label: 'Course outline checkpoint',
            createdAt: 100,
            dirtySections: ['courseMap'],
            changes: [
              {
                type: 'changed',
                path: 'courseMap.lessons[0].title',
                beforeSummary: 'Week 1',
                afterSummary: 'Orientation',
              },
            ],
            patches: [],
            restorable: true,
          },
          {
            id: 'prompt-save',
            label: 'Quiz prompt checkpoint',
            createdAt: 200,
            dirtySections: ['config'],
            changes: [
              {
                type: 'added',
                path: 'deliverableConfig.quizBank.customUserPrompt',
                afterSummary: 'Prompt override',
              },
            ],
            patches: [],
            restorable: true,
          },
        ]}
      />,
    );

    expect(container.querySelectorAll('[data-testid="developer-history-entry"]')).toHaveLength(2);
    expect(container.querySelector('[data-testid="developer-checkpoint-name"]').value).toBe('Pre-release audit');
    expect(container.textContent).toContain('Course outline checkpoint');
    expect(container.textContent).toContain('Quiz prompt checkpoint');

    typeInto('[data-testid="developer-history-search"]', 'quizBank');

    expect(container.querySelectorAll('[data-testid="developer-history-entry"]')).toHaveLength(1);
    expect(container.textContent).toContain('deliverableConfig.quizBank.customUserPrompt');
    expect(container.textContent).not.toContain('courseMap.lessons[0].title');

    typeInto('[data-testid="developer-history-search"]', 'not-a-saved-path');

    expect(container.querySelectorAll('[data-testid="developer-history-entry"]')).toHaveLength(0);
    expect(container.querySelector('[data-testid="developer-history-empty-search"]')).not.toBeNull();
  });

  it('captures the next checkpoint name from the sidebar', () => {
    const onCheckpointNameChange = vi.fn();

    render(
      <DeveloperModeSidebar
        isEditorSection={false}
        activeValidation={{ ok: true, message: 'Current section is valid.', findings: [] }}
        checkpointName=""
        onCheckpointNameChange={onCheckpointNameChange}
        canNameCheckpoint
      />,
    );

    typeInto('[data-testid="developer-checkpoint-name"]', 'Before QA pass');

    expect(onCheckpointNameChange).toHaveBeenCalledWith('Before QA pass');
  });

  it('shows classified API failures in the developer budget card', () => {
    render(
      <DeveloperModeSidebar
        isEditorSection={false}
        activeValidation={{ ok: true, message: 'Current section is valid.', findings: [] }}
        apiCallBudget={{
          runId: 'run-test',
          deliverableChunkCalls: 12,
          providerFallbackCalls: 1,
          failedCalls: 2,
          failureClasses: { provider_unavailable: 1, model_unsupported: 1 },
          costPlan: {
            plannedCalls: 12,
            softCallLimit: 15,
            hardCallLimit: 18,
            cumulative: true,
          },
          costControl: {
            status: 'failure_spike',
            reason: 'Too many provider calls are failing.',
            shouldStopRetries: true,
            totalProviderCalls: 15,
            plannedCalls: 12,
            softCallLimit: 15,
            hardCallLimit: 18,
            remainingBeforeHardLimit: 3,
          },
          recentEvents: [
            {
              type: 'failedCall',
              label: 'Provider API error',
              at: Date.now(),
              failureClass: 'provider_unavailable',
              statusCode: 503,
              retryable: true,
              userMessage: 'The provider service is temporarily unavailable.',
              provider: 'openai',
              modelId: 'gpt-test',
            },
          ],
        }}
      />,
    );

    expect(container.querySelector('[data-testid="developer-api-cost-control"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="developer-api-failure-breakdown"]')).not.toBeNull();
    expect(container.querySelectorAll('[data-testid="developer-api-failure-class"]')).toHaveLength(2);
    expect(container.textContent).toContain('Failure Spike');
    expect(container.textContent).toContain('Too many provider calls are failing.');
    expect(container.textContent).toContain('Provider Unavailable 1');
    expect(container.textContent).toContain('Model Unsupported 1');
    expect(container.textContent).toContain('503');
    expect(container.textContent).toContain('retryable');
  });

  it('shows per-feature spend and compiler receipts in the developer budget card', () => {
    render(
      <DeveloperModeSidebar
        isEditorSection={false}
        activeValidation={{ ok: true, message: 'Current section is valid.', findings: [] }}
        apiCallBudget={{
          runId: 'run-test',
          deliverableChunkCalls: 1,
          tokenUsage: {
            inputTokens: 2000,
            outputTokens: 1000,
            totalTokens: 3000,
            costUsd: 0.0024,
            costKnownCallCount: 1,
          },
          featureUsage: {
            slideDecks: {
              inputTokens: 2000,
              outputTokens: 1000,
              totalTokens: 3000,
              costUsd: 0.0024,
              costKnownCallCount: 1,
            },
          },
          compilerSavings: {
            source: 'blueprint',
            featureIds: ['syllabus', 'rubrics'],
            compiledFeatureCount: 2,
            savedProviderCalls: 2,
          },
          costPlan: { plannedCalls: 4, softCallLimit: 6, hardCallLimit: 8, cumulative: true },
          costControl: { status: 'ok', totalProviderCalls: 1, plannedCalls: 4, hardCallLimit: 8 },
          recentEvents: [
            {
              type: 'compiledDeliverable',
              label: 'Blueprint compiler',
              at: Date.now(),
              compiledFeatureCount: 2,
              savedProviderCalls: 2,
            },
          ],
        }}
      />,
    );

    expect(container.querySelector('[data-testid="developer-feature-spend"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="developer-compiler-receipt"]')).not.toBeNull();
    expect(container.textContent).toContain('Spend by feature');
    expect(container.textContent).toContain('Slide Decks');
    expect(container.textContent).toContain('2 compiled');
    expect(container.textContent).toContain('calls saved');
  });

  it('jumps from pending diff entries to their JSON paths', () => {
    const onChangeClick = vi.fn();
    const change = {
      type: 'changed',
      path: 'courseMap.lessons[0].title',
      beforeSummary: 'Week 1',
      afterSummary: 'Orientation',
    };

    render(
      <DeveloperModeSidebar
        isEditorSection={false}
        activeValidation={{ ok: true, message: 'Current section is valid.', findings: [] }}
        changes={[change]}
        onChangeClick={onChangeClick}
      />,
    );

    click('[data-testid="developer-change-path"][data-path="courseMap.lessons[0].title"]');

    expect(onChangeClick).toHaveBeenCalledWith(change);
  });

  it('shows destructive delete preview and requires explicit review', () => {
    const onChangeClick = vi.fn();
    const onDestructiveDeletesReviewedChange = vi.fn();
    const destructiveChanges = [
      {
        type: 'removed',
        path: 'deliverables.lessonPlans',
        beforeSummary: 'Object(3)',
        afterSummary: 'missing',
      },
      {
        type: 'changed',
        path: 'selectedFeatures.length',
        beforeSummary: '3',
        afterSummary: '2',
      },
    ];

    render(
      <DeveloperModeSidebar
        isEditorSection={false}
        activeValidation={{ ok: true, message: 'Current section is valid.', findings: [] }}
        changes={destructiveChanges}
        destructiveChanges={destructiveChanges}
        destructiveDeletesReviewed={false}
        onDestructiveDeletesReviewedChange={onDestructiveDeletesReviewedChange}
        onChangeClick={onChangeClick}
      />,
    );

    expect(container.querySelector('[data-testid="developer-destructive-delete-preview"]')).not.toBeNull();
    expect(container.textContent).toContain('Destructive Deletes');
    expect(container.textContent).toContain('These staged edits remove workspace data');

    click('[data-testid="developer-destructive-delete-path"][data-path="deliverables.lessonPlans"]');
    expect(onChangeClick).toHaveBeenCalledWith(destructiveChanges[0]);

    click('[data-testid="developer-destructive-delete-review"]');
    expect(onDestructiveDeletesReviewedChange).toHaveBeenCalledWith(true);
  });
});
