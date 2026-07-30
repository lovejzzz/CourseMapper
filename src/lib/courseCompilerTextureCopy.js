import { selectComposedLessonVariant, selectContextualLessonVariant } from './courseCompilerRealization.js';

export function assignmentEvidenceLine({ lesson, evidenceNoun, relatedLesson, assessmentTitle }) {
  return selectComposedLessonVariant(
    lesson,
    'assignments.deliverables.evidenceLine',
    [
      `${evidenceNoun} or citation notes tied to ${relatedLesson} course materials`,
      `Source notes that identify the ${relatedLesson} evidence used in the response`,
      `A brief evidence log naming the reading, activity, case, data, or course note that supports ${assessmentTitle}`,
      `A source trace showing where the main ${assessmentTitle} claim gets its support`,
    ],
    [
      'keep the source-to-claim link visible for review.',
      'label the decision that each cited detail supports.',
      'flag one limitation the evidence cannot resolve.',
      "distinguish assigned evidence from the student's own inference.",
    ],
  );
}

export function assignmentRevisionLine({ lesson, assessmentTitle, artifact }) {
  return selectComposedLessonVariant(
    lesson,
    'assignments.deliverables.revisionLine',
    [
      `A brief reflection names one revision decision for ${assessmentTitle}`,
      'A one-sentence revision log explains what changed before submission',
      'A short self-check names the weakest evidence link and the edit made to strengthen it',
      'A final note identifies the feedback, limitation, or criterion that shaped the last revision',
      `A submission note explains which rubric signal or source detail changed the final ${artifact}`,
      'A brief revision trace names the evidence, peer comment, or criterion students acted on',
      'A final self-review line shows what was clarified, narrowed, or corrected before upload',
    ],
    [
      'connect that change to one visible part of the submitted work.',
      'state why the new evidence or criterion warranted the change.',
      'identify the remaining uncertainty a reviewer should inspect.',
      'show how the revision improves the final decision rather than only the wording.',
    ],
  );
}

export function assignmentMilestoneDescription({ lesson, evidenceNoun, assessmentTitle }) {
  return selectComposedLessonVariant(
    lesson,
    'assignments.scaffoldingMilestones.description',
    [
      `Identify the concept, ${evidenceNoun}, and decision ${assessmentTitle} will address`,
      `Name the source detail, claim, and decision path that ${assessmentTitle} will make visible`,
      `Check that ${assessmentTitle} has one inspectable evidence cue and one defensible action or judgment`,
      `Connect the lesson concept to the support, limitation, and decision the submission will show`,
      'Mark the evidence students will use and the criterion it should help a reader verify',
      'Confirm that the work links concept, support, and revision target before final polishing',
    ],
    [
      'use that trace to focus the next feedback pass.',
      'keep the decision visible so a reviewer can check the reasoning.',
      'flag the remaining uncertainty before submission.',
      'carry the evidence link into the revision note.',
    ],
  );
}

export function studyGuidePrimaryHint({ lesson, context, lessonSourceCue, concept, artifact }) {
  return selectComposedLessonVariant(
    lesson,
    'studyGuides.reviewQuestions.primary.hint',
    [
      `Name ${context} and connect one source detail to the decision it changes`,
      `Use one inspectable detail from ${lessonSourceCue} and state what it lets you decide`,
      `Anchor the answer in ${context}, a source cue, and the artifact move it supports`,
      'Point to the evidence before explaining the choice or revision it makes defensible',
      `Separate the observed ${concept} detail from the interpretation built on it`,
      `Trace one ${lessonSourceCue} detail through the reasoning into ${artifact}`,
      `Compare one supported and one unsupported ${concept} conclusion`,
      `Identify the evidence boundary around the proposed ${artifact} move`,
    ],
    [
      'then name the limitation on that conclusion.',
      'show where the reasoning would change if the evidence changed.',
      `carry the decision into one visible ${artifact} revision.`,
      'distinguish the source detail from the inference drawn from it.',
      'explain which success criterion the evidence helps verify.',
      'add a counterexample that would weaken the current conclusion.',
      'state what another reader should inspect before accepting the decision.',
      'identify the next source detail needed to reduce uncertainty.',
      'show how the conclusion changes when one assumption is removed.',
      'name the transfer situation where the same reasoning would need retesting.',
      'turn the evidence boundary into one question for the next review.',
      `connect the strongest detail to a concrete ${artifact} feedback decision.`,
    ],
  );
}

export function studyGuideEvidenceNote({ lesson, week, evidenceNoun, title, concept, artifact }) {
  return selectComposedLessonVariant(
    lesson,
    'studyGuides.practiceActivities.evidenceNote',
    [
      `Create a ${week} three-column note with concept, ${evidenceNoun}, and decision for ${title}`,
      `Build a ${week} evidence card that names the concept, source detail, and decision it supports in ${title}`,
      `Sketch a two-row ${week} study table with one row for the claim and one for the evidence that changes it`,
      `Write a ${week} source-to-decision note showing how one ${evidenceNoun} detail changes the lesson claim`,
      `Diagram the ${week} chain from ${evidenceNoun} through reasoning to the ${artifact} decision`,
      `Annotate one ${concept} example with its source detail, inference, and limitation`,
      `Write a claim-evidence-limit card for ${title}`,
      `Compare one supported and one unsupported ${week} interpretation`,
    ],
    [
      'add the limitation that keeps the conclusion appropriately bounded.',
      'mark the exact detail a reviewer should be able to inspect.',
      'state what new evidence would reverse the decision.',
      `use the note to revise one part of ${artifact}.`,
      'explain which criterion the note helps a learner verify.',
      'add a counterexample that would weaken the claim.',
      'turn the strongest evidence link into a self-test question.',
      `identify one transfer use beyond the current ${artifact}.`,
      'mark the assumption that remains open to challenge.',
      'write one feedback question a peer could answer from the note.',
      'compare the conclusion with a plausible alternative interpretation.',
      "carry the bounded claim into the next lesson's evidence check.",
    ],
  );
}

export function slideFinalCarryForward({ lesson, concept, artifact }) {
  return selectComposedLessonVariant(
    lesson,
    'slideDecks.agenda.finalCarryForward',
    [
      `Synthesize the ${concept} evidence for the final course handoff`,
      `Complete the ${artifact} evidence chain before the course closes`,
      `Review the strongest ${concept} decision from the course`,
      `Prepare the final ${artifact} reasoning for an outside reader`,
    ],
    [
      'carry one revision priority into the final review.',
      'name the remaining uncertainty that still needs checking.',
      'show which source detail warrants the concluding decision.',
      'record the criterion that should govern the last revision.',
    ],
  );
}

export function slideCourseThroughline({ lesson, courseName, concept, artifact }) {
  return selectComposedLessonVariant(
    lesson,
    'slideDecks.bridge.courseThroughline',
    [
      `Course throughline: ${courseName}`,
      `Opening course arc: ${concept} begins the shared work`,
      `First evidence handoff: ${concept} starts the course sequence`,
      `Course launch: connect ${concept} to the final ${artifact}`,
    ],
    [
      'preview the evidence students will build across the semester.',
      'name the decision the later lessons will make more defensible.',
      "show how today's source work prepares the next artifact move.",
      'identify the question the course will keep revisiting.',
    ],
  );
}

export function slideDisciplinaryReasoningLine({ lesson, lens, concept, artifact }) {
  return selectContextualLessonVariant(
    lesson,
    [
      `Use ${concept} as a ${lens.domain} lens: identify which ${lens.evidenceNoun} matters before defending the ${lens.decisionNoun}.`,
      `As a ${lens.learnerRole}, trace one inspectable ${lens.evidenceNoun} detail through ${concept} into the ${lens.decisionNoun}.`,
      `Start the ${artifact} analysis with ${concept}, separating the observed ${lens.evidenceNoun} from the inference it supports.`,
      `Make ${concept} operational in ${artifact} by showing exactly where the ${lens.evidenceNoun} changes the ${lens.decisionNoun}.`,
      `Inspect the ${lens.evidenceNoun} through ${concept}, then state the ${lens.decisionNoun} a ${lens.learnerRole} can defend.`,
      `In ${artifact}, connect ${concept} to one visible ${lens.evidenceNoun} clue and explain the resulting ${lens.decisionNoun}.`,
      `Treat ${concept} as a working method: test the ${lens.evidenceNoun} before committing to the ${lens.decisionNoun}.`,
      `Test ${concept} against an inspectable ${lens.exampleNoun}, then mark the evidence that changes ${artifact}.`,
    ],
    'slideDecks.content.disciplinaryReasoning',
  );
}

export function slideEvidenceBoundaryLine({ lesson, lens, concept, artifact }) {
  return selectContextualLessonVariant(
    lesson,
    [
      `Before accepting the ${lens.decisionNoun}, distinguish what the ${lens.evidenceNoun} supports from what still needs testing in ${artifact}.`,
      `Test the boundary of ${concept} against the ${lens.evidenceNoun}; identify which condition would change the ${lens.decisionNoun}.`,
      `Separate the supported ${concept} claim from the assumption behind ${artifact}, and mark the uncertainty a reviewer should not miss.`,
      `Ask what the ${lens.evidenceNoun} can establish for ${artifact}, then state what evidence would warrant a different conclusion.`,
      `Qualify the ${concept} claim by naming what the ${lens.evidenceNoun} cannot yet establish for the ${lens.decisionNoun}.`,
      `Pressure-test the ${lens.decisionNoun}: identify the weakest ${lens.evidenceNoun} link and the next check it requires.`,
      `Mark the limit on ${concept} before revising ${artifact}; explain which missing detail could reverse the current decision.`,
      `Keep ${artifact} honest by separating the defensible ${lens.decisionNoun} from the conclusion the evidence does not support.`,
    ],
    'slideDecks.content.evidenceBoundary',
  );
}

export function lessonPlanWarmupDescription({ lesson, concept, artifact }) {
  return selectComposedLessonVariant(
    lesson,
    'lessonPlans.outline.warmup.description',
    [
      `Students retrieve one earlier example connected to ${concept}`,
      `Students mark one prior source detail that could inform ${artifact}`,
      'Students revisit a previous claim and identify the evidence behind it',
      `Students write a quick note about what they already know about ${concept}`,
      `Students select an earlier course detail that could change the ${artifact} decision`,
      'Students name one remembered example and the evidence it contains',
    ],
    [
      `they predict how that evidence should shape today's ${concept} work.`,
      `they state what would make the detail strong enough to use in ${artifact}.`,
      'they identify one missing fact the lesson must resolve before deciding.',
      "they test whether the earlier reasoning still applies to today's case.",
      'they turn the retrieval into one question that should guide the lesson.',
      `they explain which assumption the new ${concept} evidence must challenge.`,
    ],
  );
}

export function lessonPlanWarmupPurpose({ lesson, lens, concept, artifact }) {
  return selectComposedLessonVariant(
    lesson,
    'lessonPlans.warmUp.purpose',
    [
      `Frame the ${lens.domain} problem around ${concept}`,
      `Surface the prior ${lens.evidenceNoun} students can reuse`,
      `Move one remembered ${lens.exampleNoun} into the ${concept} work`,
      `Name what students already know before they revisit ${artifact}`,
    ],
    [
      `identify what the ${lens.decisionNoun} still requires.`,
      'mark one evidence gap the lesson must resolve.',
      'state which assumption still needs testing.',
      `turn the opening evidence into a question for ${artifact}.`,
    ],
  );
}

export function lessonPlanWarmupFacilitation({ lesson, lens, teachingMoves, artifact }) {
  return selectComposedLessonVariant(
    lesson,
    'lessonPlans.warmUp.facilitation',
    [
      teachingMoves.openingMove,
      `Start from one inspectable ${lens.exampleNoun}`,
      `Open with a concrete ${lens.exampleNoun}`,
      `Use the first minutes to notice ${lens.evidenceNoun}`,
    ],
    [
      `name the ${lens.domain} quality cue students should carry into ${artifact}.`,
      `ask which ${lens.evidenceNoun} can be trusted before students commit.`,
      `connect the strongest detail to the ${lens.decisionNoun}.`,
      `close by stating what a defensible ${lens.decisionNoun} in ${artifact} must show.`,
    ],
  );
}

export function lessonPlanCollaborativeNotes({ lesson, concept, artifactCheck, artifact }) {
  return selectComposedLessonVariant(
    lesson,
    'lessonPlans.outline.collaborative.instructorNotes',
    [
      `Require each group to identify the source detail behind its ${concept} claim`,
      `Ask teams to underline the evidence that changes their ${artifact} choice`,
      'Before the share-out, have each group name its claim and strongest source detail',
      `Press every team to separate observed ${concept} evidence from assumptions`,
      `Use the report-out to trace one source detail into a visible ${artifact} move`,
      `Have listeners challenge the weakest evidence link in each ${concept} recommendation`,
    ],
    [
      'the group must also name one limitation before the recommendation is accepted.',
      'listeners ask what additional evidence would reverse the decision.',
      'the presenter revises one reasoning step before the class moves on.',
      'the final report-out must show where evidence changes the artifact.',
      artifactCheck,
    ],
  );
}

export function lessonPlanDuringClass({ lesson, evidenceNoun, concept, artifact }) {
  return selectComposedLessonVariant(
    lesson,
    'lessonPlans.studentFacingSummary.duringClass',
    [
      `Work with peers to test which ${evidenceNoun} best supports ${concept}`,
      `Use the guided example to challenge one ${concept} assumption`,
      `Compare two possible ${artifact} evidence choices in class`,
      `Explain one ${concept} decision to a partner and invite a counterexample`,
      `Trace how ${evidenceNoun} changes the ${artifact} choice with a small group`,
      `Rehearse the ${concept} reasoning aloud and mark its weakest link`,
    ],
    [
      `then carry the stronger reasoning into your own ${artifact}.`,
      `record the deciding detail before completing ${artifact}.`,
      `revise the individual response where the evidence changes the decision.`,
      `name the remaining limitation in the independent ${artifact}.`,
      `use the peer challenge to sharpen one visible ${artifact} move.`,
      'finish independently and cite the evidence behind the choice.',
    ],
  );
}
