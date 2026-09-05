import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import type { Course } from './domain';
import { MATERIALS, materialDocument, type MaterialBlock, type MaterialKind } from './materials';
import {
  editLinkedText,
  linkedHistory,
  referenceFormatting,
  referenceKey,
  referenceText,
  type FieldReference,
} from './references';
import { richHtml, type RichNode } from './richText';
import { formattedBlock } from './materialFormat';

const RichTextEditor = lazy(() => import('./RichTextEditor'));
const ExportPanel = lazy(() => import('./ExportPanel'));
type Edit = { reference: FieldReference; text: string; document?: RichNode; revision: number };

export default function MaterialStudio({
  course,
  audience,
  busy,
  onSave,
}: {
  course: Course;
  audience: 'student' | 'teacher';
  busy: boolean;
  onSave: (next: Course) => Promise<void>;
}) {
  const [kind, setKind] = useState<MaterialKind>('student');
  const [edit, setEdit] = useState<Edit | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [message, setMessage] = useState('');
  const [editorKey, setEditorKey] = useState(0);
  const panel = useRef<HTMLElement>(null);
  const doc = useMemo(() => materialDocument(course, kind, audience), [course, kind, audience]);
  const linkedMaterials = useMemo(
    () =>
      edit
        ? MATERIALS.filter(({ id }) =>
            materialDocument(course, id, 'teacher').blocks.some((block) =>
              [block.reference, ...(block.rows?.flat().map((cell) => cell.reference) ?? [])].some(
                (ref) => ref && referenceKey(ref) === referenceKey(edit.reference),
              ),
            ),
          )
        : [],
    [course, edit?.reference],
  );
  useEffect(() => {
    if (!edit) return;
    const previous = document.activeElement as HTMLElement | null;
    const dialog = panel.current;
    const focusables = () =>
      Array.from(
        dialog?.querySelectorAll<HTMLElement>(
          'button:not(:disabled),input:not(:disabled),[contenteditable="true"],select,[tabindex="0"]',
        ) ?? [],
      );
    focusables()[0]?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) setEdit(null);
      if (event.key !== 'Tab') return;
      const items = focusables();
      if (event.shiftKey && document.activeElement === items[0]) {
        event.preventDefault();
        items.at(-1)?.focus();
      } else if (!event.shiftKey && document.activeElement === items.at(-1)) {
        event.preventDefault();
        items[0]?.focus();
      }
    };
    dialog?.addEventListener('keydown', handler);
    return () => {
      dialog?.removeEventListener('keydown', handler);
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, [Boolean(edit), saving]);
  const start = (reference: FieldReference) => {
    setError('');
    setEditorKey((value) => value + 1);
    setEdit({
      reference,
      text: referenceText(course, reference),
      document: referenceFormatting(course, reference),
      revision: course.revision,
    });
  };
  const editButton = (reference?: FieldReference) =>
    reference && (
      <button
        type="button"
        className="field-edit"
        disabled={busy}
        aria-label={`Edit ${referenceText(course, reference).slice(0, 70)}`}
        onClick={() => start(reference)}
      >
        Edit
      </button>
    );
  const blockContent = (block: MaterialBlock) => {
    const formatted = formattedBlock(course, block);
    if (formatted)
      return <div className="formatted-material" dangerouslySetInnerHTML={{ __html: richHtml(formatted) }} />;
    if (block.type === 'title') return <h2>{block.text}</h2>;
    if (block.type === 'heading') return <h3>{block.text}</h3>;
    if (block.type === 'subheading') return <h4>{block.text}</h4>;
    return <p className="prose">{block.text}</p>;
  };
  return (
    <>
      <div className="materials-heading">
        <label>
          Material{' '}
          <select
            aria-label="Choose material"
            value={kind}
            onChange={(event) => {
              setKind(event.target.value as MaterialKind);
              setMessage('');
            }}
          >
            {MATERIALS.map((material) => (
              <option key={material.id} value={material.id}>
                {material[course.brief.language]}
              </option>
            ))}
          </select>
        </label>
        <button className="primary" disabled={busy} onClick={() => setExporting(true)}>
          Export this material ↓
        </button>
      </div>
      <p className="sync-caption">
        Edit any linked text. Its other appearances update when you save. Content changes reopen instructor review.
      </p>
      {message && (
        <p className="sync-message" role="status">
          {message}
        </p>
      )}
      <article className="reading-page material-document" aria-label={doc.subtitle}>
        {doc.blocks.map((block) =>
          block.type === 'page' ? (
            <hr key={block.id} className="material-page-break" />
          ) : block.type === 'space' ? (
            <div className="response-space" key={block.id}>
              <small>{block.text}</small>
              {Array.from({ length: block.lines ?? 3 }, (_, i) => (
                <div key={i} />
              ))}
            </div>
          ) : block.type === 'table' ? (
            <div className="material-table-scroll" key={block.id}>
              <table className="material-table">
                <thead>
                  <tr>
                    {block.headers?.map((head, i) => (
                      <th key={i}>{head}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {block.rows?.map((row, i) => (
                    <tr key={i}>
                      {row.map((cell, j) => (
                        <td key={j}>
                          <div className="editable-field">
                            {blockContent({ ...block, type: 'body', text: cell.text, reference: cell.reference })}
                            {editButton(cell.reference)}
                          </div>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div key={block.id} className={`editable-field material-${block.type}`}>
              {blockContent(block)}
              {editButton(block.reference)}
            </div>
          ),
        )}
      </article>
      {edit && (
        <div className="studio-modal-backdrop">
          <section
            ref={panel}
            className="studio-modal linked-editor"
            role="dialog"
            aria-modal="true"
            aria-labelledby="linked-editor-title"
          >
            <div className="section-heading">
              <h2 id="linked-editor-title">Edit linked content</h2>
              <button className="quiet" disabled={saving} onClick={() => setEdit(null)} aria-label="Close editor">
                ×
              </button>
            </div>
            <p className="sync-caption">
              Updates {linkedMaterials.map((material) => material[course.brief.language]).join(', ')}.
            </p>
            <Suspense fallback={<p>Opening editor…</p>}>
              <RichTextEditor
                key={`${referenceKey(edit.reference)}:${editorKey}`}
                value={edit.text}
                document={edit.document}
                label="Linked material text"
                onChange={(text, document) => setEdit((value) => (value ? { ...value, text, document } : null))}
              />
            </Suspense>
            {linkedHistory(course, edit.reference).length > 0 && (
              <details className="field-history">
                <summary>Earlier saved versions</summary>
                <p className="sync-caption">
                  Load a previous version into this editor, then save to restore it across materials.
                </p>
                {linkedHistory(course, edit.reference)
                  .slice(0, 8)
                  .map((version) => (
                    <div className="history-version" key={version.id}>
                      <div>
                        <time dateTime={version.at}>{new Date(version.at).toLocaleString()}</time>
                        <p>
                          {version.text.slice(0, 180)}
                          {version.text.length > 180 ? '…' : ''}
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => {
                          setEdit((current) =>
                            current ? { ...current, text: version.text, document: version.document } : null,
                          );
                          setEditorKey((value) => value + 1);
                        }}
                      >
                        Load this version
                      </button>
                    </div>
                  ))}
              </details>
            )}
            <p className="sync-caption">
              Changing a question does not prove its answer is still correct. Review the answer, feedback and rubric
              after content edits.
            </p>
            {error && (
              <p className="studio-error" role="alert">
                {error}
              </p>
            )}
            <div className="modal-actions">
              <button className="secondary" disabled={saving} onClick={() => setEdit(null)}>
                Cancel
              </button>
              <button
                className="primary"
                disabled={saving || busy}
                onClick={async () => {
                  setSaving(true);
                  setError('');
                  try {
                    const next = editLinkedText(course, edit.reference, edit.text, edit.revision, edit.document);
                    await onSave(next);
                    setMessage(`Saved and synced across ${linkedMaterials.length} materials.`);
                    setEdit(null);
                  } catch (error) {
                    setError(error instanceof Error ? error.message : 'Could not save this edit.');
                  } finally {
                    setSaving(false);
                  }
                }}
              >
                {saving ? 'Saving…' : 'Save & sync materials'}
              </button>
            </div>
          </section>
        </div>
      )}
      {exporting && (
        <Suspense fallback={<p role="status">Opening export options…</p>}>
          <ExportPanel course={course} kind={kind} audience={audience} onClose={() => setExporting(false)} />
        </Suspense>
      )}
    </>
  );
}
