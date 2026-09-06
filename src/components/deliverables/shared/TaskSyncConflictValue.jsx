import React from 'react';

const labels = {
  q: 'Question',
  question: 'Question',
  an: 'Answer',
  answer: 'Answer',
  ca: 'Category',
  category: 'Category',
};

/** Render retained values as content, including lists and removals. A blank
 * JSON.stringify(undefined) would conceal the difference the teacher reviews. */
export default function TaskSyncConflictValue({ value }) {
  if (value === undefined) return <p className="italic">No value at this location.</p>;
  if (value === null) return <p className="italic">Empty value.</p>;
  if (Array.isArray(value))
    return value.length ? (
      <ol className="list-decimal space-y-3 pl-5">
        {value.map((item, index) => (
          <li key={index}>
            <TaskSyncConflictValue value={item} />
          </li>
        ))}
      </ol>
    ) : (
      <p className="italic">Empty list.</p>
    );
  if (typeof value === 'object')
    return (
      <dl className="space-y-1">
        {Object.entries(value).map(([key, item]) => (
          <div key={key}>
            <dt className="font-medium">{labels[key] || key.replace(/([a-z])([A-Z])/g, '$1 $2')}</dt>
            <dd className="whitespace-pre-wrap break-words">
              <TaskSyncConflictValue value={item} />
            </dd>
          </div>
        ))}
      </dl>
    );
  return <p className="whitespace-pre-wrap break-words">{String(value)}</p>;
}
