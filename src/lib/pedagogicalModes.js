/**
 * pedagogicalModes.js
 *
 * Pedagogical teaching framework definitions for Feature 4.2.
 * Each mode modifies the system prompt and deliverable prompts to restructure
 * course content around a specific pedagogical philosophy.
 *
 * Modes:
 *   lecture      — Traditional lecture-based (default, no changes)
 *   flipped      — Flipped classroom (pre-class + in-class application)
 *   pbl          — Problem-Based Learning (case-centered)
 *   seminar      — Seminar/discussion-heavy
 *   competency   — Competency-Based Education (mastery-based, no weekly structure)
 */

export const PEDAGOGICAL_MODES = [
  {
    id: 'lecture',
    name: 'Lecture-Based',
    label: 'Lecture-Based', // alias for backward compat
    icon: '\uD83C\uDF93',
    description: 'Traditional instructor-led sessions. Standard outline format with lecture, activities, and assessments.',
    color: 'indigo',
    systemPromptAddition: '',  // No addition — default behavior
    lessonPlanStructureNote: '',
    courseMapNote: '',
  },
  {
    id: 'flipped',
    name: 'Flipped Classroom',
    label: 'Flipped Classroom',
    icon: '\uD83D\uDD04',
    description: 'Students consume content before class; class time used for application and discussion.',
    color: 'sky',
    systemPromptAddition:
      `PEDAGOGICAL MODE: Flipped Classroom. ` +
      `Each lesson in the course map should include a "preClassContent" field (videos, readings, mini-lectures students do before class) ` +
      `and an "inClassApplication" field (activities, problem sets, discussions for class time) instead of or in addition to a generic outline. ` +
      `Lesson plans should be structured as Pre-Class Preparation + In-Class Application sections.`,
    lessonPlanStructureNote:
      `Structure each lesson plan with two main sections: ` +
      `(1) PRE-CLASS CONTENT — what students watch/read/do before class (videos, readings, short assignments, mini-quizzes) and ` +
      `(2) IN-CLASS APPLICATION — active learning activities, problem-solving, peer teaching, and discussions that apply the pre-class content.`,
    courseMapNote:
      `Add "preClassContent" (string: pre-class assignment description) and "inClassApplication" (string: in-class activity description) fields to each section in the course map.`,
  },
  {
    id: 'pbl',
    name: 'Problem-Based Learning',
    label: 'Problem-Based Learning',
    icon: '\uD83D\uDD2C',
    description: 'Lessons organized around authentic cases and problems. Students drive inquiry.',
    color: 'emerald',
    systemPromptAddition:
      `PEDAGOGICAL MODE: Problem-Based Learning (PBL). ` +
      `Organize lessons around authentic cases, problems, or scenarios rather than topics. ` +
      `Each lesson section should include a "caseStudy" field (the driving problem or case) and ` +
      `"inquiryQuestions" (the guiding questions students explore). ` +
      `Learning objectives should be framed as student-driven inquiry outcomes.`,
    lessonPlanStructureNote:
      `Structure each lesson plan around a central problem or case study. Include: ` +
      `(1) THE PROBLEM — authentic, messy, real-world case or scenario ` +
      `(2) PRIOR KNOWLEDGE ACTIVATION — what students already know ` +
      `(3) INQUIRY QUESTIONS — what students need to find out ` +
      `(4) RESOURCES & INVESTIGATION — materials and approaches ` +
      `(5) SOLUTION SYNTHESIS — how groups present and discuss their findings`,
    courseMapNote:
      `Add "caseStudy" (string: the driving problem/case for this lesson) and "inquiryQuestions" (array of strings: guiding questions) to each lesson section.`,
  },
  {
    id: 'seminar',
    name: 'Seminar',
    label: 'Seminar',
    icon: '\uD83D\uDCAC',
    description: 'Discussion-heavy, Socratic method. Minimal lecture; reading-driven with rich dialogue.',
    color: 'rose',
    systemPromptAddition:
      `PEDAGOGICAL MODE: Seminar/Socratic. ` +
      `Course structure is reading-heavy and discussion-driven. ` +
      `Each lesson should include "seminarReadings" (required texts/articles) and "discussionArc" (how the discussion will progress: opening question, development, synthesis). ` +
      `Minimize lecture time; maximize critical dialogue. ` +
      `Assessments should be discussion-based (participation rubrics, reading responses, Socratic seminars).`,
    lessonPlanStructureNote:
      `Structure each lesson plan around a Socratic seminar arc: ` +
      `(1) PRE-SEMINAR READING — primary texts and preparation questions ` +
      `(2) OPENING QUESTION — the central essential question for the seminar ` +
      `(3) DISCUSSION ARC — how the conversation will unfold (opening, development, synthesis, closing) ` +
      `(4) FACILITATION MOVES — instructor interventions and probing questions ` +
      `(5) POST-SEMINAR REFLECTION — individual or written synthesis`,
    courseMapNote:
      `Add "seminarReadings" (array of strings: required readings for this session) and "discussionArc" (string: how the seminar discussion will unfold) to each lesson section.`,
  },
  {
    id: 'competency',
    name: 'Competency-Based',
    label: 'Competency-Based',
    icon: '\uD83C\uDFC6',
    description: 'Mastery-based progression. No fixed weekly schedule; students advance when ready.',
    color: 'amber',
    systemPromptAddition:
      `PEDAGOGICAL MODE: Competency-Based Education (CBE). ` +
      `Do not use week-based structure. Instead, organize lessons around competency modules. ` +
      `Each lesson/module should include: ` +
      `"competencyStatement" (what the student will be able to do at mastery), ` +
      `"masteryThreshold" (what constitutes mastery — e.g., score >= 80% on 3 consecutive attempts), ` +
      `"assessmentMethod" (how mastery is demonstrated), and ` +
      `"remediation" (what happens if the student doesn't achieve mastery). ` +
      `Learning objectives should be measurable competencies. No time estimates needed.`,
    lessonPlanStructureNote:
      `Structure each lesson/module around competency mastery: ` +
      `(1) COMPETENCY STATEMENT — precise, measurable competency ` +
      `(2) PRE-ASSESSMENT — determine student's starting point ` +
      `(3) LEARNING PATHWAY — multiple routes to mastery (direct instruction, self-paced modules, peer learning) ` +
      `(4) PRACTICE ATTEMPTS — low-stakes formative checks with feedback ` +
      `(5) MASTERY DEMONSTRATION — the summative assessment ` +
      `(6) REMEDIATION PLAN — alternative pathways for students who don't reach threshold`,
    courseMapNote:
      `Add "competencyStatement" (string), "masteryThreshold" (string: e.g., "80% on 3 attempts"), "assessmentMethod" (string), and "remediation" (string) to each lesson section. Remove or de-emphasize weekly time allocations.`,
  },
];

/**
 * Get a mode by id.
 * @param {string} id
 * @returns {object}
 */
export function getMode(id) {
  return PEDAGOGICAL_MODES.find(m => m.id === id) || PEDAGOGICAL_MODES[0];
}

/**
 * Get the system prompt addition for a mode.
 * Returns empty string for 'lecture' (default).
 * @param {string} id
 * @returns {string}
 */
export function getModeSystemAddition(id) {
  return getMode(id)?.systemPromptAddition || '';
}

/**
 * Get the lesson plan structure note for a mode.
 * @param {string} id
 * @returns {string}
 */
export function getModeLessonPlanNote(id) {
  return getMode(id)?.lessonPlanStructureNote || '';
}

/**
 * Get course map field note for a mode.
 * @param {string} id
 * @returns {string}
 */
export function getModeCourseMapNote(id) {
  return getMode(id)?.courseMapNote || '';
}
