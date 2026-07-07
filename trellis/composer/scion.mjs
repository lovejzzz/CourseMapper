// Scion in Composer-ZERO — the V2.1 house model (Gemma-4-E2B rootstock +
// the house harness, src/lib/localProvider.js names it) grafted onto the
// zero pipeline's three JUDGED seats, one per judge artifact class:
//   skin   — lesson-plan segments (replaces Tendril-S 0.5B; the identical
//            gate stack in applySkinRewrites decides, so quality is
//            monotonic by construction)
//   polish — study-guide markdown (the V2 self-refine pass that took study
//            guides PAST paid on the compiler seat, BAKEOFF addendum 4)
//   fill   — fresh quiz items where the bank runs short (zero mode's
//            documented no-author gap): authorItemsE2BMax + strict blind
//            self-solve acceptance, disclosed as self-verified — NEVER
//            solver-verified (the paid cross-family solver does not run
//            in zero mode, and we say so)
// Every seat is local and $0; seats engage only via SCION=skin,polish,fill.
// Zero mode's honesty contract is unchanged: a failed rewrite keeps its
// source form, a failed item never ships, quiz explanations are NOT
// polished (banked correctives carry catch tokens the battery measures —
// rewriting them without the original token lists would be gate-blind).

import { weightedLength } from '../voice/contracts.mjs';
import { tokenOverlapRatio } from '../judgment/text.mjs';

export function scionSeats(env = process.env.SCION) {
  return new Set(
    String(env ?? '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

// ── skin seat ────────────────────────────────────────────────────────────────
// Scion is zero-shot here (never distilled on the skin task), so unlike
// Tendril-S it can carry course/lesson context in the prompt — the same
// framing the paid nano batch path uses.
export function scionSkinSystem(graph, lesson) {
  return (
    `You are the course's own instructor unifying a lesson plan assembled from proven parts. ` +
    `Course: "${graph.course.title}" (${graph.course.level ?? ''} ${graph.course.subject ?? ''}), Week ${lesson.week}, Lesson: "${lesson.title}". ` +
    'Rewrite the segment MINIMALLY so it reads as one instructor teaching THIS week: fix week/lesson references, add a one-clause transition where segments collide, unify register into direct, confident teaching prose. ' +
    'If the segment walks through an example or demo, keep it explicitly framed as one. ' +
    'NEVER change technical content, examples, numbers, or code; never add new claims; keep the rewrite within ±40% of the original length; end with terminal punctuation. ' +
    'Return ONLY the rewritten segment text.'
  );
}

// ── polish seat ──────────────────────────────────────────────────────────────
const POLISH_SYSTEM =
  'You are a veteran professor polishing a draft study-guide section. Rewrite it MINIMALLY so it reads as natural, confident teaching prose — one voice, plain sentences, no filler, no template phrasing. ' +
  'Keep the markdown structure intact: every heading line stays a heading, lists stay lists, bold terms stay bold. ' +
  'NEVER change technical content, terms, numbers, or code; never add or remove claims. Return ONLY the rewritten markdown.';

const headingCount = (md) => (String(md).match(/^#{1,6} /gm) ?? []).length;
const fenceCount = (md) => (String(md).match(/```/g) ?? []).length;
// The non-reader catch-up marker is a CLASSROOM CONTRACT (voice/contracts.mjs
// validateAuthoredLesson): studyGuideSection must carry a "missed the
// reading? start here" path or the non-reader compliance bar breaks. On the
// music course the guide section IS that catch-up prose, so polishing it is
// exactly where a rewrite can silently destroy compliance.
const NON_READER_RE = /missed the reading|if you (skipped|missed)/i;

// Gate stack for a study-guide rewrite: the skin contract's ±40% weighted
// length band + EXACT structure preservation (heading/fence counts) + the
// non-reader marker. The gate is deliberately strict: the first music run
// proved WHY. Its guide sections are headingless catch-up prose, and Scion's
// instinct is to retitle them into a topic overview — which drops the
// "missed the reading" section and fails the classroom contract downstream
// (7/7 lessons threw). Structured guides (the cs course: real `##`/`###`
// headings) polish cleanly because the model preserves the existing shape.
// So this gate lets polish LAND where structure is real and REJECT where the
// prose itself is the contract — quality stays monotonic, source form ships.
export function guideRewriteRejection(original, rewrite) {
  const text = String(rewrite ?? '').trim();
  if (text.length === 0) return 'empty';
  const len = weightedLength(text);
  const orig = weightedLength(original);
  if (len < orig * 0.6 || len > orig * 1.4) return 'length-band';
  if (headingCount(text) !== headingCount(original)) return 'heading-structure';
  if (fenceCount(text) !== fenceCount(original)) return 'fence-structure';
  if (NON_READER_RE.test(original) && !NON_READER_RE.test(text)) return 'non-reader-marker';
  return null;
}

export async function scionPolishGuide(composed, { sGen = null } = {}) {
  const original = composed.studyGuideSection;
  if (typeof original !== 'string' || original.length < 120 || original.length > 6000)
    return { attempted: 0, accepted: 0 };
  const generate = sGen ?? (await import('../tendril/sModel.mjs')).sGenerate;
  const { corpusLog } = await import('../tendril/corpus.mjs');
  let text;
  try {
    text = await generate({
      system: POLISH_SYSTEM,
      user: original,
      source: original,
      task: 'scion',
      maxTokens: 2200,
    });
  } catch {
    return { attempted: 1, accepted: 0 };
  }
  text = String(text ?? '').trim();
  const reason = guideRewriteRejection(original, text);
  await corpusLog({
    task: 'polish',
    model: 'scion',
    accepted: !reason,
    reason: reason ?? undefined,
    source: original,
    target: text,
  });
  if (reason) return { attempted: 1, accepted: 0, reason };
  composed.studyGuideSection = text;
  return { attempted: 1, accepted: 1 };
}

// ── fill seat ────────────────────────────────────────────────────────────────
// Zero mode never authored items before this seat existed — short shelves
// shipped short quizzes, disclosed. Scion authors the remainder through the
// IDENTICAL harness the researcher uses (authorItemsE2BMax: adaptive
// candidates + gate stack + feedback resample), then a STRICT acceptance
// check replaces the paid solver: the item ships only if Scion blind-solves
// it to its own key. Inconclusive counts as rejected — in zero mode nothing
// gets the benefit of the doubt.
export async function scionFillItems(
  graph,
  anchor,
  bank,
  need,
  { existingStems = [], author = null, solve = null } = {},
) {
  const conceptMisconceptions = (graph.misconceptions ?? []).filter((m) => m.conceptId === anchor.conceptId);
  if (conceptMisconceptions.length === 0)
    return { items: [], attempted: 0, selfRejected: 0, skipped: 'no-misconceptions' };
  const { claimTokens } = await import('../knowledge/bankGapFill.mjs');
  const anchorConcept = graph.concepts.find((c) => c.id === anchor.conceptId);
  const cells = conceptMisconceptions.slice(0, 2).map((m) => ({
    statement: m.statement,
    corrective: m.corrective,
    mustIncludeTwoOf: claimTokens(m.statement),
    explanationMustIncludeHalfOf: claimTokens(m.corrective),
  }));
  const kernel = {
    definition: anchorConcept?.name ?? anchor.conceptName,
    facts: (anchorConcept?.kernelFacts ?? []).map((t) => ({ text: typeof t === 'string' ? t : t.text })),
    misconceptions: conceptMisconceptions.map((m) => ({ text: m.statement, corrective: m.corrective })),
  };
  const shelf = bank?.items?.filter((b) => b.kernelId === anchor.kernelId) ?? [];
  const authorFn = author ?? (await import('../researcher/shape.mjs')).authorItemsE2BMax;
  const solveFn = solve ?? (await import('../researcher/shape.mjs')).selfSolveIndex;
  let authored;
  try {
    authored = await authorFn(
      { id: anchor.kernelId, term: anchorConcept?.name ?? anchor.conceptName },
      kernel,
      cells,
      shelf,
    );
  } catch {
    return { items: [], attempted: 0, selfRejected: 0 };
  }
  const wellFormed = (authored ?? []).filter(
    (x) => x?.stem && Array.isArray(x.options) && x.options.length === 4 && Number.isInteger(x.correctIndex),
  );
  const items = [];
  let selfRejected = 0;
  const stems = [...existingStems];
  for (const item of wellFormed) {
    if (items.length >= need) break;
    if (stems.some((s) => tokenOverlapRatio(s, item.stem) > 0.6)) continue; // echo of a shipped stem
    const solved = await solveFn(item);
    if (solved === item.correctIndex) {
      items.push({ bloom: 'apply', difficulty: 'apply', ...item });
      stems.push(item.stem);
    } else {
      selfRejected += 1;
    }
  }
  return { items, attempted: wellFormed.length, selfRejected };
}
