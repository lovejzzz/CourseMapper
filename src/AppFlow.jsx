import React, { useState, useEffect, useMemo, useRef, useCallback, lazy, Suspense } from 'react';
import { createPortal } from 'react-dom';
import FocusTrap from 'focus-trap-react';
import ErrorBoundary from './components/ErrorBoundary';
import LoadingScreen, { ConfigSkeleton, WorkspaceSkeleton, CourseMapSkeleton } from './components/LoadingScreen';
import Landing from './screens/Landing';
import AppLogo from './components/AppLogo';
import DarkModeToggle from './components/DarkModeToggle';
import PackageTrustStrip from './components/PackageTrustStrip';
import BuildRibbon, { TabReadyTick } from './components/BuildRibbon';
import PrimaryCta from './components/PrimaryCta';
import UserMenu from './components/UserMenu';

// Lazy-load screens/components not needed on initial landing page
const Config = lazy(() => import('./screens/Config'));
const FeatureSelect = lazy(() => import('./screens/FeatureSelect'));
const CourseMapPreview = lazy(() => import('./components/CourseMapPreview'));
const WorkspaceQualityChip = lazy(() => import('./components/WorkspaceQualityChip'));
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
import useDeliverableFocusRouter from './hooks/useDeliverableFocusRouter';
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
} from './lib/customDeliverableLibrary';
import { useAuth } from './contexts/AuthContext';
import {
  getSavedApiKeyForProvider,
  normalizeProjectProvider,
  restorePublicScionAIConfig,
  useAIConfig,
} from './contexts/AIConfigContext';
import { useUI } from './contexts/UIContext';
import { useCourse } from './contexts/CourseContext';
import { warn } from './lib/logger';
import { applyQualityToFinalizerResult, runDeterministicPackageFinalizer } from './lib/packageFinalizer';
import { PUBLIC_SCION_MODEL_NAME, PUBLIC_SCION_PROVIDER_ID } from './lib/publicScionIdentity';
import { verifyPackageExports } from './lib/packageExportVerifier';
import { generateCourseHealthReport } from './lib/pedagogicalValidator';
import { resolveRequestedClassSessionMinutes } from './lib/sourceBriefConstraints';
import { prepareMaterializedPackageScope, remapLessonFilterToMaterializedScope } from './lib/materializedLessonScope';
// HelpDrawer removed — merged into ChatPanel
import { requestNotificationPermission } from './lib/notifyDone';
import { parseFiles } from './lib/fileParser';
import { detectExpectedLessons, detectLessonsWithAI } from './lib/detectLessons';
import { upsertLandingAgentContextMessages } from './lib/landingAgentContext';
import { isAgentProviderReady } from './lib/agentAvailability';
import {
  evaluateWorkspaceReadiness,
  repairCourseMapReadiness,
  repairWorkspaceReadiness,
} from './lib/deliverableReadiness';
import { evaluateClassroomReadiness } from './lib/classroomReadiness';
import {
  applyApiCallBudgetEvent,
  buildApiCallBudgetReceipt,
  createApiCallBudget,
  createApiCallBudgetFromReceipt,
  formatEnrichmentOutcomeLabel,
} from './lib/apiCallBudget';
import { buildBuildRibbonModel } from './lib/buildRibbonModel';
import { clearSetupRecovery } from './lib/setupRecovery';
import useReviewQueueOwner from './hooks/useReviewQueueOwner';
import useTabDrag from './hooks/useTabDrag';
import useProjectPersistence, { STORAGE_KEY } from './hooks/useProjectPersistence';
import useWorkspaceRepairs from './hooks/useWorkspaceRepairs';
import { downloadContribution, readExtractedKernels } from './lib/genome/contributeKernels';
import { APP_VERSION } from './lib/appVersion';
import { isFinishPassRunning } from './lib/packagePassPhase';
import { buildApiCostPlan, evaluateApiCostControl } from './lib/apiCostControl';
import {
  buildGenerationCostReport,
  formatGenerationCostReport,
  summarizeApiFeatureUsageBudget,
  summarizeApiUsageBudget,
  summarizeCompilerSavings,
} from './lib/apiUsageCost';
import { buildCompactPackageTrustReceipt, buildPackageTrustBoundarySummary } from './lib/packageFinalizerSummary';
import { getChunkCount, pLimit } from './lib/parallelGenerator';
import { buildHumanReviewRecommendation, summarizeRepairEvidence } from './lib/packageTrust';
import { traceLog } from './lib/traceLog';
import { getPackageTrustStatus } from './lib/packageTrustStatus';
import { resolveWorkspaceCourseTitle } from './lib/promptAwarePreview';
import {
  attachEnrichmentToGraph,
  courseGraphStats,
  deriveCourseGraphFromCourseMap,
  renderCourseMapFromGraph,
  validateCourseGraph,
} from './lib/courseGraph';
import { matchEntityIds, preserveSourceProof, restoreCourseGraphForProject } from './lib/nativeGraphAuthoring';
import { knowledgeCoverage } from './lib/knowledge';
import { normalizePipelineStateWithSourceBackedJudgment } from './lib/sourceBackedJudgment';

const PACKAGE_READY_MESSAGE = 'All required files passed export checks and the package is ready to download.';

function formatOriginCounts(counts = {}) {
  return Object.entries(counts || {})
    .filter(([, count]) => Number(count) > 0)
    .map(([origin, count]) => `${origin}: ${count}`)
    .join(', ');
}

function pluralizeCount(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function buildKnowledgeBackboneLabel(coverage, sourceLedgerSummary = null) {
  if (!coverage || Number(coverage.openResources || 0) <= 0) return null;
  const sessionCount = Number(coverage.sessions) || 0;
  const genomeLinkedLessons = Number(coverage.genomeLinkedLessons) || 0;
  const openResources = Number(coverage.openResources) || 0;
  const sessionsWithResources = Number(coverage.sessionsWithResources) || 0;
  const displayedSessionsWithResources =
    sessionCount > 0 && sessionsWithResources > sessionCount ? sessionCount : Math.max(0, sessionsWithResources);
  const trustedSourceRows = Number(sourceLedgerSummary?.trustedConceptLinkedCount) || 0;
  const originText = formatOriginCounts(coverage.resourcesByOrigin);
  const parts = [`${genomeLinkedLessons}/${sessionCount} lessons genome-linked`];
  if (trustedSourceRows > 0) {
    parts.push(pluralizeCount(trustedSourceRows, 'trusted source-ledger row'));
    if (openResources !== trustedSourceRows) {
      parts.push(`${pluralizeCount(openResources, 'graph reading resource')}${originText ? ` (${originText})` : ''}`);
    }
  } else {
    parts.push(`${pluralizeCount(openResources, 'cited open resource')}${originText ? ` (${originText})` : ''}`);
  }
  parts.push(`${displayedSessionsWithResources}/${sessionCount} lessons with readings`);
  return parts.join(' · ');
}

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
  const exportWarning = (exportVerification?.checks || []).find((check) => check.status === 'warning');
  const topIssues = [...blockers, ...(includeWarnings ? warnings : [])]
    .map(summarizeReceiptIssue)
    .filter(Boolean)
    .slice(0, 3);
  const checkedFeatureCount = Array.isArray(selectedFeatureIds) ? selectedFeatureIds.length : 0;
  const repairSummary = summarizeRepairEvidence(result?.repairs || []);
  const humanDecisionCount = blockers.length + (includeWarnings ? warnings.length : 0);
  return {
    checkedSections: checkedFeatureCount > 0 ? `${checkedFeatureCount}/${checkedFeatureCount}` : '',
    lessonCount: courseMap?.lessons?.length || 0,
    autoFixedCount: repairsApplied,
    retriedCount: retryCount,
    humanDecisionCount,
    exportStatus: exportVerification?.status || '',
    exportChecked: exportVerification?.checked || 0,
    exportFailed: exportVerification?.failed || 0,
    exportWarningCount: exportVerification?.warningCount || 0,
    exportWarning: exportWarning?.message || '',
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

function isVerboseTraceEnabled() {
  try {
    return localStorage.getItem('coursemapper-trace') === 'verbose';
  } catch {
    return false;
  }
}

let apiTraceSummaryModulePromise = null;

function loadApiTraceSummaryModule() {
  if (!apiTraceSummaryModulePromise) apiTraceSummaryModulePromise = import('./lib/apiTraceSummary');
  return apiTraceSummaryModulePromise;
}

function traceApiCallBudget(event = {}, budget = {}) {
  // v0.10.1: default to one readable line per event — the cumulative-state
  // blob on every event made real logs unreadable and buried the signal.
  // `localStorage['coursemapper-trace'] = 'verbose'` restores the full dump.
  const level = event.failureClass || event.type === 'failedCall' ? 'warn' : 'info';
  const verbose = isVerboseTraceEnabled();
  loadApiTraceSummaryModule()
    .then(({ buildApiTraceSummary }) => {
      traceLog(`[CM][API] ${event.type || 'event'}`, buildApiTraceSummary(event, budget, { verbose }), level);
    })
    .catch(() => {
      traceLog(
        `[CM][API] ${event.type || 'event'}`,
        {
          label: event.label || '',
          detail: event.detail || '',
          featureId: event.featureId || '',
        },
        level,
      );
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

// ── Add Deliverable dropdown — uses a portal so it escapes the overflow-x-auto tab bar ──
function AddDeliverableButton({ unselected, showAddDeliverable, setShowAddDeliverable, onAdd, onCreateCustom }) {
  const btnRef = useRef(null);
  const [dropPos, setDropPos] = useState({ top: 0, left: 0, width: 220 });

  function openDropdown() {
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      const viewportGutter = 12;
      const width = Math.min(220, Math.max(0, window.innerWidth - viewportGutter * 2));
      const left = Math.min(
        Math.max(viewportGutter, rect.left),
        Math.max(viewportGutter, window.innerWidth - width - viewportGutter),
      );
      setDropPos({ top: rect.bottom + 6, left, width });
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
            <div
              data-testid="add-deliverable-backdrop"
              className="fixed inset-0 z-[9998]"
              onClick={() => setShowAddDeliverable(false)}
            />
            <div
              data-testid="add-deliverable-menu"
              className="fixed z-[9999] max-h-[70vh] overflow-y-auto rounded-lg border border-slate-200/60 bg-white/95 p-2 shadow-xl backdrop-blur-xl animate-spring-in dark:border-slate-700/70 dark:bg-slate-900/95"
              style={{ top: dropPos.top, left: dropPos.left, width: dropPos.width }}
            >
              {builtIn.length > 0 && (
                <>
                  <p className="px-2 pb-1.5 pt-1 text-xs font-semibold text-slate-500 dark:text-slate-300">
                    Add deliverable
                  </p>
                  {builtIn.map((feature) => (
                    <button
                      key={feature.id}
                      onClick={() => onAdd(feature)}
                      className="w-full rounded-md px-2 py-2 text-left text-xs font-medium text-slate-600 transition-colors hover:bg-indigo-50 hover:text-indigo-700 dark:text-slate-200 dark:hover:bg-indigo-400/10 dark:hover:text-indigo-200"
                    >
                      {feature.label}
                    </button>
                  ))}
                </>
              )}
              {custom.length > 0 && (
                <>
                  <div className="my-1.5 border-t border-slate-100/80 dark:border-slate-700/70" />
                  <p className="px-2 pb-1.5 pt-1 text-xs font-semibold text-slate-500 dark:text-slate-300">
                    Your custom
                  </p>
                  {custom.map((feature) => (
                    <button
                      key={feature.id}
                      onClick={() => onAdd(feature)}
                      className="w-full rounded-md px-2 py-2 text-left text-xs font-medium text-indigo-600 transition-colors hover:bg-indigo-50 hover:text-indigo-700 dark:text-indigo-300 dark:hover:bg-indigo-400/10 dark:hover:text-indigo-200"
                    >
                      {feature.label}
                    </button>
                  ))}
                </>
              )}
              {/* Create Custom option */}
              {(builtIn.length > 0 || custom.length > 0) && (
                <div className="my-1.5 border-t border-slate-100/80 dark:border-slate-700/70" />
              )}
              <button
                onClick={() => {
                  setShowAddDeliverable(false);
                  onCreateCustom();
                }}
                className="flex w-full items-center gap-1.5 rounded-md px-2 py-2 text-left text-xs font-medium text-indigo-500 transition-colors hover:bg-indigo-50 hover:text-indigo-700 dark:text-indigo-300 dark:hover:bg-indigo-400/10 dark:hover:text-indigo-200"
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

export default function AppFlow({
  startupAction = null,
  onStartupHandled,
  onReturnToLanding,
  scionRuntimeStatus,
} = {}) {
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

  // Setup screens share one document instead of navigating to new pages.
  // Reset the document scroll when that screen state changes so a CTA that
  // was brought into view on a short phone does not strand the next step
  // below its heading and progress indicator.
  useEffect(() => {
    if (typeof window.scrollTo === 'function') window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [screen]);

  // v0.14.7 WS-F2: quick start — the landing prompt box can generate with
  // defaults directly. The flag defers the generate call one render so the
  // select-all feature selection COMMITS before generation reads it
  // (getOrderedSelectedDeliverables closes over selectedFeatures). Declared
  // before the return-to-landing guard below, which must not bounce the
  // flow back to App's landing during the one-render quick-start window.
  const [quickStartPending, setQuickStartPending] = useState(false);

  useEffect(() => {
    if (screen === 'landing' && !isHandlingStartupAction && !startupAction && !quickStartPending) {
      onReturnToLanding?.();
    }
  }, [screen, isHandlingStartupAction, startupAction, onReturnToLanding, quickStartPending]);

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

  // v0.13: the CourseGraph is the project's source of truth — the course map
  // shown in the workspace is a render of it. Kept as AppFlow state (not in
  // the course store) so the blast radius of the v0.13 transition stays
  // small; persisted in the project snapshot as formatVersion 2.
  const [courseGraph, setCourseGraph] = useState(null);
  const courseGraphRef = useRef(courseGraph);
  useEffect(() => {
    courseGraphRef.current = courseGraph;
  }, [courseGraph]);

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
      const originalProvider = snapshot?.provider || '';
      const nextProvider = originalProvider ? normalizeProjectProvider(originalProvider) : providerFallback;
      if (nextProvider === PUBLIC_SCION_PROVIDER_ID) {
        restorePublicScionAIConfig(setProvider, setApiKey, setModelId, setModelName, setApiStatus);
        return;
      }
      const providerWasRemapped = Boolean(originalProvider && nextProvider !== originalProvider);

      try {
        if (nextProvider) localStorage.setItem('coursemapper-provider', nextProvider);
        if (providerWasRemapped) {
          localStorage.removeItem('coursemapper-modelid');
        } else if (snapshot && Object.prototype.hasOwnProperty.call(snapshot, 'modelId')) {
          if (snapshot.modelId) localStorage.setItem('coursemapper-modelid', snapshot.modelId);
          else localStorage.removeItem('coursemapper-modelid');
        } else if (providerFallback !== undefined) {
          localStorage.removeItem('coursemapper-modelid');
        }
        if (providerWasRemapped) {
          localStorage.removeItem('coursemapper-modelname');
        } else if (snapshot && Object.prototype.hasOwnProperty.call(snapshot, 'modelName')) {
          if (snapshot.modelName) localStorage.setItem('coursemapper-modelname', snapshot.modelName);
          else localStorage.removeItem('coursemapper-modelname');
        } else if (providerFallback !== undefined) {
          localStorage.removeItem('coursemapper-modelname');
        }
      } catch {}

      const restoredApiKey = nextProvider ? getSavedApiKeyForProvider(nextProvider) : '';
      const restoredModelId = providerWasRemapped
        ? ''
        : snapshot && Object.prototype.hasOwnProperty.call(snapshot, 'modelId')
          ? snapshot.modelId || ''
          : providerFallback !== undefined
            ? ''
            : modelId;

      if (nextProvider) setProvider(nextProvider);
      if (nextProvider) setApiKey(restoredApiKey);
      if (providerWasRemapped) {
        setModelId('');
      } else if (snapshot && Object.prototype.hasOwnProperty.call(snapshot, 'modelId')) {
        setModelId(snapshot.modelId || '');
      } else if (providerFallback !== undefined) {
        setModelId('');
      }
      if (providerWasRemapped) {
        setModelName('');
      } else if (snapshot && Object.prototype.hasOwnProperty.call(snapshot, 'modelName')) {
        setModelName(snapshot.modelName || '');
      } else if (providerFallback !== undefined) {
        setModelName('');
      }
      setApiStatus(restoredApiKey && restoredModelId ? 'connected' : 'idle');
    },
    [modelId, setApiKey, setApiStatus, setModelId, setModelName, setProvider],
  );

  // ── Core Course Map State ──
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

  // v0.14.1 (3.5): assessment chips in the course map open the matching
  // deliverable tab; "Show in course map" from a deliverable reroutes through
  // focusCourseMapTarget while the map tab is hidden.
  useDeliverableFocusRouter({ activeTab, setActiveTab, setMobileWorkspaceView, focusCourseMapTarget });

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
  const [deleteTabConfirm, setDeleteTabConfirm] = useState(null);
  const [developerMode, setDeveloperMode] = useState(() => {
    try {
      return localStorage.getItem('coursemapper-developer-mode') === 'true';
    } catch {
      return false;
    }
  });
  const [showDeveloperPanel, setShowDeveloperPanel] = useState(false);
  const [apiCallBudget, setApiCallBudget] = useState(() => createApiCallBudget());
  const apiCallBudgetRef = useRef(apiCallBudget);
  const getApiCallBudgetReceipt = useCallback(
    () => buildApiCallBudgetReceipt(apiCallBudgetRef.current || createApiCallBudget()),
    [],
  );
  const restoreApiCallBudgetReceipt = useCallback((receipt) => {
    const next = createApiCallBudgetFromReceipt(receipt);
    apiCallBudgetRef.current = next;
    setApiCallBudget(next);
  }, []);
  const recordApiCallEvent = useCallback((event) => {
    const current = apiCallBudgetRef.current || createApiCallBudget();
    const next = applyApiCallBudgetEvent(current, event);
    apiCallBudgetRef.current = next;
    traceApiCallBudget(event, next);
    setApiCallBudget(next);
  }, []);
  // v0.12.1: pipeline provenance for PACKAGE_MANIFEST.json — read at export
  // time so downloaded packages record how their content was produced.
  const getManifestPipelineState = useCallback(() => {
    const budget = apiCallBudgetRef.current || {};
    const outcome = budget.enrichmentOutcome || null;
    // v0.14.1 P2.2: shared formatter — partial coverage reads
    // "ran (12/14 — lessons 13, 14 fell back to template)" in the manifest,
    // matching the digest pipeline line.
    const enrichment = formatEnrichmentOutcomeLabel(outcome);
    const currentGraph = courseGraphRef.current;
    const graphStats = courseGraphStats(currentGraph);
    const coverage = knowledgeCoverage(currentGraph);
    const sourceLedgerSummary = currentGraph?.courseIR?.sourceLedgerSummary || null;
    const knowledgeBackbone = buildKnowledgeBackboneLabel(coverage, sourceLedgerSummary);
    const pipelineState = {
      enrichment,
      genomeLinker: budget.pipeline?.genomeLinker || 'not run',
      ...(budget.pipeline?.planHealth ? { planHealth: budget.pipeline.planHealth } : {}),
      // v0.13: the package records the graph it was compiled from.
      ...(graphStats
        ? {
            courseGraph: `${graphStats.sessions} sessions · ${graphStats.concepts} concepts (${graphStats.genomeLinkedConcepts} genome-linked, ${graphStats.authoredConcepts} authored) · ${graphStats.outcomes} outcomes`,
          }
        : {}),
      // v0.13.5 P4: the coverage meter — how much of this package is backed
      // by cited open knowledge, recorded where reviewers will look.
      ...(knowledgeBackbone ? { knowledgeBackbone } : {}),
      // v0.14 P3: the judgment surface — what the genome reasoned about this
      // course (prerequisite gaps found, bridged, or flagged).
      ...(budget.pipeline?.judgment ? { judgment: budget.pipeline.judgment } : {}),
    };
    return normalizePipelineStateWithSourceBackedJudgment(pipelineState, {
      sourceRefCoverage: currentGraph?.courseIR?.sourceRefCoverage || null,
      sourceLedgerSummary,
      sourceLedger: currentGraph?.courseIR?.sourceLedger || null,
      courseGraph: currentGraph,
      courseMap: courseMapRef.current,
      totalLessons: coverage?.sessions || 0,
      lessonsWithResources: coverage?.sessionsWithResources || 0,
      genomeLinkedLessons: coverage?.genomeLinkedLessons || 0,
    });
  }, []);

  // ── Misc ──
  const [downloadedFile, setDownloadedFile] = useState('');
  // Lesson count — estimated by regex first, then refined by AI when user proceeds
  const [lessonCount, setLessonCount] = useState(0);
  const [isDetectingLessons, setIsDetectingLessons] = useState(false);
  const workspaceTabsContainerRef = useRef(null);
  const [workspaceTabScrollCues, setWorkspaceTabScrollCues] = useState({
    backward: false,
    forward: false,
  });
  const updateWorkspaceTabScrollCues = useCallback(() => {
    const container = workspaceTabsContainerRef.current;
    if (!container) return;
    const next = {
      backward: container.scrollLeft > 4,
      forward: container.scrollLeft + container.clientWidth < container.scrollWidth - 4,
    };
    setWorkspaceTabScrollCues((previous) =>
      previous.backward === next.backward && previous.forward === next.forward ? previous : next,
    );
  }, []);
  const scrollWorkspaceTabs = useCallback((direction) => {
    const container = workspaceTabsContainerRef.current;
    if (!container) return;
    container.scrollBy({
      left: direction * Math.max(180, Math.round(container.clientWidth * 0.68)),
      behavior: 'smooth',
    });
  }, []);
  const tabButtonRefs = useRef(new Map());
  const tabButtonRefCallbacks = useRef(new Map());
  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;
  const getTabButtonRef = useCallback((featureId) => {
    if (!tabButtonRefCallbacks.current.has(featureId)) {
      tabButtonRefCallbacks.current.set(featureId, (node) => {
        if (node) {
          tabButtonRefs.current.set(featureId, node);
          if (activeTabRef.current === featureId) {
            window.requestAnimationFrame(() => {
              node.scrollIntoView({ behavior: 'auto', block: 'nearest', inline: 'nearest' });
            });
          }
        } else {
          tabButtonRefs.current.delete(featureId);
        }
      });
    }
    return tabButtonRefCallbacks.current.get(featureId);
  }, []);
  const trashDropRef = useRef(null);
  const suppressTabClickRef = useRef(false);
  // v0.15.1 C1: the tab drag/reorder/delete machinery lives in useTabDrag —
  // extracted verbatim; UIContext keeps dragTabIdx (other surfaces dim).
  // workspaceTabs derives after the screen returns below, so it rides a ref.
  const workspaceTabsRef = useRef([]);
  const { tabDrag, handleTabPointerDown, handleTabPointerMove, handleTabPointerUp, handleTabPointerCancel } =
    useTabDrag({
      workspaceTabsRef,
      tabButtonRefs,
      trashDropRef,
      suppressTabClickRef,
      setSelectedFeatures,
      setDeleteTabConfirm,
      setDragTabIdx,
      onDragStart: () => handleCascadeHover(null),
    });
  // Shared focus: the deliverable item currently on the instructor's screen,
  // reported by DeliverableView and read by the chat agent's context builder.
  const viewportRef = useRef(null);

  // Keep the selected material discoverable when a saved workspace opens on
  // a narrow screen or the viewport changes orientation. Horizontal tab bars
  // otherwise reset to their first item even when a later material is active.
  useEffect(() => {
    if (screen !== 'workspace') return undefined;

    let cueFrame;
    const container = workspaceTabsContainerRef.current;
    updateWorkspaceTabScrollCues();
    const resizeObserver =
      container && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(updateWorkspaceTabScrollCues) : null;
    resizeObserver?.observe(container);
    const revealActiveTab = () => {
      const button = tabButtonRefs.current.get(activeTab);
      if (!container || !button) {
        updateWorkspaceTabScrollCues();
        return;
      }
      button.scrollIntoView({ behavior: 'auto', block: 'nearest', inline: 'nearest' });
      cueFrame = window.requestAnimationFrame(updateWorkspaceTabScrollCues);
    };

    const frame = window.requestAnimationFrame(revealActiveTab);
    const handleResize = () => {
      revealActiveTab();
      updateWorkspaceTabScrollCues();
    };
    window.addEventListener('resize', handleResize);
    return () => {
      window.cancelAnimationFrame(frame);
      if (cueFrame) window.cancelAnimationFrame(cueFrame);
      resizeObserver?.disconnect();
      window.removeEventListener('resize', handleResize);
    };
  }, [activeTab, screen, selectedFeatures, updateWorkspaceTabScrollCues]);

  // ── AI Context Menu (inline AI editing) ──
  const chatSendRef = useRef(null);
  const packageFinalizerRef = useRef(null);
  const packageFinalizerInFlightRef = useRef(null);
  // v0.14.3 WS-A A2: the last run digest, kept so the ZIP download path can
  // hand the quality grader the same honesty source the finalize grade used.
  const lastRunDigestRef = useRef(null);
  // v0.14.9 B1: the digest mirrored into state so the review queue (a memo)
  // rebuilds when a finish pass lands — the ref alone is not reactive.
  const [lastRunDigest, setLastRunDigest] = useState(null);
  const packageGenerationInFlightRef = useRef(false);
  const [packageGenerationBusy, setPackageGenerationBusy] = useState(false);
  const suppressedPackageRetryKeysRef = useRef(new Set());
  const canFinishPackageWithAgent = isAgentProviderReady({ provider, apiKey, apiStatus, modelId });
  const version = useVersionHistory(setCourseMap, setDownloadedFile);
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
  const handleGeneratedCourseMapRepair = useCallback(
    (repairedCourseMap, meta = {}) => {
      if (!repairedCourseMap?.lessons) return;
      setCourseMap(repairedCourseMap);
      version.pushVersion(
        repairedCourseMap,
        meta.source === 'blueprintCompiler'
          ? 'Cleaned course map before compiling deliverables'
          : meta.source === 'knowledgeBackbone'
            ? 'Attached cited readings and open resources'
            : 'Cleaned course map readiness fields',
      );
    },
    [setCourseMap, version.pushVersion],
  );
  // v0.13: generation delivers the derived CourseGraph (with enrichment
  // attached) — adopt it as the project's source of truth.
  const handleCourseGraph = useCallback((graph) => {
    if (!graph || !validateCourseGraph(graph).valid) return;
    courseGraphRef.current = graph;
    setCourseGraph(graph);
  }, []);
  // v0.13.1: every restore path (local session, cloud project, .coursemapper
  // file, developer snapshot) adopts the saved graph when it validates, or
  // derives a fresh one from the restored map. Invalid graphs (e.g. the
  // tuple-edge encoding v0.13.0 briefly shipped) silently re-derive. The
  // narrow duplicate-resource-id defect is repaired first so an otherwise
  // valid enriched graph never loses its authored lesson kernels on reopen.
  const adoptCourseGraph = useCallback((saved) => {
    const restoredGraph = restoreCourseGraphForProject(saved);
    courseGraphRef.current = restoredGraph;
    setCourseGraph(restoredGraph);
  }, []);
  // v0.13 write-back: course-map edits (grid cells, agent actions, repairs)
  // re-derive the graph so it never drifts from what the instructor sees.
  // The enrichment overlay (authored kernels, lens) is preserved across
  // re-derivation — edits to structure never discard authored content.
  // Also the safety net: any path that sets a course map without a graph
  // gets one derived here.
  useEffect(() => {
    if (!courseMap?.lessons) return;
    try {
      if (!courseGraphRef.current) {
        setCourseGraph(deriveCourseGraphFromCourseMap(courseMap));
        return;
      }
      // v0.14.1 (3.3a): the visible map is the DISPLAY render (assessment
      // reference suffixes included) — compare against the same variant so
      // a freshly pushed render never triggers a spurious re-derivation.
      // The canonical render is also accepted: maps from pre-registry saves
      // and repair pushes carry no suffixes.
      const renderedDisplay = renderCourseMapFromGraph(courseGraphRef.current, { assessmentReferences: true });
      const mapJson = JSON.stringify(courseMap);
      if (JSON.stringify(renderedDisplay) === mapJson) return;
      const rendered = renderCourseMapFromGraph(courseGraphRef.current);
      if (JSON.stringify(rendered) === mapJson) return;
      const rederived = attachEnrichmentToGraph(
        deriveCourseGraphFromCourseMap(courseMap),
        courseGraphRef.current.enrichmentOverlay,
      );
      // v0.14.5 WS-B (B4), extended for CurriculumV1-native graphs: native
      // entity ids stay stable across re-derivation. Sessions match by (order,
      // normalized title), assessments/readings by (dueSession, normalized
      // title); new entities get fresh ids. The prose path keeps today's
      // behavior.
      const nativeCourseIRAssembly = courseGraphRef.current.courseIR?.nativeAssembly || null;
      const keepStableEntityIds =
        courseGraphRef.current.authoredBy === 'native' || nativeCourseIRAssembly?.projectedThrough === 'curriculumv1';
      setCourseGraph(
        keepStableEntityIds
          ? matchEntityIds(courseGraphRef.current, {
              ...rederived,
              authoredBy: courseGraphRef.current.authoredBy,
              ...(courseGraphRef.current.courseIR
                ? {
                    courseIR: {
                      ...courseGraphRef.current.courseIR,
                      nativeAssembly: {
                        ...nativeCourseIRAssembly,
                        editedAfterProjection: true,
                      },
                    },
                  }
                : {}),
            })
          : preserveSourceProof(courseGraphRef.current, rederived),
      );
    } catch {
      /* graph consistency is best-effort — the map remains usable */
    }
  }, [courseMap]);

  useEffect(() => {
    try {
      localStorage.setItem('coursemapper-developer-mode', developerMode ? 'true' : 'false');
    } catch {}
    if (!developerMode) setShowDeveloperPanel(false);
  }, [developerMode]);

  // ── Cascade sync ──
  // Always-fresh ref to courseMap for useSmartSync (avoids stale closure)
  const courseMapRef = useRef(courseMap);
  useEffect(() => {
    courseMapRef.current = courseMap;
  }, [courseMap]);
  // Always-fresh ref to deliverables for onRequestProposal callback
  const deliverablesRef = useRef(null);

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
    sourceBrief: promptText,
    courseGraph,
    onApiCallEvent: recordApiCallEvent,
    onCourseMapRepair: handleGeneratedCourseMapRepair,
    onCourseGraph: handleCourseGraph,
  });
  const expectedSessionMinutes = useMemo(
    () =>
      resolveRequestedClassSessionMinutes({
        sourceBrief: promptText,
        explicitSessionLength: deliverableConfig?.lessonPlans?.sessionLength,
        defaultSessionLength: deliv.getGenerationConfig('lessonPlans')?.sessionLength,
      }),
    [deliv.getGenerationConfig, deliverableConfig?.lessonPlans?.sessionLength, promptText],
  );
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
  // v0.14.4 WS-B2: the quality findings modal lives inside ExportSidePanel's
  // tree, but the header chip must open it too — so the open-state lives here
  // (the common parent) and the panel renders the modal in controlled mode.
  const [qualityReportOpen, setQualityReportOpen] = useState(false);
  // v0.14.4 WS-C: the unified review queue's open-state lives here (the
  // common parent) — the export panel's entry chips and the agent panel's
  // observation card both route into the SAME drawer hosted by
  // ExportSidePanel. focusId targets a specific item (observation source id).
  const [reviewQueueRequest, setReviewQueueRequest] = useState(null); // { focusId } | null
  useEffect(() => {
    // A fresh finish/grade pass invalidates the previous report — close it so
    // a stale modal never pops back when the new grade lands. The review
    // queue closes too: its items are about to be replaced.
    if (packageQualityPass?.status === 'running') {
      setQualityReportOpen(false);
      setReviewQueueRequest(null);
    }
  }, [packageQualityPass?.status]);

  // The agent's "Worth a look" digest observations feed the queue's
  // observation class. ChatPanel appends the digest message to chat history;
  // the latest one wins (older digests describe an older package).
  const reviewObservations = useMemo(() => {
    for (let i = chatHistory.length - 1; i >= 0; i--) {
      const message = chatHistory[i];
      if (message?.role === 'digest' && Array.isArray(message.digest?.observations)) {
        return message.digest.observations;
      }
    }
    return [];
  }, [chatHistory]);

  const smartSyncRef = useRef(null);
  // v0.15: the post-sync regrade waits for the STORE to settle (every
  // selected feature done/error and the sync runner idle) before grading —
  // refs lag dispatches by a render, and grading mid-write parked live
  // packages on phantom "not ready" blockers.
  const [syncRegradePending, setSyncRegradePending] = useState(false);

  const handleReviewQueueOpenChange = useCallback((open, focusId = null) => {
    if (!open) {
      setReviewQueueRequest(null);
      return;
    }
    // Mirror the quality chip's mobile handling: the drawer lives in the
    // export panel's subtree, so bring that view forward first.
    setMobileWorkspaceView('export');
    setReviewQueueRequest({ focusId: typeof focusId === 'string' && focusId ? focusId : null });
  }, []);
  const handleOpenReviewQueueFromObservation = useCallback(
    (observationId) => handleReviewQueueOpenChange(true, observationId || null),
    [handleReviewQueueOpenChange],
  );

  // v0.15.3 C1: the deterministic readiness-repair callback lives in
  // useWorkspaceRepairs — extracted verbatim.
  const applyPackageReadinessRepairs = useWorkspaceRepairs({
    courseMap,
    setCourseMap,
    columns,
    deliverableConfig,
    selectedFeatures,
    deliv,
    delivUndo,
  });

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
      // v0.15 (sync-proof race): a finish pass that STARTS while a sync is
      // still rewriting deliverables grades a half-synced package — the live
      // repro left a permanent "blocked · Study Guides is not ready" verdict
      // because an 'auto' pass fired mid-sync and the post-sync regrade
      // JOINED it. Auto/manual passes wait for the sync's own regrade.
      if (smartSyncRef.current?.isSyncing && source !== 'sync') {
        tracePackageFinish('skipped', 'skip_while_syncing', { source, selectedFeatureIds });
        return Promise.resolve(null);
      }
      if (packageFinalizerInFlightRef.current) {
        if (source === 'sync') {
          // The in-flight pass may have started mid-sync (stale inputs) —
          // chain a FRESH pass behind it instead of adopting its verdict.
          tracePackageFinish('existing', 'chain_after_existing', { source, selectedFeatureIds });
          const prior = packageFinalizerInFlightRef.current;
          return prior
            .catch(() => {})
            .then(() =>
              packageFinalizerRef.current
                ? packageFinalizerRef.current({ retry: false, source: 'sync', selectedFeatureIds, lessonFilter })
                : null,
            );
        }
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
        const preparedScope = prepareMaterializedPackageScope({
          courseMap: finalizerCourseMap,
          deliverables: finalizerDeliverables,
          lessonFilter,
          explicitSourceFilter: lessonScope.type === 'specific' ? lessonScope.indices : null,
        });
        finalizerCourseMap = preparedScope.courseMap;
        finalizerDeliverables = preparedScope.deliverables;
        const sourceLessonFilter = preparedScope.sourceLessonFilter;
        const effectiveLessonFilter = preparedScope.effectiveLessonFilter;
        tracePackageFinish(finishRunId, 'finish_start', {
          selectedFeatureIds: featureIds,
          lessonFilter: effectiveLessonFilter,
          requestedLessonFilter: sourceLessonFilter,
          retry,
          maxRetryActions,
          maxRetryCallBudget,
          maxRetryPasses,
          source,
          lessonCount: Array.isArray(finalizerCourseMap?.lessons) ? finalizerCourseMap.lessons.length : 0,
          deliverableIds: Object.keys(finalizerDeliverables || {}),
        });
        // v0.9.11 P0: print the run's per-task cost table once generation work
        // is done and packaging begins — the proof artifact for cost-shift work.
        const costReport = buildGenerationCostReport(apiCallBudgetRef.current || {});
        const costReportText = formatGenerationCostReport(costReport);
        if (costReportText) traceLog(`[CM][COST]\n${costReportText}`, { runId: costReport.runId });
        const runFinalizer = (retryLimit) =>
          runDeterministicPackageFinalizer({
            courseMap: finalizerCourseMap,
            deliverables: finalizerDeliverables,
            selectedFeatures: featureIds,
            columns,
            lessonFilter: effectiveLessonFilter,
            deliverableConfig,
            includeClassroomReadiness: true,
            blockOnClassroomWarnings: false,
            includePedagogicalValidation: true,
            blockOnValidationWarnings: false,
            maxRetryActions: retryLimit,
            retryWarnings: false,
            retryContentQualityWarnings: source === 'export',
            // v0.14.1 P2.2: partial enrichment coverage surfaces as a
            // finalizer warning (blocker below 60%) instead of staying a
            // digest-only secret.
            enrichmentOutcome: apiCallBudgetRef.current?.enrichmentOutcome || null,
            // v0.14.1 P2.5: the graph's promised assessments reconcile
            // against downstream artifacts — a phantom midterm/oral warns
            // here instead of shipping silently.
            courseGraph: courseGraphRef.current || null,
            expectedSessionMinutes,
          });

        setPackageQualityPass({
          status: 'running',
          phase: 'finish',
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
          lessonFilter: effectiveLessonFilter,
          generationPlan,
          includeCourseMap: false,
          includeDeliverableChunks: false,
          includeRepairRetryReserve: false,
          finalizerRetryCallBudget: canRetryWeakSpots ? maxRetryCallBudget : 0,
        });
        recordApiCallEvent({
          type: 'costPlan',
          postBuildActivity: true,
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
            lessonFilter: effectiveLessonFilter,
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
            phase: 'finish',
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

          const runRetryAction = async (action) => {
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
                effectiveLessonFilter,
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
                {
                  mode: 'finalizerRetry',
                  maxProviderCalls: action.estimatedCalls || 1,
                  // v0.14.1 round 2: the finalizer holds the AUTHORITATIVE
                  // deliverable data. The hook's render-closure snapshot can be
                  // stale/null when this whole chain runs in one synchronous
                  // task (the live CS run replaced the entire 17-entry quiz
                  // bank with a single regenerated lesson because of this).
                  currentData: finalizerDeliverables[action.featureId]?.data || null,
                },
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
            // The finalizer result is the authoritative package view. A React
            // render triggered by feature regeneration can briefly expose the
            // pre-normalized Course Map through the ref; never let that stale
            // render erase a compact workspace's source lesson identity.
            finalizerCourseMap = result.courseMap || finalizerCourseMap;
            finalizerDeliverables = deliverablesRef.current || finalizerDeliverables;
          };
          // v0.15.186: retry actions used to run strictly one at a time.
          // Actions on DIFFERENT features are independent — run the feature
          // groups concurrently (limit 3) and keep actions WITHIN a feature
          // sequential, so a lesson regen always sees the data the previous
          // action for that feature just wrote (the :1455 stale-data rule).
          const retryActionsByFeature = new Map();
          for (const action of retryActionsToRun) {
            const featureKey = action.featureId || 'package';
            if (!retryActionsByFeature.has(featureKey)) retryActionsByFeature.set(featureKey, []);
            retryActionsByFeature.get(featureKey).push(action);
          }
          const retryGroupLimit = pLimit(3);
          await Promise.all(
            [...retryActionsByFeature.values()].map((group) =>
              retryGroupLimit(async () => {
                for (const action of group) {
                  await runRetryAction(action);
                }
              }),
            ),
          );

          remainingRetryCallBudget = Math.max(0, remainingRetryCallBudget - retryBudget.usedCalls);
          const preparedRetryScope = prepareMaterializedPackageScope({
            courseMap: finalizerCourseMap,
            deliverables: finalizerDeliverables,
            lessonFilter: effectiveLessonFilter,
            explicitSourceFilter: sourceLessonFilter,
          });
          finalizerCourseMap = preparedRetryScope.courseMap;
          finalizerDeliverables = preparedRetryScope.deliverables;
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

        setPackageQualityPass({ status: 'running', phase: 'finish' });

        let exportVerification = null;
        try {
          tracePackageFinish(finishRunId, 'export_verify_start', {
            selectedFeatureIds: featureIds,
            lessonFilter: effectiveLessonFilter,
            status: result.status,
          });
          const { verifyPackageExports } = await import('./lib/packageExportVerifier');
          exportVerification = await verifyPackageExports({
            courseMap: result.courseMap || courseMapRef.current,
            deliverables: result.deliverables || deliverablesRef.current || {},
            selectedFeatures: featureIds,
            columns,
            lessonFilter: effectiveLessonFilter,
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
        let blockers = result.readiness.blockers.length + exportFailures;
        let reviewWarningCount = result.readiness.warnings.length + unresolvedRetryCount + exportWarnings;
        let finalStatus = blockers > 0 ? 'blocked' : 'ready';
        let warnings = finalStatus === 'ready' ? 0 : reviewWarningCount;
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
        let finalizerMessage =
          finalStatus === 'ready'
            ? PACKAGE_READY_MESSAGE
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
        let receipt = buildQualityReceipt({
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
        let receiptWithSpend = {
          ...receipt,
          ...(apiSpendSummary ? { apiSpendSummary } : {}),
          ...(apiFeatureSpendSummary.length > 0 ? { apiFeatureSpendSummary } : {}),
          ...(compilerSummary ? { compilerSummary } : {}),
        };
        const spendText = apiSpendSummary ? ` API spend: ${apiSpendSummary.label}.` : '';
        const compilerText = compilerSummary ? ` ${compilerSummary.label}.` : '';

        // v0.10.1: the RUN DIGEST — one structured diagnostic per finish,
        // built for auditing real runs (decisions + reasons, honest costs,
        // actual gate messages). Lazy import keeps it out of this chunk.
        // v0.15.38: build a preliminary digest for the quality grader's
        // honesty source, but emit the console digest only AFTER the quality
        // gate has been merged so `[CM][DIGEST]` matches the visible finish.
        let runDigest = null;
        let buildCurrentRunDigest = null;
        let emitRunDigestForFinish = null;
        try {
          const { buildRunDigest, emitRunDigest } = await import('./lib/runDigest');
          emitRunDigestForFinish = emitRunDigest;
          buildCurrentRunDigest = (quality = null) => {
            const currentBudget = apiCallBudgetRef.current || {};
            const digestBudget = {
              ...currentBudget,
              pipeline: {
                ...(currentBudget.pipeline || {}),
                ...(getManifestPipelineState() || {}),
              },
            };
            return buildRunDigest({
              budget: digestBudget,
              exportVerification,
              finish: {
                finalStatus,
                blockers,
                // v0.16.1: the digest reports the REAL warning count. The UI
                // `warnings` is zeroed on ready (calm pass), which made the
                // Linear Algebra digest claim "0 warnings" while its own
                // flaggedChecks listed one — gates must not disagree with
                // themselves.
                warnings: reviewWarningCount,
                repairsApplied: totalRepairsApplied,
                retryCallCount,
                finishRunId,
                quality,
                // v0.14.1 P2.5: map↔deliverable reconciliation findings reach
                // the digest's flagged checks (incl. the info-level aggregate
                // that stays out of the readiness warning count).
                assessmentReconciliationIssues: result.assessmentReconciliationIssues || [],
                // v0.15.173: readiness blockers can be the only thing that
                // stops export after quality/export gates pass. Carry their
                // messages into the digest so blocked runs are auditable.
                readinessBlockers: result.readiness?.blockers || [],
                readinessWarnings: result.readiness?.warnings || [],
              },
              generation: {
                provider: result.provider || '',
                lessonCount: Array.isArray((result.courseMap || courseMapRef.current)?.lessons)
                  ? (result.courseMap || courseMapRef.current).lessons.length
                  : null,
                featureIds,
              },
            });
          };
          runDigest = buildCurrentRunDigest();
        } catch {
          /* digest is diagnostics-only — never block the finish on it */
        }

        // v0.14.3 WS-A A2: after export_verify passes, the package grades
        // itself — deterministic deep-quality grade over the same in-memory
        // file map the ZIP download assembles. Lazy chunk, bounded timeout,
        // non-blocking: any failure becomes quality { status: 'not-graded' }.
        setPackageQualityPass({ status: 'running', phase: 'grade' });

        let packageQuality = null;
        if ((exportVerification?.failed || 0) > 0) {
          packageQuality = { status: 'not-graded', reason: 'export verification failed' };
        } else {
          try {
            const { gradePackageAtFinalize } = await import('./lib/quality/finalizeQualityGate');
            packageQuality = await gradePackageAtFinalize({
              courseMap: result.courseMap || courseMapRef.current,
              deliverables: result.deliverables || deliverablesRef.current || {},
              featureIds,
              columns,
              lessonFilter: effectiveLessonFilter,
              slideTheme,
              courseGraph: courseGraphRef.current || null,
              pipelineState: getManifestPipelineState(),
              budget: apiCallBudgetRef.current || {},
              digest: runDigest,
              coursePrompt: promptText,
              expectedSessionMinutes,
            });
          } catch (err) {
            packageQuality = { status: 'not-graded', reason: err?.message || 'grading unavailable' };
          }
        }
        // P0 quality findings update the same readiness object the export
        // panel consumes; recompute the visible package receipt after grading.
        result = applyQualityToFinalizerResult(result, packageQuality);
        blockers = (result.readiness?.blockers?.length || 0) + exportFailures;
        reviewWarningCount = (result.readiness?.warnings?.length || 0) + unresolvedRetryCount + exportWarnings;
        finalStatus = blockers > 0 ? 'blocked' : 'ready';
        warnings = finalStatus === 'ready' ? 0 : reviewWarningCount;
        finalizerMessage =
          finalStatus === 'ready'
            ? PACKAGE_READY_MESSAGE
            : String(
                result.readiness?.blockers?.[0]?.message ||
                  result.message ||
                  result.readiness?.warnings?.[0]?.message ||
                  '',
              ).replace(/^Auto-fixed \d+ safe issues?\. /, '');
        receipt = buildQualityReceipt({
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
        receiptWithSpend = {
          ...receipt,
          ...(apiSpendSummary ? { apiSpendSummary } : {}),
          ...(apiFeatureSpendSummary.length > 0 ? { apiFeatureSpendSummary } : {}),
          ...(compilerSummary ? { compilerSummary } : {}),
        };
        tracePackageFinish(finishRunId, 'quality_grade_done', {
          status: packageQuality?.status,
          score: packageQuality?.score ?? null,
          grade: packageQuality?.grade ?? null,
          p0: packageQuality?.findingCounts?.p0 ?? null,
          reason: packageQuality?.reason || '',
        });
        try {
          if (buildCurrentRunDigest && emitRunDigestForFinish) {
            runDigest = buildCurrentRunDigest(packageQuality);
            emitRunDigestForFinish(runDigest);
          }
        } catch {
          /* digest is diagnostics-only — never block the finish on it */
        }
        lastRunDigestRef.current = runDigest;
        setLastRunDigest(runDigest);

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
          // v0.14.3 WS-A A3: the quality badge data (score, grade, findings)
          // for the export panel chip + modal.
          quality: packageQuality,
        });
        tracePackageFinish(finishRunId, 'finish_complete', {
          finalStatus,
          blockers,
          // v0.16.1: honest count in telemetry (UI `warnings` is calmed to 0
          // on ready; the trace must not be).
          warnings: reviewWarningCount,
          retryCount,
          retryPassCount,
          retryCallCount,
          skippedRetryActionCount,
          retryBudgetRemaining: remainingRetryCallBudget,
          exportStatus: exportVerification?.status,
          // Slimmed in v0.10.1 — the structured detail now lives in the run
          // digest emitted below instead of repeating cumulative blobs here.
          apiSpend: apiSpendSummary?.label || '',
          compilerSavings: compilerSummary?.label || '',
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
          quality: packageQuality,
          courseGraph: courseGraphRef.current || null,
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
      expectedSessionMinutes,
      getManifestPipelineState,
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
      if (provider !== 'webllm' && provider !== 'local' && provider !== PUBLIC_SCION_PROVIDER_ID && !apiKey) {
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
    provider,
    modelId,
    // v0.14.7 WS-G2: the stored graph carries the enrichment overlay the
    // blast-radius recompile diffs against.
    courseGraphRef,
    selectedFeatures,
    onSyncComplete: useCallback((featureIds) => {
      setUnseenChanges((prev) => {
        const next = new Set(prev);
        featureIds.forEach((id) => next.add(id));
        return next;
      });
      // v0.14.7 WS-G3 → v0.15: post-sync truth — a sync changes the
      // package, so the grade must change with it. The regrade no longer
      // fires HERE: at this moment the deliverables ref can lag the last
      // synced feature by one render (the live proof graded a package whose
      // Assignment Briefs were "not ready" and parked it on a blocker).
      // The flag below hands off to a settle-aware effect.
      setSyncRegradePending(true);
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
  smartSyncRef.current = smartSync;

  // (Declared with the smartSyncRef block above; the effect lives HERE
  // because its deps read smartSync, which is initialized just above —
  // referencing it earlier is a temporal-dead-zone crash at render.)
  useEffect(() => {
    if (!syncRegradePending) return;
    if (smartSync.isSyncing) return;
    const pendingFeature = selectedFeatures.some((featureId) => {
      if (featureId === 'courseMap') return false;
      const entry = deliv.deliverables[featureId];
      return entry && entry.status !== 'done' && entry.status !== 'error';
    });
    if (pendingFeature) return;
    setSyncRegradePending(false);
    if (typeof packageFinalizerRef.current === 'function') {
      packageFinalizerRef.current({ retry: false, source: 'sync' }).catch(() => {});
    }
  }, [syncRegradePending, smartSync.isSyncing, deliv.deliverables, selectedFeatures]);

  // v0.15.1 C1: the review queue's single owner lives in
  // useReviewQueueOwner (extracted from the v0.14.9 B1 block) — one queue
  // object feeds the header CTA, the panel-hosted drawer, and the digest
  // entry; the headline counts judgment items only.
  // v0.15 F2: the contribute action surfaces only when this browser has
  // extracted kernels to give (kernels only — the privacy boundary).
  const extractedKernelCount = useMemo(
    () => readExtractedKernels().length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [packageQualityPass],
  );

  const { reviewQueue, reviewProgress, outstandingReview, pendingSyncFromChat, handleReviewMark, handleReviewMarkAll } =
    useReviewQueueOwner({
      courseMap,
      deliverables: deliv.deliverables,
      reviewObservations,
      lastRunDigest,
      packageQualityPass,
      pendingSyncSuggestion: smartSync.pendingSyncSuggestion,
      chatHistory,
    });

  // v0.14.7 WS-G4 (rebuilt in v0.15): "Sync now" from the review queue —
  // approve through the router's ONE pathway (chatSendRef carries it), so
  // the plan executes AND the chat card flips to done. Fallbacks keep the
  // action alive if the chat panel is not mounted.
  const handleExecuteSyncFromQueue = useCallback(() => {
    const suggestion = smartSyncRef.current?.pendingSyncSuggestion || pendingSyncFromChat;
    if (!suggestion) return;
    const approveViaRouter = chatSendRef.current?.approveSyncSuggestion;
    if (typeof approveViaRouter === 'function' && suggestion.id) {
      approveViaRouter(suggestion.id);
      return;
    }
    smartSyncRef.current
      ?.executeSyncPlan(suggestion.plan, suggestion.changedFieldsSummary)
      .finally(() => smartSyncRef.current?.clearPendingSyncSuggestion());
  }, [pendingSyncFromChat]);

  // v0.14.9 C2: the same-generation voice A/B driver hook. The Crucible's
  // --voice ab protocol enables the voice flag AFTER a quiet export, then
  // dispatches this event; the done-event lets it await the pass before the
  // second export — twin ZIPs from ONE generation. Nothing in the normal UI
  // dispatches this.
  const runVoicePassPostHocRef = useRef(null);
  runVoicePassPostHocRef.current = deliv.runVoicePassPostHoc;
  useEffect(() => {
    const handler = () => {
      Promise.resolve(runVoicePassPostHocRef.current?.(courseMapRef.current))
        .then((result) => {
          window.dispatchEvent(new CustomEvent('coursemapper:dev-voice-pass-done', { detail: result || null }));
        })
        .catch((err) => {
          window.dispatchEvent(
            new CustomEvent('coursemapper:dev-voice-pass-done', {
              detail: { ran: false, reason: err?.message || 'voice pass failed' },
            }),
          );
        });
    };
    window.addEventListener('coursemapper:dev-run-voice-pass', handler);
    return () => window.removeEventListener('coursemapper:dev-run-voice-pass', handler);
  }, []);

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

  // v0.15.3 C1 (diet phase 2): save/restore/autosave + the developer-template
  // store live in useProjectPersistence — extracted VERBATIM (see the hook
  // header for the discipline). AppFlow consumes the returned state/handlers.
  const {
    hasSavedSession,
    setHasSavedSession,
    setProjectId,
    projectIdRef,
    localSaveStatus,
    cloudSaveStatus,
    isStartingNewProject,
    newProjectError,
    setNewProjectError,
    newProjectCloudSaveFailed,
    setNewProjectCloudSaveFailed,
    developerTemplates,
    activeDeveloperTemplateId,
    buildProjectSnapshot,
    handleSaveProject,
    handleSaveCurrentAsNew,
    doRestoreSession,
    handleOpenProject,
    handleOpenCloudProject,
    applyDeveloperSnapshot,
    saveDeveloperTemplateFromPanel,
    renameDeveloperTemplate,
    duplicateDeveloperTemplate,
    removeDeveloperTemplate,
    applyDeveloperTemplate,
    handleConfirmNewProject,
    handleStartNewProjectWithoutCloudSave,
  } = useProjectPersistence({
    user,
    screen,
    setScreen,
    onReturnToLanding,
    courseMap,
    setCourseMap,
    courseGraph,
    setCourseGraph,
    adoptCourseGraph,
    setOldCourseMap,
    columns,
    setColumns,
    hasGenerated,
    setHasGenerated,
    userEdits,
    setUserEdits,
    files,
    setFiles,
    chatHistory,
    setChatHistory,
    selectedFeatures,
    setSelectedFeatures,
    deliverableConfig,
    setDeliverableConfig,
    lessonScope,
    setLessonScope,
    promptText,
    setPromptText,
    packageQualityPass,
    setPackageQualityPass,
    lastRunDigest,
    setLastRunDigest,
    activeTab,
    setActiveTab,
    slideTheme,
    setSlideTheme,
    setShowDiff,
    setUnseenChanges,
    setLessonCount,
    setNewProjectConfirm,
    provider,
    modelId,
    modelName,
    restoreProjectAIConfig,
    getApiCallBudgetReceipt,
    restoreApiCallBudgetReceipt,
    gen,
    deliv,
    rev,
    version,
    resetExport,
  });

  // ── Derived ──
  const providerIsKeyless = provider === 'local' || provider === PUBLIC_SCION_PROVIDER_ID;
  const canGenerate =
    (providerIsKeyless ? apiStatus === 'connected' : apiKey.trim()) &&
    modelId &&
    (files.length > 0 || promptText.trim().length > 0) &&
    gen.status !== 'parsing' &&
    gen.status !== 'generating' &&
    !gen.isStopped;

  const hasSyllabusFile = files.some((f) =>
    ['pdf', 'doc', 'docx', 'odt', 'rtf'].includes(f.name.split('.').pop().toLowerCase()),
  );

  // ── Handlers ──
  async function handleImport(file) {
    try {
      // v0.15.3 C1: lazy — xlsx/csv import is a rare path; keep the parser
      // out of the workspace chunk.
      const { importCourseMap } = await import('./lib/importCourseMap');
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
      setPackageGenerationBusy(true);
      try {
        setHasGenerated(true);
        setDownloadedFile('');
        setPackageQualityPass({
          status: 'running',
          phase: 'generation',
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
        setPackageGenerationBusy(false);
      }
    },
    [deliv, handleDeterministicPackageFinalization, lessonScope.indices, lessonScope.type, setDownloadedFile],
  );

  const handleAgentAuditPackage = useCallback(
    async ({ selectedFeatureIds = selectedFeatures, lessonFilter = null } = {}) => {
      const featureIds =
        Array.isArray(selectedFeatureIds) && selectedFeatureIds.length > 0 ? selectedFeatureIds : selectedFeatures;
      const requestedScopeIndices =
        Array.isArray(lessonFilter) || lessonFilter === null
          ? lessonFilter
          : lessonScope.type === 'specific'
            ? lessonScope.indices
            : null;
      const finalizerCourseMap = courseMapRef.current;
      const finalizerDeliverables = deliverablesRef.current || {};
      const scopeIndices = remapLessonFilterToMaterializedScope(finalizerCourseMap, requestedScopeIndices);
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
      const auditDeliverables = Object.fromEntries(
        Object.entries(finalizerDeliverables).filter(([featureId]) => featureIds.includes(featureId)),
      );
      const healthReport = generateCourseHealthReport(finalizerCourseMap, auditDeliverables, {
        expectedSessionMinutes,
      });
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
    [columns, expectedSessionMinutes, lessonScope.indices, lessonScope.type, selectedFeatures, slideTheme],
  );

  async function onGenerate() {
    if (packageGenerationInFlightRef.current) return;
    clearSetupRecovery();
    packageGenerationInFlightRef.current = true;
    setPackageGenerationBusy(true);
    try {
      setHasGenerated(true);
      setPackageQualityPass({
        status: 'running',
        phase: 'generation',
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
      setPackageGenerationBusy(false);
    }
  }

  // v0.14.7 WS-F2: one decision to first value. Mirrors FeatureSelect's
  // "Select all" (built-ins minus syllabus when a syllabus file is attached,
  // plus custom deliverables), keeps model/config defaults untouched, then
  // runs the SAME generation path the Config screen's CTA calls.
  function handleQuickStart() {
    // Seed the agent context + the instant lesson-count scan, exactly as the
    // deliberate path does on continue — quick start skips screens, not context.
    setChatHistory((prev) => upsertLandingAgentContextMessages(prev, { promptText, files }));
    const promptRegex = detectExpectedLessons(promptText);
    if (promptRegex.expected) setLessonCount(promptRegex.expected);
    const baseFeatures = hasSyllabusFile ? FEATURES.filter((f) => f.id !== 'syllabus') : FEATURES;
    setSelectedFeatures([...baseFeatures, ...listCustomDeliverables().map(toFeatureEntry)].map((f) => f.id));
    setQuickStartPending(true);
  }

  useEffect(() => {
    if (!quickStartPending) return;
    setQuickStartPending(false);
    // Runs on the render AFTER the select-all commit, so onGenerate's closure
    // sees the full feature selection — never the stale pre-quick-start one.
    onGenerate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quickStartPending]);

  async function onResume() {
    if (packageGenerationInFlightRef.current) return;
    packageGenerationInFlightRef.current = true;
    setPackageGenerationBusy(true);
    try {
      setPackageQualityPass({
        status: 'running',
        phase: 'generation',
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
      setPackageGenerationBusy(false);
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
          await doRestoreSession();
        } else if (startupAction.type === 'openProjectFile') {
          await handleOpenProject(startupAction.file);
        } else if (startupAction.type === 'importCourseMap') {
          await handleImport(startupAction.file);
          setHasGenerated(true);
          setHasSavedSession(false);
          setScreen('workspace');
        } else if (startupAction.type === 'openCloudProject') {
          await handleOpenCloudProject(startupAction.projectId);
        } else if (startupAction.type === 'quickStart') {
          // v0.14.7 WS-F2: the PRIMARY landing (App.jsx) enters the flow
          // here — select-all + defaults + the same onGenerate the Config
          // CTA calls (via the quickStartPending one-render deferral).
          handleQuickStart();
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
          onQuickStart={handleQuickStart}
          canGenerate={
            (files.length > 0 || promptText.trim().length > 0) &&
            (providerIsKeyless || apiKey.trim()) &&
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
  workspaceTabsRef.current = workspaceTabs;
  const mobileWorkspaceViews = [
    // Always "Content": with the Course Map chip selected above, a view tab
    // ALSO labeled "Course Map" stacked two identical labels on screen.
    { id: 'content', label: 'Content' },
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
  // v0.14.4 WS-B1: the build ribbon model — derived from state this
  // component already holds (api-call budget events + lifecycle flags).
  // The tab bar's "Generating 0/9…" counter collapsed into this (WS-B3).
  const ribbonFeatureIds = selectedFeatures.filter((id) => id !== 'courseMap');
  const buildRibbonModel = buildBuildRibbonModel({
    budget: apiCallBudget,
    generation: {
      progressStep: gen.progressStep,
      isStreaming: gen.isStreaming,
      streamDetail: gen.streamDetail,
      streamProgress: gen.streamProgress,
      lessonCount: Array.isArray(courseMap?.lessons) ? courseMap.lessons.length : lessonCount,
      mappedLessonCount: Array.isArray(courseMap?.lessons) ? courseMap.lessons.length : 0,
      isScion: provider === PUBLIC_SCION_PROVIDER_ID,
      scionRuntimeStatus,
    },
    deliverables: {
      isGenerating: deliv.isGenerating,
      doneCount: ribbonFeatureIds.filter((id) => deliv.deliverables?.[id]?.status === 'done').length,
      totalCount: ribbonFeatureIds.length,
    },
    packageQualityPass,
    // v0.14.7 WS-G3: an executing sync owns the ribbon narrative.
    sync: { isSyncing: smartSync.isSyncing, pendingCount: smartSync.pendingSyncCount },
  });
  const packageTrustStatus = getPackageTrustStatus({ packageQualityPass });
  const packageReady = packageTrustStatus.canDownload;
  const workspaceLessonCount = Array.isArray(courseMap?.lessons) ? courseMap.lessons.length : 0;
  const workspaceMappingInProgress = buildRibbonModel?.steps?.some(
    (step) => step.id === 'map' && step.status === 'active',
  );
  const workspaceCourseTitle = resolveWorkspaceCourseTitle({
    courseMapTitle: courseMap?.courseName,
    promptText,
    mappingInProgress: workspaceMappingInProgress,
  });
  const workspaceLessonCountLabel = workspaceMappingInProgress
    ? `${workspaceLessonCount} lesson${workspaceLessonCount === 1 ? '' : 's'} mapped so far`
    : `${workspaceLessonCount} lesson${workspaceLessonCount === 1 ? '' : 's'}`;
  const workspaceSaveText =
    cloudSaveStatus === 'saving'
      ? 'Saving'
      : cloudSaveStatus === 'error'
        ? 'Cloud save failed'
        : localSaveStatus === 'saving'
          ? 'Saving'
          : localSaveStatus === 'error'
            ? 'Local save failed'
            : user
              ? 'Autosaved to My Projects'
              : 'Autosaved locally';
  // Steady-state autosave is not news — a bold pill that never changes reads
  // as an unclickable button. Only saving/error states earn chip treatment;
  // the resting state renders as quiet meta text.
  const workspaceSaveQuiet =
    cloudSaveStatus !== 'error' &&
    localSaveStatus !== 'error' &&
    cloudSaveStatus !== 'saving' &&
    localSaveStatus !== 'saving';
  const workspaceSaveTone =
    cloudSaveStatus === 'error' || localSaveStatus === 'error'
      ? 'border-red-200 bg-red-50 text-red-700'
      : 'border-slate-200 bg-white text-slate-600';
  const workspaceSaveTextTone =
    cloudSaveStatus === 'error' || localSaveStatus === 'error'
      ? 'text-red-600'
      : cloudSaveStatus === 'saving' || localSaveStatus === 'saving'
        ? 'text-slate-500'
        : user
          ? 'text-emerald-600'
          : 'text-slate-500';
  const workspaceModelName =
    provider === PUBLIC_SCION_PROVIDER_ID ? PUBLIC_SCION_MODEL_NAME : gen.activeModelName || modelName;
  const workspaceModelLabel = workspaceModelName || modelId || '';
  const workspaceSaveTitle = user
    ? 'Signed-in projects autosave locally and to My Projects.'
    : 'Anonymous projects autosave only in this browser. Export .coursemapper for a portable backup.';
  const canRunPackageFinalizer =
    Boolean(courseMap) && gen.progressStep === 'done' && typeof handleFinishPackageFromExport === 'function';
  const isPackageGenerationRunning = packageGenerationBusy || gen.isStreaming || deliv.isGenerating;
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
        {/* Cloud save runs silently */}

        <main className="w-full px-4 py-4 sm:px-6 pb-10 space-y-4">
          {/* Top bar */}
          <div
            data-testid="workspace-header"
            className="workspace-header-row rounded-lg border border-slate-200/70 bg-white px-4 py-3 shadow-sm"
          >
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <a href="#/" className="hidden shrink-0 items-center sm:flex" aria-label="EduTool.dev home">
                  <AppLogo className="h-9 w-auto object-contain" />
                </a>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-400">Workspace</p>
                  <h1 className="mt-0.5 max-w-[min(640px,78vw)] line-clamp-2 text-lg font-bold tracking-tight text-slate-950 dark:text-slate-100 sm:line-clamp-1">
                    {workspaceCourseTitle}
                  </h1>
                  <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs font-semibold text-slate-500">
                    {workspaceLessonCount > 0 && <span>{workspaceLessonCountLabel}</span>}
                    {workspaceModelLabel && (
                      <>
                        <span className="text-slate-300">·</span>
                        <span className="truncate">{workspaceModelLabel}</span>
                      </>
                    )}
                    {courseMap && (
                      <>
                        <span className="text-slate-300 md:hidden">·</span>
                        <span className={`${workspaceSaveTextTone} md:hidden`} title={workspaceSaveTitle}>
                          {workspaceSaveText}
                        </span>
                      </>
                    )}
                    {/* v0.14.9 B3: alerts only (stale/failed) — compiled,
                        auto-fixed, and cited-source receipts moved to the
                        digest and finish receipt. */}
                    <PackageTrustStrip
                      deliverables={deliv.deliverables}
                      selectedFeatures={selectedFeatures}
                      packageQualityPass={packageQualityPass}
                    />
                  </div>
                </div>
                {/* v0.14.4 WS-B2: the package grade in the crown — primary
                    placement, immediately right of the title cluster. Click
                    opens the findings modal hosted by ExportSidePanel; on
                    mobile the export view is brought forward first so the
                    modal's subtree is visible. */}
                <Suspense fallback={null}>
                  <WorkspaceQualityChip
                    packageQualityPass={packageQualityPass}
                    onOpenReport={() => {
                      setMobileWorkspaceView('export');
                      setQualityReportOpen(true);
                    }}
                  />
                </Suspense>
              </div>

              <div className="flex min-w-0 flex-wrap items-center gap-2">
                {courseMap && (
                  <span
                    className={
                      workspaceSaveQuiet
                        ? 'hidden text-xs font-medium text-slate-400 md:inline-flex dark:text-slate-500'
                        : `hidden rounded-full border px-3 py-1 text-xs font-bold md:inline-flex ${workspaceSaveTone}`
                    }
                    title={workspaceSaveTitle}
                  >
                    {workspaceSaveText}
                  </span>
                )}
                {/* Active work and blocking review only. Download ZIP has one
                    owner: the export panel. */}
                <PrimaryCta
                  ribbonModel={buildRibbonModel}
                  reviewCount={outstandingReview.counts.headline}
                  canDownload={packageTrustStatus.canDownload}
                  onReview={() => handleReviewQueueOpenChange(true)}
                />
                <DarkModeToggle />
                <UserMenu
                  onOpenProjects={() => setShowProjectPicker(true)}
                  developerMode={developerMode}
                  onDeveloperModeChange={setDeveloperMode}
                  onOpenDeveloperPanel={() => {
                    if (!developerIdeDisabled) setShowDeveloperPanel(true);
                  }}
                  developerIdeDisabled={developerIdeDisabled}
                  developerIdeDisabledReason={developerIdeDisabledReason}
                />
                <details className="relative">
                  <summary
                    data-testid="workspace-more-menu-trigger"
                    aria-label="Project actions"
                    className="tactile flex cursor-pointer list-none items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-50 dark:hover:border-slate-600 [&::-webkit-details-marker]:hidden"
                  >
                    Project
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m19 9-7 7-7-7" />
                    </svg>
                  </summary>
                  <div
                    data-testid="workspace-more-menu"
                    className="absolute left-0 z-30 mt-2 w-56 overflow-hidden rounded-lg border border-slate-200 bg-white p-1.5 shadow-xl shadow-slate-950/10 sm:left-auto sm:right-0"
                  >
                    {/* Project-level actions only. Package export, material
                        creation, and edit history stay with their owning
                        surfaces so this menu does not become a junk drawer. */}
                    {hasGenerated && (
                      <>
                        <button
                          type="button"
                          data-testid="workspace-menu-save-project"
                          onClick={handleSaveProject}
                          className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          Save .coursemapper
                        </button>
                        {extractedKernelCount > 0 && (
                          <button
                            type="button"
                            data-testid="workspace-menu-contribute-kernels"
                            onClick={() => downloadContribution({ appVersion: APP_VERSION })}
                            title="Download kernels."
                            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50"
                          >
                            Contribute {extractedKernelCount} extracted kernel{extractedKernelCount === 1 ? '' : 's'}
                          </button>
                        )}
                        <div className="my-1 border-t border-slate-100" />
                      </>
                    )}
                    <button
                      type="button"
                      data-testid="workspace-menu-new-project"
                      onClick={() => {
                        setNewProjectError('');
                        setNewProjectCloudSaveFailed(false);
                        setNewProjectConfirm(true);
                      }}
                      className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      New Project
                    </button>
                  </div>
                </details>
              </div>
            </div>
          </div>

          {/* v0.14.4 WS-B1: the build ribbon — the single status spine.
              Hidden entirely on a fresh/empty workspace (model is null). */}
          <BuildRibbon model={buildRibbonModel} />

          {/* ── Deliverable tabs ──
              v0.14.9 B3: the old standalone utility row (dependency-map button
              + drag-trash zone) between the ribbon and this bar is gone — the
              dependency-map control folds into the bar's right edge and the
              drag-trash zone floats as a fixed pill during a drag, returning
              a full row of vertical rhythm. */}
          {workspaceTabs.length > 0 && (
            <div className="relative min-w-0">
              <div
                ref={workspaceTabsContainerRef}
                data-testid="workspace-deliverable-tabs"
                onScroll={updateWorkspaceTabScrollCues}
                className="scrollbar-none flex items-center gap-1 overflow-x-auto rounded-lg border border-slate-200/70 bg-white/76 p-1 shadow-sm"
              >
                {workspaceTabs.map((feature, tabIdx) => {
                  const isActive = activeTab === feature.id;
                  const delivState = deliv.deliverables[feature.id];
                  const isDone = delivState?.status === 'done';
                  const isError = delivState?.status === 'error';
                  const hasRepairNeededCoverage = buildRibbonModel?.pipelineChips?.some(
                    (chip) => chip?.id === 'coverage' && chip?.warn,
                  );
                  const isCourseMapDone =
                    feature.id === 'courseMap' &&
                    packageReady &&
                    buildRibbonModel?.stage === 'ready' &&
                    !hasRepairNeededCoverage;

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
                    (smartSync.isSyncing &&
                      (deliv.currentFeatures?.has(feature.id) || lastSyncEntry?.type === 'start'));

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
                        ref={getTabButtonRef(feature.id)}
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
                        aria-pressed={isActive}
                        className={`tactile flex min-h-11 flex-shrink-0 cursor-grab touch-none select-none items-center gap-2 whitespace-nowrap rounded-md px-3 text-xs font-semibold transition-all duration-200 active:cursor-grabbing lg:min-h-0 lg:py-1.5 ${
                          isDraggingThis
                            ? 'opacity-20 scale-95'
                            : isDropTarget
                              ? 'scale-[1.03] -translate-y-0.5 bg-indigo-50 text-indigo-600'
                              : isActive
                                ? 'bg-slate-950 text-white shadow-sm dark:bg-white dark:text-slate-950'
                                : 'text-slate-500 hover:bg-slate-100/80 hover:text-slate-700'
                        }`}
                      >
                        {/* v0.14.4 WS-B3: rainbow status dots removed — build
                          progress lives in the ribbon. Tabs keep only a
                          per-tab ready tick (and a red cross on failure);
                          stale/unseen still use the text suffixes below. */}
                        <TabReadyTick
                          status={
                            feature.id === 'courseMap'
                              ? isCourseMapDone
                                ? 'done'
                                : null
                              : isDone
                                ? 'done'
                                : isError
                                  ? 'error'
                                  : null
                          }
                        />
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

                {/* v0.14.4 WS-B3: the "Generating 0/9…" counter moved into the
                  build ribbon's compile stage label. */}

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
                      className="tactile flex items-center gap-1.5 ml-2 px-3 py-1.5 rounded-pill text-xs font-semibold text-amber-700 bg-amber-50/70 border border-amber-200/60 hover:bg-amber-100 transition-all duration-200 whitespace-nowrap flex-shrink-0"
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

                {/* v0.14.9 B3: the dependency-map control, folded in from its
                  deleted standalone row. ml-auto keeps it at the right edge
                  whenever the tabs leave room. */}
                {workspaceTabs.length > 1 && (
                  <button
                    onClick={() => setShowDepMap(true)}
                    className="tactile ml-auto flex-shrink-0 p-1.5 rounded-full text-slate-400 hover:bg-white/60 hover:text-indigo-500 transition-all duration-200"
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
                )}
              </div>
              {workspaceTabScrollCues.backward && (
                <div className="pointer-events-none absolute inset-y-1 left-1 z-20 flex items-center bg-gradient-to-r from-white via-white/95 to-transparent pr-5 dark:from-slate-950 dark:via-slate-950/95 lg:hidden">
                  <button
                    type="button"
                    data-testid="workspace-materials-previous"
                    onClick={() => scrollWorkspaceTabs(-1)}
                    className="pointer-events-auto tactile flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-md hover:border-indigo-200 hover:text-indigo-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                    aria-label="Show previous materials"
                    title="Show previous materials"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                </div>
              )}
              {workspaceTabScrollCues.forward && (
                <div className="pointer-events-none absolute inset-y-1 right-1 z-20 flex items-center bg-gradient-to-l from-white via-white/95 to-transparent pl-5 dark:from-slate-950 dark:via-slate-950/95 lg:hidden">
                  <button
                    type="button"
                    data-testid="workspace-materials-next"
                    onClick={() => scrollWorkspaceTabs(1)}
                    className="pointer-events-auto tactile flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-md hover:border-indigo-200 hover:text-indigo-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                    aria-label="Show more materials"
                    title="Show more materials"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* v0.14.9 B3: the drag-trash zone — a fixed pill at the top of the
              viewport, only while a tab is being dragged. Drop detection is
              rect-based (trashDropRef), so a fixed element works unchanged. */}
          {tabDrag?.moved &&
            typeof document !== 'undefined' &&
            createPortal(
              <div
                ref={trashDropRef}
                role="button"
                aria-label={
                  canDeleteDraggedTab
                    ? `Drop to remove ${tabDrag.label || 'deliverable'}`
                    : 'Course Map cannot be removed'
                }
                className={`fixed left-1/2 top-4 z-[9999] flex h-10 -translate-x-1/2 items-center justify-center gap-2 rounded-pill border px-5 text-xs font-bold shadow-glass backdrop-blur-xl transition-all duration-150 pointer-events-none ${
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
              </div>,
              document.body,
            )}

          {tabDrag?.moved &&
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
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-indigo-400" />
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
                <div
                  data-testid="new-project-confirmation"
                  className="bg-white rounded-2xl border border-slate-200/60 shadow-2xl p-6 max-w-sm w-full mx-4 animate-spring-scale"
                >
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
                        ? 'My Projects sync did not finish. Your workspace is still open; download a backup before starting over.'
                        : 'We will save a compact project to My Projects before starting over. If saving fails, your workspace stays open.'
                      : 'You are not signed in, so this browser autosave is the only in-app copy. Download a .coursemapper backup if you want to keep it.'}
                  </p>
                  <div className="mb-4 rounded-xl bg-slate-50/80 border border-slate-100 px-3 py-2 text-[10px] text-slate-500 leading-relaxed">
                    {user
                      ? newProjectError
                        ? 'Backup recommended: download a .coursemapper file or continue without sync.'
                        : 'Autosave: browser backup plus My Projects sync.'
                      : 'Autosave: local browser backup only. It is cleared when you start over.'}
                  </div>
                  {newProjectError && (
                    <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-700 leading-relaxed">
                      {newProjectError}
                    </p>
                  )}
                  <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center sm:justify-end">
                    {courseMap && (
                      <button
                        onClick={handleSaveProject}
                        disabled={isStartingNewProject}
                        className="tactile col-span-2 w-full px-4 py-2 rounded-lg text-xs font-semibold text-indigo-600 bg-indigo-50 border border-indigo-100/80 hover:bg-indigo-100 transition-all disabled:opacity-50 sm:col-span-1 sm:w-auto"
                      >
                        Download backup
                      </button>
                    )}
                    <button
                      onClick={() => setNewProjectConfirm(false)}
                      disabled={isStartingNewProject}
                      className="tactile w-full px-4 py-2 rounded-lg text-xs font-semibold text-slate-600 bg-white border border-slate-200/60 hover:bg-slate-50 transition-all sm:w-auto"
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
                      className="tactile w-full px-4 py-2 rounded-lg text-xs font-semibold text-white bg-red-500 hover:bg-red-600 transition-all disabled:opacity-60 disabled:cursor-wait sm:w-auto"
                    >
                      {isStartingNewProject ? (
                        <span className="inline-flex items-center gap-1.5">
                          <Spinner /> Saving
                        </span>
                      ) : newProjectCloudSaveFailed || newProjectError ? (
                        'Start without sync'
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
                className={`min-h-11 flex-1 rounded-xl px-3 text-label font-bold transition-[transform,box-shadow] duration-150 active:scale-[0.98] ${
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
                  viewportRef={viewportRef}
                  currentStep={gen.progressStep}
                  modelName={workspaceModelName}
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
                  onOpenReviewQueue={handleOpenReviewQueueFromObservation}
                  compactReadyMode={packageReady}
                  ribbonModel={buildRibbonModel}
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
                    viewportRef={viewportRef}
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
                    onRegenerateLesson={(lessonIndex, regenerationOptions) => {
                      deliv.regenerateLesson(activeTab, courseMap, lessonIndex, regenerationOptions);
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
                  canFinishPackage={canRunPackageFinalizer}
                  packageQualityPass={packageQualityPass}
                  courseGraph={courseGraph}
                  qualityModalOpen={qualityReportOpen}
                  onQualityModalOpenChange={setQualityReportOpen}
                  isPackageGenerationRunning={isPackageGenerationRunning}
                  preferPackageScope={
                    hasGenerated && selectedFeatures.length > 1 && packageQualityPass?.status !== 'idle'
                  }
                  getPipelineState={getManifestPipelineState}
                  getQualityContext={() => ({
                    budget: apiCallBudgetRef.current || {},
                    digest: lastRunDigestRef.current,
                    expectedSessionMinutes,
                  })}
                  reviewQueue={reviewQueue}
                  reviewProgress={reviewProgress}
                  onReviewMark={handleReviewMark}
                  onReviewMarkAll={handleReviewMarkAll}
                  reviewQueueOpen={Boolean(reviewQueueRequest)}
                  reviewQueueFocusId={reviewQueueRequest?.focusId || null}
                  onExecuteSync={handleExecuteSyncFromQueue}
                  onReviewQueueOpenChange={handleReviewQueueOpenChange}
                />
              </div>
            )}
          </div>
        </main>

        <footer className="w-full px-6 py-4 text-center space-y-1">
          <p className="text-xs text-slate-500">
            Built by{' '}
            <a href="#/contact" className="font-medium hover:text-indigo-500 transition-colors duration-200">
              Tian Xing
            </a>
          </p>
          <div className="flex items-center justify-center gap-3 text-xs text-slate-500">
            <a href="#/changelog" className="font-medium hover:text-indigo-500 transition-colors duration-200">
              v{APP_VERSION}
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
