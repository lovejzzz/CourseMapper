export const LANDING_AGENT_CONTEXT_SOURCE = 'landing-context';

const USER_PROMPT_PREFIX = 'Build my course from this starting request:';
const PROJECT_BRIEF_PREFIX = 'Here is what I am starting with.';
const FILE_ONLY_PREFIX = 'I uploaded course materials to start this project.';
const DEFAULT_MAX_PROMPT_CHARS = 1600;
const DEFAULT_MAX_FILE_NAMES = 8;
const DEFAULT_MAX_MATERIAL_NOTES = 4;
const DEFAULT_MAX_MATERIAL_NOTE_CHARS = 360;

function normalizePromptText(promptText) {
  return String(promptText || '')
    .replace(/\r\n/g, '\n')
    .trim();
}

function truncateText(text, maxChars = DEFAULT_MAX_PROMPT_CHARS) {
  const normalized = normalizePromptText(text);
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, Math.max(0, maxChars - 24)).trimEnd()}\n\n[Prompt shortened for chat]`;
}

function truncateInlineText(text, maxChars = DEFAULT_MAX_MATERIAL_NOTE_CHARS) {
  const normalized = normalizePromptText(text).replace(/\s+/g, ' ');
  if (normalized.length <= maxChars) return normalized;
  return `${normalized.slice(0, Math.max(0, maxChars - 3)).trimEnd()}...`;
}

function buildContextMeta({ prompt, fileNames, visibleFileNames, hiddenFileCount, materialNotes }) {
  return {
    source: LANDING_AGENT_CONTEXT_SOURCE,
    hasPrompt: Boolean(prompt),
    fileCount: fileNames.length,
    fileNames: visibleFileNames,
    hiddenFileCount,
    materialNoteCount: materialNotes.length,
    materialNoteFileNames: materialNotes.map((note) => note.name),
  };
}

function parseSectionLines(text, sectionTitle) {
  const lines = String(text || '').split('\n');
  const sectionStart = lines.findIndex((line) => line.trim() === sectionTitle);
  if (sectionStart < 0) return [];

  const result = [];
  for (let i = sectionStart + 1; i < lines.length; i++) {
    const line = lines[i] || '';
    const trimmed = line.trim();
    if (!trimmed && result.length === 0) continue;
    if (result.length > 0 && (trimmed.endsWith(':') || trimmed === FILE_ONLY_PREFIX)) break;
    result.push(line);
  }

  return result.join('\n').trim() ? result : [];
}

function parseStartingRequestFromText(text) {
  return parseSectionLines(text, 'Starting request:').join('\n').trim();
}

function parseMaterialNotesFromText(text) {
  const lines = parseSectionLines(text, 'Source notes from uploaded materials:');
  return lines
    .map((line) => line.trim())
    .filter((line) => line.startsWith('- ') && line.includes(':'))
    .map((line) => {
      const body = line.slice(2);
      const splitAt = body.indexOf(':');
      return {
        name: body.slice(0, splitAt).trim(),
        excerpt: body.slice(splitAt + 1).trim(),
      };
    })
    .filter((note) => note.name && note.excerpt);
}

function buildAcknowledgement({ hasPrompt, fileCount, materialNoteCount }) {
  const sourceNoteText =
    materialNoteCount > 0
      ? ` I also captured ${materialNoteCount} compact source note${materialNoteCount === 1 ? '' : 's'} from the uploaded material.`
      : '';
  if (hasPrompt && fileCount > 0) {
    return `Got it. I have your starting request and ${fileCount} uploaded material${
      fileCount === 1 ? '' : 's'
    }.${sourceNoteText} I will keep using them while we build, check, and revise the course package.`;
  }
  if (hasPrompt) {
    return 'Got it. I will keep using that starting request while we build, check, and revise the course package.';
  }
  return `Got it. I have ${fileCount} uploaded material${
    fileCount === 1 ? '' : 's'
  }.${sourceNoteText} I will keep using them while we build, check, and revise the course package.`;
}

export function getLandingFileNames(files) {
  if (!Array.isArray(files)) return [];
  const seen = new Set();
  const names = [];

  files.forEach((file) => {
    const rawName = typeof file === 'string' ? file : file?.name;
    const name = String(rawName || '').trim();
    if (!name || seen.has(name)) return;
    seen.add(name);
    names.push(name);
  });

  return names;
}

export function getLandingMaterialNotes(
  parsedFiles,
  { maxNotes = DEFAULT_MAX_MATERIAL_NOTES, maxChars = DEFAULT_MAX_MATERIAL_NOTE_CHARS } = {},
) {
  if (!Array.isArray(parsedFiles) || maxNotes <= 0 || maxChars <= 0) return [];
  const seen = new Set();
  const notes = [];

  parsedFiles.forEach((file) => {
    if (notes.length >= maxNotes) return;
    const name = String(file?.name || '').trim();
    const text = truncateInlineText(file?.text, maxChars);
    if (!name || !text || seen.has(name)) return;
    seen.add(name);
    notes.push({ name, excerpt: text });
  });

  return notes;
}

export function hasLandingAgentContext(messages) {
  if (!Array.isArray(messages)) return false;
  return messages.some((message) => {
    if (!message || typeof message !== 'object') return false;
    if (message.source === LANDING_AGENT_CONTEXT_SOURCE || message.meta?.source === LANDING_AGENT_CONTEXT_SOURCE) {
      return true;
    }
    const text = String(message.text || message.content || '');
    return message.role === 'user' && isLandingAgentContextText(text);
  });
}

export function isLandingAgentContextText(value) {
  const text = String(value || '').trim();
  return (
    text.startsWith(PROJECT_BRIEF_PREFIX) ||
    text.startsWith(USER_PROMPT_PREFIX) ||
    text.startsWith(FILE_ONLY_PREFIX)
  );
}

export function buildLandingAgentContextMessages({
  promptText = '',
  files = [],
  parsedFiles = [],
  maxPromptChars = DEFAULT_MAX_PROMPT_CHARS,
  maxFileNames = DEFAULT_MAX_FILE_NAMES,
  maxMaterialNotes = DEFAULT_MAX_MATERIAL_NOTES,
  maxMaterialNoteChars = DEFAULT_MAX_MATERIAL_NOTE_CHARS,
} = {}) {
  const prompt = truncateText(promptText, maxPromptChars);
  const fileNames = getLandingFileNames(files);
  const materialNotes = getLandingMaterialNotes(parsedFiles, {
    maxNotes: maxMaterialNotes,
    maxChars: maxMaterialNoteChars,
  });
  if (!prompt && fileNames.length === 0 && materialNotes.length === 0) return [];

  const visibleFileNames = fileNames.slice(0, maxFileNames);
  const hiddenFileCount = Math.max(0, fileNames.length - visibleFileNames.length);
  const userLines = [PROJECT_BRIEF_PREFIX];
  const meta = buildContextMeta({ prompt, fileNames, visibleFileNames, hiddenFileCount, materialNotes });

  if (prompt) {
    userLines.push('', 'Starting request:', prompt);
  } else {
    userLines.push('', FILE_ONLY_PREFIX);
  }

  if (visibleFileNames.length > 0) {
    userLines.push('', 'Uploaded materials:');
    visibleFileNames.forEach((name) => userLines.push(`- ${name}`));
    if (hiddenFileCount > 0) {
      userLines.push(`- +${hiddenFileCount} more file${hiddenFileCount === 1 ? '' : 's'}`);
    }
  }

  if (materialNotes.length > 0) {
    userLines.push('', 'Source notes from uploaded materials:');
    materialNotes.forEach((note) => userLines.push(`- ${note.name}: ${note.excerpt}`));
  }

  return [
    {
      role: 'user',
      text: userLines.join('\n'),
      source: LANDING_AGENT_CONTEXT_SOURCE,
      meta,
      materialNotes,
    },
    {
      role: 'assistant',
      text: buildAcknowledgement({
        hasPrompt: Boolean(prompt),
        fileCount: fileNames.length || materialNotes.length,
        materialNoteCount: materialNotes.length,
      }),
      source: LANDING_AGENT_CONTEXT_SOURCE,
      meta: { source: LANDING_AGENT_CONTEXT_SOURCE },
    },
  ];
}

export function summarizeLandingAgentContextMessage(message) {
  const fallback = {
    hasContext: false,
    hasPrompt: false,
    promptExcerpt: '',
    fileCount: 0,
    fileNames: [],
    hiddenFileCount: 0,
    materialNoteCount: 0,
    hasMaterialNotes: false,
    materialNotes: [],
  };
  if (!message || typeof message !== 'object') return fallback;

  const text = String(message.text || message.content || '');
  const meta = message.meta || {};
  const hasContext =
    message.source === LANDING_AGENT_CONTEXT_SOURCE ||
    meta.source === LANDING_AGENT_CONTEXT_SOURCE ||
    (message.role === 'user' && isLandingAgentContextText(text));
  if (!hasContext) return fallback;

  const parsedFileNames = parseUploadedFileNamesFromText(text);
  const fileNames = Array.isArray(meta.fileNames)
    ? meta.fileNames.map((name) => String(name || '').trim()).filter(Boolean)
    : parsedFileNames;
  const hiddenFileCount = Number.isFinite(meta.hiddenFileCount) ? Math.max(0, meta.hiddenFileCount) : 0;
  const inferredFileCount = fileNames.length + hiddenFileCount;
  const fileCount = Number.isFinite(meta.fileCount) ? Math.max(0, meta.fileCount) : inferredFileCount;
  const materialNotes = Array.isArray(message.materialNotes)
    ? message.materialNotes
        .map((note) => ({
          name: String(note?.name || '').trim(),
          excerpt: String(note?.excerpt || '').trim(),
        }))
        .filter((note) => note.name && note.excerpt)
    : parseMaterialNotesFromText(text);
  const materialNoteCount = Number.isFinite(meta.materialNoteCount)
    ? Math.max(0, meta.materialNoteCount)
    : materialNotes.length;
  const promptExcerpt = truncateInlineText(parseStartingRequestFromText(text), 260);

  return {
    hasContext: true,
    hasPrompt: typeof meta.hasPrompt === 'boolean' ? meta.hasPrompt : Boolean(promptExcerpt),
    promptExcerpt,
    fileCount,
    fileNames,
    hiddenFileCount,
    materialNoteCount,
    hasMaterialNotes: materialNoteCount > 0,
    materialNotes,
  };
}

export function ensureLandingAgentContextMessages(messages, context) {
  const safeMessages = Array.isArray(messages) ? messages : [];
  if (hasLandingAgentContext(safeMessages)) return safeMessages;

  const contextMessages = buildLandingAgentContextMessages(context);
  if (contextMessages.length === 0) return safeMessages;
  return [...contextMessages, ...safeMessages];
}

export function upsertLandingAgentContextMessages(messages, context) {
  const safeMessages = Array.isArray(messages) ? messages : [];
  const contextMessages = buildLandingAgentContextMessages(context);
  if (contextMessages.length === 0) return safeMessages;

  const withoutPreviousContext = safeMessages.filter((message) => {
    if (!message || typeof message !== 'object') return true;
    if (message.source === LANDING_AGENT_CONTEXT_SOURCE || message.meta?.source === LANDING_AGENT_CONTEXT_SOURCE) {
      return false;
    }
    const text = String(message.text || message.content || '');
    return !(message.role === 'user' && isLandingAgentContextText(text));
  });

  return [...contextMessages, ...withoutPreviousContext];
}

function parseUploadedFileNamesFromText(text) {
  const names = [];
  let inUploadedMaterials = false;

  String(text || '')
    .split('\n')
    .forEach((line) => {
      const trimmed = line.trim();
      if (trimmed === 'Uploaded materials:') {
        inUploadedMaterials = true;
        return;
      }
      if (inUploadedMaterials && trimmed.endsWith(':')) {
        inUploadedMaterials = false;
        return;
      }
      if (!inUploadedMaterials || !trimmed.startsWith('- ') || trimmed.startsWith('- +')) return;
      names.push(trimmed.slice(2).trim());
    });

  return names.filter(Boolean);
}

export function summarizeLandingAgentContext(messages) {
  const fallback = {
    hasContext: false,
    hasPrompt: false,
    fileCount: 0,
    fileNames: [],
    hiddenFileCount: 0,
    materialNoteCount: 0,
    hasMaterialNotes: false,
    materialNotes: [],
    promptExcerpt: '',
  };
  if (!Array.isArray(messages)) return fallback;

  const contextMessage = messages.find((message) => {
    if (!message || typeof message !== 'object') return false;
    if (message.source === LANDING_AGENT_CONTEXT_SOURCE || message.meta?.source === LANDING_AGENT_CONTEXT_SOURCE) {
      return true;
    }
    const text = String(message.text || message.content || '');
    return message.role === 'user' && isLandingAgentContextText(text);
  });
  if (!contextMessage) return fallback;
  return summarizeLandingAgentContextMessage(contextMessage);
}
