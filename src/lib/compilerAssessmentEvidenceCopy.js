import { cleanText, sentenceCase, stripTerminalPunctuation } from './compilerText';

function selectAssessmentVariant(lessonNumber, variants) {
  const ordinal = Number.isFinite(Number(lessonNumber)) ? Math.trunc(Number(lessonNumber)) : 1;
  return variants[(Math.max(1, ordinal) - 1) % variants.length];
}

function joinTermDefinition(term, definition) {
  const cleanTerm = cleanText(term);
  const cleanDefinition = stripTerminalPunctuation(cleanText(definition));
  if (!cleanTerm) return cleanDefinition;
  if (!cleanDefinition) return cleanTerm;
  const definitionLower = cleanDefinition.toLowerCase();
  const termLower = cleanTerm.toLowerCase();
  const beginsWithTerm = [termLower, `a ${termLower}`, `an ${termLower}`, `the ${termLower}`].some(
    (prefix) =>
      definitionLower === prefix ||
      definitionLower.startsWith(`${prefix} `) ||
      definitionLower.startsWith(`${prefix},`) ||
      definitionLower.startsWith(`${prefix} (`),
  );
  if (beginsWithTerm) return cleanDefinition;
  // A retrieved "definition" can be a bounded source statement that does not
  // grammatically define the term. Joining it with "means" invents a semantic
  // relationship the source never asserted. Keep the admitted sentence exact
  // behind a transparent label so source replay can bind it byte-semantically.
  return `Definition for ${cleanTerm}: ${cleanDefinition}`;
}

export function constructedResponseRelationshipSampleCopy({
  lessonNumber,
  conceptA,
  conceptB,
  definitionA,
  definitionB,
  factA,
  factB,
}) {
  const definitions = `${sentenceCase(stripTerminalPunctuation(joinTermDefinition(conceptA, definitionA)))}. ${sentenceCase(stripTerminalPunctuation(joinTermDefinition(conceptB, definitionB)))}.`;
  const definitionKeyA = stripTerminalPunctuation(cleanText(definitionA)).toLowerCase();
  const definitionKeyB = stripTerminalPunctuation(cleanText(definitionB)).toLowerCase();
  const firstEvidence =
    factA && stripTerminalPunctuation(cleanText(factA)).toLowerCase() !== definitionKeyA
      ? sentenceCase(stripTerminalPunctuation(factA))
      : '';
  const secondEvidence =
    factB && stripTerminalPunctuation(cleanText(factB)).toLowerCase() !== definitionKeyB
      ? sentenceCase(stripTerminalPunctuation(factB))
      : '';
  const evidence = [
    firstEvidence ? `Source claim 1: ${firstEvidence}.` : '',
    secondEvidence ? `Source claim 2: ${secondEvidence}.` : '',
  ]
    .filter(Boolean)
    .join(' ');
  const comparisonBoundary = selectAssessmentVariant(lessonNumber, [
    'Compare only what the quoted sentences explicitly support; do not treat either sentence as proof of the other.',
    'State the support and limit of each quoted sentence without inventing a causal or definitional link between them.',
    'Use the quoted sentences as separate evidence, then name one broader inference they do not establish.',
  ]);
  return `${definitions}${evidence ? ` ${evidence}` : ''} ${comparisonBoundary}`;
}

export function admittedEvidenceDefinitionCue({ concept, definition, fact, variant = 0 }) {
  const cleanDefinition = stripTerminalPunctuation(cleanText(definition));
  const repeatsFact = cleanDefinition.toLowerCase() === stripTerminalPunctuation(cleanText(fact)).toLowerCase();
  return cleanDefinition && !repeatsFact
    ? `${sentenceCase(concept)} is the relevant concept. ${sentenceCase(cleanDefinition)}.`
    : selectAssessmentVariant(variant + 1, [
        `${sentenceCase(concept)} supplies the lens for interpreting the quoted evidence.`,
        `Read the quoted evidence through ${concept}; it identifies the relevant course relationship.`,
        `The appropriate course concept is ${concept}, which bounds what the quotation can support.`,
        `Use ${concept} to organize the cited detail and separate support from overreach.`,
        `${sentenceCase(concept)} best explains the evidence named in the prompt.`,
        `Interpret the quotation with ${concept}, then keep the conclusion inside that concept's evidence boundary.`,
      ]);
}
