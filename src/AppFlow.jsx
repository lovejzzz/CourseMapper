import React, { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react';
import { createPortal } from 'react-dom';
import FocusTrap from 'focus-trap-react';
import Header from './components/Header';
import { DEFAULT_COLUMNS } from './components/ColumnEditor';
import ErrorBoundary from './components/ErrorBoundary';
import LoadingScreen, { ConfigSkeleton, WorkspaceSkeleton, CourseMapSkeleton } from './components/LoadingScreen';
import Landing from './screens/Landing';

// Lazy-load screens/components not needed on initial landing page
const Config = lazy(() => import('./screens/Config'));
const FeatureSelect = lazy(() => import('./screens/FeatureSelect'));
const CourseMapPreview = lazy(() => import('./components/CourseMapPreview'));
const ChatPanel = lazy(() => import('./components/chat/ChatPanel'));
const ResizeHandle = lazy(() => import('./components/chat/ResizeHandle'));
const DeliverableView = lazy(() => import('./components/DeliverableView'));
const DependencyMap = lazy(() => import('./components/DependencyMap'));
const CascadePreview = lazy(() => import('./components/CascadePreview'));
const ExportSidePanel = lazy(() => import('./components/ExportSidePanel'));
const AIContextMenu = lazy(() => import('./components/AIContextMenu'));
const ProjectPicker = lazy(() => import('./components/ProjectPicker'));
const DeveloperModePanel = lazy(() => import('./components/DeveloperModePanel'));
const CustomDeliverableBuilder = lazy(() =>
  import('./screens/FeatureSelect').then((module) => ({ default: module.CustomDeliverableBuilder })),
);
import useVersionHistory from './hooks/useVersionHistory';
import useExport from './hooks/useExport';
import useGeneration from './hooks/useGeneration';
import useRevision from './hooks/useRevision';
import useCourseMapEditor from './hooks/useCourseMapEditor';
import useDeliverables from './hooks/useDeliverables';
import useSmartSync from './hooks/useSmartSync';
import useEditProposal from './hooks/useEditProposal';
import useDeliverableUndo from './hooks/useDeliverableUndo';
import { extractEditContext } from './lib/editContextExtractor';
import {
  applyCanonicalPatchesToCourseMap,
  createCanonicalPatchRequest,
  getCanonicalPatchFieldLabel,
  projectArtifactEditToCourseMapPatch,
} from './lib/artifactBlueprintProjection';
import { FEATURES } from './lib/featureCatalog';
import {
  listCustomDeliverables,
  getCustomDeliverable,
  toFeatureEntry,
  saveCustomDeliverable,
  mergeCloudDeliverables,
} from './lib/customDeliverableLibrary';
import {
  listDeveloperTemplates,
  saveDeveloperTemplate,
  saveDeveloperTemplateFromSnapshot,
  deleteDeveloperTemplate,
  mergeCloudDeveloperTemplates,
} from './lib/developerTemplates';
import { mergeCloudProfile } from './lib/professorProfile';
import { mergeCloudMemories, mergeCloudAgentPrefs } from './lib/agentMemory';
import { useAuth } from './contexts/AuthContext';
import { getSavedApiKeyForProvider, useAIConfig } from './contexts/AIConfigContext';
import { useUI } from './contexts/UIContext';
import { useCourse } from './contexts/CourseContext';
import { log, warn, error as logError } from './lib/logger';
// HelpDrawer removed — merged into ChatPanel
import {
  saveProject as cloudSaveProject,
  loadProject as cloudLoadProject,
  loadProjectDeliverables,
  newProjectId,
} from './lib/cloudStorage';
import { requestNotificationPermission } from './lib/notifyDone';
import { importCourseMap } from './lib/importCourseMap';
import { parseFiles } from './lib/fileParser';
import { detectExpectedLessons, detectLessonsWithAI } from './lib/detectLessons';
import { sanitizeMessagesForPersistence } from './lib/messageSanitizer';
import { upsertLandingAgentContextMessages } from './lib/landingAgentContext';
import { prepareProjectSnapshotForRestore, sanitizeProjectSnapshot } from './lib/projectSnapshotSanitizer';
import { isAgentProviderReady } from './lib/agentAvailability';
import {
  evaluateWorkspaceReadiness,
  repairCourseMapReadiness,
  repairWorkspaceReadiness,
} from './lib/deliverableReadiness';
import { evaluateClassroomReadiness } from './lib/classroomReadiness';
import { runDeterministicPackageFinalizer } from './lib/packageFinalizer';
import { verifyPackageExports } from './lib/packageExportVerifier';
import { generateCourseHealthReport } from './lib/pedagogicalValidator';
import { applyApiCallBudgetEvent, createApiCallBudget, getApiCallBudgetTotal } from './lib/apiCallBudget';
import { buildApiCostPlan, evaluateApiCostControl } from './lib/apiCostControl';
import { summarizeApiFeatureUsageBudget, summarizeApiUsageBudget, summarizeCompilerSavings } from './lib/apiUsageCost';
import { buildCompactPackageTrustReceipt, buildPackageTrustBoundarySummary } from './lib/packageFinalizerSummary';
import { getChunkCount } from './lib/parallelGenerator';
import { buildHumanReviewRecommendation, summarizeRepairEvidence } from './lib/packageTrust';
import { traceLog } from './lib/traceLog';

const STORAGE_KEY = 'coursemapper-project';
const CLOUD_PROJECT_FORMAT = 'coursemapper-blueprint-v1';

function summarizeReceiptIssue(issue) {
  if (!issue) return null;
  return {
    severity: issue.severity === 'blocker' ? 'error' : issue.severity || 'warning',
    label:
      issue.label || FEATURES.find((feature) => feature.id === issue.featureId)?.label || issue.featureId || 'Package',
    message: issue.message || 'Needs attention before export.',
  };
}

function getReadOnlyPackageConfidence(readiness, classroomReadiness, healthReport, exportVerification) {
  if (exportVerification?.status === 'failed') return 'Needs attention';
  if (readiness?.blockers?.length > 0 || classroomReadiness?.blockers?.length > 0 || healthReport?.errorCount > 0) {
    return 'Needs attention';
  }
  if (
    exportVerification?.status === 'warnings' ||
    readiness?.warnings?.length > 0 ||
    classroomReadiness?.warnings?.length > 0 ||
    healthReport?.warningCount > 0
  ) {
    return 'Good with assumptions';
  }
  return 'Excellent';
}

function getReadOnlyPackageNextAction(confidence) {
  if (confidence === 'Excellent') return 'Read-only audit passed. The package is ready for final instructor review.';
  if (confidence === 'Good with assumptions') {
    return 'Read-only audit found review notes. Decide whether they need edits before export.';
  }
  return 'Read-only audit found blockers. Fix them before presenting the package as ready.';
}

function getReceiptFeatureLabel(featureId) {
  const builtIn = FEATURES.find((feature) => feature.id === featureId);
  if (builtIn?.label) return builtIn.label;
  if (featureId?.startsWith('custom_')) return getCustomDeliverable(featureId)?.name || 'Custom Deliverable';
  return featureId;
}

function buildQualityReceipt({
  result,
  exportVerification,
  repairsApplied = 0,
  retryCount = 0,
  selectedFeatureIds = [],
  courseMap,
  includeWarnings = true,
  apiSpendSummary = null,
  compilerSummary = null,
}) {
  const readiness = result?.readiness || {};
  const blockers = Array.isArray(readiness.blockers) ? readiness.blockers : [];
  const warnings = Array.isArray(readiness.warnings) ? readiness.warnings : [];
  const topIssues = [...blockers, ...(includeWarnings ? warnings : [])]
    .map(summarizeReceiptIssue)
    .filter(Boolean)
    .slice(0, 3);
  const checkedFeatureCount = Array.isArray(selectedFeatureIds) ? selectedFeatureIds.length : 0;
  const repairSummary = summarizeRepairEvidence(result?.repairs || []);
  const humanDecisionCount = blockers.length + (includeWarnings ? warnings.length : 0);
  return {
    checkedItems: ['Readiness', 'classroom fit', 'content validation', 'export files'],
    checkedSections: checkedFeatureCount > 0 ? `${checkedFeatureCount}/${checkedFeatureCount}` : '',
    lessonCount: courseMap?.lessons?.length || 0,
    autoFixedCount: repairsApplied,
    retriedCount: retryCount,
    humanDecisionCount,
    exportChecked: exportVerification?.checked || 0,
    exportFailed: exportVerification?.failed || 0,
    exportWarningCount: exportVerification?.warningCount || 0,
    repairSummary,
    trustBoundary: buildPackageTrustBoundarySummary({
      lessonCount: courseMap?.lessons?.length || 0,
      compilerSummary,
      repairsApplied,
      apiSpendSummary,
      reviewRequiredCount:
        humanDecisionCount + (exportVerification?.failed || 0) + (exportVerification?.warningCount || 0),
      externalProofStatus: 'not attached',
    }),
    compactTrustReceipt: buildCompactPackageTrustReceipt({
      lessonCount: courseMap?.lessons?.length || 0,
      compilerSummary,
      selectedFeatureCount: checkedFeatureCount,
      deterministicRepairCount: repairsApplied,
      reviewRequiredCount:
        humanDecisionCount + (exportVerification?.failed || 0) + (exportVerification?.warningCount || 0),
      exportVerification,
      studentFacingCleanlinessStatus:
        exportVerification?.failed || exportVerification?.warningCount ? 'review flagged' : 'clean',
      localConfirmationChecklist: ['official dates', 'institution policies', 'copyrighted readings'],
      budgetStatus: apiSpendSummary?.label || 'within configured budget',
    }),
    reviewRecommendation: buildHumanReviewRecommendation({
      blockerCount: blockers.length + (exportVerification?.failed || 0),
      warningCount: (includeWarnings ? warnings.length : 0) + (exportVerification?.warningCount || 0),
      repaired: repairSummary !== 'none',
    }),
    reviewActions:
      topIssues.length > 0
        ? topIssues.map((issue) => ({
            label: issue.label,
            action: issue.message,
          }))
        : [
            { label: 'Official dates', action: 'Confirm the official calendar and due dates before publication.' },
            { label: 'Local policy', action: 'Confirm institution policy language and accommodation wording.' },
            {
              label: 'Source permissions',
              action: 'Confirm copied readings, media, cases, and datasets are approved.',
            },
          ],
    topIssues,
  };
}

function traceApiCallBudget(event = {}, budget = {}) {
  const counters = {
    modelDiscovery: budget.modelDiscoveryCalls || 0,
    creditCheck: budget.creditCheckCalls || 0,
    capabilityProbe: budget.capabilityProbeCalls || 0,
    courseMap: budget.courseMapCalls || 0,
    deliverableChunk: budget.deliverableChunkCalls || 0,
    repairRetry: budget.repairRetryCalls || 0,
    streamRetry: budget.streamRetryCalls || 0,
    providerFallback: budget.providerFallbackCalls || 0,
    agentLoop: budget.agentLoopCalls || 0,
    imageGeneration: budget.imageGenerationCalls || 0,
    failed: budget.failedCalls || 0,
  };
  traceLog(`[CM][API] ${event.type || 'event'}`, {
    at: new Date().toISOString(),
    runId: budget.runId,
    label: event.label || '',
    detail: event.detail || '',
    featureId: event.featureId || '',
    count: Number.isFinite(event.count) ? event.count : 1,
    failureClass: event.failureClass || '',
    statusCode: event.statusCode || '',
    retryable: event.retryable,
    userMessage: event.userMessage || '',
    provider: event.provider || '',
    modelId: event.modelId || '',
    usage: budget.tokenUsage
      ? {
          inputTokens: budget.tokenUsage.inputTokens || 0,
          outputTokens: budget.tokenUsage.outputTokens || 0,
          totalTokens: budget.tokenUsage.totalTokens || 0,
          costUsd: budget.tokenUsage.costUsd || 0,
          costKnownCallCount: budget.tokenUsage.costKnownCallCount || 0,
          costUnknownCallCount: budget.tokenUsage.costUnknownCallCount || 0,
          costEstimatedCallCount: budget.tokenUsage.costEstimatedCallCount || 0,
          estimatedCallCount: budget.tokenUsage.estimatedCallCount || 0,
          reportedCallCount: budget.tokenUsage.reportedCallCount || 0,
        }
      : null,
    totalProviderCalls: getApiCallBudgetTotal(budget),
    costControl: budget.costControl || null,
    costPlan: budget.costPlan
      ? {
          source: budget.costPlan.source,
          plannedNewCalls: budget.costPlan.plannedNewCalls,
          plannedCalls: budget.costPlan.plannedCalls,
          hardCallLimit: budget.costPlan.hardCallLimit,
        }
      : null,
    counters,
  });
}

function createPackageFinishRunId() {
  return `finish-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function tracePackageFinish(runId, event, details = {}, level = 'info') {
  traceLog(
    `[CM][FINISH][${runId}] ${event}`,
    {
      at: new Date().toISOString(),
      ...details,
    },
    level,
  );
}

function getRetryActionKey(action = {}) {
  const scope = action.scope || 'lesson';
  const featureId = action.featureId || 'unknown';
  const lessonPart = Number.isInteger(action.lessonIndex) ? `lesson-${action.lessonIndex}` : 'feature';
  return `${scope}:${featureId}:${lessonPart}`;
}

function getSuppressedRetryActionKey(action = {}, provider = '', modelId = '') {
  return `${provider || 'provider'}:${modelId || 'model'}:${getRetryActionKey(action)}`;
}

function estimateRetryActionCallCost(action, courseMap, lessonFilter, generationPlan) {
  if (!action?.featureId) return 1;
  if (action.scope !== 'feature') return 1;
  const lessonCount = Array.isArray(courseMap?.lessons) ? courseMap.lessons.length : 0;
  return Math.max(1, getChunkCount(action.featureId, lessonCount, lessonFilter, generationPlan));
}

function selectRetryActionsWithinCallBudget(
  actions = [],
  { courseMap, lessonFilter, generationPlan, maxCalls = 4 } = {},
) {
  const limit = Math.max(0, Number(maxCalls) || 0);
  let usedCalls = 0;
  const selected = [];
  const skipped = [];
  for (const action of actions) {
    const estimatedCalls = estimateRetryActionCallCost(action, courseMap, lessonFilter, generationPlan);
    const annotated = { ...action, estimatedCalls };
    if (estimatedCalls <= limit - usedCalls) {
      selected.push(annotated);
      usedCalls += estimatedCalls;
    } else {
      skipped.push(annotated);
    }
  }
  return { selected, skipped, usedCalls };
}

function normalizeProjectProvider(provider) {
  return provider === 'free' ? 'openai' : provider;
}

// ── Add Deliverable dropdown — uses a portal so it escapes the overflow-x-auto tab bar ──
function AddDeliverableButton({ unselected, showAddDeliverable, setShowAddDeliverable, onAdd, onCreateCustom }) {
  const btnRef = useRef(null);
  const [dropPos, setDropPos] = useState({ top: 0, left: 0 });

  function openDropdown() {
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setDropPos({ top: rect.bottom + 6, left: rect.left });
    }
    setShowAddDeliverable(true);
  }

  const builtIn = unselected.filter((f) => !f.isCustom);
  const custom = unselected.filter((f) => f.isCustom);

  return (
    <div className="flex-shrink-0">
      <button
        ref={btnRef}
        onClick={showAddDeliverable ? () => setShowAddDeliverable(false) : openDropdown}
        className="tactile flex items-center gap-1.5 px-3 py-2 rounded-pill text-xs font-semibold text-indigo-500 bg-indigo-50/60 border border-indigo-200/40 hover:bg-indigo-100/70 transition-all duration-200"
        title="Add more deliverables"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        Add
      </button>
      {showAddDeliverable &&
        createPortal(
          <>
            <div className="fixed inset-0 z-[9998]" onClick={() => setShowAddDeliverable(false)} />
            <div
              className="fixed z-[9999] bg-white/95 backdrop-blur-xl rounded-xl border border-slate-200/60 shadow-xl p-2 min-w-[220px] max-h-[70vh] overflow-y-auto animate-spring-in"
              style={{ top: dropPos.top, left: dropPos.left }}
            >
              {builtIn.length > 0 && (
                <>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider px-2 pt-1 pb-1.5">
                    Add Deliverable
                  </p>
                  {builtIn.map((feature) => (
                    <button
                      key={feature.id}
                      onClick={() => onAdd(feature)}
                      className="w-full text-left px-2 py-2 rounded-lg text-[11px] font-medium text-slate-600 hover:bg-indigo-50 hover:text-indigo-700 transition-colors"
                    >
                      {feature.label}
                    </button>
                  ))}
                </>
              )}
              {custom.length > 0 && (
                <>
                  <div className="border-t border-slate-100/80 my-1.5" />
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider px-2 pt-1 pb-1.5">
                    Your Custom
                  </p>
                  {custom.map((feature) => (
                    <button
                      key={feature.id}
                      onClick={() => onAdd(feature)}
                      className="w-full text-left px-2 py-2 rounded-lg text-[11px] font-medium text-violet-600 hover:bg-violet-50 hover:text-violet-700 transition-colors"
                    >
                      {feature.label}
                    </button>
                  ))}
                </>
              )}
              {/* Create Custom option */}
              {(builtIn.length > 0 || custom.length > 0) && <div className="border-t border-slate-100/80 my-1.5" />}
              <button
                onClick={() => {
                  setShowAddDeliverable(false);
                  onCreateCustom();
                }}
                className="w-full text-left px-2 py-2 rounded-lg text-[11px] font-medium text-indigo-500 hover:bg-indigo-50 hover:text-indigo-700 transition-colors flex items-center gap-1.5"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Create Custom...
              </button>
            </div>
          </>,
          document.body,
        )}
    </div>
  );
}

// Screens: 'landing' | 'features' | 'config' | 'workspace'

export default function AppFlow({ startupAction = null, onStartupHandled, onReturnToLanding } = {}) {
  useEffect(() => {
    requestNotificationPermission();
  }, []);
  const [isHandlingStartupAction, setIsHandlingStartupAction] = useState(() =>
    Boolean(startupAction && startupAction.type !== 'continue'),
  );

  // ── UI state (from UIContext) ──
  const {
    screen,
    setScreen,
    activeTab,
    setActiveTab,
    chatWidth,
    setChatWidth,
    showHelp,
    setShowHelp,
    showDiff,
    setShowDiff,
    showAddDeliverable,
    setShowAddDeliverable,
    showCustomBuilder,
    setShowCustomBuilder,
    showDepMap,
    setShowDepMap,
    newProjectConfirm,
    setNewProjectConfirm,
    showProjectPicker,
    setShowProjectPicker,
    setDragTabIdx,
    cascadeHover,
    handleCascadeHover,
    aiContextMenu,
    handleAIContextMenu,
    closeAIContextMenu,
    unseenChanges,
    setUnseenChanges,
    agentHighlight,
    triggerAgentHighlight,
    addLessonsModal,
    setAddLessonsModal,
  } = useUI();

  useEffect(() => {
    if (screen === 'landing' && !isHandlingStartupAction && !startupAction) {
      onReturnToLanding?.();
    }
  }, [screen, isHandlingStartupAction, startupAction, onReturnToLanding]);

  // ── Course data state (from CourseContext) ──
  const {
    selectedFeatures,
    setSelectedFeatures,
    deliverableConfig,
    setDeliverableConfig,
    lessonScope,
    setLessonScope,
    promptText,
    setPromptText,
    files,
    setFiles,
    columns,
    setColumns,
    courseMap,
    setCourseMap,
    oldCourseMap,
    setOldCourseMap,
    userEdits,
    setUserEdits,
    hasGenerated,
    setHasGenerated,
    slideTheme,
    setSlideTheme,
  } = useCourse();

  const [hasSavedSession, setHasSavedSession] = useState(false);

  // ── Model & File Config (from AIConfigContext) ──
  const {
    provider,
    setProvider,
    apiKey,
    setApiKey,
    apiStatus,
    setApiStatus,
    modelName,
    setModelName,
    modelId,
    setModelId,
    availableModels,
    setAvailableModels,
    maxOutputTokens,
    setMaxOutputTokens,
    modelCapabilities,
    generationPlan,
  } = useAIConfig();

  const restoreProjectAIConfig = useCallback(
    (snapshot, { providerFallback } = {}) => {
      const nextProvider = snapshot?.provider ? normalizeProjectProvider(snapshot.provider) : providerFallback;

      try {
        if (nextProvider) localStorage.setItem('coursemapper-provider', nextProvider);
        if (snapshot && Object.prototype.hasOwnProperty.call(snapshot, 'modelId')) {
          if (snapshot.modelId) localStorage.setItem('coursemapper-modelid', snapshot.modelId);
          else localStorage.removeItem('coursemapper-modelid');
        } else if (providerFallback !== undefined) {
          localStorage.removeItem('coursemapper-modelid');
        }
        if (snapshot && Object.prototype.hasOwnProperty.call(snapshot, 'modelName')) {
          if (snapshot.modelName) localStorage.setItem('coursemapper-modelname', snapshot.modelName);
          else localStorage.removeItem('coursemapper-modelname');
        } else if (providerFallback !== undefined) {
          localStorage.removeItem('coursemapper-modelname');
        }
      } catch {}

      const restoredApiKey = nextProvider ? getSavedApiKeyForProvider(nextProvider) : '';
      const restoredModelId =
        snapshot && Object.prototype.hasOwnProperty.call(snapshot, 'modelId')
          ? snapshot.modelId || ''
          : providerFallback !== undefined
            ? ''
            : modelId;

      if (nextProvider) setProvider(nextProvider);
      if (nextProvider) setApiKey(restoredApiKey);
      if (snapshot && Object.prototype.hasOwnProperty.call(snapshot, 'modelId')) {
        setModelId(snapshot.modelId || '');
      } else if (providerFallback !== undefined) {
        setModelId('');
      }
      if (snapshot && Object.prototype.hasOwnProperty.call(snapshot, 'modelName')) {
        setModelName(snapshot.modelName || '');
      } else if (providerFallback !== undefined) {
        setModelName('');
      }
      if (nextProvider === 'webllm') {
        setApiStatus(restoredModelId ? 'connected' : 'idle');
      } else {
        setApiStatus(restoredApiKey && restoredModelId ? 'connected' : 'idle');
      }
    },
    [modelId, setApiKey, setApiStatus, setModelId, setModelName, setProvider],
  );

  // ── Core Course Map State ──
  const [restoredSession, setRestoredSession] = useState(false);
  const [chatHistory, setChatHistory] = useState([]);
  const [mobileWorkspaceView, setMobileWorkspaceView] = useState('content');

  // ── Workspace tab ──
  // (activeTab, showAddDeliverable, showCustomBuilder, tab drag,
  //  addLessonsModal, showDepMap, cascadeHover, newProjectConfirm
  //  moved to UIContext)

  useEffect(() => {
    if (screen === 'workspace') setMobileWorkspaceView('content');
  }, [screen, activeTab]);

  const focusCourseMapTarget = useCallback(
    (targetOrIssue) => {
      const target = targetOrIssue?.target || targetOrIssue;
      if (!target || target.type !== 'courseMapCell') return;

      setActiveTab('courseMap');
      setMobileWorkspaceView('content');
      window.setTimeout(() => {
        window.dispatchEvent(new CustomEvent('coursemapper:focus-coursemap-cell', { detail: target }));
      }, 160);
    },
    [setActiveTab],
  );

  const focusExamPatch = useCallback(
    (patch) => {
      if (!patch) return;
      if (patch.field === 'courseName' || patch.field === 'semester' || patch.action === '_fullMapFallback') {
        setActiveTab('courseMap');
        setMobileWorkspaceView('content');
        return;
      }
      if (patch.field === 'title' && patch.lessonIndex != null) {
        focusCourseMapTarget({ type: 'courseMapCell', lessonIndex: patch.lessonIndex, field: 'title' });
        return;
      }
      if (patch.lessonIndex != null && patch.sectionIndex != null && patch.field) {
        focusCourseMapTarget({
          type: 'courseMapCell',
          lessonIndex: patch.lessonIndex,
          sectionIndex: patch.sectionIndex,
          field: patch.field,
        });
      }
    },
    [focusCourseMapTarget, setActiveTab],
  );

  // ── Cloud ──
  const { user } = useAuth();
  const [projectId, setProjectId] = useState(null); // Firestore project doc ID
  const projectIdRef = useRef(null); // Ref mirror to prevent race conditions in auto-save
  const [localSaveStatus, setLocalSaveStatus] = useState('idle'); // 'idle' | 'saving' | 'saved' | 'error'
  const [cloudSaveStatus, setCloudSaveStatus] = useState('idle'); // 'idle' | 'saving' | 'saved' | 'error'
  const cloudSaveTimerRef = useRef(null);
  const cloudStatusTimerRef = useRef(null);
  const localStatusTimerRef = useRef(null);
  const [isStartingNewProject, setIsStartingNewProject] = useState(false);
  const [newProjectError, setNewProjectError] = useState('');
  const [newProjectCloudSaveFailed, setNewProjectCloudSaveFailed] = useState(false);
  const [deleteTabConfirm, setDeleteTabConfirm] = useState(null);
  const [tabDrag, setTabDrag] = useState(null);
  const [developerMode, setDeveloperMode] = useState(() => {
    try {
      return localStorage.getItem('coursemapper-developer-mode') === 'true';
    } catch {
      return false;
    }
  });
  const [showDeveloperPanel, setShowDeveloperPanel] = useState(false);
  const [developerTemplates, setDeveloperTemplates] = useState(() => listDeveloperTemplates());
  const [activeDeveloperTemplateId, setActiveDeveloperTemplateId] = useState(() => {
    try {
      return localStorage.getItem('coursemapper-active-developer-template') || '';
    } catch {
      return '';
    }
  });
  const [apiCallBudget, setApiCallBudget] = useState(() => createApiCallBudget());
  const apiCallBudgetRef = useRef(apiCallBudget);
  const recordApiCallEvent = useCallback((event) => {
    const current = apiCallBudgetRef.current || createApiCallBudget();
    const next = applyApiCallBudgetEvent(current, event);
    apiCallBudgetRef.current = next;
    traceApiCallBudget(event, next);
    setApiCallBudget(next);
  }, []);

  // ── Misc ──
  const [downloadedFile, setDownloadedFile] = useState('');
  const saveTimerRef = useRef(null);
  const addMaterialInputRef = useRef(null);
  const tabButtonRefs = useRef(new Map());
  const trashDropRef = useRef(null);
  const suppressTabClickRef = useRef(false);

  // ── AI Context Menu (inline AI editing) ──
  const chatSendRef = useRef(null);
  const packageFinalizerRef = useRef(null);
  const packageFinalizerInFlightRef = useRef(null);
  const packageGenerationInFlightRef = useRef(false);
  const suppressedPackageRetryKeysRef = useRef(new Set());
  const canFinishPackageWithAgent = isAgentProviderReady({ provider, apiKey, apiStatus, modelId });
  const handleAIAction = useCallback((prompt) => {
    // Handle "__FOCUS__" prefix — pre-fill chat with context but let user type
    if (prompt.startsWith('__FOCUS__')) {
      const payload = prompt.slice(9);
      const sepIdx = payload.indexOf('|||');
      const location = sepIdx >= 0 ? payload.slice(0, sepIdx) : payload;
      const value = sepIdx >= 0 ? payload.slice(sepIdx + 3) : '';
      const focusPrompt = `Regarding "${(value || '').slice(0, 60)}${(value || '').length > 60 ? '...' : ''}" in ${location}: `;
      chatSendRef.current?.(focusPrompt);
      return;
    }
    chatSendRef.current?.(prompt);
  }, []);
  const handleFinishPackageFromExport = useCallback(async ({ selectedFeatureIds, lessonFilter } = {}) => {
    if (typeof packageFinalizerRef.current !== 'function') return false;
    return packageFinalizerRef.current({
      selectedFeatureIds,
      lessonFilter,
      retry: true,
      source: 'export',
      maxRetryActions: 10,
      maxRetryCallBudget: 14,
      maxRetryPasses: 3,
    });
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('coursemapper-developer-mode', developerMode ? 'true' : 'false');
    } catch {}
    if (!developerMode) setShowDeveloperPanel(false);
  }, [developerMode]);

  useEffect(() => {
    try {
      if (activeDeveloperTemplateId)
        localStorage.setItem('coursemapper-active-developer-template', activeDeveloperTemplateId);
      else localStorage.removeItem('coursemapper-active-developer-template');
    } catch {}
  }, [activeDeveloperTemplateId]);

  // ── Cascade sync ──
  // Always-fresh ref to courseMap for useSmartSync (avoids stale closure)
  const courseMapRef = useRef(courseMap);
  useEffect(() => {
    courseMapRef.current = courseMap;
  }, [courseMap]);
  // Always-fresh ref to deliverables for onRequestProposal callback
  const deliverablesRef = useRef(null);

  const version = useVersionHistory(setCourseMap, setDownloadedFile);

  const gen = useGeneration({
    provider,
    modelId,
    apiKey,
    maxOutputTokens,
    modelCapabilities,
    generationPlan,
    files,
    columns,
    setCourseMap,
    setOldCourseMap,
    pushVersion: version.pushVersion,
    userEdits,
    setUserEdits,
    promptText,
    pedagogicalMode: 'lecture', // Feature 4.2 — wired for when mode selector UI is added
    lessonScope: lessonScope.type === 'specific' ? lessonScope.indices : null,
    courseMapConfig: deliverableConfig['courseMap'],
    onApiCallEvent: recordApiCallEvent,
  });

  const { handleDownload, resetExport } = useExport(courseMap, columns, gen.setError);

  const rev = useRevision({
    provider,
    modelId,
    apiKey,
    maxOutputTokens,
    courseMap,
    setCourseMap,
    setOldCourseMap,
    pushVersion: version.pushVersion,
    userEdits,
    setUserEdits,
    setIsStreaming: gen.setIsStreaming,
    setStreamDetail: gen.setStreamDetail,
    setStreamProgress: gen.setStreamProgress,
    setProgressStep: gen.setProgressStep,
    setIsStopped: gen.setIsStopped,
    setStatus: gen.setStatus,
    setError: gen.setError,
    setRetryInfo: gen.setRetryInfo,
  });

  const deliv = useDeliverables({
    provider,
    modelId,
    apiKey,
    maxOutputTokens,
    modelCapabilities,
    generationPlan,
    deliverableConfig,
    lockedLessons: lessonScope.type === 'specific' ? lessonScope.indices : null,
    pedagogicalMode: 'lecture',
    examChanges: gen.examChanges,
    columns,
    onApiCallEvent: recordApiCallEvent,
  });
  // Keep deliverables ref fresh for use in stable callbacks
  deliverablesRef.current = deliv.deliverables;
  const regenerateLessonRef = useRef(deliv.regenerateLesson);
  regenerateLessonRef.current = deliv.regenerateLesson;
  const regenerateFeatureRef = useRef(deliv.generateAll);
  regenerateFeatureRef.current = deliv.generateAll;

  // ── Edit-Aware AI Proposal Engine ──
  const editProposal = useEditProposal({
    provider,
    modelId,
    apiKey,
    maxOutputTokens,
    deliverableConfig,
    pedagogicalMode: 'lecture',
    columns,
  });

  // ── Deliverable Undo/Redo ──
  const delivUndo = useDeliverableUndo();
  const [packageQualityPass, setPackageQualityPass] = useState({
    status: 'idle',
    message: '',
    repairsApplied: 0,
    warnings: 0,
    blockers: 0,
  });

  const applyPackageReadinessRepairs = useCallback(
    ({ selectedFeatureIds = selectedFeatures, lessonFilter = null } = {}) => {
      let nextCourseMap = courseMap;
      let nextDeliverables = deliv.deliverables;
      const repairs = [];
      const currentReadiness = evaluateWorkspaceReadiness({
        courseMap,
        deliverables: deliv.deliverables,
        selectedFeatures: selectedFeatureIds,
        columns,
        lessonFilter,
      });
      const currentClassroomReadiness = evaluateClassroomReadiness({
        courseMap,
        deliverables: deliv.deliverables,
        selectedFeatures: selectedFeatureIds,
        lessonFilter,
      });
      const repairableFeatureIds = new Set(
        [...currentReadiness.issues, ...currentClassroomReadiness.issues].map((issue) => issue.featureId),
      );

      if (repairableFeatureIds.size === 0) {
        return {
          changed: false,
          applied: 0,
          repairs: [],
          courseMap: nextCourseMap,
          deliverables: nextDeliverables,
        };
      }

      if (repairableFeatureIds.has('courseMap')) {
        const courseMapRepair = repairCourseMapReadiness({
          courseMap,
          columns,
          lessonFilter,
        });
        if (courseMapRepair.changed) {
          nextCourseMap = courseMapRepair.courseMap;
          setCourseMap(courseMapRepair.courseMap);
          repairs.push({
            featureId: 'courseMap',
            label: 'Course Map',
            changes: courseMapRepair.repairedFields,
            message: `Course Map repaired: ${courseMapRepair.repairedFields.join('; ')}`,
          });
        }
      }

      const deliverableFeatureIds = selectedFeatureIds.filter(
        (featureId) => featureId !== 'courseMap' && repairableFeatureIds.has(featureId),
      );
      const deliverableRepair =
        deliverableFeatureIds.length > 0
          ? repairWorkspaceReadiness({
              courseMap: nextCourseMap,
              deliverables: deliv.deliverables,
              selectedFeatures: deliverableFeatureIds,
              deliverableConfig,
            })
          : { changed: false, repairs: [], deliverables: deliv.deliverables };

      if (deliverableRepair.changed) {
        nextDeliverables = deliverableRepair.deliverables;
        for (const repair of deliverableRepair.repairs) {
          const previousData = deliv.deliverables?.[repair.featureId]?.data;
          if (previousData) delivUndo.snapshot(repair.featureId, previousData);
        }
        deliv.setDeliverables(deliverableRepair.deliverables);
        repairs.push(...deliverableRepair.repairs);
      }

      return {
        changed: repairs.length > 0,
        applied: repairs.length,
        repairs,
        courseMap: nextCourseMap,
        deliverables: nextDeliverables,
      };
    },
    [
      columns,
      courseMap,
      deliv.deliverables,
      deliv.setDeliverables,
      deliverableConfig,
      delivUndo.snapshot,
      selectedFeatures,
      setCourseMap,
    ],
  );

  const commitFinalizerResult = useCallback(
    (result) => {
      if (!result) return;
      if (result.courseMap && result.courseMap !== courseMapRef.current) {
        courseMapRef.current = result.courseMap;
        setCourseMap(result.courseMap);
      }
      if (result.deliverables && result.deliverables !== deliverablesRef.current) {
        for (const repair of result.repairs || []) {
          const previousData = deliverablesRef.current?.[repair.featureId]?.data;
          if (repair.featureId !== 'courseMap' && previousData) {
            delivUndo.snapshot(repair.featureId, previousData);
          }
        }
        deliverablesRef.current = result.deliverables;
        deliv.setDeliverables(result.deliverables);
      }
    },
    [deliv.setDeliverables, delivUndo.snapshot, setCourseMap],
  );

  const handleDeterministicPackageFinalization = useCallback(
    async ({
      selectedFeatureIds = selectedFeatures,
      lessonFilter = lessonScope.type === 'specific' ? lessonScope.indices : null,
      retry = true,
      maxRetryActions = 4,
      maxRetryCallBudget = 4,
      maxRetryPasses = 2,
      courseMapOverride = null,
      deliverablesOverride = null,
      source = 'auto',
    } = {}) => {
      if (packageFinalizerInFlightRef.current) {
        tracePackageFinish('existing', 'join_existing', {
          source,
          selectedFeatureIds,
          lessonFilter,
        });
        return packageFinalizerInFlightRef.current;
      }

      const finishRunId = createPackageFinishRunId();
      const finishPromise = (async () => {
        const featureIds =
          Array.isArray(selectedFeatureIds) && selectedFeatureIds.length > 0 ? selectedFeatureIds : selectedFeatures;
        let finalizerCourseMap = courseMapOverride || courseMapRef.current;
        let finalizerDeliverables = deliverablesOverride || deliverablesRef.current || {};
        tracePackageFinish(finishRunId, 'finish_start', {
          selectedFeatureIds: featureIds,
          lessonFilter,
          retry,
          maxRetryActions,
          maxRetryCallBudget,
          maxRetryPasses,
          source,
          lessonCount: Array.isArray(finalizerCourseMap?.lessons) ? finalizerCourseMap.lessons.length : 0,
          deliverableIds: Object.keys(finalizerDeliverables || {}),
        });
        const runFinalizer = (retryLimit) =>
          runDeterministicPackageFinalizer({
            courseMap: finalizerCourseMap,
            deliverables: finalizerDeliverables,
            selectedFeatures: featureIds,
            columns,
            lessonFilter,
            deliverableConfig,
            includeClassroomReadiness: true,
            blockOnClassroomWarnings: false,
            includePedagogicalValidation: true,
            blockOnValidationWarnings: false,
            maxRetryActions: retryLimit,
            retryWarnings: false,
          });

        setPackageQualityPass({
          status: 'running',
          message: 'Finishing package: checking, repairing, and preparing export...',
          repairsApplied: 0,
          warnings: 0,
          blockers: 0,
        });

        const canRetryWeakSpots =
          retry &&
          canFinishPackageWithAgent &&
          (typeof regenerateLessonRef.current === 'function' || typeof regenerateFeatureRef.current === 'function');

        const finalizerCostPlan = buildApiCostPlan({
          source: `finalizer:${source}`,
          featureIds,
          lessonCount: Array.isArray(finalizerCourseMap?.lessons) ? finalizerCourseMap.lessons.length : 0,
          lessonFilter,
          generationPlan,
          includeCourseMap: false,
          includeDeliverableChunks: false,
          includeRepairRetryReserve: false,
          finalizerRetryCallBudget: canRetryWeakSpots ? maxRetryCallBudget : 0,
        });
        recordApiCallEvent({
          type: 'costPlan',
          label: 'Package finalizer call plan',
          detail:
            finalizerCostPlan.finalizerRetryReserve > 0
              ? `${finalizerCostPlan.finalizerRetryReserve} finish retry call${
                  finalizerCostPlan.finalizerRetryReserve === 1 ? '' : 's'
                } reserved`
              : 'No provider calls planned for deterministic final checks',
          costPlan: finalizerCostPlan,
        });

        const retryPassLimit = Math.max(0, Number(maxRetryPasses) || 0);
        let remainingRetryCallBudget = Math.max(0, Number(maxRetryCallBudget) || 0);
        let result = runFinalizer(canRetryWeakSpots ? maxRetryActions : 0);
        commitFinalizerResult(result);
        finalizerCourseMap = result.courseMap || finalizerCourseMap;
        finalizerDeliverables = result.deliverables || finalizerDeliverables;
        let totalRepairsApplied = result.repairsApplied || 0;
        let retryCount = 0;
        let retryPassCount = 0;
        let retryCallCount = 0;
        let skippedRetryCallCount = 0;
        let skippedRetryActionCount = 0;
        let suppressedRetryActionCount = 0;
        let retryBudgetExhausted = false;
        let retryPassLimitReached = false;
        let retryNoProgress = false;
        const attemptedRetryKeys = new Set();
        tracePackageFinish(finishRunId, 'initial_check', {
          status: result.status,
          repairsApplied: result.repairsApplied || 0,
          blockers: result.readiness?.blockers?.length || 0,
          warnings: result.readiness?.warnings?.length || 0,
          retryActionCount: result.retryActions?.length || 0,
          canRetryWeakSpots,
          remainingRetryCallBudget,
        });

        while (
          result.retryActions.length > 0 &&
          canRetryWeakSpots &&
          retryPassCount < retryPassLimit &&
          remainingRetryCallBudget > 0
        ) {
          const costControl =
            apiCallBudgetRef.current?.costControl || evaluateApiCostControl(apiCallBudgetRef.current || {});
          if (costControl.shouldStopRetries) {
            retryBudgetExhausted = true;
            tracePackageFinish(
              finishRunId,
              'retry_stopped_cost_control',
              {
                status: costControl.status,
                reason: costControl.reason,
                totalProviderCalls: costControl.totalProviderCalls,
                hardCallLimit: costControl.hardCallLimit,
                failedCalls: costControl.failedCalls,
              },
              'warn',
            );
            recordApiCallEvent({
              type: 'costControlStop',
              label: 'Retry stopped by cost control',
              detail: costControl.reason,
            });
            break;
          }

          const retryActionsNotSuppressed = result.retryActions.filter(
            (action) =>
              !suppressedPackageRetryKeysRef.current.has(getSuppressedRetryActionKey(action, provider, modelId)),
          );
          const newlySuppressedRetryActionCount = result.retryActions.length - retryActionsNotSuppressed.length;
          if (newlySuppressedRetryActionCount > 0) {
            suppressedRetryActionCount += newlySuppressedRetryActionCount;
            skippedRetryActionCount += newlySuppressedRetryActionCount;
            tracePackageFinish(
              finishRunId,
              'retry_suppressed',
              {
                retryPassCount,
                suppressedRetryActionCount: newlySuppressedRetryActionCount,
                suppressed: result.retryActions
                  .filter((action) =>
                    suppressedPackageRetryKeysRef.current.has(getSuppressedRetryActionKey(action, provider, modelId)),
                  )
                  .map((action) => ({
                    key: getRetryActionKey(action),
                    featureId: action.featureId,
                    lessonIndex: action.lessonIndex,
                    scope: action.scope,
                    message: action.message || '',
                  })),
              },
              'warn',
            );
          }
          if (retryActionsNotSuppressed.length === 0) {
            retryNoProgress = true;
            tracePackageFinish(
              finishRunId,
              'retry_suppressed_no_progress',
              {
                retryPassCount,
                remainingRetryCallBudget,
                unresolvedRetryActions: result.retryActions.map((action) => ({
                  key: getRetryActionKey(action),
                  featureId: action.featureId,
                  lessonIndex: action.lessonIndex,
                  scope: action.scope,
                  message: action.message || '',
                })),
              },
              'warn',
            );
            break;
          }

          const retryActionsNotYetAttempted = retryActionsNotSuppressed.filter(
            (action) => !attemptedRetryKeys.has(getRetryActionKey(action)),
          );
          const repeatedRetryActionCount = retryActionsNotSuppressed.length - retryActionsNotYetAttempted.length;
          skippedRetryActionCount += repeatedRetryActionCount;
          if (retryActionsNotYetAttempted.length === 0) {
            retryNoProgress = true;
            result.retryActions.forEach((action) => {
              suppressedPackageRetryKeysRef.current.add(getSuppressedRetryActionKey(action, provider, modelId));
            });
            tracePackageFinish(
              finishRunId,
              'retry_no_progress',
              {
                retryPassCount,
                remainingRetryCallBudget,
                unresolvedRetryActions: result.retryActions.map((action) => ({
                  key: getRetryActionKey(action),
                  featureId: action.featureId,
                  lessonIndex: action.lessonIndex,
                  scope: action.scope,
                  message: action.message || '',
                })),
              },
              'warn',
            );
            break;
          }

          const retryBudget = selectRetryActionsWithinCallBudget(retryActionsNotYetAttempted, {
            courseMap: result.courseMap || finalizerCourseMap,
            lessonFilter,
            generationPlan,
            maxCalls: remainingRetryCallBudget,
          });
          const retryActionsToRun = retryBudget.selected;
          skippedRetryActionCount += retryBudget.skipped.length;
          skippedRetryCallCount += retryBudget.skipped.reduce((sum, action) => sum + (action.estimatedCalls || 1), 0);

          if (retryActionsToRun.length === 0) {
            retryBudgetExhausted = true;
            tracePackageFinish(
              finishRunId,
              'retry_budget_empty',
              {
                retryPassCount,
                remainingRetryCallBudget,
                skippedRetryActionCount,
                skippedRetryCallCount,
              },
              'warn',
            );
            break;
          }

          retryPassCount += 1;
          tracePackageFinish(finishRunId, 'retry_plan', {
            retryPassCount,
            retryPassLimit,
            selected: retryActionsToRun.map((action) => ({
              key: getRetryActionKey(action),
              featureId: action.featureId,
              lessonIndex: action.lessonIndex,
              scope: action.scope,
              estimatedCalls: action.estimatedCalls,
              message: action.message || '',
            })),
            skipped: retryBudget.skipped.map((action) => ({
              key: getRetryActionKey(action),
              featureId: action.featureId,
              lessonIndex: action.lessonIndex,
              scope: action.scope,
              estimatedCalls: action.estimatedCalls,
              message: action.message || '',
            })),
            usedCalls: retryBudget.usedCalls,
            remainingRetryCallBudget,
          });
          setPackageQualityPass({
            status: 'running',
            message:
              retryActionsToRun.length > 0
                ? `Finishing package: retry pass ${retryPassCount}/${retryPassLimit}, fixing ${retryActionsToRun.length} weak area${
                    retryActionsToRun.length === 1 ? '' : 's'
                  } (${retryBudget.usedCalls} call${retryBudget.usedCalls === 1 ? '' : 's'})...`
                : 'Finishing package: retry plan is over the call budget; checking remaining issues...',
            repairsApplied: totalRepairsApplied,
            warnings: 0,
            blockers: 0,
          });

          for (const action of retryActionsToRun) {
            const retryActionKey = getRetryActionKey(action);
            attemptedRetryKeys.add(retryActionKey);
            tracePackageFinish(finishRunId, 'retry_action_start', {
              key: retryActionKey,
              featureId: action.featureId,
              lessonIndex: action.lessonIndex,
              scope: action.scope,
              estimatedCalls: action.estimatedCalls || 1,
              message: action.message || '',
            });
            if (action.scope === 'feature') {
              const retryResult = await regenerateFeatureRef.current?.(
                result.courseMap || courseMapRef.current,
                [action.featureId],
                lessonFilter,
                { mode: 'finalizerRetry', maxProviderCalls: action.estimatedCalls || 1 },
              );
              tracePackageFinish(finishRunId, 'retry_action_done', {
                key: retryActionKey,
                featureId: action.featureId,
                scope: action.scope,
                status: retryResult?.status || 'unknown',
                returnedDeliverables: Object.keys(retryResult?.deliverables || {}),
              });
              if (retryResult?.deliverables) {
                finalizerDeliverables = { ...finalizerDeliverables, ...retryResult.deliverables };
                deliverablesRef.current = finalizerDeliverables;
              }
            } else {
              const retryResult = await regenerateLessonRef.current?.(
                action.featureId,
                result.courseMap || courseMapRef.current,
                action.lessonIndex,
                { mode: 'finalizerRetry', maxProviderCalls: action.estimatedCalls || 1 },
              );
              tracePackageFinish(finishRunId, 'retry_action_done', {
                key: retryActionKey,
                featureId: action.featureId,
                lessonIndex: action.lessonIndex,
                scope: action.scope,
                status: retryResult?.status || 'unknown',
                itemCount: retryResult?.itemCount,
                hasData: Boolean(retryResult?.data),
              });
              if (retryResult?.data) {
                finalizerDeliverables = {
                  ...finalizerDeliverables,
                  [action.featureId]: {
                    ...(finalizerDeliverables[action.featureId] || {}),
                    status: 'done',
                    data: retryResult.data,
                    error: null,
                    stale: false,
                  },
                };
                deliverablesRef.current = finalizerDeliverables;
              }
            }
            retryCount += 1;
            retryCallCount += action.estimatedCalls || 1;
            await new Promise((resolve) => window.setTimeout(resolve, 0));
            finalizerCourseMap = courseMapRef.current || finalizerCourseMap;
            finalizerDeliverables = deliverablesRef.current || finalizerDeliverables;
          }

          remainingRetryCallBudget = Math.max(0, remainingRetryCallBudget - retryBudget.usedCalls);
          result = runFinalizer(canRetryWeakSpots ? maxRetryActions : 0);
          commitFinalizerResult(result);
          finalizerCourseMap = result.courseMap || finalizerCourseMap;
          finalizerDeliverables = result.deliverables || finalizerDeliverables;
          totalRepairsApplied += result.repairsApplied || 0;
          tracePackageFinish(finishRunId, 'retry_check', {
            status: result.status,
            retryPassCount,
            repairsApplied: result.repairsApplied || 0,
            totalRepairsApplied,
            blockers: result.readiness?.blockers?.length || 0,
            warnings: result.readiness?.warnings?.length || 0,
            retryActionCount: result.retryActions?.length || 0,
            remainingRetryCallBudget,
          });
        }

        if (result.retryActions.length > 0 && canRetryWeakSpots) {
          retryBudgetExhausted = remainingRetryCallBudget <= 0;
          retryPassLimitReached = retryPassCount >= retryPassLimit;
        }

        let exportVerification = null;
        try {
          tracePackageFinish(finishRunId, 'export_verify_start', {
            selectedFeatureIds: featureIds,
            lessonFilter,
            status: result.status,
          });
          const { verifyPackageExports } = await import('./lib/packageExportVerifier');
          exportVerification = await verifyPackageExports({
            courseMap: result.courseMap || courseMapRef.current,
            deliverables: result.deliverables || deliverablesRef.current || {},
            selectedFeatures: featureIds,
            columns,
            lessonFilter,
            slideTheme,
          });
          tracePackageFinish(finishRunId, 'export_verify_done', {
            status: exportVerification?.status,
            checked: exportVerification?.checked || 0,
            failed: exportVerification?.failed || 0,
            warningCount: exportVerification?.warningCount || 0,
          });
        } catch (err) {
          tracePackageFinish(
            finishRunId,
            'export_verify_failed',
            {
              message: err?.message || String(err || 'Export verification failed.'),
            },
            'error',
          );
          exportVerification = {
            status: 'failed',
            checked: 1,
            passed: 0,
            failed: 1,
            warningCount: 0,
            checks: [
              {
                featureId: 'export',
                label: 'Export',
                format: 'package',
                status: 'failed',
                message: err?.message || 'Export verification failed.',
              },
            ],
          };
        }

        const unresolvedRetryCount = result.status === 'needs_retry' ? result.retryActions.length : 0;
        const exportFailures = exportVerification?.failed || 0;
        const exportWarnings = exportVerification?.warningCount || 0;
        const blockers = result.readiness.blockers.length + exportFailures;
        const reviewWarningCount = result.readiness.warnings.length + unresolvedRetryCount + exportWarnings;
        const finalStatus = blockers > 0 ? 'blocked' : 'ready';
        const warnings = finalStatus === 'ready' ? 0 : reviewWarningCount;
        const retryText = retryCount > 0 ? `Retried ${retryCount} weak area${retryCount === 1 ? '' : 's'}. ` : '';
        const skippedRetryText =
          unresolvedRetryCount > 0 && !canRetryWeakSpots
            ? `AI setup is needed to retry ${unresolvedRetryCount} weak area${unresolvedRetryCount === 1 ? '' : 's'}. `
            : retryNoProgress
              ? suppressedRetryActionCount > 0 && retryCount === 0
                ? `Automatic retry already ran without progress; not spending another model call on the same weak area. `
                : `Stopped after retrying the same weak area without progress. `
              : retryPassLimitReached
                ? `Reached the ${retryPassLimit}-pass finishing limit with ${unresolvedRetryCount} weak area${unresolvedRetryCount === 1 ? '' : 's'} still needing attention. `
                : retryBudgetExhausted
                  ? `Reached the ${maxRetryCallBudget}-call finishing budget with ${unresolvedRetryCount} weak area${unresolvedRetryCount === 1 ? '' : 's'} still needing attention. `
                  : skippedRetryActionCount > 0
                    ? `Skipped ${skippedRetryActionCount} broad retry action${skippedRetryActionCount === 1 ? '' : 's'} to stay within the ${maxRetryCallBudget}-call retry budget. `
                    : '';
        const repairText =
          totalRepairsApplied > 0
            ? `Auto-fixed ${totalRepairsApplied} safe issue${totalRepairsApplied === 1 ? '' : 's'}. `
            : '';
        const exportText =
          exportFailures > 0
            ? `Export verification found ${exportFailures} file issue${exportFailures === 1 ? '' : 's'}. `
            : exportWarnings > 0
              ? `Export verification found ${exportWarnings} warning${exportWarnings === 1 ? '' : 's'}. `
              : '';
        const finalizerMessage =
          finalStatus === 'ready'
            ? 'All required files passed export checks and the package is ready to download.'
            : String(result.message || '').replace(/^Auto-fixed \d+ safe issues?\. /, '');
        const receiptBudget = apiCallBudgetRef.current || {};
        const apiSpendSummary = summarizeApiUsageBudget(receiptBudget);
        const apiFeatureSpendSummary = summarizeApiFeatureUsageBudget(receiptBudget, {
          labelForFeature: getReceiptFeatureLabel,
          limit: 5,
        });
        const compilerSummary = summarizeCompilerSavings(receiptBudget, {
          labelForFeature: getReceiptFeatureLabel,
        });
        const receipt = buildQualityReceipt({
          result,
          exportVerification,
          repairsApplied: totalRepairsApplied,
          retryCount,
          selectedFeatureIds: featureIds,
          courseMap: result.courseMap || courseMapRef.current,
          includeWarnings: finalStatus !== 'ready',
          apiSpendSummary,
          compilerSummary,
        });
        const receiptWithSpend = {
          ...receipt,
          ...(apiSpendSummary ? { apiSpendSummary } : {}),
          ...(apiFeatureSpendSummary.length > 0 ? { apiFeatureSpendSummary } : {}),
          ...(compilerSummary ? { compilerSummary } : {}),
        };
        const spendText = apiSpendSummary ? ` API spend: ${apiSpendSummary.label}.` : '';
        const compilerText = compilerSummary ? ` ${compilerSummary.label}.` : '';

        setPackageQualityPass({
          status: finalStatus,
          message:
            finalStatus === 'ready'
              ? `${repairText}${exportText}${finalizerMessage}${spendText}${compilerText}`
              : `${retryText}${skippedRetryText}${repairText}${exportText}${finalizerMessage}${spendText}${compilerText}`,
          repairsApplied: totalRepairsApplied,
          warnings,
          blockers,
          receipt: receiptWithSpend,
        });
        tracePackageFinish(finishRunId, 'finish_complete', {
          finalStatus,
          blockers,
          warnings,
          retryCount,
          retryPassCount,
          retryCallCount,
          skippedRetryActionCount,
          skippedRetryCallCount,
          suppressedRetryActionCount,
          retryBudgetRemaining: remainingRetryCallBudget,
          retryBudgetExhausted,
          retryPassLimitReached,
          retryNoProgress,
          exportStatus: exportVerification?.status,
          apiSpend: apiSpendSummary,
          apiFeatureSpend: apiFeatureSpendSummary,
          compilerSavings: compilerSummary,
        });

        return {
          ...result,
          repairsApplied: totalRepairsApplied,
          retryCount,
          retryPassCount,
          retryCallCount,
          skippedRetryActionCount,
          skippedRetryCallCount,
          suppressedRetryActionCount,
          retryBudgetRemaining: remainingRetryCallBudget,
          retryBudgetExhausted,
          retryPassLimitReached,
          retryNoProgress,
          retryExhausted:
            unresolvedRetryCount > 0 &&
            canRetryWeakSpots &&
            (retryBudgetExhausted || retryPassLimitReached || retryNoProgress),
          exportVerification,
          packageQualityStatus: finalStatus,
          warnings,
          blockers,
          receipt: receiptWithSpend,
          ...(apiSpendSummary ? { apiSpendSummary } : {}),
          ...(apiFeatureSpendSummary.length > 0 ? { apiFeatureSpendSummary } : {}),
          ...(compilerSummary ? { compilerSummary } : {}),
        };
      })();

      packageFinalizerInFlightRef.current = finishPromise;
      try {
        return await finishPromise;
      } finally {
        if (packageFinalizerInFlightRef.current === finishPromise) {
          packageFinalizerInFlightRef.current = null;
        }
      }
    },
    [
      canFinishPackageWithAgent,
      columns,
      commitFinalizerResult,
      deliverableConfig,
      lessonScope.indices,
      lessonScope.type,
      selectedFeatures,
      slideTheme,
      generationPlan,
      modelId,
      provider,
      recordApiCallEvent,
    ],
  );
  packageFinalizerRef.current = handleDeterministicPackageFinalization;

  // (agentHighlight + triggerAgentHighlight moved to UIContext)

  const applyArtifactBlueprintPatches = useCallback(
    (patches = []) => {
      const result = applyCanonicalPatchesToCourseMap(courseMapRef.current, patches);
      if (!result.changed) return result;

      courseMapRef.current = result.courseMap;
      setCourseMap(result.courseMap);
      setDownloadedFile('');
      if (result.userEdits.length > 0) {
        setUserEdits((prev) => [...prev, ...result.userEdits]);
      }
      const labels = [
        ...new Set(result.applied.map((patch) => patch.label || getCanonicalPatchFieldLabel(patch.field))),
      ];
      version.pushVersion(result.courseMap, `Synced artifact edit to ${labels.slice(0, 2).join(', ') || 'course map'}`);
      return result;
    },
    [setCourseMap, setDownloadedFile, setUserEdits, version.pushVersion],
  );

  const resolveArtifactBlueprintPatchRequests = useCallback(
    async (requests = [], { courseMap: sourceCourseMap } = {}) => {
      const validRequests = Array.isArray(requests) ? requests.filter(Boolean) : [];
      if (validRequests.length === 0) return { patches: [], providerCallCount: 0 };
      if (provider !== 'webllm' && !apiKey) {
        return { patches: [], providerCallCount: 0, error: 'No connected AI provider for blueprint patch mapping.' };
      }
      if (!modelId) {
        return { patches: [], providerCallCount: 0, error: 'No model selected for blueprint patch mapping.' };
      }

      const baseCourseMap = sourceCourseMap || courseMapRef.current;
      try {
        const { resolveArtifactBlueprintPatchRequestsWithProvider } =
          await import('./lib/artifactBlueprintPatchResolver');
        return resolveArtifactBlueprintPatchRequestsWithProvider({
          requests: validRequests,
          courseMap: baseCourseMap,
          apiKey,
          provider,
          modelId,
          onBeforeRequest: (request) =>
            recordApiCallEvent({
              type: 'agentLoopCall',
              label: 'Blueprint patch resolver',
              detail: `Lesson ${Number(request.lessonIndex || 0) + 1} ${request.label || 'course-design edit'}`,
              featureId: request.sourceFeatureId || '',
              provider,
              modelId,
            }),
        });
      } catch (err) {
        return {
          patches: [],
          providerCallCount: 0,
          requestsResolved: 0,
          requestsAttempted: validRequests.length,
          error: err?.message || 'Blueprint patch resolver failed.',
        };
      }
    },
    [apiKey, modelId, provider, recordApiCallEvent],
  );

  // ── Cascade Sync Engine ──
  const smartSync = useSmartSync({
    deliv,
    gen,
    courseMapRef,
    selectedFeatures,
    onSyncComplete: useCallback((featureIds) => {
      setUnseenChanges((prev) => {
        const next = new Set(prev);
        featureIds.forEach((id) => next.add(id));
        return next;
      });
    }, []),
    onRequestProposal: useCallback(
      ({ featureId, lessonIndex, editContext, courseMap: cm }) => {
        // Use deliverablesRef so this callback stays stable and never reads stale data
        editProposal.proposeLesson(featureId, cm, lessonIndex, editContext, deliverablesRef.current?.[featureId]?.data);
      },
      [editProposal.proposeLesson],
    ),
    onApplyCanonicalPatches: applyArtifactBlueprintPatches,
    onResolveCanonicalPatchRequests: resolveArtifactBlueprintPatchRequests,
  });

  // Wire editor with smartSync notifyEdit
  const editor = useCourseMapEditor({
    courseMap,
    setCourseMap,
    columns,
    setDownloadedFile,
    setUserEdits,
    pushVersion: version.pushVersion,
    onEdit: smartSync.notifyEdit,
    deliverables: deliv.deliverables,
    optimisticUpdate: deliv.optimisticUpdate,
  });

  // ── Persist API key, provider & model — handled by AIConfigContext ──

  // ── Shared project snapshot builder (used by localStorage, cloud save, and file export) ──
  const buildProjectSnapshot = useCallback(
    (extra = {}) => {
      const safeCourseMap =
        courseMap && typeof courseMap === 'object' && Array.isArray(courseMap.lessons) ? courseMap : { lessons: [] };
      return sanitizeProjectSnapshot({
        formatVersion: 1,
        courseMap: safeCourseMap,
        columns,
        hasGenerated: true,
        provider,
        modelId,
        modelName,
        userEdits,
        chatHistory: sanitizeMessagesForPersistence(chatHistory.slice(-50)),
        fileNames: files.map((f) => f.name),
        versionHistory: version.versionHistory.slice(-30),
        selectedFeatures,
        deliverableConfig,
        lessonScope,
        promptText,
        activeTab,
        deliverables: deliv.deliverables,
        slideTheme,
        savedAt: Date.now(),
        ...extra,
      });
    },
    [
      courseMap,
      columns,
      provider,
      modelId,
      modelName,
      userEdits,
      chatHistory,
      files,
      version.versionHistory,
      selectedFeatures,
      deliverableConfig,
      lessonScope,
      promptText,
      activeTab,
      deliv.deliverables,
      slideTheme,
    ],
  );

  const buildCloudProjectSnapshot = useCallback(
    (extra = {}) => {
      const snapshot = buildProjectSnapshot(extra);
      const selectedDeliverables = (Array.isArray(snapshot.selectedFeatures) ? snapshot.selectedFeatures : []).filter(
        (featureId) => featureId && featureId !== 'courseMap',
      );
      const deliverableEntries = Object.entries(snapshot.deliverables || {});
      const deliverableFeatureIds = [
        ...new Set([...selectedDeliverables, ...deliverableEntries.map(([featureId]) => featureId)]),
      ];
      const deliverableManifest = Object.fromEntries(
        deliverableEntries.map(([featureId, entry]) => [
          featureId,
          {
            status: entry?.status || 'idle',
            stale: entry?.stale === true,
            error: entry?.error ? String(entry.error).slice(0, 240) : '',
          },
        ]),
      );

      return {
        ...snapshot,
        cloudProjectFormat: CLOUD_PROJECT_FORMAT,
        deliverableSaveMode: 'recompile-on-open',
        deliverableFeatureIds,
        deliverableManifest,
        deliverables: {},
      };
    },
    [buildProjectSnapshot],
  );

  const applyDeveloperSnapshot = useCallback(
    (snapshot) => {
      if (!snapshot || typeof snapshot !== 'object') {
        throw new Error('Developer code must be a project JSON object.');
      }
      const restored = prepareProjectSnapshotForRestore(snapshot);
      if (!restored.courseMap || !Array.isArray(restored.courseMap.lessons)) {
        throw new Error('Cannot apply: courseMap.lessons must exist and be an array.');
      }
      if (restored.selectedFeatures !== undefined && !Array.isArray(restored.selectedFeatures)) {
        throw new Error('Cannot apply: selectedFeatures must be an array.');
      }

      const nextSelected =
        Array.isArray(restored.selectedFeatures) && restored.selectedFeatures.length > 0
          ? restored.selectedFeatures
          : ['courseMap'];
      const nextActive =
        typeof restored.activeTab === 'string' && nextSelected.includes(restored.activeTab)
          ? restored.activeTab
          : nextSelected[0] || 'courseMap';

      setCourseMap(restored.courseMap);
      setOldCourseMap(restored.oldCourseMap || null);
      setColumns(Array.isArray(restored.columns) ? restored.columns : [...DEFAULT_COLUMNS]);
      setHasGenerated(true);
      setUserEdits(Array.isArray(restored.userEdits) ? restored.userEdits : []);
      setChatHistory(sanitizeMessagesForPersistence(restored.chatHistory));
      setSelectedFeatures(nextSelected);
      setDeliverableConfig(
        restored.deliverableConfig && typeof restored.deliverableConfig === 'object' ? restored.deliverableConfig : {},
      );
      setLessonScope(
        restored.lessonScope && typeof restored.lessonScope === 'object' ? restored.lessonScope : { type: 'all' },
      );
      setPromptText(typeof restored.promptText === 'string' ? restored.promptText : '');
      setActiveTab(nextActive);
      setSlideTheme(restored.slideTheme ?? null);
      restoreProjectAIConfig(restored);
      deliv.restoreDeliverables(
        restored.deliverables && typeof restored.deliverables === 'object' ? restored.deliverables : {},
      );
      if (!gen.restoreStoppedState()) {
        gen.setProgressStep('done');
        gen.setStatus('done');
      }
      setScreen('workspace');
      setLocalSaveStatus('saving');
      window.setTimeout(() => setLocalSaveStatus('saved'), 0);
    },
    [
      deliv,
      gen,
      setActiveTab,
      setColumns,
      setCourseMap,
      setDeliverableConfig,
      setHasGenerated,
      setLessonScope,
      setOldCourseMap,
      setPromptText,
      restoreProjectAIConfig,
      setScreen,
      setSelectedFeatures,
      setSlideTheme,
      setUserEdits,
    ],
  );

  const saveDeveloperTemplateFromPanel = useCallback(
    (snapshot, name) => {
      const saved = saveDeveloperTemplateFromSnapshot(snapshot, name, user?.uid);
      setDeveloperTemplates(listDeveloperTemplates());
      setActiveDeveloperTemplateId(saved.id);
      return saved;
    },
    [user],
  );

  const renameDeveloperTemplate = useCallback(
    (templateId, name) => {
      const template = developerTemplates.find((t) => t.id === templateId);
      if (!template) return null;
      const saved = saveDeveloperTemplate({ ...template, name }, user?.uid);
      setDeveloperTemplates(listDeveloperTemplates());
      return saved;
    },
    [developerTemplates, user],
  );

  const duplicateDeveloperTemplate = useCallback(
    (templateId) => {
      const template = developerTemplates.find((t) => t.id === templateId);
      if (!template) return null;
      const saved = saveDeveloperTemplate(
        {
          name: `${template.name || 'Developer Template'} Copy`,
          data: template.data,
        },
        user?.uid,
      );
      setDeveloperTemplates(listDeveloperTemplates());
      setActiveDeveloperTemplateId(saved.id);
      return saved;
    },
    [developerTemplates, user],
  );

  const removeDeveloperTemplate = useCallback(
    (templateId) => {
      deleteDeveloperTemplate(templateId, user?.uid);
      setDeveloperTemplates(listDeveloperTemplates());
      setActiveDeveloperTemplateId((prev) => (prev === templateId ? '' : prev));
    },
    [user],
  );

  const applyDeveloperTemplate = useCallback(
    (templateId) => {
      if (!templateId) {
        setActiveDeveloperTemplateId('');
        return;
      }
      const template = developerTemplates.find((t) => t.id === templateId);
      if (!template?.data) return;
      const data = template.data;
      const nextFeatures =
        Array.isArray(data.selectedFeatures) && data.selectedFeatures.length > 0
          ? ['courseMap', ...data.selectedFeatures.filter((id) => id && id !== 'courseMap')]
          : ['courseMap'];
      setSelectedFeatures(nextFeatures);
      setDeliverableConfig(
        data.deliverableConfig && typeof data.deliverableConfig === 'object' ? data.deliverableConfig : {},
      );
      setLessonScope(data.lessonScope && typeof data.lessonScope === 'object' ? data.lessonScope : { type: 'all' });
      if (Array.isArray(data.columns)) setColumns(data.columns);
      if (data.slideTheme !== undefined) setSlideTheme(data.slideTheme);
      restoreProjectAIConfig(data);
      setActiveTab(nextFeatures[0] || 'courseMap');
      setActiveDeveloperTemplateId(template.id);
    },
    [
      developerTemplates,
      setActiveTab,
      setColumns,
      setDeliverableConfig,
      setLessonScope,
      restoreProjectAIConfig,
      setSelectedFeatures,
      setSlideTheme,
    ],
  );

  const saveLocalProjectSnapshot = useCallback(
    (extra = {}) => {
      if (!hasGenerated || !courseMap) return false;
      try {
        setLocalSaveStatus('saving');
        localStorage.setItem(STORAGE_KEY, JSON.stringify(buildProjectSnapshot(extra)));
        setLocalSaveStatus('saved');
        clearTimeout(localStatusTimerRef.current);
        localStatusTimerRef.current = setTimeout(() => setLocalSaveStatus('idle'), 3000);
        return true;
      } catch (e) {
        warn('Save failed:', e);
        setLocalSaveStatus('error');
        clearTimeout(localStatusTimerRef.current);
        localStatusTimerRef.current = setTimeout(() => setLocalSaveStatus('idle'), 5000);
        return false;
      }
    },
    [buildProjectSnapshot, courseMap, hasGenerated],
  );

  // ── Save to localStorage (debounced 3s) ──
  useEffect(() => {
    if (!hasGenerated || !courseMap) return;
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveLocalProjectSnapshot({ projectId: projectIdRef.current });
    }, 3000);
    return () => clearTimeout(saveTimerRef.current);
  }, [hasGenerated, courseMap, buildProjectSnapshot, saveLocalProjectSnapshot]);

  // Keep projectId ref in sync to avoid race conditions
  useEffect(() => {
    projectIdRef.current = projectId;
  }, [projectId]);

  // ── Cloud auto-save (debounced 5s, runs silently) ──
  useEffect(() => {
    if (!user || !hasGenerated || !courseMap) return;
    clearTimeout(cloudSaveTimerRef.current);
    cloudSaveTimerRef.current = setTimeout(async () => {
      try {
        setCloudSaveStatus('saving');
        // Use ref to avoid creating duplicate IDs when effect fires multiple times
        let pid = projectIdRef.current;
        if (!pid) {
          pid = newProjectId();
          projectIdRef.current = pid;
          setProjectId(pid);
        }
        const state = buildCloudProjectSnapshot({
          projectId: pid,
          courseName: courseMap?.courseName || 'Untitled',
          semester: courseMap?.semester || '',
          version: '1.5',
        });
        await cloudSaveProject(user.uid, pid, state);
        saveLocalProjectSnapshot({ projectId: pid });
        setCloudSaveStatus('saved');
        // Reset to idle after 3 seconds
        clearTimeout(cloudStatusTimerRef.current);
        cloudStatusTimerRef.current = setTimeout(() => setCloudSaveStatus('idle'), 3000);
      } catch (e) {
        warn('[Cloud] auto-save failed:', e);
        setCloudSaveStatus('error');
        clearTimeout(cloudStatusTimerRef.current);
        cloudStatusTimerRef.current = setTimeout(() => setCloudSaveStatus('idle'), 5000);
      }
    }, 5000);
    return () => clearTimeout(cloudSaveTimerRef.current);
  }, [user, hasGenerated, courseMap, buildCloudProjectSnapshot, saveLocalProjectSnapshot]);

  // ── On sign-in: merge cloud data (custom deliverables + profile) ──
  const prevUserRef = useRef(null);
  useEffect(() => {
    if (user && user.uid !== prevUserRef.current) {
      prevUserRef.current = user.uid;
      // Fire-and-forget cloud merge
      mergeCloudDeliverables(user.uid).catch(() => {});
      mergeCloudDeveloperTemplates(user.uid)
        .then(setDeveloperTemplates)
        .catch(() => {});
      mergeCloudProfile(user.uid).catch(() => {});
      mergeCloudMemories(user.uid).catch(() => {});
      mergeCloudAgentPrefs(user.uid).catch(() => {});
    }
    if (!user) prevUserRef.current = null;
  }, [user]);

  // ── Detect saved session on mount ──
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = prepareProjectSnapshotForRestore(JSON.parse(raw));
      if (saved.courseMap) setHasSavedSession(true);
    } catch {}
    // Intentionally runs only on mount: checks localStorage once for a saved session.
    // STORAGE_KEY and setHasSavedSession are stable (constant / useState setter) so
    // omitting them from deps is safe and avoids misleading the reader.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Restore saved session ──
  function doRestoreSession() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = prepareProjectSnapshotForRestore(JSON.parse(raw));
      if (!saved.courseMap) return;
      setCourseMap(saved.courseMap);
      setColumns(saved.columns || [...DEFAULT_COLUMNS]);
      setHasGenerated(true);
      restoreProjectAIConfig(saved, { providerFallback: 'openai' });
      setUserEdits(saved.userEdits || []);
      if (saved.fileNames?.length > 0) {
        setFiles(saved.fileNames.map((name) => ({ name, size: 0, _restored: true })));
      }
      if (saved.versionHistory?.length > 0) {
        version.initHistory(saved.versionHistory);
      } else {
        version.pushVersion(saved.courseMap, 'Restored session');
      }
      if (saved.chatHistory) setChatHistory(sanitizeMessagesForPersistence(saved.chatHistory));
      if (saved.selectedFeatures) setSelectedFeatures(saved.selectedFeatures);
      if (saved.lessonScope) setLessonScope(saved.lessonScope);
      if (saved.promptText !== undefined) setPromptText(saved.promptText);
      if (saved.activeTab) setActiveTab(saved.activeTab);
      if (saved.slideTheme !== undefined) setSlideTheme(saved.slideTheme);
      if (saved.deliverableConfig) setDeliverableConfig(saved.deliverableConfig);
      if (saved.projectId) {
        setProjectId(saved.projectId);
        projectIdRef.current = saved.projectId;
      }
      if (saved.deliverables) {
        deliv.restoreDeliverables(saved.deliverables);
      }
      setRestoredSession(true);
      setHasSavedSession(false);
      if (!gen.restoreStoppedState()) {
        gen.setProgressStep('done');
        gen.setStatus('done');
      }
      setScreen('workspace');
    } catch (e) {
      warn('Restore failed:', e);
    }
  }

  // ── Derived ──
  const canGenerate =
    (provider === 'webllm' || apiKey.trim()) &&
    modelId &&
    (files.length > 0 || promptText.trim().length > 0) &&
    gen.status !== 'parsing' &&
    gen.status !== 'generating' &&
    !gen.isStopped;

  const hasSyllabusFile = files.some((f) =>
    ['pdf', 'doc', 'docx', 'odt', 'rtf'].includes(f.name.split('.').pop().toLowerCase()),
  );

  // Lesson count — estimated by regex first, then refined by AI when user proceeds
  const [lessonCount, setLessonCount] = useState(0);
  const [isDetectingLessons, setIsDetectingLessons] = useState(false);

  // ── Handlers ──
  async function handleImport(file) {
    try {
      const imported = await importCourseMap(file);
      setCourseMap(imported);
      setOldCourseMap(null);
      setDownloadedFile('');
      setUserEdits([]);
      version.pushVersion(imported, `Imported from ${file.name}`);
    } catch (err) {
      gen.setError('Import failed: ' + err.message);
    }
  }

  async function handleOpenProject(file) {
    try {
      // .coursemapper files are full JSON project snapshots — restore everything
      if (file.name.endsWith('.coursemapper')) {
        const text = await file.text();
        const saved = prepareProjectSnapshotForRestore(JSON.parse(text));
        if (!saved.courseMap) throw new Error('Invalid .coursemapper file');
        restoreProjectAIConfig(saved);
        setCourseMap(saved.courseMap);
        setOldCourseMap(null);
        setColumns(saved.columns || [...DEFAULT_COLUMNS]);
        setUserEdits(saved.userEdits || []);
        if (saved.chatHistory) setChatHistory(sanitizeMessagesForPersistence(saved.chatHistory));
        if (saved.selectedFeatures) setSelectedFeatures(saved.selectedFeatures);
        if (saved.lessonScope) setLessonScope(saved.lessonScope);
        if (saved.promptText !== undefined) setPromptText(saved.promptText);
        if (saved.activeTab) setActiveTab(saved.activeTab);
        if (saved.slideTheme !== undefined) setSlideTheme(saved.slideTheme);
        if (saved.deliverableConfig) setDeliverableConfig(saved.deliverableConfig);
        if (saved.fileNames?.length > 0) {
          setFiles(saved.fileNames.map((n) => ({ name: n, size: 0, _restored: true })));
        }
        if (saved.versionHistory?.length > 0) {
          version.initHistory(saved.versionHistory);
        } else {
          version.pushVersion(saved.courseMap, `Opened ${file.name}`);
        }
        // Restore deliverables if present
        if (saved.deliverables) {
          deliv.restoreDeliverables(saved.deliverables);
        }
        setHasGenerated(true);
        setHasSavedSession(false);
        gen.setProgressStep('done');
        gen.setStatus('done');
        setScreen('workspace');
        return;
      }
      // Legacy: xlsx/csv course map import
      const imported = await importCourseMap(file);
      setCourseMap(imported);
      setOldCourseMap(null);
      setUserEdits([]);
      version.pushVersion(imported, `Opened ${file.name}`);
      setHasGenerated(true);
      setHasSavedSession(false);
      setScreen('workspace');
    } catch (err) {
      gen.setError('Failed to open project: ' + err.message);
    }
  }

  function handleSaveProject() {
    try {
      const courseName = courseMap?.courseName || 'Course';
      const state = buildProjectSnapshot({ deliverableConfig, version: '1.5' });
      const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${courseName} - CourseMapper Project.coursemapper`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      gen.setError('Save project failed: ' + e.message);
    }
  }

  async function compileCompactCloudDeliverables(saved) {
    if (saved?.deliverableSaveMode !== 'recompile-on-open') return {};
    if (!saved?.courseMap || !Array.isArray(saved.courseMap.lessons)) return {};
    const selectedFeatureIds = Array.isArray(saved.selectedFeatures)
      ? saved.selectedFeatures.filter((featureId) => featureId && featureId !== 'courseMap')
      : [];
    const featureIds =
      Array.isArray(saved.deliverableFeatureIds) && saved.deliverableFeatureIds.length > 0
        ? saved.deliverableFeatureIds
        : selectedFeatureIds;
    if (featureIds.length === 0) return {};

    try {
      const { buildCourseBlueprint, compileBlueprintDeliverables, getBlueprintCompiledFeatures } =
        await import('./lib/courseBlueprintCompiler');
      const compiledFeatureIds = getBlueprintCompiledFeatures(featureIds);
      if (compiledFeatureIds.length === 0) return {};
      const configMap = Object.fromEntries(
        compiledFeatureIds.map((featureId) => [featureId, saved.deliverableConfig?.[featureId] || {}]),
      );
      const blueprint = buildCourseBlueprint(saved.courseMap, {
        compilerPath: {
          mode: 'cloud-restore',
          reason: 'Restored from a compact CourseMapper cloud project.',
        },
      });
      const compiled = compileBlueprintDeliverables(blueprint, compiledFeatureIds, { configMap });
      return Object.fromEntries(
        compiledFeatureIds
          .filter((featureId) => compiled[featureId])
          .map((featureId) => [
            featureId,
            {
              ...(saved.deliverableManifest?.[featureId] || {}),
              status: 'done',
              data: compiled[featureId],
              restoredFrom: 'compact-cloud-project',
            },
          ]),
      );
    } catch (e) {
      warn('[Cloud] compact project restore failed:', e);
      return {};
    }
  }

  // ── Open a cloud project by ID ──
  async function handleOpenCloudProject(pid) {
    if (!user) return;
    try {
      const saved = prepareProjectSnapshotForRestore(await cloudLoadProject(user.uid, pid));
      if (!saved || !saved.courseMap) throw new Error('Project data not found');
      const deliverables = prepareProjectSnapshotForRestore({
        deliverables: await loadProjectDeliverables(user.uid, pid),
      }).deliverables;
      const restoredDeliverables =
        deliverables && Object.keys(deliverables).length > 0
          ? deliverables
          : await compileCompactCloudDeliverables(saved);
      // Restore all state — same as doRestoreSession but from cloud
      setCourseMap(saved.courseMap);
      setColumns(saved.columns || [...DEFAULT_COLUMNS]);
      setHasGenerated(true);
      restoreProjectAIConfig(saved, { providerFallback: 'openai' });
      setUserEdits(saved.userEdits || []);
      if (saved.fileNames?.length > 0) {
        setFiles(saved.fileNames.map((name) => ({ name, size: 0, _restored: true })));
      }
      if (saved.versionHistory?.length > 0) {
        version.initHistory(saved.versionHistory);
      } else {
        version.pushVersion(saved.courseMap, 'Restored from cloud');
      }
      if (saved.chatHistory) setChatHistory(sanitizeMessagesForPersistence(saved.chatHistory));
      if (saved.selectedFeatures) setSelectedFeatures(saved.selectedFeatures);
      if (saved.lessonScope) setLessonScope(saved.lessonScope);
      if (saved.promptText !== undefined) setPromptText(saved.promptText);
      if (saved.activeTab) setActiveTab(saved.activeTab);
      if (saved.slideTheme !== undefined) setSlideTheme(saved.slideTheme);
      if (saved.deliverableConfig) setDeliverableConfig(saved.deliverableConfig);
      if (restoredDeliverables && Object.keys(restoredDeliverables).length > 0) {
        deliv.restoreDeliverables(restoredDeliverables);
      } else if (saved.deliverables) {
        deliv.restoreDeliverables(saved.deliverables);
      }
      setProjectId(pid);
      projectIdRef.current = pid;
      setRestoredSession(true);
      setHasSavedSession(false);
      if (!gen.restoreStoppedState()) {
        gen.setProgressStep('done');
        gen.setStatus('done');
      }
      setScreen('workspace');
    } catch (e) {
      logError('[Cloud] open project failed:', e);
      gen.setError('Failed to open cloud project: ' + e.message);
      throw e; // Re-throw so ProjectPicker can catch and show error
    }
  }

  // ── Save current session as a new cloud project ──
  async function handleSaveCurrentAsNew() {
    if (!user || !courseMap) return;
    try {
      const pid = newProjectId();
      const state = buildCloudProjectSnapshot({
        projectId: pid,
        courseName: courseMap?.courseName || 'Untitled',
        semester: courseMap?.semester || '',
        version: '1.5',
      });
      await cloudSaveProject(user.uid, pid, state);
      setProjectId(pid);
      projectIdRef.current = pid;
    } catch (e) {
      logError('[Cloud] save-as-new failed:', e);
      gen.setError('Failed to save project to cloud: ' + e.message);
    }
  }

  function handleNewProject() {
    // 1. Stop any active generation / streaming first
    gen.handleStop();
    deliv.stopGenerating();
    // 2. Clear pending save timers so old data isn't written after reset
    clearTimeout(saveTimerRef.current);
    clearTimeout(cloudSaveTimerRef.current);
    clearTimeout(cloudStatusTimerRef.current);
    clearTimeout(localStatusTimerRef.current);
    // 3. Remove persisted data before resetting state
    //    (prevents save-effects from re-writing stale data)
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
    // 4. Reset all state
    gen.resetGeneration();
    rev.resetRevision();
    version.resetHistory();
    resetExport();
    deliv.resetDeliverables();
    setCourseMap(null);
    setOldCourseMap(null);
    setUserEdits([]);
    setFiles([]);
    setColumns([...DEFAULT_COLUMNS]);
    setHasGenerated(false);
    setShowDiff(false);
    setRestoredSession(false);
    setChatHistory([]);
    setPromptText('');
    setSelectedFeatures(['courseMap']);
    setLessonScope({ type: 'all' });
    setDeliverableConfig({});
    setLessonCount(0);
    setActiveTab('courseMap');
    setUnseenChanges(new Set());
    setHasSavedSession(false);
    setProjectId(null);
    projectIdRef.current = null;
    setLocalSaveStatus('idle');
    setCloudSaveStatus('idle');
    setNewProjectError('');
    setNewProjectCloudSaveFailed(false);
    setScreen('landing');
    onReturnToLanding?.();
  }

  useEffect(() => {
    if (screen !== 'features' || !activeDeveloperTemplateId) return;
    if (!developerTemplates.some((template) => template.id === activeDeveloperTemplateId)) return;
    applyDeveloperTemplate(activeDeveloperTemplateId);
  }, [screen, activeDeveloperTemplateId, developerTemplates, applyDeveloperTemplate]);

  async function handleConfirmNewProject() {
    if (isStartingNewProject) return;
    setNewProjectError('');
    setIsStartingNewProject(true);
    try {
      clearTimeout(saveTimerRef.current);
      if (courseMap && hasGenerated) {
        saveLocalProjectSnapshot({ projectId: projectIdRef.current });
      }

      if (user && courseMap && hasGenerated) {
        clearTimeout(cloudSaveTimerRef.current);
        setCloudSaveStatus('saving');
        let pid = projectIdRef.current;
        if (!pid) {
          pid = newProjectId();
          projectIdRef.current = pid;
          setProjectId(pid);
        }
        const state = buildCloudProjectSnapshot({
          projectId: pid,
          courseName: courseMap?.courseName || 'Untitled',
          semester: courseMap?.semester || '',
          version: '1.5',
        });
        await cloudSaveProject(user.uid, pid, state);
        setCloudSaveStatus('saved');
      }

      setNewProjectConfirm(false);
      handleNewProject();
    } catch (e) {
      warn('[Cloud] final save before new project failed:', e);
      setCloudSaveStatus('error');
      setNewProjectCloudSaveFailed(true);
      setNewProjectError(
        'My Projects save did not finish. Your current project is still open. Download a backup or start without cloud save.',
      );
    } finally {
      setIsStartingNewProject(false);
    }
  }

  function handleStartNewProjectWithoutCloudSave() {
    if (isStartingNewProject) return;
    setIsStartingNewProject(true);
    try {
      clearTimeout(saveTimerRef.current);
      clearTimeout(cloudSaveTimerRef.current);
      if (courseMap && hasGenerated) {
        saveLocalProjectSnapshot({ projectId: projectIdRef.current });
      }
      setNewProjectConfirm(false);
      handleNewProject();
    } finally {
      setIsStartingNewProject(false);
    }
  }

  const handleAddMaterials = useCallback(
    async (e) => {
      const newFiles = Array.from(e.target.files);
      if (newFiles.length === 0) return;
      e.target.value = '';
      setFiles((prev) => [...prev, ...newFiles]);
      let parsed;
      try {
        parsed = await parseFiles(newFiles);
      } catch (err) {
        gen.setError('Failed to parse new files: ' + err.message);
        return;
      }
      const newText = parsed
        .filter((f) => f.text)
        .map((f) => `=== File: ${f.name} ===\n${f.text}`)
        .join('\n\n');
      if (!newText.trim()) {
        gen.setError('No text content could be extracted from the new files.');
        return;
      }
      const revisionMsg = `The instructor has provided additional course materials. Please review these materials and update the course map to incorporate any relevant content, topics, assessments, activities, or resources that are missing or need updating.\n\nNew materials:\n${newText.slice(0, 30000)}`;
      try {
        await rev.handleRevision(revisionMsg);
      } catch (err) {
        if (err.message) gen.setError('Material revision failed: ' + err.message);
      }
    },
    [rev, gen, setFiles],
  );

  function getOrderedSelectedDeliverables() {
    const allFeats = [...FEATURES, ...listCustomDeliverables().map(toFeatureEntry)];
    return allFeats.filter((f) => selectedFeatures.includes(f.id) && f.id !== 'courseMap').map((f) => f.id);
  }

  async function finalizeGeneratedPackage(finalCourseMap, generatedDeliverables, generatedFeatureIds, scopeIndices) {
    const selectedForFinalizer = ['courseMap', ...generatedFeatureIds];
    if (selectedForFinalizer.length === 0) return null;
    return handleDeterministicPackageFinalization({
      selectedFeatureIds: selectedForFinalizer,
      lessonFilter: scopeIndices,
      retry: true,
      maxRetryActions: 8,
      maxRetryCallBudget: 8,
      maxRetryPasses: 2,
      courseMapOverride: finalCourseMap,
      deliverablesOverride: generatedDeliverables || {},
      source: 'generation',
    });
  }

  const handleAgentGenerateFeatures = useCallback(
    async ({ featureIds = [], lessonFilter = null, source = 'agent-plan' } = {}) => {
      const requestedFeatures = [
        ...new Set((Array.isArray(featureIds) ? featureIds : [featureIds]).filter(Boolean)),
      ].filter((featureId) => featureId !== 'courseMap');
      if (requestedFeatures.length === 0) {
        return {
          status: 'skipped',
          completedFeatureIds: [],
          failedFeatureIds: [],
          message: 'No deliverables selected.',
        };
      }
      const currentCourseMap = courseMapRef.current;
      if (!currentCourseMap?.lessons?.length) {
        throw new Error('Generate the course map before generating deliverables.');
      }
      if (packageGenerationInFlightRef.current) {
        return {
          status: 'busy',
          completedFeatureIds: [],
          failedFeatureIds: requestedFeatures,
          message: 'Package generation is already running.',
        };
      }

      packageGenerationInFlightRef.current = true;
      try {
        setHasGenerated(true);
        setDownloadedFile('');
        setPackageQualityPass({
          status: 'running',
          message: `Generating ${requestedFeatures.length} deliverable${
            requestedFeatures.length === 1 ? '' : 's'
          }, then checking the package...`,
          repairsApplied: 0,
          warnings: 0,
          blockers: 0,
        });
        const scopeIndices =
          Array.isArray(lessonFilter) || lessonFilter === null
            ? lessonFilter
            : lessonScope.type === 'specific'
              ? lessonScope.indices
              : null;
        const result = await deliv.generateAll(currentCourseMap, requestedFeatures, scopeIndices);
        const completedFeatureIds = Array.isArray(result?.completedFeatureIds) ? result.completedFeatureIds : [];
        const failedFeatureIds = Array.isArray(result?.failedFeatureIds) ? result.failedFeatureIds : [];
        const generatedDeliverables = result?.deliverables || {};
        if (completedFeatureIds.length > 0) {
          await handleDeterministicPackageFinalization({
            selectedFeatureIds: ['courseMap', ...completedFeatureIds],
            lessonFilter: scopeIndices,
            retry: true,
            maxRetryActions: 6,
            maxRetryCallBudget: 6,
            maxRetryPasses: 2,
            courseMapOverride: currentCourseMap,
            deliverablesOverride: generatedDeliverables,
            source,
          });
        } else {
          setPackageQualityPass({
            status: 'blocked',
            message: 'Generation did not complete. Fix the generation issue and try again.',
            repairsApplied: 0,
            warnings: 0,
            blockers: 1,
          });
        }
        return {
          status: failedFeatureIds.length > 0 ? 'partial' : 'generated',
          completedFeatureIds,
          failedFeatureIds,
          deliverables: generatedDeliverables,
        };
      } catch (err) {
        setPackageQualityPass({
          status: 'blocked',
          message: err?.message || 'Agent generation could not complete.',
          repairsApplied: 0,
          warnings: 0,
          blockers: 1,
        });
        throw err;
      } finally {
        packageGenerationInFlightRef.current = false;
      }
    },
    [deliv, handleDeterministicPackageFinalization, lessonScope.indices, lessonScope.type, setDownloadedFile],
  );

  const handleAgentAuditPackage = useCallback(
    async ({ selectedFeatureIds = selectedFeatures, lessonFilter = null } = {}) => {
      const featureIds =
        Array.isArray(selectedFeatureIds) && selectedFeatureIds.length > 0 ? selectedFeatureIds : selectedFeatures;
      const scopeIndices =
        Array.isArray(lessonFilter) || lessonFilter === null
          ? lessonFilter
          : lessonScope.type === 'specific'
            ? lessonScope.indices
            : null;
      const finalizerCourseMap = courseMapRef.current;
      const finalizerDeliverables = deliverablesRef.current || {};
      const readiness = evaluateWorkspaceReadiness({
        courseMap: finalizerCourseMap,
        deliverables: finalizerDeliverables,
        selectedFeatures: featureIds,
        columns,
        lessonFilter: scopeIndices,
      });
      const classroomReadiness = evaluateClassroomReadiness({
        courseMap: finalizerCourseMap,
        deliverables: finalizerDeliverables,
        selectedFeatures: featureIds,
        lessonFilter: scopeIndices,
      });
      const healthReport = generateCourseHealthReport(finalizerCourseMap, finalizerDeliverables);
      const exportVerification = await verifyPackageExports({
        courseMap: finalizerCourseMap,
        deliverables: finalizerDeliverables,
        selectedFeatures: featureIds,
        columns,
        lessonFilter: scopeIndices,
        slideTheme,
      }).catch((err) => ({
        status: 'failed',
        checked: 0,
        passed: 0,
        failed: 1,
        warningCount: 0,
        checks: [
          {
            featureId: 'package',
            label: 'Package',
            format: 'export',
            status: 'failed',
            message: err?.message || 'Export verification failed.',
          },
        ],
      }));
      const confidence = getReadOnlyPackageConfidence(readiness, classroomReadiness, healthReport, exportVerification);
      const blockerCount =
        readiness.blockers.length +
        classroomReadiness.blockers.length +
        healthReport.errorCount +
        exportVerification.failed;
      const warningCount =
        readiness.warnings.length +
        classroomReadiness.warnings.length +
        healthReport.warningCount +
        exportVerification.warningCount;

      return {
        confidence,
        ready: confidence === 'Excellent',
        nextAction: getReadOnlyPackageNextAction(confidence),
        repairsApplied: 0,
        repairsFailed: 0,
        repairs: [],
        repairSummary: 'none',
        reviewRecommendation: buildHumanReviewRecommendation({
          blockerCount,
          warningCount,
          repaired: false,
        }),
        readiness: {
          status: readiness.status,
          isBlocked: readiness.isBlocked,
          blockerCount: readiness.blockers.length,
          warningCount: readiness.warnings.length,
          issueCount: readiness.issues.length,
          lessonCount: readiness.lessonCount,
          checkedSections: `${readiness.doneFeatureCount}/${readiness.featureCount}`,
          blockers: readiness.blockers.slice(0, 20).map(summarizeReceiptIssue),
          warnings: readiness.warnings.slice(0, 20).map(summarizeReceiptIssue),
        },
        classroomReadiness: {
          status: classroomReadiness.status,
          isBlocked: classroomReadiness.isBlocked,
          blockerCount: classroomReadiness.blockers.length,
          warningCount: classroomReadiness.warnings.length,
          issueCount: classroomReadiness.issues.length,
          lessonCount: classroomReadiness.lessonCount,
          checkedFeatureCount: classroomReadiness.checkedFeatureCount,
          checkedFeatures: classroomReadiness.checkedFeatures,
          blockers: classroomReadiness.blockers.slice(0, 20).map(summarizeReceiptIssue),
          warnings: classroomReadiness.warnings.slice(0, 20).map(summarizeReceiptIssue),
        },
        validation: {
          errorCount: healthReport.errorCount,
          warningCount: healthReport.warningCount,
          infoCount: healthReport.infoCount,
          findings: healthReport.findings.slice(0, 20).map((finding) => ({
            severity: finding.severity,
            category: finding.category,
            message: finding.message,
            lessonIndex: finding.lessonIndex,
          })),
        },
        exportVerification: {
          status: exportVerification.status,
          checked: exportVerification.checked,
          passed: exportVerification.passed,
          failed: exportVerification.failed,
          warningCount: exportVerification.warningCount,
          checks: exportVerification.checks.slice(0, 20).map((check) => ({
            featureId: check.featureId,
            label: check.label,
            format: check.format,
            status: check.status,
            message: check.message,
          })),
        },
      };
    },
    [columns, lessonScope.indices, lessonScope.type, selectedFeatures, slideTheme],
  );

  async function onGenerate() {
    if (packageGenerationInFlightRef.current) return;
    packageGenerationInFlightRef.current = true;
    try {
      setHasGenerated(true);
      setPackageQualityPass({
        status: 'running',
        message: 'Generating, repairing, and verifying the package before export...',
        repairsApplied: 0,
        warnings: 0,
        blockers: 0,
      });
      setDownloadedFile('');
      setActiveTab('courseMap');
      suppressedPackageRetryKeysRef.current.clear();
      deliv.resetDeliverables();
      setScreen('workspace');

      const finalCourseMap = await gen.handleGenerate();
      if (!finalCourseMap?.lessons?.length) {
        setPackageQualityPass({
          status: 'blocked',
          message: 'Generation did not complete. Fix the generation issue and try again.',
          repairsApplied: 0,
          warnings: 0,
          blockers: 1,
        });
        return;
      }

      const scopeIndices = lessonScope.type === 'specific' ? lessonScope.indices : null;
      const orderedFeatures = getOrderedSelectedDeliverables();
      let generatedDeliverables = {};
      if (orderedFeatures.length > 0) {
        const deliverableResult = await deliv.generateAll(finalCourseMap, orderedFeatures, scopeIndices);
        generatedDeliverables = deliverableResult?.deliverables || {};
      }

      await finalizeGeneratedPackage(finalCourseMap, generatedDeliverables, orderedFeatures, scopeIndices);
    } catch (err) {
      setPackageQualityPass({
        status: 'blocked',
        message: err?.message || 'Package generation could not complete.',
        repairsApplied: 0,
        warnings: 0,
        blockers: 1,
      });
    } finally {
      packageGenerationInFlightRef.current = false;
    }
  }

  async function onResume() {
    if (packageGenerationInFlightRef.current) return;
    packageGenerationInFlightRef.current = true;
    try {
      setPackageQualityPass({
        status: 'running',
        message: 'Resuming generation, then repairing and verifying the package...',
        repairsApplied: 0,
        warnings: 0,
        blockers: 0,
      });
      const finalCourseMap = await gen.handleResume();
      if (!finalCourseMap?.lessons?.length) {
        setPackageQualityPass({
          status: 'blocked',
          message: 'Resume did not complete. Fix the generation issue and try again.',
          repairsApplied: 0,
          warnings: 0,
          blockers: 1,
        });
        return;
      }
      const scopeIndices = lessonScope.type === 'specific' ? lessonScope.indices : null;
      const orderedFeatures = getOrderedSelectedDeliverables();
      let generatedDeliverables = {};
      if (orderedFeatures.length > 0) {
        const deliverableResult = await deliv.generateAll(finalCourseMap, orderedFeatures, scopeIndices);
        generatedDeliverables = deliverableResult?.deliverables || {};
      }
      await finalizeGeneratedPackage(finalCourseMap, generatedDeliverables, orderedFeatures, scopeIndices);
    } catch (err) {
      setPackageQualityPass({
        status: 'blocked',
        message: err?.message || 'Package resume could not complete.',
        repairsApplied: 0,
        warnings: 0,
        blockers: 1,
      });
    } finally {
      packageGenerationInFlightRef.current = false;
    }
  }
  function onStop() {
    gen.handleStop();
  }

  // ── Detect lesson count using AI when user proceeds from landing ──
  async function handleLandingContinue() {
    setChatHistory((prev) => upsertLandingAgentContextMessages(prev, { promptText, files }));
    setScreen('features');

    const parseLandingFilesForContext = async () => {
      if (files.length === 0) return { combinedText: promptText, parsed: [] };
      const parsed = await parseFiles(files);
      setChatHistory((prev) => upsertLandingAgentContextMessages(prev, { promptText, files, parsedFiles: parsed }));
      const fileText = parsed
        .filter((f) => f.text)
        .map((f) => f.text)
        .join('\n\n')
        .slice(0, 20000);
      return { combinedText: [promptText, fileText].filter(Boolean).join('\n\n'), parsed };
    };

    // Start with a regex scan of promptText for instant feedback
    const promptRegex = detectExpectedLessons(promptText);
    const regexCount = promptRegex.expected || 0;
    if (regexCount) setLessonCount(regexCount);

    // If regex already found a high-confidence result (e.g. "15-week"), trust it
    // and skip the AI call — AI can miscount by multiplying weeks × sessions/week
    // when the text doesn't state meeting frequency explicitly.
    if (promptRegex.confidence === 'high' && regexCount) {
      if (files.length > 0) {
        try {
          await parseLandingFilesForContext();
        } catch {
          /* file parse failed — keep prompt and file-name context */
        }
      }
      setIsDetectingLessons(false);
      return;
    }

    // Parse uploaded files in background, then try regex + AI on combined text
    if (modelId) {
      setIsDetectingLessons(true);
      try {
        let combinedText = promptText;
        if (files.length > 0) {
          try {
            ({ combinedText } = await parseLandingFilesForContext());
            // Re-run regex on combined text — syllabus may have explicit week count
            const combinedRegex = detectExpectedLessons(combinedText);
            if (combinedRegex.expected) setLessonCount(combinedRegex.expected);
            // If combined regex is high-confidence, trust it and skip AI
            if (combinedRegex.confidence === 'high') return;
          } catch {
            /* file parse failed — use promptText only */
          }
        }
        // Only call AI when regex couldn't confidently determine lesson count
        const aiCount = await detectLessonsWithAI(combinedText, { provider, apiKey, modelId });
        if (aiCount) setLessonCount(aiCount);
      } catch {
        /* silent — regex fallback is fine */
      } finally {
        setIsDetectingLessons(false);
      }
    }
  }

  useEffect(() => {
    if (!startupAction) return undefined;
    let cancelled = false;

    async function runStartupAction() {
      try {
        if (startupAction.type === 'continue') {
          await handleLandingContinue();
        } else if (startupAction.type === 'restore') {
          doRestoreSession();
        } else if (startupAction.type === 'openProjectFile') {
          await handleOpenProject(startupAction.file);
        } else if (startupAction.type === 'importCourseMap') {
          await handleImport(startupAction.file);
          setHasGenerated(true);
          setHasSavedSession(false);
          setScreen('workspace');
        } else if (startupAction.type === 'openCloudProject') {
          await handleOpenCloudProject(startupAction.projectId);
        }
      } catch (err) {
        warn('[Startup] action failed:', err);
      } finally {
        if (!cancelled) {
          setIsHandlingStartupAction(false);
          onStartupHandled?.();
        }
      }
    }

    runStartupAction();
    return () => {
      cancelled = true;
    };
    // Startup actions intentionally run once when the lazy app flow mounts.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (isHandlingStartupAction) {
    return <LoadingScreen />;
  }

  // ── Screen: Landing ──
  if (screen === 'landing') {
    return (
      <>
        <Landing
          onGenerate={handleLandingContinue}
          canGenerate={
            (files.length > 0 || promptText.trim().length > 0) &&
            (provider === 'webllm' || apiKey.trim()) &&
            !!modelId &&
            apiStatus === 'connected'
          }
          isGenerating={false}
          hasSavedSession={hasSavedSession}
          onRestoreSession={doRestoreSession}
          onDismissSavedSession={() => {
            try {
              localStorage.removeItem(STORAGE_KEY);
            } catch {}
            setHasSavedSession(false);
          }}
          onImportCourseMap={handleImport}
          onOpenProject={handleOpenProject}
          onExampleSelect={(text) => setPromptText(text)}
          onOpenProjects={user ? () => setShowProjectPicker(true) : undefined}
          developerMode={developerMode}
          onDeveloperModeChange={setDeveloperMode}
        />
        {/* Cloud project picker — available on landing when signed in */}
        {showProjectPicker && (
          <Suspense fallback={null}>
            <ProjectPicker
              isOpen={showProjectPicker}
              onClose={() => setShowProjectPicker(false)}
              onOpenProject={handleOpenCloudProject}
              onSaveCurrentAsNew={null}
              onDeleteProject={(deletedId, remainingCount) => {
                if (deletedId === projectIdRef.current || remainingCount === 0) {
                  try {
                    localStorage.removeItem(STORAGE_KEY);
                  } catch {}
                  setHasSavedSession(false);
                  if (deletedId === projectIdRef.current) {
                    setProjectId(null);
                  }
                }
              }}
            />
          </Suspense>
        )}
      </>
    );
  }

  // ── Screen: Feature Select ──
  if (screen === 'features') {
    return (
      <Suspense fallback={<WorkspaceSkeleton />}>
        <FeatureSelect
          hasSyllabusFile={hasSyllabusFile}
          onBack={() => setScreen('landing')}
          onNext={() => setScreen('config')}
          developerTemplates={developerTemplates}
          activeDeveloperTemplateId={activeDeveloperTemplateId}
          onApplyDeveloperTemplate={applyDeveloperTemplate}
        />
      </Suspense>
    );
  }

  // ── Screen: Config ──
  if (screen === 'config') {
    return (
      <Suspense fallback={<ConfigSkeleton />}>
        <Config
          lessonCount={lessonCount}
          promptText={promptText}
          isDetectingLessons={isDetectingLessons}
          deliverables={deliv.deliverables}
          onBack={() => setScreen('features')}
          onGenerate={onGenerate}
          canGenerate={canGenerate}
          provider={provider}
        />
      </Suspense>
    );
  }

  // ── Screen: Workspace ──
  // Build ordered tab list from selected features — order follows selectedFeatures array
  const allFeaturesForTabs = [...FEATURES, ...listCustomDeliverables().map(toFeatureEntry)];
  const featureMap = Object.fromEntries(allFeaturesForTabs.map((f) => [f.id, f]));
  const workspaceTabs = selectedFeatures.map((id) => featureMap[id]).filter(Boolean);
  const mobileWorkspaceViews = [
    { id: 'content', label: activeTab === 'courseMap' ? 'Course Map' : 'Content' },
    { id: 'agent', label: 'Agent' },
    ...(courseMap && gen.progressStep === 'done' ? [{ id: 'export', label: 'Export' }] : []),
  ];

  // Pointer-based tab drag: smoother than native HTML5 DnD and avoids clipped overlays.
  const draggedTab = tabDrag ? workspaceTabs.find((f) => f.id === tabDrag.id) : null;
  const canDeleteDraggedTab = !!draggedTab && draggedTab.id !== 'courseMap';
  const developerIdeDisabledReason = gen.isStreaming
    ? 'Course map generation is still running.'
    : deliv.isGenerating
      ? 'Deliverables are still generating.'
      : rev.isRevising
        ? 'Course revision is still applying.'
        : smartSync.isSyncing
          ? 'Workspace sync is still applying.'
          : '';
  const developerIdeDisabled = Boolean(developerIdeDisabledReason);
  const activeDeliverableProgressIds = Object.keys(deliv.progress?.perFeature || {});
  const activeDeliverableProgressTotal = activeDeliverableProgressIds.length || deliv.progress?.total || 0;
  const activeDeliverableReadyCount = activeDeliverableProgressIds.filter(
    (featureId) => deliv.deliverables?.[featureId]?.status === 'done',
  ).length;

  const handleTabPointerDown = (feature, tabIdx) => (e) => {
    if (e.button !== 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    setDragTabIdx(tabIdx);
    setTabDrag({
      id: feature.id,
      label: feature.label,
      index: tabIdx,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      pointerX: e.clientX,
      pointerY: e.clientY,
      originX: rect.left,
      originY: rect.top,
      x: rect.left,
      y: rect.top,
      width: rect.width,
      height: rect.height,
      overIndex: tabIdx,
      overDelete: false,
      moved: false,
    });
    handleCascadeHover(null);
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  const handleTabPointerMove = (featureId) => (e) => {
    setTabDrag((prev) => {
      if (!prev || prev.id !== featureId || prev.pointerId !== e.pointerId) return prev;
      const dx = e.clientX - prev.startX;
      const dy = e.clientY - prev.startY;
      const moved = prev.moved || Math.hypot(dx, dy) > 4;
      let overDelete = false;
      let overIndex = prev.overIndex;

      if (moved) {
        const trashRect = trashDropRef.current?.getBoundingClientRect();
        if (trashRect) {
          overDelete =
            e.clientX >= trashRect.left - 12 &&
            e.clientX <= trashRect.right + 12 &&
            e.clientY >= trashRect.top - 12 &&
            e.clientY <= trashRect.bottom + 12;
        }
        if (!overDelete) {
          let nearest = null;
          for (const [id, el] of tabButtonRefs.current.entries()) {
            if (!el || id === prev.id) continue;
            const rect = el.getBoundingClientRect();
            const yNear = e.clientY >= rect.top - 22 && e.clientY <= rect.bottom + 22;
            if (!yNear) continue;
            const centerX = rect.left + rect.width / 2;
            const distance = Math.abs(e.clientX - centerX);
            if (!nearest || distance < nearest.distance) {
              const idx = workspaceTabs.findIndex((f) => f.id === id);
              nearest = { idx, distance };
            }
          }
          if (nearest && nearest.idx >= 0) overIndex = nearest.idx;
        }
      }

      return {
        ...prev,
        pointerX: e.clientX,
        pointerY: e.clientY,
        x: prev.originX + dx,
        y: prev.originY + dy,
        overIndex,
        overDelete,
        moved,
      };
    });
  };

  const finishTabDrag = (drag) => {
    setDragTabIdx(null);
    setTabDrag(null);
    if (!drag?.moved) return;

    suppressTabClickRef.current = true;
    window.setTimeout(() => {
      suppressTabClickRef.current = false;
    }, 0);

    if (drag.overDelete && drag.id !== 'courseMap') {
      setDeleteTabConfirm({ id: drag.id, label: drag.label });
      return;
    }
    if (drag.overDelete) return;

    const dropIdx = drag.overIndex;
    if (dropIdx == null || dropIdx === drag.index) return;
    setSelectedFeatures((prev) => {
      const fromIdx = prev.indexOf(drag.id);
      if (fromIdx < 0 || dropIdx < 0 || dropIdx >= prev.length || fromIdx === dropIdx) return prev;
      const next = [...prev];
      const [moved] = next.splice(fromIdx, 1);
      next.splice(dropIdx, 0, moved);
      return next;
    });
  };

  const handleTabPointerUp = (featureId) => (e) => {
    if (!tabDrag || tabDrag.id !== featureId || tabDrag.pointerId !== e.pointerId) return;
    finishTabDrag(tabDrag);
  };

  const handleTabPointerCancel = (featureId) => (e) => {
    if (!tabDrag || tabDrag.id !== featureId || tabDrag.pointerId !== e.pointerId) return;
    setDragTabIdx(null);
    setTabDrag(null);
  };

  const confirmDeleteDeliverable = () => {
    const target = deleteTabConfirm;
    if (!target || target.id === 'courseMap') return;

    const deleteIdx = selectedFeatures.indexOf(target.id);
    const nextFeatures = selectedFeatures.filter((id) => id !== target.id);
    const safeNextFeatures = nextFeatures.length > 0 ? nextFeatures : ['courseMap'];
    if (activeTab === target.id) {
      setActiveTab(safeNextFeatures[Math.min(Math.max(deleteIdx, 0), safeNextFeatures.length - 1)] || 'courseMap');
    }
    setSelectedFeatures(safeNextFeatures);
    setDeliverableConfig((prev) => {
      if (!prev?.[target.id]) return prev;
      const next = { ...prev };
      delete next[target.id];
      return next;
    });
    deliv.removeDeliverable(target.id);
    setUnseenChanges((prev) => {
      if (!prev.has(target.id)) return prev;
      const next = new Set(prev);
      next.delete(target.id);
      return next;
    });
    setDeleteTabConfirm(null);
  };

  return (
    <Suspense fallback={<WorkspaceSkeleton />}>
      <div className="min-h-screen mesh-bg noise-overlay">
        <Header
          onOpenProjects={() => setShowProjectPicker(true)}
          developerMode={developerMode}
          onDeveloperModeChange={setDeveloperMode}
          onOpenDeveloperPanel={() => {
            if (!developerIdeDisabled) setShowDeveloperPanel(true);
          }}
          developerIdeDisabled={developerIdeDisabled}
          developerIdeDisabledReason={developerIdeDisabledReason}
        />

        {/* Cloud save runs silently */}

        <main className="w-full px-4 sm:px-6 pb-10 space-y-4">
          {/* Top bar */}
          <div className="workspace-header-row flex flex-wrap items-center gap-2 sm:gap-3 animate-spring-in pt-1">
            <button
              onClick={() => {
                setNewProjectError('');
                setNewProjectCloudSaveFailed(false);
                setNewProjectConfirm(true);
              }}
              className="tactile group flex items-center gap-2 px-3 sm:px-4 py-2 rounded-pill text-xs font-semibold text-slate-500 bg-white/50 border border-slate-200/40 hover:bg-white/70 hover:text-slate-700 shadow-glass transition-all duration-300"
            >
              <svg
                className="w-3.5 h-3.5 group-hover:rotate-90 transition-transform duration-300"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New Project
            </button>
            <button
              onClick={() => addMaterialInputRef.current?.click()}
              disabled={gen.isStreaming || rev.isRevising}
              className="tactile group flex items-center gap-2 px-3 sm:px-4 py-2 rounded-pill text-xs font-semibold text-sky-600 bg-sky-50/50 border border-sky-200/40 hover:bg-sky-100/70 shadow-glass transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                />
              </svg>
              Add Materials
            </button>
            <input
              ref={addMaterialInputRef}
              type="file"
              multiple
              accept=".doc,.docx,.pdf,.txt,.md,.csv,.rtf,.html,.htm,.xlsx,.xls,.ods,.ppt,.pptx,.odp,.odt,.epub,.key,.pages,.zip"
              onChange={handleAddMaterials}
              className="hidden"
            />
            {modelName && (
              <span className="ml-auto text-[10px] font-semibold text-indigo-500 bg-indigo-50/60 px-3 py-1 rounded-pill border border-indigo-100/50">
                {modelName}
              </span>
            )}
            {courseMap && (
              <span
                className={`text-[10px] font-semibold px-3 py-1 rounded-pill border ${
                  cloudSaveStatus === 'error' || localSaveStatus === 'error'
                    ? 'text-red-500 bg-red-50/60 border-red-100/70'
                    : cloudSaveStatus === 'saving' || localSaveStatus === 'saving'
                      ? 'text-slate-500 bg-white/60 border-slate-200/60'
                      : user
                        ? 'text-emerald-600 bg-emerald-50/60 border-emerald-100/70'
                        : 'text-slate-500 bg-white/60 border-slate-200/60'
                }`}
                title={
                  user
                    ? 'Signed-in projects autosave locally and to My Projects.'
                    : 'Anonymous projects autosave only in this browser. Export .coursemapper for a portable backup.'
                }
              >
                {cloudSaveStatus === 'saving'
                  ? 'Saving to My Projects...'
                  : cloudSaveStatus === 'error'
                    ? 'Cloud save failed'
                    : localSaveStatus === 'saving'
                      ? 'Saving locally...'
                      : localSaveStatus === 'error'
                        ? 'Local save failed'
                        : user
                          ? 'Autosaved to My Projects'
                          : 'Autosaved in this browser'}
              </span>
            )}
            {version.versionHistory.length > 1 && !gen.isStreaming && (
              <div className="flex items-center gap-1">
                <button
                  onClick={version.undo}
                  disabled={version.activeVersion <= 0}
                  className={`tactile p-2 rounded-full transition-all duration-200 ${version.activeVersion > 0 ? 'text-slate-500 hover:bg-white/60 hover:text-indigo-500' : 'text-slate-300 cursor-not-allowed'}`}
                  title="Undo"
                  aria-label="Undo"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M3 10h10a5 5 0 015 5v2M3 10l4-4M3 10l4 4"
                    />
                  </svg>
                </button>
                <button
                  onClick={version.redo}
                  disabled={version.activeVersion >= version.versionHistory.length - 1}
                  className={`tactile p-2 rounded-full transition-all duration-200 ${version.activeVersion < version.versionHistory.length - 1 ? 'text-slate-500 hover:bg-white/60 hover:text-indigo-500' : 'text-slate-300 cursor-not-allowed'}`}
                  title="Redo"
                  aria-label="Redo"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M21 10H11a5 5 0 00-5 5v2M21 10l-4-4M21 10l-4 4"
                    />
                  </svg>
                </button>
                <span className="text-[10px] font-medium text-slate-400">
                  v{version.activeVersion + 1}/{version.versionHistory.length}
                </span>
              </div>
            )}
          </div>

          {/* ── Deliverable tabs ── */}
          {workspaceTabs.length > 1 && (
            <div className="flex items-center gap-2 mb-1 min-h-9">
              <button
                onClick={() => setShowDepMap(true)}
                className="tactile p-1.5 rounded-full text-slate-400 hover:bg-white/60 hover:text-indigo-500 transition-all duration-200"
                title="Dependency Map — see how deliverables connect"
                aria-label="Open dependency map"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 6h16M4 12h8m-8 6h16M16 12l4-4m0 0l-4-4m4 4H12"
                  />
                </svg>
              </button>
              {tabDrag && (
                <div
                  ref={trashDropRef}
                  role="button"
                  aria-label={
                    canDeleteDraggedTab
                      ? `Drop to remove ${tabDrag.label || 'deliverable'}`
                      : 'Course Map cannot be removed'
                  }
                  className={`flex h-9 items-center justify-center gap-2 rounded-pill border px-4 text-[10px] font-bold shadow-glass backdrop-blur-xl transition-all duration-150 pointer-events-none ${
                    canDeleteDraggedTab
                      ? tabDrag.overDelete
                        ? 'scale-105 border-red-300 bg-red-100/95 text-red-700 shadow-red-500/20'
                        : 'border-red-200/80 bg-red-50/90 text-red-500'
                      : 'border-slate-200/80 bg-white/70 text-slate-300'
                  }`}
                >
                  <svg
                    className={`h-3.5 w-3.5 transition-transform duration-150 ${tabDrag.overDelete ? 'scale-110' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3m-8 0h10"
                    />
                  </svg>
                  <span>{canDeleteDraggedTab ? 'Drop to delete' : 'Locked'}</span>
                </div>
              )}
            </div>
          )}
          {workspaceTabs.length > 0 && (
            <div
              data-testid="workspace-deliverable-tabs"
              className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-hide"
            >
              {workspaceTabs.map((feature, tabIdx) => {
                const isActive = activeTab === feature.id;
                const delivState = deliv.deliverables[feature.id];
                const isStreaming = delivState?.status === 'streaming';
                const isDone = delivState?.status === 'done';
                const isError = delivState?.status === 'error';
                const isCourseMapDone = feature.id === 'courseMap' && gen.progressStep === 'done';

                // Cascade sync badges
                const hasUnseen = unseenChanges.has(feature.id);
                const isStaleTab = deliv.deliverables[feature.id]?.stale === true;
                const staleConf = deliv.deliverables[feature.id]?.staleConfidence;
                // isSyncingThis: either regenerateLesson set currentFeature, or
                // the latest syncLog entry for this feature is a pending 'start'
                const lastSyncEntry =
                  smartSync.isSyncing && smartSync.syncLog.length > 0
                    ? [...smartSync.syncLog].reverse().find((e) => e.featureId === feature.id)
                    : null;
                // Change #1: Use syncingFeatures set for parallel-aware badge
                const isSyncingThis =
                  smartSync.syncingFeatures?.has(feature.id) ||
                  (smartSync.isSyncing && (deliv.currentFeatures?.has(feature.id) || lastSyncEntry?.type === 'start'));

                const isDraggingThis = tabDrag?.id === feature.id;
                const isDropTarget =
                  tabDrag?.moved && !tabDrag?.overDelete && tabDrag?.overIndex === tabIdx && !isDraggingThis;
                const markerAfter = isDropTarget && tabDrag.index < tabIdx;
                const insertionMarker = (
                  <span
                    aria-hidden="true"
                    className="mx-0.5 h-7 w-1 flex-shrink-0 rounded-full bg-indigo-400 shadow-[0_0_0_4px_rgba(99,102,241,0.16)] animate-spring-in"
                  />
                );

                return (
                  <React.Fragment key={feature.id}>
                    {isDropTarget && !markerAfter && insertionMarker}
                    <button
                      ref={(node) => {
                        if (node) tabButtonRefs.current.set(feature.id, node);
                        else tabButtonRefs.current.delete(feature.id);
                      }}
                      onPointerDown={handleTabPointerDown(feature, tabIdx)}
                      onPointerMove={handleTabPointerMove(feature.id)}
                      onPointerUp={handleTabPointerUp(feature.id)}
                      onPointerCancel={handleTabPointerCancel(feature.id)}
                      onMouseEnter={(e) => {
                        if (tabDrag || feature.id === 'courseMap') return;
                        const rect = e.currentTarget.getBoundingClientRect();
                        handleCascadeHover({
                          featureId: feature.id,
                          fieldKey: null,
                          position: { x: rect.left, y: rect.bottom + 8 },
                        });
                      }}
                      onMouseLeave={() => handleCascadeHover(null)}
                      onClick={() => {
                        if (suppressTabClickRef.current) return;
                        setActiveTab(feature.id);
                        // Clear unseen badge when user clicks the tab
                        if (hasUnseen) {
                          setUnseenChanges((prev) => {
                            const next = new Set(prev);
                            next.delete(feature.id);
                            return next;
                          });
                        }
                      }}
                      className={`tactile flex items-center gap-2 px-4 py-2 rounded-pill text-xs font-semibold whitespace-nowrap transition-all duration-200 flex-shrink-0 cursor-grab active:cursor-grabbing touch-none select-none ${
                        isDraggingThis
                          ? 'opacity-20 scale-95'
                          : isDropTarget
                            ? 'scale-[1.03] -translate-y-0.5 bg-indigo-50/70 text-indigo-600 shadow-glass border border-indigo-200/70'
                            : isActive
                              ? 'bg-white/80 text-slate-800 shadow-glass border border-slate-200/60'
                              : 'text-slate-500 hover:bg-white/50 hover:text-slate-700'
                      }`}
                    >
                      {/* Status dot — cascade sync takes priority for non-courseMap tabs */}
                      {feature.id !== 'courseMap' && (
                        <span
                          className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                            isSyncingThis
                              ? 'bg-amber-400 animate-pulse'
                              : isStaleTab && !isSyncingThis
                                ? staleConf?.level === 'high'
                                  ? 'bg-amber-400'
                                  : staleConf?.level === 'medium'
                                    ? 'bg-amber-300'
                                    : 'bg-amber-200'
                                : hasUnseen
                                  ? 'bg-amber-400'
                                  : isStreaming
                                    ? 'bg-indigo-400 animate-pulse'
                                    : isDone
                                      ? 'bg-emerald-400'
                                      : isError
                                        ? 'bg-red-400'
                                        : 'bg-slate-300'
                          }`}
                        />
                      )}
                      {feature.id === 'courseMap' && (
                        <span
                          className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                            gen.isStreaming
                              ? 'bg-indigo-400 animate-pulse'
                              : isCourseMapDone
                                ? 'bg-emerald-400'
                                : 'bg-slate-300'
                          }`}
                        />
                      )}
                      {feature.label}
                      {isStaleTab && !isSyncingThis
                        ? staleConf?.level === 'high'
                          ? ' ⚠'
                          : ' ~'
                        : hasUnseen
                          ? ' *'
                          : ''}
                    </button>
                    {isDropTarget && markerAfter && insertionMarker}
                  </React.Fragment>
                );
              })}

              {/* ── + Add deliverable button ── */}
              {gen.progressStep === 'done' &&
                (() => {
                  const allFeatsForAdd = [...FEATURES, ...listCustomDeliverables().map(toFeatureEntry)];
                  const unselected = allFeatsForAdd.filter(
                    (f) => f.id !== 'courseMap' && !selectedFeatures.includes(f.id),
                  );
                  return (
                    <AddDeliverableButton
                      unselected={unselected}
                      showAddDeliverable={showAddDeliverable}
                      setShowAddDeliverable={setShowAddDeliverable}
                      onAdd={(feature) => {
                        setSelectedFeatures((prev) => [...prev, feature.id]);
                        setActiveTab(feature.id);
                        setShowAddDeliverable(false);
                        const scopeIndices = lessonScope.type === 'specific' ? lessonScope.indices : null;
                        deliv.generateAll(courseMap, [feature.id], scopeIndices);
                      }}
                      onCreateCustom={() => setShowCustomBuilder(true)}
                    />
                  );
                })()}

              {/* Deliverable generation progress */}
              {deliv.isGenerating && (
                <span className="ml-2 text-[10px] text-indigo-500 font-medium animate-pulse whitespace-nowrap flex-shrink-0">
                  Generating {activeDeliverableReadyCount}/{activeDeliverableProgressTotal}…
                </span>
              )}

              {/* Sync All Stale button — appears when any deliverable is stale */}
              {(() => {
                const staleCount = selectedFeatures.filter(
                  (f) => f !== 'courseMap' && deliv.deliverables[f]?.stale === true,
                ).length;
                if (staleCount === 0 || deliv.isGenerating || smartSync.isSyncing) return null;
                return (
                  <button
                    onClick={() => {
                      const staleIds = selectedFeatures.filter(
                        (f) => f !== 'courseMap' && deliv.deliverables[f]?.stale === true,
                      );
                      for (const fid of staleIds) {
                        const se = deliv.deliverables[fid]?.staleEdits;
                        if (se?.lessonIndices?.length > 0) {
                          for (const idx of se.lessonIndices) {
                            deliv.regenerateLesson(fid, courseMap, idx);
                          }
                        } else {
                          const scopeIndices = lessonScope.type === 'specific' ? lessonScope.indices : null;
                          deliv.generateAll(courseMap, [fid], scopeIndices);
                        }
                      }
                    }}
                    className="tactile flex items-center gap-1.5 ml-2 px-3 py-1.5 rounded-pill text-[10px] font-semibold text-amber-700 bg-amber-50/70 border border-amber-200/60 hover:bg-amber-100 transition-all duration-200 whitespace-nowrap flex-shrink-0"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                      />
                    </svg>
                    Sync all stale ({staleCount})
                  </button>
                );
              })()}

              {/* Deliverable undo/redo — appears when deliverable edits have been made */}
              {(delivUndo.canUndo || delivUndo.canRedo) && !gen.isStreaming && (
                <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                  <button
                    onClick={() => delivUndo.undo(deliv.setDeliverables)}
                    disabled={!delivUndo.canUndo}
                    className={`tactile p-1.5 rounded-full transition-all duration-200 ${delivUndo.canUndo ? 'text-slate-500 hover:bg-white/60 hover:text-indigo-500' : 'text-slate-300 cursor-not-allowed'}`}
                    title="Undo deliverable edit"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M3 10h10a5 5 0 015 5v2M3 10l4-4M3 10l4 4"
                      />
                    </svg>
                  </button>
                  <button
                    onClick={() => delivUndo.redo(deliv.setDeliverables)}
                    disabled={!delivUndo.canRedo}
                    className={`tactile p-1.5 rounded-full transition-all duration-200 ${delivUndo.canRedo ? 'text-slate-500 hover:bg-white/60 hover:text-indigo-500' : 'text-slate-300 cursor-not-allowed'}`}
                    title="Redo deliverable edit"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M21 10H11a5 5 0 00-5 5v2M21 10l-4-4M21 10l-4 4"
                      />
                    </svg>
                  </button>
                </div>
              )}
            </div>
          )}

          {tabDrag &&
            typeof document !== 'undefined' &&
            createPortal(
              <div
                className={`fixed z-[10000] flex items-center gap-2 rounded-pill border px-4 py-2 text-xs font-bold shadow-2xl backdrop-blur-xl transition-[transform,background-color,border-color,color,box-shadow] duration-150 pointer-events-none ${
                  tabDrag.overDelete
                    ? canDeleteDraggedTab
                      ? 'scale-105 border-red-300 bg-red-100/95 text-red-700 shadow-red-500/20'
                      : 'scale-105 border-slate-300 bg-slate-100/95 text-slate-400'
                    : 'border-indigo-200/80 bg-white/95 text-slate-800 shadow-indigo-500/20'
                }`}
                style={{
                  left: tabDrag.x,
                  top: tabDrag.y,
                  width: tabDrag.width,
                  minHeight: tabDrag.height,
                  transform: tabDrag.moved ? 'translate3d(0,-6px,0) rotate(-1deg)' : 'translate3d(0,0,0)',
                }}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${tabDrag.id === 'courseMap' ? 'bg-emerald-400' : 'bg-indigo-400'}`}
                />
                <span className="truncate">{tabDrag.label}</span>
              </div>,
              document.body,
            )}

          {/* ── Delete Deliverable Confirmation Modal ── */}
          {deleteTabConfirm && (
            <FocusTrap focusTrapOptions={{ clickOutsideDeactivates: true }}>
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
                <div className="bg-white rounded-2xl border border-slate-200/60 shadow-2xl p-6 max-w-sm w-full mx-4 animate-spring-scale">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-9 h-9 rounded-xl bg-red-100 flex items-center justify-center flex-shrink-0">
                      <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3m-8 0h10"
                        />
                      </svg>
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-800">Remove deliverable?</h3>
                      <p className="text-[11px] text-slate-500 mt-0.5">{deleteTabConfirm.label}</p>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-500 mb-5 leading-relaxed">
                    This removes the tab from this project and clears its generated content and settings. Your course
                    map and other deliverables stay unchanged.
                  </p>
                  <div className="flex items-center gap-2 justify-end">
                    <button
                      onClick={() => setDeleteTabConfirm(null)}
                      className="tactile px-4 py-2 rounded-lg text-xs font-semibold text-slate-600 bg-white border border-slate-200/60 hover:bg-slate-50 transition-all"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={confirmDeleteDeliverable}
                      className="tactile px-4 py-2 rounded-lg text-xs font-semibold text-white bg-red-500 hover:bg-red-600 transition-all"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            </FocusTrap>
          )}

          {/* ── New Project Confirmation Modal ── */}
          {newProjectConfirm && (
            <FocusTrap focusTrapOptions={{ clickOutsideDeactivates: true }}>
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-md">
                <div className="bg-white rounded-2xl border border-slate-200/60 shadow-2xl p-6 max-w-sm w-full mx-4 animate-spring-scale">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
                      <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                        />
                      </svg>
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-800">Start a new project?</h3>
                      <p className="text-[11px] text-slate-500 mt-0.5">This clears the current browser workspace.</p>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-400 mb-5 leading-relaxed">
                    {user
                      ? newProjectError
                        ? 'My Projects sync did not finish. Your workspace is still open, and you can download a backup before starting over.'
                        : 'We will save a compact CourseMapper project to My Projects before starting over. If saving fails, your workspace will stay open.'
                      : 'You are not signed in, so this browser autosave is the only in-app copy. Download a .coursemapper backup if you want to keep it.'}
                  </p>
                  <div className="mb-4 rounded-xl bg-slate-50/80 border border-slate-100 px-3 py-2 text-[10px] text-slate-500 leading-relaxed">
                    {user
                      ? newProjectError
                        ? 'Backup recommended: download a .coursemapper file or continue without My Projects sync.'
                        : 'Autosave: full browser backup plus compact My Projects sync.'
                      : 'Autosave: local browser backup only. It is cleared when you start over.'}
                  </div>
                  {newProjectError && (
                    <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-700 leading-relaxed">
                      {newProjectError}
                    </p>
                  )}
                  <div className="flex items-center gap-2 justify-end">
                    {courseMap && (
                      <button
                        onClick={handleSaveProject}
                        disabled={isStartingNewProject}
                        className="tactile px-4 py-2 rounded-lg text-xs font-semibold text-indigo-600 bg-indigo-50 border border-indigo-100/80 hover:bg-indigo-100 transition-all disabled:opacity-50"
                      >
                        Download backup
                      </button>
                    )}
                    <button
                      onClick={() => setNewProjectConfirm(false)}
                      disabled={isStartingNewProject}
                      className="tactile px-4 py-2 rounded-lg text-xs font-semibold text-slate-600 bg-white border border-slate-200/60 hover:bg-slate-50 transition-all"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={
                        newProjectCloudSaveFailed || newProjectError
                          ? handleStartNewProjectWithoutCloudSave
                          : handleConfirmNewProject
                      }
                      disabled={isStartingNewProject}
                      className="tactile px-4 py-2 rounded-lg text-xs font-semibold text-white bg-red-500 hover:bg-red-600 transition-all disabled:opacity-60 disabled:cursor-wait"
                    >
                      {isStartingNewProject ? (
                        <span className="inline-flex items-center gap-1.5">
                          <Spinner /> Saving...
                        </span>
                      ) : newProjectCloudSaveFailed || newProjectError ? (
                        'Start without cloud save'
                      ) : (
                        'Start New Project'
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </FocusTrap>
          )}

          {/* ── Add Lessons Modal ── */}
          {addLessonsModal && (
            <FocusTrap focusTrapOptions={{ clickOutsideDeactivates: true }}>
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm">
                <div className="bg-white/98 rounded-2xl border border-slate-200/60 shadow-2xl p-6 max-w-sm w-full mx-4 animate-spring-scale">
                  <h3 className="text-sm font-bold text-slate-800 mb-1">Generate Added Lessons</h3>
                  <p className="text-[11px] text-slate-500 mb-4 leading-relaxed">
                    {addLessonsModal.lessonIndices.length === 1
                      ? `Generate Lesson ${addLessonsModal.lessonIndices[0] + 1} for:`
                      : `Generate ${addLessonsModal.lessonIndices.length} new lessons for:`}
                  </p>
                  <div className="space-y-2">
                    <button
                      onClick={() => {
                        const { lessonIndices } = addLessonsModal;
                        deliv.generateAll(courseMap, [activeTab], lessonIndices);
                        setAddLessonsModal(null);
                      }}
                      className="w-full flex items-center gap-2 px-4 py-3 rounded-xl text-[12px] font-semibold text-indigo-700 bg-indigo-50 border border-indigo-200/60 hover:bg-indigo-100 transition-colors"
                    >
                      <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                        />
                      </svg>
                      <span className="text-left">
                        <span className="block">Just this tab</span>
                        <span className="block text-[10px] font-normal text-indigo-500 mt-0.5">
                          {workspaceTabs.find((f) => f.id === activeTab)?.label || activeTab} only
                        </span>
                      </span>
                    </button>
                    <button
                      onClick={() => {
                        const { lessonIndices } = addLessonsModal;
                        const activeDelivFeatures = selectedFeatures.filter((f) => f !== 'courseMap');
                        deliv.generateAll(courseMap, activeDelivFeatures, lessonIndices);
                        setAddLessonsModal(null);
                      }}
                      className="w-full flex items-center gap-2 px-4 py-3 rounded-xl text-[12px] font-semibold text-violet-700 bg-violet-50 border border-violet-200/60 hover:bg-violet-100 transition-colors"
                    >
                      <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M4 6h16M4 10h16M4 14h16M4 18h16"
                        />
                      </svg>
                      <span className="text-left">
                        <span className="block">All deliverables</span>
                        <span className="block text-[10px] font-normal text-violet-500 mt-0.5">
                          {selectedFeatures
                            .filter((f) => f !== 'courseMap')
                            .map((id) => FEATURES.find((f) => f.id === id)?.label || id)
                            .join(', ')}
                        </span>
                      </span>
                    </button>
                  </div>
                  <button
                    onClick={() => setAddLessonsModal(null)}
                    className="mt-3 w-full py-2 text-[11px] text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </FocusTrap>
          )}

          {/* ── Custom Deliverable Builder (from workspace + Add) ── */}
          {showCustomBuilder && (
            <Suspense fallback={null}>
              <CustomDeliverableBuilder
                isOpen={showCustomBuilder}
                onClose={() => setShowCustomBuilder(false)}
                onSave={(def) => {
                  const saved = saveCustomDeliverable(def, user?.uid);
                  setSelectedFeatures((prev) => [...prev, saved.id]);
                  setActiveTab(saved.id);
                  setShowCustomBuilder(false);
                  const scopeIndices = lessonScope.type === 'specific' ? lessonScope.indices : null;
                  deliv.generateAll(courseMap, [saved.id], scopeIndices);
                }}
                editDef={null}
              />
            </Suspense>
          )}

          {/* Mobile workspace mode switcher */}
          <div
            data-testid="mobile-workspace-switcher"
            className="lg:hidden sticky top-3 z-20 flex gap-1 rounded-2xl border border-slate-200/60 bg-white/85 p-1 shadow-glass backdrop-blur-xl"
          >
            {mobileWorkspaceViews.map((view) => (
              <button
                key={view.id}
                type="button"
                onClick={() => setMobileWorkspaceView(view.id)}
                aria-pressed={mobileWorkspaceView === view.id}
                className={`flex-1 rounded-xl px-3 py-2 text-[11px] font-bold transition-all ${
                  mobileWorkspaceView === view.id
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'text-slate-500 hover:bg-slate-100/80 hover:text-slate-700'
                }`}
              >
                {view.label}
              </button>
            ))}
          </div>

          {/* ── Tab content + Chat panel + Export panel ── */}
          <div
            data-testid="workspace-shell"
            className="workspace-shell flex flex-col gap-3 items-stretch lg:flex-row lg:gap-0"
            style={{ minHeight: 'calc(100vh - 220px)' }}
          >
            {/* ── Left: Resizable Chat Panel ── */}
            <div
              data-testid="workspace-agent-panel"
              className={`workspace-chat-panel min-w-0 ${mobileWorkspaceView === 'agent' ? 'block' : 'hidden'} lg:block lg:flex-shrink-0 lg:sticky lg:top-4`}
              style={{ '--workspace-chat-width': `${chatWidth}px` }}
            >
              <ErrorBoundary>
                <ChatPanel
                  currentStep={gen.progressStep}
                  modelName={gen.activeModelName || modelName}
                  error={gen.error || null}
                  streamDetail={gen.streamDetail}
                  streamProgress={gen.streamProgress}
                  completenessInfo={gen.completenessInfo}
                  isStopped={gen.isStopped}
                  retryInfo={gen.retryInfo}
                  generationLog={gen.generationLog}
                  onStop={gen.isStreaming ? onStop : null}
                  onResume={onResume}
                  onClearAll={gen.handleClearAll}
                  onRetryExamine={gen.handleRetryExamine}
                  deliverables={deliv.deliverables}
                  selectedFeatures={selectedFeatures}
                  columns={columns}
                  deliverableConfig={deliverableConfig}
                  lessonScope={lessonScope}
                  onLessonScopeChange={setLessonScope}
                  delivProgress={deliv.progress}
                  currentDelivFeatures={deliv.currentFeatures}
                  isDelivGenerating={deliv.isGenerating}
                  delivTimings={deliv.delivTimings}
                  packageQualityPass={packageQualityPass}
                  onStopDeliverables={deliv.isGenerating ? deliv.stopGenerating : null}
                  onPackageQualityPassUpdate={setPackageQualityPass}
                  onAutoRepairReadiness={applyPackageReadinessRepairs}
                  onFinalizePackage={handleDeterministicPackageFinalization}
                  onGenerateFeatures={handleAgentGenerateFeatures}
                  onAuditPackage={handleAgentAuditPackage}
                  isSyncing={smartSync.isSyncing}
                  pendingSyncCount={smartSync.pendingSyncCount}
                  syncingFeatures={smartSync.syncingFeatures}
                  pendingSyncSuggestion={smartSync.pendingSyncSuggestion}
                  clearPendingSyncSuggestion={smartSync.clearPendingSyncSuggestion}
                  executeSyncPlan={smartSync.executeSyncPlan}
                  clearSyncStalePlan={deliv.clearSyncStalePlan}
                  onRevision={rev.handleRevision}
                  onDeliverableRevision={(msg, history) => {
                    // For deliverable revisions, regenerate the active deliverable
                    if (activeTab && activeTab !== 'courseMap') {
                      const scopeIndices = lessonScope.type === 'specific' ? lessonScope.indices : null;
                      deliv.generateAll(courseMap, [activeTab], scopeIndices);
                    }
                  }}
                  isRevising={rev.isRevising}
                  activeTab={activeTab}
                  courseMap={courseMap}
                  slideTheme={slideTheme}
                  chatHistory={chatHistory}
                  onChatHistoryChange={setChatHistory}
                  pendingExamPatches={gen.pendingExamPatches}
                  examChanges={gen.examChanges}
                  onAcceptPatches={gen.onAcceptPatches}
                  onRejectPatch={gen.onRejectPatch}
                  onFocusExamPatch={focusExamPatch}
                  editor={editor}
                  optimisticUpdate={deliv.optimisticUpdate}
                  regenerateLesson={deliv.regenerateLesson}
                  delivUndoSnapshot={delivUndo.snapshot}
                  delivUndoFn={() => delivUndo.undo(deliv.setDeliverables)}
                  delivCanUndo={delivUndo.canUndo}
                  onAgentHighlight={triggerAgentHighlight}
                  notifyEdit={smartSync.notifyEdit}
                  chatSendRef={chatSendRef}
                  uid={user?.uid || null}
                  onApiCallEvent={recordApiCallEvent}
                />
              </ErrorBoundary>
            </div>

            {/* ── Resize Handle ── */}
            <div className="hidden lg:block self-stretch">
              <ResizeHandle width={chatWidth} onWidthChange={setChatWidth} />
            </div>

            {/* ── Main content area ── */}
            <div
              data-testid="workspace-content-panel"
              className={`${mobileWorkspaceView === 'content' ? 'block' : 'hidden'} lg:block flex-1 min-w-0 space-y-4 px-0 lg:px-4`}
            >
              {/* Course Map tab */}
              {activeTab === 'courseMap' && (
                <>
                  {gen.error && (
                    <div className="glass rounded-squircle-sm p-5 animate-spring-in">
                      <div className="flex items-start gap-3 text-red-600 text-sm">
                        <div className="w-8 h-8 rounded-squircle-xs bg-red-100 flex items-center justify-center flex-shrink-0">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                            />
                          </svg>
                        </div>
                        <p className="pt-1 whitespace-pre-line leading-relaxed">{gen.error}</p>
                      </div>
                    </div>
                  )}
                  {courseMap || gen.isStreaming ? (
                    <div className="w-full animate-spring-up">
                      <ErrorBoundary>
                        <CourseMapPreview
                          courseMap={courseMap}
                          columns={columns}
                          isStreaming={gen.isStreaming}
                          oldCourseMap={oldCourseMap}
                          onCellEdit={editor.handleCellEdit}
                          onTitleEdit={editor.handleTitleEdit}
                          onCheckToggle={editor.handleCheckToggle}
                          onAddSection={editor.handleAddSection}
                          onDeleteSection={editor.handleDeleteSection}
                          onAddLesson={editor.handleAddLesson}
                          onDeleteLesson={editor.handleDeleteLesson}
                          onMoveLesson={editor.handleMoveLesson}
                          showDiff={showDiff}
                          onToggleDiff={() => setShowDiff((d) => !d)}
                          onDismissDiff={() => {
                            setOldCourseMap(null);
                            setShowDiff(false);
                          }}
                          onAIContextMenu={handleAIContextMenu}
                          onCellHover={(info) => {
                            if (!info) {
                              handleCascadeHover(null);
                              return;
                            }
                            handleCascadeHover({ featureId: null, fieldKey: info.fieldKey, position: info.position });
                          }}
                        />
                      </ErrorBoundary>
                    </div>
                  ) : (
                    !gen.error && gen.progressStep !== 'idle' && gen.progressStep !== 'done' && <CourseMapSkeleton />
                  )}
                </>
              )}

              {/* Deliverable tabs */}
              {activeTab !== 'courseMap' && (
                <ErrorBoundary>
                  <DeliverableView
                    featureId={activeTab}
                    data={deliv.deliverables[activeTab]?.data ?? null}
                    status={deliv.deliverables[activeTab]?.status ?? 'idle'}
                    error={deliv.deliverables[activeTab]?.error ?? null}
                    regeneratingIndex={deliv.deliverables[activeTab]?.regeneratingIndex ?? null}
                    courseMap={courseMap}
                    courseMapStatus={gen.progressStep}
                    isDelivGenerating={deliv.isGenerating}
                    currentDelivFeatures={deliv.currentFeatures}
                    lessonScope={lessonScope.type === 'specific' ? lessonScope.indices : null}
                    onRetry={() => {
                      const scopeIndices = lessonScope.type === 'specific' ? lessonScope.indices : null;
                      deliv.generateAll(courseMap, [activeTab], scopeIndices);
                    }}
                    onRegenerateLesson={(lessonIndex) => {
                      deliv.regenerateLesson(activeTab, courseMap, lessonIndex);
                    }}
                    onDataChange={(newData, editPath) => {
                      const oldData = deliv.deliverables[activeTab]?.data;
                      // Snapshot for undo before applying the edit
                      delivUndo.snapshot(activeTab, oldData);
                      deliv.setDeliverables((prev) => ({
                        ...prev,
                        [activeTab]: { ...prev[activeTab], data: newData },
                      }));
                      // Cascade sync: when user edits a deliverable's body text,
                      // notify the sync engine so other deliverables stay consistent.
                      // editPath shape: [arrayKey, lessonIdx, fieldName, ...]
                      if (editPath && Array.isArray(editPath) && editPath.length >= 2) {
                        const lessonIdx = typeof editPath[1] === 'number' ? editPath[1] : null;
                        if (lessonIdx !== null) {
                          // Extract a human-readable change summary for the AI proposal
                          const ctx = extractEditContext(oldData, newData, editPath);
                          const canonicalPatch = projectArtifactEditToCourseMapPatch({
                            featureId: activeTab,
                            lessonIndex: lessonIdx,
                            editPath,
                            oldData,
                            newData,
                            courseMap: courseMapRef.current,
                            editContext: ctx,
                          });
                          const canonicalPatchRequest = canonicalPatch
                            ? null
                            : createCanonicalPatchRequest({
                                featureId: activeTab,
                                lessonIndex: lessonIdx,
                                editPath,
                                oldData,
                                newData,
                                courseMap: courseMapRef.current,
                                editContext: ctx,
                              });
                          // '_deliverableEdit' key: source tab gets AI proposal,
                          // downstream tabs get stale badge + proposal (no auto-regen)
                          smartSync.notifyEdit(
                            lessonIdx,
                            '_deliverableEdit',
                            activeTab,
                            ctx,
                            canonicalPatch
                              ? { canonicalPatches: [canonicalPatch] }
                              : canonicalPatchRequest
                                ? { canonicalPatchRequests: [canonicalPatchRequest] }
                                : null,
                          );
                        }
                      }
                    }}
                    onAddLessons={(lessonIndices) => {
                      setAddLessonsModal({ lessonIndices });
                    }}
                    freshLessonIndices={(() => {
                      const base = deliv.freshLessons?.[activeTab] ?? null;
                      if (
                        agentHighlight &&
                        agentHighlight.featureId === activeTab &&
                        agentHighlight.lessonIndex != null
                      ) {
                        const merged = new Set(base || []);
                        merged.add(agentHighlight.lessonIndex);
                        return merged;
                      }
                      return base;
                    })()}
                    proposals={editProposal.proposals[activeTab] ?? {}}
                    onAcceptProposal={(lessonIndex) => {
                      editProposal.acceptProposal(
                        activeTab,
                        lessonIndex,
                        deliv.deliverables[activeTab]?.data,
                        deliv.setDeliverables,
                      );
                    }}
                    onDismissProposal={(lessonIndex) => editProposal.dismissProposal(activeTab, lessonIndex)}
                    onRegenerateProposal={(lessonIndex) =>
                      editProposal.regenerateProposal(
                        activeTab,
                        courseMap,
                        lessonIndex,
                        editProposal.proposals[activeTab]?.[lessonIndex]?.editContext,
                        deliv.deliverables[activeTab]?.data,
                      )
                    }
                    isStale={deliv.deliverables[activeTab]?.stale === true}
                    staleConfidence={deliv.deliverables[activeTab]?.staleConfidence}
                    onSyncNow={() => {
                      const staleEdits = deliv.deliverables[activeTab]?.staleEdits;
                      if (staleEdits?.lessonIndices?.length > 0) {
                        // Surgical: only regen the affected lessons
                        for (const idx of staleEdits.lessonIndices) {
                          deliv.regenerateLesson(activeTab, courseMap, idx);
                        }
                      } else {
                        // Fallback: full regen
                        const scopeIndices = lessonScope.type === 'specific' ? lessonScope.indices : null;
                        deliv.generateAll(courseMap, [activeTab], scopeIndices);
                      }
                    }}
                    slideTheme={slideTheme}
                    onSlideThemeChange={setSlideTheme}
                  />
                </ErrorBoundary>
              )}
            </div>

            {/* ── Export side panel (right) — shown once course map is ready ── */}
            {courseMap && gen.progressStep === 'done' && (
              <div
                data-testid="workspace-export-panel"
                className={`${mobileWorkspaceView === 'export' ? 'block' : 'hidden'} lg:block lg:flex-shrink-0 min-w-0`}
              >
                <ExportSidePanel
                  activeTab={activeTab}
                  activeTabLabel={workspaceTabs.find((f) => f.id === activeTab)?.label || activeTab}
                  deliverables={deliv.deliverables}
                  onCourseMapExport={handleDownload}
                  onSaveProject={handleSaveProject}
                  onReadinessIssueClick={focusCourseMapTarget}
                  onAutoRepairReadiness={applyPackageReadinessRepairs}
                  onFinishPackage={handleFinishPackageFromExport}
                  canFinishPackage={canFinishPackageWithAgent && typeof handleFinishPackageFromExport === 'function'}
                  packageQualityPass={packageQualityPass}
                />
              </div>
            )}
          </div>
        </main>

        <footer className="w-full px-6 py-4 text-center space-y-1">
          <p className="text-[10px] text-slate-300/70">
            Built by the Educational Technology team at NYU Silver School of Social Work
          </p>
          <div className="flex items-center justify-center gap-3 text-[10px] text-slate-300/70">
            <a href="#/changelog" className="font-medium hover:text-indigo-500 transition-colors duration-200">
              v0.8.4
            </a>
            <span>·</span>
            <a href="#/privacy" className="hover:text-indigo-500 transition-colors duration-200">
              Privacy
            </a>
            <span>·</span>
            <a href="#/terms" className="hover:text-indigo-500 transition-colors duration-200">
              Terms
            </a>
          </div>
        </footer>

        {/* Cloud Project Picker modal */}
        {showProjectPicker && (
          <Suspense fallback={null}>
            <ProjectPicker
              isOpen={showProjectPicker}
              onClose={() => setShowProjectPicker(false)}
              onOpenProject={handleOpenCloudProject}
              onSaveCurrentAsNew={hasGenerated ? handleSaveCurrentAsNew : null}
              onDeleteProject={(deletedId, remainingCount) => {
                if (deletedId === projectIdRef.current || remainingCount === 0) {
                  try {
                    localStorage.removeItem(STORAGE_KEY);
                  } catch {}
                  setHasSavedSession(false);
                  if (deletedId === projectIdRef.current) {
                    setProjectId(null);
                  }
                }
              }}
            />
          </Suspense>
        )}

        {/* Help merged into ChatPanel — HelpDrawer removed */}

        {developerMode && showDeveloperPanel && (
          <Suspense fallback={null}>
            <DeveloperModePanel
              isOpen={developerMode && showDeveloperPanel}
              snapshot={buildProjectSnapshot({ mode: 'developer' })}
              apiCallBudget={apiCallBudget}
              developerTemplates={developerTemplates}
              activeDeveloperTemplateId={activeDeveloperTemplateId}
              onApply={applyDeveloperSnapshot}
              onSaveTemplate={saveDeveloperTemplateFromPanel}
              onRenameTemplate={renameDeveloperTemplate}
              onDuplicateTemplate={duplicateDeveloperTemplate}
              onDeleteTemplate={removeDeveloperTemplate}
              onClose={() => setShowDeveloperPanel(false)}
            />
          </Suspense>
        )}

        {/* AI Context Menu (right-click on cells/items for inline AI editing) */}
        {aiContextMenu && (
          <AIContextMenu
            position={aiContextMenu.position}
            target={aiContextMenu.target}
            onAction={handleAIAction}
            onClose={closeAIContextMenu}
          />
        )}

        {/* ── Dependency Map modal ── */}
        <DependencyMap isOpen={showDepMap} onClose={() => setShowDepMap(false)} deliverables={deliv.deliverables} />

        {/* ── Cascade Preview tooltip (tab hover) ── */}
        {cascadeHover && (
          <CascadePreview
            fieldKey={cascadeHover.fieldKey}
            featureId={cascadeHover.featureId}
            position={cascadeHover.position}
            deliverables={deliv.deliverables}
          />
        )}
      </div>
    </Suspense>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}
