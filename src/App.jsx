import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import Header from './components/Header';
import { DEFAULT_COLUMNS } from './components/ColumnEditor';
import CourseMapPreview from './components/CourseMapPreview';
import ChatPanel from './components/chat/ChatPanel';
import ResizeHandle from './components/chat/ResizeHandle';
import ErrorBoundary from './components/ErrorBoundary';
import Landing from './screens/Landing';
import FeatureSelect from './screens/FeatureSelect';
import Config from './screens/Config';
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
import { FEATURES, CustomDeliverableBuilder } from './screens/FeatureSelect';
import { listCustomDeliverables, toFeatureEntry, saveCustomDeliverable, mergeCloudDeliverables } from './lib/customDeliverableLibrary';
import { mergeCloudProfile } from './lib/professorProfile';
import { mergeCloudMemories, mergeCloudAgentPrefs } from './lib/agentMemory';
import { useAuth } from './contexts/AuthContext';
// HelpDrawer removed — merged into ChatPanel
import { saveProject as cloudSaveProject, loadProject as cloudLoadProject, loadProjectDeliverables, newProjectId } from './lib/cloudStorage';
import ProjectPicker from './components/ProjectPicker';
import DeliverableView from './components/DeliverableView';
import ExportSidePanel from './components/ExportSidePanel';
import AIContextMenu from './components/AIContextMenu';
import ReadingLevelControl from './components/ReadingLevelControl';
import { requestNotificationPermission } from './lib/notifyDone';
import { importCourseMap } from './lib/importCourseMap';
import { parseFiles } from './lib/fileParser';
import { detectExpectedLessons, detectLessonsWithAI } from './lib/detectLessons';

const STORAGE_KEY = 'coursemapper-project';

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

  const builtIn = unselected.filter(f => !f.isCustom);
  const custom = unselected.filter(f => f.isCustom);

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
      {showAddDeliverable && createPortal(
        <>
          <div className="fixed inset-0 z-[9998]" onClick={() => setShowAddDeliverable(false)} />
          <div
            className="fixed z-[9999] bg-white/95 backdrop-blur-xl rounded-xl border border-slate-200/60 shadow-xl p-2 min-w-[220px] max-h-[70vh] overflow-y-auto animate-spring-in"
            style={{ top: dropPos.top, left: dropPos.left }}
          >
            {builtIn.length > 0 && (
              <>
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider px-2 pt-1 pb-1.5">Add Deliverable</p>
                {builtIn.map(feature => (
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
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider px-2 pt-1 pb-1.5">Your Custom</p>
                {custom.map(feature => (
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
              onClick={() => { setShowAddDeliverable(false); onCreateCustom(); }}
              className="w-full text-left px-2 py-2 rounded-lg text-[11px] font-medium text-indigo-500 hover:bg-indigo-50 hover:text-indigo-700 transition-colors flex items-center gap-1.5"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Create Custom...
            </button>
          </div>
        </>,
        document.body
      )}
    </div>
  );
}

// Screens: 'landing' | 'features' | 'config' | 'workspace'

export default function App() {
  useEffect(() => { requestNotificationPermission(); }, []);

  // ── Screen flow ──
  const [screen, setScreen] = useState('landing');
  const [selectedFeatures, setSelectedFeatures] = useState(['courseMap']);
  const [promptText, setPromptText] = useState('');
  const [hasSavedSession, setHasSavedSession] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [chatWidth, setChatWidth] = useState(() => {
    try { return parseInt(localStorage.getItem('coursemapper-chat-width')) || 360; } catch { return 360; }
  });
  const [lessonScope, setLessonScope] = useState({ type: 'all' });
  const [deliverableConfig, setDeliverableConfig] = useState({});
  const [slideTheme, setSlideTheme] = useState(null); // null = auto-rotate, 0-4 = specific theme

  // ── Model & File Config ──
  const [provider, setProvider] = useState('anthropic');
  const [apiKey, setApiKey] = useState(() => {
    try { return localStorage.getItem('coursemapper-apikey') || ''; } catch { return ''; }
  });
  const [apiStatus, setApiStatus] = useState('idle');
  const [modelName, setModelName] = useState('');
  const [modelId, setModelId] = useState('');
  const [availableModels, setAvailableModels] = useState([]);
  const [maxOutputTokens, setMaxOutputTokens] = useState(16384);
  const [files, setFiles] = useState([]);
  const [columns, setColumns] = useState([...DEFAULT_COLUMNS]);

  // ── Core Course Map State ──
  const [courseMap, setCourseMap] = useState(null);
  const [oldCourseMap, setOldCourseMap] = useState(null);
  const [userEdits, setUserEdits] = useState([]);
  const [hasGenerated, setHasGenerated] = useState(false);
  const [showDiff, setShowDiff] = useState(false);
  const [restoredSession, setRestoredSession] = useState(false);
  const [chatHistory, setChatHistory] = useState([]);

  // ── Workspace tab ──
  const [activeTab, setActiveTab] = useState('courseMap');
  // + tab popover
  const [showAddDeliverable, setShowAddDeliverable] = useState(false);
  // Custom deliverable builder modal (from workspace + Add)
  const [showCustomBuilder, setShowCustomBuilder] = useState(false);
  // Drag-to-reorder tabs
  const [dragTabIdx, setDragTabIdx] = useState(null);
  // Add-lessons modal state: { lessonIndices: number[], mode: null|'asking' }
  const [addLessonsModal, setAddLessonsModal] = useState(null);
  // New Project confirmation modal
  const [newProjectConfirm, setNewProjectConfirm] = useState(false);

  // ── Cloud ──
  const { user } = useAuth();
  const [projectId, setProjectId] = useState(null); // Firestore project doc ID
  const projectIdRef = useRef(null); // Ref mirror to prevent race conditions in auto-save
  const [showProjectPicker, setShowProjectPicker] = useState(false);
  const [cloudSaveStatus, setCloudSaveStatus] = useState('idle'); // 'idle' | 'saving' | 'saved' | 'error'
  const cloudSaveTimerRef = useRef(null);
  const cloudStatusTimerRef = useRef(null);

  // ── Misc ──
  const [downloadedFile, setDownloadedFile] = useState('');
  const saveTimerRef = useRef(null);
  const addMaterialInputRef = useRef(null);

  // ── AI Context Menu (inline AI editing) ──
  const chatSendRef = useRef(null);
  const [aiContextMenu, setAiContextMenu] = useState(null); // { position: {x,y}, target: {...} }
  const handleAIContextMenu = useCallback((e, target) => {
    e.preventDefault();
    setAiContextMenu({ position: { x: e.clientX, y: e.clientY }, target });
  }, []);
  const closeAIContextMenu = useCallback(() => setAiContextMenu(null), []);
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

  // ── Cascade sync ──
  // Track which tabs have unseen changes (show amber * badge)
  const [unseenChanges, setUnseenChanges] = useState(new Set());
  // Always-fresh ref to courseMap for useSmartSync (avoids stale closure)
  const courseMapRef = useRef(courseMap);
  useEffect(() => { courseMapRef.current = courseMap; }, [courseMap]);
  // Always-fresh ref to deliverables for onRequestProposal callback
  const deliverablesRef = useRef(null);

  const version = useVersionHistory(setCourseMap, setDownloadedFile);

  const gen = useGeneration({
    provider, modelId, apiKey, maxOutputTokens, files, columns,
    setCourseMap, setOldCourseMap,
    pushVersion: version.pushVersion,
    userEdits, setUserEdits,
    promptText,
    pedagogicalMode: 'lecture', // Feature 4.2 — wired for when mode selector UI is added
    lessonScope: lessonScope.type === 'specific' ? lessonScope.indices : null,
    courseMapConfig: deliverableConfig['courseMap'],
  });

  const {
    handleDownload, resetExport,
  } = useExport(courseMap, columns, gen.setError);

  const rev = useRevision({
    provider, modelId, apiKey, maxOutputTokens,
    courseMap, setCourseMap, setOldCourseMap,
    pushVersion: version.pushVersion,
    userEdits, setUserEdits,
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
    provider, modelId, apiKey, maxOutputTokens,
    deliverableConfig,
    lockedLessons: lessonScope.type === 'specific' ? lessonScope.indices : null,
    pedagogicalMode: 'lecture',
    examChanges: gen.examChanges,
    columns,
  });
  // Keep deliverables ref fresh for use in stable callbacks
  deliverablesRef.current = deliv.deliverables;

  // ── Edit-Aware AI Proposal Engine ──
  const editProposal = useEditProposal({
    provider, modelId, apiKey, maxOutputTokens,
    deliverableConfig,
    pedagogicalMode: 'lecture',
    columns,
  });

  // ── Deliverable Undo/Redo ──
  const delivUndo = useDeliverableUndo();

  // ── Agent action highlight (green ring on affected lesson card) ──
  const [agentHighlight, setAgentHighlight] = useState(null);
  const agentHighlightTimerRef = useRef(null);
  const triggerAgentHighlight = useCallback((featureId, lessonIndex) => {
    if (agentHighlightTimerRef.current) clearTimeout(agentHighlightTimerRef.current);
    setAgentHighlight({ featureId, lessonIndex });
    agentHighlightTimerRef.current = setTimeout(() => setAgentHighlight(null), 5000);
  }, []);

  // ── Cascade Sync Engine ──
  const smartSync = useSmartSync({
    deliv,
    gen,
    courseMapRef,
    selectedFeatures,
    onSyncComplete: useCallback((featureIds) => {
      setUnseenChanges(prev => {
        const next = new Set(prev);
        featureIds.forEach(id => next.add(id));
        return next;
      });
    }, []),
    onRequestProposal: useCallback(({ featureId, lessonIndex, editContext, courseMap: cm }) => {
      // Use deliverablesRef so this callback stays stable and never reads stale data
      editProposal.proposeLesson(
        featureId, cm, lessonIndex, editContext,
        deliverablesRef.current?.[featureId]?.data,
      );
    }, [editProposal.proposeLesson]),
  });

  // Wire editor with smartSync notifyEdit
  const editor = useCourseMapEditor({
    courseMap, setCourseMap, columns,
    setDownloadedFile, setUserEdits,
    pushVersion: version.pushVersion,
    onEdit: smartSync.notifyEdit,
    deliverables: deliv.deliverables,
    optimisticUpdate: deliv.optimisticUpdate,
  });

  // ── Persist API key ──
  useEffect(() => {
    try {
      if (apiKey) localStorage.setItem('coursemapper-apikey', apiKey);
      else localStorage.removeItem('coursemapper-apikey');
    } catch { }
  }, [apiKey]);

  // ── Save to localStorage (debounced) ──
  useEffect(() => {
    if (!hasGenerated || !courseMap) return;
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      try {
        const state = {
          courseMap, columns, hasGenerated: true,
          provider, modelId, modelName, userEdits,
          chatHistory: chatHistory.slice(-50),
          fileNames: files.map(f => f.name),
          versionHistory: version.versionHistory.slice(-30),
          selectedFeatures, lessonScope, promptText, activeTab,
          deliverables: deliv.deliverables,
          slideTheme,
          savedAt: Date.now(),
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch (e) { console.warn('Save failed:', e); }
    }, 1000);
    return () => clearTimeout(saveTimerRef.current);
  }, [courseMap, columns, hasGenerated, provider, modelId, modelName, userEdits, chatHistory, version.versionHistory, selectedFeatures, lessonScope, promptText, activeTab, deliv.deliverables, slideTheme]);

  // Keep projectId ref in sync to avoid race conditions
  useEffect(() => { projectIdRef.current = projectId; }, [projectId]);

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
        const state = {
          courseName: courseMap?.courseName || 'Untitled',
          semester: courseMap?.semester || '',
          courseMap, columns, hasGenerated: true,
          provider, modelId, modelName, userEdits,
          chatHistory: chatHistory.slice(-50),
          fileNames: files.map(f => f.name),
          versionHistory: version.versionHistory.slice(-30),
          selectedFeatures, lessonScope, promptText, activeTab,
          deliverables: deliv.deliverables,
          slideTheme,
          savedAt: Date.now(),
          version: '1.5',
        };
        await cloudSaveProject(user.uid, pid, state);
        setCloudSaveStatus('saved');
        // Reset to idle after 3 seconds
        clearTimeout(cloudStatusTimerRef.current);
        cloudStatusTimerRef.current = setTimeout(() => setCloudSaveStatus('idle'), 3000);
      } catch (e) {
        console.warn('[Cloud] auto-save failed:', e);
        setCloudSaveStatus('error');
        clearTimeout(cloudStatusTimerRef.current);
        cloudStatusTimerRef.current = setTimeout(() => setCloudSaveStatus('idle'), 5000);
      }
    }, 5000);
    return () => clearTimeout(cloudSaveTimerRef.current);
  }, [user, courseMap, columns, hasGenerated, provider, modelId, modelName, userEdits, chatHistory, version.versionHistory, selectedFeatures, lessonScope, promptText, activeTab, deliv.deliverables, slideTheme]);

  // ── On sign-in: merge cloud data (custom deliverables + profile) ──
  const prevUserRef = useRef(null);
  useEffect(() => {
    if (user && user.uid !== prevUserRef.current) {
      prevUserRef.current = user.uid;
      // Fire-and-forget cloud merge
      mergeCloudDeliverables(user.uid).catch(() => { });
      mergeCloudProfile(user.uid).catch(() => { });
      mergeCloudMemories(user.uid).catch(() => { });
      mergeCloudAgentPrefs(user.uid).catch(() => { });
    }
    if (!user) prevUserRef.current = null;
  }, [user]);

  // ── Detect saved session on mount ──
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (saved.courseMap) setHasSavedSession(true);
    } catch { }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Restore saved session ──
  function doRestoreSession() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (!saved.courseMap) return;
      setCourseMap(saved.courseMap);
      setColumns(saved.columns || [...DEFAULT_COLUMNS]);
      setHasGenerated(true);
      setProvider(saved.provider === 'free' ? 'openai' : (saved.provider || 'openai'));
      setModelId(saved.modelId || '');
      setModelName(saved.modelName || '');
      setUserEdits(saved.userEdits || []);
      if (saved.fileNames?.length > 0) {
        setFiles(saved.fileNames.map(name => ({ name, size: 0, _restored: true })));
      }
      if (saved.versionHistory?.length > 0) {
        version.initHistory(saved.versionHistory);
      } else {
        version.pushVersion(saved.courseMap, 'Restored session');
      }
      if (saved.chatHistory) setChatHistory(saved.chatHistory);
      if (saved.selectedFeatures) setSelectedFeatures(saved.selectedFeatures);
      if (saved.lessonScope) setLessonScope(saved.lessonScope);
      if (saved.promptText !== undefined) setPromptText(saved.promptText);
      if (saved.activeTab) setActiveTab(saved.activeTab);
      if (saved.slideTheme !== undefined) setSlideTheme(saved.slideTheme);
      if (saved.deliverables) {
        // ── Change #3: Migrate old stale:true entries that lack staleConfidence ──
        for (const [, entry] of Object.entries(saved.deliverables)) {
          if (entry?.stale && !entry?.staleConfidence) {
            entry.staleConfidence = { level: 'high', maxWeight: 1.0, dominantField: null };
          }
        }
        deliv.restoreDeliverables(saved.deliverables);
      }
      setRestoredSession(true);
      setHasSavedSession(false);
      if (!gen.restoreStoppedState()) {
        gen.setProgressStep('done');
        gen.setStatus('done');
      }
      setScreen('workspace');
    } catch (e) { console.warn('Restore failed:', e); }
  }

  // ── Derived ──
  const canGenerate =
    apiKey.trim() && modelId &&
    (files.length > 0 || promptText.trim().length > 0) &&
    gen.status !== 'parsing' && gen.status !== 'generating' && !gen.isStopped;

  const hasSyllabusFile = files.some(f =>
    ['pdf', 'doc', 'docx', 'odt', 'rtf'].includes(f.name.split('.').pop().toLowerCase())
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
        const saved = JSON.parse(text);
        if (!saved.courseMap) throw new Error('Invalid .coursemapper file');
        setCourseMap(saved.courseMap);
        setOldCourseMap(null);
        setColumns(saved.columns || [...DEFAULT_COLUMNS]);
        setUserEdits(saved.userEdits || []);
        if (saved.chatHistory) setChatHistory(saved.chatHistory);
        if (saved.selectedFeatures) setSelectedFeatures(saved.selectedFeatures);
        if (saved.lessonScope) setLessonScope(saved.lessonScope);
        if (saved.promptText !== undefined) setPromptText(saved.promptText);
        if (saved.activeTab) setActiveTab(saved.activeTab);
        if (saved.slideTheme !== undefined) setSlideTheme(saved.slideTheme);
        if (saved.deliverableConfig) setDeliverableConfig(saved.deliverableConfig);
        if (saved.fileNames?.length > 0) {
          setFiles(saved.fileNames.map(n => ({ name: n, size: 0, _restored: true })));
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
      const state = {
        courseMap,
        columns,
        hasGenerated: true,
        provider,
        modelId,
        modelName,
        userEdits,
        chatHistory: chatHistory.slice(-50),
        fileNames: files.map(f => f.name),
        versionHistory: version.versionHistory.slice(-30),
        selectedFeatures,
        lessonScope,
        promptText,
        activeTab,
        deliverables: deliv.deliverables,
        slideTheme,
        deliverableConfig,
        savedAt: Date.now(),
        version: '1.5',
      };
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

  // ── Open a cloud project by ID ──
  async function handleOpenCloudProject(pid) {
    if (!user) return;
    try {
      const saved = await cloudLoadProject(user.uid, pid);
      if (!saved || !saved.courseMap) throw new Error('Project data not found');
      const deliverables = await loadProjectDeliverables(user.uid, pid);
      // Restore all state — same as doRestoreSession but from cloud
      setCourseMap(saved.courseMap);
      setColumns(saved.columns || [...DEFAULT_COLUMNS]);
      setHasGenerated(true);
      setProvider(saved.provider === 'free' ? 'openai' : (saved.provider || 'openai'));
      setModelId(saved.modelId || '');
      setModelName(saved.modelName || '');
      setUserEdits(saved.userEdits || []);
      if (saved.fileNames?.length > 0) {
        setFiles(saved.fileNames.map(name => ({ name, size: 0, _restored: true })));
      }
      if (saved.versionHistory?.length > 0) {
        version.initHistory(saved.versionHistory);
      } else {
        version.pushVersion(saved.courseMap, 'Restored from cloud');
      }
      if (saved.chatHistory) setChatHistory(saved.chatHistory);
      if (saved.selectedFeatures) setSelectedFeatures(saved.selectedFeatures);
      if (saved.lessonScope) setLessonScope(saved.lessonScope);
      if (saved.promptText !== undefined) setPromptText(saved.promptText);
      if (saved.activeTab) setActiveTab(saved.activeTab);
      if (saved.slideTheme !== undefined) setSlideTheme(saved.slideTheme);
      if (deliverables && Object.keys(deliverables).length > 0) {
        deliv.restoreDeliverables(deliverables);
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
      console.error('[Cloud] open project failed:', e);
      gen.setError('Failed to open cloud project: ' + e.message);
      throw e; // Re-throw so ProjectPicker can catch and show error
    }
  }

  // ── Save current session as a new cloud project ──
  async function handleSaveCurrentAsNew() {
    if (!user || !courseMap) return;
    try {
      const pid = newProjectId();
      const state = {
        courseName: courseMap?.courseName || 'Untitled',
        semester: courseMap?.semester || '',
        courseMap, columns, hasGenerated: true,
        provider, modelId, modelName, userEdits,
        chatHistory: chatHistory.slice(-50),
        fileNames: files.map(f => f.name),
        versionHistory: version.versionHistory.slice(-30),
        selectedFeatures, lessonScope, promptText, activeTab,
        deliverables: deliv.deliverables,
        slideTheme,
        savedAt: Date.now(),
        version: '1.5',
      };
      await cloudSaveProject(user.uid, pid, state);
      setProjectId(pid);
      projectIdRef.current = pid;
    } catch (e) {
      console.error('[Cloud] save-as-new failed:', e);
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
    // 3. Remove persisted data before resetting state
    //    (prevents save-effects from re-writing stale data)
    try { localStorage.removeItem(STORAGE_KEY); } catch { }
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
    setCloudSaveStatus('idle');
    setScreen('landing');
  }

  const handleAddMaterials = useCallback(async (e) => {
    const newFiles = Array.from(e.target.files);
    if (newFiles.length === 0) return;
    e.target.value = '';
    setFiles(prev => [...prev, ...newFiles]);
    let parsed;
    try {
      parsed = await parseFiles(newFiles);
    } catch (err) {
      gen.setError('Failed to parse new files: ' + err.message);
      return;
    }
    const newText = parsed
      .filter(f => f.text)
      .map(f => `=== File: ${f.name} ===\n${f.text}`)
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
  }, [rev, gen, setFiles]);

  async function onGenerate() {
    setHasGenerated(true);
    setDownloadedFile('');
    setActiveTab('courseMap');
    deliv.resetDeliverables();
    setScreen('workspace');
    await gen.handleGenerate();
  }

  // After course map generation finishes, auto-generate other selected deliverables
  const prevProgressStepRef = useRef(null);
  useEffect(() => {
    const prev = prevProgressStepRef.current;
    prevProgressStepRef.current = gen.progressStep;
    // Trigger when step transitions to 'done' (course map just finished)
    if (prev && prev !== 'done' && gen.progressStep === 'done' && courseMap) {
      // Use FEATURES canonical order so generation matches tab order
      const allFeats = [...FEATURES, ...listCustomDeliverables().map(toFeatureEntry)];
      const orderedFeatures = allFeats
        .filter(f => selectedFeatures.includes(f.id) && f.id !== 'courseMap')
        .map(f => f.id);
      if (orderedFeatures.length > 0 && !deliv.isGenerating) {
        const scopeIndices = lessonScope.type === 'specific' ? lessonScope.indices : null;
        deliv.generateAll(courseMap, orderedFeatures, scopeIndices);
      }
    }
  }, [gen.progressStep]); // eslint-disable-line react-hooks/exhaustive-deps

  function onResume() { gen.handleResume(); }
  function onStop() { gen.handleStop(); }

  // ── Detect lesson count using AI when user proceeds from landing ──
  async function handleLandingContinue() {
    setScreen('features');

    // Start with a regex scan of promptText for instant feedback
    const promptRegex = detectExpectedLessons(promptText);
    const regexCount = promptRegex.expected || 0;
    if (regexCount) setLessonCount(regexCount);

    // If regex already found a high-confidence result (e.g. "15-week"), trust it
    // and skip the AI call — AI can miscount by multiplying weeks × sessions/week
    // when the text doesn't state meeting frequency explicitly.
    if (promptRegex.confidence === 'high' && regexCount) {
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
            const parsed = await parseFiles(files);
            const fileText = parsed
              .filter(f => f.text)
              .map(f => f.text)
              .join('\n\n')
              .slice(0, 20000);
            combinedText = [promptText, fileText].filter(Boolean).join('\n\n');
            // Re-run regex on combined text — syllabus may have explicit week count
            const combinedRegex = detectExpectedLessons(combinedText);
            if (combinedRegex.expected) setLessonCount(combinedRegex.expected);
            // If combined regex is high-confidence, trust it and skip AI
            if (combinedRegex.confidence === 'high') return;
          } catch { /* file parse failed — use promptText only */ }
        }
        // Only call AI when regex couldn't confidently determine lesson count
        const aiCount = await detectLessonsWithAI(combinedText, { provider, apiKey, modelId });
        if (aiCount) setLessonCount(aiCount);
      } catch { /* silent — regex fallback is fine */ }
      finally { setIsDetectingLessons(false); }
    }
  }

  // ── Screen: Landing ──
  if (screen === 'landing') {
    return (
      <>
        <Landing
          files={files} setFiles={setFiles}
          promptText={promptText} setPromptText={setPromptText}
          onGenerate={handleLandingContinue}
          canGenerate={
            (files.length > 0 || promptText.trim().length > 0) &&
            apiKey.trim() &&
            !!modelId
          }
          isGenerating={false}
          provider={provider} setProvider={setProvider}
          apiKey={apiKey} setApiKey={setApiKey}
          modelId={modelId} setModelId={setModelId}
          modelName={modelName} setModelName={setModelName}
          availableModels={availableModels} setAvailableModels={setAvailableModels}
          apiStatus={apiStatus} setApiStatus={setApiStatus}
          setMaxOutputTokens={setMaxOutputTokens}
          columns={columns} setColumns={setColumns}
          hasSavedSession={hasSavedSession}
          onRestoreSession={doRestoreSession}
          onDismissSavedSession={() => {
            try { localStorage.removeItem(STORAGE_KEY); } catch { }
            setHasSavedSession(false);
          }}
          onImportCourseMap={handleImport}
          onOpenProject={handleOpenProject}
          onExampleSelect={(text) => setPromptText(text)}
          onOpenProjects={user ? () => setShowProjectPicker(true) : undefined}
        />
        {/* Cloud project picker — available on landing when signed in */}
        <ProjectPicker
          isOpen={showProjectPicker}
          onClose={() => setShowProjectPicker(false)}
          onOpenProject={handleOpenCloudProject}
          onSaveCurrentAsNew={null}
          onDeleteProject={(deletedId, remainingCount) => {
            if (deletedId === projectIdRef.current || remainingCount === 0) {
              try { localStorage.removeItem(STORAGE_KEY); } catch { }
              setHasSavedSession(false);
              if (deletedId === projectIdRef.current) {
                setProjectId(null);
              }
            }
          }}
        />
      </>
    );
  }

  // ── Screen: Feature Select ──
  if (screen === 'features') {
    return (
      <FeatureSelect
        selected={selectedFeatures}
        setSelected={setSelectedFeatures}
        hasSyllabusFile={hasSyllabusFile}
        onBack={() => setScreen('landing')}
        onNext={() => setScreen('config')}
        modelConfig={{ provider, apiKey, modelId }}
        onOpenHelp={() => setShowHelp(true)}
      />
    );
  }

  // ── Screen: Config ──
  if (screen === 'config') {
    return (
      <Config
        selected={selectedFeatures}
        deliverableConfig={deliverableConfig}
        setDeliverableConfig={setDeliverableConfig}
        lessonScope={lessonScope}
        setLessonScope={setLessonScope}
        lessonCount={lessonCount}
        isDetectingLessons={isDetectingLessons}
        courseMap={courseMap}
        columns={columns}
        setColumns={setColumns}
        onBack={() => setScreen('features')}
        onGenerate={onGenerate}
        canGenerate={canGenerate}
        onOpenHelp={() => setShowHelp(true)}
      />
    );
  }

  // ── Screen: Workspace ──
  // Build ordered tab list from selected features — order follows selectedFeatures array
  const allFeaturesForTabs = [...FEATURES, ...listCustomDeliverables().map(toFeatureEntry)];
  const featureMap = Object.fromEntries(allFeaturesForTabs.map(f => [f.id, f]));
  const workspaceTabs = selectedFeatures.map(id => featureMap[id]).filter(Boolean);

  // Drag-to-reorder tab handlers
  const handleTabDragStart = (idx) => (e) => {
    setDragTabIdx(idx);
    e.dataTransfer.effectAllowed = 'move';
  };
  const handleTabDragOver = (idx) => (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };
  const handleTabDrop = (dropIdx) => (e) => {
    e.preventDefault();
    if (dragTabIdx == null || dragTabIdx === dropIdx) { setDragTabIdx(null); return; }
    setSelectedFeatures(prev => {
      const next = [...prev];
      const [moved] = next.splice(dragTabIdx, 1);
      next.splice(dropIdx, 0, moved);
      return next;
    });
    setDragTabIdx(null);
  };

  return (
    <div className="min-h-screen mesh-bg noise-overlay">
      <Header onOpenProjects={() => setShowProjectPicker(true)} />

      {/* Cloud save runs silently */}

      <main className="w-full px-4 sm:px-6 pb-10 space-y-4">
        {/* Top bar */}
        <div className="flex items-center gap-3 animate-spring-in pt-1">
          <button
            onClick={() => setNewProjectConfirm(true)}
            className="tactile group flex items-center gap-2 px-4 py-2 rounded-pill text-xs font-semibold text-slate-500 bg-white/50 border border-slate-200/40 hover:bg-white/70 hover:text-slate-700 shadow-glass transition-all duration-300"
          >
            <svg className="w-3.5 h-3.5 group-hover:rotate-90 transition-transform duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New Project
          </button>
          <button
            onClick={() => addMaterialInputRef.current?.click()}
            disabled={gen.isStreaming || rev.isRevising}
            className="tactile group flex items-center gap-2 px-4 py-2 rounded-pill text-xs font-semibold text-sky-600 bg-sky-50/50 border border-sky-200/40 hover:bg-sky-100/70 shadow-glass transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            Add Materials
          </button>
          <input ref={addMaterialInputRef} type="file" multiple
            accept=".doc,.docx,.pdf,.txt,.md,.csv,.rtf,.html,.htm,.xlsx,.xls,.ods,.ppt,.pptx,.odp,.odt,.epub,.key,.pages,.zip"
            onChange={handleAddMaterials} className="hidden" />
          {modelName && (
            <span className="ml-auto text-[10px] font-semibold text-indigo-500 bg-indigo-50/60 px-3 py-1 rounded-pill border border-indigo-100/50">
              {modelName}
            </span>
          )}
          {version.versionHistory.length > 1 && !gen.isStreaming && (
            <div className="flex items-center gap-1">
              <button onClick={version.undo} disabled={version.activeVersion <= 0}
                className={`tactile p-2 rounded-full transition-all duration-200 ${version.activeVersion > 0 ? 'text-slate-500 hover:bg-white/60 hover:text-indigo-500' : 'text-slate-300 cursor-not-allowed'}`} title="Undo">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a5 5 0 015 5v2M3 10l4-4M3 10l4 4" /></svg>
              </button>
              <button onClick={version.redo} disabled={version.activeVersion >= version.versionHistory.length - 1}
                className={`tactile p-2 rounded-full transition-all duration-200 ${version.activeVersion < version.versionHistory.length - 1 ? 'text-slate-500 hover:bg-white/60 hover:text-indigo-500' : 'text-slate-300 cursor-not-allowed'}`} title="Redo">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 10H11a5 5 0 00-5 5v2M21 10l-4-4M21 10l-4 4" /></svg>
              </button>
              <span className="text-[10px] font-medium text-slate-400">v{version.activeVersion + 1}/{version.versionHistory.length}</span>
            </div>
          )}
        </div>

        {/* ── Deliverable tabs ── */}
        {workspaceTabs.length > 1 && (
          <div className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-hide">
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
              const lastSyncEntry = smartSync.isSyncing && smartSync.syncLog.length > 0
                ? [...smartSync.syncLog].reverse().find(e => e.featureId === feature.id)
                : null;
              // Change #1: Use syncingFeatures set for parallel-aware badge
              const isSyncingThis = smartSync.syncingFeatures?.has(feature.id) || (
                smartSync.isSyncing && (
                  deliv.currentFeatures?.has(feature.id) ||
                  (lastSyncEntry?.type === 'start')
                )
              );

              return (
                <button
                  key={feature.id}
                  draggable
                  onDragStart={handleTabDragStart(tabIdx)}
                  onDragOver={handleTabDragOver(tabIdx)}
                  onDrop={handleTabDrop(tabIdx)}
                  onDragEnd={() => setDragTabIdx(null)}
                  onClick={() => {
                    setActiveTab(feature.id);
                    // Clear unseen badge when user clicks the tab
                    if (hasUnseen) {
                      setUnseenChanges(prev => {
                        const next = new Set(prev);
                        next.delete(feature.id);
                        return next;
                      });
                    }
                  }}
                  className={`tactile flex items-center gap-2 px-4 py-2 rounded-pill text-xs font-semibold whitespace-nowrap transition-all duration-200 flex-shrink-0 cursor-grab active:cursor-grabbing ${dragTabIdx === tabIdx ? 'opacity-40' :
                    isActive
                      ? 'bg-white/80 text-slate-800 shadow-glass border border-slate-200/60'
                      : 'text-slate-500 hover:bg-white/50 hover:text-slate-700'
                    }`}
                >
                  {/* Status dot — cascade sync takes priority for non-courseMap tabs */}
                  {feature.id !== 'courseMap' && (
                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isSyncingThis ? 'bg-amber-400 animate-pulse' :
                      isStaleTab && !isSyncingThis ? (staleConf?.level === 'high' ? 'bg-amber-400' : staleConf?.level === 'medium' ? 'bg-amber-300' : 'bg-amber-200') :
                        hasUnseen ? 'bg-amber-400' :
                          isStreaming ? 'bg-indigo-400 animate-pulse' :
                            isDone ? 'bg-emerald-400' :
                              isError ? 'bg-red-400' :
                                'bg-slate-300'
                      }`} />
                  )}
                  {feature.id === 'courseMap' && (
                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${gen.isStreaming ? 'bg-indigo-400 animate-pulse' :
                      isCourseMapDone ? 'bg-emerald-400' :
                        'bg-slate-300'
                      }`} />
                  )}
                  {feature.label}{isStaleTab && !isSyncingThis ? (staleConf?.level === 'high' ? ' ⚠' : ' ~') : hasUnseen ? ' *' : ''}
                </button>
              );
            })}

            {/* ── + Add deliverable button ── */}
            {gen.progressStep === 'done' && (() => {
              const allFeatsForAdd = [...FEATURES, ...listCustomDeliverables().map(toFeatureEntry)];
              const unselected = allFeatsForAdd.filter(f => f.id !== 'courseMap' && !selectedFeatures.includes(f.id));
              return (
                <AddDeliverableButton
                  unselected={unselected}
                  showAddDeliverable={showAddDeliverable}
                  setShowAddDeliverable={setShowAddDeliverable}
                  onAdd={(feature) => {
                    setSelectedFeatures(prev => [...prev, feature.id]);
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
                Generating {deliv.progress.done}/{deliv.progress.total}…
              </span>
            )}

            {/* Sync All Stale button — appears when any deliverable is stale */}
            {(() => {
              const staleCount = selectedFeatures.filter(f =>
                f !== 'courseMap' && deliv.deliverables[f]?.stale === true
              ).length;
              if (staleCount === 0 || deliv.isGenerating || smartSync.isSyncing) return null;
              return (
                <button
                  onClick={() => {
                    const staleIds = selectedFeatures.filter(f =>
                      f !== 'courseMap' && deliv.deliverables[f]?.stale === true
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
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Sync all stale ({staleCount})
                </button>
              );
            })()}

            {/* Deliverable undo/redo — appears when deliverable edits have been made */}
            {(delivUndo.canUndo || delivUndo.canRedo) && !gen.isStreaming && (
              <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                <button onClick={() => delivUndo.undo(deliv.setDeliverables)} disabled={!delivUndo.canUndo}
                  className={`tactile p-1.5 rounded-full transition-all duration-200 ${delivUndo.canUndo ? 'text-slate-500 hover:bg-white/60 hover:text-indigo-500' : 'text-slate-300 cursor-not-allowed'}`} title="Undo deliverable edit">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a5 5 0 015 5v2M3 10l4-4M3 10l4 4" /></svg>
                </button>
                <button onClick={() => delivUndo.redo(deliv.setDeliverables)} disabled={!delivUndo.canRedo}
                  className={`tactile p-1.5 rounded-full transition-all duration-200 ${delivUndo.canRedo ? 'text-slate-500 hover:bg-white/60 hover:text-indigo-500' : 'text-slate-300 cursor-not-allowed'}`} title="Redo deliverable edit">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 10H11a5 5 0 00-5 5v2M21 10l-4-4M21 10l-4 4" /></svg>
                </button>
              </div>
            )}

            {/* Reading Level Control */}
            {courseMap && gen.progressStep === 'done' && (
              <div className="ml-auto flex-shrink-0">
                <ReadingLevelControl />
              </div>
            )}
          </div>
        )}

        {/* ── New Project Confirmation Modal ── */}
        {newProjectConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-md">
            <div className="bg-white rounded-2xl border border-slate-200/60 shadow-2xl p-6 max-w-sm w-full mx-4 animate-spring-scale">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-800">Start a new project?</h3>
                  <p className="text-[11px] text-slate-500 mt-0.5">Your current course map and all generated deliverables will be cleared.</p>
                </div>
              </div>
              <p className="text-[11px] text-slate-400 mb-5 leading-relaxed">
                Save your work first using <span className="font-semibold text-slate-500">Export → All → Save .coursemapper</span> if you want to keep it.
              </p>
              <div className="flex items-center gap-2 justify-end">
                <button
                  onClick={() => setNewProjectConfirm(false)}
                  className="tactile px-4 py-2 rounded-lg text-xs font-semibold text-slate-600 bg-white border border-slate-200/60 hover:bg-slate-50 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={() => { setNewProjectConfirm(false); handleNewProject(); }}
                  className="tactile px-4 py-2 rounded-lg text-xs font-semibold text-white bg-red-500 hover:bg-red-600 transition-all"
                >
                  Start New Project
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Add Lessons Modal ── */}
        {addLessonsModal && (
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
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span className="text-left">
                    <span className="block">Just this tab</span>
                    <span className="block text-[10px] font-normal text-indigo-500 mt-0.5">
                      {workspaceTabs.find(f => f.id === activeTab)?.label || activeTab} only
                    </span>
                  </span>
                </button>
                <button
                  onClick={() => {
                    const { lessonIndices } = addLessonsModal;
                    const activeDelivFeatures = selectedFeatures.filter(f => f !== 'courseMap');
                    deliv.generateAll(courseMap, activeDelivFeatures, lessonIndices);
                    setAddLessonsModal(null);
                  }}
                  className="w-full flex items-center gap-2 px-4 py-3 rounded-xl text-[12px] font-semibold text-violet-700 bg-violet-50 border border-violet-200/60 hover:bg-violet-100 transition-colors"
                >
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                  </svg>
                  <span className="text-left">
                    <span className="block">All deliverables</span>
                    <span className="block text-[10px] font-normal text-violet-500 mt-0.5">
                      {selectedFeatures.filter(f => f !== 'courseMap').map(id => FEATURES.find(f => f.id === id)?.label || id).join(', ')}
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
        )}

        {/* ── Custom Deliverable Builder (from workspace + Add) ── */}
        <CustomDeliverableBuilder
          isOpen={showCustomBuilder}
          onClose={() => setShowCustomBuilder(false)}
          onSave={(def) => {
            const saved = saveCustomDeliverable(def, user?.uid);
            setSelectedFeatures(prev => [...prev, saved.id]);
            setActiveTab(saved.id);
            setShowCustomBuilder(false);
            const scopeIndices = lessonScope.type === 'specific' ? lessonScope.indices : null;
            deliv.generateAll(courseMap, [saved.id], scopeIndices);
          }}
          editDef={null}
          modelConfig={{ provider, apiKey, modelId }}
        />

        {/* ── Tab content + Chat panel + Export panel ── */}
        <div className="flex gap-0 items-stretch" style={{ minHeight: 'calc(100vh - 220px)' }}>

          {/* ── Left: Resizable Chat Panel ── */}
          <div className="flex-shrink-0 sticky top-4" style={{ width: chatWidth, height: 'calc(100vh - 160px)' }}>
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
                delivProgress={deliv.progress}
                currentDelivFeatures={deliv.currentFeatures}
                isDelivGenerating={deliv.isGenerating}
                delivTimings={deliv.delivTimings}
                onStopDeliverables={deliv.isGenerating ? deliv.stopGenerating : null}
                isSyncing={smartSync.isSyncing}
                pendingSyncCount={smartSync.pendingSyncCount}
                syncingFeatures={smartSync.syncingFeatures}
                pendingSyncSuggestion={smartSync.pendingSyncSuggestion}
                clearPendingSyncSuggestion={smartSync.clearPendingSyncSuggestion}
                executeSyncPlan={smartSync.executeSyncPlan}
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
                chatHistory={chatHistory}
                onChatHistoryChange={setChatHistory}
                apiKey={apiKey}
                provider={provider}
                modelId={modelId}
                pendingExamPatches={gen.pendingExamPatches}
                examChanges={gen.examChanges}
                onAcceptPatches={gen.onAcceptPatches}
                onRejectPatch={gen.onRejectPatch}
                editor={editor}
                optimisticUpdate={deliv.optimisticUpdate}
                regenerateLesson={deliv.regenerateLesson}
                delivUndoSnapshot={delivUndo.snapshot}
                delivUndoFn={() => delivUndo.undo(deliv.setDeliverables)}
                delivCanUndo={delivUndo.canUndo}
                onAgentHighlight={triggerAgentHighlight}
                chatSendRef={chatSendRef}
                uid={user?.uid || null}
              />
            </ErrorBoundary>
          </div>

          {/* ── Resize Handle ── */}
          <ResizeHandle width={chatWidth} onWidthChange={(w) => {
            setChatWidth(w);
            try { localStorage.setItem('coursemapper-chat-width', String(w)); } catch {}
          }} />

          {/* ── Main content area ── */}
          <div className="flex-1 min-w-0 space-y-4 px-4">

            {/* Course Map tab */}
            {activeTab === 'courseMap' && (
              <>
                {gen.error && (
                  <div className="glass rounded-squircle-sm p-5 animate-spring-in">
                    <div className="flex items-start gap-3 text-red-600 text-sm">
                      <div className="w-8 h-8 rounded-squircle-xs bg-red-100 flex items-center justify-center flex-shrink-0">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <p className="pt-1 whitespace-pre-line leading-relaxed">{gen.error}</p>
                    </div>
                  </div>
                )}
                {(courseMap || gen.isStreaming) && (
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
                        onToggleDiff={() => setShowDiff(d => !d)}
                        onDismissDiff={() => { setOldCourseMap(null); setShowDiff(false); }}
                        onAIContextMenu={handleAIContextMenu}
                      />
                    </ErrorBoundary>
                  </div>
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
                    deliv.setDeliverables(prev => ({
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
                        // '_deliverableEdit' key: source tab gets AI proposal,
                        // downstream tabs get stale badge + proposal (no auto-regen)
                        smartSync.notifyEdit(lessonIdx, '_deliverableEdit', activeTab, ctx);
                      }
                    }
                  }}
                  onAddLessons={(lessonIndices) => {
                    setAddLessonsModal({ lessonIndices });
                  }}
                  freshLessonIndices={(() => {
                    const base = deliv.freshLessons?.[activeTab] ?? null;
                    if (agentHighlight && agentHighlight.featureId === activeTab && agentHighlight.lessonIndex != null) {
                      const merged = new Set(base || []);
                      merged.add(agentHighlight.lessonIndex);
                      return merged;
                    }
                    return base;
                  })()}
                  proposals={editProposal.proposals[activeTab] ?? {}}
                  onAcceptProposal={(lessonIndex) => {
                    editProposal.acceptProposal(
                      activeTab, lessonIndex,
                      deliv.deliverables[activeTab]?.data,
                      deliv.setDeliverables,
                    );
                  }}
                  onDismissProposal={(lessonIndex) => editProposal.dismissProposal(activeTab, lessonIndex)}
                  onRegenerateProposal={(lessonIndex) => editProposal.regenerateProposal(
                    activeTab, courseMap, lessonIndex,
                    editProposal.proposals[activeTab]?.[lessonIndex]?.editContext,
                    deliv.deliverables[activeTab]?.data,
                  )}
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
            <ExportSidePanel
              activeTab={activeTab}
              activeTabLabel={workspaceTabs.find(f => f.id === activeTab)?.label || activeTab}
              courseMap={courseMap}
              columns={columns}
              deliverables={deliv.deliverables}
              selectedFeatures={selectedFeatures}
              onCourseMapExport={handleDownload}
              onSaveProject={handleSaveProject}
              slideTheme={slideTheme}
            />
          )}
        </div>
      </main>

      <footer className="w-full px-6 py-4 text-center space-y-1">
        <p className="text-[10px] text-slate-300/70">
          Built by the Educational Technology team at NYU Silver School of Social Work
        </p>
        <div className="flex items-center justify-center gap-3 text-[10px] text-slate-300/70">
          <a href="#/changelog" className="font-medium hover:text-indigo-500 transition-colors duration-200">v0.5</a>
          <span>·</span>
          <a href="#/privacy" className="hover:text-indigo-500 transition-colors duration-200">Privacy</a>
          <span>·</span>
          <a href="#/terms" className="hover:text-indigo-500 transition-colors duration-200">Terms</a>
        </div>
      </footer>

      {/* Cloud Project Picker modal */}
      <ProjectPicker
        isOpen={showProjectPicker}
        onClose={() => setShowProjectPicker(false)}
        onOpenProject={handleOpenCloudProject}
        onSaveCurrentAsNew={hasGenerated ? handleSaveCurrentAsNew : null}
        onDeleteProject={(deletedId, remainingCount) => {
          if (deletedId === projectIdRef.current || remainingCount === 0) {
            try { localStorage.removeItem(STORAGE_KEY); } catch { }
            setHasSavedSession(false);
            if (deletedId === projectIdRef.current) {
              setProjectId(null);
            }
          }
        }}
      />

      {/* Help merged into ChatPanel — HelpDrawer removed */}

      {/* AI Context Menu (right-click on cells/items for inline AI editing) */}
      {aiContextMenu && (
        <AIContextMenu
          position={aiContextMenu.position}
          target={aiContextMenu.target}
          onAction={handleAIAction}
          onClose={closeAIContextMenu}
        />
      )}

    </div>
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
