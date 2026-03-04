import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import GenericDeliverableView from '../../GenericDeliverableView';
import EditProposalPanel from '../../EditProposalPanel';
import { computeAvgScore, scoreColor } from '../../../lib/deliverableQualityScorer';
import { exportRubricGradebook } from '../../../lib/deliverableExporters';

// ── Feature 6.3: Quality Badge ──
export function QualityBadge({ quality }) {
  const [showTips, setShowTips] = useState(false);
  if (!quality) return null;
  const avg = computeAvgScore(quality);
  const colors = scoreColor(avg);
  const { bloomsAlignment, specificity, actionability, qmAlignment, tips = [] } = quality;

  return (
    <div className="relative inline-block">
      <button
        onClick={() => setShowTips(v => !v)}
        className={`flex items-center gap-1.5 text-[9px] font-bold px-2 py-0.5 rounded-full border ${colors.bg} ${colors.text} ${colors.border} hover:opacity-80 transition-opacity`}
        title="Quality score — click for tips"
      >
        <span>★ {avg}/10</span>
      </button>
      {showTips && (
        <div className="absolute right-0 top-full mt-1.5 w-64 bg-white/98 backdrop-blur-xl rounded-xl border border-slate-200/60 shadow-xl z-50 p-3 space-y-2 animate-spring-in">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-bold text-slate-700">Quality Scorecard</span>
            <button onClick={() => setShowTips(false)} className="text-slate-400 hover:text-slate-600 text-[10px]">✕</button>
          </div>
          <div className="space-y-1.5">
            {[
              { label: "Bloom's Alignment", score: bloomsAlignment },
              { label: 'Specificity', score: specificity },
              { label: 'Actionability', score: actionability },
              ...(qmAlignment !== undefined ? [{ label: 'QM Alignment', score: qmAlignment }] : []),
            ].map(({ label, score }) => {
              const c = scoreColor(score);
              return (
                <div key={label} className="flex items-center gap-2">
                  <span className="text-[9px] text-slate-500 w-28 flex-shrink-0">{label}</span>
                  <div className="flex-1 h-1 bg-slate-100 rounded-full overflow-hidden">
                    <div className={`h-1 rounded-full ${c.bg.replace('bg-', 'bg-').replace('-100', '-400')}`} style={{ width: `${score * 10}%` }} />
                  </div>
                  <span className={`text-[9px] font-bold ${c.text}`}>{score}</span>
                </div>
              );
            })}
          </div>
          {tips.length > 0 && (
            <div className="pt-2 border-t border-slate-100 space-y-1">
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Improvement Tips</p>
              {tips.map((tip, i) => (
                <p key={i} className="text-[10px] text-slate-600 leading-snug">• {tip}</p>
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
export function E({ value, path, onEdit, className = '', multiline = false }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const textareaRef = useRef(null);

  // Auto-size textarea on mount and on content change
  useEffect(() => {
    if (editing && textareaRef.current) {
      const el = textareaRef.current;
      el.style.height = 'auto';
      el.style.height = Math.max(el.scrollHeight, 32) + 'px';
    }
  }, [editing, draft]);

  if (!onEdit) return <span className={className}>{value || ''}</span>;

  if (editing) {
    // Determine a reasonable minimum height based on content length
    const textLen = (draft || '').length;
    const minRows = multiline ? Math.max(3, (draft || '').split('\n').length) : (textLen > 100 ? 3 : textLen > 40 ? 2 : 1);
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
        onChange={e => {
          setDraft(e.target.value);
          // Auto-resize on typing
          e.target.style.height = 'auto';
          e.target.style.height = Math.max(e.target.scrollHeight, 32) + 'px';
        }}
        onBlur={() => { if (draft !== (value || '')) onEdit(path, draft); setEditing(false); }}
        onKeyDown={e => {
          if (e.key === 'Escape') { setDraft(value || ''); setEditing(false); }
          if (e.key === 'Enter' && !multiline && !e.shiftKey) { e.preventDefault(); if (draft !== (value || '')) onEdit(path, draft); setEditing(false); }
        }}
        className={`${editClass} bg-white text-slate-800 border border-indigo-200 rounded px-1.5 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-300 resize-y w-full text-xs leading-relaxed`}
        rows={minRows}
        style={{ minWidth: '120px', color: '#1e293b' }}
      />
    );
  }

  return (
    <span
      onClick={() => { setDraft(value || ''); setEditing(true); }}
      className={`${className} cursor-text hover:bg-white/20 rounded px-0.5 -mx-0.5 transition-colors inline-block min-w-[2em]`}
      title="Click to edit"
    >
      {value || ''}
    </span>
  );
}

// ─── Resizable table header cell ───
export function ResizableTh({ children, width, onResize, className = '' }) {
  const thRef = useRef(null);
  const startX = useRef(0);
  const startW = useRef(0);

  const onMouseDown = useCallback((e) => {
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
  }, [width, onResize]);

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
      className={`flex items-center gap-1 text-[9px] font-semibold px-2 py-1 rounded transition-all ${saved ? 'text-emerald-600 bg-emerald-50 border border-emerald-200' : 'text-slate-400 bg-slate-50 border border-slate-200 hover:text-amber-600 hover:bg-amber-50 hover:border-amber-200'}`}
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
      <p className="text-[11px] font-medium text-indigo-600">Writing content live — items appear as they're generated...</p>
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
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <div>
          <p className="text-sm text-red-600 font-semibold">Generation failed</p>
          {error && (
            <p className="text-xs text-red-400/80 mt-1.5 leading-relaxed max-w-[280px] mx-auto">
              {error}
            </p>
          )}
        </div>
        {onRetry && (
          <button
            onClick={handleRetry}
            disabled={retrying}
            className="tactile inline-flex items-center gap-2 px-4 py-2 rounded-lg text-[11px] font-semibold text-white bg-indigo-500 hover:bg-indigo-600 disabled:opacity-60 disabled:cursor-not-allowed transition-all duration-200"
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
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
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
    <div className="flex items-center justify-center py-20">
      <div className="text-center space-y-4 max-w-sm">
        <div className="w-12 h-12 rounded-full bg-indigo-50 flex items-center justify-center mx-auto">
          <svg className="animate-spin w-5 h-5 text-indigo-500" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
        {stage === 'courseMap' ? (
          <>
            <p className="text-sm font-semibold text-slate-600">Building course structure...</p>
            <p className="text-xs text-slate-400 leading-relaxed">
              The course map is being generated first — it's the foundation for all your deliverables. This content will start appearing live once it begins.
            </p>
          </>
        ) : (
          <>
            <p className="text-sm font-semibold text-slate-600">Generating...</p>
            <p className="text-xs text-slate-400 leading-relaxed">
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
    </div>
  );
}

export const FEATURE_META = {
  lessonPlans: { emoji: '📝', label: 'Lesson Plans', desc: 'Detailed week-by-week lesson plans with activities, objectives, and timing.' },
  rubrics: { emoji: '📊', label: 'Rubrics', desc: 'Assessment rubrics aligned to Bloom\'s taxonomy levels for each assignment.' },
  slideDecks: { emoji: '🖥️', label: 'Slide Decks', desc: 'Presentation outlines with key concepts, discussion prompts, and slide notes.' },
  quizBank: { emoji: '❓', label: 'Quiz Bank', desc: 'Multiple-choice, short-answer, and essay questions organized by lesson.' },
  discussions: { emoji: '💬', label: 'Discussion Prompts', desc: 'Socratic discussion questions and response guides for each lesson.' },
  assignments: { emoji: '📋', label: 'Assignments', desc: 'Assignment briefs with learning objectives, instructions, and grading criteria.' },
  studyGuides: { emoji: '📖', label: 'Study Guides', desc: 'Student-facing study guides with key concepts, review questions, and exam prep.' },
  teachingGuides: { emoji: '🧭', label: 'Teaching Guides', desc: 'Instructor notes with pedagogical tips, common misconceptions, and pacing.' },
  syllabus: { emoji: '📄', label: 'Syllabus', desc: 'Complete course syllabus with policies, schedule, and grading breakdown.' },
  courseFaq: { emoji: '❔', label: 'Course FAQ', desc: 'Student-facing FAQ with answers to common questions about the course.' },
};

export function EmptyState({ featureId, onGenerate }) {
  const meta = featureId && FEATURE_META[featureId];
  if (!meta || !onGenerate) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-300">
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
          <p className="text-base font-semibold text-slate-700 mb-1">{meta.label}</p>
          <p className="text-sm text-slate-400 leading-relaxed">{meta.desc}</p>
        </div>
        <button
          onClick={onGenerate}
          className="tactile inline-flex items-center gap-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl transition-all shadow-btn hover:shadow-btn-hover"
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

export function CollapsibleCard({ title, subtitle, defaultOpen = false, accent = 'indigo', streaming = false, regenerating = false, fresh = false, onRegenerate, onTitleEdit, children }) {
  const [open, setOpen] = useState(defaultOpen);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const titleInputRef = useRef(null);

  const startTitleEdit = useCallback((e) => {
    if (!onTitleEdit) return;
    e.stopPropagation();
    e.preventDefault();
    setTitleDraft(title || '');
    setEditingTitle(true);
  }, [onTitleEdit, title]);

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
    <div className={`glass rounded-squircle-xs overflow-hidden transition-all duration-500 ${streaming ? 'animate-pulse-subtle' : ''} ${regenerating ? 'ring-2 ring-violet-300/60' : ''} ${fresh && !regenerating ? 'ring-2 ring-emerald-400/70 bg-emerald-50/20' : ''}`}>
      <div className="flex items-center">
        {/* Chevron toggle — only this controls collapse/expand */}
        <button
          onClick={() => setOpen(!open)}
          className={`flex-shrink-0 flex items-center justify-center w-10 h-10 ml-2 rounded-md hover:bg-white/40 transition-colors`}
          title={open ? 'Collapse' : 'Expand'}
        >
          <svg className={`w-4 h-4 text-${accent}-500 transition-transform duration-200 ${open ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                onChange={e => setTitleDraft(e.target.value)}
                onBlur={commitTitle}
                onKeyDown={e => {
                  if (e.key === 'Enter') { e.preventDefault(); commitTitle(); }
                  if (e.key === 'Escape') { setEditingTitle(false); }
                }}
                className="text-sm font-semibold text-slate-800 bg-white border border-indigo-200 rounded px-1.5 py-0.5 w-full focus:outline-none focus:ring-2 focus:ring-indigo-300"
              />
            ) : (
              <h3
                className={`text-sm font-semibold truncate ${fresh && !regenerating ? 'text-emerald-700' : 'text-slate-800'} ${onTitleEdit ? 'cursor-text hover:bg-indigo-50/50 px-1.5 py-0.5 rounded border border-transparent hover:border-indigo-100/50 transition-all' : ''}`}
                onClick={startTitleEdit}
                title={onTitleEdit ? 'Click to edit title' : undefined}
              >
                {title}
                {fresh && !regenerating && (
                  <span className="ml-2 text-[9px] font-bold text-emerald-500 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full align-middle">✦ new</span>
                )}
              </h3>
            )}
            {subtitle && <p className="text-[11px] text-slate-400 truncate">{subtitle}</p>}
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
            onClick={(e) => { e.stopPropagation(); onRegenerate(); }}
            disabled={regenerating}
            title="Regenerate this lesson"
            className="flex-shrink-0 flex items-center gap-1 px-3 py-3.5 text-[10px] font-semibold text-slate-400 hover:text-violet-600 hover:bg-violet-50/40 transition-all disabled:opacity-40 border-l border-slate-100/60"
          >
            {regenerating ? (
              <svg className="animate-spin w-3 h-3" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
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
    <span className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full bg-${color}-100/80 text-${color}-700`}>
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
    <span className={`inline-block text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide ${cls}`}>
      {level}
    </span>
  );
}

// ─── Section heading ───
export function SectionHeading({ children }) {
  return <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">{children}</h4>;
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
          onClick={(e) => { e.stopPropagation(); onChange(id); }}
          className={`px-3 py-1 rounded-md text-[10px] font-semibold transition-all border ${activeTier === id ? color + ' shadow-sm' : 'text-slate-400 bg-transparent border-transparent hover:text-slate-600'
            }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
