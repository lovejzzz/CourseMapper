/**
 * @vitest-environment happy-dom
 */
import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ChatInput from '../ChatInput';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('ChatInput agent execution mode', () => {
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

  function renderInput(overrides = {}) {
    const props = {
      onSend: vi.fn(),
      isStreaming: false,
      isRevising: false,
      onStop: vi.fn(),
      attachedFiles: [],
      onProcessFiles: vi.fn(),
      onRemoveAttached: vi.fn(),
      isParsing: false,
      activeTab: 'lessonPlans',
      courseMap: { lessons: [{ title: 'Intro' }] },
      isStopped: false,
      hasPendingProposal: false,
      isAgentMode: true,
      isAgentProviderReady: true,
      agentDryRun: false,
      onAgentDryRunChange: vi.fn(),
      ...overrides,
    };

    act(() => {
      root.render(<ChatInput {...props} />);
    });
    return props;
  }

  it('renders and toggles suggest-only mode', () => {
    const onAgentDryRunChange = vi.fn();
    renderInput({ onAgentDryRunChange });

    const toggle = container.querySelector('[data-testid="agent-dry-run-toggle"]');
    expect(toggle).not.toBeNull();
    expect(toggle.textContent).toContain('Can edit');
    expect(toggle.getAttribute('aria-pressed')).toBe('false');

    act(() => {
      toggle.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onAgentDryRunChange).toHaveBeenCalledWith(true);
  });

  it('uses suggest-only copy and review prompt when enabled', () => {
    const onSend = vi.fn();
    renderInput({ agentDryRun: true, onSend });

    const toggle = container.querySelector('[data-testid="agent-dry-run-toggle"]');
    const textarea = container.querySelector('textarea');
    expect(toggle.textContent).toContain('Suggest only');
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    expect(textarea.getAttribute('placeholder')).toContain('Review or ask');
    expect(container.textContent).toContain('No auto-edits');

    const reviewButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent.includes('Review'),
    );
    act(() => {
      reviewButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend.mock.calls[0][0]).toContain('Do not apply changes');
    expect(onSend.mock.calls[0][0]).not.toContain('using edit_deliverables');
  });
});
