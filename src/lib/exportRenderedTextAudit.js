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
  if (typeof blob.arrayBuffer === 'function') return await blob.arrayBuffer();
  return null;
}

export function findWorstPhraseRepetition(paragraphs) {
  const phraseCounts = new Map();
  for (const paragraph of paragraphs) {
    const words = paragraph
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
