export const AGENT_SOURCE_CONTEXT_ROLE = 'sourceContext';
export const AGENT_SOURCE_CONTEXT_SOURCE = 'agent-attachment';

const DEFAULT_MAX_FILE_NAMES = 8;
const DEFAULT_MAX_NOTES = 4;
const DEFAULT_MAX_NOTE_CHARS = 320;

function normalizeText(value) {
  return String(value || '')
    .replace(/\r\n/g, '\n')
    .trim();
}

function truncateInline(value, maxChars = DEFAULT_MAX_NOTE_CHARS) {
  const text = normalizeText(value).replace(/\s+/g, ' ');
  if (!text || maxChars <= 0) return '';
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 3)).trimEnd()}...`;
}

function uniqueFileNames(files) {
  const seen = new Set();
  const names = [];
  (Array.isArray(files) ? files : []).forEach((file) => {
    const name = String(file?.name || '').trim();
    if (!name || seen.has(name)) return;
    seen.add(name);
    names.push(name);
  });
  return names;
}

export function buildAgentSourceContextMessage(
  files,
  {
    label = 'Source added',
    source = AGENT_SOURCE_CONTEXT_SOURCE,
    maxFileNames = DEFAULT_MAX_FILE_NAMES,
    maxNotes = DEFAULT_MAX_NOTES,
    maxNoteChars = DEFAULT_MAX_NOTE_CHARS,
  } = {},
) {
  const fileNames = uniqueFileNames(files);
  const visibleFileNames = fileNames.slice(0, maxFileNames);
  const hiddenFileCount = Math.max(0, fileNames.length - visibleFileNames.length);
  const notes = [];
  const seenNotes = new Set();

  (Array.isArray(files) ? files : []).forEach((file) => {
    if (notes.length >= maxNotes) return;
    const name = String(file?.name || '').trim();
    const excerpt = truncateInline(file?.text, maxNoteChars);
    if (!name || !excerpt || seenNotes.has(name)) return;
    seenNotes.add(name);
    notes.push({ name, excerpt });
  });

  if (fileNames.length === 0 && notes.length === 0) return null;

  return {
    role: AGENT_SOURCE_CONTEXT_ROLE,
    source,
    label,
    text: `${label}: ${fileNames.length || notes.length} reference material${(fileNames.length || notes.length) === 1 ? '' : 's'}`,
    meta: {
      source,
      fileCount: fileNames.length,
      fileNames: visibleFileNames,
      hiddenFileCount,
      materialNoteCount: notes.length,
    },
    materialNotes: notes,
  };
}

export function getAgentSourceContextSummary(message) {
  const meta = message?.meta || {};
  const fileNames = Array.isArray(meta.fileNames)
    ? meta.fileNames.map((name) => String(name || '').trim()).filter(Boolean)
    : [];
  const materialNotes = Array.isArray(message?.materialNotes) ? message.materialNotes : [];
  const hiddenFileCount = Number.isFinite(meta.hiddenFileCount) ? Math.max(0, meta.hiddenFileCount) : 0;
  const fileCount = Number.isFinite(meta.fileCount) ? Math.max(0, meta.fileCount) : fileNames.length + hiddenFileCount;

  return {
    label: String(message?.label || 'Source added').trim() || 'Source added',
    fileCount,
    fileNames,
    hiddenFileCount,
    materialNotes,
    materialNoteCount: Number.isFinite(meta.materialNoteCount)
      ? Math.max(0, meta.materialNoteCount)
      : materialNotes.length,
  };
}

export function formatAgentSourceContextForHistory(message) {
  const summary = getAgentSourceContextSummary(message);
  const names = [...summary.fileNames];
  if (summary.hiddenFileCount > 0) names.push(`+${summary.hiddenFileCount} more`);
  const noteText = summary.materialNotes
    .slice(0, DEFAULT_MAX_NOTES)
    .map((note) => `${note.name}: ${note.excerpt}`)
    .join(' | ');
  return [
    `[Source context added: ${summary.fileCount || summary.materialNoteCount} reference material${
      (summary.fileCount || summary.materialNoteCount) === 1 ? '' : 's'
    }`,
    names.length ? ` files: ${names.join(', ')}` : '',
    noteText ? ` notes: ${noteText}` : '',
    ']',
  ].join('');
}

export function isAgentSourceContextText(value) {
  return String(value || '')
    .trim()
    .startsWith('[Source context added:');
}
