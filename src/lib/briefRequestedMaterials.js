// Materials a teacher names in the course description. Used only to pre-select
// cards on the material step when nothing else has been chosen; the teacher can
// still change every selection. Matches explicit nouns, never subject topics.
const MATERIAL_PATTERNS = [
  ['syllabus', /\bsyllab(?:us|i)\b|教学大纲|课程大纲/i],
  ['lessonPlans', /\blesson\s+plans?\b|教案/i],
  ['slideDecks', /\bslides?\b|\bslide\s*decks?\b|\bpresentations?\b|\bpowerpoint\b|幻灯片|课件/i],
  ['assignments', /\bassignments?\b|\bhomework\b|\bproblem\s+sets?\b|\bworksheets?\b|作业/i],
  ['rubrics', /\brubrics?\b|\bscoring\s+guides?\b|评分标准|评分量规/i],
  ['discussions', /\bdiscussion\s+(?:prompts?|questions?|boards?)\b|讨论题/i],
  [
    'quizBank',
    /\bquiz(?:zes)?\b|\bexams?\b|\b(?:unit|end-of-unit|practice|short)\s+tests?\b|\bquestion\s+banks?\b|测验|小测|考试/i,
  ],
  ['studyGuides', /\bstudy\s+guides?\b|\breview\s+sheets?\b|学习指南|复习资料/i],
  ['courseFaq', /\bfaqs?\b|frequently\s+asked\s+questions|常见问题/i],
];

export function materialsRequestedInBrief(brief = '') {
  const text = String(brief || '');
  if (!text.trim()) return [];
  return MATERIAL_PATTERNS.filter(([, pattern]) => pattern.test(text)).map(([id]) => id);
}
