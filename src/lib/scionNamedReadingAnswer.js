import { buildCourseContentIndex } from './courseContentIndex';

function cleanText(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function lessonNumberFromText(value) {
  const match = String(value || '').match(/\blesson\s*(\d{1,3})\b/i);
  const number = Number(match?.[1]);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function assessmentLessonNumberFromEntry(entry = {}) {
  const registryMatch = String(entry.text || '').match(/\bA(\d{1,3})\.\d+\b/i);
  const registryLesson = Number(registryMatch?.[1]);
  if (Number.isInteger(registryLesson) && registryLesson > 0) return registryLesson;
  const scheduleMatch = String(entry.text || '').match(/\b(?:lesson|week)\s*(\d{1,3})\b/i);
  const scheduledLesson = Number(scheduleMatch?.[1]);
  if (Number.isInteger(scheduledLesson) && scheduledLesson > 0) return scheduledLesson;
  const titledLesson = lessonNumberFromText(entry.anchor?.lessonTitle);
  if (titledLesson) return titledLesson;
  const itemLesson = Number(entry.anchor?.itemIndex) + 1;
  return Number.isInteger(itemLesson) && itemLesson > 0 ? itemLesson : null;
}

function readingIdentity(value = '') {
  return cleanText(value)
    .normalize('NFKC')
    .replace(/[‘’ʻʼ`]/g, "'")
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9']+/gi, ' ')
    .toLowerCase();
}

function collectNamedReadingLocations(courseMap = {}) {
  const locations = [];
  const seen = new Set();
  for (const [lessonIndex, lesson] of (courseMap.lessons || []).entries()) {
    const lessonNumber = Number(lesson?.lessonNumber) || lessonIndex + 1;
    const lessonTitle = cleanText(lesson?.title) || `Lesson ${lessonNumber}`;
    const values = [
      ...(lesson?.readings || []),
      ...(lesson?.requiredReadings || []),
      ...(lesson?.sections || []).flatMap((section) => [
        ...(section?.readings || []),
        ...(section?.requiredReadings || []),
      ]),
    ];
    for (const value of values) {
      const title = cleanText(
        typeof value === 'string' ? value : value?.title || value?.name || value?.label || value?.text,
      );
      const identity = readingIdentity(title);
      const key = `${lessonNumber}:${identity}`;
      if (!title || identity.length < 3 || seen.has(key)) continue;
      seen.add(key);
      locations.push({ title, identity, lessonNumber, lessonTitle });
    }
  }
  return locations;
}

function identityMentionsReading(textIdentity, titleIdentity) {
  if (textIdentity.includes(titleIdentity)) return true;
  const withoutArticle = titleIdentity.replace(/^the\s+/, '');
  return withoutArticle.length >= 6 && textIdentity.includes(withoutArticle);
}

export function buildScionNamedReadingAnswer({ question, courseMap, deliverables } = {}) {
  const text = cleanText(question);
  if (
    !/\b(?:compare|comparison|comparative|versus|vs\.?|paired?|both|connect)\b/i.test(text) ||
    /\b(?:add|apply|change|create|delete|edit|fix|generate|improve|insert|make|move|remove|rename|replace|rewrite|sync|update)\b/i.test(
      text,
    )
  ) {
    return null;
  }
  const questionIdentity = readingIdentity(text);
  const matched = [];
  const seen = new Set();
  for (const reading of collectNamedReadingLocations(courseMap)) {
    if (!identityMentionsReading(questionIdentity, reading.identity) || seen.has(reading.identity)) continue;
    seen.add(reading.identity);
    matched.push(reading);
  }
  if (matched.length < 2) return null;

  const index = buildCourseContentIndex({ courseMap, deliverables });
  const entries = (index.entries || [])
    .filter((entry) => {
      const identity = readingIdentity(entry.text);
      return (
        matched.every((reading) => identityMentionsReading(identity, reading.identity)) &&
        /\bcompar(?:e|ed|es|ing|ison|ative)\b/i.test(entry.text)
      );
    })
    .map((entry) => {
      const contract = entry.text
        .split('\n')
        .map((line) => cleanText(line.replace(/^[^:]{1,42}:\s*/, '')))
        .find((line) => {
          const identity = readingIdentity(line);
          return (
            matched.every((reading) => identityMentionsReading(identity, reading.identity)) &&
            /\bcompar(?:e|ed|es|ing|ison|ative)\b/i.test(line) &&
            /\blocatable passage\b/i.test(line) &&
            /\bcounter-reading\b/i.test(line) &&
            /\bcannot establish|evidence (?:limit|boundary)|scope risk|remains provisional\b/i.test(line)
          );
        });
      const score =
        (contract ? 20 : 0) +
        (entry.featureLabel === 'Assignment Briefs' ? 8 : 0) +
        (entry.featureLabel === 'Discussion Prompts' ? 4 : 0);
      return { entry, contract, score };
    })
    .filter((candidate) => candidate.contract)
    .sort((left, right) => right.score - left.score);

  if (entries.length === 0) {
    const locations = matched
      .map((reading) => `${reading.title} in Lesson ${reading.lessonNumber} (${reading.lessonTitle})`)
      .join(' and ');
    return {
      text: `I found ${locations}, but no compiled activity explicitly pairs these readings with a complete evidence contract. I won’t invent a location or requirement; add or regenerate a comparative task if you want this pair required.`,
      kind: 'course-evidence',
      sources: ['Course Map'],
    };
  }

  const { entry } = entries[0];
  const lessonNumber = assessmentLessonNumberFromEntry(entry) || matched[0]?.lessonNumber || null;
  const lessonTitle =
    (lessonNumber ? courseMap?.lessons?.[lessonNumber - 1]?.title : '') ||
    (lessonNumber ? `Lesson ${lessonNumber}` : 'the scheduled assessment');
  const assessmentTitle = cleanText(entry.anchor?.lessonTitle) || 'the comparative assignment';
  const pair = matched.map((reading) => reading.title).join(' and ');
  return {
    text: `${assessmentTitle} schedules the comparison between ${pair} in ${lessonTitle}, under ${entry.featureLabel}. Students must analyze one locatable passage or formal feature from each work, make a comparative claim that needs both texts, test a credible counter-reading against the same paired evidence, revise the claim, and state explicitly what the selected passages cannot establish on their own.`,
    kind: 'course-evidence',
    ...(lessonNumber ? { lessonNumber } : {}),
    sources: [`${lessonTitle} · ${entry.featureLabel}`],
  };
}
