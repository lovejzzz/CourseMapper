// src/lib/publicScionProvider.js — compact contracts for browser-local Scion.
//
// The historical provider id remains `public` so saved projects continue to
// open, but generation is local: the browser loads the pinned public Gemma 4
// GGUF and the Scion compiler validates and expands its compact output.

import { jsonrepair } from 'jsonrepair';
import { APP_VERSION } from './appVersion.js';
import {
  findScionMissingKeyExplanationSupport,
  findScionMultipleSourceSupportedOptions,
  repairScionMcItem,
} from './scionAnswerKeyAlignment.js';
import { SCION_BROWSER_GEMMA4_GGUF } from './scionBrowserConstants.js';
import { assessScionKeyTermContract, mergeScionKeyTermContractAttempts } from './scionKeyTermContract.js';

const PUBLIC_SCION_TEMPLATE_RESIDUE_RE =
  /\b(?:two lesson concepts?|lesson concept to this concrete case|replace with (?:one complete distinction question|one concrete case question|a plausible subject-specific|a plausible case-specific)|plausible methodological claim or action|plausible case interpretation or action)\b/i;

export const PUBLIC_SCION_PROVIDER_ID = 'public';
export const PUBLIC_SCION_MODEL_ID = 'scion-public';
export const PUBLIC_SCION_MODEL_NAME = `Scion V${APP_VERSION}`;
export const PUBLIC_SCION_BACKING_MODEL = SCION_BROWSER_GEMMA4_GGUF.runtimeArtifact.modelId;
// A one-lesson kernel now carries only the validated knowledge core: facts,
// key terms, a scenario, and two applied questions. The old 1,500-token clamp
// silently overrode the 2,400-token budget requested by the compiler; real
// WebGPU runs repeatedly ended at the same truncated tail and spent 12
// completions recovering 0/2 lessons. Keep the cap below the 4,096-token
// runtime ceiling while giving the compact contract enough room to close once.
export const PUBLIC_SCION_MAX_COMPLETION_TOKENS = 2400;
export const PUBLIC_SCION_MAX_LESSONS_PER_CALL = 3;
export const PUBLIC_SCION_KERNEL_LESSONS_PER_CALL = 1;
export const PUBLIC_SCION_KERNEL_CONCURRENCY = 1;
export const PUBLIC_SCION_MIN_RETRIES = 2;
export const PUBLIC_SCION_ENRICHMENT_RECOVERY_CALLS = 4;

// Each provider call already performs the initial completion plus two
// internal retries. Scale the OUTER lesson-recovery budget to the amount of
// work that can actually be restored instead of spending four more calls on
// one missing lesson (fifteen near-identical completions in the browser).
// Larger courses retain the calibrated four-call ceiling.
export function publicScionEnrichmentRecoveryCallLimit(lessonCount) {
  const lessons = Math.max(1, Math.ceil(Number(lessonCount) || 1));
  return Math.min(PUBLIC_SCION_ENRICHMENT_RECOVERY_CALLS, lessons);
}

export function publicScionRetryDelay(attempt) {
  const retryNumber = Math.max(1, Number(attempt) || 1);
  return Math.min(250 * 2 ** (retryNumber - 1), 2000);
}

export function isPublicScionProvider(provider) {
  return provider === PUBLIC_SCION_PROVIDER_ID;
}

// The shared repair module stays lightweight and does not import the full
// preference gate. Browser preprocessing and canonical admission share one
// repair order. Only explicit answer text/labels or uniquely cited source
// claims may move a key; lexical overlap remains a rejection signal.
function repairPublicScionMcItems(parsed) {
  const repairs = [];
  if (!parsed || !Array.isArray(parsed.lessons)) return { parsed, repairs };
  for (const lesson of parsed.lessons) {
    if (!Array.isArray(lesson?.mc)) continue;
    const sourceClaims = Array.isArray(lesson?.facts) ? lesson.facts : [];
    lesson.mc = lesson.mc.map((item, itemIndex) => {
      const rawSourceFactIndexes = item?.sourceFactIndexes ?? item?.fi;
      const sourceFactIndexes = Array.isArray(rawSourceFactIndexes)
        ? [...new Set(rawSourceFactIndexes)].filter(
            (factIndex) => Number.isInteger(factIndex) && factIndex >= 0 && factIndex < sourceClaims.length,
          )
        : [];
      const citedSourceClaims =
        sourceFactIndexes.length === rawSourceFactIndexes?.length
          ? sourceFactIndexes.map((factIndex) => sourceClaims[factIndex]).filter(Boolean)
          : [];
      const result = repairScionMcItem(item, {
        lessonId: lesson.lessonId,
        itemIndex,
        sourceClaims: citedSourceClaims,
      });
      repairs.push(...result.repairs);
      return result.item;
    });
  }
  return { parsed, repairs };
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
 * Repair syntax and the two conservative MC contract defects before the
 * normal kernel parser decides what may compile. The detailed form exposes
 * repair provenance to the local runtime ledger; the text-only wrapper keeps
 * the historical provider interface stable.
 */
export function repairPublicScionJson(text = '') {
  const raw = String(text || '')
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  if (!raw) return { text: '', repairs: [] };
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
  if (!parsed) return { text: raw, repairs: [] };
  const repaired = repairPublicScionMcItems(liftNestedPublicScionLessonFields(parsed));
  return { text: JSON.stringify(repaired.parsed), repairs: repaired.repairs };
}

export function repairPublicScionJsonText(text = '') {
  return repairPublicScionJson(text).text;
}

export function assessPublicScionKernelResponse(responseText, userPrompt, task) {
  if (task !== 'blueprintEnrichment') return { needsRetry: false, issues: [] };
  const expectedLessons = extractPublicScionKernelLessons(userPrompt).filter((lesson) => lesson?.lessonId);
  if (expectedLessons.length === 0) return { needsRetry: false, issues: [] };
  try {
    const parsed = JSON.parse(repairPublicScionJsonText(responseText));
    const returned = new Map(
      (Array.isArray(parsed?.lessons) ? parsed.lessons : [])
        .filter((lesson) => lesson?.lessonId)
        .map((lesson) => [lesson.lessonId, lesson]),
    );
    const issues = [];
    for (const expected of expectedLessons) {
      const lesson = returned.get(expected.lessonId);
      if (!lesson) {
        issues.push(`${expected.lessonId}:missing-lesson`);
        continue;
      }
      const keyTerms = Array.isArray(lesson.keyTerms) ? lesson.keyTerms : [];
      if (keyTerms.length < 3) issues.push(`${expected.lessonId}:key-terms-count:${keyTerms.length}/3`);
      keyTerms.forEach((term, index) => {
        const result = assessScionKeyTermContract(term, {
          lessonTitle: expected.title || '',
          definitionMin: 40,
          knownFacts: Array.isArray(lesson.facts) ? lesson.facts : [],
          semanticProfile: 'source-strict-v3',
        });
        for (const issue of result.issues) issues.push(`${expected.lessonId}:key-term-${index}:${issue}`);
      });
      const facts = Array.isArray(lesson.facts) ? lesson.facts : [];
      const mcItems = Array.isArray(lesson.mc) ? lesson.mc : [];
      mcItems.forEach((item, index) => {
        if (
          PUBLIC_SCION_TEMPLATE_RESIDUE_RE.test(
            [item?.q ?? item?.question, ...(item?.op ?? item?.options ?? []), item?.ex ?? item?.explanation]
              .filter(Boolean)
              .join(' '),
          )
        ) {
          issues.push(`${expected.lessonId}:mc-${index}:template-residue`);
        }
        const sourceFactIndexes = item?.sourceFactIndexes ?? item?.fi;
        if (
          !Array.isArray(sourceFactIndexes) ||
          sourceFactIndexes.length < 1 ||
          sourceFactIndexes.length > 2 ||
          new Set(sourceFactIndexes).size !== sourceFactIndexes.length ||
          sourceFactIndexes.some(
            (factIndex) => !Number.isInteger(factIndex) || factIndex < 0 || factIndex >= facts.length,
          )
        ) {
          issues.push(`${expected.lessonId}:mc-${index}:source-fact-index`);
        }
        if (findScionMissingKeyExplanationSupport(item)) {
          issues.push(`${expected.lessonId}:mc-${index}:explanation-omits-key-support`);
        }
        if (
          findScionMultipleSourceSupportedOptions(item, {
            sourceClaims: facts,
            allowBroadSourceContext: true,
          })
        ) {
          issues.push(`${expected.lessonId}:mc-${index}:multiple-source-supported-options`);
        }
      });
    }
    return { needsRetry: issues.length > 0, issues };
  } catch {
    return { needsRetry: true, issues: ['invalid-json'] };
  }
}

export function publicScionKernelResponseNeedsRetry(responseText, userPrompt, task) {
  return assessPublicScionKernelResponse(responseText, userPrompt, task).needsRetry;
}

export function mergePublicScionKernelAttempts(previousText, currentText, userPrompt = '') {
  try {
    const previous = JSON.parse(previousText);
    const current = JSON.parse(currentText);
    const previousById = new Map(
      (Array.isArray(previous?.lessons) ? previous.lessons : [])
        .filter((lesson) => lesson?.lessonId)
        .map((lesson) => [lesson.lessonId, lesson]),
    );
    const expectedById = new Map(
      extractPublicScionKernelLessons(userPrompt)
        .filter((lesson) => lesson?.lessonId)
        .map((lesson) => [lesson.lessonId, lesson]),
    );
    const repairs = [];
    for (const lesson of Array.isArray(current?.lessons) ? current.lessons : []) {
      const priorLesson = previousById.get(lesson?.lessonId);
      if (!priorLesson || !Array.isArray(lesson?.keyTerms) || !Array.isArray(priorLesson?.keyTerms)) continue;
      lesson.keyTerms = lesson.keyTerms.map((term, index) => {
        const merged = mergeScionKeyTermContractAttempts(priorLesson.keyTerms[index], term, {
          lessonTitle: expectedById.get(lesson.lessonId)?.title || '',
          definitionMin: 40,
        });
        repairs.push(
          ...merged.repairs.map((repair) => ({
            kind: 'key-term',
            pass: 'crossAttemptContractMerge',
            lessonId: lesson.lessonId,
            item: index,
            ...repair,
            trainingEligible: false,
            preferenceEvidence: { evidenceScope: 'deterministic-contract-only', verified: false },
          })),
        );
        return merged.term;
      });
    }
    return { text: JSON.stringify(current), repairs };
  } catch {
    return { text: currentText, repairs: [] };
  }
}

export function buildPublicScionRetryFeedback(assessment = {}) {
  const issues = Array.isArray(assessment?.issues) ? assessment.issues.slice(0, 12) : [];
  const focusedRules = [
    ...(issues.some((issue) => issue.includes('-repeats-'))
      ? [
          'Every df, eg, mi, and cx field must make a different instructional move; replace repeated or paraphrased fields.',
          'cx must directly refute mi while using different wording from df and eg.',
        ]
      : []),
    ...(issues.some((issue) => issue.includes('embedded-field-label'))
      ? [
          'Return only each field value. Never embed labels such as Definition:, Example:, Misconception:, or Correction:.',
        ]
      : []),
    ...(issues.some((issue) => issue.includes('claim-marker-residue'))
      ? ['Remove internal claim numbers and bracketed claim markers from learner-facing key-term fields.']
      : []),
    ...(issues.some((issue) => issue.includes('misconception-repeats-known-fact'))
      ? ['mi must be a genuinely false learner belief. Never label one of the lesson facts as a misconception.']
      : []),
    ...(issues.some((issue) => issue.includes('circular-definition'))
      ? [
          'A definition must not repeat its tr term within the first six words. Begin df with a broader category phrase such as "A process in which".',
        ]
      : []),
    ...(issues.some((issue) => issue.includes('source-fact-index'))
      ? ['sourceFactIndexes is required and may cite only supplied zero-based claim indexes.']
      : []),
    ...(issues.some((issue) => issue.includes('explanation-omits-key-support'))
      ? ['Every ex must state why the keyed option is correct; eliminating distractors alone is incomplete feedback.']
      : []),
    ...(issues.some((issue) => issue.includes('multiple-source-supported-options'))
      ? ['Rewrite the stem or options so exactly one option is supported by the lesson facts.']
      : []),
    ...(issues.some((issue) => issue.includes('template-residue'))
      ? [
          'Replace every generic or copied template stem and option. Each q must name exact lesson concepts or concrete case evidence.',
        ]
      : []),
  ];
  return [
    'LOCAL ADMISSION RETRY:',
    `The previous response failed: ${issues.join(', ') || 'incomplete-kernel'}.`,
    'Re-author the complete requested JSON; do not return only the repaired field.',
    'Every lesson needs 3 complete keyTerms. Each cx must directly refute mi in different wording and must not repeat df.',
    ...focusedRules,
  ].join('\n');
}

export function publicScionModelOption() {
  return {
    id: PUBLIC_SCION_MODEL_ID,
    name: PUBLIC_SCION_MODEL_NAME,
    created: 1,
    maxInputTokens: 8192,
    maxOutputTokens: PUBLIC_SCION_MAX_COMPLETION_TOKENS,
    source: 'browser-local',
    capabilities: {
      jsonMode: false,
      jsonSchema: false,
      toolCalling: false,
      streaming: true,
      temperature: true,
    },
  };
}

function clip(text, maxChars = 6000) {
  const value = String(text || '').trim();
  if (value.length <= maxChars) return value;
  return `${value.slice(0, Math.floor(maxChars * 0.65))}\n\n[...middle omitted for Scion local context budget...]\n\n${value.slice(
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
        supportingResources: ['Exact named source from SOURCE'],
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
- If SOURCE names a reading, handout, example, recording, dataset, case, or evidence packet, copy its exact name into supportingResources. Never replace a named source with a generic handout.
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
  // Public Scion is a 2B browser model. Course-level voice and the remaining
  // teaching surfaces are compiler work; asking for them here made one
  // lesson response larger than the reliable decode band and repeatedly
  // truncated the irreplaceable facts/terms/assessment atoms at the tail.
  const lessonTemplates = lessons.map((lesson) => ({
    lessonId: lesson.lessonId || 'lesson-1',
    facts: [
      'First specific subject claim of twenty or more characters.',
      'Second distinct subject claim of twenty or more characters.',
      'Third distinct subject claim of twenty or more characters.',
      'Fourth distinct subject claim of twenty or more characters.',
      'Fifth distinct subject claim of twenty or more characters.',
    ],
    mc: [
      {
        q: 'REPLACE with one complete distinction question naming two exact lesson terms.',
        op: [
          'REPLACE with a plausible subject-specific option A.',
          'REPLACE with a plausible subject-specific option B.',
          'REPLACE with a plausible subject-specific option C.',
          'REPLACE with a plausible subject-specific option D.',
        ],
        ai: 0,
        fi: [0],
        ex: 'Why the key wins and the closest distractor fails in subject terms.',
      },
      {
        q: 'REPLACE with one concrete case question naming exact evidence and a decision.',
        op: [
          'REPLACE with a plausible case-specific option A.',
          'REPLACE with a plausible case-specific option B.',
          'REPLACE with a plausible case-specific option C.',
          'REPLACE with a plausible case-specific option D.',
        ],
        ai: 1,
        fi: [1],
        ex: 'Why the key fits the case and the closest distractor does not.',
      },
    ],
    keyTerms: [
      {
        tr: 'first source-anchored term',
        df: 'A precise subject definition with at least forty characters.',
        eg: 'A concrete example grounded in this lesson topic.',
        mi: 'A plausible student misunderstanding about the term.',
        cx: 'A direct correction that explains why that misunderstanding fails.',
      },
      {
        tr: 'second distinct source term',
        df: 'A different precise subject definition with at least forty characters.',
        eg: 'A different concrete example grounded in this lesson topic.',
        mi: 'A different plausible student misunderstanding about the term.',
        cx: 'A different direct correction that refutes that misunderstanding.',
      },
      {
        tr: 'third distinct source term',
        df: 'A third precise subject definition with at least forty characters.',
        eg: 'A third concrete example grounded in this lesson topic.',
        mi: 'A third plausible student misunderstanding about the term.',
        cx: 'A third direct correction that refutes that misunderstanding.',
      },
    ],
    scenario: {
      su: 'A concrete two-sentence subject context with an actionable problem and one real constraint.',
      ma: 'The specific notation, recording, data, records, design, or passage students inspect.',
    },
  }));
  const template = { lessons: lessonTemplates };

  return `COURSE: ${clip(course, 160)}
LESSONS TO AUTHOR:
${JSON.stringify(lessons)}

TASK:
Write the compact knowledge core for every listed lesson. Use the exact lessonId. Use only the listed title, topics, objectives, and readings; do not invent citations, URLs, page numbers, statistics, or named studies. The local compiler will derive discussion, assignment, slides, and study-guide surfaces after validating these atoms.

Rules:
- Return ONLY valid JSON. No Markdown, commentary, or trailing text.
- Return exactly ${lessons.length} lesson object${lessons.length === 1 ? '' : 's'}.
- The lessons array MUST contain these exact ids: ${requiredLessonIds.join(', ')}. Returning {"lessons":[]} or an error object is invalid.
${
  recoveryAttempt > 0
    ? `- RECOVERY ${recoveryAttempt}: a previous response was incomplete. Re-author the full requested lesson now; do not summarize, apologize, or repeat an empty response.\n`
    : ''
}- Write 5 facts per lesson. Each fact is 8-20 words, at least 20 characters, and states subject knowledge rather than course process.
- Write 3 keyTerms per lesson. Each tr is a distinct 1-4 word subject term that reuses specific words from that lesson's title, topics, or objectives AND appears verbatim in at least one of that lesson's facts; never copy the full lesson title. Every df is at least 40 characters and begins with a broader category or distinguishing property, not the tr term; eg is concrete; mi is a genuinely false learner belief and never restates a lesson fact; cx directly refutes mi in different wording and never repeats df or eg. Every field makes a different instructional move. Never embed field labels or internal claim numbers.
- Write one decision-ready scenario. Across su and ma, include a concrete context, an actionable subject problem, at least 2 inspectable details, and a real tension or constraint. su has exactly 2 specific sentences; ma names the evidence packet rather than saying "scenario evidence" or "course materials".
- Write exactly 2 mc items: one concept distinction and one concrete case application.
- Every mc item includes fi=sourceFactIndexes as exactly [n]: one zero-based integer from 0 through 4 pointing to the single fact that directly proves why the keyed option wins. Never write a string, more than one index, or an out-of-range index.
- Options are parallel and plausible; distractors reflect real misconceptions. Every q is 20-45 words; op has exactly 4 options; ai is 0-3; ex explains why the key wins and the closest distractor fails.
- Never infer motive or cause from one ambiguous observation. Include enough context that exactly one option is supported.
- Never write pure vocabulary recall, tool trivia, NOT/EXCEPT questions, always/never options, or all/none of the above.
- Never mention artifacts, evidence moves, success criteria, rubrics, submissions, "the lesson", "this lesson", or "this course".
- Return only lessonId, facts, keyTerms, scenario, and mc inside each lesson object. Do not add courseLevel, discussionPrompt, assignmentCore, studyGuide, or workedExample.
- Preserve the exact nesting and abbreviated keys shown below.

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
  const conversationalTask = task === 'chat' || task === 'agent';
  if (conversationalTask) {
    const role =
      task === 'agent'
        ? "You are Scion, CourseMapper's browser-local course workspace agent."
        : "You are Scion, CourseMapper's browser-local pedagogical assistant.";
    return [
      {
        role: 'system',
        content: [
          'Reasoning: low.',
          role,
          'Answer the user directly in concise Markdown.',
          'Ground the answer in the supplied workspace context. Never invent sources, citations, or completed edits.',
          task === 'agent'
            ? 'You are advisory in this local mode: explain what you recommend, but never claim that you changed the workspace.'
            : '',
          clip(systemPrompt, 5200),
        ]
          .filter(Boolean)
          .join('\n'),
      },
      { role: 'user', content: clip(userPrompt, 4200) },
    ];
  }
  const system = [
    'Reasoning: low.',
    kernelTask
      ? 'You are CourseMapper Scion, a concise university subject-matter and assessment writer running locally.'
      : voiceTask
        ? 'You are CourseMapper Scion, a precise university instructor and prose editor running locally.'
        : 'You are CourseMapper Scion, a compact browser-local course-map planner.',
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
