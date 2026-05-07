import React, { useMemo, useState } from 'react';
import { formatDeveloperDiffItem } from '../../lib/developerIdeDiagnostics.js';
import { searchDeveloperHistory } from '../../lib/developerIdeHistory.js';

function formatHistoryTime(timestamp) {
  if (!timestamp) return 'Unknown time';
  try {
    return new Date(timestamp).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return 'Unknown time';
  }
}

const SECTION_LABELS = {
  courseMap: 'Course Map',
  deliverables: 'Deliverables',
  config: 'Config',
  raw: 'Raw JSON',
};

export default function DeveloperModeSidebar({
  isEditorSection,
  query,
  onQueryChange,
  onFindNext,
  matchCount,
  activeValidation,
  changes = [],
  canShowTemplateSave,
  templateName,
  onTemplateNameChange,
  onSaveTemplate,
  canSaveTemplate,
  checkpointName = '',
  onCheckpointNameChange,
  canNameCheckpoint = false,
  developerHistory = [],
  onRollback,
  onRestoreHistorySnapshot,
  canRestoreHistorySnapshot,
  onClearHistory,
  dirtySections = new Set(),
  onApplySection,
  onResetSectionById,
  destructiveChanges = [],
  destructiveDeletesReviewed = false,
  onDestructiveDeletesReviewedChange,
  onFindingClick,
  onFindingPathCopy,
  onChangeClick,
}) {
  const [historyQuery, setHistoryQuery] = useState('');
  const dirtySectionIds = Array.from(dirtySections);
  const filteredDeveloperHistory = useMemo(
    () => searchDeveloperHistory(developerHistory, historyQuery),
    [developerHistory, historyQuery],
  );
  const visibleDeveloperHistory = filteredDeveloperHistory.slice(0, 4);

  return (
    <aside className="flex min-h-0 flex-col gap-3 overflow-y-auto bg-white px-4 py-4 dark:bg-slate-950">
      {isEditorSection && (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Search</p>
          <div className="mt-2 flex gap-2">
            <input
              value={query}
              onChange={(e) => onQueryChange?.(e.target.value)}
              className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-700 outline-none focus:border-indigo-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              placeholder="Find in section"
            />
            <button
              onClick={onFindNext}
              className="tactile rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Find
            </button>
          </div>
          <p className="mt-1 text-[10px] text-slate-400">
            {query.trim() ? `${matchCount} matches` : 'Search the active editor'}
          </p>
        </div>
      )}

      <div className="rounded-xl border border-slate-200/70 bg-slate-50 px-3 py-3 dark:border-slate-700 dark:bg-slate-900">
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Validation</p>
        <p
          className={`mt-2 text-[11px] leading-5 ${activeValidation.ok ? 'text-slate-600 dark:text-slate-300' : 'text-red-600 dark:text-red-300'}`}
        >
          {activeValidation.message}
        </p>
        {activeValidation.findings?.length > 0 && (
          <ul className="mt-3 space-y-2">
            {activeValidation.findings.slice(0, 6).map((finding, index) => (
              <li
                key={`${finding.path}-${finding.message}-${index}`}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 dark:border-slate-700 dark:bg-slate-950"
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`text-[10px] font-bold uppercase tracking-wide ${
                      finding.level === 'error'
                        ? 'text-red-500 dark:text-red-300'
                        : finding.level === 'warning'
                          ? 'text-amber-500 dark:text-amber-300'
                          : 'text-indigo-500 dark:text-indigo-300'
                    }`}
                  >
                    {finding.level}
                  </span>
                  <div className="flex min-w-0 items-center gap-1.5">
                    <button
                      type="button"
                      data-testid="developer-validation-path"
                      data-path={finding.path}
                      onClick={() => onFindingClick?.(finding)}
                      className="min-w-0 truncate rounded px-1 py-0.5 text-left font-mono text-[10px] text-indigo-500 hover:bg-indigo-50 dark:text-indigo-300 dark:hover:bg-indigo-500/10"
                      title={`Jump to ${finding.path}`}
                    >
                      {finding.path}
                    </button>
                    <button
                      type="button"
                      data-testid="developer-validation-copy-path"
                      data-path={finding.path}
                      onClick={() => onFindingPathCopy?.(finding)}
                      className="tactile shrink-0 rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-bold text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                      aria-label={`Copy JSON path ${finding.path}`}
                      title={`Copy ${finding.path}`}
                    >
                      Copy
                    </button>
                  </div>
                </div>
                <p className="mt-1 text-[11px] leading-4 text-slate-500 dark:text-slate-400">{finding.message}</p>
              </li>
            ))}
            {activeValidation.findings.length > 6 && (
              <li className="text-[10px] font-semibold text-slate-400">
                +{activeValidation.findings.length - 6} more findings in Diagnostics
              </li>
            )}
          </ul>
        )}
      </div>

      <div className="rounded-xl border border-slate-200/70 bg-slate-50 px-3 py-3 dark:border-slate-700 dark:bg-slate-900">
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Changes</p>
        {dirtySectionIds.length > 0 && (
          <div className="mt-3 space-y-2">
            {dirtySectionIds.map((sectionId) => (
              <div
                key={sectionId}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 dark:border-slate-700 dark:bg-slate-950"
              >
                <p className="text-[11px] font-bold text-slate-700 dark:text-slate-200">
                  {SECTION_LABELS[sectionId] || sectionId}
                </p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => onApplySection?.(sectionId)}
                    className="tactile rounded-md bg-indigo-500 px-2 py-1.5 text-[10px] font-bold text-white hover:bg-indigo-600"
                  >
                    Apply Section
                  </button>
                  <button
                    type="button"
                    onClick={() => onResetSectionById?.(sectionId)}
                    className="tactile rounded-md border border-slate-200 px-2 py-1.5 text-[10px] font-bold text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    Reset
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        {destructiveChanges.length > 0 && (
          <div
            data-testid="developer-destructive-delete-preview"
            className="mt-3 rounded-lg border border-red-200 bg-red-50 px-2.5 py-2 dark:border-red-500/40 dark:bg-red-500/10"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] font-bold uppercase tracking-wide text-red-500 dark:text-red-300">
                Destructive Deletes
              </p>
              <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-red-500 dark:bg-slate-950 dark:text-red-300">
                {destructiveChanges.length}
              </span>
            </div>
            <p className="mt-1 text-[11px] leading-4 text-red-600 dark:text-red-200">
              These staged edits remove workspace data. Review the affected paths before applying.
            </p>
            <ul className="mt-2 space-y-1">
              {destructiveChanges.slice(0, 5).map((change) => (
                <li
                  key={`${change.type}-${change.path}`}
                  className="min-w-0 text-[10px] text-red-600 dark:text-red-200"
                >
                  <button
                    type="button"
                    data-testid="developer-destructive-delete-path"
                    data-path={change.path}
                    onClick={() => onChangeClick?.(change)}
                    className="block w-full break-all rounded px-1 py-0.5 text-left font-mono hover:bg-red-100 dark:hover:bg-red-500/20"
                    title={`Jump to ${change.path}`}
                  >
                    {formatDeveloperDiffItem(change)}
                  </button>
                </li>
              ))}
              {destructiveChanges.length > 5 && (
                <li className="text-[10px] font-semibold text-red-400">
                  +{destructiveChanges.length - 5} more destructive changes
                </li>
              )}
            </ul>
            <label className="mt-2 flex items-start gap-2 text-[11px] font-semibold leading-4 text-red-700 dark:text-red-200">
              <input
                type="checkbox"
                data-testid="developer-destructive-delete-review"
                checked={destructiveDeletesReviewed}
                onChange={(event) => onDestructiveDeletesReviewedChange?.(event.target.checked)}
                className="mt-0.5 h-3.5 w-3.5 rounded border-red-300 text-red-500 focus:ring-red-400"
              />
              I reviewed these deletes.
            </label>
          </div>
        )}
        {changes.length > 0 ? (
          <ul className="mt-2 space-y-1.5">
            {changes.map((change) => (
              <li
                key={`${change.type}-${change.path}`}
                className="flex items-start gap-2 text-[11px] text-slate-600 dark:text-slate-300"
              >
                <span
                  className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                    change.type === 'added'
                      ? 'bg-emerald-400'
                      : change.type === 'removed'
                        ? 'bg-red-400'
                        : 'bg-indigo-400'
                  }`}
                />
                <span className="min-w-0">
                  <button
                    type="button"
                    data-testid="developer-change-path"
                    data-path={change.path}
                    onClick={() => onChangeClick?.(change)}
                    className="block break-all rounded px-1 py-0.5 text-left font-semibold text-indigo-500 hover:bg-indigo-50 dark:text-indigo-300 dark:hover:bg-indigo-500/10"
                    title={`Jump to ${change.path}`}
                  >
                    {formatDeveloperDiffItem(change)}
                  </button>
                  <span className="block truncate text-[10px] text-slate-400">
                    {change.beforeSummary} {'->'} {change.afterSummary}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-[11px] text-slate-400">No pending workspace changes.</p>
        )}
      </div>

      {canShowTemplateSave && (
        <div className="rounded-xl border border-indigo-200/70 bg-indigo-50/60 px-3 py-3 dark:border-indigo-500/40 dark:bg-indigo-500/10">
          <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-500 dark:text-indigo-300">
            Template
          </p>
          <p className="mt-2 text-[11px] leading-5 text-slate-500 dark:text-slate-400">
            Save this setup for future projects. Course content and generated outputs are not included.
          </p>
          <input
            value={templateName}
            onChange={(e) => onTemplateNameChange?.(e.target.value)}
            className="mt-3 w-full rounded-lg border border-indigo-200 bg-white px-3 py-2 text-[11px] text-slate-700 outline-none focus:border-indigo-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            placeholder="Template name"
          />
          <button
            onClick={onSaveTemplate}
            disabled={!canSaveTemplate}
            className="tactile mt-2 w-full rounded-lg bg-indigo-500 px-3 py-2 text-[11px] font-semibold text-white hover:bg-indigo-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Save as Developer Template
          </button>
        </div>
      )}

      <div className="rounded-xl border border-slate-200/70 bg-slate-50 px-3 py-3 dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Safety</p>
          <span className="rounded-full bg-white px-2 py-1 text-[10px] font-bold text-slate-400 dark:bg-slate-950">
            {historyQuery.trim()
              ? `${filteredDeveloperHistory.length}/${developerHistory.length} saves`
              : `${developerHistory.length} saves`}
          </span>
        </div>
        <p className="mt-2 text-[11px] leading-5 text-slate-500 dark:text-slate-400">
          Saves validate JSON syntax, schema, and cross-field references first. A failed save keeps your current
          workspace unchanged.
        </p>
        <label className="mt-3 block">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Next Checkpoint</span>
          <input
            data-testid="developer-checkpoint-name"
            value={checkpointName}
            onChange={(event) => onCheckpointNameChange?.(event.target.value)}
            disabled={!canNameCheckpoint}
            maxLength={80}
            className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-700 outline-none focus:border-indigo-300 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
            placeholder={canNameCheckpoint ? 'Name next save' : 'Edit a section to name the next save'}
          />
        </label>
        <button
          onClick={onRollback}
          disabled={
            developerHistory.length === 0 || !canRestoreHistorySnapshot?.(developerHistory[0], 'beforeSnapshot')
          }
          className="tactile mt-3 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          Rollback Latest Save
        </button>
        {developerHistory.length > 0 && (
          <div className="mt-3 space-y-2">
            <label className="block">
              <span className="sr-only">Search developer save history</span>
              <input
                data-testid="developer-history-search"
                value={historyQuery}
                onChange={(event) => setHistoryQuery(event.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-700 outline-none focus:border-indigo-300 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                placeholder="Search saves by section or path"
              />
            </label>
            {visibleDeveloperHistory.map((entry) => (
              <div
                key={entry.id}
                data-testid="developer-history-entry"
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 dark:border-slate-700 dark:bg-slate-950"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    {entry.label ? (
                      <>
                        <p
                          data-testid="developer-history-label"
                          className="truncate text-[11px] font-bold text-slate-700 dark:text-slate-200"
                        >
                          {entry.label}
                        </p>
                        <p className="mt-0.5 text-[10px] text-slate-400">{formatHistoryTime(entry.createdAt)}</p>
                      </>
                    ) : (
                      <p className="truncate text-[11px] font-bold text-slate-700 dark:text-slate-200">
                        {formatHistoryTime(entry.createdAt)}
                      </p>
                    )}
                    <p className="mt-0.5 text-[10px] text-slate-400">
                      {(entry.dirtySections || []).join(', ') || 'workspace'} - {(entry.changes || []).length} changes
                    </p>
                    {entry.restorable === false && (
                      <p className="mt-0.5 text-[10px] font-semibold text-amber-500">
                        Restore unavailable: {entry.secretBlocked ? 'secret-safe summary only' : 'patch too large'}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button
                      onClick={() =>
                        onRestoreHistorySnapshot?.(
                          entry,
                          'beforeSnapshot',
                          'Restored snapshot from before this developer save.',
                        )
                      }
                      disabled={!canRestoreHistorySnapshot?.(entry, 'beforeSnapshot')}
                      className="tactile rounded-md border border-slate-200 px-2 py-1 text-[10px] font-bold text-slate-500 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                    >
                      Before
                    </button>
                    <button
                      onClick={() =>
                        onRestoreHistorySnapshot?.(
                          entry,
                          'afterSnapshot',
                          'Restored snapshot from after this developer save.',
                        )
                      }
                      disabled={!canRestoreHistorySnapshot?.(entry, 'afterSnapshot')}
                      className="tactile rounded-md border border-slate-200 px-2 py-1 text-[10px] font-bold text-slate-500 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                    >
                      After
                    </button>
                  </div>
                </div>
                {(entry.changes || []).length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {entry.changes.slice(0, 2).map((change) => (
                      <li
                        key={`${entry.id}-${change.type}-${change.path}`}
                        className="truncate text-[10px] text-slate-400"
                      >
                        {formatDeveloperDiffItem(change)}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
            {filteredDeveloperHistory.length === 0 && (
              <p
                data-testid="developer-history-empty-search"
                className="rounded-lg border border-slate-200 bg-white px-3 py-3 text-[11px] font-medium text-slate-400 dark:border-slate-700 dark:bg-slate-950"
              >
                No saved developer edits match this search.
              </p>
            )}
            <button
              onClick={onClearHistory}
              className="tactile w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] font-semibold text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Clear Local History
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
