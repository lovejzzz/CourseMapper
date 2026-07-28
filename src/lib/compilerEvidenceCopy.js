import { asArray, cleanText, stripTerminalPunctuation } from './compilerText';

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

function evidenceClaimText(value) {
  if (typeof value === 'string') return stripTerminalPunctuation(cleanText(value));
  if (!value || typeof value !== 'object') return '';
  return stripTerminalPunctuation(cleanText(value.text || value.claim || value.definition || value.quote));
}

export function evidenceClaimKey(value) {
  return evidenceClaimText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function distinctLessonEvidenceClaims(lesson = {}, limit = 5) {
  const enrichment = lesson?.enrichment || {};
  const candidates = [
    ...asArray(enrichment.kernel?.facts),
    ...asArray(enrichment.keyTerms).flatMap((term) => [
      term?.definition || term?.df || '',
      term?.example || term?.eg || '',
    ]),
  ];
  const seen = new Set();
  const claims = [];
  for (const candidate of candidates) {
    const claim = evidenceClaimText(candidate);
    const key = evidenceClaimKey(candidate);
    if (!claim || key.length < 12 || seen.has(key)) continue;
    seen.add(key);
    claims.push(sentence(claim));
    if (claims.length >= limit) break;
  }
  return claims;
}

function distinctSentenceSequence(value = '') {
  const seen = new Set();
  return cleanText(value)
    .split(/(?<=[.!?])\s+/)
    .map((item) => sentence(stripTerminalPunctuation(item)))
    .filter((item) => {
      const key = evidenceClaimKey(item);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function lessonEvidenceSources(lesson = {}, limit = 4) {
  const seen = new Set();
  const sources = [];
  for (const citation of asArray(lesson?.enrichment?.conceptProvenance?.citations)) {
    const title = cleanText(citation?.displayTitle || citation?.key || citation?.attribution);
    const url = cleanText(citation?.sourceUrl);
    const key = `${url}|${title}`.toLowerCase();
    if ((!title && !url) || seen.has(key)) continue;
    seen.add(key);
    sources.push({
      title: title || url,
      ...(url ? { url } : {}),
      ...(cleanText(citation?.license) ? { license: cleanText(citation.license) } : {}),
    });
    if (sources.length >= limit) break;
  }
  return sources;
}

/**
 * One source-admitted packet feeds every visible surface. Instructional
 * boilerplate stays outside this subtree so grounding telemetry cannot count it.
 */
export function buildLessonEvidenceBrief(lesson = {}, { claimLimit = 4, sourceLimit = 4 } = {}) {
  const claims = distinctLessonEvidenceClaims(lesson, claimLimit);
  const sources = lessonEvidenceSources(lesson, sourceLimit);
  return claims.length === 0 && sources.length === 0
    ? null
    : { enrichmentSource: 'lesson-content-enrichment', claims, sources };
}

export function sourceComposedStudySummary(lesson = {}, authoredSummary = '') {
  const segments = cleanText(authoredSummary)
    .split(/(?<=[.!?])\s+/)
    .map((item) => sentence(stripTerminalPunctuation(item)))
    .filter(Boolean);
  const distinctAuthored = distinctSentenceSequence(authoredSummary);
  const keys = segments.map((item) => evidenceClaimKey(item)).filter(Boolean);
  if (distinctAuthored.length > 0 && new Set(keys).size === keys.length) return cleanText(authoredSummary);
  const seen = new Set();
  return [...distinctAuthored, ...distinctLessonEvidenceClaims(lesson, 4)]
    .filter((item) => {
      const key = evidenceClaimKey(item);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 3)
    .map((item) => sentence(stripTerminalPunctuation(item)))
    .join(' ');
}

export function groundedSyllabusCourseDescription(blueprint = {}) {
  const seen = new Set();
  const claims = [];
  for (const lesson of blueprint.lessons || []) {
    const claim = distinctLessonEvidenceClaims(lesson, 1)[0];
    const key = evidenceClaimKey(claim);
    if (!claim || !key || seen.has(key)) continue;
    seen.add(key);
    claims.push(claim);
    if (claims.length >= 3) break;
  }
  const evidenceArc =
    claims.length > 0
      ? `Students test course decisions against source evidence, including ${claims
          .map((claim) => stripTerminalPunctuation(claim))
          .join('; ')}.`
      : '';
  return `In ${blueprint.courseName}, students work through ${blueprint.totalLessons} connected lessons that build from core concepts to applied decisions. ${blueprint.courseArc?.throughline || ''} ${evidenceArc} The course emphasizes evidence use, structured practice, and feedback-informed improvement across the major assessments.`
    .replace(/\s+/g, ' ')
    .trim();
}

export function buildGroundedStudyGuideEvidenceCopy({
  lesson = {},
  sourceEvidenceBrief,
  primaryAlignedFact = '',
  primaryConcept = 'course concept',
  chooseVariant = (options) => options[0] || '',
}) {
  const claims = sourceEvidenceBrief?.claims || [];
  const secondaryAlignedFact =
    claims.find((claim) => evidenceClaimKey(claim) !== evidenceClaimKey(primaryAlignedFact)) || primaryAlignedFact;
  const sourceComparisonQuestion =
    claims.length >= 2
      ? `Compare these two source claims: “${stripTerminalPunctuation(claims[0])}” and “${stripTerminalPunctuation(
          claims[1],
        )}.” What ${primaryConcept} decision follows from reading them together, and what remains unproven?`
      : '';
  const materials = stripTerminalPunctuation(cleanText(lesson.enrichment?.kernel?.scenario?.materials));
  if (
    claims.length >= 2 &&
    (!materials || /\bsource-backed case example\b|\brelated claim\b|\bclaim-boundary note\b/i.test(materials))
  ) {
    return {
      secondaryAlignedFact,
      sourceComparisonQuestion,
      sourceEvidencePractice: `Compare these source claims: “${stripTerminalPunctuation(
        claims[0],
      )}” and “${stripTerminalPunctuation(
        claims[1],
      )}.” Mark the detail each claim supports, identify any tension or dependency between them, and write one bounded ${primaryConcept} conclusion.`,
    };
  }
  const boundary = primaryAlignedFact ? stripTerminalPunctuation(primaryAlignedFact) : '';
  return {
    secondaryAlignedFact,
    sourceComparisonQuestion,
    sourceEvidencePractice: materials
      ? chooseVariant([
          `Work directly with ${materials}: mark the detail that best supports the ${primaryConcept} claim, the detail that complicates it, and the decision each one points to.${boundary ? ` Check your reading against this: ${boundary}.` : ''}`,
          `Inspect ${materials}. Identify the strongest ${primaryConcept} evidence, one counter-detail, and the judgment that follows.${boundary ? ` Test that judgment against this course statement: ${boundary}.` : ''}`,
          `Annotate ${materials} for one ${primaryConcept} signal and one complication. Explain which interpretation survives the comparison.${boundary ? ` Use this fact as the boundary check: ${boundary}.` : ''}`,
          `Use ${materials} to separate supporting evidence from uncertainty about ${primaryConcept}. Record the conclusion each detail permits.${boundary ? ` Reconcile your note with this statement: ${boundary}.` : ''}`,
          `Compare the relevant details in ${materials}. Choose the evidence that best warrants a ${primaryConcept} claim and name what could weaken it.${boundary ? ` Then check the claim against: ${boundary}.` : ''}`,
          `Trace a ${primaryConcept} claim through ${materials}: cite its strongest support, surface a limiting detail, and revise the judgment accordingly.${boundary ? ` Keep this source fact in view: ${boundary}.` : ''}`,
        ])
      : '',
  };
}
