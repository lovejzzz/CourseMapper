import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import Header from './components/Header';
import { DEFAULT_COLUMNS } from './components/ColumnEditor';
import CourseMapPreview from './components/CourseMapPreview';
import ProgressPanel from './components/ProgressPanel';
import VersionTimeline from './components/VersionTimeline';
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
import { FEATURES } from './screens/FeatureSelect';
import DeliverableView from './components/DeliverableView';
import ExportSidePanel from './components/ExportSidePanel';
import { requestNotificationPermission } from './lib/notifyDone';
import { importCourseMap } from './lib/importCourseMap';
import { parseFiles } from './lib/fileParser';
import { detectExpectedLessons, detectLessonsWithAI } from './lib/detectLessons';

const STORAGE_KEY = 'coursemapper-project';

// ── Add Deliverable dropdown — uses a portal so it escapes the overflow-x-auto tab bar ──
function AddDeliverableButton({ unselected, showAddDeliverable, setShowAddDeliverable, onAdd }) {
  const btnRef = useRef(null);
  const [dropPos, setDropPos] = useState({ top: 0, left: 0 });

  function openDropdown() {
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setDropPos({ top: rect.bottom + 6, left: rect.left });
    }
    setShowAddDeliverable(true);
  }

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
            className="fixed z-[9999] bg-white/95 backdrop-blur-xl rounded-xl border border-slate-200/60 shadow-xl p-2 min-w-[200px] animate-spring-in"
            style={{ top: dropPos.top, left: dropPos.left }}
          >
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider px-2 pt-1 pb-1.5">Add Deliverable</p>
            {unselected.map(feature => (
              <button
                key={feature.id}
                onClick={() => onAdd(feature)}
                className="w-full text-left px-2 py-2 rounded-lg text-[11px] font-medium text-slate-600 hover:bg-indigo-50 hover:text-indigo-700 transition-colors"
              >
                {feature.label}
              </button>
            ))}
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
  const [lessonScope, setLessonScope] = useState({ type: 'all' });
  const [deliverableConfig, setDeliverableConfig] = useState({});

  // ── Model & File Config ──
  const [provider, setProvider] = useState('anthropic');
  const [apiKey, setApiKey] = useState(() => {
    try { return localStorage.getItem('coursemapper-apikey') || ''; } catch { return ''; }
  });
  const [apiStatus, setApiStatus] = useState('idle');
  const [modelName, setModelName] = useState('');
  const [modelId, setModelId] = useState('');
  const [availableModels, setAvailableModels] = useState([]);
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
  // Add-lessons modal state: { lessonIndices: number[], mode: null|'asking' }
  const [addLessonsModal, setAddLessonsModal] = useState(null);
  // New Project confirmation modal
  const [newProjectConfirm, setNewProjectConfirm] = useState(false);

  // ── Misc ──
  const [downloadedFile, setDownloadedFile] = useState('');
  const saveTimerRef = useRef(null);
  const addMaterialInputRef = useRef(null);

  // ── Cascade sync ──
  // Track which tabs have unseen changes (show amber * badge)
  const [unseenChanges, setUnseenChanges] = useState(new Set());
  // Always-fresh ref to courseMap for useSmartSync (avoids stale closure)
  const courseMapRef = useRef(courseMap);
  useEffect(() => { courseMapRef.current = courseMap; }, [courseMap]);

  const version = useVersionHistory(setCourseMap, setDownloadedFile);

  const gen = useGeneration({
    provider, modelId, apiKey, files, columns,
    setCourseMap, setOldCourseMap,
    pushVersion: version.pushVersion,
    userEdits, setUserEdits,
    promptText,
    lessonScope: lessonScope.type === 'specific' ? lessonScope.indices : null,
    courseMapConfig: deliverableConfig['courseMap'],
  });

  const {
    handleDownload, resetExport,
  } = useExport(courseMap, columns, gen.setError);

  const rev = useRevision({
    provider, modelId, apiKey,
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
    setRetryInfo: () => {},
  });

  const deliv = useDeliverables({
    provider, modelId, apiKey,
    deliverableConfig,
    lockedLessons: lessonScope.type === 'specific' ? lessonScope.indices : null,
    pedagogicalMode: 'lecture',
    examChanges: gen.examChanges,
  });

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
  });

  // Wire editor with smartSync notifyEdit
  const editor = useCourseMapEditor({
    courseMap, setCourseMap, columns,
    setDownloadedFile, setUserEdits,
    pushVersion: version.pushVersion,
    onEdit: smartSync.notifyEdit,
  });

  // ── Persist API key ──
  useEffect(() => {
    try {
      if (apiKey) localStorage.setItem('coursemapper-apikey', apiKey);
      else localStorage.removeItem('coursemapper-apikey');
    } catch {}
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
          chatHistory: chatHistory.slice(-20),
          fileNames: files.map(f => f.name),
          versionHistory: version.versionHistory.slice(-30),
          selectedFeatures, lessonScope, promptText, activeTab,
          deliverables: deliv.deliverables,
          savedAt: Date.now(),
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch (e) { console.warn('Save failed:', e); }
    }, 1000);
    return () => clearTimeout(saveTimerRef.current);
  }, [courseMap, columns, hasGenerated, provider, modelId, modelName, userEdits, chatHistory, version.versionHistory, selectedFeatures, lessonScope, promptText, activeTab, deliv.deliverables]);

  // ── Detect saved session on mount ──
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (saved.courseMap) setHasSavedSession(true);
    } catch {}
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
      setProvider(saved.provider || 'free');
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
      if (saved.deliverables) deliv.restoreDeliverables(saved.deliverables);
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
    (provider === 'free' || apiKey.trim()) && modelId &&
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
        chatHistory: chatHistory.slice(-20),
        fileNames: files.map(f => f.name),
        versionHistory: version.versionHistory.slice(-30),
        selectedFeatures,
        lessonScope,
        promptText,
        activeTab,
        deliverables: deliv.deliverables,
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

  function handleNewProject() {
    gen.handleStop();
    gen.resetGeneration();
    rev.resetRevision();
    version.resetHistory();
    resetExport();
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
    deliv.resetDeliverables();
    setUnseenChanges(new Set());
    setHasSavedSession(false);
    setScreen('landing');
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
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
      const orderedFeatures = FEATURES
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
      <Landing
        files={files} setFiles={setFiles}
        promptText={promptText} setPromptText={setPromptText}
        onGenerate={handleLandingContinue}
        canGenerate={
          (files.length > 0 || promptText.trim().length > 0) &&
          (provider === 'free' || apiKey.trim()) &&
          !!modelId
        }
        isGenerating={false}
        provider={provider} setProvider={setProvider}
        apiKey={apiKey} setApiKey={setApiKey}
        modelId={modelId} setModelId={setModelId}
        modelName={modelName} setModelName={setModelName}
        availableModels={availableModels} setAvailableModels={setAvailableModels}
        apiStatus={apiStatus} setApiStatus={setApiStatus}
        columns={columns} setColumns={setColumns}
        hasSavedSession={hasSavedSession}
        onRestoreSession={doRestoreSession}
        onDismissSavedSession={() => setHasSavedSession(false)}
        onImportCourseMap={handleImport}
        onOpenProject={handleOpenProject}
        onExampleSelect={(text) => setPromptText(text)}
      />
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
      />
    );
  }

  // ── Screen: Workspace ──
  // Build ordered tab list from selected features (course map always first)
  const workspaceTabs = FEATURES.filter(f => selectedFeatures.includes(f.id));

  return (
    <div className="min-h-screen mesh-bg noise-overlay">
      <Header />

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
            {workspaceTabs.map(feature => {
              const isActive = activeTab === feature.id;
              const delivState = deliv.deliverables[feature.id];
              const isStreaming = delivState?.status === 'streaming';
              const isDone = delivState?.status === 'done';
              const isError = delivState?.status === 'error';
              const isCourseMapDone = feature.id === 'courseMap' && gen.progressStep === 'done';

              // Cascade sync badges
              const hasUnseen = unseenChanges.has(feature.id);
              const isSyncingThis = smartSync.isSyncing && deliv.currentFeature === feature.id;

              return (
                <button
                  key={feature.id}
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
                  className={`tactile flex items-center gap-2 px-4 py-2 rounded-pill text-xs font-semibold whitespace-nowrap transition-all duration-200 flex-shrink-0 ${
                    isActive
                      ? 'bg-white/80 text-slate-800 shadow-glass border border-slate-200/60'
                      : 'text-slate-500 hover:bg-white/50 hover:text-slate-700'
                  }`}
                >
                  {/* Status dot — cascade sync takes priority for non-courseMap tabs */}
                  {feature.id !== 'courseMap' && (
                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                      isSyncingThis ? 'bg-amber-400 animate-pulse' :
                      hasUnseen ? 'bg-amber-400' :
                      isStreaming ? 'bg-indigo-400 animate-pulse' :
                      isDone ? 'bg-emerald-400' :
                      isError ? 'bg-red-400' :
                      'bg-slate-300'
                    }`} />
                  )}
                  {feature.id === 'courseMap' && (
                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                      gen.isStreaming ? 'bg-indigo-400 animate-pulse' :
                      isCourseMapDone ? 'bg-emerald-400' :
                      'bg-slate-300'
                    }`} />
                  )}
                  {feature.label}{hasUnseen ? ' *' : ''}
                </button>
              );
            })}

            {/* ── + Add deliverable button ── */}
            {gen.progressStep === 'done' && (() => {
              const unselected = FEATURES.filter(f => f.id !== 'courseMap' && !selectedFeatures.includes(f.id));
              if (unselected.length === 0) return null;
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
                />
              );
            })()}

            {/* Deliverable generation progress */}
            {deliv.isGenerating && (
              <span className="ml-2 text-[10px] text-indigo-500 font-medium animate-pulse whitespace-nowrap flex-shrink-0">
                Generating {deliv.progress.done}/{deliv.progress.total}…
              </span>
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
                      {FEATURES.find(f => f.id === activeTab)?.label || activeTab} only
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

        {/* ── Tab content + Progress sidebar + Export panel ── */}
        <div className="flex gap-4 items-start">

          {/* ── Left: Progress sidebar — sticky, naturally sized, never clipped ── */}
          {(gen.progressStep || gen.error) && (
            <div className="w-64 flex-shrink-0 sticky top-4 self-start">
              <ErrorBoundary>
                <ProgressPanel
                  currentStep={gen.progressStep}
                  modelName={gen.activeModelName || modelName}
                  error={gen.error || null}
                  courseMap={courseMap}
                  activeTab={activeTab}
                  onRevision={rev.handleRevision}
                  isRevising={rev.isRevising}
                  streamDetail={gen.streamDetail}
                  streamProgress={gen.streamProgress}
                  onStop={gen.isStreaming ? onStop : null}
                  isStopped={gen.isStopped}
                  onResume={onResume}
                  onClearAll={gen.handleClearAll}
                  examChanges={gen.examChanges}
                  pendingExamPatches={gen.pendingExamPatches}
                  onAcceptPatches={gen.onAcceptPatches}
                  onRejectPatch={gen.onRejectPatch}
                  retryInfo={gen.retryInfo}
                  completenessInfo={gen.completenessInfo}
                  generationLog={gen.generationLog}
                  onRetryExamine={gen.handleRetryExamine}
                  chatHistory={chatHistory}
                  onChatHistoryChange={setChatHistory}
                  deliverables={deliv.deliverables}
                  delivProgress={deliv.progress}
                  currentDelivFeature={deliv.currentFeature}
                  isDelivGenerating={deliv.isGenerating}
                  delivGenerationLog={deliv.generationLog}
                  delivTimings={deliv.delivTimings}
                  syncLog={smartSync.syncLog}
                />
              </ErrorBoundary>
            </div>
          )}

          {/* ── Main content area ── */}
          <div className="flex-1 min-w-0 space-y-4">

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
                  currentDelivFeature={deliv.currentFeature}
                  lessonScope={lessonScope.type === 'specific' ? lessonScope.indices : null}
                  onRetry={() => {
                    const scopeIndices = lessonScope.type === 'specific' ? lessonScope.indices : null;
                    deliv.generateAll(courseMap, [activeTab], scopeIndices);
                  }}
                  onRegenerateLesson={(lessonIndex) => {
                    deliv.regenerateLesson(activeTab, courseMap, lessonIndex);
                  }}
                  onDataChange={(newData) => {
                    deliv.setDeliverables(prev => ({
                      ...prev,
                      [activeTab]: { ...prev[activeTab], data: newData },
                    }));
                  }}
                  onAddLessons={(lessonIndices) => {
                    setAddLessonsModal({ lessonIndices });
                  }}
                />
              </ErrorBoundary>
            )}
          </div>

          {/* ── Export side panel (right) — shown once course map is ready ── */}
          {courseMap && gen.progressStep === 'done' && (
            <ExportSidePanel
              activeTab={activeTab}
              courseMap={courseMap}
              columns={columns}
              deliverables={deliv.deliverables}
              selectedFeatures={selectedFeatures}
              onCourseMapExport={handleDownload}
              onSaveProject={handleSaveProject}
            />
          )}
        </div>
      </main>

      <footer className="w-full px-6 py-4 text-center space-y-1">
        <p className="text-[10px] text-slate-300/70">
          Built by the Educational Technology team at NYU Silver School of Social Work
        </p>
        <div className="flex items-center justify-center gap-3 text-[10px] text-slate-300/70">
          <a href="#/changelog" className="font-medium hover:text-indigo-500 transition-colors duration-200">v1.5</a>
          <span>·</span>
          <a href="#/privacy" className="hover:text-indigo-500 transition-colors duration-200">Privacy</a>
          <span>·</span>
          <a href="#/terms" className="hover:text-indigo-500 transition-colors duration-200">Terms</a>
        </div>
      </footer>
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
