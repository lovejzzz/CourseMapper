import fs from 'node:fs/promises';
import JSZip from 'jszip';
import { findInternalTextInString } from '../../src/lib/exportTextInspector.js';
import { findPublishabilityPlaceholders } from '../../src/lib/publishabilityPlaceholders.js';

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
  if (!zip) return { text: '', notes: [], slides: [] };

  const textParts = [];
  const notes = [];
  const slides = [];
  for (const name of Object.keys(zip.files).sort()) {
    if (/^ppt\/slides\/slide\d+\.xml$/.test(name)) {
      const slideText = extractTextNodes(await zip.file(name).async('string'));
      slides.push({ name, text: slideText });
      textParts.push(slideText);
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
    slides,
  };
}

function checkPlaceholders(issues, fileName, text) {
  for (const placeholder of findPublishabilityPlaceholders(text, { limit: 10 })) {
    issues.push(`${fileName}: leaked placeholder or authoring metadata "${placeholder}"`);
  }
}

function checkInternalProofLanguage(issues, fileName, text) {
  const internalText = findInternalTextInString(text);
  if (internalText) {
    issues.push(`${fileName}: leaked internal ${internalText.label} language`);
  }
}

function hasDataScienceAssetReference(text) {
  const value = String(text || '');
  if (/\b(jupyter|ipynb)\b/i.test(value)) return true;
  if (
    /\bmodel cards?\b/i.test(value) &&
    /\b(machine learning|predictive|validation|fairness|bias|threshold)\b/i.test(value)
  ) {
    return true;
  }

  const hasLabAssetNoun = /\b(notebooks?|datasets?|data sets?|dataframes?)\b/i.test(value);
  const hasDataScienceContext =
    /\b(applied machine learning|machine learning|data science|predictive model|model validation|train[-\s]?test|cross[-\s]?validation|confusion matrix|precision|recall|threshold|bias audit|classification|regression)\b/i.test(
      value,
    );
  return hasLabAssetNoun && hasDataScienceContext;
}

function hasBundledLabAsset(names) {
  return names.some((name) => /\.(?:ipynb|csv|py|parquet|r|jsonl)$/i.test(name));
}

function hasRequiredLabAssetsMarker(names) {
  return names.some((name) => /^Required Assets\/.+Required Lab Assets\.md$/i.test(name));
}

function collectFaqQuestionCounts(text, expected) {
  const lessonTitles = Object.keys(expected || {});
  const counts = {};
  for (let i = 0; i < lessonTitles.length; i++) {
    const title = lessonTitles[i];
    const start = text.indexOf(title);
    if (start < 0) continue;
    const laterStarts = lessonTitles
      .slice(i + 1)
      .map((nextTitle) => text.indexOf(nextTitle, start + title.length))
      .filter((position) => position > start)
      .sort((a, b) => a - b);
    const end = laterStarts[0] || -1;
    const section = text.slice(start, end > start ? end : undefined);
    counts[title] = (counts[title] || 0) + (section.match(/\bQ\d+\b/g) || []).length;
  }
  return counts;
}

function checkFaqQuestionCounts(issues, counts, expected) {
  for (const [title, expectedCount] of Object.entries(expected || {})) {
    const count = counts[title] || 0;
    if (count === 0) {
      issues.push(`Course FAQ: missing FAQ lesson heading "${title}"`);
    } else if (count !== expectedCount) {
      issues.push(`Course FAQ: expected ${expectedCount} FAQ questions for "${title}", found ${count}`);
    }
  }
}

export async function auditCourseMaterialsZip(zipPath, options = {}) {
  const {
    expectedFolders = [],
    expectedFaqQuestionsPerLesson = null,
    minSpeakerNoteWords = 20,
    maxVisibleSlideWords = 120,
  } = options;
  const issues = [];
  const buffer = await fs.readFile(zipPath);
  const zip = await JSZip.loadAsync(buffer);
  const names = Object.keys(zip.files).filter((name) => !zip.files[name].dir);
  const faqQuestionCounts = {};
  const extractedText = [];

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
      extractedText.push(text);
      checkPlaceholders(issues, name, text);
      checkInternalProofLanguage(issues, name, text);
      if (expectedFaqQuestionsPerLesson && name.startsWith('Course FAQ/')) {
        const counts = collectFaqQuestionCounts(text, expectedFaqQuestionsPerLesson);
        for (const [title, count] of Object.entries(counts)) {
          faqQuestionCounts[title] = (faqQuestionCounts[title] || 0) + count;
        }
      }
      continue;
    }

    if (lower.endsWith('.pptx')) {
      const { text, notes, slides } = await extractPptxTextAndNotes(fileBuffer);
      extractedText.push(text);
      checkPlaceholders(issues, name, text);
      checkInternalProofLanguage(issues, name, text);
      for (const slide of slides) {
        const slideWords = countWords(slide.text.replace(/\b\d+\s*\/\s*\d+\b/g, ''));
        if (slideWords > maxVisibleSlideWords) {
          issues.push(`${name}: ${slide.name} has ${slideWords} visible words; move teaching detail into notes.`);
        }
      }
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
      extractedText.push(text);
      checkPlaceholders(issues, name, text);
      checkInternalProofLanguage(issues, name, text);
    }

    if (lower.endsWith('.md') || lower.endsWith('.txt')) {
      const text = fileBuffer.toString('utf8');
      extractedText.push(text);
      checkPlaceholders(issues, name, text);
      checkInternalProofLanguage(issues, name, text);
    }
  }

  if (
    extractedText.some((text) => hasDataScienceAssetReference(text)) &&
    !hasBundledLabAsset(names) &&
    !hasRequiredLabAssetsMarker(names)
  ) {
    issues.push(
      'Data-science package references notebooks, datasets, model cards, or validation assets but includes no lab asset file and no Required Assets marker.',
    );
  }

  if (expectedFaqQuestionsPerLesson) {
    checkFaqQuestionCounts(issues, faqQuestionCounts, expectedFaqQuestionsPerLesson);
  }

  return {
    issues,
    fileCount: names.length,
    files: names,
  };
}
