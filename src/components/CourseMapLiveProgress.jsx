import React, { useEffect, useState } from 'react';

export function elapsedLabel(milliseconds) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, '0')}s`;
}

export default function CourseMapLiveProgress({
  detail = '',
  progress = 0,
  lessonCount = 0,
  activity = {},
  onStop = null,
  className = '',
}) {
  const [mountedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const startedAt = activity.startedAt || mountedAt;
  const quietFor = Math.max(0, now - (activity.lastUpdateAt || startedAt));
  const elapsed = Math.max(0, now - startedAt);
  const phase = activity.phase || (progress > 0 ? 'writing' : 'preparing');
  const step = phase === 'checking' ? 2 : ['writing', 'retrying'].includes(phase) ? 1 : 0;
  const measured = Number(progress) > 0;
  const titles = activity.draftLessons || [];
  const status =
    activity.message ||
    detail ||
    (phase === 'writing' ? 'Writing your course outline…' : 'Preparing to write your course outline…');
  return (
    <section
      data-testid="course-map-live-progress"
      aria-label="Course outline progress"
      className={`rounded-xl border border-indigo-100/80 bg-indigo-50/55 p-4 dark:border-indigo-900/70 dark:bg-indigo-950/35 ${className}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
        <span className="font-semibold text-indigo-700 dark:text-indigo-200">
          Course outline · Step {step + 1} of 3
        </span>
        <span className="tabular-nums" aria-live="off">
          {elapsedLabel(elapsed)} elapsed{activity.attempt > 1 ? ` · Attempt ${activity.attempt}` : ''}
        </span>
      </div>
      <div className="mt-2 flex items-start gap-3">
        <p
          role="status"
          aria-live="polite"
          className="min-w-0 flex-1 break-words text-sm font-medium text-slate-800 dark:text-slate-100"
        >
          {status}
          {phase === 'preparing' && activity.modelProgress > 0 && activity.modelProgress < 1 && (
            <span className="block mt-1 text-xs font-normal">
              AI setup: {Math.round(activity.modelProgress * 100)}%
            </span>
          )}
        </p>
        {onStop && (
          <button
            type="button"
            aria-label="Stop build"
            onClick={onStop}
            className="shrink-0 rounded-md border border-indigo-200 bg-white px-3 py-1.5 text-xs font-semibold text-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 dark:border-indigo-800 dark:bg-indigo-950 dark:text-indigo-200"
          >
            Stop
          </button>
        )}
      </div>
      <div
        role="progressbar"
        aria-label="Course outline completion"
        aria-valuemin={measured ? 0 : undefined}
        aria-valuemax={measured ? 100 : undefined}
        aria-valuenow={measured ? Math.min(99, Math.round(progress)) : undefined}
        className="mt-3 h-1.5 overflow-hidden rounded-full bg-indigo-100 dark:bg-indigo-900/70"
      >
        <div
          className={`h-full rounded-full bg-indigo-500 ${measured ? 'transition-[width] duration-300' : 'w-1/3 animate-pulse motion-reduce:animate-none'}`}
          style={measured ? { width: `${Math.min(99, Math.round(progress))}%` } : undefined}
        />
      </div>
      <ol aria-label="Outline stages" className="mt-3 grid grid-cols-3 gap-2 text-xs">
        {['Prepare', 'Write outline', 'Check outline'].map((label, index) => (
          <li
            key={label}
            aria-current={index === step ? 'step' : undefined}
            className={
              index <= step ? 'font-medium text-indigo-700 dark:text-indigo-200' : 'text-slate-500 dark:text-slate-400'
            }
          >
            {index < step ? '✓ ' : `${index + 1}. `}
            {label}
          </li>
        ))}
      </ol>
      <div className="mt-3 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
        {quietFor >= 30_000 ? (
          <p>
            <span aria-live="off">No new update for {elapsedLabel(quietFor)}. </span>
            <span role="status">
              {elapsed >= 90_000
                ? 'This step is taking longer. Keep this tab open, or stop the build and try again.'
                : 'AI preparation or a retry can take a moment. You can stop the build at any time.'}
            </span>
          </p>
        ) : (
          <p aria-live="off">
            {activity.characters > 0 ? 'Outline text is arriving' : 'Waiting for the next update'}
            {activity.lastUpdateAt
              ? ` · updated ${quietFor < 2000 ? 'just now' : `${elapsedLabel(quietFor)} ago`}`
              : ''}
            .
          </p>
        )}
        {titles.length > 0 && lessonCount === 0 && (
          <div className="mt-3 rounded-lg bg-white/65 p-3 dark:bg-slate-950/40">
            <p className="font-semibold">
              Draft outline · {titles.length}
              {activity.expectedLessons ? ` of ${activity.expectedLessons}` : ''} lesson titles received
            </p>
            <p className="mt-0.5 text-slate-500 dark:text-slate-400">Preview only — titles may change during checks.</p>
            <ul className="mt-2 space-y-1">
              {titles.slice(-3).map((lesson, index) => (
                <li key={`${lesson.number}-${index}`} className="break-words text-slate-700 dark:text-slate-200">
                  {lesson.number}. {lesson.title}
                </li>
              ))}
            </ul>
          </div>
        )}
        <p className="mt-3">
          {lessonCount > 0
            ? `${lessonCount} lessons are visible. Their remaining fields are still being filled in.`
            : 'Your lessons will appear once the outline has been checked. A larger course or first-time AI setup can take a few minutes.'}
        </p>
      </div>
    </section>
  );
}
