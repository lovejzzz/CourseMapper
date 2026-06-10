import React, { useState, useCallback, useEffect, useRef } from 'react';
import ModelConfig from '../components/ModelConfig';
import { useAuth } from '../contexts/AuthContext';
import { useAIConfig } from '../contexts/AIConfigContext';
import { useCourse } from '../contexts/CourseContext';
import UserMenu from '../components/UserMenu';
import DarkModeToggle from '../components/DarkModeToggle';
import AppLogo from '../components/AppLogo';

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

export const COURSE_EXAMPLES = [
  {
    label: '🧠 Intro to Psychology',
    text: 'Introduction to Psychology, 15-week undergraduate survey course with weekly lectures, discussion sections, low-stakes quizzes, a midterm, and a final applied reflection. Covers history of psychology, research methods, biological bases of behavior, sensation and perception, learning, memory, cognition, development, social psychology, and abnormal psychology.',
  },
  {
    label: '📊 Research Methods',
    text: 'Research Methods in the Social Sciences, 12-week graduate seminar with scaffolded proposal milestones, peer review workshops, mixed-methods labs, and a final research design portfolio. Covers qualitative and quantitative approaches, sampling, survey design, interviewing, ethnography, descriptive statistics, ethics, and research proposal writing.',
  },
  {
    label: '🌍 Social Policy',
    text: 'Social Policy and Welfare, 14-week undergraduate course with weekly case briefs, policy memos, debate activities, and a final advocacy project. Covers social welfare history, policy analysis frameworks, healthcare policy, housing policy, income support, child welfare, aging policy, disability policy, and legislative advocacy.',
  },
  {
    label: '🤖 Machine Learning',
    text: 'Applied Machine Learning, 10-week graduate technical course with Python notebooks, weekly dataset labs, model critique discussions, and a final predictive modeling project. Covers supervised learning, train/test splits, regression, classification, decision trees, random forests, neural networks, evaluation metrics, overfitting, fairness, and model documentation.',
  },
  {
    label: '🧪 Organic Chemistry Lab',
    text: 'Organic Chemistry Laboratory, 8-week in-person undergraduate lab course with pre-lab checks, bench experiments, lab notebook grading, safety briefings, and formal lab reports. Covers purification, chromatography, spectroscopy, substitution and elimination reactions, synthesis planning, yield analysis, and lab safety practices.',
  },
  {
    label: '🏛️ Art History',
    text: 'Global Art History: 1400 to Present, 13-week undergraduate seminar with visual analysis exercises, museum object studies, short comparison papers, and a final curatorial proposal. Covers Renaissance art, colonial visual culture, modernism, photography, architecture, protest art, global contemporary movements, and methods for interpreting material culture.',
  },
  {
    label: '💼 Startup Finance',
    text: 'Startup Finance and Venture Strategy, 6-week executive certificate course with async finance primers, live case workshops, valuation spreadsheets, investor memo practice, and a capstone pitch deck. Covers unit economics, runway, fundraising stages, cap tables, term sheets, valuation methods, scenario planning, and board-level financial storytelling.',
  },
  {
    label: '🧑‍⚕️ Public Health',
    text: 'Public Health Program Planning, 11-week hybrid graduate course with community needs assessment, logic model studios, evaluation plan checkpoints, and team presentations. Covers epidemiologic thinking, social determinants of health, stakeholder mapping, intervention design, health equity, implementation barriers, evaluation metrics, and grant-style planning.',
  },
  {
    label: '⚖️ Business Law',
    text: 'Business Law for Managers, 9-week online MBA course with short legal issue briefs, contract annotation drills, scenario-based quizzes, and a final risk advisory memo. Covers contracts, torts, employment law, intellectual property, data privacy, entity formation, regulatory compliance, negotiation ethics, and legal risk communication.',
  },
  {
    label: '🧩 UX Design Studio',
    text: 'User Experience Design Studio, 12-week project-based undergraduate course with critique sessions, design journals, usability testing labs, prototype reviews, and a final portfolio case study. Covers design research, personas, journey maps, information architecture, wireframing, interaction patterns, accessibility, usability testing, and design handoff.',
  },
  {
    label: '🎬 Film Studies',
    text: 'Film Form and Cultural Analysis, 10-week undergraduate humanities course with weekly screenings, shot-analysis workshops, short response papers, and a final scene analysis essay. Covers mise-en-scene, cinematography, editing, sound, genre, spectatorship, documentary form, global cinema, authorship, and ideology critique.',
  },
  {
    label: '🌱 Climate Justice',
    text: 'Climate Justice and Community Resilience, 7-week intensive seminar with policy labs, community case studies, environmental justice mapping, and a final resilience action plan. Covers climate science basics, environmental racism, adaptation planning, disaster recovery, energy transitions, Indigenous sovereignty, public participation, and climate policy tradeoffs.',
  },
  {
    label: '🧮 Data Analytics',
    text: 'Data Analytics for Decision-Making, 15-week undergraduate course with spreadsheet labs, dashboard critiques, statistics quizzes, and a final analytics report. Covers data cleaning, descriptive statistics, visualization, SQL basics, spreadsheet modeling, correlation, regression, dashboard design, uncertainty, and communicating findings to nontechnical audiences.',
  },
  {
    label: '🗣️ Spanish for Healthcare',
    text: 'Spanish for Healthcare Professionals, 8-week skills course with role-play clinics, vocabulary practice, cultural humility reflections, oral proficiency checks, and a final patient-interview simulation. Covers intake questions, symptoms, medication instructions, family history, pain description, consent language, interpreter collaboration, and respectful patient communication.',
  },
  {
    label: '🏙️ Urban Planning',
    text: 'Urban Planning and Community Development, 14-week graduate studio with neighborhood fieldwork, zoning analysis, stakeholder interviews, planning memo drafts, and a final community development plan. Covers land use, housing affordability, transportation equity, zoning, participatory planning, GIS mapping, economic development, and public meeting facilitation.',
  },
];

export function pickCourseExamples(examples = COURSE_EXAMPLES, count = 3) {
  const shuffled = [...examples];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, count);
}

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
  const [visibleCourseExamples, setVisibleCourseExamples] = useState(() => pickCourseExamples(COURSE_EXAMPLES, 3));

  // ── Auto-collapse AI config when already connected ──
  const isReady = apiStatus === 'connected';
  const [configCollapsed, setConfigCollapsed] = useState(isReady);
  const configManuallyExpandedRef = useRef(false);

  // Auto-collapse only when apiStatus transitions TO 'connected' (not on mount).
  // This prevents the panel from re-collapsing when the user clicks "Edit".
  const prevApiStatusRef = useRef(apiStatus);
  useEffect(() => {
    const prev = prevApiStatusRef.current;
    prevApiStatusRef.current = apiStatus;
    if (apiStatus === 'connected' && prev !== 'connected' && !configManuallyExpandedRef.current) {
      setConfigCollapsed(true);
    }
  }, [apiStatus]);

  const expandConfigForEditing = useCallback(() => {
    configManuallyExpandedRef.current = true;
    setConfigCollapsed(false);
  }, []);

  const collapseConfig = useCallback(() => {
    configManuallyExpandedRef.current = false;
    setConfigCollapsed(true);
  }, []);

  const shuffleCourseExamples = useCallback(() => {
    setVisibleCourseExamples((current) => {
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const next = pickCourseExamples(COURSE_EXAMPLES, 3);
        if (next.map((item) => item.label).join('|') !== current.map((item) => item.label).join('|')) return next;
      }
      return pickCourseExamples(COURSE_EXAMPLES, 3);
    });
  }, []);

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
    if (provider === 'webllm') return 'Choose an AI provider';
    if (provider === 'openai') return `OpenAI · ${modelName || modelId || 'GPT'}`;
    if (provider === 'anthropic') return `Anthropic · ${modelName || modelId || 'Claude'}`;
    if (provider === 'google') return `Google · ${modelName || modelId || 'Gemini'}`;
    if (provider === 'deepseek') return `DeepSeek · ${modelName || modelId || 'V3'}`;
    return modelName || modelId || provider || 'AI Model';
  })();

  return (
    <div className="landing-shell noise-overlay flex min-h-screen flex-col text-slate-900 dark:text-slate-100">
      <header className="px-5 py-4 sm:px-8">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between">
          <a href="#/" className="flex items-center" aria-label="EduTool.dev home">
            <AppLogo className="h-12 w-auto object-contain sm:h-14" />
          </a>
          <div className="flex items-center gap-2">
            <DarkModeToggle />
            <UserMenu
              onOpenProjects={onOpenProjects}
              developerMode={developerMode}
              onDeveloperModeChange={onDeveloperModeChange}
            />
          </div>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-5 py-10 sm:px-8">
        <div className="mx-auto flex w-full max-w-4xl flex-col">
          <section className="text-center animate-fade-up">
            <h1 className="text-3xl font-semibold leading-[1.08] text-slate-950 dark:text-white sm:text-4xl md:whitespace-nowrap">
              Everything you need to teach/learn a course.
            </h1>
          </section>

          <div className="mt-8">
            <section className="rounded-[28px] border border-slate-200/80 bg-white/80 p-4 shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur-xl dark:border-slate-700/80 dark:bg-slate-950/70 dark:shadow-[0_24px_80px_rgba(0,0,0,0.35)] sm:p-5">
              <div className="text-center">
                <h2 className="text-base font-semibold text-slate-900 dark:text-white">Start a course workspace</h2>
              </div>

              {!promptText && files.length === 0 && (
                <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
                  <button
                    type="button"
                    data-testid="sample-courses-shuffle"
                    onClick={shuffleCourseExamples}
                    title="Shuffle sample courses"
                    className="tactile rounded-full px-0.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500 transition-colors hover:text-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-300 dark:text-slate-400 dark:hover:text-blue-200 dark:focus:ring-blue-500/50"
                  >
                    Try
                  </button>
                  {visibleCourseExamples.map(({ label, text }) => (
                    <button
                      key={label}
                      data-testid="course-example-chip"
                      data-example-text={text}
                      onClick={() => (onExampleSelect ? onExampleSelect(text) : setPromptText(text))}
                      className="tactile flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-600 transition-all duration-200 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-blue-400/40 dark:hover:bg-blue-400/10 dark:hover:text-blue-200"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}

              {hasSavedSession && (
                <div className="mt-5 flex items-center gap-3 rounded-2xl border border-blue-200/70 bg-blue-50/70 px-4 py-3 animate-spring-in dark:border-blue-400/20 dark:bg-blue-400/10">
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-white text-blue-600 dark:bg-slate-950 dark:text-blue-200">
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-slate-800 dark:text-slate-100">Previous session found</p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">Resume it or start fresh.</p>
                  </div>
                  <button
                    onClick={onRestoreSession}
                    className="tactile flex items-center gap-1.5 rounded-lg bg-slate-950 px-3.5 py-2 text-[11px] font-semibold text-white shadow-sm transition-all hover:brightness-110 dark:bg-white dark:text-slate-950"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                    className="flex-shrink-0 p-1 text-slate-400 transition-colors hover:text-red-500"
                    title="Dismiss and start fresh"
                    aria-label="Dismiss saved session"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              )}

              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                className={`relative mt-5 rounded-[22px] transition-all duration-300 ${
                  isDragging
                    ? 'scale-[1.01] border-2 border-blue-400 bg-blue-50/60 shadow-glow-indigo dark:bg-blue-400/10'
                    : 'border-2 border-slate-200 bg-white/80 focus-within:border-blue-400/70 dark:border-slate-700 dark:bg-slate-900/80 dark:focus-within:border-blue-400/70'
                }`}
              >
                <textarea
                  aria-label="Describe your course"
                  value={promptText}
                  onChange={(e) => setPromptText(e.target.value)}
                  placeholder={
                    files.length > 0
                      ? 'Describe what you want to build from the attached syllabus or source files...'
                      : 'Describe your course, or drop a syllabus here...'
                  }
                  rows={files.length > 0 ? 2 : 4}
                  className="w-full resize-none bg-transparent px-4 pb-2 pt-4 text-sm text-slate-800 placeholder:text-slate-500/80 focus:outline-none dark:text-slate-100 dark:placeholder:text-slate-500"
                />

                {files.length > 0 && (
                  <div className="space-y-1 px-3 pb-2">
                    {files.map((file, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-1.5 animate-spring-in dark:bg-slate-800"
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <FileIcon ext={file.name.split('.').pop()} />
                          <span className="truncate text-xs font-medium text-slate-700 dark:text-slate-200">
                            {file.name}
                          </span>
                          {file.size > 0 && (
                            <span className="flex-shrink-0 text-[10px] text-slate-400">{formatSize(file.size)}</span>
                          )}
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            removeFile(i);
                          }}
                          className="ml-2 flex-shrink-0 text-slate-300 transition-colors hover:text-red-400"
                          aria-label={`Remove ${file.name}`}
                        >
                          <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M6 18L18 6M6 6l12 12"
                            />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex items-center justify-between gap-3 px-3 pb-3 pt-1">
                  <button
                    type="button"
                    onClick={() => document.getElementById('landing-file-input').click()}
                    className="tactile flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-medium text-slate-500 transition-all duration-200 hover:bg-blue-50 hover:text-blue-600 dark:text-slate-400 dark:hover:bg-blue-400/10 dark:hover:text-blue-200"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
                      />
                    </svg>
                    {files.length > 0 ? 'Add files' : 'Attach files'}
                  </button>
                  <span className="text-right text-[10px] leading-4 text-slate-500 dark:text-slate-400">
                    {isDragging ? (
                      'Drop to attach'
                    ) : (
                      <>
                        .pdf .docx .xlsx .pptx .txt and more
                        <br />
                        <span className="text-slate-400 dark:text-slate-500">
                          drop a{' '}
                          <span className="font-medium text-emerald-600 dark:text-emerald-300">.coursemapper</span> file
                          to resume
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
                  aria-label="Attach course files or open a Course Mapper project"
                  className="hidden"
                />

                {isDragging && (
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-[22px] bg-blue-500/5">
                    <div className="flex items-center gap-2 text-sm font-medium text-blue-600 dark:text-blue-200">
                      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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

                {projectDragging && (
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-[22px] border-2 border-dashed border-emerald-400/50 bg-emerald-500/5">
                    <div className="flex items-center gap-2 text-sm font-semibold text-emerald-600 dark:text-emerald-300">
                      <span>📂</span>
                      Open project
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-5">
                {configCollapsed ? (
                  <div className="flex flex-wrap items-center justify-center gap-3 text-sm text-slate-500 dark:text-slate-400">
                    <span className="flex items-center gap-1.5">
                      <span className="inline-block h-2 w-2 rounded-full bg-emerald-400" />
                      {configSummaryLabel}
                    </span>
                    <span className="text-slate-300 dark:text-slate-600">·</span>
                    <span className="font-medium text-emerald-600 dark:text-emerald-300">Connected</span>
                    <button
                      onClick={expandConfigForEditing}
                      className="tactile flex items-center gap-1 text-blue-600 transition-colors duration-150 hover:text-blue-800 dark:text-blue-300 dark:hover:text-blue-100"
                    >
                      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                  <div className="relative">
                    {isReady && (
                      <button
                        onClick={collapseConfig}
                        className="tactile absolute right-3 top-3 z-10 flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition-all duration-200 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                        title="Collapse AI config"
                        aria-label="Collapse AI configuration"
                      >
                        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                        </svg>
                      </button>
                    )}
                    <ModelConfig />
                  </div>
                )}
              </div>

              <button
                onClick={onGenerate}
                disabled={!canGenerate || isGenerating}
                className={`tactile btn-glow mt-5 w-full rounded-2xl px-8 py-4 text-sm font-semibold tracking-wide transition-all duration-300 ${
                  canGenerate && !isGenerating
                    ? 'bg-slate-950 text-white shadow-lg shadow-slate-950/15 hover:brightness-110 dark:bg-white dark:text-slate-950 dark:shadow-white/10'
                    : 'cursor-not-allowed bg-slate-200/90 text-slate-500 shadow-none dark:bg-slate-800 dark:text-slate-500'
                }`}
              >
                {isGenerating ? (
                  <span className="flex items-center justify-center gap-2.5">
                    <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                      />
                    </svg>
                    Generating...
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-2.5">
                    Continue
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                    </svg>
                  </span>
                )}
              </button>
            </section>
          </div>
        </div>
      </main>

      <footer className="px-5 py-4 text-center">
        <p className="text-[10px] text-slate-500/80 dark:text-slate-400">
          Built by{' '}
          <a
            href="#/contact"
            className="font-medium transition-colors duration-200 hover:text-blue-600 dark:hover:text-blue-300"
          >
            Tian Xing
          </a>
        </p>
        <div className="mt-1 flex items-center justify-center gap-3 text-[10px] text-slate-500/80 dark:text-slate-400">
          <a
            href="#/changelog"
            className="font-medium transition-colors duration-200 hover:text-blue-600 dark:hover:text-blue-300"
          >
            v0.11.3
          </a>
          <span>·</span>
          <a href="#/privacy" className="transition-colors duration-200 hover:text-blue-600 dark:hover:text-blue-300">
            Privacy
          </a>
          <span>·</span>
          <a href="#/terms" className="transition-colors duration-200 hover:text-blue-600 dark:hover:text-blue-300">
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
