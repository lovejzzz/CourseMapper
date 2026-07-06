// The Researcher — orchestrator + deposits (RESEARCHER.md §8).
// Targets in, cited library growth out: gather → shape → verify →
// deposit, everything ledgered, every deposit additive and rebuild-safe
// (RS-4). Spend-capable CLI is env-gated (the bankGapFill lesson).
//
//   RESEARCH=run npx vite-node trellis/researcher/researcher.mjs <targets.json>

import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { createRunLedger } from '../telemetry.mjs';
import { gatherSources } from './sources.mjs';
import { shapeKernel, shapeSurfaces, shapeItems } from './shape.mjs';
import { zeroShapeKernel, zeroShapeSurfaces, zeroShapeItems, mineExamples } from './zeroShape.mjs';
import { makeEmbedder } from '../tendril/embedder.mjs';
import { startS, stopS } from '../tendril/sModel.mjs';
import { solveGate } from '../composer/solver.mjs';

const RESEARCHER_ASSETS = 'trellis/bank/researcher-assets.json';

async function depositKernel(shardPath, target, shaped) {
  const shard = JSON.parse(await readFile(shardPath, 'utf8'));
  if (shard.kernels.some((k) => k.id === target.id)) return false; // additive only
  shard.kernels.push({
    id: target.id,
    term: target.term,
    aliases: target.aliases ?? [],
    discipline: shard.discipline,
    level: 'intro',
    difficulty: 2,
    bloomCeiling: 'analyze',
    definition: { text: shaped.definition },
    facts: shaped.facts,
    misconceptions: shaped.misconceptions.map((m) => ({ text: m.text, corrective: m.corrective })),
    examples: [],
    workedExamples: shaped.workedExample ? [{ text: shaped.workedExample }] : [],
    variants: [],
    mcBank: [],
    edges: [],
    tags: ['researcher'],
    standards: [],
    license: 'CC-BY-SA-4.0',
    attribution: shaped.facts[0]?.anchor?.src ? `Wikipedia (see fact anchors)` : 'open sources (see anchors)',
    freshness: new Date().toISOString().slice(0, 10),
    rev: 1,
  });
  await writeFile(shardPath, JSON.stringify(shard, null, 1));
  // Manifest consistency (foundry admission test): conceptCount tracks
  // the shard body on every deposit.
  try {
    const manifestPath = 'public/genome/manifest.json';
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    const name = shardPath.split('/').pop();
    for (const entry of manifest.shards) {
      if ((entry.file ?? `${entry.id}.json`) === name) entry.conceptCount = shard.kernels.length;
    }
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  } catch {
    /* manifest formats vary in fixtures; the admission test guards the real one */
  }
  return true;
}

// ENRICH an existing thin kernel (the physics/stats/chem class: kernels
// present but below the authoring floor of ≥2 misconceptions / ≥3 facts).
// Strictly additive: mined entries append after a token-overlap dedupe against
// what is already there; nothing existing is touched; rev bumps.
async function enrichKernel(shardPath, targetId, mined) {
  const { tokenOverlapRatio } = await import('../judgment/text.mjs');
  const shard = JSON.parse(await readFile(shardPath, 'utf8'));
  const kernel = shard.kernels.find((k) => k.id === targetId);
  if (!kernel) return { added: 0 };
  let added = 0;
  const dup = (texts, text) => texts.some((t) => tokenOverlapRatio(t, text) > 0.6);
  kernel.misconceptions ??= [];
  for (const m of mined.misconceptions ?? []) {
    if (kernel.misconceptions.length >= 3) break;
    if (
      dup(
        kernel.misconceptions.map((x) => x.text),
        m.text,
      )
    )
      continue;
    kernel.misconceptions.push({
      text: m.text,
      corrective: m.corrective,
      ...(m.documentedIn ? { documentedIn: m.documentedIn } : {}),
    });
    added += 1;
  }
  kernel.facts ??= [];
  for (const f of mined.facts ?? []) {
    if (kernel.facts.length >= 6) break;
    if (
      dup(
        kernel.facts.map((x) => x.text),
        f.text,
      )
    )
      continue;
    kernel.facts.push(f);
    added += 1;
  }
  if (added > 0) {
    kernel.rev = (kernel.rev ?? 1) + 1;
    await writeFile(shardPath, JSON.stringify(shard, null, 1));
  }
  return { added, misconceptions: kernel.misconceptions.length, facts: kernel.facts.length };
}

// Paid misconception top-up (the documented $0 bound: confrontation pedagogy
// needs wrong beliefs, and some disciplines' sources never STATE them; a
// disclosed cents-call on the cheap tier fills the gap, grounded in the same
// fetched sources). Used only when mining + enrich leave a kernel below the
// ≥2 floor and a ledger is present.
async function authorMisconceptionsPaid(target, sources, { ledger, budgetUsd }) {
  const { callModel } = await import('../providers.mjs');
  const { result } = await callModel({
    tier: 'cheap',
    stage: 'research-misconceptions',
    ledger,
    budgetUsd,
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['misconceptions'],
      properties: {
        misconceptions: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['text', 'corrective'],
            properties: { text: { type: 'string' }, corrective: { type: 'string' } },
          },
        },
      },
    },
    schemaName: 'research_misconceptions',
    validate: (o) => ((o?.misconceptions ?? []).length >= 2 ? [] : ['need >=2']),
    maxOutputTokens: 800,
    system:
      'From the provided source texts, write 2-3 misconceptions REAL students hold about this topic. Each: text phrased "Students ..." (a specific wrong belief with its plausible wrong reasoning, >=20 words), and a one-sentence corrective grounded in the sources. Never invent facts the sources do not support.',
    user: JSON.stringify({
      term: target.term,
      sources: sources.map((x) => ({ title: x.title, text: x.text.slice(0, 4000) })),
    }),
  });
  return (result.misconceptions ?? []).filter((m) => (m.text ?? '').length >= 20 && (m.corrective ?? '').length >= 15);
}

async function depositAssets(assets) {
  let store = { stamp: 'Researcher deposits — cited, rebuild-safe (merged by buildAssets)', assets: [] };
  try {
    store = JSON.parse(await readFile(RESEARCHER_ASSETS, 'utf8'));
  } catch {
    /* first deposit */
  }
  const known = new Set(store.assets.map((a) => a.id));
  for (const asset of assets) if (!known.has(asset.id)) store.assets.push(asset);
  await writeFile(RESEARCHER_ASSETS, JSON.stringify(store, null, 1));
  return store.assets.length;
}

async function depositItems(items) {
  const bank = JSON.parse(await readFile('trellis/bank/all-items.json', 'utf8'));
  const known = new Set(bank.items.map((i) => i.id));
  let added = 0;
  for (const item of items) {
    if (known.has(item.id)) continue;
    bank.items.push(item);
    added += 1;
  }
  if (added > 0) await writeFile('trellis/bank/all-items.json', JSON.stringify(bank, null, 1));
  return added;
}

export async function research(targetsPath, { budgetUsd = 0.35, runId = 'researcher-r0' } = {}) {
  const spec = JSON.parse(await readFile(targetsPath, 'utf8'));
  const bank = JSON.parse(await readFile('trellis/bank/all-items.json', 'utf8'));
  const ledger = createRunLedger({ runId, runDir: `trellis/runs/${runId}` });
  const report = { targets: 0, kernelsDeposited: 0, assetsDeposited: 0, itemsDeposited: 0, perTarget: {} };
  try {
    for (const group of spec.groups) {
      for (const target of group.kernels) {
        report.targets += 1;
        const entry = { sources: 0 };
        report.perTarget[target.id] = entry;
        try {
          const sources = await gatherSources(target.queries ?? [target.term], { cap: 3 });
          entry.sources = sources.length;
          if (sources.length === 0) {
            entry.verdict = 'NO SOURCES — gap stays disclosed';
            continue;
          }
          // kernel: shape only if missing from the shard
          const shard = JSON.parse(await readFile(group.shard, 'utf8'));
          let kernel = shard.kernels.find((k) => k.id === target.id);
          if (!kernel) {
            const shaped = await shapeKernel({ ...target, discipline: shard.discipline }, sources, {
              ledger,
              budgetUsd,
            });
            entry.droppedFacts = shaped.droppedFacts;
            if (!shaped.ok) {
              entry.verdict = `kernel REJECTED (facts ${shaped.facts.length}, misconceptions ${shaped.misconceptions.length})`;
              continue;
            }
            await depositKernel(group.shard, target, shaped);
            report.kernelsDeposited += 1;
            kernel = {
              definition: { text: shaped.definition },
              facts: shaped.facts,
              misconceptions: shaped.misconceptions,
            };
            entry.kernel = `deposited (${shaped.facts.length} anchored facts, ${shaped.droppedFacts} dropped un-anchored)`;
          } else {
            kernel = {
              definition: kernel.definition,
              facts: kernel.facts,
              misconceptions: (kernel.misconceptions ?? []).map((m) => ({ text: m.text, corrective: m.corrective })),
            };
            entry.kernel = 'existing';
          }
          // surfaces
          const surf = await shapeSurfaces(
            { ...target, discipline: shard.discipline },
            sources,
            {
              definition: kernel.definition?.text ?? kernel.definition,
              misconceptions: kernel.misconceptions,
            },
            { ledger, budgetUsd },
          );
          report.assetsDeposited += surf.assets.length;
          await depositAssets(surf.assets);
          entry.assets = surf.assets.length;
          if (Object.keys(surf.rejected).length > 0) entry.assetRejects = surf.rejected;
          // items (only if the kernel has usable misconceptions)
          if ((kernel.misconceptions ?? []).length >= 2) {
            const shelf = bank.items.filter((b) => b.kernelId === target.id);
            const items = await shapeItems({ ...target }, kernel, shelf, { ledger, budgetUsd });
            const added = await depositItems(items.accepted);
            report.itemsDeposited += added;
            entry.items = added;
            if (Object.keys(items.rejections).length > 0) entry.itemRejects = items.rejections;
          }
          entry.verdict = 'ok';
        } catch (error) {
          entry.verdict = `FAILED: ${String(error.message).slice(0, 100)}`;
        }
      }
    }
  } finally {
    await ledger.flush();
  }
  return report;
}

// ── The ZERO-deposit runner (L1) ───────────────────────────────────────────
// Fills library coverage at (almost) $0: Researcher-Zero extracts kernels and
// SELECTS source sentences for every prose surface (span-anchored by
// construction), Tendril-S skins the seams, and Gemma 4 E2B authors the items.
// Kernels + surfaces are pure $0. The blind cross-family SOLVER is the one paid
// seat (~cents/run, by design) so DEPOSITED items are trustworthy — the FACTORY
// costs cents, the PRODUCT (zero replay) is $0 forever. Pass verifyItems:false
// for strict-$0 (items ship gate-only, solverVerified:false, disclosed).
export async function researchZero(
  targetsPath,
  { runId = 'researcher-zero-fill', verifyItems = true, budgetUsd = 0.25 } = {},
) {
  const spec = JSON.parse(await readFile(targetsPath, 'utf8'));
  const bank = JSON.parse(await readFile('trellis/bank/all-items.json', 'utf8'));
  const ledger = createRunLedger({ runId, runDir: `trellis/runs/${runId}` });
  const embedder = makeEmbedder();
  await startS();
  const solver = verifyItems ? (item, opts) => solveGate(item, opts) : null;
  const report = {
    mode: 'zero',
    verifyItems,
    targets: 0,
    kernelsDeposited: 0,
    assetsDeposited: 0,
    itemsDeposited: 0,
    perTarget: {},
  };
  try {
    for (const group of spec.groups) {
      const shard = JSON.parse(await readFile(group.shard, 'utf8'));
      for (const target of group.kernels) {
        report.targets += 1;
        const entry = { sources: 0 };
        report.perTarget[target.id] = entry;
        try {
          const sources = await gatherSources(target.queries ?? [target.term], { cap: 3 });
          entry.sources = sources.length;
          if (sources.length === 0) {
            entry.verdict = 'NO SOURCES — gap stays disclosed';
            continue;
          }
          // kernel: reuse the shard's if present, else extract at $0.
          let kernel = shard.kernels.find((k) => k.id === target.id);
          // ENRICH existing-but-thin kernels (below the ≥2 misconceptions /
          // ≥3 facts authoring floor): mine at $0 and merge additively.
          if (kernel && ((kernel.misconceptions ?? []).length < 2 || (kernel.facts ?? []).length < 3)) {
            const mined = await zeroShapeKernel({ ...target, discipline: shard.discipline }, sources, { embedder });
            const merged = await enrichKernel(group.shard, target.id, mined);
            if (merged.added > 0) {
              const fresh = JSON.parse(await readFile(group.shard, 'utf8'));
              kernel = fresh.kernels.find((k) => k.id === target.id);
              entry.enriched = `+${merged.added} (now ${merged.misconceptions} misconceptions, ${merged.facts} facts)`;
            }
          }
          // Sources state no wrong beliefs -> the disclosed paid top-up (cents).
          if (kernel && (kernel.misconceptions ?? []).length < 2 && ledger) {
            try {
              const authored = await authorMisconceptionsPaid({ ...target }, sources, { ledger, budgetUsd });
              const merged = await enrichKernel(group.shard, target.id, { misconceptions: authored, facts: [] });
              if (merged.added > 0) {
                const fresh = JSON.parse(await readFile(group.shard, 'utf8'));
                kernel = fresh.kernels.find((k) => k.id === target.id);
                entry.paidMisconceptions = merged.added;
              }
            } catch (error) {
              entry.paidMisconceptions = `failed: ${String(error.message).slice(0, 60)}`;
            }
          }
          if (kernel) {
            kernel = {
              // shard definitions are {text}; the zero shapers want a string.
              definition: kernel.definition?.text ?? kernel.definition,
              facts: kernel.facts,
              misconceptions: (kernel.misconceptions ?? []).map((m) => ({ text: m.text, corrective: m.corrective })),
              // Shard kernels carry no example sentences, but the sources do —
              // and worked-example (a plan segment) ships only with them.
              exampleSentences: mineExamples(sources),
            };
            entry.kernel = 'existing';
          } else {
            const shaped = await zeroShapeKernel({ ...target, discipline: shard.discipline }, sources, { embedder });
            if (!shaped.ok) {
              entry.verdict = `kernel REJECTED at $0 (facts ${shaped.facts.length})`;
              continue;
            }
            await depositKernel(group.shard, target, shaped);
            report.kernelsDeposited += 1;
            kernel = shaped;
            entry.kernel = `deposited ($0, ${shaped.facts.length} extractive facts, ${shaped.misconceptions.length} mined misconceptions)`;
          }
          // surfaces at $0 (S-skinned, fidelity-gated).
          const surf = await zeroShapeSurfaces({ ...target, discipline: shard.discipline }, sources, kernel, {
            embedder,
          });
          report.assetsDeposited += surf.assets.length;
          await depositAssets(surf.assets);
          entry.assets = surf.assets.length;
          entry.skin = surf.skin;
          if (Object.keys(surf.rejected).length > 0) entry.assetRejects = surf.rejected;
          // items: E2B authors ($0), solver seat verifies (the one paid seat).
          if ((kernel.misconceptions ?? []).length >= 2) {
            const shelf = bank.items.filter((b) => b.kernelId === target.id);
            const items = await zeroShapeItems({ id: target.id, term: target.term }, kernel, shelf, {
              solver,
              ledger,
              budgetUsd,
            });
            const added = await depositItems(items.accepted);
            report.itemsDeposited += added;
            entry.items = added;
            if (Object.keys(items.rejections).length > 0) entry.itemRejects = items.rejections;
          } else entry.items = 'skipped (thin misconceptions)';
          entry.verdict = 'ok';
        } catch (error) {
          entry.verdict = `FAILED: ${String(error.message).slice(0, 100)}`;
        }
      }
    }
  } finally {
    stopS();
    await ledger.flush();
  }
  report.ledgerUsd = ledger.totals().usd;
  return report;
}

if (process.env.RESEARCH === 'run' && !process.env.VITEST) {
  const targetsPath = process.argv[2] ?? process.argv[process.argv.length - 1];
  if (!targetsPath || !existsSync(targetsPath)) {
    console.error('usage: RESEARCH=run npx vite-node trellis/researcher/researcher.mjs <targets.json>');
    process.exit(1);
  }
  console.log(JSON.stringify(await research(targetsPath), null, 2));
}

if (process.env.RESEARCH_ZERO === 'run' && !process.env.VITEST) {
  const targetsPath = process.argv[2] ?? process.argv[process.argv.length - 1];
  if (!targetsPath || !existsSync(targetsPath)) {
    console.error('usage: RESEARCH_ZERO=run npx vite-node trellis/researcher/researcher.mjs <targets.json>');
    process.exit(1);
  }
  console.log(JSON.stringify(await researchZero(targetsPath, { verifyItems: process.env.NO_VERIFY !== '1' }), null, 2));
}
