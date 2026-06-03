/**
 * @vitest-environment happy-dom
 */
import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import DeveloperAgentLogPanel from '../DeveloperAgentLogPanel';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('DeveloperAgentLogPanel', () => {
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

  function renderPanel(snapshot) {
    act(() => {
      root.render(<DeveloperAgentLogPanel snapshot={snapshot} />);
    });
  }

  it('renders persisted agent runs and tool steps', () => {
    renderPanel({
      chatHistory: [
        { role: 'user', text: 'Review the quiz.' },
        {
          role: 'agentProgress',
          status: 'complete',
          steps: [{ tool: 'read_deliverable', label: 'Read quiz', status: 'done', summary: 'Read quiz bank' }],
        },
      ],
    });

    expect(container.querySelector('[data-testid="developer-agent-log-panel"]')).not.toBeNull();
    expect(container.querySelectorAll('[data-testid="developer-agent-event"]')).toHaveLength(3);
    expect(container.textContent).toContain('Agent run complete');
    expect(container.textContent).toContain('Read quiz bank');
  });

  it('renders package check handoff events', () => {
    renderPanel({
      chatHistory: [
        {
          role: 'packageSummary',
          summary: {
            confidence: 'Good with assumptions',
            tone: 'assumptions',
            repairsApplied: 2,
            blockerCount: 0,
            warningCount: 1,
          },
        },
      ],
    });

    expect(container.querySelectorAll('[data-testid="developer-agent-event"]')).toHaveLength(1);
    expect(container.textContent).toContain('Package check');
    expect(container.textContent).toContain('Decision needed');
  });

  it('renders workspace plan events', () => {
    renderPanel({
      chatHistory: [
        {
          role: 'workspacePlan',
          plan: {
            evidence: { generatedFeatureCount: 3, staleFeatureCount: 1, failedFeatureCount: 0 },
            highestImpactAction: {
              title: 'Sync stale deliverables: Quiz & Exam Bank',
              safeMode: 'needs-approval',
            },
          },
        },
      ],
    });

    expect(container.querySelectorAll('[data-testid="developer-agent-event"]')).toHaveLength(1);
    expect(container.textContent).toContain('Plan');
    expect(container.textContent).toContain('Workspace plan');
    expect(container.textContent).toContain('Sync stale deliverables');
  });

  it('renders receipt run details and tools in compact chips', () => {
    renderPanel({
      chatHistory: [
        {
          role: 'agentReceipt',
          receipt: {
            title: 'Quality audit complete',
            status: 'done',
            target: 'Package',
            intent: { type: 'package_audit' },
            runStats: {
              toolCount: 2,
              actionCount: 0,
              checkCount: 2,
              providerCallCount: 1,
              stopReason: 'respond',
              readOnly: true,
            },
            toolManifest: [
              { tool: 'validate_course', label: 'Validate course materials', status: 'done' },
              { tool: 'review_package_readiness', label: 'Review readiness', status: 'done' },
            ],
            checked: ['Readiness', 'Validation'],
          },
        },
      ],
    });

    expect(container.querySelectorAll('[data-testid="developer-agent-event"]')).toHaveLength(1);
    expect(container.textContent).toContain('Quality audit complete');
    expect(container.textContent).toContain('intent: package_audit');
    expect(container.textContent).toContain('2 tools, 1 model call, 2 checks, read-only, stop: respond');
    expect(container.textContent).toContain('tools: Validate course materials, Review readiness');
  });

  it('shows an empty state when no agent history exists', () => {
    renderPanel({ chatHistory: [] });

    expect(container.querySelectorAll('[data-testid="developer-agent-event"]')).toHaveLength(0);
    expect(container.textContent).toContain('No agent events captured');
  });
});
