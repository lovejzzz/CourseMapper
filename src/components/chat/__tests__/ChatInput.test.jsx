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

  it('renders a clean composer without a mode toggle', () => {
    const onAgentDryRunChange = vi.fn();
    renderInput({ onAgentDryRunChange });

    const toggle = container.querySelector('[data-testid="agent-dry-run-toggle"]');
    expect(toggle).toBeNull();
    expect(container.textContent).not.toContain('Review only');
    expect(container.textContent).not.toContain('No edits');
    expect(onAgentDryRunChange).not.toHaveBeenCalled();
  });

  it('keeps the send control reachable inside the textarea area', () => {
    renderInput();

    const textarea = container.querySelector('textarea');
    const sendButton = container.querySelector('button[aria-label="Send message"]');
    const sendButtonWrapper = sendButton.closest('div');

    expect(textarea.className).toContain('min-h-[74px]');
    expect(textarea.className).toContain('pb-8');
    expect(textarea.className).toContain('pr-11');
    expect(sendButtonWrapper.className).toContain('absolute');
    expect(sendButtonWrapper.className).toContain('bottom-2');
    expect(sendButtonWrapper.className).toContain('right-2');
  });

  it('uses conversation copy without duplicating the header package action', () => {
    const onSend = vi.fn();
    renderInput({ agentDryRun: true, onSend });

    const toggle = container.querySelector('[data-testid="agent-dry-run-toggle"]');
    const textarea = container.querySelector('textarea');
    expect(toggle).toBeNull();
    expect(textarea.getAttribute('placeholder')).toContain('Tell the agent what to change');
    expect(textarea.getAttribute('aria-label')).toContain('Message Scion');
    expect(container.textContent).not.toContain('No edits');
    expect(container.textContent).not.toContain('Finish package');
    expect(onSend).not.toHaveBeenCalled();
  });

  it('routes typed finish-package language through the direct agent command', () => {
    const onSend = vi.fn();
    const onAgentCommand = vi.fn();
    renderInput({ onSend, onAgentCommand });

    const textarea = container.querySelector('textarea');
    act(() => {
      typeInTextarea(textarea, 'finish package');
    });

    act(() => {
      textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
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

  it('does not route typed mode-switch phrases as local commands', () => {
    const onSend = vi.fn();
    const onAgentCommand = vi.fn();
    renderInput({ onSend, onAgentCommand });

    const textarea = container.querySelector('textarea');
    act(() => {
      typeInTextarea(textarea, 'review only');
    });

    const preview = container.querySelector('[data-testid="agent-command-preview"]');
    expect(preview).toBeNull();

    act(() => {
      textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });

    expect(onAgentCommand).not.toHaveBeenCalled();
    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it('does not expose slash mode-switch commands', () => {
    const onSend = vi.fn();
    const onAgentCommand = vi.fn();
    renderInput({ agentDryRun: true, onSend, onAgentCommand });

    const textarea = container.querySelector('textarea');
    act(() => {
      typeInTextarea(textarea, '/auto fix');
    });

    const modeCommand = container.querySelector('[data-testid="agent-slash-command-set-auto-fix-mode"]');
    expect(modeCommand).toBeNull();

    act(() => {
      textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });

    expect(onAgentCommand).not.toHaveBeenCalled();
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

  it('runs natural local audit commands even when AI is not configured', () => {
    const onSend = vi.fn();
    const onAgentCommand = vi.fn();
    renderInput({ isAgentProviderReady: false, onSend, onAgentCommand });

    const textarea = container.querySelector('textarea');
    act(() => {
      typeInTextarea(textarea, 'can you audit this package?');
    });

    const preview = container.querySelector('[data-testid="agent-command-preview"]');
    expect(preview).not.toBeNull();
    expect(preview.textContent).toContain('Check package');

    const runButton = container.querySelector('button[aria-label="Run command"]');
    expect(runButton).not.toBeNull();
    expect(runButton.disabled).toBe(false);

    act(() => {
      textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });

    expect(onAgentCommand).toHaveBeenCalledTimes(1);
    expect(onAgentCommand.mock.calls[0][0]).toMatchObject({ id: 'audit-quality' });
    expect(onSend).not.toHaveBeenCalled();
  });

  it('routes typed lesson-scope requests through the agent command handler', () => {
    const onSend = vi.fn();
    const onAgentCommand = vi.fn();
    renderInput({
      onSend,
      onAgentCommand,
      courseMap: {
        lessons: [
          { title: 'Lesson 1' },
          { title: 'Lesson 2' },
          { title: 'Lesson 3' },
          { title: 'Lesson 4' },
          { title: 'Lesson 5' },
        ],
      },
    });

    const textarea = container.querySelector('textarea');
    act(() => {
      typeInTextarea(textarea, 'change the scope to 8 lessons');
    });

    const preview = container.querySelector('[data-testid="agent-command-preview"]');
    expect(preview).not.toBeNull();
    expect(preview.textContent).toContain('Change scope to 8 lessons');
    expect(preview.textContent).toContain('Expand course from 5 to 8 lessons');
    expect(container.querySelector('button[aria-label="Run command"]')).not.toBeNull();

    act(() => {
      textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });

    expect(onAgentCommand).toHaveBeenCalledTimes(1);
    expect(onAgentCommand.mock.calls[0][0]).toMatchObject({
      id: 'set-lesson-scope',
      targetLessonCount: 8,
      currentLessonCount: 5,
      requestedScope: 'count',
    });
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

  it('does not hijack ordinary sentences that mention scope', () => {
    const onSend = vi.fn();
    const onAgentCommand = vi.fn();
    renderInput({ onSend, onAgentCommand });

    const textarea = container.querySelector('textarea');
    act(() => {
      typeInTextarea(textarea, 'Can you explain what scope means here?');
    });

    expect(container.querySelector('[data-testid="agent-command-preview"]')).toBeNull();

    act(() => {
      textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });

    expect(onAgentCommand).not.toHaveBeenCalled();
    expect(onSend).toHaveBeenCalledWith('Can you explain what scope means here?');
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
    const improveCommand = container.querySelector('[data-testid="agent-slash-command-improve-active"]');
    expect(finishCommand.getAttribute('aria-selected')).toBe('true');
    expect(improveCommand.getAttribute('aria-selected')).toBe('false');

    act(() => {
      textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    });

    expect(finishCommand.getAttribute('aria-selected')).toBe('false');
    expect(improveCommand.getAttribute('aria-selected')).toBe('true');
    expect(textarea.getAttribute('aria-activedescendant')).toBe('agent-slash-command-option-improve-active');

    act(() => {
      textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });

    expect(onAgentCommand).toHaveBeenCalledTimes(1);
    expect(onAgentCommand.mock.calls[0][0]).toMatchObject({ id: 'improve-active' });
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
