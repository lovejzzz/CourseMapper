import { condenseCourseMap } from './promptUtils.js';

export default {
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
      "supportResources": "string — 2-3 sentences pointing students to relevant support for this topic: office hours, tutoring availability, study group suggestions, relevant library resources, and writing center services (QM 7.3)",
      "tags": ["string — 5-8 keywords for LMS discoverability: include key terms, topic area, study strategies, and related lesson titles"]
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
- COGNITIVE LOAD: Limit sentences to 20 words maximum. Paragraphs to 5 sentences maximum. Use whitespace and clear section breaks to prevent wall-of-text fatigue.
- HUMAN READABILITY: Write summaries, definitions, and review questions in varied, natural academic prose. Do not use the same sentence templates across lessons. Each guide should feel like it was written specifically for that lesson.
- HEADER FORMAT: Use this exact format for lessonTitle: "Lesson {N}: {Title}" (e.g. "Lesson 3: Social Work Values & Ethics"). Do NOT include week numbers, parenthetical formats, or alternative conventions. Keep headers consistent across all items.
- Return ONLY the JSON object, no prose, no markdown`,
  }
