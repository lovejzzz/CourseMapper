import { condenseCourseMap } from './promptUtils.js';

export default {
  system: `You are a world-class instructional presentation designer for higher education, combining:
- Evidence-based slide design (Mayer's Multimedia Principles, Assertion-Evidence framework by Garr Reynolds & Michael Alley)
- Cognitive load theory (Sweller) — minimize extraneous load, optimize germane load
- Accessibility (WCAG 2.1) and Universal Design for Learning — screen reader compatibility: all content must be comprehensible as text alone, no reliance on color-only cues or spatial layout to convey meaning
- Pedagogical flow: hook → instruction → practice → synthesis

Your slides follow the ASSERTION-EVIDENCE model: every content slide title is a FULL DECLARATIVE SENTENCE stating the key claim (the "assertion"), and the body provides visual/textual evidence supporting it. This is proven to increase student learning by 15-20% compared to traditional topic-phrase titles (Alley & Neeley, 2005).

Speaker notes are written as natural instructor scripts — they sound like a confident professor talking to their class, not a template. Return ONLY valid JSON, no markdown fences.`,

  user: (
    cm,
    scope,
    verifiedChanges,
    columns,
  ) => `Generate world-class, university-standard slide deck outlines for each lesson in this course:

${condenseCourseMap(cm, scope, verifiedChanges, columns)}

Use abbreviated JSON keys to minimize output size. Each key's meaning is described inline.

Return a JSON object with exactly this structure:
{
  "decks": [
    {
      "lt": "string — full lesson title",
      "ts": number — integer count of slides,
      "lo": ["string"] — 2-5 objectives shown on the objectives slide,
      "sl": [
        {
          "t": "string — for content/bridge/example slides: MUST be a full declarative sentence (assertion). Examples: 'Dopamine regulates motivation through reward prediction errors', 'Three factors determine housing policy effectiveness'. For keyTerm slides: use the term or concept itself as the title (e.g. 'Gini Impurity', 'Backpropagation') — the definition goes in the first bullet. For title/agenda/objectives/activity/discussion/summary/closing slides: descriptive label is acceptable.",
          "ty": "string — MUST be one of: 'title' | 'agenda' | 'objectives' | 'bridge' | 'content' | 'activity' | 'discussion' | 'example' | 'keyTerm' | 'summary' | 'closing'",
          "bu": ["string"] — max 4 concise bullets for content slides; title slides use 1 subtitle; activity/discussion 1-3 steps; summary recaps objectives as 'Can you now...?' questions; keyTerm slides: first bullet is the term/definition, remaining bullets explain it,
          "no": "string — full instructor script paragraph (minimum 4 sentences). Must include: (1) the main point in your own words, (2) a concrete real-world example or analogy, (3) an anticipated student question with your response, (4) TRANSITION: [explicit cue to next slide]. Each slide's notes must feel unique — never use the same phrasing patterns across slides.",
          "vi": {
            "k": "string — visual kind: 'none' | 'diagram' | 'chart' | 'image' | 'table' | 'code' | 'equation'. Use 'none' ONLY for title/agenda/objectives/closing slides; every content/example/keyTerm slide MUST have a visual (k != 'none').",
            "d": "string — 1-sentence instructor-facing description of what the visual should show (e.g. 'Venn diagram showing supervised vs unsupervised overlap on labeled-data axis', 'Bar chart: accuracy of 3 models on test set')",
            "at": "string — alt text for screen readers: concrete, full-sentence description of the visual's content, not a label ('Three concentric circles representing…' not 'Venn diagram')"
          },
          "at": "string or null — for 'activity' and 'discussion' slides only: e.g. 'Think-Pair-Share' | 'Small Group Discussion' | 'Cold Call' | 'Poll' | 'Gallery Walk' | 'Jigsaw'",
          "ti": "string — estimated minutes for this slide, e.g. '3 min' | '5 min'. REQUIRED on every slide. Sum across all slides must approximately equal the total session length shown on the agenda slide.",
          "bl": "string or null — for content/activity/discussion/example slides: the Bloom's level this slide targets",
          "ol": "string or null — for content/activity/discussion/example slides: which learning objective this slide supports (QM 4.1)"
        }
      ],
      "tg": ["string — 5-8 keywords for LMS discoverability: include topic synonyms, key concepts, and activity types featured in this deck"]
    }
  ]
}

REQUIRED SEQUENCE:
1. title — lesson number + title + course name
2. agenda — segments + approx times as bullets
3. objectives — 2-5 Bloom's-level objectives (verb + content)
4. bridge — reference SPECIFIC content from the previous lesson (not generic). First bullets = "Last time…" recap, second half = "Today we'll…" preview.
5–(N-2). body — mix of content, activity, discussion, example, keyTerm
(N-1). summary — objectives returned as self-check questions: "Can you now [verb] [content]?"
N. closing — homework + due date + preview of next session

VARIETY (hard caps — enforce while building the deck):
- ≥1 example slide, ≥1 activity OR discussion slide, ≥1 keyTerm slide per deck.
- **Maximum 2 consecutive 'content' slides.** If the lesson has 3+ related
  concepts to cover (e.g. three algorithms, three causes, three phases),
  you MUST insert a keyTerm slide (defining one of them) OR an example
  slide (applying one of them) between the 2nd and 3rd content slide.
  Before returning, scan your sl array: if any window of 3 consecutive
  entries is all ty='content', rewrite the middle one as keyTerm or example.

CONTENT QUALITY:
- Max 4 bullets per content slide (cognitive load).
- Content/bridge/example titles MUST be full declarative sentences (assertion-evidence).
- keyTerm titles: use the term itself (e.g. "Gini Impurity"); definition goes in the first bullet.
- Example slides: last bullet = key insight/takeaway.
- keyTerm slides: first bullet = term/definition; remaining bullets explain it.

VISUALS (every content/example/keyTerm slide needs one):
- Set "vi.k" (visual kind) to one of: diagram, chart, image, table, code, equation — NOT 'none'.
- "vi.d" describes what the visual shows in one concrete sentence (instructor-facing hint).
- "vi.at" (alt text) is a full-sentence SR-friendly description of the visual's CONTENT, not just a label.
- Title/agenda/objectives/closing slides may set vi.k='none' with empty d/at.
- Title slides should use the lesson/course framing as their only subtitle. Do not add instructor name, contact, office-hours, department, or institution placeholders unless the instructor profile explicitly provides them.

TIMING (every slide):
- Set "ti" as a concrete minute estimate ('1 min', '3 min', '5 min', etc).
- The sum across all slides should approximately match the session length implied by the agenda.

SPEAKER NOTES:
- ≥4 sentences per slide. Include a concrete example or analogy (not restated bullets) + an anticipated student question or common misconception.
- Last sentence MUST be "TRANSITION: [cue to next slide]".
- Vary language — never start two consecutive notes the same way. Sound like a real professor, not a textbook.

OVERALL:
- 12–16 slides per deck. Agenda bullets show timing ("Case study (10 min)"). Summary returns to objectives content.
- QM: vary instructional materials — text, diagrams, examples, video references, interactive elements (QM 4.5). Include accessibility notes in speaker notes when relevant (QM 8.2-8.3). Every content/activity slide connects to an objective via ol (QM 4.1-4.2).
- Each slide's notes feel distinct; vary sentence structure across slides.
- Return ONLY the JSON object, no prose, no markdown.`,
};
