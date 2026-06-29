/**
 * BuildRibbon — v0.14.4 WS-B1: the ONE status spine under the workspace
 * header. Renders the model produced by src/lib/buildRibbonModel.js:
 *
 *   [Map ·  Enrich ●  Compile ○  Verify ○  Grade ○]  live sub-label …  $0.13
 *
 * States: hidden (model null — fresh/empty workspace), generating/finishing
 * (active step pulses, settled earlier steps stay neutral, sub-label streams
 * the latest event detail), ready (pipeline chips + quiet "Ready in 184s").
 * One row, ~h-9, full content width. The sub-label is aria-live="polite".
 *
 * WS-B3 also lives here: TabReadyTick replaces the rainbow per-tab status
 * dots in the workspace tab bar — done tabs get a small emerald check,
 * failed tabs a red cross, everything else renders nothing (build progress
 * now lives in this ribbon, not in nine pulsing dots).
 */
import React from 'react';

function StepCheck() {
  return (
    <svg
      className="h-3 w-3 flex-shrink-0 text-emerald-500 dark:text-emerald-400"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
    </svg>
  );
}

export function TabReadyTick({ status }) {
  if (status === 'done') {
    return (
      <svg
        data-testid="tab-ready-tick"
        className="h-3 w-3 flex-shrink-0 text-emerald-400"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
      </svg>
    );
  }
  if (status === 'error') {
    return (
      <svg
        data-testid="tab-error-tick"
        className="h-3 w-3 flex-shrink-0 text-red-400"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
      </svg>
    );
  }
  return null;
}

export default function BuildRibbon({ model }) {
  if (!model) return null;

  return (
    <div
      data-testid="build-ribbon"
      className="flex min-h-9 w-full items-center gap-3 rounded-lg border border-slate-200/70 bg-white/80 px-3 py-1 shadow-sm dark:border-slate-700/70 dark:bg-slate-900/70"
    >
      <ol aria-label="Build stages" className="flex flex-shrink-0 items-center gap-2.5">
        {model.steps.map((step) => (
          <li
            key={step.id}
            data-testid={`ribbon-step-${step.id}`}
            data-status={step.status}
            className="flex items-center gap-1"
          >
            {step.status === 'done' ? (
              <StepCheck />
            ) : (
              <span
                aria-hidden="true"
                className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${
                  step.status === 'active'
                    ? 'bg-indigo-500 animate-pulse dark:bg-indigo-400'
                    : step.status === 'settled'
                      ? 'bg-slate-400 dark:bg-slate-500'
                      : 'bg-slate-300 dark:bg-slate-600'
                }`}
              />
            )}
            <span
              className={`text-[12px] font-semibold ${
                step.status === 'active'
                  ? 'text-indigo-600 dark:text-indigo-300'
                  : step.status === 'done'
                    ? 'text-slate-600 dark:text-slate-300'
                    : step.status === 'settled'
                      ? 'text-slate-500 dark:text-slate-400'
                      : 'text-slate-400 dark:text-slate-500'
              }`}
            >
              {step.label}
            </span>
          </li>
        ))}
      </ol>

      <p
        data-testid="ribbon-stage-label"
        aria-live="polite"
        className="min-w-0 flex-1 truncate text-[13px] text-slate-600 dark:text-slate-300"
      >
        {model.stageLabel}
      </p>

      {/* v0.14.7 F3: the pipeline chips are dense diagnostics the Seal
          already summarizes — on phones they pushed the page wide (658px at
          a 375px viewport), so they render from md up. */}
      <div className="hidden flex-shrink-0 items-center gap-1.5 md:flex">
        {model.pipelineChips.map((chip) => (
          <span
            key={chip.id}
            data-testid={`ribbon-chip-${chip.id}`}
            className={`ribbon-chip ${
              chip.warn
                ? 'ribbon-chip-warning'
                : chip.muted
                  ? 'ribbon-chip-muted'
                  : chip.emphasis
                    ? 'ribbon-chip-emphasis'
                    : 'ribbon-chip-neutral'
            }`}
          >
            {chip.label}
          </span>
        ))}
        {model.elapsedDisplay && (
          <span data-testid="ribbon-elapsed" className="text-[12px] font-medium text-slate-400 dark:text-slate-500">
            {model.elapsedDisplay}
          </span>
        )}
        {model.spendDisplay && (
          <span
            data-testid="ribbon-spend"
            className="font-mono text-[12px] font-semibold tabular-nums text-slate-500 dark:text-slate-400"
            title="Model spend so far this run (provider-reported where available)"
          >
            {model.spendDisplay}
          </span>
        )}
      </div>
    </div>
  );
}
