import { cleanText, sentenceCase, stripTerminalPunctuation } from './compilerText';

function selectAssessmentVariant(lessonNumber, variants) {
  const ordinal = Number.isFinite(Number(lessonNumber)) ? Math.trunc(Number(lessonNumber)) : 1;
  return variants[(Math.max(1, ordinal) - 1) % variants.length];
}

function lowercaseSentenceLead(value) {
  const text = cleanText(value);
  if (!text || /^[A-Z]{2}/.test(text) || /^[A-Z][a-z]*[A-Z0-9]/.test(text)) return text;
  return text.charAt(0).toLowerCase() + text.slice(1);
}

function joinTermDefinition(term, definition) {
  const cleanTerm = cleanText(term);
  const cleanDefinition = stripTerminalPunctuation(cleanText(definition));
  if (!cleanTerm) return cleanDefinition;
  if (!cleanDefinition || cleanDefinition.toLowerCase().startsWith(cleanTerm.toLowerCase())) return cleanDefinition;
  return `${cleanTerm} means ${lowercaseSentenceLead(cleanDefinition)}`;
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
  return `${definitions} ${selectAssessmentVariant(lessonNumber, [
    `${firstEvidence ? `The first detail—${firstEvidence}—` : `One cited course detail `}supports ${conceptA}; ${secondEvidence ? `the second—${secondEvidence}—` : `a different detail `}supports ${conceptB}. Together, the evidence distinguishes what each concept explains, while neither detail alone establishes the other concept's conclusion.`,
    `For ${conceptA}, the decisive detail is this: ${firstEvidence || `cite a specific course fact`}. By contrast, ${secondEvidence || `a second fact is needed`} grounds ${conceptB}. The comparison shows their different roles without treating either fact as proof of the other claim.`,
    `For the first concept, the source states: ${firstEvidence || `one relevant course detail`}. For the second, it states: ${secondEvidence || `one different course detail`}. Reading the facts together clarifies the relationship, but the pair still does not establish that the concepts are interchangeable.`,
    `${firstEvidence || `A first course detail`}. This demonstrates ${conceptA}. ${secondEvidence || `A second course detail`}. This demonstrates ${conceptB}. Their relationship is comparative rather than substitutive: each concept explains a different feature of the evidence.`,
    `The ${conceptA} claim rests on ${lowercaseSentenceLead(firstEvidence || `a specifically cited course detail`)}. The ${conceptB} claim rests on ${lowercaseSentenceLead(secondEvidence || `a separate cited detail`)}. That contrast supports a relationship between the concepts but not a conclusion that one concept entails the other.`,
    `Start with ${lowercaseSentenceLead(firstEvidence || `a course fact aligned to ${conceptA}`)}; it supplies the evidence for ${conceptA}. Then use ${lowercaseSentenceLead(secondEvidence || `a different admitted fact`)} to support ${conceptB}. The two-part comparison makes the roles visible and leaves the unsupported broader conclusion outside the answer.`,
  ])}`;
}

export function admittedEvidenceDefinitionCue({ concept, definition, fact }) {
  const cleanDefinition = stripTerminalPunctuation(cleanText(definition));
  const repeatsFact = cleanDefinition.toLowerCase() === stripTerminalPunctuation(cleanText(fact)).toLowerCase();
  return cleanDefinition && !repeatsFact
    ? `${sentenceCase(concept)} is the relevant concept. ${sentenceCase(cleanDefinition)}.`
    : `${sentenceCase(concept)} is the concept students should use to interpret the quoted evidence.`;
}
