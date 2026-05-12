import React, { useState, useCallback, useEffect, useRef } from 'react';
import ModelConfig from '../components/ModelConfig';
import { useAuth } from '../contexts/AuthContext';
import { useAIConfig } from '../contexts/AIConfigContext';
import { useCourse } from '../contexts/CourseContext';
import UserMenu from '../components/UserMenu';
import DarkModeToggle from '../components/DarkModeToggle';

const ACCEPTED_EXTENSIONS = [
  '.doc',
  '.docx',
  '.pdf',
  '.txt',
  '.md',
  '.csv',
  '.rtf',
  '.html',
  '.htm',
  '.xlsx',
  '.xls',
  '.ods',
  '.ppt',
  '.pptx',
  '.odp',
  '.odt',
  '.epub',
  '.key',
  '.pages',
  '.zip',
];

const PROJECT_EXTENSIONS = ['.coursemapper', '.json'];

function isProjectFile(file) {
  const ext = '.' + file.name.split('.').pop().toLowerCase();
  return PROJECT_EXTENSIONS.includes(ext);
}

function isValidFile(file) {
  const ext = '.' + file.name.split('.').pop().toLowerCase();
  return ACCEPTED_EXTENSIONS.includes(ext);
}

function formatSize(bytes) {
  if (!bytes || bytes === 0) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

export default function Landing({
  onGenerate,
  canGenerate,
  isGenerating,
  // Session restore
  hasSavedSession,
  onRestoreSession,
  onDismissSavedSession,
  // Import course map
  onImportCourseMap,
  // Open full .coursemapper project file
  onOpenProject,
  // Quick-fill example chips — sets prompt + pre-parses lesson hints
  onExampleSelect,
  // Cloud project management
  onOpenProjects,
  developerMode = false,
  onDeveloperModeChange,
}) {
  const { user } = useAuth();
  const { provider, apiKey, modelId, modelName, apiStatus } = useAIConfig();
  const { files, setFiles, promptText, setPromptText, columns, setColumns } = useCourse();
  const [isDragging, setIsDragging] = useState(false);
  const [projectDragging, setProjectDragging] = useState(false);

  // ── Auto-collapse AI config when already connected ──
  const isReady = apiStatus === 'connected';
  const [configCollapsed, setConfigCollapsed] = useState(isReady);

  // Auto-collapse only when apiStatus transitions TO 'connected' (not on mount).
  // This prevents the panel from re-collapsing when the user clicks "Edit".
  const prevApiStatusRef = useRef(apiStatus);
  useEffect(() => {
    const prev = prevApiStatusRef.current;
    prevApiStatusRef.current = apiStatus;
    if (apiStatus === 'connected' && prev !== 'connected') {
      setConfigCollapsed(true);
    }
  }, [apiStatus]);

  const handleDrop = useCallback(
    (e) => {
      e.preventDefault();
      setIsDragging(false);
      setProjectDragging(false);
      const allFiles = Array.from(e.dataTransfer.files);
      // If a .coursemapper file is dropped, open it as a full project
      const projectFile = allFiles.find(isProjectFile);
      if (projectFile && onOpenProject) {
        onOpenProject(projectFile);
        return;
      }
      const dropped = allFiles.filter(isValidFile);
      if (dropped.length > 0) setFiles((prev) => [...prev, ...dropped]);
    },
    [setFiles, onOpenProject],
  );

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.items || []);
    const hasProject = files.some((item) => {
      const name = item.getAsFile?.()?.name || '';
      return name.endsWith('.coursemapper') || name.endsWith('.json');
    });
    setProjectDragging(hasProject);
    setIsDragging(!hasProject);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);
    setProjectDragging(false);
  }, []);

  const handleFileInput = useCallback(
    (e) => {
      const allFiles = Array.from(e.target.files);
      // If a .coursemapper file is selected, open it as a full project
      const projectFile = allFiles.find(isProjectFile);
      if (projectFile && onOpenProject) {
        onOpenProject(projectFile);
        e.target.value = '';
        return;
      }
      const selected = allFiles.filter(isValidFile);
      if (selected.length > 0) setFiles((prev) => [...prev, ...selected]);
      e.target.value = '';
    },
    [setFiles, onOpenProject],
  );

  const removeFile = useCallback(
    (index) => {
      setFiles((prev) => prev.filter((_, i) => i !== index));
    },
    [setFiles],
  );

  // Build a summary label for the collapsed AI config bar
  const configSummaryLabel = (() => {
    if (provider === 'webllm') return `Local AI · ${modelName || 'Qwen 3'}`;
    if (provider === 'openai') return `OpenAI · ${modelName || modelId || 'GPT'}`;
    if (provider === 'anthropic') return `Anthropic · ${modelName || modelId || 'Claude'}`;
    if (provider === 'google') return `Google · ${modelName || modelId || 'Gemini'}`;
    if (provider === 'deepseek') return `DeepSeek · ${modelName || modelId || 'V3'}`;
    return modelName || modelId || provider || 'AI Model';
  })();

  return (
    <div className="min-h-screen mesh-bg noise-overlay flex flex-col">
      {/* Minimal header with sign-in */}
      <header className="pt-5 px-8 flex justify-end items-center gap-2 max-w-3xl mx-auto w-full">
        <DarkModeToggle />
        <UserMenu
          onOpenProjects={onOpenProjects}
          developerMode={developerMode}
          onDeveloperModeChange={onDeveloperModeChange}
        />
      </header>

      {/* Centered content */}
      <main className="flex-1 flex items-center justify-center px-6 py-4">
        <div className="max-w-xl w-full space-y-6 animate-fade-up">
          {/* Logo */}
          <div className="text-center">
            <img
              src={`${import.meta.env.BASE_URL}CMlogo.png`}
              alt="Course Mapper"
              className="h-20 sm:h-24 w-auto mx-auto object-contain"
            />
          </div>

          {/* Tagline */}
          <div className="text-center space-y-2">
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-800 tracking-tight">
              Everything you need to teach a course.
            </h1>
            <p className="text-sm text-slate-500">
              Describe your course, drop a syllabus, or both — we'll handle the rest.
            </p>
          </div>

          {/* Try an example — quick fill chips */}
          {!promptText && files.length === 0 && (
            <div className="flex flex-wrap items-center justify-center gap-2 animate-fade-up">
              <span className="text-[10px] font-semibold text-slate-300 uppercase tracking-wider mr-1">Try:</span>
              {[
                {
                  label: '🧠 Intro to Psychology',
                  text: 'Introduction to Psychology, 15-week undergraduate course. Covers history of psychology, research methods, biological bases of behavior, sensation and perception, states of consciousness, learning, memory, cognition, development, motivation, emotion, social psychology, and abnormal psychology.',
                },
                {
                  label: '📊 Research Methods',
                  text: 'Research Methods in Social Sciences, 12-week graduate seminar. Covers qualitative and quantitative approaches, research design, survey methods, interviews, ethnography, statistical analysis, ethical considerations, and writing research proposals.',
                },
                {
                  label: '🌍 Social Policy',
                  text: 'Social Policy and Welfare, 14-week undergraduate course. Covers history of social welfare, policy analysis frameworks, healthcare policy, housing policy, income support, child welfare, aging policy, and advocacy skills.',
                },
              ].map(({ label, text }) => (
                <button
                  key={label}
                  onClick={() => (onExampleSelect ? onExampleSelect(text) : setPromptText(text))}
                  className="tactile flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/60 border border-slate-200/60 text-[11px] font-medium text-slate-500 hover:text-indigo-600 hover:border-indigo-200 hover:bg-indigo-50/40 transition-all duration-200"
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          {/* Restore session banner */}
          {hasSavedSession && (
            <div className="flex items-center gap-3 px-4 py-3 rounded-squircle-xs bg-white/50 border border-indigo-200/40 animate-spring-in">
              <div className="w-8 h-8 rounded-squircle-xs bg-indigo-100/80 flex items-center justify-center flex-shrink-0">
                <svg className="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-slate-700">You have a previous session</p>
                <p className="text-[11px] text-slate-400">Pick up where you left off, or start fresh.</p>
              </div>
              <button
                onClick={onRestoreSession}
                className="tactile flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[11px] font-semibold text-white bg-gradient-to-r from-indigo-500 to-violet-500 shadow-sm hover:brightness-[1.06] transition-all"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
                Resume
              </button>
              <button
                onClick={onDismissSavedSession}
                className="text-slate-300 hover:text-red-400 transition-colors flex-shrink-0 p-1"
                title="Dismiss and start fresh"
                aria-label="Dismiss saved session"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}

          {/* Combined input zone: file drop + text prompt */}
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            className={`relative rounded-squircle-sm transition-all duration-300 ${
              isDragging
                ? 'border-2 border-indigo-400 bg-indigo-50/30 scale-[1.01] shadow-glow-indigo'
                : 'border-2 border-slate-200/70 bg-white/40 focus-within:border-indigo-400/50 focus-within:bg-white/50'
            }`}
          >
            {/* Text prompt */}
            <textarea
              value={promptText}
              onChange={(e) => setPromptText(e.target.value)}
              placeholder={
                files.length > 0
                  ? 'Add any extra context or instructions... (optional)'
                  : 'Describe your course, or drop a syllabus above — e.g. "Intro to Psychology, 15 weeks, undergrad"'
              }
              rows={files.length > 0 ? 2 : 4}
              className="w-full bg-transparent px-4 pt-4 pb-2 text-sm resize-none focus:outline-none placeholder:text-slate-400/60"
            />

            {/* File list */}
            {files.length > 0 && (
              <div className="px-3 pb-2 space-y-1">
                {files.map((file, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between bg-white/60 rounded-lg px-3 py-1.5 animate-spring-in"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <FileIcon ext={file.name.split('.').pop()} />
                      <span className="text-xs font-medium text-slate-700 truncate">{file.name}</span>
                      {file.size > 0 && (
                        <span className="text-[10px] text-slate-400 flex-shrink-0">{formatSize(file.size)}</span>
                      )}
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeFile(i);
                      }}
                      className="text-slate-300 hover:text-red-400 transition-colors ml-2 flex-shrink-0"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Bottom toolbar: browse button + drag hint */}
            <div className="flex items-center justify-between px-3 pb-3 pt-1">
              <button
                type="button"
                onClick={() => document.getElementById('landing-file-input').click()}
                className="tactile flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium text-slate-400 hover:text-indigo-600 hover:bg-indigo-50/50 transition-all duration-200"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
                  />
                </svg>
                {files.length > 0 ? 'Add files' : 'Attach files'}
              </button>
              <span className="text-[10px] text-slate-300 text-right">
                {isDragging ? (
                  'Drop to attach'
                ) : (
                  <>
                    .pdf .docx .xlsx .pptx .txt and more
                    <br />
                    <span className="text-slate-300/60">
                      or drop a <span className="font-medium text-emerald-400/70">.coursemapper</span> file to resume a
                      project
                    </span>
                  </>
                )}
              </span>
            </div>

            <input
              id="landing-file-input"
              type="file"
              multiple
              accept={[...ACCEPTED_EXTENSIONS, ...PROJECT_EXTENSIONS].join(',')}
              onChange={handleFileInput}
              className="hidden"
            />

            {/* Drag overlay — syllabus files */}
            {isDragging && (
              <div className="absolute inset-0 rounded-squircle-sm bg-indigo-500/5 flex items-center justify-center pointer-events-none">
                <div className="flex items-center gap-2 text-sm font-medium text-indigo-500">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                    />
                  </svg>
                  Drop course files or .coursemapper project
                </div>
              </div>
            )}

            {/* Drag overlay — .coursemapper project file */}
            {projectDragging && (
              <div className="absolute inset-0 rounded-squircle-sm bg-emerald-500/5 border-2 border-dashed border-emerald-400/40 flex items-center justify-center pointer-events-none">
                <div className="flex items-center gap-2 text-sm font-semibold text-emerald-600">
                  <span>📂</span>
                  Open project
                </div>
              </div>
            )}
          </div>

          {/* AI Model config — collapsible when already connected */}
          {configCollapsed ? (
            /* Collapsed summary bar */
            <div className="flex items-center justify-center gap-3 text-sm text-slate-500">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
                {configSummaryLabel}
              </span>
              <span className="text-slate-300">·</span>
              <span className="text-emerald-600 font-medium">Connected</span>
              <button
                onClick={() => setConfigCollapsed(false)}
                className="tactile flex items-center gap-1 text-indigo-500 hover:text-indigo-700 transition-colors duration-150"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                  />
                </svg>
                Edit
              </button>
            </div>
          ) : (
            /* Expanded ModelConfig */
            <div className="relative">
              {isReady && (
                <button
                  onClick={() => setConfigCollapsed(true)}
                  className="absolute top-3 right-3 z-10 tactile flex items-center justify-center w-7 h-7 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100/60 transition-all duration-200"
                  title="Collapse AI config"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                  </svg>
                </button>
              )}
              <ModelConfig />
            </div>
          )}

          {/* Continue button */}
          <button
            onClick={onGenerate}
            disabled={!canGenerate || isGenerating}
            className={`tactile btn-glow w-full px-8 py-4 rounded-squircle-xs font-semibold text-sm tracking-wide transition-all duration-300 ${
              canGenerate && !isGenerating
                ? 'text-white bg-gradient-to-r from-indigo-500 via-violet-500 to-purple-600 shadow-lg shadow-indigo-500/25 hover:shadow-glow-violet hover:brightness-[1.06]'
                : 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
            }`}
          >
            {isGenerating ? (
              <span className="flex items-center justify-center gap-2.5">
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Generating...
              </span>
            ) : (
              <span className="flex items-center justify-center gap-2.5">
                Continue
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </span>
            )}
          </button>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-4 text-center space-y-1">
        <p className="text-[10px] text-slate-300/70">
          Built by the Educational Technology team at NYU Silver School of Social Work
        </p>
        <div className="flex items-center justify-center gap-3 text-[10px] text-slate-300/70">
          <a href="#/changelog" className="font-medium hover:text-indigo-500 transition-colors duration-200">
            v0.6
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
    </div>
  );
}

function FileIcon({ ext }) {
  const colors = {
    doc: 'text-blue-500',
    docx: 'text-blue-500',
    odt: 'text-blue-400',
    rtf: 'text-blue-400',
    pdf: 'text-red-500',
    txt: 'text-slate-500',
    md: 'text-slate-500',
    csv: 'text-slate-500',
    html: 'text-orange-500',
    htm: 'text-orange-500',
    xlsx: 'text-green-500',
    xls: 'text-green-500',
    ods: 'text-green-400',
    ppt: 'text-amber-500',
    pptx: 'text-amber-500',
    odp: 'text-amber-400',
    epub: 'text-purple-500',
    zip: 'text-slate-600',
  };
  return (
    <div className={`flex-shrink-0 ${colors[ext] || 'text-slate-400'}`}>
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
        />
      </svg>
    </div>
  );
}
