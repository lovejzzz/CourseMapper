/**
 * Pre-segment syllabus text by week/lesson/module markers.
 * Adds `--- SEGMENT N ---` labels so the AI can align content to the correct lesson.
 * Returns original text unchanged if fewer than 2 segments are detected.
 */
export function segmentSyllabus(text) {
  if (!text || text.length < 200) return text;
  const parts = text.split(/(?=(?:^|\n)\s*(?:Week|Lesson|Module|Session|Unit|Class)\s+\d+)/gi).filter(Boolean);
  if (parts.length < 2) return text;
  return parts.map((part, i) => `\n--- SEGMENT ${i + 1} ---\n${part.trim()}`).join('\n');
}
