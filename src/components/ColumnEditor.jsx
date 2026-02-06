import React, { useState, useRef } from 'react';

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
  const [dragIdx, setDragIdx] = useState(null);
  const [dragOverIdx, setDragOverIdx] = useState(null);
  const dragNodeRef = useRef(null);

  function startEdit(idx) {
    setEditingIdx(idx);
    setEditValue(columns[idx].label);
  }

  function saveEdit() {
    if (editingIdx === null) return;
    const val = editValue.trim();
    if (val) {
      setColumns((prev) =>
        prev.map((c, i) =>
          i === editingIdx ? { ...c, label: val, key: val.replace(/\s+/g, '_').toLowerCase() } : c
        )
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
    setColumns((prev) => [
      ...prev,
      { key: name.replace(/\s+/g, '_').toLowerCase(), label: name },
    ]);
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') saveEdit();
    if (e.key === 'Escape') {
      setEditingIdx(null);
      setEditValue('');
    }
  }

  // ── Drag-and-drop reordering ──
  function handleDragStart(e, idx) {
    setDragIdx(idx);
    dragNodeRef.current = e.target;
    e.dataTransfer.effectAllowed = 'move';
    // Make the drag image semi-transparent
    requestAnimationFrame(() => {
      if (dragNodeRef.current) dragNodeRef.current.style.opacity = '0.4';
    });
  }

  function handleDragEnd() {
    if (dragNodeRef.current) dragNodeRef.current.style.opacity = '1';
    setDragIdx(null);
    setDragOverIdx(null);
    dragNodeRef.current = null;
  }

  function handleDragOver(e, idx) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (idx !== dragOverIdx) setDragOverIdx(idx);
  }

  function handleDrop(e, dropIdx) {
    e.preventDefault();
    if (dragIdx === null || dragIdx === dropIdx) return;
    setColumns((prev) => {
      const next = [...prev];
      const [moved] = next.splice(dragIdx, 1);
      next.splice(dropIdx, 0, moved);
      return next;
    });
    setDragIdx(null);
    setDragOverIdx(null);
  }

  return (
    <div className="glass rounded-squircle shadow-glass p-7">
      <h2 className="text-[15px] font-bold text-slate-800 mb-1.5 flex items-center gap-3">
        <div className="w-8 h-8 rounded-[10px] bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center flex-shrink-0 shadow-sm shadow-emerald-500/20">
          <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
          </svg>
        </div>
        Course Map Columns
      </h2>
      <p className="text-xs text-slate-400 mb-5 ml-[42px]">
        Drag to reorder, click to edit, or add/remove columns
      </p>

      <div className="flex flex-wrap gap-2">
        {/* Fixed first column */}
        <span className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-squircle-xs text-xs font-semibold bg-indigo-100/60 text-indigo-700 border border-indigo-200/40">
          Week/Module [Topic]
          <svg className="w-3 h-3 text-indigo-400" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
          </svg>
        </span>

        {columns.map((col, idx) => (
          <span
            key={col.key + idx}
            draggable={editingIdx !== idx}
            onDragStart={(e) => handleDragStart(e, idx)}
            onDragEnd={handleDragEnd}
            onDragOver={(e) => handleDragOver(e, idx)}
            onDrop={(e) => handleDrop(e, idx)}
            className={`group inline-flex items-center gap-1 transition-all duration-150 ${
              dragOverIdx === idx && dragIdx !== idx ? 'ring-2 ring-indigo-400/60 ring-offset-1 rounded-squircle-xs' : ''
            }`}
          >
            {editingIdx === idx ? (
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
                onClick={() => startEdit(idx)}
                className="tactile inline-flex items-center gap-1.5 px-3.5 py-2 rounded-squircle-xs text-xs font-medium bg-white/60 text-slate-600 border border-white/40 cursor-grab hover:bg-indigo-50/50 hover:text-indigo-600 hover:border-indigo-200/40 transition-all duration-200 active:cursor-grabbing"
              >
                <svg className="w-3 h-3 text-slate-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
                </svg>
                {col.label}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeColumn(idx);
                  }}
                  className="opacity-0 group-hover:opacity-100 ml-0.5 text-slate-300 hover:text-red-400 transition-all"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
    </div>
  );
}
