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

export const RESEARCH_ORIGIN = 'algi-research';

/** Wikipedia is the default corpus: openly licensed, CORS-open, broad. */
const WIKI_API = 'https://en.wikipedia.org/w/api.php';

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
  if (/(?:^|[a-z])remediation$/.test(normalized)) return 'remediation';
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
    return [];
  })();
  const named = [
    normalized,
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

/** Jaccard-style overlap, used when no embedder is available. */
export function lexicalRelevance(topic, candidateText) {
  const a = new Set(contentTokens(topic));
  const b = new Set(contentTokens(candidateText));
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const token of a) if (b.has(token)) shared += 1;
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
  /\b(is|are|refers to|means|consists of|involves|describes|occurs|because|when|if|therefore|results? in|allows?|requires?)\b/i;
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
const ENTITY_NOUN = `(?:company|corporation|firm|band|film|movie|album|song|single|novel|political party|party|magazine|newspaper|journal|television series|TV series|video game|organization|organisation|society|association|institute|council|center|centre|university|college|city|town|village|river|mountain|footballer|singer|actor|actress|politician|businessman|businesswoman|athlete|musician|${PERSON_ROLE.slice(3, -1)})`;
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

const COPULA = /\b(is|are|refers to|is defined as|describes|means|denotes|comprises)\b/i;

/**
 * The lead sentence of an encyclopedia article is nearly always the definition,
 * so position matters as much as pattern. Ranking by position stops a mid-article
 * comparative ("what distinguishes Kantian deontologism from divine command
 * deontology is...") from being served as the definition of the concept.
 */
export function definitionSentence(sentences, head) {
  const term = headOf(head).toLowerCase();
  const termTokens = contentTokens(term);
  const ranked = [];
  for (let index = 0; index < Math.min(sentences.length, 12); index += 1) {
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
    ranked.push({ sentence, score: -index * 2 - Math.max(0, at) / 20 });
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
  const target = contrastTargetFromSentence(sentence);
  return {
    text: target
      ? `${term} and ${target} are interchangeable descriptions of the same concept.`
      : `Students stretch ${term} beyond the boundary this source draws around it.`,
    corrective: sentence,
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
  return {
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
    articles: loadArticles,
    license: 'CC BY-SA 4.0',
    attributionFor: (title) => `Wikipedia contributors, “${title}”`,
    sourceIdFor: (title) => `wikipedia:${title}`,
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
  };
}

export function buildKernelFromArticle({ topic, title, extract, provider, factCount = 4, sourceMeta = {} }) {
  const sentences = sentencesFrom(extract);
  if (sentences.length === 0) return null;
  const head = headOf(title);
  const definition = definitionSentence(sentences, head);
  if (!definition) return null;

  const contrasts = contrastSentences(sentences);
  const examples = exampleSentences(sentences, head);
  const facts = sentences
    .filter((sentence) => sentence !== definition && !contrasts.includes(sentence))
    .sort((left, right) => explanatoryScore(right, head) - explanatoryScore(left, head))
    .filter((sentence) => explanatoryScore(sentence, head) > 0)
    .slice(0, factCount);
  // One strong explanatory fact plus the anchored definition is enough for a
  // candidate. Course-level composition combines three concepts and still
  // requires a five-fact ledger; rejecting a short but authoritative lead
  // here made Waterborne disease disappear before that stronger aggregate gate
  // could judge it.
  if (facts.length < 1) return null;

  const src = provider.sourceIdFor(title);
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
      id: `researched/${head
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')}`,
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
                text: `Students stretch ${head} beyond the boundary this source draws around it.`,
                corrective: definition,
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
      license: provider.license,
      attribution: provider.attributionFor(title),
      provenance: {
        origin: RESEARCH_ORIGIN,
        topic,
        title,
        sourceUrl:
          sourceMeta.sourceUrl ||
          `https://en.wikipedia.org/wiki/${encodeURIComponent(String(title || '').replace(/\s+/g, '_'))}`,
        ...(sourceMeta.revisionId ? { revisionId: sourceMeta.revisionId } : {}),
        ...(sourceMeta.revisionTimestamp ? { revisionTimestamp: sourceMeta.revisionTimestamp } : {}),
      },
    },
  };
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
  return {
    ok: true,
    topic,
    title: best.title,
    relevance: Number(best.relevance.toFixed(3)),
    titleScore: Number(best.titleScore.toFixed(3)),
    defScore: Number(best.defScore.toFixed(3)),
    mode: best.mode,
    tier: admission.tier,
    kernel: admission.kernel,
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
  { provider, embed = null, want = 4, candidates = 12, floor = null, courseContext = '', signal } = {},
) {
  if (!topic || !provider) return [];
  if (signal?.aborted) throw signal.reason || Object.assign(new Error('Algi research stopped'), { name: 'AbortError' });
  let titles = [...new Set(await provider.search(researchQueryForTopic(topic, courseContext), candidates))];
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
  for (const title of titles) {
    const article = records.get(title) || { extract: '' };
    const extract = article.extract;
    if (!extract) continue;
    const canonicalTitle = article.title || title;
    const candidate = buildKernelFromArticle({ topic, title: canonicalTitle, extract, provider, sourceMeta: article });
    if (!candidate) continue;
    if (looksLikeEntity(canonicalTitle, candidate.kernel.definition.text)) continue;
    if (built.some((entry) => entry.title.toLowerCase() === canonicalTitle.toLowerCase())) continue;
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
      .map((entry, index) => ({
        ...entry,
        relevance: Math.min(
          cosine(vectors[0], vectors[1 + index]),
          cosine(vectors[0], vectors[1 + built.length + index]),
        ),
      }))
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
        const titleTopicMatches = [...topicTokens].filter((token) => titleTokens.includes(token)).length;
        const definitionTopicMatches = [...topicTokens].filter((token) => definitionTokens.has(token)).length;
        const topicSequenceMatch =
          containsTokenSequence(topicTokenSequence, titleTokens) ||
          containsTokenSequence(topicTokenSequence, definitionTokenSequence);
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
          relevance: Math.max(titleScore, defScore),
          secondaryRelevance: Math.min(titleScore, defScore),
          topicTokenCount: topicTokens.size,
          compoundTopic,
          definitionCoversClause,
          titleTopicMatches,
          definitionTopicMatches,
          topicSequenceMatch,
          directTitleMatch: directTitleKeys.has(
            String(entry.title || '')
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, ' ')
              .trim(),
          ),
          rankingScore: Math.min(titleScore, defScore) + Math.max(titleScore, defScore) * 0.25,
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
        entry.relevance >= effectiveFloor &&
        (typeof embed === 'function' ||
          domainAlignedCount < 3 ||
          entry.domainMatch ||
          entry.titleTopicMatches >= Math.min(2, entry.topicTokenCount) ||
          (entry.directTitleMatch && entry.definitionTopicMatches >= 1)) &&
        (typeof embed === 'function' ||
          ((entry.secondaryRelevance >= effectiveFloor * 0.25 ||
            // A curated canonical family title can legitimately name the
            // neighbouring concept rather than repeat the lesson label
            // ("Microbial mat" for Biofilms). It remains admissible only when
            // its definition explicitly supplies the lesson topic.
            (entry.directTitleMatch && entry.definitionTopicMatches >= 1) ||
            entry.definitionTopicMatches >= 2 ||
            (entry.compoundTopic && entry.definitionCoversClause)) &&
            (entry.topicTokenCount <= 1 ||
              entry.topicSequenceMatch ||
              (entry.directTitleMatch && entry.definitionTopicMatches >= 1) ||
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
  for (const entry of kept) {
    const admission = admitKernel(entry.candidate.kernel, { sources: entry.candidate.snapshot });
    if (admission.admitted) admittedKernels.push(admission.kernel);
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
    license: provider.license,
    attributionFor: provider.attributionFor,
    sourceIdFor: provider.sourceIdFor,
  };
}

function researchGroups(values, size) {
  const groups = [];
  for (let start = 0; start < values.length; start += size) groups.push(values.slice(start, start + size));
  return groups;
}

function kernelsCoverTopic(kernels, topic) {
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

function needsTargetedResearch(kernels, topic, minimum) {
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
  } = {},
) {
  const uniqueTopics = [...new Set(topics.map((topic) => String(topic || '').trim()).filter(Boolean))];
  const byTopic = new Map();
  const errors = [];
  if (!provider || uniqueTopics.length === 0) {
    return { byTopic, errors, searchGroups: 0, articleCandidates: 0 };
  }

  const directByTopic = new Map(uniqueTopics.map((topic) => [topic, directResearchTitles(topic, courseContext)]));
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
      const query = groupedResearchQuery(group);
      let titles = [];
      if (query && typeof provider.searchArticles === 'function') {
        const records = await provider.searchArticles(query, candidatesPerGroup);
        titles = [
          ...new Set(
            Object.values(records || {})
              .map((record) => record?.title)
              .filter(Boolean),
          ),
        ];
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
      const query = groupedResearchQuery([topic]) || researchQueryForTopic(topic, courseContext);
      if (typeof provider.searchArticles === 'function') {
        const records = await provider.searchArticles(query, Math.max(12, candidatesPerGroup));
        const titles = [
          ...new Set(
            Object.values(records || {})
              .map((record) => record?.title)
              .filter(Boolean),
          ),
        ];
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
      signal,
    });
    byTopic.set(topic, kernels);
  }

  return {
    byTopic,
    errors,
    searchGroups: groups.length,
    targetedSearches: sparse.length,
    articleCandidates: new Set([...allDirectTitles, ...allSearchTitles, ...targetedTitles]).size,
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
