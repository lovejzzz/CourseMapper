import { cleanText, stripTerminalPunctuation } from './compilerText';

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
