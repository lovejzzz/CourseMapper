import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { buildLessonGroupMap, GROUP_COLORS } from '../lib/moduleGrouper';
import { deriveCourseGraphFromCourseMap } from '../lib/courseGraph/deriveFromCourseMap.js';
import { preferredScrollBehavior } from '../lib/motionPreference';

// Flatten a cell value to a plain string (handles arrays from AI responses)
function toStr(val) {
  if (val == null) return '';
  if (Array.isArray(val)) return val.map((v) => String(v)).join('\n');
  return String(val);
}

const SECTION_KEYS = [
  'learningGoals',
  'topicSection',
  'learningObjectives',
  'weeklyAssessments',
  'asyncActivities',
  'syncActivities',
  'technologyNeeded',
  'presentationFormat',
  'supportingResources',
  'evaluateDesign',
];

// Split text into list items — handles both newline-separated and inline numbered/bulleted items
function splitIntoItems(text) {
  // First split by newlines
  let lines = text.split('\n').filter((l) => l.trim());

  // If only one line, try splitting inline numbered/bulleted items
  // e.g. "1. First item 2. Second item" or "- First - Second"
  if (lines.length === 1) {
    const inlineSplit = text
      .split(/(?=(?:^|\s)(?:\d+[a-z]?[.):]|[-•*])\s)/g)
      .map((s) => s.trim())
      .filter(Boolean);
    if (inlineSplit.length > 1) lines = inlineSplit;
  }

  return lines;
}

const LIST_PREFIX = /^(?:[-•*]|\d+[a-z]?[.):])\s/;

function courseMapCellKey({ lessonIndex, sectionIndex, field }) {
  return `${lessonIndex ?? ''}:${sectionIndex ?? 'lesson'}:${field || ''}`;
}

// ── v0.14.4 WS-A: presentation helpers ──────────────────────────────────────

// View preferences (density, per-course lesson collapse) live OUTSIDE the
// project object — they are how this user looks at the table, not course data.
const MAP_VIEW_STORAGE_KEY = 'coursemapper-map-view';

function readMapViewState() {
  try {
    const raw = window.localStorage.getItem(MAP_VIEW_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeMapViewState(patch) {
  try {
    window.localStorage.setItem(MAP_VIEW_STORAGE_KEY, JSON.stringify({ ...readMapViewState(), ...patch }));
  } catch {
    // Storage unavailable (private mode, quota) — view prefs just don't persist.
  }
}

// Render-only sentence casing for the header labels. The label STRINGS are
// reused by exporters and the column editor, so the data stays untouched —
// only this surface lowers the volume. Short all-caps tokens (AI, QM, NGSS)
// survive as acronyms.
export function toSentenceCase(label) {
  const text = String(label || '').trim();
  if (!text) return text;
  const sentence = text
    .split(/\s+/)
    .map((word) => (/^[A-Z0-9]{2,4}$/.test(word) ? word : word.toLowerCase()))
    .join(' ');
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}

// Classify the Evaluate Design cell TEXT (deriveEvaluateDesign prose arrives
// in the courseMap data) into a verdict for the leading status icon. Pure
// presentation parsing — arbitrary text degrades to 'unknown' (no icon), and
// legacy boolean values stay out of this path entirely.
export function classifyEvaluateDesign(value) {
  if (value === true || value === false || value === 'true' || value === 'false') return 'boolean';
  const text = toStr(value).trim();
  if (!text) return 'empty';
  if (/^each objective verb/i.test(text) || /\bno issues\b/i.test(text) || /\bintact\b/i.test(text)) return 'clean';
  if (
    /objective\s+'/i.test(text) ||
    /^no (?:learning objectives|assessments?)\b/i.test(text) ||
    /cannot be confirmed/i.test(text) ||
    /not measured/i.test(text) ||
    /no matching assessment/i.test(text) ||
    /no supporting activity/i.test(text)
  ) {
    return 'finding';
  }
  return 'unknown';
}

// Evaluate Design cell body: lint-clean prose recedes (small check + quiet
// 12px slate), findings keep normal weight behind a small amber dot.
// v0.14.6: multi-sentence finding verdicts (a course-level row can carry a
// dozen objective checks) clamp to their first sentence behind a count —
// the full wall blew the row open and made the table read as broken.
function EvaluateDesignCell({ text }) {
  const [showAllFindings, setShowAllFindings] = useState(false);
  const verdict = classifyEvaluateDesign(text);
  if (verdict === 'clean') {
    return (
      <div className="flex items-start gap-1.5" data-evaluate-verdict="clean">
        <svg
          className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400 flex-shrink-0 mt-[2px]"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
        <span className="text-[12px] leading-[1.55] text-slate-500 dark:text-slate-400">{text}</span>
      </div>
    );
  }
  if (verdict === 'finding') {
    const full = toStr(text).trim();
    const sentences = full
      .split(/\.\s+/)
      .filter(Boolean)
      .map((sentence) => (sentence.endsWith('.') ? sentence : `${sentence}.`));
    const isLong = sentences.length > 1 && full.length > 220;
    return (
      <div className="flex items-start gap-1.5" data-evaluate-verdict="finding">
        <span
          className="w-2 h-2 rounded-full bg-amber-400 dark:bg-amber-500 flex-shrink-0 mt-[5px]"
          aria-hidden="true"
        />
        <span className="min-w-0">
          {isLong && !showAllFindings ? sentences[0] : full}
          {isLong && (
            <button
              type="button"
              data-testid="evaluate-design-toggle"
              onClick={() => setShowAllFindings((value) => !value)}
              className="tactile ml-1.5 text-[12px] font-semibold text-indigo-600 hover:text-indigo-800 hover:underline decoration-indigo-300 underline-offset-2 dark:text-indigo-300 dark:hover:text-indigo-200"
            >
              {showAllFindings ? 'Show less' : `Show all ${sentences.length} checks`}
            </button>
          )}
        </span>
      </div>
    );
  }
  return <span data-evaluate-verdict="unknown">{text}</span>;
}

// A1: column width hierarchy — objectives carry the most reading, so they get
// the widest track; goals/topic narrow; everything else shares evenly. The
// fixed slim first column holds the "N.M" section labels (the lesson identity
// moved up into the band rows).
const COLUMN_WEIGHTS = {
  learningObjectives: 1.4,
  learningGoals: 0.8,
  topicSection: 0.8,
};

// ── v0.14.1 (3.5): assessment chips — the map cell indexes the deliverables ──
// Each Weekly Assessments line that maps to a registry entry with a downstream
// artifact becomes a clickable chip dispatching 'coursemapper:focus-deliverable'
// (the symmetric flow of the 'coursemapper:focus-coursemap-cell' listener
// below): exam → Quiz & Exam Bank, graded/oral → Assignment Briefs. In-class
// entries live inside the session, so their lines render plain.
const ASSESSMENT_FEATURE_BY_KIND = {
  exam: 'quizBank',
  oral: 'assignments',
  'graded-artifact': 'assignments',
};

function canonicalAssessmentLineText(line) {
  // "2. Map Activity: x → Assignment Briefs / Lesson 07" → "Map Activity: x"
  return line
    .trim()
    .replace(LIST_PREFIX, '')
    .split(/\s+→\s+/)[0]
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Match a cell line to its registry entry: by position first (the registry
 * splits the same cell into the same atoms), falling back to an exact title
 * match when manual edits reordered lines. Exported for tests.
 */
export function resolveAssessmentChip(line, lineIndex, entries) {
  if (!entries || entries.length === 0) return null;
  const text = canonicalAssessmentLineText(line);
  let entry = entries[lineIndex];
  if (!entry || (text && entry.title.toLowerCase() !== text.toLowerCase())) {
    entry = entries.find((candidate) => candidate.title.toLowerCase() === text.toLowerCase()) || entry;
  }
  if (!entry) return null;
  const featureId = ASSESSMENT_FEATURE_BY_KIND[entry.kind];
  if (!featureId) return null;
  return {
    featureId,
    lessonNumber: entry.dueSession,
    assessmentId: entry.id,
    title: entry.title,
  };
}

// Weekly Assessments cell body: linkable lines render as chips, the rest as
// plain lines. Lives inside EditableCell's display span — chip clicks stop
// propagation so the cell does not enter edit mode.
function AssessmentCellContent({ text, entries }) {
  const lines = splitIntoItems(text || '');
  if (lines.length === 0) return null;

  const dispatchChip = (chip) => {
    window.dispatchEvent(new CustomEvent('coursemapper:focus-deliverable', { detail: chip }));
  };

  return (
    <div className="space-y-1.5">
      {lines.map((line, i) => {
        const trimmed = line.trim();
        const prefix = trimmed.match(/^(?:[-•*]|\d+[a-z]?[.):])/)?.[0] || '';
        const cleaned = prefix ? trimmed.replace(LIST_PREFIX, '') : trimmed;
        const chip = resolveAssessmentChip(line, i, entries);
        return (
          <div key={i} className="flex gap-1.5 leading-relaxed items-start">
            {prefix && (
              <span className="bg-slate-100 text-slate-500 dark:bg-slate-700/60 dark:text-slate-400 text-[10px] font-medium px-1 rounded flex-shrink-0 mt-[2px]">
                {prefix}
              </span>
            )}
            {chip ? (
              // v0.14.4: quiet link, not a bubble — the table stays a table and
              // interactivity surfaces on hover (underline + arrow). Indigo is
              // reserved for interactive text; the linked title reads inline
              // with the numbered list instead of breaking its rhythm.
              <button
                type="button"
                data-assessment-chip="true"
                data-assessment-id={chip.assessmentId}
                data-feature-id={chip.featureId}
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  dispatchChip(chip);
                }}
                onKeyDown={(e) => {
                  // Keep Enter/Space on the link from bubbling into the
                  // cell's click-to-edit handler.
                  if (e.key === 'Enter' || e.key === ' ') e.stopPropagation();
                }}
                className="group inline text-left font-medium text-indigo-600 hover:text-indigo-800 hover:underline decoration-indigo-300 underline-offset-2 transition-colors duration-150"
                title={`Open in ${chip.featureId === 'quizBank' ? 'Quiz & Exam Bank' : 'Assignment Briefs'}`}
                aria-label={`Open "${chip.title}" in ${chip.featureId === 'quizBank' ? 'Quiz & Exam Bank' : 'Assignment Briefs'}`}
              >
                <span>{cleaned}</span>
                <svg
                  className="inline-block w-3 h-3 ml-0.5 -mt-[2px] opacity-0 group-hover:opacity-100 transition-opacity duration-150"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 17L17 7M9 7h8v8" />
                </svg>
              </button>
            ) : (
              <span>{cleaned}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Format cell text: split by newlines, detect bullets/numbers, render structured
function FormattedText({ text }) {
  if (!text) return null;
  const lines = splitIntoItems(text);
  if (lines.length <= 1) return <span>{text}</span>;

  // Check if lines look like a list (start with -, •, *, or number/letter prefix)
  const isList = lines.every((l) => LIST_PREFIX.test(l.trim()));

  if (isList) {
    return (
      <ul className="space-y-1.5 list-none">
        {lines.map((line, i) => {
          const cleaned = line.trim().replace(LIST_PREFIX, '');
          const prefix = line.trim().match(/^(?:[-•*]|\d+[a-z]?[.):])/)?.[0] || '•';
          return (
            <li key={i} className="flex gap-1.5 leading-relaxed">
              <span className="bg-slate-100 text-slate-500 dark:bg-slate-700/60 dark:text-slate-400 text-[10px] font-medium px-1 rounded flex-shrink-0 mt-[2px]">
                {prefix}
              </span>
              <span>{cleaned}</span>
            </li>
          );
        })}
      </ul>
    );
  }

  // Not a list — just render with line breaks and spacing
  return (
    <div className="space-y-1.5">
      {lines.map((line, i) => (
        <p key={i} className="leading-relaxed">
          {line}
        </p>
      ))}
    </div>
  );
}

export default function CourseMapPreview({
  courseMap,
  columns,
  isStreaming,
  oldCourseMap,
  onCellEdit,
  onTitleEdit,
  onCheckToggle,
  onAddSection,
  onDeleteSection,
  onAddLesson,
  onDeleteLesson,
  onMoveLesson,
  showDiff,
  onToggleDiff,
  onDismissDiff,
  lockedLessons,
  onToggleLock,
  moduleGroups,
  onModuleGroupsChange,
  onAIContextMenu,
  onCellHover,
}) {
  const tableRef = useRef(null);
  const wrapperRef = useRef(null);
  const mouseInsideRef = useRef(false);
  const mouseLeaveTimerRef = useRef(null);
  const autoScrollPausedRef = useRef(false);
  const revisionScrolledRef = useRef(false);
  const [focusedCellKey, setFocusedCellKey] = useState(null);

  // ── Column resizing ──
  const [colWidths, setColWidths] = useState({});
  const resizingRef = useRef(null);

  // ── v0.14.4 A4: density + per-lesson collapse (view state, never project) ──
  const [density, setDensity] = useState(() => (readMapViewState().density === 'compact' ? 'compact' : 'comfortable'));
  const [collapsedLessons, setCollapsedLessons] = useState(() => new Set());
  const courseKey = courseMap?.courseName || '';

  // Collapse state is keyed by courseName: switching courses starts expanded,
  // returning to the same course restores the saved set.
  useEffect(() => {
    const saved = readMapViewState().collapse;
    if (saved && saved.courseName === courseKey && Array.isArray(saved.lessons)) {
      setCollapsedLessons(new Set(saved.lessons.filter((index) => Number.isInteger(index))));
    } else {
      setCollapsedLessons(new Set());
    }
  }, [courseKey]);

  const setDensityMode = (mode) => {
    setDensity(mode);
    writeMapViewState({ density: mode });
  };

  const toggleLessonCollapse = (lessonIndex) => {
    const next = new Set(collapsedLessons);
    if (next.has(lessonIndex)) next.delete(lessonIndex);
    else next.add(lessonIndex);
    setCollapsedLessons(next);
    writeMapViewState({ collapse: { courseName: courseKey, lessons: [...next].sort((a, b) => a - b) } });
  };

  const compact = density === 'compact';
  // A3/A4 type rhythm: 13px/1.55 comfortable, 12px compact with tighter rows.
  const cellPad = compact ? 'px-3 py-1.5' : 'px-3.5 py-2.5';
  const cellText = compact ? 'text-[12px] leading-[1.5]' : 'text-[13px] leading-[1.55]';

  // ── Feature 5.3: Module Groups ──
  // Track which modules are collapsed (by group id)
  const [collapsedModules, setCollapsedModules] = useState(new Set());

  // Build a map: lessonIndex → group
  const lessonGroupMap = useMemo(() => buildLessonGroupMap(moduleGroups), [moduleGroups]);

  // ── v0.14.1 (3.5): assessment registry for the cell chips ──
  // Derived from the rendered map itself (the same deterministic path the
  // package exporter's manifest uses), so chips stay in lockstep with manual
  // cell edits even when App-level courseGraph state lags a re-derivation.
  const assessmentRegistry = useMemo(() => {
    if (isStreaming || !courseMap?.lessons?.length) return null;
    try {
      return deriveCourseGraphFromCourseMap(courseMap);
    } catch {
      return null;
    }
  }, [courseMap, isStreaming]);
  const assessmentsById = useMemo(
    () => new Map((assessmentRegistry?.assessments || []).map((assessment) => [assessment.id, assessment])),
    [assessmentRegistry],
  );

  // Build a set of lesson indices that are the FIRST in their group (= header position)
  const groupFirstLessonMap = useMemo(() => {
    const result = {}; // groupId → first lesson index (sorted)
    (moduleGroups || []).forEach((group) => {
      const sorted = [...(group.lessonIndices || [])].sort((a, b) => a - b);
      if (sorted.length > 0) result[group.id] = sorted[0];
    });
    return result;
  }, [moduleGroups]);

  // Which lesson indices are hidden due to their module being collapsed
  const hiddenLessons = useMemo(() => {
    const hidden = new Set();
    (moduleGroups || []).forEach((group) => {
      if (collapsedModules.has(group.id)) {
        group.lessonIndices.forEach((li) => hidden.add(li));
      }
    });
    return hidden;
  }, [moduleGroups, collapsedModules]);

  const toggleModule = (groupId) => {
    setCollapsedModules((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  const handleRenameModule = (groupId, newLabel) => {
    if (!onModuleGroupsChange) return;
    onModuleGroupsChange((moduleGroups || []).map((g) => (g.id === groupId ? { ...g, label: newLabel } : g)));
  };

  // Mouse enter: pause auto-scroll so user can browse freely
  const handleMouseEnter = () => {
    mouseInsideRef.current = true;
    autoScrollPausedRef.current = true;
    clearTimeout(mouseLeaveTimerRef.current);
  };

  // Mouse leave: resume auto-scroll after 2 seconds
  const handleMouseLeave = () => {
    mouseInsideRef.current = false;
    clearTimeout(mouseLeaveTimerRef.current);
    mouseLeaveTimerRef.current = setTimeout(() => {
      if (!mouseInsideRef.current) {
        autoScrollPausedRef.current = false;
      }
    }, 2000);
  };

  const handleTableKeyDown = (event) => {
    if (event.target !== event.currentTarget || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    autoScrollPausedRef.current = true;
    const direction = event.key === 'ArrowRight' ? 1 : -1;
    const step = Math.max(96, Math.round(event.currentTarget.clientWidth * 0.35));
    event.currentTarget.scrollBy({ left: direction * step, behavior: preferredScrollBehavior() });
  };

  // Cleanup timer on unmount
  useEffect(() => {
    return () => clearTimeout(mouseLeaveTimerRef.current);
  }, []);

  useEffect(() => {
    const handleFocusRequest = (event) => {
      const target = event.detail || {};
      if (target.type !== 'courseMapCell') return;

      const nextKey = courseMapCellKey(target);
      setFocusedCellKey(nextKey);

      window.setTimeout(() => {
        const cells = Array.from(tableRef.current?.querySelectorAll('[data-coursemap-cell="true"]') || []);
        const match = cells.find((cell) => {
          const sameLesson = cell.dataset.lessonIndex === String(target.lessonIndex ?? '');
          const sameField = cell.dataset.fieldKey === String(target.field || '');
          const expectedSection = target.field === 'title' ? '' : String(target.sectionIndex ?? 0);
          return sameLesson && sameField && cell.dataset.sectionIndex === expectedSection;
        });
        if (!match) return;

        wrapperRef.current?.scrollIntoView({ behavior: preferredScrollBehavior(), block: 'start' });
        match.scrollIntoView({ behavior: preferredScrollBehavior(), block: 'center', inline: 'center' });
        const focusable = match.querySelector('[tabindex], textarea, button, [role="button"]') || match;
        focusable.focus?.({ preventScroll: true });
      }, 120);

      window.setTimeout(() => {
        setFocusedCellKey((current) => (current === nextKey ? null : current));
      }, 5000);
    };

    window.addEventListener('coursemapper:focus-coursemap-cell', handleFocusRequest);
    return () => window.removeEventListener('coursemapper:focus-coursemap-cell', handleFocusRequest);
  }, []);

  // Reset revision scroll flag when a new revision starts or streaming ends
  useEffect(() => {
    if (!isStreaming) revisionScrolledRef.current = false;
  }, [isStreaming]);

  // Auto-scroll to bottom during initial streaming, or to first changed cell during revision
  useEffect(() => {
    if (!isStreaming || !courseMap?.lessons) return;
    if (autoScrollPausedRef.current) return;

    if (oldCourseMap && !revisionScrolledRef.current && tableRef.current) {
      // Revision streaming: first scroll page to the preview, then scroll table to changed cell
      const changedEl = tableRef.current.querySelector('[data-changed="true"]');
      if (changedEl) {
        revisionScrolledRef.current = true;
        // Scroll page so the preview is visible
        if (wrapperRef.current) {
          wrapperRef.current.scrollIntoView({ behavior: preferredScrollBehavior(), block: 'start' });
        }
        // After page scroll settles, scroll inner table to the changed cell
        setTimeout(() => {
          changedEl.scrollIntoView({ behavior: preferredScrollBehavior(), block: 'center', inline: 'nearest' });
        }, 400);
        return;
      }
    }

    // Initial generation streaming: scroll to bottom
    if (!oldCourseMap && tableRef.current) {
      tableRef.current.scrollTo({ top: tableRef.current.scrollHeight, behavior: preferredScrollBehavior() });
    }
  }, [courseMap, isStreaming, oldCourseMap]);

  // Drag handlers for column resize
  const handleResizeStart = useCallback((e, colIdx) => {
    e.preventDefault();
    const startX = e.clientX;
    const th = e.target.parentElement;
    const startWidth = th.offsetWidth;
    resizingRef.current = { colIdx, startX, startWidth };

    const handleMouseMove = (ev) => {
      if (!resizingRef.current) return;
      const delta = ev.clientX - resizingRef.current.startX;
      const newWidth = Math.max(60, resizingRef.current.startWidth + delta);
      setColWidths((prev) => ({ ...prev, [resizingRef.current.colIdx]: newWidth }));
    };

    const handleMouseUp = () => {
      resizingRef.current = null;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  if (!courseMap || !courseMap.lessons || courseMap.lessons.length === 0) {
    if (isStreaming) {
      return (
        <div className="glass rounded-squircle shadow-glass p-7">
          <div className="flex items-center gap-3 text-indigo-500">
            <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span className="text-sm font-medium">Waiting for AI response...</span>
          </div>
        </div>
      );
    }
    return null;
  }

  // Filter to only enabled columns (enabled defaults to true when field is missing)
  const enabledColumns = columns && columns.length > 0 ? columns.filter((c) => c.enabled !== false) : null;

  // A2: lesson identity moved into the band rows, so the first column is now
  // the slim "N.M" section address column.
  const colHeaders = enabledColumns
    ? ['Section', ...enabledColumns.map((c) => c.label || c.title || c.key)]
    : [
        'Section',
        'Learning Goals',
        'Topic/Section',
        'Learning Objectives',
        'Assessments',
        'Async Activities',
        'Sync Activities',
        'Technology',
        'Format',
        'Resources',
        'Evaluate',
      ];

  const colKeys = enabledColumns ? enabledColumns.map((c) => c.key) : SECTION_KEYS;
  const totalColumnWeight = colKeys.reduce((total, key) => total + (COLUMN_WEIGHTS[key] || 1), 0);

  return (
    <div ref={wrapperRef} className="glass rounded-squircle p-4 shadow-glass-lg sm:p-7">
      {/* v0.14.4: flex-wrap + a non-wrapping title keep "Course Map Preview"
          on one line while the ml-auto controls group drops below it on narrow
          viewports (mobile) instead of squeezing the title to three lines. */}
      <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100 mb-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-2">
        <div className="w-8 h-8 rounded-squircle-xs bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center flex-shrink-0">
          <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none">
            <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth={1.6} />
            <path d="M3 9h18M3 15h18M9 3v18" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" />
          </svg>
        </div>
        <span className="whitespace-nowrap">Course Map Preview</span>
        {isStreaming && (
          <span className="ml-2 flex items-center gap-1.5 text-xs font-bold text-red-500 bg-red-50/80 px-2.5 py-1 rounded-full">
            <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
            LIVE
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          {!isStreaming && oldCourseMap && (
            <>
              <button
                onClick={onToggleDiff}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all duration-200 ${
                  showDiff
                    ? 'bg-emerald-100/80 text-emerald-700 border border-emerald-300/50'
                    : 'bg-slate-100/60 text-slate-500 border border-slate-200/50 hover:bg-emerald-50'
                }`}
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                {showDiff ? 'Hide Changes' : 'Show Changes'}
              </button>
              <button
                onClick={onDismissDiff}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-medium text-slate-400 hover:text-slate-600 hover:bg-slate-100/60 transition-all duration-200"
                title="Dismiss diff"
                aria-label="Dismiss diff view"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </>
          )}
          {/* A4: density toggle — view preference, persisted outside the project */}
          <div
            role="group"
            aria-label="Table density"
            className="hidden items-center rounded-full border border-slate-200 bg-white/60 p-0.5 sm:flex dark:border-slate-700 dark:bg-slate-900/60"
          >
            {['comfortable', 'compact'].map((mode) => (
              <button
                key={mode}
                type="button"
                data-density-option={mode}
                aria-pressed={density === mode}
                onClick={() => setDensityMode(mode)}
                className={`px-2.5 py-0.5 rounded-full text-[12px] font-medium transition-colors duration-150 ${
                  density === mode
                    ? 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200'
                    : 'text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300'
                }`}
              >
                {mode === 'comfortable' ? 'Comfortable' : 'Compact'}
              </button>
            ))}
          </div>
        </div>
      </h2>
      <p id="course-map-scroll-help" className="mb-3 text-body text-ink-muted sm:hidden">
        Swipe the table to review every course-map field.
      </p>
      <div className="mb-3 sm:mb-5" />

      <div
        ref={tableRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onKeyDown={handleTableKeyDown}
        role="region"
        aria-label="Scrollable course map"
        aria-describedby="course-map-scroll-help"
        tabIndex={0}
        className="overflow-auto rounded-squircle-sm max-h-[70vh] border border-white/30 bg-white/60 shadow-glass outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/60 focus-visible:ring-offset-2 dark:border-slate-700/80 dark:bg-slate-900/65 dark:focus-visible:ring-indigo-300/70 dark:focus-visible:ring-offset-slate-950"
      >
        {/* Keep the semantic table wide enough for readable prose at every
            breakpoint. `sm:min-w-full` used to override the 1100px floor on
            desktop workspaces; between the agent and export rails that
            compressed ten columns into ~700px and broke ordinary words every
            few characters. The labelled region already owns horizontal
            scrolling, so preserve legibility and let users pan deliberately. */}
        <table className="min-w-[1100px] table-fixed" role="grid" aria-label="Course Map">
          {/* A1: width hierarchy lives in the colgroup (table-fixed reads the
              first row) — slim fixed section column, objectives widest, manual
              drag-resize still wins via colWidths. */}
          <colgroup>
            <col style={{ width: colWidths[0] ? `${colWidths[0]}px` : '52px' }} />
            {colKeys.map((key, ki) => (
              <col
                key={key}
                style={{
                  width: colWidths[ki + 1]
                    ? `${colWidths[ki + 1]}px`
                    : `${(((COLUMN_WEIGHTS[key] || 1) / totalColumnWeight) * 100).toFixed(2)}%`,
                }}
              />
            ))}
            {!isStreaming && <col style={{ width: '60px' }} />}
          </colgroup>
          <thead className="sticky top-0 z-10">
            {/* A1: chrome recedes — light sticky header, sentence case, hairline
                bottom border (inset shadow survives border-collapse + sticky). */}
            <tr>
              {colHeaders.map((h, hi) => (
                <th
                  key={`${hi}-${h}`}
                  className="px-3.5 py-2.5 text-left text-[12px] font-medium text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 shadow-[inset_0_-1px_0_0_#e2e8f0] dark:shadow-[inset_0_-1px_0_0_#334155] whitespace-nowrap overflow-hidden text-ellipsis relative group/th"
                >
                  {toSentenceCase(h)}
                  <div
                    onMouseDown={(e) => handleResizeStart(e, hi)}
                    className="absolute right-0 top-0 bottom-0 w-[5px] cursor-col-resize hover:bg-indigo-400/40 transition-colors duration-150"
                    title="Drag to resize"
                  />
                </th>
              ))}
              {!isStreaming && (
                <th
                  key="row-actions"
                  className="px-2 py-2.5 bg-slate-50 dark:bg-slate-800 shadow-[inset_0_-1px_0_0_#e2e8f0] dark:shadow-[inset_0_-1px_0_0_#334155] w-[60px]"
                />
              )}
            </tr>
          </thead>
          <tbody>
            {courseMap.lessons.map((lesson, li) => {
              const isLocked = lockedLessons?.has(li);
              const group = lessonGroupMap[li];
              const isFirstInGroup = group && groupFirstLessonMap[group.id] === li;
              const isCollapsed = group && collapsedModules.has(group.id);
              const isHidden = hiddenLessons.has(li) && !isFirstInGroup;
              const colors = group ? GROUP_COLORS[group.color] || GROUP_COLORS.indigo : null;

              // Number of columns for colspan
              const totalCols = colKeys.length + 1 + (isStreaming ? 0 : 1); // section col + content cols + actions col

              const rows = [];

              // Insert module header row BEFORE the first lesson in each group
              if (isFirstInGroup) {
                const moduleLesson = isCollapsed ? group.lessonIndices.length : null;
                rows.push(
                  <tr key={`module-header-${group.id}`} className={`border-t-2 ${colors.border}`}>
                    <td colSpan={totalCols} className={`px-3.5 py-1.5 ${colors.bg}`}>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => toggleModule(group.id)}
                          className={`flex items-center gap-1.5 font-semibold text-xs ${colors.text} hover:opacity-70 transition-opacity`}
                        >
                          <svg
                            className={`w-3 h-3 transition-transform duration-200 ${isCollapsed ? '-rotate-90' : ''}`}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                          </svg>
                          <span
                            contentEditable={!isStreaming}
                            suppressContentEditableWarning
                            onBlur={(e) => handleRenameModule(group.id, e.currentTarget.textContent.trim())}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                e.currentTarget.blur();
                              }
                            }}
                            className="outline-none cursor-text focus:underline"
                          >
                            {group.label}
                          </span>
                        </button>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${colors.badge}`}>
                          {group.lessonIndices.length} lesson{group.lessonIndices.length !== 1 ? 's' : ''}
                          {isCollapsed ? ' — collapsed' : ''}
                        </span>
                      </div>
                    </td>
                  </tr>,
                );
              }

              // Skip rendering lesson rows when collapsed (except the first lesson — already shown by header above)
              if (isHidden) {
                return rows; // just the header (or nothing)
              }

              // Normal lesson rows
              const sections = lesson.sections && lesson.sections.length > 0 ? lesson.sections : [{}];

              // Compute which content columns have identical values across all sections
              // These will be visually merged with rowSpan to avoid repetition
              const mergedCols = new Set();
              if (sections.length > 1) {
                for (const key of colKeys) {
                  if (key === 'evaluateDesign') continue;
                  const firstVal = toStr(sections[0]?.[key]);
                  if (firstVal && sections.every((s) => toStr(s?.[key]) === firstVal)) {
                    mergedCols.add(key);
                  }
                }
              }

              const sectionRows = sections.map((section, si) => (
                <tr
                  key={`${li}-${si}`}
                  className={`group/row border-t border-slate-100/60 dark:border-slate-800 ${
                    isLocked
                      ? 'bg-slate-100/60 dark:bg-slate-800/70'
                      : 'hover:bg-indigo-50/20 dark:hover:bg-slate-800/55'
                  } animate-fadeIn transition-colors duration-200`}
                >
                  {/* A2: slim section address column — lesson identity lives in the band above */}
                  <td
                    className={`${cellPad} align-top text-[12px] font-medium text-slate-400 dark:text-slate-500 tabular-nums whitespace-nowrap`}
                    data-section-label="true"
                  >
                    {li + 1}.{si + 1}
                  </td>
                  {colKeys.map((key) => {
                    // Skip cells that are merged via rowSpan from the first section
                    if (mergedCols.has(key) && si > 0) return null;

                    const rowSpan = mergedCols.has(key) ? sections.length : undefined;

                    // Evaluate Design: legacy boolean/empty keeps the checkbox
                    // (onCheckToggle contract); alignment-lint PROSE renders as
                    // a verdict — icon + quiet text instead of a loud paragraph
                    // (A3). Same data either way; presentation only.
                    if (key === 'evaluateDesign') {
                      const verdictKind = classifyEvaluateDesign(section[key]);
                      if (verdictKind === 'boolean' || verdictKind === 'empty') {
                        const checked = section[key] === true || section[key] === 'true';
                        return (
                          <td key={key} className={`${cellPad} align-middle text-center`} rowSpan={rowSpan}>
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={isStreaming}
                              onChange={() => onCheckToggle && onCheckToggle(li, si)}
                              className="w-4.5 h-4.5 rounded border-slate-300 dark:border-slate-600 text-indigo-600 focus:ring-indigo-500 cursor-pointer accent-indigo-600"
                              aria-label={`Evaluate design for ${lesson.title}, section ${si + 1}`}
                            />
                          </td>
                        );
                      }
                      const evaluateFocused =
                        focusedCellKey === courseMapCellKey({ lessonIndex: li, sectionIndex: si, field: key });
                      return (
                        <td
                          key={key}
                          rowSpan={rowSpan}
                          className={`${cellPad} ${cellText} align-top text-slate-600 dark:text-slate-300 transition-all duration-500 ${
                            evaluateFocused ? 'ring-2 ring-amber-400 ring-inset bg-amber-50/80' : ''
                          }`}
                          style={{ overflowWrap: 'break-word', hyphens: 'auto' }}
                          data-coursemap-cell="true"
                          data-lesson-index={li}
                          data-section-index={si}
                          data-field-key={key}
                          tabIndex={-1}
                        >
                          <EvaluateDesignCell text={toStr(section[key])} />
                        </td>
                      );
                    }

                    const newText = toStr(section[key]);
                    const oldSection = oldCourseMap?.lessons?.[li]?.sections?.[si];
                    const oldText = oldSection ? toStr(oldSection[key]) : null;
                    const isChanged = oldText !== null && oldText !== newText;

                    // Edit handler: for merged cells, propagate edits to all sections
                    const handleCellSave = onCellEdit
                      ? (val) => {
                          if (mergedCols.has(key)) {
                            sections.forEach((_, sIdx) => onCellEdit(li, sIdx, key, val));
                          } else {
                            onCellEdit(li, si, key, val);
                          }
                        }
                      : null;

                    // During revision streaming: show unchanged cells with grey bg, changed with green
                    if (isStreaming && oldCourseMap) {
                      const unchanged = oldText !== null && oldText === newText;
                      return (
                        <td
                          key={key}
                          rowSpan={rowSpan}
                          className={`${cellPad} ${cellText} align-top transition-colors duration-300 ${
                            unchanged ? 'bg-slate-50/60 text-slate-400' : 'bg-emerald-50/50 text-emerald-800'
                          }`}
                          style={{ overflowWrap: 'break-word', hyphens: 'auto' }}
                          data-changed={!unchanged ? 'true' : undefined}
                          data-coursemap-cell="true"
                          data-lesson-index={li}
                          data-section-index={si}
                          data-field-key={key}
                          tabIndex={-1}
                        >
                          <FormattedText text={newText} />
                        </td>
                      );
                    }

                    // During initial generation streaming (no oldCourseMap)
                    if (isStreaming) {
                      return (
                        <td
                          key={key}
                          rowSpan={rowSpan}
                          className={`${cellPad} ${cellText} align-top text-slate-600 dark:text-slate-300`}
                          style={{ overflowWrap: 'break-word', hyphens: 'auto' }}
                          data-coursemap-cell="true"
                          data-lesson-index={li}
                          data-section-index={si}
                          data-field-key={key}
                          tabIndex={-1}
                        >
                          <DiffCell text={newText} oldText={null} isStreaming={isStreaming} />
                        </td>
                      );
                    }

                    // Not streaming — editable cells with diff view
                    return (() => {
                      const isFocused =
                        focusedCellKey === courseMapCellKey({ lessonIndex: li, sectionIndex: si, field: key });
                      // v0.14.1 (3.5): this section's registry entries, in
                      // cell order — drives the assessment chips.
                      const assessmentEntries =
                        key === 'weeklyAssessments'
                          ? (assessmentRegistry?.sessions?.[li]?.sections?.[si]?.assessmentRefs || [])
                              .map((id) => assessmentsById.get(id))
                              .filter(Boolean)
                          : null;
                      return (
                        <td
                          key={key}
                          rowSpan={rowSpan}
                          className={`${cellPad} ${cellText} align-top text-slate-600 dark:text-slate-300 transition-all duration-500 ${
                            isFocused
                              ? 'ring-2 ring-amber-400 ring-inset bg-amber-50/80'
                              : showDiff && isChanged
                                ? 'bg-emerald-50/60 border-l-2 border-emerald-400'
                                : isChanged
                                  ? 'bg-emerald-50/40'
                                  : ''
                          }`}
                          style={{ overflowWrap: 'break-word', hyphens: 'auto' }}
                          data-coursemap-cell="true"
                          data-lesson-index={li}
                          data-section-index={si}
                          data-field-key={key}
                          tabIndex={-1}
                          onMouseEnter={
                            onCellHover
                              ? (e) => {
                                  const rect = e.currentTarget.getBoundingClientRect();
                                  onCellHover({ fieldKey: key, position: { x: rect.right + 8, y: rect.top } });
                                }
                              : undefined
                          }
                          onMouseLeave={onCellHover ? () => onCellHover(null) : undefined}
                        >
                          {showDiff && isChanged && oldText ? (
                            <div>
                              <div className="text-xs text-red-400 dark:text-red-300/80 line-through mb-1 pb-1 border-b border-red-100/60 leading-relaxed">
                                {oldText.length > 150 ? oldText.slice(0, 150) + '...' : oldText}
                              </div>
                              <EditableCell
                                text={newText}
                                isStreaming={isStreaming}
                                onSave={handleCellSave}
                                highlight={true}
                                onAIContextMenu={onAIContextMenu}
                                cellContext={{ lessonIndex: li, sectionIndex: si, columnKey: key }}
                                assessmentEntries={assessmentEntries}
                              />
                            </div>
                          ) : (
                            <EditableCell
                              text={newText}
                              isStreaming={isStreaming}
                              onSave={handleCellSave}
                              highlight={isChanged}
                              onAIContextMenu={onAIContextMenu}
                              cellContext={{ lessonIndex: li, sectionIndex: si, columnKey: key }}
                              assessmentEntries={assessmentEntries}
                            />
                          )}
                        </td>
                      );
                    })();
                  })}
                  {/* Row actions column */}
                  {!isStreaming && (
                    <td className={`px-1 ${compact ? 'py-1.5' : 'py-2.5'} align-top w-[60px]`}>
                      <div className="opacity-0 group-hover/row:opacity-100 flex flex-col items-center gap-0.5 transition-opacity duration-150">
                        {onAddSection && (
                          <button
                            onClick={() => onAddSection(li, si + 1)}
                            className="p-1 text-slate-300 hover:text-emerald-500 transition-colors"
                            title="Add section below"
                            aria-label="Add section below"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                          </button>
                        )}
                        {onDeleteSection && (lesson.sections || []).length > 1 && (
                          <button
                            onClick={() => onDeleteSection(li, si)}
                            className="p-1 text-slate-300 hover:text-red-400 transition-colors"
                            title="Delete this section"
                            aria-label="Delete this section"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M6 18L18 6M6 6l12 12"
                              />
                            </svg>
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ));

              // ── A2: full-width lesson band replaces the merged title cell ──
              // The band td keeps the title cell's data contract (field "title",
              // empty section index) so the focus-coursemap-cell listener and
              // EditableCell title editing work exactly as before.
              const isLessonCollapsed = collapsedLessons.has(li);
              const assessmentTotal = sections.reduce(
                (total, section) => total + splitIntoItems(toStr(section?.weeklyAssessments)).length,
                0,
              );
              const titleText = toStr(lesson.title).trim();
              const titleHasLessonNumber = /^\s*(?:lesson|week|module|unit)\s*\d/i.test(titleText);
              const bandFocused = focusedCellKey === courseMapCellKey({ lessonIndex: li, field: 'title' });

              rows.push(
                <tr
                  key={`lesson-band-${li}`}
                  className="group/band border-t border-slate-200/70 dark:border-slate-700/60"
                  data-lesson-band="true"
                  data-lesson-index={li}
                  data-lesson-collapsed={isLessonCollapsed ? 'true' : undefined}
                >
                  <td
                    colSpan={totalCols}
                    className={`${compact ? 'px-3 py-1.5' : 'px-3.5 py-2'} transition-shadow duration-300 ${
                      bandFocused
                        ? 'ring-2 ring-amber-400 ring-inset bg-amber-50/80'
                        : isLocked
                          ? 'bg-slate-100/70 dark:bg-slate-800/70'
                          : 'bg-indigo-50/70 dark:bg-indigo-950/40'
                    } ${group ? `border-l-[3px] ${colors.border}` : ''}`}
                    data-coursemap-cell="true"
                    data-lesson-index={li}
                    data-section-index=""
                    data-field-key="title"
                    tabIndex={-1}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <button
                        type="button"
                        onClick={() => toggleLessonCollapse(li)}
                        aria-expanded={!isLessonCollapsed}
                        aria-label={`${isLessonCollapsed ? 'Expand' : 'Collapse'} lesson ${li + 1}`}
                        data-lesson-toggle="true"
                        className="inline-flex min-h-8 min-w-8 flex-shrink-0 items-center justify-center rounded-md text-indigo-400 transition-colors hover:bg-indigo-100/70 hover:text-indigo-600 dark:text-indigo-500 dark:hover:bg-indigo-900/50 dark:hover:text-indigo-300"
                      >
                        <svg
                          className={`w-3.5 h-3.5 transition-transform duration-200 ${isLessonCollapsed ? '-rotate-90' : ''}`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                          aria-hidden="true"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                      {isLocked && (
                        <span className="text-[10px] font-bold text-slate-400 bg-slate-200 px-1 py-0.5 rounded uppercase tracking-wide flex-shrink-0">
                          LOCKED
                        </span>
                      )}
                      <span className="font-medium text-[13px] text-indigo-950 dark:text-indigo-100 min-w-0">
                        {!titleHasLessonNumber && (
                          <span className="whitespace-nowrap">
                            Lesson {li + 1}
                            {titleText ? ' — ' : ''}
                          </span>
                        )}
                        <EditableCell
                          text={lesson.title || ''}
                          isStreaming={isStreaming}
                          onSave={!isLocked && onTitleEdit ? (val) => onTitleEdit(li, val) : null}
                          onAIContextMenu={onAIContextMenu}
                          cellContext={{ lessonIndex: li, columnKey: 'title' }}
                          plain
                        />
                      </span>
                      {!isStreaming && (
                        <div className="opacity-0 group-hover/band:opacity-100 flex items-center gap-1 transition-opacity duration-150 flex-shrink-0">
                          {!isLocked && onMoveLesson && li > 0 && (
                            <button
                              onClick={() => onMoveLesson(li, -1)}
                              className="p-0.5 text-slate-300 hover:text-indigo-500 transition-colors"
                              title="Move lesson up"
                              aria-label="Move lesson up"
                            >
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                              </svg>
                            </button>
                          )}
                          {!isLocked && onMoveLesson && li < courseMap.lessons.length - 1 && (
                            <button
                              onClick={() => onMoveLesson(li, 1)}
                              className="p-0.5 text-slate-300 hover:text-indigo-500 transition-colors"
                              title="Move lesson down"
                              aria-label="Move lesson down"
                            >
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                              </svg>
                            </button>
                          )}
                          {!isLocked && onDeleteLesson && courseMap.lessons.length > 1 && (
                            <button
                              onClick={() => onDeleteLesson(li)}
                              className="p-0.5 text-slate-300 hover:text-red-400 transition-colors"
                              title="Delete lesson"
                              aria-label="Delete lesson"
                            >
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                />
                              </svg>
                            </button>
                          )}
                          {onToggleLock && (
                            <button
                              onClick={() => onToggleLock(li)}
                              className={`p-0.5 transition-colors ${isLocked ? 'text-amber-500 hover:text-amber-600' : 'text-slate-300 hover:text-amber-400'}`}
                              title={
                                isLocked ? 'Unlock lesson (allow AI edits)' : 'Lock lesson (protect from AI edits)'
                              }
                              aria-label={isLocked ? 'Unlock lesson' : 'Lock lesson'}
                            >
                              {isLocked ? (
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                                  />
                                </svg>
                              ) : (
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z"
                                  />
                                </svg>
                              )}
                            </button>
                          )}
                        </div>
                      )}
                      {/* Meta chips from the data already in scope; genome/enriched
                          state is not reachable from this component's props — that
                          belongs to the build ribbon (WS-B). */}
                      <span
                        className="ml-auto flex-shrink-0 text-[12px] text-slate-500 dark:text-slate-400 whitespace-nowrap"
                        data-lesson-meta="true"
                      >
                        {sections.length} {sections.length === 1 ? 'section' : 'sections'} · {assessmentTotal}{' '}
                        {assessmentTotal === 1 ? 'assessment' : 'assessments'}
                      </span>
                    </div>
                  </td>
                </tr>,
              );

              // A4: collapsed lessons keep their band (the toggle) and hide
              // their section rows — view state only, the data still renders
              // identically when expanded.
              if (!isLessonCollapsed) rows.push(...sectionRows);
              return rows;
            })}
            {/* Add lesson row */}
            {!isStreaming && onAddLesson && (
              <tr key="add-lesson-row">
                <td colSpan={colHeaders.length + 1} className="px-3.5 py-2">
                  <button
                    onClick={onAddLesson}
                    className="tactile flex items-center gap-1.5 px-3 py-1.5 rounded-squircle-xs text-xs font-medium text-slate-400 hover:text-indigo-500 hover:bg-indigo-50/40 transition-all duration-200"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Add Lesson
                  </button>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// `plain` renders the raw text inline (no list/paragraph formatting) — used by
// the lesson band title, where "Lesson 2: ..." must not be mistaken for a
// numbered list. Editing behavior is identical.
function EditableCell({
  text,
  isStreaming,
  onSave,
  highlight,
  onAIContextMenu,
  cellContext,
  assessmentEntries,
  plain,
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(text);
  const textareaRef = useRef(null);

  useEffect(() => {
    setValue(text);
  }, [text]);

  useEffect(() => {
    if (editing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
    }
  }, [editing]);

  const handleClick = () => {
    if (isStreaming || !onSave) return;
    setEditing(true);
  };

  const handleSave = () => {
    setEditing(false);
    const trimmed = value.trim();
    if (trimmed !== text && onSave) {
      onSave(trimmed);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      setValue(text);
      setEditing(false);
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSave();
    }
  };

  if (editing) {
    return (
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          e.target.style.height = 'auto';
          e.target.style.height = e.target.scrollHeight + 'px';
        }}
        onBlur={handleSave}
        onKeyDown={handleKeyDown}
        className="w-full min-h-[3rem] text-xs text-slate-700 bg-white/90 border border-indigo-300 rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-400/50 resize-none"
        rows={2}
        aria-label="Edit cell content"
      />
    );
  }

  const handleContextMenu = (e) => {
    if (!onAIContextMenu || isStreaming || !text?.trim()) return;
    onAIContextMenu(e, { type: 'courseMapCell', ...cellContext, currentValue: text });
  };

  return (
    <span
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleClick();
        }
      }}
      className={`inline ${highlight ? 'text-green-700 bg-green-50/60 rounded px-0.5 -mx-0.5' : ''} ${onSave && !isStreaming ? 'cursor-text hover:bg-indigo-50/40 hover:outline hover:outline-1 hover:outline-indigo-200/60 rounded px-0.5 -mx-0.5 transition-all duration-150' : ''}`}
      title={onSave && !isStreaming ? 'Click to edit · Right-click for AI' : ''}
      role={onSave && !isStreaming ? 'button' : undefined}
      tabIndex={onSave && !isStreaming ? 0 : undefined}
      aria-label={onSave && !isStreaming ? 'Click to edit cell' : undefined}
    >
      {assessmentEntries?.length > 0 ? (
        <AssessmentCellContent text={text} entries={assessmentEntries} />
      ) : plain ? (
        text
      ) : (
        <FormattedText text={text} />
      )}
    </span>
  );
}

function DiffCell({ text, oldText, isStreaming }) {
  const [phase, setPhase] = useState('idle'); // idle | strikethrough | highlight | done
  const prevTextRef = useRef('');

  // Handle revision diff: oldText → strikethrough → highlight new
  useEffect(() => {
    if (oldText !== null && !isStreaming && text) {
      setPhase('strikethrough');
      const t1 = setTimeout(() => {
        setPhase('highlight');
        setTimeout(() => setPhase('done'), 3000);
      }, 800);
      return () => clearTimeout(t1);
    }
  }, [oldText, text, isStreaming]);

  // Track previous text for streaming cursor
  useEffect(() => {
    if (text) prevTextRef.current = text;
  }, [text]);

  // Diff animation rendering
  if (oldText !== null) {
    if (phase === 'strikethrough') {
      return (
        <span className="inline">
          <span className="line-through text-red-400 dark:text-red-300/80 decoration-red-400">
            <FormattedText text={oldText} />
          </span>
        </span>
      );
    }
    if (phase === 'highlight') {
      return (
        <span className="inline text-green-700 bg-green-50 rounded px-0.5">
          <FormattedText text={text} />
        </span>
      );
    }
    if (phase === 'done') {
      return (
        <span className="inline">
          <FormattedText text={text} />
        </span>
      );
    }
    // Initial state while waiting
    return (
      <span className="inline">
        <FormattedText text={oldText} />
      </span>
    );
  }

  // Streaming: render formatted text directly (AI chunks provide natural typing feel)
  return (
    <span className="inline">
      <FormattedText text={text || ''} />
    </span>
  );
}
