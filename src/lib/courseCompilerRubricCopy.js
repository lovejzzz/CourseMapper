export function buildCodeLabCriterionPerformanceBand({ artifact, criterion, criteria = [], evidenceEntry }) {
  const codeLabCriteria = criteria.map((entry) => String(entry || '').trim()).join(' | ');
  if (!/\bcode clarity\b/i.test(codeLabCriteria) || !/\btest evidence\b|\bverification\b/i.test(codeLabCriteria)) {
    return null;
  }
  const name = String(criterion || 'criterion').trim();
  let bands;
  if (/\bcorrectness\b|\bcomputed\b/i.test(name)) {
    bands = {
      exemplary: `All required outputs in ${artifact} are correct, reproducible, and interpreted against the task conditions.`,
      proficient: `Required outputs in ${artifact} are substantially correct, with only a minor error that does not change the main conclusion.`,
      developing: `Some outputs in ${artifact} are correct, but a material computation or interpretation error remains.`,
      beginning: `${artifact} does not produce the required outputs or the submitted results cannot be reproduced.`,
      commonPitfall:
        'Do not award correctness credit for polished explanation when the submitted computation is absent or wrong.',
    };
  } else if (/\bcode clarity\b|\borganization\b/i.test(name)) {
    bands = {
      exemplary: `${artifact} uses named steps, readable structure, and concise comments that make the computation easy to inspect and rerun.`,
      proficient: `${artifact} is readable and organized enough to rerun, with only minor naming or comment gaps.`,
      developing: `${artifact} runs only with effort because important steps, names, or comments are unclear.`,
      beginning: `${artifact} is missing, disorganized, or too opaque for a reviewer to trace the computation.`,
      commonPitfall:
        'Do not award clarity credit solely because the output looks polished; inspect the submitted code structure.',
    };
  } else if (/\btest evidence\b|\bverification\b|\bassertion\b/i.test(name)) {
    bands = {
      exemplary: `${artifact} includes a relevant verification run, assertion, or hand-checked comparison; the expected and observed results agree and are explained.`,
      proficient: `${artifact} includes a relevant verification with visible expected and observed results, but the explanation is brief.`,
      developing: `${artifact} mentions testing or shows a run, but the expected result, observed result, or interpretation is incomplete.`,
      beginning: `${artifact} supplies no inspectable verification evidence, or the shown check does not test the submitted computation.`,
      commonPitfall:
        'Do not award test-evidence credit for organization, citations, or format; require an inspectable verification result.',
    };
  } else if (/\bfeedback\b|\brevision\b|\brefactor\b/i.test(name)) {
    bands = {
      exemplary: `${artifact} identifies feedback, implements a substantive code or analysis revision, and shows the before-and-after effect.`,
      proficient: `${artifact} implements a relevant revision and identifies the feedback that prompted it.`,
      developing: `${artifact} mentions feedback but the resulting code or analysis change is minor or difficult to locate.`,
      beginning: `${artifact} shows no inspectable feedback-informed revision in the submitted work.`,
      commonPitfall:
        'Do not award revision credit for stating that feedback was used without showing the resulting change.',
    };
  } else return null;
  return {
    exemplary: bands.exemplary,
    proficient: bands.proficient,
    developing: bands.developing,
    beginning: bands.beginning,
    performanceBandEvidence: {
      priority: name,
      evidenceSignal:
        evidenceEntry?.evidenceNeeded ||
        `Inspect the submitted code, outputs, and verification evidence for "${name}".`,
      scorerQuestion: `Can two scorers point to the same submitted code or output evidence for "${name}"?`,
      commonPitfall: bands.commonPitfall,
      revisionTarget: `Revise ${artifact} so the code, output, or verification evidence for "${name}" is directly inspectable.`,
    },
  };
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
      proficient: pick([
        `Connects relevant ${evidenceNoun} for ${concept} to the main ${artifact} decision with mostly clear reasoning and only minor gaps in limitation language.`,
        `Explains the main reasoning move in ${artifact} with appropriate ${concept} evidence, while one tradeoff or evidence boundary still needs clarification.`,
        `Supports the ${artifact} judgment with relevant ${evidenceNoun} and a clear rationale, though the competing interpretation is handled only briefly.`,
        `Makes the ${concept} evidence-to-decision link visible in ${artifact}; a small gap remains in testing the alternative or qualifying the conclusion.`,
      ]),
      developing: pick([
        `Mentions ${evidenceNoun} or ${concept} but leaves part of the decision logic, tradeoff, or limitation implicit in ${artifact}.`,
        `Includes relevant ${concept} material, yet ${artifact} does not fully explain how that evidence warrants the selected judgment.`,
        `Points to useful ${evidenceNoun} in ${artifact} without tracing the consequential reasoning step or testing a plausible alternative.`,
        `States a ${concept} conclusion for ${artifact}, but the evidence path and conditions that would change it remain underdeveloped.`,
      ]),
      beginning: pick([
        `Lists ideas or opinions about ${concept} without linking inspectable ${evidenceNoun} to the decision required by ${artifact}.`,
        `Offers a conclusion in ${artifact} without showing which ${concept} evidence supports it or how the reasoning works.`,
        `Uses broad ${concept} language but provides no inspectable evidence-to-decision chain for ${artifact}.`,
        `Leaves the ${artifact} judgment unsupported because neither the decisive ${evidenceNoun} nor the reasoning is visible.`,
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
      developing: pick([
        `Refers to feedback or revision but does not make the change, rationale, or connection to ${artifact} fully visible.`,
        `Names feedback used on ${artifact}, yet the revised passage or the reasoning improvement is difficult to locate.`,
        `Shows that ${artifact} changed after review without explaining which feedback prompted the change or why it strengthened the work.`,
        `Describes a revision to ${artifact}, but the before-and-after evidence link remains only partly demonstrated.`,
      ]),
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
      exemplary: pick([
        `Organizes ${artifact} in the expected ${formatLabel} format so the ${concept} claim, ${evidenceNoun}, limitation, and next action are easy to locate.`,
        `Uses the ${formatLabel} form purposefully: readers can trace the ${concept} claim, inspect its ${evidenceNoun}, find the qualification, and identify the next action.`,
        `Shapes ${artifact} for its audience and genre, making the ${concept} evidence path, bounded conclusion, and required response immediately legible.`,
        `Presents ${artifact} with precise reader guidance so the central ${concept} judgment, supporting ${evidenceNoun}, limit, and follow-through are unmistakable.`,
      ]),
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
