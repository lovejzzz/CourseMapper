export function preparingRibbonStageLabel(stage) {
  return (
    {
      map: 'Preparing the course map',
      plan: 'Waiting for blueprint approval',
      enrich: 'Preparing lesson knowledge',
      compile: 'Preparing teaching materials',
      verify: 'Preparing package checks',
      grade: 'Preparing the quality grade',
    }[stage] || 'Preparing the next build stage'
  );
}

export function buildRibbonFailureState({ generation = {}, mappedLessonCount = 0, steps = [] } = {}) {
  const mapped = Math.max(0, Number(mappedLessonCount) || 0);
  const expected = Math.max(mapped, Number(generation.expectedLessonCount) || 0);
  return {
    partialMapValue: expected > mapped ? `${mapped}/${expected} lessons mapped` : '',
    progressPct: expected > 0 ? Math.min(29, Math.round(15 + (mapped / expected) * 14)) : 15,
    stageLabel:
      String(generation.error || '')
        .replace(/^AI generation failed:\s*/i, '')
        .trim() || 'Course map stopped before every requested lesson was ready',
    steps: steps.map((step) => (step.id === 'map' ? { ...step, status: 'error' } : { ...step, status: 'pending' })),
  };
}

export function ribbonArtifactMarkClass(status) {
  return (
    {
      active: 'animate-pulse bg-indigo-500 motion-reduce:animate-none dark:bg-indigo-400',
      warn: 'bg-amber-500 dark:bg-amber-300',
      settled: 'bg-slate-400 dark:bg-slate-500',
      error: 'bg-red-500 dark:bg-red-400',
    }[status] || 'bg-slate-300 dark:bg-slate-600'
  );
}

export function ribbonSignalClass(state) {
  return (
    {
      complete: 'bg-emerald-500 dark:bg-emerald-400',
      review: 'bg-amber-500 dark:bg-amber-300',
      error: 'bg-red-500 dark:bg-red-400',
    }[state] ||
    'animate-pulse bg-indigo-500 shadow-[0_0_0_4px_rgba(99,102,241,0.10)] motion-reduce:animate-none dark:bg-indigo-300'
  );
}

export function ribbonNarrative(state) {
  return (
    {
      complete: 'Course package is ready.',
      review: 'Review the highlighted notes before export.',
      error: 'Course map generation stopped.',
    }[state] || 'Preparing the next course material…'
  );
}

export function ribbonProgressLabel(state, progress) {
  if (state === 'review') return 'Review required';
  if (state === 'complete' && progress >= 100) return 'Build complete';
  if (state === 'live') return `Build ${Math.min(99, progress)}%`;
  return state === 'error' ? `Stopped at ${progress}%` : `Build ${progress}%`;
}
