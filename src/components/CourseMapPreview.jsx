import React, { useState, useEffect, useRef } from 'react';

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

export default function CourseMapPreview({ courseMap, columns, isStreaming, oldCourseMap, onCellEdit, onTitleEdit, onCheckToggle, onAddSection, onDeleteSection, onAddLesson, onDeleteLesson, onMoveLesson }) {
  const tableRef = useRef(null);
  const mouseInsideRef = useRef(false);
  const mouseLeaveTimerRef = useRef(null);
  const autoScrollPausedRef = useRef(false);

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

  // Auto-scroll to bottom during streaming (unless mouse is inside preview)
  useEffect(() => {
    if (!isStreaming || !courseMap?.lessons) return;
    if (autoScrollPausedRef.current) return;
    if (tableRef.current) {
      tableRef.current.scrollTo({ top: tableRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [courseMap, isStreaming]);

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

  const colHeaders = columns && columns.length > 0
    ? ['Week/Module [Topic]', ...columns.map((c) => c.label)]
    : ['Week/Module', 'Learning Goals', 'Topic/Section', 'Learning Objectives',
       'Assessments', 'Async Activities', 'Sync Activities', 'Technology',
       'Format', 'Resources', 'Evaluate'];

  const colKeys = columns && columns.length > 0
    ? columns.map((c) => c.key)
    : SECTION_KEYS;

  return (
    <div className="glass rounded-squircle shadow-glass-lg p-7">
      <h2 className="text-base font-semibold text-slate-800 mb-1.5 flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-squircle-xs bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center flex-shrink-0">
          <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
          </svg>
        </div>
        Course Map Preview
        {isStreaming && (
          <span className="ml-2 flex items-center gap-1.5 text-[11px] font-bold text-red-500 bg-red-50/80 px-2.5 py-1 rounded-full">
            <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
            LIVE
          </span>
        )}
      </h2>
      <div className="mb-5" />

      <div ref={tableRef} onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave} className="overflow-auto rounded-squircle-sm max-h-[70vh] shadow-glass border border-white/30">
        <table className="min-w-full text-xs">
          <thead className="sticky top-0 z-10">
            <tr className="bg-gradient-to-r from-slate-800 to-slate-700 text-white">
              {colHeaders.map((h) => (
                <th key={h} className="px-3.5 py-3 text-left text-[11px] font-semibold tracking-wide uppercase whitespace-nowrap">
                  {h}
                </th>
              ))}
              {!isStreaming && <th className="px-2 py-3 text-center text-[11px] font-semibold tracking-wide uppercase w-[60px]" />}
            </tr>
          </thead>
          <tbody>
            {courseMap.lessons.map((lesson, li) =>
              (lesson.sections || []).map((section, si) => (
                <tr
                  key={`${li}-${si}`}
                  className={`group/row border-t border-slate-100/60 ${
                    si === 0 ? 'border-t-2 border-t-indigo-200/40' : ''
                  } hover:bg-indigo-50/20 animate-fadeIn transition-colors duration-200`}
                >
                  <td className="px-3.5 py-2.5 font-medium text-slate-700 align-top bg-slate-50/40 min-w-[120px] max-w-[160px]" style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                    {si === 0 ? (
                      <div>
                        <EditableCell
                          text={lesson.title || ''}
                          isStreaming={isStreaming}
                          onSave={onTitleEdit ? (val) => onTitleEdit(li, val) : null}
                        />
                        {!isStreaming && (
                          <div className="opacity-0 group-hover/row:opacity-100 mt-1.5 flex items-center gap-1 transition-opacity duration-150">
                            {onMoveLesson && li > 0 && (
                              <button onClick={() => onMoveLesson(li, -1)} className="p-0.5 text-slate-300 hover:text-indigo-500 transition-colors" title="Move lesson up">
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
                              </button>
                            )}
                            {onMoveLesson && li < courseMap.lessons.length - 1 && (
                              <button onClick={() => onMoveLesson(li, 1)} className="p-0.5 text-slate-300 hover:text-indigo-500 transition-colors" title="Move lesson down">
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                              </button>
                            )}
                            {onDeleteLesson && courseMap.lessons.length > 1 && (
                              <button onClick={() => onDeleteLesson(li)} className="p-0.5 text-slate-300 hover:text-red-400 transition-colors" title="Delete lesson">
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    ) : ''}
                  </td>
                  {colKeys.map((key) => {
                    // Evaluate Design → checkbox
                    if (key === 'evaluateDesign') {
                      const checked = section[key] === true || section[key] === 'true';
                      return (
                        <td key={key} className="px-3.5 py-2.5 align-middle text-center" style={{ minWidth: 60 }}>
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={isStreaming}
                            onChange={() => onCheckToggle && onCheckToggle(li, si)}
                            className="w-4.5 h-4.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer accent-indigo-600"
                          />
                        </td>
                      );
                    }

                    const newText = section[key] || '';
                    const oldSection = oldCourseMap?.lessons?.[li]?.sections?.[si];
                    const oldText = oldSection ? (oldSection[key] || '') : null;
                    const isChanged = oldText !== null && oldText !== newText;

                    // During revision streaming: show unchanged cells with grey bg, changed with green
                    if (isStreaming && oldCourseMap) {
                      const unchanged = oldText !== null && oldText === newText;
                      return (
                        <td key={key} className={`px-3.5 py-2.5 align-top max-w-[220px] transition-colors duration-300 ${
                          unchanged ? 'bg-slate-50/60 text-slate-400' : 'bg-emerald-50/50 text-emerald-800'
                        }`} style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                          <span>{newText}</span>
                        </td>
                      );
                    }

                    // During initial generation streaming (no oldCourseMap)
                    if (isStreaming) {
                      return (
                        <td key={key} className="px-3.5 py-2.5 align-top text-slate-600 max-w-[220px]" style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                          <DiffCell text={newText} oldText={null} isStreaming={isStreaming} />
                        </td>
                      );
                    }

                    // Not streaming — editable cells
                    return (
                      <td key={key} className={`px-3.5 py-2.5 align-top text-slate-600 max-w-[220px] transition-colors duration-500 ${isChanged ? 'bg-emerald-50/40' : ''}`} style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                        <EditableCell
                          text={newText}
                          isStreaming={isStreaming}
                          onSave={onCellEdit ? (val) => onCellEdit(li, si, key, val) : null}
                          highlight={isChanged}
                        />
                      </td>
                    );
                  })}
                  {/* Row actions column */}
                  {!isStreaming && (
                    <td className="px-1 py-2.5 align-top w-[60px]">
                      <div className="opacity-0 group-hover/row:opacity-100 flex flex-col items-center gap-0.5 transition-opacity duration-150">
                        {onAddSection && (
                          <button onClick={() => onAddSection(li, si + 1)} className="p-1 text-slate-300 hover:text-emerald-500 transition-colors" title="Add section below">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                          </button>
                        )}
                        {onDeleteSection && (lesson.sections || []).length > 1 && (
                          <button onClick={() => onDeleteSection(li, si)} className="p-1 text-slate-300 hover:text-red-400 transition-colors" title="Delete this section">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))
            )}
            {/* Add lesson row */}
            {!isStreaming && onAddLesson && (
              <tr>
                <td colSpan={colHeaders.length + 1} className="px-3.5 py-2">
                  <button
                    onClick={onAddLesson}
                    className="tactile flex items-center gap-1.5 px-3 py-1.5 rounded-squircle-xs text-xs font-medium text-slate-400 hover:text-indigo-500 hover:bg-indigo-50/40 transition-all duration-200"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
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

function EditableCell({ text, isStreaming, onSave, highlight }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(text);
  const textareaRef = useRef(null);

  useEffect(() => { setValue(text); }, [text]);

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
      />
    );
  }

  return (
    <span
      onClick={handleClick}
      className={`inline ${highlight ? 'text-green-700 bg-green-50/60 rounded px-0.5 -mx-0.5' : ''} ${onSave && !isStreaming ? 'cursor-text hover:bg-indigo-50/40 hover:outline hover:outline-1 hover:outline-indigo-200/60 rounded px-0.5 -mx-0.5 transition-all duration-150' : ''}`}
      title={onSave && !isStreaming ? 'Click to edit' : ''}
    >
      {text}
    </span>
  );
}

function DiffCell({ text, oldText, isStreaming }) {
  const [phase, setPhase] = useState('idle'); // idle | strikethrough | typing | done | highlight
  const [displayed, setDisplayed] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const prevTextRef = useRef('');

  // Handle revision diff: oldText → strikethrough → type new
  useEffect(() => {
    if (oldText !== null && !isStreaming && text) {
      // Revision complete — animate the diff
      setPhase('strikethrough');
      const t1 = setTimeout(() => {
        setPhase('typing');
        setDisplayed('');
        let idx = 0;
        const timer = setInterval(() => {
          idx++;
          setDisplayed(text.slice(0, idx));
          if (idx >= text.length) {
            clearInterval(timer);
            setPhase('highlight');
            setTimeout(() => setPhase('done'), 3000);
          }
        }, 12);
      }, 800);
      return () => clearTimeout(t1);
    }
  }, [oldText, text, isStreaming]);

  // Handle streaming typewriter (no diff)
  useEffect(() => {
    if (oldText !== null) return; // diff mode handled above

    if (!text) {
      setDisplayed('');
      prevTextRef.current = '';
      return;
    }

    if (text === prevTextRef.current) return;

    const prevLen = prevTextRef.current.length;
    prevTextRef.current = text;

    if (!isStreaming) {
      setDisplayed(text);
      setPhase('idle');
      return;
    }

    setIsTyping(true);
    const newChars = text.slice(prevLen);
    let idx = 0;

    const timer = setInterval(() => {
      idx++;
      setDisplayed(text.slice(0, prevLen + idx));
      if (idx >= newChars.length) {
        clearInterval(timer);
        setIsTyping(false);
      }
    }, 8);

    return () => clearInterval(timer);
  }, [text, isStreaming, oldText]);

  // Diff animation rendering
  if (oldText !== null) {
    if (phase === 'strikethrough') {
      return (
        <span className="inline">
          <span className="line-through text-red-400 decoration-red-400">{oldText}</span>
        </span>
      );
    }
    if (phase === 'typing') {
      return (
        <span className="inline">
          <span className="text-red-300 line-through text-[10px] mr-1 decoration-red-300">{oldText.slice(0, 20)}{oldText.length > 20 ? '...' : ''}</span>
          <span className="text-green-700">{displayed}</span>
          <span className="inline-block w-[2px] h-3.5 bg-green-500 ml-0.5 animate-blink align-text-bottom" />
        </span>
      );
    }
    if (phase === 'highlight') {
      return (
        <span className="inline text-green-700 bg-green-50 rounded px-0.5">
          {text}
        </span>
      );
    }
    if (phase === 'done') {
      return <span className="inline">{text}</span>;
    }
    // Initial state while waiting
    return <span className="inline">{oldText}</span>;
  }

  // Normal streaming / static rendering
  return (
    <span className="inline">
      {displayed}
      {isTyping && (
        <span className="inline-block w-[2px] h-3.5 bg-blue-500 ml-0.5 animate-blink align-text-bottom" />
      )}
    </span>
  );
}
