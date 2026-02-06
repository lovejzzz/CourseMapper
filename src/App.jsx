import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import ModelConfig from './components/ModelConfig';
import FileUpload from './components/FileUpload';
import ColumnEditor, { DEFAULT_COLUMNS } from './components/ColumnEditor';
import CourseMapPreview from './components/CourseMapPreview';
import ProgressPanel from './components/ProgressPanel';
import useVersionHistory from './hooks/useVersionHistory';
import useExport from './hooks/useExport';
import useGeneration from './hooks/useGeneration';
import useRevision from './hooks/useRevision';
import { requestNotificationPermission } from './lib/notifyDone';
import { importCourseMap } from './lib/importCourseMap';

export default function App() {
  useEffect(() => { requestNotificationPermission(); }, []);

  // ── Model & File Config ──
  const [provider, setProvider] = useState('openai');
  const [apiKey, setApiKey] = useState('');
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

  // ── Hooks ──
  const [downloadedFile, setDownloadedFile] = useState('');

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

  // ── Derived ──
  const canGenerate =
    apiKey.trim() && modelId && files.length > 0 &&
    gen.status !== 'parsing' && gen.status !== 'generating' && !gen.isStopped;

  // ── Inline Cell Edit ──
  function handleCellEdit(lessonIdx, sectionIdx, key, newValue) {
    if (!courseMap) return;
    const updated = JSON.parse(JSON.stringify(courseMap));
    const oldValue = updated.lessons[lessonIdx]?.sections?.[sectionIdx]?.[key] || '';
    if (oldValue === newValue) return;
    updated.lessons[lessonIdx].sections[sectionIdx][key] = newValue;
    setCourseMap(updated);
    setDownloadedFile('');
    setUserEdits(prev => [...prev, {
      lessonIdx, sectionIdx, key, oldValue, newValue,
      lessonTitle: updated.lessons[lessonIdx].title,
    }]);
    version.pushVersion(updated, `Edited ${key} in Lesson ${lessonIdx + 1}`);
  }

  function handleTitleEdit(lessonIdx, newTitle) {
    if (!courseMap) return;
    const updated = JSON.parse(JSON.stringify(courseMap));
    const oldTitle = updated.lessons[lessonIdx].title;
    if (oldTitle === newTitle) return;
    updated.lessons[lessonIdx].title = newTitle;
    setCourseMap(updated);
    setDownloadedFile('');
    setUserEdits(prev => [...prev, {
      lessonIdx, sectionIdx: -1, key: 'title',
      oldValue: oldTitle, newValue: newTitle, lessonTitle: newTitle,
    }]);
    version.pushVersion(updated, `Renamed Lesson ${lessonIdx + 1}`);
  }

  // ── Evaluate Design Checkbox Toggle ──
  function handleCheckToggle(lessonIdx, sectionIdx) {
    if (!courseMap) return;
    const updated = JSON.parse(JSON.stringify(courseMap));
    const current = updated.lessons[lessonIdx].sections[sectionIdx].evaluateDesign;
    updated.lessons[lessonIdx].sections[sectionIdx].evaluateDesign = !(current === true || current === 'true');
    setCourseMap(updated);
    setDownloadedFile('');
  }

  // ── Row / Section Management ──
  function handleAddSection(lessonIdx, insertAt) {
    if (!courseMap) return;
    const updated = JSON.parse(JSON.stringify(courseMap));
    const emptySection = {};
    const colKeys = columns.map(c => c.key);
    for (const key of colKeys) emptySection[key] = '';
    updated.lessons[lessonIdx].sections.splice(insertAt, 0, emptySection);
    setCourseMap(updated);
    setDownloadedFile('');
    version.pushVersion(updated, `Added section in Lesson ${lessonIdx + 1}`);
  }

  function handleDeleteSection(lessonIdx, sectionIdx) {
    if (!courseMap) return;
    const updated = JSON.parse(JSON.stringify(courseMap));
    if (updated.lessons[lessonIdx].sections.length <= 1) return;
    updated.lessons[lessonIdx].sections.splice(sectionIdx, 1);
    setCourseMap(updated);
    setDownloadedFile('');
    version.pushVersion(updated, `Deleted section in Lesson ${lessonIdx + 1}`);
  }

  function handleAddLesson() {
    if (!courseMap) return;
    const updated = JSON.parse(JSON.stringify(courseMap));
    const emptySection = {};
    const colKeys = columns.map(c => c.key);
    for (const key of colKeys) emptySection[key] = '';
    updated.lessons.push({
      title: `Lesson ${updated.lessons.length + 1}: New Lesson`,
      sections: [emptySection],
    });
    setCourseMap(updated);
    setDownloadedFile('');
    version.pushVersion(updated, `Added Lesson ${updated.lessons.length}`);
  }

  function handleDeleteLesson(lessonIdx) {
    if (!courseMap || courseMap.lessons.length <= 1) return;
    const updated = JSON.parse(JSON.stringify(courseMap));
    const title = updated.lessons[lessonIdx].title;
    updated.lessons.splice(lessonIdx, 1);
    setCourseMap(updated);
    setDownloadedFile('');
    version.pushVersion(updated, `Deleted ${title}`);
  }

  function handleMoveLesson(lessonIdx, direction) {
    if (!courseMap) return;
    const newIdx = lessonIdx + direction;
    if (newIdx < 0 || newIdx >= courseMap.lessons.length) return;
    const updated = JSON.parse(JSON.stringify(courseMap));
    const [moved] = updated.lessons.splice(lessonIdx, 1);
    updated.lessons.splice(newIdx, 0, moved);
    setCourseMap(updated);
    setDownloadedFile('');
    version.pushVersion(updated, `Moved ${moved.title} ${direction < 0 ? 'up' : 'down'}`);
  }

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
  }

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
    <div className="min-h-screen mesh-bg">
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
              className="tactile flex items-center gap-2 px-5 py-2.5 rounded-squircle-xs text-xs font-semibold text-slate-600 bg-white/60 border border-slate-200/50 hover:bg-white/80 shadow-glass transition-all duration-200"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New Project
            </button>
            <span className="text-[11px] text-slate-400 font-medium">
              {files.map(f => f.name).join(', ')}
            </span>
            {modelName && (
              <span className="ml-auto text-[11px] font-semibold text-indigo-600 bg-indigo-50/80 px-2.5 py-1 rounded-full">
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
              className={`tactile px-8 py-3.5 rounded-[12px] font-semibold text-white text-sm tracking-wide whitespace-nowrap transition-all duration-300 ${
                canGenerate
                  ? 'bg-gradient-to-r from-indigo-500 via-violet-500 to-purple-600 shadow-lg shadow-indigo-500/25 hover:shadow-xl hover:shadow-indigo-500/30 hover:brightness-105'
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
                className={`tactile p-2.5 rounded-squircle-xs transition-all duration-200 ${version.activeVersion > 0 ? 'text-slate-600 hover:bg-slate-100/60' : 'text-slate-300 cursor-not-allowed'}`}
                title="Undo"
              >
                <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a5 5 0 015 5v2M3 10l4-4M3 10l4 4" />
                </svg>
              </button>
              <button
                onClick={version.redo}
                disabled={version.activeVersion >= version.versionHistory.length - 1}
                className={`tactile p-2.5 rounded-squircle-xs transition-all duration-200 ${version.activeVersion < version.versionHistory.length - 1 ? 'text-slate-600 hover:bg-slate-100/60' : 'text-slate-300 cursor-not-allowed'}`}
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
            <span className="text-xs font-medium text-emerald-600 bg-emerald-50/80 px-3 py-1.5 rounded-full">
              {downloadedFile}
            </span>
          )}
        </div>

        {/* ── Progress Panel + Version History side-by-side ── */}
        {(gen.progressStep || gen.error || (version.versionHistory.length > 1 && !gen.isStreaming)) && (
          <div className="flex gap-4 items-start">
            {/* Progress Panel — takes remaining space */}
            <div className="flex-1 min-w-0">
              <ProgressPanel
                currentStep={gen.progressStep}
                modelName={modelName}
                error={gen.status === 'error' ? gen.error : null}
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
                onExport={handleDownload}
                onImport={handleImport}
                onRetryExamine={gen.handleRetryExamine}
              />
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
          <CourseMapPreview
            courseMap={courseMap}
            columns={columns}
            isStreaming={gen.isStreaming}
            oldCourseMap={oldCourseMap}
            onCellEdit={handleCellEdit}
            onTitleEdit={handleTitleEdit}
            onCheckToggle={handleCheckToggle}
            onAddSection={handleAddSection}
            onDeleteSection={handleDeleteSection}
            onAddLesson={handleAddLesson}
            onDeleteLesson={handleDeleteLesson}
            onMoveLesson={handleMoveLesson}
          />
        </div>
      )}
    </div>
  );
}

function VersionTimeline({ versions, activeVersion, onJump }) {
  const [expanded, setExpanded] = useState(false);
  const visibleVersions = expanded ? versions : versions.slice(-8);
  const offset = expanded ? 0 : Math.max(0, versions.length - 8);

  return (
    <div className="glass rounded-squircle-xs shadow-glass p-4 animate-spring-in">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-2">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          History
          <span className="text-[10px] font-normal text-slate-400">({versions.length})</span>
        </h3>
        {versions.length > 8 && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-[10px] font-medium text-indigo-500 hover:text-indigo-700 transition-colors"
          >
            {expanded ? 'Less' : 'All'}
          </button>
        )}
      </div>
      <div className="space-y-1 max-h-[320px] overflow-y-auto pr-1">
        {visibleVersions.map((v, i) => {
          const realIdx = offset + i;
          const isActive = realIdx === activeVersion;
          const time = new Date(v.timestamp);
          const timeStr = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          return (
            <button
              key={realIdx}
              onClick={() => onJump(realIdx)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-squircle-xs transition-all duration-200 text-left ${
                isActive
                  ? 'bg-indigo-100/80 border border-indigo-300/50 shadow-sm'
                  : 'hover:bg-slate-50/60 border border-transparent'
              }`}
              title={v.label}
            >
              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                isActive ? 'bg-indigo-500' : realIdx < activeVersion ? 'bg-emerald-400' : 'bg-slate-300'
              }`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-1">
                  <span className={`text-[11px] font-semibold ${isActive ? 'text-indigo-700' : 'text-slate-500'}`}>
                    v{realIdx + 1}
                  </span>
                  <span className="text-[9px] text-slate-300 flex-shrink-0">{timeStr}</span>
                </div>
                <span className="text-[10px] text-slate-400 truncate block">
                  {v.label}
                </span>
              </div>
            </button>
          );
        })}
      </div>
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
