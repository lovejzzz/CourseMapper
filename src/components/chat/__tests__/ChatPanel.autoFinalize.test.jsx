/**
 * @vitest-environment happy-dom
 */
import React, { useState } from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ChatPanel from '../ChatPanel';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('../MessageList', () => ({ default: () => <div data-testid="messages" /> }));
vi.mock('../ChatInput', () => ({ default: () => <div data-testid="chat-input" /> }));
vi.mock('../PackageSummaryCard', () => ({ default: () => <div data-testid="package-summary" /> }));
vi.mock('../CustomToolsMenu', () => ({ default: () => <div data-testid="custom-tools" /> }));
vi.mock('../../ExamReview', () => ({ default: () => <div data-testid="exam-review" /> }));
vi.mock('../useChatRouter', () => ({
  default: () => ({
    messages: [],
    isStreaming: false,
    isAgentProviderReady: true,
    agentDryRun: true,
    customTools: [],
    customToolSyncError: null,
    attachedFiles: [],
    isParsing: false,
    send: vi.fn(),
    handleStop: vi.fn(),
    handleSelectProposal: vi.fn(),
    handleAcceptDiff: vi.fn(),
    handleRejectDiff: vi.fn(),
    handleApproveSyncSuggestion: vi.fn(),
    handleSkipSyncSuggestion: vi.fn(),
    regenerate: vi.fn(),
    feedback: vi.fn(),
    editAndResend: vi.fn(),
    retryFailedEdits: vi.fn(),
    keepAppliedChanges: vi.fn(),
    processFiles: vi.fn(),
    removeAttached: vi.fn(),
    setAgentDryRun: vi.fn(),
    deleteCustomTool: vi.fn(),
    importCustomTool: vi.fn(),
  }),
}));

const baseCourseMap = {
  courseName: 'Research Methods',
  lessons: [{ title: 'Foundations' }, { title: 'Research Questions' }],
};

const baseDeliverables = {
  lessonPlans: { status: 'done', data: { lessonPlans: [{ lessonTitle: 'Lesson 1' }, { lessonTitle: 'Lesson 2' }] } },
  slideDecks: { status: 'done', data: { decks: [{ lessonTitle: 'Lesson 1' }, { lessonTitle: 'Lesson 2' }] } },
};

function ChatPanelHarness({ isDelivGenerating, onFinalizePackage, packageUpdates }) {
  const [packageQualityPass, setPackageQualityPass] = useState({
    status: 'ready',
    message: 'Ready',
    repairsApplied: 0,
    warnings: 0,
    blockers: 0,
  });

  return (
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
      selectedFeatures={['courseMap', 'lessonPlans', 'slideDecks']}
      columns={[]}
      deliverableConfig={{}}
      lessonScope={{ type: 'all', indices: [] }}
      delivProgress={{ done: 2, total: 2, perFeature: {} }}
      currentDelivFeatures={new Set()}
      isDelivGenerating={isDelivGenerating}
      delivTimings={{}}
      packageQualityPass={packageQualityPass}
      onStopDeliverables={vi.fn()}
      onPackageQualityPassUpdate={(next) => {
        packageUpdates.push(next);
        setPackageQualityPass(next);
      }}
      onAutoRepairReadiness={vi.fn(() => ({
        changed: false,
        applied: 0,
        repairs: [],
        courseMap: baseCourseMap,
        deliverables: baseDeliverables,
      }))}
      onFinalizePackage={onFinalizePackage}
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
      notifyEdit={vi.fn()}
      chatSendRef={{ current: null }}
      uid="test-user"
      onConfigureAI={vi.fn()}
      onApiCallEvent={vi.fn()}
    />
  );
}

describe('ChatPanel package finalization after sync', () => {
  let container;
  let root;

  beforeEach(() => {
    vi.useFakeTimers();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('does not cancel its own delayed finalizer after sync generation completes', async () => {
    const packageUpdates = [];
    const onFinalizePackage = vi.fn(async () => ({ status: 'ready' }));

    await act(async () => {
      root.render(
        <ChatPanelHarness isDelivGenerating onFinalizePackage={onFinalizePackage} packageUpdates={packageUpdates} />,
      );
    });

    await act(async () => {
      root.render(
        <ChatPanelHarness
          isDelivGenerating={false}
          onFinalizePackage={onFinalizePackage}
          packageUpdates={packageUpdates}
        />,
      );
    });

    expect(packageUpdates[0]).toMatchObject({
      status: 'running',
      source: 'auto-review-pending',
    });
    expect(onFinalizePackage).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(onFinalizePackage).toHaveBeenCalledTimes(1);
    expect(onFinalizePackage).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedFeatureIds: ['courseMap', 'lessonPlans', 'slideDecks'],
        retry: true,
      }),
    );
  });
});
