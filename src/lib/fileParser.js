import mammoth from 'mammoth';
import * as pdfjsLib from 'pdfjs-dist';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';

// Set up PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

/**
 * Parse a single file and return its text content.
 */
export async function parseFile(file) {
  const ext = file.name.split('.').pop().toLowerCase();

  switch (ext) {
    case 'doc':
      return parseDoc(file);
    case 'docx':
      return parseDocx(file);
    case 'pdf':
      return parsePdf(file);
    case 'txt':
    case 'md':
    case 'csv':
      return parseTxt(file);
    case 'rtf':
      return parseRtf(file);
    case 'html':
    case 'htm':
      return parseHtml(file);
    case 'xlsx':
    case 'xls':
      return parseXlsx(file);
    case 'pptx':
      return parsePptx(file);
    case 'ppt':
      return parsePptLegacy(file);
    case 'odt':
      return parseOdt(file);
    case 'odp':
      return parseOdp(file);
    case 'ods':
      return parseOds(file);
    case 'epub':
      return parseEpub(file);
    case 'key':
      return parseKeynote(file);
    case 'pages':
      return parsePages(file);
    case 'zip':
      return parseZip(file);
    default:
      throw new Error(`Unsupported file type: .${ext}`);
  }
}

/**
 * Parse multiple files and combine their text.
 */
export async function parseFiles(files) {
  const results = [];
  for (const file of files) {
    try {
      const ext = file.name.split('.').pop().toLowerCase();
      if (ext === 'zip') {
        // ZIP: expand into individual parsed files
        const zipResults = await parseZipToResults(file);
        results.push(...zipResults);
      } else {
        const rawText = await parseFile(file);
        const text = sanitizeForAI(rawText);
        results.push({ name: file.name, text, error: null });
      }
    } catch (err) {
      results.push({ name: file.name, text: '', error: err.message });
    }
  }
  return results;
}

// Supported extensions for files inside ZIP archives
const SUPPORTED_EXTENSIONS = new Set([
  'doc', 'docx', 'pdf', 'txt', 'md', 'csv', 'rtf', 'html', 'htm',
  'xlsx', 'xls', 'ods', 'ppt', 'pptx', 'odp', 'odt', 'epub', 'key', 'pages',
]);

/**
 * Sanitize parsed text so AI models receive clean, readable content.
 * - Strips null bytes, control chars, binary garbage
 * - Normalizes unicode, whitespace, line endings
 * - Preserves document structure (headings, paragraphs, lists, tables)
 */
function sanitizeForAI(text) {
  if (!text) return '';
  return text
    // Remove null bytes and most control characters (keep \n \r \t)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    // Normalize line endings to \n
    .replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    // Remove non-printable unicode (replacement chars, BOM, etc)
    .replace(/[\uFFFD\uFEFF\uFFF0-\uFFFF]/g, '')
    // Collapse runs of whitespace on a single line (preserve newlines)
    .replace(/[^\S\n]+/g, ' ')
    // Collapse 3+ blank lines into 2
    .replace(/\n{4,}/g, '\n\n\n')
    // Trim leading/trailing whitespace per line
    .split('\n').map(l => l.trim()).join('\n')
    // Final trim
    .trim();
}

// ── Word (.docx) ──
async function parseDocx(file) {
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return result.value;
}

// ── Legacy Word (.doc) ──
async function parseDoc(file) {
  const arrayBuffer = await file.arrayBuffer();

  // Try mammoth first (works if the .doc is actually a renamed .docx)
  try {
    const result = await mammoth.extractRawText({ arrayBuffer });
    if (result.value && result.value.trim().length > 20) {
      return result.value;
    }
  } catch (_) {
    // Expected for true legacy .doc — fall through to binary extraction
  }

  // Binary text extraction for legacy .doc (OLE2 Compound Binary Format)
  const bytes = new Uint8Array(arrayBuffer);

  // Strategy 1: Try to find and extract the Unicode text stream
  // Legacy .doc stores text as UTF-16LE in the WordDocument stream
  const chunks = [];
  let i = 0;
  while (i < bytes.length - 1) {
    // Look for runs of UTF-16LE printable text (low byte is printable, high byte is 0)
    let start = i;
    let run = '';
    while (i < bytes.length - 1) {
      const lo = bytes[i];
      const hi = bytes[i + 1];
      if (hi === 0 && lo >= 0x20 && lo < 0x7F) {
        run += String.fromCharCode(lo);
        i += 2;
      } else if (hi === 0 && (lo === 0x0A || lo === 0x0D || lo === 0x09)) {
        run += lo === 0x0A ? '\n' : lo === 0x0D ? '' : '\t';
        i += 2;
      } else {
        break;
      }
    }
    if (run.length >= 5) {
      chunks.push(run);
    }
    if (i === start) i += 2;
  }

  let text = chunks.join('\n').trim();

  // Strategy 2: If UTF-16LE extraction is too short, try ASCII extraction
  if (text.length < 100) {
    const asciiChunks = [];
    let j = 0;
    while (j < bytes.length) {
      let start = j;
      let run = '';
      while (j < bytes.length) {
        const b = bytes[j];
        if ((b >= 0x20 && b < 0x7F) || b === 0x0A || b === 0x0D || b === 0x09) {
          run += b === 0x0D ? '' : String.fromCharCode(b);
          j++;
        } else {
          break;
        }
      }
      if (run.length >= 8) {
        asciiChunks.push(run);
      }
      if (j === start) j++;
    }
    const asciiText = asciiChunks.join('\n').trim();
    if (asciiText.length > text.length) text = asciiText;
  }

  if (!text || text.length < 20) {
    throw new Error('Could not extract text from this .doc file. Try converting it to .docx or .pdf first.');
  }

  // Clean up: collapse excessive whitespace and blank lines
  text = text
    .replace(/[ \t]{3,}/g, '  ')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();

  return text;
}

// ── PDF ──
async function parsePdf(file) {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const pages = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const text = content.items.map((item) => item.str).join(' ');
    pages.push(text);
  }

  return pages.join('\n\n');
}

// ── Plain text / Markdown / CSV ──
async function parseTxt(file) {
  return await file.text();
}

// ── RTF ──
async function parseRtf(file) {
  const text = await file.text();
  // Strip RTF control words and groups, extract plain text
  return text
    .replace(/\{\\[^{}]*\}/g, '')       // remove nested groups like {\fonttbl...}
    .replace(/\\pard[^\\]*/g, '\n')     // paragraph breaks
    .replace(/\\par\b/g, '\n')          // \par = newline
    .replace(/\\line\b/g, '\n')         // \line = newline
    .replace(/\\tab\b/g, '\t')          // \tab
    .replace(/\\'([0-9a-fA-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\[a-z]+\d*\s?/gi, '')    // strip remaining control words
    .replace(/[{}]/g, '')               // strip braces
    .replace(/\n{3,}/g, '\n\n')         // collapse blank lines
    .trim();
}

// ── HTML / HTM ──
async function parseHtml(file) {
  const html = await file.text();
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  return doc.body.textContent || doc.body.innerText || '';
}

// ── Excel (.xlsx/.xls) ──
async function parseXlsx(file) {
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  const texts = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const csv = XLSX.utils.sheet_to_csv(sheet);
    texts.push(`--- Sheet: ${sheetName} ---\n${csv}`);
  }

  return texts.join('\n\n');
}

// ── PowerPoint (.pptx) — ZIP of XML slides ──
async function parsePptx(file) {
  const arrayBuffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);
  const texts = [];

  // Slides are in ppt/slides/slide1.xml, slide2.xml, etc.
  const slideFiles = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
    .sort((a, b) => {
      const numA = parseInt(a.match(/slide(\d+)/)[1]);
      const numB = parseInt(b.match(/slide(\d+)/)[1]);
      return numA - numB;
    });

  for (const slidePath of slideFiles) {
    const xml = await zip.files[slidePath].async('text');
    const text = stripXmlTags(xml);
    if (text.trim()) {
      const slideNum = slidePath.match(/slide(\d+)/)[1];
      texts.push(`--- Slide ${slideNum} ---\n${text.trim()}`);
    }
  }

  // Also extract from notes
  const noteFiles = Object.keys(zip.files)
    .filter((name) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/i.test(name));

  for (const notePath of noteFiles) {
    const xml = await zip.files[notePath].async('text');
    const text = stripXmlTags(xml);
    if (text.trim()) {
      texts.push(`--- Notes ---\n${text.trim()}`);
    }
  }

  return texts.join('\n\n');
}

// ── Legacy PowerPoint (.ppt) — binary, best-effort text extraction ──
async function parsePptLegacy(file) {
  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  // Extract printable ASCII/UTF text runs from binary .ppt
  const textRuns = [];
  let current = '';
  for (let i = 0; i < bytes.length; i++) {
    const ch = bytes[i];
    if (ch >= 32 && ch < 127) {
      current += String.fromCharCode(ch);
    } else if (ch === 10 || ch === 13) {
      current += '\n';
    } else {
      if (current.trim().length > 3) textRuns.push(current.trim());
      current = '';
    }
  }
  if (current.trim().length > 3) textRuns.push(current.trim());

  // Filter out binary garbage — keep runs that look like real text
  const filtered = textRuns.filter((run) => {
    const words = run.split(/\s+/).length;
    const alphaRatio = (run.match(/[a-zA-Z]/g) || []).length / run.length;
    return words >= 2 && alphaRatio > 0.5;
  });

  if (filtered.length === 0) {
    throw new Error('.ppt parsing extracted no readable text. Try converting to .pptx.');
  }
  return filtered.join('\n\n');
}

// ── OpenDocument Text (.odt) ──
async function parseOdt(file) {
  const arrayBuffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);
  const contentXml = await zip.files['content.xml']?.async('text');
  if (!contentXml) throw new Error('Invalid ODT file: no content.xml found.');
  return stripXmlTags(contentXml);
}

// ── OpenDocument Presentation (.odp) ──
async function parseOdp(file) {
  const arrayBuffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);
  const contentXml = await zip.files['content.xml']?.async('text');
  if (!contentXml) throw new Error('Invalid ODP file: no content.xml found.');
  return stripXmlTags(contentXml);
}

// ── OpenDocument Spreadsheet (.ods) ──
async function parseOds(file) {
  // Use XLSX library which also handles .ods
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: 'array' });
  const texts = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const csv = XLSX.utils.sheet_to_csv(sheet);
    texts.push(`--- Sheet: ${sheetName} ---\n${csv}`);
  }

  return texts.join('\n\n');
}

// ── EPUB ──
async function parseEpub(file) {
  const arrayBuffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);
  const texts = [];

  // Find XHTML/HTML content files
  const htmlFiles = Object.keys(zip.files)
    .filter((name) => /\.(xhtml|html|htm)$/i.test(name) && !name.includes('toc'))
    .sort();

  for (const path of htmlFiles) {
    const html = await zip.files[path].async('text');
    const text = stripXmlTags(html);
    if (text.trim()) texts.push(text.trim());
  }

  if (texts.length === 0) throw new Error('No readable content found in EPUB.');
  return texts.join('\n\n');
}

// ── Apple Keynote (.key) — ZIP of XML/protobuf, best-effort ──
async function parseKeynote(file) {
  const arrayBuffer = await file.arrayBuffer();
  try {
    const zip = await JSZip.loadAsync(arrayBuffer);
    const texts = [];
    for (const [name, entry] of Object.entries(zip.files)) {
      if (/\.xml$/i.test(name) || /\.txt$/i.test(name)) {
        const content = await entry.async('text');
        const text = stripXmlTags(content);
        if (text.trim().length > 10) texts.push(text.trim());
      }
    }
    if (texts.length === 0) throw new Error('No text extracted.');
    return texts.join('\n\n');
  } catch {
    throw new Error('.key file could not be parsed. Try exporting as .pptx or .pdf.');
  }
}

// ── Apple Pages (.pages) — ZIP-based ──
async function parsePages(file) {
  const arrayBuffer = await file.arrayBuffer();
  try {
    const zip = await JSZip.loadAsync(arrayBuffer);
    const texts = [];
    for (const [name, entry] of Object.entries(zip.files)) {
      if (/\.xml$/i.test(name) || /\.txt$/i.test(name)) {
        const content = await entry.async('text');
        const text = stripXmlTags(content);
        if (text.trim().length > 10) texts.push(text.trim());
      }
    }
    if (texts.length === 0) throw new Error('No text extracted.');
    return texts.join('\n\n');
  } catch {
    throw new Error('.pages file could not be parsed. Try exporting as .docx or .pdf.');
  }
}

// ── ZIP archive (.zip) — extract and recursively parse contained files ──
async function parseZip(file) {
  const results = await parseZipToResults(file);
  const texts = results
    .filter(r => r.text)
    .map(r => `=== ${r.name} ===\n${r.text}`);
  if (texts.length === 0) throw new Error('No supported files found inside ZIP archive.');
  return texts.join('\n\n');
}

async function parseZipToResults(file) {
  const arrayBuffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);
  const results = [];

  for (const [path, entry] of Object.entries(zip.files)) {
    if (entry.dir) continue;
    // Skip hidden/system files
    const fileName = path.split('/').pop();
    if (fileName.startsWith('.') || fileName.startsWith('__')) continue;

    const ext = fileName.split('.').pop().toLowerCase();
    if (!SUPPORTED_EXTENSIONS.has(ext)) continue;

    try {
      // Convert ZIP entry to a File-like object for our parsers
      const blob = await entry.async('blob');
      const innerFile = new File([blob], fileName, { type: '' });
      const rawText = await parseFile(innerFile);
      const text = sanitizeForAI(rawText);
      if (text) {
        results.push({ name: `${file.name}/${path}`, text, error: null });
      }
    } catch (err) {
      results.push({ name: `${file.name}/${path}`, text: '', error: err.message });
    }
  }

  if (results.length === 0) {
    results.push({ name: file.name, text: '', error: 'No supported files found inside ZIP archive.' });
  }
  return results;
}

// ── Utility: strip XML/HTML tags and normalize whitespace ──
function stripXmlTags(xml) {
  return xml
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#\d+;/g, (m) => String.fromCharCode(parseInt(m.slice(2, -1))))
    .replace(/\s{2,}/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .trim();
}
