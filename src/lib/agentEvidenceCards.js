/**
 * Build the compact, read-only evidence ledger included in Agent context.
 *
 * This leaf stays independently cacheable because source-grounded course
 * evidence is useful to every Agent route but should not inflate the main
 * conversation-control chunk.
 */
export function buildAgentCourseSections(studyGuideData, courseLessons = [], getArrayKey) {
  const arcLines = courseLessons
    .map((lesson, index) => {
      const assessment = String(lesson?.sections?.[0]?.weeklyAssessments || '')
        .split(/[.;\n]/)[0]
        .trim();
      return assessment ? `  W${index + 1}: ${assessment.slice(0, 90)}` : '';
    })
    .filter(Boolean);
  const arrayKey = studyGuideData && getArrayKey?.('studyGuides', studyGuideData);
  const guides = arrayKey && Array.isArray(studyGuideData[arrayKey]) ? studyGuideData[arrayKey].slice(0, 10) : [];
  const lines = guides.flatMap((guide, lessonIndex) => {
    const title = String(
      guide?.lessonTitle ||
        guide?.lt ||
        guide?.title ||
        guide?.t ||
        courseLessons[lessonIndex]?.title ||
        `Lesson ${lessonIndex + 1}`,
    ).replace(/^Lesson\s+\d+\s*:\s*/i, '');
    const terms = guide?.keyTerms || guide?.kt || [];
    return terms.slice(0, 3).map((term) =>
      JSON.stringify({
        lesson: lessonIndex + 1,
        title: title.slice(0, 100),
        term: String(term?.term || term?.tm || term?.title || term?.t || '').slice(0, 80),
        definition: String(term?.definition || term?.df || term?.description || term?.d || '').slice(0, 240),
      }),
    );
  });
  return {
    briefSection: arcLines.length ? `\n**Assessment arc:**\n${arcLines.join('\n')}` : '',
    evidenceSection: lines.length
      ? `\n**Compiled evidence cards (source-grounded, read-only):**\n${lines.map((line) => `  ${line}`).join('\n')}`
      : '',
  };
}
