import React from 'react';

export default function CourseMapGenerationStatus({ error, paused, onContinue }) {
  return (
    <>
      {error && (
        <div className="glass rounded-squircle-sm p-5 animate-spring-in">
          <div className="flex items-start gap-3 text-red-600 text-sm">
            <div className="w-8 h-8 rounded-squircle-xs bg-red-100 flex items-center justify-center flex-shrink-0">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <p className="pt-1 whitespace-pre-line leading-relaxed">{error}</p>
          </div>
        </div>
      )}
      {paused && (
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
      )}
    </>
  );
}
