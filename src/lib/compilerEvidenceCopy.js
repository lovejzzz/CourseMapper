import { asArray, cleanText, stripTerminalPunctuation } from './compilerText';

const SOURCE_PLACEHOLDER_RE = /\bsource-backed case example\b|\brelated claim\b|\bclaim-boundary note\b/i;

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
const policyPracticeScorePattern =
  /\b(policy memo|decision memo|policy brief|policy choice|policy choices|policy proposal|policy proposals|policy option|policy options|policy evidence|platform accountability|algorithmic audit|algorithmic audits|stakeholder analysis|stakeholder mapping|stakeholder map|equity analysis|implementation plan|implementation constraint|feasibility|cost[-\s]?benefit|impact assessment|regulation|regulatory analysis|regulatory impact|public comment|benefit[-\s]?cost|logic model|theory of change|program evaluation|administrative burden|public value|policy trade[-\s]?off)\b/;
const policyPracticeGatePattern = new RegExp(
  `${policyPracticeScorePattern.source}|\\b(?:policy lab|policy studio|environmental justice|implementation context|implementation planning)\\b`,
);

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
  if (!Number.isFinite(Number(limit)) || Number(limit) <= 0) return [];
  const enrichment = lesson?.enrichment || {};
  const canonicalFacts = asArray(enrichment.kernel?.canonicalFacts);
  const candidates = [
    ...(canonicalFacts.length > 0 ? canonicalFacts : asArray(enrichment.kernel?.facts)),
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
  const provenance = lesson?.enrichment?.conceptProvenance || {};
  // The full discovery ledger stays in provenance for auditability, while an
  // explicit admittedCitations array is the instructional publication
  // boundary. Falling back only when the field is absent preserves legacy and
  // instructor-authored packets; an intentionally empty admitted set must not
  // republish quarantined source titles into learner handouts.
  const citationPool = Array.isArray(provenance.admittedCitations)
    ? provenance.admittedCitations
    : asArray(provenance.citations);
  for (const citation of citationPool) {
    const attribution = asArray(citation?.attribution)
      .map((value) => cleanText(value))
      .filter(Boolean)
      .join('; ');
    const title = cleanText(citation?.displayTitle || citation?.key || attribution);
    const url = cleanText(citation?.sourceUrl);
    const key = `${url}|${title}`.toLowerCase();
    if ((!title && !url) || seen.has(key)) continue;
    seen.add(key);
    sources.push({
      title: title || url,
      ...(url ? { url } : {}),
      ...(attribution ? { attribution } : {}),
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
  const distinctAuthored = distinctSentenceSequence(authoredSummary).filter(
    (item) => !SOURCE_PLACEHOLDER_RE.test(item),
  );
  const keys = segments.map((item) => evidenceClaimKey(item)).filter(Boolean);
  if (
    distinctAuthored.length > 0 &&
    new Set(keys).size === keys.length &&
    !SOURCE_PLACEHOLDER_RE.test(authoredSummary)
  ) {
    return cleanText(authoredSummary);
  }
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

export function sourceComposedReviewStrategy({
  sourceEvidenceBrief,
  authoredStrategy = '',
  primaryConcept = 'the lesson concept',
  studyArtifact = 'the lesson artifact',
}) {
  const authored = cleanText(authoredStrategy);
  const claims = sourceEvidenceBrief?.claims || [];
  const authoredKey = evidenceClaimKey(authored);
  const repeatsLedgerClaim = claims.some((claim) => {
    const key = evidenceClaimKey(claim);
    return key.length >= 20 && authoredKey.includes(key);
  });
  if (!SOURCE_PLACEHOLDER_RE.test(authored) && !repeatsLedgerClaim) return authored;
  return claims.length >= 2
    ? `Rehearse ${primaryConcept} by explaining the first source claim, then compare it with the second. Record what the pair supports, what remains unproven, and the revision it requires in ${studyArtifact}.`
    : `Rehearse ${primaryConcept} with one retained source claim. Record what it supports, what remains unproven, and the revision it requires in ${studyArtifact}.`;
}

export function groundedSyllabusCourseDescription(blueprint = {}) {
  const topics = (blueprint.lessons || [])
    .map((lesson) => stripTerminalPunctuation(cleanText(lesson?.title)).replace(/^Lesson\s+\d+\s*:\s*/i, ''))
    .filter(Boolean)
    .slice(0, 3);
  const evidenceArc =
    topics.length > 0
      ? `Students test decisions about ${topics.join(', ')} and later course topics against assigned source evidence while preserving attribution, license, and claim boundaries.`
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
  const secondaryClaimNumber = Math.max(
    1,
    claims.findIndex((claim) => evidenceClaimKey(claim) === evidenceClaimKey(secondaryAlignedFact)) + 1,
  );
  const sourceComparisonQuestion =
    claims.length >= 2
      ? chooseVariant([
          `For ${primaryConcept}, compare Source Claim 1 with Source Claim 2. What decision follows from their combined evidence, and what remains unproven?`,
          `Read Source Claims 1 and 2 through ${primaryConcept}. Where do they reinforce or complicate each other, and which conclusion is still unwarranted?`,
          `Use ${primaryConcept} to test Source Claim 1 against Source Claim 2. Name the supported judgment and its evidence boundary.`,
          `Which ${primaryConcept} conclusion survives a comparison of Source Claims 1 and 2, and what additional evidence could reverse it?`,
          `Trace the ${primaryConcept} relationship between Source Claims 1 and 2. Identify their shared support, their tension, and one unresolved question.`,
          `Evaluate Source Claims 1 and 2 as evidence for ${primaryConcept}. State what the pair warrants and what neither claim establishes.`,
        ])
      : '';
  const materials = stripTerminalPunctuation(cleanText(lesson.enrichment?.kernel?.scenario?.materials));
  if (claims.length >= 2 && (!materials || SOURCE_PLACEHOLDER_RE.test(materials))) {
    return {
      secondaryAlignedFact,
      secondaryClaimNumber,
      sourceComparisonQuestion,
      sourceEvidencePractice: chooseVariant([
        `For ${primaryConcept}, annotate Source Claims 1 and 2; mark each supporting detail, their tension or dependency, and one bounded conclusion.`,
        `Build a ${primaryConcept} evidence note from Source Claims 1 and 2: label each claim's support, their relationship, and the limit on your conclusion.`,
        `Test ${primaryConcept} with Source Claims 1 and 2. Identify what each supports, where they converge or conflict, and what remains unproven.`,
        `Trace a ${primaryConcept} judgment across Source Claims 1 and 2; cite both details, name their dependency, and set the claim boundary.`,
        `Compare Source Claims 1 and 2 as ${primaryConcept} evidence. Mark their distinct contributions and write a conclusion no broader than the pair permits.`,
        `Use the evidence brief to audit ${primaryConcept}: connect Source Claims 1 and 2, surface one tension, and revise an overbroad conclusion.`,
      ]),
    };
  }
  const boundary = primaryAlignedFact ? stripTerminalPunctuation(primaryAlignedFact) : '';
  return {
    secondaryAlignedFact,
    secondaryClaimNumber,
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
