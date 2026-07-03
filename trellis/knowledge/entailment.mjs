// Claim entailment — roadmap 3.1. AUTHORED-GROUNDED must mean "supported
// by the cited kernel," not merely "cites it." One batched nano call per
// lesson verifies every kernel-referenced claim's actual text against the
// cited concept's kernel facts; unsupported claims downgrade to explicit
// JUDGED-class null refs, disclosed — a citation that fails verification
// must not pose as grounding.

import { callModel } from '../providers.mjs';
import { indexById } from '../graph/schema.mjs';

// Resolve a claim path like "quizItems[2].explanation" or
// "slides[0].bullets[1]" or "plan.segments[0].text" against the authored
// lesson object. Returns null when the path does not resolve to a string.
export function resolveClaimText(art, path) {
  const tokens = String(path)
    .split(/[.[\]]+/)
    .filter(Boolean);
  let node = art;
  for (const token of tokens) {
    if (node == null) return null;
    node = /^\d+$/.test(token) ? node[Number(token)] : node[token];
  }
  return typeof node === 'string' ? node : null;
}

const VERDICTS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['verdicts'],
  properties: {
    verdicts: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['index', 'supported'],
        properties: {
          index: { type: 'integer', minimum: 0 },
          supported: { type: 'boolean' },
        },
      },
    },
  },
};

export async function verifyLessonClaims(
  graph,
  lessonId,
  art,
  { tier = 'nano', ledger = null, budgetUsd = null } = {},
) {
  const concepts = indexById(graph.concepts);
  const checkable = [];
  for (const claim of art.claims ?? []) {
    if (!String(claim.ref ?? '').startsWith('kernel:')) continue;
    const concept = concepts.get(String(claim.ref).slice('kernel:'.length));
    const text = resolveClaimText(art, claim.path);
    if (!concept || !text) continue;
    checkable.push({ claim, text: text.slice(0, 400), facts: concept.kernelFacts.slice(0, 5) });
  }
  if (checkable.length === 0) return { checked: 0, downgraded: 0 };

  const { result } = await callModel({
    tier,
    stage: 'entailment',
    ledger,
    budgetUsd,
    schema: VERDICTS_SCHEMA,
    schemaName: 'claim_verdicts',
    validate: (parsed) => (Array.isArray(parsed?.verdicts) ? [] : ['verdicts must be an array']),
    maxOutputTokens: 2000,
    system:
      'You verify citations. For each numbered claim, answer whether the claim text is SUPPORTED by (consistent with and grounded in) the cited facts. ' +
      'supported=false when the claim contradicts the facts or asserts something the facts do not cover. Judge support, not writing quality.',
    user: JSON.stringify(
      checkable.map((c, index) => ({ index, claim: c.text, citedFacts: c.facts })),
      null,
      1,
    ),
  });

  let downgraded = 0;
  for (const verdict of result.verdicts) {
    const entry = checkable[verdict.index];
    if (!entry || verdict.supported) continue;
    entry.claim.ref = null; // unsupported citation → explicit JUDGED class
    downgraded += 1;
  }
  return { checked: checkable.length, downgraded };
}

export async function verifyAllClaims(graph, authored, options) {
  let checked = 0;
  let downgraded = 0;
  const ids = graph.lessons.map((lesson) => lesson.id).filter((id) => authored[id]);
  const batch = 6;
  for (let i = 0; i < ids.length; i += batch) {
    const results = await Promise.allSettled(
      ids.slice(i, i + batch).map((id) => verifyLessonClaims(graph, id, authored[id], options)),
    );
    for (const r of results) {
      if (r.status === 'fulfilled') {
        checked += r.value.checked;
        downgraded += r.value.downgraded;
      }
    }
  }
  return { checked, downgraded };
}
