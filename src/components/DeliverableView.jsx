import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import GenericDeliverableView from './GenericDeliverableView';
import { computeAvgScore, scoreColor } from '../lib/deliverableQualityScorer';
import { exportRubricGradebook } from '../lib/deliverableExporters';

// ── Feature 6.3: Quality Badge ──
function QualityBadge({ quality }) {
  const [showTips, setShowTips] = useState(false);
  if (!quality) return null;
  const avg = computeAvgScore(quality);
  const colors = scoreColor(avg);
  const { bloomsAlignment, specificity, actionability, tips = [] } = quality;

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
function updatePath(obj, path, value) {
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
function E({ value, path, onEdit, className = '', multiline = false }) {
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
function ResizableTh({ children, width, onResize, className = '' }) {
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
function SaveToBankButton({ onClick }) {
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

export default function DeliverableView({ featureId, data, status, error, regeneratingIndex, courseMapStatus, isDelivGenerating, currentDelivFeature, onDataChange, onRegenerateLesson, onRetry, onAddLessons, courseMap, lessonScope, isStudentView, onSaveToBank, qualityScore, freshLessonIndices }) {
  // ── All hooks MUST come before any early returns (Rules of Hooks) ──
  // Feature 4.1 — Tier detection + toggle state
  const [activeTier, setActiveTier] = useState('standard'); // 'scaffolded' | 'standard' | 'extension'
  const hasTiers = useMemo(() => {
    if (!data) return false;
    const TIERED_DELIVERABLES = ['lessonPlans', 'quizBank', 'discussions', 'assignments', 'studyGuides'];
    if (!TIERED_DELIVERABLES.includes(featureId)) return false;
    const arrays = {
      lessonPlans: data.lessonPlans,
      quizBank: data.quizzes || data.quizBank,
      discussions: data.discussions,
      assignments: data.assignments,
      studyGuides: data.studyGuides || data.guides,
    };
    const arr = arrays[featureId];
    return Array.isArray(arr) && arr.length > 0 && arr[0]?.tiers != null;
  }, [data, featureId]);

  // ── Early returns (after all hooks) ──
  if (status === 'error') return <ErrorState error={error} onRetry={onRetry} />;

  // Show waiting state when course map is still building or deliverables are queued
  if (!data && status !== 'streaming') {
    if (courseMapStatus && courseMapStatus !== 'done' && courseMapStatus !== 'idle' && courseMapStatus !== 'error') {
      return <WaitingState stage="courseMap" />;
    }
    if (isDelivGenerating && currentDelivFeature && currentDelivFeature !== featureId) {
      return <WaitingState stage="queued" currentFeature={currentDelivFeature} />;
    }
    return <EmptyState featureId={featureId} onGenerate={onRetry} />;
  }

  const isStreaming = status === 'streaming';
  const editable = status === 'done' && !!onDataChange;

  function onEdit(path, value) {
    if (!onDataChange) return;
    // Pass the edit path as 2nd argument so App can route it to the reactive sync engine
    onDataChange(updatePath(data, path, value), path);
  }

  const editProps = editable ? { onEdit } : {};

  const viewProps = { data, isStreaming, regeneratingIndex: regeneratingIndex ?? null, onRegenerateLesson, isStudentView, onSaveToBank, activeTier: hasTiers ? activeTier : 'standard', freshLessonIndices: freshLessonIndices ?? null, ...editProps };

  const isSlides = featureId === 'slideDecks';

  // Determine if there are un-generated lessons the user could add
  const allLessonCount = courseMap?.lessons?.length || 0;
  const generatedCount = Array.isArray(lessonScope)
    ? lessonScope.length
    : (lessonScope === 'all' || !lessonScope ? allLessonCount : allLessonCount);
  const hasMissingLessons = onAddLessons && status === 'done' && Array.isArray(lessonScope) && lessonScope.length < allLessonCount;

  return (
    <div className={isSlides ? 'relative h-[calc(100vh-8rem)]' : 'relative'}>
      {/* Feature 6.3 — Quality badge (shown when done and score available) */}
      {status === 'done' && qualityScore && (
        <div className="flex justify-end px-4 pt-2 pb-0">
          <QualityBadge quality={qualityScore} />
        </div>
      )}
      {isStreaming && !isSlides && <StreamingBanner />}
      {/* Feature 4.1 — Tier toggle (only when tiered data is present) */}
      {hasTiers && !isStreaming && (
        <div className="flex items-center justify-center gap-1 py-2 px-4">
          <div className="flex items-center bg-white border border-slate-200 rounded-lg p-0.5 shadow-sm">
            {[
              { key: 'scaffolded', label: '🧩 Scaffolded', color: 'text-blue-600 bg-blue-50 border-blue-200' },
              { key: 'standard',   label: '📋 Standard',   color: 'text-slate-600 bg-slate-100 border-slate-200' },
              { key: 'extension',  label: '🚀 Extension',  color: 'text-rose-600 bg-rose-50 border-rose-200' },
            ].map(({ key, label, color }) => (
              <button
                key={key}
                onClick={() => setActiveTier(key)}
                className={`px-3 py-1.5 rounded-md text-[11px] font-semibold transition-all border ${
                  activeTier === key ? color + ' shadow-sm' : 'text-slate-400 bg-transparent border-transparent hover:text-slate-600'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}
      {(() => {
        switch (featureId) {
          case 'lessonPlans': return <LessonPlansView {...viewProps} />;
          case 'rubrics': return <RubricsView {...viewProps} />;
          case 'slideDecks': return <SlideDecksView {...viewProps} />;
          case 'quizBank': return <QuizBankView {...viewProps} />;
          case 'discussions': return <DiscussionsView {...viewProps} />;
          case 'assignments': return <AssignmentsView {...viewProps} />;
          case 'studyGuides': return <StudyGuidesView {...viewProps} />;
          case 'syllabus': return <SyllabusView {...viewProps} />;
          default: return featureId?.startsWith('custom_')
            ? <GenericDeliverableView featureId={featureId} data={data} isStreaming={isStreaming} regeneratingIndex={regeneratingIndex} onRegenerateLesson={onRegenerateLesson} onEdit={editable ? onEdit : undefined} />
            : <EmptyState />;
        }
      })()}
      {/* ── Add More Lessons button — shown at bottom when scope was limited ── */}
      {onAddLessons && status === 'done' && !isSlides && hasMissingLessons && (
        <div className="flex justify-center pb-8 pt-2">
          <button
            onClick={() => {
              // Compute the missing lesson indices (those not in current scope)
              const currentScopeSet = new Set(Array.isArray(lessonScope) ? lessonScope : []);
              const missingIndices = Array.from({ length: allLessonCount }, (_, i) => i).filter(i => !currentScopeSet.has(i));
              onAddLessons(missingIndices);
            }}
            className="flex items-center gap-2 px-5 py-2.5 rounded-full text-[12px] font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200/60 shadow-sm hover:shadow transition-all duration-200"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            {`Add ${allLessonCount - (Array.isArray(lessonScope) ? lessonScope.length : allLessonCount)} more lesson${allLessonCount - (Array.isArray(lessonScope) ? lessonScope.length : allLessonCount) !== 1 ? 's' : ''}`}
          </button>
        </div>
      )}
    </div>
  );
}

function StreamingBanner() {
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

function ErrorState({ error, onRetry }) {
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

function WaitingState({ stage, currentFeature }) {
  const FEATURE_NAMES = {
    lessonPlans: 'Lesson Plans', rubrics: 'Rubrics', slideDecks: 'Slide Decks',
    quizBank: 'Quiz Bank', discussions: 'Discussions', assignments: 'Assignments', studyGuides: 'Study Guides', syllabus: 'Syllabus',
  };
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
            <p className="text-sm font-semibold text-slate-600">Queued — generating {FEATURE_NAMES[currentFeature] || currentFeature}...</p>
            <p className="text-xs text-slate-400 leading-relaxed">
              Deliverables are generated one at a time. This one will start streaming live as soon as the current item finishes.
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

const FEATURE_META = {
  lessonPlans: { emoji: '📝', label: 'Lesson Plans', desc: 'Detailed week-by-week lesson plans with activities, objectives, and timing.' },
  rubrics: { emoji: '📊', label: 'Rubrics', desc: 'Assessment rubrics aligned to Bloom\'s taxonomy levels for each assignment.' },
  slideDecks: { emoji: '🖥️', label: 'Slide Decks', desc: 'Presentation outlines with key concepts, discussion prompts, and slide notes.' },
  quizBank: { emoji: '❓', label: 'Quiz Bank', desc: 'Multiple-choice, short-answer, and essay questions organized by lesson.' },
  discussions: { emoji: '💬', label: 'Discussion Prompts', desc: 'Socratic discussion questions and response guides for each lesson.' },
  assignments: { emoji: '📋', label: 'Assignments', desc: 'Assignment briefs with learning objectives, instructions, and grading criteria.' },
  teachingGuides: { emoji: '🧭', label: 'Teaching Guides', desc: 'Instructor notes with pedagogical tips, common misconceptions, and pacing.' },
  syllabus: { emoji: '📄', label: 'Syllabus', desc: 'Complete course syllabus with policies, schedule, and grading breakdown.' },
};

function EmptyState({ featureId, onGenerate }) {
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

function CollapsibleCard({ title, subtitle, defaultOpen = false, accent = 'indigo', streaming = false, regenerating = false, fresh = false, onRegenerate, onTitleEdit, children }) {
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

function Badge({ children, color = 'indigo' }) {
  return (
    <span className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full bg-${color}-100/80 text-${color}-700`}>
      {children}
    </span>
  );
}

// ─── Bloom's level badge ───
const BLOOMS_COLORS = {
  Remember:  'bg-slate-100 text-slate-600',
  Understand:'bg-sky-100 text-sky-700',
  Apply:     'bg-teal-100 text-teal-700',
  Analyze:   'bg-violet-100 text-violet-700',
  Evaluate:  'bg-amber-100 text-amber-700',
  Create:    'bg-rose-100 text-rose-700',
};
function BloomsTag({ level }) {
  if (!level) return null;
  const cls = BLOOMS_COLORS[level] || 'bg-slate-100 text-slate-600';
  return (
    <span className={`inline-block text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide ${cls}`}>
      {level}
    </span>
  );
}

// ─── Section heading ───
function SectionHeading({ children }) {
  return <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">{children}</h4>;
}

// ─── Lesson Plans ───
function LessonPlansView({ data, isStreaming, onEdit, regeneratingIndex, onRegenerateLesson, activeTier, freshLessonIndices }) {
  if (!data) return isStreaming ? <StreamingBanner /> : <EmptyState />;
  const key = data.plans ? 'plans' : 'lessonPlans';
  const plans = data[key] || [];
  if (plans.length === 0 && !isStreaming) return <EmptyState />;
  return (
    <div className="space-y-3 p-4">
      {plans.map((basePlan, i) => {
        // Feature 4.1 — select tier variant
        const plan = (activeTier && activeTier !== 'standard' && basePlan.tiers?.[activeTier]) ? { ...basePlan, ...basePlan.tiers[activeTier] } : basePlan;
        const bloomsTags = plan.bloomsLevels || [];
        const subtitle = [plan.duration, plan.weekNumber].filter(Boolean).join(' · ');
        return (
          <CollapsibleCard key={i} title={plan.lessonTitle || plan.title || `Plan ${i + 1}`} subtitle={subtitle} defaultOpen={i < 3} accent="violet" streaming={isStreaming && i === plans.length - 1} regenerating={regeneratingIndex === i} fresh={!!(freshLessonIndices?.has(i))} onRegenerate={onRegenerateLesson && !isStreaming ? () => onRegenerateLesson(i) : undefined} onTitleEdit={onEdit ? (newTitle) => onEdit([key, i, 'lessonTitle'], newTitle) : undefined}>
            <div className="space-y-4 pt-3">

              {/* Bloom's levels row */}
              {bloomsTags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {bloomsTags.map((b, k) => <BloomsTag key={k} level={b} />)}
                </div>
              )}

              {/* Learning Objectives */}
              {plan.objectives?.length > 0 && (
                <div>
                  <SectionHeading>Learning Objectives</SectionHeading>
                  <ul className="space-y-1.5">
                    {plan.objectives.map((o, j) => (
                      <li key={j} className="text-xs text-slate-700 flex gap-2 leading-relaxed">
                        <span className="text-violet-400 mt-0.5 flex-shrink-0">•</span>
                        <E value={o} path={[key, i, 'objectives', j]} onEdit={onEdit} />
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Warm-up */}
              {plan.warmUp && (
                <div className="bg-amber-50/50 rounded-lg p-3 border border-amber-100/60">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-[11px]">🔥</span>
                    <SectionHeading>Warm-Up</SectionHeading>
                    {plan.warmUp.duration && <span className="text-[10px] text-amber-600 font-semibold ml-auto">{plan.warmUp.duration}</span>}
                  </div>
                  {plan.warmUp.type && <Badge color="amber">{plan.warmUp.type}</Badge>}
                  {plan.warmUp.prompt && (
                    <p className="text-xs text-slate-800 mt-1.5 font-medium leading-relaxed italic">
                      "<E value={plan.warmUp.prompt} path={[key, i, 'warmUp', 'prompt']} onEdit={onEdit} />"
                    </p>
                  )}
                  {plan.warmUp.purpose && (
                    <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                      <span className="font-semibold">Purpose:</span> <E value={plan.warmUp.purpose} path={[key, i, 'warmUp', 'purpose']} onEdit={onEdit} />
                    </p>
                  )}
                  {plan.warmUp.facilitation && (
                    <p className="text-[11px] text-slate-400 mt-1 leading-relaxed italic">
                      💡 <E value={plan.warmUp.facilitation} path={[key, i, 'warmUp', 'facilitation']} onEdit={onEdit} />
                    </p>
                  )}
                </div>
              )}

              {/* Materials */}
              {plan.materials?.length > 0 && (
                <div>
                  <SectionHeading>Materials &amp; Resources</SectionHeading>
                  <ul className="space-y-1">
                    {plan.materials.map((m, j) => (
                      <li key={j} className="text-xs text-slate-600 flex gap-2">
                        <span className="text-violet-300 flex-shrink-0">▸</span>
                        <E value={m} path={[key, i, 'materials', j]} onEdit={onEdit} />
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Session Outline */}
              {plan.outline?.length > 0 && (
                <div>
                  <SectionHeading>Session Outline</SectionHeading>
                  <div className="border border-slate-100 rounded-lg overflow-hidden">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-slate-50/80">
                          <th className="text-left px-3 py-2 font-semibold text-slate-500 w-20">Time</th>
                          <th className="text-left px-3 py-2 font-semibold text-slate-500 w-28">Activity</th>
                          <th className="text-left px-3 py-2 font-semibold text-slate-500 w-16">Type</th>
                          <th className="text-left px-3 py-2 font-semibold text-slate-500">Description &amp; Notes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {plan.outline.map((row, j) => (
                          <tr key={j} className={j % 2 === 0 ? 'bg-white/50' : 'bg-slate-50/30'}>
                            <td className="px-3 py-2 text-violet-600 font-medium whitespace-nowrap align-top">
                              <E value={row.time} path={[key, i, 'outline', j, 'time']} onEdit={onEdit} />
                            </td>
                            <td className="px-3 py-2 font-medium text-slate-700 align-top">
                              <E value={row.activity} path={[key, i, 'outline', j, 'activity']} onEdit={onEdit} />
                              {row.grouping && <span className="block text-[9px] text-slate-400 mt-0.5">{row.grouping}</span>}
                            </td>
                            <td className="px-3 py-2 align-top">
                              {row.type && <span className="text-[9px] text-indigo-500 bg-indigo-50 px-1.5 py-0.5 rounded font-medium">{row.type}</span>}
                              {row.bloomsLevel && <BloomsTag level={row.bloomsLevel} />}
                            </td>
                            <td className="px-3 py-2 text-slate-600 align-top">
                              <E value={row.description} path={[key, i, 'outline', j, 'description']} onEdit={onEdit} multiline />
                              {(row.instructorNotes || row.notes) && (
                                <span className="block mt-1 text-[10px] text-slate-400 italic">
                                  💡 <E value={row.instructorNotes || row.notes} path={[key, i, 'outline', j, row.instructorNotes ? 'instructorNotes' : 'notes']} onEdit={onEdit} className="text-[10px] text-slate-400 italic" />
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Formative Assessment */}
              {plan.formativeCheck && (
                <div className="bg-sky-50/50 rounded-lg p-3 border border-sky-100/60">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-[11px]">📋</span>
                    <SectionHeading>Formative Assessment</SectionHeading>
                  </div>
                  {plan.formativeCheck.type && <Badge color="sky">{plan.formativeCheck.type}</Badge>}
                  {plan.formativeCheck.prompt && (
                    <p className="text-xs text-slate-800 mt-1.5 leading-relaxed italic">
                      "<E value={plan.formativeCheck.prompt} path={[key, i, 'formativeCheck', 'prompt']} onEdit={onEdit} />"
                    </p>
                  )}
                  {plan.formativeCheck.objectiveAligned && (
                    <p className="text-[11px] text-slate-500 mt-1">
                      <span className="font-semibold">Aligns to:</span> <E value={plan.formativeCheck.objectiveAligned} path={[key, i, 'formativeCheck', 'objectiveAligned']} onEdit={onEdit} />
                    </p>
                  )}
                  {plan.formativeCheck.instructorAction && (
                    <p className="text-[11px] text-slate-400 mt-1 italic">
                      💡 <E value={plan.formativeCheck.instructorAction} path={[key, i, 'formativeCheck', 'instructorAction']} onEdit={onEdit} />
                    </p>
                  )}
                </div>
              )}

              {/* UDL Notes */}
              {plan.udlNotes && (plan.udlNotes.representation || plan.udlNotes.engagement || plan.udlNotes.expression) && (
                <div className="bg-teal-50/40 rounded-lg p-3 border border-teal-100/50">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-[11px]">♿</span>
                    <SectionHeading>UDL Notes</SectionHeading>
                  </div>
                  {plan.udlNotes.representation && (
                    <div className="mb-1.5">
                      <span className="text-[10px] font-bold text-teal-700 uppercase">Representation</span>
                      <p className="text-[11px] text-slate-600 mt-0.5 leading-relaxed"><E value={plan.udlNotes.representation} path={[key, i, 'udlNotes', 'representation']} onEdit={onEdit} /></p>
                    </div>
                  )}
                  {plan.udlNotes.engagement && (
                    <div className="mb-1.5">
                      <span className="text-[10px] font-bold text-teal-700 uppercase">Engagement</span>
                      <p className="text-[11px] text-slate-600 mt-0.5 leading-relaxed"><E value={plan.udlNotes.engagement} path={[key, i, 'udlNotes', 'engagement']} onEdit={onEdit} /></p>
                    </div>
                  )}
                  {plan.udlNotes.expression && (
                    <div>
                      <span className="text-[10px] font-bold text-teal-700 uppercase">Expression</span>
                      <p className="text-[11px] text-slate-600 mt-0.5 leading-relaxed"><E value={plan.udlNotes.expression} path={[key, i, 'udlNotes', 'expression']} onEdit={onEdit} /></p>
                    </div>
                  )}
                </div>
              )}

              {/* Homework */}
              {(plan.homework || (typeof plan.homework === 'object' && plan.homework?.title)) && (
                <div>
                  <SectionHeading>Homework</SectionHeading>
                  {typeof plan.homework === 'object' ? (
                    <div className="bg-slate-50/60 rounded-lg p-3 border border-slate-100">
                      {plan.homework.title && <p className="text-xs font-semibold text-slate-700 mb-1"><E value={plan.homework.title} path={[key, i, 'homework', 'title']} onEdit={onEdit} /></p>}
                      {plan.homework.description && <p className="text-xs text-slate-600 leading-relaxed"><E value={plan.homework.description} path={[key, i, 'homework', 'description']} onEdit={onEdit} multiline /></p>}
                      <div className="flex gap-3 mt-1.5">
                        {plan.homework.estimatedTime && <span className="text-[10px] text-slate-400">⏱ {plan.homework.estimatedTime}</span>}
                        {plan.homework.connectionToNext && <span className="text-[10px] text-indigo-400">→ {plan.homework.connectionToNext}</span>}
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-700"><E value={plan.homework} path={[key, i, 'homework']} onEdit={onEdit} multiline /></p>
                  )}
                </div>
              )}

              {/* Closing Activity */}
              {plan.closingActivity && (
                <div>
                  <SectionHeading>Closing &amp; Wrap-Up</SectionHeading>
                  <p className="text-xs text-slate-700 leading-relaxed"><E value={plan.closingActivity} path={[key, i, 'closingActivity']} onEdit={onEdit} multiline /></p>
                </div>
              )}
            </div>
          </CollapsibleCard>
        );
      })}
    </div>
  );
}

// ─── Rubrics ───
function RubricsView({ data, isStreaming, onEdit, regeneratingIndex, onRegenerateLesson, onSaveToBank, freshLessonIndices }) {
  if (!data) return isStreaming ? <StreamingBanner /> : <EmptyState />;
  const rubrics = data.rubrics || [];
  if (rubrics.length === 0 && !isStreaming) return <EmptyState />;
  return (
    <div className="space-y-3 p-4">
      {/* Feature 7.4 — Export Gradebook CSV */}
      {rubrics.length > 0 && !isStreaming && (
        <div className="flex justify-end">
          <button
            onClick={() => exportRubricGradebook(data)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-all"
          >
            <span>📊</span>
            <span>Export Gradebook CSV</span>
          </button>
        </div>
      )}
      {rubrics.map((rubric, i) => {
        const subtitle = [
          rubric.totalPoints ? `${rubric.totalPoints} pts` : null,
          rubric.assessmentType,
          rubric.bloomsLevel,
        ].filter(Boolean).join(' · ');
        return (
          <CollapsibleCard key={i} title={rubric.lessonTitle || rubric.title || `Rubric ${i + 1}`} subtitle={subtitle} defaultOpen={i < 3} accent="emerald" streaming={isStreaming && i === rubrics.length - 1} regenerating={regeneratingIndex === i} fresh={!!(freshLessonIndices?.has(i))} onRegenerate={onRegenerateLesson && !isStreaming ? () => onRegenerateLesson(i) : undefined} onTitleEdit={onEdit ? (newTitle) => onEdit(['rubrics', i, 'lessonTitle'], newTitle) : undefined}>
            <div className="pt-3 space-y-3">
              {/* Save rubric to bank */}
              {onSaveToBank && rubric.criteria?.length > 0 && (
                <SaveToBankButton
                  onClick={() => onSaveToBank({
                    type: 'rubric',
                    text: (rubric.criteria || []).map(c => `${c.criterion || c.name}: ${c.excellent || ''}`).join('\n'),
                    bloomsLevel: rubric.bloomsLevel || '',
                  })}
                />
              )}

              {/* Grading scale chips */}
              {rubric.gradingScale && (
                <div className="flex flex-wrap gap-2">
                  {Object.entries(rubric.gradingScale).map(([level, range]) => {
                    const colors = { exemplary: 'bg-emerald-50 text-emerald-700', proficient: 'bg-sky-50 text-sky-700', developing: 'bg-amber-50 text-amber-700', beginning: 'bg-red-50 text-red-600' };
                    return (
                      <span key={level} className={`text-[10px] font-semibold px-2 py-1 rounded-md capitalize ${colors[level] || 'bg-slate-50 text-slate-600'}`}>
                        {level}: {range}
                      </span>
                    );
                  })}
                </div>
              )}

              {/* Rubric table */}
              <div className="overflow-x-auto">
                <table className="w-full text-xs border border-slate-100 rounded-lg overflow-hidden">
                  <thead>
                    <tr className="bg-emerald-50/60">
                      <th className="text-left px-3 py-2 font-semibold text-slate-600 min-w-[120px]">Criterion</th>
                      <th className="text-center px-2 py-2 font-semibold text-slate-600 w-12">Wt %</th>
                      <th className="text-center px-2 py-2 font-semibold text-slate-600 w-10">Pts</th>
                      <th className="text-left px-3 py-2 font-semibold text-emerald-700 min-w-[140px]">Exemplary</th>
                      <th className="text-left px-3 py-2 font-semibold text-sky-700 min-w-[140px]">Proficient</th>
                      <th className="text-left px-3 py-2 font-semibold text-amber-700 min-w-[140px]">Developing</th>
                      <th className="text-left px-3 py-2 font-semibold text-red-700 min-w-[140px]">Beginning</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(rubric.criteria || []).length === 0 && isStreaming && (
                      <tr><td colSpan={7} className="px-3 py-4 text-center text-xs text-slate-400 italic">Generating criteria...</td></tr>
                    )}
                    {(rubric.criteria || []).map((c, j) => (
                      <tr key={j} className={j % 2 === 0 ? 'bg-white/50' : 'bg-slate-50/30'}>
                        <td className="px-3 py-2 align-top">
                          <span className="font-semibold text-slate-800 block">
                            <E value={c.criterion || c.name} path={['rubrics', i, 'criteria', j, 'criterion']} onEdit={onEdit} />
                          </span>
                          {c.objectiveAligned && (
                            <span className="text-[9px] text-indigo-400 block mt-0.5 leading-tight">
                              ↳ <E value={c.objectiveAligned} path={['rubrics', i, 'criteria', j, 'objectiveAligned']} onEdit={onEdit} className="text-[9px] text-indigo-400" />
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-2 text-center font-bold text-slate-500 align-top">
                          <E value={String(c.weight ?? '')} path={['rubrics', i, 'criteria', j, 'weight']} onEdit={onEdit} />%
                        </td>
                        <td className="px-2 py-2 text-center font-semibold text-emerald-600 align-top">
                          {c.points ?? ''}
                        </td>
                        <td className="px-3 py-2 text-slate-600 align-top leading-relaxed"><E value={c.excellent} path={['rubrics', i, 'criteria', j, 'excellent']} onEdit={onEdit} multiline /></td>
                        <td className="px-3 py-2 text-slate-600 align-top leading-relaxed"><E value={c.proficient} path={['rubrics', i, 'criteria', j, 'proficient']} onEdit={onEdit} multiline /></td>
                        <td className="px-3 py-2 text-slate-600 align-top leading-relaxed"><E value={c.developing} path={['rubrics', i, 'criteria', j, 'developing']} onEdit={onEdit} multiline /></td>
                        <td className="px-3 py-2 text-slate-600 align-top leading-relaxed"><E value={c.beginning} path={['rubrics', i, 'criteria', j, 'beginning']} onEdit={onEdit} multiline /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Teacher notes */}
              {rubric.teacherNotes && (
                <div className="bg-amber-50/40 rounded-lg p-3 border border-amber-100/50">
                  <h4 className="text-[10px] font-bold text-amber-700 uppercase tracking-wide mb-1">📋 Calibration &amp; Grader Notes</h4>
                  <p className="text-[11px] text-slate-600 leading-relaxed">
                    <E value={rubric.teacherNotes} path={['rubrics', i, 'teacherNotes']} onEdit={onEdit} multiline />
                  </p>
                </div>
              )}
            </div>
          </CollapsibleCard>
        );
      })}
    </div>
  );
}

// ─── Slide type detection ───
function getSlideType(slide, index, deckTitle) {
  if (!slide) return 'content';
  // Prefer explicit type from AI
  if (slide.type && ['title','agenda','objectives','bridge','content','activity','discussion','example','summary','closing'].includes(slide.type)) {
    // Map 'objectives' and 'bridge' to existing visual types
    if (slide.type === 'objectives') return 'agenda';
    if (slide.type === 'bridge') return 'content';
    if (slide.type === 'discussion') return 'activity';
    if (slide.type === 'example') return 'content';
    return slide.type;
  }
  const t = (slide.title || '').toLowerCase();
  if (index === 0) return 'title';
  if (/^agenda|outline|overview|today/i.test(t)) return 'agenda';
  if (/^learning obj|by the end|objectives/i.test(t)) return 'agenda';
  if (/summary|recap|key\s*take|wrap|review|conclusion/i.test(t)) return 'summary';
  if (/discussion|activity|exercise|practice|workshop|group/i.test(t)) return 'activity';
  if (/question|q\s*&\s*a|quiz/i.test(t)) return 'question';
  if (/thank|end$|closing/i.test(t)) return 'closing';
  return 'content';
}

// ─── Rich university slide color themes (Item 9) ───
const SLIDE_THEMES = [
  { primary: '#1E3A5F', secondary: '#2E86AB', accent: '#F6C90E', light: '#EEF4FF', sidebar: '#1E3A5F', titleText: '#FFFFFF', bodyText: '#1A1A2E', subtleText: '#6B7FA3' },
  { primary: '#1B4332', secondary: '#40916C', accent: '#F4A261', light: '#F0FFF4', sidebar: '#1B4332', titleText: '#FFFFFF', bodyText: '#1B2B1F', subtleText: '#52796F' },
  { primary: '#4A1C96', secondary: '#7B2FBE', accent: '#FF6B35', light: '#FAF5FF', sidebar: '#4A1C96', titleText: '#FFFFFF', bodyText: '#2D1B40', subtleText: '#7C3AED' },
  { primary: '#7B0000', secondary: '#B71C1C', accent: '#FFD700', light: '#FFF9F9', sidebar: '#7B0000', titleText: '#FFFFFF', bodyText: '#2D0A0A', subtleText: '#9E3030' },
  { primary: '#0C3547', secondary: '#1565C0', accent: '#00BCD4', light: '#F0FBFF', sidebar: '#0C3547', titleText: '#FFFFFF', bodyText: '#0A1628', subtleText: '#2196F3' },
];

// ─── SVG decorative elements for slides (Item 9: rich university design) ───
function SlideDecor({ type, theme }) {
  const p = theme?.primary || '#1E3A5F';
  const s = theme?.secondary || '#2E86AB';
  const a = theme?.accent || '#F6C90E';
  const l = theme?.light || '#EEF4FF';

  if (type === 'title') return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">
      <rect width="100%" height="100%" fill={p} />
      {/* Large decorative circle top-right */}
      <circle cx="82%" cy="22%" r="22%" fill={s} fillOpacity="0.45" />
      {/* Smaller accent circle bottom-left */}
      <circle cx="8%" cy="82%" r="14%" fill={a} fillOpacity="0.15" />
      {/* Bottom accent bar */}
      <rect x="0" y="90%" width="100%" height="10%" fill={a} fillOpacity="0.18" />
    </svg>
  );
  if (type === 'summary' || type === 'closing') return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">
      <rect width="100%" height="100%" fill={p} />
      {/* Decorative circle top-right */}
      <circle cx="88%" cy="18%" r="20%" fill={s} fillOpacity="0.35" />
      {/* Gold accent line */}
      <rect x="7%" y="0" width="1.5%" height="100%" fill={a} fillOpacity="0.4" />
      {/* Bottom gold bar */}
      <rect x="0" y="92%" width="100%" height="8%" fill={a} fillOpacity="0.22" />
    </svg>
  );
  if (type === 'activity' || type === 'question') return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">
      <rect width="100%" height="100%" fill="#FAFBFF" />
      {/* Bold top header band */}
      <rect x="0" y="0" width="100%" height="18%" fill={p} />
      {/* Bottom accent */}
      <rect x="0" y="93%" width="100%" height="7%" fill={a} fillOpacity="0.3" />
      {/* Subtle circle */}
      <circle cx="90%" cy="60%" r="15%" fill={a} fillOpacity="0.07" />
    </svg>
  );
  if (type === 'agenda' || type === 'objectives') return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">
      <rect width="100%" height="100%" fill="#FFFFFF" />
      {/* Left sidebar */}
      <rect x="0" y="0" width="1.8%" height="100%" fill={p} />
      {/* Top header band */}
      <rect x="1.8%" y="0" width="100%" height="20%" fill={s} fillOpacity="0.9" />
      {/* Subtle bg circle */}
      <circle cx="92%" cy="80%" r="18%" fill={l} fillOpacity="0.8" />
    </svg>
  );
  // content default — left sidebar + top accent
  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">
      <rect width="100%" height="100%" fill="#FFFFFF" />
      {/* Left sidebar */}
      <rect x="0" y="0" width="1.8%" height="100%" fill={p} />
      {/* Top header region */}
      <rect x="1.8%" y="0" width="100%" height="19%" fill={l} />
      {/* Accent line below header */}
      <rect x="1.8%" y="18.5%" width="100%" height="0.8%" fill={a} fillOpacity="0.85" />
      {/* Subtle circle bottom-right */}
      <circle cx="92%" cy="88%" r="14%" fill={p} fillOpacity="0.03" />
    </svg>
  );
}

// ── Extract lesson number from a title like "Lesson 6: Housing Policy..." ──
function extractLessonNumber(title, fallback) {
  if (!title) return fallback;
  const m = title.match(/^(?:Lesson|Week)\s*(\d+)/i);
  return m ? parseInt(m[1], 10) : fallback;
}

// ─── Add-bullet button for slides ───
function AddBulletBtn({ dataKey, deckIndex, slideIndex, bulletsKey, currentCount, onEdit }) {
  if (!onEdit) return null;
  return (
    <button
      onClick={() => onEdit([dataKey, deckIndex, 'slides', slideIndex, bulletsKey, currentCount], 'New point')}
      className="mt-2 flex items-center gap-1 text-[10px] text-slate-400 hover:text-indigo-500 transition-colors opacity-0 group-hover/slide:opacity-100"
      title="Add bullet point"
    >
      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
      </svg>
      Add point
    </button>
  );
}

// ─── Individual slide renderer (Item 9: rich university design) ───
function SlideCanvas({ slide, slideIndex, totalSlides, deckTitle, dataKey, deckIndex, lessonNumber, onEdit }) {
  if (!slide) return null;
  const type = getSlideType(slide, slideIndex, deckTitle);
  const bullets = slide.bullets || slide.bulletPoints || [];
  const bulletsKey = slide.bullets ? 'bullets' : 'bulletPoints';
  const theme = SLIDE_THEMES[(deckIndex || 0) % SLIDE_THEMES.length];

  // ── TITLE SLIDE ──────────────────────────────────────────────────────────
  if (type === 'title') return (
    <div className="relative aspect-[16/9] rounded-xl overflow-hidden shadow-2xl group/slide" style={{ fontFamily: "'Calibri', 'Georgia', 'Times New Roman', serif" }}>
      <SlideDecor type="title" theme={theme} />
      <div className="relative z-10 flex flex-col h-full px-10 pt-9 pb-7">
        {/* Lesson number badge */}
        <div className="mb-3">
          <span className="text-[10px] font-bold tracking-widest uppercase" style={{ color: theme.accent }}>
            LESSON {lessonNumber || (deckIndex || 0) + 1}
          </span>
        </div>
        {/* Main title — constrained to 60% width so it doesn't clash with decorative circles */}
        <h1 className="text-[24px] font-bold leading-tight tracking-tight mb-3" style={{ color: theme.titleText, textShadow: '0 1px 8px rgba(0,0,0,0.18)', fontFamily: "'Calibri', Georgia, serif", maxWidth: '60%' }}>
          <E value={slide.title} path={[dataKey, deckIndex, 'slides', slideIndex, 'title']} onEdit={onEdit} className="text-[24px] font-bold text-white leading-tight" />
        </h1>
        {/* Accent line */}
        <div className="mb-3 w-14 h-1 rounded-full" style={{ background: theme.accent }} />
        {/* Subtitle */}
        {bullets.length > 0 && (
          <p className="text-[13px] leading-relaxed" style={{ color: 'rgba(220,235,255,0.88)', maxWidth: '58%' }}>
            <E value={bullets[0]} path={[dataKey, deckIndex, 'slides', slideIndex, bulletsKey, 0]} onEdit={onEdit} className="text-[13px] leading-relaxed" />
          </p>
        )}
        {deckTitle && <p className="mt-auto text-[9px] tracking-widest uppercase font-medium" style={{ color: 'rgba(255,255,255,0.35)' }}>
          Course: <E value={deckTitle} path={[dataKey, deckIndex, 'lessonTitle']} onEdit={onEdit} className="text-[9px] tracking-widest uppercase font-medium" />
        </p>}
      </div>
      {/* Slide number badge */}
      <div className="absolute bottom-2.5 right-3.5 text-[9px] font-bold z-10 px-2 py-0.5 rounded" style={{ background: theme.accent, color: theme.primary }}>
        {slideIndex + 1} / {totalSlides}
      </div>
    </div>
  );

  // ── AGENDA / OBJECTIVES SLIDE ────────────────────────────────────────────
  if (type === 'agenda' || type === 'objectives') return (
    <div className="relative aspect-[16/9] rounded-xl overflow-hidden shadow-2xl group/slide" style={{ fontFamily: "'Calibri', 'Inter', system-ui, sans-serif" }}>
      <SlideDecor type="agenda" theme={theme} />
      <div className="relative z-10 flex flex-col h-full">
        {/* Header zone — must fit within the top 20% band drawn by SlideDecor */}
        <div className="flex flex-col justify-center px-8 pb-1" style={{ paddingLeft: '10%', height: '22%' }}>
          <p className="text-[9px] font-bold tracking-widest uppercase mb-0.5" style={{ color: theme.accent }}>
            {type === 'objectives' ? 'LEARNING OBJECTIVES' : 'TODAY\'S AGENDA'}
          </p>
          <h2 className="text-[18px] font-bold leading-tight" style={{ color: '#FFFFFF' }}>
            <E value={slide.title} path={[dataKey, deckIndex, 'slides', slideIndex, 'title']} onEdit={onEdit} className="text-[18px] font-bold text-white leading-tight" />
          </h2>
        </div>
        {/* Items */}
        <div className="flex-1 px-7 pt-3 pb-4 overflow-hidden" style={{ paddingLeft: '10%' }}>
          <ol className="space-y-2.5">
            {bullets.slice(0, 6).map((b, k) => (
              <li key={k} className="flex items-center gap-3">
                <span className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-[11px] font-bold shadow-sm" style={{ background: k === 0 ? theme.accent : theme.light, color: k === 0 ? theme.primary : theme.secondary }}>
                  {k + 1}
                </span>
                <span className={`text-[13px] leading-snug ${k === 0 ? 'font-semibold' : ''}`} style={{ color: k === 0 ? theme.bodyText : '#555' }}>
                  <E value={b} path={[dataKey, deckIndex, 'slides', slideIndex, bulletsKey, k]} onEdit={onEdit} className="text-[13px] leading-snug" />
                </span>
              </li>
            ))}
          </ol>
          <AddBulletBtn dataKey={dataKey} deckIndex={deckIndex} slideIndex={slideIndex} bulletsKey={bulletsKey} currentCount={bullets.length} onEdit={onEdit} />
        </div>
      </div>
      <div className="absolute bottom-2.5 right-3.5 text-[8px] font-semibold z-10" style={{ color: theme.subtleText }}>{slideIndex + 1} / {totalSlides}</div>
    </div>
  );

  // ── SUMMARY / CLOSING SLIDE ──────────────────────────────────────────────
  if (type === 'summary' || type === 'closing') return (
    <div className="relative aspect-[16/9] rounded-xl overflow-hidden shadow-2xl group/slide" style={{ fontFamily: "'Calibri', Georgia, serif" }}>
      <SlideDecor type="summary" theme={theme} />
      <div className="relative z-10 flex flex-col h-full px-12 py-7" style={{ paddingLeft: '12%' }}>
        <p className="text-[10px] font-bold tracking-widest uppercase mb-1" style={{ color: theme.accent }}>KEY TAKEAWAYS</p>
        <h2 className="text-[20px] font-bold mb-2 leading-tight" style={{ color: '#FFFFFF' }}>
          <E value={slide.title} path={[dataKey, deckIndex, 'slides', slideIndex, 'title']} onEdit={onEdit} className="text-[20px] font-bold text-white" />
        </h2>
        <div className="w-12 h-1 rounded-full mb-4" style={{ background: theme.accent }} />
        <ul className="space-y-2.5 flex-1">
          {bullets.map((b, k) => (
            <li key={k} className="flex items-start gap-3 text-[13px] leading-relaxed" style={{ color: 'rgba(220,235,255,0.9)' }}>
              <svg className="w-4 h-4 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20" style={{ color: theme.accent }}>
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              <E value={b} path={[dataKey, deckIndex, 'slides', slideIndex, bulletsKey, k]} onEdit={onEdit} className="text-[13px] leading-relaxed" />
            </li>
          ))}
        </ul>
        <AddBulletBtn dataKey={dataKey} deckIndex={deckIndex} slideIndex={slideIndex} bulletsKey={bulletsKey} currentCount={bullets.length} onEdit={onEdit} />
      </div>
      <div className="absolute bottom-2.5 right-3.5 text-[9px] font-bold z-10 px-2 py-0.5 rounded" style={{ background: theme.accent, color: theme.primary }}>
        {slideIndex + 1} / {totalSlides}
      </div>
    </div>
  );

  // ── ACTIVITY / QUESTION SLIDE ────────────────────────────────────────────
  if (type === 'activity' || type === 'question') return (
    <div className="relative aspect-[16/9] rounded-xl overflow-hidden shadow-2xl group/slide" style={{ fontFamily: "'Calibri', 'Inter', system-ui, sans-serif" }}>
      <SlideDecor type="activity" theme={theme} />
      <div className="relative z-10 flex flex-col h-full">
        {/* Header band — fits inside the 18% top primary band from SlideDecor */}
        <div className="flex items-center gap-3 px-8" style={{ height: '20%' }}>
          {/* Badge */}
          <span className="px-2.5 py-1 rounded-md text-[9px] font-bold tracking-wide uppercase flex-shrink-0" style={{ background: theme.accent, color: theme.primary }}>
            {type === 'question' ? 'Q&A' : 'ACTIVITY'}
          </span>
          <h2 className="text-[16px] font-bold leading-tight text-white flex-1 min-w-0">
            <E value={slide.title} path={[dataKey, deckIndex, 'slides', slideIndex, 'title']} onEdit={onEdit} className="text-[16px] font-bold text-white" />
          </h2>
          {slide.timer && (
            <span className="text-[10px] font-semibold text-white/80 whitespace-nowrap flex-shrink-0">⏱ <E value={slide.timer} path={[dataKey, deckIndex, 'slides', slideIndex, 'timer']} onEdit={onEdit} className="text-[10px] font-semibold" /></span>
          )}
        </div>
        {/* Content card */}
        <div className="flex-1 mx-5 mb-4 mt-1 rounded-xl border-2 px-6 py-4 overflow-hidden" style={{ background: 'rgba(255,252,248,0.97)', borderColor: theme.accent + '60' }}>
          <ul className="space-y-2.5">
            {bullets.map((b, k) => (
              <li key={k} className="flex items-start gap-3 text-[13px] leading-relaxed" style={{ color: theme.bodyText }}>
                <span className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0 mt-0.5" style={{ background: theme.accent + '30', color: theme.primary }}>
                  {k + 1}
                </span>
                <E value={b} path={[dataKey, deckIndex, 'slides', slideIndex, bulletsKey, k]} onEdit={onEdit} className="text-[13px] leading-relaxed" />
              </li>
            ))}
          </ul>
          <AddBulletBtn dataKey={dataKey} deckIndex={deckIndex} slideIndex={slideIndex} bulletsKey={bulletsKey} currentCount={bullets.length} onEdit={onEdit} />
        </div>
      </div>
      <div className="absolute bottom-2.5 right-3.5 text-[8px] font-semibold z-10" style={{ color: theme.subtleText }}>{slideIndex + 1} / {totalSlides}</div>
    </div>
  );

  // ── DEFAULT CONTENT SLIDE ────────────────────────────────────────────────
  return (
    <div className="relative aspect-[16/9] rounded-xl overflow-hidden shadow-2xl group/slide" style={{ fontFamily: "'Calibri', 'Inter', system-ui, sans-serif" }}>
      <SlideDecor type="content" theme={theme} />
      <div className="relative z-10 flex flex-col h-full">
        {/* Header zone — vertically centered within the light band (~19% of height) */}
        <div className="flex items-center px-7" style={{ paddingLeft: '9%', height: '22%' }}>
          <h2 className="text-[18px] font-bold leading-tight" style={{ color: theme.primary }}>
            <E value={slide.title} path={[dataKey, deckIndex, 'slides', slideIndex, 'title']} onEdit={onEdit} className="text-[18px] font-bold leading-tight" />
          </h2>
        </div>
        {/* Content area */}
        <div className="flex-1 px-7 pt-2 pb-4 overflow-hidden" style={{ paddingLeft: '9%' }}>
          <ul className="space-y-2.5">
            {bullets.map((b, k) => (
              <li key={k} className="flex items-start gap-3 text-[13px] leading-relaxed" style={{ color: k === 0 ? theme.bodyText : '#444444' }}>
                <span className="w-2 h-2 rounded-full flex-shrink-0 mt-2" style={{ background: theme.secondary }} />
                <E value={b} path={[dataKey, deckIndex, 'slides', slideIndex, bulletsKey, k]} onEdit={onEdit} className="text-[13px] leading-relaxed" />
              </li>
            ))}
          </ul>
          <AddBulletBtn dataKey={dataKey} deckIndex={deckIndex} slideIndex={slideIndex} bulletsKey={bulletsKey} currentCount={bullets.length} onEdit={onEdit} />
        </div>
      </div>
      {/* Slide number */}
      <div className="absolute bottom-2.5 right-3.5 text-[8px] font-semibold z-10 px-2 py-0.5 rounded" style={{ background: theme.primary, color: '#FFFFFF' }}>
        {slideIndex + 1} / {totalSlides}
      </div>
    </div>
  );
}

// ─── Slide thumbnail (mini version) — uses theme ───
function SlideThumbnail({ slide, slideIndex, deckTitle, deckIndex }) {
  const type = getSlideType(slide, slideIndex, deckTitle);
  const bullets = slide ? (slide.bullets || slide.bulletPoints || []) : [];
  const isDark = type === 'title' || type === 'summary' || type === 'closing';
  const theme = SLIDE_THEMES[(deckIndex || 0) % SLIDE_THEMES.length];

  return (
    <div className="w-full aspect-[16/10] rounded overflow-hidden relative" style={{ fontSize: 0 }}>
      <SlideDecor type={type === 'closing' ? 'summary' : type} theme={theme} />
      <div className="relative z-10 flex flex-col h-full px-2 py-1.5 overflow-hidden">
        {type === 'title' ? (
          <div className="flex-1 flex flex-col justify-center pl-1">
            <p className="text-[6px] font-bold leading-tight truncate max-w-[65%]" style={{ color: theme.titleText }}>{slide?.title || 'Untitled'}</p>
            <div className="w-4 h-0.5 mt-0.5 rounded-full" style={{ background: theme.accent }} />
          </div>
        ) : isDark ? (
          <>
            <p className="text-[6px] font-bold leading-tight truncate pl-1 mt-1" style={{ color: theme.accent }}>{slide?.title || 'Untitled'}</p>
            <div className="w-3 h-px mt-0.5 mb-0.5 ml-1 rounded-full" style={{ background: theme.accent + '60' }} />
            <div className="space-y-px flex-1 overflow-hidden pl-1">
              {bullets.slice(0, 3).map((b, k) => (
                <p key={k} className="text-[4px] leading-tight truncate" style={{ color: 'rgba(220,235,255,0.8)' }}>✓ {b}</p>
              ))}
            </div>
          </>
        ) : (
          <>
            <p className="text-[6px] font-bold leading-tight truncate" style={{ color: type === 'agenda' ? '#FFFFFF' : theme.primary, paddingLeft: type === 'content' ? '8%' : '0' }}>{slide?.title || 'Untitled'}</p>
            <div className="w-3 h-px rounded-full mt-0.5 mb-0.5" style={{ background: theme.accent, marginLeft: type === 'content' ? '8%' : '0' }} />
            <div className="space-y-px flex-1 overflow-hidden" style={{ paddingLeft: type === 'content' ? '8%' : '0' }}>
              {bullets.slice(0, 3).map((b, k) => (
                <p key={k} className="text-[4px] leading-tight truncate" style={{ color: '#666' }}>
                  {type === 'agenda' ? `${k + 1}. ` : '• '}{b}
                </p>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Slide Decks (Google-Slides-style UI) ───
function SlideDecksView({ data, isStreaming, onEdit }) {
  const [activeDeck, setActiveDeck] = useState(0);
  const [activeSlide, setActiveSlide] = useState(0);
  const [showNotes, setShowNotes] = useState(true);
  const [editingDeckTab, setEditingDeckTab] = useState(null);
  const [deckTabDraft, setDeckTabDraft] = useState('');
  const deckTabRef = useRef(null);

  if (!data) return isStreaming ? <StreamingBanner /> : <EmptyState />;
  const key = data.decks ? 'decks' : 'slideDecks';
  const decks = data[key] || [];
  if (decks.length === 0 && !isStreaming) return <EmptyState />;

  const deck = decks[activeDeck] || decks[0];
  const slides = deck?.slides || [];
  const slide = slides[activeSlide] || slides[0];
  const deckTitle = deck?.lessonTitle || '';

  const handleDeckChange = (i) => { setActiveDeck(i); setActiveSlide(0); };

  const commitDeckTitle = useCallback((i) => {
    if (deckTabDraft && deckTabDraft !== (decks[i]?.lessonTitle || '') && onEdit) {
      onEdit([key, i, 'lessonTitle'], deckTabDraft);
    }
    setEditingDeckTab(null);
  }, [deckTabDraft, decks, key, onEdit]);

  useEffect(() => {
    if (editingDeckTab !== null && deckTabRef.current) {
      deckTabRef.current.focus();
      deckTabRef.current.select();
    }
  }, [editingDeckTab]);

  return (
    <div className="flex flex-col h-full" style={{ fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif" }}>
      {/* Deck tabs — styled like sheet tabs */}
      {decks.length > 1 && (
        <div className="flex items-center gap-0 px-2 pt-2 border-b border-slate-200/60 bg-slate-50/50 overflow-x-auto flex-shrink-0">
          {decks.map((d, i) => (
            editingDeckTab === i ? (
              <input
                key={i}
                ref={deckTabRef}
                value={deckTabDraft}
                onChange={e => setDeckTabDraft(e.target.value)}
                onBlur={() => commitDeckTitle(i)}
                onKeyDown={e => {
                  if (e.key === 'Enter') { e.preventDefault(); commitDeckTitle(i); }
                  if (e.key === 'Escape') { setEditingDeckTab(null); }
                }}
                className="px-2 py-1.5 text-[11px] font-medium border border-indigo-300 rounded bg-white text-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-300 min-w-[100px]"
              />
            ) : (
              <button
                key={i}
                onClick={() => {
                  if (i === activeDeck && onEdit) {
                    setEditingDeckTab(i);
                    setDeckTabDraft(d.lessonTitle || `Deck ${i + 1}`);
                  } else {
                    handleDeckChange(i);
                  }
                }}
                title={i === activeDeck && onEdit ? 'Click to edit title' : undefined}
                className={`px-4 py-2 text-[11px] font-medium whitespace-nowrap transition-all border-b-2 ${
                  i === activeDeck
                    ? 'border-indigo-500 text-indigo-700 bg-white'
                    : 'border-transparent text-slate-400 hover:text-slate-600 hover:bg-slate-100/60'
                } ${i === activeDeck && onEdit ? 'cursor-text' : ''}`}
              >
                {d.lessonTitle || `Deck ${i + 1}`}
                <span className={`ml-1.5 text-[9px] ${i === activeDeck ? 'text-indigo-400' : 'text-slate-300'}`}>
                  ({d.slides?.length || 0})
                </span>
              </button>
            )
          ))}
        </div>
      )}

      {/* Main area: thumbnails + preview */}
      <div className="flex flex-1 min-h-0">
        {/* Left: Thumbnail panel */}
        <div className="w-48 flex-shrink-0 border-r border-slate-200/60 bg-gradient-to-b from-slate-50 to-slate-100/80 overflow-y-auto py-3 px-2.5 space-y-2">
          {slides.map((s, j) => {
            const isActive = j === activeSlide;
            return (
              <button
                key={j}
                onClick={() => setActiveSlide(j)}
                className={`w-full text-left transition-all group ${
                  isActive ? '' : 'opacity-70 hover:opacity-100'
                }`}
              >
                <div className="flex gap-2 items-start">
                  <span className={`text-[9px] font-bold mt-2 w-5 text-right flex-shrink-0 tabular-nums ${isActive ? 'text-indigo-500' : 'text-slate-400'}`}>{j + 1}</span>
                  <div className={`flex-1 rounded-md overflow-hidden transition-all ${
                    isActive
                      ? 'ring-2 ring-indigo-500 ring-offset-1 shadow-md'
                      : 'ring-1 ring-slate-200 hover:ring-slate-300 shadow-sm'
                  }`}>
                    <SlideThumbnail slide={s} slideIndex={j} deckTitle={deckTitle} deckIndex={activeDeck} />
                  </div>
                </div>
              </button>
            );
          })}
          {isStreaming && slides.length > 0 && (
            <div className="flex items-center justify-center py-3 gap-1.5">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
              </span>
              <span className="text-[9px] text-slate-400">Generating...</span>
            </div>
          )}
        </div>

        {/* Right: Slide preview + notes */}
        <div className="flex-1 flex flex-col min-w-0" style={{ background: 'linear-gradient(135deg, #e8eaee 0%, #dfe1e6 100%)' }}>
          {/* Slide canvas area */}
          <div className="flex-1 flex items-center justify-center p-8 min-h-0">
            {slide ? (
              <div className="w-full max-w-3xl">
                <SlideCanvas
                  slide={slide}
                  slideIndex={activeSlide}
                  totalSlides={slides.length}
                  deckTitle={deckTitle}
                  dataKey={key}
                  deckIndex={activeDeck}
                  lessonNumber={extractLessonNumber(deckTitle, activeDeck + 1)}
                  onEdit={onEdit}
                />

                {/* Navigation bar below slide */}
                <div className="flex items-center justify-between mt-4 px-1">
                  <button
                    onClick={() => setActiveSlide(Math.max(0, activeSlide - 1))}
                    disabled={activeSlide === 0}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-500 bg-white/60 hover:bg-white hover:text-slate-700 shadow-sm transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                    Prev
                  </button>
                  <span className="text-[11px] text-slate-500 font-semibold bg-white/60 px-3 py-1 rounded-full shadow-sm tabular-nums">
                    {activeSlide + 1} / {slides.length}
                  </span>
                  <button
                    onClick={() => setActiveSlide(Math.min(slides.length - 1, activeSlide + 1))}
                    disabled={activeSlide >= slides.length - 1}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-500 bg-white/60 hover:bg-white hover:text-slate-700 shadow-sm transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    Next
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-center text-slate-400">
                <p className="text-sm font-medium">No slides yet</p>
                {isStreaming && <p className="text-xs mt-1">Generating...</p>}
              </div>
            )}
          </div>

          {/* Speaker notes panel */}
          {(slide?.notes || slide?.activityType || slide?.bloomsLevel) && (
            <div className="border-t border-slate-300/40 bg-white flex-shrink-0">
              <button
                onClick={() => setShowNotes(!showNotes)}
                className="w-full flex items-center gap-2 px-5 py-2 text-left hover:bg-slate-50/80 transition-colors"
              >
                <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Speaker Notes</span>
                {/* Metadata chips */}
                <div className="flex items-center gap-1.5 ml-2">
                  {slide?.activityType && (
                    <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-amber-50 text-amber-700">
                      <E value={slide.activityType} path={[key, activeDeck, 'slides', activeSlide, 'activityType']} onEdit={onEdit} className="text-[9px] font-semibold text-amber-700" />
                    </span>
                  )}
                  {slide?.timer && (
                    <span className="text-[9px] text-slate-400">⏱ <E value={slide.timer} path={[key, activeDeck, 'slides', activeSlide, 'timer']} onEdit={onEdit} className="text-[9px] text-slate-400" /></span>
                  )}
                  {slide?.bloomsLevel && (
                    <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-violet-50 text-violet-600">
                      <E value={slide.bloomsLevel} path={[key, activeDeck, 'slides', activeSlide, 'bloomsLevel']} onEdit={onEdit} className="text-[9px] font-semibold text-violet-600" />
                    </span>
                  )}
                </div>
                <svg className={`w-3 h-3 text-slate-400 ml-auto transition-transform ${showNotes ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {showNotes && slide?.notes && (
                <div className="px-5 pb-3 max-h-32 overflow-y-auto">
                  <p className="text-xs text-slate-600 leading-relaxed">
                    <E value={slide.notes} path={[key, activeDeck, 'slides', activeSlide, 'notes']} onEdit={onEdit} className="text-xs text-slate-600 leading-relaxed" multiline />
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Quiz Bank ───
function QuizBankView({ data, isStreaming, onEdit, regeneratingIndex, onRegenerateLesson, onSaveToBank, activeTier, freshLessonIndices }) {
  if (!data) return isStreaming ? <StreamingBanner /> : <EmptyState />;
  const key = data.quizzes ? 'quizzes' : 'quizBank';
  const quizzes = data[key] || [];
  if (quizzes.length === 0 && !isStreaming) return <EmptyState />;
  return (
    <div className="space-y-3 p-4">
      {quizzes.map((baseQuiz, i) => {
        // Feature 4.1 — select tier variant
        const quiz = (activeTier && activeTier !== 'standard' && baseQuiz.tiers?.[activeTier]) ? { ...baseQuiz, ...baseQuiz.tiers[activeTier] } : baseQuiz;
        const subtitle = [
          quiz.questions?.length ? `${quiz.questions.length} questions` : null,
          quiz.bloomsCoverage?.length ? quiz.bloomsCoverage.join(', ') : null,
        ].filter(Boolean).join(' · ');
        return (
          <CollapsibleCard key={i} title={quiz.lessonTitle || `Quiz ${i + 1}`} subtitle={subtitle} defaultOpen={i < 3} accent="sky" streaming={isStreaming && i === quizzes.length - 1} regenerating={regeneratingIndex === i} fresh={!!(freshLessonIndices?.has(i))} onRegenerate={onRegenerateLesson && !isStreaming ? () => onRegenerateLesson(i) : undefined} onTitleEdit={onEdit ? (newTitle) => onEdit([key, i, 'lessonTitle'], newTitle) : undefined}>
            <div className="pt-3 space-y-3">
              {quiz.bloomsCoverage?.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {quiz.bloomsCoverage.map((b, k) => <BloomsTag key={k} level={b} />)}
                </div>
              )}
              {(quiz.questions || []).map((q, j) => (
                <QuestionCard key={j} question={q} number={j + 1} qPath={[key, i, 'questions', j]} onEdit={onEdit} onSaveToBank={onSaveToBank} />
              ))}
            </div>
          </CollapsibleCard>
        );
      })}
    </div>
  );
}

function QuestionCard({ question, number, qPath, onEdit, onSaveToBank }) {
  const [showAnswer, setShowAnswer] = useState(false);
  const [saved, setSaved] = useState(false);
  const q = question;
  const typeColors = { multiple_choice: 'sky', short_answer: 'violet', essay: 'rose' };
  const diffColors = { Easy: 'text-emerald-600 bg-emerald-50', Medium: 'text-amber-600 bg-amber-50', Hard: 'text-red-600 bg-red-50' };
  const color = typeColors[q.type] || 'slate';
  const handleSave = () => {
    if (!onSaveToBank) return;
    onSaveToBank({ type: 'quiz', text: q.question || '', bloomsLevel: q.bloomsLevel || '' });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };
  return (
    <div className="bg-white/60 rounded-lg border border-slate-100 p-3 space-y-2">
      <div className="flex items-start gap-2">
        <span className="text-[10px] font-bold text-sky-600 bg-sky-50 px-1.5 py-0.5 rounded mt-0.5 flex-shrink-0">Q{number}</span>
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
            <Badge color={color}>{(q.type || 'question').replace('_', ' ')}</Badge>
            {q.bloomsLevel && <BloomsTag level={q.bloomsLevel} />}
            {q.difficulty && (
              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ${diffColors[q.difficulty] || 'text-slate-500 bg-slate-50'}`}>
                {q.difficulty}
              </span>
            )}
            {q.points && <span className="text-[10px] text-slate-400 ml-auto">{q.points} pts</span>}
            {q.estimatedMinutes && <span className="text-[10px] text-slate-400">~{q.estimatedMinutes} min</span>}
            {onSaveToBank && (
              <button
                onClick={handleSave}
                className={`ml-auto text-[9px] font-semibold px-1.5 py-0.5 rounded transition-all ${saved ? 'text-emerald-600 bg-emerald-50' : 'text-slate-400 hover:text-amber-600 hover:bg-amber-50'}`}
                title="Save to Assessment Bank"
              >
                {saved ? '✓ Saved' : '💾'}
              </button>
            )}
          </div>
          {q.objectiveAligned && (
            <p className="text-[9px] text-indigo-400 mb-1.5">↳ <E value={q.objectiveAligned} path={[...qPath, 'objectiveAligned']} onEdit={onEdit} className="text-[9px] text-indigo-400" /></p>
          )}
          <p className="text-xs text-slate-800 font-medium leading-relaxed"><E value={q.question} path={[...qPath, 'question']} onEdit={onEdit} multiline /></p>
        </div>
      </div>
      {q.options && (
        <div className="ml-8 space-y-1">
          {q.options.map((opt, k) => {
            const isCorrect = showAnswer && opt.startsWith(q.answer);
            return (
              <div key={k} className={`text-[11px] px-2.5 py-1.5 rounded transition-colors ${isCorrect ? 'bg-emerald-50 text-emerald-700 font-semibold' : 'text-slate-600 bg-slate-50/40'}`}>
                <E value={opt} path={[...qPath, 'options', k]} onEdit={onEdit} />
              </div>
            );
          })}
        </div>
      )}
      <button onClick={() => setShowAnswer(!showAnswer)} className="text-[10px] font-semibold text-indigo-500 hover:text-indigo-700 ml-8 transition-colors">
        {showAnswer ? 'Hide answer ↑' : 'Show answer + rationale ↓'}
      </button>
      {showAnswer && (
        <div className="ml-8 text-[11px] bg-emerald-50/60 rounded-lg p-3 border border-emerald-100/50 space-y-2">
          {q.answer && <p><span className="font-semibold text-emerald-700">Answer:</span> <E value={q.answer} path={[...qPath, 'answer']} onEdit={onEdit} className="text-slate-700" /></p>}
          {q.explanation && (
            <div>
              <span className="font-semibold text-emerald-700 block mb-0.5">Explanation:</span>
              <E value={q.explanation} path={[...qPath, 'explanation']} onEdit={onEdit} className="text-slate-700 leading-relaxed" multiline />
            </div>
          )}
          {q.distractorRationale && (
            <div className="bg-amber-50/60 rounded p-2 border border-amber-100/50">
              <span className="font-semibold text-amber-700 block mb-0.5 text-[10px]">Distractor Rationale (misconceptions tested):</span>
              <E value={q.distractorRationale} path={[...qPath, 'distractorRationale']} onEdit={onEdit} className="text-slate-600 text-[10px] leading-relaxed" multiline />
            </div>
          )}
          {q.sampleAnswer && (
            <div>
              <span className="font-semibold text-emerald-700 block mb-0.5">Model Answer:</span>
              <E value={q.sampleAnswer} path={[...qPath, 'sampleAnswer']} onEdit={onEdit} className="text-slate-700 leading-relaxed" multiline />
            </div>
          )}
          {q.rubricHints && (
            <div className="bg-violet-50/40 rounded p-2 border border-violet-100/50">
              <span className="font-semibold text-violet-700 block mb-0.5 text-[10px]">Essay Scoring Criteria:</span>
              <E value={q.rubricHints} path={[...qPath, 'rubricHints']} onEdit={onEdit} className="text-slate-600 text-[10px] leading-relaxed" multiline />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Discussion Prompts ───
function DiscussionsView({ data, isStreaming, onEdit, regeneratingIndex, onRegenerateLesson, isStudentView, onSaveToBank, activeTier, freshLessonIndices }) {
  if (!data) return isStreaming ? <StreamingBanner /> : <EmptyState />;
  const discussions = data.discussions || [];
  if (discussions.length === 0 && !isStreaming) return <EmptyState />;
  return (
    <div className="space-y-3 p-4">
      {discussions.map((baseD, i) => {
        // Feature 4.1 — select tier variant
        const d = (activeTier && activeTier !== 'standard' && baseD.tiers?.[activeTier]) ? { ...baseD, ...baseD.tiers[activeTier] } : baseD;
        const subtitle = [d.bloomsLevel, d.format, d.estimatedDuration].filter(Boolean).join(' · ');
        return (
          <CollapsibleCard key={i} title={d.lessonTitle || `Discussion ${i + 1}`} subtitle={subtitle} defaultOpen={i < 3} accent="rose" streaming={isStreaming && i === discussions.length - 1} regenerating={regeneratingIndex === i} fresh={!!(freshLessonIndices?.has(i))} onRegenerate={onRegenerateLesson && !isStreaming ? () => onRegenerateLesson(i) : undefined} onTitleEdit={onEdit ? (newTitle) => onEdit(['discussions', i, 'lessonTitle'], newTitle) : undefined}>
            <div className="pt-3 space-y-3">
              {/* Save to Bank button */}
              {onSaveToBank && d.prompt && (
                <SaveToBankButton
                  onClick={() => onSaveToBank({ type: 'discussion', text: d.prompt, bloomsLevel: d.bloomsLevel || '' })}
                />
              )}

              {/* Meta row: Bloom's + format + time */}
              <div className="flex flex-wrap gap-1.5">
                {d.bloomsLevel && <BloomsTag level={d.bloomsLevel} />}
                {d.format && <Badge color="rose">{d.format}</Badge>}
                {d.estimatedDuration && <span className="text-[10px] text-slate-400 self-center">⏱ {d.estimatedDuration}</span>}
              </div>

              {/* Context */}
              {d.context && (
                <div>
                  <SectionHeading>Context</SectionHeading>
                  <p className="text-xs text-slate-600 leading-relaxed"><E value={d.context} path={['discussions', i, 'context']} onEdit={onEdit} multiline /></p>
                </div>
              )}

              {/* Main prompt */}
              <div className="bg-rose-50/40 rounded-lg p-3.5 border border-rose-100/50">
                <SectionHeading>Discussion Prompt</SectionHeading>
                <p className="text-sm text-slate-800 leading-relaxed font-medium"><E value={d.prompt} path={['discussions', i, 'prompt']} onEdit={onEdit} multiline /></p>
                {d.evidenceRequirement && (
                  <p className="text-[11px] text-rose-600 mt-2 italic">
                    📚 <E value={d.evidenceRequirement} path={['discussions', i, 'evidenceRequirement']} onEdit={onEdit} />
                  </p>
                )}
              </div>

              {/* Follow-up probes */}
              {d.followUpProbes?.length > 0 && (
                <div>
                  <SectionHeading>Follow-Up Probes</SectionHeading>
                  <ul className="space-y-1.5">
                    {d.followUpProbes.map((probe, j) => (
                      <li key={j} className="text-xs text-slate-700 flex gap-2 leading-relaxed">
                        <span className="text-rose-400 flex-shrink-0">→</span>
                        <E value={probe} path={['discussions', i, 'followUpProbes', j]} onEdit={onEdit} />
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {/* Legacy single followUp field */}
              {!d.followUpProbes?.length && d.followUp && (
                <div>
                  <SectionHeading>Follow-Up</SectionHeading>
                  <p className="text-xs text-slate-600"><E value={d.followUp} path={['discussions', i, 'followUp']} onEdit={onEdit} multiline /></p>
                </div>
              )}

              {/* Facilitation tips — instructor-only, hidden in student view */}
              {d.facilitationTips && !isStudentView && (
                <div className="bg-amber-50/40 rounded-lg p-3 border border-amber-100/50">
                  <SectionHeading>Facilitation Tips</SectionHeading>
                  {d.facilitationTips.opening && (
                    <div className="mb-1.5">
                      <span className="text-[10px] font-bold text-amber-700 uppercase">Opening</span>
                      <p className="text-[11px] text-slate-600 mt-0.5 leading-relaxed"><E value={d.facilitationTips.opening} path={['discussions', i, 'facilitationTips', 'opening']} onEdit={onEdit} /></p>
                    </div>
                  )}
                  {d.facilitationTips.ifStalls && (
                    <div className="mb-1.5">
                      <span className="text-[10px] font-bold text-amber-700 uppercase">If Discussion Stalls</span>
                      <p className="text-[11px] text-slate-600 mt-0.5 leading-relaxed"><E value={d.facilitationTips.ifStalls} path={['discussions', i, 'facilitationTips', 'ifStalls']} onEdit={onEdit} /></p>
                    </div>
                  )}
                  {d.facilitationTips.ifDominates && (
                    <div className="mb-1.5">
                      <span className="text-[10px] font-bold text-amber-700 uppercase">If One Student Dominates</span>
                      <p className="text-[11px] text-slate-600 mt-0.5 leading-relaxed"><E value={d.facilitationTips.ifDominates} path={['discussions', i, 'facilitationTips', 'ifDominates']} onEdit={onEdit} /></p>
                    </div>
                  )}
                  {d.facilitationTips.closure && (
                    <div>
                      <span className="text-[10px] font-bold text-amber-700 uppercase">Closing the Discussion</span>
                      <p className="text-[11px] text-slate-600 mt-0.5 leading-relaxed"><E value={d.facilitationTips.closure} path={['discussions', i, 'facilitationTips', 'closure']} onEdit={onEdit} /></p>
                    </div>
                  )}
                </div>
              )}

              {/* Response starters */}
              {d.responseStarters?.length > 0 && (
                <div>
                  <SectionHeading>Response Starters for Students</SectionHeading>
                  <div className="space-y-1">
                    {d.responseStarters.map((s, j) => (
                      <div key={j} className="text-xs text-slate-600 bg-white/60 rounded px-2.5 py-1.5 border border-slate-100 italic">
                        "<E value={s} path={['discussions', i, 'responseStarters', j]} onEdit={onEdit} />"
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Evaluation criteria — instructor-only, hidden in student view */}
              {d.evaluationCriteria?.length > 0 && !isStudentView && (
                <div>
                  <SectionHeading>Evaluation Criteria</SectionHeading>
                  <ul className="space-y-1">
                    {d.evaluationCriteria.map((c, j) => (
                      <li key={j} className="text-xs text-slate-700 flex gap-2">
                        <span className="text-emerald-400 flex-shrink-0">✓</span>
                        <E value={c} path={['discussions', i, 'evaluationCriteria', j]} onEdit={onEdit} />
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Equity considerations */}
              {d.equityConsiderations && (
                <div className="bg-teal-50/40 rounded-lg p-3 border border-teal-100/50">
                  <h4 className="text-[10px] font-bold text-teal-700 uppercase tracking-wide mb-1">♿ Equity &amp; Inclusion</h4>
                  <p className="text-[11px] text-slate-600 leading-relaxed"><E value={d.equityConsiderations} path={['discussions', i, 'equityConsiderations']} onEdit={onEdit} multiline /></p>
                </div>
              )}

              {/* Student-facing guidelines */}
              {d.guidelines && (
                <div>
                  <SectionHeading>Student Guidelines</SectionHeading>
                  <p className="text-xs text-slate-600 leading-relaxed"><E value={d.guidelines} path={['discussions', i, 'guidelines']} onEdit={onEdit} multiline /></p>
                </div>
              )}
            </div>
          </CollapsibleCard>
        );
      })}
    </div>
  );
}

// ─── Assignment Briefs ───
function AssignmentsView({ data, isStreaming, onEdit, regeneratingIndex, onRegenerateLesson, isStudentView, activeTier, freshLessonIndices }) {
  if (!data) return isStreaming ? <StreamingBanner /> : <EmptyState />;
  const assignments = data.assignments || [];
  if (assignments.length === 0 && !isStreaming) return <EmptyState />;
  return (
    <div className="space-y-3 p-4">
      {assignments.map((baseA, i) => {
        // Feature 4.1 — select tier variant
        const a = (activeTier && activeTier !== 'standard' && baseA.tiers?.[activeTier]) ? { ...baseA, ...baseA.tiers[activeTier] } : baseA;
        const subtitle = [
          a.dueWeek || a.dueDate,
          a.estimatedTime,
          a.totalPoints ? `${a.totalPoints} pts` : null,
          a.percentOfGrade,
        ].filter(Boolean).join(' · ');
        return (
          <CollapsibleCard key={i} title={a.title || `Assignment ${i + 1}`} subtitle={subtitle} defaultOpen={i < 3} accent="orange" streaming={isStreaming && i === assignments.length - 1} regenerating={regeneratingIndex === i} fresh={!!(freshLessonIndices?.has(i))} onRegenerate={onRegenerateLesson && !isStreaming ? () => onRegenerateLesson(i) : undefined} onTitleEdit={onEdit ? (newTitle) => onEdit(['assignments', i, 'title'], newTitle) : undefined}>
            <div className="pt-3 space-y-4">

              {/* Meta chips */}
              <div className="flex flex-wrap gap-1.5">
                {a.assignmentType && <Badge color="orange">{a.assignmentType}</Badge>}
                {a.bloomsLevel && <BloomsTag level={a.bloomsLevel} />}
                {a.relatedLessons?.map((l, j) => <Badge key={j} color="slate">{l}</Badge>)}
              </div>

              {/* Overview */}
              {a.overview && (
                <div>
                  <SectionHeading>Overview &amp; Purpose</SectionHeading>
                  <p className="text-xs text-slate-700 leading-relaxed"><E value={a.overview} path={['assignments', i, 'overview']} onEdit={onEdit} multiline /></p>
                </div>
              )}
              {/* Legacy description */}
              {!a.overview && a.description && (
                <div>
                  <SectionHeading>Description</SectionHeading>
                  <p className="text-xs text-slate-700 leading-relaxed"><E value={a.description} path={['assignments', i, 'description']} onEdit={onEdit} multiline /></p>
                </div>
              )}

              {/* Learning objectives */}
              {a.objectives?.length > 0 && (
                <div>
                  <SectionHeading>Learning Objectives Assessed</SectionHeading>
                  <ul className="space-y-1">
                    {a.objectives.map((o, j) => (
                      <li key={j} className="text-xs text-slate-700 flex gap-2">
                        <span className="text-orange-400 flex-shrink-0">•</span>
                        <E value={o} path={['assignments', i, 'objectives', j]} onEdit={onEdit} />
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Instructions */}
              {a.instructions?.length > 0 && (
                <div>
                  <SectionHeading>Instructions</SectionHeading>
                  <ol className="space-y-1.5 list-none">
                    {a.instructions.map((step, j) => (
                      <li key={j} className="text-xs text-slate-700 flex gap-2.5">
                        <span className="flex-shrink-0 w-5 h-5 rounded-full bg-orange-100 text-orange-700 text-[10px] font-bold flex items-center justify-center">{j + 1}</span>
                        <E value={step} path={['assignments', i, 'instructions', j]} onEdit={onEdit} multiline />
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              {/* Format requirements */}
              {a.formatRequirements && (
                <div className="bg-slate-50/60 rounded-lg p-3 border border-slate-100 grid grid-cols-2 gap-x-4 gap-y-1.5">
                  <SectionHeading>Format &amp; Submission</SectionHeading>
                  <div className="col-span-2" />
                  {a.formatRequirements.length && (
                    <div><span className="text-[10px] font-bold text-slate-500">Length:</span><p className="text-[11px] text-slate-700"><E value={a.formatRequirements.length} path={['assignments', i, 'formatRequirements', 'length']} onEdit={onEdit} /></p></div>
                  )}
                  {a.formatRequirements.format && (
                    <div><span className="text-[10px] font-bold text-slate-500">Format:</span><p className="text-[11px] text-slate-700"><E value={a.formatRequirements.format} path={['assignments', i, 'formatRequirements', 'format']} onEdit={onEdit} /></p></div>
                  )}
                  {a.formatRequirements.citationStyle && (
                    <div><span className="text-[10px] font-bold text-slate-500">Citation:</span><p className="text-[11px] text-slate-700"><E value={a.formatRequirements.citationStyle} path={['assignments', i, 'formatRequirements', 'citationStyle']} onEdit={onEdit} /></p></div>
                  )}
                  {a.formatRequirements.submissionPlatform && (
                    <div><span className="text-[10px] font-bold text-slate-500">Submit to:</span><p className="text-[11px] text-slate-700"><E value={a.formatRequirements.submissionPlatform} path={['assignments', i, 'formatRequirements', 'submissionPlatform']} onEdit={onEdit} /></p></div>
                  )}
                  {a.formatRequirements.latePolicy && (
                    <div className="col-span-2 bg-red-50/40 rounded p-1.5">
                      <span className="text-[10px] font-bold text-red-600">Late Policy:</span>
                      <p className="text-[11px] text-slate-700"><E value={a.formatRequirements.latePolicy} path={['assignments', i, 'formatRequirements', 'latePolicy']} onEdit={onEdit} /></p>
                    </div>
                  )}
                </div>
              )}

              {/* Deliverables checklist */}
              {a.deliverables?.length > 0 && (
                <div>
                  <SectionHeading>Submission Checklist</SectionHeading>
                  <ul className="space-y-1">
                    {a.deliverables.map((d, j) => (
                      <li key={j} className="text-xs text-slate-700 flex gap-2 items-start">
                        <span className="text-orange-400 flex-shrink-0 mt-0.5">☐</span>
                        <E value={d} path={['assignments', i, 'deliverables', j]} onEdit={onEdit} />
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Scaffolding milestones */}
              {a.scaffoldingMilestones?.length > 0 && (
                <div>
                  <SectionHeading>Scaffolding Milestones</SectionHeading>
                  <div className="space-y-2">
                    {a.scaffoldingMilestones.map((m, j) => (
                      <div key={j} className="flex gap-3 items-start bg-indigo-50/30 rounded-lg px-3 py-2 border border-indigo-100/40">
                        <div className="flex-shrink-0 text-center">
                          <span className="text-[9px] font-bold text-indigo-600 block">{m.dueDate}</span>
                        </div>
                        <div className="flex-1">
                          <span className="text-xs font-semibold text-indigo-800 block"><E value={m.milestone} path={['assignments', i, 'scaffoldingMilestones', j, 'milestone']} onEdit={onEdit} /></span>
                          {m.description && <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed"><E value={m.description} path={['assignments', i, 'scaffoldingMilestones', j, 'description']} onEdit={onEdit} /></p>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Grading criteria — internal, hidden in student view */}
              {a.gradingCriteria && !isStudentView && (
                <div>
                  <SectionHeading>Grading Criteria Summary</SectionHeading>
                  <p className="text-xs text-slate-600 leading-relaxed"><E value={a.gradingCriteria} path={['assignments', i, 'gradingCriteria']} onEdit={onEdit} multiline /></p>
                </div>
              )}

              {/* Support resources */}
              {a.supportResources?.length > 0 && (
                <div>
                  <SectionHeading>Support Resources</SectionHeading>
                  <ul className="space-y-1">
                    {a.supportResources.map((r, j) => (
                      <li key={j} className="text-xs text-slate-600 flex gap-2">
                        <span className="text-teal-400 flex-shrink-0">▸</span>
                        <E value={r} path={['assignments', i, 'supportResources', j]} onEdit={onEdit} />
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Academic integrity */}
              {a.academicIntegrityStatement && (
                <div className="bg-slate-50/80 rounded-lg p-3 border border-slate-200/60">
                  <h4 className="text-[10px] font-bold text-slate-600 uppercase tracking-wide mb-1">⚖️ Academic Integrity</h4>
                  <p className="text-[11px] text-slate-600 leading-relaxed"><E value={a.academicIntegrityStatement} path={['assignments', i, 'academicIntegrityStatement']} onEdit={onEdit} multiline /></p>
                </div>
              )}
            </div>
          </CollapsibleCard>
        );
      })}
    </div>
  );
}

// ─── Study Guides ───
function StudyGuidesView({ data, isStreaming, onEdit, regeneratingIndex, onRegenerateLesson, activeTier, freshLessonIndices }) {
  if (!data) return isStreaming ? <StreamingBanner /> : <EmptyState />;
  const key = data.guides ? 'guides' : 'studyGuides';
  const guides = data[key] || [];
  if (guides.length === 0 && !isStreaming) return <EmptyState />;
  return (
    <div className="space-y-3 p-4">
      {guides.map((baseG, i) => {
        // Feature 4.1 — select tier variant
        const g = (activeTier && activeTier !== 'standard' && baseG.tiers?.[activeTier]) ? { ...baseG, ...baseG.tiers[activeTier] } : baseG;
        const subtitle = g.examScope || '';
        return (
          <CollapsibleCard key={i} title={g.lessonTitle || `Guide ${i + 1}`} subtitle={subtitle} defaultOpen={i < 3} accent="teal" streaming={isStreaming && i === guides.length - 1} regenerating={regeneratingIndex === i} fresh={!!(freshLessonIndices?.has(i))} onRegenerate={onRegenerateLesson && !isStreaming ? () => onRegenerateLesson(i) : undefined} onTitleEdit={onEdit ? (newTitle) => onEdit([key, i, 'lessonTitle'], newTitle) : undefined}>
            <div className="pt-3 space-y-4">

              {/* Summary */}
              {g.summary && (
                <div>
                  <SectionHeading>Concept Summary</SectionHeading>
                  <p className="text-xs text-slate-700 leading-relaxed"><E value={g.summary} path={[key, i, 'summary']} onEdit={onEdit} multiline /></p>
                </div>
              )}

              {/* Key Terms */}
              {g.keyTerms?.length > 0 && (
                <div>
                  <SectionHeading>Key Terms &amp; Definitions</SectionHeading>
                  <div className="space-y-2">
                    {g.keyTerms.map((t, j) => (
                      <div key={j} className="bg-teal-50/40 rounded-lg px-3 py-2 border border-teal-100/50">
                        <div className="flex flex-wrap items-baseline gap-1">
                          <span className="text-xs font-bold text-teal-800">
                            <E value={t.term} path={[key, i, 'keyTerms', j, 'term']} onEdit={onEdit} />
                          </span>
                          <span className="text-[11px] text-slate-600">
                            — <E value={t.definition} path={[key, i, 'keyTerms', j, 'definition']} onEdit={onEdit} />
                          </span>
                        </div>
                        {t.example && (
                          <p className="text-[10px] text-teal-600 mt-0.5 italic">
                            <span className="font-semibold not-italic">Ex:</span> <E value={t.example} path={[key, i, 'keyTerms', j, 'example']} onEdit={onEdit} />
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Concept connections */}
              {g.conceptConnections?.length > 0 && (
                <div>
                  <SectionHeading>Concept Connections</SectionHeading>
                  <ul className="space-y-1.5">
                    {g.conceptConnections.map((c, j) => (
                      <li key={j} className="text-xs text-slate-700 flex gap-2 leading-relaxed">
                        <span className="text-teal-400 flex-shrink-0">🔗</span>
                        <E value={c} path={[key, i, 'conceptConnections', j]} onEdit={onEdit} />
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Common misconceptions */}
              {g.commonMisconceptions?.length > 0 && (
                <div className="bg-red-50/30 rounded-lg p-3 border border-red-100/40">
                  <SectionHeading>Common Misconceptions</SectionHeading>
                  <div className="space-y-2.5">
                    {g.commonMisconceptions.map((m, j) => (
                      <div key={j}>
                        <p className="text-xs text-red-700 font-medium flex gap-1.5">
                          <span>✗</span>
                          <E value={m.misconception} path={[key, i, 'commonMisconceptions', j, 'misconception']} onEdit={onEdit} />
                        </p>
                        {m.correction && (
                          <p className="text-xs text-emerald-700 flex gap-1.5 mt-0.5 ml-4">
                            <span>✓</span>
                            <E value={m.correction} path={[key, i, 'commonMisconceptions', j, 'correction']} onEdit={onEdit} />
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Review Questions */}
              {g.reviewQuestions?.length > 0 && (
                <div>
                  <SectionHeading>Review Questions</SectionHeading>
                  <ol className="space-y-2">
                    {g.reviewQuestions.map((q, j) => {
                      const isObj = typeof q === 'object' && q !== null;
                      const qText = isObj ? q.question : q;
                      const bloomsLevel = isObj ? q.bloomsLevel : null;
                      const hint = isObj ? q.hint : null;
                      return (
                        <li key={j} className="text-xs text-slate-700">
                          <div className="flex items-start gap-2">
                            <span className="flex-shrink-0 w-5 h-5 rounded-full bg-teal-100 text-teal-700 text-[10px] font-bold flex items-center justify-center mt-0.5">{j + 1}</span>
                            <div className="flex-1">
                              <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
                                {bloomsLevel && <BloomsTag level={bloomsLevel} />}
                              </div>
                              <E value={qText} path={[key, i, 'reviewQuestions', j, ...(isObj ? ['question'] : [])]} onEdit={onEdit} />
                              {hint && (
                                <p className="text-[10px] text-slate-400 mt-0.5 italic">
                                  💡 <E value={hint} path={[key, i, 'reviewQuestions', j, 'hint']} onEdit={onEdit} className="text-[10px] text-slate-400 italic" />
                                </p>
                              )}
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                </div>
              )}

              {/* Practice Activities */}
              {g.practiceActivities?.length > 0 && (
                <div>
                  <SectionHeading>Practice Activities</SectionHeading>
                  <ul className="space-y-1.5">
                    {g.practiceActivities.map((a, j) => (
                      <li key={j} className="text-xs text-slate-700 flex gap-2 leading-relaxed">
                        <span className="text-teal-400 flex-shrink-0 mt-0.5">▸</span>
                        <E value={a} path={[key, i, 'practiceActivities', j]} onEdit={onEdit} />
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Exam Prep */}
              {g.examPrep && (
                <div className="bg-amber-50/40 rounded-lg p-3 border border-amber-100/50 space-y-2">
                  <h4 className="text-[11px] font-bold text-amber-700 uppercase tracking-wider">📝 Exam Prep</h4>
                  {g.examPrep.keyTopicsToKnow?.length > 0 && (
                    <div>
                      <span className="text-[10px] font-bold text-amber-700 uppercase">High-Probability Topics</span>
                      <ul className="mt-1 space-y-0.5">
                        {g.examPrep.keyTopicsToKnow.map((t, j) => (
                          <li key={j} className="text-xs text-slate-700 flex gap-1.5">
                            <span className="text-amber-400 flex-shrink-0">★</span>
                            <E value={t} path={[key, i, 'examPrep', 'keyTopicsToKnow', j]} onEdit={onEdit} />
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {g.examPrep.commonErrors && (
                    <div>
                      <span className="text-[10px] font-bold text-red-600 uppercase">Common Errors to Avoid</span>
                      <p className="text-xs text-slate-700 mt-0.5 leading-relaxed"><E value={g.examPrep.commonErrors} path={[key, i, 'examPrep', 'commonErrors']} onEdit={onEdit} multiline /></p>
                    </div>
                  )}
                  {g.examPrep.reviewStrategy && (
                    <div>
                      <span className="text-[10px] font-bold text-teal-700 uppercase">Recommended Study Strategy</span>
                      <p className="text-xs text-slate-700 mt-0.5 leading-relaxed"><E value={g.examPrep.reviewStrategy} path={[key, i, 'examPrep', 'reviewStrategy']} onEdit={onEdit} multiline /></p>
                    </div>
                  )}
                  {g.examPrep.timeManagement && (
                    <div>
                      <span className="text-[10px] font-bold text-slate-500 uppercase">Time Management</span>
                      <p className="text-xs text-slate-700 mt-0.5 leading-relaxed"><E value={g.examPrep.timeManagement} path={[key, i, 'examPrep', 'timeManagement']} onEdit={onEdit} /></p>
                    </div>
                  )}
                </div>
              )}

              {/* Legacy examTips field */}
              {!g.examPrep && g.examTips && (
                <div className="bg-amber-50/40 rounded-lg p-3 border border-amber-100/50">
                  <h4 className="text-[11px] font-bold text-amber-700 mb-1">💡 Exam Tips</h4>
                  <p className="text-xs text-slate-700"><E value={g.examTips} path={[key, i, 'examTips']} onEdit={onEdit} multiline /></p>
                </div>
              )}
            </div>
          </CollapsibleCard>
        );
      })}
    </div>
  );
}

// ─── Syllabus ───
// Helper: render a policy block (heading + editable text)
function SylPolicyBlock({ label, value, path, onEdit }) {
  if (!value) return null;
  return (
    <div>
      <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">{label}</h4>
      <p className="text-xs text-slate-600 leading-relaxed"><E value={value} path={path} onEdit={onEdit} multiline /></p>
    </div>
  );
}
// Helper: format requiredTexts (supports both string[] and object[] for backward compat)
function formatTextEntry(t) {
  if (typeof t === 'string') return t;
  const parts = [];
  if (t.author) parts.push(t.author);
  if (t.title) parts.push(`*${t.title}*`);
  if (t.edition) parts.push(`(${t.edition})`);
  if (t.isbn) parts.push(`ISBN: ${t.isbn}`);
  if (t.note) parts.push(`— ${t.note}`);
  return parts.join('. ') || JSON.stringify(t);
}

function SyllabusView({ data, isStreaming, onEdit }) {
  if (!data) return isStreaming ? <StreamingBanner /> : <EmptyState />;
  const syl = data.syllabus || data;
  if (!syl.courseTitle && !syl.courseDescription) return <EmptyState />;

  // Backward compat: old schema had gradingPolicy, new has courseRequirements
  const requirements = syl.courseRequirements || syl.gradingPolicy || [];
  const hasDescription = requirements.some(r => r.description);

  // Resizable column widths for schedule table
  const hasDates = syl.weeklySchedule?.[0]?.dates;
  const defaultSchedWidths = hasDates ? [60, 70, 180, 200, 200] : [60, 200, 220, 220];
  const [schedColWidths, setSchedColWidths] = useState(defaultSchedWidths);
  const updateSchedCol = useCallback((idx, w) => setSchedColWidths(prev => prev.map((v, i) => i === idx ? w : v)), []);

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      {/* ── Course Header Block ─────────────────────────────────── */}
      <div className="text-center border-b-2 border-slate-300/60 pb-5">
        <h2 className="text-lg font-bold text-slate-800"><E value={syl.courseTitle || ''} path={['syllabus', 'courseTitle']} onEdit={onEdit} /></h2>
        {syl.semester && <p className="text-sm text-slate-500 mt-1"><E value={syl.semester} path={['syllabus', 'semester']} onEdit={onEdit} /></p>}
        <div className="flex flex-wrap justify-center gap-x-4 gap-y-0.5 mt-2 text-xs text-slate-500">
          {syl.credits && <span><E value={syl.credits} path={['syllabus', 'credits']} onEdit={onEdit} /></span>}
          {syl.meetingPattern && <span><E value={syl.meetingPattern} path={['syllabus', 'meetingPattern']} onEdit={onEdit} /></span>}
          {syl.location && <span><E value={syl.location} path={['syllabus', 'location']} onEdit={onEdit} /></span>}
          {syl.deliveryMode && <span><E value={syl.deliveryMode} path={['syllabus', 'deliveryMode']} onEdit={onEdit} /></span>}
        </div>
        {syl.prerequisites && <p className="text-xs text-slate-400 mt-1">Prerequisites: <E value={syl.prerequisites} path={['syllabus', 'prerequisites']} onEdit={onEdit} /></p>}
      </div>

      {/* ── Instructor Information ──────────────────────────────── */}
      <div className="bg-slate-50/60 rounded-lg p-4 border border-slate-100">
        <h3 className="text-sm font-bold text-slate-700 mb-2">Instructor Information</h3>
        <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
          {syl.instructor && <div><span className="font-semibold text-slate-500">Instructor: </span><E value={syl.instructor} path={['syllabus', 'instructor']} onEdit={onEdit} /></div>}
          {syl.instructorEmail && <div><span className="font-semibold text-slate-500">Email: </span><E value={syl.instructorEmail} path={['syllabus', 'instructorEmail']} onEdit={onEdit} /></div>}
          {syl.officeHours && <div><span className="font-semibold text-slate-500">Office Hours: </span><E value={syl.officeHours} path={['syllabus', 'officeHours']} onEdit={onEdit} /></div>}
          {syl.officeLocation && <div><span className="font-semibold text-slate-500">Office: </span><E value={syl.officeLocation} path={['syllabus', 'officeLocation']} onEdit={onEdit} /></div>}
        </div>
      </div>

      {/* ── Course Description ──────────────────────────────────── */}
      {syl.courseDescription && (
        <div>
          <h3 className="text-sm font-bold text-slate-700 mb-1">Course Description</h3>
          <p className="text-xs text-slate-600 leading-relaxed"><E value={syl.courseDescription} path={['syllabus', 'courseDescription']} onEdit={onEdit} multiline /></p>
        </div>
      )}

      {/* ── Learning Outcomes ──────────────────────────────────── */}
      {syl.learningOutcomes?.length > 0 && (
        <div>
          <h3 className="text-sm font-bold text-slate-700 mb-1.5">Student Learning Outcomes</h3>
          <p className="text-[10px] text-slate-400 mb-2">Upon successful completion of this course, students will be able to:</p>
          <ol className="space-y-1.5 list-decimal list-inside">
            {syl.learningOutcomes.map((o, i) => <li key={i} className="text-xs text-slate-600 leading-relaxed"><E value={o} path={['syllabus', 'learningOutcomes', i]} onEdit={onEdit} /></li>)}
          </ol>
        </div>
      )}

      {/* ── Required Texts & Materials ─────────────────────────── */}
      {syl.requiredTexts?.length > 0 && (
        <div>
          <h3 className="text-sm font-bold text-slate-700 mb-1.5">Required Texts & Materials</h3>
          <ul className="space-y-1.5">
            {syl.requiredTexts.map((t, i) => (
              <li key={i} className="text-xs text-slate-600 flex gap-2 leading-relaxed">
                <span className="text-slate-400 flex-shrink-0">•</span>
                {typeof t === 'string'
                  ? <E value={t} path={['syllabus', 'requiredTexts', i]} onEdit={onEdit} />
                  : <span>{formatTextEntry(t)}</span>
                }
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Course Requirements & Grading ──────────────────────── */}
      {requirements.length > 0 && (
        <div>
          <h3 className="text-sm font-bold text-slate-700 mb-1.5">Course Requirements & Grading</h3>
          <div className="rounded-lg border border-slate-200/60 overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50">
                  <th className="text-left px-3 py-2 font-semibold text-slate-600">Component</th>
                  <th className="text-right px-3 py-2 font-semibold text-slate-600 w-16">Weight</th>
                  {hasDescription && <th className="text-left px-3 py-2 font-semibold text-slate-600">Description</th>}
                </tr>
              </thead>
              <tbody>
                {requirements.map((g, i) => {
                  const basePath = syl.courseRequirements ? 'courseRequirements' : 'gradingPolicy';
                  return (
                    <tr key={i} className="border-t border-slate-100 align-top">
                      <td className="px-3 py-1.5 text-slate-700 font-medium"><E value={g.name || g.component || ''} path={['syllabus', basePath, i, g.name ? 'name' : 'component']} onEdit={onEdit} /></td>
                      <td className="px-3 py-1.5 text-right text-slate-600 whitespace-nowrap"><E value={g.weight || ''} path={['syllabus', basePath, i, 'weight']} onEdit={onEdit} /></td>
                      {hasDescription && <td className="px-3 py-1.5 text-slate-500 leading-relaxed"><E value={g.description || ''} path={['syllabus', basePath, i, 'description']} onEdit={onEdit} /></td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Grading Scale ──────────────────────────────────────── */}
      {syl.gradingScale?.length > 0 && (
        <div>
          <h3 className="text-sm font-bold text-slate-700 mb-1.5">Grading Scale</h3>
          <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-slate-600">
            {syl.gradingScale.map((g, i) => (
              <span key={i} className="whitespace-nowrap"><span className="font-semibold text-slate-700">{g.grade}</span> = {g.range}</span>
            ))}
          </div>
        </div>
      )}

      {/* ── Course Schedule (resizable columns) ─────────────── */}
      {syl.weeklySchedule?.length > 0 && (() => {
        const headers = hasDates
          ? ['Week', 'Dates', 'Topic', 'Readings', 'Assignments']
          : ['Week', 'Topic', 'Readings', 'Assignments'];
        return (
          <div>
            <h3 className="text-sm font-bold text-slate-700 mb-1.5">Course Schedule</h3>
            <div className="rounded-lg border border-slate-200/60 overflow-x-auto">
              <table className="text-xs" style={{ tableLayout: 'fixed', width: schedColWidths.reduce((a, b) => a + b, 0) + 'px' }}>
                <thead>
                  <tr className="bg-slate-50">
                    {headers.map((h, idx) => (
                      <ResizableTh
                        key={h}
                        width={schedColWidths[idx]}
                        onResize={(w) => updateSchedCol(idx, w)}
                        className="text-left px-3 py-2 font-semibold text-slate-600"
                      >
                        {h}
                      </ResizableTh>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {syl.weeklySchedule.map((w, i) => {
                    const cells = hasDates
                      ? [
                          { val: w.week, key: 'week', cls: 'text-slate-500 font-medium' },
                          { val: w.dates || '', key: 'dates', cls: 'text-slate-400' },
                          { val: w.topic, key: 'topic', cls: 'text-slate-700' },
                          { val: w.readings || '', key: 'readings', cls: 'text-slate-600' },
                          { val: w.assignments || '', key: 'assignments', cls: 'text-slate-600' },
                        ]
                      : [
                          { val: w.week, key: 'week', cls: 'text-slate-500 font-medium' },
                          { val: w.topic, key: 'topic', cls: 'text-slate-700' },
                          { val: w.readings || '', key: 'readings', cls: 'text-slate-600' },
                          { val: w.assignments || '', key: 'assignments', cls: 'text-slate-600' },
                        ];
                    return (
                      <tr key={i} className="border-t border-slate-100 align-top">
                        {cells.map((c, ci) => (
                          <td key={c.key} className={`px-3 py-1.5 ${c.cls}`} style={{ width: schedColWidths[ci] + 'px', wordBreak: 'break-word' }}>
                            <E value={c.val} path={['syllabus', 'weeklySchedule', i, c.key]} onEdit={onEdit} multiline />
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}

      {/* ── Course Policies ────────────────────────────────────── */}
      <div className="space-y-4">
        <h3 className="text-sm font-bold text-slate-700">Course Policies</h3>
        <SylPolicyBlock label="Attendance & Participation" value={syl.attendancePolicy} path={['syllabus', 'attendancePolicy']} onEdit={onEdit} />
        <SylPolicyBlock label="Late Work Policy" value={syl.latePolicy} path={['syllabus', 'latePolicy']} onEdit={onEdit} />
        <SylPolicyBlock label="Communication" value={syl.communicationPolicy} path={['syllabus', 'communicationPolicy']} onEdit={onEdit} />
        <SylPolicyBlock label="Technology & Devices" value={syl.technologyPolicy} path={['syllabus', 'technologyPolicy']} onEdit={onEdit} />
        <SylPolicyBlock label="Generative AI Policy" value={syl.aiPolicy} path={['syllabus', 'aiPolicy']} onEdit={onEdit} />
      </div>

      {/* ── University Policies & Resources ────────────────────── */}
      <div className="space-y-4">
        <h3 className="text-sm font-bold text-slate-700">University Policies & Resources</h3>
        <SylPolicyBlock label="Academic Integrity" value={syl.academicIntegrity} path={['syllabus', 'academicIntegrity']} onEdit={onEdit} />
        <SylPolicyBlock label="Disability & Accessibility" value={syl.accommodations} path={['syllabus', 'accommodations']} onEdit={onEdit} />
        <SylPolicyBlock label="Mental Health & Wellness" value={syl.mentalHealth} path={['syllabus', 'mentalHealth']} onEdit={onEdit} />
        <SylPolicyBlock label="Title IX / Non-Discrimination" value={syl.titleIX} path={['syllabus', 'titleIX']} onEdit={onEdit} />
        <SylPolicyBlock label="Student Support Services" value={syl.supportServices} path={['syllabus', 'supportServices']} onEdit={onEdit} />
      </div>

      {/* ── Important Dates ────────────────────────────────────── */}
      {syl.importantDates?.length > 0 && (
        <div>
          <h3 className="text-sm font-bold text-slate-700 mb-1.5">Important Dates</h3>
          <div className="rounded-lg border border-slate-200/60 overflow-hidden">
            <table className="w-full text-xs">
              <tbody>
                {syl.importantDates.map((d, i) => (
                  <tr key={i} className={i > 0 ? 'border-t border-slate-100' : ''}>
                    <td className="px-3 py-1.5 font-medium text-slate-500 whitespace-nowrap w-32"><E value={d.date} path={['syllabus', 'importantDates', i, 'date']} onEdit={onEdit} /></td>
                    <td className="px-3 py-1.5 text-slate-700"><E value={d.event} path={['syllabus', 'importantDates', i, 'event']} onEdit={onEdit} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
