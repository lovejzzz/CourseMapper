/**
 * @vitest-environment happy-dom
 */
import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AgentCommandStrip, {
  buildAgentCommandItems,
  filterAgentCommandItems,
  findAgentCommandByText,
} from '../AgentCommandStrip';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('buildAgentCommandItems', () => {
  it('builds mode-aware commands for the active deliverable', () => {
    const autoFixItems = buildAgentCommandItems({ activeTab: 'lessonPlans', agentDryRun: false });
    const reviewOnlyItems = buildAgentCommandItems({ activeTab: 'lessonPlans', agentDryRun: true });

    const autoImprove = autoFixItems.find((item) => item.id === 'improve-active');
    const reviewImprove = reviewOnlyItems.find((item) => item.id === 'improve-active');

    expect(autoImprove.displayText).toBe('Improve Lesson Plans');
    expect(autoImprove.prompt).toContain('Apply safe changes directly');
    expect(reviewImprove.displayText).toBe('Improve Lesson Plans');
    expect(reviewImprove.prompt).toContain('without applying changes');
  });

  it('uses course-map language when no deliverable tab is active', () => {
    const items = buildAgentCommandItems({ activeTab: 'courseMap', agentDryRun: false });
    const improve = items.find((item) => item.id === 'improve-active');

    expect(improve.displayText).toBe('Improve Course Map');
    expect(improve.prompt).toContain('Improve the course map');
  });

  it('grounds the plan command in a workspace inspection tool call', () => {
    const items = buildAgentCommandItems({ activeTab: 'lessonPlans', agentDryRun: true });
    const plan = items.find((item) => item.id === 'plan-next');

    expect(plan.displayText).toBe('Plan next step');
    expect(plan.prompt).toContain('Call inspect_workspace first');
    expect(plan.prompt).toContain('then call plan_workspace_next_step');
    expect(plan.prompt).toContain('Do not apply changes yet');
  });

  it('adds a sync command only when stale downstream deliverables are pending', () => {
    const items = buildAgentCommandItems({ activeTab: 'lessonPlans', syncFeatureCount: 2 });
    const ids = items.map((item) => item.id);
    const sync = items.find((item) => item.id === 'sync-stale');

    expect(ids).toEqual([
      'finish-package',
      'sync-stale',
      'set-review-mode',
      'improve-active',
      'audit-quality',
      'plan-next',
      'agent-help',
    ]);
    expect(sync).toMatchObject({
      label: 'Sync',
      displayText: 'Sync stale deliverables',
      title: 'Update downstream materials affected by recent edits',
    });
    expect(sync.prompt).toContain('Sync 2 stale deliverables');
    expect(sync.prompt).toContain('existing pending sync suggestion');

    expect(
      buildAgentCommandItems({ activeTab: 'lessonPlans', syncFeatureCount: 0 }).map((item) => item.id),
    ).not.toContain('sync-stale');
    expect(
      buildAgentCommandItems({ activeTab: 'lessonPlans', syncFeatureCount: 2, agentDryRun: true }).map(
        (item) => item.id,
      ),
    ).not.toContain('sync-stale');
  });

  it('adds the opposite mode switch for the current Agent mode', () => {
    const autoFixItems = buildAgentCommandItems({ activeTab: 'lessonPlans', agentDryRun: false });
    const reviewOnlyItems = buildAgentCommandItems({ activeTab: 'lessonPlans', agentDryRun: true });

    expect(autoFixItems.find((item) => item.id === 'set-review-mode')).toMatchObject({
      label: 'Review only',
      displayText: 'Switch to Review only',
      modeSwitch: 'review-only',
    });
    expect(reviewOnlyItems.find((item) => item.id === 'set-auto-fix-mode')).toMatchObject({
      label: 'Auto-fix',
      displayText: 'Switch to Auto-fix',
      modeSwitch: 'auto-fix',
    });
  });

  it('adds an undo command only when undo is available', () => {
    const withoutUndo = buildAgentCommandItems({ activeTab: 'lessonPlans', canUndo: false });
    const withUndo = buildAgentCommandItems({ activeTab: 'lessonPlans', canUndo: true });
    const undo = withUndo.find((item) => item.id === 'undo-last');

    expect(withoutUndo.map((item) => item.id)).not.toContain('undo-last');
    expect(withUndo.map((item) => item.id)).toContain('undo-last');
    expect(undo).toMatchObject({
      label: 'Undo',
      displayText: 'Undo last change',
      title: 'Restore the previous deliverable state',
    });
    expect(undo.prompt).toContain('undo_last');
  });

  it('always exposes local Agent help', () => {
    const providerReadyItems = buildAgentCommandItems({ activeTab: 'lessonPlans' });
    const localOnlyItems = buildAgentCommandItems({ activeTab: 'lessonPlans', localOnly: true });

    expect(providerReadyItems.find((item) => item.id === 'agent-help')).toMatchObject({
      label: 'Help',
      displayText: 'Show agent help',
      title: 'See what the Agent can do in this workspace',
    });
    expect(localOnlyItems.map((item) => item.id)).toContain('agent-help');
  });

  it('matches slash command aliases users naturally type', () => {
    const items = buildAgentCommandItems({ activeTab: 'lessonPlans', canUndo: true });

    expect(filterAgentCommandItems(items, 'fix').map((item) => item.id)).toContain('finish-package');
    expect(filterAgentCommandItems(items, 'check').map((item) => item.id)).toContain('audit-quality');
    expect(filterAgentCommandItems(items, 'next').map((item) => item.id)).toContain('plan-next');
    expect(filterAgentCommandItems(items, 'revert').map((item) => item.id)).toContain('undo-last');
    expect(filterAgentCommandItems(items, 'commands').map((item) => item.id)).toContain('agent-help');
    expect(filterAgentCommandItems(items, 'read only').map((item) => item.id)).toContain('set-review-mode');
  });

  it('routes high-confidence typed phrases without hijacking ordinary questions', () => {
    const items = buildAgentCommandItems({ activeTab: 'lessonPlans', canUndo: true });
    const reviewItems = buildAgentCommandItems({ activeTab: 'lessonPlans', agentDryRun: true });

    expect(findAgentCommandByText(items, 'plan next')?.id).toBe('plan-next');
    expect(findAgentCommandByText(items, 'what should we do next?')?.id).toBe('plan-next');
    expect(findAgentCommandByText(items, 'can you help me plan the next step?')?.id).toBe('plan-next');
    expect(findAgentCommandByText(items, 'audit quality')?.id).toBe('audit-quality');
    expect(findAgentCommandByText(items, 'can you audit this package?')?.id).toBe('audit-quality');
    expect(findAgentCommandByText(items, 'please check my course for issues')?.id).toBe('audit-quality');
    expect(findAgentCommandByText(items, 'fix package')?.id).toBe('finish-package');
    expect(findAgentCommandByText(items, 'please finish this package')?.id).toBe('finish-package');
    expect(findAgentCommandByText(items, 'revert last change')?.id).toBe('undo-last');
    expect(findAgentCommandByText(items, 'can you undo that last change?')?.id).toBe('undo-last');
    expect(findAgentCommandByText(items, 'review only')?.id).toBe('set-review-mode');
    expect(findAgentCommandByText(items, 'switch me to review only')?.id).toBe('set-review-mode');
    expect(findAgentCommandByText(reviewItems, 'auto fix')?.id).toBe('set-auto-fix-mode');
    expect(findAgentCommandByText(reviewItems, 'go back to auto fix')?.id).toBe('set-auto-fix-mode');
    expect(findAgentCommandByText(items, 'show me agent commands')?.id).toBe('agent-help');
    expect(findAgentCommandByText(items, 'can you explain what an audit checks?')).toBeNull();
    expect(findAgentCommandByText(items, 'please improve the assignment language after reading this note')).toBeNull();
  });
});

describe('AgentCommandStrip', () => {
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
  });

  it('routes quick commands through onCommand', () => {
    const onCommand = vi.fn();

    act(() => {
      root.render(<AgentCommandStrip activeTab="slideDecks" onCommand={onCommand} />);
    });

    const improveButton = container.querySelector('[data-testid="agent-command-improve-active"]');
    act(() => {
      improveButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onCommand).toHaveBeenCalledTimes(1);
    expect(onCommand.mock.calls[0][0]).toMatchObject({
      id: 'improve-active',
      displayText: 'Improve Slide Decks',
    });
  });

  it('wraps quick commands instead of clipping them horizontally', () => {
    act(() => {
      root.render(<AgentCommandStrip activeTab="slideDecks" onCommand={vi.fn()} />);
    });

    const actionRow = container.querySelector('[data-testid="agent-command-strip-actions"]');
    expect(actionRow.className).toContain('flex-wrap');
    expect(actionRow.className).not.toContain('overflow-x-auto');

    const improveButton = container.querySelector('[data-testid="agent-command-improve-active"]');
    expect(improveButton.className).toContain('max-w-full');
  });

  it('routes mode switch commands through onCommand', () => {
    const onCommand = vi.fn();

    act(() => {
      root.render(<AgentCommandStrip activeTab="lessonPlans" onCommand={onCommand} />);
    });

    const reviewModeButton = container.querySelector('[data-testid="agent-command-set-review-mode"]');
    expect(reviewModeButton).not.toBeNull();
    expect(reviewModeButton.textContent).toContain('Review only');

    act(() => {
      reviewModeButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'set-review-mode',
        modeSwitch: 'review-only',
      }),
    );
  });

  it('disables command buttons while the agent is busy', () => {
    const onCommand = vi.fn();

    act(() => {
      root.render(<AgentCommandStrip activeTab="quizBank" disabled onCommand={onCommand} />);
    });

    const finishButton = container.querySelector('[data-testid="agent-command-finish-package"]');
    expect(finishButton.disabled).toBe(true);

    act(() => {
      finishButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onCommand).not.toHaveBeenCalled();
  });

  it('routes the context-sensitive sync command through onCommand', () => {
    const onCommand = vi.fn();

    act(() => {
      root.render(<AgentCommandStrip activeTab="lessonPlans" syncFeatureCount={1} onCommand={onCommand} />);
    });

    const syncButton = container.querySelector('[data-testid="agent-command-sync-stale"]');
    act(() => {
      syncButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'sync-stale',
        displayText: 'Sync stale deliverables',
        prompt: expect.stringContaining('Sync 1 stale deliverable'),
      }),
    );
  });

  it('routes undo through onCommand when undo is available', () => {
    const onCommand = vi.fn();

    act(() => {
      root.render(<AgentCommandStrip activeTab="lessonPlans" canUndo onCommand={onCommand} />);
    });

    const undoButton = container.querySelector('[data-testid="agent-command-undo-last"]');
    expect(undoButton).not.toBeNull();
    act(() => {
      undoButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'undo-last',
        displayText: 'Undo last change',
      }),
    );
  });

  it('keeps local commands available when the provider is not configured', () => {
    const onCommand = vi.fn();
    const onConfigureAI = vi.fn();

    act(() => {
      root.render(
        <AgentCommandStrip
          activeTab="lessonPlans"
          syncFeatureCount={1}
          canUndo
          isAgentProviderReady={false}
          onCommand={onCommand}
          onConfigureAI={onConfigureAI}
        />,
      );
    });

    expect(container.querySelector('[data-testid="agent-command-undo-last"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="agent-command-sync-stale"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="agent-command-audit-quality"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="agent-command-plan-next"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="agent-command-agent-help"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="agent-command-improve-active"]')).toBeNull();
    expect(container.querySelector('[data-testid="agent-command-finish-package"]')).toBeNull();

    act(() => {
      container
        .querySelector('[data-testid="agent-command-audit-quality"]')
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onCommand).toHaveBeenCalledWith(expect.objectContaining({ id: 'audit-quality' }));

    act(() => {
      container
        .querySelector('[data-testid="agent-command-configure-agent"]')
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onConfigureAI).toHaveBeenCalledTimes(1);
  });
});
