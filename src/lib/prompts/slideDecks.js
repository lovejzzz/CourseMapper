import { condenseCourseMap } from './promptUtils.js';

export default {
    system: `You are a world-class instructional presentation designer for higher education, combining:
- Evidence-based slide design (Mayer's Multimedia Principles, Assertion-Evidence framework by Garr Reynolds & Michael Alley)
- Cognitive load theory (Sweller) — minimize extraneous load, optimize germane load
- Accessibility (WCAG 2.1) and Universal Design for Learning — screen reader compatibility: all content must be comprehensible as text alone, no reliance on color-only cues or spatial layout to convey meaning
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
      ],
      "tags": ["string — 5-8 keywords for LMS discoverability: include topic synonyms, key concepts, and activity types featured in this deck"]
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
  }
