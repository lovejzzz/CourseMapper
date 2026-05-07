import React, { useState } from 'react';
import { titleFromDeveloperId } from '../../lib/developerModeSelectors.js';

export default function DeveloperThemeLayoutPanel({
  currentConfig = {},
  onUpdateConfigPatch,
}) {
  const [dragColumnIndex, setDragColumnIndex] = useState(null);
  const [dragOverColumnIndex, setDragOverColumnIndex] = useState(null);
  const columns = Array.isArray(currentConfig.columns) ? currentConfig.columns : [];
  const features = Array.isArray(currentConfig.selectedFeatures) ? currentConfig.selectedFeatures : [];
  const slideThemeValue = currentConfig.slideTheme ?? '';

  function updateConfigPatch(patch, message) {
    onUpdateConfigPatch?.(patch, message);
  }

  function handleToggleColumn(index) {
    const nextColumns = [...columns];
    nextColumns[index] = {
      ...nextColumns[index],
      enabled: nextColumns[index]?.enabled === false,
    };
    updateConfigPatch({ columns: nextColumns }, 'Column visibility updated.');
  }

  function handleMoveColumn(fromIndex, toIndex) {
    const nextColumns = [...columns];
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= nextColumns.length || toIndex >= nextColumns.length) return;
    const [moved] = nextColumns.splice(fromIndex, 1);
    nextColumns.splice(toIndex, 0, moved);
    updateConfigPatch({ columns: nextColumns }, 'Column order updated.');
  }

  function handleColumnDragStart(index) {
    setDragColumnIndex(index);
    setDragOverColumnIndex(index);
  }

  function handleColumnDragOver(e, index) {
    e.preventDefault();
    if (dragColumnIndex === null) return;
    setDragOverColumnIndex(index);
  }

  function handleColumnDrop(e, index) {
    e.preventDefault();
    if (dragColumnIndex !== null) handleMoveColumn(dragColumnIndex, index);
    setDragColumnIndex(null);
    setDragOverColumnIndex(null);
  }

  function handleColumnDragEnd() {
    setDragColumnIndex(null);
    setDragOverColumnIndex(null);
  }

  function handleMoveFeature(featureId, direction) {
    const nextFeatures = [...features];
    const index = nextFeatures.indexOf(featureId);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= nextFeatures.length) return;
    [nextFeatures[index], nextFeatures[nextIndex]] = [nextFeatures[nextIndex], nextFeatures[index]];
    updateConfigPatch({ selectedFeatures: nextFeatures }, 'Deliverable tab order updated.');
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <section className="rounded-xl border border-slate-200/70 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Theme</p>
          <h3 className="mt-1 text-sm font-bold text-slate-800 dark:text-slate-100">Slide visual preset</h3>
          <select
            value={slideThemeValue}
            onChange={(e) => updateConfigPatch({ slideTheme: e.target.value === '' ? null : Number(e.target.value) }, 'Slide theme updated.')}
            className="mt-3 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[12px] font-semibold text-slate-700 outline-none focus:border-indigo-300 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
          >
            <option value="">Auto</option>
            {[0, 1, 2, 3, 4, 5].map(theme => (
              <option key={theme} value={theme}>Theme {theme + 1}</option>
            ))}
          </select>
          <p className="mt-3 text-[11px] leading-5 text-slate-500 dark:text-slate-400">
            This becomes the default visual style for generated slide deliverables and future templates saved from this IDE.
          </p>
        </section>

        <section className="rounded-xl border border-slate-200/70 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Navigation</p>
              <h3 className="mt-1 text-sm font-bold text-slate-800 dark:text-slate-100">Deliverable tab order</h3>
            </div>
          </div>
          <div className="mt-3 space-y-2">
            {features.length > 0 ? features.map((feature, index) => (
              <div key={`${feature}-${index}`} className="flex items-center gap-2 rounded-lg border border-slate-200/70 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-950">
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-white text-[10px] font-bold text-slate-500 dark:bg-slate-900 dark:text-slate-300">{index + 1}</span>
                <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-slate-700 dark:text-slate-200">{titleFromDeveloperId(feature)}</span>
                <button
                  onClick={() => handleMoveFeature(feature, -1)}
                  disabled={index === 0}
                  className="tactile rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-bold text-slate-500 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                >
                  Up
                </button>
                <button
                  onClick={() => handleMoveFeature(feature, 1)}
                  disabled={index === features.length - 1}
                  className="tactile rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-bold text-slate-500 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                >
                  Down
                </button>
              </div>
            )) : (
              <p className="rounded-lg border border-dashed border-slate-200 px-3 py-4 text-[12px] text-slate-400 dark:border-slate-700">No deliverable tabs selected.</p>
            )}
          </div>
        </section>
      </div>

      <section className="mt-4 rounded-xl border border-slate-200/70 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Course Map Layout</p>
            <h3 className="mt-1 text-sm font-bold text-slate-800 dark:text-slate-100">Visible columns</h3>
          </div>
          <button
            onClick={() => updateConfigPatch({ columns: columns.map(column => ({ ...column, enabled: true })) }, 'All course map columns enabled.')}
            disabled={columns.length === 0}
            className="tactile rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Enable All
          </button>
        </div>
        <p className="mt-2 text-[11px] text-slate-400 dark:text-slate-500">
          Check columns to show or hide them. Drag cards to change their left-to-right order in the Course Map.
        </p>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {columns.length > 0 ? columns.map((column, index) => (
            <div
              key={`${column.key || column.title || index}-${index}`}
              draggable
              onDragStart={() => handleColumnDragStart(index)}
              onDragOver={(e) => handleColumnDragOver(e, index)}
              onDrop={(e) => handleColumnDrop(e, index)}
              onDragEnd={handleColumnDragEnd}
              className={`group flex cursor-grab items-center gap-3 rounded-lg border px-3 py-2 transition-all duration-150 active:cursor-grabbing dark:bg-slate-950 ${
                dragColumnIndex === index
                  ? 'scale-[0.98] border-indigo-300 bg-indigo-50/70 opacity-60 shadow-sm dark:border-indigo-500/50 dark:bg-indigo-500/10'
                  : dragOverColumnIndex === index
                    ? 'border-indigo-300 bg-indigo-50/60 shadow-sm dark:border-indigo-500/50 dark:bg-indigo-500/10'
                    : 'border-slate-200/70 bg-slate-50 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800'
              }`}
            >
              <svg className="h-4 w-4 shrink-0 text-slate-300 transition-colors group-hover:text-indigo-400 dark:text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h.01M8 12h.01M8 17h.01M16 7h.01M16 12h.01M16 17h.01" />
              </svg>
              <input
                type="checkbox"
                checked={column.enabled !== false}
                onChange={(e) => {
                  e.stopPropagation();
                  handleToggleColumn(index);
                }}
                onClick={(e) => e.stopPropagation()}
                onDragStart={(e) => e.preventDefault()}
                className="h-4 w-4 rounded border-slate-300 text-indigo-500 focus:ring-indigo-300"
              />
              <span className="min-w-0">
                <span className="block truncate text-[12px] font-semibold text-slate-700 dark:text-slate-200">{column.title || titleFromDeveloperId(column.key)}</span>
                <span className="block truncate text-[10px] text-slate-400">{column.key || 'custom column'}</span>
              </span>
            </div>
          )) : (
            <p className="rounded-lg border border-dashed border-slate-200 px-3 py-4 text-[12px] text-slate-400 dark:border-slate-700">No columns are available in this project.</p>
          )}
        </div>
      </section>
    </div>
  );
}
