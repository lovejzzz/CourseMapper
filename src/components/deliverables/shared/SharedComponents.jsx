import React, { useState, useCallback, useContext, useMemo, useRef, useEffect } from 'react';
import GenericDeliverableView from '../../GenericDeliverableView';
import EditProposalPanel from '../../EditProposalPanel';
import { computeAvgScore, scoreColor, signalBand } from '../../../lib/deliverableQualityScorer';
import { exportRubricGradebook } from '../../../lib/deliverableExporters';

// ── Feature 6.3: Quality Badge ──
export function QualityBadge({ quality }) {
  const [showTips, setShowTips] = useState(false);
  if (!quality) return null;
  const avg = computeAvgScore(quality);
  const colors = scoreColor(avg);
  const band = signalBand(avg);
  const { bloomsAlignment, specificity, actionability, qmAlignment, tips = [] } = quality;

  return (
    <div className="relative inline-block">
      <button
        onClick={() => setShowTips((v) => !v)}
        className={`flex items-center gap-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full border ${colors.bg} ${colors.text} ${colors.border} hover:opacity-80 transition-opacity`}
        title="Automated content signals — click for details"
      >
        <span>Signals: {band.shortLabel}</span>
      </button>
      {showTips && (
        <div className="absolute right-0 top-full mt-1.5 w-64 bg-white/98 backdrop-blur-xl rounded-lg border border-slate-200/60 shadow-xl z-50 p-3 space-y-2 animate-spring-in">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-bold text-slate-700">Automated content signals</span>
            <button
              onClick={() => setShowTips(false)}
              className="text-slate-400 hover:text-slate-600 text-xs"
              aria-label="Close automated content signals"
            >
              ✕
            </button>
          </div>
          <div className="space-y-1.5">
            {[
              { label: "Bloom's markers", score: bloomsAlignment },
              { label: 'Specific detail', score: specificity },
              { label: 'Action cues', score: actionability },
              ...(qmAlignment !== undefined ? [{ label: 'Design markers', score: qmAlignment }] : []),
            ].map(({ label, score }) => {
              const c = scoreColor(score);
              return (
                <div key={label} className="flex items-center gap-2">
                  <span className="text-xs text-slate-500 w-28 flex-shrink-0">{label}</span>
                  <div className="flex-1 h-1 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-1 rounded-full ${c.bg.replace('bg-', 'bg-').replace('-100', '-400')}`}
                      style={{ width: `${score * 10}%` }}
                    />
                  </div>
                  <span className={`text-xs font-bold ${c.text}`}>{signalBand(score).shortLabel}</span>
                </div>
              );
            })}
          </div>
          <p className="text-xs leading-relaxed text-slate-500 border-t border-slate-100 pt-2">
            Deterministic keyword and structure proxies. They do not verify facts, sources, accessibility, teachability,
            or external rubric conformance.
          </p>
          {tips.length > 0 && (
            <div className="pt-2 border-t border-slate-100 space-y-1">
              <p className="text-xs font-semibold text-slate-500">Improvement Tips</p>
              {tips.map((tip, i) => (
                <p key={i} className="text-xs text-slate-600 leading-snug">
                  • {tip}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Immutable nested update helper ───
export function updatePath(obj, path, value) {
  if (path.length === 0) return value;
  const [key, ...rest] = path;
  if (Array.isArray(obj)) {
    const arr = [...obj];
    arr[key] = updatePath(arr[key], rest, value);
    return arr;
  }
  return { ...obj, [key]: updatePath(obj?.[key], rest, value) };
}

// ─── Editable text field (click-to-edit) ───
export function editableTextValue(value) {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);

  // Legacy and provider-authored list entries occasionally arrive as small
  // labeled objects (for example { step: "..." } or { name: "..." }). They
  // are still useful course content, so display the human field instead of
  // letting React throw while rendering the object as a child.
  if (typeof value === 'object') {
    for (const key of ['text', 'step', 'name', 'title', 'label', 'description', 'value']) {
      const candidate = value?.[key];
      if (typeof candidate === 'string' || typeof candidate === 'number' || typeof candidate === 'boolean') {
        return String(candidate);
      }
    }
    try {
      return JSON.stringify(value);
    } catch {
      return '';
    }
  }

  return String(value);
}

export function E({ value, path, onEdit, className = '', multiline = false, onAIContextMenu }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const textareaRef = useRef(null);
  const textValue = editableTextValue(value);

  // Auto-size textarea on mount and on content change
  useEffect(() => {
    if (editing && textareaRef.current) {
      const el = textareaRef.current;
      el.style.height = 'auto';
      el.style.height = Math.max(el.scrollHeight, 32) + 'px';
    }
  }, [editing, draft]);

  if (!onEdit) return <span className={className}>{textValue}</span>;

  if (editing) {
    // Determine a reasonable minimum height based on content length
    const textLen = (draft || '').length;
    const minRows = multiline
      ? Math.max(3, (draft || '').split('\n').length)
      : textLen > 100
        ? 3
        : textLen > 40
          ? 2
          : 1;
    // Strip white/light text classes so text is always visible on the white bg textarea
    const editClass = className
      .replace(/\btext-white\b/g, '')
      .replace(/\btext-\[#(?:FFF|fff|FFFFFF|ffffff)\b[^\]]*\]/g, '')
      .replace(/\btext-slate-\d+\b/g, '');
    return (
      <textarea
        ref={textareaRef}
        autoFocus
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          // Auto-resize on typing
          e.target.style.height = 'auto';
          e.target.style.height = Math.max(e.target.scrollHeight, 32) + 'px';
        }}
        onBlur={() => {
          if (draft !== textValue) onEdit(path, draft);
          setEditing(false);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setDraft(textValue);
            setEditing(false);
          }
          if (e.key === 'Enter' && !multiline && !e.shiftKey) {
            e.preventDefault();
            if (draft !== textValue) onEdit(path, draft);
            setEditing(false);
          }
        }}
        className={`${editClass} bg-white text-slate-800 border border-indigo-200 rounded px-1.5 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-y w-full text-xs leading-relaxed`}
        rows={minRows}
        style={{ minWidth: '120px' }}
      />
    );
  }

  const handleCtxMenu = (e) => {
    if (!onAIContextMenu || !textValue.trim()) return;
    onAIContextMenu(e, { type: 'deliverableField', path, currentValue: textValue });
  };

  return (
    <span
      onClick={() => {
        setDraft(textValue);
        setEditing(true);
      }}
      onContextMenu={handleCtxMenu}
      className={`${className} cursor-text hover:bg-white/20 rounded px-0.5 -mx-0.5 transition-colors inline-block min-w-[2em]`}
      title="Click to edit · Right-click for AI"
    >
      {textValue}
    </span>
  );
}

// ─── Resizable table header cell ───
export function ResizableTh({ children, width, onResize, className = '' }) {
  const thRef = useRef(null);
  const startX = useRef(0);
  const startW = useRef(0);

  const onMouseDown = useCallback(
    (e) => {
      e.preventDefault();
      startX.current = e.clientX;
      startW.current = thRef.current?.offsetWidth || width || 100;

      const onMouseMove = (ev) => {
        const delta = ev.clientX - startX.current;
        const newW = Math.max(40, startW.current + delta);
        if (onResize) onResize(newW);
      };
      const onMouseUp = () => {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
      };
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    },
    [width, onResize],
  );

  return (
    <th
      ref={thRef}
      className={`relative ${className}`}
      style={width ? { width: `${width}px`, minWidth: `${Math.min(width, 40)}px` } : undefined}
    >
      {children}
      <div
        onMouseDown={onMouseDown}
        className="absolute top-0 right-0 w-1.5 h-full cursor-col-resize hover:bg-indigo-300/50 active:bg-indigo-400/60 z-10"
        title="Drag to resize"
      />
    </th>
  );
}

// ─── Save to Bank button helper ───
export function SaveToBankButton({ onClick }) {
  const [saved, setSaved] = useState(false);
  const handleClick = () => {
    onClick();
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };
  return (
    <button
      onClick={handleClick}
      className={`flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded transition-all ${saved ? 'text-emerald-600 bg-emerald-50 border border-emerald-200' : 'text-slate-400 bg-slate-50 border border-slate-200 hover:text-amber-600 hover:bg-amber-50 hover:border-amber-200'}`}
      title="Save to Assessment Bank"
    >
      {saved ? '✓ Saved to Bank' : '💾 Save to Bank'}
    </button>
  );
}

export function StreamingBanner() {
  return (
    <div className="sticky top-0 z-10 mx-4 mt-2 mb-1 flex items-center gap-2.5 px-4 py-2 rounded-squircle-xs bg-indigo-50/80 border border-indigo-200/40 backdrop-blur-sm">
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
        <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
      </span>
      <p className="text-xs font-medium text-indigo-600">Writing content live — items appear as they're generated...</p>
    </div>
  );
}

export function ErrorState({ error, onRetry }) {
  const [retrying, setRetrying] = useState(false);

  async function handleRetry() {
    if (!onRetry || retrying) return;
    setRetrying(true);
    try {
      await onRetry();
    } finally {
      setRetrying(false);
    }
  }

  return (
    <div className="flex items-center justify-center py-20">
      <div className="glass rounded-squircle-sm p-6 max-w-md text-center space-y-4">
        <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center mx-auto">
          <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>
        <div>
          <p className="text-sm text-red-600 font-semibold">Generation failed</p>
          {error && <p className="text-xs text-red-400/80 mt-1.5 leading-relaxed max-w-[280px] mx-auto">{error}</p>}
        </div>
        {onRetry && (
          <button
            onClick={handleRetry}
            disabled={retrying}
            className="tactile inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold text-white bg-indigo-500 hover:bg-indigo-600 disabled:opacity-60 disabled:cursor-not-allowed transition-all duration-200"
          >
            {retrying ? (
              <>
                <svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Retrying…
              </>
            ) : (
              <>
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
                Retry generation
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}

export function WaitingState({ stage }) {
  return (
    <div className="py-10 space-y-6">
      {/* Spinner + message */}
      <div className="flex flex-col items-center text-center space-y-3">
        <div className="w-12 h-12 rounded-full bg-indigo-50 dark:bg-indigo-950/50 flex items-center justify-center">
          <svg className="animate-spin w-5 h-5 text-indigo-500" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
        {stage === 'courseMap' ? (
          <>
            <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">Building course structure...</p>
            <p className="text-xs text-slate-400 dark:text-slate-500 leading-relaxed max-w-sm">
              The course map is being generated first — it's the foundation for all your deliverables. Content will
              appear live once it begins.
            </p>
          </>
        ) : (
          <>
            <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">Generating...</p>
            <p className="text-xs text-slate-400 dark:text-slate-500 leading-relaxed max-w-sm">
              All deliverables are generating in parallel. Content will start streaming live shortly.
            </p>
          </>
        )}
        <div className="flex items-center justify-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '0ms' }} />
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '150ms' }} />
          <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
      </div>

      {/* Skeleton table preview */}
      <div className="mx-auto max-w-2xl px-4 animate-pulse">
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
          {/* Header row */}
          <div className="flex gap-4 px-4 py-3 bg-slate-50 dark:bg-slate-800/60">
            <div className="h-3 w-16 bg-slate-200 dark:bg-slate-700 rounded" />
            <div className="h-3 flex-1 bg-slate-200 dark:bg-slate-700 rounded" />
            <div className="h-3 w-24 bg-slate-200 dark:bg-slate-700 rounded" />
          </div>
          {/* Body rows */}
          {[1, 2, 3, 4].map((row) => (
            <div key={row} className="flex gap-4 px-4 py-3 border-t border-slate-100 dark:border-slate-800">
              <div className="h-3 w-16 bg-slate-100 dark:bg-slate-800 rounded" />
              <div
                className={`h-3 flex-1 bg-slate-100 dark:bg-slate-800 rounded ${row % 2 === 0 ? 'max-w-[80%]' : ''}`}
              />
              <div className="h-3 w-24 bg-slate-100 dark:bg-slate-800 rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export const FEATURE_META = {
  lessonPlans: {
    emoji: '📝',
    label: 'Lesson Plans',
    desc: 'Detailed week-by-week lesson plans with activities, objectives, and timing.',
  },
  rubrics: {
    emoji: '📊',
    label: 'Rubrics',
    desc: "Assessment rubrics aligned to Bloom's taxonomy levels for each assignment.",
  },
  slideDecks: {
    emoji: '🖥️',
    label: 'Slide Decks',
    desc: 'Presentation outlines with key concepts, discussion prompts, and slide notes.',
  },
  quizBank: {
    emoji: '❓',
    label: 'Quiz Bank',
    desc: 'Multiple-choice, short-answer, and essay questions organized by lesson.',
  },
  discussions: {
    emoji: '💬',
    label: 'Discussion Prompts',
    desc: 'Socratic discussion questions and response guides for each lesson.',
  },
  assignments: {
    emoji: '📋',
    label: 'Assignments',
    desc: 'Assignment briefs with learning objectives, instructions, and grading criteria.',
  },
  studyGuides: {
    emoji: '📖',
    label: 'Study Guides',
    desc: 'Student-facing study guides with key concepts, review questions, and exam prep.',
  },
  teachingGuides: {
    emoji: '🧭',
    label: 'Teaching Guides',
    desc: 'Instructor notes with pedagogical tips, common misconceptions, and pacing.',
  },
  syllabus: {
    emoji: '📄',
    label: 'Syllabus',
    desc: 'Complete course syllabus with policies, schedule, and grading breakdown.',
  },
  courseFaq: {
    emoji: '❔',
    label: 'Course FAQ',
    desc: 'Student-facing FAQ with answers to common questions about the course.',
  },
};

export function EmptyState({ featureId, onGenerate }) {
  const meta = featureId && FEATURE_META[featureId];
  if (!meta || !onGenerate) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-300 dark:text-slate-600">
        <div className="text-center space-y-2">
          <p className="text-sm font-medium">Not yet generated</p>
          <p className="text-xs">This will be created after the course map is ready.</p>
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-center justify-center py-16 px-6">
      <div className="text-center max-w-xs space-y-4 animate-spring-up">
        <div className="text-5xl">{meta.emoji}</div>
        <div>
          <p className="text-base font-semibold text-slate-700 dark:text-slate-200 mb-1">{meta.label}</p>
          <p className="text-sm text-slate-400 dark:text-slate-500 leading-relaxed">{meta.desc}</p>
        </div>
        <button
          onClick={onGenerate}
          className="tactile inline-flex items-center gap-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-md transition-all shadow-btn hover:shadow-btn-hover"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          Generate {meta.label} →
        </button>
      </div>
    </div>
  );
}

export function NotApplicableState({ disposition }) {
  const routeLabel = disposition?.routeLabel || 'the related course material';
  const openRoute = () => {
    if (!disposition?.routeFeatureId) return;
    window.dispatchEvent(
      new CustomEvent('coursemapper:focus-deliverable', {
        detail: { featureId: disposition.routeFeatureId },
      }),
    );
  };

  return (
    <div className="flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-lg rounded-squircle-sm border border-emerald-200/80 bg-emerald-50/70 p-7 text-center shadow-sm dark:border-emerald-800/60 dark:bg-emerald-950/20">
        <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300">
          <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m5 12 4 4L19 6" />
          </svg>
        </div>
        <p className="text-base font-semibold text-slate-800 dark:text-slate-100">{disposition?.summary}</p>
        {disposition?.detail && (
          <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">{disposition.detail}</p>
        )}
        {disposition?.routeFeatureId && (
          <button
            type="button"
            onClick={openRoute}
            className="mt-5 inline-flex items-center gap-2 rounded-lg border border-emerald-300 bg-white px-4 py-2 text-sm font-semibold text-emerald-800 transition hover:border-emerald-400 hover:bg-emerald-50 dark:border-emerald-700 dark:bg-slate-900 dark:text-emerald-200 dark:hover:bg-emerald-950/40"
          >
            Open {routeLabel}
            <span aria-hidden="true">→</span>
          </button>
        )}
      </div>
    </div>
  );
}

// Shared focus: DeliverableView provides { report(itemIndex) } so the chat
// agent knows which lesson card the instructor is working in.
export const ViewportContext = React.createContext(null);

export function CollapsibleCard({
  title,
  subtitle,
  metaLine = null,
  defaultOpen = false,
  accent = 'indigo',
  streaming = false,
  regenerating = false,
  fresh = false,
  onRegenerate,
  onTitleEdit,
  viewportIndex = null,
  children,
}) {
  const [open, setOpen] = useState(defaultOpen);
  const viewport = useContext(ViewportContext);
  const reportViewport = useCallback(() => {
    if (viewport?.report && viewportIndex != null) viewport.report(viewportIndex);
  }, [viewport, viewportIndex]);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const titleInputRef = useRef(null);

  const startTitleEdit = useCallback(
    (e) => {
      if (!onTitleEdit) return;
      e.stopPropagation();
      e.preventDefault();
      setTitleDraft(title || '');
      setEditingTitle(true);
    },
    [onTitleEdit, title],
  );

  useEffect(() => {
    if (editingTitle && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, [editingTitle]);

  const commitTitle = useCallback(() => {
    if (titleDraft && titleDraft !== title) {
      onTitleEdit(titleDraft);
    }
    setEditingTitle(false);
  }, [titleDraft, title, onTitleEdit]);

  return (
    <div
      onClickCapture={reportViewport}
      onFocusCapture={reportViewport}
      className={`glass rounded-squircle-xs overflow-hidden transition-all duration-500 ${streaming ? 'animate-pulse-subtle' : ''} ${regenerating ? 'ring-2 ring-violet-300/60' : ''} ${fresh && !regenerating ? 'ring-2 ring-emerald-400/70 bg-emerald-50/20' : ''}`}
    >
      <div className="flex items-center">
        {/* Chevron toggle — only this controls collapse/expand */}
        <button
          onClick={() => setOpen(!open)}
          className="ml-2 flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-md transition-colors hover:bg-white/40 sm:h-10 sm:w-10"
          aria-label={open ? `Collapse ${title}` : `Expand ${title}`}
          title={open ? 'Collapse' : 'Expand'}
        >
          <svg
            className={`w-4 h-4 text-${accent}-500 transition-transform duration-200 ${open ? 'rotate-90' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
        {/* Title area — click to edit */}
        <div className="flex-1 flex items-center gap-3 px-2 py-3.5 min-w-0">
          <div className="flex-1 min-w-0">
            {editingTitle ? (
              <input
                ref={titleInputRef}
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={commitTitle}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    commitTitle();
                  }
                  if (e.key === 'Escape') {
                    setEditingTitle(false);
                  }
                }}
                className="text-sm font-semibold text-slate-800 bg-white border border-indigo-200 rounded px-1.5 py-0.5 w-full focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
            ) : (
              <h3
                className={`text-sm font-semibold truncate ${fresh && !regenerating ? 'text-emerald-700' : 'text-slate-800'} ${onTitleEdit ? 'deliverable-editable-title cursor-text px-1.5 py-0.5 rounded border transition-colors' : ''}`}
                onClick={startTitleEdit}
                title={onTitleEdit ? 'Click to edit title' : undefined}
              >
                {title}
                {fresh && !regenerating && (
                  <span className="ml-2 text-[10px] font-bold text-emerald-500 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full align-middle">
                    ✦ new
                  </span>
                )}
              </h3>
            )}
            {subtitle && <p className="text-xs text-slate-400 truncate">{subtitle}</p>}
            {/* v0.14.4 WS-D (D1): registry identity line — id · kind · weight,
                always visible in the header even while the card is collapsed. */}
            {metaLine && (
              <p
                data-registry-identity="true"
                className="text-[12px] text-slate-500 dark:text-slate-400 truncate mt-0.5"
              >
                {metaLine}
              </p>
            )}
          </div>
          {streaming && (
            <span className="relative flex h-2 w-2 flex-shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
            </span>
          )}
          {fresh && !regenerating && !streaming && (
            <span className="relative flex h-2 w-2 flex-shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
          )}
        </div>
        {/* Per-lesson regenerate button */}
        {onRegenerate && !streaming && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRegenerate();
            }}
            disabled={regenerating}
            title="Regenerate this lesson"
            className="flex-shrink-0 flex items-center gap-1 px-3 py-3.5 text-xs font-semibold text-slate-400 hover:text-indigo-600 hover:bg-indigo-50/40 transition-all disabled:opacity-40 border-l border-slate-100/60"
          >
            {regenerating ? (
              <svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
            )}
            {regenerating ? 'Regen…' : 'Regen'}
          </button>
        )}
      </div>
      {open && <div className="px-5 pb-4 border-t border-slate-100/50">{children}</div>}
    </div>
  );
}

export function Badge({ children, color = 'indigo' }) {
  return (
    <span
      className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full bg-${color}-100/80 text-${color}-700`}
    >
      {children}
    </span>
  );
}

// ─── Bloom's level badge ───
export const BLOOMS_COLORS = {
  Remember: 'bg-slate-100 text-slate-600',
  Understand: 'bg-sky-100 text-sky-700',
  Apply: 'bg-teal-100 text-teal-700',
  Analyze: 'bg-violet-100 text-violet-700',
  Evaluate: 'bg-amber-100 text-amber-700',
  Create: 'bg-rose-100 text-rose-700',
};
export function BloomsTag({ level }) {
  if (!level) return null;
  const cls = BLOOMS_COLORS[level] || 'bg-slate-100 text-slate-600';
  return (
    <span className={`inline-block text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide ${cls}`}>
      {level}
    </span>
  );
}

// ─── Section heading ───
export function SectionHeading({ children }) {
  return <h4 className="text-xs font-semibold text-slate-500 mb-1.5">{children}</h4>;
}

// ── v0.14.4 WS-D (D1): lesson grouping chrome ───────────────────────────────
// A compact horizontal jump-nav rail (L1…L13 + Ungrouped) pinned to the top
// of the view's scroll container, and the sticky lesson group header it jumps
// to. Both stay 12px (the WS-E scale floor) and carry dark: variants.

export function LessonJumpRail({ groups, onJump }) {
  if (!Array.isArray(groups) || groups.length < 2) return null;
  return (
    <nav
      aria-label="Jump to lesson"
      data-jump-nav-rail="true"
      className="sticky top-0 z-20 flex items-center gap-1 h-10 px-1.5 -mx-1.5 overflow-x-auto bg-white/85 dark:bg-slate-900/85 backdrop-blur-sm rounded-lg"
    >
      {groups.map((group) => (
        <button
          key={group.key}
          type="button"
          data-jump-nav={group.key}
          onClick={() => onJump?.(group.key)}
          title={
            group.lessonNumber != null
              ? `Jump to Lesson ${group.lessonNumber} (${group.items.length} item${group.items.length !== 1 ? 's' : ''})`
              : `Jump to ungrouped items (${group.items.length})`
          }
          className="tactile flex-shrink-0 text-[12px] font-semibold px-2 py-0.5 rounded-full text-slate-500 dark:text-slate-400 bg-slate-100/80 dark:bg-slate-800/80 border border-slate-200/70 dark:border-slate-700/70 hover:text-indigo-600 dark:hover:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 hover:border-indigo-200/70 dark:hover:border-indigo-800/70 transition-colors duration-150"
        >
          {group.lessonNumber != null ? `L${group.lessonNumber}` : 'Ungrouped'}
        </button>
      ))}
    </nav>
  );
}

export function LessonGroupHeader({ groupKey, lessonNumber, lessonTitle, count, headerRef }) {
  return (
    <div
      ref={headerRef}
      data-lesson-group-header={groupKey}
      className="sticky top-10 z-10 scroll-mt-12 flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-50/95 dark:bg-slate-800/95 backdrop-blur-sm border border-slate-200/60 dark:border-slate-700/60"
    >
      <span className="text-[12px] font-semibold text-slate-700 dark:text-slate-200 truncate">
        {lessonNumber != null ? `Lesson ${lessonNumber}` : 'Ungrouped'}
        {lessonTitle ? ` — ${lessonTitle}` : ''}
      </span>
      <span
        data-group-count="true"
        className="ml-auto flex-shrink-0 text-[12px] font-medium tabular-nums text-slate-500 dark:text-slate-400 bg-white/80 dark:bg-slate-900/60 border border-slate-200/60 dark:border-slate-700/60 px-2 py-0.5 rounded-full"
      >
        {count}
      </span>
    </div>
  );
}

// ── Feature 4.1: Tiered Differentiation Inline Toggle ──
export function TierToggle({ activeTier, onChange }) {
  const tiers = [
    { id: 'scaffolded', label: '🧩 Scaffolded', color: 'text-blue-600 bg-blue-50 border-blue-200' },
    { id: 'standard', label: '📋 Standard', color: 'text-slate-600 bg-slate-100 border-slate-200' },
    { id: 'extension', label: '🚀 Extension', color: 'text-rose-600 bg-rose-50 border-rose-200' },
  ];

  return (
    <div className="flex items-center bg-white border border-slate-200 rounded-lg p-0.5 shadow-sm inline-flex">
      {tiers.map(({ id, label, color }) => (
        <button
          key={id}
          onClick={(e) => {
            e.stopPropagation();
            onChange(id);
          }}
          className={`px-3 py-1 rounded-md text-xs font-semibold transition-all border ${
            activeTier === id
              ? color + ' shadow-sm'
              : 'text-slate-400 bg-transparent border-transparent hover:text-slate-600'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
