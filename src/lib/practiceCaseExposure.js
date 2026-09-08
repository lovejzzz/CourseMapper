import { sha256HexSync } from './sha256Sync.js';

function caseKey(records) {
  const texts = (records || [])
    .map((r) =>
      String(typeof r === 'string' ? r : r?.text || '')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .filter(Boolean);
  return texts.length ? sha256HexSync(JSON.stringify([...new Set(texts)].sort())) : null;
}

// This records exact case reuse in the compiled course, not a claim about
// what a particular learner has seen or about semantic novelty of paraphrases.
export function annotatePracticeCaseExposure(lessons = []) {
  const seen = new Map();
  const updated = new Map();
  for (const lesson of [...lessons].sort((a, b) => a.lessonNumber - b.lessonNumber)) {
    const task = lesson.teachingTask;
    if (!task) continue;
    const taughtKey = caseKey(task.inputs);
    if (taughtKey && !seen.has(taughtKey)) seen.set(taughtKey, lesson.lessonNumber);
    const sequence = (task.sequence || []).map((unit) => {
      if (unit.kind !== 'independent-transfer') return unit;
      const fingerprint = caseKey(unit.sources);
      if (!fingerprint) return unit;
      const firstLessonNumber = seen.get(fingerprint);
      if (firstLessonNumber === undefined) {
        seen.set(fingerprint, lesson.lessonNumber);
        return unit;
      }
      const zh = task.language === 'zh';
      const question = String(unit.question || '').replace(
        /^(?:Apply the requirements to this new case\.|将这些要求应用到以下新案例。)/,
        zh ? '继续使用以下案例，完成本课的新要求。' : 'Continue with this case and apply this lesson’s requirements.',
      );
      return {
        ...unit,
        question,
        caseExposure: { version: 1, kind: 'reused-in-course', firstLessonNumber, fingerprint },
      };
    });
    updated.set(lesson, { ...lesson, teachingTask: { ...task, sequence } });
  }
  return lessons.map((lesson) => updated.get(lesson) || lesson);
}

export function reusedPracticeCase(task) {
  return (
    task?.sequence?.find((unit) => unit.kind === 'independent-transfer')?.caseExposure?.kind === 'reused-in-course'
  );
}
