import React from 'react';
import NoticeBanner from '../NoticeBanner';
import { getPackageTrustStatus } from '../../lib/packageTrustStatus';

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
function isCleanReadyPackage(packageQualityPass) {
  return getPackageTrustStatus({ packageQualityPass }).clean;
}

export default function DigestCard({ digest, onPrompt, onDismiss, status, onOpenInQueue, packageQualityPass = null }) {
  const observations = digest?.observations || [];
  if (observations.length === 0) return null;
  const dismissed = status === 'dismissed';
  const cleanReady = isCleanReadyPackage(packageQualityPass);
  const severity = cleanReady ? 'info' : 'warning';
  const title = cleanReady
    ? `Optional polish — ${observations.length} observation${observations.length > 1 ? 's' : ''}`
    : `Worth a look — ${observations.length} observation${observations.length > 1 ? 's' : ''}`;
  const actionClass = cleanReady
    ? 'shrink-0 text-[12px] font-semibold text-slate-500 dark:text-slate-300'
    : 'shrink-0 text-[12px] font-semibold text-amber-700 dark:text-amber-300';

  // v0.14.6 calm pass: with the review queue wired, this card is an entry
  // point, not a second reading surface — one clamped line per observation
  // that opens the queue, where the full text and why-it-matters live.
  if (onOpenInQueue) {
    return (
      <NoticeBanner
        severity={severity}
        title={title}
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
        <div className="space-y-1">
          {observations.map((entry) => (
            <button
              key={entry.id}
              data-testid="digest-open-in-queue"
              onClick={() => onOpenInQueue(entry)}
              disabled={dismissed}
              className="tactile flex w-full items-center gap-2 rounded-md bg-white/60 px-2.5 py-1.5 text-left transition-colors hover:bg-white/90 disabled:cursor-default disabled:opacity-60 dark:bg-white/5 dark:hover:bg-white/10"
              title="Open in review queue"
            >
              <span className="min-w-0 flex-1 truncate text-xs leading-snug text-slate-700 dark:text-slate-200">
                {entry.observation}
              </span>
              <span className={actionClass}>{cleanReady ? 'Polish' : 'Review'}</span>
            </button>
          ))}
        </div>
      </NoticeBanner>
    );
  }

  return (
    <NoticeBanner
      severity={severity}
      title={`${title}${cleanReady ? '' : ' from your new package'}`}
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
                {(entry.prompts || []).map((promptEntry) => (
                  <button
                    key={promptEntry.label}
                    onClick={() => onPrompt?.(promptEntry.prompt)}
                    className="text-xs px-2 py-0.5 rounded bg-amber-100/80 text-amber-800 hover:bg-amber-200/80 transition-colors font-medium dark:bg-amber-500/10 dark:text-amber-200 dark:hover:bg-amber-500/20"
                  >
                    {promptEntry.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      <p className="text-xs text-slate-400 mt-2">Observations only — nothing was changed.</p>
    </NoticeBanner>
  );
}
