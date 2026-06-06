import React, { useState, useRef } from 'react';
import FocusTrap from 'focus-trap-react';
import { useAuth } from '../contexts/AuthContext';
import { useAIConfig } from '../contexts/AIConfigContext';
import { useUI } from '../contexts/UIContext';
import { useCourse } from '../contexts/CourseContext';
import {
  listCustomDeliverables,
  saveCustomDeliverable,
  deleteCustomDeliverable,
  toFeatureEntry,
  autoFillCustomDeliverable,
} from '../lib/customDeliverableLibrary';
import { FEATURES, COLOR_MAP } from '../lib/featureCatalog';

// ── Color choices for custom deliverables ────────────────────────────────────
const CUSTOM_COLOR_CHOICES = ['violet', 'indigo', 'sky', 'teal', 'emerald', 'amber', 'orange', 'rose', 'cyan'];

// ── Icon choices (SVG paths) for custom deliverables ─────────────────────────
const CUSTOM_ICON_CHOICES = [
  {
    label: 'Document',
    path: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
  },
  {
    label: 'Chart',
    path: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
  },
  {
    label: 'Light bulb',
    path: 'M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z',
  },
  {
    label: 'Users',
    path: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z',
  },
  {
    label: 'Clipboard',
    path: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2',
  },
  {
    label: 'Star',
    path: 'M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z',
  },
  {
    label: 'Puzzle',
    path: 'M11 4a2 2 0 114 0v1a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-1a2 2 0 100 4h1a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-1a2 2 0 10-4 0v1a1 1 0 01-1 1H7a1 1 0 01-1-1v-3a1 1 0 00-1-1H4a2 2 0 110-4h1a1 1 0 001-1V7a1 1 0 011-1h3a1 1 0 001-1V4z',
  },
  {
    label: 'Beaker',
    path: 'M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z',
  },
];

export { FEATURES, COLOR_MAP };

// ── Custom Deliverable Builder Modal ─────────────────────────────────────────

export function CustomDeliverableBuilder({ isOpen, onClose, onSave, editDef }) {
  const { provider, apiKey, modelId } = useAIConfig();
  const modelConfig = { provider, apiKey, modelId };
  const [name, setName] = useState(editDef?.name || '');
  const [description, setDescription] = useState(editDef?.description || '');
  const [color, setColor] = useState(editDef?.color || 'violet');
  const [iconIdx, setIconIdx] = useState(() => {
    if (editDef?.icon) {
      const idx = CUSTOM_ICON_CHOICES.findIndex((i) => i.path === editDef.icon);
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

  const hasModelConfig = modelConfig?.modelId && modelConfig.apiKey?.trim();

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
          const idx = CUSTOM_ICON_CHOICES.findIndex((i) => i.label === result.iconLabel);
          if (idx >= 0) setIconIdx(idx);
        }
        if (result.systemPrompt) setSystemPrompt(result.systemPrompt);
        if (result.userPromptTemplate) setUserPromptTemplate(result.userPromptTemplate);
      }
    } catch {
      /* noop */
    }
    setIsAutoFilling(false);
  }

  const TONE_OPTS = ['Academic', 'Professional', 'Conversational', 'Friendly', 'Formal', 'Encouraging'];
  const STYLE_OPTS = ['Bullet points', 'Paragraphs', 'Tables', 'Numbered lists', 'Mixed'];
  const LENGTH_OPTS = ['Brief', 'Standard', 'Detailed', 'Comprehensive'];

  return (
    <FocusTrap focusTrapOptions={{ clickOutsideDeactivates: true }}>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-md">
        <div className="bg-white rounded-2xl border border-slate-200/60 shadow-2xl max-w-lg w-full mx-4 animate-spring-scale max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="px-6 pt-5 pb-3 border-b border-slate-100/60">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-800">
                {editDef?.id ? 'Edit Custom Deliverable' : 'Create Custom Deliverable'}
              </h2>
              <button
                onClick={onClose}
                className="text-slate-400 hover:text-slate-600 transition-colors"
                aria-label="Close dialog"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            {/* Step tabs */}
            <div className="flex gap-2 mt-3">
              <button
                onClick={() => setStep(1)}
                className={`px-3 py-1 rounded-lg text-[11px] font-semibold transition-all ${
                  step === 1 ? 'bg-indigo-500 text-white' : 'text-slate-500 hover:bg-slate-100'
                }`}
              >
                1. Basics
              </button>
              <button
                onClick={() => setStep(2)}
                className={`px-3 py-1 rounded-lg text-[11px] font-semibold transition-all ${
                  step === 2 ? 'bg-indigo-500 text-white' : 'text-slate-500 hover:bg-slate-100'
                }`}
              >
                2. Prompt & Settings
              </button>
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
                            <circle
                              className="opacity-25"
                              cx="12"
                              cy="12"
                              r="10"
                              stroke="currentColor"
                              strokeWidth="4"
                            />
                            <path
                              className="opacity-75"
                              fill="currentColor"
                              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                            />
                          </svg>
                        ) : (
                          <svg
                            className="w-3.5 h-3.5"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={1.5}
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z"
                            />
                          </svg>
                        )}
                        {isAutoFilling ? 'Filling...' : 'AI Auto-fill'}
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Student Feedback Forms, Lab Reports, Weekly Reflections..."
                    className="w-full bg-white/60 border border-slate-200/60 rounded-lg px-3 py-2.5 text-sm text-slate-700 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-300 transition-all"
                    autoFocus
                  />
                </div>

                {/* Description */}
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Description</label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="What does this deliverable contain? What will the AI generate?"
                    rows={2}
                    className="w-full bg-white/60 border border-slate-200/60 rounded-lg px-3 py-2 text-sm text-slate-700 placeholder:text-slate-300 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-300 transition-all"
                  />
                </div>

                {/* Color */}
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1.5">Color</label>
                  <div className="flex flex-wrap gap-2">
                    {CUSTOM_COLOR_CHOICES.map((c) => {
                      const cm = COLOR_MAP[c];
                      return (
                        <button
                          key={c}
                          onClick={() => setColor(c)}
                          className={`w-8 h-8 rounded-lg ${cm.iconBg} border-2 transition-all ${
                            color === c
                              ? `${cm.activeBorder} ring-2 ${cm.ring} scale-110`
                              : 'border-transparent hover:scale-105'
                          }`}
                          title={c}
                          aria-label={`Select ${c} color`}
                          aria-pressed={color === c}
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
                        <button
                          key={i}
                          onClick={() => setIconIdx(i)}
                          className={`w-9 h-9 rounded-lg ${cm.iconBg} flex items-center justify-center border-2 transition-all ${
                            iconIdx === i
                              ? `${cm.activeBorder} ring-2 ${cm.ring} scale-110`
                              : 'border-transparent hover:scale-105'
                          }`}
                          title={ic.label}
                          aria-label={`Select ${ic.label} icon`}
                          aria-pressed={iconIdx === i}
                        >
                          <svg
                            className={`w-4 h-4 ${cm.iconText}`}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
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
                    {TONE_OPTS.map((opt) => (
                      <button
                        key={opt}
                        onClick={() => setTone(tone === opt ? '' : opt)}
                        className={`px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all ${
                          tone === opt
                            ? 'bg-indigo-500 text-white shadow-sm'
                            : 'bg-white/60 text-slate-600 border border-slate-200/60 hover:bg-white/90'
                        }`}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Style */}
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1.5">Default Style & Format</label>
                  <div className="flex flex-wrap gap-1.5">
                    {STYLE_OPTS.map((opt) => (
                      <button
                        key={opt}
                        onClick={() => setStyle(style === opt ? '' : opt)}
                        className={`px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all ${
                          style === opt
                            ? 'bg-indigo-500 text-white shadow-sm'
                            : 'bg-white/60 text-slate-600 border border-slate-200/60 hover:bg-white/90'
                        }`}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Length */}
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1.5">Default Output Length</label>
                  <div className="flex flex-wrap gap-1.5">
                    {LENGTH_OPTS.map((opt) => (
                      <button
                        key={opt}
                        onClick={() => setLength(length === opt ? '' : opt)}
                        className={`px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all ${
                          length === opt
                            ? 'bg-indigo-500 text-white shadow-sm'
                            : 'bg-white/60 text-slate-600 border border-slate-200/60 hover:bg-white/90'
                        }`}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                </div>

                {/* System Prompt */}
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    System Prompt <span className="font-normal text-slate-400">(optional)</span>
                  </label>
                  <textarea
                    value={systemPrompt}
                    onChange={(e) => setSystemPrompt(e.target.value)}
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
                    Use <code className="text-[9px] bg-slate-100 px-1 py-0.5 rounded">{'{{courseMap}}'}</code> where
                    course data should be inserted.
                  </p>
                  <textarea
                    value={userPromptTemplate}
                    onChange={(e) => setUserPromptTemplate(e.target.value)}
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
                <button
                  onClick={() => setStep((s) => s - 1)}
                  className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-500 hover:bg-slate-100 transition-all"
                >
                  Back
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-500 hover:bg-slate-100 transition-all"
              >
                Cancel
              </button>
              {step < 2 ? (
                <button
                  onClick={() => setStep((s) => s + 1)}
                  className="px-5 py-2 rounded-lg text-xs font-semibold text-white bg-indigo-500 hover:bg-indigo-600 shadow-sm transition-all"
                >
                  Next
                </button>
              ) : (
                <button
                  onClick={handleSave}
                  disabled={!canSave}
                  className={`px-5 py-2 rounded-lg text-xs font-semibold transition-all ${
                    canSave
                      ? 'text-white bg-indigo-500 hover:bg-indigo-600 shadow-sm'
                      : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                  }`}
                >
                  {editDef?.id ? 'Save Changes' : 'Create Deliverable'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </FocusTrap>
  );
}

export default function FeatureSelect({
  onNext,
  onBack,
  hasSyllabusFile,
  developerTemplates = [],
  activeDeveloperTemplateId = '',
  onApplyDeveloperTemplate,
}) {
  const { user } = useAuth();
  const { setShowHelp } = useUI();
  const { selectedFeatures: selected, setSelectedFeatures: setSelected } = useCourse();
  const [hoveredId, setHoveredId] = useState(null);
  const [showBuilder, setShowBuilder] = useState(false);
  const [editingCustom, setEditingCustom] = useState(null); // custom def being edited
  const [customDeliverables, setCustomDeliverables] = useState(() => listCustomDeliverables());

  // Merge built-in + custom features
  const customFeatures = customDeliverables.map(toFeatureEntry);

  const selectedCount = selected.length;
  const selectedMaterialCount = Math.max(0, selectedCount - 1);

  // Build ordered list:
  // - No syllabus file: syllabus appears right after courseMap (position 2)
  // - Has syllabus file: syllabus is hidden entirely
  const visibleFeatures = (() => {
    const base = hasSyllabusFile ? FEATURES.filter((f) => f.id !== 'syllabus') : FEATURES;
    return [...base, ...customFeatures];
  })();
  const baseFeature = visibleFeatures.find((feature) => feature.id === 'courseMap');
  const optionalFeatures = visibleFeatures.filter((feature) => feature.id !== 'courseMap');

  const allSelected = selectedCount === visibleFeatures.length;

  function toggle(id) {
    if (id === 'courseMap') return; // always required
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function selectAll() {
    setSelected(visibleFeatures.map((f) => f.id));
  }

  function deselectAll() {
    setSelected(['courseMap']);
  }

  function handleSaveCustom(def) {
    const saved = saveCustomDeliverable(def, user?.uid);
    setCustomDeliverables(listCustomDeliverables());
    // Auto-select the newly created deliverable
    if (!selected.includes(saved.id)) {
      setSelected((prev) => [...prev, saved.id]);
    }
    setShowBuilder(false);
    setEditingCustom(null);
  }

  function handleEditCustom(e, featureId) {
    e.stopPropagation();
    const customs = listCustomDeliverables();
    const def = customs.find((c) => c.id === featureId);
    if (def) {
      setEditingCustom(def);
      setShowBuilder(true);
    }
  }

  function handleDeleteCustom(e, featureId) {
    e.stopPropagation();
    deleteCustomDeliverable(featureId, user?.uid);
    setCustomDeliverables(listCustomDeliverables());
    setSelected((prev) => prev.filter((id) => id !== featureId));
  }

  return (
    <div className="landing-shell noise-overlay flex min-h-screen flex-col text-slate-900 dark:text-slate-100">
      {/* Header */}
      <header className="px-5 py-4 sm:px-8">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between">
          <button
            onClick={onBack}
            className="tactile flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-slate-500 transition-all duration-200 hover:bg-white/70 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-slate-100"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back
          </button>
          <button
            onClick={() => setShowHelp(true)}
            className="tactile flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-semibold text-slate-500 transition-colors hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-200"
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
        </div>
      </header>

      {/* Main */}
      <main className="flex flex-1 flex-col items-center px-5 py-6 pb-0 sm:px-8">
        <div className="w-full max-w-3xl animate-fade-up">
          {/* Title */}
          <div className="mb-6 text-center">
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.28em] text-blue-600 dark:text-blue-300">
              Workspace setup
            </p>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-950 dark:text-white sm:text-3xl">
              Choose materials
            </h1>
          </div>

          {developerTemplates.length > 0 && (
            <div className="mb-4 rounded-2xl border border-blue-200/70 bg-white/80 px-4 py-3 shadow-sm dark:border-blue-400/20 dark:bg-slate-950/70">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-400/10 dark:text-blue-200">
                      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M8 9l-3 3 3 3m8-6l3 3-3 3M13 5l-2 14"
                        />
                      </svg>
                    </span>
                    <div>
                      <p className="text-[12px] font-bold text-slate-800 dark:text-slate-100">Developer template</p>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400">Apply saved defaults.</p>
                    </div>
                  </div>
                </div>
                <select
                  value={activeDeveloperTemplateId}
                  onChange={(e) => onApplyDeveloperTemplate?.(e.target.value)}
                  className="min-w-[240px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-[12px] font-semibold text-slate-700 outline-none transition-colors focus:border-blue-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                >
                  <option value="">No template</option>
                  {developerTemplates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <section className="rounded-2xl border border-slate-200/80 bg-white/86 p-4 shadow-sm dark:border-slate-700/80 dark:bg-slate-950/70 sm:p-5">
            <div className="mb-4 flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800">
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-white">Package contents</h2>
                <p className="mt-0.5 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  Course Map + {selectedMaterialCount} material{selectedMaterialCount === 1 ? '' : 's'}.
                </p>
              </div>
              <button
                onClick={allSelected ? deselectAll : selectAll}
                className="w-fit rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] font-bold text-slate-600 transition-colors hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-blue-400/40 dark:hover:bg-blue-400/10 dark:hover:text-blue-200"
              >
                {allSelected ? 'Course Map only' : 'Select all'}
              </button>
            </div>

            {baseFeature && (
              <div className="rounded-xl border border-slate-950 bg-slate-950 px-4 py-3 text-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
                <div className="flex items-start gap-3">
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-white/10">
                    <svg className="h-4.5 w-4.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={baseFeature.icon} />
                    </svg>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold">{baseFeature.label}</h3>
                      <span className="rounded bg-white px-1.5 py-0.5 text-[9px] font-semibold text-slate-950">
                        Base workspace
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-1 text-[11px] leading-relaxed text-slate-300">
                      {baseFeature.description}
                    </p>
                  </div>
                  <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md border border-white/30 bg-white/15">
                    <svg className="h-3 w-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path
                        fillRule="evenodd"
                        d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </div>
                </div>
              </div>
            )}

            {/* Feature list */}
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {optionalFeatures.map((feature) => {
                const isSelected = selected.includes(feature.id);
                const isHovered = hoveredId === feature.id;
                const c = COLOR_MAP[feature.color];
                const isCustom = feature.isCustom;

                return (
                  <button
                    key={feature.id}
                    onClick={() => toggle(feature.id)}
                    onMouseEnter={() => setHoveredId(feature.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    className={`tactile group relative flex min-h-[82px] items-start gap-3 rounded-xl border p-3 text-left transition-all duration-200 ${
                      isSelected
                        ? 'border-slate-950 bg-white shadow-sm dark:border-slate-200 dark:bg-slate-900'
                        : 'border-slate-200 bg-white/65 hover:border-slate-300 hover:bg-white dark:border-slate-800 dark:bg-slate-900/65 dark:hover:border-slate-700'
                    }`}
                  >
                    {/* Checkbox / Lock */}
                    <div
                      className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md border transition-all duration-200 ${
                        isSelected
                          ? 'border-slate-900 bg-slate-900 dark:border-slate-100 dark:bg-slate-100'
                          : 'border-slate-200 bg-white/70 dark:border-slate-700 dark:bg-slate-950'
                      }`}
                    >
                      {isSelected ? (
                        <svg
                          className="h-3 w-3 text-white dark:text-slate-950"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : null}
                    </div>

                    {/* Custom deliverable edit/delete actions */}
                    {isCustom && (
                      <div className="absolute right-3 top-3 flex gap-1 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={(e) => handleEditCustom(e, feature.id)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') handleEditCustom(e, feature.id);
                          }}
                          className="flex h-5 w-5 cursor-pointer items-center justify-center rounded-md border border-slate-200/60 bg-white/80 text-slate-400 transition-colors hover:text-blue-500 dark:border-slate-700 dark:bg-slate-900"
                          title="Edit"
                          aria-label={`Edit ${feature.label}`}
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                            />
                          </svg>
                        </span>
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={(e) => handleDeleteCustom(e, feature.id)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') handleDeleteCustom(e, feature.id);
                          }}
                          className="flex h-5 w-5 cursor-pointer items-center justify-center rounded-md border border-slate-200/60 bg-white/80 text-slate-400 transition-colors hover:text-red-500 dark:border-slate-700 dark:bg-slate-900"
                          title="Delete"
                          aria-label={`Delete ${feature.label}`}
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                            />
                          </svg>
                        </span>
                      </div>
                    )}

                    {/* Icon */}
                    <div
                      className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ${c.iconBg} transition-transform duration-200 ${
                        isHovered ? 'scale-105' : ''
                      }`}
                    >
                      <svg
                        className={`w-4.5 h-4.5 ${c.iconText}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={feature.icon} />
                      </svg>
                    </div>

                    <div className="min-w-0 flex-1 pr-7">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{feature.label}</h3>
                        {isCustom && (
                          <span className="rounded bg-violet-50 px-1.5 py-0.5 text-[9px] font-semibold text-violet-600 dark:bg-violet-400/10 dark:text-violet-200">
                            Custom
                          </span>
                        )}
                      </div>
                      <p className="mt-1 line-clamp-1 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                        {feature.description}
                      </p>
                    </div>
                  </button>
                );
              })}

              {/* ── "+" Create Custom Deliverable card ── */}
              <button
                onClick={() => {
                  setEditingCustom(null);
                  setShowBuilder(true);
                }}
                onMouseEnter={() => setHoveredId('__create__')}
                onMouseLeave={() => setHoveredId(null)}
                className="tactile group relative flex min-h-[82px] items-center justify-center gap-3 rounded-xl border border-dashed border-slate-300/80 bg-white/45 p-4 text-left transition-all duration-200 hover:border-blue-300 hover:bg-white dark:border-slate-700 dark:bg-slate-900/45 dark:hover:border-blue-400/50"
              >
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 transition-transform duration-200 dark:bg-blue-400/10 ${
                    hoveredId === '__create__' ? 'scale-110' : ''
                  }`}
                >
                  <svg
                    className="w-5 h-5 text-blue-600 dark:text-blue-200"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-700 transition-colors group-hover:text-blue-600 dark:text-slate-200 dark:group-hover:text-blue-200">
                    Create custom
                  </h3>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                    Add one material type.
                  </p>
                </div>
              </button>
            </div>
          </section>

          {/* Next button */}
          <div
            data-testid="feature-select-sticky-action"
            className="mt-5 rounded-2xl border border-slate-200/80 bg-white p-3 text-center shadow-sm dark:border-slate-700 dark:bg-slate-950"
          >
            <button
              data-testid="feature-select-continue"
              onClick={onNext}
              disabled={selectedCount === 0}
              className={`tactile btn-glow w-full rounded-squircle-xs px-10 py-4 text-sm font-semibold tracking-wide transition-all duration-300 ${
                selectedCount > 0
                  ? 'text-white bg-slate-950 shadow-lg shadow-slate-950/12 hover:bg-slate-800'
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
              }`}
            >
              <span className="flex items-center justify-center gap-2.5">
                Continue
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
          <a href="#/changelog" className="font-medium hover:text-indigo-500 transition-colors duration-200">
            v0.8.56
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
      {/* Custom Deliverable Builder Modal */}
      <CustomDeliverableBuilder
        isOpen={showBuilder}
        onClose={() => {
          setShowBuilder(false);
          setEditingCustom(null);
        }}
        onSave={handleSaveCustom}
        editDef={editingCustom}
      />
    </div>
  );
}
