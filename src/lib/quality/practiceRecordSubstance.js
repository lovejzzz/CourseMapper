const labels = ['Objective', 'Evidence target', 'Decision boundary', 'Required product'];
export function isMetadataOnlyPracticeRecord(record) {
  const records = record?.records;
  return (
    Array.isArray(records) &&
    records.length >= 2 &&
    records.every((value) =>
      /^Record\s+[A-Z]\s*[-–—:]\s*(?:Objective|Evidence target|Decision boundary|Required product)\s*:/i.test(
        String(value),
      ),
    )
  );
}
export function checkMetadataOnlyQuizPractice(findings, { files = [], manifest = {} }, course = {}) {
  // In curriculum/assessment design, lesson instructions can legitimately be
  // the object of analysis. The guard targets unrelated subject worksheets.
  if (
    /\b(?:curriculum design|instructional design|assessment design|teacher education|lesson planning)\b/i.test(
      `${course.title || ''} ${manifest.courseName || ''}`,
    )
  )
    return;
  for (const file of files) {
    if (file.featureId !== 'quizBank') continue;
    const text = file.text || '';
    if (!labels.every((label) => new RegExp(`Record\\s+[A-Z]\\s*[-–—:]\\s*${label}\\s*:`, 'i').test(text))) continue;
    const evidence = text.match(/Record\s+A\s*[-–—:]\s*Objective\s*:.{0,150}/i)?.[0] || '';
    findings.add({
      code: 'QUIZ_METADATA_ONLY_PRACTICE',
      severity: 'P1',
      dimension: 'substance',
      file: file.path,
      detail: 'quiz practice supplies lesson instructions instead of subject inputs',
      evidence,
    });
  }
}
