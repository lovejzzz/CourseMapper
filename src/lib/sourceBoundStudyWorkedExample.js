import { asArray, cleanText, stripTerminalPunctuation } from './compilerText';

function sentence(value = '') {
  const text = cleanText(value);
  if (!text) return '';
  return /[.!?]["'’”)]?$/.test(text) ? text : `${text}.`;
}

/**
 * Turn two admitted claims into a learner-facing reasoning rehearsal when a
 * lesson has no stronger operation-, visual-, or data-bound worked example.
 * The response deliberately teaches an audit method rather than inventing a
 * disciplinary conclusion that the source packet does not contain.
 */
export function sourceBoundStudyWorkedExample({
  sourceEvidenceBrief,
  primaryConcept = 'the lesson concept',
  studyArtifact = 'the lesson artifact',
} = {}) {
  const claims = asArray(sourceEvidenceBrief?.claims)
    .map((claim) => sentence(stripTerminalPunctuation(cleanText(claim))))
    .filter(Boolean);
  if (claims.length < 2) return null;

  const concept = cleanText(primaryConcept) || 'the lesson concept';
  const artifact = cleanText(studyArtifact) || 'the lesson artifact';
  const [firstClaim, secondClaim] = claims;
  const sourceTitles = asArray(sourceEvidenceBrief?.sources)
    .map((source) => cleanText(source?.title))
    .filter(Boolean)
    .slice(0, 2);
  const sourceCue =
    sourceTitles.length >= 2
      ? `The evidence brief attributes them to ${sourceTitles[0]} and ${sourceTitles[1]}.`
      : sourceTitles.length === 1
        ? `The evidence brief attributes them to ${sourceTitles[0]}.`
        : 'Use the evidence brief to preserve their recorded provenance.';

  return {
    protocol: 'coursemapper-source-claim-comparison-study-practice-v1',
    studentTask: `Build a source-to-conclusion audit for ${artifact}.`,
    problem: `Source Claim 1 states: “${firstClaim}” Source Claim 2 states: “${secondClaim}” Determine how these admitted claims jointly inform ${concept} without treating either as proof of a broader conclusion. ${sourceCue}`,
    steps: [
      `For ${concept}, copy each claim exactly and mark the words that limit its subject, setting, comparison, or certainty.`,
      `Classify the relationship between the claims as reinforcing, qualifying, or conflicting, then cite the wording that supports that classification for ${concept}.`,
      `Write one bounded conclusion for ${artifact} that uses both claims, and label every additional inference as an inference rather than a source statement.`,
      `For ${artifact}, name the missing evidence required before extending the conclusion to a new population, context, cause, or general rule.`,
    ],
    result: `A defensible response preserves Source Claims 1 and 2 as separate evidence, states whether the second reinforces, qualifies, or conflicts with the first, and limits the ${concept} conclusion to what their exact wording supports. The ${artifact} does not claim a broader result until that relationship and the missing evidence are made explicit.`,
    interpretation: `This comparison makes the evidence path in ${artifact} inspectable: a reader can trace each source statement, the relationship asserted between them, and the conclusion drawn from that relationship.`,
    boundary: `For ${concept}, two admitted claims can support a bounded comparison; by themselves, the two admitted ${concept} claims do not establish causation, universal scope, or transfer to an unexamined context.`,
    transferTask: `Apply the same audit to one conclusion in ${artifact}: preserve two exact claims, classify their relationship, bound the conclusion, and identify the next evidence needed.`,
    verification: {
      checked: true,
      claimCount: claims.length,
      sourceCount: asArray(sourceEvidenceBrief?.sources).length,
      evidenceSource: cleanText(sourceEvidenceBrief?.enrichmentSource) || 'lesson-content-enrichment',
    },
  };
}
