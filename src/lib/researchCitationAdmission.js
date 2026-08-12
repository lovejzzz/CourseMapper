// Research admission is kept in a separate compile-only boundary so the
// Verified Coherent Draft contract remains independently cacheable.
export function createResearchCitationAdmission({
  citations,
  cleanText,
  focusedLesson,
  isDiscriminativeSurfaceMatch,
  lesson,
  semanticIdentityTokens,
  stripLessonPrefix,
}) {
  const focusedDisciplineText = [focusedLesson.title, ...focusedLesson.keyConcepts, ...focusedLesson.outcomes]
    .join(' ')
    .toLowerCase();
  const computingDomainAllowed =
    /\b(?:algorithm|computational|computer|corpus analysis|data analysis|data science|natural language processing|nlp|programming|software|statistic)\b/.test(
      focusedDisciplineText,
    );
  const researchCaseSpecificAllowed =
    /\b(?:case study|data collection|empirical|experiment|methodolog|participant|research|sample design|survey)\b/.test(
      focusedDisciplineText,
    );
  const focusedLessonTokens = new Set(
    semanticIdentityTokens(
      [focusedLesson.title, ...focusedLesson.keyConcepts, ...focusedLesson.outcomes].filter(Boolean).join(' '),
    ),
  );
  const citationIdentityForLessonTitle = (value) => {
    const title = stripLessonPrefix(value || '');
    const terminalClause = cleanText(title.split(':').at(-1));
    const terminalWordCount = terminalClause.split(/\s+/).filter(Boolean).length;
    return title.includes(':') && terminalWordCount >= 1 && terminalWordCount <= 6 ? terminalClause : title;
  };
  const citationTitleIdentityTokens = (citation) => {
    const title = cleanText(citation?.displayTitle || citation?.title || '');
    return [...new Set(semanticIdentityTokens(title.replace(/\s*\([^)]{1,80}\)\s*$/, '')))];
  };
  const exactLessonTitleCitation = (citation) => {
    const lessonIdentity = citationIdentityForLessonTitle(lesson?.title || '');
    const citationTokens = citationTitleIdentityTokens(citation);
    const authoredSets = [lessonIdentity, ...lessonIdentity.split(/\s+(?:and|versus|vs\.?)\s+|\s*&\s*/i)]
      .map((value) => [...new Set(semanticIdentityTokens(value))])
      .filter((tokens) => tokens.length > 0);
    const titleBoundConcept = authoredSets.find(
      (authored) =>
        authored.every((token) => citationTokens.includes(token)) &&
        citationTokens.every((token) => authored.includes(token) || (authored.length === 1 && token === 'analysi')),
    );
    const topicTokens = semanticIdentityTokens(citation?.topic || '');
    const topicCoversLesson =
      topicTokens.length === 0 || titleBoundConcept?.every((token) => topicTokens.includes(token));
    const sourceBoundChecks = Array.isArray(citation?.supportReceipt?.checks)
      ? citation.supportReceipt.checks.filter(
          (check) => check?.semanticSupport === true && check?.quoteInSnapshot === true,
        )
      : [];
    return Boolean(titleBoundConcept && topicCoversLesson && sourceBoundChecks.length > 0);
  };
  const hasExactLessonTitleRoot = citations.some(exactLessonTitleCitation);
  const citationClaimIsInstructionallyBound = (citation, value) => {
    const claim = cleanText(value);
    if (!claim) return false;
    const advancedBayesianClaim =
      /\b(?:Bayesian (?:inference|methods?)|Gibbs sampling|Markov chain Monte Carlo|MCMC|posterior distribution|prior distribution)\b/i.test(
        claim,
      );
    const advancedBayesianAllowed =
      /\b(?:Bayesian|Gibbs|Markov chain Monte Carlo|MCMC|posterior|prior distribution)\b/i.test(focusedDisciplineText);
    if (advancedBayesianClaim && !advancedBayesianAllowed) return false;
    const researchCaseSpecificClaim =
      /\b(?:participants?|respondents?|students?|subjects?)\b/i.test(claim) &&
      (/\b(?:only\s+)?\d+(?:\.\d+)?%?\b/.test(claim) ||
        /\b(?:average score|data (?:were|was) (?:collected|gathered|taken)|questionnaire|test \([A-Z]{2,}\)|study (?:found|reported|showed))\b/i.test(
          claim,
        ));
    if (researchCaseSpecificClaim && !researchCaseSpecificAllowed) return false;
    if (exactLessonTitleCitation(citation)) return true;
    const titleTokens = citationTitleIdentityTokens(citation);
    const claimTokens = new Set(semanticIdentityTokens(claim));
    const titleLessonMatches = titleTokens.filter((token) => focusedLessonTokens.has(token));
    const titleScopeExtensions = titleTokens.filter((token) => !focusedLessonTokens.has(token));
    const authoredLessonTokens = [
      ...new Set(semanticIdentityTokens(citationIdentityForLessonTitle(lesson?.title || ''))),
    ];
    const authoredLessonMatches = authoredLessonTokens.filter((token) => titleTokens.includes(token));
    const addsSpecialization = titleTokens.some(
      (token) => !authoredLessonTokens.includes(token) && token !== 'analysi',
    );
    if (hasExactLessonTitleRoot && authoredLessonMatches.length > 0 && addsSpecialization) return false;
    const claimLessonMatches = [...claimTokens].filter((token) => focusedLessonTokens.has(token));
    if (titleScopeExtensions.length > 0 && titleLessonMatches.length < 2 && claimLessonMatches.length < 2) {
      return false;
    }
    if (!isDiscriminativeSurfaceMatch(titleTokens, titleLessonMatches)) return false;
    return claimLessonMatches.length >= 2 && isDiscriminativeSurfaceMatch([...claimTokens], claimLessonMatches);
  };
  const citationIsLessonBound = (citation) => {
    const candidateText = [citation?.displayTitle, citation?.title, citation?.evidence]
      .map(cleanText)
      .filter(Boolean)
      .join(' ');
    const dialogSystemClaim = /\b(?:dialog systems?|user utterances?)\b/i.test(candidateText);
    const dialogSystemAllowed =
      /\b(?:computational linguistics|dialog systems?|natural language processing|nlp)\b/.test(focusedDisciplineText);
    if (dialogSystemClaim && !dialogSystemAllowed) return false;
    const genericDataProcessingClaim =
      /\b(?:commercial data processing|computational operations?|digital data)\b/i.test(candidateText);
    const genericDataProcessingAllowed =
      /\b(?:commercial|computer science|computing|digital systems?|information systems?|software)\b/.test(
        focusedDisciplineText,
      );
    if (genericDataProcessingClaim && !genericDataProcessingAllowed) return false;
    const advancedBayesianClaim =
      /\b(?:Bayesian (?:inference|methods?)|Gibbs sampling|Markov chain Monte Carlo|MCMC|posterior distribution|prior distribution)\b/i.test(
        candidateText,
      );
    const advancedBayesianAllowed =
      /\b(?:Bayesian|Gibbs|Markov chain Monte Carlo|MCMC|posterior|prior distribution)\b/i.test(focusedDisciplineText);
    if (advancedBayesianClaim && !advancedBayesianAllowed) return false;
    const computingDomainClaim =
      /\b(?:ai inference models?|algorithm(?:ic)?|commercial data processing|computational (?:modelling|operations?)|computer programs?|dialog (?:act recognition|systems?)|digital data|programming language theory|software implementation|statistical models?|user utterances?)\b/i.test(
        candidateText,
      );
    if (computingDomainClaim && !computingDomainAllowed) return false;
    if (exactLessonTitleCitation(citation)) return true;
    const sourceBoundChecks = Array.isArray(citation?.supportReceipt?.checks)
      ? citation.supportReceipt.checks.filter(
          (check) => check?.semanticSupport === true && check?.quoteInSnapshot === true,
        )
      : [];
    return sourceBoundChecks.some((check) =>
      citationClaimIsInstructionallyBound(citation, check?.claim || check?.quote),
    );
  };

  return { citationClaimIsInstructionallyBound, citationIdentityForLessonTitle, citationIsLessonBound };
}
