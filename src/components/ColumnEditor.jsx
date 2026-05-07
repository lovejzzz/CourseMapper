import React, { useState, useRef, useCallback, useEffect } from 'react';

export const DEFAULT_COLUMNS = [
  { key: 'learningGoals', label: 'Learning Goals' },
  { key: 'topicSection', label: 'Topic/Section' },
  { key: 'learningObjectives', label: 'Learning Objectives' },
  { key: 'weeklyAssessments', label: 'Weekly Assessments' },
  { key: 'asyncActivities', label: 'ASYNCHRONOUS Activities' },
  { key: 'syncActivities', label: 'SYNCHRONOUS Activities' },
  { key: 'technologyNeeded', label: 'Technology Needed' },
  { key: 'presentationFormat', label: 'Presentation Format' },
  { key: 'supportingResources', label: 'Supporting Resources' },
  { key: 'evaluateDesign', label: 'Evaluate Design' },
];

export default function ColumnEditor({ columns, setColumns }) {
  const [editingIdx, setEditingIdx] = useState(null);
  const [editValue, setEditValue] = useState('');

  // ── Click / double-click disambiguation ──
  const clickTimer = useRef(null);

  // ── Pointer-based drag state ──
  const [dragIdx, setDragIdx] = useState(null);
  const [ghostPos, setGhostPos] = useState({ x: 0, y: 0 });
  const [liveColumns, setLiveColumns] = useState(columns);
  const dragOriginIdx = useRef(null);
  const itemRectsRef = useRef([]);
  const containerRef = useRef(null);
  const ghostOffset = useRef({ x: 0, y: 0 });

  // Keep liveColumns in sync when not dragging
  useEffect(() => {
    if (dragIdx === null) setLiveColumns(columns);
  }, [columns, dragIdx]);

  function toggleColumn(idx) {
    if (dragIdx !== null) return;
    setColumns((prev) => prev.map((c, i) => (i === idx ? { ...c, enabled: c.enabled === false ? true : false } : c)));
  }

  function startEdit(idx) {
    if (dragIdx !== null) return;
    setEditingIdx(idx);
    setEditValue(columns[idx].label);
  }

  function saveEdit() {
    if (editingIdx === null) return;
    const val = editValue.trim();
    if (val) {
      setColumns((prev) =>
        prev.map((c, i) => (i === editingIdx ? { ...c, label: val, key: val.replace(/\s+/g, '_').toLowerCase() } : c)),
      );
    }
    setEditingIdx(null);
    setEditValue('');
  }

  function removeColumn(idx) {
    setColumns((prev) => prev.filter((_, i) => i !== idx));
  }

  function addColumn() {
    const name = `New Column ${columns.length + 1}`;
    const newIdx = columns.length;
    setColumns((prev) => [...prev, { key: name.replace(/\s+/g, '_').toLowerCase(), label: name }]);
    // Auto-enter edit mode on the new column
    setEditingIdx(newIdx);
    setEditValue(name);
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') saveEdit();
    if (e.key === 'Escape') {
      setEditingIdx(null);
      setEditValue('');
    }
  }

  // ── Pointer-based drag-and-drop with smooth animation ──
  const handlePointerDown = useCallback(
    (e, idx) => {
      if (editingIdx !== null) return;
      // Only start drag on primary button
      if (e.button !== 0) return;
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);

      // Snapshot all item rects for hit testing
      const container = containerRef.current;
      if (container) {
        const items = container.querySelectorAll('[data-col-idx]');
        itemRectsRef.current = Array.from(items).map((el) => el.getBoundingClientRect());
      }

      const rect = e.currentTarget.getBoundingClientRect();
      ghostOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      dragOriginIdx.current = idx;
      setDragIdx(idx);
      setGhostPos({ x: e.clientX - ghostOffset.current.x, y: e.clientY - ghostOffset.current.y });
      setLiveColumns([...columns]);
    },
    [columns, editingIdx],
  );

  const handlePointerMove = useCallback(
    (e) => {
      if (dragIdx === null) return;
      e.preventDefault();
      const x = e.clientX - ghostOffset.current.x;
      const y = e.clientY - ghostOffset.current.y;
      setGhostPos({ x, y });

      // Find which item we're hovering over
      const cx = e.clientX;
      const cy = e.clientY;
      let hoverIdx = -1;
      for (let i = 0; i < itemRectsRef.current.length; i++) {
        const r = itemRectsRef.current[i];
        if (cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom) {
          hoverIdx = i;
          break;
        }
      }

      if (hoverIdx >= 0 && hoverIdx !== dragIdx) {
        // Reorder live columns smoothly
        setLiveColumns((prev) => {
          const next = [...prev];
          const [moved] = next.splice(dragIdx, 1);
          next.splice(hoverIdx, 0, moved);
          return next;
        });
        setDragIdx(hoverIdx);

        // Re-snapshot rects after reorder (next frame)
        requestAnimationFrame(() => {
          const container = containerRef.current;
          if (container) {
            const items = container.querySelectorAll('[data-col-idx]');
            itemRectsRef.current = Array.from(items).map((el) => el.getBoundingClientRect());
          }
        });
      }
    },
    [dragIdx],
  );

  const handlePointerUp = useCallback(
    (e) => {
      if (dragIdx === null) return;
      // Commit the reorder
      setColumns([...liveColumns]);
      setDragIdx(null);
      dragOriginIdx.current = null;
    },
    [dragIdx, liveColumns, setColumns],
  );

  // Cleanup if pointer leaves window
  useEffect(() => {
    const handleUp = () => {
      if (dragIdx !== null) {
        setColumns([...liveColumns]);
        setDragIdx(null);
        dragOriginIdx.current = null;
      }
    };
    window.addEventListener('pointerup', handleUp);
    return () => window.removeEventListener('pointerup', handleUp);
  }, [dragIdx, liveColumns, setColumns]);

  const displayColumns = dragIdx !== null ? liveColumns : columns;

  return (
    <div className="glass rounded-squircle shadow-glass p-7">
      <h2 className="text-[15px] font-bold text-slate-800 mb-1.5 flex items-center gap-3">
        <div className="w-8 h-8 rounded-[10px] bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center flex-shrink-0 shadow-sm shadow-emerald-500/20">
          <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none">
            <path d="M3 6h18M3 12h12M3 18h8" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" />
            <path
              d="M19 14l2 2-2 2"
              stroke="currentColor"
              strokeWidth={1.6}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        Course Map Columns
      </h2>
      <p className="text-xs text-slate-400 mb-5 ml-[42px]">
        Click to enable/disable, drag to reorder, double-click to rename
      </p>

      <div ref={containerRef} className="flex flex-wrap gap-2">
        {/* Fixed first column */}
        <span className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-squircle-xs text-xs font-semibold bg-indigo-100/60 text-indigo-700 border border-indigo-200/40">
          Week/Module [Topic]
          <svg className="w-3 h-3 text-indigo-400" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
              clipRule="evenodd"
            />
          </svg>
        </span>

        {displayColumns.map((col, idx) => (
          <span
            key={col.key}
            data-col-idx={idx}
            onPointerDown={(e) => handlePointerDown(e, idx)}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            className={`group inline-flex items-center gap-1 transition-all duration-200 ease-out ${
              dragIdx === idx ? 'opacity-30 scale-95' : ''
            }`}
            style={{ touchAction: 'none' }}
          >
            {editingIdx !== null && displayColumns[editingIdx]?.key === col.key ? (
              <input
                autoFocus
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={saveEdit}
                onKeyDown={handleKeyDown}
                className="input-glass px-3 py-1.5 rounded-squircle-xs text-xs font-medium focus:outline-none w-40"
              />
            ) : (
              <span
                onClick={() => {
                  clearTimeout(clickTimer.current);
                  clickTimer.current = setTimeout(() => toggleColumn(idx), 200);
                }}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  clearTimeout(clickTimer.current);
                  startEdit(idx);
                }}
                className={`tactile inline-flex items-center gap-1.5 px-3.5 py-2 rounded-squircle-xs text-xs font-medium border cursor-grab active:cursor-grabbing select-none transition-all duration-200 ${
                  col.enabled === false
                    ? 'bg-slate-100/40 text-slate-400 border-slate-200/30 line-through decoration-slate-300'
                    : 'bg-indigo-100/60 text-indigo-700 border-indigo-200/40 hover:bg-indigo-100/80 hover:border-indigo-300/50'
                }`}
              >
                <svg
                  className={`w-3 h-3 flex-shrink-0 ${col.enabled === false ? 'text-slate-300' : 'text-indigo-400'}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
                </svg>
                {col.label}
                <button
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    removeColumn(idx);
                  }}
                  className="opacity-0 group-hover:opacity-100 ml-0.5 p-0.5 text-indigo-300 hover:text-red-400 transition-all rounded"
                  aria-label={`Remove column ${col.label}`}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </span>
            )}
          </span>
        ))}

        {/* Add column */}
        <button
          onClick={addColumn}
          className="tactile inline-flex items-center gap-1.5 px-3.5 py-2 rounded-squircle-xs text-xs font-medium text-slate-400 border border-dashed border-slate-200/60 hover:border-indigo-400/40 hover:text-indigo-500 hover:bg-indigo-50/30 transition-all duration-200"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Column
        </button>
      </div>

      {/* Floating ghost that follows the cursor */}
      {dragIdx !== null && displayColumns[dragIdx] && (
        <div
          className="fixed z-50 pointer-events-none"
          style={{
            left: ghostPos.x,
            top: ghostPos.y,
            transition: 'left 16ms linear, top 16ms linear',
          }}
        >
          <span className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-squircle-xs text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-300 shadow-xl shadow-indigo-500/25 scale-105 rotate-[2deg]">
            <svg
              className="w-3 h-3 text-indigo-400 flex-shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
            </svg>
            {displayColumns[dragIdx].label}
          </span>
        </div>
      )}
    </div>
  );
}
