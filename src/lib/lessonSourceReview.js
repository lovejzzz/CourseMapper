/** Report explicit gaps without treating an API link or a generated exercise
 * as verified factual background. No receipt or admission is changed here. */
export function lessonSourceReviewItems(courseMap, courseGraph) {
  const content = courseGraph?.enrichmentOverlay?.lessonContent;
  if (!content || typeof content !== 'object') return [];
  return (courseMap?.lessons || []).flatMap((lesson, index) => {
    const entry = content[`lesson-${index + 1}`];
    if (!entry) return [];
    const provisional =
      entry.sourceFactAuthority === 'model-provisional' ||
      entry.semanticAdmissionReceipt?.evidenceAuthorityStatus === 'needs-evidence';
    if (!provisional) return [];
    return [
      {
        lessonIndex: index,
        title: lesson.title || `Lesson ${index + 1}`,
        message: 'Verify this lesson’s background explanation against a reliable source.',
        target: { type: 'courseMapCell', lessonIndex: index, sectionIndex: 0, field: 'supportingResources' },
      },
    ];
  });
}
