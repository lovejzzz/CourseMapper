export function normalizeLessonSpecificTokens(line, lessonTitles = []) {
  let normalized = String(line);
  const titles = lessonTitles
    .map((lessonTitle) =>
      String(lessonTitle || '')
        .replace(/^(?:Lesson|Week)\s+\d+\s*[:.-]\s*/i, '')
        .trim(),
    )
    .filter((title) => title.length >= 2)
    .sort((a, b) => b.length - a.length);
  for (const title of titles) {
    const escapedTitle = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    normalized = normalized.replace(
      new RegExp(`(?<![\\p{Letter}\\p{Number}_])${escapedTitle}(?![\\p{Letter}\\p{Number}_])`, 'giu'),
      '[lesson topic]',
    );
  }
  return normalized
    .replace(/\bWeek\s+\d+\b/gi, 'Week N')
    .replace(/\bLesson\s+\d+\b/gi, 'Lesson N')
    .replace(/\b\d+\b/g, '#')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}
