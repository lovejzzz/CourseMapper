import React, { useState } from 'react';

/**
 * ProposalCard — Renders an AI proposal with clickable option cards.
 *
 * Each card shows title + collapsed description (2 lines).
 * A "Show details" toggle reveals the full description.
 *
 * States:
 * - pending: all options clickable with hover effects
 * - selected: chosen option highlighted green, others faded
 * - failed: failed option shown in red, others remain clickable
 * - dismissed: all options faded (user typed something else)
 */
export default function ProposalCard({ proposal, status, selectedLabel, failedLabel, failedMessage, onSelect }) {
  if (!proposal?.options?.length) return null;

  const isPending = status === 'pending';
  const isSelected = status === 'selected';
  const isFailed = status === 'failed';
  const isDismissed = status === 'dismissed';

  return (
    <div className="mx-1 my-1 animate-spring-in">
      {/* Proposal message header */}
      <div className="flex items-start gap-2.5 mb-2">
        <div className="w-6 h-6 mt-0.5 rounded-lg bg-gradient-to-br from-indigo-500/10 to-violet-500/10 flex items-center justify-center flex-shrink-0">
          <svg className="w-3 h-3 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
        </div>
        <p className="text-[13px] text-slate-700 font-medium leading-snug pt-1">
          {proposal.message || 'Here are some options:'}
        </p>
      </div>

      {/* Option cards */}
      <div className="ml-8 space-y-2">
        {proposal.options.map((option) => {
          const isThisFailed = isFailed && option.label === failedLabel;
          // Clickable if: pending, OR this is a non-failed option when another failed
          const clickable = isPending || (isFailed && !isThisFailed);

          return (
            <OptionCard
              key={option.label}
              option={option}
              isPending={clickable}
              isChosen={isSelected && option.label === selectedLabel}
              isFailed={isThisFailed}
              failedMessage={isThisFailed ? failedMessage : null}
              isFaded={(isSelected && option.label !== selectedLabel) || isDismissed}
              onSelect={onSelect}
            />
          );
        })}
      </div>

      {/* Status indicator */}
      {isSelected && (
        <div className="ml-8 mt-2 text-[11px] text-emerald-600 font-medium flex items-center gap-1.5">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          Option {selectedLabel} selected
        </div>
      )}
      {isFailed && (
        <div className="ml-8 mt-2 text-[11px] text-red-500 font-medium flex items-center gap-1.5">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Option {failedLabel} failed — try another option
        </div>
      )}
      {isDismissed && (
        <div className="ml-8 mt-1.5 text-[11px] text-slate-400 italic">
          Dismissed
        </div>
      )}
    </div>
  );
}

// ── Individual option card with expand/collapse ──────────────────────────────

function OptionCard({ option, isPending, isChosen, isFailed, failedMessage, isFaded, onSelect }) {
  const [expanded, setExpanded] = useState(false);
  // Consider "long" if description exceeds ~100 chars (roughly 2 lines)
  const isLong = option.description && option.description.length > 100;

  function handleCardClick() {
    if (isPending) onSelect(option.label);
  }

  function handleExpandToggle(e) {
    e.stopPropagation(); // Don't trigger card selection
    setExpanded(prev => !prev);
  }

  return (
    <button
      onClick={handleCardClick}
      disabled={!isPending && !isFailed}
      className={`
        w-full text-left rounded-xl border px-3.5 py-2.5 transition-all duration-200
        ${isFailed
          ? 'bg-red-50/60 border-red-300/50 shadow-glass cursor-pointer'
          : isPending
            ? 'tactile bg-white/50 border-slate-200/30 shadow-glass hover:bg-indigo-50/60 hover:border-indigo-300/50 hover:shadow-glow-indigo cursor-pointer'
            : isChosen
              ? 'bg-emerald-50/60 border-emerald-300/50 shadow-glass'
              : isFaded
                ? 'bg-white/20 border-slate-200/15 opacity-40 cursor-default'
                : 'bg-white/30 border-slate-200/20 cursor-default'
        }
      `}
    >
      <div className="flex items-start gap-2.5">
        {/* Label badge */}
        <span className={`
          flex-shrink-0 w-6 h-6 rounded-lg flex items-center justify-center text-[11px] font-bold mt-0.5
          ${isFailed
            ? 'bg-red-100/80 text-red-600'
            : isPending
              ? 'bg-indigo-100/80 text-indigo-600'
              : isChosen
                ? 'bg-emerald-100/80 text-emerald-700'
                : 'bg-slate-100/60 text-slate-400'
          }
        `}>
          {isChosen ? (
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          ) : isFailed ? (
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : option.label}
        </span>

        <div className="flex-1 min-w-0">
          <p className={`text-[13px] font-semibold leading-snug ${
            isFailed ? 'text-red-700' : isChosen ? 'text-emerald-700' : isPending ? 'text-slate-800' : 'text-slate-500'
          }`}>
            {option.title}
          </p>

          {/* Description — collapsed (2 lines) or expanded */}
          <p className={`text-[11px] mt-0.5 leading-relaxed ${
            !expanded && isLong ? 'line-clamp-2' : ''
          } ${
            isFailed ? 'text-red-600/70' : isChosen ? 'text-emerald-600/80' : isPending ? 'text-slate-500' : 'text-slate-400'
          }`}>
            {option.description}
          </p>

          {/* Failed error message + retry */}
          {isFailed && failedMessage && (
            <p className="text-[11px] mt-1 text-red-500 font-medium">
              Failed: {failedMessage}
            </p>
          )}
          {isFailed && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => { e.stopPropagation(); onSelect(option.label); }}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); onSelect(option.label); } }}
              className="inline-flex items-center gap-0.5 text-[10px] font-semibold mt-1 text-indigo-400 hover:text-indigo-600 transition-colors"
            >
              <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Retry
            </span>
          )}

          {/* Expand / collapse toggle */}
          {isLong && !isFailed && (
            <span
              role="button"
              tabIndex={0}
              onClick={handleExpandToggle}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleExpandToggle(e); }}
              className={`inline-flex items-center gap-0.5 text-[10px] font-semibold mt-1 transition-colors ${
                isPending ? 'text-indigo-400 hover:text-indigo-600' : 'text-slate-400'
              }`}
            >
              {expanded ? 'Show less' : 'Show details'}
              <svg className={`w-2.5 h-2.5 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
                fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
              </svg>
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
