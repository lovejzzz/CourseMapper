import { assessResearchCurrency } from './researchFreshness.js';
/**
 * Algi evidence graph — the model-free consolidation boundary between live
 * research and the shared course compiler.
 *
 * Fluent text never counts as evidence here. Nodes are admitted source claims;
 * edges record support, provenance, and narrowly detectable contradictions.
 */

export const ALGI_EVIDENCE_GRAPH_PROTOCOL = 'algi-claim-evidence-graph-v1';

const PROVIDER_AUTHORITY = {
  // The W3C/WAI vertical retrieves the governing accessibility standard and
  // its official tutorials. Within that bounded domain it should outrank an
  // encyclopedia summary when curricular fit and source support are equal.
  'w3c-wai': 1,
  openstax: 0.98,
  'europe-pmc': 0.94,
  doaj: 0.9,
  wikipedia: 0.68,
  genome: 0.86,
};
const NEGATION = /\b(?:cannot|can't|doesn't|don't|isn't|never|no|not|without)\b/i;
const NUMBER = /\b\d+(?:\.\d+)?%?\b/g;
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
  'in',
  'is',
  'it',
  'of',
  'on',
  'or',
  'that',
  'the',
  'to',
  'was',
  'were',
  'which',
  'with',
]);

function clean(value = '') {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalize(value = '') {
  return clean(value)
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}%]+/gu, ' ')
    .trim();
}

function tokens(value = '') {
  return normalize(value)
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !STOPWORDS.has(token));
}

function tokenOverlap(left = '', right = '') {
  const a = new Set(tokens(left));
  const b = new Set(tokens(right));
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const token of a) if (b.has(token)) shared += 1;
  return shared / Math.min(a.size, b.size);
}

function sourceIdFor(kernel = {}, atom = {}) {
  return clean(atom?.anchor?.src || kernel?.provenance?.sourceId || kernel?.id);
}

function providerFor(kernel = {}) {
  const explicit = clean(kernel?.provenance?.providerId).toLowerCase();
  if (explicit) return explicit;
  const source = clean(kernel?.definition?.anchor?.src).toLowerCase();
  if (source.includes('openstax')) return 'openstax';
  return kernel?.provenance?.origin === 'algi-research' ? 'unknown-research' : 'genome';
}

function authorityScore(kernel = {}) {
  return PROVIDER_AUTHORITY[providerFor(kernel)] || 0.72;
}

function currencyScore(kernel = {}, now = Date.now()) {
  const currency = assessResearchCurrency(kernel, { now });
  if (currency.status === 'undated') return 0.4;
  if (currency.ageDays <= 30) return 1;
  if (currency.ageDays <= 365) return 0.9;
  if (currency.ageDays <= 365 * 3) return 0.78;
  return 0.64;
}

function supportScore(kernel = {}) {
  if (kernel?.provenance?.origin !== 'algi-research') return 0.92;
  const receipt = kernel?.provenance?.entailment;
  if (receipt?.status !== 'passed') return 0;
  return Math.max(0, Math.min(1, Number(receipt.minimumScore) || 0));
}

function relevanceScore(kernel = {}) {
  const score = Number(kernel?.provenance?.research?.relevance);
  return Number.isFinite(score) ? Math.max(0, Math.min(1, score)) : 0.72;
}

function conceptTokens(value = '') {
  return tokens(value).filter((token) => !['principle', 'principles', 'practice', 'practices'].includes(token));
}

function initialism(value = '') {
  const words = conceptTokens(value);
  return words.length >= 2 ? words.map((word) => word[0]).join('') : '';
}

/**
 * Scholarly authority is not the same as curricular fit. A broad paper that
 * mentions accessibility should not outrank the canonical WCAG page for a
 * WCAG lesson merely because DOAJ has a higher provider prior. Reward sources
 * whose own title/term names the lesson concept, including acronym expansions.
 */
function curricularFitScore(kernel = {}) {
  const topic = clean(kernel?.provenance?.topic);
  if (!topic) return 0.72;
  const topicTokens = conceptTokens(topic);
  const candidateLabel = clean(`${kernel?.term || ''} ${kernel?.provenance?.title || ''}`);
  const candidateTokens = new Set(conceptTokens(candidateLabel));
  if (topicTokens.length === 0 || candidateTokens.size === 0) return 0;
  const acronyms = new Set(
    topic
      .toLowerCase()
      .match(/\b[a-z]{2,8}\b/g)
      ?.filter((word) => word === word.toUpperCase() || word.length <= 5) || [],
  );
  const candidateInitialism = initialism(kernel?.provenance?.title || kernel?.term);
  if (candidateInitialism && (topicTokens.includes(candidateInitialism) || acronyms.has(candidateInitialism))) {
    return 1;
  }
  const overlap = topicTokens.filter((token) => candidateTokens.has(token)).length;
  return Math.max(0, Math.min(1, overlap / topicTokens.length));
}

function confidenceFor(kernel, now) {
  const components = {
    authority: authorityScore(kernel),
    currency: currencyScore(kernel, now),
    support: supportScore(kernel),
    relevance: relevanceScore(kernel),
    curricularFit: curricularFitScore(kernel),
  };
  const score =
    components.authority * 0.2 +
    components.currency * 0.1 +
    components.support * 0.3 +
    components.relevance * 0.15 +
    components.curricularFit * 0.25;
  return { score: Number(score.toFixed(3)), components };
}

function claimAtoms(kernel = {}) {
  return [
    { type: 'definition', ...(kernel?.definition || {}) },
    ...(Array.isArray(kernel?.facts) ? kernel.facts.map((fact) => ({ type: 'fact', ...fact })) : []),
  ].filter((atom) => clean(atom?.text) && clean(atom?.anchor?.src) && clean(atom?.anchor?.quote));
}

export function countAlgiEvidenceClaims(kernels = []) {
  return (Array.isArray(kernels) ? kernels : []).reduce((total, kernel) => total + claimAtoms(kernel).length, 0);
}

function numberSet(value = '') {
  return new Set([...clean(value).matchAll(NUMBER)].map((match) => match[0]));
}

function contradicts(left, right) {
  if (normalize(left.term) !== normalize(right.term)) return null;
  if (tokenOverlap(left.text, right.text) < 0.72) return null;
  if (NEGATION.test(left.text) !== NEGATION.test(right.text)) return 'negation';
  const leftNumbers = numberSet(left.text);
  const rightNumbers = numberSet(right.text);
  if (leftNumbers.size > 0 && rightNumbers.size > 0 && [...leftNumbers].every((value) => !rightNumbers.has(value))) {
    return 'numeric';
  }
  return null;
}

export function buildAlgiEvidenceGraph({
  courseName = '',
  plan = {},
  kernelsByTopic = new Map(),
  now = Date.now(),
} = {}) {
  const lessonPlans = Array.isArray(plan?.lessons) ? plan.lessons : [];
  const sources = new Map();
  const claims = [];
  const supportEdges = [];
  const lessonRows = [];

  for (const lesson of lessonPlans) {
    const kernels = kernelsByTopic instanceof Map ? kernelsByTopic.get(lesson.title) || [] : [];
    const lessonClaimIds = [];
    const lessonSourceIds = new Set();
    for (const kernel of kernels) {
      const provider = providerFor(kernel);
      const confidence = confidenceFor(kernel, now);
      for (const [atomIndex, atom] of claimAtoms(kernel).entries()) {
        const sourceId = sourceIdFor(kernel, atom);
        const claimId = `${lesson.lessonId}:claim-${claims.length + 1}`;
        const sourceNodeId = `${provider}:${sourceId}`;
        if (!sources.has(sourceNodeId)) {
          sources.set(sourceNodeId, {
            id: sourceNodeId,
            sourceId,
            provider,
            title: clean(kernel?.provenance?.title || atom?.anchor?.loc || kernel?.term),
            url: clean(kernel?.provenance?.sourceUrl),
            license: clean(kernel?.license),
            attribution: Array.isArray(kernel?.attribution)
              ? kernel.attribution.map(clean).filter(Boolean)
              : [clean(kernel?.attribution)].filter(Boolean),
            authorityScore: confidence.components.authority,
            currencyScore: confidence.components.currency,
            currency: assessResearchCurrency(kernel, { now }),
          });
        }
        const claim = {
          id: claimId,
          lessonId: lesson.lessonId,
          lessonTitle: lesson.title,
          kernelId: clean(kernel?.id),
          term: clean(kernel?.term),
          type: atom.type,
          text: clean(atom.text),
          passage: clean(atom?.anchor?.quote),
          locator: clean(atom?.anchor?.loc),
          sourceNodeId,
          confidence,
          atomIndex,
        };
        claims.push(claim);
        lessonClaimIds.push(claimId);
        lessonSourceIds.add(sourceNodeId);
        supportEdges.push({
          from: sourceNodeId,
          to: claimId,
          type: 'supports',
          method: clean(kernel?.provenance?.entailment?.method) || 'source-anchor',
        });
      }
    }
    lessonRows.push({
      lessonId: lesson.lessonId,
      title: lesson.title,
      claimIds: lessonClaimIds,
      sourceIds: [...lessonSourceIds],
      minimumClaims: Number(lesson.minimumClaims) || 5,
      minimumSources: Number(lesson.minimumSources) || 2,
      timeSensitive: lesson.timeSensitive === true,
    });
  }

  const conflictEdges = [];
  for (let leftIndex = 0; leftIndex < claims.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < claims.length; rightIndex += 1) {
      const left = claims[leftIndex];
      const right = claims[rightIndex];
      if (left.lessonId !== right.lessonId || left.sourceNodeId === right.sourceNodeId) continue;
      const reason = contradicts(left, right);
      if (!reason) continue;
      conflictEdges.push({
        from: left.id,
        to: right.id,
        type: 'conflicts',
        reason,
        blocking: Math.min(left.confidence.score, right.confidence.score) >= 0.78,
      });
    }
  }

  const lessons = lessonRows.map((lesson) => {
    const lessonClaims = claims.filter((claim) => lesson.claimIds.includes(claim.id));
    const blockingConflicts = conflictEdges.filter(
      (edge) => edge.blocking && (lesson.claimIds.includes(edge.from) || lesson.claimIds.includes(edge.to)),
    );
    const confidence =
      lessonClaims.length > 0
        ? lessonClaims.reduce((total, claim) => total + claim.confidence.score, 0) / lessonClaims.length
        : 0;
    const claimReady = lessonClaims.length >= lesson.minimumClaims;
    const sourceReady = lesson.sourceIds.length >= lesson.minimumSources;
    const status =
      blockingConflicts.length > 0
        ? 'conflict'
        : lesson.timeSensitive && !lesson.sourceIds.some((id) => sources.get(id)?.currency?.status === 'dated-recent')
          ? 'needs-current-evidence'
          : claimReady && sourceReady
            ? 'ready'
            : claimReady && lesson.sourceIds.length > 0
              ? 'usable-single-source'
              : 'insufficient';
    return {
      ...lesson,
      claimCount: lessonClaims.length,
      sourceCount: lesson.sourceIds.length,
      providerCount: new Set(lesson.sourceIds.map((sourceId) => sources.get(sourceId)?.provider).filter(Boolean)).size,
      confidence: Number(confidence.toFixed(3)),
      blockingConflicts: blockingConflicts.length,
      status,
    };
  });

  return {
    protocol: ALGI_EVIDENCE_GRAPH_PROTOCOL,
    createdAt: new Date(now).toISOString(),
    courseName: clean(courseName),
    sources: [...sources.values()],
    claims,
    edges: [...supportEdges, ...conflictEdges],
    conflicts: conflictEdges,
    lessons,
    summary: {
      lessonCount: lessons.length,
      readyLessons: lessons.filter((lesson) => lesson.status === 'ready').length,
      usableLessons: lessons.filter((lesson) => ['ready', 'usable-single-source'].includes(lesson.status)).length,
      sourceCount: sources.size,
      providerCount: new Set([...sources.values()].map((source) => source.provider)).size,
      claimCount: claims.length,
      blockingConflicts: conflictEdges.filter((edge) => edge.blocking).length,
      meanConfidence:
        lessons.length > 0
          ? Number((lessons.reduce((total, lesson) => total + lesson.confidence, 0) / lessons.length).toFixed(3))
          : 0,
    },
  };
}

/**
 * Select a schema-sized, provider-diverse kernel set from admitted evidence.
 * This does not synthesize new facts; it only orders already admitted kernels.
 */
export function consolidateAlgiLessonEvidence({
  topic = '',
  kernels = [],
  evidenceGraph = {},
  want = 5,
  minimum = 3,
} = {}) {
  const lesson = (Array.isArray(evidenceGraph?.lessons) ? evidenceGraph.lessons : []).find(
    (entry) => entry.title === topic,
  );
  if (!lesson || ['conflict', 'needs-current-evidence'].includes(lesson.status)) {
    return {
      admitted: false,
      reason:
        lesson?.status === 'conflict'
          ? 'blocking-evidence-conflict'
          : lesson?.status === 'needs-current-evidence'
            ? 'needs-dated-current-evidence'
            : 'no-evidence-graph-lesson',
      kernels: [],
      lesson,
    };
  }
  const claimsByKernel = new Map();
  for (const claim of Array.isArray(evidenceGraph?.claims) ? evidenceGraph.claims : []) {
    if (claim.lessonId !== lesson.lessonId) continue;
    const list = claimsByKernel.get(claim.kernelId) || [];
    list.push(claim);
    claimsByKernel.set(claim.kernelId, list);
  }
  const ranked = (Array.isArray(kernels) ? kernels : [])
    .map((kernel, index) => {
      const claims = claimsByKernel.get(clean(kernel?.id)) || [];
      const confidence =
        claims.length > 0 ? claims.reduce((total, claim) => total + claim.confidence.score, 0) / claims.length : 0;
      return { kernel, index, provider: providerFor(kernel), confidence };
    })
    .sort((left, right) => right.confidence - left.confidence || left.index - right.index);
  const selected = [];
  const selectedIds = new Set();
  const providers = new Set();
  for (const entry of ranked) {
    if (selected.length >= want) break;
    if (providers.has(entry.provider)) continue;
    selected.push(entry.kernel);
    selectedIds.add(entry.kernel?.id);
    providers.add(entry.provider);
  }
  for (const entry of ranked) {
    if (selected.length >= want) break;
    if (!entry.kernel?.id || selectedIds.has(entry.kernel.id)) continue;
    selected.push(entry.kernel);
    selectedIds.add(entry.kernel.id);
  }
  return {
    admitted: selected.length >= minimum && lesson.claimCount >= lesson.minimumClaims,
    reason:
      selected.length < minimum
        ? 'insufficient-kernels'
        : lesson.claimCount < lesson.minimumClaims
          ? 'insufficient-claims'
          : 'evidence-consolidated',
    kernels: selected,
    lesson,
  };
}

export function summarizeAlgiEvidenceGraph(graph = {}) {
  return {
    protocol: graph?.protocol || ALGI_EVIDENCE_GRAPH_PROTOCOL,
    ...(graph?.summary || {}),
    lessons: (Array.isArray(graph?.lessons) ? graph.lessons : []).map((lesson) => ({
      lessonId: lesson.lessonId,
      title: lesson.title,
      status: lesson.status,
      claimCount: lesson.claimCount,
      sourceCount: lesson.sourceCount,
      providerCount: lesson.providerCount,
      confidence: lesson.confidence,
      blockingConflicts: lesson.blockingConflicts,
    })),
  };
}
