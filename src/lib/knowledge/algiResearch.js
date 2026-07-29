/**
 * algiResearch.js — Algi researches a concept instead of being authored one.
 *
 * The held-out measurement that motivated this: hand-authored shards scored
 * 92-100% on the courses they were written for and 6.7% on courses phrased by
 * a different instructor. Authoring does not generalize, because a genome can
 * only hold what someone wrote into it. Research does: the lesson topic is a
 * query, not a lookup key.
 *
 * The honesty boundary is inherited from the foundry and is the whole point:
 * we fetch the source FIRST, keep it as the snapshot, and quote it verbatim.
 * admitKernel() then verifies mechanically that every atom's quote really is
 * in the fetched text, so researched kernels earn TRUST_TIERS.SOURCE_ANCHORED
 * rather than the CONSENSUS cap that genomeExtraction.js accepts for
 * model-proposed atoms with no snapshot behind them.
 *
 * Three gaps the first prototype exposed, each addressed here:
 *
 *  1. TOPIC DRIFT. "affinity mapping user research" retrieved the generic
 *     "User experience design" article and was admitted, because admission
 *     asks "is this quote in this source" and never "is this source about
 *     this topic". A relevance gate now runs BEFORE admission and is the
 *     reason a wrong-but-verifiable article is rejected.
 *  2. SENTENCE QUALITY. Extraction pulled etymology ("the term was coined
 *     by...") and section-header contamination ("History User experience
 *     design is..."). Sentences are now split per line so headers cannot fuse
 *     into prose, and ranked by how much they explain rather than narrate.
 *  3. NO TEACHING ATOMS. Encyclopedic prose has no "students wrongly believe
 *     X". But it does state its own contrasts — "not to be confused with",
 *     "unlike" — and those are real misconceptions with a verbatim quote
 *     behind them, which template-filled ones would not have.
 *
 * Pure functions throughout: the HTTP caller and the embedder are injected and
 * this module performs no fetch of its own.
 */

import { admitKernel } from '../genome/foundryAdmission';
import { attachKernelEntailmentReceipt } from './claimEntailment.js';
import { providerQueryForLesson, providerSupportsLesson } from './algiResearchPlan.js';
import { isCourseAwareWeakSource } from './sourceLedger.js';

export const RESEARCH_ORIGIN = 'algi-research';

/** Browser-safe source APIs, ordered from scholarly evidence to background. */
const WIKI_API = 'https://en.wikipedia.org/w/api.php';
const DOAJ_API = 'https://doaj.org/api/search/articles';
const EUROPE_PMC_API = 'https://www.ebi.ac.uk/europepmc/webservices/rest/search';

/**
 * Below this the source is treated as drift. Deliberately low: the entity
 * filter removes the wrong KIND of page, so this floor only has to catch
 * genuinely unrelated concept pages. Set higher, it rejected Whistleblowing
 * (0.254) for "loyalty, dissent, and disclosure" — a correct answer phrased
 * differently, which is exactly the case this whole module exists to serve.
 */
export const RELEVANCE_FLOOR = 0.22;
/** Lexical fallback floor, used when no embedder is injected. */
export const LEXICAL_FLOOR = 0.28;

const STOPWORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'by',
  'for',
  'from',
  'has',
  'how',
  'in',
  'into',
  'is',
  'it',
  'its',
  'of',
  'on',
  'or',
  'that',
  'the',
  'their',
  'they',
  'this',
  'to',
  'was',
  'were',
  'what',
  'when',
  'which',
  'who',
  'why',
  'with',
  'you',
  'your',
  'course',
  'lesson',
  'week',
  'unit',
  'introduction',
  'intro',
  'overview',
  'basics',
  'fundamentals',
  'principles',
]);

/**
 * Crude suffix stripping, which matters more than it looks: without it
 * "low-fidelity wireframes" scored 0 against the article "Website wireframe",
 * because plural and singular are different strings. The embedder never had
 * this problem, but the browser runs the lexical path.
 */
function stem(token) {
  const normalized = String(token || '').toLowerCase();
  // Scientific course language changes form aggressively while preserving the
  // concept family: microbial / microbiology / microbiological, pathogen /
  // pathogenic, and bio-/phyto-/mycoremediation. Treating those as unrelated
  // made exact environmental-microbiology sources fail the lexical path even
  // when their titles and definitions named the right mechanism.
  if (/^microbi(?:al|olog|ome|ota)/.test(normalized)) return 'microbi';
  if (/^pathogen/.test(normalized)) return 'pathogen';
  if (/^waterborne/.test(normalized)) return 'water';
  if (/(?:^|[a-z])remediation$/.test(normalized)) return 'remediation';
  if (/^govern(?:ance|ed|ing|ment|ments|s)?$/.test(normalized)) return 'govern';
  return normalized
    .replace(/(?:ies)$/, 'y')
    .replace(/(?:sses|shes|ches|xes)$/, '')
    .replace(/(?:ing|ed|es|s)$/, '')
    .replace(/(?:e)$/, '');
}

export function contentTokens(text = '') {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !STOPWORDS.has(token))
    .map(stem)
    .filter((token) => token.length >= 3);
}

/**
 * Preserve both sides of a compound lesson title in a single search request.
 * MediaWiki treats "Qubits and quantum states" as a loose bag of words and
 * ranks hardware pages above Quantum state. Quoted OR clauses retrieve the two
 * named concepts without adding another network round trip; relevance and
 * source admission still decide what survives.
 */
export function researchQueryForTopic(topic = '', courseContext = '') {
  const clauses = String(topic)
    .split(/\s+(?:and|&)\s+/i)
    .map((clause) => clause.replace(/"/g, '').trim())
    .filter(Boolean);
  if (clauses.length !== 2 || clauses.some((clause) => contentTokens(clause).length === 0)) return String(topic);
  const domainToken = contentTokens(courseContext)[0] || '';
  const alternatives = clauses.map((clause) => `"${clause}"`).join(' OR ');
  return domainToken ? `${domainToken} (${alternatives})` : alternatives;
}

/**
 * Candidate pages MediaWiki can resolve directly in one batched title lookup.
 * Compound lesson names contribute both named sides, so an exact-title pass
 * can find Qubit and Quantum state without paying for two search requests.
 */
export function directResearchTitles(topic = '', courseContext = '') {
  const normalized = String(topic)
    .replace(/^(?:an?\s+)?(?:introduction|overview|foundations?|fundamentals?)\s+(?:to|of)\s+/i, '')
    .trim();
  if (!normalized) return [];
  const baseTopic = normalized.replace(
    /:\s*(?:in practice|evidence and methods|comparisons?|limitations?|applications?)\s*$/i,
    '',
  );
  const clauses = normalized
    .split(/\s+(?:and|&)\s+/i)
    .map((clause) => clause.trim())
    .filter((clause) => contentTokens(clause).length > 0);
  const normalizedWords = normalized.split(/\s+/).filter(Boolean);
  // Three-plus-word pedagogical labels often wrap a canonical concept:
  // “microbial risk assessment” should try both “risk assessment” and
  // “microbial risk” in the same exact-title batch before spending a search.
  const phraseWindows =
    clauses.length === 1 && normalizedWords.length >= 3
      ? [normalizedWords.slice(0, 2).join(' '), normalizedWords.slice(-2).join(' ')]
      : [];
  // Course authors name the causal agent (“waterborne pathogens”), while an
  // encyclopedia commonly titles the same coverage area by outcome
  // (“Waterborne disease”). Admit that narrow modifier-preserving alias
  // without turning arbitrary related search results into exact matches.
  const pathogenOutcomeAliases =
    normalizedWords.length === 2 && /^pathogens?$/i.test(normalizedWords[1])
      ? [`${normalizedWords[0]} disease`, `${normalizedWords[0]} diseases`]
      : [];
  // Canonical concept families for topics whose encyclopedia page naturally
  // teaches through named sub-concepts. These are title lookups in the same
  // batched request, not hard-coded facts: every returned page still has to
  // pass entity rejection, topic/definition relevance, source admission, and
  // the compiler's atom gates. The expansion replaces the former accidental
  // strategy of borrowing any same-course page merely because it contained
  // "microbial".
  const conceptFamilyTitles = (() => {
    const accessibilityCourse =
      /\b(?:accessib(?:le|ility)|inclusive design|web standards?|user experience|ux\b)\b/i.test(courseContext);
    if (accessibilityCourse && /\bwcag\b|\bweb content accessibility guidelines?\b/i.test(baseTopic)) {
      return [
        'Web Content Accessibility Guidelines',
        'Web accessibility',
        'Web Accessibility Initiative',
        'Accessibility',
      ];
    }
    if (accessibilityCourse && /\bsemantic html\b|\bhtml semantics?\b/i.test(baseTopic)) {
      return ['Semantic HTML', 'HTML', 'HTML element', 'WAI-ARIA', 'Web accessibility'];
    }
    if (
      accessibilityCourse &&
      /\baccessible (?:forms?|inputs?|controls?)\b|\b(?:html|web) forms? accessibility\b/i.test(baseTopic)
    ) {
      return [
        'Form (HTML)',
        'Web accessibility',
        'Web Accessibility Initiative',
        'WAI-ARIA',
        'Web Content Accessibility Guidelines',
      ];
    }
    if (/^waterborne\s+pathogens?$/i.test(normalized)) {
      // The lesson is a relationship, not a single encyclopedia headword:
      // Waterborne disease defines transmission, Pathogenic bacteria defines
      // one agent class, and Water pollution defines the contaminated medium.
      // These remain candidates—not authored knowledge—and still must pass
      // relevance, source admission, and claim-to-passage entailment.
      return ['Waterborne disease', 'Pathogenic bacteria', 'Water pollution'];
    }
    if (/^microbial\s+risk\s+assessment$/i.test(normalized)) {
      // These are the explicit analytical stages surrounding a microbial
      // hazard decision. Europe PMC can contribute QMRA studies first; the
      // encyclopedia lane supplies stable background definitions only where
      // the scholarly set cannot satisfy the lesson contract.
      return ['Risk assessment', 'Exposure assessment', 'Dose–response relationship'];
    }
    if (/^biofilms?$/i.test(normalized)) {
      return [
        'Biofilm',
        'Biofilm matrix',
        'Microbial mat',
        'Phototrophic biofilm',
        'Extracellular polymeric substance',
      ];
    }
    if (/^(?:bio)?remediation$/i.test(normalized)) {
      return ['Bioremediation', 'Phytoremediation', 'Mycoremediation', 'Biodegradation'];
    }
    if (/\bcontextual inquiry\b/i.test(normalized) && /\bfield\s*notes?\b/i.test(normalized)) {
      // Wikipedia spells Fieldnotes as one word, while instructors almost
      // always write "field notes". Contextual inquiry and Fieldnotes give
      // the two named concepts; Field research supplies the source-defined
      // observation/interview context needed for a third teachable term.
      return ['Contextual inquiry', 'Fieldnotes', 'Field research'];
    }
    if (
      /\b(?:evidence[-\s]+based\s+design\s+recommendations?|design\s+recommendations?)\b/i.test(normalized) &&
      /\b(?:user\s+experience|ux\b|user[-\s]?centered|human[-\s]?centered|interaction\s+design)\b/i.test(courseContext)
    ) {
      // “Evidence-based design” is primarily an architecture/healthcare term
      // in encyclopedias. A UX lesson with the same words needs sources about
      // user evidence and design rationale, not physical environments.
      return ['User research', 'User-centered design', 'Design rationale', 'Usability testing'];
    }
    if (/\bduties?\s+to\s+workers?\b|\bworker duties?\b/i.test(baseTopic)) {
      return ["Workers' rights", 'Labour law', 'Occupational safety and health', 'Duty of care'];
    }
    if (/\baccountable\s+case\s+recommendations?\b|\baccountable\s+recommendations?\b/i.test(baseTopic)) {
      return ['Business ethics', 'Stakeholder theory', 'Corporate social responsibility', 'Accountability'];
    }
    if (/\bintervention\s+design\b/i.test(baseTopic)) {
      return ['Logic model', 'Theory of change', 'Program evaluation', 'Implementation science'];
    }
    if (/\bimplementation\s+barriers?\b/i.test(baseTopic)) {
      return ['Implementation science', 'Policy implementation', 'Implementation research', 'Barrier analysis'];
    }
    if (/\bevaluation\s+metrics?\b/i.test(baseTopic)) {
      return ['Program evaluation', 'Performance indicator', 'Outcome measure', 'Monitoring and evaluation'];
    }
    if (
      /\bai governance\b|\bgovernance of artificial intelligence\b|\b(?:current\s+)?artificial[-\s]+intelligence\s+regulation\b/i.test(
        baseTopic,
      )
    ) {
      return [
        'Governance of artificial intelligence',
        'Regulation of artificial intelligence',
        'Algorithmic accountability',
        'AI safety',
      ];
    }
    if (/\bplatform (?:accountability|governance)\b/i.test(baseTopic)) {
      return [
        'Platform governance',
        'Internet governance',
        'Platform economy',
        'Content moderation',
        'Algorithmic accountability',
        'Online service provider',
      ];
    }
    if (
      /\bprivacy regulation\b|\bdata protection regulation\b|\bprivacy\s+and\s+data\s+protection\b/i.test(baseTopic)
    ) {
      return ['Information privacy law', 'Privacy law', 'Data protection', 'General Data Protection Regulation'];
    }
    if (
      /\balgorithmic audits?\b|\balgorithm audits?\b|\balgorithmic\s+accountability\s+standards?\b/i.test(baseTopic)
    ) {
      return ['Algorithmic accountability', 'Algorithmic bias', 'Algorithmic transparency'];
    }
    if (
      /\bemerging policy proposals?\b|\bpolicy proposals?\b|\b(?:evidence[-\s]+based\s+)?policy recommendations?\b/i.test(
        baseTopic,
      )
    ) {
      return ['Public policy', 'Policy analysis', 'Policy cycle', 'Technology policy', 'Regulatory impact analysis'];
    }
    return [];
  })();
  const named = [
    normalized,
    ...(baseTopic !== normalized ? [baseTopic] : []),
    ...(clauses.length === 2 ? clauses : []),
    ...phraseWindows,
    ...pathogenOutcomeAliases,
    ...conceptFamilyTitles,
  ];
  const domain = contentTokens(courseContext)[0] || '';
  const qualified = domain
    ? clauses
        .filter((clause) => !contentTokens(clause).includes(domain))
        .map((clause) => `${domain.charAt(0).toUpperCase()}${domain.slice(1)} ${clause}`)
    : [];
  return [...new Set([...named, ...qualified])].slice(0, 8);
}

/**
 * CirrusSearch accepts OR queries. Expanding compound topics into their named
 * sides gives a grouped course request useful coverage instead of a single
 * broad page for the whole pedagogical phrase.
 */
export function groupedResearchQuery(topics = []) {
  const clauses = [
    ...new Set(
      topics.flatMap((topic) => {
        const titles = directResearchTitles(topic);
        return titles.length > 1 ? titles.slice(1) : titles;
      }),
    ),
  ];
  return clauses
    .map((clause) => (/\s/.test(clause) ? `"${clause.replace(/"/g, '')}"` : clause.replace(/"/g, '')))
    .join(' OR ');
}

export function groupedResearchQueryFromPlan(topics = [], researchPlan = null, providerId = '') {
  const clauses = [
    ...new Set(
      topics
        .map((topic) => providerQueryForLesson(researchPlan, topic, providerId))
        .map((query) => String(query || '').trim())
        .filter(Boolean),
    ),
  ];
  if (clauses.length === 0) return groupedResearchQuery(topics);
  return clauses.map((clause) => `(${clause})`).join(' OR ');
}

/** Jaccard-style overlap, used when no embedder is available. */
export function lexicalRelevance(topic, candidateText) {
  const a = new Set(contentTokens(topic));
  const b = new Set(contentTokens(candidateText));
  if (a.size === 0 || b.size === 0) return 0;
  const sameConceptStem = (left, right) =>
    left === right || (Math.min(left.length, right.length) >= 6 && (left.startsWith(right) || right.startsWith(left)));
  let shared = 0;
  for (const token of a) if ([...b].some((candidate) => sameConceptStem(token, candidate))) shared += 1;
  return shared / a.size;
}

function containsTokenSequence(needle, haystack) {
  if (needle.length === 0 || haystack.length < needle.length) return false;
  for (let start = 0; start <= haystack.length - needle.length; start += 1) {
    if (needle.every((token, offset) => haystack[start + offset] === token)) return true;
  }
  return false;
}

export function cosine(a = [], b = []) {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length && i < b.length; i += 1) {
    const left = Number(a[i]) || 0;
    const right = Number(b[i]) || 0;
    dot += left * right;
    normA += left * left;
    normB += right * right;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/* ------------------------------------------------------------------ *
 * Gap 2 — sentence selection
 * ------------------------------------------------------------------ */

/**
 * Split an extract into sentences WITHOUT letting section headings fuse into
 * the following paragraph. Plain-text extracts render headings as their own
 * short, unpunctuated lines, so line structure has to be respected first.
 */
export function sentencesFrom(extract = '') {
  const out = [];
  for (const rawLine of String(extract).split(/\n+/)) {
    const line = rawLine.trim();
    if (!line) continue;
    // A heading: short and unpunctuated. Dropping it is what stops
    // "History User experience design is..." from being emitted as prose.
    if (!/[.!?]/.test(line) && line.length < 80) continue;
    for (const piece of line.split(/(?<=[.!?])\s+(?=[A-Z"'(])/)) {
      const sentence = piece.replace(/\s+/g, ' ').trim();
      if (sentence.length < 45 || sentence.length > 320) continue;
      if (!/[.!?]$/.test(sentence)) continue;
      if (!/\s/.test(sentence)) continue;
      out.push(sentence);
    }
  }
  return out;
}

const EXPLANATORY =
  /\b(is|are|has|have|uses?|refers to|means|consists? of|involves|describes|occurs|because|when|if|therefore|results? in|allows?|requires?|provides?)\b/i;
/** Narration, not instruction: origin stories date a concept without teaching it. */
const NARRATIVE =
  /\b(coined|named after|founded|born|died|in \d{4}|since \d{4}|century|first (?:used|described|published)|history of)\b/i;
/**
 * True but instructionally thin encyclopedia lead-ins. They advertise a
 * topic's importance without explaining the mechanism, distinction, or
 * evidence a student could reason with. Before this penalty, a quantum lesson
 * promoted "at the heart of the disparity..." over concrete definitions and
 * examples, then repeated it through slides and quiz keys.
 */
const TOPIC_PROMOTION =
  /\b(?:at the heart of|active area of (?:current )?research|important theoretical model|widely studied topic|subject of considerable research)\b/i;

export function explanatoryScore(sentence, head = '') {
  let score = 0;
  if (EXPLANATORY.test(sentence)) score += 2;
  if (head && sentence.toLowerCase().includes(head.toLowerCase())) score += 2;
  if (NARRATIVE.test(sentence)) score -= 3;
  if (TOPIC_PROMOTION.test(sentence)) score -= 4;
  if (/\(|\)|"/.test(sentence)) score -= 1;
  if (sentence.length > 90 && sentence.length < 240) score += 1;
  return score;
}

/**
 * A course teaches concepts, not entities. Wikipedia search answers an abstract
 * lesson phrase with whatever page ranks — "duties owed to workers" returned
 * Workers' Party (Singapore), "closing case deliberation" returned Jury Duty
 * (2023 TV series). These are not near-misses to be scored down; they are the
 * wrong KIND of page, and rejecting them by kind is what lets the relevance
 * floor drop far enough to keep a correct-but-oddly-worded match like
 * Whistleblowing, which scored 0.254 while the wrong-subject Lie scored 0.457.
 */
// People are the most dangerous entity class here, because a researcher's
// biography is FULL of the topic's vocabulary: "Sharon Oviatt" outscored every
// real concept for "human-centered design foundations" and was admitted as
// something to teach. Roles are listed explicitly since a bio's lead sentence
// is "X is an American computer scientist", not "X is a company".
const PERSON_ROLE =
  '(?:researcher|scientist|bioscientist|biologist|microbiologist|ecologist|professor|scholar|academic|engineer|designer|architect|artist|author|writer|philosopher|economist|psychologist|sociologist|historian|journalist|executive|physician|lawyer|teacher|educator|mathematician|programmer|entrepreneur|activist|critic|producer|director)';
const ENTITY_NOUN = `(?:company|corporation|firm|band|film|movie|album|song|single|novel|political party|party|magazine|newspaper|journal|television series|TV series|video game|organization|organisation|government agency|agency|bureau|department|ministry|office|society|association|institute|council|center|centre|university|college|city|town|village|river|mountain|footballer|singer|actor|actress|politician|businessman|businesswoman|athlete|musician|${PERSON_ROLE.slice(3, -1)})`;
// Any parenthetical CONTAINING an entity word — real titles read "(2023 TV
// series)", not "(TV series)", so an exact-content match caught nothing.
const ENTITY_PARENTHETICAL = new RegExp(`\\([^)]*\\b${ENTITY_NOUN}\\b[^)]*\\)`, 'i');
// Up to four intervening words of ANY case: "is a major social democratic
// political party" slipped through a pattern that expected capitalised words.
const ENTITY_LEAD = new RegExp(`\\b(?:is|was|are|were)\\s+(?:a|an|the)\\s+(?:[\\w'-]+\\s+){0,4}${ENTITY_NOUN}\\b`, 'i');

export function looksLikeEntity(title = '', definition = '') {
  if (ENTITY_PARENTHETICAL.test(title)) return true;
  if (ENTITY_LEAD.test(definition)) return true;
  // Born/founded/released dates are biography and product markers, not concepts.
  if (/\b(?:born|founded|established|released|formed)\s+(?:in\s+)?\d{4}\b/i.test(definition)) return true;
  // "(born 1958)" and "is an American computer scientist" — the two shapes a
  // Wikipedia biography opens with, neither caught by the noun list alone.
  if (/\(\s*born\b/i.test(definition)) return true;
  if (
    new RegExp(
      `\\b(?:is|was)\\s+(?:a|an)\\s+(?:[A-Z][\\w'-]+|[\\w'-]+)\\s+(?:[\\w'-]+\\s+){0,2}${PERSON_ROLE}\\b`,
    ).test(definition)
  ) {
    return true;
  }
  return false;
}

/** The head noun of an article title, minus any disambiguation parenthetical. */
export function headOf(title = '') {
  return String(title)
    .replace(/\s*\([^)]*\)\s*$/, '')
    .trim();
}

function escapeResearchRegExp(value = '') {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const COPULA =
  /\b(is|are|refers to|is defined as|describes|means|denotes|comprises|includes|encompasses|covers|needs?|aims?|communicates?|identif(?:y|ies)|allows?|helps?|has become|serves as)\b/i;

/**
 * The lead sentence of an encyclopedia article is nearly always the definition,
 * so position matters as much as pattern. Ranking by position stops a mid-article
 * comparative ("what distinguishes Kantian deontologism from divine command
 * deontology is...") from being served as the definition of the concept.
 */
export function definitionSentence(sentences, head, searchLimit = 12) {
  const term = headOf(head).toLowerCase();
  const termTokens = contentTokens(term);
  const ranked = [];
  for (let index = 0; index < Math.min(sentences.length, Math.max(1, Number(searchLimit) || 12)); index += 1) {
    const sentence = sentences[index];
    const at = sentence.toLowerCase().indexOf(term);
    // Wikipedia often introduces a subject after a short field qualifier and
    // changes singular/plural or possessive spelling: "In quantum information
    // science, the Bell's states ... are". Compare normalized leading tokens
    // after that qualifier, while keeping the same subject-position rule.
    const normalizedLead = sentence.replace(/^(?:in|within)\s+[^,]{1,70},\s*/i, '').replace(/^the\s+/i, '');
    const tokenSubjectMatch =
      termTokens.length > 0 &&
      containsTokenSequence(termTokens, contentTokens(normalizedLead).slice(0, termTokens.length + 1));
    // The term must be the SUBJECT, not merely present. At 60 chars a mention
    // buried in a subordinate clause ("Some scholars argue that the wider
    // literature on deontology is inconsistent") still qualified as a definition.
    if ((at < 0 || at > 40) && !tokenSubjectMatch) continue;
    if (!COPULA.test(sentence)) continue;
    // Prefer a sentence whose grammatical subject is the requested concept.
    // A loose mention inside "<label> element" used to outrank the later,
    // direct sentence "Labels need to describe the purpose..." purely because
    // it appeared one line earlier.
    const exactSubject =
      at === 0 || new RegExp(`^(?:the\\s+)?${escapeResearchRegExp(term)}\\b`, 'i').test(normalizedLead);
    ranked.push({
      sentence,
      score: (exactSubject ? 12 : tokenSubjectMatch ? 8 : 0) - index * 2 - Math.max(0, at) / 20,
    });
  }
  ranked.sort((left, right) => right.score - left.score);
  return ranked[0]?.sentence || null;
}

/* ------------------------------------------------------------------ *
 * Gap 3 — teaching atoms the source states about itself
 * ------------------------------------------------------------------ */

const CONTRAST =
  /\b(not to be confused with|often confused with|commonly confused|a common misconception|contrary to (?:popular )?(?:belief|assumption)|unlike|in contrast to|should not be confused|is not (?:the same as|simply|merely|to be)|differs? from|rather than|as opposed to|does not (?:mean|imply|require)|whereas)\b/i;
const EXEMPLIFY = /\b(for example|for instance|such as|e\.g\.)\b/i;

export function contrastSentences(sentences) {
  return sentences.filter((sentence) => CONTRAST.test(sentence));
}

function sentenceNamesConcept(sentence = '', term = '') {
  const phrase = String(term || '')
    .trim()
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/[\s-]+/g, '[\\s-]+');
  return Boolean(phrase && new RegExp(`\\b${phrase}\\b`, 'i').test(String(sentence || '')));
}

export function exampleSentences(sentences, head) {
  return sentences
    .filter((sentence) => EXEMPLIFY.test(sentence))
    .sort((left, right) => explanatoryScore(right, head) - explanatoryScore(left, head));
}

/**
 * Turn a contrast sentence into a misconception the way an instructor would
 * read it: the article says these two are confused, so students confuse them.
 */
export function misconceptionFromContrast(sentence, term) {
  const target = contrastTargetFromSentence(sentence).replace(/^(?:merely|simply|just)\s+/i, '');
  const frame = String(sentence || '').match(
    /\b(rather than|as opposed to|does not (?:mean|imply|require)|not to be confused with|often confused with|commonly confused with|should not be confused with|in contrast to|unlike|differs? from|is not the same as)\b/i,
  )?.[1];
  return {
    text: !target
      ? `A related idea can be labeled ${term} without checking the source definition.`
      : /rather than|as opposed to/i.test(frame || '')
        ? `${term} is mainly about ${target}.`
        : /does not (?:mean|imply|require)/i.test(frame || '')
          ? `${term} necessarily means ${target}.`
          : `${term} is the same as ${target}.`,
    corrective: target ? `The source distinguishes ${term} from ${target}.` : sentence,
  };
}

/**
 * Recover the concept on the other side of an explicit source contrast. Keep
 * only a compact noun phrase; copying an entire subordinate clause would move
 * the clipping defect into the misconception itself.
 */
export function contrastTargetFromSentence(sentence = '') {
  const text = String(sentence).replace(/\s+/g, ' ').trim();
  const match = text.match(
    /(?:not to be confused with|often confused with|commonly confused with|should not be confused with|in contrast to|unlike|differs? from|rather than|as opposed to|is not the same as|does not (?:mean|imply|require))\s+(?:the\s+)?([^,.;:]{3,100})/i,
  );
  if (!match?.[1]) return '';
  const words = match[1]
    .replace(/\([^)]*\)/g, ' ')
    .replace(/^(?:merely|simply|just)\s+/i, '')
    .replace(/^to\s+([a-z]+)\b/i, (_match, verb) => {
      const normalized = String(verb).toLowerCase();
      if (normalized.endsWith('ie')) return `${normalized.slice(0, -2)}ying`;
      if (normalized.endsWith('e') && !normalized.endsWith('ee')) return `${normalized.slice(0, -1)}ing`;
      return `${normalized}ing`;
    })
    .replace(/^(?:as|a|an)\s+/i, '')
    .replace(/\b(?:because|although|while|whereas|when|which|that)\b[\s\S]*$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .slice(0, 10);
  while (words.length > 0 && /^(?:a|an|and|as|at|by|for|from|in|of|on|or|the|to|with)$/i.test(words.at(-1))) {
    words.pop();
  }
  return words
    .join(' ')
    .replace(/[^\p{L}\p{N})\]]+$/u, '')
    .trim();
}

/**
 * A discriminating item needs distractors a confused student would pick. The
 * article names them: whatever it says the concept is confused with.
 */
export function distractorsFromContrast(sentences, term) {
  const found = [];
  for (const sentence of sentences) {
    const match = sentence.match(
      /(?:not to be confused with|often confused with|in contrast to|unlike|is not the same as)\s+(?:the\s+)?([a-z][a-z0-9 -]{3,48})/i,
    );
    const candidate = match?.[1]?.trim().replace(/[,.;:].*$/, '');
    if (candidate && candidate.toLowerCase() !== String(term).toLowerCase() && !found.includes(candidate)) {
      found.push(candidate);
    }
  }
  return found;
}

/* ------------------------------------------------------------------ *
 * Providers (injected)
 * ------------------------------------------------------------------ */

export function buildWikipediaProvider(httpJson) {
  const recordsFromQuery = (data) => {
    const records = {};
    for (const page of Object.values(data?.query?.pages || {})) {
      const title = String(page?.title || '').trim();
      if (!title || !page?.extract) continue;
      records[title] = {
        title,
        extract: page.extract,
        sourceUrl: page.fullurl || `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/\s+/g, '_'))}`,
        revisionId: page.revisions?.[0]?.revid || null,
        revisionTimestamp: page.revisions?.[0]?.timestamp || '',
      };
    }
    return records;
  };
  const loadArticleChunk = async (unique) => {
    // MediaWiki's extracts module defaults to ONE page even when `titles`
    // contains a batch. Without exlimit=max the request looked batched in the
    // network panel but only the final candidate carried text, leaving most
    // researched lessons with zero usable concepts.
    // `exintro=1` is essential here. MediaWiki forces whole-article extracts
    // back to exlimit=1, but allows intro extracts to be batched. The lead is
    // also the strongest definition/evidence region and avoids downloading
    // several full encyclopedia articles for one lesson.
    const url = `${WIKI_API}?action=query&prop=extracts%7Cinfo%7Crevisions&explaintext=1&exintro=1&exsectionformat=plain&exlimit=max&inprop=url&rvprop=ids%7Ctimestamp&redirects=1&titles=${encodeURIComponent(unique.join('|'))}&format=json&origin=*`;
    const data = await httpJson(url);
    const records = recordsFromQuery(data);
    const aliases = new Map();
    for (const normalized of data?.query?.normalized || []) {
      if (normalized?.from && normalized?.to) aliases.set(String(normalized.from), String(normalized.to));
    }
    for (const redirect of data?.query?.redirects || []) {
      if (redirect?.from && redirect?.to) aliases.set(String(redirect.from), String(redirect.to));
    }
    const resolveAlias = (title) => {
      let current = title;
      const seen = new Set();
      while (aliases.has(current) && !seen.has(current)) {
        seen.add(current);
        current = aliases.get(current);
      }
      return current;
    };
    for (const requested of unique) {
      const resolved = resolveAlias(requested);
      if (!records[requested] && records[resolved]) records[requested] = records[resolved];
    }
    return records;
  };
  const loadArticles = async (titles) => {
    const unique = [...new Set((titles || []).map((title) => String(title || '').trim()).filter(Boolean))];
    if (unique.length === 0) return {};
    const records = {};
    // Anonymous MediaWiki clients may request up to 50 page titles at once.
    // Chunking here keeps a full 15-session course bounded without truncating
    // the candidate pool to whichever twelve titles happened to come first.
    for (let start = 0; start < unique.length; start += 50) {
      Object.assign(records, await loadArticleChunk(unique.slice(start, start + 50)));
    }
    return records;
  };
  const loadFullArticle = async (title) => {
    const requested = String(title || '').trim();
    if (!requested) return null;
    // Intro extracts are ideal for broad candidate ranking, but a lesson
    // ledger needs enough independent source sentences for facts, examples,
    // misconceptions, and assessment explanations. Once ranking has selected
    // a page, fetch that one page's complete plain-text extract. Keeping this
    // single-title respects MediaWiki's whole-extract exlimit=1 boundary.
    const url = `${WIKI_API}?action=query&prop=extracts%7Cinfo%7Crevisions&explaintext=1&exsectionformat=plain&inprop=url&rvprop=ids%7Ctimestamp&redirects=1&titles=${encodeURIComponent(requested)}&format=json&origin=*`;
    const records = recordsFromQuery(await httpJson(url));
    return records[requested] || Object.values(records)[0] || null;
  };
  return {
    id: 'wikipedia',
    sourceKind: 'open encyclopedia',
    supportsDirectTitles: true,
    async search(topic, limit = 3) {
      const url = `${WIKI_API}?action=query&list=search&srsearch=${encodeURIComponent(topic)}&srlimit=${limit}&format=json&origin=*`;
      const data = await httpJson(url);
      return (data?.query?.search || []).map((hit) => hit.title).filter(Boolean);
    },
    async searchArticles(topic, limit = 12) {
      // Generator search returns ranked titles and their lead extracts in the
      // SAME request. This removes the last search→article fan-out that could
      // put a six-lesson course over Wikipedia's anonymous burst limit.
      const url = `${WIKI_API}?action=query&generator=search&gsrsearch=${encodeURIComponent(topic)}&gsrlimit=${Math.min(
        50,
        Math.max(1, Number(limit) || 12),
      )}&prop=extracts%7Cinfo%7Crevisions&explaintext=1&exintro=1&exsectionformat=plain&exlimit=max&inprop=url&rvprop=ids%7Ctimestamp&redirects=1&format=json&origin=*`;
      return recordsFromQuery(await httpJson(url));
    },
    async article(title) {
      const records = await loadArticles([title]);
      return records[title] || Object.values(records)[0] || null;
    },
    fullArticle: loadFullArticle,
    articles: loadArticles,
    license: 'CC BY-SA 4.0',
    attributionFor: (title) => `Wikipedia contributors, “${title}”`,
    sourceIdFor: (title) => `wikipedia:${title}`,
  };
}

const WAI_SOURCE_CATALOG = Object.freeze([
  {
    title: 'Web Content Accessibility Guidelines',
    suggestedTerm: 'Web Content Accessibility Guidelines',
    url: 'https://www.w3.org/TR/WCAG22/',
    keywords: 'wcag principles conformance success criteria web content accessibility guidelines standard',
  },
  {
    title: 'Accessibility principles',
    suggestedTerm: 'Robust content',
    url: 'https://www.w3.org/WAI/fundamentals/accessibility-principles/',
    definitionWindow: 160,
    keywords:
      'wcag accessibility principles perceivable operable understandable robust content assistive technology web',
  },
  {
    title: 'Understanding Conformance',
    suggestedTerm: 'WCAG conformance',
    url: 'https://www.w3.org/WAI/WCAG22/Understanding/conformance',
    keywords:
      'wcag principles conformance requirements claims levels a aa aaa success criteria testing accessibility support',
    definitionMode: 'explanatory-page',
  },
  {
    title: 'Accessible forms',
    suggestedTerm: 'Accessible forms',
    url: 'https://www.w3.org/WAI/tutorials/forms/',
    keywords: 'accessible forms form controls labels instructions validation errors accessibility',
  },
  {
    title: 'Labels',
    suggestedTerm: 'Labels',
    url: 'https://www.w3.org/WAI/tutorials/forms/labels/',
    keywords: 'accessible forms labels labeling controls form control input accessible name',
  },
  {
    title: 'Input validation',
    suggestedTerm: 'Validation',
    url: 'https://www.w3.org/WAI/tutorials/forms/validation/',
    keywords: 'accessible forms input validation errors required fields feedback instructions',
  },
  {
    title: 'Page structure',
    suggestedTerm: 'Well-structured content',
    url: 'https://www.w3.org/WAI/tutorials/page-structure/',
    keywords: 'semantic html page structure meaningful elements regions landmarks accessibility',
  },
  {
    title: 'Headings',
    suggestedTerm: 'Headings',
    url: 'https://www.w3.org/WAI/tutorials/page-structure/headings/',
    keywords: 'semantic html headings heading ranks page sections structure accessibility',
  },
  {
    title: 'Page regions',
    suggestedTerm: 'Page regions',
    url: 'https://www.w3.org/WAI/tutorials/page-structure/regions/',
    keywords: 'semantic html page regions landmarks main navigation structure accessibility',
  },
  {
    title: 'Evaluating web accessibility',
    suggestedTerm: 'Accessibility evaluation',
    url: 'https://www.w3.org/WAI/test-evaluate/',
    keywords:
      'accessibility evaluation assessment audit testing remediation early development tools human evaluation conformance reports',
  },
  {
    title: 'Easy Checks',
    suggestedTerm: 'Accessibility assessment',
    url: 'https://www.w3.org/WAI/test-evaluate/preliminary/',
    keywords:
      'accessibility testing easy checks preliminary review page title headings contrast keyboard focus forms labels limitations comprehensive assessment',
    definitionMode: 'explanatory-page',
  },
  {
    title: 'WCAG-EM overview',
    suggestedTerm: 'WCAG Evaluation Methodology',
    url: 'https://www.w3.org/WAI/test-evaluate/conformance/wcag-em/',
    keywords:
      'accessibility testing conformance evaluation methodology wcag-em scope sampling audit findings reports remediation',
    definitionMode: 'explanatory-page',
  },
]);

function decodeResearchHtmlEntities(value = '') {
  const named = {
    amp: '&',
    apos: "'",
    gt: '>',
    hellip: '…',
    laquo: '«',
    ldquo: '“',
    lsquo: '‘',
    lt: '<',
    mdash: '—',
    nbsp: ' ',
    ndash: '–',
    quot: '"',
    raquo: '»',
    rdquo: '”',
    rsquo: '’',
  };
  return String(value).replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity) => {
    const token = String(entity).toLowerCase();
    if (token.startsWith('#x')) return String.fromCodePoint(Number.parseInt(token.slice(2), 16));
    if (token.startsWith('#')) return String.fromCodePoint(Number.parseInt(token.slice(1), 10));
    return named[token] ?? match;
  });
}

/**
 * Reduce an official WAI HTML page to its main prose while preserving paragraph
 * boundaries. No browser DOM API is required, so the same provider can be
 * exercised in Vitest and in the production browser.
 */
export function extractWaiResearchText(html = '') {
  const source = String(html || '');
  const main = source.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1] || source;
  return decodeResearchHtmlEntities(
    main
      .replace(
        /<(?:script|style|svg|template|noscript)\b[^>]*>[\s\S]*?<\/(?:script|style|svg|template|noscript)>/gi,
        ' ',
      )
      .replace(/<(?:br|hr)\b[^>]*>/gi, '\n')
      .replace(/<\/(?:p|li|h[1-6]|section|article|div|pre|blockquote|dt|dd)>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  )
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
    .slice(0, 180_000);
}

function waiCatalogEntriesForQuery(query = '', limit = 12) {
  const queryTokens = new Set(contentTokens(query));
  return WAI_SOURCE_CATALOG.map((entry, index) => {
    const entryTokens = new Set(contentTokens(`${entry.title} ${entry.keywords}`));
    const overlap = [...queryTokens].filter((token) => entryTokens.has(token)).length;
    const exactPhrase = String(query).toLowerCase().includes(entry.title.toLowerCase()) ? 4 : 0;
    return { entry, index, score: overlap + exactPhrase };
  })
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, Math.max(1, Number(limit) || 12))
    .map(({ entry }) => entry);
}

const WAI_SOURCE_FAMILIES = Object.freeze({
  wcag: new Set(['Web Content Accessibility Guidelines', 'Accessibility principles', 'Understanding Conformance']),
  structure: new Set(['Page structure', 'Headings', 'Page regions']),
  forms: new Set(['Accessible forms', 'Labels', 'Input validation']),
  evaluation: new Set(['Evaluating web accessibility', 'Easy Checks', 'WCAG-EM overview']),
});

/**
 * Keep a bounded official source catalog bound to the lesson family that
 * selected it. Shared words such as "accessibility", "keyboard", and
 * "conformance" occur across most WAI pages; lexical overlap alone therefore
 * cannot decide whether a page belongs to a lesson. The family boundary is
 * source routing metadata, not hard-coded instructional content: every claim
 * still comes from the live page and clears the ordinary quote/admission gates.
 */
export function isWaiSourceFamilyAligned(topic = '', title = '') {
  const lesson = String(topic || '').toLowerCase();
  const sourceTitle = String(title || '').trim();
  if (!sourceTitle) return false;

  const evaluationLesson =
    /\b(?:audit(?:ing|s)?|evaluat(?:e|es|ed|ing|ion)|test(?:s|ed|ing)?|assessment|remediat(?:e|es|ed|ing|ion)|wcag-em)\b/.test(
      lesson,
    );
  const formsLesson = /\bforms?\b|\bform controls?\b|\binput validation\b/.test(lesson);
  const structureLesson =
    /\bsemantic html\b|\bkeyboard accessibility\b|\bpage structure\b|\bheadings?\b|\blandmarks?\b|\bpage regions?\b/.test(
      lesson,
    );
  const wcagLesson =
    /\bwcag\b|\bweb content accessibility guidelines?\b|\bperceivable\b|\boperable\b|\bunderstandable\b|\brobust\b|\bconformance\b/.test(
      lesson,
    );

  // Evaluate the most specific lesson families first. A remediation lesson
  // can mention forms, keyboard, and WCAG as things to inspect, but its
  // authoritative method still comes from the evaluation family.
  if (evaluationLesson) return WAI_SOURCE_FAMILIES.evaluation.has(sourceTitle);
  if (formsLesson) return WAI_SOURCE_FAMILIES.forms.has(sourceTitle);
  if (structureLesson) return WAI_SOURCE_FAMILIES.structure.has(sourceTitle);
  if (wcagLesson) return WAI_SOURCE_FAMILIES.wcag.has(sourceTitle);
  return true;
}

/**
 * Official W3C/WAI research vertical.
 *
 * This is a bounded source catalog, not hard-coded course content. The live
 * pages remain the source of every admitted sentence, and the ordinary
 * relevance, entailment, and frozen-ledger gates still decide what survives.
 */
export function buildWaiProvider(httpText) {
  const load = async (entry) => {
    const html = await httpText(entry.url);
    const extract = extractWaiResearchText(html);
    if (!extract) return null;
    return {
      title: entry.title,
      extract,
      sourceUrl: entry.url,
      sourceId: `w3c-wai:${entry.url}`,
      providerId: 'w3c-wai',
      sourceKind: 'official accessibility standard and tutorial',
      license: 'W3C permissive license',
      attribution: `W3C Web Accessibility Initiative, “${entry.title}”`,
      suggestedTerm: entry.suggestedTerm,
      definitionWindow: entry.definitionWindow || 24,
      ...(entry.definitionMode ? { definitionMode: entry.definitionMode } : {}),
      topicHints: entry.keywords,
    };
  };
  const byTitle = new Map(WAI_SOURCE_CATALOG.map((entry) => [entry.title, entry]));
  const loadEntries = async (entries) => {
    const records = {};
    // Official WAI pages do not all expose identical cross-origin behavior.
    // One page that declines a browser fetch must not erase the other
    // independently verified pages in the same bounded catalog batch.
    const settled = await Promise.allSettled(entries.map(load));
    for (const result of settled) {
      if (result.status === 'fulfilled' && result.value) records[result.value.title] = result.value;
    }
    return records;
  };
  return {
    id: 'w3c-wai',
    sourceKind: 'official accessibility standard and tutorial',
    supportsDirectTitles: false,
    async search(query, limit = 12) {
      return waiCatalogEntriesForQuery(query, limit).map((entry) => entry.title);
    },
    async searchArticles(query, limit = 12) {
      return loadEntries(waiCatalogEntriesForQuery(query, limit));
    },
    async articles(titles = []) {
      return loadEntries([...new Set(titles)].map((title) => byTitle.get(title)).filter(Boolean));
    },
    async article(title) {
      const entry = byTitle.get(String(title || ''));
      return entry ? load(entry) : null;
    },
    license: 'W3C permissive license',
    attributionFor: (title) => `W3C Web Accessibility Initiative, “${title}”`,
    sourceIdFor: (title, sourceMeta = {}) => sourceMeta.sourceId || `w3c-wai:${title}`,
  };
}

function cleanDoajText(value = '') {
  return String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, ' ')
    .replace(/^abstract\s+/i, '')
    .trim();
}

function doajSuggestedTerm(bibjson = {}, query = '') {
  const queryTokens = new Set(contentTokens(query));
  const candidates = [
    ...(Array.isArray(bibjson.keywords) ? bibjson.keywords : []),
    ...String(bibjson.title || '')
      .split(/[:;—–-]|\b(?:and|with|using|through|for|in)\b/i)
      .map((entry) => entry.trim()),
  ]
    .map(cleanDoajText)
    .filter((entry) => {
      const words = entry.split(/\s+/).filter(Boolean);
      return words.length >= 1 && words.length <= 4;
    });
  const scored = candidates
    .map((entry, index) => {
      const tokens = contentTokens(entry);
      return {
        entry,
        index,
        overlap: tokens.filter((token) => queryTokens.has(token)).length,
        tokenCount: tokens.length,
      };
    })
    .filter((entry) => entry.overlap > 0)
    .sort(
      (left, right) => right.overlap - left.overlap || left.tokenCount - right.tokenCount || left.index - right.index,
    );
  return scored[0]?.entry || '';
}

function doajRecord(result, query = '') {
  const bibjson = result?.bibjson || {};
  const title = cleanDoajText(bibjson.title);
  const extract = cleanDoajText(bibjson.abstract);
  if (!title || !extract) return null;
  const doi = (bibjson.identifier || []).find((identifier) => String(identifier?.type).toLowerCase() === 'doi')?.id;
  const sourceUrl =
    (bibjson.link || []).find((link) => String(link?.type).toLowerCase() === 'fulltext')?.url ||
    (doi ? `https://doi.org/${doi}` : `https://doaj.org/article/${result.id}`);
  const authors = (bibjson.author || [])
    .map((author) => cleanDoajText(author?.name))
    .filter(Boolean)
    .slice(0, 3);
  const authorLabel =
    authors.length === 0
      ? 'Open-access article authors'
      : `${authors.join(', ')}${(bibjson.author || []).length > authors.length ? ', et al.' : ''}`;
  return {
    title,
    extract,
    sourceUrl,
    sourceId: `doaj:${result.id || doi || title}`,
    providerId: 'doaj',
    sourceKind: 'open scholarly article',
    // DOAJ's terms waive rights in article-level metadata under CC0. The
    // abstract is used as captured metadata; the linked paper keeps its own
    // article license and is never copied wholesale.
    license: 'CC0 1.0 (DOAJ article metadata)',
    attribution: `${authorLabel}${bibjson.year ? ` (${bibjson.year})` : ''}. ${title}. DOAJ metadata.`,
    revisionTimestamp: String(result?.last_updated || result?.created_date || ''),
    suggestedTerm: doajSuggestedTerm(bibjson, query),
    definitionMode: 'scholarly-abstract',
  };
}

/**
 * Browser-safe primary-research lane.
 *
 * DOAJ exposes broad article-level metadata under a CC0 waiver and responds
 * with CORS headers. It is queried before Wikipedia, but its abstracts still
 * cross the same relevance, source-anchor, and entailment gates. A paper that
 * merely shares vocabulary is rejected rather than treated as a definition.
 */
export function buildDoajProvider(httpJson) {
  const cache = new Map();
  const load = async (query, limit = 24) => {
    const normalizedQuery = String(query || '')
      .replace(/"/g, '')
      .trim();
    if (!normalizedQuery) return {};
    const url = `${DOAJ_API}/${encodeURIComponent(normalizedQuery)}?pageSize=${Math.min(
      50,
      Math.max(1, Number(limit) || 24),
    )}`;
    const data = await httpJson(url);
    const records = {};
    for (const result of data?.results || []) {
      const record = doajRecord(result, normalizedQuery);
      if (!record) continue;
      records[record.title] = record;
      cache.set(record.title, record);
    }
    return records;
  };
  return {
    id: 'doaj',
    sourceKind: 'open scholarly article',
    supportsDirectTitles: false,
    async search(query, limit = 12) {
      return Object.keys(await load(query, limit));
    },
    searchArticles: load,
    async articles(titles) {
      return Object.fromEntries(
        (titles || []).map((title) => [title, cache.get(title)]).filter(([, record]) => Boolean(record)),
      );
    },
    async article(title) {
      return cache.get(title) || null;
    },
    license: 'CC0 1.0 (DOAJ article metadata)',
    attributionFor: (title) => `DOAJ article metadata, “${title}”`,
    sourceIdFor: (title, sourceMeta = {}) => sourceMeta.sourceId || `doaj:${title}`,
  };
}

function europePmcLicense(value = '') {
  const normalized = cleanDoajText(value)
    .toLowerCase()
    .replace(/[_\s]+/g, ' ')
    .trim();
  if (!normalized) return '';
  if (/^cc by(?:-| )nc(?:-| )nd$/.test(normalized)) return 'CC BY-NC-ND';
  if (/^cc by(?:-| )nc(?:-| )sa$/.test(normalized)) return 'CC BY-NC-SA';
  if (/^cc by(?:-| )nd$/.test(normalized)) return 'CC BY-ND';
  if (/^cc by(?:-| )sa$/.test(normalized)) return 'CC BY-SA';
  if (/^cc by(?:-| )nc$/.test(normalized)) return 'CC BY-NC';
  if (/^cc by$/.test(normalized)) return 'CC BY';
  if (/^cc0$/.test(normalized)) return 'CC0';
  return cleanDoajText(value);
}

function europePmcRecord(result, query = '') {
  const title = cleanDoajText(result?.title);
  const extract = cleanDoajText(result?.abstractText);
  const license = europePmcLicense(result?.license);
  if (!title || !extract || String(result?.isOpenAccess || '').toUpperCase() !== 'Y' || !license) return null;
  const recordId = String(result?.pmcid || result?.id || result?.doi || title);
  const sourceUrl = result?.pmcid
    ? `https://europepmc.org/article/PMC/${encodeURIComponent(String(result.pmcid).replace(/^PMC/i, ''))}`
    : result?.id
      ? `https://europepmc.org/article/MED/${encodeURIComponent(result.id)}`
      : `https://doi.org/${result.doi}`;
  const suggestedTerm = doajSuggestedTerm(
    {
      title,
      keywords: result?.keywordList?.keyword || [],
    },
    query,
  );
  return {
    title,
    extract,
    sourceUrl,
    sourceId: `europe-pmc:${recordId}`,
    providerId: 'europe-pmc',
    sourceKind: 'open biomedical article',
    license,
    attribution: `${cleanDoajText(result?.authorString) || 'Article authors'}${
      result?.pubYear ? ` (${result.pubYear})` : ''
    }. ${title}. ${cleanDoajText(result?.journalTitle) || 'Europe PMC'}.`,
    revisionTimestamp: String(result?.firstIndexDate || result?.dateOfCreation || ''),
    suggestedTerm,
    definitionMode: 'scholarly-abstract',
  };
}

/**
 * Open biomedical literature lane.
 *
 * Europe PMC exposes a CORS-readable search API and reports article-level
 * open-access and license metadata. Only records that explicitly say both are
 * present enter the candidate pool; the normal domain, admission, and
 * entailment gates still decide whether any abstract claim may be compiled.
 */
export function buildEuropePmcProvider(httpJson) {
  const cache = new Map();
  const load = async (query, limit = 24) => {
    const normalizedQuery = String(query || '').trim();
    if (!normalizedQuery) return {};
    const bounded = Math.min(50, Math.max(1, Number(limit) || 24));
    const providerQuery = `(${normalizedQuery}) AND OPEN_ACCESS:Y AND HAS_ABSTRACT:Y`;
    const url = `${EUROPE_PMC_API}?query=${encodeURIComponent(
      providerQuery,
    )}&format=json&pageSize=${bounded}&resultType=core`;
    const data = await httpJson(url);
    const records = {};
    for (const result of data?.resultList?.result || []) {
      const record = europePmcRecord(result, normalizedQuery);
      if (!record) continue;
      records[record.title] = record;
      cache.set(record.title, record);
    }
    return records;
  };
  return {
    id: 'europe-pmc',
    sourceKind: 'open biomedical article',
    supportsDirectTitles: false,
    async search(query, limit = 12) {
      return Object.keys(await load(query, limit));
    },
    searchArticles: load,
    async articles(titles) {
      return Object.fromEntries(
        (titles || []).map((title) => [title, cache.get(title)]).filter(([, record]) => Boolean(record)),
      );
    },
    async article(title) {
      return cache.get(title) || null;
    },
    license: 'article-reported Creative Commons license',
    attributionFor: (title) => `Europe PMC, “${title}”`,
    sourceIdFor: (title, sourceMeta = {}) => sourceMeta.sourceId || `europe-pmc:${title}`,
  };
}

async function articleRecords(provider, titles, signal) {
  if (signal?.aborted) throw signal.reason || Object.assign(new Error('Algi research stopped'), { name: 'AbortError' });
  if (!Array.isArray(titles) || titles.length === 0) return new Map();
  if (typeof provider?.articles === 'function') {
    const records = await provider.articles(titles);
    return new Map(
      titles.map((title) => [
        title,
        normalizeArticleResult(
          records?.[title] || Object.values(records || {}).find((entry) => entry?.title === title),
        ),
      ]),
    );
  }
  const records = new Map();
  for (const title of titles) {
    if (signal?.aborted)
      throw signal.reason || Object.assign(new Error('Algi research stopped'), { name: 'AbortError' });
    records.set(title, normalizeArticleResult(await provider.article(title)));
  }
  return records;
}

/* ------------------------------------------------------------------ *
 * Extraction + admission
 * ------------------------------------------------------------------ */

function normalizeArticleResult(article) {
  if (typeof article === 'string') return { extract: article };
  if (!article || typeof article !== 'object') return { extract: '' };
  return {
    title: String(article.title || ''),
    extract: String(article.extract || ''),
    sourceUrl: String(article.sourceUrl || ''),
    revisionId: article.revisionId || null,
    revisionTimestamp: String(article.revisionTimestamp || ''),
    sourceId: String(article.sourceId || ''),
    providerId: String(article.providerId || ''),
    sourceKind: String(article.sourceKind || ''),
    license: String(article.license || ''),
    attribution: String(article.attribution || ''),
    suggestedTerm: String(article.suggestedTerm || ''),
    definitionMode: String(article.definitionMode || ''),
    definitionWindow: Number(article.definitionWindow) || 0,
    topicHints: String(article.topicHints || ''),
  };
}

function sourceAnchoredTopicTerm(topic = '', title = '') {
  const topicWords = String(topic || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (topicWords.length < 1 || topicWords.length > 4) return '';
  const pattern = topicWords.map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[^\\p{L}\\p{N}]+');
  const match = String(title || '').match(new RegExp(`(?:^|[^\\p{L}\\p{N}])(${pattern})(?=$|[^\\p{L}\\p{N}])`, 'iu'));
  return String(match?.[1] || '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export function buildKernelFromArticle({ topic, title, extract, provider, factCount = 4, sourceMeta = {} }) {
  const sentences = sentencesFrom(extract);
  if (sentences.length === 0) return null;
  const articleTitle = headOf(title);
  const suggestedTerm = headOf(sourceMeta.suggestedTerm || '');
  const compactRelevantSuggestedTerm =
    suggestedTerm &&
    suggestedTerm.split(/\s+/).filter(Boolean).length <= 6 &&
    lexicalRelevance(topic, suggestedTerm) >= LEXICAL_FLOOR
      ? suggestedTerm
      : '';
  // Grouped scholarly searches bind one network query to several lessons, so
  // the provider-level suggested term can reflect a neighbouring topic. When
  // the provider already supplied a compact, topic-relevant concept (for
  // example "Phytoremediation"), preserve that useful distinction. Otherwise,
  // prefer the lesson's exact compact phrase when it is visibly present in the
  // article title. Neither route invents a concept: both preserve source text.
  const head = headOf(
    compactRelevantSuggestedTerm || sourceAnchoredTopicTerm(topic, title) || sourceMeta.suggestedTerm || articleTitle,
  );
  const scholarlyAbstract = sourceMeta.definitionMode === 'scholarly-abstract';
  const explanatoryPage = sourceMeta.definitionMode === 'explanatory-page';
  const sentenceRelevance = (sentence) => Math.max(lexicalRelevance(head, sentence), lexicalRelevance(topic, sentence));
  const isSourcePageNoise = (sentence) => {
    const lesson = String(topic || '').toLowerCase();
    const accessibilityLesson =
      /\b(?:accessib(?:le|ility)|wcag|web content accessibility guidelines?|semantic html|keyboard)\b/.test(lesson);
    if (!accessibilityLesson) return false;
    const wcagPrinciplesLesson = /\bwcag\b|\bweb content accessibility guidelines?\b/.test(lesson);
    const historicalWcagLesson = /\b(?:history|historical|evolution|version comparison|migration)\b/.test(lesson);
    const robustContentKernel = /\brobust content\b/i.test(head);
    return (
      // Broken list extraction can emit a sentence fragment beginning with a
      // lowercase continuation ("satisfies all..."). It is not publishable
      // classroom prose even when the underlying standard is authoritative.
      /^[a-z]/.test(sentence) ||
      // Documentation notes attached to code samples describe the sample UI,
      // not a transferable course claim.
      /^note that\b/i.test(sentence) ||
      /^this video is (?:also )?available\b/i.test(sentence) ||
      /^alternatives for video\b/i.test(sentence) ||
      /\binteractive elements? (?:is|are) still active\b/i.test(sentence) ||
      // Road-map and publication-status prose ages quickly and does not teach
      // the current standard.
      /\b(?:will|would) provide\b.*\bquick reference\b/i.test(sentence) ||
      /\bquick reference\b.*\b(?:will|would) provide\b/i.test(sentence) ||
      // Do not mix historical WCAG 2.0/2.1 implementation or count language
      // into a lesson that explicitly retrieved the current WCAG 2.2 standard.
      (accessibilityLesson && !historicalWcagLesson && /\bwcag\s+2\.(?:0|1)\b/i.test(sentence)) ||
      (accessibilityLesson && /\bwcag\s+2\b(?!\.\d)/i.test(sentence)) ||
      /\b12 guidelines\b.*\b65 (?:testable )?success criteria\b/i.test(sentence) ||
      /\bonly the initial positions of user-movable content\b/i.test(sentence) ||
      /\b(?:a )?level\s+(?:a|aa|aaa)\s+conforming alternate version is provided\b/i.test(sentence) ||
      /\baccessibility policies are listed in wai resources\b/i.test(sentence) ||
      // A principles lesson needs the standard's broad structure, not one
      // decontextualized condition from a deeply nested success criterion or
      // a glossary definition selected only because it shares topic tokens.
      (wcagPrinciplesLesson &&
        /\bsuccess criterion\b/i.test(sentence) &&
        !/\b(?:wcag|guideline|conformance|perceivable|operable|understandable|robust|level\s+(?:a|aa|aaa))\b/i.test(
          sentence,
        )) ||
      /^(?:user agents?|authoring tools?|web content)\s*[-–—]/i.test(sentence) ||
      (robustContentKernel &&
        /\b(?:flashing content|prominent audio or visual content in the background)\b/i.test(sentence)) ||
      (/\bsemantic html\b/.test(lesson) &&
        /\b(?:xpointer|arbitrary section of html|mechanism independent of the markup structure)\b/i.test(sentence)) ||
      // Sweeping compliance predictions are jurisdiction-dependent and do not
      // belong in a source-grounded standards lesson.
      /\ball websites? will need to (?:adhere|comply)\b/i.test(sentence)
    );
  };
  // Noise filtering must happen before definition selection as well as fact
  // ranking. Otherwise a deeply nested success-criterion sentence can become
  // the kernel's definition and bypass the later fact-only filter.
  const teachableSentences = sentences.filter((sentence) => !isSourcePageNoise(sentence));
  const definition =
    definitionSentence(teachableSentences, head, sourceMeta.definitionWindow) ||
    (scholarlyAbstract || explanatoryPage
      ? teachableSentences
          .map((sentence, index) => ({
            sentence,
            index,
            relevance: Math.max(lexicalRelevance(head, sentence), lexicalRelevance(topic, sentence)),
            explanatory: explanatoryScore(sentence, head),
          }))
          .filter((entry) => entry.relevance >= LEXICAL_FLOOR && entry.explanatory > 0)
          .sort(
            (left, right) =>
              right.relevance - left.relevance || right.explanatory - left.explanatory || left.index - right.index,
          )[0]?.sentence
      : null);
  if (!definition) return null;

  const sourceSpecificTopicScore = (sentence) => {
    const lesson = String(topic || '').toLowerCase();
    if (/\bwcag\b|\bweb content accessibility guidelines?\b/.test(lesson)) {
      let score = 0;
      if (/\bperceivable\b.*\boperable\b.*\bunderstandable\b.*\brobust\b/i.test(sentence)) score += 5;
      if (/\bsuccess criteri\w*\b/i.test(sentence)) score += 4;
      if (/\b(?:conformance|level\s+(?:a|aa|aaa))\b/i.test(sentence)) score += 3;
      if (/\baccessibility guidelines?\b/i.test(sentence)) score += 1;
      // A standards lesson should teach the standard before cataloguing which
      // jurisdiction adopted it. These sentences remain eligible evidence,
      // but they rank behind POUR, success criteria, and conformance itself.
      if (
        /\b(?:accessibility act|directive|jurisdiction|legislation|ministry|regulation|rule|act,\s*\d{4}|government bod\w*)\b/i.test(
          sentence,
        )
      ) {
        score -= 3;
      }
      return score;
    }
    if (/\bsemantic html\b|\bkeyboard accessibility\b/.test(lesson)) {
      return /\b(?:html|semantic|keyboard|focus|landmark|heading|assistive technolog\w*|screen reader\w*)\b/i.test(
        sentence,
      )
        ? 1
        : 0;
    }
    if (/\baccessible forms?\b|\bforms?.*(?:testing|remediation)\b/.test(lesson)) {
      const formMechanism =
        /\b(?:labels?|inputs?|controls?|fields?|fieldset|legend|instructions?|validat\w*|error messages?|required attribute|feedback|assistive technolog\w*|screen reader\w*)\b/i.test(
          sentence,
        );
      // "Other forms of perception" is about the ordinary noun, not an HTML
      // form. Likewise a generic WCAG revision note does not become form
      // evidence merely because it shares the same source bundle.
      if (
        /\bforms? of (?:perception|presentation|communication|evidence)\b/i.test(sentence) ||
        (/\b(?:wcag|guidelines?|success criteria)\b/i.test(sentence) && !formMechanism)
      ) {
        return -8;
      }
      if (formMechanism) return 3;
      return /\bforms?\b/i.test(sentence) ? 1 : 0;
    }
    return 0;
  };
  // A related subsection can contain a perfectly valid contrast that is not
  // about this kernel's head concept. The WAI article, for example, explains
  // that ARIA treats pages as applications rather than static documents; using
  // that sentence as WAI's misconception taught the wrong relationship. A
  // contrast may author a term's misconception only when it names that exact
  // term in the same anchored sentence.
  const contrasts = contrastSentences(teachableSentences).filter(
    (sentence) => sentenceRelevance(sentence) > 0 && sentenceNamesConcept(sentence, head),
  );
  const examples = exampleSentences(teachableSentences, head).filter((sentence) => sentenceRelevance(sentence) > 0);
  const facts = teachableSentences
    .filter((sentence) => sentence !== definition && !contrasts.includes(sentence))
    .map((sentence, index) => ({
      sentence,
      index,
      relevance: sentenceRelevance(sentence),
      explanatory: explanatoryScore(sentence, head),
      instructional: sourceSpecificTopicScore(sentence),
    }))
    // A full encyclopedia page contains many true but off-topic sentences.
    // Source admission proves a quote exists; it does not prove that the quote
    // belongs in this lesson. Require each retained fact to name the source
    // concept or the lesson topic before ranking it.
    .filter(
      (entry) => entry.explanatory > 0 && entry.instructional > -5 && (entry.relevance > 0 || entry.instructional > 0),
    )
    .sort(
      (left, right) =>
        right.instructional - left.instructional ||
        right.relevance - left.relevance ||
        right.explanatory - left.explanatory ||
        left.index - right.index,
    )
    .map((entry) => entry.sentence)
    .slice(0, factCount);
  // One strong explanatory fact plus the anchored definition is enough for a
  // candidate. Course-level composition combines three concepts and still
  // requires a five-fact ledger; rejecting a short but authoritative lead
  // here made Waterborne disease disappear before that stronger aggregate gate
  // could judge it.
  if (facts.length < 1) return null;

  const src = sourceMeta.sourceId || provider.sourceIdFor(title, sourceMeta);
  const anchor = (quote) => ({ src, loc: title, quote });
  const distractors = distractorsFromContrast(contrasts, head);

  const mcBank =
    distractors.length >= 2
      ? [
          {
            stem: itemStem(head),
            options: [definition, ...distractors.slice(0, 3).map((d) => `It is fundamentally the same as ${d}.`)],
            answerIndex: 0,
            explanationFactRef: 0,
            rationaleRefs: [0],
          },
        ]
      : [];

  return {
    snapshot: { [src]: String(extract).replace(/\s+/g, ' ') },
    kernel: {
      id: `researched/${String(sourceMeta.providerId || provider.id || 'source')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')}-${String(src || head)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(-80)}`,
      rev: 1,
      term: head,
      aliases: [topic].filter((alias) => alias && alias.toLowerCase() !== head.toLowerCase()),
      tags: ['researched'],
      level: 'intro',
      difficulty: 2,
      bloomCeiling: 'Analyze',
      definition: { text: definition, anchor: anchor(definition), tier: 2 },
      facts: facts.map((text) => ({ text, anchor: anchor(text), tier: 2 })),
      // The composer needs a key term per concept, and a key term needs both a
      // misconception and an example. Sources supply them about 9 times in 10;
      // the fallbacks keep the tenth usable WITHOUT inventing subject content —
      // the corrective and the example stay verbatim source text, and only the
      // framing sentence (which makes no claim about the world) is ours.
      misconceptions:
        contrasts.length > 0
          ? contrasts.slice(0, 2).map((sentence) => misconceptionFromContrast(sentence, head))
          : [
              {
                text: `Naming ${head} without identifying a supporting source detail is sufficient evidence.`,
                corrective: `Cite the specific definition or fact that supports the ${head} claim, then state what that evidence does not establish.`,
              },
            ],
      examples:
        examples.length > 0
          ? examples.slice(0, 2).map((text) => ({ text, domain: 'source' }))
          : facts.slice(0, 1).map((text) => ({ text, domain: 'source' })),
      workedExamples: [],
      mcBank,
      edges: {},
      variants: [],
      freshness: { checked: new Date().toISOString().slice(0, 10) },
      license: sourceMeta.license || provider.license,
      attribution: sourceMeta.attribution || provider.attributionFor(title),
      provenance: {
        origin: RESEARCH_ORIGIN,
        providerId: sourceMeta.providerId || provider.id || 'wikipedia',
        sourceKind: sourceMeta.sourceKind || provider.sourceKind || 'open source',
        topic,
        title,
        sourceUrl:
          sourceMeta.sourceUrl ||
          (provider.id === 'wikipedia'
            ? `https://en.wikipedia.org/wiki/${encodeURIComponent(String(title || '').replace(/\s+/g, '_'))}`
            : ''),
        ...(sourceMeta.revisionId ? { revisionId: sourceMeta.revisionId } : {}),
        ...(sourceMeta.revisionTimestamp ? { revisionTimestamp: sourceMeta.revisionTimestamp } : {}),
        ...(sourceMeta.topicHints ? { topicHints: sourceMeta.topicHints } : {}),
      },
    },
  };
}

/**
 * Reject a source whose words match the lesson but whose disciplinary meaning
 * does not match the course. This reuses the same course-aware gate that
 * protects the exported source ledger, so retrieval and provenance cannot
 * disagree about whether a source is valid evidence.
 */
export function isResearchCandidateDomainAligned({
  topic = '',
  courseContext = '',
  title = '',
  extract = '',
  definition = '',
  provider = '',
} = {}) {
  if (!String(courseContext || '').trim()) return true;
  const courseAndTopic = `${courseContext} ${topic}`.toLowerCase();
  // A compact definition may omit the domain word that the same official page
  // states in its surrounding passage ("Labels" → assistive technology,
  // "Headings" → page navigation). Use both for the coarse domain boundary;
  // claim admission still validates only the exact selected sentences.
  const candidate = `${title} ${definition} ${String(extract).slice(0, 2400)}`.toLowerCase();
  const digitalAccessibilityCourse =
    /\b(?:accessib(?:le|ility)|inclusive design|web standards?|wcag|semantic html)\b/.test(courseAndTopic);
  if (
    digitalAccessibilityCourse &&
    !/\b(?:accessib(?:le|ility)|aria|assistive|html|inclusive design|interface|semantic|user|wai|wcag|web)\b/.test(
      candidate,
    )
  ) {
    // Ambiguous words such as "forms" and "principles" otherwise admit
    // medically or biologically unrelated sources. The guard is a retrieval
    // boundary, not authored course knowledge: a candidate must visibly live
    // in the same digital-accessibility domain before its claims are judged.
    return false;
  }
  // The W3C/WAI vertical is a bounded catalog of official accessibility
  // standards and tutorials. Once its page visibly clears the digital-domain
  // guard above, bind it to the exact lesson family before bypassing the
  // generic open-web weak-source heuristic. This prevents an evaluation page
  // from drifting into a semantic-HTML lesson (or vice versa) merely because
  // both pages repeat broad accessibility vocabulary.
  if (digitalAccessibilityCourse && provider === 'w3c-wai') {
    return isWaiSourceFamilyAligned(topic, title);
  }
  const technologyPolicyCourse =
    /\b(?:technology|digital|internet|platform|algorithmic|artificial intelligence|ai)\b/.test(courseAndTopic) &&
    /\b(?:policy|governance|regulation|accountability|audit|oversight)\b/.test(courseAndTopic);
  const unrelatedAppliedDomain =
    /\b(?:pollutants?|pollution|environmental protection|wastewater|clinical|patients?|disease|medical|health risks?)\b/.test(
      candidate,
    ) && !/\b(?:environment|health|medical|clinical)\b/.test(courseAndTopic);
  const exactTopic = candidate.includes(String(topic || '').toLowerCase());
  if (technologyPolicyCourse && unrelatedAppliedDomain && !exactTopic) return false;
  return !isCourseAwareWeakSource(
    {
      title,
      evidence: extract || definition,
      provider,
      conceptLinks: [{ label: topic }],
    },
    { course: { name: courseContext } },
  );
}

/**
 * Research one lesson topic into an admitted kernel.
 *
 * Candidates are ranked by relevance BEFORE admission, so a verifiable article
 * about the wrong subject loses to a relevant one and, if nothing clears the
 * floor, nothing is returned at all. Returning nothing is the correct outcome:
 * a confidently taught wrong article is worse than an honest miss, which is the
 * silent-failure pattern the output audit already caught once.
 */
export async function researchConcept(
  topic,
  { provider, embed = null, candidates = 3, floor = null, courseContext = '', signal } = {},
) {
  if (!topic || !provider) return { ok: false, reason: 'no-topic-or-provider' };

  // Search the specific lesson phrase first. The course subject is a fallback
  // disambiguator for pedagogical titles such as "the firm and its publics"
  // that are not encyclopedia entities. Leading with the whole course title
  // buried exact compound concepts: "Qubits and quantum states" returned only
  // broad quantum-computing pages instead of Qubit.
  if (signal?.aborted) throw signal.reason || Object.assign(new Error('Algi research stopped'), { name: 'AbortError' });
  let titles = [...new Set(await provider.search(researchQueryForTopic(topic, courseContext), candidates))];
  if (titles.length === 0 && courseContext) {
    titles = [...new Set(await provider.search(`${courseContext} ${topic}`, candidates))];
  }
  if (titles.length === 0) return { ok: false, reason: 'no-search-results', topic };

  const scored = [];
  const rejectedEntities = [];
  const records = await articleRecords(provider, titles, signal);
  for (const title of titles) {
    const article = records.get(title) || { extract: '' };
    const extract = article.extract;
    if (!extract) continue;
    const canonicalTitle = article.title || title;
    const built = buildKernelFromArticle({ topic, title: canonicalTitle, extract, provider, sourceMeta: article });
    if (!built) continue;
    if (looksLikeEntity(canonicalTitle, built.kernel.definition.text)) {
      rejectedEntities.push(canonicalTitle);
      continue;
    }
    if (
      !isResearchCandidateDomainAligned({
        topic,
        courseContext,
        title: canonicalTitle,
        extract,
        definition: built.kernel.definition.text,
        provider: built.kernel.provenance?.providerId,
      })
    ) {
      continue;
    }
    scored.push({ title: canonicalTitle, extract, built });
  }
  if (scored.length === 0) {
    return {
      ok: false,
      reason: rejectedEntities.length > 0 ? 'only-entity-pages' : 'no-extractable-article',
      topic,
      entities: rejectedEntities,
    };
  }

  // TWO signals, and the weaker one governs. Scoring only the definition let
  // "truth-telling in the marketplace" retrieve the article "Lie" at 0.47: the
  // definition of lying really is about truth-telling, so the definition signal
  // alone cannot see that the ARTICLE is about the wrong subject. Taking the
  // minimum means a candidate has to be right on both counts to survive.
  let ranked;
  if (typeof embed === 'function') {
    const vectors = await embed([
      topic,
      ...scored.map((entry) => entry.title),
      ...scored.map((entry) => entry.built.kernel.definition.text),
    ]);
    const query = vectors[0];
    ranked = scored
      .map((entry, index) => {
        const titleScore = cosine(query, vectors[1 + index]);
        const defScore = cosine(query, vectors[1 + scored.length + index]);
        return {
          ...entry,
          titleScore,
          defScore,
          relevance: Math.min(titleScore, defScore),
          mode: 'semantic',
        };
      })
      .sort((left, right) => right.relevance - left.relevance);
  } else {
    ranked = scored
      .map((entry) => {
        const titleScore = lexicalRelevance(topic, entry.title);
        const defScore = lexicalRelevance(topic, entry.built.kernel.definition.text);
        return { ...entry, titleScore, defScore, relevance: Math.min(titleScore, defScore), mode: 'lexical' };
      })
      .sort((left, right) => right.relevance - left.relevance);
  }

  const best = ranked[0];
  const effectiveFloor = floor ?? (best.mode === 'semantic' ? RELEVANCE_FLOOR : LEXICAL_FLOOR);
  if (best.relevance < effectiveFloor) {
    return {
      ok: false,
      reason: 'below-relevance-floor',
      topic,
      title: best.title,
      relevance: Number(best.relevance.toFixed(3)),
      floor: effectiveFloor,
    };
  }

  const admission = admitKernel(best.built.kernel, { sources: best.built.snapshot });
  if (!admission.admitted) {
    return { ok: false, reason: 'not-admitted', topic, title: best.title, rejections: admission.rejections };
  }
  const entailed = attachKernelEntailmentReceipt(admission.kernel, best.built.snapshot);
  if (!entailed.admitted) {
    return {
      ok: false,
      reason: 'claim-not-entailed',
      topic,
      title: best.title,
      entailment: entailed.entailment,
    };
  }
  return {
    ok: true,
    topic,
    title: best.title,
    relevance: Number(best.relevance.toFixed(3)),
    titleScore: Number(best.titleScore.toFixed(3)),
    defScore: Number(best.defScore.toFixed(3)),
    mode: best.mode,
    tier: admission.tier,
    kernel: entailed.kernel,
    snapshot: best.built.snapshot,
  };
}

/**
 * Item stems carry their own context on purpose. The compact kernel contract
 * requires a 20-45 word stem and returns nothing for a shorter one, so a bare
 * "Which statement defines X?" silently produced zero usable items — the whole
 * reason researched lessons were "admitted but uncomposable".
 */
export function itemStem(term) {
  return `A student is matching each concept in this lesson to the description its source actually gives, rather than to a neighbouring idea that sounds similar. Which statement describes ${term} as the source defines it?`;
}

/**
 * A 4–10 word option must not be a raw ten-word slice of a definition. Extract
 * the predicate up to a real clause boundary so the quiz shows "A basic unit
 * of quantum information", not "a qubit … is."
 */
export function conciseDefinitionOption(kernel = {}) {
  const term = String(kernel.term || '').trim();
  const definition = String(kernel.definition?.text || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!term || !definition) return '';
  const foundAt = definition.toLowerCase().indexOf(term.toLowerCase());
  const subjectTail = definition.slice(foundAt >= 0 ? foundAt + term.length : 0);
  const copula = subjectTail.match(/\b(?:is|are|refers to|means|denotes|describes|comprises)\b/i);
  if (!copula) return '';
  const predicate = subjectTail
    .slice(copula.index + copula[0].length)
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .trim();
  const boundedPredicate = predicate.split(
    /[,;:]|\b(?:that|which|who|whose|where|when|because|although|whereas)\b/i,
  )[0];
  const optionSource = boundedPredicate.split(/\s+/).filter(Boolean).length >= 4 ? boundedPredicate : predicate;
  let words = optionSource.split(' ').filter(Boolean).slice(0, 10);
  while (words.length > 0 && /^(?:a|an|and|as|at|by|for|from|in|of|on|or|the|to|with)$/i.test(words.at(-1))) {
    words.pop();
  }
  if (words.length < 4) words = [...words, 'in', 'the', 'cited', 'source'].slice(0, 10);
  if (words.length < 4 || words.length > 10) return '';
  const option = words.join(' ').replace(/[.!?]+$/, '');
  return `${option.charAt(0).toUpperCase()}${option.slice(1)}.`;
}

/** Give a kernel set cross-concept items, using siblings' definitions as distractors. */
export function backfillMultipleChoice(kernels = []) {
  if (kernels.length < 3) return kernels;
  kernels.forEach((kernel) => {
    const siblings = kernels.filter((other) => other !== kernel);
    const own = conciseDefinitionOption(kernel);
    const picked = siblings.slice(0, 3).map(conciseDefinitionOption);
    while (picked.length < 3) picked.push('A claim absent from the cited lesson sources.');
    if (!own || picked.some((option) => !option) || new Set([own, ...picked]).size !== 4) return;
    kernel.mcBank = [
      {
        stem: itemStem(kernel.term),
        options: [own, ...picked],
        answerIndex: 0,
        explanationFactRef: 0,
        rationaleRefs: [0],
      },
    ];
  });
  return kernels;
}

/**
 * Research the concept SET for one lesson.
 *
 * Enrichment arrives one lesson per call, so cross-lesson strategies are not
 * available: a lesson researched alone got a single kernel, and a lesson needs
 * three key terms, so every admitted concept was "admitted but uncomposable".
 * The candidates are already fetched to rank them, though — keeping the top few
 * instead of discarding all but one costs no extra request and gives the lesson
 * the several related concepts it actually draws on.
 */
export async function researchLessonKernels(
  topic,
  {
    provider,
    embed = null,
    want = 4,
    candidates = 12,
    floor = null,
    courseContext = '',
    plannedQuery = '',
    signal,
  } = {},
) {
  if (!topic || !provider) return [];
  if (signal?.aborted) throw signal.reason || Object.assign(new Error('Algi research stopped'), { name: 'AbortError' });
  const primaryQuery = String(plannedQuery || researchQueryForTopic(topic, courseContext)).trim();
  let titles = [...new Set(await provider.search(primaryQuery, candidates))];
  if (titles.length === 0 && courseContext) {
    titles = [...new Set(await provider.search(`${courseContext} ${topic}`, candidates))];
  }

  const built = [];
  const directTitleKeys = new Set(
    directResearchTitles(topic, courseContext).map((title) =>
      String(title || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim(),
    ),
  );
  const records = await articleRecords(provider, titles, signal);
  let directFullExtracts = 0;
  const directlyHydratedTitles = new Set();
  for (const title of titles) {
    let article = records.get(title) || { extract: '' };
    const titleKey = String(article.title || title)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
    // Canonical-family pages can explain the lesson relationship later in
    // the article even when their lead does not repeat the instructor's exact
    // phrase. Ranking an intro-only candidate first made “Web Accessibility
    // Initiative” disappear before the full extract could expose its WCAG
    // sections. Hydrate at most three explicit family titles before ranking;
    // this is still a bounded title lookup and every retained claim must pass
    // the ordinary relevance, source-admission, and entailment gates.
    if (
      directFullExtracts < 3 &&
      directTitleKeys.has(titleKey) &&
      String(article.extract || '').length < 4000 &&
      typeof provider.fullArticle === 'function'
    ) {
      try {
        const fullArticle = normalizeArticleResult(await provider.fullArticle(article.title || title));
        if (fullArticle.extract) {
          article = fullArticle;
          directFullExtracts += 1;
          directlyHydratedTitles.add(titleKey);
        }
      } catch (error) {
        if (error?.name === 'AbortError' || signal?.aborted) throw error;
        // Keep the already-batched introduction when the optional full read
        // is unavailable. Research can still succeed from another candidate.
      }
    }
    const extract = article.extract;
    if (!extract) continue;
    const canonicalTitle = article.title || title;
    const candidate = buildKernelFromArticle({ topic, title: canonicalTitle, extract, provider, sourceMeta: article });
    if (!candidate) continue;
    if (looksLikeEntity(canonicalTitle, candidate.kernel.definition.text)) continue;
    if (
      !isResearchCandidateDomainAligned({
        topic,
        courseContext,
        title: canonicalTitle,
        extract,
        definition: candidate.kernel.definition.text,
        provider: candidate.kernel.provenance?.providerId,
      })
    ) {
      continue;
    }
    if (
      built.some(
        (entry) =>
          entry.title.toLowerCase() === canonicalTitle.toLowerCase() &&
          String(entry.candidate?.kernel?.term || '').toLowerCase() ===
            String(candidate.kernel?.term || '').toLowerCase(),
      )
    ) {
      continue;
    }
    built.push({ title: canonicalTitle, candidate });
  }
  if (built.length === 0) return [];

  let ranked;
  if (typeof embed === 'function') {
    const vectors = await embed([
      topic,
      ...built.map((entry) => entry.title),
      ...built.map((entry) => entry.candidate.kernel.definition.text),
    ]);
    ranked = built
      .map((entry, index) => {
        const titleScore = cosine(vectors[0], vectors[1 + index]);
        const defScore = cosine(vectors[0], vectors[1 + built.length + index]);
        return {
          ...entry,
          titleScore,
          defScore,
          relevance: Math.min(titleScore, defScore),
        };
      })
      .sort((left, right) => right.relevance - left.relevance);
  } else {
    // The course title disambiguates SEARCH, but it must not dilute ADMISSION.
    // "Introduction to Quantum Computing" adds three broad tokens to every
    // lesson; scoring "quantum error correction" against that combined string
    // pushed the exact article below the lexical floor simply because its title
    // did not repeat "introduction" and "computing". Judge the returned source
    // against the lesson topic itself. The independent title/definition signal
    // still rejects pages that merely share the broad course domain.
    const relevanceQuery = topic;
    const topicTokens = new Set(contentTokens(topic));
    const courseDomainToken = contentTokens(courseContext)[0] || '';
    const topicTokenSequence = [...topicTokens];
    const compoundTopic = /\s+(?:and|&)\s+/i.test(topic);
    const topicClauseTokens = compoundTopic
      ? String(topic)
          .split(/\s+(?:and|&)\s+/i)
          .map((clause) => contentTokens(clause))
          .filter((tokens) => tokens.length > 0)
      : [];
    ranked = built
      .map((entry) => {
        const titleScore = lexicalRelevance(relevanceQuery, entry.title);
        const defScore = lexicalRelevance(relevanceQuery, entry.candidate.kernel.definition.text);
        const titleTokens = contentTokens(entry.title);
        const definitionTokenSequence = contentTokens(entry.candidate.kernel.definition.text);
        const definitionTokens = new Set(definitionTokenSequence);
        const evidenceTokenSequence = contentTokens(
          [entry.candidate.kernel.definition.text, ...(entry.candidate.kernel.facts || []).map((fact) => fact?.text)]
            .filter(Boolean)
            .join(' '),
        );
        const evidenceTokens = new Set(evidenceTokenSequence);
        const titleTopicMatches = [...topicTokens].filter((token) => titleTokens.includes(token)).length;
        const definitionTopicMatches = [...topicTokens].filter((token) => definitionTokens.has(token)).length;
        const evidenceTopicMatches = [...topicTokens].filter((token) => evidenceTokens.has(token)).length;
        const explicitDirectTitleMatch = directTitleKeys.has(
          String(entry.title || '')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, ' ')
            .trim(),
        );
        // Official verticals declare bounded catalog hints before retrieval.
        // Treating that catalog mapping like a direct canonical title lets a
        // source page named "Headings" support "semantic HTML" without
        // weakening admission for arbitrary search results. The page still
        // has to repeat a lesson token in its admitted evidence below.
        const catalogHintTokens = new Set(contentTokens(entry.candidate.kernel?.provenance?.topicHints || ''));
        const catalogHintMatches = [...topicTokens].filter((token) => catalogHintTokens.has(token)).length;
        const curatedCatalogMatch =
          entry.candidate.kernel?.provenance?.providerId === 'w3c-wai' &&
          catalogHintMatches >= Math.min(2, Math.max(1, topicTokens.size));
        const directTitleMatch = explicitDirectTitleMatch || curatedCatalogMatch;
        const evidenceScore = lexicalRelevance(relevanceQuery, evidenceTokenSequence.join(' '));
        const relevance = Math.max(
          titleScore,
          defScore,
          directTitleMatch ? evidenceScore : 0,
          curatedCatalogMatch ? LEXICAL_FLOOR : 0,
        );
        const topicSequenceMatch =
          containsTokenSequence(topicTokenSequence, titleTokens) ||
          containsTokenSequence(topicTokenSequence, definitionTokenSequence) ||
          containsTokenSequence(topicTokenSequence, evidenceTokenSequence);
        const definitionCoversClause = topicClauseTokens.some((clause) =>
          clause.every((token) => definitionTokens.has(token)),
        );
        return {
          ...entry,
          titleScore,
          defScore,
          // A right title with an unrelated definition (or vice versa) is not
          // enough. The stronger signal carries the candidate, but the weaker
          // one must still provide independent evidence.
          relevance,
          evidenceScore,
          secondaryRelevance: Math.min(titleScore, defScore),
          topicTokenCount: topicTokens.size,
          compoundTopic,
          definitionCoversClause,
          titleTopicMatches,
          definitionTopicMatches,
          evidenceTopicMatches,
          topicSequenceMatch,
          directTitleMatch,
          curatedCatalogMatch,
          rankingScore: Math.min(titleScore, defScore) + relevance * 0.25,
          domainMatch:
            !courseDomainToken || titleTokens.includes(courseDomainToken) || definitionTokens.has(courseDomainToken),
        };
      })
      .sort((left, right) => right.rankingScore - left.rankingScore || right.relevance - left.relevance);
  }

  const effectiveFloor = floor ?? (typeof embed === 'function' ? RELEVANCE_FLOOR : LEXICAL_FLOOR);
  const courseDomainToken = contentTokens(courseContext)[0] || '';
  const domainAlignedCount =
    typeof embed === 'function' || !courseDomainToken ? 0 : ranked.filter((entry) => entry.domainMatch).length;
  const kept = ranked
    .filter(
      (entry) =>
        // A bounded official catalog declares which lesson families each page
        // serves. Do not let one very long standard page drift into a sibling
        // lesson merely because it mentions that sibling somewhere deep in
        // the document.
        (entry.candidate.kernel?.provenance?.providerId !== 'w3c-wai' || entry.curatedCatalogMatch) &&
        (entry.relevance >= effectiveFloor ||
          // A curated concept-family title may explain one necessary side of
          // a multi-concept lesson without repeating the full instructor
          // phrase. Keep the relaxation narrow: the title must come from the
          // direct family, its definition must repeat a lesson token, and it
          // must still clear 75% of the ordinary lexical floor.
          (typeof embed !== 'function' &&
            entry.directTitleMatch &&
            (entry.evidenceTopicMatches >= 1 || entry.curatedCatalogMatch) &&
            entry.relevance >= effectiveFloor * 0.75)) &&
        (typeof embed === 'function' ||
          domainAlignedCount < 3 ||
          entry.domainMatch ||
          entry.titleTopicMatches >= Math.min(2, entry.topicTokenCount) ||
          (entry.directTitleMatch && (entry.evidenceTopicMatches >= 1 || entry.curatedCatalogMatch))) &&
        (typeof embed === 'function' ||
          ((entry.secondaryRelevance >= effectiveFloor * 0.25 ||
            // A curated canonical family title can legitimately name the
            // neighbouring concept rather than repeat the lesson label
            // ("Microbial mat" for Biofilms). It remains admissible only when
            // its definition explicitly supplies the lesson topic.
            (entry.directTitleMatch && (entry.evidenceTopicMatches >= 1 || entry.curatedCatalogMatch)) ||
            entry.definitionTopicMatches >= 2 ||
            (entry.compoundTopic && entry.definitionCoversClause)) &&
            (entry.topicTokenCount <= 1 ||
              entry.topicSequenceMatch ||
              (entry.directTitleMatch && (entry.evidenceTopicMatches >= 1 || entry.curatedCatalogMatch)) ||
              entry.titleTopicMatches >= Math.min(2, entry.topicTokenCount) ||
              // For an explicitly compound lesson, one related named concept
              // may explain the relationship between both sides without
              // repeating them in its title (for example Wave function
              // collapse under "Superposition and measurement"). Search is
              // course-qualified, and the source definition itself must carry
              // every topic token.
              (entry.compoundTopic && entry.definitionCoversClause) ||
              // Compound lesson names ("Qubits and quantum states") rarely
              // appear verbatim as article titles. Keep a candidate when its
              // title names one component and its definition supplies two.
              (entry.topicTokenCount >= 3 && entry.titleTopicMatches >= 1 && entry.definitionTopicMatches >= 2)))),
    )
    .slice(0, want);
  if (kept.length === 0) return [];

  const admittedKernels = [];
  for (const [entryIndex, originalEntry] of kept.entries()) {
    let entry = originalEntry;
    const currentExtractLength = Object.values(entry.candidate?.snapshot || {}).reduce(
      (total, value) => total + String(value || '').length,
      0,
    );
    const entryTitleKey = String(entry.title || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
    if (
      entryIndex < 3 &&
      currentExtractLength < 4000 &&
      !directlyHydratedTitles.has(entryTitleKey) &&
      typeof provider.fullArticle === 'function'
    ) {
      try {
        const fullArticle = normalizeArticleResult(await provider.fullArticle(entry.title));
        if (fullArticle.extract) {
          const rebuilt = buildKernelFromArticle({
            topic,
            title: fullArticle.title || entry.title,
            extract: fullArticle.extract,
            provider,
            factCount: 8,
            sourceMeta: fullArticle,
          });
          if (
            rebuilt &&
            isResearchCandidateDomainAligned({
              topic,
              courseContext,
              title: fullArticle.title || entry.title,
              extract: fullArticle.extract,
              definition: rebuilt.kernel.definition?.text,
              provider: rebuilt.kernel.provenance?.providerId,
            })
          ) {
            entry = { ...entry, title: fullArticle.title || entry.title, candidate: rebuilt };
          }
        }
      } catch (error) {
        if (error?.name === 'AbortError' || signal?.aborted) throw error;
        // Full extracts are a bounded quality upgrade. The already-ranked
        // introduction remains available if the source refuses or times out.
      }
    }
    const candidateKernel = {
      ...entry.candidate.kernel,
      provenance: {
        ...(entry.candidate.kernel.provenance || {}),
        research: {
          query: primaryQuery,
          relevance: Number(entry.relevance.toFixed(3)),
          titleScore: Number((entry.titleScore || 0).toFixed(3)),
          definitionScore: Number((entry.defScore || 0).toFixed(3)),
          mode: typeof embed === 'function' ? 'semantic' : 'lexical',
        },
      },
    };
    const admission = admitKernel(candidateKernel, { sources: entry.candidate.snapshot });
    if (!admission.admitted) continue;
    const entailed = attachKernelEntailmentReceipt(admission.kernel, entry.candidate.snapshot);
    if (entailed.admitted) admittedKernels.push(entailed.kernel);
  }
  return backfillMultipleChoice(admittedKernels);
}

function providerFromArticleRecords(provider, records, candidateTitles) {
  const selected = [...new Set(candidateTitles)].filter(Boolean);
  return {
    search: async () => selected,
    articles: async (titles) =>
      Object.fromEntries(
        titles.map((title) => [title, records.get(title)]).filter(([, article]) => article && article.extract),
      ),
    article: async (title) => records.get(title) || null,
    ...(typeof provider.fullArticle === 'function' ? { fullArticle: (title) => provider.fullArticle(title) } : {}),
    license: provider.license,
    attributionFor: provider.attributionFor,
    sourceIdFor: provider.sourceIdFor,
    id: provider.id,
    sourceKind: provider.sourceKind,
    supportsDirectTitles: provider.supportsDirectTitles,
  };
}

function researchGroups(values, size) {
  const groups = [];
  for (let start = 0; start < values.length; start += size) groups.push(values.slice(start, start + size));
  return groups;
}

export function kernelsCoverTopic(kernels, topic) {
  const clauses = String(topic)
    .split(/\s+(?:and|&)\s+/i)
    .map((clause) => contentTokens(clause))
    .filter((tokens) => tokens.length > 0);
  if (clauses.length === 0) return false;
  return clauses.every((clause) =>
    kernels.some((kernel) => {
      // Research aliases record the QUERY topic, and a related definition can
      // merely mention a clause without teaching it (Linear combination
      // mentions superposition). Require an admitted article TITLE to name
      // each explicit side before calling a compound lesson covered.
      const kernelTokens = new Set(contentTokens(kernel?.term));
      return clause.every((token) => kernelTokens.has(token));
    }),
  );
}

export function needsTargetedResearch(kernels, topic, minimum) {
  return kernels.length < minimum || !kernelsCoverTopic(kernels, topic);
}

/**
 * Research every uncovered lesson as one bounded course transaction.
 *
 * V0 called search + article extraction once per lesson (12 requests for six
 * lessons, 30 for fifteen), so the last lesson could disappear behind a 429.
 * This path first resolves all exact titles in one request, then searches
 * unresolved topics in OR groups of three and fetches every returned article
 * in one chunked batch. The same per-lesson relevance and admission gates still
 * decide what survives; only the network fan-out changes.
 */
export async function researchLessonKernelSets(
  topics = [],
  {
    provider,
    embed = null,
    want = 4,
    minimum = 3,
    floor = null,
    courseContext = '',
    signal,
    groupSize = 3,
    candidatesPerGroup = 24,
    maxTargetedFallbacks = 6,
    researchPlan = null,
    providerId = '',
    onProgress = null,
  } = {},
) {
  const uniqueTopics = [...new Set(topics.map((topic) => String(topic || '').trim()).filter(Boolean))];
  const byTopic = new Map();
  const errors = [];
  if (!provider || uniqueTopics.length === 0) {
    return { byTopic, errors, searchGroups: 0, articleCandidates: 0 };
  }
  const effectiveProviderId = providerId || provider.id || 'research-provider';
  onProgress?.({
    phase: 'provider-start',
    providerId: effectiveProviderId,
    topics: uniqueTopics.length,
    completed: 0,
    total: uniqueTopics.length,
  });

  const directByTopic = new Map(
    uniqueTopics.map((topic) => [
      topic,
      provider.supportsDirectTitles === false ? [] : directResearchTitles(topic, courseContext),
    ]),
  );
  const allDirectTitles = [...new Set([...directByTopic.values()].flat())];
  let directRecords = new Map();
  try {
    directRecords = await articleRecords(provider, allDirectTitles, signal);
  } catch (error) {
    if (error?.name === 'AbortError' || signal?.aborted) throw error;
    errors.push(`exact-title:${error?.message || 'failed'}`);
  }

  for (const topic of uniqueTopics) {
    const titles = directByTopic.get(topic) || [];
    const localProvider = providerFromArticleRecords(provider, directRecords, titles);
    const kernels = await researchLessonKernels(topic, {
      provider: localProvider,
      embed,
      want,
      candidates: titles.length,
      floor,
      courseContext,
      plannedQuery: providerQueryForLesson(researchPlan, topic, effectiveProviderId),
      signal,
    });
    byTopic.set(topic, kernels);
  }

  const unresolved = uniqueTopics.filter((topic) => needsTargetedResearch(byTopic.get(topic) || [], topic, minimum));
  const groups = researchGroups(unresolved, Math.max(1, groupSize));
  const searchTitlesByTopic = new Map();
  let searchRecords = new Map();
  for (const group of groups) {
    try {
      const query = groupedResearchQueryFromPlan(group, researchPlan, effectiveProviderId);
      let titles = [];
      if (query && typeof provider.searchArticles === 'function') {
        const records = await provider.searchArticles(query, candidatesPerGroup);
        titles = Object.entries(records || {})
          .filter(([, record]) => record?.title)
          .map(([key]) => key);
        for (const title of titles) searchRecords.set(title, normalizeArticleResult(records[title]));
      } else if (query) {
        titles = [...new Set(await provider.search(query, candidatesPerGroup))];
      }
      for (const topic of group) searchTitlesByTopic.set(topic, titles);
    } catch (error) {
      if (error?.name === 'AbortError' || signal?.aborted) throw error;
      errors.push(`group-search:${error?.message || 'failed'}`);
      for (const topic of group) searchTitlesByTopic.set(topic, []);
    }
  }

  const allSearchTitles = [...new Set([...searchTitlesByTopic.values()].flat())];
  if (typeof provider.searchArticles !== 'function') {
    try {
      searchRecords = await articleRecords(provider, allSearchTitles, signal);
    } catch (error) {
      if (error?.name === 'AbortError' || signal?.aborted) throw error;
      errors.push(`article-batch:${error?.message || 'failed'}`);
    }
  }
  const combinedRecords = new Map([...directRecords, ...searchRecords]);

  for (const topic of unresolved) {
    const titles = [...(directByTopic.get(topic) || []), ...(searchTitlesByTopic.get(topic) || [])];
    const localProvider = providerFromArticleRecords(provider, combinedRecords, titles);
    const kernels = await researchLessonKernels(topic, {
      provider: localProvider,
      embed,
      want,
      candidates: titles.length,
      floor,
      courseContext,
      plannedQuery: providerQueryForLesson(researchPlan, topic, effectiveProviderId),
      signal,
    });
    byTopic.set(topic, kernels);
  }

  // A grouped search can still be dominated by one topic's popular pages.
  // Spend a targeted search only on the small remainder, then batch those
  // articles together. This restores topic recall without returning to the
  // old search+article pair for every lesson.
  const sparse = unresolved
    .filter((topic) => needsTargetedResearch(byTopic.get(topic) || [], topic, minimum))
    .slice(0, Math.max(0, maxTargetedFallbacks));
  const targetedTitlesByTopic = new Map();
  let targetedRecords = new Map();
  for (const topic of sparse) {
    try {
      const query =
        groupedResearchQueryFromPlan([topic], researchPlan, effectiveProviderId) ||
        researchQueryForTopic(topic, courseContext);
      if (typeof provider.searchArticles === 'function') {
        const records = await provider.searchArticles(query, Math.max(12, candidatesPerGroup));
        const titles = Object.entries(records || {})
          .filter(([, record]) => record?.title)
          .map(([key]) => key);
        targetedTitlesByTopic.set(topic, titles);
        for (const title of titles) targetedRecords.set(title, normalizeArticleResult(records[title]));
      } else {
        targetedTitlesByTopic.set(topic, [...new Set(await provider.search(query, Math.max(12, candidatesPerGroup)))]);
      }
    } catch (error) {
      if (error?.name === 'AbortError' || signal?.aborted) throw error;
      errors.push(`targeted-search:${error?.message || 'failed'}`);
      targetedTitlesByTopic.set(topic, []);
    }
  }
  const targetedTitles = [...new Set([...targetedTitlesByTopic.values()].flat())];
  if (typeof provider.searchArticles !== 'function') {
    try {
      targetedRecords = await articleRecords(provider, targetedTitles, signal);
    } catch (error) {
      if (error?.name === 'AbortError' || signal?.aborted) throw error;
      errors.push(`targeted-articles:${error?.message || 'failed'}`);
    }
  }
  const allRecords = new Map([...combinedRecords, ...targetedRecords]);
  for (const topic of sparse) {
    const titles = [
      ...(directByTopic.get(topic) || []),
      ...(searchTitlesByTopic.get(topic) || []),
      ...(targetedTitlesByTopic.get(topic) || []),
    ];
    const localProvider = providerFromArticleRecords(provider, allRecords, titles);
    const kernels = await researchLessonKernels(topic, {
      provider: localProvider,
      embed,
      want,
      candidates: titles.length,
      floor,
      courseContext,
      plannedQuery: providerQueryForLesson(researchPlan, topic, effectiveProviderId),
      signal,
    });
    byTopic.set(topic, kernels);
  }

  const result = {
    byTopic,
    errors,
    searchGroups: groups.length,
    targetedSearches: sparse.length,
    articleCandidates: new Set([...allDirectTitles, ...allSearchTitles, ...targetedTitles]).size,
  };
  onProgress?.({
    phase: 'provider-complete',
    providerId: effectiveProviderId,
    topics: uniqueTopics.length,
    completed: [...byTopic.values()].filter((kernels) => kernels.length > 0).length,
    total: uniqueTopics.length,
    articleCandidates: result.articleCandidates,
  });
  return result;
}

/**
 * Run research providers in declared order and carry only unresolved lessons
 * forward. Open scholarly evidence can therefore contribute first without
 * forcing every lesson through every catalog; Wikipedia fills only the
 * remaining contract gaps.
 */
export async function researchLessonKernelSetsCascade(
  topics = [],
  {
    providers = [],
    embed = null,
    want = 4,
    minimum = 3,
    floor = null,
    courseContext = '',
    isTopicReady = null,
    signal,
    researchPlan = null,
    onProgress = null,
  } = {},
) {
  const uniqueTopics = [...new Set(topics.map((topic) => String(topic || '').trim()).filter(Boolean))];
  const byTopic = new Map(uniqueTopics.map((topic) => [topic, []]));
  const errors = [];
  const providerStats = [];
  let searchGroups = 0;
  let targetedSearches = 0;
  let articleCandidates = 0;
  const topicReady = (topic) => {
    const kernels = byTopic.get(topic) || [];
    return typeof isTopicReady === 'function'
      ? Boolean(isTopicReady(topic, kernels))
      : !needsTargetedResearch(kernels, topic, minimum);
  };

  for (const descriptor of providers) {
    const provider = descriptor?.provider || descriptor;
    const providerId = descriptor?.id || provider?.id || `provider-${providerStats.length + 1}`;
    const unresolved = uniqueTopics.filter((topic) => !topicReady(topic));
    if (unresolved.length === 0) break;
    if (!provider) continue;
    const pending = unresolved.filter(
      (topic) => !researchPlan || providerSupportsLesson(researchPlan, topic, providerId),
    );
    if (pending.length === 0) continue;
    const batch = await researchLessonKernelSets(pending, {
      provider,
      providerId,
      embed,
      want,
      minimum,
      floor,
      courseContext,
      signal,
      researchPlan,
      onProgress,
      ...(descriptor?.options || {}),
    });
    let contributedTopics = 0;
    let contributedKernels = 0;
    for (const topic of pending) {
      const prior = byTopic.get(topic) || [];
      const incoming = batch.byTopic.get(topic) || [];
      const seen = new Set(prior.map((kernel) => kernel?.id).filter(Boolean));
      const merged = [...prior];
      for (const kernel of incoming) {
        if (!kernel?.id || seen.has(kernel.id)) continue;
        seen.add(kernel.id);
        merged.push(kernel);
        contributedKernels += 1;
      }
      if (merged.length > prior.length) contributedTopics += 1;
      const enriched = backfillMultipleChoice(merged);
      // A readiness-aware compiler needs later-provider candidates available
      // to find a schema-complete grounded combination. Legacy callers retain
      // their original bounded top-N result.
      byTopic.set(topic, typeof isTopicReady === 'function' ? enriched : enriched.slice(0, want));
    }
    errors.push(...(batch.errors || []).map((error) => `${providerId}:${error}`));
    searchGroups += Number(batch.searchGroups) || 0;
    targetedSearches += Number(batch.targetedSearches) || 0;
    articleCandidates += Number(batch.articleCandidates) || 0;
    providerStats.push({
      providerId,
      attemptedTopics: pending.length,
      contributedTopics,
      contributedKernels,
      searchGroups: Number(batch.searchGroups) || 0,
      targetedSearches: Number(batch.targetedSearches) || 0,
    });
  }

  return {
    byTopic,
    errors,
    searchGroups,
    targetedSearches,
    articleCandidates,
    providerStats,
    providersUsed: providerStats.filter((entry) => entry.contributedKernels > 0).map((entry) => entry.providerId),
  };
}

/**
 * Research a whole course, then write the assessment items that no single
 * concept could.
 *
 * Per-concept extraction produced zero usable multiple-choice items, because
 * the only distractors available in one article are the things that article
 * happens to say it is confused with — rare, and absent from most sources. A
 * course supplies what a concept cannot: its sibling concepts. Asking which
 * definition belongs to which term, with real definitions of neighbouring
 * concepts as distractors, is a discriminating item built entirely from
 * source-anchored text, and it exists for every concept the course covers.
 */
export async function researchCourse(topics = [], options = {}) {
  // The course subject disambiguates every lesson query in it.
  const { courseContext = '' } = options;
  const admitted = [];
  const rejected = [];
  for (const topic of topics) {
    let result;
    try {
      result = await researchConcept(topic, { ...options, courseContext });
    } catch (error) {
      if (error?.name === 'AbortError' || options.signal?.aborted) throw error;
      result = { ok: false, reason: `error:${error?.message || 'unknown'}`, topic };
    }
    if (result.ok) admitted.push(result);
    else rejected.push(result);
  }

  for (const entry of admitted) {
    if (entry.kernel.mcBank.length > 0) continue;
    const siblings = admitted.filter((other) => other !== entry);
    if (siblings.length < 3) continue;
    // Rotate by position so every lesson does not draw the same three siblings.
    const offset = admitted.indexOf(entry);
    const picked = [0, 1, 2].map((step) => siblings[(offset + step) % siblings.length].kernel.definition.text);
    entry.kernel.mcBank = [
      {
        stem: `Which statement defines ${entry.kernel.term}?`,
        options: [entry.kernel.definition.text, ...picked],
        answerIndex: 0,
        explanationFactRef: 0,
        rationaleRefs: [0],
      },
    ];
  }

  return { admitted, rejected, coverage: topics.length ? admitted.length / topics.length : 0 };
}
