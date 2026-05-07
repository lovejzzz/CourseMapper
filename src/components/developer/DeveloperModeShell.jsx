import React from 'react';
import FocusTrap from 'focus-trap-react';

export default function DeveloperModeShell({
  sections,
  activeSection,
  dirtySections,
  stats,
  activeValidation,
  status,
  onSectionChange,
  onReload,
  onClose,
  onResetSection,
  canResetSection,
  onFormat,
  canFormat,
  onApply,
  canApply,
  mainContent,
  sidebar,
}) {
  const activeSectionMeta = sections.find(section => section.id === activeSection);

  return (
    <FocusTrap focusTrapOptions={{ clickOutsideDeactivates: false }}>
      <div className="fixed inset-0 z-[70] overflow-hidden bg-slate-950/35 backdrop-blur-[2px]">
        <section className="absolute inset-x-3 top-3 bottom-3 ml-auto w-[min(1120px,calc(100vw-1.5rem))] rounded-2xl border border-slate-200/70 bg-white shadow-2xl flex flex-col overflow-hidden animate-spring-in dark:border-slate-700/70 dark:bg-slate-950">
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-500">Developer Mode</p>
              <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">Workspace IDE</h2>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={onReload}
                className="tactile px-3 py-2 rounded-lg text-[11px] font-semibold text-slate-600 bg-white border border-slate-200/70 hover:bg-slate-50 transition-colors dark:bg-slate-900 dark:text-slate-300 dark:border-slate-700 dark:hover:bg-slate-800"
              >
                Reload
              </button>
              <button
                onClick={onClose}
                className="tactile p-2 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors dark:hover:bg-slate-800 dark:hover:text-slate-200"
                aria-label="Close developer mode"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          <div className="border-b border-slate-100 bg-slate-50/80 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/70">
            <div className="flex gap-2 overflow-x-auto">
              {sections.map((section) => {
                const isActive = section.id === activeSection;
                const isDirty = dirtySections.has(section.id);
                return (
                  <button
                    key={section.id}
                    onClick={() => onSectionChange(section.id)}
                    className={`min-w-[120px] flex-1 rounded-xl border px-3 py-2 text-left transition-all ${
                      isActive
                        ? 'border-indigo-200 bg-white shadow-sm dark:border-indigo-500/50 dark:bg-slate-800'
                        : 'border-transparent bg-transparent hover:bg-white/70 dark:hover:bg-slate-800/70'
                    }`}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className={`text-[11px] font-bold ${isActive ? 'text-indigo-600 dark:text-indigo-300' : 'text-slate-600 dark:text-slate-300'}`}>
                        {section.label}
                      </span>
                      {isDirty && <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />}
                    </span>
                    <span className="mt-0.5 block text-[10px] text-slate-400 dark:text-slate-500">{section.note}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_290px]">
            <div className="flex min-h-0 flex-col border-r border-slate-100 dark:border-slate-800">
              <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-2 dark:border-slate-800">
                <div className="min-w-0">
                  <p className="truncate text-[12px] font-bold text-slate-700 dark:text-slate-200">
                    {activeSectionMeta?.label}
                    {dirtySections.has(activeSection) && <span className="ml-2 text-[10px] font-semibold text-amber-500">Unsaved</span>}
                  </p>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500">{stats.join(' · ')}</p>
                </div>
                <div className={`rounded-full px-2 py-1 text-[10px] font-bold ${
                  activeValidation.ok
                    ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300'
                    : 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-300'
                }`}>
                  {activeValidation.ok ? 'Valid' : 'Needs fix'}
                </div>
              </div>

              {mainContent}
            </div>

            {sidebar}
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 dark:border-slate-800">
            <p className={`min-w-0 truncate text-[11px] ${
              status.type === 'error' ? 'text-red-600 dark:text-red-300' : status.type === 'success' ? 'text-emerald-600 dark:text-emerald-300' : 'text-slate-500 dark:text-slate-400'
            }`}>
              {status.message}
            </p>
            <div className="flex shrink-0 items-center gap-2">
              <button
                onClick={onResetSection}
                disabled={!canResetSection}
                className="tactile px-3 py-2 rounded-lg text-[11px] font-semibold text-slate-600 bg-white border border-slate-200/70 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors dark:bg-slate-900 dark:text-slate-300 dark:border-slate-700 dark:hover:bg-slate-800"
              >
                Reset Section
              </button>
              <button
                onClick={onFormat}
                disabled={!canFormat}
                className="tactile px-3 py-2 rounded-lg text-[11px] font-semibold text-slate-600 bg-white border border-slate-200/70 hover:bg-slate-50 transition-colors dark:bg-slate-900 dark:text-slate-300 dark:border-slate-700 dark:hover:bg-slate-800"
              >
                Format
              </button>
              <button
                onClick={onApply}
                disabled={!canApply}
                className="tactile px-4 py-2 rounded-lg text-[11px] font-semibold text-white bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Apply & Save
              </button>
            </div>
          </div>
        </section>
      </div>
    </FocusTrap>
  );
}
