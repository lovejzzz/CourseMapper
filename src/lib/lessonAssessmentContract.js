import { cleanText, stripLessonPrefix } from './compilerText.js';

export function stableLessonContractObjective(lesson = {}) {
  const focus = stripLessonPrefix(cleanText(lesson?.title || lesson?.topic || 'this lesson')) || 'this lesson';
  return `Apply ${focus} in one practical example and justify one evidence-based revision.`;
}
