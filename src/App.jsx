import React, { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import LoadingScreen from './components/LoadingScreen';
import Landing from './screens/Landing';
import { useAuth } from './contexts/AuthContext';
import { useAIConfig } from './contexts/AIConfigContext';
import { useCourse } from './contexts/CourseContext';
import { useUI } from './contexts/UIContext';

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

export default function App() {
  const { user } = useAuth();
  const { screen, setScreen, showProjectPicker, setShowProjectPicker } = useUI();
  const { files, promptText, setPromptText } = useCourse();
  const { provider, apiKey, apiStatus, modelId } = useAIConfig();
  const [flowActive, setFlowActive] = useState(() => screen !== 'landing');
  const [startupAction, setStartupAction] = useState(null);
  const [hasSavedSession, setHasSavedSession] = useState(false);
  const [developerMode, setDeveloperModeState] = useState(readDeveloperMode);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (saved.courseMap) setHasSavedSession(true);
    } catch {
      // Ignore unreadable saved sessions; the dismiss action can clear them.
    }
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
    startFlow({ type: 'continue' }, 'features');
  }, [startFlow]);

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
    setStartupAction(null);
    setFlowActive(false);
    setShowProjectPicker(false);
    setScreen('landing');
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      setHasSavedSession(Boolean(raw && JSON.parse(raw)?.courseMap));
    } catch {
      setHasSavedSession(false);
    }
  }, [setScreen, setShowProjectPicker]);

  const handleDismissSavedSession = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
    setHasSavedSession(false);
  }, []);

  if (flowActive) {
    return (
      <Suspense fallback={<LoadingScreen />}>
        <AppFlow
          startupAction={startupAction}
          onStartupHandled={() => setStartupAction(null)}
          onReturnToLanding={handleReturnToLanding}
        />
      </Suspense>
    );
  }

  return (
    <>
      <Landing
        onGenerate={handleContinue}
        canGenerate={
          (files.length > 0 || promptText.trim().length > 0) &&
          (provider === 'webllm' || apiKey.trim()) &&
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
    </>
  );
}
