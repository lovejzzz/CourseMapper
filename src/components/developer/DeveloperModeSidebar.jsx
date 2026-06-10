import React, { useMemo, useState } from 'react';
import { formatDeveloperDiffItem } from '../../lib/developerIdeDiagnostics.js';
import { searchDeveloperHistory } from '../../lib/developerIdeHistory.js';
import { getApiCallBudgetTotal } from '../../lib/apiCallBudget.js';
import {
  summarizeApiFeatureUsageBudget,
  summarizeApiUsageBudget,
  summarizeCompilerSavings,
} from '../../lib/apiUsageCost.js';
import { getCustomDeliverable } from '../../lib/customDeliverableLibrary.js';
import { FEATURES } from '../../lib/featureCatalog.js';

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

function getDeveloperFeatureLabel(featureId) {
  if (!featureId) return '';
  if (String(featureId).startsWith('custom_')) {
    return getCustomDeliverable(featureId)?.name || 'Custom Deliverable';
  }
  return FEATURES.find((feature) => feature.id === featureId)?.label || '';
}

function formatBudgetEventTime(timestamp) {
  if (!timestamp) return '';
  try {
    return new Date(timestamp).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', second: '2-digit' });
  } catch {
    return '';
  }
}

function formatFailureClass(value) {
  return String(value || 'unknown')
    .split(/[_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function formatCostStatus(value) {
  return String(value || 'ok')
    .split(/[_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function ApiCallBudgetCard({ budget }) {
  if (!budget) return null;
  const total = getApiCallBudgetTotal(budget);
  const costControl = budget.costControl || {};
  const costPlan = budget.costPlan || {};
  const usageSummary = summarizeApiUsageBudget(budget);
  const featureUsageSummary = summarizeApiFeatureUsageBudget(budget, {
    limit: 5,
    labelForFeature: getDeveloperFeatureLabel,
  });
  const compilerSummary = summarizeCompilerSavings(budget, { labelForFeature: getDeveloperFeatureLabel });
  const reservedCalls =
    costPlan.plannedNewCalls ??
    (costPlan.cumulative && Number.isFinite(costPlan.baseProviderCalls)
      ? Math.max(0, (Number(costPlan.plannedCalls) || 0) - costPlan.baseProviderCalls)
      : Number(costPlan.plannedCalls) || 0);
  const counters = [
    ['Model discovery', budget.modelDiscoveryCalls || 0],
    ['Credit checks', budget.creditCheckCalls || 0],
    ['Capability probes', budget.capabilityProbeCalls || 0],
    ['Course map', budget.courseMapCalls || 0],
    ['Deliverable chunks', budget.deliverableChunkCalls || 0],
    ['Blueprint enrichment', budget.blueprintEnrichmentCalls || 0],
    ['Repair/retry', budget.repairRetryCalls || 0],
    ['Stream retries', budget.streamRetryCalls ?? budget.retriedCalls ?? 0],
    ['Provider fallback', budget.providerFallbackCalls || 0],
    ['Agent loop', budget.agentLoopCalls || 0],
    ['Image generation', budget.imageGenerationCalls || 0],
    ['Failed', budget.failedCalls || 0],
  ];
  const failureClasses = Object.entries(budget.failureClasses || {})
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1]);
  const events = Array.isArray(budget.recentEvents) ? budget.recentEvents.slice(0, 6) : [];

  return (
    <section
      data-testid="developer-api-call-budget"
      className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-3 text-indigo-900 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-100"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-500 dark:text-indigo-300">
            API call budget
          </p>
          <p className="mt-0.5 text-[11px] font-semibold">Current run: {total} provider calls</p>
        </div>
        {budget.skippedExamineCalls > 0 && (
          <span className="rounded-full bg-white/70 px-2 py-0.5 text-[9px] font-bold text-emerald-600 dark:bg-slate-900/70 dark:text-emerald-300">
            {budget.skippedExamineCalls} review saved
          </span>
        )}
      </div>
      {(costControl.status || costPlan.plannedCalls) && (
        <div
          data-testid="developer-api-cost-control"
          className="mt-2 rounded-lg border border-indigo-100 bg-white/70 px-2 py-1.5 dark:border-indigo-500/20 dark:bg-slate-900/70"
          title={costControl.reason || ''}
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-[9px] font-bold uppercase tracking-wide opacity-60">Cost control</p>
            <span
              className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${
                costControl.shouldStopRetries
                  ? 'bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-200'
                  : costControl.status && costControl.status !== 'ok'
                    ? 'bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-200'
                    : 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-200'
              }`}
            >
              {formatCostStatus(costControl.status)}
            </span>
          </div>
          <p className="mt-1 text-[11px] font-semibold">
            {costControl.totalProviderCalls ?? total} actual calls
            {reservedCalls ? ` · ${reservedCalls} reserved` : ''}
            {costControl.hardCallLimit ? ` · hard stop ${costControl.hardCallLimit}` : ''}
          </p>
          {usageSummary && (
            <p className="mt-0.5 text-[10px] font-semibold opacity-75">
              Spend {usageSummary.label} ({usageSummary.inputTokensDisplay} in / {usageSummary.outputTokensDisplay} out)
              {usageSummary.reasoningOutputTokensDisplay
                ? ` · ${usageSummary.reasoningOutputTokensDisplay} reasoning`
                : ''}
            </p>
          )}
          {compilerSummary && (
            <p data-testid="developer-compiler-receipt" className="mt-0.5 text-[10px] font-semibold opacity-75">
              {compilerSummary.label}
              {compilerSummary.featureList ? `: ${compilerSummary.featureList}` : ''}
            </p>
          )}
          {costControl.reason && <p className="mt-0.5 line-clamp-2 text-[9px] opacity-70">{costControl.reason}</p>}
          {costControl.remainingBeforeHardLimit !== null && costControl.remainingBeforeHardLimit !== undefined && (
            <p className="mt-0.5 text-[9px] font-semibold opacity-60">
              {costControl.remainingBeforeHardLimit} calls before hard stop
            </p>
          )}
        </div>
      )}
      {featureUsageSummary.length > 0 && (
        <div
          data-testid="developer-feature-spend"
          className="mt-2 rounded-lg border border-indigo-100 bg-white/70 px-2 py-1.5 dark:border-indigo-500/20 dark:bg-slate-900/70"
        >
          <p className="text-[9px] font-bold uppercase tracking-wide opacity-60">Spend by feature</p>
          <div className="mt-1 space-y-1">
            {featureUsageSummary.map((summary) => (
              <div key={summary.featureId} className="flex items-center justify-between gap-2 text-[10px]">
                <span className="min-w-0 truncate font-semibold">{summary.label}</span>
                <span className="flex-shrink-0 font-medium opacity-75">
                  {summary.costDisplay || 'Cost unknown'} · {summary.totalTokensDisplay}
                  {summary.estimated ? ' est.' : ''}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
      <dl className="mt-2 grid grid-cols-2 gap-1.5">
        {counters.map(([label, value]) => (
          <div key={label} className="rounded-lg bg-white/65 px-2 py-1 dark:bg-slate-900/60">
            <dt className="text-[9px] font-semibold uppercase tracking-wide opacity-60">{label}</dt>
            <dd className="text-[12px] font-bold">{value}</dd>
          </div>
        ))}
      </dl>
      {events.length > 0 && (
        <div className="mt-2 space-y-1">
          {failureClasses.length > 0 && (
            <div
              data-testid="developer-api-failure-breakdown"
              className="rounded-lg border border-rose-200 bg-white/70 px-2 py-1.5 dark:border-rose-500/30 dark:bg-slate-900/70"
            >
              <p className="text-[9px] font-bold uppercase tracking-wide text-rose-500 dark:text-rose-300">
                Failure classes
              </p>
              <div className="mt-1 flex flex-wrap gap-1">
                {failureClasses.map(([failureClass, count]) => (
                  <span
                    key={failureClass}
                    data-testid="developer-api-failure-class"
                    className="rounded-full bg-rose-50 px-2 py-0.5 text-[9px] font-bold text-rose-600 dark:bg-rose-500/15 dark:text-rose-200"
                  >
                    {formatFailureClass(failureClass)} {count}
                  </span>
                ))}
              </div>
            </div>
          )}
          {events.map((event, index) => (
            <div
              key={`${event.at}-${event.label}-${index}`}
              className="rounded-lg bg-white/50 px-2 py-1 dark:bg-slate-900/45"
              title={[event.detail, event.userMessage, event.provider, event.modelId].filter(Boolean).join(' · ')}
            >
              <p className="truncate text-[10px] font-medium opacity-80">
                {formatBudgetEventTime(event.at)} · {event.label}
              </p>
              {(event.failureClass || event.statusCode || event.retryable !== undefined) && (
                <p className="mt-0.5 truncate text-[9px] font-semibold text-rose-600 dark:text-rose-300">
                  {event.failureClass ? formatFailureClass(event.failureClass) : 'Provider failure'}
                  {event.statusCode ? ` · ${event.statusCode}` : ''}
                  {event.retryable !== undefined ? ` · ${event.retryable ? 'retryable' : 'no retry'}` : ''}
                </p>
              )}
              {event.userMessage && (
                <p className="truncate text-[9px] font-medium text-slate-500 dark:text-slate-400">
                  {event.userMessage}
                </p>
              )}
              {event.totalTokens > 0 && (
                <p className="truncate text-[9px] font-medium text-slate-500 dark:text-slate-400">
                  {event.costUsd !== null && event.costUsd !== undefined
                    ? `$${Number(event.costUsd).toFixed(Number(event.costUsd) < 0.01 ? 4 : 2)}`
                    : 'Cost unknown'}{' '}
                  · {event.totalTokens} tokens{event.usageEstimated || event.costEstimated ? ' estimated' : ''}
                </p>
              )}
              {event.type === 'compiledDeliverable' && (
                <p className="truncate text-[9px] font-medium text-emerald-600 dark:text-emerald-300">
                  {event.compiledFeatureCount || event.compiledFeatureIds?.length || 0} compiled
                  {event.savedProviderCalls ? ` · ~${event.savedProviderCalls} calls saved` : ''}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

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
  apiCallBudget,
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
      <ApiCallBudgetCard budget={apiCallBudget} />
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
