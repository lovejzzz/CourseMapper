import React, { useState } from 'react';
import SourceFilePicker from './SourceFilePicker';
import { id } from '../../lib/authoringCore/primitives.js';

export default function SourceEditor({ record, workspaceFiles, onSave }) {
  const [keep, setKeep] = useState(() => record.sources.map((source) => source.sourceId));
  const [text, setText] = useState('');
  const [files, setFiles] = useState([]);
  const [extracting, setExtracting] = useState(false);
  const locked = Object.values(record.drafts).some((draft) => draft.reservation && !draft.application);
  function save() {
    const sources = record.sources.filter((source) => keep.includes(source.sourceId));
    if (text.trim())
      sources.push({ sourceId: id(), title: 'Added shared text', excerpts: [{ excerptId: id(), text }] });
    sources.push(...files.filter((entry) => entry.selected).map((entry) => entry.source));
    onSave(sources);
  }
  return (
    <details className="rounded border p-3 text-sm">
      <summary className="cursor-pointer font-semibold">Update shared sources</summary>
      <p className="my-2">
        Choose sources to keep and add replacements below. Saving invalidates pending reviews and old source references
        must be revised. Applied courses and copies already held by your AI conversation remain.
      </p>
      {record.sources.map((source) => (
        <div className="my-2" key={source.sourceId}>
          <label className="block">
            <input
              type="checkbox"
              checked={keep.includes(source.sourceId)}
              onChange={(event) =>
                setKeep((current) =>
                  event.target.checked
                    ? [...current, source.sourceId]
                    : current.filter((value) => value !== source.sourceId),
                )
              }
            />{' '}
            Keep sharing {source.title}
          </label>
          <details className="mt-1 rounded border p-2">
            <summary className="cursor-pointer">Review stored source: {source.title}</summary>
            <p className="my-1 text-xs text-slate-600">
              {source.extraction?.status === 'unavailable' || !source.excerpts.length
                ? 'No readable text available.'
                : 'Stored text snapshot.'}{' '}
              {source.extraction?.visualStatus === 'unreviewed' && 'Visual content remains unreviewed. '}
              {source.redacted && 'Recognized credentials were redacted.'}
            </p>
            {source.excerpts.length > 0 && (
              <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words text-xs">
                {source.excerpts.map((excerpt) => excerpt.text).join('\n\n')}
              </pre>
            )}
          </details>
        </div>
      ))}
      <label className="my-2 block">
        New shared source text
        <textarea
          className="block w-full rounded border p-2"
          rows={3}
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
      </label>
      <SourceFilePicker workspaceFiles={workspaceFiles} sources={files} onChange={setFiles} onBusy={setExtracting} />
      {record.grant && (
        <p className="my-2">
          New sources remain outside the existing limited AI grant until you update revision permissions.
        </p>
      )}
      {locked && <p className="my-2">Resolve the pending application before changing sources.</p>}
      <button
        className="mt-2 rounded border px-3 py-2 disabled:opacity-40"
        disabled={extracting || locked || record.revoked || record.expiresAt <= Date.now()}
        onClick={save}
      >
        Save shared sources
      </button>
    </details>
  );
}
