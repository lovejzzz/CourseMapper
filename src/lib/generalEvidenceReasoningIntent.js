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
  // v0.20.08: plain classroom wording. The earlier variants ("Distinguish
  // admitted evidence for X from its inference and bound the Y conclusion")
  // reached students verbatim in the live quality test.
  const variants = [
    {
      objective: `Explain one idea about ${concept} in ${learnerArtifact}, using specific details from the lesson material, and say what those details do not show.`,
      evidenceRequirement: `In ${learnerArtifact}, quote or point to the details used for ${concept}, state the conclusion, and name one question the details leave open.`,
    },
    {
      objective: `Test one statement about ${concept} in ${learnerArtifact} by separating what the material shows from what is being inferred.`,
      evidenceRequirement: `In ${learnerArtifact}, mark the observation from the material, connect it to a careful conclusion, and name the question still open.`,
    },
    {
      objective: `Check one claim about ${concept} for ${learnerArtifact}: point to the supporting detail, say what it shows, and note one limit.`,
      evidenceRequirement: `Make ${learnerArtifact} link one supporting detail to the conclusion it supports, then note what it cannot show.`,
    },
    {
      objective: `Use ${concept} to make one decision in ${learnerArtifact}, name the detail that decides it, and say what would change the decision.`,
      evidenceRequirement: `Show where ${learnerArtifact} uses ${concept}: the detail, the decision, and what would change it.`,
    },
    {
      objective: `Question one interpretation of ${concept} in ${learnerArtifact}: trace it to the material, test each step, and revise any part that goes beyond it.`,
      evidenceRequirement: `Connect the ${learnerArtifact} interpretation to the lesson material, explain the reasoning, and rewrite one step that goes too far.`,
    },
    {
      objective: `Justify one judgment about ${concept} in ${learnerArtifact} with reasons from the material, and say when the judgment should change.`,
      evidenceRequirement: `In ${learnerArtifact}, cite the material used for the ${concept} judgment and name the new information that would change it.`,
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
