// The Composer — planner (C2) + voice skin (C3). COMPOSER.md §5-§6.
// composeLesson assembles an authored-lesson-shaped object from the
// asset store: deterministic selection with the exposure draw, Trellis
// as the gap-fill factory, then ONE gate-validated skin pass that makes
// assembled parts read as one instructor (C-1: the skin rewrites, never
// writes; every rewrite falls back to the source form on gate failure).

import { callModel } from '../providers.mjs';
import { selectAsset } from './assets.mjs';
import { buildLessonSlice, validateAuthoredLesson, TERMINAL_PUNCT_RE, weightedLength } from '../voice/contracts.mjs';
import { selectBankItems } from '../knowledge/itemBank.mjs';

const FILL_ITEMS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['quizItems'],
  properties: {
    quizItems: {
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

function primaryKernel(graph, lesson) {
  const byId = new Map(graph.concepts.map((c) => [c.id, c]));
  for (const cid of [...lesson.introduces, ...(lesson.reinforces ?? [])]) {
    const c = byId.get(cid);
    if (c?.genomeRef) return { kernelId: c.genomeRef, conceptId: c.id, conceptName: c.name };
  }
  return null;
}

const chars = (x) => JSON.stringify(x ?? '').length;

export async function composeLesson(
  graph,
  lessonId,
  store,
  { ledger, budgetUsd, tiers, bank, courseUsed = null, tendril = null } = {},
) {
  const slice = buildLessonSlice(graph, lessonId);
  const lesson = graph.lessons.find((l) => l.id === lessonId);
  const anchor = primaryKernel(graph, lesson);
  if (!anchor) throw new Error(`composeLesson: ${lessonId} has no genome-linked concept — fill path required`);
  // T-M1b (A/B, off by default): rank the top-k draw by semantic fit to
  // this lesson instead of exposure.
  const rank =
    tendril?.rankSelection && tendril.relevanceRanker
      ? await tendril.relevanceRanker(
          [lesson.title, ...(slice.concepts ?? []).map((c) => c.name)].filter(Boolean).join('; '),
        )
      : null;
  const exclude = new Set();
  const pick = (move) => {
    // Course-level dedup (v0.2.5): the same asset in two lessons IS the
    // J7 echo class. Thin shelves may fall back to reuse — counted.
    // Tendril (T-M1a) extends the exclusion to semantic SIBLINGS of used
    // assets; the fallback drops the semantic filter before it drops the
    // id filter, so thin shelves degrade to dup reuse, never to nothing.
    const courseExclude = courseUsed ? new Set([...exclude, ...courseUsed]) : exclude;
    let asset = selectAsset(store, anchor.kernelId, move, {
      exclude: courseExclude,
      excludeIf: tendril ? (a) => tendril.assetEchoes(a) : null,
      rank,
    });
    if (!asset && tendril) {
      asset = selectAsset(store, anchor.kernelId, move, { exclude: courseExclude });
      if (asset) stats.tendrilFallbacks = (stats.tendrilFallbacks ?? 0) + 1;
    }
    if (!asset && courseUsed) {
      asset = selectAsset(store, anchor.kernelId, move, { exclude });
      if (asset) stats.dupReuses = (stats.dupReuses ?? 0) + 1;
    }
    if (asset) {
      exclude.add(asset.id);
      courseUsed?.add(asset.id);
      tendril?.noteAsset(asset);
    }
    return asset;
  };
  const stats = { reusedChars: 0, freshChars: 0, reusedParts: 0, freshParts: 0 };
  const used = (asset, body) => {
    stats.reusedChars += chars(body);
    stats.reusedParts += 1;
    return body;
  };
  const fresh = (body) => {
    stats.freshChars += chars(body);
    stats.freshParts += 1;
    return body;
  };

  // ── plan: teach → worked-example → activity → reteach → teach-close ──
  const teachA = pick('teach-segment');
  const worked = pick('worked-example');
  const activitySeg = pick('activity-segment');
  const reteach = pick('reteach-script');
  const teachB = pick('teach-segment');
  const segments = [];
  const pushSeg = (mode, asset, fallbackMinutes) => {
    if (!asset) return false;
    segments.push({ minutes: Math.max(asset.body.minutes ?? fallbackMinutes, 5), mode, text: asset.body.text });
    used(asset, asset.body.text);
    return true;
  };
  pushSeg('teach', teachA, 12);
  pushSeg('worked-example', worked, 15);
  pushSeg('activity', activitySeg, 15);
  pushSeg('reteach', reteach, 10);
  if (teachB) pushSeg('teach', teachB, 8);
  // Duration floor is a CONTRACT (≥45): scale minutes deterministically —
  // metadata, not prose (D2 holds).
  let total = segments.reduce((s, x) => s + x.minutes, 0);
  if (segments.length >= 3 && total < 50) {
    const scale = 55 / total;
    for (const seg of segments) seg.minutes = Math.max(5, Math.round(seg.minutes * scale));
    total = segments.reduce((s, x) => s + x.minutes, 0);
  }

  // ── quiz: bank selection at full depth, fill the remainder ──
  // v0.2.1 final config: banked-first (E6b MEASURED the 4+2 fresh mix
  // hurting quiz panels 7.11→6.11 at 2× cost — hypothesis rejected,
  // reverted) with PER-ITEM claims (confirmed: repair 0.530→0.548).
  const banked = selectBankItems(slice, bank, {
    maxBanked: 6,
    perConcept: 4,
    excludeItem: tendril ? (item) => tendril.itemEchoes(item) : null,
  });
  const itemConceptIds = [];
  const quizItems = banked.map((item) => {
    const clean = { ...item };
    itemConceptIds.push(item.__bank?.conceptId ?? anchor.conceptId);
    delete clean.__bank;
    used(item, clean);
    tendril?.noteItem(item);
    return clean;
  });
  if (quizItems.length < 6) {
    const need = 6 - quizItems.length;
    const { result } = await callModel({
      tier: tiers?.authorQuiz ?? 'cheap',
      stage: 'authorQuiz',
      ledger,
      budgetUsd,
      schema: FILL_ITEMS_SCHEMA,
      schemaName: 'fill_items',
      validate: (parsed) =>
        Array.isArray(parsed?.quizItems) && parsed.quizItems.length === need
          ? parsed.quizItems.every((q) => q.options?.length === 4)
            ? []
            : ['every item needs exactly 4 options']
          : [`need exactly ${need} item(s)`],
      maxOutputTokens: 2500,
      system: `Author exactly ${need} application-level multiple-choice item(s) for the lesson below, grounded in the kernel facts. 4 distinct options; plausible half-learned mistakes as distractors; explanation 2-3 sentences confronting the tempting wrong answer.`,
      user: JSON.stringify({ lesson: slice.lesson, concepts: slice.concepts, need }, null, 1),
    });
    // v0.2.1 SOLVER GATE: a cross-family seat answers each fresh item
    // BLIND; solver ≠ key → one re-author, then drop honestly (a 5-item
    // quiz is legal; a wrong key is not). The 'scarcity' class killer.
    const { solveGate } = await import('./solver.mjs');
    for (const item of result.quizItems) {
      const verdict = await solveGate(item, { ledger, budgetUsd });
      if (verdict.ok) {
        quizItems.push(fresh(item));
        itemConceptIds.push(anchor.conceptId);
      } else {
        stats.solverRejected = (stats.solverRejected ?? 0) + 1;
      }
    }
  }

  // ── surfaces from assets ──
  const guide = pick('guide');
  const discussion = pick('discussion-tension');
  const assignment = pick('activity');
  const slideGroup = pick('slide-group');
  const faq1 = pick('faq-entry');
  const faq2 = pick('faq-entry');

  const composed = {
    plan: { segments },
    quizItems,
    studyGuideSection: guide ? used(guide, guide.body.markdown) : null,
    discussion: discussion ? used(discussion, discussion.body) : null,
    assignment: assignment ? used(assignment, assignment.body) : null,
    slides: slideGroup ? used(slideGroup, slideGroup.body.slides) : null,
    faqEntries: [faq1, faq2].filter(Boolean).map((a) => used(a, a.body)),
    claims: [
      ...segments.map((_, i) => ({ path: `plan.segments[${i}].text`, ref: `kernel:${anchor.conceptId}` })),
      ...quizItems.map((_, i) => ({
        path: `quizItems[${i}].explanation`,
        ref: `kernel:${itemConceptIds[i] ?? anchor.conceptId}`,
      })),
    ],
  };

  // Missing surfaces → the factory (Trellis fill), disclosed via stats.
  const missing = [];
  if (!composed.studyGuideSection) missing.push('studyGuideSection');
  if (!composed.discussion) missing.push('discussion');
  if (!composed.assignment) missing.push('assignment');
  if (!composed.slides) missing.push('slides');
  if (composed.faqEntries.length === 0) missing.push('faqEntries');
  if (missing.length > 0) {
    const { authorLesson } = await import('../voice/author.mjs');
    const filled = await authorLesson(graph, lessonId, {
      tier: tiers?.author ?? 'nano',
      surfacesTier: tiers?.authorSurfaces ?? 'nano',
      quizTier: null,
      ledger,
      budgetUsd,
      bank,
    });
    for (const key of missing) {
      composed[key] = fresh(filled[key]);
      if (key === 'faqEntries') composed.faqEntries = filled.faqEntries.map((e) => e);
    }
  }

  return { composed, stats, anchor, slice };
}

// ── C3: the voice skin ──────────────────────────────────────────────────────
// One batched call per lesson over the PLAN segments (the seams live
// there); each rewrite accepted only if it keeps the segment's gates.
const SKIN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['rewrites'],
  properties: {
    rewrites: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['index', 'text'],
        properties: { index: { type: 'integer', minimum: 0 }, text: { type: 'string' } },
      },
    },
  },
};

export async function skinLesson(graph, lessonNumber, composed, { ledger, budgetUsd, tier = 'nano' } = {}) {
  const lesson = graph.lessons[lessonNumber - 1];
  const segments = composed.plan.segments;
  let skinned = 0;
  try {
    const { result } = await callModel({
      tier,
      stage: 'skin',
      ledger,
      budgetUsd,
      schema: SKIN_SCHEMA,
      schemaName: 'skin_rewrites',
      validate: (parsed) => (Array.isArray(parsed?.rewrites) ? [] : ['rewrites must be an array']),
      maxOutputTokens: 4000,
      system:
        `You are the course's own instructor unifying a lesson plan assembled from proven parts. Course: "${graph.course.title}" (${graph.course.level} ${graph.course.subject}), Week ${lesson.week}, Lesson: "${lesson.title}". ` +
        'Rewrite each numbered segment MINIMALLY so the sequence reads as one instructor on THIS week: fix week/lesson references, add one-clause transitions where segments collide, unify register. ' +
        'NEVER change technical content, examples, numbers, or code; never add new claims; keep each rewrite within ±40% of its original length. Return {rewrites:[{index,text}]} covering every segment.',
      user: JSON.stringify(
        segments.map((seg, index) => ({ index, mode: seg.mode, text: seg.text })),
        null,
        1,
      ),
    });
    // Every verdict feeds the Tendril-S corpus (T-M2): accepted pairs are
    // positive supervision, gate-rejected pairs carry their reason.
    const { corpusLog } = await import('../tendril/corpus.mjs');
    for (const rewrite of result.rewrites ?? []) {
      const seg = segments[rewrite.index];
      if (!seg) continue;
      const text = String(rewrite.text ?? '').trim();
      const reject = (reason) => corpusLog({ task: 'skin', accepted: false, reason, source: seg.text, target: text });
      const len = weightedLength(text);
      const orig = weightedLength(seg.text);
      if (len < orig * 0.6 || len > orig * 1.4) {
        await reject('length-band');
        continue;
      }
      if (!TERMINAL_PUNCT_RE.test(text)) {
        await reject('terminal-punct');
        continue;
      }
      if (text.includes('```')) {
        await reject('code-fence');
        continue;
      }
      if (
        (seg.mode === 'reteach' || seg.mode === 'worked-example') &&
        !/example|walk|work(ed|ing)? through|demo|trace/i.test(text)
      ) {
        await reject('mode-example');
        continue;
      }
      await corpusLog({ task: 'skin', accepted: true, mode: seg.mode, source: seg.text, target: text });
      seg.text = text;
      skinned += 1;
    }
  } catch {
    // Skin failure keeps every source form — stiff beats wrong (C-1).
  }
  return { skinned, of: segments.length };
}

export async function composeAllLessons(graph, store, { ledger, budgetUsd, tiers, bank, tendril = null } = {}) {
  const authored = {};
  const failures = [];
  const totals = { reusedChars: 0, freshChars: 0, reusedParts: 0, freshParts: 0, skinned: 0, skinOf: 0 };
  const courseUsed = new Set();
  for (const [index, lesson] of graph.lessons.entries()) {
    try {
      const { composed, stats } = await composeLesson(graph, lesson.id, store, {
        ledger,
        budgetUsd,
        tiers,
        bank,
        courseUsed,
        tendril,
      });
      const skin = await skinLesson(graph, index + 1, composed, { ledger, budgetUsd, tier: tiers?.flywheel ?? 'nano' });
      const errors = validateAuthoredLesson(composed);
      if (errors.length > 0) throw new Error(`composed lesson fails contract: ${errors.slice(0, 3).join('; ')}`);
      authored[lesson.id] = composed;
      totals.reusedChars += stats.reusedChars;
      totals.freshChars += stats.freshChars;
      totals.reusedParts += stats.reusedParts;
      totals.freshParts += stats.freshParts;
      totals.skinned += skin.skinned;
      totals.skinOf += skin.of;
      totals.solverRejected = (totals.solverRejected ?? 0) + (stats.solverRejected ?? 0);
      totals.dupReuses = (totals.dupReuses ?? 0) + (stats.dupReuses ?? 0);
      totals.tendrilFallbacks = (totals.tendrilFallbacks ?? 0) + (stats.tendrilFallbacks ?? 0);
    } catch (composeError) {
      // Fold-back per lesson: the factory authors it whole, disclosed.
      try {
        const { authorLesson } = await import('../voice/author.mjs');
        authored[lesson.id] = await authorLesson(graph, lesson.id, {
          tier: tiers?.author ?? 'nano',
          surfacesTier: tiers?.authorSurfaces ?? 'nano',
          quizTier: tiers?.authorQuiz ?? 'cheap',
          ledger,
          budgetUsd,
          bank,
        });
        totals.freshParts += 1;
      } catch (fillError) {
        failures.push({
          lessonId: lesson.id,
          error: `compose: ${composeError.message?.slice(0, 100)}; fill: ${fillError.message?.slice(0, 100)}`,
        });
      }
    }
  }
  const reusePct = Math.round((totals.reusedChars / Math.max(totals.reusedChars + totals.freshChars, 1)) * 100);
  return { authored, failures, stats: { ...totals, reusePct } };
}
