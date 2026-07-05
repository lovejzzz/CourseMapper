// The Composer's asset store — COMPOSER.md §4, C0+C1.
// Assets are gate-passed, provenance-tracked pedagogical parts keyed by
// (genome kernel × move). C0 migrates the item bank; C1 harvests the
// other moves from the highest-judged runs' authored artifacts — a
// deterministic extraction with per-move gates, never a model call.
// Append-only with supersedes (C-3); exposure counters for the CAT-style
// draw (§7); everything discloses its origin.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tokenOverlapRatio } from '../judgment/text.mjs';
import { loadBank } from '../knowledge/itemBank.mjs';
import { TERMINAL_PUNCT_RE, weightedLength } from '../voice/contracts.mjs';

const ASSETS_PATH = 'trellis/bank/assets.json';

// Runs whose packages carried the strongest instrument evidence — the
// E6 harvest sources. Grade ≥97 is the floor; these also carried panel
// scores 8-9 in the ledger.
const HARVEST_RUNS = [
  'v016-cs-replay',
  'v015-samegraph-final2',
  'v013-cs-bank5',
  'v012-cs-verify',
  'bench11-trellis',
  // v0.2.2: the LA shelf (grades 97-99) — the E7 prerequisite.
  'v012-la-verify',
  'v016-la-replay',
  'v017-la-replay',
];

export async function loadAssets({ path = ASSETS_PATH } = {}) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return null;
  }
}

function segmentGate(text, { requireExample = false } = {}) {
  if (typeof text !== 'string' || weightedLength(text) < 60) return false;
  if (!TERMINAL_PUNCT_RE.test(text.trim())) return false;
  if (text.includes('```')) return false;
  if (requireExample && !/example|walk|work(ed|ing)? through|demo|trace/i.test(text)) return false;
  return true;
}

function kernelsForLesson(graph, lesson) {
  const byId = new Map(graph.concepts.map((c) => [c.id, c]));
  return [...new Set([...lesson.introduces, ...(lesson.reinforces ?? [])])]
    .map((cid) => byId.get(cid))
    .filter((c) => c?.genomeRef)
    .map((c) => ({ kernelId: c.genomeRef, conceptName: c.name }));
}

// C1 — deterministic multi-move extraction from one judged run.
export async function harvestMovesFromRun(runDir, grade) {
  const graph = JSON.parse(await readFile(join(runDir, 'graph.json'), 'utf8'));
  const authored = JSON.parse(await readFile(join(runDir, 'authored.json'), 'utf8'));
  const runId = runDir.split('/').pop();
  const assets = [];
  const push = (move, kernelId, conceptName, body, extra = {}) => {
    assets.push({
      id: `${runId}:${move}:${kernelId}:${assets.length}`,
      kernelId,
      conceptName,
      move,
      body,
      evidence: { fromGrade: grade },
      provenance: { origin: 'harvest', runId, date: '2026-07-04' },
      exposure: { uses: 0 },
      voice: 'source-course',
      ...extra,
    });
  };

  for (const lesson of graph.lessons) {
    const art = authored[lesson.id];
    if (!art) continue;
    const kernels = kernelsForLesson(graph, lesson);
    const primary = kernels[0];
    if (!primary) continue;

    for (const seg of art.plan?.segments ?? []) {
      if (seg.mode === 'worked-example' && segmentGate(seg.text, { requireExample: true })) {
        push('worked-example', primary.kernelId, primary.conceptName, { minutes: seg.minutes, text: seg.text });
      } else if (seg.mode === 'reteach' && segmentGate(seg.text, { requireExample: true })) {
        push('reteach-script', primary.kernelId, primary.conceptName, { minutes: seg.minutes, text: seg.text });
      } else if (seg.mode === 'teach' && segmentGate(seg.text)) {
        push('teach-segment', primary.kernelId, primary.conceptName, { minutes: seg.minutes, text: seg.text });
      } else if (seg.mode === 'activity' && segmentGate(seg.text)) {
        push('activity-segment', primary.kernelId, primary.conceptName, { minutes: seg.minutes, text: seg.text });
      }
    }
    if (
      typeof art.studyGuideSection === 'string' &&
      weightedLength(art.studyGuideSection) >= 300 &&
      /missed the reading|if you (skipped|missed)/i.test(art.studyGuideSection) &&
      !art.studyGuideSection.includes('```')
    ) {
      push('guide', primary.kernelId, primary.conceptName, { markdown: art.studyGuideSection });
    }
    if (art.discussion?.prompt && weightedLength(art.discussion.prompt) >= 40) {
      push('discussion-tension', primary.kernelId, primary.conceptName, art.discussion);
    }
    if (art.assignment?.task && Array.isArray(art.assignment?.rubricBands) && art.assignment.rubricBands.length >= 3) {
      push('activity', primary.kernelId, primary.conceptName, art.assignment);
    }
    for (const entry of art.faqEntries ?? []) {
      if (weightedLength(entry?.a ?? '') >= 30) {
        push('faq-entry', primary.kernelId, primary.conceptName, entry);
      }
    }
    if (Array.isArray(art.slides) && art.slides.length >= 6 && !JSON.stringify(art.slides).includes('```')) {
      push('slide-group', primary.kernelId, primary.conceptName, { slides: art.slides });
    }
  }
  return assets;
}

function dedupeAssets(assets) {
  const textOf = (a) =>
    a.body.text ?? a.body.markdown ?? a.body.prompt ?? a.body.task ?? a.body.a ?? JSON.stringify(a.body).slice(0, 200);
  const kept = [];
  for (const asset of assets.sort((a, b) => (b.evidence.fromGrade ?? 0) - (a.evidence.fromGrade ?? 0))) {
    const dupe = kept.some(
      (other) =>
        other.kernelId === asset.kernelId &&
        other.move === asset.move &&
        tokenOverlapRatio(textOf(other), textOf(asset)) > 0.6,
    );
    if (!dupe) kept.push(asset);
  }
  return kept;
}

// C0 + C1 — build the full asset store: migrated items + harvested moves.
export async function buildAssets({ outPath = ASSETS_PATH } = {}) {
  const bank = await loadBank('all');
  if (!bank) throw new Error('item bank missing — the Composer builds on it, not around it');
  // Carry exposure counters across rebuilds — persisted draw history is
  // an asset property now (same class of loss as the gapfill-rebuild trap).
  const existing = await loadAssets({ path: outPath });
  const priorUses = new Map((existing?.assets ?? []).map((a) => [a.id, a.exposure?.uses ?? 0]));
  const itemAssets = bank.items.map((item) => ({
    id: `item:${item.id}`,
    kernelId: item.kernelId,
    conceptName: item.conceptName,
    move: 'item',
    body: {
      stem: item.stem,
      options: item.options,
      correctIndex: item.correctIndex,
      explanation: item.explanation,
      bloom: item.bloom,
      difficulty: item.difficulty,
    },
    familyKey: item.familyKey ?? null,
    evidence: { catches: item.catches, confronts: item.confronts, fromGrade: item.provenance?.grade ?? null },
    provenance: { ...item.provenance, migratedFrom: 'all-items.json' },
    exposure: { uses: 0 },
    voice: 'neutral',
  }));

  const harvested = [];
  const log = [];
  for (const run of HARVEST_RUNS) {
    const dir = `trellis/runs/${run}`;
    try {
      const grade = JSON.parse(await readFile(join(dir, 'grade.json'), 'utf8'))?.overall?.score ?? 0;
      if (grade < 97) {
        log.push(`${run}: grade ${grade} < 97, skipped`);
        continue;
      }
      const assets = await harvestMovesFromRun(dir, grade);
      harvested.push(...assets);
      log.push(`${run}: ${assets.length} move-assets`);
    } catch (error) {
      log.push(`${run}: unreadable (${String(error.message).slice(0, 60)})`);
    }
  }

  const moveAssets = dedupeAssets(harvested);
  for (const asset of moveAssets) {
    if (priorUses.has(asset.id)) asset.exposure.uses = priorUses.get(asset.id);
  }
  for (const asset of [...itemAssets]) {
    if (priorUses.has(asset.id)) asset.exposure.uses = priorUses.get(asset.id);
  }
  // Researcher deposits (RESEARCHER.md RS-4): cited assets live in their
  // own file and merge on every rebuild — the gapfill-persistence pattern.
  let researcherAssets = [];
  try {
    researcherAssets = JSON.parse(await readFile('trellis/bank/researcher-assets.json', 'utf8')).assets ?? [];
  } catch {
    /* none yet */
  }
  for (const asset of researcherAssets) {
    if (priorUses.has(asset.id)) asset.exposure.uses = priorUses.get(asset.id);
  }

  const store = {
    version: 'composer-assets-v0',
    benchVersion: '1.1.0',
    stamp: 'SIMULATED instruments only; append-only with supersedes (COMPOSER.md C-3)',
    counts: {},
    assets: [...itemAssets, ...moveAssets, ...researcherAssets],
  };
  for (const asset of store.assets) store.counts[asset.move] = (store.counts[asset.move] ?? 0) + 1;
  await mkdir('trellis/bank', { recursive: true });
  await writeFile(outPath, JSON.stringify(store, null, 1));
  return { total: store.assets.length, counts: store.counts, log };
}

// Selection with the CAT-style exposure draw (§7): among the top-k
// candidates by evidence, draw by LOWEST exposure first — argmax reuse
// is how every course becomes the same course.
//
// T-M1b (A/B, flag-gated): when `rank` is provided (tendril relevance
// ranking), the top-k draw orders by semantic fit to THIS lesson instead
// of exposure, exposure as tie-break. Measured on the frozen ruler before
// any default flips — relevance could beat variety or lose to it.
export function selectAsset(store, kernelId, move, { exclude = new Set(), k = 3, excludeIf = null, rank = null } = {}) {
  const pool = store.assets
    .filter((a) => a.kernelId === kernelId && a.move === move && !exclude.has(a.id) && !excludeIf?.(a))
    .sort((a, b) => (b.evidence.fromGrade ?? 0) - (a.evidence.fromGrade ?? 0))
    .slice(0, k)
    .sort(
      rank
        ? (a, b) => rank(b) - rank(a) || (a.exposure?.uses ?? 0) - (b.exposure?.uses ?? 0)
        : (a, b) => (a.exposure?.uses ?? 0) - (b.exposure?.uses ?? 0),
    );
  const chosen = pool[0] ?? null;
  if (chosen) chosen.exposure.uses = (chosen.exposure.uses ?? 0) + 1;
  return chosen;
}

// CLI — plain-node only (argv[1] check): the content guard fired on
// IMPORT under `node -e` probes (benign $0 rebuild, but the import-CLI
// class is a standing trap — see bankGapFill).
import { existsSync } from 'node:fs';
if (
  process.argv[1]?.endsWith('composer/assets.mjs') &&
  existsSync('trellis/bank/all-items.json') &&
  !process.env.VITEST
) {
  console.log(JSON.stringify(await buildAssets(), null, 2));
}
