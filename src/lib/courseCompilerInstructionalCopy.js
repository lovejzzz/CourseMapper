import { cleanText, sentenceCase, stripTerminalPunctuation } from './compilerText';
import { selectVariant } from './courseCompilerCopyVariants';

function lowercaseSentenceLead(value) {
  const text = cleanText(value);
  if (!text || /^[A-Z]{2}/.test(text) || /^[A-Z][a-z]*[A-Z0-9]/.test(text)) return text;
  return text.charAt(0).toLowerCase() + text.slice(1);
}

function joinTermDefinition(term, definition) {
  const cleanTerm = cleanText(term);
  const cleanDefinition = stripTerminalPunctuation(cleanText(definition));
  if (!cleanTerm) return cleanDefinition;
  if (!cleanDefinition) return cleanTerm;
  if (cleanDefinition.toLowerCase().startsWith(cleanTerm.toLowerCase())) return cleanDefinition;
  return `${cleanTerm} means ${lowercaseSentenceLead(cleanDefinition)}`;
}

export function prerequisiteDiagnosticCopy({ lessonNumber, previousConcept, concept }) {
  return selectVariant(lessonNumber, [
    `Ask students to explain one relationship and one difference between ${previousConcept} and ${concept}.`,
    `Have students retrieve one ${previousConcept} example, connect it to ${concept}, and identify where the comparison stops working.`,
    `Use a two-column note: students record what ${previousConcept} contributes to ${concept} and one distinction they must preserve.`,
    `Present a claim linking ${previousConcept} to ${concept}; students support, revise, or reject it with one prior-course detail.`,
    `Before new instruction, students write a one-sentence bridge from ${previousConcept} to ${concept} and flag the most important change in meaning.`,
    `Ask pairs to sort one similarity and one contrast between ${previousConcept} and ${concept}, then justify the distinction they chose.`,
  ]);
}

export function kernelSlideEvidenceDiscussionCopy({ lessonNumber, slideIndex = 0 }) {
  return selectVariant(Number(lessonNumber || 1) + slideIndex, [
    'Have students label the assertion, point to the supporting detail, and mark the boundary the source cannot cross.',
    'Invite students to match each conclusion to its strongest support, then identify an inference the source would not warrant.',
    'Ask pairs to separate observation from interpretation and write one sentence that limits the resulting claim.',
    'Pause for an evidence audit: what is supported, how is it supported, and where must the interpretation stop?',
    'Have students challenge the claim with the source detail most likely to qualify it, then revise the wording.',
    'Ask students to rank the evidence by relevance and explain which conclusion remains uncertain.',
    'Use a claim-support-limit check: underline the claim, box its evidence, and annotate one unresolved question.',
    'Have students name a plausible counter-reading, test it against the same evidence, and state which interpretation is better bounded.',
  ]);
}

export function shortAnswerSampleCopy({ lessonNumber, lessonFocus, concept, sourceCue, artifact, decisionNoun }) {
  return selectVariant(lessonNumber, [
    `For ${lessonFocus}, I would select ${concept}. One exact source detail from ${sourceCue} supports my proposed change to ${artifact}. It supports the ${decisionNoun}, but does not establish a broader conclusion. I would inspect one more source before extending the claim.`,
    `I would apply ${concept} to ${artifact} because a specific observation in ${sourceCue} points to the proposed ${decisionNoun}. That observation is useful in this context, but it cannot show that the same pattern holds elsewhere. I would compare it with an independent source before generalizing.`,
    `My ${artifact} choice would use ${concept} and cite a concrete detail from ${sourceCue}. The detail warrants this ${decisionNoun} under the conditions shown; it does not prove a universal rule. The next step is to check whether another source shows the same pattern.`,
    `A defensible response connects ${concept} to one inspectable clue in ${sourceCue}, then uses that clue to revise ${artifact}. The clue narrows the immediate ${decisionNoun}, but evidence beyond this case is still missing. I would seek a contrasting example before widening the claim.`,
    `I would name ${concept}, quote or describe the relevant evidence in ${sourceCue}, and explain the resulting change to ${artifact}. This evidence makes the local ${decisionNoun} reasonable, although it leaves other settings unresolved. I would test the decision against a second record next.`,
    `Using ${concept}, I would trace one verifiable detail in ${sourceCue} to the selected ${decisionNoun} for ${artifact}. The connection answers the present question without settling every possible explanation. I would gather evidence that could challenge the interpretation before treating it as stable.`,
  ]);
}

export function shortAnswerGuidanceCopy({ lessonNumber, concept, artifact, sourceCue }) {
  return {
    answer: selectVariant(lessonNumber, [
      `Use ${concept} to select evidence and justify the decision in ${artifact}. Name one inspectable clue from ${sourceCue}. Explain why it fits and how it changes the next step.`,
      `Use ${concept} to choose evidence from ${sourceCue}. Explain the evidence boundary. Name the decision it supports in ${artifact}.`,
      `Connect ${concept} to one source detail from ${sourceCue}. Explain what the detail proves or limits. State what it changes for ${artifact}.`,
      `Treat ${concept} as a reasoning move. Select evidence from ${sourceCue}. Explain its fit and state the implication for ${artifact}.`,
    ]),
    explanation: selectVariant(lessonNumber, [
      `A complete response links ${concept}, ${artifact}, and a concrete source detail instead of only defining the term.`,
      `Credit depends on using ${concept} to interpret evidence for ${artifact}, not on restating vocabulary.`,
      `The answer should make the evidence-to-decision link visible: what evidence was used, why it matters, and how ${artifact} changes.`,
      `This item checks whether students can move from ${concept} recall into evidence-backed reasoning for ${artifact}.`,
    ]),
    scoringGuidance: selectVariant(lessonNumber, [
      `Full credit requires accurate use of ${concept} and one concrete source. The answer must state a decision effect and a limitation or next evidence need. Give partial credit when evidence, implication, or boundary is missing.`,
      `Award full credit when the response uses ${concept} accurately and cites a source detail. It must explain the effect on ${artifact}. It must also state what the evidence cannot establish.`,
      `Full-credit responses name the evidence and explain how ${concept} works. They state what changes for ${artifact}. They also identify one limit or next source to inspect.`,
      `Score concept accuracy, evidence, decision use, and claim boundaries. The response must show what ${sourceCue} adds to ${artifact}. It must also name what still needs confirmation.`,
    ]),
  };
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
  const firstEvidence = factA ? sentenceCase(stripTerminalPunctuation(factA)) : '';
  const secondEvidence = factB ? sentenceCase(stripTerminalPunctuation(factB)) : '';
  return `${definitions} ${selectVariant(lessonNumber, [
    `${firstEvidence ? `The first detail—${firstEvidence}—` : `One cited course detail `}supports ${conceptA}; ${secondEvidence ? `the second—${secondEvidence}—` : `a different detail `}supports ${conceptB}. Together, the evidence distinguishes what each concept explains, while neither detail alone establishes the other concept's conclusion.`,
    `For ${conceptA}, the decisive detail is this: ${firstEvidence || `cite a specific course fact`}. By contrast, ${secondEvidence || `a second fact is needed`} grounds ${conceptB}. The comparison shows their different roles without treating either fact as proof of the other claim.`,
    `For the first concept, the source states: ${firstEvidence || `one relevant course detail`}. For the second, it states: ${secondEvidence || `one different course detail`}. Reading the facts together clarifies the relationship, but the pair still does not establish that the concepts are interchangeable.`,
    `${firstEvidence || `A first course detail`}. This demonstrates ${conceptA}. ${secondEvidence || `A second course detail`}. This demonstrates ${conceptB}. Their relationship is comparative rather than substitutive: each concept explains a different feature of the evidence.`,
    `The ${conceptA} claim rests on ${lowercaseSentenceLead(firstEvidence || `a specifically cited course detail`)}. The ${conceptB} claim rests on ${lowercaseSentenceLead(secondEvidence || `a separate cited detail`)}. That contrast supports a relationship between the concepts but not a conclusion that one concept entails the other.`,
    `Start with ${lowercaseSentenceLead(firstEvidence || `a course fact aligned to ${conceptA}`)}; it supplies the evidence for ${conceptA}. Then use ${lowercaseSentenceLead(secondEvidence || `a different admitted fact`)} to support ${conceptB}. The two-part comparison makes the roles visible and leaves the unsupported broader conclusion outside the answer.`,
  ])}`;
}

export function additionalEvidenceRequirementCopy({ lessonNumber, mode }) {
  const variantsByMode = {
    'interpretive-humanities': [
      'another locatable passage whose formal detail supports the added interpretive link or counter-reading',
      "a second cited passage or contextual source that can establish the claim's wider scope",
      'edition-specific textual evidence testing the added pattern against a plausible alternative reading',
      'a contextual source and passage detail that independently support the interpretation being added',
      'another precisely located scene, line, or formal feature that tests the claim beyond this example',
      'new passage evidence strong enough to establish the broader reading and answer its countercase',
    ],
    'world-language': [
      'another target-language example that establishes the added form, meaning, register, or communicative context',
      'a second utterance or text sample showing that the form still works for the wider audience and purpose',
      'new target-language evidence that tests the claimed meaning in a different but relevant context',
      'an additional spoken or written example supporting the proposed form-function relationship',
      'a contrasting language sample that confirms the broader register, meaning, or usage claim',
      'another contextualized example showing the expanded claim remains comprehensible and accurate',
    ],
    'proof-seminar': [
      'another definition, lemma, proof step, or counterexample that establishes the added implication',
      'a justified intermediate result connecting the current statement to the broader conclusion',
      'a proof step or counterexample test that verifies the proposed extension',
      'the missing definition or lemma needed to derive the wider claim',
      'a valid argument covering the case the present evidence leaves open',
      'an explicit logical bridge, with its assumptions checked, before the implication can be extended',
    ],
    default: [
      'another course fact that directly establishes the added cause, mechanism, population, outcome, or scope',
      'an independent course detail that tests the new relationship and its proposed range',
      'additional evidence showing that the claimed mechanism or effect holds beyond this example',
      'a second source-backed observation capable of supporting the expanded conclusion',
      'new evidence that directly addresses the extra condition introduced by the broader claim',
      'a relevant countercase or confirming fact before extending the result to a wider setting',
    ],
  };
  return selectVariant(lessonNumber, variantsByMode[mode] || variantsByMode.default);
}

export function closeReadingDiscussionCopy({ lessonNumber, concept }) {
  return {
    participationPattern: selectVariant(lessonNumber, [
      'passage or scene annotation, context boundary check, competing interpretation challenge, source-integrity review, and revised claim',
      'formal-detail inventory, passage-context comparison, counter-reading exchange, evidence-limit check, and qualified interpretation',
      'silent passage marking, claim-and-warrant round, alternative reading test, attribution audit, and interpretive revision',
      'close-reading observation share, context calibration, strongest-counterclaim response, source check, and bounded synthesis',
    ]),
    reviewFocus: selectVariant(lessonNumber, [
      `passage specificity, claim arguability, contextual restraint, source integrity, counter-reading quality, and evidence-led revision for ${concept}`,
      `formal-detail accuracy, interpretive warrant, context boundaries, attribution, response to the strongest alternative, and claim revision for ${concept}`,
      `observation-to-claim reasoning, passage location, historical or generic context, source fidelity, counterevidence, and qualified synthesis for ${concept}`,
      `textual precision, defensible inference, context calibration, edition or source handling, alternative reading, and revision quality for ${concept}`,
      `inspectable passage evidence, interpretive stakes, scope control, attribution integrity, counterclaim testing, and a warranted ${concept} revision`,
      `close-reading accuracy, claim-evidence fit, contextual limits, source transparency, competing interpretation, and final qualification for ${concept}`,
    ]),
  };
}

export function faqCoreClaimsCopy({ lessonNumber, facts, artifact, evidenceCue }) {
  const claims = facts.map((fact) => `${stripTerminalPunctuation(fact)}.`).join(' ');
  const artifactLabel = stripTerminalPunctuation(cleanText(artifact));
  const evidenceLabel = stripTerminalPunctuation(cleanText(evidenceCue));
  return `${claims} ${selectVariant(lessonNumber, [
    `Those are the load-bearing claims — connect each one to ${artifactLabel}, and be ready to say what evidence from ${evidenceLabel} supports it.`,
    `Treat these as the lesson's working claims. Show where each appears in ${artifactLabel}, then identify the detail from ${evidenceLabel} that warrants it.`,
    `Use these claims as an evidence map: trace them into ${artifactLabel}, test the strongest alternative, and ground the conclusion in ${evidenceLabel}.`,
    `Build ${artifactLabel} around these claims, making the source trail from ${evidenceLabel} visible and qualifying anything the selected evidence cannot establish.`,
  ])}`;
}
