import React from 'react';
import { E } from './SharedComponents';

/** The same editable teacher reference used by task briefs and rubrics. */
export default function TeachingTaskReference({ reference, path, onEdit }) {
  if (!reference?.strongSample) return null;
  return (
    <details data-teaching-task-reference className="rounded-lg border border-slate-200/70 bg-slate-50/60 p-3">
      <summary className="cursor-pointer text-xs font-semibold text-slate-700">
        Teacher reference: answers and feedback
      </summary>
      <div className="mt-3 space-y-3 text-xs leading-relaxed text-slate-700">
        {[
          ['strongSample', 'Strong response'],
          ['partialSample', 'Partial response'],
          ['scoringRationale', 'Why the score differs'],
          ['revisionPrompt', 'Feedback for revision'],
        ].map(([field, label]) =>
          reference[field] ? (
            <div key={field}>
              <p className="mb-1 font-semibold text-slate-800">{label}</p>
              <E value={reference[field]} path={[...path, field]} onEdit={onEdit} multiline />
            </div>
          ) : null,
        )}
      </div>
    </details>
  );
}
