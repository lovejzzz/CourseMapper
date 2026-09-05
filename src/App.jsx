import React, { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import LoadingScreen from './components/LoadingScreen';
import ScionRuntimeStatusBanner from './components/ScionRuntimeStatusBanner';
import { useAuth } from './contexts/AuthContext';
import { useAIConfig } from './contexts/AIConfigContext';
import { useCourse } from './contexts/CourseContext';
import { useUI } from './contexts/UIContext';
import { PUBLIC_SCION_PROVIDER_ID } from './lib/publicScionIdentity';
import { loadProjectIndexedDbAutosave, removeProjectIndexedDbAutosave } from './lib/projectIndexedDbAutosave';
import { clearSetupRecovery, readSetupRecovery, stageSetupRecovery } from './lib/setupRecovery';
import useScionRuntimeStatus from './hooks/useScionRuntimeStatus';

const Landing = lazy(() => import('./screens/Landing'));
const AppFlow = lazy(() => import('./AppFlow'));
const ProjectPicker = lazy(() => import('./components/ProjectPicker'));

const STORAGE_KEY = 'coursemapper-project';

function readDeveloperMode() {
  try {
    return localStorage.getItem('coursemapper-developer-mode') === 'true';
  } catch {
    return false;
  }
}

async function hasResumableLocalProject() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw && JSON.parse(raw)?.courseMap) return true;
  } catch {
    // A malformed or unavailable localStorage entry must not hide the exact
    // IndexedDB snapshot that the persistence layer can still restore.
  }

  try {
    const raw = await loadProjectIndexedDbAutosave();
    return Boolean(raw && JSON.parse(raw)?.courseMap);
  } catch {
    return false;
  }
}

export default function App() {
  const { user } = useAuth();
  const { screen, setScreen, showProjectPicker, setShowProjectPicker } = useUI();
  const { files, promptText, setPromptText, resetGeneratedProjectState } = useCourse();
  const { provider, apiKey, apiStatus, modelId } = useAIConfig();
  const scionEnabled = provider === PUBLIC_SCION_PROVIDER_ID;
  const scionRuntimeStatus = useScionRuntimeStatus(scionEnabled);
  const providerIsKeyless = provider === 'local' || provider === PUBLIC_SCION_PROVIDER_ID;
  const [setupRecovery] = useState(readSetupRecovery);
  const canResumeRecoveredSetup = Boolean(setupRecovery && !setupRecovery.hadAttachments);
  const [flowActive, setFlowActive] = useState(() => screen !== 'landing' || canResumeRecoveredSetup);
  const [startupAction, setStartupAction] = useState(() =>
    canResumeRecoveredSetup ? { ...setupRecovery.action, recoveredAt: Date.now() } : null,
  );
  const [hasSavedSession, setHasSavedSession] = useState(false);
  const [developerMode, setDeveloperModeState] = useState(readDeveloperMode);

  const showScionRuntimeBanner = scionEnabled && (!flowActive || screen !== 'workspace');

  useEffect(() => {
    let cancelled = false;
    hasResumableLocalProject().then((resumable) => {
      if (!cancelled) setHasSavedSession(resumable);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const setDeveloperMode = useCallback((nextValue) => {
    setDeveloperModeState((previous) => {
      const resolved = typeof nextValue === 'function' ? nextValue(previous) : nextValue;
      try {
        localStorage.setItem('coursemapper-developer-mode', resolved ? 'true' : 'false');
      } catch {}
      return resolved;
    });
  }, []);

  const startFlow = useCallback(
    (action, targetScreen) => {
      setStartupAction({ ...action, startedAt: Date.now() });
      if (targetScreen) setScreen(targetScreen);
      setFlowActive(true);
    },
    [setScreen],
  );

  const handleContinue = useCallback(() => {
    stageSetupRecovery({ promptText, files, action: { type: 'continue' } });
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
    removeProjectIndexedDbAutosave().catch(() => {});
    setHasSavedSession(false);
    resetGeneratedProjectState();
    startFlow({ type: 'continue' }, 'features');
  }, [files, promptText, resetGeneratedProjectState, startFlow]);

  // v0.14.7 WS-F2: quick start from the primary landing — one decision to
  // first value. promptText/files live in shared context, so the flow reads
  // them after mount; the action just names the intent.
  const handleQuickStart = useCallback(
    (options = {}) => {
      const action = {
        type: 'quickStart',
        ...(options?.scionResearchEnabled === true ? { scionResearchEnabled: true } : {}),
      };
      stageSetupRecovery({ promptText, files, action });
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {}
      removeProjectIndexedDbAutosave().catch(() => {});
      setHasSavedSession(false);
      resetGeneratedProjectState();
      startFlow(action);
    },
    [files, promptText, resetGeneratedProjectState, startFlow],
  );

  const handleRestoreSession = useCallback(() => {
    startFlow({ type: 'restore' });
  }, [startFlow]);

  const handleOpenProjectFile = useCallback(
    (file) => {
      startFlow({ type: 'openProjectFile', file });
    },
    [startFlow],
  );

  const handleImportCourseMap = useCallback(
    (file) => {
      startFlow({ type: 'importCourseMap', file });
    },
    [startFlow],
  );

  const handleOpenCloudProject = useCallback(
    async (projectId) => {
      setShowProjectPicker(false);
      startFlow({ type: 'openCloudProject', projectId });
    },
    [setShowProjectPicker, startFlow],
  );

  const handleReturnToLanding = useCallback(() => {
    clearSetupRecovery();
    setStartupAction(null);
    setFlowActive(false);
    setShowProjectPicker(false);
    setScreen('landing');
    setHasSavedSession(false);
    hasResumableLocalProject().then(setHasSavedSession);
  }, [setScreen, setShowProjectPicker]);

  const handleDismissSavedSession = useCallback(() => {
    clearSetupRecovery();
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
    removeProjectIndexedDbAutosave().catch(() => {});
    resetGeneratedProjectState();
    setHasSavedSession(false);
  }, [resetGeneratedProjectState]);

  if (flowActive) {
    return (
      <>
        <Suspense fallback={<LoadingScreen />}>
          <AppFlow
            startupAction={startupAction}
            onStartupHandled={() => setStartupAction(null)}
            onReturnToLanding={handleReturnToLanding}
            scionRuntimeStatus={scionRuntimeStatus}
          />
        </Suspense>
        <ScionRuntimeStatusBanner enabled={showScionRuntimeBanner} status={scionRuntimeStatus} />
      </>
    );
  }

  return (
    <>
      <Suspense fallback={<LoadingScreen />}>
        <Landing
          onGenerate={handleContinue}
          onQuickStart={handleQuickStart}
          setupRecoveryNotice={setupRecovery?.hadAttachments ? setupRecovery : null}
          canGenerate={
            (files.length > 0 || promptText.trim().length > 0) &&
            (providerIsKeyless || apiKey.trim()) &&
            !!modelId &&
            apiStatus === 'connected'
          }
          isGenerating={false}
          hasSavedSession={hasSavedSession}
          onRestoreSession={handleRestoreSession}
          onDismissSavedSession={handleDismissSavedSession}
          onImportCourseMap={handleImportCourseMap}
          onOpenProject={handleOpenProjectFile}
          onExampleSelect={(text) => setPromptText(text)}
          onOpenProjects={user ? () => setShowProjectPicker(true) : undefined}
          developerMode={developerMode}
          onDeveloperModeChange={setDeveloperMode}
        />
      </Suspense>

      {showProjectPicker && (
        <Suspense fallback={null}>
          <ProjectPicker
            isOpen={showProjectPicker}
            onClose={() => setShowProjectPicker(false)}
            onOpenProject={handleOpenCloudProject}
            onSaveCurrentAsNew={null}
            onDeleteProject={(_deletedId, remainingCount) => {
              if (remainingCount === 0) {
                handleDismissSavedSession();
              }
            }}
          />
        </Suspense>
      )}
      <ScionRuntimeStatusBanner enabled={showScionRuntimeBanner} status={scionRuntimeStatus} />
    </>
  );
}
