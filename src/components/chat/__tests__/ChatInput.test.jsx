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

  function typeInTextarea(textarea, value) {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
    if (setter) setter.call(textarea, value);
    else textarea.value = value;
    textarea.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
  }

  it('renders and toggles review-only mode', () => {
    const onAgentDryRunChange = vi.fn();
    renderInput({ onAgentDryRunChange });

    const toggle = container.querySelector('[data-testid="agent-dry-run-toggle"]');
    expect(toggle).not.toBeNull();
    expect(toggle.textContent).toContain('Auto-fix on');
    expect(toggle.getAttribute('aria-pressed')).toBe('false');

    act(() => {
      toggle.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onAgentDryRunChange).toHaveBeenCalledWith(true);
  });

  it('keeps send controls in the compose flow below the textarea', () => {
    renderInput();

    const textarea = container.querySelector('textarea');
    const sendButton = container.querySelector('button[aria-label="Send message"]');
    const actionRow = sendButton.closest('div');

    expect(textarea.className).toContain('min-h-[70px]');
    expect(textarea.className).not.toContain('pb-8');
    expect(actionRow.className).toContain('mt-1.5');
    expect(actionRow.className).not.toContain('absolute');
    expect(sendButton.className).toContain('shrink-0');
  });

  it('uses review-only copy and review prompt when enabled', () => {
    const onSend = vi.fn();
    renderInput({ agentDryRun: true, onSend });

    const toggle = container.querySelector('[data-testid="agent-dry-run-toggle"]');
    const textarea = container.querySelector('textarea');
    expect(toggle.textContent).toContain('Review only');
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    expect(textarea.getAttribute('placeholder')).toContain('Review or ask');
    expect(container.textContent).toContain('No edits');

    const reviewButton = Array.from(container.querySelectorAll('button')).find(
      (button) => button.getAttribute('title') === 'Review without editing',
    );
    act(() => {
      reviewButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend.mock.calls[0][0]).toContain('Do not apply changes');
    expect(onSend.mock.calls[0][0]).not.toContain('using edit_deliverables');
  });

  it('routes the package action button through the direct agent command when available', () => {
    const onSend = vi.fn();
    const onAgentCommand = vi.fn();
    renderInput({ onSend, onAgentCommand });

    const finishButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent.includes('Finish package'),
    );
    expect(finishButton).not.toBeNull();

    act(() => {
      finishButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onAgentCommand).toHaveBeenCalledTimes(1);
    expect(onAgentCommand.mock.calls[0][0]).toMatchObject({
      id: 'finish-package',
      displayText: 'Finish package',
    });
    expect(onSend).not.toHaveBeenCalled();
  });

  it('opens slash commands and routes the selected command through the agent handler', () => {
    const onSend = vi.fn();
    const onAgentCommand = vi.fn();
    renderInput({ onSend, onAgentCommand });

    const textarea = container.querySelector('textarea');
    act(() => {
      typeInTextarea(textarea, '/plan');
    });

    expect(container.querySelector('[data-testid="agent-slash-command-palette"]')).not.toBeNull();
    const planCommand = container.querySelector('[data-testid="agent-slash-command-plan-next"]');
    expect(planCommand).not.toBeNull();
    expect(planCommand.textContent).toContain('Plan next step');

    act(() => {
      planCommand.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onAgentCommand).toHaveBeenCalledTimes(1);
    expect(onAgentCommand.mock.calls[0][0]).toMatchObject({ id: 'plan-next' });
    expect(onSend).not.toHaveBeenCalled();
    expect(container.querySelector('textarea').value).toBe('');
  });

  it('uses Enter to run the first matching slash command', () => {
    const onSend = vi.fn();
    const onAgentCommand = vi.fn();
    renderInput({ onSend, onAgentCommand });

    const textarea = container.querySelector('textarea');
    act(() => {
      typeInTextarea(textarea, '/audit');
    });

    act(() => {
      textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });

    expect(onAgentCommand).toHaveBeenCalledTimes(1);
    expect(onAgentCommand.mock.calls[0][0]).toMatchObject({ id: 'audit-quality' });
    expect(onSend).not.toHaveBeenCalled();
  });

  it('routes /help through the local Agent help command', () => {
    const onSend = vi.fn();
    const onAgentCommand = vi.fn();
    renderInput({ onSend, onAgentCommand });

    const textarea = container.querySelector('textarea');
    act(() => {
      typeInTextarea(textarea, '/help');
    });

    const helpCommand = container.querySelector('[data-testid="agent-slash-command-agent-help"]');
    expect(helpCommand).not.toBeNull();
    expect(helpCommand.textContent).toContain('Show agent help');

    act(() => {
      textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });

    expect(onAgentCommand).toHaveBeenCalledTimes(1);
    expect(onAgentCommand.mock.calls[0][0]).toMatchObject({ id: 'agent-help' });
    expect(onSend).not.toHaveBeenCalled();
  });

  it('routes natural slash aliases to the intended Agent commands', () => {
    const onSend = vi.fn();
    const onAgentCommand = vi.fn();
    renderInput({ onSend, onAgentCommand });

    const textarea = container.querySelector('textarea');
    act(() => {
      typeInTextarea(textarea, '/fix');
    });

    expect(container.querySelector('[data-testid="agent-slash-command-finish-package"]')).not.toBeNull();

    act(() => {
      textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });

    expect(onAgentCommand).toHaveBeenCalledTimes(1);
    expect(onAgentCommand.mock.calls[0][0]).toMatchObject({ id: 'finish-package' });
    expect(onSend).not.toHaveBeenCalled();
  });

  it('routes typed mode-switch commands through the agent handler', () => {
    const onSend = vi.fn();
    const onAgentCommand = vi.fn();
    renderInput({ onSend, onAgentCommand });

    const textarea = container.querySelector('textarea');
    act(() => {
      typeInTextarea(textarea, 'review only');
    });

    const preview = container.querySelector('[data-testid="agent-command-preview"]');
    expect(preview).not.toBeNull();
    expect(preview.textContent).toContain('Switch to Review only');

    act(() => {
      textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });

    expect(onAgentCommand).toHaveBeenCalledTimes(1);
    expect(onAgentCommand.mock.calls[0][0]).toMatchObject({
      id: 'set-review-mode',
      modeSwitch: 'review-only',
    });
    expect(onSend).not.toHaveBeenCalled();
  });

  it('routes slash mode-switch commands for the current mode', () => {
    const onSend = vi.fn();
    const onAgentCommand = vi.fn();
    renderInput({ agentDryRun: true, onSend, onAgentCommand });

    const textarea = container.querySelector('textarea');
    act(() => {
      typeInTextarea(textarea, '/auto fix');
    });

    const modeCommand = container.querySelector('[data-testid="agent-slash-command-set-auto-fix-mode"]');
    expect(modeCommand).not.toBeNull();
    expect(modeCommand.textContent).toContain('Switch to Auto-fix');

    act(() => {
      textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });

    expect(onAgentCommand).toHaveBeenCalledTimes(1);
    expect(onAgentCommand.mock.calls[0][0]).toMatchObject({
      id: 'set-auto-fix-mode',
      modeSwitch: 'auto-fix',
    });
    expect(onSend).not.toHaveBeenCalled();
  });

  it('routes high-confidence typed commands without needing slash syntax', () => {
    const onSend = vi.fn();
    const onAgentCommand = vi.fn();
    renderInput({ onSend, onAgentCommand });

    const textarea = container.querySelector('textarea');
    act(() => {
      typeInTextarea(textarea, 'fix package');
    });

    const preview = container.querySelector('[data-testid="agent-command-preview"]');
    expect(preview).not.toBeNull();
    expect(preview.textContent).toContain('Finish package');

    const sendButton = container.querySelector('button[aria-label="Run command"]');
    expect(sendButton).not.toBeNull();

    act(() => {
      textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });

    expect(onAgentCommand).toHaveBeenCalledTimes(1);
    expect(onAgentCommand.mock.calls[0][0]).toMatchObject({ id: 'finish-package' });
    expect(onSend).not.toHaveBeenCalled();
    expect(container.querySelector('textarea').value).toBe('');
  });

  it('lets users click the detected command preview before sending', () => {
    const onSend = vi.fn();
    const onAgentCommand = vi.fn();
    renderInput({ onSend, onAgentCommand });

    const textarea = container.querySelector('textarea');
    act(() => {
      typeInTextarea(textarea, 'plan next');
    });

    const preview = container.querySelector('[data-testid="agent-command-preview"]');
    expect(preview).not.toBeNull();
    expect(preview.textContent).toContain('Plan next step');

    act(() => {
      preview.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onAgentCommand).toHaveBeenCalledTimes(1);
    expect(onAgentCommand.mock.calls[0][0]).toMatchObject({ id: 'plan-next' });
    expect(onSend).not.toHaveBeenCalled();
    expect(container.querySelector('textarea').value).toBe('');
  });

  it('does not show a command preview for ordinary questions', () => {
    renderInput();

    const textarea = container.querySelector('textarea');
    act(() => {
      typeInTextarea(textarea, 'can you explain what an audit checks?');
    });

    expect(container.querySelector('[data-testid="agent-command-preview"]')).toBeNull();
  });

  it('allows no-provider typed local commands while keeping free-form chat gated', () => {
    const onSend = vi.fn();
    const onAgentCommand = vi.fn();
    renderInput({
      isAgentProviderReady: false,
      onSend,
      onAgentCommand,
    });

    const textarea = container.querySelector('textarea');
    act(() => {
      typeInTextarea(textarea, 'plan next');
    });

    expect(container.querySelector('[data-testid="agent-command-preview"]')?.textContent).toContain('Plan next step');

    const sendButton = container.querySelector('button[aria-label="Run command"]');
    expect(sendButton).not.toBeNull();
    expect(sendButton.disabled).toBe(false);

    act(() => {
      textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });

    expect(onAgentCommand).toHaveBeenCalledTimes(1);
    expect(onAgentCommand.mock.calls[0][0]).toMatchObject({ id: 'plan-next' });
    expect(onSend).not.toHaveBeenCalled();
  });

  it('does not hijack ordinary sentences that mention command words', () => {
    const onSend = vi.fn();
    const onAgentCommand = vi.fn();
    renderInput({ onSend, onAgentCommand });

    const textarea = container.querySelector('textarea');
    act(() => {
      typeInTextarea(textarea, 'Can you explain what the audit checks?');
    });

    act(() => {
      textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });

    expect(onAgentCommand).not.toHaveBeenCalled();
    expect(onSend).toHaveBeenCalledWith('Can you explain what the audit checks?');
  });

  it('blocks unknown slash commands instead of sending them as chat text', () => {
    const onSend = vi.fn();
    const onAgentCommand = vi.fn();
    renderInput({ onSend, onAgentCommand });

    const textarea = container.querySelector('textarea');
    act(() => {
      typeInTextarea(textarea, '/not-a-command');
    });

    expect(container.querySelector('[data-testid="agent-slash-command-palette"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="agent-slash-command-empty"]').textContent).toContain(
      'No matching command',
    );
    expect(container.querySelector('[data-testid="agent-slash-command-suggestion-agent-help"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="agent-slash-command-suggestion-finish-package"]')).not.toBeNull();

    const sendButton = container.querySelector('button[aria-label="Choose a valid command"]');
    expect(sendButton).not.toBeNull();
    expect(sendButton.disabled).toBe(true);

    act(() => {
      textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });

    expect(onAgentCommand).not.toHaveBeenCalled();
    expect(onSend).not.toHaveBeenCalled();
  });

  it('lets users recover from an unknown slash command by clicking a suggestion', () => {
    const onSend = vi.fn();
    const onAgentCommand = vi.fn();
    renderInput({ onSend, onAgentCommand });

    const textarea = container.querySelector('textarea');
    act(() => {
      typeInTextarea(textarea, '/wat');
    });

    const helpSuggestion = container.querySelector('[data-testid="agent-slash-command-suggestion-agent-help"]');
    expect(helpSuggestion).not.toBeNull();

    act(() => {
      helpSuggestion.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onAgentCommand).toHaveBeenCalledTimes(1);
    expect(onAgentCommand.mock.calls[0][0]).toMatchObject({ id: 'agent-help' });
    expect(onSend).not.toHaveBeenCalled();
    expect(container.querySelector('textarea').value).toBe('');
  });

  it('uses arrow keys to choose a slash command before Enter', () => {
    const onSend = vi.fn();
    const onAgentCommand = vi.fn();
    renderInput({ onSend, onAgentCommand });

    const textarea = container.querySelector('textarea');
    act(() => {
      typeInTextarea(textarea, '/');
    });

    const finishCommand = container.querySelector('[data-testid="agent-slash-command-finish-package"]');
    const modeCommand = container.querySelector('[data-testid="agent-slash-command-set-review-mode"]');
    expect(finishCommand.getAttribute('aria-selected')).toBe('true');
    expect(modeCommand.getAttribute('aria-selected')).toBe('false');

    act(() => {
      textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    });

    expect(finishCommand.getAttribute('aria-selected')).toBe('false');
    expect(modeCommand.getAttribute('aria-selected')).toBe('true');
    expect(textarea.getAttribute('aria-activedescendant')).toBe('agent-slash-command-option-set-review-mode');

    act(() => {
      textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });

    expect(onAgentCommand).toHaveBeenCalledTimes(1);
    expect(onAgentCommand.mock.calls[0][0]).toMatchObject({ id: 'set-review-mode' });
    expect(onSend).not.toHaveBeenCalled();
  });

  it('exposes undo as a slash command when undo is available', () => {
    const onSend = vi.fn();
    const onAgentCommand = vi.fn();
    renderInput({ onSend, onAgentCommand, canUndo: true, onUndo: vi.fn() });

    const textarea = container.querySelector('textarea');
    act(() => {
      typeInTextarea(textarea, '/undo');
    });

    const undoCommand = container.querySelector('[data-testid="agent-slash-command-undo-last"]');
    expect(undoCommand).not.toBeNull();
    expect(undoCommand.getAttribute('aria-selected')).toBe('true');

    act(() => {
      textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });

    expect(onAgentCommand).toHaveBeenCalledTimes(1);
    expect(onAgentCommand.mock.calls[0][0]).toMatchObject({ id: 'undo-last' });
    expect(onSend).not.toHaveBeenCalled();
  });

  it('allows no-provider local slash commands while keeping free-form chat gated', () => {
    const onSend = vi.fn();
    const onAgentCommand = vi.fn();
    const onConfigureAI = vi.fn();
    renderInput({
      isAgentProviderReady: false,
      onSend,
      onAgentCommand,
      onConfigureAI,
    });

    const textarea = container.querySelector('textarea');
    expect(textarea.disabled).toBe(false);
    expect(textarea.getAttribute('placeholder')).toContain('Configure AI');

    act(() => {
      typeInTextarea(textarea, 'Please improve this');
    });
    const sendButton = container.querySelector('button[aria-label="Send message"]');
    expect(sendButton.disabled).toBe(true);

    act(() => {
      typeInTextarea(textarea, '/plan');
    });
    expect(container.querySelector('[data-testid="agent-slash-command-palette"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="agent-slash-command-plan-next"]')).not.toBeNull();

    act(() => {
      textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });

    expect(onAgentCommand).toHaveBeenCalledTimes(1);
    expect(onAgentCommand.mock.calls[0][0]).toMatchObject({ id: 'plan-next' });
    expect(onSend).not.toHaveBeenCalled();

    act(() => {
      typeInTextarea(textarea, '/configure');
    });
    act(() => {
      textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    expect(onConfigureAI).toHaveBeenCalledTimes(1);
  });
});
