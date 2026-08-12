const EXTENT_PRIORITIES = Object.freeze([
  'source traceability',
  'claim precision',
  'method transparency',
  'evidence selection',
  'interpretive restraint',
  'decision clarity',
  'limitation language',
  'revision visibility',
  'counterexample testing',
  'assumption checking',
  'audience fit',
  'criterion coverage',
  'reasoning continuity',
  'attribution accuracy',
  'uncertainty disclosure',
  'artifact coherence',
  'verification detail',
]);

const EXTENT_PARAMETER_RE =
  /\b(?:Length or Time|Length\/Time|Extent|Length or duration|Scale|Completion boundary)(?: for [^:]+)?:/i;

export function prioritizeAssignmentExtent(parameters = [], lessonNumber = 1) {
  const ordinal = Math.max(1, Number(lessonNumber) || 1);
  const priority = EXTENT_PRIORITIES[(ordinal - 1) % EXTENT_PRIORITIES.length];
  return parameters.map((parameter) =>
    EXTENT_PARAMETER_RE.test(parameter) ? `${parameter}. Within this boundary, prioritize ${priority}` : parameter,
  );
}

export function assignmentExtentRequirement({
  submissionProfile = {},
  assessment = {},
  lesson = {},
  operationWorkedExample = null,
} = {}) {
  const format = cleanText(
    [
      submissionProfile.assignmentType,
      submissionProfile.artifactGenre,
      submissionProfile.expectedFormat,
      assessment.title,
      assessment.artifact,
    ].join(' '),
  ).toLowerCase();
  if (/\b(?:oral|performance|recording|language-performance)\b/.test(format)) {
    return 'Prepare 5–8 minutes of recorded or live work plus a one-page evidence and revision note.';
  }
  if (/\b(?:checkpoint-response|quiz response|knowledge check)\b/.test(format)) {
    return 'Answer each prompt in 2–4 sentences (about 150–300 words total), then add one corrected rationale showing what changed after checking the evidence.';
  }
  if (lesson?.authenticDataTaskPlan?.protocol) {
    return 'Submit one annotated form–gloss–translation evidence table plus a 200–350-word analysis that identifies the pattern, cites the source locator, and states the limit on the conclusion.';
  }
  if (
    operationWorkedExample?.protocol === OPERATION_QUALIFIED_EVIDENCE_PROTOCOL &&
    /(?:calculat|comput|summar|standardiz|histogram|regress|correlat|proportion|interval|numeric|table)/i.test(
      String(operationWorkedExample?.operation || ''),
    )
  ) {
    const inputCount = asArray(operationWorkedExample.inputs).filter((value) => cleanText(value)).length;
    const stepCount = asArray(operationWorkedExample.steps).filter((value) => cleanText(value)).length;
    const complexity = inputCount + stepCount * 2;
    const interpretationRange = complexity >= 28 ? '350–500' : complexity >= 16 ? '225–350' : '150–250';
    return `Submit one replayable calculation record: given inputs, named steps, checked result, a ${interpretationRange}-word interpretation, and one boundary or sensitivity check. Do not turn the procedure into an essay.`;
  }
  if (
    lesson?.functionalVisualTaskContract?.protocol ||
    lesson?.instructionalIntent?.evidenceNeedKind === 'visual-specimen'
  ) {
    return 'Submit one annotated visual or matched comparison plus a 250–400-word note naming the decisive feature, warranted interpretation, counterexample, and claim boundary.';
  }
  if (/\b(?:presentation|pitch|slide)\b/.test(format)) {
    return 'Prepare 6–10 slides with speaker notes and a final source-list slide.';
  }
  if (
    /\b(?:analysis log|code|dataset note|experimental design|instrument revision|notebook|lab|problem-set|proof|prototype|design-test|portfolio|worksheet)\b/.test(
      format,
    )
  ) {
    return 'Use 3–5 labeled sections and include the evidence, test, or revision record needed for every rubric criterion.';
  }
  const minutes = Number(submissionProfile.workload?.outOfClassMinutes || 0);
  const wordRange = minutes > 0 && minutes <= 60 ? '500–800' : minutes > 120 ? '1,000–1,600' : '750–1,250';
  const focus = stripLessonPrefix(lesson?.title || '') || 'lesson evidence';
  return selectLessonVariant(lesson, [
    `Write ${wordRange} words in a PDF with separate sections for ${focus} evidence, interpretation, and the boundary on the claim.`,
    `Submit a ${wordRange}-word PDF that moves from one inspectable ${focus} detail to a justified decision and its limitation.`,
    `Use ${wordRange} words in PDF format; label the ${focus} observation, the inference it warrants, and what remains uncertain.`,
    `Prepare a ${wordRange}-word PDF whose headings expose the ${focus} source detail, reasoning step, decision, and evidence limit.`,
    `Build a ${wordRange}-word PDF around a traceable ${focus} claim, its visible support, a competing reading, and a bounded conclusion.`,
    `In a ${wordRange}-word PDF, document the ${focus} evidence path, defend the resulting choice, and identify the next check before transfer.`,
  ]);
}
import { asArray, cleanText, stripLessonPrefix } from './compilerText.js';
import { selectLessonVariant } from './courseCompilerRealization.js';
import { OPERATION_QUALIFIED_EVIDENCE_PROTOCOL } from './operationEvidenceContract.js';
