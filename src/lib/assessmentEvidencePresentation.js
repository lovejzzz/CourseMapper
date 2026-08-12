import { asArray, cleanText, humanSourceCueLabel, stripLessonPrefix, stripTerminalPunctuation } from './compilerText';
import { buildComparativeLiteraturePerformanceBand } from './courseCompilerComparativeRubricBands';
import { buildCodeLabCriterionPerformanceBand, buildGenericCriterionPerformanceBand } from './courseCompilerRubricCopy';

// Course-neutral assessment evidence presentation lives outside the compiler
// controller so rubric prose, anchor examples, and their variation tables do
// not enlarge the orchestration chunk.
export function createAssessmentEvidencePresentation({
  ensureSentenceCompiler,
  isCodeLabAssessment,
  lessonVariant,
  musicIntervalRubricProfile,
  safeLessonArtifact,
  safeLessonPrimaryConcept,
}) {
  function buildCriterionPerformanceBand({
    assessment,
    lesson,
    criterion,
    planEntry,
    evidenceEntry,
    lens,
    submissionProfile = null,
  }) {
    const codeLabBand =
      isCodeLabAssessment(assessment) || lesson?.artifactGenre?.genre === 'code-lab'
        ? buildCodeLabCriterionPerformanceBand({
            artifact: stripTerminalPunctuation(cleanText(assessment.artifact || assessment.title, 'the code lab')),
            criterion,
            criteria: assessment.criteria,
            evidenceEntry,
          })
        : null;
    if (codeLabBand) return codeLabBand;
    const musicProfile = musicIntervalRubricProfile(lesson);
    const musicCriterion = musicProfile?.find((entry) => entry.criterion === criterion);
    if (musicCriterion) {
      return {
        exemplary: musicCriterion.exemplary,
        proficient: musicCriterion.proficient,
        developing: musicCriterion.developing,
        beginning: musicCriterion.beginning,
        performanceBandEvidence: {
          priority: musicCriterion.priority,
          evidenceSignal: musicCriterion.evidenceSignal,
          scorerQuestion:
            evidenceEntry?.calibrationQuestion ||
            `Can two scorers reproduce the interval label from the submitted evidence for "${criterion}"?`,
          commonPitfall: musicCriterion.beginning,
          revisionTarget:
            evidenceEntry?.feedbackMove ||
            `Revise "${criterion}" by showing the missing count, pitch evidence, verification rule, or correction step.`,
        },
      };
    }
    const comparativeLiteratureBand = buildComparativeLiteraturePerformanceBand({
      assessment,
      criterion,
      planEntry,
      evidenceEntry,
    });
    if (comparativeLiteratureBand) return comparativeLiteratureBand;
    const concept =
      lesson?.keyConcepts?.[0] || stripLessonPrefix(lesson?.title || assessment.relatedLessons?.[0] || '');
    const artifact = stripTerminalPunctuation(assessment.artifact || assessment.title);
    const sourceCue =
      lesson?.evidencePlan?.sourceCue || lesson?.readings?.[0] || `${stripLessonPrefix(lesson?.title || '')} materials`;
    const priority = planEntry.priority || 'criterion evidence';
    const evidenceSignal =
      planEntry.evidenceSignal ||
      evidenceEntry?.evidenceNeeded ||
      `Look for ${concept} evidence that changes a visible choice in ${artifact}.`;
    const calibrationUse =
      planEntry.calibrationUse ||
      evidenceEntry?.calibrationQuestion ||
      `Ask whether two scorers can point to the same evidence for "${criterion}" in ${artifact}.`;
    const revisionTarget =
      planEntry.feedbackUse ||
      evidenceEntry?.feedbackMove ||
      `Revise ${artifact} by adding criterion-specific evidence and one limitation.`;
    const commonPitfall =
      priority === 'analysis and decision logic'
        ? `Do not give full credit for naming ${concept} terms without explaining the decision logic in ${artifact}.`
        : priority === 'feedback-informed revision'
          ? `Do not give full credit for saying feedback was used without showing what changed in ${artifact}.`
          : priority === 'professional communication and format fit'
            ? `Do not give full credit for polished prose if organization or format hides the ${concept} evidence in ${artifact}.`
            : `Do not give full credit for broad summary, invented source detail, or unsupported ${concept} claims in ${artifact}.`;

    return buildGenericCriterionPerformanceBand({
      priority,
      concept,
      artifact,
      evidenceNoun: lens.evidenceNoun,
      sourceCue,
      evidenceSignal,
      calibrationUse,
      revisionTarget,
      commonPitfall,
      formatLabel:
        (asArray(submissionProfile?.parameterLines).length > 0 ? submissionProfile?.assignmentType : '') ||
        lesson?.artifactGenre?.label ||
        lens.domain,
      pick: (variants) => lessonVariant(lesson, variants),
    });
  }

  function buildAssessmentAnchorExamples(lesson, criteria, criterionEvidenceMap, validityEvidence) {
    const concept = safeLessonPrimaryConcept(lesson);
    const artifact = safeLessonArtifact(lesson);
    const sourceCue = humanSourceCueLabel(
      lesson.evidencePlan?.sourceCue || lesson.readings?.[0],
      `${stripLessonPrefix(lesson.title)} materials`,
    );
    const primaryCriterion = criteria[0] || `${concept} evidence quality`;
    const primaryCriterionCore =
      cleanText(primaryCriterion).replace(/\s+[—–-]\s+(?:emphasis on|check|prioritize)\s+[^—–]+$/i, '') ||
      primaryCriterion;
    const strongSignal =
      criterionEvidenceMap?.[0]?.strongSignal ||
      `Strong evidence names a relevant ${concept} detail and connects it directly to ${artifact}.`;
    const partialSignal =
      criterionEvidenceMap?.[0]?.partialSignal ||
      `Partial evidence mentions ${concept} or ${artifact} but leaves the reasoning implicit.`;
    return {
      strongSample: lessonVariant(lesson, [
        `Strong ${artifact} anchor. It cites one detail from ${sourceCue}. It explains the ${concept} decision, names one limit, and shows the revision.`,
        `Strong ${artifact} anchor. It points to ${sourceCue} and explains the ${concept} evidence move. It identifies a limit and shows the revision.`,
        `Strong ${artifact} anchor. It uses ${sourceCue} to support the ${concept} decision. It explains the evidence and records the final improvement.`,
        `Strong ${artifact} anchor. It grounds the claim in ${sourceCue}. It separates evidence from assumption and names the feedback-based edit.`,
        `A strong ${artifact} cites ${sourceCue}, shows how the detail changes the ${concept} judgment, and records the bounded revision.`,
        `Exemplary ${artifact} evidence traces one ${sourceCue} detail into a ${concept} decision, qualifies the claim, and marks the improvement.`,
        `The strong ${artifact} model makes the ${sourceCue} support inspectable, defends the ${concept} move, and preserves one honest limit.`,
        `In a strong ${artifact}, the learner names the decisive ${sourceCue} evidence, explains its ${concept} consequence, and documents the revision.`,
        `A defensible ${artifact} anchor separates the ${sourceCue} observation from inference, uses ${concept} accurately, and shows what feedback changed.`,
        `The higher-quality ${artifact} points to ${sourceCue}, justifies the ${concept} conclusion, states its boundary, and leaves a visible edit trail.`,
        `Strong work on ${artifact} connects ${sourceCue} to the scoring criterion, explains the ${concept} reasoning, and revises the weakest link.`,
        `The model ${artifact} earns confidence by locating ${sourceCue} evidence, bounding the ${concept} claim, and showing a feedback-informed correction.`,
      ]),
      partialSample: lessonVariant(lesson, [
        `Partial ${artifact} anchor: summarizes ${concept}, mentions ${sourceCue} generally, but does not make the evidence link, limitation, or revision decision inspectable.`,
        `Partial ${artifact} anchor: names ${concept} and gestures toward ${sourceCue}, yet the scorer cannot see which source detail should change the work.`,
        `Partial ${artifact} anchor: uses the right topic language, but the source boundary, limitation, and next revision remain too broad to verify.`,
        `Partial ${artifact} anchor: points to ${sourceCue} without showing the exact evidence difference that would make the stronger sample defensible.`,
        `The partial ${artifact} names ${sourceCue} but never explains how that detail warrants the ${concept} decision or constrains it.`,
        `A developing ${artifact} uses ${concept} vocabulary while leaving the relevant ${sourceCue} evidence and revision consequence implicit.`,
        `This incomplete ${artifact} gestures at ${sourceCue}; the reader still cannot locate the support, boundary, or feedback-based change.`,
        `The weaker ${artifact} reports a ${concept} conclusion without tracing it to a specific ${sourceCue} detail or testing a limitation.`,
        `Partial work on ${artifact} includes the topic and source label, yet omits the evidence-to-decision reasoning a scorer needs.`,
        `The ${artifact} remains developing because its ${sourceCue} reference is broad, its ${concept} inference is unbounded, and no revision is visible.`,
        `A limited ${artifact} mentions evidence but does not distinguish the ${sourceCue} observation from the ${concept} interpretation built on it.`,
        `The partial model for ${artifact} leaves the main ${sourceCue} support, the decision boundary, and the resulting edit too vague to verify.`,
      ]),
      criterionFocus: primaryCriterion,
      strongSignal,
      partialSignal,
      scoringRationale: `In ${stripLessonPrefix(lesson.title)}, score the strong ${artifact} anchor higher because its evidence is inspectable. It addresses ${primaryCriterion}. Target evidence: ${ensureSentenceCompiler(cleanText(validityEvidence?.targetConstruct) || `${artifact} performance evidence`)}`,
      revisionPrompt: lessonVariant(lesson, [
        `Revise the partial ${artifact} anchor by making the ${primaryCriterionCore} evidence inspectable. Use ${sourceCue}. For ${stripLessonPrefix(lesson.title)}, name one limit and state what changed before submission.`,
        `Repair the partial ${artifact} anchor with a precise detail from ${sourceCue}. Show how it satisfies ${primaryCriterionCore}, then record the edit and its boundary.`,
        `Strengthen the weaker ${artifact} sample by tracing ${primaryCriterionCore} to ${sourceCue}. Identify the unsupported move and replace it with a visible revision.`,
        `Turn the partial ${artifact} anchor into scorable evidence: point to ${sourceCue}, explain the ${primaryCriterionCore} decision, and mark the before-and-after change.`,
        `Rework the incomplete ${artifact} example so a scorer can verify ${primaryCriterionCore}. Cite the relevant ${sourceCue} detail and state what the evidence cannot establish.`,
        `Use ${sourceCue} to resolve the main gap in the partial ${artifact} anchor. Connect the correction to ${primaryCriterionCore} and annotate the revision made.`,
        `Audit the partial ${artifact} sample against ${primaryCriterionCore}. Add the missing ${sourceCue} evidence, remove one unsupported claim, and explain the improvement.`,
        `Complete the ${artifact} anchor by making ${primaryCriterionCore} observable. Ground the decision in ${sourceCue}, document the change, and preserve one open question.`,
      ]),
      scorerCalibrationUse: `Before grading, scorers compare the strong and partial ${artifact} anchors, point to the exact evidence difference, and reconcile disagreements before scoring student work.`,
      studentFacingUse: lessonVariant(lesson, [
        `Review the strong and partial ${artifact} samples before you submit, then self-check your ${concept} evidence, reasoning, limitation, and revision quality.`,
        `Before submitting ${artifact}, compare the two anchors and mark where the evidence for ${concept}, its boundary, and the revision choice are visible.`,
        `Use the anchor contrast to audit your ${artifact}: name the source detail, explain the ${concept} decision, and revise any unsupported claim.`,
        `Check your ${artifact} against the stronger anchor by finding the ${concept} evidence, limitation, reasoning link, and improvement that a scorer can inspect.`,
      ]),
      instructorAnchorShare: lessonVariant(lesson, [
        `Share the strong/partial ${artifact} anchor contrast before students submit so they can self-check evidence, reasoning, limitation, and revision quality.`,
        `Show both ${artifact} anchors before drafting ends, then ask students to identify the source detail and revision move that separate them.`,
        `Use the anchor pair as a calibration stop: students name the stronger evidence path before they revise ${artifact}.`,
        `Display the two ${artifact} anchors during feedback so students can locate the evidence gap, limitation, and next edit in their own work.`,
      ]),
    };
  }

  const constructedFactAnalysisInstructionForLesson = (lesson = {}) =>
    lessonVariant(lesson, [
      'Identify the course concept it supports, explain the relationship using one exact detail, and state one conclusion the evidence does not establish.',
      'Name the taught concept that makes this statement relevant, cite its decisive evidence detail, and state one limitation on the resulting claim.',
      'Select the most relevant course concept; use one exact evidence phrase to justify the connection and mark the boundary of the resulting inference.',
      'Choose the lesson concept this evidence informs, point to the controlling observation, and explain one conclusion the statement does not prove.',
      'Identify the course concept supported by this statement, cite the detail that controls that choice, and state what remains unproven.',
      'Name one taught concept, reference the exact source claim that supports it, and preserve one evidence boundary on the conclusion.',
      'Select the concept that gives this statement significance, use its evidence wording to justify the interpretation, and name one limitation.',
      'Choose the course concept best illuminated by this statement, cite one quoted detail, and identify a broader claim the evidence does not establish.',
    ]);

  return {
    buildAssessmentAnchorExamples,
    buildCriterionPerformanceBand,
    constructedFactAnalysisInstructionForLesson,
  };
}
