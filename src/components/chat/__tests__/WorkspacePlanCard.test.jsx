/**
 * @vitest-environment happy-dom
 */
import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import WorkspacePlanCard, {
  buildWorkspacePlanActionDisplayText,
  buildWorkspacePlanActionPrompt,
  buildWorkspacePlanActionSendOptions,
  getWorkspacePlanActionKey,
  getWorkspacePlanActionButtonLabel,
} from '../WorkspacePlanCard';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const samplePlan = {
  executionMode: 'safe-edit',
  course: { lessonCount: 8 },
  evidence: {
    generatedFeatureCount: 4,
    staleFeatureCount: 1,
    failedFeatureCount: 1,
    packageBlockerCount: 0,
    classroomBlockerCount: 0,
  },
  highestImpactAction: {
    priority: 'P0',
    title: 'Resolve failed generation for Rubrics',
    reason: 'Rubrics failed, so the package cannot be trusted.',
    target: 'Rubrics',
    suggestedCommand: 'Regenerate Rubrics',
    safeMode: 'requires-generation',
    toolHint: 'Regenerate the failed feature.',
  },
  actions: [
    {
      priority: 'P0',
      title: 'Resolve failed generation for Rubrics',
      reason: 'Rubrics failed, so the package cannot be trusted.',
      target: 'Rubrics',
      suggestedCommand: 'Regenerate Rubrics',
      safeMode: 'requires-generation',
      toolHint: 'Regenerate the failed feature.',
      intent: { type: 'regenerate_failed_feature', featureIds: ['rubrics'] },
    },
    {
      priority: 'P1',
      title: 'Sync stale deliverables: Quiz & Exam Bank',
      reason: 'Quiz questions no longer match the latest course-map edit.',
      target: 'Quiz & Exam Bank',
      suggestedCommand: 'Open sync suggestion',
      safeMode: 'needs-approval',
      intent: { type: 'sync_stale_deliverables', featureIds: ['quizBank'] },
    },
  ],
};

describe('WorkspacePlanCard', () => {
  it('renders a compact prioritized plan with evidence', () => {
    const html = renderToStaticMarkup(<WorkspacePlanCard plan={samplePlan} />);

    expect(html).toContain('Workspace plan');
    expect(html).toContain('Can apply safe fixes');
    expect(html).toContain('Resolve failed generation for Rubrics');
    expect(html).toContain('Sync stale deliverables');
    expect(html).toContain('8 lessons');
    expect(html).toContain('4 generated');
    expect(html).toContain('1 stale');
    expect(html).toContain('1 failed');
  });

  it('builds a follow-up prompt from a selected plan action', () => {
    const prompt = buildWorkspacePlanActionPrompt(samplePlan.actions[1]);

    expect(prompt).toContain('Act on this workspace plan item: Sync stale deliverables');
    expect(prompt).toContain('Intent: sync_stale_deliverables');
    expect(prompt).toContain('Review the stale downstream materials');
    expect(prompt).toContain('Target: Quiz & Exam Bank');
    expect(prompt).toContain('Suggested command: Open sync suggestion');
    expect(prompt).toContain('Do not apply changes until the user approves');
  });

  it('keeps visible follow-up text short while preserving private agent instructions', () => {
    const action = samplePlan.actions[1];
    const displayText = buildWorkspacePlanActionDisplayText(action);
    const options = buildWorkspacePlanActionSendOptions(action);

    expect(getWorkspacePlanActionButtonLabel(action)).toBe('Review sync');
    expect(displayText).toBe('Review sync: Sync stale deliverables: Quiz & Exam Bank');
    expect(options).toMatchObject({
      displayText,
      dryRunOverride: true,
      forceApplyMode: false,
    });
    expect(options.agentPromptOverride).toContain('Act on this workspace plan item');
    expect(options.agentPromptOverride.length).toBeGreaterThan(displayText.length);
  });

  it('labels sync actions as direct only when the pending sync capability matches the feature', () => {
    const action = samplePlan.actions[1];
    const capabilities = { sync_stale_deliverables: { featureIds: ['quizBank'] } };
    const unrelatedCapabilities = { sync_stale_deliverables: { featureIds: ['rubrics'] } };

    expect(getWorkspacePlanActionButtonLabel(action, capabilities)).toBe('Sync');
    expect(buildWorkspacePlanActionDisplayText(action, capabilities)).toBe(
      'Sync: Sync stale deliverables: Quiz & Exam Bank',
    );
    expect(buildWorkspacePlanActionSendOptions(action, capabilities)).toMatchObject({
      displayText: 'Sync: Sync stale deliverables: Quiz & Exam Bank',
      dryRunOverride: false,
      forceApplyMode: false,
    });
    expect(getWorkspacePlanActionButtonLabel(action, unrelatedCapabilities)).toBe('Review sync');
  });

  it('allows safe-edit plan actions to request apply mode', () => {
    const options = buildWorkspacePlanActionSendOptions({
      title: 'Repair missing slide alt text',
      safeMode: 'safe-edit',
      intent: { type: 'clear_readiness_blockers', featureIds: ['slideDecks'] },
    });

    expect(getWorkspacePlanActionButtonLabel({ intent: { type: 'clear_readiness_blockers' } })).toBe('Fix');
    expect(options.displayText).toBe('Fix: Repair missing slide alt text');
    expect(options.dryRunOverride).toBe(false);
    expect(options.forceApplyMode).toBe(true);
    expect(options.agentPromptOverride).toContain('Intent: clear_readiness_blockers');
    expect(options.agentPromptOverride).toContain('apply the fix directly');
  });

  it('labels generation actions as direct only when generation capability is available', () => {
    const regenerateAction = samplePlan.actions[0];
    const missingAction = {
      title: 'Generate missing selected deliverables: Study Guides',
      safeMode: 'requires-generation',
      intent: { type: 'generate_missing_feature', featureIds: ['studyGuides'] },
    };

    expect(getWorkspacePlanActionButtonLabel(regenerateAction)).toBe('Plan generate');
    expect(getWorkspacePlanActionButtonLabel(regenerateAction, { regenerate_failed_feature: true })).toBe('Regenerate');
    expect(buildWorkspacePlanActionSendOptions(regenerateAction, { regenerate_failed_feature: true })).toMatchObject({
      displayText: 'Regenerate: Resolve failed generation for Rubrics',
      dryRunOverride: false,
    });
    expect(getWorkspacePlanActionButtonLabel(missingAction)).toBe('Plan generate');
    expect(getWorkspacePlanActionButtonLabel(missingAction, { generate_missing_feature: true })).toBe('Generate');
    expect(buildWorkspacePlanActionDisplayText(missingAction, { generate_missing_feature: true })).toBe(
      'Generate: Generate missing selected deliverables: Study Guides',
    );
  });

  it('marks a directly handled plan action as done after the click', async () => {
    const container = document.createElement('div');
    const root = createRoot(container);
    const onAction = vi.fn(() => Promise.resolve({ status: 'done' }));
    const onActionStateChange = vi.fn();

    await act(async () => {
      root.render(
        <WorkspacePlanCard
          plan={samplePlan}
          actionCapabilities={{ regenerate_failed_feature: true }}
          onAction={onAction}
          onActionStateChange={onActionStateChange}
        />,
      );
    });

    const button = container.querySelector('[data-testid="workspace-plan-action-regenerate_failed_feature"]');
    expect(button).not.toBeNull();

    await act(async () => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onAction).toHaveBeenCalledWith(samplePlan.actions[0]);
    expect(onActionStateChange).toHaveBeenCalledWith(
      expect.objectContaining({
        [getWorkspacePlanActionKey(samplePlan.actions[0], 0)]: { status: 'running' },
      }),
      expect.objectContaining({
        key: getWorkspacePlanActionKey(samplePlan.actions[0], 0),
        state: { status: 'running' },
      }),
    );
    expect(onActionStateChange).toHaveBeenCalledWith(
      expect.objectContaining({
        [getWorkspacePlanActionKey(samplePlan.actions[0], 0)]: { status: 'done' },
      }),
      expect.objectContaining({ key: getWorkspacePlanActionKey(samplePlan.actions[0], 0), state: { status: 'done' } }),
    );
    expect(
      container.querySelector('[data-testid="workspace-plan-action-state-regenerate_failed_feature"]').textContent,
    ).toBe('Done');
    expect(button.textContent).toBe('Done');
    expect(button.disabled).toBe(true);

    await act(async () => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onAction).toHaveBeenCalledTimes(1);

    await act(async () => root.unmount());
  });

  it('hydrates persisted action states from the saved plan message', async () => {
    const container = document.createElement('div');
    const root = createRoot(container);
    const actionKey = getWorkspacePlanActionKey(samplePlan.actions[1], 1);
    const onAction = vi.fn();

    await act(async () => {
      root.render(
        <WorkspacePlanCard
          plan={samplePlan}
          actionStates={{
            [actionKey]: { status: 'sent' },
          }}
          onAction={onAction}
        />,
      );
    });

    expect(
      container.querySelector('[data-testid="workspace-plan-action-state-sync_stale_deliverables"]').textContent,
    ).toBe('Sent to Agent');
    const button = container.querySelector('[data-testid="workspace-plan-action-sync_stale_deliverables"]');
    expect(button.textContent).toBe('Sent');
    expect(button.disabled).toBe(true);

    await act(async () => root.unmount());
  });

  it('marks a fallback plan action as sent to the Agent', async () => {
    const container = document.createElement('div');
    const root = createRoot(container);
    const onAction = vi.fn(() => Promise.resolve({ status: 'sent' }));

    await act(async () => {
      root.render(<WorkspacePlanCard plan={samplePlan} onAction={onAction} />);
    });

    const button = container.querySelector('[data-testid="workspace-plan-action-sync_stale_deliverables"]');
    expect(button).not.toBeNull();

    await act(async () => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onAction).toHaveBeenCalledWith(samplePlan.actions[1]);
    expect(
      container.querySelector('[data-testid="workspace-plan-action-state-sync_stale_deliverables"]').textContent,
    ).toBe('Sent to Agent');
    expect(button.textContent).toBe('Sent');
    expect(button.disabled).toBe(true);

    await act(async () => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onAction).toHaveBeenCalledTimes(1);

    await act(async () => root.unmount());
  });

  it('keeps failed plan actions retryable', async () => {
    const container = document.createElement('div');
    const root = createRoot(container);
    const actionKey = getWorkspacePlanActionKey(samplePlan.actions[0], 0);
    const onAction = vi.fn(() => Promise.resolve({ status: 'done' }));

    await act(async () => {
      root.render(
        <WorkspacePlanCard
          plan={samplePlan}
          actionCapabilities={{ regenerate_failed_feature: true }}
          actionStates={{
            [actionKey]: { status: 'error', message: 'Regeneration failed' },
          }}
          onAction={onAction}
        />,
      );
    });

    const button = container.querySelector('[data-testid="workspace-plan-action-regenerate_failed_feature"]');
    expect(button.textContent).toBe('Retry');
    expect(button.disabled).toBe(false);

    await act(async () => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onAction).toHaveBeenCalledWith(samplePlan.actions[0]);
    expect(
      container.querySelector('[data-testid="workspace-plan-action-state-regenerate_failed_feature"]').textContent,
    ).toBe('Done');

    await act(async () => root.unmount());
  });
});
