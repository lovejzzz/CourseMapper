import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { buildLessonGroupMap, GROUP_COLORS } from '../lib/moduleGrouper';

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
              <span className="text-indigo-400 font-semibold flex-shrink-0 text-[10px] mt-[2px]">{prefix}</span>
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

  // ── Feature 5.3: Module Groups ──
  // Track which modules are collapsed (by group id)
  const [collapsedModules, setCollapsedModules] = useState(new Set());

  // Build a map: lessonIndex → group
  const lessonGroupMap = useMemo(() => buildLessonGroupMap(moduleGroups), [moduleGroups]);

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

        wrapperRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        match.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
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
          wrapperRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        // After page scroll settles, scroll inner table to the changed cell
        setTimeout(() => {
          changedEl.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
        }, 400);
        return;
      }
    }

    // Initial generation streaming: scroll to bottom
    if (!oldCourseMap && tableRef.current) {
      tableRef.current.scrollTo({ top: tableRef.current.scrollHeight, behavior: 'smooth' });
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

  const colHeaders = enabledColumns
    ? ['Week/Module [Topic]', ...enabledColumns.map((c) => c.label || c.title || c.key)]
    : [
        'Week/Module',
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

  return (
    <div ref={wrapperRef} className="glass rounded-squircle shadow-glass-lg p-7">
      <h2 className="text-base font-semibold text-slate-800 mb-1.5 flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-squircle-xs bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center flex-shrink-0">
          <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none">
            <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth={1.6} />
            <path d="M3 9h18M3 15h18M9 3v18" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" />
          </svg>
        </div>
        Course Map Preview
        {isStreaming && (
          <span className="ml-2 flex items-center gap-1.5 text-[11px] font-bold text-red-500 bg-red-50/80 px-2.5 py-1 rounded-full">
            <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
            LIVE
          </span>
        )}
        {!isStreaming && oldCourseMap && (
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={onToggleDiff}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold transition-all duration-200 ${
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
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[11px] font-medium text-slate-400 hover:text-slate-600 hover:bg-slate-100/60 transition-all duration-200"
              title="Dismiss diff"
              aria-label="Dismiss diff view"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}
      </h2>
      <div className="mb-5" />

      <div
        ref={tableRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className="overflow-auto rounded-squircle-sm max-h-[70vh] shadow-glass border border-white/30"
      >
        <table className="min-w-full text-xs table-fixed" role="grid" aria-label="Course Map">
          <thead className="sticky top-0 z-10">
            <tr className="bg-gradient-to-r from-slate-800 to-slate-700 text-white">
              {colHeaders.map((h, hi) => (
                <th
                  key={`${hi}-${h}`}
                  className="px-3.5 py-3 text-left text-[11px] font-semibold tracking-wide uppercase whitespace-nowrap relative group/th"
                  style={colWidths[hi] ? { width: colWidths[hi], minWidth: colWidths[hi] } : undefined}
                >
                  {h}
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
                  className="px-2 py-3 text-center text-[11px] font-semibold tracking-wide uppercase w-[60px]"
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
              const totalCols = colKeys.length + 2; // lesson col + content cols + actions col

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
                          className={`flex items-center gap-1.5 font-semibold text-[11px] ${colors.text} hover:opacity-70 transition-opacity`}
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
                        <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-full ${colors.badge}`}>
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
                  className={`group/row border-t border-slate-100/60 ${
                    si === 0 ? 'border-t-2 border-t-indigo-200/40' : ''
                  } ${isLocked ? 'bg-slate-100/60' : 'hover:bg-indigo-50/20'} animate-fadeIn transition-colors duration-200`}
                >
                  <td
                    className={`px-3.5 py-2.5 font-medium text-slate-700 align-top min-w-[120px] max-w-[160px] transition-shadow duration-300 ${
                      focusedCellKey === courseMapCellKey({ lessonIndex: li, field: 'title' })
                        ? 'ring-2 ring-amber-400 ring-inset bg-amber-50/80'
                        : isLocked
                          ? 'bg-slate-100/80'
                          : 'bg-slate-50/40'
                    }`}
                    style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}
                    data-coursemap-cell="true"
                    data-lesson-index={li}
                    data-section-index=""
                    data-field-key="title"
                    tabIndex={-1}
                  >
                    {si === 0 ? (
                      <div>
                        <div className="flex items-start gap-1">
                          {isLocked && (
                            <span className="text-[8px] font-bold text-slate-400 bg-slate-200 px-1 py-0.5 rounded uppercase tracking-wide flex-shrink-0 mt-0.5">
                              LOCKED
                            </span>
                          )}
                          <EditableCell
                            text={lesson.title || ''}
                            isStreaming={isStreaming}
                            onSave={!isLocked && onTitleEdit ? (val) => onTitleEdit(li, val) : null}
                            onAIContextMenu={onAIContextMenu}
                            cellContext={{ lessonIndex: li, columnKey: 'title' }}
                          />
                        </div>
                        {!isStreaming && (
                          <div className="opacity-0 group-hover/row:opacity-100 mt-1.5 flex items-center gap-1 transition-opacity duration-150">
                            {!isLocked && onMoveLesson && li > 0 && (
                              <button
                                onClick={() => onMoveLesson(li, -1)}
                                className="p-0.5 text-slate-300 hover:text-indigo-500 transition-colors"
                                title="Move lesson up"
                                aria-label="Move lesson up"
                              >
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M5 15l7-7 7 7"
                                  />
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
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M19 9l-7 7-7-7"
                                  />
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
                      </div>
                    ) : (
                      ''
                    )}
                  </td>
                  {colKeys.map((key) => {
                    // Skip cells that are merged via rowSpan from the first section
                    if (mergedCols.has(key) && si > 0) return null;

                    const rowSpan = mergedCols.has(key) ? sections.length : undefined;

                    // Evaluate Design → checkbox
                    if (key === 'evaluateDesign') {
                      const checked = section[key] === true || section[key] === 'true';
                      return (
                        <td
                          key={key}
                          className="px-3.5 py-2.5 align-middle text-center"
                          style={{ minWidth: 60 }}
                          rowSpan={rowSpan}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={isStreaming}
                            onChange={() => onCheckToggle && onCheckToggle(li, si)}
                            className="w-4.5 h-4.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer accent-indigo-600"
                            aria-label={`Evaluate design for ${lesson.title}, section ${si + 1}`}
                          />
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
                          className={`px-3.5 py-2.5 align-top max-w-[220px] transition-colors duration-300 ${
                            unchanged ? 'bg-slate-50/60 text-slate-400' : 'bg-emerald-50/50 text-emerald-800'
                          }`}
                          style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}
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
                          className="px-3.5 py-2.5 align-top text-slate-600 max-w-[220px]"
                          style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}
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
                      return (
                        <td
                          key={key}
                          rowSpan={rowSpan}
                          className={`px-3.5 py-2.5 align-top text-slate-600 max-w-[220px] transition-all duration-500 ${
                            isFocused
                              ? 'ring-2 ring-amber-400 ring-inset bg-amber-50/80'
                              : showDiff && isChanged
                                ? 'bg-emerald-50/60 border-l-2 border-emerald-400'
                                : isChanged
                                  ? 'bg-emerald-50/40'
                                  : ''
                          }`}
                          style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}
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
                              <div className="text-[10px] text-red-400 line-through mb-1 pb-1 border-b border-red-100/60 leading-relaxed">
                                {oldText.length > 150 ? oldText.slice(0, 150) + '...' : oldText}
                              </div>
                              <EditableCell
                                text={newText}
                                isStreaming={isStreaming}
                                onSave={handleCellSave}
                                highlight={true}
                                onAIContextMenu={onAIContextMenu}
                                cellContext={{ lessonIndex: li, sectionIndex: si, columnKey: key }}
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
                            />
                          )}
                        </td>
                      );
                    })();
                  })}
                  {/* Row actions column */}
                  {!isStreaming && (
                    <td className="px-1 py-2.5 align-top w-[60px]">
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
              rows.push(...sectionRows);
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

function EditableCell({ text, isStreaming, onSave, highlight, onAIContextMenu, cellContext }) {
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
      <FormattedText text={text} />
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
          <span className="line-through text-red-400 decoration-red-400">
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
