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
      planning: { required: true, status: 'planned', label: 'Planned before execution via Inspect workspace' },
      verification: { required: true, status: 'verified', label: 'Verified after mutation via Validate course' },
      next: 'Download anytime.',
    });

    expect(summary).toMatchObject({
      title: 'Package receipt',
      badge: 'Ready',
      status: 'done',
      mode: 'Auto-fix',
      target: 'Package',
      changed: ['No safe repairs needed'],
      checked: ['Readiness', 'Export files'],
      planning: expect.objectContaining({
        status: 'planned',
        label: 'Planned before execution via Inspect workspace',
      }),
      verification: expect.objectContaining({
        status: 'verified',
        label: 'Verified after mutation via Validate course',
      }),
      next: 'Download anytime.',
    });
  });

  it('renders changed, checked, issues, and next action fields', () => {
    const html = renderToStaticMarkup(
      <AgentReceiptCard
        receipt={{
          title: 'Audit needs review',
          status: 'review',
          badge: 'Review',
          mode: 'No workspace edits',
          target: 'Package',
          changed: 'No content edits',
          checked: ['Readiness', 'Classroom fit'],
          issues: ['Lesson Plans: timing needs review.'],
          next: 'Review the warning before export.',
        }}
      />,
    );

    expect(html).toContain('Audit needs review');
    expect(html).toContain('No workspace edits');
    expect(html).toContain('No content edits');
    expect(html).toContain('Readiness');
    expect(html).toContain('Lesson Plans: timing needs review.');
    expect(html).toContain('Next:');
  });

  it('renders repeated issue text without duplicate React key warnings', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const container = document.createElement('div');
    const root = createRoot(container);

    act(() => {
      root.render(
        <AgentReceiptCard
          receipt={{
            title: 'Audit needs review',
            status: 'review',
            target: 'Package',
            changed: ['No workspace edits'],
            checked: ['Readiness'],
            issues: ['Rubrics: Rubrics has not been generated.', 'Rubrics: Rubrics has not been generated.'],
          }}
        />,
      );
    });

    const warningText = errorSpy.mock.calls.map((call) => call.join(' ')).join('\n');
    expect(warningText).not.toContain('Encountered two children with the same key');
    expect(container.textContent).toContain('Rubrics: Rubrics has not been generated.');

    act(() => root.unmount());
    errorSpy.mockRestore();
  });

  it('renders a compact tool trace for model-driven receipts', () => {
    const html = renderToStaticMarkup(
      <AgentReceiptCard
        receipt={{
          title: 'Quality audit complete',
          status: 'done',
          mode: 'No workspace edits',
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

    expect(html).toContain('2 model calls');
    expect(html).toContain('Validate course materials');
    expect(html).toContain('Details');
    expect(html).not.toContain('data-testid="agent-receipt-tool-trace"');
    expect(html).not.toContain('Work done');
    expect(html).not.toContain('Inspect workspace');
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
    expect(html).toContain('Updated blueprint: Lesson 4 learning objectives');
    expect(html).not.toContain('Model calls: 0');
  });

  it('renders post-mutation verification evidence when present', () => {
    const html = renderToStaticMarkup(
      <AgentReceiptCard
        receipt={{
          title: 'Content update receipt',
          status: 'done',
          target: 'Lesson Plans',
          changed: ['Edit deliverables: 2 changes applied'],
          checked: ['Read lesson plans: Verified 2 lesson plans'],
          verification: {
            required: true,
            status: 'verified',
            label: 'Verified after mutation via Read lesson plans',
          },
        }}
      />,
    );

    expect(html).toContain('Edit deliverables: 2 changes applied');
    expect(html).toContain('Details');
    expect(html).not.toContain('data-testid="agent-receipt-verification"');
    expect(html).not.toContain('Verified by reading back:');
    expect(html).not.toContain('Verified after mutation via Read lesson plans');
  });

  it('renders planner evidence for serious model runs', () => {
    const html = renderToStaticMarkup(
      <AgentReceiptCard
        receipt={{
          title: 'Package repair receipt',
          status: 'done',
          target: 'Package',
          changed: ['Repair package readiness: 1 repaired'],
          checked: ['Review package readiness: 0 blockers'],
          planning: {
            required: true,
            status: 'planned',
            label: 'Planned before execution via Inspect workspace',
          },
        }}
      />,
    );

    expect(html).toContain('Repair package readiness: 1 repaired');
    expect(html).toContain('Details');
    expect(html).not.toContain('data-testid="agent-receipt-planning"');
    expect(html).not.toContain('Planned before execution via Inspect workspace');
  });

  it('renders compact state-diff evidence for changed and failed mutation rows', () => {
    const html = renderToStaticMarkup(
      <AgentReceiptCard
        receipt={{
          title: 'Content update needs review',
          status: 'review',
          target: 'Quiz & Exam Bank',
          changed: ['Edit deliverables: 1 applied, 1 failed'],
          checked: ['Read quiz: Verified 1 question'],
          stateDiffs: [
            {
              status: 'changed',
              action: 'editItem',
              target: 'Quiz & Exam Bank',
              path: 'quizzes.0.qs.0.q',
              before: 'What proves the tool ran?',
              after: 'What proves the verifier ran?',
            },
            {
              status: 'failed',
              action: 'addItem',
              target: 'Rubrics',
              reason: 'Lesson index out of range.',
            },
          ],
        }}
      />,
    );

    expect(html).toContain('data-testid="agent-receipt-state-diffs"');
    expect(html).toContain('Change details');
    expect(html).toContain('Changed');
    expect(html).toContain('Before:');
    expect(html).toContain('What proves the tool ran?');
    expect(html).toContain('After:');
    expect(html).toContain('What proves the verifier ran?');
    expect(html).toContain('Failed');
    expect(html).toContain('Lesson index out of range.');
  });

  it('renders the agent quality scorecard dimensions', () => {
    const html = renderToStaticMarkup(
      <AgentReceiptCard
        receipt={{
          title: 'Content update receipt',
          status: 'done',
          target: 'Course Map',
          changed: ['Edit course map: 1 applied'],
          checked: ['Read lesson: verified'],
          quality: {
            score: 96,
            maxScore: 100,
            label: 'Excellent',
            status: 'pass',
            dimensions: [
              { id: 'intent', label: 'Intent', score: 100, status: 'pass' },
              { id: 'safety', label: 'Safety', score: 100, status: 'pass' },
              { id: 'verification', label: 'Verification', score: 100, status: 'pass' },
              { id: 'response', label: 'Response', score: 80, status: 'watch' },
              { id: 'recovery', label: 'Recovery', score: 100, status: 'pass' },
            ],
          },
        }}
      />,
    );

    expect(html).toContain('Edit course map: 1 applied');
    expect(html).toContain('Details');
    expect(html).not.toContain('data-testid="agent-receipt-quality-scorecard"');
    expect(html).not.toContain('96/100');
    expect(html).not.toContain('Intent');
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

    expect(html).toContain('Details');
    expect(html).not.toContain('Plan next');
    expect(html).not.toContain('Check package');
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
      const detailsButton = Array.from(container.querySelectorAll('button')).find((node) =>
        /details/i.test(node.textContent || ''),
      );
      expect(detailsButton).not.toBeNull();

      await act(async () => {
        detailsButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

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
