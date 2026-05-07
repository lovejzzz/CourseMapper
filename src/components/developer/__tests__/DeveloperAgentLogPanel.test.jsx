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

  it('shows an empty state when no agent history exists', () => {
    renderPanel({ chatHistory: [] });

    expect(container.querySelectorAll('[data-testid="developer-agent-event"]')).toHaveLength(0);
    expect(container.textContent).toContain('No agent events captured');
  });
});
