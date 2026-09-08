import React, { useState } from 'react';
import { prepareResponseCsv } from '../../../lib/teachingResponseCsv.js';

export default function TeachingResponseCsvImport({ source, store, onImported, zh }) {
  const [preview, setPreview] = useState(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const t = (en, cn) => (zh ? cn : en);
  return (
    <details className="rounded border border-slate-200 p-2">
      <summary className="cursor-pointer">{t('Import anonymous CSV', '导入匿名 CSV')}</summary>
      <fieldset disabled={busy} className="mt-2 space-y-2">
        <p>
          {t(
            'One column: response. Up to 50 responses, 1 MB. Remove names and identifying details first.',
            '只含一列：作答。最多50份、1 MB。请先移除姓名和身份信息。',
          )}
        </p>
        <label className="block">
          {t('Choose CSV', '选择 CSV')}
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              setPreview(null);
              setConfirmed(false);
              setError('');
              if (!file) return;
              setBusy(true);
              try {
                if (file.size > 1048576)
                  throw new Error(t('Use a file no larger than 1 MB.', '请选择不超过1 MB的文件。'));
                setPreview(prepareResponseCsv(source, await file.text()));
              } catch (issue) {
                setError(issue.message);
              } finally {
                setBusy(false);
              }
            }}
          />
        </label>
        {preview && (
          <>
            <p>
              {preview[0].snapshot.source.title} · {t(`${preview.length} responses`, `${preview.length}份作答`)}
            </p>
            <p>{preview[0].snapshot.source.objective}</p>
            <details>
              <summary>{t('Inspect all responses', '检查全部作答')}</summary>
              <ol className="max-h-64 overflow-auto list-decimal pl-6">
                {preview.map((r) => (
                  <li key={r.id} className="whitespace-pre-wrap break-words">
                    {r.response}
                  </li>
                ))}
              </ol>
            </details>
            <label className="block">
              <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />{' '}
              {t('These anonymous responses belong to the task shown above', '这些匿名作答属于上面显示的任务')}
            </label>
            <button
              type="button"
              className="rounded border border-slate-300 bg-white px-3 py-1.5 disabled:opacity-40"
              disabled={!confirmed}
              onClick={async () => {
                setBusy(true);
                setError('');
                try {
                  await store.addBatch(preview);
                  const imported = preview;
                  setPreview(null);
                  setConfirmed(false);
                  await onImported(imported);
                } catch (issue) {
                  setError(issue.message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {t('Import to this device', '导入到本机')}
            </button>
          </>
        )}
        {error && <p role="alert">{error}</p>}
      </fieldset>
    </details>
  );
}
