import React, { useState, useEffect } from 'react';

/**
 * EditProposalPanel — AI Edit Suggestion Panel
 *
 * Appears inline above a lesson card when the user has edited a deliverable's
 * body text and the AI has generated (or is generating) a revision that
 * incorporates the change.
 *
 * The user can:
 *   Insert ✓   — accept the AI revision (merges into the lesson card)
 *   Edit       — modify the AI suggestion before inserting
 *   Regenerate — ask the AI to try again
 *   × (dismiss) — keep their raw keystroke edit, no AI involvement
 *
 * Props:
 *   proposal       { status: 'streaming'|'ready'|'dismissed', proposedData, editContext }
 *   featureId      string
 *   onInsert       (editedData) => void
 *   onRegenerate   () => void
 *   onDismiss      () => void
 */
export default function EditProposalPanel({ proposal, featureId, onInsert, onRegenerate, onDismiss }) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedData, setEditedData] = useState(null);

  // When proposal changes to ready, initialize editedData
  useEffect(() => {
    if (proposal?.status === 'ready' && proposal?.proposedData && !isEditing) {
      setEditedData(proposal.proposedData);
    }
  }, [proposal?.status, proposal?.proposedData]);

  if (!proposal || proposal.status === 'dismissed') return null;

  const { status, proposedData, editContext } = proposal;
  const isStreaming = status === 'streaming';
  const isReady = status === 'ready';

  const dataToRender = isEditing ? editedData : proposedData;

  return (
    <div className={`mb-3 rounded-squircle-xs overflow-hidden border transition-all duration-300 ${isStreaming
        ? 'border-indigo-200/60 bg-indigo-50/40 animate-pulse-subtle'
        : 'border-amber-200/70 bg-amber-50/40'
      }`}>
      {/* ── Header ── */}
      <div className={`flex items-center gap-2 px-3.5 py-2 border-b ${isStreaming ? 'border-indigo-200/50 bg-indigo-50/60' : 'border-amber-200/50 bg-amber-50/60'
        }`}>
        {/* Animated dot */}
        {isStreaming ? (
          <span className="relative flex h-2 w-2 flex-shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500" />
          </span>
        ) : (
          <svg className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-11.25a.75.75 0 00-1.5 0v4.59L7.3 9.24a.75.75 0 00-1.1 1.02l3.25 3.5a.75.75 0 001.1 0l3.25-3.5a.75.75 0 10-1.1-1.02l-1.95 2.1V6.75z" clipRule="evenodd" />
          </svg>
        )}

        <div className="flex-1 min-w-0">
          <span className={`text-[10px] font-bold uppercase tracking-wide ${isStreaming ? 'text-indigo-600' : 'text-amber-700'
            }`}>
            ✦ AI suggestion
          </span>
          {editContext && (
            <span className={`ml-1.5 text-[10px] font-normal ${isStreaming ? 'text-indigo-500' : 'text-amber-600'
              }`}>
              · {editContext.length > 60 ? editContext.slice(0, 59) + '…' : editContext}
            </span>
          )}
        </div>

        {/* Dismiss button */}
        <button
          onClick={onDismiss}
          title="Dismiss suggestion (keep your edit)"
          className={`flex-shrink-0 w-5 h-5 rounded flex items-center justify-center transition-colors ${isStreaming
              ? 'text-indigo-400 hover:text-indigo-600 hover:bg-indigo-100/60'
              : 'text-amber-400 hover:text-amber-700 hover:bg-amber-100/60'
            }`}
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* ── Body: content preview ── */}
      <div className="px-4 py-3">
        {isStreaming && !proposedData ? (
          // Still waiting for first parseable chunk
          <div className="flex items-center gap-2 py-1">
            <svg className="animate-spin w-3.5 h-3.5 text-indigo-400 flex-shrink-0" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <p className="text-[11px] text-indigo-500 italic">AI is writing a revision…</p>
          </div>
        ) : dataToRender ? (
          isEditing ? (
            <div className="w-full">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-600 mb-1 block">Edit Raw Data (JSON)</span>
              <textarea
                className="w-full h-48 p-2 text-[11px] font-mono border border-amber-200/60 rounded-md bg-amber-50/30 focus:outline-none focus:ring-2 focus:ring-amber-400/50 resize-y"
                value={JSON.stringify(editedData, null, 2)}
                onChange={(e) => {
                  try {
                    setEditedData(JSON.parse(e.target.value));
                    e.target.setCustomValidity('');
                  } catch (err) {
                    // Just let them type even if invalid JSON, but they can't save it properly yet
                    e.target.setCustomValidity('Invalid JSON');
                  }
                }}
              />
            </div>
          ) : (
            <ProposalContent featureId={featureId} data={dataToRender} isStreaming={isStreaming} />
          )
        ) : null}
      </div>

      {/* ── Footer: action buttons ── */}
      {isReady && (
        <div className={`flex items-center justify-end gap-2 px-3.5 py-2 border-t border-amber-200/40 bg-amber-50/30`}>
          <button
            onClick={() => setIsEditing(!isEditing)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${isEditing
                ? 'text-amber-700 bg-amber-200/50 hover:bg-amber-300/50'
                : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100/60 border border-slate-200/60'
              }`}
            title={isEditing ? 'View preview' : 'Edit suggestion'}
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
            {isEditing ? 'Preview' : 'Edit'}
          </button>
          <button
            onClick={onRegenerate}
            disabled={isEditing}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold border transition-all ${isEditing ? 'text-slate-300 border-slate-100 opacity-50 cursor-not-allowed' : 'text-slate-500 border-slate-200/60 hover:text-slate-700 hover:bg-slate-100/60'
              }`}
            title="Ask AI to try again"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Regenerate
          </button>
          <button
            onClick={() => {
              // Get the textarea value if currently editing to ensure we capture the latest valid JSON
              if (isEditing) {
                const textarea = document.querySelector('textarea');
                if (textarea && textarea.checkValidity()) {
                  try {
                    const latestData = JSON.parse(textarea.value);
                    setEditedData(latestData);
                    onInsert(latestData);
                    return;
                  } catch (e) { }
                }
              }
              onInsert(editedData);
            }}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[11px] font-bold text-white bg-emerald-500 hover:bg-emerald-600 shadow-sm transition-all"
            title="Replace this lesson with the AI revision"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
            Insert
          </button>
        </div>
      )}

      {/* While still streaming, show a minimal "writing…" footer */}
      {isStreaming && proposedData && (
        <div className="flex items-center gap-2 px-3.5 py-2 border-t border-indigo-200/40 bg-indigo-50/30">
          <svg className="animate-spin w-3 h-3 text-indigo-400 flex-shrink-0" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span className="text-[10px] text-indigo-500 italic">Writing revision…</span>
        </div>
      )}
    </div>
  );
}

// ─── Content preview — shows key fields of the proposed lesson ───────────────
// Keeps it compact: title + up to 2 objectives/items + 1 more field.
// The user can always see the full content after inserting.

function ProposalContent({ featureId, data, isStreaming }) {
  const color = isStreaming ? 'text-indigo-700' : 'text-amber-800';
  const mutedColor = isStreaming ? 'text-indigo-500' : 'text-amber-600';

  // Helper: render a small list of strings
  function MiniList({ items, max = 2 }) {
    if (!items || items.length === 0) return null;
    const show = items.slice(0, max);
    const rest = items.length - show.length;
    return (
      <ul className="mt-1 space-y-0.5">
        {show.map((item, i) => (
          <li key={i} className={`text-[11px] ${mutedColor} flex gap-1.5`}>
            <span className="mt-0.5 flex-shrink-0">•</span>
            <span className="truncate">{typeof item === 'string' ? item : JSON.stringify(item)}</span>
          </li>
        ))}
        {rest > 0 && (
          <li className={`text-[10px] ${mutedColor} italic ml-3`}>+ {rest} more…</li>
        )}
      </ul>
    );
  }

  function Field({ label, value }) {
    if (!value) return null;
    return (
      <div className="mt-2">
        <span className={`text-[10px] font-semibold uppercase tracking-wide ${mutedColor}`}>{label}</span>
        <p className={`mt-0.5 text-[11px] ${color} line-clamp-2`}>{value}</p>
      </div>
    );
  }

  // Lesson title — common to most deliverables
  const title = data.lessonTitle || data.title || null;

  // Feature-specific key content
  switch (featureId) {
    case 'lessonPlans': {
      const plans = data.plans || [data];
      const plan = Array.isArray(plans) ? plans[0] : plans;
      return (
        <div>
          {title && <p className={`text-[12px] font-semibold ${color}`}>{title}</p>}
          {plan?.objectives && <MiniList items={plan.objectives} />}
          {plan?.homework && <Field label="Homework" value={typeof plan.homework === 'string' ? plan.homework : plan.homework?.description} />}
        </div>
      );
    }
    case 'assignments': {
      return (
        <div>
          {title && <p className={`text-[12px] font-semibold ${color}`}>{title}</p>}
          {data.description && <Field label="Description" value={data.description} />}
          {data.totalPoints && <Field label="Points" value={String(data.totalPoints)} />}
        </div>
      );
    }
    case 'rubrics': {
      const criteria = data.criteria || [];
      return (
        <div>
          {title && <p className={`text-[12px] font-semibold ${color}`}>{title}</p>}
          {criteria.length > 0 && (
            <>
              <span className={`text-[10px] font-semibold uppercase tracking-wide ${mutedColor}`}>Criteria</span>
              <MiniList items={criteria.map(c => c.criterion || c.name || '')} />
            </>
          )}
        </div>
      );
    }
    case 'studyGuides': {
      return (
        <div>
          {title && <p className={`text-[12px] font-semibold ${color}`}>{title}</p>}
          {data.summary && <Field label="Summary" value={data.summary} />}
          {data.keyTerms && <MiniList items={data.keyTerms} max={3} />}
        </div>
      );
    }
    case 'quizBank': {
      const questions = data.questions || data.tiers?.standard?.questions || [];
      return (
        <div>
          {title && <p className={`text-[12px] font-semibold ${color}`}>{title}</p>}
          {questions.length > 0 && (
            <>
              <span className={`text-[10px] font-semibold uppercase tracking-wide ${mutedColor}`}>Questions</span>
              <MiniList items={questions.map(q => q.question || q.prompt || '')} max={2} />
            </>
          )}
        </div>
      );
    }
    case 'slideDecks': {
      const slides = data.slides || [];
      return (
        <div>
          {title && <p className={`text-[12px] font-semibold ${color}`}>{title}</p>}
          {data.learningObjectives && <MiniList items={data.learningObjectives} max={2} />}
          {slides.length > 0 && <Field label="First slide" value={slides[0]?.title} />}
        </div>
      );
    }
    case 'discussions': {
      return (
        <div>
          {title && <p className={`text-[12px] font-semibold ${color}`}>{title}</p>}
          {data.prompt && <Field label="Prompt" value={data.prompt} />}
        </div>
      );
    }
    default: {
      // Generic: show title + first string value we find
      const firstStr = Object.values(data || {}).find(v => typeof v === 'string' && v.length > 10);
      return (
        <div>
          {title && <p className={`text-[12px] font-semibold ${color}`}>{title}</p>}
          {firstStr && <p className={`mt-1 text-[11px] ${mutedColor} line-clamp-2`}>{firstStr}</p>}
        </div>
      );
    }
  }
}
