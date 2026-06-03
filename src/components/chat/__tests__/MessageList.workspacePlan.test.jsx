/**
 * @vitest-environment happy-dom
 */
import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MessageList from '../MessageList';
import { buildAgentReceiptActions, getAgentReceiptActionKey } from '../AgentReceiptCard';
import { getWorkspacePlanActionKey } from '../WorkspacePlanCard';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const plan = {
  executionMode: 'review',
  course: { lessonCount: 6 },
  evidence: { generatedFeatureCount: 3, staleFeatureCount: 1 },
  actions: [
    {
      priority: 'P0',
      title: 'Sync stale deliverables: Quiz & Exam Bank',
      reason: 'Quiz questions no longer match the latest course-map edit.',
      target: 'Quiz & Exam Bank',
      suggestedCommand: 'Open sync suggestion',
      safeMode: 'needs-approval',
      intent: { type: 'sync_stale_deliverables', featureIds: ['quizBank'] },
    },
  ],
};

function renderMessageList(container, props = {}) {
  const root = createRoot(container);
  act(() => {
    root.render(
      <MessageList
        messages={[{ role: 'workspacePlan', plan }]}
        isStreaming={false}
        onSuggestionClick={vi.fn()}
        courseMap={{ courseName: 'Applied ML', lessons: [] }}
        activeTab="courseMap"
        deliverables={{}}
        isAgentMode={false}
        isGenerating={false}
        isDelivGenerating={false}
        {...props}
      />,
    );
  });
  return root;
}

describe('MessageList workspace plan actions', () => {
  let container;
  let root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root.unmount();
      });
    }
    container.remove();
  });

  it('sends a short visible label with a private plan prompt override', async () => {
    const onSuggestionClick = vi.fn();
    root = renderMessageList(container, { onSuggestionClick });

    const button = container.querySelector(
      'button[aria-label="Review sync Sync stale deliverables: Quiz & Exam Bank"]',
    );
    await act(async () => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onSuggestionClick).toHaveBeenCalledWith(
      'Review sync: Sync stale deliverables: Quiz & Exam Bank',
      expect.objectContaining({
        displayText: 'Review sync: Sync stale deliverables: Quiz & Exam Bank',
        dryRunOverride: true,
        forceApplyMode: false,
        agentPromptOverride: expect.stringContaining('Intent: sync_stale_deliverables'),
      }),
    );
  });

  it('lets the parent handle a plan action directly before falling back to the Agent', async () => {
    const onSuggestionClick = vi.fn();
    const onWorkspacePlanAction = vi.fn(() => Promise.resolve(true));
    const onWorkspacePlanActionStateChange = vi.fn();
    root = renderMessageList(container, {
      onSuggestionClick,
      onWorkspacePlanAction,
      onWorkspacePlanActionStateChange,
      workspacePlanActionCapabilities: { sync_stale_deliverables: { featureIds: ['quizBank'] } },
    });

    const button = container.querySelector('button[aria-label="Sync Sync stale deliverables: Quiz & Exam Bank"]');
    await act(async () => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onWorkspacePlanAction).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Sync stale deliverables: Quiz & Exam Bank' }),
      expect.objectContaining({
        displayText: 'Sync: Sync stale deliverables: Quiz & Exam Bank',
        sendOptions: expect.objectContaining({
          displayText: 'Sync: Sync stale deliverables: Quiz & Exam Bank',
          dryRunOverride: false,
          agentPromptOverride: expect.stringContaining('Intent: sync_stale_deliverables'),
        }),
      }),
    );
    expect(onSuggestionClick).not.toHaveBeenCalled();
    const actionKey = getWorkspacePlanActionKey(plan.actions[0], 0);
    expect(onWorkspacePlanActionStateChange).toHaveBeenCalledWith(
      0,
      expect.objectContaining({ [actionKey]: { status: 'running' } }),
      expect.objectContaining({ key: actionKey, state: { status: 'running' } }),
    );
    expect(onWorkspacePlanActionStateChange).toHaveBeenCalledWith(
      0,
      expect.objectContaining({ [actionKey]: { status: 'done' } }),
      expect.objectContaining({ key: actionKey, state: { status: 'done' } }),
    );
  });

  it('preserves handled error states without falling back to Agent chat', async () => {
    const onSuggestionClick = vi.fn();
    const onWorkspacePlanAction = vi.fn(() => Promise.resolve({ status: 'error' }));
    root = renderMessageList(container, {
      onSuggestionClick,
      onWorkspacePlanAction,
      workspacePlanActionCapabilities: { sync_stale_deliverables: { featureIds: ['quizBank'] } },
    });

    const button = container.querySelector('button[aria-label="Sync Sync stale deliverables: Quiz & Exam Bank"]');
    await act(async () => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onWorkspacePlanAction).toHaveBeenCalled();
    expect(onSuggestionClick).not.toHaveBeenCalled();
    expect(container.querySelector('[data-testid="workspace-plan-action-state-sync_stale_deliverables"]').textContent).toBe(
      'Error',
    );
  });

  it('falls back to Agent chat when the parent does not handle a plan action directly', async () => {
    const onSuggestionClick = vi.fn();
    const onWorkspacePlanAction = vi.fn(() => Promise.resolve(false));
    root = renderMessageList(container, {
      onSuggestionClick,
      onWorkspacePlanAction,
    });

    const button = container.querySelector(
      'button[aria-label="Review sync Sync stale deliverables: Quiz & Exam Bank"]',
    );
    await act(async () => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onWorkspacePlanAction).toHaveBeenCalled();
    expect(onSuggestionClick).toHaveBeenCalledWith(
      'Review sync: Sync stale deliverables: Quiz & Exam Bank',
      expect.objectContaining({
        displayText: 'Review sync: Sync stale deliverables: Quiz & Exam Bank',
        agentPromptOverride: expect.stringContaining('Intent: sync_stale_deliverables'),
      }),
    );
  });

  it('routes no-provider local starter actions without sending model chat', async () => {
    const onSuggestionClick = vi.fn();
    const onStarterAction = vi.fn(() => true);
    const onConfigureAI = vi.fn();
    root = renderMessageList(container, {
      messages: [],
      isAgentMode: true,
      isAgentProviderReady: false,
      courseMap: { courseName: 'Agent No Key Course', lessons: [{ title: 'Lesson 1' }] },
      deliverables: { lessonPlans: { status: 'done', data: { lessonPlans: [] } } },
      onSuggestionClick,
      onStarterAction,
      onConfigureAI,
    });

    await act(async () => {
      container
        .querySelector('[data-testid="agent-starter-local-audit"]')
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onStarterAction).toHaveBeenCalledWith(
      expect.objectContaining({
        text: 'Run local audit',
        action: 'local-audit',
      }),
    );
    expect(onSuggestionClick).not.toHaveBeenCalled();

    await act(async () => {
      container
        .querySelector('[data-testid="configure-agent-ai-button"]')
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onConfigureAI).toHaveBeenCalledTimes(1);
  });

  it('routes provider-ready direct starters before falling back to model chat', async () => {
    const onSuggestionClick = vi.fn();
    const onStarterAction = vi.fn(() => true);
    root = renderMessageList(container, {
      messages: [],
      isAgentMode: true,
      isAgentProviderReady: true,
      courseMap: { courseName: 'Agent Command Course', lessons: [{ title: 'Lesson 1' }] },
      deliverables: { lessonPlans: { status: 'done', data: { lessonPlans: [] } } },
      onSuggestionClick,
      onStarterAction,
    });

    await act(async () => {
      container
        .querySelector('[data-testid="agent-starter-finish-package"]')
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onStarterAction).toHaveBeenCalledWith(
      expect.objectContaining({
        text: 'Finish package',
        action: 'finish-package',
      }),
    );
    expect(onSuggestionClick).not.toHaveBeenCalled();
  });

  it('renders source context cards for files attached inside the Agent chat', () => {
    root = renderMessageList(container, {
      messages: [
        {
          role: 'sourceContext',
          label: 'Source added',
          meta: {
            fileCount: 2,
            fileNames: ['starter-notebook.txt', 'rubric.docx'],
            materialNoteCount: 1,
          },
          materialNotes: [
            {
              name: 'starter-notebook.txt',
              excerpt: 'Week 1 notebook asks students to inspect validation leakage.',
            },
          ],
        },
      ],
      isAgentMode: true,
      isAgentProviderReady: true,
      courseMap: { courseName: 'Agent Source Course', lessons: [{ title: 'Lesson 1' }] },
      deliverables: { lessonPlans: { status: 'done', data: { lessonPlans: [] } } },
    });

    const card = container.querySelector('[data-testid="source-context-card"]');
    expect(card).not.toBeNull();
    expect(card.textContent).toContain('Source added - 2 materials');
    expect(card.textContent).toContain('starter-notebook.txt, rubric.docx');
    expect(card.textContent).toContain('validation leakage');
  });

  it('renders the landing prompt and uploaded materials as a compact starting-brief card', () => {
    root = renderMessageList(container, {
      messages: [
        {
          role: 'user',
          source: 'landing-context',
          meta: {
            source: 'landing-context',
            hasPrompt: true,
            fileCount: 2,
            fileNames: ['starter-notebook-outline.txt', 'model-card-template.docx'],
            hiddenFileCount: 0,
            materialNoteCount: 1,
          },
          materialNotes: [
            {
              name: 'starter-notebook-outline.txt',
              excerpt: 'Week 1 notebook asks students to inspect validation leakage.',
            },
          ],
          text: [
            'Here is what I am starting with.',
            '',
            'Starting request:',
            'Build a 2-week applied machine learning lab with weekly notebooks.',
            '',
            'Uploaded materials:',
            '- starter-notebook-outline.txt',
            '- model-card-template.docx',
            '',
            'Source notes from uploaded materials:',
            '- starter-notebook-outline.txt: Week 1 notebook asks students to inspect validation leakage.',
          ].join('\n'),
        },
      ],
      isAgentMode: true,
      isAgentProviderReady: true,
      courseMap: { courseName: 'Agent Source Course', lessons: [{ title: 'Lesson 1' }] },
      deliverables: { lessonPlans: { status: 'done', data: { lessonPlans: [] } } },
    });

    const card = container.querySelector('[data-testid="landing-context-card"]');
    expect(card).not.toBeNull();
    expect(card.textContent).toContain('Starting brief');
    expect(card.textContent).toContain('Build a 2-week applied machine learning lab');
    expect(card.textContent).toContain('starter-notebook-outline.txt');
    expect(card.textContent).toContain('model-card-template.docx');
    expect(card.textContent).toContain('validation leakage');
    expect(container.querySelector('[data-testid="chat-message-user"]')).toBeNull();
  });

  it('routes failed Agent run recovery buttons through the Agent send path', async () => {
    const onSuggestionClick = vi.fn();
    root = renderMessageList(container, {
      messages: [
        {
          role: 'agentProgress',
          status: 'error',
          startedAt: 1000,
          endedAt: 2400,
          runMeta: { mode: 'Auto-fix', target: 'Package' },
          steps: [
            { tool: 'inspect_workspace', label: 'Inspect workspace', status: 'done', targets: ['Package'] },
            {
              tool: 'repair_package_readiness',
              label: 'Repair package readiness',
              status: 'error',
              targets: ['Package'],
            },
          ],
        },
      ],
      isAgentMode: true,
      isAgentProviderReady: true,
      onSuggestionClick,
    });

    const button = container.querySelector('[data-testid="agent-progress-action-plan-recovery"]');
    expect(button).not.toBeNull();

    await act(async () => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onSuggestionClick).toHaveBeenCalledWith(
      'Plan recovery',
      expect.objectContaining({
        displayText: 'Plan recovery',
        agentPromptOverride: expect.stringContaining('Repair package readiness'),
      }),
    );
  });

  it('lets the parent handle failed Agent run recovery before model chat fallback', async () => {
    const onSuggestionClick = vi.fn();
    const onRecoveryAction = vi.fn(() => Promise.resolve(true));
    root = renderMessageList(container, {
      messages: [
        {
          role: 'agentProgress',
          status: 'error',
          startedAt: 1000,
          endedAt: 2400,
          runMeta: { mode: 'Auto-fix', target: 'Package' },
          steps: [
            { tool: 'inspect_workspace', label: 'Inspect workspace', status: 'done', targets: ['Package'] },
            {
              tool: 'repair_package_readiness',
              label: 'Repair package readiness',
              status: 'error',
              targets: ['Package'],
            },
          ],
        },
      ],
      isAgentMode: true,
      isAgentProviderReady: true,
      onSuggestionClick,
      onRecoveryAction,
    });

    const button = container.querySelector('[data-testid="agent-progress-action-plan-recovery"]');
    await act(async () => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(onRecoveryAction).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'plan-recovery',
        displayText: 'Plan recovery',
        localIntent: 'plan-next',
      }),
    );
    expect(onSuggestionClick).not.toHaveBeenCalled();
  });

  it('renders local Agent help as a capability card', () => {
    root = renderMessageList(container, {
      messages: [
        {
          role: 'agentHelp',
          help: {
            activeTarget: 'Lesson Plans',
            providerReady: false,
            agentDryRun: true,
            lessonScopeText: 'Lesson 1: Foundations',
            syncFeatureCount: 2,
            canUndo: true,
          },
        },
      ],
      isAgentMode: true,
      isAgentProviderReady: false,
      courseMap: { courseName: 'Agent Help Course', lessons: [{ title: 'Lesson 1: Foundations' }] },
      deliverables: { lessonPlans: { status: 'done', data: { lessonPlans: [] } } },
    });

    const card = container.querySelector('[data-testid="agent-help-card"]');
    expect(card).not.toBeNull();
    expect(card.textContent).toContain('Agent guide');
    expect(card.textContent).toContain('Review only');
    expect(card.textContent).toContain('Local tools only');
    expect(card.textContent).toContain('Working on Lesson Plans');
    expect(card.textContent).toContain('Sync 2 stale deliverables');
    expect(card.textContent).toContain('Toggle Review only');
  });

  it('renders Agent receipt messages in the chat stream', () => {
    root = renderMessageList(container, {
      messages: [
        {
          role: 'agentReceipt',
          receipt: {
            title: 'Package receipt',
            status: 'done',
            mode: 'Auto-fix',
            target: 'Package',
            changed: ['No safe repairs needed'],
            checked: ['Readiness', 'Export files'],
            next: 'Safe checks passed and the package is ready.',
          },
        },
      ],
    });

    const receipt = container.querySelector('[data-testid="agent-receipt-card"]');
    expect(receipt).not.toBeNull();
    expect(receipt.textContent).toContain('Package receipt');
    expect(receipt.textContent).toContain('No safe repairs needed');
    expect(receipt.textContent).toContain('Export files');
  });

  it('routes Agent receipt follow-up actions through the suggestion sender', async () => {
    const onSuggestionClick = vi.fn();
    root = renderMessageList(container, {
      onSuggestionClick,
      messages: [
        {
          role: 'agentReceipt',
          receipt: {
            title: 'Agent run needs attention',
            status: 'blocked',
            mode: 'Auto-fix',
            target: 'Course FAQ',
            changed: ['No workspace edits'],
            checked: ['Finish package'],
            issues: ['Course FAQ failed to generate.'],
            next: 'Open the issue details before continuing.',
          },
        },
      ],
    });

    const reviewButton = container.querySelector('[data-testid="agent-receipt-action-review-issues"]');
    expect(reviewButton).not.toBeNull();
    await act(async () => {
      reviewButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(onSuggestionClick).toHaveBeenCalledWith(
      'Review issues',
      expect.objectContaining({
        displayText: 'Review issues',
        agentPromptOverride: expect.stringContaining('Course FAQ failed to generate.'),
      }),
    );
  });

  it('lets the parent handle Agent receipt follow-up actions before model chat fallback', async () => {
    const onSuggestionClick = vi.fn();
    const onRecoveryAction = vi.fn(() => Promise.resolve(true));
    const onReceiptActionStateChange = vi.fn();
    root = renderMessageList(container, {
      onSuggestionClick,
      onRecoveryAction,
      onReceiptActionStateChange,
      messages: [
        {
          role: 'agentReceipt',
          receipt: {
            title: 'Workspace plan ready',
            status: 'done',
            mode: 'Review only',
            target: 'Workspace',
            intent: { type: 'workspace_plan' },
            changed: ['No workspace edits'],
            checked: ['Plan next step'],
            next: 'Choose a plan action.',
          },
        },
      ],
    });

    const auditButton = container.querySelector('[data-testid="agent-receipt-action-audit-quality"]');
    expect(auditButton).not.toBeNull();
    await act(async () => {
      auditButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(onRecoveryAction).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'audit-quality',
        displayText: 'Audit quality',
        localIntent: 'audit-package',
      }),
    );
    const actionKey = getAgentReceiptActionKey(
      buildAgentReceiptActions({ status: 'done', target: 'Workspace', intent: { type: 'workspace_plan' } })[0],
      0,
    );
    expect(onReceiptActionStateChange).toHaveBeenCalledWith(
      0,
      expect.objectContaining({ [actionKey]: { status: 'running' } }),
      expect.objectContaining({ key: actionKey, state: { status: 'running' } }),
    );
    expect(onReceiptActionStateChange).toHaveBeenCalledWith(
      0,
      expect.objectContaining({ [actionKey]: { status: 'done' } }),
      expect.objectContaining({ key: actionKey, state: { status: 'done' } }),
    );
    expect(auditButton.textContent).toBe('Done');
    expect(onSuggestionClick).not.toHaveBeenCalled();
  });
});
