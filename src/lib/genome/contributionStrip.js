/**
 * contributionStrip.js — CurriculumOS V1: the privacy boundary for the Kernel
 * Commons.
 *
 * When a user opts in to contribute a generated kernel back to the genome,
 * ONLY generic disciplinary knowledge may leave the browser. The
 * course-specific layer — scenario, assignment task, discussion localization,
 * instructor facts, anything naming the course or syllabus — is structurally
 * non-contributable. This module is the gate, and it is red-team tested: no
 * course-specific string may survive.
 *
 * Contributions enter as T0 candidates; they only ascend the trust ladder
 * through the same admission gate (anchor + consensus + lint) the foundry uses.
 *
 * See docs/CURRICULUMOS_V1_DESIGN.md §7.2.
 */

import { normalizeConceptKernel, TRUST_TIERS } from './kernelSchema';

function cleanText(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildForbiddenMatcher(courseContext = {}) {
  const needles = [];
  const push = (value) => {
    const text = cleanText(value).toLowerCase();
    if (text.length >= 4) needles.push(text);
  };
  push(courseContext.courseName);
  push(courseContext.instructorName);
  push(courseContext.instructorEmail);
  push(courseContext.termLabel);
  push(courseContext.classLocation);
  push(courseContext.lmsName);
  // Multi-word course-name fragments (so "Smith's Policy Seminar" also blocks "Policy Seminar").
  const courseWords = cleanText(courseContext.courseName)
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word.length >= 5);
  for (const word of courseWords) needles.push(word);
  return (text) => {
    const haystack = cleanText(text).toLowerCase();
    return needles.some((needle) => haystack.includes(needle));
  };
}

/**
 * Strip a generated lesson/concept payload to its contributable core.
 * @param {object} candidate — a concept kernel OR a kernel-projection payload
 * @param {object} courseContext — identifying facts to scrub against
 * @returns {{ kernel, dropped }} — kernel is null if nothing contributable remains
 */
export function stripForContribution(candidate, courseContext = {}) {
  const isForbidden = buildForbiddenMatcher(courseContext);
  const dropped = [];

  // Only these fields are ever eligible. scenario/task/discussion localization
  // and any course identity are dropped wholesale — not even considered.
  const safeText = (value, label) => {
    const text = cleanText(value);
    if (!text) return '';
    if (isForbidden(text)) {
      dropped.push(`forbidden:${label}`);
      return '';
    }
    return text;
  };

  const facts = (candidate?.facts || [])
    .map((fact, index) => {
      const text = safeText(fact?.text ?? fact, `fact[${index}]`);
      if (!text) return null;
      // Anchors may pass through (they reference public sources); local notes never.
      return { text, anchor: fact?.anchor || null, tier: TRUST_TIERS.MODEL };
    })
    .filter(Boolean);

  const keyTerms = candidate?.keyTerms || [];
  const misconceptions = keyTerms
    .map((term, index) => {
      const text = safeText(term?.misconception, `misconception[${index}]`);
      return text ? { text, tier: TRUST_TIERS.MODEL } : null;
    })
    .filter(Boolean);

  const firstTerm = keyTerms[0] || {};
  const definitionText = safeText(firstTerm.definition, 'definition');
  const examples = keyTerms
    .map((term, index) => {
      const text = safeText(term?.example, `example[${index}]`);
      return text ? { text } : null;
    })
    .filter(Boolean);

  // A contribution needs a real term + definition + substance to be worth anything.
  const term = safeText(firstTerm.term, 'term');
  if (!term || !definitionText || (facts.length === 0 && misconceptions.length === 0)) {
    return { kernel: null, dropped: [...dropped, 'insufficient-contributable-substance'] };
  }

  const discipline = cleanText(courseContext.discipline) || 'general';
  const slug = term
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 60);

  const candidateKernel = {
    id: `${discipline}/${slug}`,
    rev: 1,
    term,
    definition: { text: definitionText, anchor: firstTerm.source ? undefined : null, tier: TRUST_TIERS.MODEL },
    facts,
    misconceptions,
    examples,
    // mcBank is NOT contributed in V1 — it is regenerated/verified by the foundry.
    attribution: ['user-contributed (T0 candidate)'],
  };

  const { kernel } = normalizeConceptKernel(candidateKernel);
  return { kernel, dropped };
}

/**
 * Build a contribution candidate envelope for the moderation queue. Dormant
 * without a configured backend — returns the payload the queue would receive.
 */
export function buildContributionCandidate(candidate, courseContext = {}, meta = {}) {
  const { kernel, dropped } = stripForContribution(candidate, courseContext);
  if (!kernel) return null;
  return {
    kind: 'concept-kernel-candidate',
    tier: TRUST_TIERS.MODEL,
    kernel,
    dropped,
    meta: {
      generatedBy: cleanText(meta.provider) || 'unknown',
      modelId: cleanText(meta.modelId) || '',
      submittedAt: new Date().toISOString(),
    },
  };
}
