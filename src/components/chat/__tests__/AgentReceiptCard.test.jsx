/**
 * @vitest-environment happy-dom
 */
import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import AgentReceiptCard, {
  buildAgentReceiptActions,
  buildAgentReceiptSummary,
  getAgentReceiptActionKey,
} from '../AgentReceiptCard';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('AgentReceiptCard', () => {
  it('normalizes a completed local action receipt', () => {
    const summary = buildAgentReceiptSummary({
      title: 'Package receipt',
      mode: 'Auto-fix',
      target: 'Package',
      changed: ['No safe repairs needed'],
      checked: ['Readiness', 'Export files'],
      next: 'Download when ready.',
    });

    expect(summary).toMatchObject({
      title: 'Package receipt',
      badge: 'Ready',
      status: 'done',
      mode: 'Auto-fix',
      target: 'Package',
      changed: ['No safe repairs needed'],
      checked: ['Readiness', 'Export files'],
      next: 'Download when ready.',
    });
  });

  it('renders changed, checked, issues, and next action fields', () => {
    const html = renderToStaticMarkup(
      <AgentReceiptCard
        receipt={{
          title: 'Audit needs review',
          status: 'review',
          badge: 'Review',
          mode: 'Review only',
          target: 'Package',
          changed: 'No content edits',
          checked: ['Readiness', 'Classroom fit'],
          issues: ['Lesson Plans: timing needs review.'],
          next: 'Review the warning before export.',
        }}
      />,
    );

    expect(html).toContain('Audit needs review');
    expect(html).toContain('Review only');
    expect(html).toContain('No content edits');
    expect(html).toContain('Readiness');
    expect(html).toContain('Lesson Plans: timing needs review.');
    expect(html).toContain('Next:');
  });

  it('renders a compact tool trace for model-driven receipts', () => {
    const html = renderToStaticMarkup(
      <AgentReceiptCard
        receipt={{
          title: 'Quality audit complete',
          status: 'done',
          mode: 'Review only',
          target: 'Package',
          runStats: { providerCallCount: 2 },
          changed: ['No workspace edits'],
          checked: ['Validate course materials: 0 errors'],
          toolManifest: [
            {
              tool: 'validate_course',
              label: 'Validate course materials',
              status: 'done',
              summary: '0 errors',
              targets: ['Package'],
            },
            {
              tool: 'inspect_workspace',
              label: 'Inspect workspace',
              status: 'done',
              summary: '3 generated deliverables',
              targets: ['Workspace'],
            },
          ],
        }}
      />,
    );

    expect(html).toContain('data-testid="agent-receipt-tool-trace"');
    expect(html).toContain('Tools used');
    expect(html).toContain('2 model calls');
    expect(html).toContain('Validate course materials');
    expect(html).toContain('Inspect workspace');
    expect(html).toContain('Package');
    expect(html).not.toContain('sk-proj-');
  });

  it('renders explicit zero model-call metadata when a local compiler receipt provides it', () => {
    const html = renderToStaticMarkup(
      <AgentReceiptCard
        receipt={{
          title: 'Blueprint sync receipt',
          status: 'done',
          mode: 'Auto-fix',
          target: 'Lesson Plans',
          runStats: { providerCallCount: 0 },
          changed: ['Updated blueprint: Lesson 4 learning objectives'],
          checked: ['Recompiled: Lesson Plans', 'Model calls: 0'],
        }}
      />,
    );

    expect(html).toContain('0 model calls');
    expect(html).toContain('Model calls: 0');
  });

  it('builds contextual follow-up actions for completed and blocked receipts', () => {
    const doneActions = buildAgentReceiptActions({
      status: 'done',
      target: 'Package',
      checked: ['Readiness'],
    });
    const blockedActions = buildAgentReceiptActions({
      status: 'blocked',
      target: 'Course FAQ',
      issues: ['Course FAQ failed to generate.'],
    });

    expect(doneActions.map((action) => action.id)).toEqual(['plan-next', 'audit-quality']);
    expect(doneActions[0]).toMatchObject({
      label: 'Plan next',
      displayText: 'Plan next step',
      localIntent: 'plan-next',
    });
    expect(doneActions[0].prompt).toContain('Do not apply changes yet');

    expect(blockedActions.map((action) => action.id)).toEqual(['review-issues', 'plan-recovery']);
    expect(blockedActions[0].prompt).toContain('Course FAQ failed to generate.');
    expect(blockedActions[0].prompt).toContain('read-only checks');
  });

  it('builds intent-aware local actions for model tool receipts', () => {
    const planActions = buildAgentReceiptActions({
      status: 'done',
      target: 'Workspace',
      intent: { type: 'workspace_plan' },
    });
    const finishActions = buildAgentReceiptActions({
      status: 'done',
      target: 'Package',
      intent: { type: 'finish_package' },
    });
    const blockedFinishActions = buildAgentReceiptActions({
      status: 'blocked',
      target: 'Package',
      intent: { type: 'finish_package' },
      issues: ['Course FAQ failed to generate.'],
    });

    expect(planActions.map((action) => [action.id, action.localIntent])).toEqual([
      ['audit-quality', 'audit-package'],
      ['finish-package', 'finish-package'],
    ]);
    expect(finishActions.map((action) => [action.id, action.localIntent])).toEqual([
      ['audit-quality', 'audit-package'],
      ['plan-next', 'plan-next'],
    ]);
    expect(blockedFinishActions[0]).toMatchObject({
      id: 'review-issues',
      localIntent: 'audit-package',
    });
  });

  it('renders receipt follow-up action buttons when an action handler is available', () => {
    const html = renderToStaticMarkup(
      <AgentReceiptCard
        receipt={{
          title: 'Package receipt',
          status: 'done',
          target: 'Package',
          checked: ['Readiness'],
        }}
        onAction={() => {}}
      />,
    );

    expect(html).toContain('Plan next');
    expect(html).toContain('Audit quality');
  });

  it('tracks receipt action running and completion state', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const onAction = vi.fn(() => Promise.resolve(true));
    const onActionStateChange = vi.fn();

    try {
      await act(async () => {
        root.render(
          <AgentReceiptCard
            receipt={{
              title: 'Planning receipt',
              status: 'done',
              target: 'Workspace',
              intent: { type: 'workspace_plan' },
              checked: ['Plan next step'],
            }}
            onAction={onAction}
            onActionStateChange={onActionStateChange}
          />,
        );
      });

      const action = buildAgentReceiptActions({
        status: 'done',
        target: 'Workspace',
        intent: { type: 'workspace_plan' },
      })[0];
      const actionKey = getAgentReceiptActionKey(action, 0);
      const button = container.querySelector('[data-testid="agent-receipt-action-audit-quality"]');
      expect(button).not.toBeNull();

      await act(async () => {
        button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      expect(onAction).toHaveBeenCalledWith(expect.objectContaining({ id: 'audit-quality' }));
      expect(onActionStateChange).toHaveBeenCalledWith(
        expect.objectContaining({ [actionKey]: { status: 'running' } }),
        expect.objectContaining({ key: actionKey, state: { status: 'running' } }),
      );
      expect(onActionStateChange).toHaveBeenCalledWith(
        expect.objectContaining({ [actionKey]: { status: 'done' } }),
        expect.objectContaining({ key: actionKey, state: { status: 'done' } }),
      );
      expect(container.querySelector('[data-testid="agent-receipt-action-audit-quality"]')?.textContent).toBe('Done');
      expect(container.querySelector('[data-testid="agent-receipt-action-state-audit-quality"]')?.textContent).toBe(
        'Done',
      );
    } finally {
      act(() => {
        root.unmount();
      });
      container.remove();
    }
  });
});
