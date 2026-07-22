import { cleanText, stripTerminalPunctuation } from './compilerText';

// Rubric self-assessment copy is independently cacheable data. It remains a
// deterministic leaf so stronger evidence checks do not enlarge compiler code.
const GENERIC_SELF_ASSESSMENT_SIGNAL_RE =
  /^(?:criterion\b|strong evidence addresses\b|a strong signal addresses\b|look for evidence about\b|look for a concrete change\b|revise\b.+\bfor (?:this|the) criterion\b|mark the feedback-informed change\b)/i;

export function assignmentSelfAssessmentEvidenceCheck({
  evidenceSignal,
  index = 0,
  lessonNumber,
  lessonFocus,
  assignmentType,
}) {
  const signal = cleanText(evidenceSignal);
  if (signal && !GENERIC_SELF_ASSESSMENT_SIGNAL_RE.test(signal)) return signal;

  const focus = stripTerminalPunctuation(cleanText(lessonFocus, 'the lesson concept'));
  const artifact = stripTerminalPunctuation(cleanText(assignmentType, 'assignment')).toLowerCase();
  const checkFamilies = [
    [
      `Identify one inspectable ${focus} detail from the lesson materials, explain the ${artifact} decision it supports, and state one limitation`,
      `Point to a concrete ${focus} detail, connect it to a visible choice in the ${artifact}, and mark the boundary of the evidence`,
      `Use one verifiable ${focus} example to support the ${artifact}; show why it matters and what it cannot establish`,
      `Locate the specific ${focus} evidence behind the ${artifact} choice and distinguish the supported claim from an assumption`,
    ],
    [
      `Trace the reasoning from ${focus} evidence to the ${artifact} decision and name the assumption or tradeoff that could change it`,
      `Show each step from the ${focus} evidence to the main ${artifact} judgment, including the strongest competing explanation`,
      `Explain why the selected ${focus} evidence warrants the ${artifact} choice and identify the condition that would alter it`,
      `Connect the ${focus} source detail to the ${artifact} conclusion, then test the weakest link in that reasoning chain`,
    ],
    [
      `Make the evidence, decision, and limitation easy for a reader to locate in the ${artifact}`,
      `Organize the ${artifact} so a reader can find the claim, supporting ${focus} detail, and evidence boundary without guessing`,
      `Use headings or transitions to reveal where the ${artifact} moves from ${focus} evidence to interpretation and qualification`,
      `Check that the ${artifact} clearly signals its evidence, main judgment, and the point where the conclusion becomes provisional`,
    ],
    [
      `Name one feedback-informed revision to the ${artifact} and explain how it strengthened the evidence or reasoning`,
      `Mark the part of the ${artifact} changed after review and explain why the new version uses ${focus} evidence more effectively`,
      `Record one revision decision in the ${artifact}, the feedback behind it, and the reasoning improvement it produced`,
      `Compare the earlier and current ${artifact} reasoning, identifying the feedback that changed the evidence link or conclusion`,
    ],
  ];
  const criterionIndex = Math.max(0, Math.min(checkFamilies.length - 1, Number(index) || 0));
  const hasLessonNumber = Number.isFinite(Number(lessonNumber));
  const lessonVariantIndex = hasLessonNumber ? Math.max(0, Math.trunc(Number(lessonNumber)) - 1) % 4 : 0;
  return checkFamilies[criterionIndex][lessonVariantIndex];
}
export function buildGenericCriterionPerformanceBand({
  priority,
  concept,
  artifact,
  evidenceNoun,
  sourceCue,
  evidenceSignal,
  calibrationUse,
  revisionTarget,
  commonPitfall,
  formatLabel,
  pick = (variants) => variants[0],
}) {
  if (priority === 'analysis and decision logic') {
    return {
      exemplary: pick([
        `Explains how the selected evidence for ${concept} changes the decision in ${artifact}, names the tradeoff or limitation, and makes the reasoning inspectable for another scorer.`,
        `Traces the ${concept} evidence through the main ${artifact} decision, weighs a credible alternative, and shows where the conclusion must remain bounded.`,
        `Uses inspectable ${evidenceNoun} to justify the ${artifact} choice, tests the strongest competing explanation, and identifies the condition that could change the judgment.`,
        `Makes the reasoning chain visible from ${concept} evidence to the ${artifact} decision, including the consequential tradeoff and one unresolved evidence need.`,
      ]),
      proficient: `Connects relevant ${evidenceNoun} for ${concept} to the main ${artifact} decision with mostly clear reasoning and only minor gaps in limitation language.`,
      developing: `Mentions ${evidenceNoun} or ${concept} but leaves part of the decision logic, tradeoff, or limitation implicit in ${artifact}.`,
      beginning: `Lists ideas or opinions about ${concept} without linking inspectable ${evidenceNoun} to the decision required by ${artifact}.`,
      performanceBandEvidence: {
        priority,
        evidenceSignal,
        scorerQuestion: calibrationUse,
        commonPitfall,
        revisionTarget,
      },
    };
  }

  if (priority === 'feedback-informed revision') {
    return {
      exemplary: pick([
        `Shows a concrete feedback-informed change to ${artifact}, explains why the change improves ${evidenceNoun} or ${concept} reasoning, and names the remaining limitation.`,
        `Uses feedback to revise a visible part of ${artifact}; the submission explains the stronger ${concept} evidence link and the limit that still remains.`,
        `Documents the revision trail in ${artifact}: what feedback changed, which ${evidenceNoun} got stronger, and why the decision is now more defensible.`,
        `Turns feedback into an inspectable ${artifact} improvement by strengthening ${concept} reasoning and naming the next unresolved evidence question.`,
      ]),
      proficient: pick([
        `Identifies a relevant revision to ${artifact} and explains how feedback improved one important source-evidence or reasoning move.`,
        `Applies feedback to ${artifact} and gives a mostly clear explanation of how the revision improves ${concept} evidence or reasoning.`,
        `Names the feedback used, makes a visible revision in ${artifact}, and connects the change to the main ${evidenceNoun} move.`,
        `Shows that feedback shaped ${artifact}, though the explanation of the improved ${concept} reasoning may need one sharper detail.`,
      ]),
      developing: `Refers to feedback or revision but does not make the change, rationale, or connection to ${artifact} fully visible.`,
      beginning: pick([
        `Submits ${artifact} with little evidence that feedback was reviewed, applied, or used to improve the criterion.`,
        `Leaves the prior ${artifact} approach essentially unchanged and does not identify which feedback shaped the submission.`,
        `Provides no inspectable revision trail connecting feedback to a stronger ${concept} evidence or reasoning move in ${artifact}.`,
        `Mentions revision without showing the change, its rationale, or its effect on the scored ${artifact} criterion.`,
      ]),
      performanceBandEvidence: {
        priority,
        evidenceSignal,
        scorerQuestion: calibrationUse,
        commonPitfall,
        revisionTarget,
      },
    };
  }

  if (priority === 'professional communication and format fit') {
    return {
      exemplary: `Organizes ${artifact} in the expected ${formatLabel} format so the ${concept} claim, ${evidenceNoun}, limitation, and next action are easy to locate.`,
      proficient: pick([
        `Uses a clear structure for ${artifact} and communicates the main ${evidenceNoun} for ${concept} with only minor gaps in format, headings, or audience fit.`,
        `Presents ${artifact} in an organized format; the ${concept} evidence is findable, though one heading, transition, or audience cue may need tightening.`,
        `Makes the ${evidenceNoun} for ${concept} understandable in ${artifact}, with small format or reader-guidance gaps left to polish.`,
        `Keeps ${artifact} readable and task-focused while leaving a minor organization, heading, or audience-fit issue to revise.`,
      ]),
      developing: pick([
        `Includes useful ${concept} content, but the sequence of headings makes the ${evidenceNoun} difficult to trace in ${artifact}.`,
        `Shows relevant ${concept} evidence, though the format leaves the reader unsure which detail supports the main ${artifact} decision.`,
        `Contains usable ${evidenceNoun}, but the audience cue or layout needs revision before the ${artifact} argument is easy to follow.`,
        `Keeps the right ${concept} material, yet the organization should make the evidence path and next action clearer for ${artifact}.`,
      ]),
      beginning: pick([
        `Presents ${artifact} in a form that obscures the required ${evidenceNoun}, decision, or submission expectations.`,
        `Makes ${artifact} hard to interpret because the evidence, audience, or format expectations are not visible enough.`,
        `Submits ${artifact} with organization or format choices that hide the main ${concept} claim and supporting evidence.`,
        `Leaves the reader unsure how ${artifact} is organized, what evidence matters, or what decision the work is making.`,
      ]),
      performanceBandEvidence: {
        priority,
        evidenceSignal,
        scorerQuestion: calibrationUse,
        commonPitfall,
        revisionTarget,
      },
    };
  }

  return {
    exemplary: pick([
      `Uses precise ${evidenceNoun} about ${concept} from ${sourceCue}, uses that evidence to justify a visible choice in ${artifact}, names a limitation, and avoids invented source detail.`,
      `Grounds the ${concept} claim in ${sourceCue}, shows how the evidence changes ${artifact}, and states the boundary that keeps the conclusion honest.`,
      `Makes the source trail inspectable: ${evidenceNoun}, ${concept} reasoning, the artifact decision, and a credible limitation are all visible.`,
      `Selects relevant evidence from ${sourceCue}, explains why it matters for ${artifact}, and distinguishes supported claims from assumptions.`,
    ]),
    proficient: pick([
      `Uses relevant ${evidenceNoun} for ${concept} in ${artifact} with a mostly clear source connection and only minor gaps in precision or limitation language.`,
      `Connects ${concept} to source evidence and the main ${artifact} choice, though one evidence detail or boundary may need sharpening.`,
      `Shows the evidence path for ${artifact} clearly enough to score, with small gaps in precision, source naming, or limitation language.`,
      `Uses source-grounded ${concept} reasoning in ${artifact}; the main decision is supported even if one criterion needs more detail.`,
    ]),
    developing: pick([
      `Mentions ${concept} or ${sourceCue}, but the ${evidenceNoun} link, source boundary, or implication for ${artifact} remains partly implicit.`,
      `Includes some relevant evidence, yet the connection to ${concept} or the artifact decision is not fully explained.`,
      `Points toward ${sourceCue} without making the evidence, reasoning, and decision chain easy for a scorer to inspect.`,
      `Uses the right topic language but leaves the source basis or implication for ${artifact} underdeveloped.`,
    ]),
    beginning: pick([
      `Relies on general summary, unsupported claims, or missing source evidence instead of using inspectable ${evidenceNoun} for ${artifact}.`,
      `Lists ideas about ${concept} without showing which source evidence supports the claim or decision.`,
      `Leaves the scorer unable to locate the evidence path from ${sourceCue} to the artifact choice.`,
      `Submits broad statements about ${artifact} while omitting the source detail needed to judge the claim.`,
    ]),
    performanceBandEvidence: {
      priority,
      evidenceSignal,
      scorerQuestion: calibrationUse,
      commonPitfall,
      revisionTarget,
    },
  };
}
