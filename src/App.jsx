import React, { useState, useEffect, useRef, useCallback } from 'react';
import Header from './components/Header';
import ModelConfig from './components/ModelConfig';
import FileUpload from './components/FileUpload';
import ColumnEditor, { DEFAULT_COLUMNS } from './components/ColumnEditor';
import CourseMapPreview from './components/CourseMapPreview';
import ProgressPanel from './components/ProgressPanel';
import VersionTimeline from './components/VersionTimeline';
import ErrorBoundary from './components/ErrorBoundary';
import useVersionHistory from './hooks/useVersionHistory';
import useExport from './hooks/useExport';
import useGeneration from './hooks/useGeneration';
import useRevision from './hooks/useRevision';
import useCourseMapEditor from './hooks/useCourseMapEditor';
import { requestNotificationPermission } from './lib/notifyDone';
import { importCourseMap } from './lib/importCourseMap';
import { parseFiles } from './lib/fileParser';

const STORAGE_KEY = 'coursemapper-project';

export default function App() {
  useEffect(() => { requestNotificationPermission(); }, []);

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

  // ── Hooks ──
  const [downloadedFile, setDownloadedFile] = useState('');
  const saveTimerRef = useRef(null);
  const addMaterialInputRef = useRef(null);

  const version = useVersionHistory(setCourseMap, setDownloadedFile);

  const gen = useGeneration({
    provider, modelId, apiKey, files, columns,
    setCourseMap, setOldCourseMap,
    pushVersion: version.pushVersion,
    userEdits, setUserEdits,
  });

  const {
    showExportMenu, setShowExportMenu,
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
    setRetryInfo: (info) => {},
  });

  const editor = useCourseMapEditor({
    courseMap, setCourseMap, columns,
    setDownloadedFile, setUserEdits,
    pushVersion: version.pushVersion,
  });

  // ── Persist API key to localStorage ──
  useEffect(() => {
    try {
      if (apiKey) localStorage.setItem('coursemapper-apikey', apiKey);
      else localStorage.removeItem('coursemapper-apikey');
    } catch {}
  }, [apiKey]);

  // ── localStorage: save on changes (debounced) ──
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
          savedAt: Date.now(),
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch (e) { console.warn('Save failed:', e); }
    }, 1000);
    return () => clearTimeout(saveTimerRef.current);
  }, [courseMap, columns, hasGenerated, provider, modelId, modelName, userEdits, chatHistory, version.versionHistory]);

  // ── localStorage: restore on mount ──
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (!saved.courseMap) return;
      setCourseMap(saved.courseMap);
      setColumns(saved.columns || [...DEFAULT_COLUMNS]);
      setHasGenerated(true);
      setProvider(saved.provider || 'free');
      // API key restored separately via its own localStorage key
      setModelId(saved.modelId || '');
      setModelName(saved.modelName || '');
      setUserEdits(saved.userEdits || []);
      if (saved.fileNames && saved.fileNames.length > 0) {
        setFiles(saved.fileNames.map(name => ({ name, size: 0, _restored: true })));
      }
      if (saved.versionHistory && saved.versionHistory.length > 0) {
        version.initHistory(saved.versionHistory);
      } else {
        version.pushVersion(saved.courseMap, 'Restored session');
      }
      if (saved.chatHistory) setChatHistory(saved.chatHistory);
      setRestoredSession(true);
      // Check if there was an interrupted generation to resume
      if (!gen.restoreStoppedState()) {
        gen.setProgressStep('done');
        gen.setStatus('done');
      }
    } catch (e) { console.warn('Restore failed:', e); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Derived ──
  const canGenerate =
    (provider === 'free' || apiKey.trim()) && modelId && files.length > 0 &&
    gen.status !== 'parsing' && gen.status !== 'generating' && !gen.isStopped;

  // ── Import Course Map ──
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

  // ── New Project ──
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
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
  }

  // ── Add Materials (post-generation file upload → revision) ──
  const handleAddMaterials = useCallback(async (e) => {
    const newFiles = Array.from(e.target.files);
    if (newFiles.length === 0) return;
    e.target.value = '';

    // Append to files list for display
    setFiles(prev => [...prev, ...newFiles]);

    // Parse the new files
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

    // Trigger a revision with the new material
    const revisionMsg = `The instructor has provided additional course materials. Please review these materials and update the course map to incorporate any relevant content, topics, assessments, activities, or resources that are missing or need updating.\n\nNew materials:\n${newText.slice(0, 30000)}`;

    try {
      await rev.handleRevision(revisionMsg);
    } catch (err) {
      if (err.message) gen.setError('Material revision failed: ' + err.message);
    }
  }, [rev, gen, setFiles]);

  // ── Generate (wraps hook + sets hasGenerated) ──
  async function onGenerate() {
    setHasGenerated(true);
    setDownloadedFile('');
    await gen.handleGenerate();
  }

  // ── Resume (delegates to correct hook) ──
  function onResume() {
    gen.handleResume();
  }

  // ── Stop ──
  function onStop() {
    gen.handleStop();
  }

  return (
    <div className="min-h-screen mesh-bg noise-overlay">
      <Header />

      <main className="max-w-7xl mx-auto px-8 pb-10 space-y-8">
        {/* ── Setup panels: only before first generation ── */}
        {!hasGenerated ? (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-fade-up">
              <ModelConfig
                provider={provider}
                setProvider={setProvider}
                apiKey={apiKey}
                setApiKey={setApiKey}
                modelId={modelId}
                setModelId={setModelId}
                availableModels={availableModels}
                setAvailableModels={setAvailableModels}
                apiStatus={apiStatus}
                setApiStatus={setApiStatus}
                modelName={modelName}
                setModelName={setModelName}
              />
              <FileUpload files={files} setFiles={setFiles} />
            </div>

            {files.length > 0 && (
              <div className="animate-spring-up">
                <ColumnEditor columns={columns} setColumns={setColumns} />
              </div>
            )}
          </>
        ) : (
          <div className="flex items-center gap-3 animate-spring-in">
            <button
              onClick={handleNewProject}
              className="tactile group flex items-center gap-2 px-5 py-2.5 rounded-pill text-xs font-semibold text-slate-500 bg-white/50 border border-slate-200/40 hover:bg-white/70 hover:text-slate-700 shadow-glass hover:shadow-glass-lg transition-all duration-300"
            >
              <svg className="w-3.5 h-3.5 group-hover:rotate-90 transition-transform duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New Project
            </button>
            <button
              onClick={() => addMaterialInputRef.current?.click()}
              disabled={gen.isStreaming || rev.isRevising}
              className="tactile group flex items-center gap-2 px-5 py-2.5 rounded-pill text-xs font-semibold text-sky-600 bg-sky-50/50 border border-sky-200/40 hover:bg-sky-100/70 shadow-glass transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
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
            <span className="text-[11px] text-slate-400 font-medium truncate max-w-[200px]">
              {files.map(f => f.name).join(', ')}
            </span>
            {modelName && (
              <span className="ml-auto text-[10px] font-semibold text-indigo-500 bg-indigo-50/60 px-3 py-1 rounded-pill border border-indigo-100/50">
                {modelName}
              </span>
            )}
          </div>
        )}

        {/* ── Action bar ── */}
        <div className="relative z-10 flex items-center justify-center gap-4 flex-wrap animate-stagger-2">
          {/* Show Generate button only before generation completes */}
          {(!hasGenerated || gen.status === 'parsing' || gen.status === 'generating' || gen.status === 'stopped') && (
            <button
              onClick={onGenerate}
              disabled={!canGenerate}
              className={`tactile btn-glow px-8 py-3.5 rounded-pill font-semibold text-white text-sm tracking-wide whitespace-nowrap transition-all duration-300 ${
                canGenerate
                  ? 'bg-gradient-to-r from-indigo-500 via-violet-500 to-purple-600 shadow-lg shadow-indigo-500/25 hover:shadow-glow-violet hover:brightness-[1.06]'
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
              }`}
            >
              {gen.status === 'parsing' || gen.status === 'generating' ? (
                <span className="flex items-center gap-2.5 whitespace-nowrap">
                  <Spinner /> {gen.status === 'parsing' ? 'Parsing...' : 'Generating...'}
                </span>
              ) : (
                <span className="flex items-center gap-2.5 whitespace-nowrap">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  Generate Course Map
                </span>
              )}
            </button>
          )}

          {/* Undo / Redo */}
          {version.versionHistory.length > 1 && !gen.isStreaming && (
            <div className="flex items-center gap-1">
              <button
                onClick={version.undo}
                disabled={version.activeVersion <= 0}
                className={`tactile p-2.5 rounded-full transition-all duration-300 ${version.activeVersion > 0 ? 'text-slate-500 hover:bg-white/60 hover:text-indigo-500 hover:shadow-glass' : 'text-slate-300 cursor-not-allowed'}`}
                title="Undo"
              >
                <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a5 5 0 015 5v2M3 10l4-4M3 10l4 4" />
                </svg>
              </button>
              <button
                onClick={version.redo}
                disabled={version.activeVersion >= version.versionHistory.length - 1}
                className={`tactile p-2.5 rounded-full transition-all duration-300 ${version.activeVersion < version.versionHistory.length - 1 ? 'text-slate-500 hover:bg-white/60 hover:text-indigo-500 hover:shadow-glass' : 'text-slate-300 cursor-not-allowed'}`}
                title="Redo"
              >
                <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 10H11a5 5 0 00-5 5v2M21 10l-4-4M21 10l-4 4" />
                </svg>
              </button>
              <span className="text-[10px] font-medium text-slate-400 ml-1">
                v{version.activeVersion + 1}/{version.versionHistory.length}
              </span>
            </div>
          )}

          {downloadedFile && (
            <span className="text-[11px] font-medium text-emerald-600 bg-emerald-50/60 px-3 py-1.5 rounded-pill border border-emerald-100/50">
              {downloadedFile}
            </span>
          )}
        </div>

        {/* ── Progress Panel + Version History side-by-side ── */}
        {(gen.progressStep || gen.error || (version.versionHistory.length > 1 && !gen.isStreaming)) && (
          <div className="flex gap-4 items-start">
            {/* Progress Panel — takes remaining space */}
            <div className="flex-1 min-w-0">
              <ErrorBoundary>
              <ProgressPanel
                currentStep={gen.progressStep}
                modelName={gen.activeModelName || modelName}
                error={gen.error || null}
                courseMap={courseMap}
                onRevision={rev.handleRevision}
                isRevising={rev.isRevising}
                streamDetail={gen.streamDetail}
                streamProgress={gen.streamProgress}
                onStop={gen.isStreaming ? onStop : null}
                isStopped={gen.isStopped}
                onResume={onResume}
                onClearAll={gen.handleClearAll}
                examChanges={gen.examChanges}
                retryInfo={gen.retryInfo}
                completenessInfo={gen.completenessInfo}
                generationLog={gen.generationLog}
                onExport={handleDownload}
                onImport={handleImport}
                onRetryExamine={gen.handleRetryExamine}
                chatHistory={chatHistory}
                onChatHistoryChange={setChatHistory}
              />
              </ErrorBoundary>
            </div>

            {/* Version History — right side */}
            {version.versionHistory.length > 1 && !gen.isStreaming && (
              <div className="w-[280px] flex-shrink-0">
                <VersionTimeline
                  versions={version.versionHistory}
                  activeVersion={version.activeVersion}
                  onJump={version.jumpToVersion}
                />
              </div>
            )}
          </div>
        )}

        {/* ── Error ── */}
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

      </main>

      {/* ── Course Map Preview (full-width, outside max-w-7xl) ── */}
      {(courseMap || gen.isStreaming) && (
        <div className="w-full px-4 pb-10 animate-spring-up">
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
      <footer className="max-w-7xl mx-auto px-8 py-4 text-center space-y-1">
        <p className="text-[10px] text-slate-300/70">
          Built by the Educational Technology team at NYU Silver School of Social Work
        </p>
        <div className="flex items-center justify-center gap-3 text-[10px] text-slate-300/70">
          <a href="#/changelog" className="font-medium hover:text-indigo-500 transition-colors duration-200">v0.15</a>
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
