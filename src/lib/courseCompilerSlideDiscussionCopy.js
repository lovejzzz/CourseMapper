import { cleanText, stripTerminalPunctuation } from './compilerText';
import { compactSlideInstructionLabel } from './courseCompilerCopyVariants';
import { stableRealizationIndex } from './courseCompilerRealization';

export function slideDiscussionDecisionBullets({
  lessonNumber,
  courseName,
  concept,
  secondary,
  sourceCue,
  artifact,
  successCriterion,
}) {
  const conceptLabel = compactSlideInstructionLabel(concept, 'lesson concept');
  const alternativeLabel = compactSlideInstructionLabel(secondary, 'alternative evidence', {
    rejectInstruction: true,
  });
  const sourceLabel = compactSlideInstructionLabel(sourceCue, 'assigned evidence');
  const artifactLabel = compactSlideInstructionLabel(artifact, 'course artifact', {
    rejectInstruction: true,
  });
  const criterionLabel = compactSlideInstructionLabel(successCriterion, 'the success criterion');
  const decisionLeads = [
    `Compare two ${conceptLabel} claims`,
    `Test competing ${conceptLabel} claims`,
    `Rank two ${artifactLabel} responses`,
    `Challenge the current ${artifactLabel} choice`,
    `Compare ${conceptLabel} with an alternative`,
    `Audit two evidence paths for ${artifactLabel}`,
    `Test ${alternativeLabel} as counterevidence`,
    `Contrast source-backed and vocabulary-only responses`,
    `Place strong and weak ${conceptLabel} evidence side by side`,
    `Decide which ${sourceLabel} detail matters most`,
    `Compare two next steps for ${conceptLabel}`,
    `Test ${conceptLabel} against the criterion`,
  ];
  const decisionTails = [
    'keep the better-supported claim.',
    'identify where the weaker one fails.',
    'choose the response with inspectable support.',
    'name which evidence changed the choice.',
    'preserve the interpretation with the clearer limit.',
    'keep the path that satisfies the criterion.',
    'decide whether it changes the current claim.',
    'retain the response that explains its source.',
    'choose the evidence that survives challenge.',
    'connect it to the decision it warrants.',
    'select the step with the stronger evidence link.',
    'revise the claim that exceeds the criterion.',
  ];
  const boundaryLeads = [
    'State the evidence boundary',
    'Name the deciding source detail',
    'Mark the unresolved uncertainty',
    'Identify the assumption still open',
    'Locate the weaker evidence link',
    'Name the criterion that decides',
    'Specify the evidence-backed artifact decision',
    'Test one credible counterexample',
    'Separate evidence support from overreach',
    'Name the strongest surviving evidence',
    'Mark what the source does not establish',
    'Identify the next evidence need',
  ];
  const boundaryTails = [
    'say what new evidence could reverse it.',
    `connect it to one ${artifactLabel} revision.`,
    'show why the stronger conclusion holds.',
    `explain how ${criterionLabel} changes the choice.`,
    `keep the claim within ${sourceLabel}.`,
    'turn the result into a defensible revision.',
    'record the limitation before deciding.',
    'show which inference must be removed.',
    'state what another reader should inspect.',
    'choose the step warranted now.',
    `carry the result into ${artifactLabel}.`,
    'name the evidence that could overturn it.',
  ];
  const ordinal = Math.max(0, Number(lessonNumber || 1) - 1);
  const courseKey = cleanText(courseName) || 'course-without-shared-title';
  const compose = (ownerId, leads, tails, stride) => {
    const leadOffset = stableRealizationIndex(`${courseKey}|${ownerId}|lead`, leads.length);
    const tailOffset = stableRealizationIndex(`${courseKey}|${ownerId}|tail`, tails.length);
    const lead = stripTerminalPunctuation(leads[(ordinal + leadOffset) % leads.length]);
    const tail = tails[(ordinal * stride + tailOffset) % tails.length];
    const composed = `${lead}; ${tail}`;
    if (composed.length <= 118) return composed;
    return `${lead}; ${ownerId.includes('boundary') ? 'record the evidence limit.' : 'keep the stronger evidence link.'}`;
  };
  return [
    compose('slide-discussion-decision', decisionLeads, decisionTails, 5),
    compose('slide-discussion-boundary', boundaryLeads, boundaryTails, 7),
  ];
}
