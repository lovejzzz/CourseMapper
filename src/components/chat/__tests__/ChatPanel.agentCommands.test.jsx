/**
 * @vitest-environment happy-dom
 */
import React from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildAgentCommandItems } from '../AgentCommandStrip';
import ChatPanel from '../ChatPanel';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const chatRouterMock = vi.hoisted(() => ({
  messages: [],
  agentDryRun: false,
  isAgentProviderReady: true,
  send: vi.fn(),
  handleStop: vi.fn(),
  handleApproveSyncSuggestion: vi.fn(),
  handleSkipSyncSuggestion: vi.fn(),
  setAgentDryRun: vi.fn(),
  addLocalMessages: vi.fn(),
  updateLocalMessage: vi.fn(),
}));

const messageListMock = vi.hoisted(() => ({
  props: null,
}));
const progressHeaderMock = vi.hoisted(() => ({
  props: null,
}));
const chatInputMock = vi.hoisted(() => ({
  props: null,
}));
const aiConfigMock = vi.hoisted(() => ({
  provider: 'openai',
  apiKey: 'sk-test',
  apiStatus: 'connected',
  modelId: 'gpt-4o-mini',
}));

vi.mock('../MessageList', () => ({
  default: (props) => {
    messageListMock.props = props;
    return <div data-testid="messages" />;
  },
}));
vi.mock('../ChatInput', () => ({
  default: (props) => {
    chatInputMock.props = props;
    return <div data-testid="chat-input" />;
  },
}));
vi.mock('../PackageSummaryCard', () => ({ default: () => <div data-testid="package-summary" /> }));
vi.mock('../ProgressHeader', () => ({
  default: (props) => {
    progressHeaderMock.props = props;
    return <div data-testid="progress-header" />;
  },
}));
vi.mock('../CustomToolsMenu', () => ({ default: () => <div data-testid="custom-tools" /> }));
vi.mock('../../ExamReview', () => ({ default: () => <div data-testid="exam-review" /> }));
vi.mock('../../ModelConfig', () => ({ default: () => <div data-testid="model-config" /> }));
vi.mock('../../../contexts/AIConfigContext', () => ({
  useAIConfig: () => aiConfigMock,
}));
vi.mock('../useChatRouter', () => ({
  default: () => ({
    messages: chatRouterMock.messages,
    isStreaming: false,
    isAgentProviderReady: chatRouterMock.isAgentProviderReady,
    agentDryRun: chatRouterMock.agentDryRun,
    customTools: [],
    customToolSyncError: null,
    attachedFiles: [],
    isParsing: false,
    send: chatRouterMock.send,
    handleStop: chatRouterMock.handleStop,
    handleSelectProposal: vi.fn(),
    handleAcceptDiff: vi.fn(),
    handleRejectDiff: vi.fn(),
    handleApproveSyncSuggestion: chatRouterMock.handleApproveSyncSuggestion,
    handleSkipSyncSuggestion: chatRouterMock.handleSkipSyncSuggestion,
    regenerate: vi.fn(),
    feedback: vi.fn(),
    editAndResend: vi.fn(),
    retryFailedEdits: vi.fn(),
    keepAppliedChanges: vi.fn(),
    processFiles: vi.fn(),
    removeAttached: vi.fn(),
    addLocalMessages: chatRouterMock.addLocalMessages,
    updateLocalMessage: chatRouterMock.updateLocalMessage,
    setAgentDryRun: chatRouterMock.setAgentDryRun,
    deleteCustomTool: vi.fn(),
    importCustomTool: vi.fn(),
  }),
}));

const baseCourseMap = {
  courseName: 'Applied Policy',
  lessons: [{ title: 'Foundations' }],
};

const baseDeliverables = {
  lessonPlans: { status: 'done', data: { lessonPlans: [{ lessonTitle: 'Foundations' }] } },
};

function renderChatPanel(container, overrides = {}) {
  const root = createRoot(container);
  act(() => {
    root.render(
      <ChatPanel
        currentStep={null}
        modelName="GPT"
        error={null}
        streamDetail=""
        streamProgress={0}
        completenessInfo={null}
        isStopped={false}
        retryInfo={null}
        generationLog={[]}
        onStop={vi.fn()}
        onResume={vi.fn()}
        onClearAll={vi.fn()}
        onRetryExamine={vi.fn()}
        deliverables={baseDeliverables}
        selectedFeatures={['courseMap', 'lessonPlans']}
        columns={[]}
        deliverableConfig={{}}
        lessonScope={{ type: 'all', indices: [] }}
        delivProgress={{ done: 1, total: 1, perFeature: {} }}
        currentDelivFeatures={new Set()}
        isDelivGenerating={false}
        delivTimings={{}}
        packageQualityPass={{ status: 'idle' }}
        onStopDeliverables={vi.fn()}
        onPackageQualityPassUpdate={vi.fn()}
        onAutoRepairReadiness={vi.fn()}
        onFinalizePackage={vi.fn()}
        onGenerateFeatures={vi.fn()}
        onAuditPackage={vi.fn()}
        isSyncing={false}
        pendingSyncCount={0}
        syncingFeatures={new Set()}
        onRevision={vi.fn()}
        onDeliverableRevision={vi.fn()}
        isRevising={false}
        activeTab="lessonPlans"
        courseMap={baseCourseMap}
        slideTheme="default"
        chatHistory={[]}
        onChatHistoryChange={vi.fn()}
        pendingExamPatches={null}
        examChanges={[]}
        onAcceptPatches={vi.fn()}
        onRejectPatch={vi.fn()}
        onFocusExamPatch={vi.fn()}
        editor={{}}
        optimisticUpdate={vi.fn()}
        regenerateLesson={vi.fn()}
        delivUndoSnapshot={vi.fn()}
        delivUndoFn={vi.fn()}
        delivCanUndo={false}
        onAgentHighlight={vi.fn()}
        pendingSyncSuggestion={null}
        clearPendingSyncSuggestion={vi.fn()}
        executeSyncPlan={vi.fn()}
        clearSyncStalePlan={vi.fn()}
        notifyEdit={vi.fn()}
        chatSendRef={{ current: null }}
        uid="test-user"
        onConfigureAI={vi.fn()}
        onApiCallEvent={vi.fn()}
        {...overrides}
      />,
    );
  });
  return root;
}

async function waitForLocalMessageCall(predicate) {
  for (let attempt = 0; attempt < 50; attempt++) {
    const call = chatRouterMock.addLocalMessages.mock.calls.find(predicate);
    if (call) return call;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }
  return null;
}

function messagesFromCall(call) {
  if (!call) return [];
  return Array.isArray(call[0]) ? call[0] : [call[0]];
}

function progressFromUpdateCall(call) {
  if (!call || typeof call[1] !== 'function') return null;
  return call[1]({
    id: call[0]?.id || 'progress',
    role: 'agentProgress',
    status: 'running',
    steps: [],
    startedAt: Date.now(),
  });
}

function expectInitialLocalTurn({ text, assistantText, promptIncludes = null, progressTool = null }) {
  expect(chatRouterMock.addLocalMessages).toHaveBeenCalledWith(
    expect.arrayContaining([
      expect.objectContaining({
        role: 'user',
        text,
        ...(promptIncludes ? { agentPromptOverride: expect.stringContaining(promptIncludes) } : {}),
      }),
      { role: 'assistant', text: assistantText },
      ...(progressTool
        ? [
            expect.objectContaining({
              role: 'agentProgress',
              status: 'running',
              steps: [expect.objectContaining({ tool: progressTool, status: 'running' })],
            }),
          ]
        : []),
    ]),
  );
}

async function waitForAgentProgressMessage(predicate = () => true) {
  for (let attempt = 0; attempt < 50; attempt++) {
    for (const call of chatRouterMock.updateLocalMessage.mock.calls) {
      const candidate = progressFromUpdateCall(call);
      if (candidate?.role === 'agentProgress' && predicate(candidate)) return candidate;
    }
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }
  const call = await waitForLocalMessageCall((candidate) =>
    messagesFromCall(candidate).some((message) => message?.role === 'agentProgress' && predicate(message)),
  );
  return messagesFromCall(call).find((message) => message?.role === 'agentProgress' && predicate(message));
}

function getAgentCommandItem(id, options = {}) {
  const item = buildAgentCommandItems({
    activeTab: 'lessonPlans',
    agentDryRun: chatRouterMock.agentDryRun,
    syncFeatureCount: 0,
    canUndo: true,
    localOnly: !chatRouterMock.isAgentProviderReady,
    ...options,
  }).find((candidate) => candidate.id === id);
  expect(item, `Expected command item ${id}`).toBeTruthy();
  return item;
}

function runInputAgentCommand(id, options = {}) {
  chatInputMock.props.onAgentCommand(getAgentCommandItem(id, options));
}

describe('ChatPanel agent command strip', () => {
  let container;
  let root;

  beforeEach(() => {
    chatRouterMock.messages = [];
    chatRouterMock.agentDryRun = false;
    chatRouterMock.isAgentProviderReady = true;
    aiConfigMock.provider = 'openai';
    aiConfigMock.apiKey = 'sk-test';
    aiConfigMock.apiStatus = 'connected';
    aiConfigMock.modelId = 'gpt-4o-mini';
    chatRouterMock.send.mockReset();
    chatRouterMock.handleApproveSyncSuggestion.mockReset();
    chatRouterMock.handleSkipSyncSuggestion.mockReset();
    chatRouterMock.setAgentDryRun.mockReset();
    chatRouterMock.addLocalMessages.mockReset();
    chatRouterMock.updateLocalMessage.mockReset();
    messageListMock.props = null;
    progressHeaderMock.props = null;
    chatInputMock.props = null;
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

  it('sends input-resolved quick commands with a short display label and internal prompt override', () => {
    root = renderChatPanel(container);

    act(() => {
      runInputAgentCommand('improve-active');
    });

    expect(chatRouterMock.send).toHaveBeenCalledWith(
      'Improve Lesson Plans',
      expect.objectContaining({
        displayText: 'Improve Lesson Plans',
        agentPromptOverride: expect.stringContaining('Apply safe changes directly'),
      }),
    );
  });

  it('renders the package quality receipt as the newest conversation message', () => {
    chatRouterMock.messages = [{ id: 'assistant-note', role: 'assistant', text: 'I can finish the package.' }];
    root = renderChatPanel(container, {
      packageQualityPass: {
        status: 'ready',
        message: 'Ready to download.',
        blockers: 0,
        warnings: 0,
        repairsApplied: 0,
        receipt: {
          checkedItems: ['No issues to fix', 'Classroom checks passed', 'Exports verified'],
          checkedSections: '10/10',
          lessonCount: 5,
          exportChecked: 9,
          exportFailed: 0,
          exportWarningCount: 0,
          apiSpendSummary: '$0.05',
          trustBoundary: {
            items: [{ id: 'source', label: 'Course source', value: '5 lessons' }],
          },
        },
      },
    });

    expect(container.querySelector('[data-testid="package-summary"]')).toBeNull();
    expect(messageListMock.props.messages).toHaveLength(2);
    expect(messageListMock.props.messages[1]).toMatchObject({
      role: 'packageSummary',
      source: 'package-quality-pass',
      summary: expect.objectContaining({
        ready: true,
        confidence: 'Excellent',
        checkedSections: '10/10',
        lessonCount: 5,
        exportChecked: 9,
        apiSpendSummary: '$0.05',
        trustBoundary: {
          items: [{ id: 'source', label: 'Course source', value: '5 lessons' }],
        },
      }),
    });
  });

  it('passes pending chat sync suggestions into the progress header', async () => {
    chatRouterMock.messages = [
      {
        role: 'syncSuggestion',
        status: 'pending',
        plan: [{ featureId: 'lessonPlans' }],
      },
    ];
    root = renderChatPanel(container, {
      currentStep: 'generating',
      packageQualityPass: { status: 'idle' },
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(progressHeaderMock.props.pendingSyncCount).toBe(1);
  });

  it('keeps completed package readiness out of the fixed progress header', async () => {
    root = renderChatPanel(container, {
      currentStep: 'done',
      packageQualityPass: {
        status: 'ready',
        message: 'Ready to download.',
        blockers: 0,
        warnings: 0,
        receipt: { checkedSections: '10/10', lessonCount: 5 },
      },
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(container.querySelector('[data-testid="progress-header"]')).toBeNull();
    expect(progressHeaderMock.props).toBeNull();
    expect(messageListMock.props.messages.at(-1)).toMatchObject({
      role: 'packageSummary',
      summary: expect.objectContaining({ ready: true }),
    });
  });

  it('opens Agent help locally without a model call', () => {
    root = renderChatPanel(container, {
      lessonScope: { type: 'specific', indices: [0] },
      delivCanUndo: true,
    });

    act(() => {
      runInputAgentCommand('agent-help');
    });

    expect(chatRouterMock.addLocalMessages).toHaveBeenCalledWith([
      { role: 'user', text: 'Show agent help' },
      {
        role: 'agentHelp',
        help: expect.objectContaining({
          activeTarget: 'Lesson Plans',
          providerReady: true,
          agentDryRun: false,
          lessonScopeText: 'Foundations',
          syncFeatureCount: 0,
          canUndo: true,
        }),
      },
    ]);
    expect(chatRouterMock.send).not.toHaveBeenCalled();
  });

  it('keeps restored-project recovery inside the workspace when the saved key fails', () => {
    aiConfigMock.apiStatus = 'error';
    chatRouterMock.isAgentProviderReady = false;
    root = renderChatPanel(container);

    const banner = container.querySelector('[data-testid="workspace-model-recovery-banner"]');
    expect(banner).not.toBeNull();
    expect(banner.textContent).toContain('Model connection failed');
    expect(banner.textContent).toContain('Change key/model');

    const action = container.querySelector('[data-testid="workspace-model-recovery-action"]');
    act(() => {
      action.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.querySelector('[data-testid="workspace-model-config-overlay"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="model-config"]')).not.toBeNull();
  });

  it('shows no-credit recovery copy and keeps local commands available', () => {
    aiConfigMock.apiStatus = 'no_funds';
    chatRouterMock.isAgentProviderReady = false;
    root = renderChatPanel(container, { delivCanUndo: true });

    expect(container.querySelector('[data-testid="workspace-model-recovery-banner"]')?.textContent).toContain(
      'Model credits unavailable',
    );
    expect(container.querySelector('[data-testid="agent-command-strip"]')).toBeNull();
    expect(chatInputMock.props.isAgentProviderReady).toBe(false);
    expect(chatInputMock.props.canUndo).toBe(true);
    expect(messageListMock.props.onStarterAction).toEqual(expect.any(Function));
    expect(container.querySelector('[data-testid="agent-command-finish-package"]')).toBeNull();
  });

  it('does not expose Review-only mode switching', () => {
    root = renderChatPanel(container);

    const reviewModeButton = container.querySelector('[data-testid="agent-command-set-review-mode"]');
    expect(reviewModeButton).toBeNull();
    expect(chatRouterMock.setAgentDryRun).not.toHaveBeenCalled();
    expect(chatRouterMock.addLocalMessages).not.toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ text: 'Switch to Review only' })]),
    );
    expect(chatRouterMock.send).not.toHaveBeenCalled();
  });

  it('does not expose Auto-fix mode switching', () => {
    chatRouterMock.agentDryRun = true;
    root = renderChatPanel(container);

    const autoFixButton = container.querySelector('[data-testid="agent-command-set-auto-fix-mode"]');
    expect(autoFixButton).toBeNull();
    expect(chatRouterMock.setAgentDryRun).not.toHaveBeenCalled();
    expect(chatRouterMock.send).not.toHaveBeenCalled();
  });

  it('sets a narrower lesson scope locally from the typed Agent command', async () => {
    const onLessonScopeChange = vi.fn();
    const onPackageQualityPassUpdate = vi.fn();
    root = renderChatPanel(container, {
      courseMap: {
        courseName: 'Applied Policy',
        lessons: [{ title: 'Foundations' }, { title: 'Policy Tools' }, { title: 'Evidence' }],
      },
      onLessonScopeChange,
      onPackageQualityPassUpdate,
    });

    await act(async () => {
      await chatInputMock.props.onAgentCommand({
        id: 'set-lesson-scope',
        displayText: 'Change scope to 2 lessons',
        targetLessonCount: 2,
        requestedScope: 'count',
      });
    });

    expect(onLessonScopeChange).toHaveBeenCalledWith({ type: 'specific', indices: [0, 1] });
    expect(onPackageQualityPassUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'idle',
        message: expect.stringContaining('Scope changed to 2 lessons'),
      }),
    );
    expect(chatRouterMock.addLocalMessages).toHaveBeenCalledWith([
      { role: 'user', text: 'Change scope to 2 lessons' },
      {
        role: 'agentReceipt',
        receipt: expect.objectContaining({
          title: 'Scope receipt',
          status: 'done',
          mode: 'Local',
          target: 'Lesson scope',
          changed: ['Working set scope: the first 2 of 3 lessons'],
        }),
      },
      { role: 'assistant', text: 'Scope updated to the first 2 of 3 lessons.' },
    ]);
    expect(chatRouterMock.send).not.toHaveBeenCalled();
  });

  it('expands lesson scope through a deterministic course-map patch receipt', async () => {
    const onLessonScopeChange = vi.fn();
    const onPackageQualityPassUpdate = vi.fn();
    const handleAddLessons = vi.fn(() => [2, 3]);
    root = renderChatPanel(container, {
      courseMap: {
        courseName: 'Applied Policy',
        lessons: [
          { title: 'Foundations', sections: [{ topicSection: 'Policy foundations' }] },
          { title: 'Policy Tools', sections: [{ topicSection: 'Policy tools' }] },
        ],
      },
      onLessonScopeChange,
      onPackageQualityPassUpdate,
      editor: { handleAddLessons },
    });

    await act(async () => {
      await chatInputMock.props.onAgentCommand({
        id: 'set-lesson-scope',
        displayText: 'Change scope to 4 lessons',
        targetLessonCount: 4,
        requestedScope: 'count',
      });
    });

    expect(handleAddLessons).toHaveBeenCalledTimes(1);
    expect(handleAddLessons.mock.calls[0][0]).toHaveLength(2);
    expect(handleAddLessons.mock.calls[0][0][0]).toMatchObject({
      lessonIndex: 2,
      title: 'Lesson 3: Applied Extension',
      sections: [expect.objectContaining({ topicSection: expect.stringContaining('Policy tools') })],
    });
    expect(onLessonScopeChange).toHaveBeenCalledWith({ type: 'all', indices: [] });
    expect(onPackageQualityPassUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'idle',
        message: expect.stringContaining('all 4 lessons'),
      }),
    );
    expect(chatRouterMock.addLocalMessages).toHaveBeenCalledWith([
      { role: 'user', text: 'Change scope to 4 lessons' },
      {
        role: 'agentReceipt',
        receipt: expect.objectContaining({
          title: 'Scope receipt',
          status: 'done',
          changed: expect.arrayContaining([
            'Updated blueprint: added Lesson 3, Lesson 4',
            'Working set scope: all 4 lessons',
            'Compiler sync queued: Lesson Plans',
          ]),
          checked: expect.arrayContaining(['Canonical patch: 2 addLesson patches', 'Model calls: 0']),
          runStats: { providerCallCount: 0 },
        }),
      },
      {
        role: 'assistant',
        text: expect.stringContaining('Scope updated to all 4 lessons'),
      },
    ]);
    expect(chatRouterMock.send).not.toHaveBeenCalled();
  });

  it('runs the Finish command directly through package finalization when edits are allowed', async () => {
    const onFinalizePackage = vi.fn(() =>
      Promise.resolve({
        packageQualityStatus: 'ready',
        repairsApplied: 1,
        repairs: [
          {
            featureId: 'lessonPlans',
            label: 'Lesson Plans',
            success: true,
            changes: ['normalized lesson plan timing'],
          },
        ],
        readiness: { blockers: [], warnings: [] },
      }),
    );
    root = renderChatPanel(container, { onFinalizePackage });

    await act(async () => {
      runInputAgentCommand('finish-package');
    });

    expect(onFinalizePackage).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedFeatures: ['courseMap', 'lessonPlans'],
        selectedFeatureIds: ['courseMap', 'lessonPlans'],
        lessonFilter: null,
        retry: true,
        source: 'agent-command',
        maxRetryActions: 10,
        maxRetryCallBudget: 14,
        maxRetryPasses: 3,
      }),
    );
    expectInitialLocalTurn({
      text: 'Finish package',
      assistantText: 'Running package finishing from the Agent command.',
      promptIncludes: 'Finish the course package',
      progressTool: 'finalize_package',
    });
    expect(chatRouterMock.addLocalMessages).toHaveBeenCalledWith([
      expect.objectContaining({
        role: 'agentReceipt',
        receipt: expect.objectContaining({
          title: 'Package receipt',
          status: 'done',
          target: 'Package',
          stateDiffs: [
            expect.objectContaining({
              status: 'changed',
              action: 'repair_package_readiness',
              target: 'Lesson Plans',
              after: 'normalized lesson plan timing',
            }),
          ],
        }),
      }),
      { role: 'assistant', text: 'Package finishing finished. Safe checks passed and the export panel is ready.' },
      expect.objectContaining({
        role: 'packageSummary',
        summary: expect.objectContaining({
          ready: true,
          lessonCount: 1,
          trustBoundary: expect.objectContaining({ items: expect.any(Array) }),
        }),
      }),
    ]);
    const progress = await waitForAgentProgressMessage((message) =>
      message.steps?.some((step) => step.tool === 'finalize_package'),
    );
    expect(progress).toMatchObject({
      role: 'agentProgress',
      status: 'complete',
      runMeta: { mode: 'Package finish', target: 'Package', model: 'Local tools' },
      steps: [
        expect.objectContaining({
          tool: 'repair_package_readiness',
          status: 'done',
          stateDiffs: [
            expect.objectContaining({
              status: 'changed',
              action: 'repair_package_readiness',
              target: 'Lesson Plans',
            }),
          ],
        }),
        expect.objectContaining({ tool: 'finalize_package', status: 'done' }),
      ],
    });
    expect(chatRouterMock.send).not.toHaveBeenCalled();
  });

  it('runs the Finish starter directly through package finalization without model chat', async () => {
    const onFinalizePackage = vi.fn(() =>
      Promise.resolve({
        packageQualityStatus: 'ready',
        readiness: { blockers: [], warnings: [] },
      }),
    );
    root = renderChatPanel(container, { onFinalizePackage });

    let handled;
    await act(async () => {
      handled = messageListMock.props.onStarterAction({
        text: 'Finish package',
        action: 'finish-package',
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(handled).toBe(true);
    expect(onFinalizePackage).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedFeatures: ['courseMap', 'lessonPlans'],
        selectedFeatureIds: ['courseMap', 'lessonPlans'],
        retry: true,
        source: 'agent-starter',
      }),
    );
    expectInitialLocalTurn({
      text: 'Finish package',
      assistantText: 'Running package finishing from the Agent starter.',
      progressTool: 'finalize_package',
    });
    expect(chatRouterMock.addLocalMessages).toHaveBeenCalledWith([
      expect.objectContaining({
        role: 'agentReceipt',
        receipt: expect.objectContaining({ title: 'Package receipt', status: 'done', target: 'Package' }),
      }),
      { role: 'assistant', text: 'Package finishing finished. Safe checks passed and the export panel is ready.' },
      expect.objectContaining({
        role: 'packageSummary',
        summary: expect.objectContaining({
          ready: true,
          lessonCount: 1,
          trustBoundary: expect.objectContaining({ items: expect.any(Array) }),
        }),
      }),
    ]);
    expect(chatRouterMock.send).not.toHaveBeenCalled();
  });

  it('runs the Audit command directly and posts a package summary card', async () => {
    const onAuditPackage = vi.fn(() =>
      Promise.resolve({
        confidence: 'Excellent',
        nextAction: 'Read-only audit passed.',
        readiness: {
          blockerCount: 0,
          warningCount: 0,
          blockers: [],
          warnings: [],
          checkedSections: '2/2',
          lessonCount: 1,
        },
        classroomReadiness: {
          status: 'ready',
          blockerCount: 0,
          warningCount: 0,
          blockers: [],
          warnings: [],
        },
        validation: { errorCount: 0, warningCount: 0, findings: [] },
        exportVerification: { status: 'passed', checked: 4, failed: 0, warningCount: 0, checks: [] },
      }),
    );
    root = renderChatPanel(container, { onAuditPackage });

    await act(async () => {
      runInputAgentCommand('audit-quality');
    });

    expect(onAuditPackage).toHaveBeenCalledWith({
      selectedFeatureIds: ['courseMap', 'lessonPlans'],
      lessonFilter: null,
    });
    expectInitialLocalTurn({
      text: 'Audit quality',
      assistantText: 'Running a read-only package audit from the Agent command.',
      promptIncludes: 'Audit this workspace without applying changes',
      progressTool: 'review_package_readiness',
    });
    expect(chatRouterMock.addLocalMessages).toHaveBeenCalledWith([
      expect.objectContaining({
        role: 'packageSummary',
        summary: expect.objectContaining({
          confidence: 'Excellent',
          ready: true,
          exportChecked: 4,
        }),
      }),
      expect.objectContaining({
        role: 'agentReceipt',
        receipt: expect.objectContaining({ title: 'Audit receipt', status: 'done', mode: 'Local audit' }),
      }),
      { role: 'assistant', text: 'Audit complete. No blockers found in the read-only checks.' },
    ]);
    const progress = await waitForAgentProgressMessage((message) =>
      message.steps?.some((step) => step.tool === 'verify_package_exports'),
    );
    expect(progress).toMatchObject({
      role: 'agentProgress',
      status: 'complete',
      runMeta: { mode: 'Local audit', target: 'Package', model: 'Local tools' },
      steps: [
        expect.objectContaining({ tool: 'review_package_readiness', status: 'done' }),
        expect.objectContaining({ tool: 'validate_course', status: 'done' }),
        expect.objectContaining({ tool: 'verify_package_exports', status: 'done' }),
      ],
    });
    expect(chatRouterMock.send).not.toHaveBeenCalled();
  });

  it('keeps Finish as package finalization even when legacy dry-run state exists', async () => {
    chatRouterMock.agentDryRun = true;
    const onAuditPackage = vi.fn(() =>
      Promise.resolve({
        confidence: 'Excellent',
        readiness: { blockerCount: 0, warningCount: 0, blockers: [], warnings: [] },
        classroomReadiness: { status: 'ready', blockerCount: 0, warningCount: 0, blockers: [], warnings: [] },
        validation: { errorCount: 0, warningCount: 0, findings: [] },
        exportVerification: { status: 'passed', checked: 4, failed: 0, warningCount: 0, checks: [] },
      }),
    );
    const onFinalizePackage = vi.fn();
    root = renderChatPanel(container, { onAuditPackage, onFinalizePackage });

    await act(async () => {
      runInputAgentCommand('finish-package');
    });

    expect(onAuditPackage).not.toHaveBeenCalled();
    expect(onFinalizePackage).toHaveBeenCalled();
    expectInitialLocalTurn({
      text: 'Finish package',
      assistantText: 'Running package finishing from the Agent command.',
      promptIncludes: 'Finish the course package until it is ready to download',
      progressTool: 'finalize_package',
    });
    expect(chatRouterMock.send).not.toHaveBeenCalled();
  });

  it('keeps the Finish command local when package checking is already running', async () => {
    const onFinalizePackage = vi.fn();
    root = renderChatPanel(container, {
      onFinalizePackage,
      packageQualityPass: { status: 'running' },
    });

    await act(async () => {
      runInputAgentCommand('finish-package');
    });

    expect(onFinalizePackage).not.toHaveBeenCalled();
    expect(chatRouterMock.send).not.toHaveBeenCalled();
    expect(chatRouterMock.addLocalMessages).toHaveBeenCalledWith([
      { role: 'user', text: 'Finish package' },
      {
        role: 'assistant',
        text: "I'm already checking the package. Wait for that to finish, then run Finish package again.",
      },
    ]);
  });

  it('keeps starter actions local during generation busy states', async () => {
    const onFinalizePackage = vi.fn();
    root = renderChatPanel(container, {
      isDelivGenerating: true,
      onFinalizePackage,
    });

    let handled;
    await act(async () => {
      handled = messageListMock.props.onStarterAction({
        text: 'Finish package',
        action: 'finish-package',
      });
    });

    expect(handled).toBe(true);
    expect(onFinalizePackage).not.toHaveBeenCalled();
    expect(chatRouterMock.send).not.toHaveBeenCalled();
    expect(chatRouterMock.addLocalMessages).toHaveBeenCalledWith([
      { role: 'user', text: 'Finish package' },
      {
        role: 'assistant',
        text: "I'm still generating course materials. Wait for generation to finish, then run Finish package again.",
      },
    ]);
  });

  it('falls back to the Agent prompt for Audit when the direct audit callback is unavailable', async () => {
    root = renderChatPanel(container, { onAuditPackage: undefined });

    await act(async () => {
      runInputAgentCommand('audit-quality');
    });

    expect(chatRouterMock.send).toHaveBeenCalledWith(
      'Audit quality',
      expect.objectContaining({
        displayText: 'Audit quality',
        agentPromptOverride: expect.stringContaining('Audit this workspace without applying changes'),
      }),
    );
  });

  it('runs the Plan command directly and posts a workspace plan card without a model call', async () => {
    root = renderChatPanel(container);

    await act(async () => {
      runInputAgentCommand('plan-next');
    });

    expectInitialLocalTurn({
      text: 'Plan next step',
      assistantText: 'Inspecting the workspace and building a plan from the Agent command.',
      promptIncludes: 'Call inspect_workspace first',
      progressTool: 'inspect_workspace',
    });
    const planCall = await waitForLocalMessageCall((call) => {
      const messages = call[0];
      return Array.isArray(messages) && messages[0]?.role === 'workspacePlan';
    });
    expect(planCall?.[0]).toEqual([
      expect.objectContaining({
        role: 'workspacePlan',
        plan: expect.objectContaining({
          executionMode: 'safe-edit',
          actions: expect.any(Array),
        }),
      }),
      expect.objectContaining({
        role: 'agentReceipt',
        receipt: expect.objectContaining({ title: 'Planning receipt', status: 'done', target: 'Workspace' }),
      }),
      expect.objectContaining({
        role: 'assistant',
        text: expect.stringContaining('Plan ready.'),
      }),
    ]);
    expect(planCall[0][0].plan.actions.length).toBeGreaterThan(0);
    const progress = await waitForAgentProgressMessage((message) =>
      message.steps?.some((step) => step.tool === 'plan_workspace_next_step'),
    );
    expect(progress).toMatchObject({
      role: 'agentProgress',
      status: 'complete',
      runMeta: { mode: 'Workspace plan', target: 'Workspace', model: 'Local tools' },
      steps: [
        expect.objectContaining({ tool: 'inspect_workspace', status: 'done' }),
        expect.objectContaining({ tool: 'plan_workspace_next_step', status: 'done' }),
      ],
    });
    expect(chatRouterMock.send).not.toHaveBeenCalled();
  });

  it('persists workspace plan action states into the chat message', () => {
    root = renderChatPanel(container);
    const actionStates = {
      'audit_package|P0|Run audit|Package|lessonPlans': { status: 'done' },
    };

    act(() => {
      messageListMock.props.onWorkspacePlanActionStateChange(3, actionStates);
    });

    expect(chatRouterMock.updateLocalMessage).toHaveBeenCalledTimes(1);
    const [matcher, updater] = chatRouterMock.updateLocalMessage.mock.calls[0];
    expect(matcher({ role: 'workspacePlan' }, 3)).toBe(true);
    expect(matcher({ role: 'workspacePlan' }, 2)).toBe(false);
    expect(matcher({ role: 'assistant' }, 3)).toBe(false);

    expect(updater({ role: 'workspacePlan', plan: { actions: [] } })).toEqual({
      role: 'workspacePlan',
      actionStates,
      plan: { actions: [], actionStates },
    });
  });

  it('persists Agent receipt action states into the chat message', () => {
    root = renderChatPanel(container);
    const actionStates = {
      'audit-quality|Audit quality|audit-package|agent-receipt': { status: 'done' },
    };

    act(() => {
      messageListMock.props.onReceiptActionStateChange(4, actionStates);
    });

    expect(chatRouterMock.updateLocalMessage).toHaveBeenCalledTimes(1);
    const [matcher, updater] = chatRouterMock.updateLocalMessage.mock.calls[0];
    expect(matcher({ role: 'agentReceipt' }, 4)).toBe(true);
    expect(matcher({ role: 'agentReceipt' }, 3)).toBe(false);
    expect(matcher({ role: 'workspacePlan' }, 4)).toBe(false);

    expect(updater({ role: 'agentReceipt', receipt: { title: 'Planning receipt' } })).toEqual({
      role: 'agentReceipt',
      actionStates,
      receipt: { title: 'Planning receipt', actionStates },
    });
  });

  it('routes package issue recovery through local package audit', async () => {
    const onAuditPackage = vi.fn(() =>
      Promise.resolve({
        confidence: 'Good with assumptions',
        nextAction: 'Review package issue.',
        readiness: { blockerCount: 0, warningCount: 1, blockers: [], warnings: [] },
        classroomReadiness: { status: 'warnings', blockerCount: 0, warningCount: 1, blockers: [], warnings: [] },
        validation: { errorCount: 0, warningCount: 0, findings: [] },
        exportVerification: { status: 'passed', checked: 4, failed: 0, warningCount: 0, checks: [] },
      }),
    );
    root = renderChatPanel(container, { onAuditPackage });

    let handled;
    await act(async () => {
      handled = await messageListMock.props.onRecoveryAction({
        id: 'review-package-issues',
        displayText: 'Review package issues',
        localIntent: 'audit-package',
        prompt: 'Review the package issues from the previous Agent run.',
      });
    });

    expect(handled).toBe(true);
    expect(onAuditPackage).toHaveBeenCalledWith({
      selectedFeatureIds: ['courseMap', 'lessonPlans'],
      lessonFilter: null,
    });
    expectInitialLocalTurn({
      text: 'Review package issues',
      assistantText: 'Running a read-only package audit for the previous Agent issues.',
      promptIncludes: 'previous Agent run',
      progressTool: 'review_package_readiness',
    });
    expect(chatRouterMock.send).not.toHaveBeenCalled();
  });

  it('routes recovery planning through the local workspace planner', async () => {
    root = renderChatPanel(container);

    let handled;
    await act(async () => {
      handled = await messageListMock.props.onRecoveryAction({
        id: 'plan-recovery',
        displayText: 'Plan recovery',
        localIntent: 'plan-next',
        prompt: 'Inspect the failed or partial Agent run and plan the recovery path.',
      });
    });

    expect(handled).toBe(true);
    expectInitialLocalTurn({
      text: 'Plan recovery',
      assistantText: 'Inspecting the workspace and planning recovery from the previous Agent issues.',
      promptIncludes: 'failed or partial Agent run',
      progressTool: 'inspect_workspace',
    });
    const planCall = await waitForLocalMessageCall((call) => {
      const messages = call[0];
      return Array.isArray(messages) && messages[0]?.role === 'workspacePlan';
    });
    expect(planCall?.[0][0]).toMatchObject({
      role: 'workspacePlan',
      plan: expect.objectContaining({ actions: expect.any(Array) }),
    });
    expect(chatRouterMock.send).not.toHaveBeenCalled();
  });

  it('runs the Undo command directly and posts a local receipt', async () => {
    const delivUndoFn = vi.fn();
    root = renderChatPanel(container, { delivCanUndo: true, delivUndoFn });

    const undoCommand = buildAgentCommandItems({ activeTab: 'lessonPlans', canUndo: true }).find(
      (item) => item.id === 'undo-last',
    );
    expect(undoCommand).not.toBeNull();
    await act(async () => {
      await chatInputMock.props.onAgentCommand(undoCommand);
    });

    expect(delivUndoFn).toHaveBeenCalledTimes(1);
    expectInitialLocalTurn({
      text: 'Undo last change',
      assistantText: 'Undoing the last deliverable edit from the Agent command.',
      promptIncludes: 'undo_last',
      progressTool: 'undo_last',
    });
    expect(chatRouterMock.addLocalMessages).toHaveBeenCalledWith([
      expect.objectContaining({
        role: 'agentReceipt',
        receipt: expect.objectContaining({
          title: 'Undo receipt',
          status: 'done',
          target: 'Lesson Plans',
          stateDiffs: [
            expect.objectContaining({
              status: 'changed',
              action: 'undo_last',
              target: 'Lesson Plans',
              before: 'Latest deliverable state',
              after: 'Previous deliverable snapshot restored.',
            }),
          ],
        }),
      }),
      {
        role: 'assistant',
        text: 'Last Lesson Plans change undone. Run Plan or Audit if you want me to check the workspace again.',
      },
    ]);
    const progress = await waitForAgentProgressMessage((message) =>
      message.steps?.some((step) => step.tool === 'undo_last'),
    );
    expect(progress).toMatchObject({
      role: 'agentProgress',
      status: 'complete',
      runMeta: { mode: 'Undo', target: 'Lesson Plans', model: 'Local tools' },
      steps: [
        expect.objectContaining({
          tool: 'undo_last',
          status: 'done',
          targets: ['Lesson Plans'],
          stateDiffs: [
            expect.objectContaining({
              status: 'changed',
              action: 'undo_last',
              target: 'Lesson Plans',
            }),
          ],
        }),
      ],
    });
    expect(chatRouterMock.send).not.toHaveBeenCalled();
  });

  it('does not render the command strip before generated deliverables exist', () => {
    root = renderChatPanel(container, { deliverables: {} });

    expect(container.querySelector('[data-testid="agent-command-strip"]')).toBeNull();
  });

  it('keeps the workspace identity as Agent during generation without enabling command buttons', () => {
    root = renderChatPanel(container, {
      currentStep: 'generating',
      isDelivGenerating: true,
      deliverables: { lessonPlans: { status: 'loading', data: null } },
    });

    expect(container.querySelector('h2')?.textContent).toBe('Agent');
    expect(container.textContent).toContain('Building');
    expect(container.textContent).toContain('Lesson Plans · Using your starting request');
    expect(container.querySelector('[data-testid="agent-command-strip"]')).toBeNull();
  });

  it('shows the carried landing context as compact Agent panel state', () => {
    chatRouterMock.messages = [
      {
        role: 'user',
        source: 'landing-context',
        meta: {
          source: 'landing-context',
          hasPrompt: true,
          fileCount: 2,
          fileNames: ['starter-notebook-outline.txt', 'model-card-template.docx'],
          hiddenFileCount: 0,
        },
        text: [
          'Here is what I am starting with.',
          '',
          'Starting request:',
          'Build a 2-week applied machine learning lab.',
          '',
          'Uploaded materials:',
          '- starter-notebook-outline.txt',
          '- model-card-template.docx',
        ].join('\n'),
      },
    ];

    root = renderChatPanel(container);

    const contextStrip = container.querySelector('[data-testid="agent-context-strip"]');
    expect(contextStrip).not.toBeNull();
    expect(contextStrip.textContent).toContain('Project brief');
    expect(contextStrip.textContent).toContain('Starting request + starter-notebook-outline.txt +1');
  });

  it('runs safe package-finish plan actions directly through the app callback', async () => {
    const onFinalizePackage = vi.fn(() =>
      Promise.resolve({
        packageQualityStatus: 'ready',
        readiness: { blockers: [], warnings: [] },
      }),
    );
    root = renderChatPanel(container, { onFinalizePackage });

    let handled;
    await act(async () => {
      handled = await messageListMock.props.onWorkspacePlanAction(
        {
          title: 'Clear package readiness blockers',
          safeMode: 'safe-edit',
          intent: { type: 'clear_readiness_blockers', featureIds: ['lessonPlans'] },
        },
        { displayText: 'Fix: Clear package readiness blockers' },
      );
    });

    expect(handled).toBe(true);
    expect(onFinalizePackage).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedFeatures: ['courseMap', 'lessonPlans'],
        selectedFeatureIds: ['courseMap', 'lessonPlans'],
        retry: true,
        source: 'agent-plan',
      }),
    );
    expectInitialLocalTurn({
      text: 'Fix: Clear package readiness blockers',
      assistantText: 'Running package finishing from the workspace plan.',
      progressTool: 'finalize_package',
    });
    expect(chatRouterMock.addLocalMessages).toHaveBeenCalledWith([
      expect.objectContaining({
        role: 'agentReceipt',
        receipt: expect.objectContaining({ title: 'Package receipt', status: 'done', target: 'Package' }),
      }),
      { role: 'assistant', text: 'Package finishing finished. Safe checks passed and the export panel is ready.' },
      expect.objectContaining({
        role: 'packageSummary',
        summary: expect.objectContaining({
          ready: true,
          lessonCount: 1,
          trustBoundary: expect.objectContaining({ items: expect.any(Array) }),
        }),
      }),
    ]);
    expect(chatRouterMock.send).not.toHaveBeenCalled();
  });

  it('runs matching pending sync plan actions directly through the existing sync suggestion', async () => {
    const selectedQuizPlan = { featureId: 'quizBank', lessonIndices: [0] };
    const unrelatedPlan = { featureId: 'rubrics', lessonIndices: [0] };
    chatRouterMock.messages = [
      {
        role: 'syncSuggestion',
        id: 'sync-1',
        status: 'pending',
        plan: [selectedQuizPlan, unrelatedPlan],
        changedFieldsSummary: 'lesson title',
      },
    ];
    chatRouterMock.handleApproveSyncSuggestion.mockResolvedValue(undefined);
    root = renderChatPanel(container);

    expect(messageListMock.props.workspacePlanActionCapabilities).toMatchObject({
      sync_stale_deliverables: { featureIds: ['quizBank', 'rubrics'] },
    });

    let handled;
    await act(async () => {
      handled = await messageListMock.props.onWorkspacePlanAction(
        {
          title: 'Sync stale deliverables: Quiz & Exam Bank',
          target: 'Quiz & Exam Bank',
          safeMode: 'needs-approval',
          intent: { type: 'sync_stale_deliverables', featureIds: ['quizBank'] },
        },
        { displayText: 'Sync: Sync stale deliverables: Quiz & Exam Bank' },
      );
    });

    expect(handled).toBe(true);
    expect(chatRouterMock.handleApproveSyncSuggestion).toHaveBeenCalledWith('sync-1', [selectedQuizPlan]);
    expectInitialLocalTurn({
      text: 'Sync: Sync stale deliverables: Quiz & Exam Bank',
      assistantText: 'Syncing Quiz & Exam Bank from the workspace plan.',
      progressTool: 'edit_deliverables',
    });
    expect(chatRouterMock.addLocalMessages).toHaveBeenCalledWith([
      expect.objectContaining({
        role: 'agentReceipt',
        receipt: expect.objectContaining({ title: 'Sync receipt', status: 'done', target: 'Quiz & Exam Bank' }),
      }),
      {
        role: 'assistant',
        text: 'Sync request finished for Quiz & Exam Bank. Check the sync card for the final status.',
      },
    ]);
    expect(chatRouterMock.send).not.toHaveBeenCalled();
  });

  it('posts a canonical blueprint receipt after approving a canonical sync plan', async () => {
    const canonicalPatch = {
      lessonIndex: 3,
      sectionIndex: 0,
      field: 'learningObjectives',
      label: 'learning objectives',
      value: 'Compare policy options using evidence.',
    };
    const lessonPlanSync = {
      featureId: 'lessonPlans',
      lessonIndices: [3],
      canonicalPatches: [canonicalPatch],
    };
    chatRouterMock.messages = [
      {
        role: 'syncSuggestion',
        id: 'sync-blueprint-1',
        status: 'pending',
        editSource: 'artifactBlueprint',
        plan: [lessonPlanSync],
        changedFieldsSummary: 'learning objectives',
      },
    ];
    chatRouterMock.handleApproveSyncSuggestion.mockResolvedValue({
      status: 'done',
      selectedPlan: [lessonPlanSync],
      syncSummary: {
        providerCallCount: 0,
        appliedCanonicalPatches: [canonicalPatch],
        completedFeatureIds: ['lessonPlans'],
      },
    });
    root = renderChatPanel(container);

    let handled;
    await act(async () => {
      handled = await messageListMock.props.onWorkspacePlanAction(
        {
          title: 'Sync stale deliverables: Lesson Plans',
          target: 'Lesson Plans',
          safeMode: 'needs-approval',
          intent: { type: 'sync_stale_deliverables', featureIds: ['lessonPlans'] },
        },
        { displayText: 'Sync: Sync stale deliverables: Lesson Plans' },
      );
    });

    expect(handled).toBe(true);
    expect(chatRouterMock.handleApproveSyncSuggestion).toHaveBeenCalledWith('sync-blueprint-1', [lessonPlanSync]);
    expect(chatRouterMock.addLocalMessages).toHaveBeenCalledWith([
      expect.objectContaining({
        role: 'agentReceipt',
        receipt: expect.objectContaining({
          title: 'Blueprint sync receipt',
          status: 'done',
          target: 'Lesson Plans',
          changed: ['Updated blueprint: Lesson 4 learning objectives'],
          checked: ['Recompiled: Lesson Plans', 'Model calls: 0'],
          runStats: { providerCallCount: 0 },
        }),
      }),
      {
        role: 'assistant',
        text: 'Blueprint sync finished for Lesson Plans. Check the sync card for the final status.',
      },
    ]);
    expect(chatRouterMock.send).not.toHaveBeenCalled();
  });

  it('clears stale marks and posts a local-only receipt when skipping a pending sync suggestion', async () => {
    const lessonPlanSync = {
      featureId: 'lessonPlans',
      lessonIndices: [0],
      staleEdits: { lessonIndices: [0], sourceFeatureId: 'lessonPlans', canonicalSync: true },
      canonicalPatches: [
        {
          lessonIndex: 0,
          sectionIndex: 0,
          field: 'learningObjectives',
          label: 'learning objectives',
          value: 'Analyze evidence quality.',
        },
      ],
    };
    const clearSyncStalePlan = vi.fn();
    chatRouterMock.messages = [
      {
        role: 'syncSuggestion',
        id: 'sync-local-1',
        status: 'pending',
        editSource: 'artifactBlueprint',
        plan: [lessonPlanSync],
        changedFieldsSummary: 'learning objectives',
      },
    ];
    root = renderChatPanel(container, { clearSyncStalePlan });

    await act(async () => {
      messageListMock.props.onSkipSyncSuggestion('sync-local-1');
    });

    expect(clearSyncStalePlan).toHaveBeenCalledWith([lessonPlanSync]);
    expect(chatRouterMock.handleSkipSyncSuggestion).toHaveBeenCalledWith('sync-local-1');
    expect(chatRouterMock.addLocalMessages).toHaveBeenCalledWith([
      expect.objectContaining({
        role: 'agentReceipt',
        receipt: expect.objectContaining({
          title: 'Local edit receipt',
          badge: 'Kept local',
          target: 'Lesson Plans',
          changed: ['Kept artifact edit local'],
          checked: ['Blueprint unchanged', 'Compiler sync skipped', 'Model calls: 0'],
        }),
      }),
      { role: 'assistant', text: 'Kept the edit local for Lesson Plans.' },
    ]);
  });

  it('runs the command-strip Sync action through the pending sync suggestion', async () => {
    const quizPlan = { featureId: 'quizBank', lessonIndices: [0] };
    const rubricsPlan = { featureId: 'rubrics', lessonIndices: [0] };
    chatRouterMock.messages = [
      {
        role: 'syncSuggestion',
        id: 'sync-1',
        status: 'pending',
        plan: [quizPlan, rubricsPlan],
        changedFieldsSummary: 'lesson title',
      },
    ];
    chatRouterMock.handleApproveSyncSuggestion.mockResolvedValue(undefined);
    root = renderChatPanel(container);

    const syncCommand = buildAgentCommandItems({ activeTab: 'lessonPlans', syncFeatureCount: 2 }).find(
      (item) => item.id === 'sync-stale',
    );
    expect(syncCommand).not.toBeNull();

    await act(async () => {
      await chatInputMock.props.onAgentCommand(syncCommand);
    });

    expect(chatRouterMock.handleApproveSyncSuggestion).toHaveBeenCalledWith('sync-1', [quizPlan, rubricsPlan]);
    expectInitialLocalTurn({
      text: 'Sync stale deliverables',
      assistantText: 'Syncing Quiz & Exam Bank and Rubrics from the workspace plan.',
      promptIncludes: 'Sync 2 stale deliverables',
      progressTool: 'edit_deliverables',
    });
    expect(chatRouterMock.addLocalMessages).toHaveBeenCalledWith([
      expect.objectContaining({
        role: 'agentReceipt',
        receipt: expect.objectContaining({
          title: 'Sync receipt',
          status: 'done',
          target: 'Quiz & Exam Bank and Rubrics',
        }),
      }),
      {
        role: 'assistant',
        text: 'Sync request finished for Quiz & Exam Bank and Rubrics. Check the sync card for the final status.',
      },
    ]);
    expect(chatRouterMock.send).not.toHaveBeenCalled();
  });

  it('falls back to the Agent when no pending sync suggestion matches the plan action', async () => {
    chatRouterMock.messages = [
      {
        role: 'syncSuggestion',
        id: 'sync-1',
        status: 'pending',
        plan: [{ featureId: 'rubrics', lessonIndices: [0] }],
      },
    ];
    root = renderChatPanel(container);

    let handled;
    await act(async () => {
      handled = await messageListMock.props.onWorkspacePlanAction(
        {
          title: 'Sync stale deliverables: Quiz & Exam Bank',
          target: 'Quiz & Exam Bank',
          safeMode: 'needs-approval',
          intent: { type: 'sync_stale_deliverables', featureIds: ['quizBank'] },
        },
        { displayText: 'Review sync: Sync stale deliverables: Quiz & Exam Bank' },
      );
    });

    expect(handled).toBe(false);
    expect(chatRouterMock.handleApproveSyncSuggestion).not.toHaveBeenCalled();
  });

  it('runs missing-deliverable generation plan actions directly through the app callback', async () => {
    const onGenerateFeatures = vi.fn(() =>
      Promise.resolve({
        status: 'generated',
        completedFeatureIds: ['studyGuides'],
        failedFeatureIds: [],
      }),
    );
    root = renderChatPanel(container, { onGenerateFeatures });

    expect(messageListMock.props.workspacePlanActionCapabilities).toMatchObject({
      generate_missing_feature: true,
      regenerate_failed_feature: true,
    });

    let handled;
    await act(async () => {
      handled = await messageListMock.props.onWorkspacePlanAction(
        {
          title: 'Generate missing selected deliverables: Study Guides',
          target: 'Study Guides',
          safeMode: 'requires-generation',
          intent: { type: 'generate_missing_feature', featureIds: ['studyGuides'] },
        },
        { displayText: 'Generate: Generate missing selected deliverables: Study Guides' },
      );
    });

    expect(handled).toBe(true);
    expect(onGenerateFeatures).toHaveBeenCalledWith({
      featureIds: ['studyGuides'],
      lessonFilter: null,
      source: 'agent-plan',
    });
    expectInitialLocalTurn({
      text: 'Generate: Generate missing selected deliverables: Study Guides',
      assistantText: 'Generating Study Guides from the workspace plan.',
      progressTool: 'edit_deliverables',
    });
    expect(chatRouterMock.addLocalMessages).toHaveBeenCalledWith([
      expect.objectContaining({
        role: 'agentReceipt',
        receipt: expect.objectContaining({ title: 'Generation receipt', status: 'done', target: 'Study Guides' }),
      }),
      { role: 'assistant', text: 'Generated Study Guides and ran the package checks.' },
    ]);
    expect(chatRouterMock.send).not.toHaveBeenCalled();
  });

  it('falls back to the Agent for generation plan actions when direct generation is unavailable', async () => {
    root = renderChatPanel(container, {
      onGenerateFeatures: undefined,
    });

    let handled;
    await act(async () => {
      handled = await messageListMock.props.onWorkspacePlanAction(
        {
          title: 'Generate missing selected deliverables: Study Guides',
          target: 'Study Guides',
          safeMode: 'requires-generation',
          intent: { type: 'generate_missing_feature', featureIds: ['studyGuides'] },
        },
        { displayText: 'Plan generate: Generate missing selected deliverables: Study Guides' },
      );
    });

    expect(handled).toBe(false);
    expect(chatRouterMock.send).not.toHaveBeenCalled();
  });

  it('runs package audit plan actions directly and posts a package summary card', async () => {
    const onAuditPackage = vi.fn(() =>
      Promise.resolve({
        confidence: 'Excellent',
        nextAction: 'Read-only audit passed.',
        repairsApplied: 0,
        repairsFailed: 0,
        readiness: {
          blockerCount: 0,
          warningCount: 0,
          blockers: [],
          warnings: [],
          checkedSections: '2/2',
          lessonCount: 1,
        },
        classroomReadiness: {
          status: 'ready',
          blockerCount: 0,
          warningCount: 0,
          blockers: [],
          warnings: [],
        },
        validation: { errorCount: 0, warningCount: 0, findings: [] },
        exportVerification: { status: 'passed', checked: 4, failed: 0, warningCount: 0, checks: [] },
      }),
    );
    root = renderChatPanel(container, { onAuditPackage });

    expect(messageListMock.props.workspacePlanActionCapabilities).toMatchObject({
      audit_package: true,
    });

    let handled;
    await act(async () => {
      handled = await messageListMock.props.onWorkspacePlanAction(
        {
          title: 'Run a full quality audit',
          target: 'Package',
          safeMode: 'review-only',
          intent: { type: 'audit_package', featureIds: ['lessonPlans'] },
        },
        {
          displayText: 'Audit: Run a full quality audit',
          sendOptions: {
            agentPromptOverride:
              'Act on this workspace plan item: Run a full quality audit\nIntent: audit_package\nRun read-only package checks first.',
          },
        },
      );
    });

    expect(handled).toBe(true);
    expect(onAuditPackage).toHaveBeenCalledWith({
      selectedFeatureIds: ['courseMap', 'lessonPlans'],
      lessonFilter: null,
    });
    expectInitialLocalTurn({
      text: 'Audit: Run a full quality audit',
      assistantText: 'Running a read-only package audit from the workspace plan.',
      promptIncludes: 'Intent: audit_package',
      progressTool: 'review_package_readiness',
    });
    expect(chatRouterMock.addLocalMessages).toHaveBeenCalledWith([
      expect.objectContaining({
        role: 'packageSummary',
        summary: expect.objectContaining({
          confidence: 'Excellent',
          ready: true,
          exportChecked: 4,
        }),
      }),
      expect.objectContaining({
        role: 'agentReceipt',
        receipt: expect.objectContaining({ title: 'Audit receipt', status: 'done', mode: 'Local audit' }),
      }),
      { role: 'assistant', text: 'Audit complete. No blockers found in the read-only checks.' },
    ]);
    expect(chatRouterMock.send).not.toHaveBeenCalled();
  });

  it('runs review-only readiness blocker plan actions directly through local audit', async () => {
    const onAuditPackage = vi.fn(() =>
      Promise.resolve({
        confidence: 'Good with assumptions',
        nextAction: 'Review readiness blocker.',
        repairsApplied: 0,
        repairsFailed: 0,
        readiness: {
          blockerCount: 0,
          warningCount: 1,
          blockers: [],
          warnings: [{ featureId: 'lessonPlans', label: 'Lesson Plans', message: 'Lesson timing needs review.' }],
          checkedSections: '2/2',
          lessonCount: 1,
        },
        classroomReadiness: {
          status: 'warnings',
          blockerCount: 0,
          warningCount: 1,
          blockers: [],
          warnings: [],
        },
        validation: { errorCount: 0, warningCount: 1, findings: [] },
        exportVerification: { status: 'warnings', checked: 4, failed: 0, warningCount: 1, checks: [] },
      }),
    );
    root = renderChatPanel(container, { onAuditPackage });

    expect(messageListMock.props.workspacePlanActionCapabilities).toMatchObject({
      review_readiness_blockers: true,
    });

    let handled;
    await act(async () => {
      handled = await messageListMock.props.onWorkspacePlanAction(
        {
          title: 'Clear package readiness blockers',
          target: 'Lesson Plans',
          safeMode: 'review-only',
          intent: { type: 'review_readiness_blockers', featureIds: ['lessonPlans'] },
        },
        {
          displayText: 'Review: Clear package readiness blockers',
          sendOptions: {
            agentPromptOverride:
              'Act on this workspace plan item: Clear package readiness blockers\nIntent: review_readiness_blockers\nReview package readiness without applying changes.',
          },
        },
      );
    });

    expect(handled).toBe(true);
    expect(onAuditPackage).toHaveBeenCalledWith({
      selectedFeatureIds: ['courseMap', 'lessonPlans'],
      lessonFilter: null,
    });
    expectInitialLocalTurn({
      text: 'Review: Clear package readiness blockers',
      assistantText: 'Reviewing package readiness blockers from the workspace plan.',
      promptIncludes: 'Intent: review_readiness_blockers',
      progressTool: 'review_package_readiness',
    });
    expect(chatRouterMock.addLocalMessages).toHaveBeenCalledWith([
      expect.objectContaining({
        role: 'packageSummary',
        summary: expect.objectContaining({
          confidence: 'Good with assumptions',
          ready: false,
        }),
      }),
      expect.objectContaining({
        role: 'agentReceipt',
        receipt: expect.objectContaining({ title: 'Audit needs review', status: 'review', mode: 'Local audit' }),
      }),
      expect.objectContaining({ role: 'assistant', text: expect.stringContaining('Audit complete.') }),
    ]);
    expect(chatRouterMock.send).not.toHaveBeenCalled();
  });

  it('falls back to the Agent for audit plan actions when direct audit is unavailable', async () => {
    root = renderChatPanel(container, { onAuditPackage: undefined });

    let handled;
    await act(async () => {
      handled = await messageListMock.props.onWorkspacePlanAction(
        {
          title: 'Run a full quality audit',
          target: 'Package',
          safeMode: 'review-only',
          intent: { type: 'audit_package', featureIds: ['lessonPlans'] },
        },
        { displayText: 'Audit: Run a full quality audit' },
      );
    });

    expect(handled).toBe(false);
    expect(chatRouterMock.send).not.toHaveBeenCalled();
  });

  it('keeps workspace plan actions local while package checking is already running', async () => {
    const onAuditPackage = vi.fn();
    root = renderChatPanel(container, {
      onAuditPackage,
      packageQualityPass: { status: 'running' },
    });

    let handled;
    await act(async () => {
      handled = await messageListMock.props.onWorkspacePlanAction(
        {
          title: 'Run a full quality audit',
          target: 'Package',
          safeMode: 'review-only',
          intent: { type: 'audit_package', featureIds: ['lessonPlans'] },
        },
        { displayText: 'Audit: Run a full quality audit' },
      );
    });

    expect(handled).toEqual({ status: 'error' });
    expect(onAuditPackage).not.toHaveBeenCalled();
    expect(chatRouterMock.send).not.toHaveBeenCalled();
    expect(chatRouterMock.addLocalMessages).toHaveBeenCalledWith([
      { role: 'user', text: 'Audit: Run a full quality audit' },
      {
        role: 'assistant',
        text: "I'm already checking the package. Wait for that to finish, then run Audit: Run a full quality audit again.",
      },
    ]);
  });
});
