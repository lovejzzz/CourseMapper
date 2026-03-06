import React, { useState, useEffect, useRef } from 'react';

/**
 * ReadingLevelControl — Compact reading level selector.
 * Shows current detected level + lets user set a target level.
 * Target level is stored in localStorage and injected into agent context.
 */

const LEVELS = [
  { id: 'community-college', label: 'Community College', grade: '8-10', description: 'Simple, accessible language' },
  { id: 'undergraduate', label: 'Undergraduate', grade: '10-12', description: 'Standard academic register' },
  { id: 'upper-division', label: 'Upper Division', grade: '12-14', description: 'Advanced vocabulary, discipline-specific terms' },
  { id: 'graduate', label: 'Graduate', grade: '14-16', description: 'Scholarly, assumes domain knowledge' },
  { id: 'professional', label: 'Professional', grade: '16+', description: 'Expert-level, specialized terminology' },
];

const PREFS_KEY = 'coursemapper-agent-prefs';

function getStoredLevel() {
  try {
    const prefs = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}');
    return prefs.reading_level || null;
  } catch { return null; }
}

function setStoredLevel(level) {
  try {
    const prefs = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}');
    if (level) {
      prefs.reading_level = level;
    } else {
      delete prefs.reading_level;
    }
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch { /* silent */ }
}

export default function ReadingLevelControl({ currentGradeLevel }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(() => getStoredLevel());
  const menuRef = useRef(null);

  useEffect(() => {
    function handleClick(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setOpen(false);
    }
    function handleKeyDown(e) {
      if (e.key === 'Escape') setOpen(false);
    }
    if (open) {
      document.addEventListener('mousedown', handleClick);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const handleSelect = (levelId) => {
    const next = levelId === selected ? null : levelId;
    setSelected(next);
    setStoredLevel(next);
    setOpen(false);
  };

  const selectedLevel = LEVELS.find(l => l.id === selected);
  const gradeDisplay = currentGradeLevel != null ? Number(currentGradeLevel).toFixed(1) : null;

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen(v => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium
          bg-white/50 border border-slate-200/40 hover:bg-indigo-50/50 hover:border-indigo-200/50
          transition-all duration-200 shadow-sm"
        title="Set target reading level for AI-generated content"
      >
        <svg className="w-3 h-3 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
        <span className="text-slate-600">
          {selectedLevel ? selectedLevel.label : 'Reading Level'}
        </span>
        {gradeDisplay && (
          <span className={`px-1.5 py-0.5 rounded-md text-[9px] font-bold ${
            currentGradeLevel > 14 ? 'bg-amber-100 text-amber-700'
              : currentGradeLevel > 12 ? 'bg-yellow-100 text-yellow-700'
                : 'bg-emerald-100 text-emerald-700'
          }`}>
            {gradeDisplay}
          </span>
        )}
        <svg className={`w-2.5 h-2.5 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div role="listbox" aria-label="Reading level" className="absolute top-full left-0 mt-1.5 z-50 bg-white/95 backdrop-blur-xl rounded-xl border border-slate-200/60 shadow-xl py-1.5 min-w-[240px] animate-spring-in">
          <div className="px-3 py-1.5 border-b border-slate-100/80">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Target Reading Level</p>
            {gradeDisplay && (
              <p className="text-[10px] text-slate-400 mt-0.5">Current: grade {gradeDisplay}</p>
            )}
          </div>
          {LEVELS.map((level) => (
            <button
              key={level.id}
              role="option"
              aria-selected={selected === level.id}
              onClick={() => handleSelect(level.id)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors ${
                selected === level.id
                  ? 'bg-indigo-50/70 text-indigo-700'
                  : 'hover:bg-slate-50/80 text-slate-700'
              }`}
            >
              <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                selected === level.id ? 'border-indigo-500' : 'border-slate-300'
              }`}>
                {selected === level.id && (
                  <div className="w-2 h-2 rounded-full bg-indigo-500" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[12px] font-medium">{level.label}</p>
                <p className="text-[10px] text-slate-400">
                  Grade {level.grade} — {level.description}
                </p>
              </div>
            </button>
          ))}
          {selected && (
            <div className="border-t border-slate-100/80 px-3 py-1.5">
              <button
                onClick={() => handleSelect(selected)}
                className="text-[10px] text-slate-400 hover:text-red-500 transition-colors"
              >
                Clear target
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
