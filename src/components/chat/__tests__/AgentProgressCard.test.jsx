import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import AgentProgressCard, {
  buildAgentActivityReceipt,
  buildAgentRecoveryActions,
  buildAgentRunOutcome,
} from '../AgentProgressCard';

describe('AgentProgressCard', () => {
  it('uses persisted run timing for completed work', () => {
    const html = renderToStaticMarkup(
      <AgentProgressCard
        status="complete"
        startedAt={1000}
        endedAt={15200}
        steps={[
          { label: 'Read slides', status: 'done' },
          { label: 'Generate image', status: 'done' },
          { label: 'Verify export', status: 'done' },
        ]}
      />,
    );

    expect(html).toContain('3 steps');
    expect(html).toContain('14s');
    expect(html).not.toContain('0s');
  });

  it('describes sub-second completed work without showing 0s', () => {
    const html = renderToStaticMarkup(
      <AgentProgressCard
        status="complete"
        startedAt={1000}
        endedAt={1000}
        steps={[{ label: 'Verify slides', status: 'done' }]}
      />,
    );

    expect(html).toContain('under 1s');
    expect(html).not.toContain('0s');
  });

  it('shows a compact run receipt with mode, targets, and model', () => {
    const html = renderToStaticMarkup(
      <AgentProgressCard
        status="complete"
        startedAt={1000}
        endedAt={3400}
        runMeta={{ mode: 'Auto-fix', target: 'Lesson Plans', model: 'gpt-5.4-mini' }}
        steps={[
          { label: 'Reading deliverable data', status: 'done', targets: ['Lesson Plans'] },
          { label: 'Validating course health', status: 'done', targets: ['Package'] },
        ]}
      />,
    );

    expect(html).toContain('Auto-fix');
    expect(html).toContain('Lesson Plans, Package');
    expect(html).toContain('gpt-5.4-mini');
    expect(html).toContain('2 steps');
  });

  it('shows a user-facing activity receipt for checks, actions, issues, and targets', () => {
    const html = renderToStaticMarkup(
      <AgentProgressCard
        status="complete"
        startedAt={1000}
        endedAt={4400}
        steps={[
          { tool: 'read_deliverable', label: 'Read lesson plans', status: 'done', targets: ['Lesson Plans'] },
          { tool: 'edit_deliverables', label: 'Edit lesson plans', status: 'partial', targets: ['Lesson Plans'] },
          { tool: 'validate_course', label: 'Validate course', status: 'done', targets: ['Package'] },
        ]}
      />,
    );

    expect(html).toContain('agent-activity-receipt');
    expect(html).toContain('Changes need review');
    expect(html).toContain('3 tools');
    expect(html).toContain('2 checks');
    expect(html).toContain('1 action');
    expect(html).toContain('1 issue');
    expect(html).toContain('Lesson Plans');
  });

  it('builds deterministic activity receipt chips from step data', () => {
    expect(
      buildAgentActivityReceipt([
        { tool: 'inspect_workspace', status: 'done', targets: ['Package'] },
        { tool: 'finalize_package', status: 'done', targets: ['Package'] },
        { tool: 'repair_package_readiness', status: 'error', targets: ['Package'] },
      ]),
    ).toEqual(['3 tools', '1 check', '2 actions', '1 issue', 'Package']);
  });

  it('builds deterministic run outcome labels from tool impact', () => {
    expect(
      buildAgentRunOutcome([{ tool: 'inspect_workspace', status: 'done' }], {
        status: 'complete',
        mode: 'Review only',
      }),
    ).toEqual({ label: 'Review only', tone: 'slate' });

    expect(
      buildAgentRunOutcome([{ tool: 'edit_deliverables', status: 'done' }], {
        status: 'complete',
        mode: 'Auto-fix',
      }),
    ).toEqual({ label: 'Workspace updated', tone: 'emerald' });

    expect(
      buildAgentRunOutcome([{ tool: 'edit_course_map', status: 'error' }], {
        status: 'error',
        mode: 'Auto-fix',
      }),
    ).toEqual({ label: 'Action failed', tone: 'red' });

    expect(
      buildAgentRunOutcome([{ tool: 'remember', status: 'done' }], {
        status: 'complete',
        mode: 'Auto-fix',
      }),
    ).toEqual({ label: 'Agent memory updated', tone: 'indigo' });
  });

  it('builds deterministic recovery actions for failed package work', () => {
    expect(
      buildAgentRecoveryActions(
        [
          { tool: 'inspect_workspace', label: 'Inspect workspace', status: 'done', targets: ['Package'] },
          {
            tool: 'repair_package_readiness',
            label: 'Repair package readiness',
            status: 'error',
            targets: ['Package'],
          },
        ],
        { status: 'error', runMeta: { target: 'Package' } },
      ),
    ).toEqual([
      expect.objectContaining({
        id: 'review-package-issues',
        label: 'Review issues',
        displayText: 'Review package issues',
        prompt: expect.stringContaining('Repair package readiness'),
      }),
      expect.objectContaining({
        id: 'plan-recovery',
        label: 'Plan recovery',
        displayText: 'Plan recovery',
      }),
    ]);
  });

  it('renders recovery buttons when completed work has issues', () => {
    const html = renderToStaticMarkup(
      <AgentProgressCard
        status="complete"
        startedAt={1000}
        endedAt={3400}
        onRecoveryAction={() => {}}
        steps={[
          { tool: 'edit_deliverables', label: 'Edit lesson plans', status: 'partial', targets: ['Lesson Plans'] },
        ]}
      />,
    );

    expect(html).toContain('Retry safe fixes');
    expect(html).toContain('Plan recovery');
    expect(html).toContain('agent-progress-action-retry-safe-fixes');
  });
});
