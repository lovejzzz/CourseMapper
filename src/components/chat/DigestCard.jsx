import React from 'react';

/**
 * DigestCard — the TA's post-generation observations (v0.9.2).
 *
 * At most three quiet chips: observation → why it matters → follow-up
 * prompts. Nothing auto-applies; every button only starts a conversation.
 */
export default function DigestCard({ digest, onPrompt, onDismiss, status }) {
  const observations = digest?.observations || [];
  if (observations.length === 0) return null;
  const dismissed = status === 'dismissed';

  return (
    <div className="glass rounded-squircle-xs px-4 py-3 border border-amber-200/50 bg-amber-50/30">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[12px] font-semibold text-amber-700">
          Worth a look — {observations.length} observation{observations.length > 1 ? 's' : ''} from your new package
        </p>
        {!dismissed && onDismiss && (
          <button
            onClick={onDismiss}
            className="text-[11px] text-slate-400 hover:text-slate-600 transition-colors"
            title="Dismiss observations"
          >
            Dismiss
          </button>
        )}
      </div>
      <div className="space-y-2.5">
        {observations.map((entry) => (
          <div key={entry.id} className="rounded-lg bg-white/60 px-3 py-2">
            <p className="text-[12.5px] text-slate-700 leading-snug">{entry.observation}</p>
            <p className="text-[11px] text-slate-500 mt-0.5 italic">{entry.whyItMatters}</p>
            {!dismissed && (
              <div className="flex gap-1.5 mt-1.5">
                {(entry.prompts || []).map((promptEntry) => (
                  <button
                    key={promptEntry.label}
                    onClick={() => onPrompt?.(promptEntry.prompt)}
                    className="text-[11px] px-2 py-0.5 rounded-md bg-amber-100/80 text-amber-800 hover:bg-amber-200/80 transition-colors font-medium"
                  >
                    {promptEntry.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      <p className="text-[10px] text-slate-400 mt-2">Observations only — nothing was changed.</p>
    </div>
  );
}
