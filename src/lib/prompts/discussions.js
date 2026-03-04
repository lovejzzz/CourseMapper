import { condenseCourseMap } from './promptUtils.js';

export default {
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
      "guidelines": "string — 4-5 sentence student-facing participation guidelines: posting deadline, response deadline, minimum word count for initial post, what counts as a 'substantive' peer response, and how participation is graded (QM 5.4)",
      "tags": ["string — 5-8 keywords for LMS discoverability: include discussion format, Bloom's level, and key concepts debated"]
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
- FORMAT VARIETY (CRITICAL): Use at least 6 DISTINCT discussion formats across all lessons. Choose from: 'Socratic Seminar', 'Think-Pair-Share', 'Fishbowl', 'Jigsaw', 'Gallery Walk', 'Debate / Structured Academic Controversy', 'Case-Based Discussion', 'Role Play / Simulation', 'Small Group then Share-Out', 'Whole-Class Discussion', 'Asynchronous Online'. Do NOT repeat the same format for more than 2 consecutive lessons. Rotate formats to keep student engagement high.
- QM ALIGNMENT: Learner interaction requirements must be explicit: minimum number of posts, response expectations, substantive reply criteria, and deadlines (QM 5.4). Discussion activities must provide genuine opportunities for learner-to-learner interaction that supports active learning — not just posting and forgetting (QM 5.2).
- HUMAN READABILITY: Each discussion prompt and its supporting text should feel unique. Vary the opening hooks, probe structures, and facilitation advice. Do not use the same sentence patterns for every lesson.
- Return ONLY the JSON object, no prose, no markdown`,
  }
