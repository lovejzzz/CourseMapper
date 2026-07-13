import React from 'react';
import useScionRuntimeStatus from '../hooks/useScionRuntimeStatus';
import { SCION_BROWSER_GEMMA4_DOWNLOAD_LABEL } from '../lib/scionBrowserConstants';

export default function ScionRuntimeStatusBanner({ enabled = false }) {
  const status = useScionRuntimeStatus(enabled);
  if (!enabled || !['loading-runtime', 'loading-model', 'error'].includes(status.phase)) return null;

  const failed = status.phase === 'error';
  const progress = Math.max(0, Math.min(1, Number(status.progress) || 0));
  return (
    <div
      data-testid="scion-runtime-status"
      role={failed ? 'alert' : 'status'}
      aria-live={failed ? 'assertive' : 'polite'}
      className={`fixed bottom-4 left-1/2 z-[90] w-[min(92vw,34rem)] -translate-x-1/2 overflow-hidden rounded-2xl border bg-white/95 shadow-2xl backdrop-blur-xl dark:bg-slate-950/95 ${
        failed ? 'border-red-200 dark:border-red-400/30' : 'border-indigo-200 dark:border-indigo-400/30'
      }`}
    >
      {!failed && (
        <div className="h-1.5 bg-slate-100 dark:bg-slate-800">
          <div
            className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-[width] duration-300"
            style={{ width: `${Math.max(2, progress * 100)}%` }}
          />
        </div>
      )}
      <div className="flex items-start gap-3 px-4 py-3">
        <span
          className={`mt-1 inline-flex h-2.5 w-2.5 shrink-0 rounded-full ${
            failed ? 'bg-red-500' : 'animate-pulse bg-indigo-500'
          }`}
        />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {failed ? 'Scion could not start on this device' : 'Preparing Scion on this device'}
          </p>
          <p className="mt-0.5 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
            {failed
              ? status.error || 'Scion requires a WebGPU and WebAssembly JSPI capable browser.'
              : `${status.message} The first run downloads ${SCION_BROWSER_GEMMA4_DOWNLOAD_LABEL}; later runs reuse the local copy.`}
          </p>
        </div>
        {!failed && (
          <span className="ml-auto shrink-0 text-xs font-semibold text-indigo-600">{Math.floor(progress * 100)}%</span>
        )}
      </div>
    </div>
  );
}
