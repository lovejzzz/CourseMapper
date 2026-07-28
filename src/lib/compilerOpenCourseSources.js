import { asArray, cleanText } from './compilerText';

export function openCourseSourceTitle(value) {
  const citation = cleanText(value);
  if (!/https?:\/\/[^\s)]+/i.test(citation)) return '';
  return cleanText(citation.split(/\s+\(/)[0].replace(/\s+[—-]\s+https?:\/\/.*$/i, ''));
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
      const url = citation.match(/https?:\/\/[^\s)]+/i)?.[0]?.replace(/[.,;]+$/, '') || '';
      if (!url || isCompilerMintedEvidenceBrief(citation, lesson)) continue;
      const title = openCourseSourceTitle(citation) || 'Assigned open course source';
      const identity = `${title.toLowerCase()}|${url.toLowerCase()}`;
      if (seen.has(identity)) continue;
      seen.add(identity);
      const details = cleanText(
        citation
          .match(/\(([^()]*(?:license|source|tutorial|standard|encyclopedia)[^()]*)\)/i)?.[1]
          ?.replace(/\s+[—-]\s+https?:\/\/.*$/i, ''),
      );
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
