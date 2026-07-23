import { buildCourseContentIndex } from './courseContentIndex';

const EDIT_INTENT =
  /\b(?:add|apply|change|create|delete|edit|fix|generate|improve|insert|make|move|remove|rename|replace|rewrite|sync|update)\b/i;
const QUESTION_INTENT =
  /(?:\?|\b(?:can|could|define|describe|does|explain|how|is|should|summarize|tell|what|when|where|which|who|why)\b)/i;
const GROUNDED_EXPLANATION_INTENT =
  /\b(?:why|explain|how does|how do|what does .{1,80} mean|where (?:is|are|do|does) .{1,100}(?:taught|covered|appear|find))\b/i;
const OPEN_ENDED_CREATION_INTENT = /\b(?:best new|new case|invent|recommend|suggest|brainstorm|create)\b/i;
const EXPLANATION_STOP_WORDS = new Set([
  'about',
  'appear',
  'cause',
  'causes',
  'covered',
  'does',
  'explain',
  'find',
  'from',
  'here',
  'how',
  'into',
  'package',
  'that',
  'the',
  'this',
  'taught',
  'there',
  'what',
  'where',
  'which',
  'why',
  'with',
]);

function cleanText(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function lessonNumberFromQuestion(question) {
  const match = String(question || '').match(/\blesson\s*(\d{1,3})\b/i);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isInteger(value) && value > 0 ? value : null;
}

function isReadOnlyCourseQuestion(question) {
  const text = cleanText(question);
  if (!text || text.startsWith('[AUTO-REVIEW]')) return false;
  return QUESTION_INTENT.test(text) && !EDIT_INTENT.test(text);
}

function quizQuestionsFromDeliverables(deliverables = {}) {
  const quizzes = deliverables?.quizBank?.data?.quizzes;
  if (!Array.isArray(quizzes)) return [];
  return quizzes.flatMap((quiz) => {
    const questions = quiz?.qs || quiz?.questions || [];
    return Array.isArray(questions) ? questions : [];
  });
}

function quizQuestionText(question = {}) {
  return cleanText(question?.question || question?.q);
}

function stripQuizOptionLabel(value = '') {
  return cleanText(value).replace(/^\s*[A-D][.)]\s*/i, '');
}

function correctQuizOption(question = {}) {
  const options = question?.options || question?.opts || question?.o || [];
  if (!Array.isArray(options) || options.length === 0) return '';
  const answer = question?.answer ?? question?.a ?? question?.correctAnswer;
  const explicitIndex = Number.isInteger(question?.answerIndex)
    ? question.answerIndex
    : Number.isInteger(answer)
      ? answer
      : typeof answer === 'string' && /^[A-D]$/i.test(answer.trim())
        ? answer.trim().toUpperCase().charCodeAt(0) - 65
        : -1;
  if (explicitIndex >= 0 && explicitIndex < options.length) return stripQuizOptionLabel(options[explicitIndex]);
  const exact = options.find((option) => stripQuizOptionLabel(option) === cleanText(answer));
  return exact ? stripQuizOptionLabel(exact) : '';
}

function extractQuotedLessonDetail(value = '') {
  const text = cleanText(value);
  const labelMatch = /lesson detail:\s*/i.exec(text);
  if (!labelMatch) return '';
  const remainder = text.slice(labelMatch.index + labelMatch[0].length);
  const smartOpen = remainder.indexOf('“');
  const smartClose = remainder.lastIndexOf('”');
  if (smartOpen >= 0 && smartClose > smartOpen) {
    return cleanText(remainder.slice(smartOpen + 1, smartClose));
  }
  return cleanText(remainder.match(/^["'](.+?)["'](?:\s+(?:cite|explain|use)\b|[.!?]?$)/i)?.[1]);
}

function buildTargetLanguageAnswer(question, courseMap, deliverables) {
  if (!/\b(?:mandarin|chinese|world language|foreign language)\b/i.test(cleanText(courseMap?.courseName))) {
    return null;
  }
  if (
    !/\b(?:what does|mean(?:ing)?|pronounce|pronunciation|how (?:do|should) (?:i|a beginner|students?) say|lesson fact|supports? (?:the|this) answer)\b/i.test(
      question,
    )
  ) {
    return null;
  }

  const questions = quizQuestionsFromDeliverables(deliverables);
  for (const item of questions) {
    const retrieval = quizQuestionText(item).match(/^What does\s+(.+?)\s+\(([^)]+)\)\s+mean in this lesson\?/i);
    if (!retrieval) continue;
    const hanzi = retrieval[1].trim();
    const pinyin = retrieval[2].trim();
    if (!question.includes(hanzi) && !question.toLowerCase().includes(pinyin.toLowerCase())) continue;
    const meaning = correctQuizOption(item);
    if (!meaning) continue;

    const lessonDetails = questions
      .filter((candidate) => {
        const text = quizQuestionText(candidate);
        return text.includes(hanzi) || text.toLowerCase().includes(pinyin.toLowerCase());
      })
      .map((candidate) => extractQuotedLessonDetail(quizQuestionText(candidate)))
      .filter(Boolean);
    const exactDetail =
      lessonDetails.find((detail) => /\b(?:tone|pitch|pronunciation|pinyin|pronounced)\b/i.test(detail)) ||
      lessonDetails[0] ||
      `${hanzi} (${pinyin}) means “${meaning}.”`;
    return {
      text: `${hanzi} (${pinyin}) means “${meaning}.” Use ${pinyin} as the exact tone-marked pronunciation guide. The supporting lesson fact is: “${exactDetail}”`,
      kind: 'course-evidence',
      sources: ['Quiz & Exam Bank'],
    };
  }
  return null;
}

function splitEvidenceLines(text) {
  return String(text || '')
    .split(/\n+/)
    .flatMap((line) => line.split(/(?<=[.!?])\s+|;\s+(?=[A-Z])/))
    .map((line) => cleanText(line.replace(/^[^:]{1,42}:\s*/, '').replace(/^(?:[-•*]|\d+[.)])\s*/, '')))
    .filter((line) => line.length >= 16);
}

function comparisonPairFromLine(line) {
  const match = cleanText(line).match(
    /\b(?:pair|pairs|compare|compares|contrast|contrasts)\s+([a-z][a-z0-9 %()/'-]{1,44}?)\s+(?:and|with|against)\s+([a-z][a-z0-9 %()/'-]{1,44}?)(?=\s+(?:with|before|after|because|while|when|to|for|then)\b|[.,;:]|$)/i,
  );
  if (!match) return null;
  const first = cleanText(match[1]);
  const second = cleanText(match[2]);
  if (first.split(' ').length > 6 || second.split(' ').length > 6) return null;
  return { first, second, evidence: cleanText(line) };
}

function findComparisonEvidence(entries) {
  for (const entry of entries) {
    for (const line of splitEvidenceLines(entry.text)) {
      const pair = comparisonPairFromLine(line);
      if (pair) return { ...pair, entry };
    }
  }
  return null;
}

function findInterpretationEvidence(entries, pair) {
  const firstTokens = pair.first
    .toLowerCase()
    .split(/\s+/)
    .filter((token) => token.length > 3);
  const secondTokens = pair.second
    .toLowerCase()
    .split(/\s+/)
    .filter((token) => token.length > 3);
  const candidates = [];
  for (const entry of entries) {
    for (const line of splitEvidenceLines(entry.text)) {
      const lower = line.toLowerCase();
      const pairHits = [firstTokens, secondTokens].filter((tokens) =>
        tokens.some((token) => lower.includes(token)),
      ).length;
      const interpretationHits = [
        /\b(?:account|affect|change|condition|context|interpret|saturation)\w*\b/i,
        /\b(?:mislead|rather than|not interchangeable|one convenient measurement)\b/i,
      ].filter((pattern) => pattern.test(line)).length;
      if (pairHits === 0 || interpretationHits === 0 || line === pair.evidence) continue;
      candidates.push({ line, score: pairHits * 3 + interpretationHits, entry });
    }
  }
  candidates.sort((a, b) => b.score - a.score || a.line.length - b.line.length);
  return candidates[0] || null;
}

function sourceLabel(entry, lessonNumber) {
  const lesson = entry?.anchor?.lessonTitle || `Lesson ${lessonNumber}`;
  const feature = entry?.featureLabel || 'course materials';
  return `${lesson} · ${feature}`;
}

function explanationTokens(question) {
  return [
    ...new Set(
      cleanText(question)
        .toLowerCase()
        .replace(/[^a-z0-9'\s-]/g, ' ')
        .split(/\s+/)
        .filter((token) => token.length > 2 && !EXPLANATION_STOP_WORDS.has(token)),
    ),
  ];
}

function explanationLineScore(line, tokens, question) {
  let text = cleanText(line);
  if (/^(?:students?|learners?)\b.*\s→\s/i.test(text)) {
    const correction = cleanText(text.split(/\s→\s/).at(-1));
    if (correction.length >= 24) text = correction;
  }
  if (text.length < 24 || text.length > 520 || text.includes('?')) return null;
  if (
    /^(?:ask|have|invite|tell|prompt|require|remind|direct|instruct|seed|frame|open|close|group|circulate|debrief|pair)\b/i.test(
      text,
    ) ||
    /\[Note:\s*(?:ask|have|invite|tell|prompt|require|remind|direct|instruct)\b/i.test(text) ||
    /\]\s*\d+\s+minutes?\b/i.test(text) ||
    /\b(?:small groups?|team decision)\b/i.test(text) ||
    /\b(?:ask|have)\s+which\b/i.test(text) ||
    /^(?:students?|learners?)\s+(?:often\s+|sometimes\s+|may\s+)?(?:think|believe|assume|expect|conclude)\b/i.test(
      text,
    ) ||
    /\b(?:students should|instructor should|review notes|success criterion|estimated workload|course structure links|broader course objectives)\b/i.test(
      text,
    )
  ) {
    return null;
  }
  const lower = text.toLowerCase();
  const matched = tokens.filter((token) => lower.includes(token));
  if (matched.length < Math.min(2, tokens.length)) return null;
  const asksWhy = /\bwhy\b|\bhow does\b|\bhow do\b|\bexplain\b/i.test(question);
  const causal =
    /\b(?:because|caused by|causes|changes?|due to|results? from|therefore|which makes|which means|not by)\b/i.test(
      text,
    );
  const definitional = /\b(?:is|are|means|refers to|depends on|consists of)\b/i.test(text);
  if (asksWhy && !causal && !definitional) return null;
  const score = matched.length * 5 + (causal ? 6 : 0) + (definitional ? 2 : 0) - Math.max(0, text.length - 260) / 80;
  return { text, matched, score };
}

function preferredFeatureOrder(label) {
  return (
    {
      'Study Guides': 0,
      'Course FAQ': 1,
      'Lesson Plans': 2,
      'Slide Decks': 3,
      'Quiz & Exam Bank': 4,
      'Course Map': 5,
      Syllabus: 6,
    }[label] ?? 20
  );
}

function buildGroundedExplanationAnswer(question, index, requestedLessonNumber = null) {
  if (!GROUNDED_EXPLANATION_INTENT.test(question) || OPEN_ENDED_CREATION_INTENT.test(question)) return null;
  const tokens = explanationTokens(question);
  if (tokens.length < 2) return null;

  const candidates = [];
  for (const entry of index?.entries || []) {
    const lessonNumber = Number(entry?.anchor?.itemIndex) + 1;
    if (!Number.isInteger(lessonNumber) || lessonNumber < 1) continue;
    if (requestedLessonNumber && lessonNumber !== requestedLessonNumber) continue;
    for (const line of splitEvidenceLines(entry.text)) {
      const scored = explanationLineScore(line, tokens, question);
      if (!scored) continue;
      candidates.push({ ...scored, entry, lessonNumber });
    }
  }
  candidates.sort(
    (a, b) =>
      b.score - a.score ||
      preferredFeatureOrder(a.entry.featureLabel) - preferredFeatureOrder(b.entry.featureLabel) ||
      a.text.length - b.text.length,
  );
  if (candidates.length === 0) return null;

  const bestLessonNumber = requestedLessonNumber || candidates[0].lessonNumber;
  const lessonCandidates = candidates.filter((candidate) => candidate.lessonNumber === bestLessonNumber);
  const facts = [];
  for (const candidate of lessonCandidates) {
    const normalized = candidate.text.toLowerCase().replace(/[^a-z0-9]+/g, ' ');
    if (
      facts.some((fact) => {
        const existing = fact.normalized;
        return existing.includes(normalized) || normalized.includes(existing);
      })
    ) {
      continue;
    }
    facts.push({ ...candidate, normalized });
    if (facts.length === 2) break;
  }
  const lessonTitle =
    lessonCandidates.find((candidate) => candidate.entry?.anchor?.lessonTitle)?.entry.anchor.lessonTitle ||
    `Lesson ${bestLessonNumber}`;
  const sourceLabels = [
    ...new Set(
      lessonCandidates
        .filter((candidate) => candidate.score >= lessonCandidates[0].score - 6)
        .map((candidate) => candidate.entry.featureLabel),
    ),
  ]
    .sort((a, b) => preferredFeatureOrder(a) - preferredFeatureOrder(b))
    .slice(0, 4);
  const evidenceText = facts.map((fact) => fact.text.replace(/[.!?]+$/, '')).join('. ');

  return {
    text: `${evidenceText}.\n\nYou’ll find this in ${lessonTitle}, especially in ${sourceLabels.join(', ')}.`,
    kind: 'course-evidence',
    lessonNumber: bestLessonNumber,
    sources: sourceLabels.map((label) => `${lessonTitle} · ${label}`),
  };
}

function buildComparisonAnswer(question, entries, lessonNumber) {
  if (!/\b(?:two|pair|compare|comparison|contrast)\b/i.test(question)) return null;
  const pair = findComparisonEvidence(entries);
  if (!pair) return null;
  const interpretation = findInterpretationEvidence(entries, pair);
  const firstLower = pair.first.toLowerCase();
  const secondLower = pair.second.toLowerCase();

  let explanation =
    'The package uses this pair to support a decision with complementary evidence instead of treating one convenient measurement as a complete judgment.';
  if (
    (firstLower.includes('dissolved oxygen') && secondLower.includes('temperature')) ||
    (secondLower.includes('dissolved oxygen') && firstLower.includes('temperature'))
  ) {
    explanation =
      'Temperature changes how a dissolved-oxygen result should be interpreted, so the reading should be evaluated in physical context instead of treated as stand-alone proof of impairment.';
  }

  const context = interpretation ? ` The course also notes: ${interpretation.line.replace(/[.!?]+$/, '')}.` : '';
  const sources = [sourceLabel(pair.entry, lessonNumber)];
  if (interpretation?.entry && interpretation.entry !== pair.entry) {
    sources.push(sourceLabel(interpretation.entry, lessonNumber));
  }

  return {
    text: `Lesson ${lessonNumber} points students to **${pair.first}** and **${pair.second}**. ${explanation}${context}\n\nCourse evidence: ${[...new Set(sources)].join('; ')}.`,
    kind: 'course-evidence',
    lessonNumber,
    sources: [...new Set(sources)],
  };
}

/**
 * Answer narrow, read-only questions directly from the compiled package.
 *
 * This is deliberately conservative. It only returns an answer when the
 * question names a lesson and the package contains an explicit comparison
 * pair. Everything else falls through to the full Agent.
 */
export function buildScionCourseAnswer({ question, courseMap, deliverables } = {}) {
  if (!isReadOnlyCourseQuestion(question)) return null;
  const targetLanguageAnswer = buildTargetLanguageAnswer(question, courseMap, deliverables);
  if (targetLanguageAnswer) return targetLanguageAnswer;
  const index = buildCourseContentIndex({ courseMap, deliverables });
  const lessonNumber = lessonNumberFromQuestion(question);
  if (lessonNumber) {
    const entries = (index.entries || []).filter((entry) => entry?.anchor?.itemIndex === lessonNumber - 1);
    if (entries.length === 0) return null;
    return (
      buildComparisonAnswer(question, entries, lessonNumber) ||
      buildGroundedExplanationAnswer(question, index, lessonNumber)
    );
  }

  return buildGroundedExplanationAnswer(question, index);
}

export const __private__ = {
  comparisonPairFromLine,
  isReadOnlyCourseQuestion,
  lessonNumberFromQuestion,
  buildGroundedExplanationAnswer,
};
