// The item bank — v0.1.3, "the genome learns assessment."
// The quiz is the pipeline's cost whale ($0.118 of $0.22: the one artifact
// nano cannot write) AND its variance whale (judge 5–7.5 on identical
// code). But quiz items are naturally course-agnostic — the 7/2
// integer-division item is the same item in every intro-Python course —
// so items from our own bar-passing runs become a data asset, keyed by
// GENOME kernel id, exactly like the genome ships kernels. Selection is
// deterministic and free; the model authors only what the bank cannot
// cover, which shrinks every time a course generates.
//
// Honesty rules:
// - harvest only from runs whose grader score ≥ 97 (A), with per-item
//   instrument evidence (does a wrong option catch a documented genome
//   misconception? does the explanation confront its corrective?) and
//   full provenance (runId/lesson/item).
// - bank items keep their SIMULATED-instrument stamps: judge-score gating
//   joins when judge verdicts persist into run dirs; until then the bank
//   records what was measured, never more.
// - selection is disclosed in the digest with provenance counts.

import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { distractorCatches } from '../judgment/checks/j11Catch.mjs';
import { confrontsCorrective } from '../judgment/checks/j3bPairing.mjs';
import { tokenOverlapRatio } from '../judgment/text.mjs';
import { TERMINAL_PUNCT_RE } from '../voice/contracts.mjs';

const MIN_GRADE = 97;
const STEM_DUPE_OVERLAP = 0.6;

// Misconception FAMILY fingerprint — stable across runs because genome
// statements are shard-verbatim and flywheel statements converge on the
// same wording for the same wrong belief. The head-to-head's unanimous
// finding (B1/A5): selection deduped stems but not families, so a quiz
// could spend four items on one off-by-one family while mutation went
// untested.
export function familyKeyOf(statement) {
  return (
    String(statement || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 60) || null
  );
}

// Mirror of the instrument's item→concept mapping (kernel claim ref first,
// stem overlap over INTRODUCED concepts as fallback) — the same rule the
// splice and Prof use, so bank evidence means what the classroom measures.
function mapItemConcept(graph, lesson, art, itemIndex) {
  const conceptById = new Map(graph.concepts.map((c) => [c.id, c]));
  const introduced = lesson.introduces.map((cid) => conceptById.get(cid)).filter(Boolean);
  if (introduced.length === 0) return null;
  const claim = (art.claims ?? []).find(
    (c) => String(c.path ?? '').startsWith(`quizItems[${itemIndex}]`) && String(c.ref ?? '').startsWith('kernel:'),
  );
  if (claim) {
    const concept = conceptById.get(String(claim.ref).slice('kernel:'.length));
    if (concept && lesson.introduces.includes(concept.id)) return concept;
  }
  let best = introduced[0];
  let bestScore = -1;
  for (const concept of introduced) {
    const score = tokenOverlapRatio(concept.name, art.quizItems[itemIndex].stem);
    if (score > bestScore) {
      bestScore = score;
      best = concept;
    }
  }
  return best;
}

// Aesthetic gates (the bank-run-2 lesson): grade ≥97 sees content, never
// option aesthetics — and the catches/confronts evidence PREFERS pasted
// belief sentences, importing the exact defect the blends exist to kill.
// The consuming run's option blend cannot rescue them (it matches the
// CURRENT course's belief texts, not the source course's), so pasted-
// looking items never enter the bank at all.
const META_OPTION_RE = /^students?\s/i;
const MAX_OPTION_CHARS = 110;
const MAX_EXPLANATION_CHARS = 500;

function aestheticallyClean(item) {
  if (item.options.some((option, oi) => oi !== item.correctIndex && META_OPTION_RE.test(String(option).trim())))
    return false;
  if (item.options.some((option) => String(option).length > MAX_OPTION_CHARS)) return false;
  if (String(item.explanation).length > MAX_EXPLANATION_CHARS) return false;
  // Bank-run-3 judge findings, both machine-checkable: truncated stems
  // (old nano-era items cut mid-sentence) and fenced code blocks, which
  // the plain-text package surfaces render broken.
  if (!TERMINAL_PUNCT_RE.test(String(item.stem).trim())) return false;
  const everything = [item.stem, ...item.options, item.explanation].join(' ');
  if (everything.includes('```')) return false;
  return true;
}

function structurallySound(item) {
  return (
    typeof item?.stem === 'string' &&
    item.stem.length >= 20 &&
    Array.isArray(item.options) &&
    item.options.length === 4 &&
    Number.isInteger(item.correctIndex) &&
    item.correctIndex >= 0 &&
    item.correctIndex <= 3 &&
    typeof item.explanation === 'string' &&
    item.explanation.length >= 30 &&
    new Set(item.options.map((o) => String(o).trim().toLowerCase())).size === 4
  );
}

export async function harvestRun(runDir) {
  const graph = JSON.parse(await readFile(join(runDir, 'graph.json'), 'utf8'));
  const authored = JSON.parse(await readFile(join(runDir, 'authored.json'), 'utf8'));
  let grade = null;
  try {
    grade = JSON.parse(await readFile(join(runDir, 'grade.json'), 'utf8'));
  } catch {
    return { items: [], skipped: 'no grade.json — unproven runs never feed the bank' };
  }
  const score = grade?.overall?.score ?? 0;
  if (score < MIN_GRADE) return { items: [], skipped: `grade ${score} < ${MIN_GRADE}` };

  const misconceptionsByConcept = new Map();
  for (const m of graph.misconceptions) {
    if (!misconceptionsByConcept.has(m.conceptId)) misconceptionsByConcept.set(m.conceptId, []);
    misconceptionsByConcept.get(m.conceptId).push(m);
  }

  const items = [];
  const runId = runDir.split('/').pop();
  for (const lesson of graph.lessons) {
    const art = authored[lesson.id];
    if (!art?.quizItems) continue;
    art.quizItems.forEach((item, itemIndex) => {
      if (!structurallySound(item) || !aestheticallyClean(item)) return;
      const concept = mapItemConcept(graph, lesson, art, itemIndex);
      // Bank items key on GENOME kernel ids — course-agnostic by
      // construction. Flywheel-only concepts stay out until contributed.
      if (!concept?.genomeRef) return;
      const misconceptions = misconceptionsByConcept.get(concept.id) ?? [];
      let catches = false;
      let confronts = false;
      let familyKey = null;
      for (const m of misconceptions) {
        const caught = item.options.some(
          (option, oi) => oi !== item.correctIndex && distractorCatches(option, m.statement),
        );
        if (caught) {
          catches = true;
          familyKey = familyKey ?? familyKeyOf(m.statement);
          if (confrontsCorrective(item.explanation, m.corrective)) confronts = true;
        }
      }
      items.push({
        id: `${runId}:${lesson.id}:q${itemIndex}`,
        kernelId: concept.genomeRef,
        conceptName: concept.name,
        stem: item.stem,
        options: item.options,
        correctIndex: item.correctIndex,
        explanation: item.explanation,
        bloom: item.bloom,
        difficulty: item.difficulty,
        catches,
        confronts,
        familyKey,
        provenance: { runId, lessonId: lesson.id, itemIndex, grade: score },
      });
    });
  }
  return { items, skipped: null };
}

function dedupeItems(items) {
  // Prefer instrument-evidenced items; among equals, higher run grade.
  const ranked = [...items].sort(
    (a, b) =>
      Number(b.catches) + Number(b.confronts) - (Number(a.catches) + Number(a.confronts)) ||
      b.provenance.grade - a.provenance.grade,
  );
  const kept = [];
  for (const item of ranked) {
    const dupe = kept.some(
      (other) => other.kernelId === item.kernelId && tokenOverlapRatio(other.stem, item.stem) > STEM_DUPE_OVERLAP,
    );
    if (!dupe) kept.push(item);
  }
  return kept;
}

export async function buildBank({ runsDir = 'trellis/runs', discipline = 'all', outDir = 'trellis/bank' } = {}) {
  const runs = (await readdir(runsDir, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name);
  const all = [];
  const log = [];
  for (const run of runs) {
    try {
      const { items, skipped } = await harvestRun(join(runsDir, run));
      log.push(`${run}: ${skipped ?? `${items.length} item(s)`}`);
      all.push(...items);
    } catch (error) {
      log.push(`${run}: unreadable (${String(error.message).slice(0, 60)})`);
    }
  }
  const items = dedupeItems(all);
  const byKernel = new Map();
  for (const item of items) byKernel.set(item.kernelId, (byKernel.get(item.kernelId) ?? 0) + 1);
  const bank = {
    discipline,
    generator: 'trellis@0.1.3',
    minGrade: MIN_GRADE,
    stamp: 'SIMULATED instruments only — judge-score gating joins when verdicts persist to run dirs',
    kernels: byKernel.size,
    items,
  };
  await mkdir(outDir, { recursive: true });
  const outPath = join(outDir, `${discipline}-items.json`);
  await writeFile(outPath, JSON.stringify(bank, null, 1));
  return { outPath, harvested: all.length, kept: items.length, kernels: byKernel.size, log };
}

export async function loadBank(discipline, { dir = 'trellis/bank' } = {}) {
  try {
    return JSON.parse(await readFile(join(dir, `${discipline}-items.json`), 'utf8'));
  } catch {
    return null;
  }
}

// ── selection (deterministic, $0) ───────────────────────────────────────────
// Up to `maxBanked` items per lesson, matched by the slice concepts'
// genomeRef, instrument-evidenced first, stem-deduped against each other,
// correctIndex rotated for position variety. Course concept ids are mapped
// back so claims stay legal in THIS course's ref enum.
export function selectBankItems(slice, bank, { maxBanked = 4, perConcept = 3 } = {}) {
  if (!bank?.items?.length) return [];
  const conceptsInOrder = [...slice.concepts].sort((a, b) => {
    const aIntro = (slice.lesson.introduces ?? []).includes(a.id) ? 0 : 1;
    const bIntro = (slice.lesson.introduces ?? []).includes(b.id) ? 0 : 1;
    return aIntro - bIntro;
  });
  const selected = [];
  // Review cap (v0.1.5 final refit): when the INTRODUCED concept's shelf
  // is thin, unlimited backfill floods the quiz with reinforced-topic
  // reviews — the L8 defect: a strings lesson whose six items were all
  // list reviews, judged 2-4. Spaced retrieval means 1-2 review items,
  // ever; the new topic gets the rest fresh-authored if the shelf can't
  // provide.
  const REVIEW_CAP = 2;
  let reviewCount = 0;
  for (const concept of conceptsInOrder) {
    if (!concept.genomeRef) continue;
    const isReviewConcept = !(slice.lesson.introduces ?? []).includes(concept.id);
    const pool = bank.items
      .filter((item) => item.kernelId === concept.genomeRef)
      .sort(
        (a, b) =>
          Number(b.catches) + Number(b.confronts) - (Number(a.catches) + Number(a.confronts)) ||
          b.provenance.grade - a.provenance.grade,
      );
    let taken = 0;
    // Family spread (B1): at most ceil(maxBanked/2) items per misconception
    // family, and family-carrying items fill BEFORE family-less ones — a
    // quiz that spends every catch on one wrong belief tests recognition,
    // not understanding (the bench11 adjudication finding).
    const familyCap = Math.ceil(maxBanked / 2);
    const familyCounts = new Map();
    // Round-robin across families (v0.1.5 refit): evidence-order-with-cap
    // still yielded 2:1 within a concept; interleaving yields 1:1:… so no
    // family waits behind another's second pick.
    const groups = new Map();
    for (const item of pool.filter((i) => i.familyKey)) {
      if (!groups.has(item.familyKey)) groups.set(item.familyKey, []);
      groups.get(item.familyKey).push(item);
    }
    const interleaved = [];
    const groupLists = [...groups.values()];
    for (let round = 0; groupLists.some((g) => g.length > round); round += 1) {
      for (const g of groupLists) if (g[round]) interleaved.push(g[round]);
    }
    const spreadPool = [...interleaved, ...pool.filter((item) => !item.familyKey)];
    for (const item of spreadPool) {
      if (selected.length >= maxBanked || taken >= perConcept) break;
      if (isReviewConcept && reviewCount >= REVIEW_CAP) break;
      if (item.familyKey && (familyCounts.get(item.familyKey) ?? 0) >= familyCap) continue;
      if (selected.some((s) => tokenOverlapRatio(s.stem, item.stem) > STEM_DUPE_OVERLAP)) continue;
      // Rotate the correct option for position variety (structure, not prose).
      const rotation = selected.length % 4;
      const options = item.options.map((_, i) => item.options[(i + item.correctIndex - rotation + 4) % 4]);
      // Spaced-retrieval items are LABELED as review — both judge seats read
      // unlabeled prior-topic items as scope drift ("drifts into while-loop
      // behavior"). A one-word label is metadata-class assembly, and it is
      // also just honest quiz design.
      const isReview = isReviewConcept;
      if (isReview) reviewCount += 1;
      const stem = isReview && !/^review\b/i.test(item.stem) ? `Review: ${item.stem}` : item.stem;
      if (item.familyKey) familyCounts.set(item.familyKey, (familyCounts.get(item.familyKey) ?? 0) + 1);
      selected.push({
        stem,
        options,
        correctIndex: rotation,
        explanation: item.explanation,
        bloom: item.bloom,
        difficulty: item.difficulty,
        __bank: { id: item.id, kernelId: item.kernelId, conceptId: concept.id },
      });
      taken += 1;
    }
  }
  return selected;
}
