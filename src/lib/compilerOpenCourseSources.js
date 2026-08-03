import { asArray, cleanText } from './compilerText';

const SOURCE_METADATA_LEAD =
  /^\s*(?:open|official|public|licensed?|creative commons|cc\s+by|source|tutorial|standard|encyclopedia|textbook|article)\b/i;

function sourceMetadataOpen(value) {
  const text = String(value || '');
  for (let index = text.indexOf('('); index >= 0; index = text.indexOf('(', index + 1)) {
    if (SOURCE_METADATA_LEAD.test(text.slice(index + 1))) return index;
  }
  return -1;
}

export function openCourseSourceUrl(value) {
  const citation = cleanText(value);
  const start = citation.search(/https?:\/\//i);
  if (start < 0) return '';
  let depth = 0;
  let url = '';
  for (const character of citation.slice(start)) {
    if (/\s/.test(character)) break;
    if (character === '(') {
      depth += 1;
      url += character;
      continue;
    }
    if (character === ')') {
      if (depth === 0) break;
      depth -= 1;
      url += character;
      continue;
    }
    url += character;
  }
  return url.replace(/[.,;]+$/, '');
}

export function openCourseSourceTitle(value) {
  const citation = cleanText(value);
  const urlMatch = citation.match(/https?:\/\//i);

  // Preserve title parentheticals; display citations can retain metadata after the URL is omitted.
  const beforeUrl = urlMatch ? citation.slice(0, urlMatch.index) : citation;
  const metadataOpen = sourceMetadataOpen(beforeUrl);
  const hasMetadataWrapper = metadataOpen >= 0;
  let title = cleanText(
    urlMatch || hasMetadataWrapper ? (hasMetadataWrapper ? beforeUrl.slice(0, metadataOpen) : beforeUrl) : '',
  );

  const focusSeparator = title.indexOf(' — ');
  if (focusSeparator >= 0) title = cleanText(title.slice(focusSeparator + 3));
  return cleanText(title.replace(/\s+[—–-]\s*$/, ''));
}

export function firstOpenCourseSourceTitle(lesson = {}) {
  return asArray(lesson?.readings).map(openCourseSourceTitle).find(Boolean) || '';
}

export function isCompilerMintedEvidenceBrief(value, lesson = {}) {
  const text = cleanText(value);
  if (!text || !/\bevidence brief$/i.test(text)) return false;
  const instructorNamed = asArray(lesson?.instructorNamedReadings).some(
    (reading) => cleanText(reading).toLowerCase() === text.toLowerCase(),
  );
  if (instructorNamed) return false;
  return [lesson?.throughlineCase?.evidencePacket, lesson?.evidencePlan?.sourceCue].some(
    (candidate) => cleanText(candidate).toLowerCase() === text.toLowerCase(),
  );
}

export function appendOpenCourseSourceTexts(blueprint, texts, seen) {
  for (const lesson of blueprint.lessons || []) {
    for (const reading of lesson.readings || []) {
      const citation = cleanText(reading);
      const url = openCourseSourceUrl(citation);
      if (!url || isCompilerMintedEvidenceBrief(citation, lesson)) continue;
      const title = openCourseSourceTitle(citation) || 'Assigned open course source';
      const identity = `${title.toLowerCase()}|${url.toLowerCase()}`;
      if (seen.has(identity)) continue;
      seen.add(identity);
      const urlStart = citation.search(/https?:\/\//i);
      const beforeUrl = urlStart >= 0 ? citation.slice(0, urlStart) : citation;
      const metadataOpen = sourceMetadataOpen(beforeUrl);
      const details = cleanText(metadataOpen >= 0 ? beforeUrl.slice(metadataOpen + 1).replace(/\s+[—-]\s*$/i, '') : '');
      const author = /w3\.org/i.test(url)
        ? 'W3C Web Accessibility Initiative'
        : /wikipedia\.org/i.test(url)
          ? 'Wikipedia contributors'
          : '';
      texts.push({
        title,
        author,
        edition: '',
        isbn: '',
        note: `Assigned open course source${details ? ` (${details})` : ''} — ${url}.`,
      });
    }
  }
}
