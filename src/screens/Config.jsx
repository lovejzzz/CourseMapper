import React, { useState, useRef } from 'react';
import FocusTrap from 'focus-trap-react';
import { FEATURES, COLOR_MAP } from './FeatureSelect';
import ColumnEditor from '../components/ColumnEditor';
import { getCustomDeliverable, listCustomDeliverables, toFeatureEntry } from '../lib/customDeliverableLibrary';
import { PREVIEW_EXAMPLES } from '../lib/previewExamples';
import { useUI } from '../contexts/UIContext';
import { useCourse } from '../contexts/CourseContext';

// ── Shared option lists for universal advanced settings ───────────────────────
const TONE_OPTIONS = ['Auto', 'Academic', 'Professional', 'Conversational', 'Friendly', 'Formal', 'Encouraging'];
const STYLE_OPTIONS = ['Auto', 'Bullet points', 'Paragraphs', 'Tables', 'Numbered lists', 'Mixed'];
const LENGTH_OPTIONS = ['Auto', 'Brief', 'Standard', 'Detailed', 'Comprehensive'];

// ── Lesson scope selector ─────────────────────────────────────────────────────

function LessonScopeSelector({ lessonCount, isDetectingLessons, courseMap, lessonScope, setLessonScope }) {
  // Prefer actual generated lesson titles; fall back to estimated count
  const generatedLessons = courseMap?.lessons || [];
  const total = generatedLessons.length > 0 ? generatedLessons.length : (lessonCount || 0);

  // Build display rows: use real titles if available, otherwise placeholder labels
  const rows = Array.from({ length: total }, (_, i) => ({
    index: i,
    label: generatedLessons[i]?.title || `Lesson ${i + 1}`,
  }));

  return (
    <div className="glass rounded-squircle-sm p-6 space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-xl bg-indigo-100 flex items-center justify-center flex-shrink-0">
          <svg className="w-4 h-4 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
        <div>
          <h2 className="text-sm font-semibold text-slate-800">Lesson Scope</h2>
          <p className="text-[11px] text-slate-400">All deliverables will only be generated for the selected lessons.</p>
        </div>
      </div>

      {/* All vs Specific toggle */}
      <div className="flex gap-2">
        <button
          onClick={() => setLessonScope({ type: 'all' })}
          className={`tactile flex-1 py-2.5 rounded-lg text-xs font-semibold transition-all duration-200 ${lessonScope.type === 'all'
              ? 'bg-indigo-500 text-white shadow-md shadow-indigo-500/20'
              : 'bg-white/60 text-slate-500 border border-slate-200/60 hover:bg-white/80'
            }`}
        >
          All {total > 0 ? `(${total} lessons)` : 'lessons'}
        </button>
        <button
          onClick={() => setLessonScope({ type: 'specific', indices: lessonScope.indices || [] })}
          className={`tactile flex-1 py-2.5 rounded-lg text-xs font-semibold transition-all duration-200 ${lessonScope.type === 'specific'
              ? 'bg-indigo-500 text-white shadow-md shadow-indigo-500/20'
              : 'bg-white/60 text-slate-500 border border-slate-200/60 hover:bg-white/80'
            }`}
        >
          Specific lessons
        </button>
      </div>

      {/* Lesson picker */}
      {lessonScope.type === 'specific' && (
        <div className="space-y-2 animate-spring-in">
          {total === 0 ? (
            isDetectingLessons ? (
              <p className="text-[11px] text-indigo-500 italic flex items-center gap-1.5">
                <svg className="w-3 h-3 animate-spin flex-shrink-0" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Detecting lesson count from your syllabus…
              </p>
            ) : (
              <p className="text-[11px] text-amber-500 italic">
                No lesson count detected — enter a course description or upload a syllabus on the previous page.
              </p>
            )
          ) : (
            <>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                  {(lessonScope.indices?.length || 0)} of {total} selected
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setLessonScope({ type: 'specific', indices: rows.map(r => r.index) })}
                    className="text-[10px] font-semibold text-indigo-500 hover:text-indigo-700 transition-colors"
                  >
                    Select all
                  </button>
                  <span className="text-slate-300 text-[10px]">·</span>
                  <button
                    onClick={() => setLessonScope({ type: 'specific', indices: [] })}
                    className="text-[10px] font-semibold text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    Clear
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-64 overflow-y-auto pr-1">
                {rows.map(({ index, label }) => {
                  const isSelected = (lessonScope.indices || []).includes(index);
                  return (
                    <button
                      key={index}
                      onClick={() => {
                        const current = lessonScope.indices || [];
                        const next = isSelected
                          ? current.filter(x => x !== index)
                          : [...current, index].sort((a, b) => a - b);
                        setLessonScope({ type: 'specific', indices: next });
                      }}
                      className={`tactile text-left px-3 py-2 rounded-lg text-[11px] transition-all duration-150 ${isSelected
                          ? 'bg-indigo-500 text-white shadow-sm'
                          : 'bg-white/60 text-slate-600 border border-slate-200/60 hover:bg-white/90'
                        }`}
                    >
                      <span className={`font-semibold ${isSelected ? 'text-indigo-100' : 'text-indigo-500'}`}>
                        #{index + 1}
                      </span>
                      <span className="block truncate mt-0.5">{label}</span>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── DeliverableExtras — reference file + extra instructions ───────────────────

function DeliverableExtras({ featureId, config, onChange }) {
  const inputRef = useRef(null);
  const file = config.referenceFile || null;
  const [showPromptEditor, setShowPromptEditor] = useState(false);

  function handleFile(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    e.target.value = '';
    onChange({ ...config, referenceFile: f });
  }

  function removeFile() {
    onChange({ ...config, referenceFile: null });
  }

  function handleDrop(e) {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (!f) return;
    onChange({ ...config, referenceFile: f });
  }

  return (
    <div className="space-y-4">
      {/* ── Universal Controls: Tone ── */}
      <div className="space-y-1">
        <label className="text-xs font-medium text-slate-700">Tone</label>
        <p className="text-[10px] text-slate-400">Sets the voice and register of the output.</p>
        <div className="flex flex-wrap gap-1.5 mt-1">
          {TONE_OPTIONS.map(opt => {
            const isAuto = opt === 'Auto';
            const isActive = isAuto ? !config.tone || config.tone === 'Auto' : config.tone === opt;
            return (
              <button
                key={opt}
                onClick={() => onChange({ ...config, tone: isAuto ? null : (config.tone === opt ? null : opt) })}
                className={`tactile px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all duration-150 ${isActive
                    ? 'bg-indigo-500 text-white shadow-sm'
                    : 'bg-white/60 text-slate-600 border border-slate-200/60 hover:bg-white/90'
                  }`}
              >
                {opt}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Universal Controls: Style & Format ── */}
      <div className="space-y-1">
        <label className="text-xs font-medium text-slate-700">Style & Format</label>
        <p className="text-[10px] text-slate-400">How the content is structured and presented.</p>
        <div className="flex flex-wrap gap-1.5 mt-1">
          {STYLE_OPTIONS.map(opt => {
            const isAuto = opt === 'Auto';
            const isActive = isAuto ? !config.style || config.style === 'Auto' : config.style === opt;
            return (
              <button
                key={opt}
                onClick={() => onChange({ ...config, style: isAuto ? null : (config.style === opt ? null : opt) })}
                className={`tactile px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all duration-150 ${isActive
                    ? 'bg-indigo-500 text-white shadow-sm'
                    : 'bg-white/60 text-slate-600 border border-slate-200/60 hover:bg-white/90'
                  }`}
              >
                {opt}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Universal Controls: Output Length ── */}
      <div className="space-y-1">
        <label className="text-xs font-medium text-slate-700">Output Length</label>
        <p className="text-[10px] text-slate-400">Controls how much detail the AI generates.</p>
        <div className="flex flex-wrap gap-1.5 mt-1">
          {LENGTH_OPTIONS.map(opt => {
            const isAuto = opt === 'Auto';
            const isActive = isAuto ? !config.outputLength || config.outputLength === 'Auto' : config.outputLength === opt;
            return (
              <button
                key={opt}
                onClick={() => onChange({ ...config, outputLength: isAuto ? null : (config.outputLength === opt ? null : opt) })}
                className={`tactile px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all duration-150 ${isActive
                    ? 'bg-indigo-500 text-white shadow-sm'
                    : 'bg-white/60 text-slate-600 border border-slate-200/60 hover:bg-white/90'
                  }`}
              >
                {opt}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Custom Prompt Override ── */}
      <div>
        <button
          onClick={() => setShowPromptEditor(v => !v)}
          className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 hover:text-indigo-500 transition-colors"
        >
          <svg className={`w-3 h-3 transition-transform duration-200 ${showPromptEditor ? 'rotate-90' : ''}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          {showPromptEditor ? 'Hide prompt editor' : 'Edit AI prompt'}
        </button>
        {showPromptEditor && (
          <div className="mt-2 space-y-2 animate-spring-in">
            <p className="text-[10px] text-slate-400">
              Override the system prompt sent to the AI. Leave blank to use the default.
            </p>
            <textarea
              value={config.customSystemPrompt || ''}
              onChange={(e) => onChange({ ...config, customSystemPrompt: e.target.value })}
              placeholder="You are an expert instructional designer…"
              rows={3}
              className="w-full bg-white/60 border border-slate-200/60 rounded-lg px-3 py-2 text-[11px] text-slate-700 placeholder:text-slate-300 resize-none focus:outline-none focus:ring-1 focus:ring-indigo-300 focus:border-indigo-300 transition-all font-mono"
            />
            <p className="text-[10px] text-slate-400">
              Override the user prompt. Use <code className="text-[9px] bg-slate-100 px-1 py-0.5 rounded">{'{{courseMap}}'}</code> as a placeholder for course data.
            </p>
            <textarea
              value={config.customUserPrompt || ''}
              onChange={(e) => onChange({ ...config, customUserPrompt: e.target.value })}
              placeholder="Generate detailed lesson plans for this course: {{courseMap}}"
              rows={4}
              className="w-full bg-white/60 border border-slate-200/60 rounded-lg px-3 py-2 text-[11px] text-slate-700 placeholder:text-slate-300 resize-none focus:outline-none focus:ring-1 focus:ring-indigo-300 focus:border-indigo-300 transition-all font-mono"
            />
          </div>
        )}
      </div>

      {/* ── Reference file ── */}
      <div>
        <p className="text-xs font-medium text-slate-600 mb-1.5">
          Example file
          <span className="ml-1.5 text-[10px] font-normal text-slate-400">optional — show the AI what format you want</span>
        </p>
        {file ? (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/60 border border-slate-200/60">
            <svg className="w-4 h-4 text-indigo-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span className="text-[11px] text-slate-700 font-medium truncate flex-1">{file.name}</span>
            <button
              onClick={removeFile}
              className="text-slate-300 hover:text-red-400 transition-colors flex-shrink-0"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ) : (
          <button
            onClick={() => inputRef.current?.click()}
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            className="tactile flex items-center gap-2 px-3 py-2 rounded-lg text-[11px] font-medium text-slate-400 border border-dashed border-slate-200/60 hover:border-indigo-300 hover:text-indigo-500 hover:bg-indigo-50/30 transition-all duration-200 w-full"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
            </svg>
            Attach example file or drop here…
          </button>
        )}
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.doc,.docx,.txt,.md,.xlsx,.csv"
          onChange={handleFile}
          className="hidden"
        />
      </div>

      {/* ── Extra instructions textarea ── */}
      <div>
        <p className="text-xs font-medium text-slate-600 mb-1.5">
          Additional instructions
          <span className="ml-1.5 text-[10px] font-normal text-slate-400">optional — specific requirements for this deliverable</span>
        </p>
        <textarea
          value={config.extraInstructions || ''}
          onChange={(e) => onChange({ ...config, extraInstructions: e.target.value })}
          placeholder={`e.g. "Use 4-point scales", "Match our department rubric format", "Focus on social work competencies"…`}
          rows={3}
          className="w-full bg-white/60 border border-slate-200/60 rounded-lg px-3 py-2 text-[11px] text-slate-700 placeholder:text-slate-300 resize-none focus:outline-none focus:ring-1 focus:ring-indigo-300 focus:border-indigo-300 transition-all"
        />
      </div>
    </div>
  );
}

// ── Small form primitives ─────────────────────────────────────────────────────

function Toggle({ label, value, onChange, description }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="text-xs font-medium text-slate-700">{label}</p>
        {description && <p className="text-[10px] text-slate-400 mt-0.5">{description}</p>}
      </div>
      <button
        onClick={() => onChange(!value)}
        className={`tactile flex-shrink-0 relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200 ${value ? 'bg-indigo-500' : 'bg-slate-200'
          }`}
      >
        <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform duration-200 ${value ? 'translate-x-[18px]' : 'translate-x-[3px]'
          }`} />
      </button>
    </div>
  );
}

function Select({ label, value, onChange, options, description }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-slate-700">{label}</label>
      {description && <p className="text-[10px] text-slate-400">{description}</p>}
      <div className="flex flex-wrap gap-1.5 mt-1">
        {options.map(opt => (
          <button
            key={opt}
            onClick={() => onChange(opt)}
            className={`tactile px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all duration-150 ${value === opt
                ? 'bg-indigo-500 text-white shadow-sm'
                : 'bg-white/60 text-slate-600 border border-slate-200/60 hover:bg-white/90'
              }`}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}

function NumberInput({ label, value, onChange, min, max, description }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="text-xs font-medium text-slate-700">{label}</p>
        {description && <p className="text-[10px] text-slate-400 mt-0.5">{description}</p>}
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <button
          onClick={() => onChange(Math.max(min, (value || min) - 1))}
          className="tactile w-6 h-6 rounded-md bg-white/60 border border-slate-200/60 text-slate-500 hover:bg-white flex items-center justify-center text-sm font-bold transition-all"
        >−</button>
        <span className="w-8 text-center text-xs font-semibold text-slate-700">{value || min}</span>
        <button
          onClick={() => onChange(Math.min(max, (value || min) + 1))}
          className="tactile w-6 h-6 rounded-md bg-white/60 border border-slate-200/60 text-slate-500 hover:bg-white flex items-center justify-center text-sm font-bold transition-all"
        >+</button>
      </div>
    </div>
  );
}

function MultiToggle({ label, options, selected, onChange, description }) {
  const toggle = (opt) => {
    const next = selected.includes(opt) ? selected.filter(x => x !== opt) : [...selected, opt];
    onChange(next);
  };
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-slate-700">{label}</p>
      {description && <p className="text-[10px] text-slate-400">{description}</p>}
      <div className="flex flex-wrap gap-1.5 mt-1">
        {options.map(opt => (
          <button
            key={opt}
            onClick={() => toggle(opt)}
            className={`tactile px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all duration-150 ${selected.includes(opt)
                ? 'bg-indigo-500 text-white shadow-sm'
                : 'bg-white/60 text-slate-600 border border-slate-200/60 hover:bg-white/90'
              }`}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Advanced section toggle ───────────────────────────────────────────────────

function AdvancedSection({ children }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="pt-2">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400 hover:text-indigo-500 transition-colors mb-2"
      >
        <svg
          className={`w-3 h-3 transition-transform duration-200 ${open ? 'rotate-90' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        {open ? 'Hide advanced options' : 'Advanced options'}
      </button>
      {open && (
        <div className="space-y-4 animate-spring-in pt-1 border-t border-slate-100/60">
          {children}
        </div>
      )}
    </div>
  );
}

// ── Deliverable preview snippets ──────────────────────────────────────────────

const FEATURE_LABELS = {
  courseMap: 'Course Map',
  lessonPlans: 'Lesson Plans',
  slideDecks: 'Slide Decks',
  rubrics: 'Rubrics',
  quizBank: 'Quiz & Exam Bank',
  discussions: 'Discussion Prompts',
  assignments: 'Assignment Briefs',
  studyGuides: 'Study Guides',
  syllabus: 'Syllabus',
};


function DeliverablePreview({ featureId, delivData, courseMap, columns }) {
  const [fullscreen, setFullscreen] = useState(false);
  const label = FEATURE_LABELS[featureId] || featureId;

  // Extract real content from deliverable data, fall back to example
  const { content: realContent, isExample } = React.useMemo(() => {
    // Try real data first
    if (featureId === 'courseMap' && courseMap?.lessons?.length > 0) {
      const lessons = courseMap.lessons.slice(0, 3);
      const cols = (columns || []).filter(c => c.enabled !== false).slice(0, 3);
      return { content: { type: 'courseMap', lessons, cols, total: courseMap.lessons.length }, isExample: false };
    }
    if (delivData) {
      let parsed = null;
      switch (featureId) {
        case 'lessonPlans': {
          const plans = delivData.plans || delivData.lessonPlans || [];
          if (plans.length > 0) parsed = { type: 'lessonPlans', items: plans.slice(0, 3), total: plans.length };
          break;
        }
        case 'slideDecks': {
          const decks = delivData.decks || delivData.slideDecks || [];
          if (decks.length > 0) parsed = { type: 'slideDecks', items: decks.slice(0, 3), total: decks.length };
          break;
        }
        case 'rubrics': {
          const rubrics = delivData.rubrics || [];
          if (rubrics.length > 0) parsed = { type: 'rubrics', items: rubrics.slice(0, 3), total: rubrics.length };
          break;
        }
        case 'quizBank': {
          const quizzes = delivData.quizzes || delivData.quizBank || [];
          if (quizzes.length > 0) parsed = { type: 'quizBank', items: quizzes.slice(0, 2), total: quizzes.length };
          break;
        }
        case 'discussions': {
          const discs = delivData.discussions || [];
          if (discs.length > 0) parsed = { type: 'discussions', items: discs.slice(0, 2), total: discs.length };
          break;
        }
        case 'assignments': {
          const asgn = delivData.assignments || [];
          if (asgn.length > 0) parsed = { type: 'assignments', items: asgn.slice(0, 2), total: asgn.length };
          break;
        }
        case 'studyGuides': {
          const guides = delivData.studyGuides || delivData.guides || [];
          if (guides.length > 0) parsed = { type: 'studyGuides', items: guides.slice(0, 2), total: guides.length };
          break;
        }
        case 'syllabus': {
          const sections = delivData.sections || [];
          if (sections.length > 0) parsed = { type: 'syllabus', sections: sections.slice(0, 5), total: sections.length };
          break;
        }
      }
      if (parsed) return { content: parsed, isExample: false };
    }

    // Fall back to example content
    const example = PREVIEW_EXAMPLES[featureId];
    return example ? { content: example, isExample: true } : { content: null, isExample: true };
  }, [featureId, delivData, courseMap, columns]);

  if (!realContent) return null;

  const truncate = (str, len = 60) => {
    if (!str) return '';
    const s = Array.isArray(str) ? str.join(', ') : String(str);
    return s.length > len ? s.slice(0, len) + '…' : s;
  };

  const renderContent = (expanded) => {
    const sz = expanded ? 'text-xs' : 'text-[10px]';
    const pad = expanded ? 'px-4 py-2' : 'px-2 py-1';
    const maxItems = expanded ? realContent.total : (realContent.items?.length || realContent.sections?.length || 3);

    switch (realContent.type) {
      case 'courseMap': {
        const { lessons, cols } = realContent;
        const showLessons = expanded ? (courseMap?.lessons || lessons) : lessons;
        return (
          <div className="overflow-x-auto">
            <div className="overflow-hidden rounded border border-slate-200/40 min-w-0">
              <div className="flex bg-slate-50/80">
                <div className={`${pad} font-semibold text-slate-600 border-r border-slate-200/30 flex-shrink-0 w-28`}>Week/Module</div>
                {cols.map(c => (
                  <div key={c.key} className={`flex-1 ${pad} font-semibold text-slate-600 border-r border-slate-200/30 last:border-r-0 min-w-0`}>{c.label}</div>
                ))}
              </div>
              {showLessons.map((lesson, i) => (
                <div key={i} className="flex border-t border-slate-200/30">
                  <div className={`${pad} text-slate-700 font-medium border-r border-slate-200/30 flex-shrink-0 w-28 truncate`}>{lesson.title || `Lesson ${i + 1}`}</div>
                  {cols.map(c => {
                    const sections = lesson.sections || [];
                    const val = sections.map(s => s[c.key]).filter(Boolean).join('; ');
                    return <div key={c.key} className={`flex-1 ${pad} border-r border-slate-200/30 last:border-r-0 min-w-0 truncate`}>{truncate(val, expanded ? 120 : 50)}</div>;
                  })}
                </div>
              ))}
            </div>
            {!expanded && realContent.total > 3 && <p className="text-[9px] text-slate-400 mt-1 text-right">+ {realContent.total - 3} more lessons</p>}
          </div>
        );
      }
      case 'lessonPlans': {
        const items = expanded ? (delivData.plans || delivData.lessonPlans || []) : realContent.items;
        return (
          <div className="space-y-2">
            {items.map((plan, i) => {
              const outline = plan.sessionOutline || plan.outline || [];
              return (
                <div key={i} className="rounded border border-slate-200/30 overflow-hidden">
                  <div className={`${pad} bg-slate-50/60 font-semibold text-slate-700`}>{plan.lessonTitle || plan.title || `Lesson ${i + 1}`}</div>
                  {outline.slice(0, expanded ? 8 : 3).map((seg, j) => (
                    <div key={j} className={`${pad} border-t border-slate-200/20 flex items-start gap-2`}>
                      <span className="font-mono text-indigo-400 flex-shrink-0 w-12 text-right">{seg.duration || seg.time || ''}</span>
                      <div className="w-1 h-1 rounded-full bg-indigo-300 mt-1.5 flex-shrink-0" />
                      <span><strong className="text-slate-600">{seg.activity || seg.section || ''}:</strong> {truncate(seg.description || seg.details || '', expanded ? 200 : 60)}</span>
                    </div>
                  ))}
                  {!expanded && outline.length > 3 && <div className={`${pad} border-t border-slate-200/20 text-slate-400 italic`}>+ {outline.length - 3} more segments</div>}
                </div>
              );
            })}
            {!expanded && realContent.total > items.length && <p className="text-[9px] text-slate-400 text-right">+ {realContent.total - items.length} more plans</p>}
          </div>
        );
      }
      case 'slideDecks': {
        const items = expanded ? (delivData.decks || delivData.slideDecks || []) : realContent.items;
        return (
          <div className="space-y-2">
            {items.map((deck, i) => {
              const slides = deck.slides || [];
              return (
                <div key={i}>
                  <p className="font-semibold text-slate-700 mb-1">{deck.lessonTitle || deck.title || `Deck ${i + 1}`} ({slides.length} slides)</p>
                  <div className="flex gap-1.5 overflow-x-auto pb-1">
                    {slides.slice(0, expanded ? 12 : 5).map((s, j) => (
                      <div key={j} className={`flex-shrink-0 ${expanded ? 'w-28 h-18' : 'w-20 h-14'} rounded border border-slate-200/50 bg-white/60 flex items-center justify-center p-1 text-center leading-tight`}>
                        <span className="text-[9px] text-slate-500 line-clamp-2">{s.title || s.heading || `Slide ${j + 1}`}</span>
                      </div>
                    ))}
                    {slides.length > (expanded ? 12 : 5) && <div className={`flex-shrink-0 ${expanded ? 'w-28 h-18' : 'w-20 h-14'} rounded border border-dashed border-slate-200/50 flex items-center justify-center text-[9px] text-slate-400`}>+{slides.length - (expanded ? 12 : 5)}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        );
      }
      case 'rubrics': {
        const items = expanded ? (delivData.rubrics || []) : realContent.items;
        return (
          <div className="space-y-2">
            {items.map((rubric, i) => {
              const criteria = rubric.criteria || [];
              const levels = criteria[0]?.levels || [];
              return (
                <div key={i}>
                  <p className="font-semibold text-slate-700 mb-1">{rubric.assignmentTitle || rubric.title || `Rubric ${i + 1}`}</p>
                  <div className="overflow-hidden rounded border border-slate-200/40">
                    <div className="flex bg-slate-50/80">
                      <div className={`${pad} font-semibold text-slate-600 border-r border-slate-200/30 w-24 flex-shrink-0`}>Criteria</div>
                      {levels.map((l, k) => (
                        <div key={k} className={`flex-1 ${pad} font-semibold text-slate-600 border-r border-slate-200/30 last:border-r-0 text-center`}>{l.label || l.level || `Level ${k + 1}`}</div>
                      ))}
                    </div>
                    {criteria.slice(0, expanded ? 8 : 3).map((c, k) => (
                      <div key={k} className="flex border-t border-slate-200/30">
                        <div className={`${pad} font-medium text-slate-600 border-r border-slate-200/30 w-24 flex-shrink-0 truncate`}>{c.name || c.criterion || ''}</div>
                        {(c.levels || []).map((l, m) => (
                          <div key={m} className={`flex-1 ${pad} border-r border-slate-200/30 last:border-r-0 text-center truncate`}>{truncate(l.description || '', expanded ? 80 : 30)}</div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        );
      }
      case 'quizBank': {
        const items = expanded ? (delivData.quizzes || delivData.quizBank || []) : realContent.items;
        return (
          <div className="space-y-2">
            {items.map((quiz, i) => {
              const questions = quiz.questions || [];
              return (
                <div key={i}>
                  <p className="font-semibold text-slate-700 mb-1">{quiz.lessonTitle || quiz.title || `Quiz ${i + 1}`} ({questions.length} questions)</p>
                  <div className="space-y-1">
                    {questions.slice(0, expanded ? 10 : 3).map((q, j) => (
                      <div key={j} className="flex items-start gap-1.5">
                        <span className="px-1.5 py-0.5 rounded bg-indigo-50/80 text-indigo-500 font-semibold text-[9px] flex-shrink-0">{q.type || 'Q'}</span>
                        <span className="text-slate-600">{truncate(q.question || q.prompt || '', expanded ? 200 : 80)}</span>
                      </div>
                    ))}
                    {questions.length > (expanded ? 10 : 3) && <p className="text-slate-400 italic">+ {questions.length - (expanded ? 10 : 3)} more questions</p>}
                  </div>
                </div>
              );
            })}
          </div>
        );
      }
      case 'discussions': {
        const items = expanded ? (delivData.discussions || []) : realContent.items;
        return (
          <div className="space-y-2">
            {items.map((disc, i) => (
              <div key={i} className="rounded border border-slate-200/30 overflow-hidden">
                <div className={`${pad} bg-slate-50/60 font-semibold text-slate-700`}>{disc.lessonTitle || disc.title || `Discussion ${i + 1}`}</div>
                <div className={`${pad} border-t border-slate-200/20`}>
                  <p className="text-slate-600 italic">"{truncate(disc.prompt || disc.mainPrompt || '', expanded ? 300 : 100)}"</p>
                  {disc.followUp && <p className="text-slate-400 mt-1">{truncate(disc.followUp || disc.responseGuidelines || '', expanded ? 200 : 80)}</p>}
                </div>
              </div>
            ))}
            {!expanded && realContent.total > items.length && <p className="text-[9px] text-slate-400 text-right">+ {realContent.total - items.length} more</p>}
          </div>
        );
      }
      case 'assignments': {
        const items = expanded ? (delivData.assignments || []) : realContent.items;
        return (
          <div className="space-y-2">
            {items.map((asgn, i) => (
              <div key={i} className="rounded border border-slate-200/30 overflow-hidden">
                <div className={`${pad} bg-slate-50/60 font-semibold text-slate-700`}>{asgn.title || `Assignment ${i + 1}`}</div>
                <div className={`${pad} border-t border-slate-200/20 space-y-1`}>
                  {asgn.description && <p className="text-slate-600">{truncate(asgn.description, expanded ? 300 : 100)}</p>}
                  {asgn.components && (
                    <ul className="list-disc list-inside space-y-0.5 ml-1">
                      {(Array.isArray(asgn.components) ? asgn.components : []).slice(0, expanded ? 10 : 3).map((c, j) => <li key={j}>{truncate(typeof c === 'string' ? c : c.name || c.title || '', expanded ? 150 : 60)}</li>)}
                    </ul>
                  )}
                </div>
              </div>
            ))}
          </div>
        );
      }
      case 'studyGuides': {
        const items = expanded ? (delivData.studyGuides || delivData.guides || []) : realContent.items;
        return (
          <div className="space-y-2">
            {items.map((guide, i) => {
              const terms = guide.keyTerms || guide.terms || guide.vocabulary || [];
              return (
                <div key={i}>
                  <p className="font-semibold text-slate-700 mb-1">{guide.lessonTitle || guide.title || `Guide ${i + 1}`}</p>
                  <div className="space-y-1">
                    {terms.slice(0, expanded ? 10 : 3).map((t, j) => (
                      <div key={j}>
                        <span className="font-semibold text-slate-600">{t.term || t.name || ''}:</span>{' '}
                        <span>{truncate(t.definition || t.def || '', expanded ? 200 : 60)}</span>
                      </div>
                    ))}
                    {terms.length > (expanded ? 10 : 3) && <p className="text-slate-400 italic">+ {terms.length - (expanded ? 10 : 3)} more terms</p>}
                  </div>
                </div>
              );
            })}
          </div>
        );
      }
      case 'syllabus': {
        const sections = expanded ? (delivData.sections || []) : realContent.sections;
        return (
          <div className="space-y-1.5">
            {sections.map((s, i) => (
              <div key={i} className="rounded border border-slate-200/30 overflow-hidden">
                <div className={`${pad} bg-slate-50/60 font-semibold text-slate-700 flex items-center gap-2`}>
                  <span className="w-5 h-5 rounded bg-cyan-50/80 text-cyan-500 flex items-center justify-center text-[9px] font-bold flex-shrink-0">{i + 1}</span>
                  {s.heading || s.title || `Section ${i + 1}`}
                </div>
                {s.content && <div className={`${pad} border-t border-slate-200/20 text-slate-600`}>{truncate(Array.isArray(s.content) ? s.content.join(' ') : s.content, expanded ? 300 : 100)}</div>}
              </div>
            ))}
            {!expanded && realContent.total > sections.length && <p className="text-[9px] text-slate-400 text-right">+ {realContent.total - sections.length} more sections</p>}
          </div>
        );
      }
      default: return null;
    }
  };

  return (
    <>
      <div className="mb-4 rounded-lg border border-slate-200/40 overflow-hidden">
        <div className="px-3 py-1.5 bg-slate-50/60 border-b border-slate-200/40 flex items-center justify-between">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            {label} — {realContent.total || realContent.items?.length || 0} {featureId === 'courseMap' ? 'lessons' : 'items'}
            {isExample && <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-500 text-[9px] font-semibold normal-case tracking-normal">Example</span>}
          </p>
          <button
            onClick={() => setFullscreen(true)}
            className="text-slate-300 hover:text-indigo-500 transition-colors"
            title="Full screen"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5v-4m0 4h-4m4 0l-5-5" />
            </svg>
          </button>
        </div>
        <div className="p-3 text-[10px] text-slate-500 leading-relaxed max-h-48 overflow-y-auto">
          {renderContent(false)}
        </div>
      </div>

      {/* Fullscreen modal */}
      {fullscreen && (
        <FocusTrap focusTrapOptions={{ clickOutsideDeactivates: true }}>
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-md" onClick={() => setFullscreen(false)}>
            <div className="bg-white/95 backdrop-blur-lg rounded-2xl shadow-2xl border border-slate-200/60 max-w-3xl w-full mx-4 animate-spring-scale max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
              <div className="sticky top-0 z-10 bg-white/95 backdrop-blur-lg px-6 py-4 border-b border-slate-200/40 flex items-center justify-between rounded-t-2xl flex-shrink-0">
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  {label} — {realContent.total || realContent.items?.length || 0} items
                  {isExample && <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-500 text-[10px] font-semibold">Example Preview</span>}
                </h3>
                <button onClick={() => setFullscreen(false)} aria-label="Close fullscreen preview" className="text-slate-400 hover:text-slate-600 transition-colors">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="p-6 text-xs text-slate-500 leading-relaxed overflow-y-auto">
                {renderContent(true)}
              </div>
            </div>
          </div>
        </FocusTrap>
      )}
    </>
  );
}

// ── Per-deliverable config content ────────────────────────────────────────────

function DeliverableConfigContent({ featureId, config, onChange, columns, setColumns, delivData, courseMap }) {
  const set = (key, val) => onChange({ ...config, [key]: val });

  switch (featureId) {
    case 'courseMap':
      return (
        <div className="space-y-3">
          <DeliverablePreview featureId="courseMap" delivData={courseMap} courseMap={courseMap} columns={columns} />
          <p className="text-[11px] text-slate-500">Click to enable/disable, drag to reorder, double-click to rename.</p>
          <ColumnEditor columns={columns} setColumns={setColumns} />
          <AdvancedSection>
            <DeliverableExtras featureId={featureId} config={config} onChange={onChange} />
          </AdvancedSection>
        </div>
      );

    case 'lessonPlans':
      return (
        <div className="space-y-4">
          <DeliverablePreview featureId="lessonPlans" delivData={delivData} />
          {/* Basic settings — always visible */}
          <Select
            label="Session length"
            value={config.sessionLength || '75 min'}
            onChange={v => set('sessionLength', v)}
            options={['50 min', '75 min', '90 min', '2 hr', '3 hr']}
            description="Adjusts all time estimates in the lesson outline."
          />
          <Select
            label="Detail level"
            value={config.detailLevel || 'Standard'}
            onChange={v => set('detailLevel', v)}
            options={['Brief', 'Standard', 'Detailed']}
          />
          {/* Advanced settings */}
          <AdvancedSection>
            <Toggle label="Include warm-up activity" value={config.includeWarmUp !== false} onChange={v => set('includeWarmUp', v)} />
            <Toggle label="Include UDL notes" value={config.includeUDL !== false} onChange={v => set('includeUDL', v)} description="Universal Design for Learning accessibility notes." />
            <Toggle label="Include homework section" value={config.includeHomework !== false} onChange={v => set('includeHomework', v)} />
            <DeliverableExtras featureId={featureId} config={config} onChange={onChange} />
          </AdvancedSection>
        </div>
      );

    case 'slideDecks':
      return (
        <div className="space-y-4">
          <DeliverablePreview featureId="slideDecks" delivData={delivData} />
          {/* Basic */}
          <NumberInput
            label="Slides per lesson"
            value={config.slidesPerLesson || 12}
            onChange={v => set('slidesPerLesson', v)}
            min={8} max={20}
            description="Includes title, agenda, objectives, content, and closing slides."
          />
          <Select
            label="Speaker notes"
            value={config.speakerNotes || 'Standard'}
            onChange={v => set('speakerNotes', v)}
            options={['Minimal', 'Standard', 'Full script']}
          />
          {/* Advanced */}
          <AdvancedSection>
            <Toggle label="Include activity slides" value={config.includeActivities !== false} onChange={v => set('includeActivities', v)} description="Think-Pair-Share, polls, discussions, etc." />
            <DeliverableExtras featureId={featureId} config={config} onChange={onChange} />
          </AdvancedSection>
        </div>
      );

    case 'rubrics':
      return (
        <div className="space-y-4">
          <DeliverablePreview featureId="rubrics" delivData={delivData} />
          {/* Basic */}
          <NumberInput
            label="Criteria per rubric"
            value={config.criteriaCount || 4}
            onChange={v => set('criteriaCount', v)}
            min={3} max={8}
            description="All criteria weights will sum to 100%."
          />
          <Select
            label="Performance levels"
            value={config.performanceLevels || '4 levels'}
            onChange={v => set('performanceLevels', v)}
            options={['3 levels', '4 levels']}
            description="3 levels: Developing / Proficient / Mastery."
          />
          {/* Advanced */}
          <AdvancedSection>
            <Toggle label="Include teacher notes" value={config.includeTeacherNotes !== false} onChange={v => set('includeTeacherNotes', v)} description="Calibration tips and student feedback guidance." />
            <DeliverableExtras featureId={featureId} config={config} onChange={onChange} />
          </AdvancedSection>
        </div>
      );

    case 'quizBank':
      return (
        <div className="space-y-4">
          <DeliverablePreview featureId="quizBank" delivData={delivData} />
          {/* Basic */}
          <NumberInput
            label="Questions per lesson"
            value={config.questionsPerLesson || 8}
            onChange={v => set('questionsPerLesson', v)}
            min={3} max={20}
          />
          <MultiToggle
            label="Question types"
            options={['Multiple choice', 'Short answer', 'Essay']}
            selected={[
              ...(config.includeMultipleChoice !== false ? ['Multiple choice'] : []),
              ...(config.includeShortAnswer !== false ? ['Short answer'] : []),
              ...(config.includeEssay !== false ? ['Essay'] : []),
            ]}
            onChange={vals => {
              onChange({
                ...config,
                includeMultipleChoice: vals.includes('Multiple choice'),
                includeShortAnswer: vals.includes('Short answer'),
                includeEssay: vals.includes('Essay'),
              });
            }}
          />
          {/* Advanced */}
          <AdvancedSection>
            <Select
              label="Difficulty distribution"
              value={config.difficultyDist || 'Mixed'}
              onChange={v => set('difficultyDist', v)}
              options={['Mostly Easy/Medium', 'Mixed', 'Mostly Medium/Hard']}
            />
            <DeliverableExtras featureId={featureId} config={config} onChange={onChange} />
          </AdvancedSection>
        </div>
      );

    case 'discussions':
      return (
        <div className="space-y-4">
          <DeliverablePreview featureId="discussions" delivData={delivData} />
          {/* Basic */}
          <Select
            label="Discussion format"
            value={config.formatPreference || 'Any'}
            onChange={v => set('formatPreference', v)}
            options={['Any', 'Socratic Seminar', 'Fishbowl', 'Debate', 'Case Study', 'Think-Pair-Share']}
          />
          {/* Advanced */}
          <AdvancedSection>
            <Toggle label="Include facilitation tips" value={config.includeFacilitation !== false} onChange={v => set('includeFacilitation', v)} />
            <Toggle label="Include equity considerations" value={config.includeEquity !== false} onChange={v => set('includeEquity', v)} />
            <DeliverableExtras featureId={featureId} config={config} onChange={onChange} />
          </AdvancedSection>
        </div>
      );

    case 'assignments':
      return (
        <div className="space-y-4">
          <DeliverablePreview featureId="assignments" delivData={delivData} />
          {/* Basic */}
          <MultiToggle
            label="Assignment types"
            options={['Essay', 'Research Paper', 'Case Study', 'Reflection', 'Group Project', 'Presentation']}
            selected={config.assignmentTypes || ['Essay', 'Research Paper', 'Case Study', 'Reflection', 'Group Project', 'Presentation']}
            onChange={v => set('assignmentTypes', v)}
            description="Only the selected types will be generated."
          />
          {/* Advanced */}
          <AdvancedSection>
            <Toggle label="Include scaffolding milestones" value={config.includeScaffolding !== false} onChange={v => set('includeScaffolding', v)} description="Draft checkpoints and submission stages." />
            <Toggle label="Include academic integrity statement" value={config.includeIntegrity !== false} onChange={v => set('includeIntegrity', v)} />
            <DeliverableExtras featureId={featureId} config={config} onChange={onChange} />
          </AdvancedSection>
        </div>
      );

    case 'studyGuides':
      return (
        <div className="space-y-4">
          <DeliverablePreview featureId="studyGuides" delivData={delivData} />
          {/* Basic */}
          <NumberInput
            label="Key terms per guide"
            value={config.keyTermsCount || 8}
            onChange={v => set('keyTermsCount', v)}
            min={4} max={20}
            description="Each term includes a definition and example."
          />
          {/* Advanced */}
          <AdvancedSection>
            <Toggle label="Include common misconceptions" value={config.includeMisconceptions !== false} onChange={v => set('includeMisconceptions', v)} />
            <Toggle label="Include exam prep section" value={config.includeExamPrep !== false} onChange={v => set('includeExamPrep', v)} />
            <Toggle label="Include practice activities" value={config.includePractice !== false} onChange={v => set('includePractice', v)} />
            <DeliverableExtras featureId={featureId} config={config} onChange={onChange} />
          </AdvancedSection>
        </div>
      );

    case 'syllabus':
      return (
        <div className="space-y-4">
          <DeliverablePreview featureId="syllabus" delivData={delivData} />
          {/* Basic */}
          <Select
            label="Citation style"
            value={config.citationStyle || 'APA 7th'}
            onChange={v => set('citationStyle', v)}
            options={['APA 7th', 'MLA 9th', 'Chicago 17th', 'None']}
          />
          {/* Advanced */}
          <AdvancedSection>
            <DeliverableExtras featureId={featureId} config={config} onChange={onChange} />
          </AdvancedSection>
        </div>
      );

    default: {
      // Custom deliverable — show universal controls only
      if (featureId.startsWith('custom_')) {
        const customDef = getCustomDeliverable(featureId);
        return (
          <div className="space-y-4">
            {customDef && (
              <p className="text-[11px] text-slate-500 italic">
                Custom deliverable — all generation settings are in Advanced options below.
              </p>
            )}
            <AdvancedSection>
              <DeliverableExtras featureId={featureId} config={config} onChange={onChange} />
            </AdvancedSection>
          </div>
        );
      }
      return null;
    }
  }
}

// ── Main Config screen ────────────────────────────────────────────────────────

export default function Config({
  lessonCount,      // estimated from promptText + files before generation
  isDetectingLessons, // true while AI lesson-count detection is running
  deliverables,    // generated deliverable data { featureId: { data, status } }
  onBack,
  onGenerate,
  canGenerate,
}) {
  const { setShowHelp } = useUI();
  const {
    selectedFeatures: selected,
    deliverableConfig, setDeliverableConfig,
    lessonScope, setLessonScope,
    courseMap, columns, setColumns,
  } = useCourse();
  const [expandedId, setExpandedId] = useState('courseMap');

  // Merge built-in + custom features for the config accordion
  const allFeatures = [...FEATURES, ...listCustomDeliverables().map(toFeatureEntry)];
  const configurableFeatures = allFeatures.filter(f => selected.includes(f.id));

  const scopeDescription = (() => {
    if (lessonScope.type === 'all') {
      const total = courseMap?.lessons?.length || lessonCount || 0;
      return total ? `All ${total} lessons` : 'All lessons';
    }
    const indices = lessonScope.indices || [];
    if (indices.length === 0) return 'No lessons selected';
    if (indices.length === 1) return `Lesson ${indices[0] + 1} only`;
    return `Lessons ${indices.map(i => i + 1).join(', ')}`;
  })();

  const scopeValid = lessonScope.type === 'all' || (lessonScope.indices?.length > 0);

  return (
    <>
      <div className="min-h-screen mesh-bg noise-overlay flex flex-col">
        {/* Header */}
        <header className="pt-5 px-8 flex items-center justify-between max-w-4xl mx-auto w-full">
          <button
            onClick={onBack}
            className="tactile flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-slate-700 hover:bg-white/60 transition-all duration-200"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back
          </button>
          <button
            onClick={() => setShowHelp(true)}
            className="tactile flex items-center gap-1.5 text-[11px] font-semibold text-slate-400 hover:text-indigo-600 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Help
          </button>
        </header>

        {/* Main */}
        <main className="flex-1 flex flex-col items-center px-6 py-6">
          <div className="max-w-2xl w-full animate-fade-up space-y-5">

            {/* Step badge + title */}
            <div className="text-center mb-2">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/50 border border-slate-200/40 text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-4">
                <span className="w-4 h-4 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-[9px] font-bold">3</span>
                Configure
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold text-slate-800 tracking-tight">Configure generation</h1>
              <p className="text-sm text-slate-500 mt-2">Set the lesson scope and customize each deliverable.</p>
            </div>

            {/* ── Lesson Scope ── */}
            <LessonScopeSelector
              lessonCount={lessonCount}
              isDetectingLessons={isDetectingLessons}
              courseMap={courseMap}
              lessonScope={lessonScope}
              setLessonScope={setLessonScope}
            />

            {/* ── Deliverable configs ── */}
            {configurableFeatures.length > 0 && (
              <div className="space-y-2">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-1">Deliverable settings</p>
                {configurableFeatures.map(feature => {
                  const config = deliverableConfig[feature.id] || {};
                  const c = COLOR_MAP[feature.color] || COLOR_MAP.indigo;
                  const isExpanded = expandedId === feature.id;

                  const delivData = deliverables?.[feature.id]?.data;
                  const panel = (
                    <DeliverableConfigContent
                      featureId={feature.id}
                      config={config}
                      onChange={(next) => setDeliverableConfig(prev => ({ ...prev, [feature.id]: next }))}
                      columns={columns}
                      setColumns={setColumns}
                      delivData={delivData}
                      courseMap={courseMap}
                    />
                  );

                  return (
                    <div
                      key={feature.id}
                      className={`rounded-squircle-xs border overflow-hidden transition-all duration-200 ${isExpanded ? `${c.activeBg} ${c.activeBorder}` : 'bg-white/40 border-slate-200/50'
                        }`}
                    >
                      {/* Accordion header */}
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : feature.id)}
                        className="w-full flex items-center gap-3 px-4 py-3 text-left"
                        aria-expanded={isExpanded}
                        aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${feature.label} settings`}
                      >
                        <div className={`w-7 h-7 rounded-lg ${c.iconBg} flex items-center justify-center flex-shrink-0`}>
                          <svg className={`w-3.5 h-3.5 ${c.iconText}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={feature.icon} />
                          </svg>
                        </div>
                        <span className="text-xs font-semibold text-slate-700 flex-1">{feature.label}</span>
                        <svg
                          className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                          fill="none" stroke="currentColor" viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>

                      {/* Config panel */}
                      {isExpanded && (
                        <div className="px-4 pb-4 pt-1 border-t border-slate-100/60 animate-spring-in">
                          {panel}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* ── Generate button ── */}
            <div className="pt-2">
              {lessonScope.type === 'specific' && !scopeValid && (
                <p className="text-center text-[11px] text-amber-500 mb-2">Select at least one lesson to continue.</p>
              )}
              <button
                onClick={onGenerate}
                disabled={!canGenerate || !scopeValid}
                className={`tactile btn-glow w-full py-4 rounded-squircle-xs font-semibold text-sm tracking-wide transition-all duration-300 ${canGenerate && scopeValid
                    ? 'text-white bg-gradient-to-r from-indigo-500 via-violet-500 to-purple-600 shadow-lg shadow-indigo-500/25 hover:shadow-glow-violet hover:brightness-[1.06]'
                    : 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
                  }`}
              >
                <span className="flex items-center justify-center gap-2.5">
                  Generate — {scopeDescription}
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </span>
              </button>
            </div>
          </div>
        </main>

        {/* Footer */}
        <footer className="py-4 text-center">
          <div className="flex items-center justify-center gap-3 text-[10px] text-slate-300/70">
            <a href="#/changelog" className="font-medium hover:text-indigo-500 transition-colors duration-200">v0.5</a>
            <span>·</span>
            <a href="#/privacy" className="hover:text-indigo-500 transition-colors duration-200">Privacy</a>
            <span>·</span>
            <a href="#/terms" className="hover:text-indigo-500 transition-colors duration-200">Terms</a>
          </div>
        </footer>
      </div>

    </>
  );
}
