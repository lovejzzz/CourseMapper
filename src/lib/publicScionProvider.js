// src/lib/publicScionProvider.js — experimental keyless Scion route.
//
// This is not the local grammar-constrained Scion server. It exposes the
// CourseMapper/Scion compiler path through Pollinations' anonymous legacy text
// endpoint, which is public, CORS-enabled, and aggressively rate-limited.

export const PUBLIC_SCION_PROVIDER_ID = 'public';
export const PUBLIC_SCION_MODEL_ID = 'scion-public';
export const PUBLIC_SCION_MODEL_NAME = 'Scion Draft';
export const PUBLIC_SCION_BACKING_MODEL = 'openai-fast';
export const PUBLIC_SCION_TEXT_ENDPOINT = 'https://text.pollinations.ai/';
export const PUBLIC_SCION_CHAT_ENDPOINT = 'https://text.pollinations.ai/openai';
export const PUBLIC_SCION_MODELS_ENDPOINT = 'https://text.pollinations.ai/models';
export const PUBLIC_SCION_MAX_COMPLETION_TOKENS = 1500;
export const PUBLIC_SCION_MAX_LESSONS_PER_CALL = 3;

export function isPublicScionProvider(provider) {
  return provider === PUBLIC_SCION_PROVIDER_ID;
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

export function buildPublicScionMessages(systemPrompt, userPrompt, { schema = null } = {}) {
  const system = [
    'Reasoning: low.',
    'You are CourseMapper Scion Public, a compact course-map planner for anonymous public inference.',
    'Return the final JSON immediately. Do not deliberate in visible output.',
    'Use compact lean atoms; the application expands them into instructor-facing prose.',
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
    { role: 'user', content: buildCompactPublicScionPrompt(userPrompt) },
  ];
}
