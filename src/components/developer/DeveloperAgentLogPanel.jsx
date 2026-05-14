import React, { useMemo } from 'react';
import { buildDeveloperAgentEvents } from '../../lib/developerAgentEvents.js';

const LEVEL_STYLES = {
  success: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  warning: 'border-amber-200 bg-amber-50 text-amber-700',
  error: 'border-red-200 bg-red-50 text-red-700',
  info: 'border-indigo-200 bg-indigo-50 text-indigo-700',
};

const TYPE_LABELS = {
  user: 'User',
  assistant: 'Assistant',
  agentRun: 'Run',
  tool: 'Tool',
  changeSummary: 'Changes',
  packageSummary: 'Package',
  proposal: 'Proposal',
  diffReview: 'Diff',
  syncSuggestion: 'Sync',
  validation: 'Validation',
  error: 'Error',
};

function StatCard({ label, value }) {
  return (
    <div className="rounded-xl border border-slate-200/70 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
      <p className="mt-2 text-2xl font-bold text-slate-800 dark:text-slate-100">{value}</p>
    </div>
  );
}

export default function DeveloperAgentLogPanel({ snapshot = {} }) {
  const { events, counts } = useMemo(() => buildDeveloperAgentEvents(snapshot), [snapshot]);

  return (
    <div data-testid="developer-agent-log-panel" className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Events" value={counts.total} />
        <StatCard label="Tool Steps" value={counts.tools} />
        <StatCard label="Warnings" value={counts.warning} />
        <StatCard label="Errors" value={counts.error} />
      </div>

      <section className="mt-4 rounded-xl border border-slate-200/70 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Agent Event Log</p>
            <h3 className="mt-1 text-sm font-bold text-slate-800 dark:text-slate-100">
              {events.length === 0 ? 'No agent events captured' : `${events.length} captured events`}
            </h3>
          </div>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-bold text-slate-400 dark:border-slate-700 dark:bg-slate-950">
            From saved chat history
          </span>
        </div>

        {events.length > 0 ? (
          <div className="mt-4 space-y-2">
            {events.map((event) => (
              <article
                key={event.id}
                data-testid="developer-agent-event"
                data-level={event.level}
                data-type={event.type}
                className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-950"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${LEVEL_STYLES[event.level] || LEVEL_STYLES.info}`}
                  >
                    {TYPE_LABELS[event.type] || event.type}
                  </span>
                  <p className="min-w-0 flex-1 text-[12px] font-bold text-slate-700 dark:text-slate-200">
                    {event.title}
                  </p>
                  {event.status && <span className="text-[10px] font-semibold text-slate-400">{event.status}</span>}
                </div>
                {event.summary && (
                  <p className="mt-1 text-[11px] leading-5 text-slate-500 dark:text-slate-400">{event.summary}</p>
                )}
                <p className="mt-1 font-mono text-[10px] text-slate-300">
                  message[{event.sourceIndex}]{Number.isInteger(event.stepIndex) ? `.steps[${event.stepIndex}]` : ''}
                  {event.tool ? ` - ${event.tool}` : ''}
                </p>
              </article>
            ))}
          </div>
        ) : (
          <p className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-[12px] font-medium text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-400">
            Send an agent request, then reopen Developer Mode to inspect persisted agent runs, tool steps, proposals,
            sync suggestions, and applied-change summaries.
          </p>
        )}
      </section>
    </div>
  );
}
