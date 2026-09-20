import React, { useEffect, useRef, useState } from 'react';
import { extractSourceFile } from '../../lib/authoring/sourceFiles.js';

export default function SourceFilePicker({ sources, onChange, onBusy, workspaceFiles = [] }) {
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [chosen, setChosen] = useState([]);
  const available = workspaceFiles.filter((file) => file instanceof File);
  const chosenFiles = available.filter((file) => chosen.includes(file));
  const run = useRef(0);
  useEffect(
    () => () => {
      run.current++;
      onBusy(false);
    },
    [onBusy],
  );
  async function load(files) {
    const token = ++run.current;
    onChange([]);
    if (files.length > 5) {
      setLoading(false);
      onBusy(false);
      setMessage('Choose up to five files at a time.');
      return;
    }
    setLoading(true);
    onBusy(true);
    setMessage('');
    try {
      const selected = [];
      for (const file of files) selected.push(await extractSourceFile(file));
      if (run.current === token) onChange(selected.map((source) => ({ source, selected: false })));
    } catch (error) {
      if (run.current === token) setMessage(error.message);
    } finally {
      if (run.current === token) {
        setLoading(false);
        onBusy(false);
      }
    }
  }
  function cancel() {
    run.current++;
    onChange([]);
    setLoading(false);
    onBusy(false);
    setChosen([]);
    setMessage('File selection cleared.');
  }
  return (
    <div className="space-y-2 rounded border border-slate-200 p-3">
      {available.length > 0 && (
        <fieldset className="space-y-2 border-b pb-3" disabled={loading}>
          <legend className="text-sm font-semibold">Existing workspace attachments</legend>
          <p className="text-xs text-slate-600">
            Choose up to five attachments to review. Nothing is shared until you select its extracted text below and
            save the request. Reviewing a new selection replaces the current file selection.
          </p>
          {available.map((file, index) => (
            <label className="flex gap-2 text-sm" key={`${file.name}-${index}`}>
              <input
                type="checkbox"
                checked={chosen.includes(file)}
                onChange={(event) => {
                  const checked = event.target.checked;
                  setChosen((previous) =>
                    checked
                      ? [...previous.filter((entry) => available.includes(entry)), file]
                      : previous.filter((entry) => entry !== file),
                  );
                }}
              />
              Review workspace file: {file.name}
            </label>
          ))}
          <button
            type="button"
            className="rounded border px-3 py-2 text-sm disabled:opacity-40"
            disabled={!chosenFiles.length}
            onClick={() => load(chosenFiles)}
          >
            Review selected workspace attachments
          </button>
        </fieldset>
      )}
      <label className="block text-sm">
        Source files to review
        <input
          className="mt-1 block w-full text-sm"
          type="file"
          multiple
          disabled={loading}
          onChange={(event) => {
            const files = [...event.target.files];
            event.target.value = '';
            if (files.length) load(files);
          }}
        />
      </label>
      <p className="text-xs text-slate-600">
        Files are read on this device. Select only the text you want to share. Original files are not uploaded. Images,
        scans and diagrams are not interpreted.
      </p>
      {(loading || sources.length > 0) && (
        <button type="button" className="text-sm underline" onClick={cancel}>
          Clear file selection
        </button>
      )}
      {loading && <p role="status">Extracting text locally…</p>}
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
      {sources.map(({ source, selected }, index) => (
        <div key={source.sourceId} className="border-t pt-2">
          <label className="flex gap-2 text-sm">
            <input
              type="checkbox"
              checked={selected}
              onChange={(event) =>
                onChange(
                  sources.map((entry, i) => (i === index ? { ...entry, selected: event.target.checked } : entry)),
                )
              }
            />
            Share {source.title}
          </label>
          <p className="text-xs text-slate-600">
            {source.extraction.status === 'text-extracted'
              ? 'Text extracted. Review it below before selecting this file.'
              : 'No readable text extracted. Only the filename and this unavailable status will be shared.'}
            {source.extraction.visualStatus === 'unreviewed' && ' Visual content remains unreviewed.'}
            {source.redacted && ' Recognized credentials were redacted.'}
          </p>
          {source.excerpts.length > 0 && (
            <details>
              <summary className="cursor-pointer text-sm">Review extracted text: {source.title}</summary>
              <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded bg-slate-50 p-2 text-xs">
                {source.excerpts.map((e) => e.text).join('\n\n')}
              </pre>
            </details>
          )}
        </div>
      ))}
    </div>
  );
}
