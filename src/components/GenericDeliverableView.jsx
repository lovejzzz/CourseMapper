import React from 'react';

/**
 * Generic fallback view for custom deliverables.
 * Renders raw JSON data as a readable list.
 */
export default function GenericDeliverableView({ featureId, data, isStreaming }) {
  if (!data && !isStreaming) {
    return (
      <div className="glass rounded-squircle-sm p-8 text-center text-slate-400 text-sm">
        No content generated yet.
      </div>
    );
  }

  if (isStreaming) {
    return (
      <div className="glass rounded-squircle-sm p-8 text-center">
        <div className="flex items-center justify-center gap-2 text-indigo-500 text-sm font-medium">
          <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Generating…
        </div>
      </div>
    );
  }

  return (
    <div className="glass rounded-squircle-sm p-6 space-y-4">
      <pre className="text-xs text-slate-600 whitespace-pre-wrap leading-relaxed overflow-auto max-h-[60vh]">
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  );
}
