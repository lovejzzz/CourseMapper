// src/lib/publicScionProvider.js — experimental keyless Scion route.
//
// This is not the local grammar-constrained Scion server. It exposes the
// CourseMapper/Scion compiler path through Pollinations' anonymous legacy text
// endpoint, which is public, CORS-enabled, and aggressively rate-limited.

import { jsonrepair } from 'jsonrepair';
import { APP_VERSION } from './appVersion.js';

export const PUBLIC_SCION_PROVIDER_ID = 'public';
export const PUBLIC_SCION_MODEL_ID = 'scion-public';
export const PUBLIC_SCION_MODEL_NAME = `Scion V${APP_VERSION}`;
// Pollinations accepts this legacy request alias but may route it to a
// different anonymous backing model. UI/docs must not present it as a fixed
// foundation-model identity.
export const PUBLIC_SCION_BACKING_MODEL = 'openai-fast';
export const PUBLIC_SCION_TEXT_ENDPOINT = 'https://text.pollinations.ai/';
export const PUBLIC_SCION_CHAT_ENDPOINT = 'https://text.pollinations.ai/openai';
export const PUBLIC_SCION_MODELS_ENDPOINT = 'https://text.pollinations.ai/models';
export const PUBLIC_SCION_MAX_COMPLETION_TOKENS = 1500;
export const PUBLIC_SCION_MAX_LESSONS_PER_CALL = 3;
export const PUBLIC_SCION_KERNEL_LESSONS_PER_CALL = 1;
export const PUBLIC_SCION_KERNEL_CONCURRENCY = 1;
export const PUBLIC_SCION_MIN_RETRIES = 4;
export const PUBLIC_SCION_ENRICHMENT_RECOVERY_CALLS = 4;

export function publicScionRetryDelay(attempt) {
  const retryNumber = Math.max(1, Number(attempt) || 1);
  return Math.min(2500 * 2 ** (retryNumber - 1), 10000);
}

export function isPublicScionProvider(provider) {
  return provider === PUBLIC_SCION_PROVIDER_ID;
}

// Keep this lightweight copy local to the public provider. Importing the full
// Scion preference gate here would promote local-only quality passes and their
// item-lint dependencies into the first landing-page download.
const PUBLIC_ALIGNMENT_STOP_WORDS = new Set([
  'and',
  'are',
  'because',
  'for',
  'from',
  'that',
  'the',
  'this',
  'with',
  'while',
]);

function publicAlignmentTokens(value) {
  return new Set(
    String(value || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .split(/\s+/)
      .map((token) => {
        if (/^(?:ask|asks|asked|asking|question|questions)$/.test(token)) return 'question';
        return token.length > 4 && token.endsWith('s') && !token.endsWith('ss') ? token.slice(0, -1) : token;
      })
      .filter((token) => token.length >= 3 && !PUBLIC_ALIGNMENT_STOP_WORDS.has(token)),
  );
}

function findPublicScionExplanationKeyConflict(item) {
  const options = Array.isArray(item?.op) ? item.op : Array.isArray(item?.options) ? item.options : [];
  const explanation = String(item?.ex ?? item?.explanation ?? '').trim();
  const currentIndex = Number(item?.ai ?? item?.answerIndex);
  if (options.length !== 4 || !explanation || !Number.isInteger(currentIndex)) return null;
  const affirmativeLead = explanation.split(/\b(?:by contrast|in contrast|whereas|while|rather than|unlike)\b/i)[0];
  const explanationTokens = publicAlignmentTokens(affirmativeLead);
  const scores = options.map((option) => {
    const optionTokens = publicAlignmentTokens(option);
    return [...optionTokens].filter((token) => explanationTokens.has(token)).length;
  });
  const bestScore = Math.max(...scores);
  const bestIndices = scores.map((score, index) => (score === bestScore ? index : -1)).filter((index) => index >= 0);
  const currentScore = scores[currentIndex] || 0;
  if (bestScore >= 2 && bestIndices.length === 1 && bestIndices[0] !== currentIndex && bestScore >= currentScore + 1) {
    return { supportedIndex: bestIndices[0] };
  }
  return null;
}

function alignPublicScionAnswerIndices(parsed) {
  if (!parsed || !Array.isArray(parsed.lessons)) return parsed;
  for (const lesson of parsed.lessons) {
    if (!Array.isArray(lesson?.mc)) continue;
    for (const item of lesson.mc) {
      const conflict = findPublicScionExplanationKeyConflict(item);
      if (conflict) {
        if ('ai' in item) item.ai = conflict.supportedIndex;
        if ('answerIndex' in item) item.answerIndex = conflict.supportedIndex;
        if (!('ai' in item) && !('answerIndex' in item)) item.ai = conflict.supportedIndex;
      }
    }
  }
  return parsed;
}

const PUBLIC_SCION_LESSON_FIELDS = [
  'facts',
  'keyTerms',
  'scenario',
  'discussionPrompt',
  'assignmentCore',
  'mc',
  'studyGuide',
];

function findNestedLessonField(value, field, depth = 0) {
  if (!value || typeof value !== 'object' || depth > 5) return undefined;
  for (const child of Object.values(value)) {
    if (!child || typeof child !== 'object') continue;
    if (!Array.isArray(child) && Object.prototype.hasOwnProperty.call(child, field)) return child[field];
    const nested = findNestedLessonField(child, field, depth + 1);
    if (nested !== undefined) return nested;
  }
  return undefined;
}

function liftNestedPublicScionLessonFields(parsed) {
  if (!parsed || !Array.isArray(parsed.lessons)) return parsed;
  for (const lesson of parsed.lessons) {
    if (!lesson || typeof lesson !== 'object') continue;
    for (const field of PUBLIC_SCION_LESSON_FIELDS) {
      if (lesson[field] !== undefined) continue;
      const nested = findNestedLessonField(lesson, field);
      if (nested !== undefined) lesson[field] = nested;
    }
  }
  return parsed;
}

/**
 * Repair syntax only; the normal kernel parser and per-atom quality lints
 * still decide what content may compile. Valid JSON passes through byte for
 * byte, while complete-but-malformed anonymous responses get one local repair.
 */
export function repairPublicScionJsonText(text = '') {
  const raw = String(text || '')
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  if (!raw) return '';
  let parsed = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const prepared = raw
      // Anonymous responses sometimes close an option array with ]" before
      // continuing to ai/ex. The extra quote makes the otherwise complete
      // lesson impossible for jsonrepair to disambiguate on its own.
      .replace(/\]"\s*,\s*"(ai|answerIndex|ex|explanation)"\s*:/g, '],"$1":')
      // The same malformed family may close an MC object with ] before the
      // next item or the study-guide sibling. These replacements are limited
      // to the known kernel keys so valid strings containing brackets remain
      // untouched.
      .replace(/"\]\}\s*,\s*\{"q"/g, '"},{"q"')
      .replace(/"\]\s*,\s*\{"q"/g, '"},{"q"')
      .replace(/"\]\]\s*,\s*"studyGuide"\s*:/g, '"}],"studyGuide":')
      .replace(/\]\s*\]\s*,\s*"studyGuide"\s*:/g, '}],"studyGuide":');
    const candidates = [prepared];
    if (/[^"]\}\}\]\}$/.test(prepared)) {
      candidates.push(prepared.replace(/(\}\}\]\})$/, '"$1'));
    }
    for (const candidate of candidates) {
      try {
        parsed = JSON.parse(jsonrepair(candidate));
        break;
      } catch {
        // Try the next narrow completion candidate before preserving raw.
      }
    }
  }
  if (!parsed) return raw;
  return JSON.stringify(alignPublicScionAnswerIndices(liftNestedPublicScionLessonFields(parsed)));
}

export function publicScionKernelResponseNeedsRetry(responseText, userPrompt, task) {
  if (task !== 'blueprintEnrichment') return false;
  const expectedIds = extractPublicScionKernelLessons(userPrompt)
    .map((lesson) => lesson?.lessonId)
    .filter(Boolean);
  if (expectedIds.length === 0) return false;
  try {
    const parsed = JSON.parse(repairPublicScionJsonText(responseText));
    const returnedIds = new Set(
      (Array.isArray(parsed?.lessons) ? parsed.lessons : []).map((lesson) => lesson?.lessonId).filter(Boolean),
    );
    return expectedIds.some((lessonId) => !returnedIds.has(lessonId));
  } catch {
    return true;
  }
}

export function publicScionModelOption() {
  return {
    id: PUBLIC_SCION_MODEL_ID,
    name: PUBLIC_SCION_MODEL_NAME,
    created: 1,
    maxInputTokens: 32000,
    maxOutputTokens: PUBLIC_SCION_MAX_COMPLETION_TOKENS,
    source: 'public-anonymous',
    capabilities: {
      jsonMode: false,
      jsonSchema: false,
      toolCalling: false,
      streaming: false,
      temperature: true,
    },
  };
}

function clip(text, maxChars = 6000) {
  const value = String(text || '').trim();
  if (value.length <= maxChars) return value;
  return `${value.slice(0, Math.floor(maxChars * 0.65))}\n\n[...middle omitted for Scion Public budget...]\n\n${value.slice(
    -Math.floor(maxChars * 0.35),
  )}`;
}

export function extractPublicScionSource(userPrompt = '') {
  const text = String(userPrompt || '');
  const sourceMatch = text.match(
    /(?:SYLLABUS CONTENT|UPLOADED MATERIALS|SYLLABUS CONTENT \(for reference[^)]*\)):\n([\s\S]*?)(?:\n\nGenerate (?:the complete Course Map JSON|lessons)|$)/i,
  );
  return clip(sourceMatch?.[1] || text, 6000);
}

export function extractPublicScionLessonWindow(userPrompt = '') {
  const text = String(userPrompt || '');
  const continuation = text.match(/Lesson\s+(\d+)\s+through\s+Lesson\s+(\d+)/i);
  if (continuation) {
    const start = Math.max(1, Number(continuation[1]) || 1);
    const end = Math.max(start, Number(continuation[2]) || start);
    const count = Math.max(1, Math.min(PUBLIC_SCION_MAX_LESSONS_PER_CALL, end - start + 1));
    return { start, count, continuation: true };
  }
  const exact =
    text.match(/EXACTLY\s+(\d+)\s+lesson/i) ||
    text.match(/approximately\s+(\d+)\s+lessons/i) ||
    text.match(/\b(\d+)\s*[- ]lesson\b/i);
  const requested = exact ? Math.max(1, Number(exact[1]) || PUBLIC_SCION_MAX_LESSONS_PER_CALL) : null;
  return {
    start: 1,
    count: Math.max(1, Math.min(PUBLIC_SCION_MAX_LESSONS_PER_CALL, requested || PUBLIC_SCION_MAX_LESSONS_PER_CALL)),
    continuation: false,
  };
}

export function extractPublicScionTotalLessonCount(userPrompt = '') {
  const text = String(userPrompt || '');
  const match =
    text.match(/has\s+(\d+)\s+lessons(?:\/weeks)?\s+total/i) ||
    text.match(/EXACTLY\s+(\d+)\s+lesson/i) ||
    text.match(/approximately\s+(\d+)\s+lessons/i);
  const total = Number(match?.[1]);
  return Number.isInteger(total) && total > 0 ? total : null;
}

export function extractPublicScionPriorLessonTitles(userPrompt = '') {
  const text = String(userPrompt || '');
  const block = text.match(
    /Here are the lessons already generated:\s*\n([\s\S]*?)(?:\n\s*Continue generating the REMAINING lessons|$)/i,
  );
  if (!block?.[1]) return [];
  return block[1]
    .split('\n')
    .map((line) => line.replace(/^\s*\d+\.\s*/, '').trim())
    .filter(Boolean)
    .slice(0, 24);
}

function buildCompactPublicScionPrompt(userPrompt) {
  const source = extractPublicScionSource(userPrompt);
  const { start, count, continuation } = extractPublicScionLessonWindow(userPrompt);
  const totalLessonCount = extractPublicScionTotalLessonCount(userPrompt);
  const isFinalWindow = continuation && totalLessonCount && start + count - 1 >= totalLessonCount;
  const priorLessonTitles = continuation ? extractPublicScionPriorLessonTitles(userPrompt) : [];
  const lessonsLabel = count === 1 ? `Lesson ${start}` : `Lesson ${start} through Lesson ${start + count - 1}`;
  const wrapper = continuation
    ? 'Return this JSON shape: {"lessons":[...new lesson objects only...]}.'
    : 'Return this JSON shape: {"courseName":"...","semester":"TBD","lessons":[...]}.';
  const sectionTemplate = (lessonNumber) => ({
    title: `Lesson ${lessonNumber}: Topic`,
    sections: [
      {
        learningGoals: ['Understand source concept'],
        topicSection: `${lessonNumber}.1: Focus`,
        learningObjectives: ['Analyze source pattern', 'Create applied response'],
        weeklyAssessments: ['Quiz: analyze source pattern', 'Task: create applied response'],
        asyncActivities: ['Practice: analyze source pattern', 'Draft: applied response'],
        syncActivities: ['Workshop: analyze source pattern', 'Peer review: applied response'],
        supportingResources: ['Handout: topic guide'],
      },
    ],
  });
  const lessonTemplates = Array.from({ length: count }, (_, index) => sectionTemplate(start + index));
  const template = continuation
    ? { lessons: lessonTemplates }
    : { courseName: 'Course name', semester: 'TBD', lessons: lessonTemplates };
  return `SOURCE:
${source}

${priorLessonTitles.length > 0 ? `PRIOR LESSONS (do not repeat):\n${priorLessonTitles.map((title) => `- ${title}`).join('\n')}\n` : ''}
${isFinalWindow ? `FINAL WINDOW: Lessons ${start}-${start + count - 1} of ${totalLessonCount}. Work backward from the end of SOURCE so Lesson ${totalLessonCount} names the final source outline item.\n` : ''}

TASK:
Create ${count} compact CourseMapper lesson${count === 1 ? '' : 's'} for ${lessonsLabel}. ${wrapper}

Rules:
- Return ONLY valid JSON. No Markdown, comments, prose, or trailing text.
- Exactly ${count} lesson object${count === 1 ? '' : 's'}; each lesson MUST have "title" and "sections".
- Each "sections" value MUST be an array with exactly 1 section object.
- Never put section keys directly on a lesson object.
- Keep every string under 9 words.
- Arrays have 1-2 items only.
- Use 2 learningObjectives, 2 weeklyAssessments, 2 asyncActivities, and 2 syncActivities.
- Reuse each objective's main topic words in one assessment and one activity.
- Use lesson titles like "Lesson ${start}: Topic".
- Lesson titles use normal spaced words; never use abbreviations, camelCase, or glued words.
- Use topicSection like "${start}.1: Topic".
- Include exactly these section keys: learningGoals, topicSection, learningObjectives, weeklyAssessments, asyncActivities, syncActivities, supportingResources.
- learningGoals, learningObjectives, weeklyAssessments, asyncActivities, syncActivities, and supportingResources are arrays of compact atoms.
- learningObjectives start with Bloom verbs and never include "Students will be able to".
- Make every topic, assessment, and activity specific to the source.
- Every new lesson must introduce a distinct topic not used in PRIOR LESSONS.
- Advance through later source concepts; never recycle an earlier topic as a new lesson title.
- Treat concepts joined by "and" inside one source outline item as one combined lesson and name both concepts in its title.
- In continuation windows, prioritize the later unused SOURCE items.
${isFinalWindow ? `- This is the FINAL WINDOW: Lesson ${totalLessonCount} MUST name the final source outline item; never place an earlier concept after it.\n` : ''}- Omit readings and specialTools unless the source names them.
- Preserve the template nesting: lessons[] contains only objects, never strings.

TEMPLATE TO FILL:
${JSON.stringify(template)}`;
}

export function extractPublicScionKernelLessons(userPrompt = '') {
  const text = String(userPrompt || '');
  const lessonsMarker = 'Lessons:\n';
  const start = text.indexOf(lessonsMarker);
  if (start < 0) return [];

  const tail = text.slice(start + lessonsMarker.length);
  const boundaryMarkers = [
    '\nAlso include the courseLevel',
    '\nRomanization recovery',
    '\nRecovery attempt',
    '\nReturn ONLY valid JSON',
  ];
  const boundaries = boundaryMarkers.map((marker) => tail.indexOf(marker)).filter((index) => index >= 0);
  const jsonText = tail.slice(0, boundaries.length > 0 ? Math.min(...boundaries) : tail.length).trim();
  try {
    const parsed = JSON.parse(jsonText);
    return Array.isArray(parsed) ? parsed.filter((lesson) => lesson && typeof lesson === 'object').slice(0, 4) : [];
  } catch {
    return [];
  }
}

function buildPublicScionKernelPrompt(userPrompt) {
  const text = String(userPrompt || '');
  const lessons = extractPublicScionKernelLessons(text).slice(0, PUBLIC_SCION_KERNEL_LESSONS_PER_CALL);
  const course = text.match(/^Course:\s*(.+)$/im)?.[1]?.trim() || 'Untitled Course';
  const recoveryAttempt = Math.max(0, Number(text.match(/Recovery attempt\s+(\d+)/i)?.[1]) || 0);
  const requiredLessonIds = lessons.map((lesson) => lesson.lessonId || 'lesson-1');
  const includeCourseLevel = /Also include the courseLevel object once/i.test(text);
  const lessonTemplates = lessons.map((lesson) => ({
    lessonId: lesson.lessonId || 'lesson-1',
    facts: ['A specific subject claim of twenty or more characters.'],
    keyTerms: [
      {
        tr: 'disciplinary term',
        df: 'A precise subject definition with at least forty characters.',
        eg: 'A concrete example grounded in this lesson topic.',
        mi: 'A plausible student misunderstanding about the term.',
        cx: 'A direct correction that explains why that misunderstanding fails.',
      },
    ],
    scenario: {
      su: 'A concrete two-sentence context with an actionable decision or problem and a real tension or constraint.',
      ma: 'The specific records, observations, data, design, or passage students inspect to make the decision.',
    },
    discussionPrompt: {
      pr: 'A genuinely debatable question grounded in the subject?',
      tn: 'Why informed people can reasonably disagree.',
      po: [
        'One defensible position with a reason.',
        'A contrasting defensible position with a reason.',
        'A conditional or synthesis position with a reason.',
      ],
    },
    assignmentCore: {
      td: 'Two concrete sentences naming the case or material students analyze and the response they produce.',
      pa: [
        'A measurable scope constraint.',
        'A specific submission format.',
        'The evidence or source students must use.',
        'A realistic length or time boundary.',
      ],
    },
    mc: [
      {
        q: 'A concrete 25-50 word subject case asking which interpretation, diagnosis, or next action is best?',
        op: [
          'Plausible methodological claim or action A',
          'Plausible methodological claim or action B',
          'Plausible methodological claim or action C',
          'Plausible methodological claim or action D',
        ],
        ai: 0,
        ex: 'Why the key wins and the closest distractor fails in subject terms.',
      },
    ],
    studyGuide: {
      sm: 'A concise subject summary of at least sixty characters that connects the lesson concepts.',
      rs: 'A concrete retrieval or comparison strategy students can use to review.',
    },
  }));
  const template = {
    lessons: lessonTemplates,
    ...(includeCourseLevel
      ? {
          courseLevel: {
            signatureTerms: ['4-8 recurring disciplinary terms'],
            lens: {
              domain: 'course domain',
              evidenceNoun: 'specific evidence noun',
              decisionNoun: 'specific decision noun',
              learnerRole: 'student role',
              exampleNoun: 'specific example noun',
            },
            styleNotes: ['One short discipline-specific writing rule'],
            discussionProtocol: {
              format: 'A short named critique or discussion format',
              participationPattern: 'inspect, interpret, challenge, revise',
              artifactUse: 'What students examine or produce during the exchange.',
              reviewFocus: 'Three discipline-specific qualities the instructor listens for.',
            },
          },
        }
      : {}),
  };

  return `COURSE: ${clip(course, 160)}
LESSONS TO AUTHOR:
${JSON.stringify(lessons)}

TASK:
Write one compact university-level knowledge kernel for every listed lesson. Use the exact lessonId. Use only the listed title, topics, objectives, and readings; do not invent citations, URLs, page numbers, statistics, or named studies.

Rules:
- Return ONLY valid JSON. No Markdown, commentary, or trailing text.
- Return exactly ${lessons.length} lesson object${lessons.length === 1 ? '' : 's'}.
- The lessons array MUST contain these exact ids: ${requiredLessonIds.join(', ')}. Returning {"lessons":[]} or an error object is invalid.
${
  recoveryAttempt > 0
    ? `- RECOVERY ${recoveryAttempt}: a previous response was incomplete. Re-author the full requested lesson now; do not summarize, apologize, or repeat an empty response.\n`
    : ''
}- Write 5 facts per lesson. Each fact is 8-20 words, at least 20 characters, and states subject knowledge rather than course process.
- Write 3 keyTerms per lesson. Every df is at least 40 characters; eg is concrete; mi is a plausible misconception; cx directly corrects mi.
- Write one decision-ready scenario. Across su and ma, include a concrete context, an actionable decision or problem, at least 2 inspectable observations/results/records/artifacts, and a real tension or constraint. su has exactly 2 specific sentences; ma names the evidence packet rather than saying "scenario evidence" or "course materials". Evidence may live in ma instead of being repeated in su.
- Keep each scenario focused on one construct or decision target. Do not mix accessibility, usability, preference, learning, or performance evidence unless the task explicitly asks students to compare those constructs.
- Write one genuinely debatable discussionPrompt: pr is at least 25 characters and ends with ?, tn names the tension, and po has exactly 3 defensible positions — a main position, a contrast, and a conditional or synthesis position. The third position must add real reasoning, not split the difference mechanically.
- Write one assignmentCore: td is at least 60 characters and names the actual case, data, design, or text plus what students produce; pa has exactly 4 distinct parameters covering scope, submission format, required evidence/source, and a realistic length or time boundary.
- Write exactly 4 mc items: one concept distinction, one concrete case application, one field-note evidence analysis, and one flawed-method evaluation.
- At least 3 mc stems include specific observed behavior or evidence. Options are parallel, plausible methodological claims or actions; distractors reflect real misconceptions. Every q is 25-50 words; op has exactly 4 options; ai is 0-3; ex explains why the key wins and the closest distractor fails.
- Never infer motive from one ambiguous behavior. Pair behavior with context, a quote, a second observation, or an outcome so exactly one option is supported.
- Forbidden after one behavior: "what does this suggest/indicate", "which interpretation", or "what likely explains". Instead ask which neutral follow-up or evidence-collection action comes next, or key an option saying the observation alone is insufficient.
- Never ask students to guess a cause from outcome rates alone; include a study-setup detail that rules out competing explanations. Keep every option at the same decision stage (all diagnosis methods or all design changes, never a mix).
- Never write pure vocabulary recall, tool trivia, NOT/EXCEPT questions, always/never options, or all/none of the above.
- Write studyGuide.sm as a 60-300 character subject summary and studyGuide.rs as a 30-200 character concrete review strategy.
- Never mention artifacts, evidence moves, success criteria, rubrics, submissions, "the lesson", "this lesson", or "this course".
${
  includeCourseLevel
    ? '- Also return one compact courseLevel object with source-grounded signatureTerms, lens, styleNotes, and a complete discussionProtocol.\n'
    : ''
}- Preserve the exact nesting and abbreviated keys shown below.

TEMPLATE TO FILL:
${JSON.stringify(template)}`;
}

export function extractPublicScionVoiceSurfaces(userPrompt = '') {
  const text = String(userPrompt || '');
  const marker = 'Surfaces (JSON):\n';
  const start = text.indexOf(marker);
  if (start < 0) return [];
  const tail = text.slice(start + marker.length);
  const end = tail.indexOf('\n\nRespond with JSON only');
  const jsonText = tail.slice(0, end >= 0 ? end : tail.length).trim();
  try {
    const parsed = JSON.parse(jsonText);
    return Array.isArray(parsed) ? parsed.filter((surface) => surface && typeof surface === 'object').slice(0, 8) : [];
  } catch {
    return [];
  }
}

function buildPublicScionVoicePrompt(userPrompt) {
  const surfaces = extractPublicScionVoiceSurfaces(userPrompt);
  return `SURFACES:
${JSON.stringify(surfaces)}

TASK:
Rewrite each surface as concise instructor prose. Return one rewrite for every surfaceId.

Rules:
- Return ONLY valid JSON shaped as {"rewrites":[{"surfaceId":"...","text":"..."}]}.
- Keep every rewrite between 25 and 70 words. Use sentence-case prose with no headings or bullets.
- Follow each surface's register directive while varying sentence openings; no two rewrites may begin with the same three words.
- Ground every detail in that surface's text or grounding. Never invent names, facts, numbers, citations, readings, or registry ids.
- A sentence containing "Anchor your post in" is frozen: copy that entire sentence verbatim.
- Refer to assessments and readings naturally. Do not rename them.
- Prefer concrete kernel terms and examples over generic course language.`;
}

export function buildPublicScionMessages(systemPrompt, userPrompt, { schema = null, task = 'generation' } = {}) {
  const kernelTask = task === 'blueprintEnrichment';
  const voiceTask = task === 'voicePass';
  const system = [
    'Reasoning: low.',
    kernelTask
      ? 'You are CourseMapper Scion Public, a concise university subject-matter and assessment writer.'
      : voiceTask
        ? 'You are CourseMapper Scion Public, a precise university instructor and prose editor.'
        : 'You are CourseMapper Scion Public, a compact course-map planner for anonymous public inference.',
    'Return the final JSON immediately. Do not deliberate in visible output.',
    kernelTask
      ? 'Write accurate lesson substance; the application validates each atom before compiling it into materials.'
      : voiceTask
        ? 'Rewrite only the supplied prose; the application rejects ungrounded or repetitive changes.'
        : 'Use compact lean atoms; the application expands them into instructor-facing prose.',
    'Return only valid JSON with no Markdown fences, prose preamble, or trailing commentary.',
    schema
      ? 'The app will validate the returned object against its requested shape, so preserve required keys and arrays.'
      : '',
    systemPrompt
      ? 'Ignore any earlier request for verbose course-map prose; the compact public contract below controls output size.'
      : '',
  ]
    .filter(Boolean)
    .join('\n');
  return [
    { role: 'system', content: system },
    {
      role: 'user',
      content: kernelTask
        ? buildPublicScionKernelPrompt(userPrompt)
        : voiceTask
          ? buildPublicScionVoicePrompt(userPrompt)
          : buildCompactPublicScionPrompt(userPrompt),
    },
  ];
}
