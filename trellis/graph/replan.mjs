// Mid-semester replanning — docs/TRELLIS.md D4/§18 M4.
// Weeks already taught are LOCKED: their lessons (and authored content) are
// never touched. A dropped lesson (snow day, bombed session) redistributes
// its concepts and outcomes forward into unlocked lessons under the pacing
// cap; its lesson-anchored assessments re-anchor with registry keys verbatim
// (V6/V3 hold by construction — weights and keys are never rewritten).

import { orderedLessons } from './schema.mjs';
import { validateGraph, blockers, PACING_CAP_DEFAULT } from './validate.mjs';
import { dirtyLessons } from './diff.mjs';

export function parseLockWeeks(spec) {
  if (!spec) return new Set();
  const match = /^(\d+)-(\d+)$/.exec(String(spec));
  if (match) {
    const [from, to] = [Number(match[1]), Number(match[2])];
    return new Set(Array.from({ length: to - from + 1 }, (_, i) => from + i));
  }
  return new Set(
    String(spec)
      .split(',')
      .map((part) => Number(part.trim()))
      .filter(Number.isInteger),
  );
}

export function replanGraph(
  graph,
  { lockWeeks = new Set(), dropLessonId = null, pacingCap = PACING_CAP_DEFAULT } = {},
) {
  const next = structuredClone(graph);
  const ordered = orderedLessons(next);

  if (dropLessonId) {
    const dropIndex = ordered.findIndex((lesson) => lesson.id === dropLessonId);
    if (dropIndex === -1) throw new Error(`replan: unknown lesson "${dropLessonId}"`);
    const dropped = ordered[dropIndex];
    if (lockWeeks.has(dropped.week))
      throw new Error(`replan: lesson "${dropLessonId}" is in a locked week (${dropped.week})`);

    // Receivers: subsequent unlocked lessons, pacing-cap respecting.
    const receivers = ordered.slice(dropIndex + 1).filter((lesson) => !lockWeeks.has(lesson.week));
    if (receivers.length === 0)
      throw new Error('replan: no unlocked lesson after the dropped one to receive its concepts');
    let pending = [...dropped.introduces];
    for (const receiver of receivers) {
      while (pending.length > 0 && receiver.introduces.length < pacingCap) {
        receiver.introduces.push(pending.shift());
      }
      if (pending.length === 0) break;
    }
    if (pending.length > 0) {
      // Honest overflow: the last receiver reinforces what it cannot introduce
      // under the cap — surfaced in the summary, never silently dropped.
      receivers[receivers.length - 1].reinforces.push(...pending);
    }
    const firstReceiver = receivers[0];
    firstReceiver.outcomeIds = [...new Set([...firstReceiver.outcomeIds, ...dropped.outcomeIds])];
    for (const assessment of next.assessments) {
      if (assessment.anchor.lessonId === dropped.id) assessment.anchor = { lessonId: firstReceiver.id };
    }
    next.lessons = next.lessons.filter((lesson) => lesson.id !== dropped.id);
  }

  const findings = validateGraph(next, { pacingCap });
  const blocking = blockers(findings);
  if (blocking.length > 0) {
    throw new Error(
      `replan produced an invalid graph:\n${blocking.map((f) => `- [${f.code}] ${f.message}`).join('\n')}`,
    );
  }
  const delta = dirtyLessons(graph, next);
  const locked = orderedLessons(next)
    .filter((lesson) => lockWeeks.has(lesson.week))
    .map((lesson) => lesson.id);
  const lockedDirty = delta.dirty.filter((id) => locked.includes(id));
  return { graph: next, delta, locked, lockedDirty, findings };
}

// CLI entry: replans a stored run (graph.json + authored.json on disk),
// re-authoring only dirty lessons with the mock voice (live re-authoring is
// the same call with a tier — E4's incremental-cost measurement).
export async function replanRun({ runDir, lockWeeks: lockSpec, dropLessonId, note }) {
  const { readFile, writeFile } = await import('node:fs/promises');
  const { join } = await import('node:path');
  const graph = JSON.parse(await readFile(join(runDir, 'graph.json'), 'utf8'));
  const authored = JSON.parse(await readFile(join(runDir, 'authored.json'), 'utf8'));
  const lockWeeks = parseLockWeeks(lockSpec);

  const { graph: replanned, delta, locked, lockedDirty } = replanGraph(graph, { lockWeeks, dropLessonId });
  const { buildLessonSlice } = await import('../voice/contracts.mjs');
  const { mockAuthorLesson } = await import('../voice/mockAuthor.mjs');
  const nextAuthored = {};
  for (const lesson of replanned.lessons) {
    nextAuthored[lesson.id] = delta.dirty.includes(lesson.id)
      ? mockAuthorLesson(buildLessonSlice(replanned, lesson.id))
      : authored[lesson.id];
  }

  await writeFile(join(runDir, 'graph.replanned.json'), JSON.stringify(replanned, null, 2));
  await writeFile(join(runDir, 'authored.replanned.json'), JSON.stringify(nextAuthored, null, 2));
  const summary = {
    note,
    locked,
    lockedUntouched: lockedDirty.length === 0,
    reAuthored: delta.dirty,
    preserved: delta.unchanged,
    removed: delta.removed,
    registryIntact: replanned.assessments.length === graph.assessments.length,
  };
  await writeFile(join(runDir, 'replan.summary.json'), JSON.stringify(summary, null, 2));
  return { graph: replanned, authored: nextAuthored, summary };
}
