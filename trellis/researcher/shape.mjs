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

// The paid item author (any callModel tier — ds default; 'cheap' =
// gpt-5.4-mini for the cross-family showdown), structured-output tooling.
export async function authorItemsPaid(target, kernel, cells, { ledger, budgetUsd, tier = 'ds' }) {
  const { result } = await callModel({
    tier,
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

// E2B item-author prompts. v1 (original, DEPLOYED) ties ds on diverse kernels
// but trails on lexically-dense ones (A1: rhyme-scheme 0/3) via META stems
// ("how does THE TEXT correct this belief?") and VAGUE stems the solver can't
// answer. v2 forbids document-referential framing and demands concrete stems —
// but the A/B REJECTED it (itemPromptABBench): dense 10→4 (−6), diverse 9→10
// (+1). Piling rules onto a 4B prompt made the dense case WORSE, not better;
// v2 is kept only as the recorded negative. Level 7 (win-everywhere) is not a
// prompt problem — it needs preference data, not more instructions. Default v1.
const E2B_ITEM_PROMPTS = {
  v1:
    'Author exactly 3 multiple-choice items as a JSON array. Each item: {"stem","options"(4 distinct strings under 15 words),"correctIndex"(0-3),"explanation"(2-4 sentences under 80 words),"bloom":"apply","difficulty":"apply"}. ' +
    `Items 1-2 each confront one wrongBelief (given): that item's wrong option states the belief with its wrong reasoning and includes at least TWO of its mustIncludeTwoOf words verbatim; that item's explanation confronts the corrective and includes at least HALF of its explanationMustIncludeHalfOf words verbatim. Item 3 is a straight application item. Every stem is application-level and ends with terminal punctuation. Output ONLY the JSON array.`,
  v2:
    'Author exactly 3 multiple-choice items as a JSON array. Each item: {"stem","options"(4 distinct strings under 15 words),"correctIndex"(0-3),"explanation"(2-4 sentences under 80 words),"bloom":"apply","difficulty":"apply"}. ' +
    'RULE A — every stem describes a CONCRETE situation, example, or task and asks what is true or what to do; it must be answerable from the concept ALONE by someone who never saw any source. NEVER write a stem that refers to "the text", "the passage", "the reading", "the author", "the description", or "this belief" — test the idea, not a document. ' +
    'RULE B — items 1-2 each target one wrongBelief (given): one WRONG option states that belief with its faulty reasoning and includes at least TWO of its mustIncludeTwoOf words verbatim; the correct option applies the corrective; the explanation says why the belief fails and includes at least HALF of the explanationMustIncludeHalfOf words verbatim. ' +
    'RULE C — item 3 is a straight application item. RULE D — exactly ONE option is defensibly correct and the other three are clearly wrong to someone who knows the concept. Every stem ends with terminal punctuation. Output ONLY the JSON array.',
};

// Discipline GENRE lines (hard-set experiment): v1 with its one genre
// sentence swapped per course family — same rule budget, different stem
// world. The L5 lesson stands (adding rules hurts); this SWAPS, never adds.
const GENRE_LINES = {
  math: 'Every stem gives small concrete numbers, a small matrix, or a short expression and asks the student to compute or diagnose a result; wrong options are the answers the DOCUMENTED wrong procedures would produce.',
  lang: 'Every stem gives a short real-life situation (who is speaking, to whom, about what) and asks which form or sentence the speaker should use; wrong options are forms a learner actually produces.',
  history:
    'Every stem describes a concrete event, law, or source from the period and asks what it shows or why it happened; wrong options are documented misreadings of that evidence.',
  default: 'Every stem is application-level',
};

export function disciplinePrompt(discipline) {
  const genre = GENRE_LINES[discipline] ?? GENRE_LINES.default;
  return E2B_ITEM_PROMPTS.v1.replace('Every stem is application-level', genre);
}

export async function authorItemsE2B(
  target,
  kernel,
  cells,
  { variant = process.env.RESEARCH_ITEM_PROMPT ?? 'v1', temperature = 0, exemplar = null, system = null } = {},
) {
  const beliefs = cells.map((c, n) => ({
    n: n + 1,
    wrongBelief: c.statement,
    mustIncludeTwoOf: c.mustIncludeTwoOf,
    corrective: c.corrective,
    explanationMustIncludeHalfOf: c.explanationMustIncludeHalfOf,
  }));
  const systemPrompt = system ?? E2B_ITEM_PROMPTS[variant] ?? E2B_ITEM_PROMPTS.v1;
  const user = JSON.stringify({
    term: target.term,
    facts: kernel.facts.map((f) => f.text),
    wrongBeliefs: beliefs,
    // Exemplar ≠ more rules (the L5 negative): a concrete model answer is the
    // mechanism that already won for paid authoring in v0.1.6. One only.
    ...(exemplar ? { exampleOfAcceptedItem: exemplar } : {}),
  });
  let text;
  try {
    text = await sGenerate({ system: systemPrompt, user, task: 'items', maxTokens: 1600, temperature });
  } catch {
    return [];
  }
  return parseItemArray(text);
}

// One feedback-directed resample of a single failed catcher slot (shared by
// the retry and MAX harnesses): the model sees the gate's own reason.
async function resampleSlot(target, cell, item, reason, { temperature = 0 } = {}) {
  const system =
    'Rewrite ONE multiple-choice item as a single JSON object {"stem","options"(4 distinct strings under 15 words),"correctIndex"(0-3),"explanation"(2-4 sentences under 80 words),"bloom":"apply","difficulty":"apply"}. ' +
    `Your previous item FAILED an automatic gate with reason "${reason}". Fix exactly that: one wrong option must state the wrongBelief with its faulty reasoning and include at least TWO of these words verbatim: ${JSON.stringify(cell.mustIncludeTwoOf)}; the explanation must confront the corrective and include at least HALF of these words verbatim: ${JSON.stringify(cell.explanationMustIncludeHalfOf)}. Keep the stem a concrete application question ending with terminal punctuation. Output ONLY the JSON object.`;
  const user = JSON.stringify({
    term: target.term,
    wrongBelief: cell.statement,
    corrective: cell.corrective,
    previousItem: {
      stem: item?.stem,
      options: item?.options,
      correctIndex: item?.correctIndex,
      explanation: item?.explanation,
    },
  });
  try {
    const text = await sGenerate({ system, user, task: 'items', maxTokens: 900, temperature });
    const [fixed] = parseItemArray(
      `[${String(text)
        .replace(/^[^{]*/, '')
        .replace(/[^}]*$/, '')}]`,
    );
    return fixed?.stem ? { bloom: 'apply', difficulty: 'apply', ...fixed } : null;
  } catch {
    return null;
  }
}

// Level-7 lever: feedback-directed RESAMPLE (test-time compute, still $0).
// More prompt rules made dense kernels WORSE (the L5 negative) — but a retry
// that quotes the gate's own rejection reason is a different mechanism: the
// model sees exactly which contract line its concrete item broke. One retry
// per failed catcher cell, then the identical gate stack decides again.
export async function authorItemsE2BRetry(target, kernel, cells, shelf, { variant } = {}) {
  const first = await authorItemsE2B(target, kernel, cells, { variant });
  const failures = [];
  for (const [i, item] of first.slice(0, 2).entries()) {
    const cell = cells[Math.min(i, cells.length - 1)];
    const gateCell = {
      kernelId: target.id,
      family: cell.statement,
      statement: cell.statement,
      corrective: cell.corrective,
      term: target.term,
    };
    const reason = gapItemRejection(gateCell, item, shelf);
    if (reason) failures.push({ i, item, reason, cell });
  }
  if (failures.length === 0 || first.length === 0) return first;
  const items = [...first];
  for (const { i, item, reason, cell } of failures) {
    const fixed = await resampleSlot(target, cell, item, reason);
    if (fixed) items[i] = fixed;
  }
  return items;
}

// E2B-MAX — the maximally customized $0 harness (the "beat the paid authors"
// configuration). The model is FIXED; the levels live in the harness:
//   1. THREE candidate sets: greedy + two temperature samples, exemplar-guided
//      when the shelf has an accepted catching item (one example, not rules).
//   2. PER-SLOT argmax: each catcher slot takes the first candidate that
//      passes the deterministic gate; the application slot takes the first
//      well-formed candidate (the blind solver remains its only judge).
//   3. FEEDBACK RESAMPLE on any slot still failing, quoting the gate's reason.
// Everything above is local and $0; the blind cross-family solver still
// verifies every item downstream, so the harness cannot ship anything a paid
// pipeline wouldn't.
// Hard-set verdict (July 6, 9 unseen kernels + identical-prompt control):
// noise floor ±1/kernel; history's evidence-genre prompt won +3 (proper-noun
// beliefs FEED the catch gate) while math's computed-result genre LOST −2
// (numeric distractors starve it). Adoption is per-discipline, ruler-decided:
const ADOPTED_GENRES = new Set(['history']);

export async function authorItemsE2BMax(
  target,
  kernel,
  cells,
  shelf,
  { variant, adaptive = true, system = null } = {},
) {
  if (!system && ADOPTED_GENRES.has(String(target.id ?? '').split('/')[0])) {
    system = disciplinePrompt(String(target.id).split('/')[0]);
  }
  const gateFor = (cell) => ({
    kernelId: target.id,
    family: cell.statement,
    statement: cell.statement,
    corrective: cell.corrective,
    term: target.term,
  });
  // ADAPTIVE (v2, the run-2 lesson): the candidates+exemplar machinery WON
  // the hard kernels (dense 10v7, rhyme-scheme 0/3×5 → 2/3) but ADDED NOISE
  // on easy ones (cs/variables 3 → 1). So: greedy first — if the gate passes
  // both catcher slots, stop. Escalate to sampling + exemplar + resample
  // ONLY where the gate says greedy failed. Compute goes where failure is.
  const greedy = await authorItemsE2B(target, kernel, cells, { variant, system });
  const greedyFail = [0, 1].filter((i) => {
    const cell = cells[Math.min(i, cells.length - 1)];
    return !greedy[i]?.stem || gapItemRejection(gateFor(cell), greedy[i], shelf ?? []);
  });
  if (adaptive && greedyFail.length === 0 && greedy[2]?.stem)
    return maybeSelfSolve(greedy, target, cells, shelf, gateFor);

  const exemplarSource = (shelf ?? []).find((s) => s.catches && typeof s.stem === 'string');
  const exemplar = exemplarSource
    ? (({ stem, options, correctIndex, explanation }) => ({ stem, options, correctIndex, explanation }))(exemplarSource)
    : null;
  const candidates = [greedy];
  for (const temperature of [0.7, 0.9]) {
    candidates.push(await authorItemsE2B(target, kernel, cells, { variant, temperature, exemplar, system }));
  }
  const items = [];
  // catcher slots 0-1: first gate-passing candidate wins.
  for (const i of [0, 1]) {
    const cell = cells[Math.min(i, cells.length - 1)];
    let chosen = null;
    let firstFailure = null;
    for (const set of candidates) {
      const candidate = set[i];
      if (!candidate?.stem) continue;
      const reason = gapItemRejection(gateFor(cell), candidate, shelf ?? []);
      if (!reason) {
        chosen = candidate;
        break;
      }
      if (!firstFailure) firstFailure = { candidate, reason };
    }
    if (!chosen && firstFailure) {
      chosen =
        (await resampleSlot(target, cell, firstFailure.candidate, firstFailure.reason, { temperature: 0.7 })) ??
        firstFailure.candidate;
    }
    if (chosen) items[i] = chosen;
  }
  // application slot 2: first well-formed candidate; the solver decides.
  for (const set of candidates) {
    if (set[2]?.stem) {
      items[2] = set[2];
      break;
    }
  }
  return maybeSelfSolve(items.filter(Boolean), target, cells, shelf, gateFor);
}

// Self-solve verdict (run 5): solver rejects 4 (bar ≤3, baselines 6/4) and
// acceptance 17 (floor 18) — NO HARM, NO PROVEN GAIN. Ship-only-if-better
// applies to our own levers too: default OFF, opt-in via SELF_SOLVE=1,
// replicate queued before any adoption call.
async function maybeSelfSolve(items, target, cells, shelf, gateFor) {
  if (process.env.SELF_SOLVE !== '1') return items;
  return selfSolvePass(items, target, cells, shelf, gateFor);
}

// Letter parser for the self-solve check — exported for the regression test.
export function parseSolveLetter(text) {
  const m = String(text ?? '')
    .toUpperCase()
    .match(/\b([ABCD])\b/);
  return m ? ['A', 'B', 'C', 'D'].indexOf(m[1]) : null;
}

// SELF-SOLVE CHECK: the wrong-key class (e2b solver rejects: 6 then 4 in the
// stability runs) is terminal today — the paid solver catches it, money spent,
// item dead. But E2B can answer its own item BLIND first: present stem+options
// with no key; if its answer disagrees with its own correctIndex, the key is
// suspect — rewrite once, keep the fix only if it now self-solves (and, for
// catcher slots, still passes the gate). All local, $0; the paid solver stays
// the final judge, this just stops known-bad items from reaching it.
export async function selfSolveIndex(item) {
  const letters = ['A', 'B', 'C', 'D'];
  const system =
    'Answer the multiple-choice question. Reply with ONLY the single letter A, B, C, or D of the correct option.';
  const user = `${item.stem}\n${item.options.map((o, i) => `${letters[i]}. ${o}`).join('\n')}`;
  try {
    const text = await sGenerate({ system, user, task: 'items', maxTokens: 8 });
    return parseSolveLetter(text);
  } catch {
    return null; // inconclusive — never blocks; the solver decides
  }
}

async function selfSolvePass(items, target, cells, shelf, gateFor) {
  for (const [i, item] of items.entries()) {
    if (!item?.stem || !Array.isArray(item.options)) continue;
    const solved = await selfSolveIndex(item);
    if (solved === null || solved === item.correctIndex) continue;
    // Key suspect: one rewrite quoting the disagreement.
    const cell = cells[Math.min(i, cells.length - 1)];
    const system =
      'Rewrite ONE multiple-choice item as a single JSON object {"stem","options"(4 distinct strings under 15 words),"correctIndex"(0-3),"explanation"(2-4 sentences under 80 words),"bloom":"apply","difficulty":"apply"}. ' +
      `PROBLEM: answering your item blind selects option ${'ABCD'[solved]}, not the key — either the key is wrong or two options are defensible. Rewrite so EXACTLY ONE option is defensibly correct and it is the keyed one.` +
      (i < 2
        ? ` Keep the catcher contract: one wrong option states the wrongBelief with its reasoning and includes at least TWO of ${JSON.stringify(cell.mustIncludeTwoOf)} verbatim; the explanation confronts the corrective with at least HALF of ${JSON.stringify(cell.explanationMustIncludeHalfOf)} verbatim.`
        : '') +
      ' Output ONLY the JSON object.';
    const user = JSON.stringify({
      term: target.term,
      wrongBelief: i < 2 ? cell.statement : undefined,
      previousItem: {
        stem: item.stem,
        options: item.options,
        correctIndex: item.correctIndex,
        explanation: item.explanation,
      },
    });
    try {
      const text = await sGenerate({ system, user, task: 'items', maxTokens: 900, temperature: 0.7 });
      const [fixed] = parseItemArray(
        `[${String(text)
          .replace(/^[^{]*/, '')
          .replace(/[^}]*$/, '')}]`,
      );
      if (!fixed?.stem) continue;
      const candidate = { bloom: 'apply', difficulty: 'apply', ...fixed };
      if (i < 2 && gapItemRejection(gateFor(cell), candidate, shelf ?? [])) continue; // fix broke the gate — keep original
      const reSolved = await selfSolveIndex(candidate);
      if (reSolved !== null && reSolved === candidate.correctIndex) items[i] = candidate;
      // else: original stands; the blind solver remains the judge of record.
    } catch {
      /* best-effort; never blocks */
    }
  }
  return items;
}

// 3 items per kernel, one per misconception + one straight application —
// the full gate stack (gapItemRejection + blind solver seat). The author is
// routed: 'ds' (paid, default) or 'e2b' (local Gemma 4, RESEARCH_ITEMS=e2b).
// Both feed the identical gate loop, so the routing cannot change what ships.
// Per-kernel author routing (the org-chart answer, 4th application): the
// registry lists ONLY measured blind spots (e2b ≤3/9 AND ds ≥7/9 pooled over
// three same-protocol runs). Everything else stays local. Routing to a paid
// author is disclosed in provenance; the gate stack is identical either way.
let AUTHOR_REGISTRY = null;
export async function authorRouteFor(kernelId) {
  if (!AUTHOR_REGISTRY) {
    try {
      const { readFile } = await import('node:fs/promises');
      AUTHOR_REGISTRY = JSON.parse(await readFile('trellis/researcher/author-registry.json', 'utf8')).registry ?? {};
    } catch {
      AUTHOR_REGISTRY = {};
    }
  }
  return AUTHOR_REGISTRY[kernelId]?.route ?? null;
}

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
  // Blind-spot routing: an e2b request on a registry kernel goes to the paid
  // author when a ledger is available (cents, disclosed via provenance).
  let effectiveAuthor = author;
  if (author === 'e2b' && ledger && (await authorRouteFor(target.id)) === 'ds') effectiveAuthor = 'ds';
  const items =
    effectiveAuthor === 'e2b'
      ? await authorItemsE2BMax(target, kernel, cells, shelf) // adaptive harness = the deployed e2b config (15→16→18)
      : await authorItemsPaid(target, kernel, cells, {
          ledger,
          budgetUsd,
          tier: effectiveAuthor === 'mini' ? 'cheap' : 'ds',
        });

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
      provenance: {
        origin: 'researcher',
        model: effectiveAuthor,
        routed: effectiveAuthor !== author || undefined,
        grade: null,
        date: new Date().toISOString().slice(0, 10),
      },
    });
  }
  return { accepted, rejections };
}
