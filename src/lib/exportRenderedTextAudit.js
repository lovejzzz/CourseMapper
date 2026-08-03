/**
 * Rendered-text repetition audit for Office exports.
 *
 * Phrase repetition is measured on what the export actually shows the
 * instructor (word/document.xml, ppt slide + notes XML), not on compiled
 * JSON: internal fields legitimately restate titles, so JSON-level counts
 * over-report what readers experience.
 */

const PHRASE_SHINGLE_SIZE = 8;
// Per lesson-section limit: the audited v0.8.6 files repeated template
// phrases 24-31 times per lesson document; healthy compiled output lands at
// 2-4. Whole-course blobs are split at Heading 2 boundaries so the unit
// matches the per-lesson files instructors actually download.
const PHRASE_REPETITION_LIMIT = 12;

function decodeXmlEntities(value) {
  return String(value || '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function xmlToParagraphTexts(xml, paragraphTag) {
  return String(xml || '')
    .split(paragraphTag)
    .map((chunk) =>
      decodeXmlEntities(chunk.replace(/<[^>]+>/g, ' '))
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .filter(Boolean);
}

async function toArrayBuffer(blob) {
  if (!blob) return null;
  if (blob instanceof ArrayBuffer) return blob;
  if (ArrayBuffer.isView(blob)) {
    return blob.buffer.slice(blob.byteOffset, blob.byteOffset + blob.byteLength);
  }
  if (typeof blob.arrayBuffer === 'function') return await blob.arrayBuffer();
  return null;
}

/**
 * Return the learner-visible text carried by one Office artifact. This is a
 * shared post-export boundary for score evidence: callers inspect the actual
 * DOCX/PPTX bytes rather than trusting compiler JSON or a pre-render receipt.
 */
export async function extractOfficeVisibleText(blob, format) {
  const buffer = await toArrayBuffer(blob);
  if (!buffer) return '';
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(buffer);
  const paragraphs = [];
  if (format === 'docx') {
    for (const file of Object.values(zip.files)) {
      if (file.dir || !/^word\/(?:document|header\d+|footer\d+)\.xml$/.test(file.name)) continue;
      paragraphs.push(...xmlToParagraphTexts(await file.async('string'), '</w:p>'));
    }
  } else if (format === 'pptx') {
    for (const file of Object.values(zip.files)) {
      if (file.dir || !/^ppt\/(?:slides|notesSlides)\/[^/]+\.xml$/.test(file.name)) continue;
      paragraphs.push(...xmlToParagraphTexts(await file.async('string'), '</a:p>'));
    }
  }
  return paragraphs.join(' ').replace(/\s+/g, ' ').trim();
}

// ── v0.14.4 WS-C3a: structural metadata never counts toward repetition ──────
// The quiz DOCX renders per-item scaffolding at item frequency BY DESIGN:
// "Q3 (Multiple choice, 2 pts, ~2 min): …" item headers, the answer key's
// uppercased "ANSWER — B" callout labels, "Aligns to:" / "Intended use:" key
// lines, and pts/min meta rows. A 13-question quiz legitimately repeats that
// scaffold 13× inside one section — the v0.14.2 Crucible round flagged exactly
// that ("multiple choice 2 pts 2 min which statement" ×13). Strip the scaffold
// BEFORE shingling; everything else still counts, so genuine template stamping
// (license boilerplate, repeated content sentences) flags exactly as before.
// Patterns mirror docxExporter.js quizBank rendering: humanizeQuestionType
// labels + the qMeta "(type, N pts, ~N min)" join + makeCallout's
// tracked-uppercase label run.
const QUIZ_TYPE_LABEL = '(?:multiple choice|short answer|true\\s*/\\s*false|fill in the blank|essay|matching)';
const POINTS_TOKEN = '\\d+(?:\\.\\d+)?\\s*pts?';
const MINUTES_TOKEN = '~\\s*\\d+\\s*min';
const QUIZ_META_TOKEN = `(?:${QUIZ_TYPE_LABEL}|${POINTS_TOKEN}|${MINUTES_TOKEN})`;
// "Q3 (Multiple choice, 2 pts, ~2 min): " — strip the header, keep the stem.
const QUIZ_ITEM_HEADER_PREFIX = new RegExp(
  `^Q\\d+\\s*\\(\\s*${QUIZ_META_TOKEN}(?:\\s*,\\s*${QUIZ_META_TOKEN})*\\s*\\)\\s*:?\\s*`,
  'i',
);
// makeCallout uppercases only its LABEL run ("ANSWER — B"); the explanation
// run keeps body case — so consume leading uppercase-only tokens after
// ANSWER and stop at the first token containing a lowercase letter.
const ANSWER_SCAFFOLD_PREFIX = /^ANSWER\b(?:\s+[^a-z\s]+(?=\s|$))*\s*/;
// Whole lines that are pure scaffolding: answer-key alignment/use stamps and
// standalone points/timing meta rows.
const STRUCTURAL_LINE_PATTERNS = [
  /^(?:aligns to|intended use)\s*:/i,
  new RegExp(`^(?:${POINTS_TOKEN}|${MINUTES_TOKEN})(?:\\s*[·,;]\\s*(?:${POINTS_TOKEN}|${MINUTES_TOKEN}))*$`, 'i'),
];

export function stripStructuralMetadata(paragraph) {
  const text = String(paragraph || '').trim();
  if (STRUCTURAL_LINE_PATTERNS.some((pattern) => pattern.test(text))) return '';
  return text.replace(QUIZ_ITEM_HEADER_PREFIX, '').replace(ANSWER_SCAFFOLD_PREFIX, '');
}

export function findWorstPhraseRepetition(paragraphs) {
  const phraseCounts = new Map();
  for (const paragraph of paragraphs) {
    const words = stripStructuralMetadata(paragraph)
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(Boolean);
    for (let index = 0; index + PHRASE_SHINGLE_SIZE <= words.length; index += 1) {
      const shingle = words.slice(index, index + PHRASE_SHINGLE_SIZE).join(' ');
      phraseCounts.set(shingle, (phraseCounts.get(shingle) || 0) + 1);
    }
  }
  let worstShingle = '';
  let worstCount = 0;
  for (const [shingle, count] of phraseCounts) {
    if (count > worstCount) {
      worstCount = count;
      worstShingle = shingle;
    }
  }
  return { shingle: worstShingle, count: worstCount, limit: PHRASE_REPETITION_LIMIT };
}

function splitDocxIntoSections(xml) {
  // Tables hold parallel data records — identical readings listed for every
  // week is course data, not template stamping — so each table row audits as
  // its own unit. Prose is grouped into sections at Heading 1/2 boundaries so
  // each unit matches one lesson's portion of a combined document.
  const sections = [];
  const prose = String(xml || '').replace(/<w:tbl>[\s\S]*?<\/w:tbl>/g, (tableXml) => {
    for (const rowXml of tableXml.split('</w:tr>')) {
      const rowTexts = rowXml
        .split('</w:p>')
        .map((chunk) =>
          decodeXmlEntities(chunk.replace(/<[^>]+>/g, ' '))
            .replace(/\s+/g, ' ')
            .trim(),
        )
        .filter(Boolean);
      if (rowTexts.length > 0) sections.push(rowTexts);
    }
    return '';
  });
  let current = [];
  for (const chunk of prose.split('</w:p>')) {
    const isHeading = /w:val="Heading[12]"/.test(chunk);
    if (isHeading && current.length > 0) {
      sections.push(current);
      current = [];
    }
    const text = decodeXmlEntities(chunk.replace(/<[^>]+>/g, ' '))
      .replace(/\s+/g, ' ')
      .trim();
    if (text) current.push(text);
  }
  if (current.length > 0) sections.push(current);
  return sections;
}

/**
 * Inspect a DOCX or PPTX blob and return a repetition finding when any
 * 8-word phrase is stamped at template-level frequency inside one lesson
 * section (DOCX) or one slide+notes pair (PPTX). Returns null when clean.
 */
export async function auditOfficeBlobRepetition(blob, format) {
  const buffer = await toArrayBuffer(blob);
  if (!buffer) return null;
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(buffer);
  const units = [];
  if (format === 'docx') {
    for (const file of Object.values(zip.files)) {
      if (file.dir || !/^word\/document\.xml$/.test(file.name)) continue;
      units.push(...splitDocxIntoSections(await file.async('string')));
    }
  } else {
    for (const file of Object.values(zip.files)) {
      if (file.dir || !/^ppt\/(?:slides|notesSlides)\/[^/]+\.xml$/.test(file.name)) continue;
      units.push(xmlToParagraphTexts(await file.async('string'), '</a:p>'));
    }
  }
  let worst = { shingle: '', count: 0, limit: PHRASE_REPETITION_LIMIT };
  for (const unit of units) {
    const result = findWorstPhraseRepetition(unit);
    if (result.count > worst.count) worst = result;
  }
  if (worst.count >= worst.limit) {
    return {
      code: 'phrase-repetition',
      sample: worst.shingle,
      count: worst.count,
      message: `Rendered text repeats the phrase "${worst.shingle}" ${worst.count} times within one section.`,
    };
  }
  return null;
}

/**
 * Accessibility structure scan (v0.9.1 Phase 3 — CCR D5.1 proxy).
 * DOCX: requires a real heading structure and a footer part; flags tables
 * whose first row carries no header shading. PPTX: every picture and every
 * CourseMapper-authored semantic object needs a non-empty description. The
 * named-object check makes this contract non-vacuous for decks with no media.
 */
export async function auditOfficeAccessibility(blob, format) {
  const buffer = await toArrayBuffer(blob);
  if (!buffer) return null;
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(buffer);
  const problems = [];
  if (format === 'docx') {
    const documentXml = await zip.file('word/document.xml')?.async('string');
    if (documentXml) {
      if (!/w:val="(?:Title|Heading[1-6])"/.test(documentXml)) problems.push('no-heading-structure');
      const tables = documentXml.split('<w:tbl>').slice(1);
      for (const table of tables) {
        // A one-row table is a layout unit, not a header-plus-data table. The
        // lesson-plan exporter deliberately emits each teaching move as one
        // bounded row so pagination can happen between complete activities.
        // Its first bounded table owns the shared header; requiring every
        // continuation row to pretend that its data is a header produced a
        // false accessibility warning in the exported readiness report.
        const rowCount = table.match(/<w:tr(?:\s[^>]*)?>/g)?.length || 0;
        if (rowCount < 2) continue;
        const firstRow = table.split('</w:tr>')[0] || '';
        if (!/w:shd /.test(firstRow)) {
          problems.push('table-without-header-shading');
          break;
        }
      }
    }
    if (!Object.keys(zip.files).some((name) => /^word\/footer\d*\.xml$/.test(name))) problems.push('no-footer');
  } else {
    for (const file of Object.values(zip.files)) {
      if (file.dir || !/^ppt\/slides\/[^/]+\.xml$/.test(file.name)) continue;
      const xml = await file.async('string');
      if (/\[\\[A-Za-z]+[^\]]*\.\.\.\]/.test(xmlToParagraphTexts(xml, '</a:p>').join(' '))) {
        problems.push('truncated-inline-latex');
      }
      const pictures = xml.split('<p:pic>').slice(1);
      for (const picture of pictures) {
        const descr = picture.match(/descr="([^"]*)"/);
        if (!descr || !descr[1].trim()) {
          problems.push('image-without-alt');
          break;
        }
      }
      const semanticObjects = [...xml.matchAll(/<(?:p|pic):cNvPr\b[^>]*>/g)]
        .map((match) => match[0])
        .filter((tag) => {
          const name = tag.match(/\bname="([^"]*)"/)?.[1] || '';
          return /^(?:cmA11y-|cmViz(?:Hub|Spoke|Chart|Layer|Table|Matrix)|slide-counter-label-)/.test(name);
        });
      for (const object of semanticObjects) {
        const descr = object.match(/\bdescr="([^"]*)"/);
        if (!descr || !descr[1].trim()) {
          problems.push('semantic-object-without-description');
          break;
        }
      }
    }
  }
  if (problems.length === 0) return null;
  return {
    code: 'accessibility',
    problems: [...new Set(problems)],
    message: `Accessibility scan: ${[...new Set(problems)].join(', ')}.`,
  };
}
