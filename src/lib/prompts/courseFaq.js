import { condenseCourseMap } from './promptUtils.js';

export default {
  system: `You are a student-success specialist who writes warm, approachable FAQ documents for university courses. Your FAQs anticipate the real questions students ask — about logistics, assignments, concepts, technology, and exam prep — and answer them in concise, actionable language. You write from the instructor's perspective but in a supportive, student-facing voice. Return ONLY valid JSON, no markdown fences.`,

  user: (
    cm,
    scope,
    verifiedChanges,
    columns,
  ) => `Generate a comprehensive student-facing Course FAQ for each lesson in this course:

${condenseCourseMap(cm, scope, verifiedChanges, columns)}

Use abbreviated JSON keys to minimize output size. Each key's meaning is described inline.

Return a JSON object with exactly this structure:
{
  "faqGuide": {
    "studentUse": "string — how students should use this FAQ before class, during assignments, and before assessments",
    "instructorUse": "string — how instructors can deploy the FAQ, where to customize local details, and what common friction points to watch",
    "sharedCoursePolicies": "string — concise common guidance for submissions, feedback, accessibility, and help-seeking so weekly answers do not repeat boilerplate"
  },
  "faqs": [
    {
      "lt": "string — full lesson title",
      "studentOverview": "string — 2-3 sentences that orient students to why this lesson matters and how to use the FAQ",
      "instructorOverview": "string — 2-3 sentences for instructors: likely friction points, which answers to emphasize, and where to customize local details",
      "qs": [
        {
          "q": "string — a realistic question a student would ask, written in first-person student voice (e.g., 'How should I prepare for the midterm on this material?')",
          "an": "string — concise, actionable answer in 2-4 sentences. Be specific: reference assignments, readings, or named course resources only when they appear in the course map. Use warm, supportive tone.",
          "ca": "string — one of: 'Course Logistics' | 'Assignment Clarification' | 'Concept Explanation' | 'Technical Help' | 'Assessment Prep'",
          "rc": ["string — 1-3 key concepts or topics this Q&A relates to"],
          "df": "string — 'Basic' | 'Intermediate' | 'Advanced' — how conceptually challenging the question is",
          "sa": "string — the concrete next action a student should take after reading the answer",
          "in": "string — instructor-facing note about how to preempt or address this issue without inventing local policy",
          "ac": "string — how this question connects to an assignment, quiz, discussion, or exam when present in the course map; include expected output, due timing, rubric criterion, or feedback use when derivable",
          "ud": "string — concrete accessibility/support guidance: plain-language option, alternate format, caption/transcript, scaffold, accommodation-friendly participation path, office hours, tutoring, or writing support",
          "ce": "string — a concrete example tied to the lesson topic; avoid generic examples"
        }
      ],
      "tg": ["string — 5-8 keywords for LMS discoverability: include lesson topic, question categories covered, and key concepts"]
    }
  ]
}

REQUIREMENTS:
- Exactly 5 questions per lesson
- Include faqGuide once at the top level. Move shared policy and help-seeking language there so weekly answers can stay specific and concise.
- Each lesson must cover at least 3 different categories from: Course Logistics, Assignment Clarification, Concept Explanation, Technical Help, Assessment Prep
- ca must be exactly one of the five category labels above. Do not put rationale sentences, objective alignment, or explanatory prose in ca.
- Questions must sound like real student questions — use first-person voice and natural phrasing
- Answers must be actionable: tell the student exactly what to do, where to go, or what to review
- Answers must be concise (2-4 sentences max) — students skim FAQs, they don't read essays
- Keep "an" student-facing and concise. Put instructor-only guidance in "in"; do not pretend the instructor note is part of the student answer.
- Do NOT invent LMS folder names, campus offices, instructor contact details, institutional tools, licenses, support links, or due dates. If the course map does not name a resource, use generic wording such as "the course site", "the assignment page", "your notes", or "the posted rubric".
- Named third-party tools are allowed only when the course map names them or when framed as optional examples, not required institutional resources.
- Include at least 1 Concept Explanation question per lesson that clarifies a common point of confusion
- Include at least 1 Assessment Prep question for lessons with exams or major assignments due
- Every FAQ item must include studentAction, instructorNote, assessmentConnection, accessibilitySupport, and concreteExample.
- accessibilitySupport must be concrete and varied across lessons. Do not repeat the same generic support sentence.
- assessmentConnection must be specific when the lesson has an assessment: name the expected artifact, timing, success criterion, or feedback loop. Do not only say "connects to the assignment."
- At least one question per lesson must include a concrete "what strong work looks like" checklist or observable success cue in studentAction, assessmentConnection, or concreteExample.
- rubric bridges must be observable: name labels, counts, evidence traces, comparison statements, limitation notes, or decision criteria when those are derivable.
- instructorNote should include a short facilitation cue, timing cue, or sample prompt when the question affects live teaching.
- relatedConcepts must reference specific terms or topics from the lesson, not generic labels
- HUMAN READABILITY: Vary question phrasing across lessons. Do not reuse the same question templates. Each FAQ should feel tailored to its specific lesson content.
- Return ONLY the JSON object, no prose, no markdown`,
};
