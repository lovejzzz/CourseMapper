import React from 'react';

/**
 * Full-screen loading indicator with spinner and optional message.
 * Used as a Suspense fallback for lazy-loaded screens.
 */
export default function LoadingScreen({ message = 'Loading…' }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-white/60 dark:bg-slate-900/60">
      <div className="flex flex-col items-center gap-4">
        {/* Spinner */}
        <div className="relative">
          <div className="w-10 h-10 rounded-full border-4 border-slate-200 dark:border-slate-700" />
          <div className="absolute inset-0 w-10 h-10 rounded-full border-4 border-transparent border-t-indigo-500 animate-spin" />
        </div>
        <p className="text-sm font-medium text-slate-500 dark:text-slate-400 animate-pulse">{message}</p>
      </div>
    </div>
  );
}

/**
 * Skeleton placeholder for the Config screen.
 * Shows a pulsing layout that mimics the config form structure.
 */
export function ConfigSkeleton() {
  return (
    <div className="min-h-screen bg-white/60 dark:bg-slate-900/60 px-6 py-10">
      <div className="max-w-3xl mx-auto space-y-6 animate-pulse">
        {/* Back button placeholder */}
        <div className="h-8 w-24 bg-slate-200 dark:bg-slate-700 rounded-lg" />

        {/* Title */}
        <div className="h-8 w-64 bg-slate-200 dark:bg-slate-700 rounded-lg" />

        {/* Form fields */}
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="space-y-2">
              <div className="h-4 w-32 bg-slate-200 dark:bg-slate-700 rounded" />
              <div className="h-10 w-full bg-slate-100 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700" />
            </div>
          ))}
        </div>

        {/* Column editor placeholder */}
        <div className="h-40 w-full bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700" />

        {/* Generate button */}
        <div className="flex justify-end">
          <div className="h-10 w-36 bg-indigo-200 dark:bg-indigo-900/50 rounded-full" />
        </div>
      </div>
    </div>
  );
}

/**
 * Skeleton placeholder for the Workspace screen.
 * Shows a pulsing layout that mimics the workspace structure with tabs and content area.
 */
export function WorkspaceSkeleton() {
  return (
    <div className="min-h-screen bg-white/60 dark:bg-slate-900/60">
      {/* Header placeholder */}
      <div className="h-14 bg-white/80 dark:bg-slate-900/80 border-b border-slate-200 dark:border-slate-700 animate-pulse" />

      <div className="px-6 py-4 space-y-4 animate-pulse">
        {/* Top bar buttons */}
        <div className="flex items-center gap-3">
          <div className="h-8 w-28 bg-slate-200 dark:bg-slate-700 rounded-full" />
          <div className="h-8 w-32 bg-sky-100 dark:bg-sky-900/30 rounded-full" />
        </div>

        {/* Tabs */}
        <div className="flex gap-2 border-b border-slate-200 dark:border-slate-700 pb-2">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className={`h-8 rounded-lg ${i === 1 ? 'w-28 bg-indigo-100 dark:bg-indigo-900/40' : 'w-24 bg-slate-100 dark:bg-slate-800'}`}
            />
          ))}
        </div>

        {/* Content area — table skeleton */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          {/* Table header */}
          <div className="flex gap-4 px-4 py-3 bg-slate-50 dark:bg-slate-800">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-4 flex-1 bg-slate-200 dark:bg-slate-700 rounded" />
            ))}
          </div>
          {/* Table rows */}
          {[1, 2, 3, 4, 5].map((row) => (
            <div key={row} className="flex gap-4 px-4 py-3 border-t border-slate-100 dark:border-slate-800">
              {[1, 2, 3].map((col) => (
                <div key={col} className="h-4 flex-1 bg-slate-100 dark:bg-slate-800 rounded" />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Skeleton for the Course Map content area while generation is in progress
 * but the course map data hasn't arrived yet (e.g. during parsing phase).
 */
export function CourseMapSkeleton() {
  return (
    <div className="w-full animate-pulse space-y-4">
      {/* Spinner + message */}
      <div className="flex flex-col items-center text-center py-6 space-y-3">
        <div className="relative">
          <div className="w-10 h-10 rounded-full border-4 border-slate-200 dark:border-slate-700" />
          <div className="absolute inset-0 w-10 h-10 rounded-full border-4 border-transparent border-t-indigo-500 animate-spin" />
        </div>
        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Preparing course map...</p>
      </div>

      {/* Skeleton table */}
      <div className="rounded-xl border border-slate-200/60 dark:border-slate-700 overflow-hidden">
        {/* Title row */}
        <div className="px-4 py-3 bg-slate-50/80 dark:bg-slate-800/60 border-b border-slate-200/60 dark:border-slate-700">
          <div className="h-5 w-48 bg-slate-200 dark:bg-slate-700 rounded" />
        </div>
        {/* Column headers */}
        <div className="flex gap-4 px-4 py-2.5 bg-slate-50/50 dark:bg-slate-800/40 border-b border-slate-200/60 dark:border-slate-700">
          <div className="h-3 w-8 bg-slate-200 dark:bg-slate-700 rounded" />
          <div className="h-3 w-24 bg-slate-200 dark:bg-slate-700 rounded" />
          <div className="h-3 flex-1 bg-slate-200 dark:bg-slate-700 rounded" />
          <div className="h-3 w-32 bg-slate-200 dark:bg-slate-700 rounded" />
          <div className="h-3 w-20 bg-slate-200 dark:bg-slate-700 rounded" />
        </div>
        {/* Rows */}
        {[1, 2, 3, 4, 5, 6].map((row) => (
          <div
            key={row}
            className="flex gap-4 px-4 py-3 border-b border-slate-100 dark:border-slate-800 last:border-b-0"
          >
            <div className="h-3 w-8 bg-slate-100 dark:bg-slate-800 rounded" />
            <div className={`h-3 w-24 bg-slate-100 dark:bg-slate-800 rounded`} />
            <div
              className={`h-3 flex-1 bg-slate-100 dark:bg-slate-800 rounded ${row % 3 === 0 ? 'max-w-[70%]' : ''}`}
            />
            <div className="h-3 w-32 bg-slate-100 dark:bg-slate-800 rounded" />
            <div className="h-3 w-20 bg-slate-100 dark:bg-slate-800 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function CourseMapPausedState({ onContinue }) {
  return (
    <div className="glass rounded-squircle-sm px-6 py-10 text-center">
      <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Build paused</p>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        The model transfer and course generation are stopped. Continue when you are ready.
      </p>
      <button
        type="button"
        onClick={onContinue}
        className="tactile mt-4 rounded-squircle-xs bg-slate-900 px-5 py-2 text-xs font-semibold text-white shadow-btn transition hover:bg-slate-800 dark:bg-white dark:text-slate-900"
      >
        Continue build
      </button>
    </div>
  );
}

/**
 * Skeleton for static pages (Changelog, Privacy, Terms).
 */
export function PageSkeleton() {
  return (
    <div className="min-h-screen bg-white dark:bg-slate-900 px-6 py-12">
      <div className="max-w-2xl mx-auto space-y-6 animate-pulse">
        <div className="h-8 w-48 bg-slate-200 dark:bg-slate-700 rounded-lg" />
        <div className="space-y-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className={`h-4 bg-slate-100 dark:bg-slate-800 rounded ${i % 3 === 0 ? 'w-3/4' : 'w-full'}`} />
          ))}
        </div>
        <div className="h-6 w-40 bg-slate-200 dark:bg-slate-700 rounded-lg" />
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className={`h-4 bg-slate-100 dark:bg-slate-800 rounded ${i % 2 === 0 ? 'w-5/6' : 'w-full'}`} />
          ))}
        </div>
      </div>
    </div>
  );
}
