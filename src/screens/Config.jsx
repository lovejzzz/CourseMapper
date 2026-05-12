import React, { useEffect, useState, useRef } from 'react';
import FocusTrap from 'focus-trap-react';
import { FEATURES, COLOR_MAP } from '../lib/featureCatalog';
import ColumnEditor from '../components/ColumnEditor';
import LessonScopeSelector from '../components/config/LessonScopeSelector';
import { getCustomDeliverable, listCustomDeliverables, toFeatureEntry } from '../lib/customDeliverableLibrary';
import { PREVIEW_EXAMPLES } from '../lib/previewExamples';
import { useUI } from '../contexts/UIContext';
import { useCourse } from '../contexts/CourseContext';
import { useAIConfig } from '../contexts/AIConfigContext';
import { fetchOpenAIImageModels, OPENAI_IMAGE_MODEL_FALLBACKS, OPENAI_SLIDE_IMAGE_MODEL } from '../lib/imageSearch';

// ── Shared option lists for universal advanced settings ───────────────────────
const TONE_OPTIONS = ['Auto', 'Academic', 'Professional', 'Conversational', 'Friendly', 'Formal', 'Encouraging'];
const STYLE_OPTIONS = ['Auto', 'Bullet points', 'Paragraphs', 'Tables', 'Numbered lists', 'Mixed'];
const LENGTH_OPTIONS = ['Auto', 'Brief', 'Standard', 'Detailed', 'Comprehensive'];
const FAQ_CATEGORY_OPTIONS = [
  'Course Logistics',
  'Assignment Clarification',
  'Concept Explanation',
  'Technical Help',
  'Assessment Prep',
];

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
          {TONE_OPTIONS.map((opt) => {
            const isAuto = opt === 'Auto';
            const isActive = isAuto ? !config.tone || config.tone === 'Auto' : config.tone === opt;
            return (
              <button
                key={opt}
                onClick={() => onChange({ ...config, tone: isAuto ? null : config.tone === opt ? null : opt })}
                className={`tactile px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all duration-150 ${
                  isActive
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
          {STYLE_OPTIONS.map((opt) => {
            const isAuto = opt === 'Auto';
            const isActive = isAuto ? !config.style || config.style === 'Auto' : config.style === opt;
            return (
              <button
                key={opt}
                onClick={() => onChange({ ...config, style: isAuto ? null : config.style === opt ? null : opt })}
                className={`tactile px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all duration-150 ${
                  isActive
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
          {LENGTH_OPTIONS.map((opt) => {
            const isAuto = opt === 'Auto';
            const isActive = isAuto
              ? !config.outputLength || config.outputLength === 'Auto'
              : config.outputLength === opt;
            return (
              <button
                key={opt}
                onClick={() =>
                  onChange({ ...config, outputLength: isAuto ? null : config.outputLength === opt ? null : opt })
                }
                className={`tactile px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all duration-150 ${
                  isActive
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
          onClick={() => setShowPromptEditor((v) => !v)}
          className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 hover:text-indigo-500 transition-colors"
        >
          <svg
            className={`w-3 h-3 transition-transform duration-200 ${showPromptEditor ? 'rotate-90' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
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
              Override the user prompt. Use{' '}
              <code className="text-[9px] bg-slate-100 px-1 py-0.5 rounded">{'{{courseMap}}'}</code> as a placeholder
              for course data.
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
          <span className="ml-1.5 text-[10px] font-normal text-slate-400">
            optional — show the AI what format you want
          </span>
        </p>
        {file ? (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/60 border border-slate-200/60">
            <svg
              className="w-4 h-4 text-indigo-400 flex-shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            <span className="text-[11px] text-slate-700 font-medium truncate flex-1">{file.name}</span>
            <button onClick={removeFile} className="text-slate-300 hover:text-red-400 transition-colors flex-shrink-0">
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
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
              />
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
          <span className="ml-1.5 text-[10px] font-normal text-slate-400">
            optional — specific requirements for this deliverable
          </span>
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
        className={`tactile flex-shrink-0 relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200 ${
          value ? 'bg-indigo-500' : 'bg-slate-200'
        }`}
      >
        <span
          className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform duration-200 ${
            value ? 'translate-x-[18px]' : 'translate-x-[3px]'
          }`}
        />
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
        {options.map((opt) => (
          <button
            key={opt}
            onClick={() => onChange(opt)}
            className={`tactile px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all duration-150 ${
              value === opt
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

function DropdownSelect({ label, value, onChange, options, description, disabled = false, status }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-slate-700">{label}</label>
      {description && <p className="text-[10px] text-slate-400">{description}</p>}
      <select
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full h-8 rounded-lg border border-slate-200/70 bg-white/70 px-2.5 text-[11px] font-medium text-slate-700 shadow-sm outline-none transition-all focus:border-indigo-300 focus:ring-1 focus:ring-indigo-200 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {options.map((opt) => (
          <option key={opt.value || opt} value={opt.value || opt}>
            {opt.label || opt}
          </option>
        ))}
      </select>
      {status && <p className="text-[10px] text-slate-400 leading-snug">{status}</p>}
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
        >
          −
        </button>
        <span className="w-8 text-center text-xs font-semibold text-slate-700">{value || min}</span>
        <button
          onClick={() => onChange(Math.min(max, (value || min) + 1))}
          className="tactile w-6 h-6 rounded-md bg-white/60 border border-slate-200/60 text-slate-500 hover:bg-white flex items-center justify-center text-sm font-bold transition-all"
        >
          +
        </button>
      </div>
    </div>
  );
}

function MultiToggle({ label, options, selected, onChange, description }) {
  const toggle = (opt) => {
    const next = selected.includes(opt) ? selected.filter((x) => x !== opt) : [...selected, opt];
    onChange(next);
  };
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-slate-700">{label}</p>
      {description && <p className="text-[10px] text-slate-400">{description}</p>}
      <div className="flex flex-wrap gap-1.5 mt-1">
        {options.map((opt) => (
          <button
            key={opt}
            onClick={() => toggle(opt)}
            className={`tactile px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all duration-150 ${
              selected.includes(opt)
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

function SlideImageModelSettings({ config, onChange, apiKey }) {
  const [models, setModels] = useState(OPENAI_IMAGE_MODEL_FALLBACKS);
  const [status, setStatus] = useState('Fetching available OpenAI image models...');

  const set = (key, val) => onChange((prev) => ({ ...prev, [key]: val }));
  const selectedModel = config.aiImageModel || models[0] || OPENAI_SLIDE_IMAGE_MODEL;

  useEffect(() => {
    if (!apiKey?.trim()) {
      setModels(OPENAI_IMAGE_MODEL_FALLBACKS);
      setStatus('Enter an OpenAI API key to fetch the newest available image models.');
      return undefined;
    }

    const controller = new AbortController();
    setStatus('Fetching available OpenAI image models...');
    fetchOpenAIImageModels(apiKey.trim(), controller.signal)
      .then((fetched) => {
        const nextModels = fetched.length > 0 ? fetched : OPENAI_IMAGE_MODEL_FALLBACKS;
        setModels(nextModels);
        onChange((prev) => {
          const current = prev.aiImageModel;
          if (current && nextModels.includes(current)) return prev;
          return { ...prev, aiImageModel: nextModels[0] || OPENAI_SLIDE_IMAGE_MODEL };
        });
        setStatus(
          fetched.length > 0
            ? 'Newest available image model is selected by default.'
            : 'No image models were returned; using known OpenAI image model names.',
        );
      })
      .catch((err) => {
        if (err.name === 'AbortError') return;
        setModels(OPENAI_IMAGE_MODEL_FALLBACKS);
        setStatus(`Could not fetch image models; using known defaults. ${err.message || ''}`.trim());
      });

    return () => controller.abort();
  }, [apiKey]);

  return (
    <DropdownSelect
      label="Image model"
      value={selectedModel}
      onChange={(v) => set('aiImageModel', v)}
      options={models.map((model) => ({
        value: model,
        label: model === OPENAI_SLIDE_IMAGE_MODEL ? `${model} (newest)` : model,
      }))}
      description="Auto-fetched from OpenAI when possible. Use a fallback model if your organization cannot access the newest one."
      status={status}
    />
  );
}

// ── Advanced section toggle ───────────────────────────────────────────────────

function AdvancedSection({ children }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="pt-2">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400 hover:text-indigo-500 transition-colors mb-2"
      >
        <svg
          className={`w-3 h-3 transition-transform duration-200 ${open ? 'rotate-90' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        {open ? 'Hide advanced options' : 'Advanced options'}
      </button>
      {open && <div className="space-y-4 animate-spring-in pt-1 border-t border-slate-100/60">{children}</div>}
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
  courseFaq: 'Course FAQ',
  syllabus: 'Syllabus',
};

function DeliverablePreview({ featureId, delivData, courseMap, columns }) {
  const [fullscreen, setFullscreen] = useState(false);
  const label = FEATURE_LABELS[featureId] || featureId;

  // Extract real content from deliverable data, fall back to sample layout content.
  const { content: realContent, isExample } = React.useMemo(() => {
    // Try real data first
    if (featureId === 'courseMap' && courseMap?.lessons?.length > 0) {
      const lessons = courseMap.lessons.slice(0, 3);
      const cols = (columns || []).filter((c) => c.enabled !== false).slice(0, 3);
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
          if (sections.length > 0)
            parsed = { type: 'syllabus', sections: sections.slice(0, 5), total: sections.length };
          break;
        }
      }
      if (parsed) return { content: parsed, isExample: false };
    }

    // Fall back to sample content that demonstrates structure only.
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
    const maxItems = expanded ? realContent.total : realContent.items?.length || realContent.sections?.length || 3;

    switch (realContent.type) {
      case 'courseMap': {
        const { lessons, cols } = realContent;
        const showLessons = expanded ? courseMap?.lessons || lessons : lessons;
        return (
          <div className="overflow-x-auto">
            <div className="overflow-hidden rounded border border-slate-200/40 min-w-0">
              <div className="flex bg-slate-50/80">
                <div className={`${pad} font-semibold text-slate-600 border-r border-slate-200/30 flex-shrink-0 w-28`}>
                  Week/Module
                </div>
                {cols.map((c) => (
                  <div
                    key={c.key}
                    className={`flex-1 ${pad} font-semibold text-slate-600 border-r border-slate-200/30 last:border-r-0 min-w-0`}
                  >
                    {c.label}
                  </div>
                ))}
              </div>
              {showLessons.map((lesson, i) => (
                <div key={i} className="flex border-t border-slate-200/30">
                  <div
                    className={`${pad} text-slate-700 font-medium border-r border-slate-200/30 flex-shrink-0 w-28 truncate`}
                  >
                    {lesson.title || `Lesson ${i + 1}`}
                  </div>
                  {cols.map((c) => {
                    const sections = lesson.sections || [];
                    const val = sections
                      .map((s) => s[c.key])
                      .filter(Boolean)
                      .join('; ');
                    return (
                      <div
                        key={c.key}
                        className={`flex-1 ${pad} border-r border-slate-200/30 last:border-r-0 min-w-0 truncate`}
                      >
                        {truncate(val, expanded ? 120 : 50)}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
            {!expanded && realContent.total > 3 && (
              <p className="text-[9px] text-slate-400 mt-1 text-right">+ {realContent.total - 3} more lessons</p>
            )}
          </div>
        );
      }
      case 'lessonPlans': {
        const items = expanded ? delivData.plans || delivData.lessonPlans || [] : realContent.items;
        return (
          <div className="space-y-2">
            {items.map((plan, i) => {
              const outline = plan.sessionOutline || plan.outline || plan.ol || [];
              const blooms = plan.bloomsLevels || plan.bls;
              return (
                <div key={i} className="rounded border border-slate-200/30 overflow-hidden">
                  <div className={`${pad} bg-slate-50/60 flex items-center gap-1.5 flex-wrap`}>
                    <span className="font-semibold text-slate-700">
                      {plan.lessonTitle || plan.lt || plan.title || `Lesson ${i + 1}`}
                    </span>
                    {plan.duration && <span className="text-[9px] text-slate-400">· {plan.duration}</span>}
                    {Array.isArray(blooms) && blooms.length > 0 && (
                      <span className="text-[9px] text-indigo-400">· Bloom's: {blooms.join(' · ')}</span>
                    )}
                  </div>
                  {outline.slice(0, expanded ? 8 : 3).map((seg, j) => (
                    <div key={j} className={`${pad} border-t border-slate-200/20 flex items-start gap-2`}>
                      <span className="font-mono text-indigo-400 flex-shrink-0 w-12 text-right">
                        {seg.duration || seg.time || seg.tm || ''}
                      </span>
                      <div className="w-1 h-1 rounded-full bg-indigo-300 mt-1.5 flex-shrink-0" />
                      <span>
                        <strong className="text-slate-600">{seg.activity || seg.section || seg.ac || ''}:</strong>{' '}
                        {truncate(seg.description || seg.details || seg.de || '', expanded ? 200 : 80)}
                      </span>
                    </div>
                  ))}
                  {!expanded && outline.length > 3 && (
                    <div className={`${pad} border-t border-slate-200/20 text-slate-400 italic`}>
                      + {outline.length - 3} more segments
                    </div>
                  )}
                </div>
              );
            })}
            {!expanded && realContent.total > items.length && (
              <p className="text-[9px] text-slate-400 text-right">+ {realContent.total - items.length} more plans</p>
            )}
          </div>
        );
      }
      case 'slideDecks': {
        const items = expanded ? delivData.decks || delivData.slideDecks || [] : realContent.items;
        // Subtle tint per slide type so the deck shape reads at a glance.
        const typeTone = {
          title: 'bg-indigo-50/60 border-indigo-200/50',
          agenda: 'bg-sky-50/60 border-sky-200/50',
          objectives: 'bg-sky-50/60 border-sky-200/50',
          bridge: 'bg-cyan-50/60 border-cyan-200/50',
          content: 'bg-white/60 border-slate-200/50',
          activity: 'bg-emerald-50/60 border-emerald-200/50',
          discussion: 'bg-emerald-50/60 border-emerald-200/50',
          example: 'bg-amber-50/60 border-amber-200/50',
          keyTerm: 'bg-violet-50/60 border-violet-200/50',
          summary: 'bg-rose-50/60 border-rose-200/50',
          closing: 'bg-slate-50/60 border-slate-200/50',
        };
        return (
          <div className="space-y-2">
            {items.map((deck, i) => {
              const slides = deck.slides || deck.sl || [];
              return (
                <div key={i}>
                  <p className="font-semibold text-slate-700 mb-1">
                    {deck.lessonTitle || deck.lt || deck.title || `Deck ${i + 1}`} ({slides.length} slides)
                  </p>
                  <div className="flex gap-1.5 overflow-x-auto pb-1">
                    {slides.slice(0, expanded ? 12 : 5).map((s, j) => {
                      const ty = s.type || s.ty;
                      const firstBullet = Array.isArray(s.bullets || s.bu) ? (s.bullets || s.bu)[0] : null;
                      const timing = s.timeEstimate || s.ti || s.timer;
                      const vis = s.visual || s.vi;
                      const visKind = vis && (vis.kind || vis.k);
                      const hasVisual = visKind && visKind !== 'none';
                      const visIcon = { diagram: '📐', chart: '📊', image: '🖼', table: '▦', code: '⌨', equation: '∑' }[
                        visKind
                      ];
                      return (
                        <div
                          key={j}
                          className={`flex-shrink-0 ${expanded ? 'w-36 h-24' : 'w-24 h-16'} rounded border ${typeTone[ty] || typeTone.content} p-1.5 flex flex-col leading-tight overflow-hidden relative`}
                          title={`${s.title || s.heading || `Slide ${j + 1}`}${timing ? ` · ${timing}` : ''}${hasVisual ? ` · visual: ${vis.description || vis.d || visKind}` : ''}`}
                        >
                          <div className="flex items-center justify-between gap-1">
                            {ty && (
                              <span className="text-[8px] font-semibold uppercase tracking-wider text-slate-400 truncate">
                                {ty}
                              </span>
                            )}
                            <div className="flex items-center gap-0.5 flex-shrink-0">
                              {hasVisual && (
                                <span className="text-[9px]" aria-hidden="true">
                                  {visIcon || '✦'}
                                </span>
                              )}
                              {timing && <span className="text-[8px] text-slate-400 font-mono">{timing}</span>}
                            </div>
                          </div>
                          <span className="text-[9px] text-slate-600 font-medium line-clamp-2 mt-0.5">
                            {s.title || s.heading || s.t || `Slide ${j + 1}`}
                          </span>
                          {expanded && firstBullet && (
                            <span className="text-[8px] text-slate-400 line-clamp-2 mt-auto">
                              • {truncate(firstBullet, 70)}
                            </span>
                          )}
                        </div>
                      );
                    })}
                    {slides.length > (expanded ? 12 : 5) && (
                      <div
                        className={`flex-shrink-0 ${expanded ? 'w-36 h-24' : 'w-24 h-16'} rounded border border-dashed border-slate-200/50 flex items-center justify-center text-[9px] text-slate-400`}
                      >
                        +{slides.length - (expanded ? 12 : 5)} more
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        );
      }
      case 'rubrics': {
        const items = expanded ? delivData.rubrics || [] : realContent.items;
        return (
          <div className="space-y-2">
            {items.map((rubric, i) => {
              const criteria = rubric.criteria || rubric.cr || [];
              const levels = criteria[0]?.levels || [];
              const showWeight = criteria.some((c) => c.weight || typeof c.points === 'number');
              return (
                <div key={i}>
                  <div className="flex items-baseline gap-1.5 mb-1 flex-wrap">
                    <p className="font-semibold text-slate-700">
                      {rubric.assignmentTitle || rubric.lessonTitle || rubric.lt || rubric.title || `Rubric ${i + 1}`}
                    </p>
                    {typeof rubric.totalPoints === 'number' && (
                      <span className="text-[9px] text-slate-400">· {rubric.totalPoints} pts total</span>
                    )}
                    {rubric.bloomsLevel && (
                      <span className="text-[9px] text-indigo-400">· Bloom's: {rubric.bloomsLevel}</span>
                    )}
                  </div>
                  <div className="overflow-hidden rounded border border-slate-200/40">
                    <div className="flex bg-slate-50/80">
                      <div
                        className={`${pad} font-semibold text-slate-600 border-r border-slate-200/30 w-24 flex-shrink-0`}
                      >
                        Criteria
                      </div>
                      {showWeight && (
                        <div
                          className={`${pad} font-semibold text-slate-600 border-r border-slate-200/30 w-14 flex-shrink-0 text-center`}
                        >
                          Weight
                        </div>
                      )}
                      {levels.map((l, k) => (
                        <div
                          key={k}
                          className={`flex-1 ${pad} font-semibold text-slate-600 border-r border-slate-200/30 last:border-r-0 text-center`}
                        >
                          {l.label || l.level || `Level ${k + 1}`}
                        </div>
                      ))}
                    </div>
                    {criteria.slice(0, expanded ? 8 : 3).map((c, k) => (
                      <div key={k} className="flex border-t border-slate-200/30">
                        <div
                          className={`${pad} font-medium text-slate-600 border-r border-slate-200/30 w-24 flex-shrink-0 truncate`}
                        >
                          {c.name || c.criterion || c.cn || ''}
                        </div>
                        {showWeight && (
                          <div
                            className={`${pad} text-slate-500 border-r border-slate-200/30 w-14 flex-shrink-0 text-center`}
                          >
                            {c.weight || (typeof c.points === 'number' ? `${c.points} pts` : '—')}
                          </div>
                        )}
                        {(c.levels || []).map((l, m) => (
                          <div
                            key={m}
                            className={`flex-1 ${pad} border-r border-slate-200/30 last:border-r-0 text-center truncate`}
                          >
                            {truncate(l.description || '', expanded ? 80 : 30)}
                          </div>
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
        const items = expanded ? delivData.quizzes || delivData.quizBank || [] : realContent.items;
        // Short-form type labels for the badge — keeps the row compact.
        const typeShort = { multiple_choice: 'MC', short_answer: 'SA', essay: 'Essay' };
        const diffTone = {
          Easy: 'text-emerald-600 bg-emerald-50',
          Medium: 'text-amber-600 bg-amber-50',
          Hard: 'text-red-600 bg-red-50',
        };
        return (
          <div className="space-y-2">
            {items.map((quiz, i) => {
              const questions = quiz.questions || quiz.qs || [];
              const blooms = quiz.bloomsCoverage || quiz.bc;
              return (
                <div key={i}>
                  <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                    <p className="font-semibold text-slate-700">
                      {quiz.lessonTitle || quiz.lt || quiz.title || `Quiz ${i + 1}`}
                    </p>
                    <span className="text-slate-400">({questions.length} questions)</span>
                    {Array.isArray(blooms) && blooms.length > 0 && (
                      <span className="text-[9px] text-indigo-400">· Bloom's: {blooms.join(' · ')}</span>
                    )}
                  </div>
                  <div className="space-y-1">
                    {questions.slice(0, expanded ? 10 : 3).map((q, j) => (
                      <div key={j} className="pl-1">
                        <div className="flex items-start gap-1.5">
                          <span className="px-1.5 py-0.5 rounded bg-indigo-50/80 text-indigo-500 font-semibold text-[9px] flex-shrink-0 mt-0.5">
                            {typeShort[q.type] || q.type || q.ty || 'Q'}
                          </span>
                          {q.bloomsLevel && (
                            <span className="px-1.5 py-0.5 rounded bg-violet-50/80 text-violet-500 font-semibold text-[9px] flex-shrink-0 mt-0.5">
                              {q.bloomsLevel}
                            </span>
                          )}
                          {q.difficulty && (
                            <span
                              className={`px-1.5 py-0.5 rounded font-semibold text-[9px] flex-shrink-0 mt-0.5 ${diffTone[q.difficulty] || 'text-slate-500 bg-slate-50'}`}
                            >
                              {q.difficulty}
                            </span>
                          )}
                          {typeof q.points === 'number' && (
                            <span className="text-[9px] text-slate-400 mt-0.5">{q.points} pt</span>
                          )}
                          <span className="text-slate-600 flex-1 min-w-0">
                            {truncate(q.question || q.q || q.prompt || '', expanded ? 240 : 100)}
                          </span>
                        </div>
                        {expanded && Array.isArray(q.options) && q.options.length > 0 && (
                          <div className="mt-0.5 ml-8 space-y-0.5 text-slate-500">
                            {q.options.slice(0, 4).map((opt, k) => {
                              const isAnswer = q.answer && String(opt).trim().startsWith(String(q.answer).trim());
                              return (
                                <div key={k} className={isAnswer ? 'text-emerald-600 font-semibold' : ''}>
                                  {truncate(opt, 100)}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    ))}
                    {questions.length > (expanded ? 10 : 3) && (
                      <p className="text-slate-400 italic pl-1">
                        + {questions.length - (expanded ? 10 : 3)} more questions
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        );
      }
      case 'discussions': {
        const items = expanded ? delivData.discussions || [] : realContent.items;
        return (
          <div className="space-y-2">
            {items.map((disc, i) => {
              // followUp can be a string (legacy) or an array of prompts.
              const followUps = Array.isArray(disc.followUp || disc.followUpProbes)
                ? disc.followUp || disc.followUpProbes
                : disc.followUp
                  ? [disc.followUp]
                  : disc.responseGuidelines
                    ? [disc.responseGuidelines]
                    : [];
              return (
                <div key={i} className="rounded border border-slate-200/30 overflow-hidden">
                  <div className={`${pad} bg-slate-50/60 flex items-center gap-1.5 flex-wrap`}>
                    <span className="font-semibold text-slate-700">
                      {disc.lessonTitle || disc.lt || disc.title || `Discussion ${i + 1}`}
                    </span>
                    {disc.bloomsLevel && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-violet-50/80 text-violet-500 font-semibold">
                        Bloom's: {disc.bloomsLevel}
                      </span>
                    )}
                    {disc.format && <span className="text-[9px] text-slate-400">· {disc.format}</span>}
                    {disc.estimatedDuration && (
                      <span className="text-[9px] text-slate-400">· {disc.estimatedDuration}</span>
                    )}
                  </div>
                  <div className={`${pad} border-t border-slate-200/20`}>
                    <p className="text-slate-600 italic">
                      "{truncate(disc.prompt || disc.mainPrompt || '', expanded ? 320 : 120)}"
                    </p>
                    {followUps.length > 0 && (
                      <div className="mt-1.5">
                        <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider mb-0.5">
                          Follow-up prompts
                        </p>
                        <ul className="space-y-0.5 text-slate-500 list-disc list-inside ml-1">
                          {followUps.slice(0, expanded ? 5 : 2).map((fu, k) => (
                            <li key={k}>{truncate(fu, expanded ? 180 : 80)}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            {!expanded && realContent.total > items.length && (
              <p className="text-[9px] text-slate-400 text-right">+ {realContent.total - items.length} more</p>
            )}
          </div>
        );
      }
      case 'assignments': {
        const items = expanded ? delivData.assignments || [] : realContent.items;
        return (
          <div className="space-y-2">
            {items.map((asgn, i) => {
              const deliverables = asgn.deliverables;
              const components = Array.isArray(asgn.components) ? asgn.components : [];
              return (
                <div key={i} className="rounded border border-slate-200/30 overflow-hidden">
                  <div className={`${pad} bg-slate-50/60 space-y-1`}>
                    <div className="font-semibold text-slate-700">{asgn.title || asgn.t || `Assignment ${i + 1}`}</div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {asgn.assignmentType && <span className="text-[9px] text-slate-400">{asgn.assignmentType}</span>}
                      {asgn.bloomsLevel && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-violet-50/80 text-violet-500 font-semibold">
                          Bloom's: {asgn.bloomsLevel}
                        </span>
                      )}
                      {asgn.estimatedTime && (
                        <span className="text-[9px] text-slate-400">· ⏱ {asgn.estimatedTime}</span>
                      )}
                      {(typeof asgn.totalPoints === 'number' || asgn.percentOfGrade) && (
                        <span className="text-[9px] text-slate-400">
                          · {asgn.totalPoints ? `${asgn.totalPoints} pts` : ''}
                          {asgn.totalPoints && asgn.percentOfGrade ? ' · ' : ''}
                          {asgn.percentOfGrade || ''}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className={`${pad} border-t border-slate-200/20 space-y-1.5`}>
                    {(asgn.description || asgn.overview || asgn.ov) && (
                      <p className="text-slate-600">
                        {truncate(asgn.description || asgn.overview || asgn.ov, expanded ? 320 : 120)}
                      </p>
                    )}
                    {components.length > 0 && (
                      <div>
                        <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider mb-0.5">
                          Components
                        </p>
                        <ul className="list-disc list-inside space-y-0.5 ml-1 text-slate-500">
                          {components.slice(0, expanded ? 10 : 3).map((c, j) => (
                            <li key={j}>
                              {truncate(typeof c === 'string' ? c : c.name || c.title || '', expanded ? 150 : 80)}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {expanded && Array.isArray(deliverables) && deliverables.length > 0 && (
                      <div>
                        <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider mb-0.5">
                          Deliverables
                        </p>
                        <ul className="list-disc list-inside space-y-0.5 ml-1 text-slate-500">
                          {deliverables.slice(0, 6).map((d, j) => (
                            <li key={j}>{truncate(typeof d === 'string' ? d : d.name || d.title || '', 120)}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {expanded &&
                      Array.isArray(asgn.scaffoldingMilestones || asgn.sm) &&
                      (asgn.scaffoldingMilestones || asgn.sm).length > 0 && (
                        <div>
                          <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider mb-0.5">
                            Scaffolding Timeline
                          </p>
                          <ol className="space-y-1 ml-1 text-slate-500">
                            {(asgn.scaffoldingMilestones || asgn.sm).slice(0, 6).map((m, j) => (
                              <li key={j} className="flex items-start gap-1.5">
                                <span className="font-mono text-indigo-400 flex-shrink-0 text-[9px]">
                                  {m.dueDate || m.dd || `#${j + 1}`}
                                </span>
                                <div className="flex-1 min-w-0">
                                  <span className="font-semibold text-slate-600">{m.milestone || m.ms || ''}</span>
                                  {m.feedback && <span className="text-violet-500/70 ml-1">↳ {m.feedback}</span>}
                                  {typeof m.points === 'number' && m.points > 0 && (
                                    <span className="text-[9px] text-slate-400 ml-1 font-mono">· {m.points} pt</span>
                                  )}
                                </div>
                              </li>
                            ))}
                          </ol>
                        </div>
                      )}
                  </div>
                </div>
              );
            })}
          </div>
        );
      }
      case 'studyGuides': {
        const items = expanded ? delivData.studyGuides || delivData.guides || [] : realContent.items;
        return (
          <div className="space-y-2">
            {items.map((guide, i) => {
              const terms = guide.keyTerms || guide.terms || guide.vocabulary || guide.kt || [];
              const reviewQs = guide.reviewQuestions || guide.rq || [];
              return (
                <div key={i}>
                  <p className="font-semibold text-slate-700 mb-1">
                    {guide.lessonTitle || guide.lt || guide.title || `Guide ${i + 1}`}
                  </p>
                  {expanded && guide.summary && (
                    <p className="text-slate-500 italic mb-1.5">{truncate(guide.summary, 240)}</p>
                  )}
                  <div className="space-y-1.5">
                    {terms.slice(0, expanded ? 10 : 3).map((t, j) => (
                      <div key={j}>
                        <div>
                          <span className="font-semibold text-slate-600">{t.term || t.name || t.tm || ''}:</span>{' '}
                          <span className="text-slate-500">
                            {truncate(t.definition || t.def || t.df || '', expanded ? 200 : 70)}
                          </span>
                        </div>
                        {expanded && (t.example || t.ex) && (
                          <p className="ml-3 text-[10px] text-slate-400 italic">
                            e.g. {truncate(t.example || t.ex, 150)}
                          </p>
                        )}
                      </div>
                    ))}
                    {terms.length > (expanded ? 10 : 3) && (
                      <p className="text-slate-400 italic">+ {terms.length - (expanded ? 10 : 3)} more terms</p>
                    )}
                  </div>
                  {expanded && reviewQs.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-slate-200/30">
                      <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider mb-0.5">
                        Review questions
                      </p>
                      <ul className="list-disc list-inside ml-1 text-slate-500 space-y-0.5">
                        {reviewQs.slice(0, 5).map((q, k) => (
                          <li key={k}>{truncate(typeof q === 'string' ? q : q.q || q.question || '', 180)}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      }
      case 'courseFaq': {
        // FAQ had no preview case — if a user selected "Course FAQ" in the
        // Configure page before, the card would render the "Example" badge
        // but no body. Now shows Q/A pairs with a category tag.
        const items = expanded ? delivData.faqs || delivData.courseFaq || [] : realContent.items;
        return (
          <div className="space-y-1.5">
            {items.map((f, i) => (
              <div key={i} className="rounded border border-slate-200/30 overflow-hidden">
                <div className={`${pad} bg-slate-50/60 flex items-start gap-2`}>
                  <span className="w-5 h-5 rounded bg-indigo-50/80 text-indigo-500 flex items-center justify-center text-[10px] font-bold flex-shrink-0">
                    Q
                  </span>
                  <span className="font-semibold text-slate-700 flex-1">
                    {truncate(f.question || f.q || '', expanded ? 220 : 100)}
                  </span>
                  {f.category && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 font-semibold flex-shrink-0">
                      {f.category}
                    </span>
                  )}
                </div>
                <div className={`${pad} border-t border-slate-200/20 flex items-start gap-2`}>
                  <span className="w-5 h-5 rounded bg-emerald-50/80 text-emerald-500 flex items-center justify-center text-[10px] font-bold flex-shrink-0">
                    A
                  </span>
                  <span className="text-slate-600 flex-1">
                    {truncate(f.answer || f.an || '', expanded ? 320 : 120)}
                  </span>
                </div>
              </div>
            ))}
            {!expanded && realContent.total > items.length && (
              <p className="text-[9px] text-slate-400 text-right">+ {realContent.total - items.length} more FAQs</p>
            )}
          </div>
        );
      }
      case 'syllabus': {
        const sections = expanded ? delivData.sections || [] : realContent.sections;
        const matrix = (expanded ? delivData.outcomeAlignmentMatrix : realContent.outcomeAlignmentMatrix) || [];
        return (
          <div className="space-y-1.5">
            {sections.map((s, i) => (
              <div key={i} className="rounded border border-slate-200/30 overflow-hidden">
                <div className={`${pad} bg-slate-50/60 font-semibold text-slate-700 flex items-center gap-2`}>
                  <span className="w-5 h-5 rounded bg-cyan-50/80 text-cyan-500 flex items-center justify-center text-[9px] font-bold flex-shrink-0">
                    {i + 1}
                  </span>
                  {s.heading || s.title || `Section ${i + 1}`}
                </div>
                {s.content && (
                  <div className={`${pad} border-t border-slate-200/20 text-slate-600`}>
                    {truncate(Array.isArray(s.content) ? s.content.join(' ') : s.content, expanded ? 300 : 100)}
                  </div>
                )}
              </div>
            ))}
            {/* Outcome-alignment matrix preview — compact table, shown inline
                under the text sections when the syllabus has matrix data.
                Accreditation teams look for this; we surface it up front. */}
            {matrix.length > 0 && (
              <div className="mt-2 pt-1.5 border-t border-slate-200/30">
                <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                  Outcome ↔ Assessment
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-[10px]">
                    <thead>
                      <tr className="bg-slate-50/60">
                        <th className="text-left px-2 py-1 font-semibold text-slate-500">Outcome</th>
                        <th className="text-left px-2 py-1 font-semibold text-slate-500 whitespace-nowrap">
                          Assessed by
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {matrix.slice(0, expanded ? 8 : 3).map((row, i) => {
                        const assessedBy = Array.isArray(row.assessedBy) ? row.assessedBy : [];
                        const hasGap =
                          assessedBy.length === 0 || (Array.isArray(row.practicedIn) && row.practicedIn.length === 0);
                        return (
                          <tr key={i} className={`border-t border-slate-100 ${hasGap ? 'bg-amber-50/40' : ''}`}>
                            <td className="px-2 py-1 text-slate-600 align-top">
                              {truncate(row.outcome, expanded ? 180 : 80)}
                            </td>
                            <td className="px-2 py-1 text-slate-500 align-top">
                              {assessedBy.length > 0 ? (
                                truncate(assessedBy.join(', '), expanded ? 140 : 60)
                              ) : (
                                <span className="text-amber-600 italic">⚠ Unassessed</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {!expanded && matrix.length > 3 && (
                    <p className="text-[9px] text-slate-400 text-right mt-0.5">+ {matrix.length - 3} more outcomes</p>
                  )}
                </div>
              </div>
            )}
            {!expanded && realContent.total > sections.length && (
              <p className="text-[9px] text-slate-400 text-right">
                + {realContent.total - sections.length} more sections
              </p>
            )}
          </div>
        );
      }
      default:
        return null;
    }
  };

  return (
    <>
      <div className="mb-4 rounded-lg border border-slate-200/40 overflow-hidden">
        <div className="px-3 py-1.5 bg-slate-50/60 border-b border-slate-200/40 flex items-center justify-between">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            {label} — {realContent.total || realContent.items?.length || 0}{' '}
            {featureId === 'courseMap' ? 'lessons' : 'items'}
            {isExample && (
              <span className="px-1.5 py-0.5 rounded bg-amber-50 text-amber-500 text-[9px] font-semibold normal-case tracking-normal">
                Sample layout
              </span>
            )}
          </p>
          <button
            onClick={() => setFullscreen(true)}
            className="text-slate-300 hover:text-indigo-500 transition-colors"
            title="Full screen"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5v-4m0 4h-4m4 0l-5-5"
              />
            </svg>
          </button>
        </div>
        {isExample && (
          <p className="px-3 pb-2 -mt-1 text-[10px] text-amber-600/80">
            Illustrative content only. Your generated version will use the course prompt and files from the previous
            step.
          </p>
        )}
        <div className="p-3 text-[10px] text-slate-500 leading-relaxed max-h-48 overflow-y-auto">
          {renderContent(false)}
        </div>
      </div>

      {/* Fullscreen modal */}
      {fullscreen && (
        <FocusTrap focusTrapOptions={{ clickOutsideDeactivates: true }}>
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-md"
            onClick={() => setFullscreen(false)}
          >
            <div
              className="bg-white/95 backdrop-blur-lg rounded-2xl shadow-2xl border border-slate-200/60 max-w-3xl w-full mx-4 animate-spring-scale max-h-[85vh] flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="sticky top-0 z-10 bg-white/95 backdrop-blur-lg px-6 py-4 border-b border-slate-200/40 flex items-center justify-between rounded-t-2xl flex-shrink-0">
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  {label} — {realContent.total || realContent.items?.length || 0} items
                  {isExample && (
                    <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-500 text-[10px] font-semibold">
                      Sample layout
                    </span>
                  )}
                </h3>
                <button
                  onClick={() => setFullscreen(false)}
                  aria-label="Close fullscreen preview"
                  className="text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="p-6 text-xs text-slate-500 leading-relaxed overflow-y-auto">
                {isExample && (
                  <p className="mb-4 text-[11px] font-medium text-amber-600">
                    Illustrative content only. Your generated version will use the course prompt and files from the
                    previous step.
                  </p>
                )}
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

function DeliverableConfigContent({
  featureId,
  config,
  onChange,
  columns,
  setColumns,
  delivData,
  courseMap,
  provider,
  apiKey,
}) {
  const set = (key, val) => onChange({ ...config, [key]: val });

  switch (featureId) {
    case 'courseMap':
      return (
        <div className="space-y-3">
          <DeliverablePreview featureId="courseMap" delivData={courseMap} courseMap={courseMap} columns={columns} />
          <p className="text-[11px] text-slate-500">
            Click to enable/disable, drag to reorder, double-click to rename.
          </p>
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
            onChange={(v) => set('sessionLength', v)}
            options={['50 min', '75 min', '90 min', '2 hr', '3 hr']}
            description="Adjusts all time estimates in the lesson outline."
          />
          <Select
            label="Detail level"
            value={config.detailLevel || 'Standard'}
            onChange={(v) => set('detailLevel', v)}
            options={['Brief', 'Standard', 'Detailed']}
          />
          {/* Advanced settings */}
          <AdvancedSection>
            <Toggle
              label="Include warm-up activity"
              value={config.includeWarmUp !== false}
              onChange={(v) => set('includeWarmUp', v)}
            />
            <Toggle
              label="Include UDL notes"
              value={config.includeUDL !== false}
              onChange={(v) => set('includeUDL', v)}
              description="Universal Design for Learning accessibility notes."
            />
            <Toggle
              label="Include homework section"
              value={config.includeHomework !== false}
              onChange={(v) => set('includeHomework', v)}
            />
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
            onChange={(v) => set('slidesPerLesson', v)}
            min={8}
            max={20}
            description="Includes title, agenda, objectives, content, and closing slides."
          />
          <Select
            label="Speaker notes"
            value={config.speakerNotes || 'Standard'}
            onChange={(v) => set('speakerNotes', v)}
            options={['Minimal', 'Standard', 'Full script']}
          />
          {/* Advanced */}
          <AdvancedSection>
            <Toggle
              label="Include activity slides"
              value={config.includeActivities !== false}
              onChange={(v) => set('includeActivities', v)}
              description="Think-Pair-Share, polls, discussions, etc."
            />
            {provider === 'openai' ? (
              <>
                <Toggle
                  label="Generate slide images with GPT Image"
                  value={config.generateAiImages === true}
                  onChange={(v) => set('generateAiImages', v)}
                  description="Uses your OpenAI key after slide outlines are ready. Applies when Slide Decks are generated or regenerated."
                />
                {config.generateAiImages === true && (
                  <>
                    <SlideImageModelSettings config={config} onChange={onChange} apiKey={apiKey} />
                    <NumberInput
                      label="Max images total"
                      value={config.aiImagesTotal || 2}
                      onChange={(v) => set('aiImagesTotal', v)}
                      min={1}
                      max={4}
                      description="Creates images for high-value image, diagram, and chart slide cues."
                    />
                  </>
                )}
              </>
            ) : (
              <p className="text-[10px] text-slate-400 leading-snug">
                GPT Image slide visuals are available when the model provider is OpenAI.
              </p>
            )}
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
            onChange={(v) => set('criteriaCount', v)}
            min={3}
            max={8}
            description="All criteria weights will sum to 100%."
          />
          <Select
            label="Performance levels"
            value={config.performanceLevels || '4 levels'}
            onChange={(v) => set('performanceLevels', v)}
            options={['3 levels', '4 levels']}
            description="3 levels: Developing / Proficient / Mastery."
          />
          {/* Advanced */}
          <AdvancedSection>
            <Toggle
              label="Include teacher notes"
              value={config.includeTeacherNotes !== false}
              onChange={(v) => set('includeTeacherNotes', v)}
              description="Calibration tips and student feedback guidance."
            />
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
            onChange={(v) => set('questionsPerLesson', v)}
            min={3}
            max={20}
          />
          <MultiToggle
            label="Question types"
            options={['Multiple choice', 'Short answer', 'Essay']}
            selected={[
              ...(config.includeMultipleChoice !== false ? ['Multiple choice'] : []),
              ...(config.includeShortAnswer !== false ? ['Short answer'] : []),
              ...(config.includeEssay !== false ? ['Essay'] : []),
            ]}
            onChange={(vals) => {
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
              onChange={(v) => set('difficultyDist', v)}
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
            onChange={(v) => set('formatPreference', v)}
            options={['Any', 'Socratic Seminar', 'Fishbowl', 'Debate', 'Case Study', 'Think-Pair-Share']}
          />
          {/* Advanced */}
          <AdvancedSection>
            <Toggle
              label="Include facilitation tips"
              value={config.includeFacilitation !== false}
              onChange={(v) => set('includeFacilitation', v)}
            />
            <Toggle
              label="Include equity considerations"
              value={config.includeEquity !== false}
              onChange={(v) => set('includeEquity', v)}
            />
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
            selected={
              config.assignmentTypes || [
                'Essay',
                'Research Paper',
                'Case Study',
                'Reflection',
                'Group Project',
                'Presentation',
              ]
            }
            onChange={(v) => set('assignmentTypes', v)}
            description="Only the selected types will be generated."
          />
          {/* Advanced */}
          <AdvancedSection>
            <Toggle
              label="Include scaffolding milestones"
              value={config.includeScaffolding !== false}
              onChange={(v) => set('includeScaffolding', v)}
              description="Draft checkpoints and submission stages."
            />
            <Toggle
              label="Include academic integrity statement"
              value={config.includeIntegrity !== false}
              onChange={(v) => set('includeIntegrity', v)}
            />
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
            onChange={(v) => set('keyTermsCount', v)}
            min={4}
            max={20}
            description="Each term includes a definition and example."
          />
          {/* Advanced */}
          <AdvancedSection>
            <Toggle
              label="Include common misconceptions"
              value={config.includeMisconceptions !== false}
              onChange={(v) => set('includeMisconceptions', v)}
            />
            <Toggle
              label="Include exam prep section"
              value={config.includeExamPrep !== false}
              onChange={(v) => set('includeExamPrep', v)}
            />
            <Toggle
              label="Include practice activities"
              value={config.includePractice !== false}
              onChange={(v) => set('includePractice', v)}
            />
            <DeliverableExtras featureId={featureId} config={config} onChange={onChange} />
          </AdvancedSection>
        </div>
      );

    case 'courseFaq':
      return (
        <div className="space-y-4">
          <DeliverablePreview featureId="courseFaq" delivData={delivData} />
          {/* Basic */}
          <NumberInput
            label="Questions per lesson"
            value={config.questionsPerLesson || 5}
            onChange={(v) => set('questionsPerLesson', v)}
            min={3}
            max={8}
            description="Keeps the FAQ useful without overwhelming students."
          />
          <MultiToggle
            label="Question categories"
            options={FAQ_CATEGORY_OPTIONS}
            selected={config.categories?.length > 0 ? config.categories : FAQ_CATEGORY_OPTIONS}
            onChange={(v) => set('categories', v.length > 0 ? v : FAQ_CATEGORY_OPTIONS)}
            description="Controls which student question types appear in the FAQ."
          />
          <Select
            label="Answer depth"
            value={config.answerDepth || 'Standard'}
            onChange={(v) => set('answerDepth', v)}
            options={['Quick answers', 'Standard', 'Detailed']}
            description="Sets how much explanation each answer includes."
          />
          {/* Advanced */}
          <AdvancedSection>
            <Toggle
              label="Include resource pointers"
              value={config.includeResourcePointers !== false}
              onChange={(v) => set('includeResourcePointers', v)}
              description="References readings, assignments, campus resources, or course tools when appropriate."
            />
            <Toggle
              label="Use first-person student questions"
              value={config.useFirstPersonQuestions !== false}
              onChange={(v) => set('useFirstPersonQuestions', v)}
              description='Writes questions like "How should I prepare?" instead of neutral headings.'
            />
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
            onChange={(v) => set('citationStyle', v)}
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
  lessonCount, // estimated from promptText + files before generation
  isDetectingLessons, // true while AI lesson-count detection is running
  deliverables, // generated deliverable data { featureId: { data, status } }
  onBack,
  onGenerate,
  canGenerate,
  provider,
}) {
  const { setShowHelp } = useUI();
  const { apiKey } = useAIConfig();
  const {
    selectedFeatures: selected,
    deliverableConfig,
    setDeliverableConfig,
    lessonScope,
    setLessonScope,
    courseMap,
    columns,
    setColumns,
  } = useCourse();
  const [expandedId, setExpandedId] = useState('courseMap');

  // Merge built-in + custom features for the config accordion
  const allFeatures = [...FEATURES, ...listCustomDeliverables().map(toFeatureEntry)];
  const configurableFeatures = allFeatures.filter((f) => selected.includes(f.id));

  const scopeDescription = (() => {
    if (lessonScope.type === 'all') {
      const total = courseMap?.lessons?.length || lessonCount || 0;
      return total ? `All ${total} lessons` : 'All lessons';
    }
    const indices = lessonScope.indices || [];
    if (indices.length === 0) return 'No lessons selected';
    if (indices.length === 1) return `Lesson ${indices[0] + 1} only`;
    return `Lessons ${indices.map((i) => i + 1).join(', ')}`;
  })();

  const scopeValid = lessonScope.type === 'all' || lessonScope.indices?.length > 0;

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
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
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
                <span className="w-4 h-4 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-[9px] font-bold">
                  3
                </span>
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
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-1">
                  Deliverable settings
                </p>
                {configurableFeatures.map((feature) => {
                  const config = deliverableConfig[feature.id] || {};
                  const c = COLOR_MAP[feature.color] || COLOR_MAP.indigo;
                  const isExpanded = expandedId === feature.id;

                  const delivData = deliverables?.[feature.id]?.data;
                  const panel = (
                    <DeliverableConfigContent
                      featureId={feature.id}
                      config={config}
                      onChange={(next) =>
                        setDeliverableConfig((prev) => ({
                          ...prev,
                          [feature.id]: typeof next === 'function' ? next(prev[feature.id] || {}) : next,
                        }))
                      }
                      columns={columns}
                      setColumns={setColumns}
                      delivData={delivData}
                      courseMap={courseMap}
                      provider={provider}
                      apiKey={apiKey}
                    />
                  );

                  return (
                    <div
                      key={feature.id}
                      className={`rounded-squircle-xs border overflow-hidden transition-all duration-200 ${
                        isExpanded ? `${c.activeBg} ${c.activeBorder}` : 'bg-white/40 border-slate-200/50'
                      }`}
                    >
                      {/* Accordion header */}
                      <button
                        onClick={() => setExpandedId(isExpanded ? null : feature.id)}
                        className="w-full flex items-center gap-3 px-4 py-3 text-left"
                        aria-expanded={isExpanded}
                        aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${feature.label} settings`}
                      >
                        <div
                          className={`w-7 h-7 rounded-lg ${c.iconBg} flex items-center justify-center flex-shrink-0`}
                        >
                          <svg
                            className={`w-3.5 h-3.5 ${c.iconText}`}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={feature.icon} />
                          </svg>
                        </div>
                        <span className="text-xs font-semibold text-slate-700 flex-1">{feature.label}</span>
                        <svg
                          className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>

                      {/* Config panel */}
                      {isExpanded && (
                        <div className="px-4 pb-4 pt-1 border-t border-slate-100/60 animate-spring-in">{panel}</div>
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
                className={`tactile btn-glow w-full py-4 rounded-squircle-xs font-semibold text-sm tracking-wide transition-all duration-300 ${
                  canGenerate && scopeValid
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
    </>
  );
}
