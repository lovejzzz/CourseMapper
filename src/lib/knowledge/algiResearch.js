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
  'a','an','and','are','as','at','be','by','for','from','has','how','in','into','is','it','its','of','on','or',
  'that','the','their','they','this','to','was','were','what','when','which','who','why','with','you','your',
  'course','lesson','week','unit','introduction','intro','overview','basics','fundamentals','principles',
]);

/**
 * Crude suffix stripping, which matters more than it looks: without it
 * "low-fidelity wireframes" scored 0 against the article "Website wireframe",
 * because plural and singular are different strings. The embedder never had
 * this problem, but the browser runs the lexical path.
 */
function stem(token) {
  return token
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

/** Jaccard-style overlap, used when no embedder is available. */
export function lexicalRelevance(topic, candidateText) {
  const a = new Set(contentTokens(topic));
  const b = new Set(contentTokens(candidateText));
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const token of a) if (b.has(token)) shared += 1;
  return shared / a.size;
}

export function cosine(a = [], b = []) {
  let sum = 0;
  for (let i = 0; i < a.length && i < b.length; i += 1) sum += a[i] * b[i];
  return sum;
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

const EXPLANATORY = /\b(is|are|refers to|means|consists of|involves|describes|occurs|because|when|if|therefore|results? in|allows?|requires?)\b/i;
/** Narration, not instruction: origin stories date a concept without teaching it. */
const NARRATIVE = /\b(coined|named after|founded|born|died|in \d{4}|since \d{4}|century|first (?:used|described|published)|history of)\b/i;

export function explanatoryScore(sentence, head = '') {
  let score = 0;
  if (EXPLANATORY.test(sentence)) score += 2;
  if (head && sentence.toLowerCase().includes(head.toLowerCase())) score += 2;
  if (NARRATIVE.test(sentence)) score -= 3;
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
const ENTITY_NOUN =
  '(?:company|corporation|firm|band|film|movie|album|song|single|novel|political party|party|magazine|newspaper|television series|TV series|video game|organization|organisation|university|college|city|town|village|river|mountain|footballer|singer|actor|actress|politician|businessman|businesswoman|athlete|musician|author|writer)';
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
  return false;
}

/** The head noun of an article title, minus any disambiguation parenthetical. */
export function headOf(title = '') {
  return String(title).replace(/\s*\([^)]*\)\s*$/, '').trim();
}

const COPULA = /\b(is|are|refers to|is defined as|describes|means|denotes)\b/i;

/**
 * The lead sentence of an encyclopedia article is nearly always the definition,
 * so position matters as much as pattern. Ranking by position stops a mid-article
 * comparative ("what distinguishes Kantian deontologism from divine command
 * deontology is...") from being served as the definition of the concept.
 */
export function definitionSentence(sentences, head) {
  const term = headOf(head).toLowerCase();
  const ranked = [];
  for (let index = 0; index < Math.min(sentences.length, 12); index += 1) {
    const sentence = sentences[index];
    const at = sentence.toLowerCase().indexOf(term);
    // The term must be the SUBJECT, not merely present. At 60 chars a mention
    // buried in a subordinate clause ("Some scholars argue that the wider
    // literature on deontology is inconsistent") still qualified as a definition.
    if (at < 0 || at > 40) continue;
    if (!COPULA.test(sentence)) continue;
    ranked.push({ sentence, score: -index * 2 - at / 20 });
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
  return {
    text: `Students treat ${term} as interchangeable with what this source explicitly distinguishes it from.`,
    corrective: sentence,
  };
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
  return {
    async search(topic, limit = 3) {
      const url = `${WIKI_API}?action=query&list=search&srsearch=${encodeURIComponent(topic)}&srlimit=${limit}&format=json&origin=*`;
      const data = await httpJson(url);
      return (data?.query?.search || []).map((hit) => hit.title).filter(Boolean);
    },
    async article(title) {
      const url = `${WIKI_API}?action=query&prop=extracts&explaintext=1&exsectionformat=plain&titles=${encodeURIComponent(title)}&format=json&origin=*`;
      const data = await httpJson(url);
      const page = Object.values(data?.query?.pages || {})[0];
      return page?.extract || '';
    },
    license: 'CC BY-SA 4.0',
    attributionFor: (title) => `Wikipedia, ${title}`,
    sourceIdFor: (title) => `wikipedia:${title}`,
  };
}

/* ------------------------------------------------------------------ *
 * Extraction + admission
 * ------------------------------------------------------------------ */

export function buildKernelFromArticle({ topic, title, extract, provider, factCount = 4 }) {
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
  if (facts.length < 2) return null;

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
      id: `researched/${head.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`,
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
      provenance: { origin: RESEARCH_ORIGIN, topic, title },
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
  { provider, embed = null, candidates = 3, floor = null, courseContext = '' } = {},
) {
  if (!topic || !provider) return { ok: false, reason: 'no-topic-or-provider' };

  // A lesson title is a pedagogical phrase, not an encyclopedia entity: "the
  // firm and its publics" is how an instructor names stakeholder theory and is
  // indexed nowhere. Searched bare, it returned SOM (architectural firm). The
  // course's own subject is the disambiguator that was already on hand, so the
  // topic is searched WITH it and candidates are pooled across both queries.
  const queries = courseContext ? [`${courseContext} ${topic}`, topic] : [topic];
  const titles = [];
  for (const query of queries) {
    for (const title of await provider.search(query, candidates)) {
      if (!titles.includes(title)) titles.push(title);
    }
  }
  if (titles.length === 0) return { ok: false, reason: 'no-search-results', topic };

  const scored = [];
  const rejectedEntities = [];
  for (const title of titles) {
    const extract = await provider.article(title);
    if (!extract) continue;
    const built = buildKernelFromArticle({ topic, title, extract, provider });
    if (!built) continue;
    if (looksLikeEntity(title, built.kernel.definition.text)) {
      rejectedEntities.push(title);
      continue;
    }
    scored.push({ title, extract, built });
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

/** Give a kernel set cross-concept items, using siblings' definitions as distractors. */
export function backfillMultipleChoice(kernels = []) {
  if (kernels.length < 4) return kernels;
  kernels.forEach((kernel, index) => {
    if (kernel.mcBank.length > 0) return;
    const siblings = kernels.filter((other) => other !== kernel);
    const picked = [0, 1, 2].map((step) => siblings[(index + step) % siblings.length].definition.text);
    if (new Set([kernel.definition.text, ...picked]).size !== 4) return;
    kernel.mcBank = [
      {
        stem: itemStem(kernel.term),
        options: [kernel.definition.text, ...picked],
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
  { provider, embed = null, want = 4, candidates = 4, floor = null, courseContext = '' } = {},
) {
  if (!topic || !provider) return [];
  const queries = courseContext ? [`${courseContext} ${topic}`, topic] : [topic];
  const titles = [];
  for (const query of queries) {
    for (const title of await provider.search(query, candidates)) {
      if (!titles.includes(title)) titles.push(title);
    }
  }

  const built = [];
  for (const title of titles) {
    const extract = await provider.article(title);
    if (!extract) continue;
    const candidate = buildKernelFromArticle({ topic, title, extract, provider });
    if (!candidate) continue;
    if (looksLikeEntity(title, candidate.kernel.definition.text)) continue;
    built.push({ title, candidate });
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
        relevance: Math.min(cosine(vectors[0], vectors[1 + index]), cosine(vectors[0], vectors[1 + built.length + index])),
      }))
      .sort((left, right) => right.relevance - left.relevance);
  } else {
    // Lexical evidence is sparse, so the weaker-signal rule that keeps the
    // embedder honest would reject nearly everything here. The entity filter
    // is what guards against the wrong KIND of page in this mode.
    ranked = built
      .map((entry) => ({
        ...entry,
        relevance: Math.max(
          lexicalRelevance(topic, entry.title),
          lexicalRelevance(topic, entry.candidate.kernel.definition.text),
        ),
      }))
      .sort((left, right) => right.relevance - left.relevance);
  }

  const effectiveFloor = floor ?? (typeof embed === 'function' ? RELEVANCE_FLOOR : LEXICAL_FLOOR);
  // The lead concept must clear the floor; the rest ride along as the related
  // material the lesson teaches beside it, so a slightly looser bar is honest.
  if (ranked[0].relevance < effectiveFloor) return [];
  const kept = ranked.filter((entry, index) => index === 0 || entry.relevance >= effectiveFloor * 0.6).slice(0, want);

  const admittedKernels = [];
  for (const entry of kept) {
    const admission = admitKernel(entry.candidate.kernel, { sources: entry.candidate.snapshot });
    if (admission.admitted) admittedKernels.push(admission.kernel);
  }
  return backfillMultipleChoice(admittedKernels);
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
