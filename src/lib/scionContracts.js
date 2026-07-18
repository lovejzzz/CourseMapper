// src/lib/scionContracts.js — the Scion-native compiler profile (V2.1
// Workstream D). Scion is the house model: we know exactly what it
// guarantees (grammar-enforced decoding — whatever contract we declare is
// the only legal output) and exactly where it is weak (long batches, greedy
// determinism on retries). This module is the single place the compiler
// declares those contracts instead of the server reverse-engineering them
// from prompt text.
//
// Contract provenance: the per-lesson kernel shape mirrors the app's own
// prompt contract (buildLessonKernelPrompt + NATIVE_PASS_B_AUTHORING_ADDITION)
// and lint floor (lintKernelFact ≥25ch, lintEnrichedKeyTerm df ≥45ch,
// lintEnrichedQuizItem exactly-4 options). The NO_SPACE_RUNS pattern bans the
// measured greedy degeneration (V2 round 17: space-runs inside string values
// consumed whole token budgets byte-identically).

import { LOCAL_PROVIDER_ID } from './localProvider';

export function isScionProvider(provider) {
  return provider === LOCAL_PROVIDER_ID;
}

export const NO_SPACE_RUNS = '^\\S+( \\S+)*$';
const str = (minLength, maxLength) => ({ type: 'string', minLength, maxLength, pattern: NO_SPACE_RUNS });
const arr = (items, minItems, maxItems) => ({ type: 'array', items, minItems, maxItems });

function lockObjects(node) {
  if (Array.isArray(node)) {
    node.forEach(lockObjects);
    return;
  }
  if (!node || typeof node !== 'object') return;
  if (node.type === 'object' && node.properties && node.additionalProperties === undefined) {
    node.additionalProperties = false;
  }
  for (const value of Object.values(node)) lockObjects(value);
}

// Session-authoring fields (NATIVE_PASS_B_AUTHORING_ADDITION).
function sessionFieldSchemas() {
  return {
    goal: str(8, 120),
    outcomes: arr(str(12, 160), 3, 5),
    async: arr(str(8, 160), 2, 3),
    sync: arr(str(8, 160), 2, 3),
  };
}

// Kernel atom fields (buildLessonKernelPrompt contract, short keys).
const TARGET_LANGUAGE_PAIR_SCHEMA = {
  type: 'object',
  properties: {
    hanzi: str(1, 24),
    pinyin: str(2, 48),
    english: str(2, 80),
  },
  required: ['hanzi', 'pinyin', 'english'],
};

function kernelFieldSchemas({ mcCount = 4, keyTermCount = 4, requiresTargetLanguagePair = false } = {}) {
  return {
    facts: arr(str(25, 140), 5, 8),
    keyTerms: arr(
      {
        type: 'object',
        properties: { tr: str(3, 60), df: str(45, 380), eg: str(12, 300), mi: str(12, 300), cx: str(12, 300) },
        required: ['tr', 'df', 'eg', 'mi', 'cx'],
      },
      Math.max(3, keyTermCount - 1),
      6,
    ),
    scenario: { type: 'object', properties: { su: str(45, 500), ma: str(10, 300) }, required: ['su', 'ma'] },
    discussionPrompt: {
      type: 'object',
      properties: { pr: str(20, 300), tn: str(12, 300), po: arr(str(8, 200), 2, 3) },
      required: ['pr', 'tn', 'po'],
    },
    assignmentCore: {
      type: 'object',
      properties: { td: str(45, 500), pa: arr(str(8, 160), 2, 4) },
      required: ['td', 'pa'],
    },
    mc: arr(
      {
        type: 'object',
        properties: {
          q: str(25, 300),
          op: arr(str(5, 95), 4, 4),
          ai: { type: 'integer', minimum: 0, maximum: 3 },
          fi: arr({ type: 'integer', minimum: 0, maximum: 7 }, 1, 2),
          ex: str(20, 300),
        },
        required: ['q', 'op', 'ai', 'fi', 'ex'],
      },
      mcCount,
      mcCount,
    ),
    studyGuide: { type: 'object', properties: { sm: str(70, 550), rs: str(35, 380) }, required: ['sm', 'rs'] },
    ...(requiresTargetLanguagePair ? { targetLanguagePair: TARGET_LANGUAGE_PAIR_SCHEMA } : {}),
  };
}

export const COURSE_LEVEL_SCHEMA = {
  type: 'object',
  properties: {
    signatureTerms: arr(str(3, 60), 4, 10),
    lens: {
      type: 'object',
      properties: {
        domain: str(3, 80),
        evidenceNoun: str(3, 80),
        decisionNoun: str(3, 80),
        learnerRole: str(3, 80),
        exampleNoun: str(3, 80),
      },
      required: ['domain', 'evidenceNoun', 'decisionNoun', 'learnerRole', 'exampleNoun'],
    },
    styleNotes: arr(str(8, 200), 1, 4),
    discussionProtocol: {
      type: 'object',
      properties: {
        format: str(5, 120),
        participationPattern: str(20, 300),
        artifactUse: str(20, 300),
        reviewFocus: str(10, 300),
      },
      required: ['format', 'participationPattern', 'artifactUse', 'reviewFocus'],
    },
  },
  required: ['signatureTerms', 'lens', 'styleNotes', 'discussionProtocol'],
};

/**
 * The Pass B batch contract as a response_format json_schema profile.
 * CONTENT-SOURCED lessons author session fields only (their kernel content
 * comes from the curriculum library and must not be displaced).
 */
export function kernelBatchSchemaProfile({
  expectedLessonIds = [],
  contentSourcedLessonIds = [],
  includeCourseLevel = false,
  mcCount = 4,
  keyTermCount = 4,
  requiresTargetLanguagePair = false,
} = {}) {
  const contentSourced = new Set(contentSourcedLessonIds);
  const kernelIds = expectedLessonIds.filter((id) => !contentSourced.has(id));
  const sessionIds = expectedLessonIds.filter((id) => contentSourced.has(id));
  const lessonVariants = [];
  if (kernelIds.length > 0) {
    lessonVariants.push({
      type: 'object',
      properties: {
        lessonId: { type: 'string', enum: kernelIds },
        ...sessionFieldSchemas(),
        ...kernelFieldSchemas({ mcCount, keyTermCount, requiresTargetLanguagePair }),
      },
      required: [
        'lessonId',
        'goal',
        'outcomes',
        'async',
        'sync',
        'facts',
        'keyTerms',
        'scenario',
        'discussionPrompt',
        'assignmentCore',
        'mc',
        'studyGuide',
        ...(requiresTargetLanguagePair ? ['targetLanguagePair'] : []),
      ],
    });
  }
  if (sessionIds.length > 0) {
    lessonVariants.push({
      type: 'object',
      properties: { lessonId: { type: 'string', enum: sessionIds }, ...sessionFieldSchemas() },
      required: ['lessonId', 'goal', 'outcomes', 'async', 'sync'],
    });
  }
  const schema = {
    type: 'object',
    properties: {
      lessons: arr(
        lessonVariants.length === 1 ? lessonVariants[0] : { anyOf: lessonVariants },
        expectedLessonIds.length,
        expectedLessonIds.length,
      ),
      ...(includeCourseLevel ? { courseLevel: COURSE_LEVEL_SCHEMA } : {}),
    },
    required: ['lessons', ...(includeCourseLevel ? ['courseLevel'] : [])],
  };
  lockObjects(schema);
  return { name: 'kernel_lesson_batch', schema, strict: true };
}

/**
 * The Pass A skeleton contract — sessions pinned to the requested count
 * (V2 measured a 25-session greedy hallucination on a 7-lesson course when
 * unpinned), assessments REQUIRED with at least one per session (their
 * titles fill compiled template slots course-wide), readings/resources
 * optional per the prompt's own omission rules.
 */
export function skeletonSchemaProfile({ sessionCount }) {
  const count = Math.max(1, Number(sessionCount) || 1);
  const schema = {
    type: 'object',
    properties: {
      course: {
        type: 'object',
        properties: { name: str(3, 120), term: str(2, 24), goals: arr(str(8, 120), 3, 8) },
        required: ['name', 'term', 'goals'],
      },
      sessions: arr(
        {
          type: 'object',
          properties: {
            id: str(2, 6),
            order: { type: 'integer', minimum: 1, maximum: count },
            title: str(5, 60),
            sectionTitles: arr(str(3, 60), 2, 4),
          },
          required: ['id', 'order', 'title', 'sectionTitles'],
        },
        count,
        count,
      ),
      assessments: arr(
        {
          type: 'object',
          properties: {
            id: str(2, 8),
            title: str(5, 120),
            kind: { type: 'string', enum: ['graded-artifact', 'in-class', 'exam', 'oral'] },
            dueSession: { type: 'integer', minimum: 1, maximum: count },
            weightPct: { type: 'integer', minimum: 0, maximum: 100 },
          },
          required: ['id', 'title', 'dueSession'],
        },
        count,
        count * 3,
      ),
      readings: arr(
        {
          type: 'object',
          properties: {
            id: str(2, 8),
            title: str(3, 160),
            dueSession: { type: 'integer', minimum: 1, maximum: count },
          },
          required: ['id', 'title', 'dueSession'],
        },
        0,
        count * 3,
      ),
      resources: arr(
        {
          type: 'object',
          properties: {
            id: str(2, 8),
            title: str(3, 160),
            dueSession: { type: 'integer', minimum: 1, maximum: count },
          },
          required: ['id', 'title', 'dueSession'],
        },
        0,
        count * 3,
      ),
    },
    required: ['course', 'sessions', 'assessments'],
  };
  lockObjects(schema);
  return { name: 'course_skeleton', schema, strict: true };
}

// V2 measured the long-title cascade: syllabus-phrase session titles echo
// into every compiled template slot. Scion gets an explicit concision rule
// (the grammar backstop alone CLIPS mid-word — round 12).
export const SCION_SKELETON_DIRECTIVE =
  '\n\nSCION ADDITION: session titles are concise 2-4 word topic names that keep the discipline nouns (e.g. "Pitch Notation", "Triads and Sevenths") — never the full syllabus phrase. If the source gives an ordered lesson-topic list, map every listed topic exactly once in that order; do not replace later topics with repeated review or capstone sessions unless the source itself repeats them.';

// D3 pass gating: on by default for Scion; explicit opt-out only.
export function scionPassesEnabled() {
  try {
    return localStorage.getItem('coursemapper-scion-passes') !== 'off';
  } catch {
    return true;
  }
}

// D4 flywheel gating: on by default (local-only, nothing leaves the machine).
export function scionFlywheelEnabled() {
  try {
    return localStorage.getItem('coursemapper-scion-flywheel') !== 'off';
  } catch {
    return true;
  }
}
