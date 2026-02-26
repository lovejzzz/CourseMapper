import React, { useState, useRef } from 'react';
import { HelpDrawer } from '../pages/FaqChatbot';
import { useAuth } from '../contexts/AuthContext';
import { listCustomDeliverables, saveCustomDeliverable, deleteCustomDeliverable, toFeatureEntry, autoFillCustomDeliverable } from '../lib/customDeliverableLibrary';

// ── Color choices for custom deliverables ────────────────────────────────────
const CUSTOM_COLOR_CHOICES = ['violet', 'indigo', 'sky', 'teal', 'emerald', 'amber', 'orange', 'rose', 'cyan'];

// ── Icon choices (SVG paths) for custom deliverables ─────────────────────────
const CUSTOM_ICON_CHOICES = [
  { label: 'Document', path: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
  { label: 'Chart', path: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
  { label: 'Light bulb', path: 'M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z' },
  { label: 'Users', path: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z' },
  { label: 'Clipboard', path: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2' },
  { label: 'Star', path: 'M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z' },
  { label: 'Puzzle', path: 'M11 4a2 2 0 114 0v1a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-1a2 2 0 100 4h1a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-1a2 2 0 10-4 0v1a1 1 0 01-1 1H7a1 1 0 01-1-1v-3a1 1 0 00-1-1H4a2 2 0 110-4h1a1 1 0 001-1V7a1 1 0 011-1h3a1 1 0 001-1V4z' },
  { label: 'Beaker', path: 'M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z' },
];

// Teacher-priority order:
// No syllabus file → syllabus goes first (teacher needs it to share with students)
// Has syllabus file → syllabus goes last (already have one, treat as supplement)
const FEATURES_BASE = [
  {
    id: 'courseMap',
    label: 'Course Map',
    description: 'Complete week-by-week structure with learning goals, objectives, assessments, activities, and resources.',
    icon: 'M3 10h18M3 14h18M3 18h18M3 6h18',
    available: true,
    category: 'foundation',
    color: 'indigo',
  },
  {
    id: 'syllabus',
    label: 'Syllabus',
    description: 'Complete, professional course syllabus with policies, grading, schedule, and outcomes.',
    icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2zM15 2v5a1 1 0 001 1h5',
    available: true,
    category: 'foundation',
    color: 'cyan',
    syllabusFirst: true, // show first when no file, last when file exists
  },
  {
    id: 'lessonPlans',
    label: 'Lesson Plans',
    description: 'Detailed session-by-session plans with timing, warm-ups, activities, and instructor notes.',
    icon: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253',
    available: true,
    category: 'instruction',
    color: 'violet',
  },
  {
    id: 'slideDecks',
    label: 'Slide Decks',
    description: 'Ready-to-use presentation slides with key concepts, visual cues, and speaker notes.',
    icon: 'M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z',
    available: true,
    category: 'instruction',
    color: 'amber',
  },
  {
    id: 'assignments',
    label: 'Assignment Briefs',
    description: 'Clear assignment descriptions with objectives, deliverables, and submission guidelines.',
    icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
    available: true,
    category: 'assessment',
    color: 'orange',
  },
  {
    id: 'rubrics',
    label: 'Rubrics',
    description: 'Detailed grading rubrics with criteria, performance levels, and descriptors for every assessment.',
    icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4',
    available: true,
    category: 'assessment',
    color: 'emerald',
  },
  {
    id: 'discussions',
    label: 'Discussion Prompts',
    description: 'Engaging discussion prompts and response frameworks aligned to each lesson\'s objectives.',
    icon: 'M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z',
    available: true,
    category: 'engagement',
    color: 'rose',
  },
  {
    id: 'quizBank',
    label: 'Quiz & Exam Bank',
    description: 'Multiple choice, short answer, and essay questions organized by lesson and difficulty.',
    icon: 'M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
    available: true,
    category: 'assessment',
    color: 'sky',
  },
  {
    id: 'studyGuides',
    label: 'Study Guides',
    description: 'Student-facing review materials with key concepts, vocabulary, and exam prep tips.',
    icon: 'M12 14l9-5-9-5-9 5 9 5zm0 0l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14zm-4 6v-7.5l4-2.222',
    available: true,
    category: 'student',
    color: 'teal',
  },
  {
    id: 'courseFaq',
    label: 'Course FAQ',
    description: 'Student-facing FAQ with answers to common questions about logistics, concepts, and assessments.',
    icon: 'M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
    available: true,
    category: 'student',
    color: 'cyan',
  },
];

// Reorder: if no syllabus file, syllabus comes right after courseMap (index 1).
// If syllabus file exists, syllabus is hidden (filtered out in render).
// We export FEATURES as the base array; ordering is handled in the component.
const FEATURES = FEATURES_BASE;

const COLOR_MAP = {
  indigo:  { bg: 'bg-indigo-50/60',  border: 'border-indigo-200/50', activeBorder: 'border-indigo-400',  activeBg: 'bg-indigo-50/80',  iconBg: 'bg-indigo-100',  iconText: 'text-indigo-600',  badge: 'bg-indigo-100 text-indigo-700', ring: 'ring-indigo-400/30' },
  violet:  { bg: 'bg-violet-50/60',  border: 'border-violet-200/50', activeBorder: 'border-violet-400',  activeBg: 'bg-violet-50/80',  iconBg: 'bg-violet-100',  iconText: 'text-violet-600',  badge: 'bg-violet-100 text-violet-700', ring: 'ring-violet-400/30' },
  amber:   { bg: 'bg-amber-50/60',   border: 'border-amber-200/50',  activeBorder: 'border-amber-400',   activeBg: 'bg-amber-50/80',   iconBg: 'bg-amber-100',   iconText: 'text-amber-600',   badge: 'bg-amber-100 text-amber-700',  ring: 'ring-amber-400/30' },
  emerald: { bg: 'bg-emerald-50/60', border: 'border-emerald-200/50',activeBorder: 'border-emerald-400', activeBg: 'bg-emerald-50/80', iconBg: 'bg-emerald-100', iconText: 'text-emerald-600', badge: 'bg-emerald-100 text-emerald-700', ring: 'ring-emerald-400/30' },
  sky:     { bg: 'bg-sky-50/60',     border: 'border-sky-200/50',    activeBorder: 'border-sky-400',     activeBg: 'bg-sky-50/80',     iconBg: 'bg-sky-100',     iconText: 'text-sky-600',     badge: 'bg-sky-100 text-sky-700',      ring: 'ring-sky-400/30' },
  rose:    { bg: 'bg-rose-50/60',    border: 'border-rose-200/50',   activeBorder: 'border-rose-400',    activeBg: 'bg-rose-50/80',    iconBg: 'bg-rose-100',    iconText: 'text-rose-600',    badge: 'bg-rose-100 text-rose-700',    ring: 'ring-rose-400/30' },
  orange:  { bg: 'bg-orange-50/60',  border: 'border-orange-200/50', activeBorder: 'border-orange-400',  activeBg: 'bg-orange-50/80',  iconBg: 'bg-orange-100',  iconText: 'text-orange-600',  badge: 'bg-orange-100 text-orange-700', ring: 'ring-orange-400/30' },
  teal:    { bg: 'bg-teal-50/60',    border: 'border-teal-200/50',   activeBorder: 'border-teal-400',    activeBg: 'bg-teal-50/80',    iconBg: 'bg-teal-100',    iconText: 'text-teal-600',    badge: 'bg-teal-100 text-teal-700',    ring: 'ring-teal-400/30' },
  cyan:    { bg: 'bg-cyan-50/60',    border: 'border-cyan-200/50',   activeBorder: 'border-cyan-400',    activeBg: 'bg-cyan-50/80',    iconBg: 'bg-cyan-100',    iconText: 'text-cyan-600',    badge: 'bg-cyan-100 text-cyan-700',    ring: 'ring-cyan-400/30' },
};

export { FEATURES, COLOR_MAP };

// ── Custom Deliverable Builder Modal ─────────────────────────────────────────

export function CustomDeliverableBuilder({ isOpen, onClose, onSave, editDef, modelConfig }) {
  const [name, setName] = useState(editDef?.name || '');
  const [description, setDescription] = useState(editDef?.description || '');
  const [color, setColor] = useState(editDef?.color || 'violet');
  const [iconIdx, setIconIdx] = useState(() => {
    if (editDef?.icon) {
      const idx = CUSTOM_ICON_CHOICES.findIndex(i => i.path === editDef.icon);
      return idx >= 0 ? idx : 0;
    }
    return 0;
  });
  const [tone, setTone] = useState(editDef?.defaultConfig?.tone || '');
  const [style, setStyle] = useState(editDef?.defaultConfig?.style || '');
  const [length, setLength] = useState(editDef?.defaultConfig?.length || '');
  const [systemPrompt, setSystemPrompt] = useState(editDef?.systemPrompt || '');
  const [userPromptTemplate, setUserPromptTemplate] = useState(editDef?.userPromptTemplate || '');
  const [step, setStep] = useState(1); // 1: basics, 2: prompt & settings
  const [isAutoFilling, setIsAutoFilling] = useState(false);

  if (!isOpen) return null;

  const hasModelConfig = modelConfig?.modelId && (modelConfig.provider === 'free' || modelConfig.apiKey?.trim());

  const canSave = name.trim().length > 0;

  function handleSave() {
    if (!canSave) return;
    const def = {
      ...(editDef?.id ? { id: editDef.id } : {}),
      name: name.trim(),
      description: description.trim(),
      color,
      icon: CUSTOM_ICON_CHOICES[iconIdx]?.path || CUSTOM_ICON_CHOICES[0].path,
      systemPrompt: systemPrompt.trim() || undefined,
      userPromptTemplate: userPromptTemplate.trim() || undefined,
      defaultConfig: {
        tone: tone || null,
        style: style || null,
        length: length || null,
      },
    };
    onSave(def);
  }

  async function handleAutoFill() {
    if (!name.trim() || !hasModelConfig || isAutoFilling) return;
    setIsAutoFilling(true);
    try {
      const result = await autoFillCustomDeliverable(name, modelConfig);
      if (result) {
        if (result.description) setDescription(result.description);
        if (result.tone) setTone(result.tone);
        if (result.style) setStyle(result.style);
        if (result.length) setLength(result.length);
        if (result.color && CUSTOM_COLOR_CHOICES.includes(result.color)) setColor(result.color);
        if (result.iconLabel) {
          const idx = CUSTOM_ICON_CHOICES.findIndex(i => i.label === result.iconLabel);
          if (idx >= 0) setIconIdx(idx);
        }
        if (result.systemPrompt) setSystemPrompt(result.systemPrompt);
        if (result.userPromptTemplate) setUserPromptTemplate(result.userPromptTemplate);
      }
    } catch { /* noop */ }
    setIsAutoFilling(false);
  }

  const TONE_OPTS = ['Academic', 'Professional', 'Conversational', 'Friendly', 'Formal', 'Encouraging'];
  const STYLE_OPTS = ['Bullet points', 'Paragraphs', 'Tables', 'Numbered lists', 'Mixed'];
  const LENGTH_OPTS = ['Brief', 'Standard', 'Detailed', 'Comprehensive'];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-md">
      <div className="bg-white rounded-2xl border border-slate-200/60 shadow-2xl max-w-lg w-full mx-4 animate-spring-scale max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="px-6 pt-5 pb-3 border-b border-slate-100/60">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-800">
              {editDef?.id ? 'Edit Custom Deliverable' : 'Create Custom Deliverable'}
            </h2>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          {/* Step tabs */}
          <div className="flex gap-2 mt-3">
            <button onClick={() => setStep(1)}
              className={`px-3 py-1 rounded-lg text-[11px] font-semibold transition-all ${
                step === 1 ? 'bg-indigo-500 text-white' : 'text-slate-500 hover:bg-slate-100'
              }`}>1. Basics</button>
            <button onClick={() => setStep(2)}
              className={`px-3 py-1 rounded-lg text-[11px] font-semibold transition-all ${
                step === 2 ? 'bg-indigo-500 text-white' : 'text-slate-500 hover:bg-slate-100'
              }`}>2. Prompt & Settings</button>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5">
          {step === 1 && (
            <>
              {/* Name */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-slate-700">Name *</label>
                  {hasModelConfig && (
                    <button
                      onClick={handleAutoFill}
                      disabled={!name.trim() || isAutoFilling}
                      className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold transition-all ${
                        name.trim() && !isAutoFilling
                          ? 'text-violet-600 hover:bg-violet-50 hover:text-violet-700'
                          : 'text-slate-300 cursor-not-allowed'
                      }`}
                      title="AI auto-fill all fields from the name"
                    >
                      {isAutoFilling ? (
                        <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                      ) : (
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
                        </svg>
                      )}
                      {isAutoFilling ? 'Filling...' : 'AI Auto-fill'}
                    </button>
                  )}
                </div>
                <input
                  type="text" value={name} onChange={e => setName(e.target.value)}
                  placeholder="e.g. Student Feedback Forms, Lab Reports, Weekly Reflections..."
                  className="w-full bg-white/60 border border-slate-200/60 rounded-lg px-3 py-2.5 text-sm text-slate-700 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-300 transition-all"
                  autoFocus
                />
              </div>

              {/* Description */}
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">Description</label>
                <textarea
                  value={description} onChange={e => setDescription(e.target.value)}
                  placeholder="What does this deliverable contain? What will the AI generate?"
                  rows={2}
                  className="w-full bg-white/60 border border-slate-200/60 rounded-lg px-3 py-2 text-sm text-slate-700 placeholder:text-slate-300 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-300 transition-all"
                />
              </div>

              {/* Color */}
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1.5">Color</label>
                <div className="flex flex-wrap gap-2">
                  {CUSTOM_COLOR_CHOICES.map(c => {
                    const cm = COLOR_MAP[c];
                    return (
                      <button key={c} onClick={() => setColor(c)}
                        className={`w-8 h-8 rounded-lg ${cm.iconBg} border-2 transition-all ${
                          color === c ? `${cm.activeBorder} ring-2 ${cm.ring} scale-110` : 'border-transparent hover:scale-105'
                        }`}
                        title={c}
                      />
                    );
                  })}
                </div>
              </div>

              {/* Icon */}
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1.5">Icon</label>
                <div className="flex flex-wrap gap-2">
                  {CUSTOM_ICON_CHOICES.map((ic, i) => {
                    const cm = COLOR_MAP[color];
                    return (
                      <button key={i} onClick={() => setIconIdx(i)}
                        className={`w-9 h-9 rounded-lg ${cm.iconBg} flex items-center justify-center border-2 transition-all ${
                          iconIdx === i ? `${cm.activeBorder} ring-2 ${cm.ring} scale-110` : 'border-transparent hover:scale-105'
                        }`}
                        title={ic.label}
                      >
                        <svg className={`w-4 h-4 ${cm.iconText}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={ic.path} />
                        </svg>
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              {/* Tone */}
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1.5">Default Tone</label>
                <div className="flex flex-wrap gap-1.5">
                  {TONE_OPTS.map(opt => (
                    <button key={opt} onClick={() => setTone(tone === opt ? '' : opt)}
                      className={`px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all ${
                        tone === opt ? 'bg-indigo-500 text-white shadow-sm' : 'bg-white/60 text-slate-600 border border-slate-200/60 hover:bg-white/90'
                      }`}>{opt}</button>
                  ))}
                </div>
              </div>

              {/* Style */}
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1.5">Default Style & Format</label>
                <div className="flex flex-wrap gap-1.5">
                  {STYLE_OPTS.map(opt => (
                    <button key={opt} onClick={() => setStyle(style === opt ? '' : opt)}
                      className={`px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all ${
                        style === opt ? 'bg-indigo-500 text-white shadow-sm' : 'bg-white/60 text-slate-600 border border-slate-200/60 hover:bg-white/90'
                      }`}>{opt}</button>
                  ))}
                </div>
              </div>

              {/* Length */}
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1.5">Default Output Length</label>
                <div className="flex flex-wrap gap-1.5">
                  {LENGTH_OPTS.map(opt => (
                    <button key={opt} onClick={() => setLength(length === opt ? '' : opt)}
                      className={`px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all ${
                        length === opt ? 'bg-indigo-500 text-white shadow-sm' : 'bg-white/60 text-slate-600 border border-slate-200/60 hover:bg-white/90'
                      }`}>{opt}</button>
                  ))}
                </div>
              </div>

              {/* System Prompt */}
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  System Prompt <span className="font-normal text-slate-400">(optional)</span>
                </label>
                <textarea
                  value={systemPrompt} onChange={e => setSystemPrompt(e.target.value)}
                  placeholder="You are an expert instructional designer. Generate the requested deliverable..."
                  rows={3}
                  className="w-full bg-white/60 border border-slate-200/60 rounded-lg px-3 py-2 text-[11px] text-slate-700 placeholder:text-slate-300 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-300 transition-all font-mono"
                />
              </div>

              {/* User Prompt Template */}
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  User Prompt Template <span className="font-normal text-slate-400">(optional)</span>
                </label>
                <p className="text-[10px] text-slate-400 mb-1">
                  Use <code className="text-[9px] bg-slate-100 px-1 py-0.5 rounded">{'{{courseMap}}'}</code> where course data should be inserted.
                </p>
                <textarea
                  value={userPromptTemplate} onChange={e => setUserPromptTemplate(e.target.value)}
                  placeholder={`Generate [deliverable type] for this course:\n\n{{courseMap}}\n\nReturn ONLY valid JSON.`}
                  rows={5}
                  className="w-full bg-white/60 border border-slate-200/60 rounded-lg px-3 py-2 text-[11px] text-slate-700 placeholder:text-slate-300 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-300 transition-all font-mono"
                />
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100/60 flex items-center justify-between">
          <div className="flex gap-2">
            {step > 1 && (
              <button onClick={() => setStep(s => s - 1)}
                className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-500 hover:bg-slate-100 transition-all"
              >Back</button>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={onClose}
              className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-500 hover:bg-slate-100 transition-all"
            >Cancel</button>
            {step < 2 ? (
              <button onClick={() => setStep(s => s + 1)}
                className="px-5 py-2 rounded-lg text-xs font-semibold text-white bg-indigo-500 hover:bg-indigo-600 shadow-sm transition-all"
              >Next</button>
            ) : (
              <button onClick={handleSave} disabled={!canSave}
                className={`px-5 py-2 rounded-lg text-xs font-semibold transition-all ${
                  canSave ? 'text-white bg-indigo-500 hover:bg-indigo-600 shadow-sm' : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                }`}
              >{editDef?.id ? 'Save Changes' : 'Create Deliverable'}</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function FeatureSelect({ selected, setSelected, onNext, onBack, hasSyllabusFile, modelConfig }) {
  const { user } = useAuth();
  const [hoveredId, setHoveredId] = useState(null);
  const [showHelp, setShowHelp] = useState(false);
  const [showBuilder, setShowBuilder] = useState(false);
  const [editingCustom, setEditingCustom] = useState(null); // custom def being edited
  const [customDeliverables, setCustomDeliverables] = useState(() => listCustomDeliverables());

  // Merge built-in + custom features
  const customFeatures = customDeliverables.map(toFeatureEntry);

  const selectedCount = selected.length;

  // Build ordered list:
  // - No syllabus file: syllabus appears right after courseMap (position 2)
  // - Has syllabus file: syllabus is hidden entirely
  const visibleFeatures = (() => {
    const base = hasSyllabusFile ? FEATURES.filter(f => f.id !== 'syllabus') : FEATURES;
    return [...base, ...customFeatures];
  })();

  const allSelected = selectedCount === visibleFeatures.length;

  function toggle(id) {
    if (id === 'courseMap') return; // always required
    setSelected(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  }

  function selectAll() {
    setSelected(visibleFeatures.map(f => f.id));
  }

  function deselectAll() {
    setSelected(['courseMap']);
  }

  function handleSaveCustom(def) {
    const saved = saveCustomDeliverable(def, user?.uid);
    setCustomDeliverables(listCustomDeliverables());
    // Auto-select the newly created deliverable
    if (!selected.includes(saved.id)) {
      setSelected(prev => [...prev, saved.id]);
    }
    setShowBuilder(false);
    setEditingCustom(null);
  }

  function handleEditCustom(e, featureId) {
    e.stopPropagation();
    const customs = listCustomDeliverables();
    const def = customs.find(c => c.id === featureId);
    if (def) {
      setEditingCustom(def);
      setShowBuilder(true);
    }
  }

  function handleDeleteCustom(e, featureId) {
    e.stopPropagation();
    deleteCustomDeliverable(featureId, user?.uid);
    setCustomDeliverables(listCustomDeliverables());
    setSelected(prev => prev.filter(id => id !== featureId));
  }

  return (
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
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Help
        </button>
      </header>

      {/* Main */}
      <main className="flex-1 flex flex-col items-center px-6 py-6">
        <div className="max-w-4xl w-full animate-fade-up">

          {/* Title */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/50 border border-slate-200/40 text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-4">
              <span className="w-4 h-4 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-[9px] font-bold">2</span>
              Choose deliverables
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-800 tracking-tight">
              What do you need?
            </h1>
            <p className="text-sm text-slate-500 mt-2">
              Pick what to generate. The more you choose, the more aligned everything will be.
            </p>
          </div>

          {/* Select All / Deselect All */}
          <div className="flex items-center gap-2 mb-4">
            <button
              onClick={allSelected ? deselectAll : selectAll}
              className="text-[11px] font-semibold text-indigo-500 hover:text-indigo-700 transition-colors"
            >
              {allSelected ? 'Deselect all' : 'Select all'}
            </button>
            <span className="text-[10px] text-slate-300">·</span>
            <span className="text-[11px] font-medium text-slate-400">
              {selectedCount} selected
            </span>
          </div>

          {/* Feature grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {visibleFeatures.map((feature) => {
              const isSelected = selected.includes(feature.id);
              const isHovered = hoveredId === feature.id;
              const c = COLOR_MAP[feature.color];
              const isLocked = feature.id === 'courseMap';
              const isCustom = feature.isCustom;

              return (
                <button
                  key={feature.id}
                  onClick={() => toggle(feature.id)}
                  onMouseEnter={() => setHoveredId(feature.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  className={`tactile group relative text-left rounded-squircle-sm p-4 border-2 transition-all duration-200 ${
                    isLocked ? 'cursor-default' : ''
                  } ${
                    isSelected
                      ? `${c.activeBg} ${c.activeBorder} shadow-md ring-2 ${c.ring}`
                      : `bg-white/40 ${c.border} hover:bg-white/60 hover:shadow-sm`
                  }`}
                >
                  {/* Checkbox / Lock */}
                  <div className={`absolute top-3 right-3 w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all duration-200 ${
                    isLocked
                      ? `${c.iconBg} ${c.activeBorder}`
                      : isSelected
                        ? `${c.iconBg} ${c.activeBorder}`
                        : 'border-slate-200 bg-white/60'
                  }`}>
                    {isLocked ? (
                      <svg className={`w-3 h-3 ${c.iconText}`} fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                      </svg>
                    ) : isSelected ? (
                      <svg className={`w-3 h-3 ${c.iconText}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : null}
                  </div>

                  {/* Custom deliverable edit/delete actions */}
                  {isCustom && (
                    <div className="absolute bottom-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                      <span
                        onClick={(e) => handleEditCustom(e, feature.id)}
                        className="w-5 h-5 rounded-md bg-white/80 border border-slate-200/60 flex items-center justify-center text-slate-400 hover:text-indigo-500 cursor-pointer transition-colors"
                        title="Edit"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </span>
                      <span
                        onClick={(e) => handleDeleteCustom(e, feature.id)}
                        className="w-5 h-5 rounded-md bg-white/80 border border-slate-200/60 flex items-center justify-center text-slate-400 hover:text-red-500 cursor-pointer transition-colors"
                        title="Delete"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </span>
                    </div>
                  )}

                  {/* Icon */}
                  <div className={`w-9 h-9 rounded-xl ${c.iconBg} flex items-center justify-center mb-3 transition-transform duration-200 ${isHovered ? 'scale-110' : ''}`}>
                    <svg className={`w-4.5 h-4.5 ${c.iconText}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={feature.icon} />
                    </svg>
                  </div>

                  {/* Title */}
                  <div className="flex items-center gap-2 mb-1.5 pr-6">
                    <h3 className="text-sm font-semibold text-slate-800">{feature.label}</h3>
                    {isLocked && (
                      <span className="text-[9px] font-semibold text-indigo-500 bg-indigo-100/80 px-1.5 py-0.5 rounded">Always included</span>
                    )}
                    {isCustom && (
                      <span className="text-[9px] font-semibold text-violet-500 bg-violet-100/80 px-1.5 py-0.5 rounded">Custom</span>
                    )}
                  </div>

                  {/* Description */}
                  <p className="text-[11px] leading-relaxed text-slate-500 pr-2">
                    {feature.description}
                  </p>
                </button>
              );
            })}

            {/* ── "+" Create Custom Deliverable card ── */}
            <button
              onClick={() => { setEditingCustom(null); setShowBuilder(true); }}
              onMouseEnter={() => setHoveredId('__create__')}
              onMouseLeave={() => setHoveredId(null)}
              className="tactile group relative text-left rounded-squircle-sm p-4 border-2 border-dashed border-slate-300/60 hover:border-indigo-400 hover:bg-indigo-50/30 transition-all duration-200 flex flex-col items-center justify-center min-h-[140px]"
            >
              <div className={`w-10 h-10 rounded-xl bg-indigo-100/60 flex items-center justify-center mb-3 transition-transform duration-200 ${
                hoveredId === '__create__' ? 'scale-110' : ''
              }`}>
                <svg className="w-5 h-5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </div>
              <h3 className="text-sm font-semibold text-slate-600 group-hover:text-indigo-600 transition-colors">Create Custom</h3>
              <p className="text-[11px] leading-relaxed text-slate-400 text-center mt-1">
                Build your own deliverable from scratch
              </p>
            </button>
          </div>

          {/* Next button */}
          <div className="mt-8 text-center">
            <button
              onClick={onNext}
              disabled={selectedCount === 0}
              className={`tactile btn-glow px-10 py-4 rounded-squircle-xs font-semibold text-sm tracking-wide transition-all duration-300 ${
                selectedCount > 0
                  ? 'text-white bg-gradient-to-r from-indigo-500 via-violet-500 to-purple-600 shadow-lg shadow-indigo-500/25 hover:shadow-glow-violet hover:brightness-[1.06]'
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
              }`}
            >
              <span className="flex items-center justify-center gap-2.5">
                Configure & Generate
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </span>
            </button>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-4 text-center">
        <div className="flex items-center justify-center gap-3 text-[10px] text-slate-300/70">
          <a href="#/changelog" className="font-medium hover:text-indigo-500 transition-colors duration-200">v0.3</a>
          <span>·</span>
          <a href="#/privacy" className="hover:text-indigo-500 transition-colors duration-200">Privacy</a>
          <span>·</span>
          <a href="#/terms" className="hover:text-indigo-500 transition-colors duration-200">Terms</a>
        </div>
      </footer>

      {/* Help Drawer */}
      <HelpDrawer isOpen={showHelp} onClose={() => setShowHelp(false)} />

      {/* Custom Deliverable Builder Modal */}
      <CustomDeliverableBuilder
        isOpen={showBuilder}
        onClose={() => { setShowBuilder(false); setEditingCustom(null); }}
        onSave={handleSaveCustom}
        editDef={editingCustom}
        modelConfig={modelConfig}
      />
    </div>
  );
}
