import { segmentSyllabus } from './syllabusSegmentation.js';
import { extractExplicitCoverageTopics } from './explicitLessonSequence.js';

// One LOW-reasoning call: syllabus -> typed skeleton emitted as entity JSON
// with ids, not spreadsheet prose. The skeleton carries structure only.
export const NATIVE_SKELETON_SYSTEM_PROMPT = `You are an expert instructional designer extracting the structure of a course from its syllabus or source materials. TRANSCRIBE an explicit schedule faithfully. When a compact course brief gives a lesson count and named coverage areas but no schedule, DESIGN the missing progression conservatively within those named areas; this is the only case where you infer disciplinary subtopics.

Return ONLY one valid JSON object, no markdown and no commentary, in exactly this shape:
{
  "course": { "name": "Official course title", "term": "FA26 or TBD", "goals": ["short course-level goal phrases"] },
  "sessions": [
    { "id": "s1", "order": 1, "title": "Lesson title as the source presents it", "sectionTitles": ["2-4 short subject-matter topic titles for this session"] }
  ],
  "assessments": [
    { "id": "a1", "title": "Assessment title VERBATIM as named in the source", "kind": "graded-artifact|in-class|exam|oral", "dueSession": 3, "weightPct": 20 }
  ],
  "readings": [
    { "id": "r1", "title": "Reading/work title VERBATIM as named in the source", "dueSession": 8 }
  ],
  "resources": [
    { "id": "m1", "title": "Supporting material/resource title VERBATIM as named in the source", "dueSession": 5 }
  ]
}

RULES:
1. Sessions: one entry per week/lesson/session, ids "s1", "s2", ... in order. Cover the WHOLE course.
1A. ASSESSMENTS ARE NOT FILLER SESSIONS: a problem set, quiz, midterm, exam, final, project, or other graded artifact belongs in "assessments" and MUST NOT become a session title merely to reach the requested session count. Create an assessment-only session only when the source explicitly schedules that assessment as a class meeting. Never place a final exam before later instruction and never create both a "Final Exam" session and a duplicate "Final Assessment" session from one named final.
1B. COURSE-BRIEF EXPANSION: when the source is a compact course brief rather than a week-by-week schedule, expand its named subject areas, applications, and labs into a coherent subject-matter progression for the requested number of sessions. Every session needs a UNIQUE, concrete, teachable subject title. Deepen broad areas into their mechanisms, methods, interpretation, limitations, or applications. Keep grading instruments in "assessments". Do not use resource labels such as "Problem Sets" or "Model-organism lab" as generic filler; a lab session must name the disciplinary investigation or technique students practice. Never use "synthesis", "comprehensive", "review", "midterm", "exam", "final", or "evaluation" as a compact-brief session title.
2. HARD TRACEABILITY: assessment, reading, and resource titles must be VERBATIM from the source — never invent, never normalize, never shorten a title. Omit "readings" entries (or the array) entirely when the source names no specific works. kind and weightPct only when the source supports them; omit otherwise.
3. dueSession is the 1-based session number the item belongs to. When the source gives no week, attach it to the most plausible session from context.
4. RECURRING ASSESSMENTS: when the SOURCE MATERIALS explicitly state a recurring assessment cadence, expand it into one assessments[] entry PER SESSION it applies to. Preserve that source-named cadence noun exactly and append only the matching source-named session topic. When the source states TWO OR MORE cadences, return a separate assessment object for each cadence in each applicable session — NEVER glue multiple artifacts into one title and NEVER put an embedded "2." list item inside a title. Never copy an assessment genre or cadence from these instructions into the JSON; if its identity noun does not appear in the SOURCE MATERIALS, omit it. Expanding a stated cadence is transcription of the assessment PLAN, not invention; one-off named titles stay verbatim under rule 2. The full assessments[] array must cover the source-supported plan: if it has fewer entries than sessions, re-read the source for a stated cadence, but do not invent one to fill the array.
5. SUPPORTING RESOURCES: "resources" carries the per-session supporting materials the source names (handouts, worksheets, lab sheets, kits, datasets, starter code, slides, study guides) — assigned works/readings stay in "readings", never duplicated here. One-off named materials stay verbatim under rule 2. When the source states a recurring materials cadence ("weekly lab handouts", "weekly labs using hand-specimen kits"), expand it into one resources[] entry PER SESSION it applies to — title each "<cadence material>: <that session's topic>" (e.g. "Lab handout: mineral identification") — the same discipline as rule 4: expanding a stated cadence is transcription of the materials PLAN, not invention. Omit "resources" entries (or the array) entirely when the source names no supporting materials.
6. sectionTitles are the session's CONCEPTUAL SPINE, not navigation labels. Each title must give the learner a different intellectual job: a concrete object or case, a mechanism/form, an interpretation or consequential tension, or an application/limitation. Never use delivery modes or schedule labels such as "lecture", "lab", "laboratory", "workshop", "discussion", "seminar", or "recitation" as section titles by themselves; if the source gives only the session topic plus a lecture/lab format, omit sectionTitles or repeat the session topic. For a compact brief, give each session 2-4 specific subtopics and do not merely repeat the session title.
6A. BAN EMPTY TOPIC LABELS: do not write "Themes in X", "Concepts of X", "Introduction to X", "Overview of X", "X exploration", "X possibilities", or a bare "methods", "applications", "implications", or "analysis" title. Replace the label with the actual disciplinary relationship students study. For a named literary work, use the work itself once, then name distinct formal devices, interpretive tensions, or comparative lenses grounded in the source—never invented quotations, page numbers, or scenes.
7. Keep it compact: short strings, no prose sentences, no explanations.`;

/**
 * Pass A user prompt. MUST contain the word "JSON" (the v0.13.1 json_object
 * rule: OpenAI's json_object response format requires it in an INPUT message;
 * the system prompt maps to `instructions`, which the guard does not scan).
 */
export function buildNativeSkeletonUserPrompt(syllabusText, { expectedLessons = null, confidence = null } = {}) {
  const countLine =
    expectedLessons && confidence === 'high'
      ? `The course has exactly ${expectedLessons} sessions — return exactly that many entries in "sessions".`
      : expectedLessons
        ? `The course appears to have around ${expectedLessons} sessions; transcribe the actual structure (count weekly sessions, not modules).`
        : 'Auto-detect the number of sessions from the source structure.';
  const coverageTopics = extractExplicitCoverageTopics(syllabusText);
  const remainingSessions = expectedLessons ? Math.max(0, expectedLessons - coverageTopics.length) : 0;
  const coveragePlan =
    coverageTopics.length > 0
      ? [
          `SOURCE COVERAGE TOPICS (${coverageTopics.length}): ${coverageTopics
            .map((topic, index) => `${index + 1}. ${topic}`)
            .join('; ')}.`,
          `Give every source coverage topic a clear primary session. For the remaining ${remainingSessions} session${
            remainingSessions === 1 ? '' : 's'
          }, deepen one named subject at a time with a distinct disciplinary mechanism, method, interpretation task, application, limitation, or source-named lab investigation. Each remaining session must be a standalone teachable topic, not a pairing of unrelated coverage areas. Do not use the words synthesis, comprehensive, review, midterm, exam, final, or evaluation in any session title, and do not repeat titles or sections.`,
        ]
      : [];
  return [
    'Extract the typed course skeleton from the following source materials.',
    countLine,
    'Treat assessment names as assessment-registry entries, not automatic session titles. A final assessment belongs at the end of the plan; do not duplicate it as both a lesson and an assessment.',
    ...coveragePlan,
    'If the text contains "--- SEGMENT N ---" markers, each segment corresponds to one session.',
    '',
    'SOURCE MATERIALS:',
    segmentSyllabus(syllabusText),
    '',
    'Return ONLY the skeleton JSON object now:',
  ].join('\n');
}
