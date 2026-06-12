import React from 'react';
import NoticeBanner from '../NoticeBanner';

/**
 * DigestCard — the TA's post-generation observations (v0.9.2).
 *
 * At most three quiet chips: observation → why it matters. Nothing
 * auto-applies. v0.14.4 WS-C1: the card stays the NARRATIVE surface, but its
 * action button now routes into the ONE review queue (focused on this
 * observation) instead of being a separate review path — when the host wires
 * onOpenInQueue. Without it (legacy hosts/tests) the follow-up prompt
 * buttons still only start a conversation.
 *
 * v0.14.4 WS-E2: the amber shell is NoticeBanner (shared with the export
 * panel's notice) — one attention component, not two.
 */
export default function DigestCard({ digest, onPrompt, onDismiss, status, onOpenInQueue }) {
  const observations = digest?.observations || [];
  if (observations.length === 0) return null;
  const dismissed = status === 'dismissed';

  return (
    <NoticeBanner
      severity="warning"
      title={`Worth a look — ${observations.length} observation${observations.length > 1 ? 's' : ''} from your new package`}
      headerAction={
        !dismissed && onDismiss ? (
          <button
            onClick={onDismiss}
            className="text-xs text-slate-400 hover:text-slate-600 transition-colors dark:hover:text-slate-300"
            title="Dismiss observations"
          >
            Dismiss
          </button>
        ) : null
      }
    >
      <div className="space-y-2.5">
        {observations.map((entry) => (
          <div key={entry.id} className="rounded-lg bg-white/60 px-3 py-2">
            <p className="text-[12.5px] text-slate-700 leading-snug">{entry.observation}</p>
            <p className="text-xs text-slate-500 mt-0.5 italic">{entry.whyItMatters}</p>
            {!dismissed && (
              <div className="flex gap-1.5 mt-1.5">
                {onOpenInQueue ? (
                  <button
                    data-testid="digest-open-in-queue"
                    onClick={() => onOpenInQueue(entry)}
                    className="text-xs px-2 py-0.5 rounded bg-amber-100/80 text-amber-800 hover:bg-amber-200/80 transition-colors font-medium dark:bg-amber-500/10 dark:text-amber-200 dark:hover:bg-amber-500/20"
                  >
                    Open in review queue
                  </button>
                ) : (
                  (entry.prompts || []).map((promptEntry) => (
                    <button
                      key={promptEntry.label}
                      onClick={() => onPrompt?.(promptEntry.prompt)}
                      className="text-xs px-2 py-0.5 rounded bg-amber-100/80 text-amber-800 hover:bg-amber-200/80 transition-colors font-medium dark:bg-amber-500/10 dark:text-amber-200 dark:hover:bg-amber-500/20"
                    >
                      {promptEntry.label}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        ))}
      </div>
      <p className="text-xs text-slate-400 mt-2">Observations only — nothing was changed.</p>
    </NoticeBanner>
  );
}
