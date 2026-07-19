import { useEffect, useRef, useState } from 'react';

/**
 * BuildRibbon — v0.14.4 WS-B1: the ONE status spine under the workspace
 * header. Renders the model produced by src/lib/buildRibbonModel.js:
 *
 *   [Model ✓  Map ·  Enrich ●  Compile ○  Verify ○  Grade ○]  live sub-label …
 *   The Model step is Scion-only; cloud providers begin at Map.
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

function ArtifactStatusMark({ status }) {
  if (status === 'done') return <StepCheck />;
  return (
    <span
      aria-hidden="true"
      className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${
        status === 'active'
          ? 'animate-pulse bg-indigo-500 motion-reduce:animate-none dark:bg-indigo-300'
          : status === 'warn'
            ? 'bg-amber-500 dark:bg-amber-300'
            : status === 'settled'
              ? 'bg-slate-400 dark:bg-slate-500'
              : 'bg-slate-300 dark:bg-slate-600'
      }`}
    />
  );
}

function useActiveElapsed(startedAt) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!startedAt) return undefined;
    setNow(Date.now());
    const interval = globalThis.setInterval(() => setNow(Date.now()), 1000);
    return () => globalThis.clearInterval(interval);
  }, [startedAt]);
  if (!startedAt) return '';
  const seconds = Math.max(0, Math.floor((now - startedAt) / 1000));
  return seconds >= 2 ? `${seconds}s` : '';
}

function useVisibleProgress(model) {
  const visible = useRef({ runStartedAt: 0, value: 0 });
  if (!model) {
    visible.current = { runStartedAt: 0, value: 0 };
    return 0;
  }
  const runStartedAt = Number(model.activeStartedAt) || 0;
  const next = Math.max(0, Math.min(100, Number(model.progressPct) || 0));
  if (runStartedAt > 0 && runStartedAt !== visible.current.runStartedAt) {
    visible.current = { runStartedAt, value: next };
  } else {
    visible.current.value = Math.max(visible.current.value, next);
  }
  return visible.current.value;
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
  const activeElapsed = useActiveElapsed(model?.activeStartedAt || 0);
  const visibleProgress = useVisibleProgress(model);
  if (!model) return null;

  const compilerState = model.compilerState || 'live';
  const stageNarrative =
    model.stageLabel ||
    (compilerState === 'complete'
      ? 'Course package is ready.'
      : compilerState === 'review'
        ? 'Review the highlighted notes before export.'
        : 'Preparing the next course material…');
  const compactStepLabels = {
    model: 'AI',
    map: 'Map',
    enrich: 'Enrich',
    compile: 'Build',
    verify: 'Check',
    grade: 'Grade',
  };

  return (
    <div
      data-testid="build-ribbon"
      className="w-full overflow-hidden rounded-lg border border-slate-200/70 bg-white/80 shadow-sm dark:border-slate-700/70 dark:bg-slate-900/70"
    >
      <div className="flex min-h-10 flex-wrap items-center gap-x-3 gap-y-0.5 px-3 py-1.5 sm:flex-nowrap">
        <div className="flex min-w-0 flex-1 items-center gap-2 sm:flex-none">
          <span
            data-testid="living-compiler-signal"
            data-state={compilerState}
            aria-hidden="true"
            className={`h-2 w-2 rounded-full ${
              compilerState === 'complete'
                ? 'bg-emerald-500 dark:bg-emerald-400'
                : compilerState === 'review'
                  ? 'bg-amber-500 dark:bg-amber-300'
                  : 'animate-pulse bg-indigo-500 shadow-[0_0_0_4px_rgba(99,102,241,0.10)] motion-reduce:animate-none dark:bg-indigo-300'
            }`}
          />
          <span
            className="min-w-0 truncate whitespace-nowrap text-[12px] font-bold tracking-tight text-slate-600 dark:text-slate-300"
            title="Living Course Compiler"
          >
            <span className="min-[360px]:hidden">Living Compiler</span>
            <span className="hidden min-[360px]:inline">Living Course Compiler</span>
          </span>
        </div>

        <p
          data-testid="ribbon-stage-label"
          aria-live="polite"
          className="order-3 w-full min-w-0 text-[13px] leading-4 text-slate-600 sm:order-none sm:w-auto sm:flex-1 sm:truncate dark:text-slate-300"
        >
          {stageNarrative}
        </p>

        <span
          data-testid="ribbon-progress-label"
          className="ml-2 shrink-0 text-[12px] font-bold tabular-nums text-indigo-600 sm:ml-0 dark:text-indigo-300"
        >
          {visibleProgress >= 100
            ? compilerState === 'review'
              ? 'Review required'
              : 'Build complete'
            : `Build ${visibleProgress}%`}
          {activeElapsed && (
            <span data-testid="ribbon-active-elapsed" className="font-medium text-slate-400 dark:text-slate-500">
              {' · '}
              {activeElapsed}
            </span>
          )}
        </span>
      </div>

      <div className="flex items-center gap-3 border-t border-slate-100/80 px-3 py-1.5 dark:border-slate-800/80">
        <ol
          aria-label="Build stages"
          className="grid min-w-0 flex-1 auto-cols-fr grid-flow-col gap-1.5 sm:flex sm:flex-none sm:items-center sm:gap-2.5"
        >
          {model.steps.map((step) => (
            <li
              key={step.id}
              data-testid={`ribbon-step-${step.id}`}
              data-status={step.status}
              className="flex min-w-0 items-center justify-center gap-0 sm:justify-start sm:gap-1"
            >
              <span className="hidden sm:block">
                {step.status === 'done' ? (
                  <StepCheck />
                ) : (
                  <span
                    aria-hidden="true"
                    className={`block h-1.5 w-1.5 flex-shrink-0 rounded-full ${
                      step.status === 'active'
                        ? 'animate-pulse bg-indigo-500 motion-reduce:animate-none dark:bg-indigo-400'
                        : step.status === 'warn'
                          ? 'bg-amber-500 dark:bg-amber-300'
                          : step.status === 'settled'
                            ? 'bg-slate-400 dark:bg-slate-500'
                            : 'bg-slate-300 dark:bg-slate-600'
                    }`}
                  />
                )}
              </span>
              <span
                className={`min-w-0 text-[12px] font-semibold tracking-tight ${
                  step.status === 'active'
                    ? 'text-indigo-600 dark:text-indigo-300'
                    : step.status === 'warn'
                      ? 'text-amber-700 dark:text-amber-200'
                      : step.status === 'done'
                        ? 'text-emerald-500 sm:text-slate-600 dark:text-emerald-400 sm:dark:text-slate-300'
                        : step.status === 'settled'
                          ? 'text-slate-500 dark:text-slate-400'
                          : 'text-slate-400 dark:text-slate-500'
                }`}
              >
                <span className="min-[360px]:hidden">{compactStepLabels[step.id] || step.label}</span>
                <span className="hidden min-[360px]:inline">{step.label}</span>
              </span>
            </li>
          ))}
        </ol>

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

      <ol
        data-testid="living-compiler-artifacts"
        aria-label="Course artifacts being compiled"
        className="grid grid-cols-2 gap-px overflow-hidden border-t border-slate-100/80 bg-slate-100/80 sm:grid-cols-4 dark:border-slate-800/80 dark:bg-slate-800/80"
      >
        {model.compilerArtifacts.map((artifact) => (
          <li
            key={artifact.id}
            data-testid={`living-artifact-${artifact.id}`}
            data-status={artifact.status}
            className={`min-w-0 bg-white/90 px-3 py-2 dark:bg-slate-900/85 ${
              artifact.status === 'active'
                ? 'shadow-[inset_0_2px_0_rgb(99_102_241)]'
                : artifact.status === 'warn'
                  ? 'shadow-[inset_0_2px_0_rgb(245_158_11)]'
                  : ''
            }`}
          >
            <div className="flex items-center gap-1.5">
              <ArtifactStatusMark status={artifact.status} />
              <span className="truncate text-[12px] font-medium text-slate-400 dark:text-slate-500">
                {artifact.label}
              </span>
            </div>
            <p
              className={`mt-0.5 truncate text-[12px] font-semibold ${
                artifact.status === 'active'
                  ? 'text-indigo-600 dark:text-indigo-300'
                  : artifact.status === 'warn'
                    ? 'text-amber-700 dark:text-amber-200'
                    : artifact.status === 'done'
                      ? 'text-slate-700 dark:text-slate-200'
                      : artifact.status === 'settled'
                        ? 'text-slate-600 dark:text-slate-300'
                        : 'text-slate-400 dark:text-slate-500'
              }`}
              title={artifact.value}
            >
              {artifact.value}
            </p>
          </li>
        ))}
      </ol>
      <div
        data-testid="build-progress-track"
        role="progressbar"
        aria-label={`Overall course build progress: ${visibleProgress}%`}
        aria-valuetext={`${visibleProgress}% — ${model.stageLabel}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={visibleProgress}
        className="h-1 bg-slate-100 dark:bg-slate-800"
      >
        <div
          data-testid="build-progress-fill"
          className="h-full bg-gradient-to-r from-indigo-500 via-violet-500 to-sky-500 transition-[width] duration-500 ease-out motion-reduce:transition-none"
          style={{ width: `${visibleProgress}%` }}
        />
      </div>
    </div>
  );
}
