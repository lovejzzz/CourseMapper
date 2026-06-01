export const INTERNAL_EXPORT_TEXT_PATTERNS = [
  { label: 'compiler decision', pattern: /\bcompiler decision(?:s)?\b/i },
  { label: 'compiler path', pattern: /\bcompiler path\b/i },
  { label: 'deterministic blueprint', pattern: /\bdeterministic[- ]blueprint\b/i },
  { label: 'model-use policy', pattern: /\bmodel[- ]use policy\b/i },
  { label: 'source grounding', pattern: /\bsource grounding\b/i },
  { label: 'source confidence', pattern: /\bsource confidence\b/i },
  { label: 'publish gate', pattern: /\bpublish(?:ing)? gate\b/i },
  { label: 'handoff review focus', pattern: /\bhandoff[- ]review focus\b/i },
  { label: 'local-review', pattern: /\blocal-review\b|\blocal review (?:action|gate|focus|required)\b/i },
  { label: 'source-review-required', pattern: /\bsource[- ]review[- ]required\b/i },
  { label: 'proof packet', pattern: /\bproof packet\b/i },
  { label: 'audit gate', pattern: /\baudit gate\b/i },
];

export const OFFICE_TEXT_PATH_PATTERNS = {
  docx: /^word\/(?:document|footnotes|endnotes|header\d+|footer\d+)\.xml$/,
  pptx: /^ppt\/(?:slides|notesSlides)\/[^/]+\.xml$/,
  xlsx: /^xl\/(?:sharedStrings|worksheets\/sheet\d+)\.xml$/,
};

export function findInternalTextInString(text) {
  const value = String(text || '');
  const match = INTERNAL_EXPORT_TEXT_PATTERNS.find(({ pattern }) => pattern.test(value));
  return match ? { label: match.label } : null;
}

export function findInternalExportText(rows) {
  const headers = Array.isArray(rows?.headers) ? rows.headers : [];
  const dataRows = Array.isArray(rows?.rows) ? rows.rows : [];
  for (const [rowIndex, row] of dataRows.entries()) {
    for (const [columnIndex, value] of (Array.isArray(row) ? row : []).entries()) {
      const internalText = findInternalTextInString(value);
      if (internalText) {
        return {
          ...internalText,
          rowIndex,
          columnIndex,
          column: headers[columnIndex] || `Column ${columnIndex + 1}`,
        };
      }
    }
  }
  return null;
}

export function formatInternalExportMessage(subject, format, internalText) {
  const surface = String(format || 'export').toUpperCase();
  const location = internalText?.path
    ? ` in ${internalText.path}`
    : internalText?.column
      ? ` in ${internalText.column}`
      : '';
  return `${subject} ${surface} export exposes internal ${internalText?.label || 'proof'} language${location}.`;
}

export function assertTextHasNoInternalExportLanguage(text, subject, format = 'text') {
  const internalText = findInternalTextInString(text);
  if (internalText) {
    throw new Error(formatInternalExportMessage(subject, format, internalText));
  }
}

export function assertTableRowsHaveNoInternalExportLanguage(rows, subject, format = 'table') {
  const internalText = findInternalExportText(rows);
  if (internalText) {
    throw new Error(formatInternalExportMessage(subject, format, internalText));
  }
}

export function assertCsvRowsHaveNoInternalExportLanguage(rows, subject) {
  assertTableRowsHaveNoInternalExportLanguage(rows, subject, 'CSV');
}

async function toArrayBuffer(value) {
  if (!value) return null;
  if (value instanceof ArrayBuffer) return value;
  if (ArrayBuffer.isView(value)) {
    return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
  }
  if (typeof value.arrayBuffer === 'function') return await value.arrayBuffer();
  return null;
}

function decodeXmlEntities(value) {
  return String(value || '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

export function extractOfficeXmlText(xml) {
  const textRuns = [];
  const textRunPattern = /<(?:[A-Za-z0-9_-]+:)?t\b[^>]*>([\s\S]*?)<\/(?:[A-Za-z0-9_-]+:)?t>/g;
  let match;
  while ((match = textRunPattern.exec(xml))) {
    textRuns.push(decodeXmlEntities(match[1].replace(/<[^>]+>/g, '')));
  }
  if (textRuns.length > 0) return textRuns.join(' ');
  return decodeXmlEntities(String(xml || '').replace(/<[^>]+>/g, ' '));
}

export async function findInternalOfficeXmlText(blob, pathPattern) {
  const buffer = await toArrayBuffer(blob);
  if (!buffer) return null;
  const JSZip = (await import('jszip')).default;
  let zip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch (err) {
    throw new Error(`Office export could not be inspected: ${err.message || 'invalid package'}`);
  }
  const files = Object.values(zip.files)
    .filter((file) => !file.dir && pathPattern.test(file.name))
    .sort((a, b) => a.name.localeCompare(b.name));
  for (const file of files) {
    const xml = await file.async('string');
    const text = extractOfficeXmlText(xml);
    const internalText = findInternalTextInString(text);
    if (internalText) {
      return {
        ...internalText,
        path: file.name,
      };
    }
  }
  return null;
}

export async function assertOfficeExportHasNoInternalText(blob, format, subject) {
  const pathPattern = OFFICE_TEXT_PATH_PATTERNS[format];
  const internalText = await findInternalOfficeXmlText(blob, pathPattern);
  if (internalText) {
    throw new Error(formatInternalExportMessage(subject, format, internalText));
  }
}
