import React, { useEffect, useState } from 'react';
export default function GrantEditor({ record, draftId, onSave }) {
  const draft = record?.drafts[draftId];
  const [lessons, setLessons] = useState([]),
    [sources, setSources] = useState([]),
    [features, setFeatures] = useState([]);
  useEffect(() => {
    setLessons(
      record.grant?.draftId === draftId ? record.grant.lessonIds : draft?.plan?.lessons.map((l) => l.id) || [],
    );
    setSources(record.grant?.sourceIds || record.sources.map((s) => s.sourceId));
    setFeatures(record.grant?.featureIds || record.request.requestedFeatures);
  }, [record, draftId, draft]);
  if (!draft?.plan || draft.application || draft.reservation || draft.supersededByRequestRevision) return null;
  const toggle = (set, value) =>
    set((current) => (current.includes(value) ? current.filter((x) => x !== value) : [...current, value]));
  const complete = draft.plan.lessons.every((l) => draft.bundles[l.id]);
  return (
    <details className="rounded-lg border p-3 text-sm">
      <summary className="cursor-pointer font-semibold">AI revision permissions</summary>
      <p className="my-2">
        Choose what this AI connection may revise. Course structure and learning objectives stay fixed. Applying changes
        still requires your review.
      </p>
      <fieldset>
        <legend className="font-semibold">Lessons</legend>
        {draft.plan.lessons.map((lesson) => (
          <label className="block" key={lesson.id}>
            <input
              type="checkbox"
              checked={lessons.includes(lesson.id)}
              onChange={() => toggle(setLessons, lesson.id)}
            />{' '}
            {lesson.title}
          </label>
        ))}
      </fieldset>
      <fieldset className="mt-2">
        <legend className="font-semibold">Materials it may change</legend>
        {record.request.requestedFeatures.map((feature) => (
          <label className="block" key={feature}>
            <input type="checkbox" checked={features.includes(feature)} onChange={() => toggle(setFeatures, feature)} />{' '}
            {{ lessonPlans: 'Lesson plans', assignments: 'Assignments', rubrics: 'Rubrics' }[feature]}
          </label>
        ))}
      </fieldset>
      <fieldset className="mt-2">
        <legend className="font-semibold">Sources it may read</legend>
        {record.sources.length ? (
          record.sources.map((source) => (
            <label className="block" key={source.sourceId}>
              <input
                type="checkbox"
                checked={sources.includes(source.sourceId)}
                onChange={() => toggle(setSources, source.sourceId)}
              />{' '}
              {source.title}
            </label>
          ))
        ) : (
          <p>No sources shared.</p>
        )}
      </fieldset>
      {!complete && <p className="mt-2">Receive all lessons before limiting revision access.</p>}
      <button
        className="mt-3 rounded border px-3 py-2 disabled:opacity-40"
        disabled={!complete || !lessons.length || !features.length || record.revoked}
        onClick={() => onSave({ draftId, lessonIds: lessons, sourceIds: sources, featureIds: features })}
      >
        Limit AI revision access
      </button>
      {record.grant && (
        <button className="ml-2 rounded border px-3 py-2" onClick={() => onSave(null)}>
          Restore full request access
        </button>
      )}
    </details>
  );
}
