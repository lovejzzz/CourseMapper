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
      objective: `Evaluate one ${concept} claim by distinguishing admitted evidence, warranted inference, and one unresolved limitation in ${learnerArtifact}.`,
      evidenceRequirement: `The ${learnerArtifact} must identify the admitted evidence, show the inference it warrants, and state one limitation that the evidence does not resolve.`,
    },
    {
      objective: `Test one ${concept} claim in ${learnerArtifact} by separating source-backed observation from inference and naming what remains unresolved.`,
      evidenceRequirement: `In ${learnerArtifact}, point to the source-backed observation, connect it to a bounded conclusion, and identify the open question left by the evidence.`,
    },
    {
      objective: `Audit one ${concept} claim for ${learnerArtifact}: point to admitted evidence, state what it warrants, and bound the conclusion with one unresolved limitation.`,
      evidenceRequirement: `Make the ${learnerArtifact} trace one admitted evidence item to its warranted inference, then mark the limit beyond that support.`,
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
