import { useEffect, useRef, useState } from 'react';
import type { Course } from './domain';
import { MATERIALS, materialTitle, type MaterialKind } from './materials';
import { assertExportable, exportCourse, exportMaterial, safeFilename, type ExportFormat } from './export';

type Format = ExportFormat | 'gdocs' | 'gsheets' | 'gslides';
const labels: Record<Format, string> = {
  docx: 'Word (.docx)',
  pdf: 'PDF (.pdf)',
  html: 'Web page (.html)',
  csv: 'CSV (.csv)',
  xlsx: 'Excel (.xlsx)',
  pptx: 'PowerPoint (.pptx)',
  gdocs: 'Google Docs',
  gsheets: 'Google Sheets',
  gslides: 'Google Slides',
};
function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
export default function ExportPanel({
  course,
  kind,
  audience,
  onClose,
}: {
  course: Course;
  kind?: MaterialKind;
  audience: 'student' | 'teacher';
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<MaterialKind | 'all'>(kind ?? 'all');
  const [format, setFormat] = useState<Format>('docx');
  const [view, setView] = useState(audience);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [googleReady, setGoogleReady] = useState(false);
  const [fileLink, setFileLink] = useState('');
  const dialog = useRef<HTMLElement>(null);
  const google = format.startsWith('g');
  const formats: Format[] =
    selected === 'slideDecks'
      ? ['pptx', 'pdf', 'gslides', 'html']
      : ['docx', 'pdf', 'html', 'xlsx', 'csv', 'gdocs', 'gsheets'];
  let blocked = '';
  try {
    assertExportable(course);
  } catch (error) {
    blocked = (error as Error).message;
  }
  useEffect(() => {
    if (!google || selected === 'all') return;
    let live = true;
    void import('./googleExport')
      .then((module) => module.loadGoogleIdentity())
      .then(() => {
        if (live) setGoogleReady(true);
      })
      .catch((error) => {
        if (live) setError(error.message);
      });
    return () => {
      live = false;
    };
  }, [google, selected]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const fields = () =>
      Array.from(
        dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),select:not(:disabled),a[href]') ?? [],
      );
    fields()[0]?.focus();
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose();
      if (event.key === 'Tab') {
        const items = fields();
        if (event.shiftKey && document.activeElement === items[0]) {
          event.preventDefault();
          items.at(-1)?.focus();
        } else if (!event.shiftKey && document.activeElement === items.at(-1)) {
          event.preventDefault();
          items[0]?.focus();
        }
      }
    };
    const panel = dialog.current;
    panel?.addEventListener('keydown', handler);
    return () => {
      panel?.removeEventListener('keydown', handler);
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, [busy]);
  const run = async () => {
    setBusy(true);
    setError('');
    setFileLink('');
    setProgress('Preparing your files…');
    try {
      if (selected === 'all')
        download(await exportCourse(course, setProgress), `${safeFilename(course.plan!.title)}.zip`);
      else {
        const name = `${safeFilename(course.plan!.title)} — ${materialTitle(selected, course.brief.language)}${view === 'teacher' ? ' — instructor' : ''}`;
        if (google) {
          const module = await import('./googleExport');
          const token = await module.requestGoogleToken();
          const blob = await exportMaterial(
            course,
            selected,
            view,
            format === 'gslides' ? 'pptx' : format === 'gsheets' ? 'xlsx' : 'docx',
          );
          setProgress('Creating the file in your Google Drive…');
          setFileLink(await module.uploadGoogleFile(token, blob, name, format as 'gdocs' | 'gsheets' | 'gslides'));
        } else download(await exportMaterial(course, selected, view, format as ExportFormat), `${name}.${format}`);
      }
      setProgress('Your export is ready.');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Export failed.');
      setProgress('');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="studio-modal-backdrop">
      <section
        className="studio-modal export-panel"
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-heading"
      >
        <div className="section-heading">
          <h2 id="export-heading">Export materials</h2>
          <button className="quiet" disabled={busy} onClick={onClose} aria-label="Close export">
            ×
          </button>
        </div>
        <label>
          Material{' '}
          <select
            aria-label="Export material"
            value={selected}
            disabled={busy}
            onChange={(event) => {
              const next = event.target.value as MaterialKind | 'all';
              setSelected(next);
              setFormat(next === 'slideDecks' ? 'pptx' : 'docx');
              setError('');
              setProgress('');
            }}
          >
            <option value="all">Complete course package (.zip)</option>
            {MATERIALS.map((material) => (
              <option key={material.id} value={material.id}>
                {material[course.brief.language]}
              </option>
            ))}
          </select>
        </label>
        {selected === 'all' ? (
          <p>
            13 materials as editable Word files and web pages, CSV tables, an Excel course map, PowerPoint slides, and
            your editable course backup. Choose a material for PDF or Google exports.
          </p>
        ) : (
          <>
            <label>
              Format{' '}
              <select
                aria-label="Export format"
                value={format}
                disabled={busy}
                onChange={(event) => {
                  setFormat(event.target.value as Format);
                  setError('');
                }}
              >
                {formats.map((id) => (
                  <option key={id} value={id}>
                    {labels[id]}
                  </option>
                ))}
              </select>
            </label>
            {!['slideDecks', 'teacher', 'lessonPlans', 'sourceReader'].includes(selected) && (
              <label>
                Version{' '}
                <select
                  value={view}
                  disabled={busy}
                  onChange={(event) => setView(event.target.value as 'student' | 'teacher')}
                >
                  <option value="student">Student — practice answers withheld</option>
                  <option value="teacher">Instructor — answers and feedback included</option>
                </select>
              </label>
            )}
          </>
        )}
        <p className="sync-caption">
          Exports are snapshots. Edits inside EduTool sync across its materials; re-export to update downloaded or
          Google Drive copies.
        </p>
        {google && selected !== 'all' && (
          <p>
            Google will ask permission to create this file in your Drive. EduTool requests access only to files you open
            or create with this app.
          </p>
        )}
        {blocked && (
          <p role="alert" className="studio-error">
            {blocked}
          </p>
        )}
        {error && (
          <p role="alert" className="studio-error">
            {error}
          </p>
        )}
        {progress && <p role="status">{progress}</p>}
        {fileLink && (
          <a className="primary" href={fileLink} target="_blank" rel="noopener noreferrer">
            Open your Google file ↗
          </a>
        )}
        <div className="modal-actions">
          <button className="secondary" disabled={busy} onClick={onClose}>
            Close
          </button>
          <button
            className="primary"
            disabled={busy || Boolean(blocked) || (selected !== 'all' && google && !googleReady)}
            onClick={() => void run()}
          >
            {busy
              ? 'Preparing…'
              : selected === 'all'
                ? 'Download course package'
                : google
                  ? 'Create in Google Drive'
                  : `Download ${format.toUpperCase()}`}
          </button>
        </div>
      </section>
    </div>
  );
}
