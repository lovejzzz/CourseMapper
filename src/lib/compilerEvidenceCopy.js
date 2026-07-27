function sentence(value = '') {
  const text = String(value || '').trim();
  if (!text) return '';
  return /[.!?]["'’”)]?$/.test(text) ? text : `${text}.`;
}

function sentenceCase(value = '') {
  const text = String(value || '').trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : '';
}

const policyDomainPattern =
  /\b(public policy|policy analysis|policy design|policy evaluation|policy implementation|public administration|public affairs|urban policy|social policy|education policy|health policy|environmental policy|regulatory policy|governance)\b/;
const policyPracticeGatePattern =
  /\b(policy memo|decision memo|policy brief|policy choice|policy choices|policy proposal|policy proposals|policy option|policy options|policy evidence|policy lab|policy studio|platform accountability|algorithmic audit|algorithmic audits|stakeholder analysis|stakeholder mapping|stakeholder map|equity analysis|environmental justice|implementation context|implementation plan|implementation planning|implementation constraint|feasibility|cost[-\s]?benefit|impact assessment|regulation|regulatory analysis|regulatory impact|regulatory impact analysis|public comment|benefit[-\s]?cost|logic model|theory of change|program evaluation|administrative burden|public value|policy trade[-\s]?off)\b/;
const policyPracticeScorePattern =
  /\b(policy memo|decision memo|policy brief|policy choice|policy choices|policy proposal|policy proposals|policy option|policy options|policy evidence|platform accountability|algorithmic audit|algorithmic audits|stakeholder analysis|stakeholder mapping|stakeholder map|equity analysis|implementation plan|implementation constraint|feasibility|cost[-\s]?benefit|impact assessment|regulation|regulatory analysis|regulatory impact|public comment|benefit[-\s]?cost|logic model|theory of change|program evaluation|administrative burden|public value|policy trade[-\s]?off)\b/;

function matchCount(text, pattern) {
  return (String(text || '').match(new RegExp(pattern.source, 'g')) || []).length;
}

export function hasPolicyAnalysisEvidence(text = '') {
  return policyDomainPattern.test(text) && policyPracticeGatePattern.test(text);
}

export function policyAnalysisEvidenceScores(text = '') {
  const core = hasPolicyAnalysisEvidence(text) ? matchCount(text, policyDomainPattern) : 0;
  const practice = core > 0 ? matchCount(text, policyPracticeScorePattern) : 0;
  return { core, practice };
}

export function faqTermDefinitionSentence(term = {}) {
  const name = String(term?.term || '').trim();
  const definition = String(term?.definition || '')
    .trim()
    .replace(/[.!?]+$/, '');
  if (!name || !definition) return '';
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const articleLead = new RegExp(`^(?:an?|the)\\s+${escapedName}\\b\\s*`, 'i');
  if (definition.toLowerCase().startsWith(name.toLowerCase())) return sentence(sentenceCase(definition));
  if (articleLead.test(definition)) {
    return sentence(sentenceCase(`${name} ${definition.replace(articleLead, '')}`));
  }
  return `The source frames ${name} through this source-backed statement: ${sentenceCase(definition)}.`;
}

export function selectDistinctPrerequisiteConcept(primary, fallback, ...candidateGroups) {
  const key = String(primary || '')
    .trim()
    .toLowerCase();
  if (
    String(fallback || '')
      .trim()
      .toLowerCase() !== key
  )
    return fallback;
  return (
    candidateGroups.flat().find(
      (candidate) =>
        String(candidate || '').trim() &&
        String(candidate || '')
          .trim()
          .toLowerCase() !== key,
    ) || fallback
  );
}

export function selectConceptEvidenceFact(facts, terms, concept, definition, excludedFacts, semanticTokens) {
  const normalizedConcept = concept.toLowerCase();
  const sourceExample =
    terms.find((term) => String(term?.term || '').toLowerCase() === normalizedConcept)?.example || '';
  const cueTokens = new Set(semanticTokens(`${concept} ${definition}`));
  const ranked = facts
    .filter((fact) => !excludedFacts.has(fact))
    .map((fact, index) => ({
      fact,
      index,
      score:
        (normalizedConcept && fact.toLowerCase().includes(normalizedConcept) ? 100 : 0) +
        semanticTokens(fact).reduce((total, token) => total + (cueTokens.has(token) ? 1 : 0), 0),
    }))
    .sort((left, right) => right.score - left.score || left.index - right.index);
  return (
    ranked.find((entry) => entry.score >= 100)?.fact ||
    (sourceExample && !excludedFacts.has(sourceExample) ? sourceExample : '') ||
    ranked.find((entry) => entry.score >= 2)?.fact ||
    ''
  );
}

export function integrativeStudyGuideCopy({ primaryName, primaryDefinition, primaryExample, secondaryName, artifact }) {
  const hasSourcePair = Boolean(primaryDefinition && primaryExample);
  return {
    summary: hasSourcePair
      ? `${sentence(primaryDefinition)} For example: ${sentence(primaryExample)} Connect ${primaryName} to ${artifact} and keep the conclusion within the evidence boundary.`
      : '',
    prerequisite: secondaryName
      ? `Compare ${primaryName} with ${secondaryName} before working on ${artifact}; use a separate source detail for each concept.`
      : '',
    reviewStrategy: hasSourcePair
      ? `Rehearse ${primaryName} from its definition and source example. Then compare it with ${
          secondaryName || 'the second synthesis concept'
        } without treating one concept's evidence as support for the other.`
      : '',
  };
}
