import React from 'react';
import {
  getDeveloperSnapshotFindings,
  isPlainObject,
} from '../../lib/developerIdeDiagnostics.js';
import {
  formatBytes,
  getDeveloperRuntimeDiagnostics,
} from '../../lib/developerRuntimeDiagnostics.js';
import { titleFromDeveloperId } from '../../lib/developerModeSelectors.js';

function buildDiagnostics(snapshot, dirtySections) {
  const lessons = Array.isArray(snapshot.courseMap?.lessons) ? snapshot.courseMap.lessons : [];
  const features = Array.isArray(snapshot.selectedFeatures) ? snapshot.selectedFeatures : [];
  const deliverables = isPlainObject(snapshot.deliverables) ? snapshot.deliverables : {};
  const columns = Array.isArray(snapshot.columns) ? snapshot.columns : [];
  const issues = [];
  const seenIssues = new Set();
  const addIssue = (issue) => {
    const key = `${issue.level}:${issue.path || ''}:${issue.message}`;
    if (seenIssues.has(key)) return;
    seenIssues.add(key);
    issues.push(issue);
  };

  getDeveloperSnapshotFindings(snapshot).forEach((finding) => {
    if (finding.path === 'selectedFeatures' && finding.message.includes('Course Map')) return;
    if (finding.path === 'activeTab') return;
    if (finding.path === 'courseMap.lessons') return;
    addIssue({
      level: finding.level,
      path: finding.path,
      message: finding.message,
    });
  });

  if (lessons.length === 0) addIssue({ level: 'error', path: 'courseMap.lessons', message: 'Course map has no lessons.' });
  if (!features.includes('courseMap')) {
    addIssue({
      level: 'warning',
      path: 'selectedFeatures',
      message: 'Course Map is not included in selected features.',
      actionId: 'addCourseMapFeature',
    });
  }
  if (snapshot.activeTab && features.length > 0 && !features.includes(snapshot.activeTab)) {
    addIssue({
      level: 'warning',
      path: 'activeTab',
      message: `Active tab "${titleFromDeveloperId(snapshot.activeTab)}" is not in selected features.`,
      actionId: 'addActiveTabFeature',
    });
  }
  features
    .filter(feature => feature !== 'courseMap')
    .forEach((feature) => {
      const output = deliverables[feature];
      if (!output) addIssue({ level: 'info', path: `deliverables.${feature}`, message: `${titleFromDeveloperId(feature)} is selected but has not been generated yet.` });
      if (output?.status === 'error') addIssue({ level: 'error', path: `deliverables.${feature}`, message: `${titleFromDeveloperId(feature)} has a generation error.` });
      if (output?.status === 'generating') addIssue({ level: 'info', path: `deliverables.${feature}`, message: `${titleFromDeveloperId(feature)} is still generating.` });
    });
  if (columns.length === 0) addIssue({ level: 'warning', path: 'columns', message: 'No course map columns are configured.' });
  if (columns.length > 0 && columns.every(column => column?.enabled === false)) {
    addIssue({
      level: 'error',
      path: 'columns',
      message: 'All course map columns are disabled.',
      actionId: 'enableAllColumns',
    });
  }
  if (!snapshot.modelId && !snapshot.modelName) addIssue({ level: 'warning', path: 'modelId', message: 'No AI model is selected.' });
  if (dirtySections.size > 0) addIssue({ level: 'info', path: 'drafts', message: 'Developer edits are pending and have not been applied.' });

  return {
    lessons: lessons.length,
    selectedFeatures: features.length,
    deliverables: Object.keys(deliverables).length,
    enabledColumns: columns.filter(column => column?.enabled !== false).length,
    issues,
  };
}

export default function DeveloperDiagnosticsPanel({
  snapshot = {},
  dirtySections = new Set(),
  onDiagnosticFix,
  onDiagnosticPathClick,
}) {
  const diagnostics = buildDiagnostics(snapshot, dirtySections);
  const runtimeDiagnostics = getDeveloperRuntimeDiagnostics(snapshot, dirtySections.size);
  const cards = [
    ['Lessons', diagnostics.lessons],
    ['Selected Tabs', diagnostics.selectedFeatures],
    ['Generated Outputs', diagnostics.deliverables],
    ['Enabled Columns', diagnostics.enabledColumns],
  ];

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(([label, value]) => (
          <div key={label} className="rounded-xl border border-slate-200/70 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
            <p className="mt-2 text-2xl font-bold text-slate-800 dark:text-slate-100">{value}</p>
          </div>
        ))}
      </div>

      <section className="mt-4 rounded-xl border border-slate-200/70 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Health Check</p>
        <h3 className="mt-1 text-sm font-bold text-slate-800 dark:text-slate-100">
          {diagnostics.issues.length === 0 ? 'No issues found' : `${diagnostics.issues.length} findings`}
        </h3>
        <div className="mt-3 space-y-2">
          {diagnostics.issues.length > 0 ? diagnostics.issues.map((issue, index) => (
            <div key={`${issue.message}-${index}`} className="flex gap-3 rounded-lg border border-slate-200/70 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-950">
              <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${
                issue.level === 'error' ? 'bg-red-500' : issue.level === 'warning' ? 'bg-amber-400' : 'bg-indigo-400'
              }`} />
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{issue.level}</p>
                {issue.path && (
                  <button
                    type="button"
                    onClick={() => onDiagnosticPathClick?.(issue.path)}
                    className="mt-0.5 break-all rounded px-1 py-0.5 text-left font-mono text-[10px] text-indigo-500 hover:bg-indigo-50 dark:text-indigo-300 dark:hover:bg-indigo-500/10"
                    title={`Jump to ${issue.path}`}
                  >
                    {issue.path}
                  </button>
                )}
                <p className="text-[12px] leading-5 text-slate-600 dark:text-slate-300">{issue.message}</p>
              </div>
              {issue.actionId && (
                <button
                  onClick={() => onDiagnosticFix?.(issue)}
                  className="tactile self-center rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[10px] font-bold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  Fix
                </button>
              )}
            </div>
          )) : (
            <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3 text-[12px] font-semibold text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
              Project structure, deliverable selection, and layout settings look ready.
            </p>
          )}
        </div>
      </section>

      <section className="mt-4 rounded-xl border border-slate-200/70 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Runtime</p>
        <div className="mt-3 grid gap-2 text-[12px] text-slate-600 dark:text-slate-300 sm:grid-cols-2">
          <p><span className="font-bold text-slate-800 dark:text-slate-100">Provider:</span> {runtimeDiagnostics.providerLabel}</p>
          <p><span className="font-bold text-slate-800 dark:text-slate-100">Model:</span> {runtimeDiagnostics.modelLabel}</p>
          <p><span className="font-bold text-slate-800 dark:text-slate-100">Active tab:</span> {titleFromDeveloperId(snapshot.activeTab)}</p>
          <p><span className="font-bold text-slate-800 dark:text-slate-100">Pending edits:</span> {dirtySections.size}</p>
          <p><span className="font-bold text-slate-800 dark:text-slate-100">Key policy:</span> {runtimeDiagnostics.apiKeyPolicy}</p>
          <p><span className="font-bold text-slate-800 dark:text-slate-100">Snapshot size:</span> {formatBytes(runtimeDiagnostics.counts.snapshotBytes)}</p>
        </div>
      </section>

      <section className="mt-4 rounded-xl border border-slate-200/70 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Runtime Risk</p>
            <h3 className="mt-1 text-sm font-bold text-slate-800 dark:text-slate-100">
              {runtimeDiagnostics.risks.length === 0 ? 'No runtime risks found' : `${runtimeDiagnostics.risks.length} operational signals`}
            </h3>
          </div>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ['Generated', `${runtimeDiagnostics.counts.generatedSelected}/${runtimeDiagnostics.counts.selectedDeliverables}`],
            ['Stale', runtimeDiagnostics.counts.stale],
            ['Errors', runtimeDiagnostics.counts.errors],
            ['Prompt Overrides', runtimeDiagnostics.counts.promptOverrides],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-950">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
              <p className="mt-1 text-lg font-bold text-slate-800 dark:text-slate-100">{value}</p>
            </div>
          ))}
        </div>

        {runtimeDiagnostics.risks.length > 0 ? (
          <div className="mt-3 space-y-2">
            {runtimeDiagnostics.risks.map((risk, index) => (
              <div key={`${risk.title}-${index}`} className="flex gap-3 rounded-lg border border-slate-200/70 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-950">
                <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${
                  risk.level === 'error' ? 'bg-red-500' : risk.level === 'warning' ? 'bg-amber-400' : 'bg-indigo-400'
                }`} />
                <div className="min-w-0">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{risk.title}</p>
                  {risk.path && (
                    <button
                      type="button"
                      onClick={() => onDiagnosticPathClick?.(risk.path)}
                      className="mt-0.5 break-all rounded px-1 py-0.5 text-left font-mono text-[10px] text-indigo-500 hover:bg-indigo-50 dark:text-indigo-300 dark:hover:bg-indigo-500/10"
                      title={`Jump to ${risk.path}`}
                    >
                      {risk.path}
                    </button>
                  )}
                  <p className="text-[12px] leading-5 text-slate-600 dark:text-slate-300">{risk.message}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3 text-[12px] font-semibold text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
            Provider, model, generated outputs, prompt overrides, and snapshot size look ready.
          </p>
        )}
      </section>
    </div>
  );
}
