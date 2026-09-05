import { useState } from 'react';
import { useEditor, EditorContent, useEditorState } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { plainDocument, richPlainText, type RichNode } from './richText';

export default function RichTextEditor({
  value,
  document,
  label,
  onChange,
}: {
  value: string;
  document?: RichNode;
  label: string;
  onChange: (text: string, document: RichNode) => void;
}) {
  const [linkEditor, setLinkEditor] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkError, setLinkError] = useState('');
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] }, link: { openOnClick: false }, trailingNode: false }),
    ],
    content: document ?? plainDocument(value),
    editorProps: {
      attributes: { role: 'textbox', 'aria-label': label, 'aria-multiline': 'true', class: 'material-rich-input' },
    },
    onUpdate({ editor }) {
      const rich = editor.getJSON() as RichNode;
      onChange(richPlainText(rich), rich);
    },
  });
  const state = useEditorState({
    editor,
    selector: ({ editor }) =>
      editor
        ? {
            bold: editor.isActive('bold'),
            italic: editor.isActive('italic'),
            underline: editor.isActive('underline'),
            quote: editor.isActive('blockquote'),
            link: editor.isActive('link'),
            heading: [1, 2, 3].find((level) => editor.isActive('heading', { level })) ?? 0,
            bullet: editor.isActive('bulletList'),
            ordered: editor.isActive('orderedList'),
            undo: editor.can().undo(),
            redo: editor.can().redo(),
          }
        : null,
  });
  if (!editor) return <p>Opening editor…</p>;
  return (
    <div className="rich-editor">
      <div className="rich-toolbar" role="toolbar" aria-label="Text formatting">
        <select
          aria-label="Paragraph style"
          value={state?.heading ?? 0}
          onChange={(event) => {
            const level = Number(event.target.value);
            if (level)
              editor
                .chain()
                .focus()
                .setHeading({ level: level as 1 | 2 | 3 })
                .run();
            else editor.chain().focus().setParagraph().run();
          }}
        >
          <option value="0">Paragraph</option>
          <option value="1">Heading 1</option>
          <option value="2">Heading 2</option>
          <option value="3">Heading 3</option>
        </select>
        <button
          type="button"
          aria-label="Bold"
          aria-pressed={state?.bold}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <b>B</b>
        </button>
        <button
          type="button"
          aria-label="Underline"
          aria-pressed={state?.underline}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        >
          <u>U</u>
        </button>
        <button
          type="button"
          aria-label="Quotation"
          aria-pressed={state?.quote}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
        >
          “ Quote
        </button>
        <button
          type="button"
          aria-label="Edit link"
          aria-pressed={state?.link}
          onClick={() => {
            setLinkUrl(editor.getAttributes('link').href ?? '');
            setLinkError('');
            setLinkEditor((value) => !value);
          }}
        >
          Link
        </button>
        <button
          type="button"
          aria-label="Italic"
          aria-pressed={state?.italic}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <i>I</i>
        </button>
        <button
          type="button"
          aria-label="Bullet list"
          aria-pressed={state?.bullet}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          • List
        </button>
        <button
          type="button"
          aria-label="Numbered list"
          aria-pressed={state?.ordered}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          1. List
        </button>
        <button
          type="button"
          aria-label="Undo text edit"
          disabled={!state?.undo}
          onClick={() => editor.chain().focus().undo().run()}
        >
          ↶
        </button>
        <button
          type="button"
          aria-label="Redo text edit"
          disabled={!state?.redo}
          onClick={() => editor.chain().focus().redo().run()}
        >
          ↷
        </button>
      </div>
      {linkEditor && (
        <div className="rich-link-controls">
          <label>
            Link address
            <input
              type="url"
              value={linkUrl}
              placeholder="https://…"
              onChange={(event) => setLinkUrl(event.target.value)}
            />
          </label>
          <button
            type="button"
            onClick={() => {
              const href = linkUrl.trim();
              if (href && !/^(https?:\/\/|mailto:|#)/i.test(href)) {
                setLinkError('Use an https, http, mailto or page-anchor link.');
                return;
              }
              if (href) editor.chain().focus().extendMarkRange('link').setLink({ href }).run();
              else editor.chain().focus().extendMarkRange('link').unsetLink().run();
              setLinkEditor(false);
              setLinkError('');
            }}
          >
            {linkUrl.trim() ? 'Apply link' : 'Remove link'}
          </button>
          <button type="button" onClick={() => setLinkEditor(false)}>
            Cancel link
          </button>
          {linkError && <p role="alert">{linkError}</p>}
        </div>
      )}
      <EditorContent editor={editor} />
    </div>
  );
}
