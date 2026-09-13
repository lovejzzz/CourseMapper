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
        message:
          'Background explanations still need verified sources. The practice task and its API links do not replace that check.',
        target: { type: 'courseMapCell', lessonIndex: index, sectionIndex: 0, field: 'supportingResources' },
      },
    ];
  });
}
