import { cleanText, stripLessonPrefix } from './compilerText.js';

const PROSE_KEYS = [
  'objectives',
  'sourceEvidenceBrief',
  'warmUp',
  'outline',
  'evidenceBase',
  'formativeCheck',
  'homework',
];
const IDENTITY_KEY = /^(?:title|lessonTitle|assessmentTitle|assignmentTitle|rubricTitle|name|id|tags)$/i;

export function compressLessonPlanTitleReferences(plan, lesson = {}) {
  const focus = stripLessonPrefix(cleanText(lesson.title || plan.lessonTitle));
  if (focus.split(/\s+/).length < 4) return plan;
  const escaped = focus.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const mention = new RegExp(`(\\b(?:the|a|an|your|their|its|our)\\s+)?\\b${escaped}(?![A-Za-z0-9])`, 'gi');
  let count = 0;
  const result = { ...plan };
  for (const key of PROSE_KEYS) {
    if (plan[key] === undefined) continue;
    result[key] = JSON.parse(
      JSON.stringify(plan[key], (childKey, value) => {
        if (typeof value !== 'string' || IDENTITY_KEY.test(childKey)) return value;
        return value.replace(mention, (match, _determiner, offset, whole) => {
          count += 1;
          if (count <= 4) return match;
          return offset === 0 || /[.!?]\s+$|\n\s*$/.test(whole.slice(0, offset)) ? 'This lesson' : 'this lesson';
        });
      }),
    );
  }
  return result;
}
