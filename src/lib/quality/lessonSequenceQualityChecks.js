function clean(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function titleKey(value) {
  return clean(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * An explicit, ordered "Lessons cover:" brief is source truth. Three or more
 * lessons carrying the same exact cover title means the plan collapsed even
 * if every exported file is internally consistent. This caught a real
 * 14-topic Nutrition run that omitted fiber and vitamins, then emitted three
 * "Final project" lessons while the old grader still awarded B/89.
 */
export function checkExplicitLessonSequenceReuse(findings, byLesson, course = {}) {
  const source = `${course?.prompt || ''} ${course?.description || ''} ${course?.sourceText || ''}`;
  if (!/\blessons?\s+cover\s*:/i.test(source) || !(byLesson instanceof Map)) return;

  const byTitle = new Map();
  for (const [lessonNumber, entries] of byLesson) {
    for (const entry of entries || []) {
      const key = titleKey(entry?.title);
      if (!key) continue;
      if (!byTitle.has(key)) byTitle.set(key, { title: clean(entry.title), lessons: new Set(), paths: [] });
      const group = byTitle.get(key);
      group.lessons.add(Number(lessonNumber));
      group.paths.push(entry.path);
    }
  }

  for (const group of byTitle.values()) {
    const lessons = [...group.lessons].filter(Number.isFinite).sort((left, right) => left - right);
    if (lessons.length < 3) continue;
    findings.add({
      severity: 'P0',
      dimension: 'consistency',
      file: group.paths[0] || 'lesson sequence',
      detail: `Explicit source lesson sequence collapsed into repeated "${group.title}" sessions`,
      evidence: `Lessons ${lessons.join(', ')} share the same title although the source lists an ordered topic sequence`,
    });
  }
}
