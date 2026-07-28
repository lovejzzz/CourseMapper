/**
 * useProjectPersistence — v0.15.3 C1: the save/restore/autosave owner,
 * extracted VERBATIM from AppFlow (diet phase 2; the v0.15.1 roadmap named
 * this hook, v0.15.3 landed it).
 *
 * Owns: the project snapshot builders (full + cloud-compact), the debounced
 * localStorage autosave, the silent cloud autosave, saved-session detection
 * and restore, .coursemapper open/save, cloud project open/save-as-new,
 * new-project teardown, and the developer-template store. AppFlow consumes
 * the returned state and handlers; sibling hooks (gen/deliv/version/rev) and
 * AppFlow-owned setters arrive through the single ctx object.
 *
 * Discipline (same as useReviewQueueOwner/useTabDrag): MOVED, not improved —
 * the four restore paths stay separate on purpose (each has deliberate
 * ordering/flag differences); zero behavior change is the bar, with the
 * battery and scripts/syncEditProof.mjs as the net.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { DEFAULT_COLUMNS } from '../components/ColumnEditor';
import {
  listDeveloperTemplates,
  saveDeveloperTemplate,
  saveDeveloperTemplateFromSnapshot,
  deleteDeveloperTemplate,
  mergeCloudDeveloperTemplates,
} from '../lib/developerTemplates';
import { mergeCloudDeliverables } from '../lib/customDeliverableLibrary';
import { mergeCloudProfile } from '../lib/professorProfile';
import { mergeCloudMemories, mergeCloudAgentPrefs } from '../lib/agentMemory';
import {
  saveProject as cloudSaveProject,
  loadProject as cloudLoadProject,
  loadProjectDeliverables,
  newProjectId,
} from '../lib/cloudStorage';
import { sanitizeMessagesForPersistence } from '../lib/messageSanitizer';
import {
  buildCourseMapRecoveryAutosavePayload,
  buildIndexedDbAutosaveMarker,
  buildLocalAutosavePayload,
} from '../lib/projectAutosave';
import {
  loadProjectIndexedDbAutosave,
  removeProjectIndexedDbAutosave,
  saveProjectIndexedDbAutosave,
} from '../lib/projectIndexedDbAutosave';
import { runAutosaveWithRetry, settleLatestAutosaveAttempt } from '../lib/autosaveAttemptState';
import { prepareProjectSnapshotForRestore, sanitizeProjectSnapshot } from '../lib/projectSnapshotSanitizer';
import { restorePersistedPackageEvidence, selectPersistablePackageEvidence } from '../lib/packageQualityPersistence';
import { compileCompactProjectDeliverables } from '../lib/projectRestoreCompiler';
import { warn, error as logError } from '../lib/logger';

export const STORAGE_KEY = 'coursemapper-project';
export const CLOUD_PROJECT_FORMAT = 'coursemapper-blueprint-v1';

export default function useProjectPersistence({
  user,
  screen,
  setScreen,
  onReturnToLanding,
  // course state
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
  expectedSessionMinutes,
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
  // AI config
  provider,
  modelId,
  modelName,
  restoreProjectAIConfig,
  getApiCallBudgetReceipt,
  restoreApiCallBudgetReceipt,
  // sibling hooks
  gen,
  deliv,
  rev,
  version,
  resetExport,
}) {
  const [hasSavedSession, setHasSavedSession] = useState(false);
  // Set on every restore path; intentionally write-only today (kept verbatim
  // from AppFlow so restore semantics stay byte-identical).
  const [, setRestoredSession] = useState(false);
  const [projectId, setProjectId] = useState(null); // Firestore project doc ID
  const projectIdRef = useRef(null); // Ref mirror to prevent race conditions in auto-save
  const [localSaveStatus, setLocalSaveStatus] = useState('idle'); // 'idle' | 'saving' | 'saved' | 'error'
  const [cloudSaveStatus, setCloudSaveStatus] = useState('idle'); // 'idle' | 'saving' | 'saved' | 'error'
  const cloudSaveTimerRef = useRef(null);
  const cloudStatusTimerRef = useRef(null);
  const localStatusTimerRef = useRef(null);
  const saveTimerRef = useRef(null);
  const indexedDbSaveQueueRef = useRef(Promise.resolve());
  const localSaveAttemptIdRef = useRef(0);
  const [isStartingNewProject, setIsStartingNewProject] = useState(false);
  const [newProjectError, setNewProjectError] = useState('');
  const [newProjectCloudSaveFailed, setNewProjectCloudSaveFailed] = useState(false);
  const [developerTemplates, setDeveloperTemplates] = useState(() => listDeveloperTemplates());
  const [activeDeveloperTemplateId, setActiveDeveloperTemplateId] = useState(() => {
    try {
      return localStorage.getItem('coursemapper-active-developer-template') || '';
    } catch {
      return '';
    }
  });

  const restorePackageEvidence = useCallback(
    (snapshot) => {
      const restored = restorePersistedPackageEvidence(snapshot);
      setPackageQualityPass(restored.packageQualityPass);
      setLastRunDigest(restored.lastRunDigest);
    },
    [setLastRunDigest, setPackageQualityPass],
  );

  useEffect(() => {
    try {
      if (activeDeveloperTemplateId)
        localStorage.setItem('coursemapper-active-developer-template', activeDeveloperTemplateId);
      else localStorage.removeItem('coursemapper-active-developer-template');
    } catch {}
  }, [activeDeveloperTemplateId]);

  // ── Shared project snapshot builder (used by localStorage, cloud save, and file export) ──
  const buildProjectSnapshot = useCallback(
    (extra = {}) => {
      const safeCourseMap =
        courseMap && typeof courseMap === 'object' && Array.isArray(courseMap.lessons) ? courseMap : { lessons: [] };
      const packageEvidence = selectPersistablePackageEvidence({
        packageQualityPass,
        lastRunDigest,
      });
      return sanitizeProjectSnapshot({
        // v0.13 formatVersion 2: the CourseGraph rides along as the source
        // of truth; v1 projects (no graph) derive one on restore.
        formatVersion: 2,
        courseMap: safeCourseMap,
        ...(courseGraph
          ? {
              courseGraph: {
                ...courseGraph,
                enrichmentOverlay: courseGraph.enrichmentOverlay || deliv.enrichmentOverlay,
              },
            }
          : {}),
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
        generationConstraints: {
          sessionMinutes: expectedSessionMinutes,
          sessionMinutesSource: deliverableConfig?.lessonPlans?.sessionLength
            ? 'deliverable-config'
            : 'resolved-generation-default',
        },
        activeTab,
        deliverables: deliv.deliverables,
        slideTheme,
        apiCallBudgetReceipt: getApiCallBudgetReceipt?.(),
        ...packageEvidence,
        savedAt: Date.now(),
        ...extra,
      });
    },
    [
      courseMap,
      courseGraph,
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
      expectedSessionMinutes,
      packageQualityPass,
      lastRunDigest,
      activeTab,
      deliv.deliverables,
      slideTheme,
      getApiCallBudgetReceipt,
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

      // v0.13.1: Firestore rejects nested arrays anywhere in a document and
      // the graph's enrichment overlay embeds model-shaped payloads we don't
      // fully control — the cloud copy of the graph travels as a JSON string.
      // prepareProjectSnapshotForRestore parses it back on open.
      const {
        courseGraph: snapshotCourseGraph,
        packageQualityPass: _packageQualityPass,
        lastRunDigest: _lastRunDigest,
        ...cloudSnapshot
      } = snapshot;
      return {
        ...cloudSnapshot,
        ...(snapshotCourseGraph ? { courseGraphJson: JSON.stringify(snapshotCourseGraph) } : {}),
        cloudProjectFormat: CLOUD_PROJECT_FORMAT,
        deliverableSaveMode: 'recompile-on-open',
        deliverableFeatureIds,
        deliverableManifest,
        deliverables: {},
      };
    },
    [buildProjectSnapshot],
  );

  useEffect(() => {
    if (!import.meta.env?.DEV || typeof window === 'undefined') return undefined;
    if (!hasGenerated || !courseMap) {
      delete window.__COURSEMAPPER_WORKSPACE_SNAPSHOT__;
      return undefined;
    }
    window.__COURSEMAPPER_WORKSPACE_SNAPSHOT__ = buildProjectSnapshot({
      projectId: projectIdRef.current,
      snapshotSource: 'dev-real-browser-harness',
    });
    return undefined;
  }, [buildProjectSnapshot, courseMap, hasGenerated]);

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
      adoptCourseGraph(restored);
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
      restoreApiCallBudgetReceipt?.(restored.apiCallBudgetReceipt);
      restorePackageEvidence(restored);
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
      adoptCourseGraph,
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
      restoreApiCallBudgetReceipt,
      restorePackageEvidence,
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

  useEffect(() => {
    if (screen !== 'features' || !activeDeveloperTemplateId) return;
    if (!developerTemplates.some((template) => template.id === activeDeveloperTemplateId)) return;
    applyDeveloperTemplate(activeDeveloperTemplateId);
  }, [screen, activeDeveloperTemplateId, developerTemplates, applyDeveloperTemplate]);

  const saveLocalProjectSnapshot = useCallback(
    (extra = {}) => {
      if (!hasGenerated || !courseMap) return false;
      const saveAttemptId = ++localSaveAttemptIdRef.current;
      clearTimeout(localStatusTimerRef.current);
      setLocalSaveStatus('saving');
      const settleLocalSaveAttempt = (status, idleDelay) => {
        const settled = settleLatestAutosaveAttempt(
          saveAttemptId,
          localSaveAttemptIdRef.current,
          status,
          setLocalSaveStatus,
        );
        if (!settled) return false;
        clearTimeout(localStatusTimerRef.current);
        localStatusTimerRef.current = setTimeout(() => {
          settleLatestAutosaveAttempt(saveAttemptId, localSaveAttemptIdRef.current, 'idle', setLocalSaveStatus);
        }, idleDelay);
        return true;
      };
      const fullSnapshot = buildProjectSnapshot(extra);
      const compactSnapshot = buildCloudProjectSnapshot({
        ...extra,
        localSaveMode: 'compact-autosave',
      });
      try {
        const { mode, payload } = buildLocalAutosavePayload({
          fullSnapshot,
          compactSnapshot,
        });
        if (mode === 'compact') {
          // A compact snapshot intentionally omits the generated package and
          // its completed quality evidence. Keep the exact workspace in
          // IndexedDB instead, and leave only a tiny synchronous resume marker
          // in localStorage. Recompiling on refresh can drift from the package
          // the user actually reviewed and can turn a green workspace back
          // into a long repair run.
          indexedDbSaveQueueRef.current = indexedDbSaveQueueRef.current
            .catch(() => {})
            .then(async () => {
              const { persistOversizedProjectSnapshot } = await import('../lib/projectExactAutosave');
              await runAutosaveWithRetry(() =>
                persistOversizedProjectSnapshot({
                  fullSnapshot,
                  compactSnapshot,
                  compactPayload: payload,
                }),
              );
              settleLocalSaveAttempt('saved', 3000);
            })
            .catch((autosaveError) => {
              warn('Save failed:', autosaveError);
              settleLocalSaveAttempt('error', 5000);
            });
          return true;
        }
        localStorage.setItem(STORAGE_KEY, payload);
        settleLocalSaveAttempt('saved', 3000);
        return true;
      } catch (e) {
        // localStorage is an origin-wide ~5 MB bucket shared with caches and
        // conversations. Preserve the exact project in IndexedDB rather than
        // deleting unrelated user data or showing a false terminal failure.
        indexedDbSaveQueueRef.current = indexedDbSaveQueueRef.current
          .catch(() => {})
          .then(async () => {
            const exactPayload = JSON.stringify(fullSnapshot);
            await runAutosaveWithRetry(() => saveProjectIndexedDbAutosave(exactPayload));
            try {
              localStorage.removeItem(STORAGE_KEY);
              localStorage.setItem(STORAGE_KEY, buildIndexedDbAutosaveMarker(fullSnapshot));
            } catch {
              // IndexedDB remains the source of truth even if an unusually
              // saturated origin cannot accept the small resume pointer.
            }
            settleLocalSaveAttempt('saved', 3000);
          })
          .catch(async (indexedDbError) => {
            // Older/private browsers can disable IndexedDB. Keep the former
            // course-map-only recovery belt as the last available option.
            try {
              localStorage.removeItem(STORAGE_KEY);
              localStorage.setItem(STORAGE_KEY, buildCourseMapRecoveryAutosavePayload(compactSnapshot));
              settleLocalSaveAttempt('saved', 3000);
            } catch (fallbackError) {
              warn('Save failed:', fallbackError, indexedDbError);
              settleLocalSaveAttempt('error', 5000);
            }
          });
        return true;
      }
    },
    [buildCloudProjectSnapshot, buildProjectSnapshot, courseMap, hasGenerated],
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
    let cancelled = false;
    async function detectSavedSession() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const saved = prepareProjectSnapshotForRestore(JSON.parse(raw));
          if (saved.courseMap && !cancelled) setHasSavedSession(true);
          return;
        }
        const indexedDbPayload = await loadProjectIndexedDbAutosave();
        if (!indexedDbPayload || cancelled) return;
        const saved = prepareProjectSnapshotForRestore(JSON.parse(indexedDbPayload));
        if (saved.courseMap) setHasSavedSession(true);
      } catch {}
    }
    detectSavedSession();
    return () => {
      cancelled = true;
    };
    // Intentionally runs only on mount: checks localStorage once for a saved session.
    // STORAGE_KEY and setHasSavedSession are stable (constant / useState setter) so
    // omitting them from deps is safe and avoids misleading the reader.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Restore saved session ──
  async function doRestoreSession() {
    try {
      let raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const marker = JSON.parse(raw);
        if (marker?.indexedDbAutosave) raw = await loadProjectIndexedDbAutosave();
      } else {
        raw = await loadProjectIndexedDbAutosave();
      }
      if (!raw) return;
      const saved = prepareProjectSnapshotForRestore(JSON.parse(raw));
      if (!saved.courseMap) return;
      const restoredDeliverables = await compileCompactProjectDeliverables(saved);
      setCourseMap(saved.courseMap);
      // v0.13: every restored project becomes graph-backed.
      adoptCourseGraph(saved);
      setColumns(saved.columns || [...DEFAULT_COLUMNS]);
      setHasGenerated(true);
      restoreProjectAIConfig(saved, { providerFallback: 'openai' });
      restoreApiCallBudgetReceipt?.(saved.apiCallBudgetReceipt);
      restorePackageEvidence(saved);
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
      if (restoredDeliverables && Object.keys(restoredDeliverables).length > 0) {
        deliv.restoreDeliverables(restoredDeliverables);
      } else if (saved.deliverables) {
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

  async function handleOpenProject(file) {
    try {
      // .coursemapper files are full JSON project snapshots — restore everything
      if (file.name.endsWith('.coursemapper')) {
        const text = await file.text();
        const saved = prepareProjectSnapshotForRestore(JSON.parse(text));
        if (!saved.courseMap) throw new Error('Invalid .coursemapper file');
        restoreProjectAIConfig(saved);
        restoreApiCallBudgetReceipt?.(saved.apiCallBudgetReceipt);
        restorePackageEvidence(saved);
        setCourseMap(saved.courseMap);
        adoptCourseGraph(saved);
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
      // Legacy: xlsx/csv course map import (lazy — rare path, v0.15.3 C1)
      const { importCourseMap } = await import('../lib/importCourseMap');
      const imported = await importCourseMap(file);
      setCourseMap(imported);
      setOldCourseMap(null);
      setUserEdits([]);
      version.pushVersion(imported, `Opened ${file.name}`);
      restorePackageEvidence({});
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
      const blob = new Blob([JSON.stringify(state, null, 2)], {
        type: 'application/json',
      });
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
          : await compileCompactProjectDeliverables(saved);
      // Restore all state — same as doRestoreSession but from cloud
      setCourseMap(saved.courseMap);
      adoptCourseGraph(saved);
      setColumns(saved.columns || [...DEFAULT_COLUMNS]);
      setHasGenerated(true);
      restoreProjectAIConfig(saved, { providerFallback: 'openai' });
      restoreApiCallBudgetReceipt?.(saved.apiCallBudgetReceipt);
      restorePackageEvidence(saved);
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
    localSaveAttemptIdRef.current += 1;
    // 3. Remove persisted data before resetting state
    //    (prevents save-effects from re-writing stale data)
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
    indexedDbSaveQueueRef.current = indexedDbSaveQueueRef.current
      .catch(() => {})
      .then(() => removeProjectIndexedDbAutosave())
      .catch(() => {});
    // 4. Reset all state
    gen.resetGeneration();
    rev.resetRevision();
    version.resetHistory();
    resetExport();
    deliv.resetDeliverables();
    setCourseMap(null);
    setCourseGraph(null);
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
    restoreApiCallBudgetReceipt?.(null);
    restorePackageEvidence({});
    setScreen('landing');
    onReturnToLanding?.();
  }

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

  return {
    // state
    hasSavedSession,
    setHasSavedSession,
    projectId,
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
    setActiveDeveloperTemplateId,
    // snapshots + saves
    buildProjectSnapshot,
    buildCloudProjectSnapshot,
    saveLocalProjectSnapshot,
    handleSaveProject,
    handleSaveCurrentAsNew,
    // restores + opens
    doRestoreSession,
    handleOpenProject,
    handleOpenCloudProject,
    // developer templates
    applyDeveloperSnapshot,
    saveDeveloperTemplateFromPanel,
    renameDeveloperTemplate,
    duplicateDeveloperTemplate,
    removeDeveloperTemplate,
    applyDeveloperTemplate,
    // teardown
    handleNewProject,
    handleConfirmNewProject,
    handleStartNewProjectWithoutCloudSave,
  };
}
