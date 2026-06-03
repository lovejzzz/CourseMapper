import React from 'react';

function HelpPill({ children, tone = 'slate' }) {
  const toneClass =
    tone === 'green'
      ? 'border-emerald-200/70 bg-emerald-50 text-emerald-700'
      : tone === 'amber'
        ? 'border-amber-200/70 bg-amber-50 text-amber-700'
        : tone === 'indigo'
          ? 'border-indigo-200/70 bg-indigo-50 text-indigo-700'
          : 'border-slate-200/70 bg-white/75 text-slate-500';
  return <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${toneClass}`}>{children}</span>;
}

function HelpSection({ title, items = [] }) {
  const visibleItems = items.filter(Boolean);
  if (visibleItems.length === 0) return null;
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{title}</p>
      <div className="mt-1.5 space-y-1">
        {visibleItems.map((item) => (
          <div key={item} className="flex items-start gap-1.5 text-[11px] leading-snug text-slate-600">
            <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-300" aria-hidden="true" />
            <span>{item}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function buildAgentHelpSummary(help = {}) {
  const activeTarget = help.activeTarget || 'current workspace';
  const providerReady = help.providerReady !== false;
  const mode = help.agentDryRun ? 'Review only' : 'Auto-fix';
  const scopeText = help.lessonScopeText || 'All selected lessons';
  const syncCount = Number(help.syncFeatureCount || 0);
  const canUndo = Boolean(help.canUndo);

  return {
    activeTarget,
    providerReady,
    mode,
    scopeText,
    localActions: [
      'Audit package readiness, classroom fit, validation, and export risk without using a model.',
      'Plan the next safest workspace action from the current generated materials.',
      syncCount > 0 ? `Sync ${syncCount} stale deliverable${syncCount === 1 ? '' : 's'} from the pending sync plan.` : null,
      canUndo ? 'Undo the most recent accepted deliverable edit.' : null,
    ].filter(Boolean),
    modelActions: providerReady
      ? [
          `Improve ${activeTarget} with the current Auto-fix or Review-only mode.`,
          'Generate or regenerate missing deliverables from workspace plan actions.',
          'Use attached files as source context for the current Agent conversation.',
        ]
      : ['Configure AI to enable free-form chat and model-based edits. Local Audit and Plan still work now.'],
    controls: [
      'Use the command strip for one-click actions, or type / to open the command palette.',
      'Toggle Review only when you want findings and proposed fixes without edits.',
      'Use recovery buttons on failed Agent runs to review issues, retry safe fixes, or plan recovery.',
    ],
  };
}

export default function AgentHelpCard({ help }) {
  const summary = buildAgentHelpSummary(help);

  return (
    <div data-testid="agent-help-card" className="flex justify-start animate-spring-in">
      <div className="ml-8 max-w-[92%] rounded-xl border border-indigo-100 bg-white/85 px-3 py-2.5 text-[12px] shadow-sm">
        <div className="flex items-start gap-2.5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2.2}
                d="M9.09 9a3 3 0 1 1 4.82 2.39c-.97.67-1.41 1.03-1.41 2.11m0 3h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
              />
            </svg>
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-bold text-slate-800">Agent guide</span>
              <HelpPill tone="indigo">{summary.mode}</HelpPill>
              <HelpPill tone={summary.providerReady ? 'green' : 'amber'}>
                {summary.providerReady ? 'AI connected' : 'Local tools only'}
              </HelpPill>
            </div>
            <p className="mt-1 text-[11px] leading-snug text-slate-500">
              Working on {summary.activeTarget}. Scope: {summary.scopeText}.
            </p>

            <div className="mt-2.5 grid gap-2.5">
              <HelpSection title="Available now" items={summary.localActions} />
              <HelpSection title={summary.providerReady ? 'Model-backed actions' : 'Needs AI connection'} items={summary.modelActions} />
              <HelpSection title="Controls" items={summary.controls} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
