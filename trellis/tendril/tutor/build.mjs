// Tutor-in-a-File v2 bundle builder (docs/TENDRIL.md §12, Phase 2).
// One static directory: course data + Tendril-E + the diagnosis loop —
// offline after first load, $0 per use, forever.
//
//   node trellis/tendril/tutor/build.mjs [runDir]
//
// Course data comes from a REAL composed run (default e8-fresh-cs, the
// fresh-ground E8 package): authored quiz items matched back to bank
// items for familyKey/kernel, misconception correctives from the graph,
// reteach scripts and sibling re-test items from the library.

import { cp, mkdir, readFile, symlink, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tokenOverlapRatio } from '../../judgment/text.mjs';
import { familyKeyOf } from '../../knowledge/itemBank.mjs';

export async function buildTutorCourse(runDir) {
  const graph = JSON.parse(await readFile(join(runDir, 'graph.json'), 'utf8'));
  const authored = JSON.parse(await readFile(join(runDir, 'authored.json'), 'utf8'));
  const bank = JSON.parse(await readFile('trellis/bank/all-items.json', 'utf8'));
  const store = JSON.parse(await readFile('trellis/bank/assets.json', 'utf8'));

  const conceptById = new Map(graph.concepts.map((c) => [c.id, c]));
  const misconceptions = (graph.misconceptions ?? []).map((m) => ({
    ...m,
    familyKey: familyKeyOf(m.statement),
    kernelId: conceptById.get(m.conceptId)?.genomeRef ?? null,
  }));

  const stripReview = (stem) => stem.replace(/^Review:\s*/i, '');

  function bankMatch(item) {
    let best = null;
    let bestScore = 0;
    for (const b of bank.items) {
      const score = tokenOverlapRatio(stripReview(item.stem), b.stem);
      if (score > bestScore) {
        bestScore = score;
        best = b;
      }
    }
    return bestScore >= 0.85 ? best : null;
  }

  function reteachFor(kernelId) {
    const asset =
      store.assets.find((a) => a.kernelId === kernelId && a.move === 'reteach-script') ??
      store.assets.find((a) => a.kernelId === kernelId && a.move === 'worked-example');
    return asset?.body?.text ?? null;
  }

  function siblingFor(bankItem) {
    const sib = bank.items.find(
      (b) =>
        b.kernelId === bankItem.kernelId &&
        b.familyKey === bankItem.familyKey &&
        b.id !== bankItem.id &&
        tokenOverlapRatio(b.stem, bankItem.stem) < 0.6,
    );
    return sib
      ? { stem: sib.stem, options: sib.options, correctIndex: sib.correctIndex, explanation: sib.explanation }
      : null;
  }

  const lessons = [];
  let matched = 0;
  let total = 0;
  for (const lesson of graph.lessons) {
  const art = authored[lesson.id];
  if (!art?.quizItems?.length) continue;
  const items = art.quizItems.map((item) => {
    total += 1;
    const b = bankMatch(item);
    if (b) matched += 1;
    const misconception = b
      ? misconceptions.find((m) => m.kernelId === b.kernelId && m.familyKey === b.familyKey)
      : null;
    return {
      stem: item.stem,
      options: item.options,
      correctIndex: item.correctIndex,
      explanation: item.explanation,
      familyKey: b?.familyKey ?? null,
      kernelId: b?.kernelId ?? null,
      corrective: misconception?.corrective ?? null,
      misconception: misconception?.statement ?? null,
      reteach: b ? reteachFor(b.kernelId) : null,
      sibling: b ? siblingFor(b) : null,
    };
  });
    lessons.push({ id: lesson.id, title: lesson.title, week: lesson.week, items });
  }

  const course = {
    stamp:
      'Tendril Tutor v2 — offline; diagnosis profile measured in T-M1c (81.7% family accuracy, 33% false-fire mitigated by confirm-style prompts)',
    course: graph.course,
    profile: { floor: 0.35, margin: 0 },
    model: { id: 'tendril-e2c', dim: 384 },
    lessons,
  };
  return {
    course,
    stats: {
      lessons: lessons.length,
      items: total,
      bankMatched: matched,
      withCorrective: lessons.reduce((s, l) => s + l.items.filter((i) => i.corrective).length, 0),
      withSibling: lessons.reduce((s, l) => s + l.items.filter((i) => i.sibling).length, 0),
    },
  };
}

// assets 'copy' → fully self-contained bundle (the shippable artifact);
// assets 'link' → per-run bundles symlink the shared ~76MB of model +
// vendor files instead of duplicating them per course.
export async function writeTutorBundle(course, outDir, { assets = 'copy' } = {}) {
  await mkdir(join(outDir, 'vendor'), { recursive: true });
  await writeFile(join(outDir, 'course.json'), JSON.stringify(course, null, 1));
  await cp('trellis/tendril/tutor/index.html', join(outDir, 'index.html'));
  if (assets === 'link') {
    await rm(join(outDir, 'vendor'), { recursive: true, force: true });
    for (const [target, name] of [
      ['trellis/tendril/models', 'models'],
      ['trellis/tendril/tutor/bundle/vendor', 'vendor'],
    ]) {
      await rm(join(outDir, name), { recursive: true, force: true });
      await symlink(resolve(target), join(outDir, name), 'dir');
    }
    return;
  }
  await cp('trellis/tendril/models/tendril-e2c', join(outDir, 'models', 'tendril-e2c'), { recursive: true });
  await cp('node_modules/@huggingface/transformers/dist/transformers.min.js', join(outDir, 'vendor/transformers.min.js'));
  // ORT probes backend variants at runtime (jsep/asyncify/jspi/plain) —
  // ship every loader+wasm pair it might resolve to.
  const { readdir: readDir } = await import('node:fs/promises');
  for (const dir of ['node_modules/@huggingface/transformers/dist', 'node_modules/onnxruntime-web/dist']) {
    for (const f of await readDir(dir)) {
      if (f.startsWith('ort-wasm-simd-threaded')) await cp(join(dir, f), join(outDir, 'vendor', f));
    }
  }
}

// CLI — plain-node: node trellis/tendril/tutor/build.mjs [runDir]
if (process.argv[1]?.endsWith('tutor/build.mjs') && !process.env.VITEST) {
  const runDir = process.argv[2] ?? 'trellis/runs/e8-fresh-cs';
  const { course, stats } = await buildTutorCourse(runDir);
  await writeTutorBundle(course, 'trellis/tendril/tutor/bundle', { assets: 'copy' });
  console.log(JSON.stringify(stats, null, 2));
}
