import fs from 'node:fs/promises';
import JSZip from 'jszip';

const PLACEHOLDER_PATTERNS = [
  /\bTODO\b/i,
  /\bTBD\b/i,
  /lorem ipsum/i,
  /placeholder/i,
  /explanation needed/i,
  /distractor rationale needed/i,
  /model response required/i,
  /\[(?:remember|understand|apply|analyze|evaluate|create)(?:[^\]]*)\]/i,
];

function decodeXmlEntities(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function extractTextNodes(xml) {
  const text = [];
  const pattern = /<(?:w:t|a:t|t)(?:\s[^>]*)?>([\s\S]*?)<\/(?:w:t|a:t|t)>/g;
  let match = pattern.exec(xml);
  while (match) {
    text.push(decodeXmlEntities(match[1]));
    match = pattern.exec(xml);
  }
  return text.join(' ').replace(/\s+/g, ' ').trim();
}

function countWords(value) {
  return (String(value || '').match(/[A-Za-z][A-Za-z'-]*/g) || []).length;
}

async function loadNestedZip(buffer) {
  try {
    return await JSZip.loadAsync(buffer);
  } catch {
    return null;
  }
}

async function extractDocxText(buffer) {
  const zip = await loadNestedZip(buffer);
  if (!zip) return '';
  const parts = ['word/document.xml'];
  for (const name of Object.keys(zip.files)) {
    if (/^word\/(?:header|footer)\d+\.xml$/.test(name)) parts.push(name);
  }

  const textParts = [];
  for (const name of parts) {
    const file = zip.file(name);
    if (!file) continue;
    textParts.push(extractTextNodes(await file.async('string')));
  }
  return textParts.join(' ').replace(/\s+/g, ' ').trim();
}

async function extractXlsxText(buffer) {
  const zip = await loadNestedZip(buffer);
  if (!zip) return '';
  const parts = [];
  const shared = zip.file('xl/sharedStrings.xml');
  if (shared) parts.push(extractTextNodes(await shared.async('string')));
  for (const name of Object.keys(zip.files).sort()) {
    if (/^xl\/worksheets\/sheet\d+\.xml$/.test(name)) {
      parts.push(extractTextNodes(await zip.file(name).async('string')));
    }
  }
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

async function extractPptxTextAndNotes(buffer) {
  const zip = await loadNestedZip(buffer);
  if (!zip) return { text: '', notes: [] };

  const textParts = [];
  const notes = [];
  for (const name of Object.keys(zip.files).sort()) {
    if (/^ppt\/slides\/slide\d+\.xml$/.test(name)) {
      textParts.push(extractTextNodes(await zip.file(name).async('string')));
    }
    if (/^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(name)) {
      const noteText = extractTextNodes(await zip.file(name).async('string'));
      notes.push({ name, text: noteText });
      textParts.push(noteText);
    }
  }

  return {
    text: textParts.join(' ').replace(/\s+/g, ' ').trim(),
    notes,
  };
}

function checkPlaceholders(issues, fileName, text) {
  for (const pattern of PLACEHOLDER_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      issues.push(`${fileName}: leaked placeholder or authoring metadata "${match[0]}"`);
    }
  }
}

function checkFaqQuestionCounts(issues, fileName, text, expected) {
  const lessonTitles = Object.keys(expected || {});
  for (let i = 0; i < lessonTitles.length; i++) {
    const title = lessonTitles[i];
    const start = text.indexOf(title);
    if (start < 0) {
      issues.push(`${fileName}: missing FAQ lesson heading "${title}"`);
      continue;
    }
    const nextTitle = lessonTitles[i + 1];
    const end = nextTitle ? text.indexOf(nextTitle, start + title.length) : -1;
    const section = text.slice(start, end > start ? end : undefined);
    const count = (section.match(/\bQ\d+\b/g) || []).length;
    if (count !== expected[title]) {
      issues.push(`${fileName}: expected ${expected[title]} FAQ questions for "${title}", found ${count}`);
    }
  }
}

export async function auditCourseMaterialsZip(zipPath, options = {}) {
  const { expectedFolders = [], expectedFaqQuestionsPerLesson = null, minSpeakerNoteWords = 20 } = options;
  const issues = [];
  const buffer = await fs.readFile(zipPath);
  const zip = await JSZip.loadAsync(buffer);
  const names = Object.keys(zip.files).filter((name) => !zip.files[name].dir);

  for (const folder of expectedFolders) {
    if (!names.some((name) => name.startsWith(`${folder}/`))) {
      issues.push(`Missing expected ZIP folder "${folder}"`);
    }
  }

  for (const name of names) {
    const lower = name.toLowerCase();
    const file = zip.file(name);
    if (!file) continue;
    const fileBuffer = await file.async('nodebuffer');

    if (lower.endsWith('.docx')) {
      const text = await extractDocxText(fileBuffer);
      checkPlaceholders(issues, name, text);
      if (expectedFaqQuestionsPerLesson && name.startsWith('Course FAQ/')) {
        checkFaqQuestionCounts(issues, name, text, expectedFaqQuestionsPerLesson);
      }
      continue;
    }

    if (lower.endsWith('.pptx')) {
      const { text, notes } = await extractPptxTextAndNotes(fileBuffer);
      checkPlaceholders(issues, name, text);
      for (const note of notes) {
        const noteWords = countWords(note.text.replace(/\b\d+\s*\/\s*\d+\b/g, ''));
        if (noteWords < minSpeakerNoteWords) {
          issues.push(`${name}: ${note.name} has only ${noteWords} speaker-note words`);
        }
      }
      continue;
    }

    if (lower.endsWith('.xlsx')) {
      const text = await extractXlsxText(fileBuffer);
      checkPlaceholders(issues, name, text);
    }
  }

  return {
    issues,
    fileCount: names.length,
    files: names,
  };
}
