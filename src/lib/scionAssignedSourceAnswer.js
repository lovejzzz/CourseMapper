import { buildSourceLedgerFromCourseGraph } from './knowledge/sourceLedger';

const SOURCE_QUESTION_STOP_WORDS = new Set([
  'and',
  'assigned',
  'can',
  'course',
  'each',
  'establish',
  'lesson',
  'source',
  'sources',
  'support',
  'the',
  'what',
  'which',
]);

function cleanText(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function sourceQuestionTokens(value = '') {
  return cleanText(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 2 && !SOURCE_QUESTION_STOP_WORDS.has(token));
}

function sourceQuestionLesson(question, courseMap) {
  const lessons = Array.isArray(courseMap?.lessons) ? courseMap.lessons : [];
  const explicitLessonNumber = Number(question.match(/\b(?:lesson|week)\s*(\d+)\b/i)?.[1]);
  if (Number.isInteger(explicitLessonNumber) && lessons[explicitLessonNumber - 1]) {
    const lesson = lessons[explicitLessonNumber - 1];
    return {
      lesson,
      index: explicitLessonNumber - 1,
      title: cleanText(lesson?.title).replace(/^lesson\s*\d+\s*[:.\-–—]?\s*/i, ''),
      score: Number.POSITIVE_INFINITY,
    };
  }
  const questionTokens = new Set(sourceQuestionTokens(question));
  const ranked = lessons
    .map((lesson, index) => {
      const title = cleanText(lesson?.title).replace(/^lesson\s*\d+\s*[:.\-–—]?\s*/i, '');
      return {
        lesson,
        index,
        title,
        score: sourceQuestionTokens(title).filter((token) => questionTokens.has(token)).length,
      };
    })
    .sort((left, right) => right.score - left.score || left.index - right.index);
  return ranked[0]?.score > 0 ? ranked[0] : null;
}

function connectedLessonFromQuestion(question, courseMap, sourceIndex) {
  const lessons = Array.isArray(courseMap?.lessons) ? courseMap.lessons : [];
  const mentioned = [
    ...new Set(
      [...String(question || '').matchAll(/\b(?:lesson|week)\s*(\d+)\b/gi)]
        .map((match) => Number(match[1]) - 1)
        .filter((index) => Number.isInteger(index) && index >= 0 && index < lessons.length),
    ),
  ];
  const connectedIndex = mentioned.find((index) => index !== sourceIndex);
  if (connectedIndex != null) {
    const lesson = lessons[connectedIndex];
    return {
      index: connectedIndex,
      lesson,
      title: cleanText(lesson?.title).replace(/^lesson\s*\d+\s*[:.\-–—]?\s*/i, ''),
    };
  }

  const questionTokens = new Set(sourceQuestionTokens(question));
  const ranked = lessons
    .map((lesson, index) => {
      const title = cleanText(lesson?.title).replace(/^lesson\s*\d+\s*[:.\-–—]?\s*/i, '');
      return {
        index,
        lesson,
        title,
        score: sourceQuestionTokens(title).filter((token) => questionTokens.has(token)).length,
      };
    })
    .filter(({ index }) => index !== sourceIndex)
    .sort((left, right) => right.score - left.score || left.index - right.index);
  const connectedTarget = ranked[0];
  if (!connectedTarget || connectedTarget.score < 2) return null;
  return {
    index: connectedTarget.index,
    lesson: connectedTarget.lesson,
    title: connectedTarget.title,
  };
}

function sourceToLessonConnection(sourceTarget, connectedTarget) {
  if (!connectedTarget) return '';
  const sourceTitle = sourceTarget.title || `Lesson ${sourceTarget.index + 1}`;
  const rawConnectedTitle = connectedTarget.title || `Lesson ${connectedTarget.index + 1}`;
  const connectedTitle = `${rawConnectedTitle.charAt(0).toUpperCase()}${rawConnectedTitle.slice(1)}`;
  return `\n\n**Connection to Lesson ${connectedTarget.index + 1}: ${connectedTitle}** — The sequence moves from source-backed work on ${sourceTitle} to ${connectedTitle}. Carry the concrete findings and unresolved barriers from Lesson ${sourceTarget.index + 1} forward as evidence to test, prioritize, and revise in Lesson ${connectedTarget.index + 1}; a passing check on one form or component does not by itself prove whole-product conformance.`;
}

function flattenSourceValues(value, output = []) {
  if (typeof value === 'string') {
    if (cleanText(value)) output.push(cleanText(value));
  } else if (Array.isArray(value)) {
    for (const entry of value) flattenSourceValues(entry, output);
  }
  return output;
}

function sourceTitleFromCitation(value = '') {
  return cleanText(value)
    .replace(/^[\s),;|/]*(?:\d+[.)]\s*)?/, '')
    .split(/\s+\(/)[0]
    .replace(/\s+[—-]\s+https?:\/\/.*$/i, '')
    .trim();
}

function sourceRecordsFromCitation(value = '') {
  const citation = cleanText(value);
  const matches = [...citation.matchAll(/https?:\/\/[^\s)]+/gi)];
  let start = 0;
  return matches.map((match) => {
    const segment = citation.slice(start, match.index + match[0].length);
    start = match.index + match[0].length;
    return {
      title: sourceTitleFromCitation(segment),
      url: match[0].replace(/[.,;]+$/, ''),
    };
  });
}

function assignedLessonSources(lesson = {}) {
  const raw = [
    ...flattenSourceValues(lesson?.readings),
    ...flattenSourceValues(lesson?.resources),
    ...(Array.isArray(lesson?.sections)
      ? lesson.sections.flatMap((section) => [
          ...flattenSourceValues(section?.supportingResources),
          ...flattenSourceValues(section?.readings),
          ...flattenSourceValues(section?.resources),
        ])
      : []),
  ];
  const seen = new Set();
  return raw.flatMap(sourceRecordsFromCitation).filter(({ title, url }) => {
    if (!title || !url) return false;
    const identity = `${title.toLowerCase()}|${url.toLowerCase()}`;
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}

function normalizedSessionRefsForTarget(courseGraph, target) {
  const lessonNumber = target.index + 1;
  const graphSession = Array.isArray(courseGraph?.sessions) ? courseGraph.sessions[target.index] : null;
  return new Set(
    [`s${lessonNumber}`, String(lessonNumber), graphSession?.id, graphSession?.number]
      .map((value) => cleanText(value).toLowerCase())
      .filter(Boolean),
  );
}

function sourceLedgerLessonMatch(row, target, courseGraph) {
  const lessonNumber = target.index + 1;
  const targetSessionRefs = normalizedSessionRefsForTarget(courseGraph, target);
  const rowSessionRefs = Array.isArray(row?.sessionRefs)
    ? row.sessionRefs.map((value) => cleanText(value).toLowerCase()).filter(Boolean)
    : [];
  if (rowSessionRefs.some((value) => targetSessionRefs.has(value))) return true;
  if (new RegExp(`\\blesson[-_\\s]*${lessonNumber}\\b`, 'i').test(cleanText(row?.scope))) return true;

  const targetTokens = new Set(sourceQuestionTokens(target.title));
  if (targetTokens.size === 0) return false;
  return (Array.isArray(row?.conceptLinks) ? row.conceptLinks : []).some((link) => {
    const linkTokens = sourceQuestionTokens(link?.label || link?.id);
    return linkTokens.length > 0 && linkTokens.every((token) => targetTokens.has(token));
  });
}

function assignedLessonSourcesFromCourseGraph(courseGraph, target) {
  const ledger = buildSourceLedgerFromCourseGraph(courseGraph);
  const rows = Array.isArray(ledger?.rows) ? ledger.rows : [];
  return rows
    .filter((row) => sourceLedgerLessonMatch(row, target, courseGraph))
    .map((row) => ({
      title: cleanText(row?.title || row?.citation || row?.evidence || row?.id),
      url: cleanText(row?.url || (row?.doi ? `https://doi.org/${row.doi}` : '')),
    }))
    .filter(({ title, url }) => title && /^https?:\/\//i.test(url));
}

function assignedLessonSourcesFromEvidenceOverlay(courseGraph, target) {
  const lessonId = `lesson-${target.index + 1}`;
  const payload = courseGraph?.enrichmentOverlay?.lessonContent?.[lessonId];
  const citations = Array.isArray(payload?.conceptProvenance?.citations) ? payload.conceptProvenance.citations : [];
  return citations
    .map((citation) => ({
      title: cleanText(citation?.displayTitle || citation?.title || citation?.key),
      url: cleanText(citation?.sourceUrl || citation?.url),
    }))
    .filter(({ title, url }) => title && /^https?:\/\//i.test(url));
}

function mergeAssignedLessonSources(...sourceGroups) {
  const seenTitles = new Set();
  const seenUrls = new Set();
  return sourceGroups.flat().filter(({ title, url }) => {
    const titleKey = cleanText(title).toLowerCase();
    const urlKey = cleanText(url).toLowerCase();
    if (!titleKey || !urlKey || seenTitles.has(titleKey) || seenUrls.has(urlKey)) return false;
    seenTitles.add(titleKey);
    seenUrls.add(urlKey);
    return true;
  });
}

function sourceUseBoundary(title = '', lessonTitle = '') {
  if (/\beasy checks?\b|\bpreliminary checks?\b/i.test(title)) {
    return 'Use it for a first review of basic accessibility barriers; it explicitly does not establish comprehensive accessibility or conformance.';
  }
  if (/\bwcag[-\s]?em\b|\bevaluation methodology\b/i.test(title)) {
    return 'Use it for a structured conformance-evaluation method, including defining scope and applying WCAG-EM steps rather than treating a quick check as complete proof.';
  }
  if (/\bevaluating web accessibility\b/i.test(title)) {
    return 'Use it for choosing evaluation approaches and for the boundary that tools assist evaluation but do not replace knowledgeable human judgment.';
  }
  if (/\blabels?\b/i.test(title)) {
    return 'Use it for claims about label purpose and the association between a label and its form control.';
  }
  if (/\baccessible forms?\b/i.test(title)) {
    return 'Use it for claims about form structure, instructions, validation feedback, and barriers faced by disabled users.';
  }
  if (/\bweb content accessibility guidelines?\b|\bwcag\b/i.test(title)) {
    return 'Use it for claims about the current WCAG standard, success criteria, and conformance levels.';
  }
  if (/\baccessibility principles?\b/i.test(title)) {
    return 'Use it for claims about perceivable, operable, understandable, and robust design.';
  }
  if (/\bsemantic html\b|\bpage structure\b/i.test(title)) {
    return 'Use it for claims about meaningful markup, document structure, and how structure supports navigation.';
  }
  return `Use it only for claims the source explicitly supports about ${lessonTitle || title}.`;
}

export function isScionAssignedSourceQuestion(question = '') {
  return /\b(?:(?:which|what|list|name|where).{0,100}\b(?:assigned|course|lesson|official)?\s*sources?|what can .{0,100}(?:establish|support|prove)|sources?\s+(?:supports?|establishes?|proves?))\b/i.test(
    question,
  );
}

export function buildScionAssignedSourceAnswer({ question, courseMap, courseGraph } = {}) {
  if (!isScionAssignedSourceQuestion(question)) return null;
  const target = sourceQuestionLesson(question, courseMap);
  if (!target) return null;
  const evidenceSources = assignedLessonSourcesFromEvidenceOverlay(courseGraph, target);
  const canonicalSources = assignedLessonSourcesFromCourseGraph(courseGraph, target);
  const sources = mergeAssignedLessonSources(
    evidenceSources,
    canonicalSources,
    evidenceSources.length === 0 && canonicalSources.length === 0 ? assignedLessonSources(target.lesson) : [],
  );
  if (sources.length === 0) return null;
  const selected = sources.slice(0, 5);
  const rows = selected
    .map(({ title, url }) => `- **${title}** — ${sourceUseBoundary(title, target.title)} ${url}`)
    .join('\n');
  const lessonTitle = `${target.title.charAt(0).toUpperCase()}${target.title.slice(1)}`;
  const connectedTarget = connectedLessonFromQuestion(question, courseMap, target.index);
  const connection = sourceToLessonConnection(target, connectedTarget);
  return {
    text: `${lessonTitle} uses these assigned sources:\n\n${rows}${connection}\n\nThese sources support bounded course claims; they do not by themselves prove that a particular product conforms until its implementation is inspected against the relevant criteria.`,
    kind: 'course-evidence',
    lessonNumber: target.index + 1,
    sources: selected.map(({ title, url }) => `${title} · ${url}`),
  };
}
