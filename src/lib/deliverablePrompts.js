/**
 * Prompt templates for generating each deliverable type.
 * Each function returns { systemPrompt, userPrompt } given a course map.
 *
 * All prompts are designed to meet university instructional-design standards
 * based on Bloom's Revised Taxonomy (Anderson & Krathwohl), UDL 2.2 Guidelines
 * (CAST), Understanding by Design (Wiggins & McTighe), Quality Matters (QM)
 * Higher Education Rubric (7th Edition), and best practices from Carnegie
 * Mellon's Eberly Center and Vanderbilt's Center for Teaching.
 */

import { getCustomDeliverable } from './customDeliverableLibrary.js';
import { getProfile } from './professorProfile.js';
import { getModeLessonPlanNote } from './pedagogicalModes.js';
import { getSections, buildSectionsContext } from './courseSections.js';

// Map from column keys to how they are extracted and labeled in the condensed payload.
const COLUMN_EXTRACTORS = {
  topicSection:       { key: 'topics',      extract: (sections) => sections.map(s => s.topicSection || '').filter(Boolean) },
  learningObjectives: { key: 'objectives',  extract: (sections) => sections.map(s => s.learningObjectives || '').filter(Boolean).join(' | ') },
  weeklyAssessments:  { key: 'assessments', extract: (sections) => sections.map(s => s.weeklyAssessments || '').filter(Boolean).join('; ') },
  supportingResources:{ key: 'resources',   extract: (sections) => sections.map(s => s.supportingResources || '').filter(Boolean).join('; ') },
  learningGoals:      { key: 'learningGoals', extract: (sections) => sections.map(s => s.learningGoals || '').filter(Boolean).join(' | ') },
  asyncActivities:    { key: 'activities_async', extract: (sections) => sections.map(s => s.asyncActivities || '').filter(Boolean).join('; ') },
  syncActivities:     { key: 'activities_sync',  extract: (sections) => sections.map(s => s.syncActivities || '').filter(Boolean).join('; ') },
  technologyNeeded:   { key: 'technology',  extract: (sections) => sections.map(s => s.technologyNeeded || '').filter(Boolean).join('; ') },
  presentationFormat: { key: 'format',      extract: (sections) => sections.map(s => s.presentationFormat || '').filter(Boolean).join('; ') },
  evaluateDesign:     { key: 'evaluateDesign', extract: (sections) => sections.map(s => s.evaluateDesign || '').filter(Boolean).join('; ') },
};

function condenseCourseMap(courseMap, scopeIndices = null, verifiedChanges = null, columns = null) {
  const allLessons = courseMap.lessons || [];

  // Determine which columns are enabled. If columns is provided, only include those that are enabled.
  const enabledKeys = columns && columns.length > 0
    ? new Set(columns.filter(c => c.enabled !== false).map(c => c.key))
    : null; // null = include all (backwards compat)

  // Determine which lessons to include and their original indices.
  let indexedLessons;
  if (scopeIndices && scopeIndices.length > 0) {
    const inRange = scopeIndices.filter(i => i < allLessons.length);
    if (inRange.length > 0) {
      indexedLessons = inRange.map(i => ({ lesson: allLessons[i], originalIndex: i }));
    } else {
      indexedLessons = allLessons.map((lesson, i) => ({
        lesson,
        originalIndex: scopeIndices[i] !== undefined ? scopeIndices[i] : i,
      }));
    }
  } else {
    indexedLessons = allLessons.map((lesson, i) => ({ lesson, originalIndex: i }));
  }

  const maxOrigIdx = indexedLessons.reduce((mx, il) => Math.max(mx, il.originalIndex), 0);
  const totalForDisplay = Math.max(allLessons.length, maxOrigIdx + 1);

  const acceptedChanges = (verifiedChanges || []).filter(c => typeof c === 'string' && !c.startsWith('__REJECTED__:'));

  const payload = {
    courseName: courseMap.courseName,
    semester: courseMap.semester,
    totalLessonsInCourse: totalForDisplay,
    lessons: indexedLessons.map(({ lesson: l, originalIndex }) => {
      const sections = l.sections || [];
      const entry = {
        lessonNumber: originalIndex + 1,
        weekNumber: `Week ${originalIndex + 1}`,
        title: l.title,
      };

      // Extract only enabled columns (or all if no filter)
      for (const [colKey, ext] of Object.entries(COLUMN_EXTRACTORS)) {
        if (enabledKeys && !enabledKeys.has(colKey)) continue;
        const val = ext.extract(sections);
        // Group async/sync activities under an "activities" object for cleanliness
        if (colKey === 'asyncActivities') {
          if (!entry.activities) entry.activities = {};
          entry.activities.async = val;
        } else if (colKey === 'syncActivities') {
          if (!entry.activities) entry.activities = {};
          entry.activities.sync = val;
        } else {
          entry[ext.key] = val;
        }
      }

      // Also include any custom column keys (user-added columns not in the default set)
      if (enabledKeys) {
        for (const colKey of enabledKeys) {
          if (!COLUMN_EXTRACTORS[colKey]) {
            // Custom column — extract raw values from sections
            const vals = sections.map(s => s[colKey] || '').filter(Boolean).join('; ');
            if (vals) entry[colKey] = vals;
          }
        }
      }

      return entry;
    }),
  };

  if (acceptedChanges.length > 0) {
    payload._verifiedByExamination = {
      note: 'The following fields were fact-checked against the instructor\'s original uploaded syllabus and confirmed or corrected by the AI examiner. Treat these as authoritative.',
      verifiedItems: acceptedChanges,
    };
  }

  return JSON.stringify(payload);
}

const PROMPTS = {
  // ─── LESSON PLANS ────────────────────────────────────────────────────────────
  lessonPlans: {
    system: `You are a senior instructional designer with expertise in Bloom's Revised Taxonomy, Universal Design for Learning (UDL), and backward design (Wiggins & McTighe). Your lesson plans are used directly by university instructors and must be classroom-ready, pedagogically rigorous, and ready to print. Return ONLY valid JSON, no markdown fences.`,

    user: (cm, scope, verifiedChanges, columns) => `Generate detailed, university-standard lesson plans for each lesson in this course:

${condenseCourseMap(cm, scope, verifiedChanges, columns)}

Return a JSON object with exactly this structure:
{
  "plans": [
    {
      "lessonTitle": "string — full lesson title",
      "weekNumber": "string — e.g. 'Week 3'",
      "duration": "string — e.g. '75 min'",
      "bloomsLevels": ["string"] — Bloom's levels targeted, e.g. ["Understand","Apply","Analyze"],
      "objectives": [
        "string — Each objective starts directly with a Bloom's action verb (Analyze, Evaluate, Create, etc.) followed by content and condition. Do NOT repeat 'Students will be able to' or 'By the end of this lesson' — just the verb + content. Example: 'Analyze the impact of immigration policy on vulnerable populations'"
      ],
      "materials": [
        "string — each item includes purpose, e.g. 'Whiteboard — for collaborative concept mapping'"
      ],
      "warmUp": {
        "duration": "string — e.g. '8 min'",
        "type": "string — e.g. 'Think-Pair-Share' | 'Poll' | 'Case Study Hook' | 'Retrieval Quiz' | 'Surprising Statistic'",
        "prompt": "string — the exact warm-up question or task posed to students",
        "purpose": "string — what prior knowledge or curiosity this activates",
        "facilitation": "string — instructor note on how to run this and transition to new content"
      },
      "outline": [
        {
          "time": "string — e.g. '10–25 min'",
          "activity": "string — activity name",
          "type": "string — e.g. 'Mini-Lecture' | 'Think-Pair-Share' | 'Discussion' | 'Problem Set' | 'Jigsaw' | 'Case Study' | 'Gallery Walk' | 'Lab'",
          "description": "string — what students do during this segment",
          "instructorNotes": "string — specific facilitation moves, questions to ask, pacing tips",
          "instructorRole": "string — what the instructor does during this segment: circulating, prompting, modeling, observing, providing feedback, facilitating discussion, etc. (QM 5.3)",
          "grouping": "string — 'Individual' | 'Pairs' | 'Small Groups (3-4)' | 'Whole Class'",
          "bloomsLevel": "string — the primary Bloom's level this segment targets"
        }
      ],
      "formativeCheck": {
        "type": "string — e.g. 'Exit Ticket' | 'Muddiest Point' | 'Think-Pair-Share' | 'Cold Call' | 'Mini Poll'",
        "prompt": "string — the exact formative check question or task",
        "objectiveAligned": "string — which lesson objective this checks",
        "instructorAction": "string — what instructor does with the results (adjust next class, address misconceptions, etc.)"
      },
      "udlNotes": {
        "representation": "string — how content is presented in multiple formats (visual, verbal, examples)",
        "engagement": "string — how student motivation and choice are supported",
        "expression": "string — flexible ways students can demonstrate understanding"
      },
      "homework": {
        "title": "string — homework task name",
        "description": "string — clear task description with scope",
        "estimatedTime": "string — e.g. '45 min'",
        "connectionToNext": "string — how this prepares students for the next lesson"
      },
      "closingActivity": "string — 2-3 sentence description of how the lesson wraps up (synthesis, preview of next class, homework reminder)"
    }
  ]
}

REQUIREMENTS:
- One plan per lesson in the course map
- Minimum 5 outline segments with realistic time ranges that total the session duration
- Objectives MUST use Bloom's action verbs: Remember (define/identify/list/recall), Understand (explain/summarize/classify/describe/compare), Apply (use/demonstrate/solve/calculate/execute), Analyze (differentiate/examine/deconstruct/distinguish/relate), Evaluate (judge/critique/justify/assess/argue), Create (design/construct/develop/formulate/produce)
- NEVER repeat boilerplate stems like "Students will be able to" or "By the end of this lesson" in every objective — just start each one directly with the Bloom's verb
- bloomsLevels array should reflect the mix of cognitive levels in the lesson
- Materials list must include at least one technology tool and one handout/reading
- The warmUp MUST connect to at least one lesson objective and surface prior knowledge
- formativeCheck MUST map to a specific objective
- UDL notes must be substantive (not generic) — specific to this lesson's content
- Homework must have an explicit connection to the NEXT session
- QM ALIGNMENT: Each plan must describe the instructor's plan for substantive interaction with learners — the instructorRole field must explain how the instructor engages during each activity segment (QM 5.3). Learner interaction requirements must be clearly stated: specify when students work individually vs. collaboratively, what peer interaction looks like, and participation expectations (QM 5.4). Activities must provide opportunities for interaction that supports active learning — avoid passive lecture-only segments longer than 15 min without an interaction break (QM 5.2).
- HUMAN READABILITY: All text will be read by instructors. Avoid redundant phrases across items. Vary sentence structure. Do not use copy-paste templates where every item follows the exact same pattern — make each entry sound natural and distinct.
- Return ONLY the JSON object, no prose, no markdown`,
  },

  // ─── RUBRICS ─────────────────────────────────────────────────────────────────
  rubrics: {
    system: `You are an expert in educational assessment and analytic rubric design for higher education. Your rubrics follow best practices from Walvoord & Anderson and meet Quality Matters (QM) Higher Education Rubric standards. Rubrics must provide specific and descriptive criteria whose connection to the course grading policy is clearly explained (QM 3.3). Each criterion uses observable, behavioral language with concrete quantity/quality markers. Rubrics are distributed to students before the assignment and are aligned to course learning objectives. Return ONLY valid JSON, no markdown fences.`,

    user: (cm, scope, verifiedChanges, columns) => `Generate professional, university-standard analytic grading rubrics for the assessments in this course:

${condenseCourseMap(cm, scope, verifiedChanges, columns)}

Return a JSON object with exactly this structure:
{
  "rubrics": [
    {
      "title": "string — assignment/assessment name this rubric grades",
      "lessonTitle": "string — the lesson this rubric is associated with",
      "assessmentType": "string — e.g. 'Written Essay' | 'Research Paper' | 'Lab Report' | 'Oral Presentation' | 'Group Project' | 'Reflection' | 'Problem Set'",
      "totalPoints": number — integer matching the assignment's gradebook weight,
      "bloomsLevel": "string — highest Bloom's level assessed by this rubric",
      "gradingScale": {
        "exemplary": "string — point range or percentage, e.g. '90–100%'",
        "proficient": "string — e.g. '75–89%'",
        "developing": "string — e.g. '60–74%'",
        "beginning": "string — e.g. 'Below 60%'"
      },
      "criteria": [
        {
          "criterion": "string — specific, measurable dimension being assessed",
          "objectiveAligned": "string — which course learning objective this criterion maps to",
          "weight": number — percentage weight (all criteria must sum to 100),
          "points": number — max points for this criterion (weight/100 × totalPoints),
          "exemplary": "string — observable, behavioral description with concrete quality/quantity markers. What mastery looks like ABOVE the minimum standard.",
          "proficient": "string — meets the standard. Concrete descriptors. No vague words like 'good' or 'adequate'.",
          "developing": "string — partially meets standard. Describes what IS present, not just what is missing.",
          "beginning": "string — does not yet meet standard. Still describes what the student has attempted, not purely negative."
        }
      ],
      "gradePolicyConnection": "string — how this rubric connects to the overall course grading policy: state the weight of this assessment in the final grade and which grading category it falls under (QM 3.3)",
      "teacherNotes": "string — instructions for calibrating scores, handling edge cases, giving feedback to students, and a note to distribute this rubric to students BEFORE the assignment (QM 3.3)"
    }
  ]
}

REQUIREMENTS:
- Create one rubric per unique assessment type found in the course map
- 4–6 criteria per rubric
- Criterion weights must sum to exactly 100
- ALL cell descriptions must use third-person, present-tense observable language (e.g., "The student provides..." or declarative "Argument is supported by 4+ peer-reviewed sources")
- NO vague qualifiers: never use "good," "adequate," "somewhat," "fairly" alone — always qualify with a concrete indicator
- Exemplary cell describes mastery BEYOND minimum — what an exceptional response looks like
- Beginning cell describes what the student attempted, using constructive language
- gradingScale should reflect the institution's typical grading thresholds
- QM ALIGNMENT: Each rubric must include gradePolicyConnection explaining how it connects to the course grading policy and the weight of this assessment in the final grade (QM 3.3). teacherNotes must include a reminder to distribute the rubric to students BEFORE the assignment (QM 3.3). Include guidance for students on how to uphold academic integrity for this assessment type (QM 3.6).
- HUMAN READABILITY: Vary wording across rubric cells — do not use identical sentence patterns for every criterion level. Each cell should sound distinct and specific to that criterion.
- Return ONLY the JSON object, no prose, no markdown`,
  },

  // ─── SLIDE DECKS ─────────────────────────────────────────────────────────────
  slideDecks: {
    system: `You are a world-class instructional presentation designer for higher education, combining:
- Evidence-based slide design (Mayer's Multimedia Principles, Assertion-Evidence framework by Garr Reynolds & Michael Alley)
- Cognitive load theory (Sweller) — minimize extraneous load, optimize germane load
- Accessibility (WCAG 2.1) and Universal Design for Learning
- Pedagogical flow: hook → instruction → practice → synthesis

Your slides follow the ASSERTION-EVIDENCE model: every content slide title is a FULL DECLARATIVE SENTENCE stating the key claim (the "assertion"), and the body provides visual/textual evidence supporting it. This is proven to increase student learning by 15-20% compared to traditional topic-phrase titles (Alley & Neeley, 2005).

Speaker notes are written as natural instructor scripts — they sound like a confident professor talking to their class, not a template. Return ONLY valid JSON, no markdown fences.`,

    user: (cm, scope, verifiedChanges, columns) => `Generate world-class, university-standard slide deck outlines for each lesson in this course:

${condenseCourseMap(cm, scope, verifiedChanges, columns)}

Return a JSON object with exactly this structure:
{
  "decks": [
    {
      "lessonTitle": "string — full lesson title",
      "totalSlides": number — integer count of slides,
      "learningObjectives": ["string"] — 2-5 objectives shown on the objectives slide,
      "slides": [
        {
          "title": "string — for content/bridge/example/keyTerm slides: MUST be a full declarative sentence (assertion). Examples: ✅ 'Dopamine regulates motivation through reward prediction errors' ✅ 'Three factors determine housing policy effectiveness' ❌ 'Dopamine' ❌ 'Housing Policy'. For title/agenda/objectives/activity/summary/closing slides: descriptive label is acceptable.",
          "type": "string — MUST be one of: 'title' | 'agenda' | 'objectives' | 'bridge' | 'content' | 'activity' | 'discussion' | 'example' | 'keyTerm' | 'summary' | 'closing'",
          "bullets": ["string"] — max 4 concise bullets for content slides; title slides use 1 subtitle; activity/discussion 1-3 steps; summary recaps objectives as 'Can you now...?' questions; keyTerm slides: first bullet is the term/definition, remaining bullets explain it,
          "notes": "string — full instructor script paragraph (minimum 4 sentences). Must include: (1) the main point in your own words, (2) a concrete real-world example or analogy, (3) an anticipated student question with your response, (4) TRANSITION: [explicit cue to next slide]. Each slide's notes must feel unique — never use the same phrasing patterns across slides.",
          "activityType": "string or null — for 'activity' and 'discussion' slides only: e.g. 'Think-Pair-Share' | 'Small Group Discussion' | 'Cold Call' | 'Poll' | 'Gallery Walk' | 'Jigsaw'",
          "timer": "string or null — for activity/discussion slides: e.g. '5 min'",
          "bloomsLevel": "string or null — for content/activity/discussion/example slides: the Bloom's level this slide targets",
          "objectiveLink": "string or null — for content/activity/discussion/example slides: which learning objective this slide supports (QM 4.1)"
        }
      ]
    }
  ]
}

REQUIRED SLIDE SEQUENCE (every deck must follow this structure):
1. Slide 1 — type: 'title' — lesson number, lesson title, course name
2. Slide 2 — type: 'agenda' — today's segments with approximate times as bullets
3. Slide 3 — type: 'objectives' — 2-5 Bloom's-level objectives (verb + content, no boilerplate stems)
4. Slide 4 — type: 'bridge' — MUST reference specific content from the previous lesson (not generic). Bullets should be split: first half = "Last time we learned..." recap points, second half = "Today we'll..." preview points
5-N. Body slides — mix of content, activity, discussion, example, and keyTerm slides
N-1. type: 'summary' — return to objectives as self-check questions: "Can you now [verb] [content]?"
N. type: 'closing' — homework reminder + due date + preview of next session

SLIDE VARIETY RULES (critical for engagement):
- Include at least 1 'example' slide per deck (real-world case study or scenario)
- Include at least 1 'activity' or 'discussion' slide per deck
- Include at least 1 'keyTerm' slide per deck when new vocabulary/concepts are introduced
- NEVER have 3+ consecutive 'content' slides — break them up with activity, example, or keyTerm slides
- Vary slide types to maintain cognitive engagement

CONTENT QUALITY RULES:
- Maximum 4 bullets per content slide (cognitive load principle)
- Every content slide title MUST be a full declarative sentence (assertion-evidence model)
- Bridge slides MUST reference specific content from the previous lesson, not generic "last time we..."
- Example slides: last bullet should be the key insight/takeaway
- keyTerm slides: first bullet is the term or concept definition, remaining bullets provide explanation and context

SPEAKER NOTES RULES:
- Minimum 4 sentences per slide
- Must include a concrete example or analogy (not just restating bullets)
- Must include an anticipated student question or common misconception
- Last sentence MUST be "TRANSITION: [cue to next slide topic]"
- Vary language — never start two consecutive notes the same way
- Sound like a real professor, not a textbook

REQUIREMENTS:
- 12–16 slides per deck (more substantive than 10)
- Agenda slide bullets show timing (e.g., "Case study discussion (10 min)")
- Summary slide returns to the objectives slide content
- QM ALIGNMENT: Use a variety of instructional materials within each deck: text, diagrams, examples, video references, and interactive elements (QM 4.5). Speaker notes must include accessibility considerations when relevant (QM 8.2-8.3). Each content/activity slide must clearly connect to a learning objective via the objectiveLink field (QM 4.1, 4.2).
- HUMAN READABILITY: Each slide's notes must feel distinct and natural. Vary sentence structure. Do not copy-paste patterns across slides.
- Return ONLY the JSON object, no prose, no markdown`,
  },

  // ─── QUIZ BANK ───────────────────────────────────────────────────────────────
  quizBank: {
    system: `You are an expert in educational assessment, test design, and item-writing best practices for higher education (following NBME and university testing center guidelines). Your questions are used in university exams and must be valid, reliable, and pedagogically sound. Every question includes full metadata and answer rationales. Return ONLY valid JSON, no markdown fences.`,

    user: (cm, scope, verifiedChanges, columns) => `Generate a comprehensive, university-standard quiz bank for each lesson in this course:

${condenseCourseMap(cm, scope, verifiedChanges, columns)}

Return a JSON object with exactly this structure:
{
  "quizzes": [
    {
      "lessonTitle": "string — full lesson title",
      "totalQuestions": number — integer count,
      "bloomsCoverage": ["string"] — Bloom's levels covered in this quiz set,
      "formativeFeedbackNote": "string — guidance for the instructor: common errors students make on this material, how to return results quickly, and how students should use quiz results to identify areas needing review (QM 3.5)",
      "questions": [
        {
          "type": "string — MUST be one of: 'multiple_choice' | 'short_answer' | 'essay'",
          "bloomsLevel": "string — exact Bloom's level: 'Remember' | 'Understand' | 'Apply' | 'Analyze' | 'Evaluate' | 'Create'",
          "difficulty": "string — 'Easy' | 'Medium' | 'Hard'",
          "estimatedMinutes": number — integer time to answer,
          "points": number — integer point value,
          "objectiveAligned": "string — which lesson learning objective this question assesses",
          "question": "string — for MC: complete interrogative sentence or scenario stem; for short answer: includes expected length ('In 2-3 sentences...'); for essay: includes task verb (analyze/evaluate/argue), scope, and constraints",
          "options": ["string"] — MC only: exactly 4 options as 'A. ...', 'B. ...', 'C. ...', 'D. ...'; null for other types,
          "answer": "string — MC: the letter only (e.g. 'B'); short answer: model answer with key required elements; essay: null",
          "distractorRationale": "string or null — MC only: explain why each wrong option is plausible (common misconception it tests), format: 'A: [reason]; C: [reason]; D: [reason]'",
          "explanation": "string — for ALL types: MC: 'The correct answer is [X] because [reason]'; short answer: full model response + 2 alternative acceptable phrasings; essay: null",
          "rubricHints": "string or null — essay only: 3-4 criteria that a strong response must include",
          "sampleAnswer": "string or null — short answer and essay only: full exemplary response"
        }
      ]
    }
  ]
}

REQUIREMENTS:
- 5–7 questions per lesson: at least 3 multiple choice, 1–2 short answer, 1 essay
- Questions must span at least 3 different Bloom's levels per lesson
- MC stems must be complete sentences or scenarios — NO fill-in-the-blank fragments
- MC has exactly 4 options (A–D); avoid "All of the above" and "None of the above"
- All 4 MC options must be similar in length (avoid "longest option is correct" cueing)
- Distractors MUST represent common student misconceptions (not absurd wrong answers)
- Short answer questions must specify expected length (e.g., "In 2-3 sentences")
- Essay prompts must include: task verb + scope + constraints
- All questions must have objectiveAligned field populated
- QM ALIGNMENT: Include a variety of question types across the course that are sequenced from lower to higher Bloom's levels as the course progresses (QM 3.4). Questions should help students track their learning progress — include diagnostic questions that help learners identify areas needing review (QM 3.5). Each quiz must include a formativeFeedbackNote for the instructor on common errors and how to provide timely feedback (QM 3.5).
- HUMAN READABILITY: Vary question phrasing across lessons — do not use the same stem patterns repeatedly. Questions should feel hand-crafted, not template-generated. Each explanation should be written in clear, natural prose.
- Return ONLY the JSON object, no prose, no markdown`,
  },

  // ─── DISCUSSION PROMPTS ──────────────────────────────────────────────────────
  discussions: {
    system: `You are an expert in facilitating higher-order academic discussions in university classrooms. Your prompts follow Socratic seminar principles and are designed to elicit Bloom's levels 4–6 (Analyze, Evaluate, Create). All prompts require students to engage with course material — not just share personal opinions. You include full facilitation guides for instructors. Return ONLY valid JSON, no markdown fences.`,

    user: (cm, scope, verifiedChanges, columns) => `Generate university-standard academic discussion prompts for each lesson in this course:

${condenseCourseMap(cm, scope, verifiedChanges, columns)}

Return a JSON object with exactly this structure:
{
  "discussions": [
    {
      "lessonTitle": "string — full lesson title",
      "bloomsLevel": "string — primary Bloom's level: 'Analyze' | 'Evaluate' | 'Create'",
      "format": "string — recommended discussion format: 'Socratic Seminar' | 'Think-Pair-Share' | 'Fishbowl' | 'Small Group then Share-Out' | 'Whole-Class Discussion' | 'Asynchronous Online'",
      "estimatedDuration": "string — e.g. '20 min'",
      "context": "string — 2-3 sentences grounding the discussion in specific course content, a case, a tension, or a real-world application. Students must engage with this material.",
      "prompt": "string — the single, focused main question. Must be open-ended (no single correct answer), require evidence from course material, and target Analyze/Evaluate/Create level. NO multi-part questions.",
      "evidenceRequirement": "string — explicit directive: e.g. 'Draw on at least two sources from this unit to support your position' or 'Reference the case study and at least one theoretical framework discussed in class'",
      "followUpProbes": [
        "string — 4-5 probing follow-up questions the instructor uses to deepen discussion (e.g., 'What evidence from the reading supports that?', 'How would [theorist] respond to that claim?', 'Can someone steelman the opposing view?')"
      ],
      "facilitationTips": {
        "opening": "string — how to launch the discussion and get initial engagement",
        "ifStalls": "string — what to do if discussion stalls (backup prompt or technique)",
        "ifDominates": "string — strategy if one student monopolizes",
        "closure": "string — how to bring the discussion to a productive conclusion and connect back to objectives"
      },
      "responseStarters": [
        "string — 3-4 sentence starters to help students enter the discussion: 'Building on what [name] said...', 'The evidence I find most compelling is...' etc."
      ],
      "evaluationCriteria": [
        "string — 3-4 specific criteria by which student contributions will be assessed (e.g., 'Quality of reasoning and use of specific evidence', 'Engagement with and response to peers', 'Connection to course readings or concepts', 'Consideration of alternative perspectives')"
      ],
      "equityConsiderations": "string — how to ensure equitable participation (think time, multiple entry points, affirming diverse perspectives)",
      "guidelines": "string — 4-5 sentence student-facing participation guidelines: posting deadline, response deadline, minimum word count for initial post, what counts as a 'substantive' peer response, and how participation is graded (QM 5.4)"
    }
  ]
}

REQUIREMENTS:
- One discussion per lesson
- Prompts MUST target Bloom's levels 4-6 — not recall or comprehension
- The main prompt must have no single correct answer — multiple defensible positions are possible
- followUpProbes must be substantive Socratic questions, not just "Can you say more about that?"
- evaluationCriteria must be specific and shareable with students before the discussion
- equityConsiderations must be concrete, not generic ("allow think time" → specify duration)
- QM ALIGNMENT: Learner interaction requirements must be explicit: minimum number of posts, response expectations, substantive reply criteria, and deadlines (QM 5.4). Discussion activities must provide genuine opportunities for learner-to-learner interaction that supports active learning — not just posting and forgetting (QM 5.2).
- HUMAN READABILITY: Each discussion prompt and its supporting text should feel unique. Vary the opening hooks, probe structures, and facilitation advice. Do not use the same sentence patterns for every lesson.
- Return ONLY the JSON object, no prose, no markdown`,
  },

  // ─── ASSIGNMENTS ─────────────────────────────────────────────────────────────
  assignments: {
    system: `You are an expert instructional designer specializing in university assignment design (Understanding by Design, Constructive Alignment). Your assignment briefs are complete, classroom-ready documents that instructors can distribute directly to students. Every assignment includes learning objective alignment, scaffolding milestones, submission specifications, and an academic integrity statement. Return ONLY valid JSON, no markdown fences.`,

    user: (cm, scope, verifiedChanges, columns) => `Generate university-standard, classroom-ready assignment briefs for this course:

${condenseCourseMap(cm, scope, verifiedChanges, columns)}

Return a JSON object with exactly this structure:
{
  "assignments": [
    {
      "title": "string — assignment name",
      "assignmentType": "string — e.g. 'Research Paper' | 'Reflective Essay' | 'Case Study Analysis' | 'Lab Report' | 'Group Project' | 'Oral Presentation' | 'Problem Set' | 'Portfolio'",
      "relatedLessons": ["string"] — lesson titles this assignment draws from,
      "dueWeek": "string — e.g. 'Week 5, Friday 11:59 PM'",
      "estimatedTime": "string — realistic total student time, e.g. '6–8 hours over 2 weeks'",
      "totalPoints": number — integer,
      "percentOfGrade": "string — e.g. '15%'",
      "bloomsLevel": "string — primary cognitive level: 'Apply' | 'Analyze' | 'Evaluate' | 'Create'",
      "overview": "string — 3-4 sentences: what students will do, WHY this assignment matters to their learning and to the field, and which course learning objectives it assesses",
      "objectives": [
        "string — specific learning objectives this assignment assesses (verbatim from course objectives if possible)"
      ],
      "instructions": [
        "string — numbered, imperative-voice steps: 'Choose a...', 'Write a...', 'Cite at least...'. Each step is a separate string. Be specific about scope, length, format."
      ],
      "formatRequirements": {
        "length": "string — e.g. '1,500–2,000 words' or '10-minute presentation'",
        "format": "string — e.g. 'Double-spaced, 12pt Times New Roman, 1-inch margins'",
        "citationStyle": "string — e.g. 'APA 7th edition'",
        "submissionPlatform": "string — e.g. 'Submit as a single PDF to Canvas > Assignments > [title]'",
        "latePolicy": "string — explicit penalty: e.g. '10 points deducted per 24-hour period; no submissions accepted after 1 week'"
      },
      "deliverables": [
        "string — checklist of every item to submit, e.g. '[ ] Cover page with name and student ID', '[ ] 1,500-2,000 word essay', '[ ] Reference list (minimum 5 peer-reviewed sources)'"
      ],
      "scaffoldingMilestones": [
        {
          "milestone": "string — milestone name, e.g. 'Topic Proposal'",
          "dueDate": "string — e.g. 'Week 2, class time'",
          "description": "string — what the student submits and what feedback they receive"
        }
      ],
      "gradingCriteria": "string — brief rubric summary tying point distribution to criteria (full rubric is generated separately)",
      "supportResources": [
        "string — specific support: writing center, library databases, office hours schedule, sample work description"
      ],
      "progressTracking": "string — how students will receive feedback and track their progress on this assignment: interim feedback points, self-assessment checkpoints, peer review milestones, and expected turnaround time for instructor feedback (QM 3.5)",
      "academicIntegrityStatement": "string — assignment-specific guidance on how to uphold academic integrity for THIS assignment type: what is/is not permitted (collaboration, AI tools, reuse of prior work), reference to institution policy, and consequences for violation (QM 3.6)"
    }
  ]
}

REQUIREMENTS:
- Extract 4–7 assignments from the course map's assessments — spanning different types
- Each assignment must clearly connect to specific lessons and objectives
- instructions must use numbered, imperative-voice steps (not paragraph prose)
- scaffoldingMilestones must have at least 2 milestones for major assignments
- deliverables must be a checklist (students can tick off each item before submitting)
- academicIntegrityStatement must be specific to this assignment (not a generic paragraph)
- formatRequirements.latePolicy must state explicit point deduction or policy
- QM ALIGNMENT: Assignments must be sequenced and suited to the course level — earlier assignments should scaffold toward later, more complex ones (QM 3.4). Include opportunities for learners to track their progress via the progressTracking field: interim feedback points, self-assessment checkpoints, or peer review milestones (QM 3.5). The academicIntegrityStatement must provide specific guidance on how to uphold integrity for THIS assignment type (QM 3.6).
- HUMAN READABILITY: Each assignment should read as a unique document — vary the overview voice, instruction phrasing, and scaffolding descriptions. Avoid copy-paste language patterns across assignments.
- Return ONLY the JSON object, no prose, no markdown`,
  },

  // ─── STUDY GUIDES ────────────────────────────────────────────────────────────
  studyGuides: {
    system: `You are an expert educator creating university-level student study materials based on cognitive science principles (spaced retrieval practice, interleaving, elaborative interrogation). Your study guides are structured to promote deep learning — not passive re-reading. They are designed for students preparing for exams and are organized to build schema, surface misconceptions, and guide self-assessment. Return ONLY valid JSON, no markdown fences.`,

    user: (cm, scope, verifiedChanges, columns) => `Generate comprehensive, university-standard study guides for each lesson in this course:

${condenseCourseMap(cm, scope, verifiedChanges, columns)}

Return a JSON object with exactly this structure:
{
  "guides": [
    {
      "lessonTitle": "string — full lesson title",
      "examScope": "string — what this guide covers (e.g., 'Covers Week 3 content and assigned reading chapters 5-6')",
      "summary": "string — 2-3 substantive paragraphs covering the lesson's core concepts, written at 'explain it to a peer' level. Includes what each concept IS, why it matters, and how concepts connect to each other.",
      "keyTerms": [
        {
          "term": "string — the technical or discipline-specific term",
          "definition": "string — course-appropriate definition (not a dictionary definition) that explains the concept in the context of this course",
          "example": "string — a concrete, specific example or application that illustrates the term"
        }
      ],
      "conceptConnections": [
        "string — each string describes a connection between two or more concepts from this lesson or links back to prior lessons, e.g. 'The dopamine hypothesis (Week 3) directly informs the treatment approaches discussed in Week 7'"
      ],
      "commonMisconceptions": [
        {
          "misconception": "string — a common incorrect belief students hold about this topic",
          "correction": "string — the accurate explanation that corrects the misconception, with reasoning"
        }
      ],
      "reviewQuestions": [
        {
          "question": "string — review question that mirrors exam format",
          "bloomsLevel": "string — 'Remember' | 'Understand' | 'Apply' | 'Analyze' | 'Evaluate' | 'Create'",
          "hint": "string — metacognitive hint pointing students toward the right reasoning strategy without giving the answer"
        }
      ],
      "practiceActivities": [
        "string — specific self-study activity using retrieval practice, concept mapping, or elaborative interrogation (e.g., 'Without looking at your notes, write a 1-paragraph explanation of [concept] and then compare it to the textbook definition')"
      ],
      "examPrep": {
        "keyTopicsToKnow": ["string"] — 4-6 high-probability exam topics from this lesson,
        "timeManagement": "string — advice on how to pace exam questions from this content",
        "commonErrors": "string — what students typically lose points on for this topic and how to avoid it",
        "reviewStrategy": "string — recommended study approach (e.g., 'Complete the practice problems before reading the solutions; use spaced retrieval over 3 days')"
      },
      "supportResources": "string — 2-3 sentences pointing students to relevant support for this topic: office hours, tutoring availability, study group suggestions, relevant library resources, and writing center services (QM 7.3)"
    }
  ]
}

REQUIREMENTS:
- One guide per lesson
- summary must be 2-3 full paragraphs (not bullet points) — written in clear academic prose
- 8–12 key terms per guide, with BOTH definition AND example for each term
- conceptConnections must include at least one cross-lesson link to prior or upcoming material
- 2–4 commonMisconceptions — these are the highest-value exam targets; be specific
- 4–6 reviewQuestions spanning at least 3 different Bloom's levels
- practiceActivities must involve active retrieval (not passive re-reading suggestions)
- examPrep.keyTopicsToKnow should reflect what an instructor would actually test
- QM ALIGNMENT: Include a supportResources field per guide pointing students to relevant help: office hours, tutoring, study groups, writing center — so students know where to turn when stuck (QM 7.3). Reference specific instructional materials (readings, videos, slides) for each key concept, making the relationship between study materials and learning activities clear (QM 4.2).
- HUMAN READABILITY: Write summaries, definitions, and review questions in varied, natural academic prose. Do not use the same sentence templates across lessons. Each guide should feel like it was written specifically for that lesson.
- Return ONLY the JSON object, no prose, no markdown`,
  },

  // ─── SYLLABUS ─────────────────────────────────────────────────────────────────
  // Based on syllabus guidelines from NYU, Columbia, MIT, Harvard, Stanford, Yale.
  syllabus: {
    system: `You are a senior curriculum designer at a top-tier research university. You produce publication-ready course syllabi that meet the standards of institutions like NYU, Columbia, MIT, and Stanford.

Your syllabi are:
- Learner-centered: use direct, student-facing language ("You will…", "In this course, we…")
- Transparent: explain WHY assignments, policies, and activities exist — not just what they are
- Professionally welcoming: warm but authoritative tone that signals the instructor cares about student success
- Backward-designed: learning outcomes → assessments that measure those outcomes → activities that prepare students
- Inclusive and accessible: diverse perspectives, flexible policies where appropriate, belonging-focused language

Return ONLY valid JSON, no markdown, no commentary.`,
    user: (cm, scope, verifiedChanges, columns) => `Generate a comprehensive, university-quality course syllabus for:

${condenseCourseMap(cm, scope, verifiedChanges, columns)}

Return JSON in this exact structure:
{"syllabus":{
  "courseTitle":"Full course name with department code and number",
  "semester":"${cm.semester || '[Semester Year]'}",
  "credits":"[3 credits — estimate from course scope]",
  "meetingPattern":"[e.g., Tuesdays & Thursdays, 2:00–3:15 PM]",
  "location":"[TBD]",
  "deliveryMode":"In-Person",
  "prerequisites":"[Required prior knowledge in the discipline and/or specific competencies — derive from course level, or 'None' (QM 1.7)]",

  "instructor":"[Instructor Name]",
  "instructorEmail":"[Email]",
  "officeHours":"[e.g., Wednesdays 1:00–3:00 PM, or by appointment]",
  "officeLocation":"[TBD]",

  "instructorBio":"Welcoming 3-4 sentence instructor introduction: academic background, teaching philosophy, what excites them about this course, and an approachable invitation for students to connect during office hours or by email (QM 1.8)",

  "courseDescription":"3-4 sentence paragraph explaining the purpose and structure of the course: intellectual goals, real-world relevance, what students will explore, and how the course is organized so learners understand what to expect (QM 1.2). Written in engaging, student-facing language.",

  "gettingStarted":"Step-by-step guide for students on how to get started: how to access the course site, navigate the LMS, find the syllabus/schedule/materials, and what to do in Week 1. Include where to find various course components (QM 1.1)",

  "learnerIntroActivity":"Description of how learners will introduce themselves in the first week — e.g., discussion board post, icebreaker activity, or introductory survey (QM 1.9)",

  "learningOutcomes":["5-7 specific, measurable outcomes using observable action verbs from Bloom's taxonomy (analyze, design, evaluate, synthesize, critique) — avoid vague terms like 'understand' or 'appreciate'. Each should be 1 sentence."],

  "requiredTexts":[{"title":"...","author":"...","edition":"...","isbn":"...","note":"(optional — e.g., 'Available at campus bookstore' or 'Free PDF on course LMS')"}],

  "courseRequirements":[{"name":"Assignment category name","weight":"20%","description":"2-3 sentence description of what this entails, how it connects to learning outcomes, and what students should expect."}],

  "gradingScale":[{"grade":"A","range":"93–100"},{"grade":"A-","range":"90–92"},{"grade":"B+","range":"87–89"},{"grade":"B","range":"83–86"},{"grade":"B-","range":"80–82"},{"grade":"C+","range":"77–79"},{"grade":"C","range":"73–76"},{"grade":"C-","range":"70–72"},{"grade":"D+","range":"67–69"},{"grade":"D","range":"63–66"},{"grade":"F","range":"Below 63"}],

  "latePolicy":"Professional but fair late work policy (2-3 sentences). Include grace period or penalty structure, process for extensions, and documentation requirements.",

  "attendancePolicy":"2-3 sentence attendance and participation policy. Explain how attendance is tracked, how absences affect grades, and the process for excused absences.",

  "communicationPolicy":"2-3 sentences covering all communication guidelines: expected channels, response time commitments, netiquette expectations, how to ask questions, and preferred contact methods (QM 1.3).",

  "technologyPolicy":"2-3 sentences stating minimum technology requirements (hardware, software, browser, internet) and how to obtain/access each technology (QM 1.5). Include laptop/device use policy, recording policy, and the course LMS.",

  "technicalSkills":"Digital literacy and technical skills expected of learners: LMS navigation, file upload/submission, video conferencing, library database searches, and any discipline-specific software skills (QM 1.6)",

  "aiPolicy":"2-3 sentence policy on generative AI tools (ChatGPT, Claude, etc.). Specify whether AI is permitted, restricted, or prohibited, and any disclosure/citation requirements.",

  "weeklySchedule":[{"week":"Week 1","dates":"[e.g., Jan 21, 23]","topic":"...","readings":"Specific chapter/pages or article titles","assignments":"Due dates and deliverables for that week"}],

  "academicIntegrity":"Professional 2-3 sentence academic integrity statement referencing university policy. Include what constitutes a violation in this course and consequences.",

  "technicalSupport":"2-3 sentences describing how to get technical help: IT helpdesk contact info, LMS support resources, hours of availability, and troubleshooting steps for common issues (QM 7.1)",

  "accommodations":"2-3 sentence statement linking to the institution's accessibility policies and accommodation services, directing students to the disability services office, encouraging early outreach, and affirming instructor commitment to access (QM 7.2).",

  "mentalHealth":"2-3 sentence statement normalizing mental health support, providing campus counseling center info, and crisis resources.",

  "titleIX":"1-2 sentence Title IX / non-discrimination statement with reference to university reporting resources.",

  "supportServices":"2-3 sentences listing academic support services (tutoring, writing center, library research help) and student services (counseling, career services, financial aid) that help learners succeed (QM 7.3, 7.4).",

  "dataPrivacy":"1-2 sentences on how student data is protected in course technologies, FERPA compliance, and privacy considerations for any third-party tools used in the course (QM 6.4)",

  "importantDates":[{"date":"...","event":"..."}]
}}

CRITICAL RULES:
- Derive ALL academic content (topics, readings, assignments, schedule) from the course map data above
- courseRequirements weights MUST total exactly 100%
- weeklySchedule MUST have one entry per lesson/week in the course map — match topics precisely
- learningOutcomes must use specific Bloom's taxonomy verbs: analyze, evaluate, create, apply, compare, critique, design, formulate, integrate, synthesize
- requiredTexts: infer plausible real textbooks for this discipline if not specified — include full bibliographic detail
- gradingScale: use the standard US university scale shown above unless professor profile provides a custom one
- All policy sections must read like real university policies — professional, specific, and actionable
- importantDates: include midterm exam, final exam, major project deadlines, registration deadlines, and academic calendar dates
- The syllabus must serve as a complete course orientation: students should be able to find everything they need to get started, understand expectations, access support, and navigate the course (QM Standards 1 & 7)
- Write everything as if this will be distributed to students on the first day of class at a top university
- Return ONLY the JSON object`,
  },
};

// ── Config → natural-language instructions for the AI ────────────────────────
function buildConfigInstructions(featureId, config, pedagogicalMode = 'lecture') {
  const lines = [];

  // Feature 4.2 — Pedagogical mode structure note (lesson plans only)
  if (featureId === 'lessonPlans') {
    const modeNote = getModeLessonPlanNote(pedagogicalMode);
    if (modeNote) lines.push(`PEDAGOGICAL STRUCTURE REQUIREMENT: ${modeNote}`);
  }

  // ── Base layer: professor profile defaults (lowest priority) ──
  const profile = getProfile();
  if (profile.name || profile.institution || profile.department) {
    const parts = [profile.name, profile.department, profile.institution].filter(Boolean);
    if (parts.length > 0) lines.push(`Instructor context: ${parts.join(', ')}.`);
  }
  if (featureId === 'lessonPlans' && profile.defaultSessionLength && !config?.sessionLength) {
    lines.push(`Each class session is ${profile.defaultSessionLength} — adjust ALL time estimates in the outline to match this duration exactly.`);
  }
  if (featureId === 'syllabus' && profile.citationStyle && !config?.citationStyle) {
    lines.push(`Use ${profile.citationStyle} citation format throughout the syllabus.`);
  }
  if ((featureId === 'syllabus' || featureId === 'assignments') && profile.lateWorkPolicy) {
    lines.push(`Late work policy (use exactly, do not rewrite): "${profile.lateWorkPolicy}"`);
  }
  if ((featureId === 'syllabus' || featureId === 'rubrics') && profile.academicIntegrityStatement) {
    lines.push(`Academic integrity statement (use exactly, do not rewrite): "${profile.academicIntegrityStatement}"`);
  }
  if (featureId === 'syllabus' && profile.accommodationStatement) {
    lines.push(`Accommodation statement (use exactly, do not rewrite): "${profile.accommodationStatement}"`);
  }
  if (featureId === 'syllabus' && profile.mentalHealthStatement) {
    lines.push(`Mental health resources statement (use exactly, do not rewrite): "${profile.mentalHealthStatement}"`);
  }
  // Feature 3.1 — Institution-level policies (injected as non-overridable blocks)
  if (featureId === 'syllabus' && profile.policyTitleIX) {
    lines.push(`Title IX / Non-Discrimination statement (use exactly, do not rewrite): "${profile.policyTitleIX}"`);
  }
  if (featureId === 'syllabus' && profile.policyGradeScale) {
    lines.push(`Grade scale (use exactly this scale in the grading section): ${profile.policyGradeScale}`);
  }
  // Feature 7.2 — Multi-Section Mode: inject section info into syllabus prompt
  if (featureId === 'syllabus') {
    const sects = getSections();
    const sectCtx = buildSectionsContext(sects);
    if (sectCtx) lines.push(sectCtx);
  }

  if (!config || Object.keys(config).length === 0) return lines.join('\n');

  if (featureId === 'lessonPlans') {
    if (config.sessionLength) lines.push(`Each class session is ${config.sessionLength} — adjust ALL time estimates in the outline to match this duration exactly.`);
    if (config.detailLevel === 'Brief') lines.push('Keep content concise — use short bullet points, minimal elaboration. Prioritize actionability over depth.');
    if (config.detailLevel === 'Detailed') lines.push('Be highly detailed and rich — elaborate each section with multiple examples, instructor guidance, and pedagogical rationale.');
    if (config.includeWarmUp === false) lines.push('Do NOT include a warm-up activity — set the "warmUp" field to null.');
    if (config.includeUDL === false) lines.push('Do NOT include UDL notes — set the "udlNotes" field to null.');
    if (config.includeHomework === false) lines.push('Do NOT include a homework section — set the "homework" field to null.');
  }
  else if (featureId === 'slideDecks') {
    if (config.slidesPerLesson) lines.push(`Target ${config.slidesPerLesson} slides per deck (including title, agenda, objectives, bridge, content slides, and closing).`);
    if (config.includeActivities === false) lines.push('Minimize activity and discussion slides — focus on content and example slides. Only include an activity slide if it is essential.');
    if (config.speakerNotes === 'Minimal') lines.push('Speaker notes should be brief bullet reminders only — 1-2 sentences per slide, NOT full scripts.');
    if (config.speakerNotes === 'Full script') lines.push('Speaker notes must be full instructor scripts — at least 3 substantive sentences per slide with examples and transition cues.');
  }
  else if (featureId === 'rubrics') {
    if (config.criteriaCount) lines.push(`Each rubric must have exactly ${config.criteriaCount} criteria (ensure weights sum to 100%).`);
    if (config.performanceLevels === '3 levels') lines.push('Use exactly 3 performance levels: Developing, Proficient, and Mastery. Do NOT include a "Beginning" level. Adjust the gradingScale accordingly.');
    if (config.includeTeacherNotes === false) lines.push('Do NOT include the teacherNotes field — omit it entirely from the JSON.');
  }
  else if (featureId === 'quizBank') {
    if (config.questionsPerLesson) lines.push(`Generate ${config.questionsPerLesson} questions per lesson. Distribute them across the allowed question types.`);
    const excluded = [];
    if (config.includeMultipleChoice === false) excluded.push('multiple_choice');
    if (config.includeShortAnswer === false) excluded.push('short_answer');
    if (config.includeEssay === false) excluded.push('essay');
    if (excluded.length > 0) lines.push(`Do NOT generate questions of these types: ${excluded.join(', ')}. Only use the remaining types.`);
    if (config.difficultyDist === 'Mostly Easy/Medium') lines.push('Weight questions toward Easy and Medium difficulty — at most 1 Hard question per lesson.');
    if (config.difficultyDist === 'Mostly Medium/Hard') lines.push('Weight questions toward Medium and Hard difficulty — at most 1 Easy question per lesson.');
  }
  else if (featureId === 'discussions') {
    if (config.formatPreference && config.formatPreference !== 'Any') lines.push(`Use "${config.formatPreference}" as the discussion format for ALL lessons.`);
    if (config.includeFacilitation === false) lines.push('Do NOT include the facilitationTips field — omit it entirely.');
    if (config.includeEquity === false) lines.push('Do NOT include the equityConsiderations field — omit it entirely.');
  }
  else if (featureId === 'assignments') {
    if (config.assignmentTypes?.length > 0 && config.assignmentTypes.length < 6) {
      lines.push(`Only create assignments of these types: ${config.assignmentTypes.join(', ')}. Do not create other assignment types.`);
    }
    if (config.includeScaffolding === false) lines.push('Do NOT include scaffoldingMilestones — omit the field entirely.');
    if (config.includeIntegrity === false) lines.push('Do NOT include the academicIntegrityStatement field — omit it entirely.');
  }
  else if (featureId === 'studyGuides') {
    if (config.keyTermsCount) lines.push(`Include exactly ${config.keyTermsCount} key terms per guide — each with definition AND example.`);
    if (config.includeMisconceptions === false) lines.push('Do NOT include the commonMisconceptions field — omit it entirely.');
    if (config.includeExamPrep === false) lines.push('Do NOT include the examPrep field — omit it entirely.');
    if (config.includePractice === false) lines.push('Do NOT include the practiceActivities field — omit it entirely.');
  }
  else if (featureId === 'syllabus') {
    if (config.citationStyle) lines.push(`Use ${config.citationStyle} citation format throughout the syllabus (reference list, in-text citations, and all examples).`);
    if (config.includeWeeklySchedule === false) lines.push('Do NOT include the weeklySchedule array — omit it entirely.');
    if (config.latePolicyTone === 'Strict') lines.push('Late work policy must be strict: no late work accepted without documented emergency or prior instructor approval.');
    if (config.latePolicyTone === 'Flexible') lines.push('Late work policy should be flexible and student-supportive, reflecting a growth mindset and understanding of student challenges.');
  }

  // Feature 4.1 — Tiered Differentiation
  if (config.enableTiers) {
    lines.push(
      `TIERED DIFFERENTIATION REQUIRED: For EVERY item in this deliverable, generate three differentiated versions stored in a "tiers" object:\n` +
      `  - tiers.scaffolded: Designed for struggling students — add sentence starters, worked examples, simplified vocabulary, step-by-step breakdowns, and additional scaffolds.\n` +
      `  - tiers.standard: The regular version (same content quality as without tiering enabled).\n` +
      `  - tiers.extension: Designed for advanced/fast-finishing students — add challenge questions, independent research prompts, higher-order thinking tasks, and real-world application extensions.\n` +
      `The "tiers" object must be included alongside (not replacing) the standard fields for each item. Do not omit any standard fields.`
    );
  }

  // ── Universal advanced settings (apply to all deliverables) ──
  if (config.tone) {
    lines.push(`TONE: Write all content in a ${config.tone.toLowerCase()} tone. Adjust vocabulary, sentence structure, and formality level to match a ${config.tone.toLowerCase()} register.`);
  }
  if (config.style) {
    const styleMap = {
      'Bullet points': 'Use bullet points as the primary formatting structure. Prefer concise, scannable lists over long paragraphs.',
      'Paragraphs': 'Use full paragraphs as the primary formatting structure. Write in flowing, connected prose.',
      'Tables': 'Where possible, organize information into tables with clear headers and rows.',
      'Numbered lists': 'Use numbered lists as the primary formatting structure for sequential or prioritized content.',
      'Mixed': 'Use a mix of bullet points, paragraphs, and tables as appropriate for each section.',
    };
    lines.push(`STYLE & FORMAT: ${styleMap[config.style] || `Format content as ${config.style.toLowerCase()}.`}`);
  }
  if (config.outputLength) {
    const lengthMap = {
      'Brief': 'Keep output concise and minimal — prioritize brevity. Use the shortest effective phrasing. Reduce sections to essentials only.',
      'Standard': 'Use standard detail level — balanced between brevity and depth.',
      'Detailed': 'Be highly detailed — elaborate each section with examples, rationale, and thorough coverage.',
      'Comprehensive': 'Be maximally comprehensive — leave nothing out. Include extensive examples, edge cases, alternative approaches, and deep explanations for every section.',
    };
    lines.push(`OUTPUT LENGTH: ${lengthMap[config.outputLength] || `Adjust output length to be ${config.outputLength.toLowerCase()}.`}`);
  }

  if (config.extraInstructions?.trim()) {
    lines.push(`SPECIAL INSTRUCTOR REQUIREMENTS (highest priority — must be followed): ${config.extraInstructions.trim()}`);
  }

  // Reference file style injection (always last, high priority)
  if (config.referenceFileText?.trim()) {
    lines.push(
      `\nSTYLE & FORMAT REFERENCE (very important — match this as closely as possible):\n` +
      `The instructor has provided the following example document to define the desired tone, structure, and formatting. ` +
      `Study it carefully and replicate its style, voice, section organization, and level of detail as closely as possible:\n` +
      `--- REFERENCE EXAMPLE START ---\n${config.referenceFileText.slice(0, 3000)}\n--- REFERENCE EXAMPLE END ---`
    );
  }

  return lines.join('\n');
}

// Build a scope preamble that forces the AI to generate ONLY for the selected lessons.
function buildScopePreamble(courseMap, scopeIndices) {
  if (!Array.isArray(scopeIndices) || scopeIndices.length === 0) return '';
  const allLessons = courseMap.lessons || [];

  // Same pattern as condenseCourseMap: detect when course map is already scoped.
  // When the user scopes to e.g. lesson 5 (index 4), the course map generation may
  // produce only 1 lesson at index 0.  scopeIndices=[4] but allLessons.length=1,
  // so filtering by index gives an empty list.  In that case, pair each lesson in the
  // already-scoped course map with its original scope index for correct labeling.
  const inRange = scopeIndices.filter(i => i < allLessons.length);
  let titleLines;
  if (inRange.length > 0) {
    // Normal case: course map has all lessons, filter by scope
    titleLines = inRange.map(i => `- Lesson ${i + 1} (Week ${i + 1}): ${allLessons[i]?.title || ''}`);
  } else {
    // Already-scoped case: course map only has the scoped lessons
    titleLines = allLessons.map((l, i) => {
      const origIdx = scopeIndices[i] !== undefined ? scopeIndices[i] : i;
      return `- Lesson ${origIdx + 1} (Week ${origIdx + 1}): ${l?.title || ''}`;
    });
  }
  const titles = titleLines.join('\n');
  const firstIdx = inRange.length > 0 ? scopeIndices[0] : (scopeIndices[0] ?? 0);
  return `⚠️ SCOPE CONSTRAINT — CRITICAL: Generate content for ONLY the following ${scopeIndices.length} lesson${scopeIndices.length !== 1 ? 's' : ''}. Do NOT generate anything for any other lesson. Your output array MUST contain EXACTLY ${scopeIndices.length} item${scopeIndices.length !== 1 ? 's' : ''}:\n${titles}\n\nIMPORTANT: Use the ORIGINAL lesson/week numbers from the course map (e.g., "Week ${firstIdx + 1}", "Lesson ${firstIdx + 1}"). Do NOT renumber them as Lesson 1.\n\n`;
}

/**
 * @param {string}      featureId
 * @param {object}      courseMap
 * @param {number[]|null} scopeIndices
 * @param {object}      config
 * @param {string}      pedagogicalMode
 * @param {object|null} examChanges
 * @param {string|null} editContext  — Optional: human-readable summary of what the
 *   instructor changed (e.g. 'homework: "3" → "4"'). When provided, injected as the
 *   highest-priority constraint so the AI incorporates the edit precisely.
 * @param {Array|null}  columns — Active column definitions from ColumnEditor.
 */
export function getDeliverablePrompt(featureId, courseMap, scopeIndices = null, config = {}, pedagogicalMode = 'lecture', examChanges = null, editContext = null, columns = null, allConfigs = null) {
  const template = PROMPTS[featureId];
  const scopePreamble = buildScopePreamble(courseMap, scopeIndices);

  // Build the edit-context block when provided (injected before config instructions)
  const editContextBlock = editContext
    ? `\n\nINSTRUCTOR EDIT TO INCORPORATE (mandatory — highest priority):\nThe instructor has made this specific change to this lesson:\n  ${editContext}\nRevise the content to reflect this change precisely. Preserve everything else unchanged. Do NOT invent unrelated changes.`
    : '';

  // ── Custom deliverable fallback ───────────────────────────────────────────
  if (!template && featureId.startsWith('custom_')) {
    const custom = getCustomDeliverable(featureId);
    if (custom) {
      // ── Auto-fill missing config from custom deliverable defaults + sibling configs ──
      const enrichedConfig = { ...config };
      const dc = custom.defaultConfig || {};
      // 1) Fall back to the custom deliverable's own defaultConfig
      if (!enrichedConfig.tone && dc.tone) enrichedConfig.tone = dc.tone;
      if (!enrichedConfig.style && dc.style) enrichedConfig.style = dc.style;
      if (!enrichedConfig.outputLength && (dc.length || dc.outputLength)) enrichedConfig.outputLength = dc.length || dc.outputLength;

      // 2) If still missing, infer from other deliverables' configs
      if (allConfigs && (!enrichedConfig.tone || !enrichedConfig.style || !enrichedConfig.outputLength)) {
        for (const [otherId, otherCfg] of Object.entries(allConfigs)) {
          if (otherId === featureId || !otherCfg) continue;
          if (!enrichedConfig.tone && otherCfg.tone) enrichedConfig.tone = otherCfg.tone;
          if (!enrichedConfig.style && otherCfg.style) enrichedConfig.style = otherCfg.style;
          if (!enrichedConfig.outputLength && otherCfg.outputLength) enrichedConfig.outputLength = otherCfg.outputLength;
          if (enrichedConfig.tone && enrichedConfig.style && enrichedConfig.outputLength) break;
        }
      }

      // 3) If STILL missing after all fallbacks, inject AI auto-decide instruction
      const autoDecideHints = [];
      if (!enrichedConfig.tone) autoDecideHints.push('tone (e.g. Academic, Professional, Conversational, or Friendly — pick what best fits the course and deliverable type)');
      if (!enrichedConfig.style) autoDecideHints.push('formatting style (e.g. bullet points, paragraphs, tables, numbered lists, or a mix — pick what best fits this deliverable type)');
      if (!enrichedConfig.outputLength) autoDecideHints.push('output length/detail level (e.g. Brief, Standard, Detailed, or Comprehensive — pick what best fits this deliverable type)');

      const condensed = condenseCourseMap(courseMap, scopeIndices, examChanges, columns);
      const baseUserPrompt = (config.customUserPrompt?.trim() || custom.userPromptTemplate).replace('{{courseMap}}', condensed);
      const configInstructions = buildConfigInstructions(featureId, enrichedConfig, pedagogicalMode);

      const autoDecideBlock = autoDecideHints.length > 0
        ? `\n\nAUTO-DECIDE INSTRUCTIONS (the instructor has not specified these settings — use your best judgment):\nBased on the course content, deliverable type ("${custom.name}"), and pedagogical context, automatically decide the most appropriate:\n${autoDecideHints.map(h => `- ${h}`).join('\n')}\nApply your chosen settings consistently throughout the output.`
        : '';

      const withEdit = editContextBlock
        ? baseUserPrompt.replace(/(\nReturn ONLY)/, `${editContextBlock}$1`)
        : baseUserPrompt;
      const withAutoDecide = autoDecideBlock
        ? withEdit.replace(/(\nReturn ONLY)/, `${autoDecideBlock}$1`)
        : withEdit;
      const withConfig = configInstructions
        ? withAutoDecide.replace(
            /(\nReturn ONLY)/,
            `\n\nADDITIONAL INSTRUCTOR REQUIREMENTS (must be followed, take priority over defaults):\n${configInstructions}$1`
          )
        : withAutoDecide;
      const withExtra = config.extraInstructions?.trim()
        ? withConfig + `\n\nINSTRUCTOR EXTRA INSTRUCTIONS:\n${config.extraInstructions.trim()}`
        : withConfig;
      const userPrompt = scopePreamble + withExtra;

      // Build system prompt — enrich with deliverable name/description context
      let systemPrompt = config.customSystemPrompt?.trim() || custom.systemPrompt;
      // If the system prompt doesn't already mention the deliverable name, prepend context
      if (custom.name && !systemPrompt.includes(custom.name)) {
        const descLine = custom.description ? ` Description: ${custom.description}.` : '';
        systemPrompt = `You are generating a "${custom.name}" deliverable for a university course.${descLine}\n\n${systemPrompt}`;
      }

      return { systemPrompt, userPrompt };
    }
    return null;
  }

  if (!template) return null;

  const baseUserPrompt = config.customUserPrompt?.trim()
    ? config.customUserPrompt.replace('{{courseMap}}', condenseCourseMap(courseMap, scopeIndices, examChanges, columns))
    : template.user(courseMap, scopeIndices, examChanges, columns);
  const configInstructions = buildConfigInstructions(featureId, config, pedagogicalMode);

  // Inject edit context first (highest priority), then config instructions
  // Both are inserted right before the final "Return ONLY the JSON" instruction
  const withEdit = editContextBlock
    ? baseUserPrompt.replace(/(\nReturn ONLY the JSON)/, `${editContextBlock}$1`)
    : baseUserPrompt;
  const withConfig = configInstructions
    ? withEdit.replace(/(\nReturn ONLY the JSON)/, `\n\nADDITIONAL INSTRUCTOR REQUIREMENTS (must be followed, take priority over defaults):\n${configInstructions}$1`)
    : withEdit;
  // Append extra free-text instructions from the instructor if provided
  const withExtra = config.extraInstructions?.trim()
    ? withConfig + `\n\nINSTRUCTOR EXTRA INSTRUCTIONS:\n${config.extraInstructions.trim()}`
    : withConfig;
  // Prepend scope preamble so the AI sees the constraint before everything else
  const userPrompt = scopePreamble + withExtra;
  return {
    systemPrompt: config.customSystemPrompt?.trim() || template.system,
    userPrompt,
  };
}

export const DELIVERABLE_KEYS = Object.keys(PROMPTS);
