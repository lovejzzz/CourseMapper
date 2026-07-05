// The Researcher — Shape + Verify (RESEARCHER.md §3.3-3.4).
// A model transforms SOURCE TEXT (in context) into kernel facts,
// misconceptions, move-assets and items. RS-1: every fact carries a
// sourceQuote that must appear in the fetched text — span-anchoring is
// checked HERE, deterministically; unverifiable facts are dropped and
// counted. RS-3: assets pass the same gates as harvest/gapfill.

import { callModel } from '../providers.mjs';
import { claimTokens, gapItemRejection, gapfillId } from '../knowledge/bankGapFill.mjs';
import { solveGate } from '../composer/solver.mjs';
import { sGenerate } from '../tendril/sModel.mjs';
import { TERMINAL_PUNCT_RE, weightedLength } from '../voice/contracts.mjs';

const norm = (s) =>
  String(s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

// Span anchor: the quote (normalized) must appear inside one of the
// sources; returns the source it anchors to, or null.
export function anchorQuote(quote, sources) {
  const q = norm(quote);
  if (q.length < 25) return null; // too short to be a meaningful span
  return sources.find((s) => norm(s.text).includes(q)) ?? null;
}

const KERNEL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['definition', 'facts', 'misconceptions', 'workedExample'],
  properties: {
    definition: { type: 'string' },
    facts: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['text', 'quote'],
        properties: { text: { type: 'string' }, quote: { type: 'string' } },
      },
    },
    misconceptions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['text', 'corrective'],
        properties: { text: { type: 'string' }, corrective: { type: 'string' } },
      },
    },
    workedExample: { type: 'string' },
  },
};

export async function shapeKernel(target, sources, { ledger, budgetUsd }) {
  const { result } = await callModel({
    tier: 'ds',
    stage: 'research-kernel',
    ledger,
    budgetUsd,
    schema: KERNEL_SCHEMA,
    schemaName: 'research_kernel',
    maxOutputTokens: 3000,
    validate: (out) => (Array.isArray(out?.facts) && out.facts.length >= 3 ? [] : ['need ≥3 facts']),
    system:
      'You extract TEACHING KNOWLEDGE strictly from the provided source texts. Return: a one-sentence definition; 4-6 kernel facts, each with a "quote" field containing a VERBATIM span (10-30 words, copied exactly) from the sources that supports it; 2-3 misconceptions students hold about this topic, each phrased "Students ..." with a one-sentence corrective; one short worked example (4-7 sentences) walking through a concrete case, grounded in the sources. Never state anything the sources do not support.',
    user: JSON.stringify({
      term: target.term,
      discipline: target.discipline,
      sources: sources.map((s) => ({ title: s.title, text: s.text })),
    }),
  });

  const facts = [];
  let droppedFacts = 0;
  for (const fact of result.facts) {
    const src = anchorQuote(fact.quote, sources);
    if (!src) {
      droppedFacts += 1;
      continue;
    }
    facts.push({
      text: fact.text,
      anchor: { src: src.url, loc: 'extract', quote: fact.quote },
      tier: 2,
      verifiedBy: 0,
      contested: false,
    });
  }
  const misconceptions = (result.misconceptions ?? [])
    .filter(
      (m) =>
        typeof m.text === 'string' &&
        m.text.length >= 20 &&
        typeof m.corrective === 'string' &&
        m.corrective.length >= 20,
    )
    .slice(0, 3);
  const ok = facts.length >= 3 && misconceptions.length >= 2;
  return {
    ok,
    definition: result.definition,
    facts,
    misconceptions,
    workedExample: result.workedExample,
    droppedFacts,
  };
}

const SURFACES_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['teach', 'teachQuote', 'worked', 'reteach', 'guide', 'discussion', 'assignment', 'faqs', 'slides'],
  properties: {
    teach: { type: 'string' },
    teachQuote: { type: 'string' },
    worked: { type: 'string' },
    reteach: { type: 'string' },
    guide: { type: 'string' },
    discussion: {
      type: 'object',
      additionalProperties: false,
      required: ['prompt', 'tension', 'followUps'],
      properties: {
        prompt: { type: 'string' },
        tension: { type: 'string' },
        followUps: { type: 'array', items: { type: 'string' } },
      },
    },
    assignment: {
      type: 'object',
      additionalProperties: false,
      required: ['task', 'steps', 'rubricBands'],
      properties: {
        task: { type: 'string' },
        steps: { type: 'array', items: { type: 'string' } },
        rubricBands: { type: 'array', items: { type: 'string' } },
      },
    },
    faqs: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['q', 'a'],
        properties: { q: { type: 'string' }, a: { type: 'string' } },
      },
    },
    slides: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'bullets', 'speakerNotes', 'altText'],
        properties: {
          title: { type: 'string' },
          bullets: { type: 'array', items: { type: 'string' } },
          speakerNotes: { type: 'string' },
          altText: { type: 'string' },
        },
      },
    },
  },
};

function segmentOk(text, { requireExample = false, min = 60 } = {}) {
  if (typeof text !== 'string' || weightedLength(text) < min) return false;
  if (!TERMINAL_PUNCT_RE.test(text.trim())) return false;
  if (text.includes('```')) return false;
  if (requireExample && !/example|walk|work(ed|ing)? through|demo|trace/i.test(text)) return false;
  return true;
}

// One call → every prose surface a composed lesson needs, gated like the
// harvest (RS-3). Returns { assets: [...], rejected: {surface: reason} }.
export async function shapeSurfaces(target, sources, kernel, { ledger, budgetUsd }) {
  const { result } = await callModel({
    tier: 'ds',
    stage: 'research-surfaces',
    ledger,
    budgetUsd,
    schema: SURFACES_SCHEMA,
    schemaName: 'research_surfaces',
    maxOutputTokens: 6000,
    validate: (out) => (typeof out?.teach === 'string' ? [] : ['surfaces object required']),
    system:
      'You are a course author writing ORIGINAL teaching prose grounded ONLY in the provided sources (paraphrase; do not copy sentences except the teachQuote). Write for a university lesson on the given term: ' +
      'teach — a 120-220 word teaching segment introducing the concept with one concrete example, ending with terminal punctuation; teachQuote — one VERBATIM 10-25 word span copied exactly from the sources that the teach segment is grounded in; ' +
      'worked — a 100-200 word worked example that says "worked example" and walks step by step through one concrete case; ' +
      'reteach — an 80-160 word reteach script that re-explains via a DIFFERENT example for students who missed it (must contain the word "example"); ' +
      'guide — a 200-350 word study-guide section that MUST contain the phrase "If you missed the reading" with a catch-up path, key terms, and 2 self-check prompts; ' +
      'discussion — {prompt (a genuine open tension question, 20-60 words), tension (1-2 sentences naming the tension), followUps (2 shorter probing questions)}; ' +
      'assignment — {task (60-140 words), steps (3-5), rubricBands (exactly 3: excellent/adequate/insufficient, one sentence each)}; ' +
      'faqs — exactly 2 {q, a} students actually ask (answers 30-90 words); ' +
      'slides — 7-9 {title, bullets(2-4, each ≤18 words, each a complete sentence ending with a period), speakerNotes (2-3 spoken sentences for the instructor), altText (one sentence describing a suitable visual)} covering the lesson arc. No code fences anywhere.',
    user: JSON.stringify({
      term: target.term,
      discipline: target.discipline,
      definition: kernel?.definition,
      misconceptions: (kernel?.misconceptions ?? []).map((m) => m.text),
      sources: sources.map((s) => ({ title: s.title, text: s.text.slice(0, 6000) })),
    }),
  });

  const provenance = {
    origin: 'researcher',
    sources: sources.map((s) => ({ url: s.url, license: s.license, attribution: s.attribution })),
    date: new Date().toISOString().slice(0, 10),
  };
  const anchored = anchorQuote(result.teachQuote, sources);
  const rejected = {};
  const assets = [];
  const push = (move, body) => {
    assets.push({
      id: `researcher:${move}:${target.id}:${assets.length}`,
      kernelId: target.id,
      conceptName: target.term,
      move,
      body,
      evidence: { fromGrade: null, sourced: true, teachQuote: anchored ? result.teachQuote : null },
      provenance,
      exposure: { uses: 0 },
      voice: 'sourced',
    });
  };

  if (!anchored) rejected.teach = 'teachQuote failed span-anchoring (RS-1)';
  else if (!segmentOk(result.teach)) rejected.teach = 'segment gate';
  else push('teach-segment', { minutes: 12, text: result.teach });

  if (segmentOk(result.worked, { requireExample: true })) push('worked-example', { minutes: 15, text: result.worked });
  else rejected.worked = 'segment gate';
  if (segmentOk(result.reteach, { requireExample: true }))
    push('reteach-script', { minutes: 10, text: result.reteach });
  else rejected.reteach = 'segment gate';

  if (
    typeof result.guide === 'string' &&
    weightedLength(result.guide) >= 300 &&
    /missed the reading|if you (skipped|missed)/i.test(result.guide) &&
    !result.guide.includes('```')
  )
    push('guide', { markdown: result.guide });
  else rejected.guide = 'guide gate';

  if (result.discussion?.prompt && weightedLength(result.discussion.prompt) >= 40)
    push('discussion-tension', result.discussion);
  else rejected.discussion = 'prompt too short';

  if (result.assignment?.task && (result.assignment.rubricBands ?? []).length >= 3) push('activity', result.assignment);
  else rejected.assignment = 'rubric bands';

  for (const faq of (result.faqs ?? []).slice(0, 2)) {
    if (weightedLength(faq?.a ?? '') >= 30) push('faq-entry', faq);
  }
  if (Array.isArray(result.slides) && result.slides.length >= 6 && !JSON.stringify(result.slides).includes('```')) {
    // Contract parity: every bullet is a complete statement with terminal
    // punctuation — normalize mechanically (metadata-class, content
    // unchanged) rather than reject a whole deck for a missing period.
    const slides = result.slides.map((slide) => ({
      title: slide.title,
      bullets: (slide.bullets ?? []).map((b) =>
        TERMINAL_PUNCT_RE.test(String(b).trim()) ? String(b).trim() : `${String(b).trim()}.`,
      ),
      speakerNotes: slide.speakerNotes,
      altText: slide.altText,
    }));
    push('slide-group', { slides });
  } else rejected.slides = 'slide gate';

  return { assets, rejected };
}

const ITEMS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['items'],
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['stem', 'options', 'correctIndex', 'explanation', 'bloom', 'difficulty'],
        properties: {
          stem: { type: 'string' },
          options: { type: 'array', items: { type: 'string' } },
          correctIndex: { type: 'integer', minimum: 0, maximum: 3 },
          explanation: { type: 'string' },
          bloom: { type: 'string', enum: ['remember', 'understand', 'apply', 'analyze', 'evaluate', 'create'] },
          difficulty: { type: 'string', enum: ['recall', 'apply', 'transfer'] },
        },
      },
    },
  },
};

// The paid item author (DeepSeek), structured-output tooling.
async function authorItemsDs(target, kernel, cells, { ledger, budgetUsd }) {
  const { result } = await callModel({
    tier: 'ds',
    stage: 'research-items',
    ledger,
    budgetUsd,
    schema: ITEMS_SCHEMA,
    schemaName: 'research_items',
    maxOutputTokens: 4000,
    validate: (out) => (Array.isArray(out?.items) && out.items.length >= 2 ? [] : ['need ≥2 items']),
    system:
      'Author 3 multiple-choice items for the given term, grounded in the kernel facts. Items 1-2 each confront one given wrongBelief: one wrong option states that belief with its wrong reasoning and MUST contain at least TWO of its mustIncludeTwoOf words verbatim; the explanation confronts the corrective and MUST contain at least HALF of the explanationMustIncludeHalfOf words verbatim, 2-4 sentences under 80 words. Item 3 is a straight application item. All: application-level stem ending with terminal punctuation, 4 distinct options under 15 words, no code fences.',
    user: JSON.stringify({
      term: target.term,
      facts: kernel.facts.map((f) => f.text),
      wrongBeliefs: cells,
    }),
  });
  return result.items ?? [];
}

// The local item author (Gemma 4 E2B, zero-shot via mlx-vlm; plan v0.2 A1).
// No structured-output tooling — raw JSON array, parsed defensively. Prompt
// is the winning item-probe format (26/30 vs the paid author's 22/30 on the
// same gates, at $0). Same gate stack downstream, so failures ship nothing.
// Balanced-brace extraction of a JSON array of objects. Robust to the
// small-model output noise that a whole-array JSON.parse chokes on:
// ```json fences, doubled closing braces between elements (E2B's habit),
// and trailing commas. Each top-level {...} is sliced on balanced depth
// (string-aware) and parsed alone; a bad object drops itself, not the batch.
export function parseItemArray(text) {
  const s = String(text ?? '');
  const start = s.indexOf('[');
  if (start < 0) return [];
  const items = [];
  let depth = 0;
  let objStart = -1;
  let inStr = false;
  let esc = false;
  for (let i = start; i < s.length; i += 1) {
    const ch = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') {
      inStr = true;
      continue;
    }
    if (ch === '{') {
      if (depth === 0) objStart = i;
      depth += 1;
    } else if (ch === '}') {
      depth -= 1;
      if (depth === 0 && objStart >= 0) {
        try {
          items.push(JSON.parse(s.slice(objStart, i + 1)));
        } catch {
          /* skip the malformed object, keep the rest */
        }
        objStart = -1;
      } else if (depth < 0) {
        depth = 0; // absorb a stray extra closing brace
      }
    }
  }
  return items;
}

export async function authorItemsE2B(target, kernel, cells) {
  const beliefs = cells.map((c, n) => ({
    n: n + 1,
    wrongBelief: c.statement,
    mustIncludeTwoOf: c.mustIncludeTwoOf,
    corrective: c.corrective,
    explanationMustIncludeHalfOf: c.explanationMustIncludeHalfOf,
  }));
  const system =
    'Author exactly 3 multiple-choice items as a JSON array. Each item: {"stem","options"(4 distinct strings under 15 words),"correctIndex"(0-3),"explanation"(2-4 sentences under 80 words),"bloom":"apply","difficulty":"apply"}. ' +
    `Items 1-2 each confront one wrongBelief (given): that item's wrong option states the belief with its wrong reasoning and includes at least TWO of its mustIncludeTwoOf words verbatim; that item's explanation confronts the corrective and includes at least HALF of its explanationMustIncludeHalfOf words verbatim. Item 3 is a straight application item. Every stem is application-level and ends with terminal punctuation. Output ONLY the JSON array.`;
  const user = JSON.stringify({
    term: target.term,
    facts: kernel.facts.map((f) => f.text),
    wrongBeliefs: beliefs,
  });
  let text;
  try {
    text = await sGenerate({ system, user, task: 'items', maxTokens: 1600 });
  } catch {
    return [];
  }
  return parseItemArray(text);
}

// 3 items per kernel, one per misconception + one straight application —
// the full gate stack (gapItemRejection + blind solver seat). The author is
// routed: 'ds' (paid, default) or 'e2b' (local Gemma 4, RESEARCH_ITEMS=e2b).
// Both feed the identical gate loop, so the routing cannot change what ships.
export async function shapeItems(
  target,
  kernel,
  shelf,
  { ledger, budgetUsd, author = process.env.RESEARCH_ITEMS ?? 'ds' },
) {
  const cells = kernel.misconceptions.slice(0, 2).map((m) => ({
    statement: m.text,
    corrective: m.corrective,
    mustIncludeTwoOf: claimTokens(m.text),
    explanationMustIncludeHalfOf: claimTokens(m.corrective),
  }));
  const items =
    author === 'e2b'
      ? await authorItemsE2B(target, kernel, cells)
      : await authorItemsDs(target, kernel, cells, { ledger, budgetUsd });

  const accepted = [];
  const rejections = {};
  for (const [i, item] of items.entries()) {
    const cell = cells[Math.min(i, cells.length - 1)];
    const gateCell = {
      kernelId: target.id,
      family: cell.statement,
      statement: cell.statement,
      corrective: cell.corrective,
      term: target.term,
    };
    const reason = i < 2 ? gapItemRejection(gateCell, item, shelf) : null;
    if (reason) {
      rejections[reason] = (rejections[reason] ?? 0) + 1;
      continue;
    }
    const verdict = await solveGate(item, { ledger, budgetUsd });
    if (!verdict.ok) {
      rejections[`solver`] = (rejections.solver ?? 0) + 1;
      continue;
    }
    accepted.push({
      id: gapfillId(target.id, cell.statement, item.stem),
      kernelId: target.id,
      conceptName: target.term,
      stem: item.stem,
      options: item.options,
      correctIndex: item.correctIndex,
      explanation: item.explanation,
      bloom: item.bloom,
      difficulty: item.difficulty,
      catches: i < 2,
      confronts: i < 2,
      familyKey:
        i < 2
          ? cell.statement
              .toLowerCase()
              .replace(/[^a-z0-9\s]/g, ' ')
              .replace(/\s+/g, ' ')
              .trim()
              .slice(0, 60)
          : null,
      provenance: { origin: 'researcher', model: author, grade: null, date: new Date().toISOString().slice(0, 10) },
    });
  }
  return { accepted, rejections };
}
