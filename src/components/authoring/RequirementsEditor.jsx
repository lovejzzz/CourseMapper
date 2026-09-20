import React, { useState } from 'react';

export default function RequirementsEditor({ record, onSave }) {
  const [changes, setChanges] = useState(() =>
    Object.fromEntries(
      ['title', 'brief', 'learnerProfile', 'language', 'lessonCount', 'sessionMinutes'].map((key) => [
        key,
        record.request[key],
      ]),
    ),
  );
  const locked = record.grant || Object.values(record.drafts).some((draft) => draft.reservation && !draft.application);
  return (
    <details className="rounded border p-3 text-sm">
      <summary className="cursor-pointer font-semibold">Edit teaching requirements</summary>
      <p className="my-2">
        Saving requires a new draft. Previous unapplied drafts remain in history but cannot be reviewed or applied.
        Applied courses stay unchanged. Include revised learning objectives in the teaching brief.
      </p>
      {locked && (
        <p className="my-2">
          Restore full request access in AI revision permissions and resolve any pending application first, or create a
          new request.
        </p>
      )}
      {[
        ['title', 'Revised course title'],
        ['brief', 'Revised teaching brief and learning objectives'],
        ['learnerProfile', 'Revised learner profile'],
        ['language', 'Revised language'],
        ['lessonCount', 'Revised lesson count'],
        ['sessionMinutes', 'Revised minutes per lesson'],
      ].map(([key, label]) => (
        <label className="my-2 block" key={key}>
          {label}
          {key === 'brief' ? (
            <textarea
              aria-label={label}
              className="block w-full rounded border p-2"
              rows={4}
              value={changes[key]}
              onChange={(event) => setChanges({ ...changes, [key]: event.target.value })}
            />
          ) : (
            <input
              aria-label={label}
              className="block w-full rounded border p-2"
              type={['lessonCount', 'sessionMinutes'].includes(key) ? 'number' : 'text'}
              value={changes[key]}
              onChange={(event) =>
                setChanges({
                  ...changes,
                  [key]: ['lessonCount', 'sessionMinutes'].includes(key)
                    ? Number(event.target.value)
                    : event.target.value,
                })
              }
            />
          )}
        </label>
      ))}
      <button
        className="rounded border px-3 py-2 disabled:opacity-40"
        disabled={!!locked || record.revoked || record.expiresAt <= Date.now()}
        onClick={() => onSave(changes)}
      >
        Save revised requirements
      </button>
    </details>
  );
}
