// Researcher-Zero — the $0-API research brain (RESEARCHER.md Part IV).
// No paid model anywhere: Tendril-E SELECTS source sentences (extractive
// facts are span-anchored BY CONSTRUCTION — they are the source), a
// deterministic assembler drafts each surface from selected sentences,
// and Tendril-S (local) skins the seams — its one trained skill. Every
// output passes the same gates as the paid shaper; failures ship the
// extractive draft or drop the surface, disclosed.
//
// Honest bounds, pre-registered:
// - misconceptions: only mined when sources STATE them (misconception/
//   commonly-confused sentences); a 135M cannot invent good ones. Thin
//   misconceptions → fewer catching items → disclosed J11/J3 residuals.
// - items: AUTHORED at $0 since v0.2 (A1) — Gemma 4 E2B (local, mlx-vlm)
//   writes the distractors, proven at DeepSeek parity on the same gate
//   stack (18 vs 19 accepted over 8 lit kernels, E2B winning 4 outright).
//   The blind SOLVER seat stays cross-family/paid BY DESIGN (trust, not
//   capability): zeroShapeItems runs gate-only at $0 (items carry
//   solverVerified:false, disclosed) OR takes an injected solver for the
//   ~$0.01/course verification. Thin misconceptions still cap catching-
//   item yield (a 135M cannot invent the wrong beliefs E2B needs).

import { cosine, makeEmbedder } from '../tendril/embedder.mjs';
import { startS, sGenerate, SKIN_SYSTEM } from '../tendril/sModel.mjs';
import { TERMINAL_PUNCT_RE, weightedLength } from '../voice/contracts.mjs';
import { openAlexMisconceptions } from './sources.mjs';
import { authorItemsE2B } from './shape.mjs';
import { claimTokens, gapItemRejection, gapfillId } from '../knowledge/bankGapFill.mjs';

export function splitSentences(text) {
  return String(text)
    .replace(/==+[^=]*==+/g, ' ') // strip wiki section headings before they glue into sentences
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+(?=[A-Z"“(])/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 40 && s.length <= 400 && !/^==/.test(s));
}

function dedupeKeepOrder(sentences) {
  const seen = new Set();
  return sentences.filter((s) => {
    const key = s.toLowerCase().slice(0, 60);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Rank source sentences by embedding relevance to a query text.
async function rankSentences(embedder, query, sentences, { k = 8, floor = 0.3 } = {}) {
  const vectors = await embedder.embed([query, ...sentences]);
  const q = vectors[0];
  return sentences
    .map((text, i) => ({ text, score: cosine(q, vectors[i + 1]) }))
    .filter((s) => s.score >= floor)
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

const MISCONCEPTION_RE =
  /misconception|commonly (confused|mistaken|misunderstood)|contrary to (popular belief|common belief)|often (incorrectly|mistakenly|wrongly)|a common (error|mistake|myth)|it is a myth/i;
const EXAMPLE_RE = /for example|for instance|such as|e\.g\.|consider the|一?example of/i;

// FIDELITY GATE (added after the first bench eyeball caught the 135M
// skin INJECTING a false claim that no length/punct gate can see):
// every sentence of the skinned output must sit within cosine τ of some
// sentence in the source pool + draft — content the sources didn't say
// cannot ship. Instructional-register leaks ("Teach that ...") are
// rejected outright. Failure ships the pure-source draft, which is safe
// by construction.
const META_REGISTER_RE = /^(teach|explain|tell (the )?students|note that the (lesson|class))\b/i;

async function skin(text, { mode = 'teach', embedder, pool = [], tau = 0.75 } = {}) {
  const log = async (accepted, reason, target) => {
    const { corpusLog } = await import('../tendril/corpus.mjs');
    await corpusLog({
      task: 'skin',
      context: 'researcher-zero',
      accepted,
      ...(reason ? { reason } : {}),
      source: text,
      target,
    });
  };
  try {
    const out = String(
      await sGenerate({ system: SKIN_SYSTEM, user: JSON.stringify({ mode, text }), source: text }),
    ).trim();
    const len = weightedLength(out);
    const orig = weightedLength(text);
    if (len < orig * 0.6 || len > orig * 1.4) return { text, skinned: false };
    if (!TERMINAL_PUNCT_RE.test(out)) return { text, skinned: false };
    if (out.includes('```')) return { text, skinned: false };
    if (
      (mode === 'reteach' || mode === 'worked-example') &&
      !/example|walk|work(ed|ing)? through|demo|trace/i.test(out)
    )
      return { text, skinned: false };
    if (META_REGISTER_RE.test(out)) return { text, skinned: false };
    if (embedder && pool.length > 0) {
      const outSentences = splitSentences(out);
      if (outSentences.length > 0) {
        const vectors = await embedder.embed([...outSentences, ...pool, text]);
        const outVecs = vectors.slice(0, outSentences.length);
        const poolVecs = vectors.slice(outSentences.length);
        for (const ov of outVecs) {
          const best = Math.max(...poolVecs.map((pv) => cosine(ov, pv)));
          if (best < tau) {
            await log(false, 'fidelity', out);
            return { text, skinned: false }; // invented content
          }
        }
      }
    }
    await log(true, null, out);
    return { text: out, skinned: true };
  } catch {
    return { text, skinned: false }; // S failure ships the extractive draft
  }
}

// ── kernel at $0: extractive facts + mined misconceptions ──────────────────
export async function zeroShapeKernel(target, sources, { embedder = null } = {}) {
  if (!sources || sources.length === 0) {
    return { ok: false, definition: null, facts: [], misconceptions: [], exampleSentences: [], anchoringRate: 0 };
  }
  const emb = embedder ?? makeEmbedder();
  const allSentences = dedupeKeepOrder(sources.flatMap((s) => splitSentences(s.text)));
  const srcOf = (sentence) => sources.find((s) => s.text.replace(/\s+/g, ' ').includes(sentence)) ?? sources[0];

  // Wikipedia convention: the first sentence of the top source defines.
  const definition = splitSentences(sources[0].text)[0] ?? null;

  const ranked = await rankSentences(emb, `${target.term}: definition, key properties, how it works`, allSentences, {
    k: 10,
  });
  // Cross-source corroboration: a fact earns verifiedBy for every OTHER
  // source containing a sentence ≥0.80 similar — truth-worthiness as a
  // recorded number, not a vibe.
  const perSource = sources.map((src) => splitSentences(src.text));
  const perSourceVecs = [];
  for (const sentences of perSource) perSourceVecs.push(sentences.length ? await emb.embed(sentences) : []);
  const factCandidates = ranked.filter((r) => r.text !== definition).slice(0, 6);
  const factVecs = factCandidates.length ? await emb.embed(factCandidates.map((r) => r.text)) : [];
  const facts = factCandidates.map((r, fi) => {
    const home = srcOf(r.text);
    let verifiedBy = 0;
    sources.forEach((src, si) => {
      if (src === home) return;
      if (perSourceVecs[si].some((v) => cosine(factVecs[fi], v) >= 0.8)) verifiedBy += 1;
    });
    return {
      text: r.text,
      anchor: { src: home.url, loc: 'extract', quote: r.text },
      tier: 2,
      verifiedBy,
      contested: false,
    };
  });

  // Misconceptions from two DOCUMENTED channels only: (1) sentences the
  // sources state, (2) education literature via OpenAlex — measured in
  // real classrooms, cited. Never model-invented at $0.
  const minedMisconceptions = allSentences
    .filter((s) => MISCONCEPTION_RE.test(s))
    .slice(0, 3)
    .map((s) => ({
      text: `Students may hold the documented misunderstanding: ${s}`,
      corrective: s,
      minedFromSource: true,
    }));
  const literature = await openAlexMisconceptions(target.term);
  for (const doc of literature) {
    minedMisconceptions.push({
      text: doc.text,
      corrective: `Address directly: ${doc.text}`,
      documentedIn: doc.citation,
    });
  }

  const exampleSentences = allSentences.filter((s) => EXAMPLE_RE.test(s)).slice(0, 3);
  return {
    ok: Boolean(definition) && facts.length >= 3,
    definition,
    facts,
    misconceptions: minedMisconceptions,
    exampleSentences,
    anchoringRate: 1, // extractive: every fact IS its quote, by construction
  };
}

// ── surfaces at $0: deterministic draft + S skin, same gates ───────────────
export async function zeroShapeSurfaces(target, sources, kernel, { embedder = null } = {}) {
  const emb = embedder ?? makeEmbedder();
  await startS();
  const provenance = {
    origin: 'researcher-zero',
    sources: sources.map((s) => ({ url: s.url, license: s.license, attribution: s.attribution })),
    date: new Date().toISOString().slice(0, 10),
  };
  const rejected = {};
  const assets = [];
  const push = (move, body) => {
    assets.push({
      id: `researcher-zero:${move}:${target.id}:${assets.length}`,
      kernelId: target.id,
      conceptName: target.term,
      move,
      body,
      evidence: { fromGrade: null, sourced: true, extractive: true },
      provenance,
      exposure: { uses: 0 },
      voice: 'sourced-zero',
    });
  };
  const facts = kernel.facts.map((f) => f.text);
  const examples = kernel.exampleSentences ?? [];
  const pool = dedupeKeepOrder(sources.flatMap((s) => splitSentences(s.text)));
  let skinAccepted = 0;
  let skinAttempts = 0;

  // teach: definition + top facts, S-skinned. The draft is 100% source
  // sentences; the skin may only smooth it (gated ±40%).
  const teachDraft = [kernel.definition, ...facts.slice(0, 3)].filter(Boolean).join(' ');
  skinAttempts += 1;
  const teachR = await skin(teachDraft, { mode: 'teach', embedder: emb, pool });
  if (teachR.skinned) skinAccepted += 1;
  if (weightedLength(teachR.text) >= 60 && TERMINAL_PUNCT_RE.test(teachR.text))
    push('teach-segment', { minutes: 12, text: teachR.text });
  else rejected.teach = 'gate';

  // worked example: example sentences + walkthrough scaffold.
  if (examples.length > 0) {
    const workedDraft = `Worked example: we walk through one concrete case. ${examples.join(' ')} Working through it step by step, connect each part back to ${target.term}.`;
    skinAttempts += 1;
    const workedR = await skin(workedDraft, { mode: 'worked-example', embedder: emb, pool: [...pool, workedDraft] });
    if (workedR.skinned) skinAccepted += 1;
    push('worked-example', { minutes: 15, text: workedR.text });
  } else rejected.worked = 'no example sentences in sources';

  // reteach: different facts, second-pass framing.
  const reteachDraft = `If ${target.term} did not land the first time, here is the idea again through another example. ${facts
    .slice(3, 6)
    .join(' ')} The example to hold onto: ${examples[0] ?? facts[0] ?? ''}`;
  skinAttempts += 1;
  const reteachR = await skin(reteachDraft, { mode: 'reteach', embedder: emb, pool: [...pool, reteachDraft] });
  if (reteachR.skinned) skinAccepted += 1;
  if (weightedLength(reteachR.text) >= 60) push('reteach-script', { minutes: 10, text: reteachR.text });
  else rejected.reteach = 'gate';

  // guide: structured study surface; key sentences are extractive.
  const guide = [
    `## ${target.term} — study guide`,
    ``,
    `**Core idea.** ${kernel.definition ?? ''}`,
    ``,
    `**Key points.**`,
    ...facts.slice(0, 4).map((f) => `- ${f}`),
    ``,
    `**If you missed the reading:** start with the core idea above, then read the key points twice; each is taken directly from the course sources.`,
    ``,
    `**Check yourself.**`,
    `- Explain ${target.term} in your own words without looking at the definition.`,
    `- Which key point above would change most if its conditions changed? Why?`,
  ].join('\n');
  if (weightedLength(guide) >= 300) push('guide', { markdown: guide });
  else rejected.guide = 'too short';

  // discussion: relevance-ranked tension sentence + standard follow-ups.
  const tensionRank = await rankSentences(
    emb,
    `${target.term}: debate, limitation, criticism, tension, disagreement`,
    dedupeKeepOrder(sources.flatMap((s) => splitSentences(s.text))),
    { k: 1 },
  );
  const tension = tensionRank[0]?.text ?? facts[facts.length - 1] ?? '';
  const discussion = {
    prompt: `The sources note: "${tension}" — where do you see this holding or breaking down, and what evidence would settle it?`,
    tension,
    followUps: [`What would count as a counter-example?`, `How does this connect to last week's concept?`],
  };
  if (weightedLength(discussion.prompt) >= 40) push('discussion-tension', discussion);
  else rejected.discussion = 'gate';

  // assignment: apply-the-facts task with standard rubric.
  push('activity', {
    task: `Choose one real case (from the reading or your own experience) and analyze it using ${target.term}. State the case in two sentences, apply each key point from the study guide to it explicitly, and note one place where the concept fits imperfectly.`,
    steps: [
      'Pick and describe your case (2 sentences).',
      'Apply each key point to the case, one short paragraph each.',
      'Name one limit or imperfect fit and explain why.',
    ],
    rubricBands: [
      'Excellent: case is concrete, every key point applied accurately, the limit shows real insight.',
      'Adequate: case present, most key points applied, limit named but thin.',
      'Insufficient: case vague or key points restated without application.',
    ],
  });

  // faqs: mined question-adjacent sentences → Q/A pairs (extractive answers).
  const faqRank = await rankSentences(
    emb,
    `${target.term}: why does it matter, common question, when does it apply`,
    dedupeKeepOrder(sources.flatMap((s) => splitSentences(s.text))),
    { k: 2 },
  );
  for (const r of faqRank) {
    push('faq-entry', { q: `How does this apply: ${target.term}?`, a: r.text });
  }

  // slides: definition + facts as bullets, notes from the same sentences.
  const slides = [
    { title: `${target.term}: the idea`, bullets: [kernel.definition ?? ''].filter(Boolean) },
    ...facts.slice(0, 5).map((f, i) => ({ title: `Key point ${i + 1}`, bullets: [f] })),
    {
      title: 'Check yourself',
      bullets: [`Explain ${target.term} without notes.`, 'Connect it to one earlier concept.'],
    },
  ].map((slide) => ({
    ...slide,
    bullets: slide.bullets.map((b) => (TERMINAL_PUNCT_RE.test(b.trim()) ? b.trim() : `${b.trim()}.`)),
    speakerNotes: `Walk the class through this slowly: ${slide.bullets.join(' ')} Invite one question before moving on.`,
    altText: `A single-idea slide about ${target.term} suitable for a clean text layout with one highlighted phrase.`,
  }));
  if (slides.length >= 6) push('slide-group', { slides });
  else rejected.slides = 'too few';

  return { assets, rejected, skin: { accepted: skinAccepted, attempts: skinAttempts } };
}

// zeroShapeItems (A1) — the $0 item author researcher-zero could not have
// before Gemma 4. E2B writes 3 items per kernel (2 misconception-catchers +
// 1 application); the SAME deterministic gate stack the paid shaper uses
// decides what survives (gapItemRejection: catch/confront/lexical/dedupe).
// The blind solver seat is OPTIONAL and paid: pass `solver` to buy the
// ~$0.01/course verification; omit it for strict $0 (items carry
// solverVerified:false and are disclosed as gate-only). RS-5 intact: the
// default path spends nothing.
export async function zeroShapeItems(target, kernel, shelf = [], { solver = null, ledger = null, budgetUsd = 0 } = {}) {
  const misc = kernel.misconceptions ?? [];
  if (misc.length < 2) return { accepted: [], rejections: { 'thin-misconceptions': 1 }, solverUsed: false };
  const cells = misc.slice(0, 2).map((m) => ({
    statement: m.text,
    corrective: m.corrective,
    mustIncludeTwoOf: claimTokens(m.text),
    explanationMustIncludeHalfOf: claimTokens(m.corrective),
  }));
  const facts = kernel.facts.map((f) => (typeof f === 'string' ? f : f.text));
  const items = await authorItemsE2B(target, { definition: kernel.definition, facts, misconceptions: misc }, cells);

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
    let solverVerified = false;
    if (solver) {
      const verdict = await solver(item, { ledger, budgetUsd });
      if (!verdict.ok) {
        rejections.solver = (rejections.solver ?? 0) + 1;
        continue;
      }
      solverVerified = true;
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
        origin: 'researcher-zero',
        model: 'e2b',
        solverVerified,
        grade: null,
        date: new Date().toISOString().slice(0, 10),
      },
    });
  }
  return { accepted, rejections, solverUsed: !!solver };
}
