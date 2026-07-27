import { evaluateClaimEntailment } from './knowledge/claimEntailment.js';

export const ALGI_SCION_HYBRID_PROTOCOL = 'algi-scion-grounded-authoring-v1';

function clean(value = '') {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function anchoredAtoms(kernel = {}) {
  return [kernel.definition, ...(Array.isArray(kernel.facts) ? kernel.facts : [])].filter(
    (entry) => clean(entry?.text) && clean(entry?.anchor?.src) && clean(entry?.anchor?.quote),
  );
}

function kernelHasResearchReceipt(kernel = {}) {
  if (kernel?.provenance?.origin !== 'algi-research') return true;
  return kernel?.provenance?.entailment?.status === 'passed' && Number(kernel.provenance.entailment.checkedClaims) > 0;
}

/**
 * Translate admitted Algi kernels into the exact sourceFacts boundary Scion's
 * current grounded-authoring prompt already understands.
 */
export function buildAlgiScionEvidencePacket({
  courseName = '',
  lesson = {},
  kernels = [],
  minimumFacts = 3,
  maximumFacts = 5,
} = {}) {
  const validKernels = (Array.isArray(kernels) ? kernels : []).filter(
    (kernel) => anchoredAtoms(kernel).length > 0 && kernelHasResearchReceipt(kernel),
  );
  const facts = [];
  const citations = [];
  const seenFacts = new Set();
  const seenSources = new Set();
  for (const kernel of validKernels) {
    for (const atom of anchoredAtoms(kernel)) {
      const text = clean(atom.text);
      const key = text.toLowerCase();
      if (!text || seenFacts.has(key)) continue;
      seenFacts.add(key);
      facts.push(text);
      if (facts.length >= maximumFacts) break;
    }
    const anchor = anchoredAtoms(kernel)[0]?.anchor;
    const sourceKey = `${anchor?.src || ''}|${kernel?.provenance?.sourceUrl || ''}`;
    if (sourceKey && !seenSources.has(sourceKey)) {
      seenSources.add(sourceKey);
      citations.push({
        sourceId: clean(anchor?.src),
        locator: clean(anchor?.loc),
        sourceUrl: clean(kernel?.provenance?.sourceUrl),
        provider: clean(kernel?.provenance?.providerId) || 'shipped-genome',
        license: clean(kernel?.license),
        attribution: Array.isArray(kernel?.attribution)
          ? kernel.attribution.map(clean).filter(Boolean).join('; ')
          : clean(kernel?.attribution),
        supportReceipt: kernel?.provenance?.entailment || {
          status: 'passed',
          checkedClaims: anchoredAtoms(kernel).length,
          minimumScore: 1,
          method: 'verbatim-genome-anchor-v1',
        },
      });
    }
    if (facts.length >= maximumFacts) break;
  }
  const admitted = facts.length >= minimumFacts && citations.length > 0;
  return {
    protocol: ALGI_SCION_HYBRID_PROTOCOL,
    admitted,
    courseName: clean(courseName),
    lessonId: clean(lesson.lessonId),
    lessonTitle: clean(lesson.title),
    sourceFactPolicy: admitted ? 'numbered-source-ledger-v1' : 'unsupported',
    sourceFacts: admitted ? facts.slice(0, maximumFacts) : [],
    sourceConcepts: validKernels
      .map((kernel) => clean(kernel.term))
      .filter(Boolean)
      .slice(0, 5),
    citations,
    reason: admitted ? 'source-ledger-admitted' : 'insufficient-entailed-evidence',
  };
}

/** Bind admitted evidence to the existing Scion prompt; unsupported lessons stay untouched. */
export function bindAlgiEvidenceToScionPrompt(prompt = {}, packets = []) {
  const byLesson = new Map(
    (Array.isArray(packets) ? packets : [])
      .filter((packet) => packet?.admitted && packet?.lessonId)
      .map((packet) => [packet.lessonId, packet]),
  );
  return {
    ...prompt,
    hybridProtocol: ALGI_SCION_HYBRID_PROTOCOL,
    lessons: (Array.isArray(prompt.lessons) ? prompt.lessons : []).map((lesson) => {
      const packet = byLesson.get(lesson?.lessonId);
      if (!packet) return lesson;
      return {
        ...lesson,
        sourceFactPolicy: 'numbered-source-ledger-v1',
        sourceFacts: [...packet.sourceFacts],
        sourceConcepts: [...packet.sourceConcepts],
        sourceLedgerAttribution: {
          title: `Algi evidence ledger for ${packet.lessonTitle}`,
          author: 'EduTool Algi',
          license: [...new Set(packet.citations.map((citation) => citation.license).filter(Boolean))].join('; '),
          url: packet.citations.map((citation) => citation.sourceUrl).find(Boolean) || '',
        },
        algiEvidenceReceipts: packet.citations,
      };
    }),
  };
}

export function planAlgiScionHybridRoute({ lessons = [], packets = [], modelAvailable = true } = {}) {
  const byLesson = new Map(
    (Array.isArray(packets) ? packets : [])
      .filter((packet) => packet?.lessonId)
      .map((packet) => [packet.lessonId, packet]),
  );
  const routes = (Array.isArray(lessons) ? lessons : []).map((lesson) => {
    const packet = byLesson.get(lesson?.lessonId);
    if (!packet?.admitted) {
      return {
        lessonId: clean(lesson?.lessonId),
        route: 'blocked',
        reason: 'no-admitted-evidence',
        modelCallAllowed: false,
      };
    }
    return {
      lessonId: clean(lesson?.lessonId),
      route: modelAvailable ? 'scion-grounded-authoring' : 'algi-compiler-only',
      reason: modelAvailable ? 'entailed-ledger-bound-before-model' : 'model-unavailable',
      modelCallAllowed: Boolean(modelAvailable),
      factCount: packet.sourceFacts.length,
    };
  });
  return {
    protocol: ALGI_SCION_HYBRID_PROTOCOL,
    routes,
    admittedLessons: routes.filter((route) => route.route !== 'blocked').length,
    blockedLessons: routes.filter((route) => route.route === 'blocked').map((route) => route.lessonId),
    // Runtime may batch all admitted lessons in one Scion call. This is a call
    // ceiling, not a fabricated observed count.
    maximumModelCalls: modelAvailable && routes.some((route) => route.modelCallAllowed) ? 1 : 0,
  };
}

/**
 * Candidate admission for the hybrid arm: Scion may author pedagogy around the
 * ledger, but its returned fact list may not add, negate, or mutate knowledge.
 */
export function assessAlgiScionHybridCandidate(candidate = {}, packet = {}) {
  if (!packet?.admitted) return { accepted: false, reason: 'packet-not-admitted', checks: [] };
  const candidateFacts = Array.isArray(candidate?.facts) ? candidate.facts.map(clean).filter(Boolean) : [];
  if (candidateFacts.length !== packet.sourceFacts.length) {
    return { accepted: false, reason: 'fact-count-changed', checks: [] };
  }
  const checks = candidateFacts.map((claim, index) =>
    evaluateClaimEntailment({
      claim,
      passage: packet.sourceFacts[index],
      minimumScore: 1,
    }),
  );
  const accepted = checks.every((check) => check.entailed && check.score === 1);
  return {
    accepted,
    reason: accepted ? 'immutable-ledger-preserved' : 'source-fact-mutated',
    checks,
  };
}
