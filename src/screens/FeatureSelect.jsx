import React, { useState } from 'react';
import { HelpDrawer } from '../pages/FaqChatbot';

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

export default function FeatureSelect({ selected, setSelected, onNext, onBack, hasSyllabusFile }) {
  const [hoveredId, setHoveredId] = useState(null);
  const [showHelp, setShowHelp] = useState(false);

  const selectedCount = selected.length;

  // Build ordered list:
  // - No syllabus file: syllabus appears right after courseMap (position 2)
  // - Has syllabus file: syllabus is hidden entirely
  const visibleFeatures = (() => {
    if (hasSyllabusFile) {
      return FEATURES.filter(f => f.id !== 'syllabus');
    }
    // Syllabus already sits at index 1 in FEATURES_BASE (right after courseMap)
    return FEATURES;
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
                  </div>

                  {/* Description */}
                  <p className="text-[11px] leading-relaxed text-slate-500 pr-2">
                    {feature.description}
                  </p>
                </button>
              );
            })}
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
    </div>
  );
}
