function cleanText(value, fallback) {
  const text = String(value || '')
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim();
  return text || fallback;
}

function cleanInlineLabel(value, fallback) {
  return cleanText(value, fallback)
    .replace(/[.!?:;,]+$/g, '')
    .trim();
}

export function buildGeneralEvidenceReasoningIntent({ focusConcept, artifact, variationKey = 0 }) {
  // Assessment identities are sentence-shaped in a few graph migrations
  // (for example, "Sound Change Mechanisms application check."). They become
  // inline noun phrases here, so strip terminal punctuation before composing
  // the objective. Otherwise the template can emit both `check..` and
  // `check.:`, defects that only surface after Course Map rendering.
  const learnerArtifact = cleanInlineLabel(artifact, 'the planned learner artifact');
  const concept = cleanInlineLabel(focusConcept, 'the lesson focus');
  const variants = [
    {
      objective: `Evaluate one ${concept} claim in ${learnerArtifact}. Distinguish admitted evidence for ${concept} from its inference and bound the ${learnerArtifact} conclusion.`,
      evidenceRequirement: `In ${learnerArtifact}, identify admitted evidence for ${concept}. State the ${concept} inference. Mark one unresolved ${learnerArtifact} limit.`,
    },
    {
      objective: `Test one ${concept} claim in ${learnerArtifact} by separating source-backed observation from inference and naming what remains unresolved.`,
      evidenceRequirement: `In ${learnerArtifact}, point to the source-backed observation, connect it to a bounded conclusion, and identify the open question left by the evidence.`,
    },
    {
      objective: `Audit one ${concept} claim for ${learnerArtifact}: point to admitted evidence, state what it warrants, and bound the conclusion with one unresolved limitation.`,
      evidenceRequirement: `Make the ${learnerArtifact} trace one admitted evidence item to its warranted inference, then mark the limit beyond that support.`,
    },
    {
      objective: `Use ${concept} to examine one decision in ${learnerArtifact}. Identify the controlling evidence, explain the decision it supports, and flag the question that remains open.`,
      evidenceRequirement: `Show where ${learnerArtifact} uses ${concept}: label the evidence, the resulting decision, and the unresolved question that prevents a broader claim.`,
    },
    {
      objective: `Critique one ${concept} interpretation in ${learnerArtifact}. Trace it to a course record, test the reasoning step, and revise any claim that reaches beyond the record.`,
      evidenceRequirement: `Connect the ${learnerArtifact} interpretation to a named course record, explain the reasoning link, and rewrite one unsupported extension.`,
    },
    {
      objective: `Construct a defensible ${concept} judgment in ${learnerArtifact}. Select relevant course evidence, justify the judgment, and specify the condition under which it should change.`,
      evidenceRequirement: `In ${learnerArtifact}, cite the course evidence used for the ${concept} judgment and name the new condition or evidence that would require revision.`,
    },
  ];
  const selected = variants[Math.abs(Number(variationKey) || 0) % variants.length];
  const objective = selected.objective;
  return {
    objective,
    learnerAction: objective,
    preferDerivedLearnerAction: true,
    evidenceRequirement: selected.evidenceRequirement,
  };
}
