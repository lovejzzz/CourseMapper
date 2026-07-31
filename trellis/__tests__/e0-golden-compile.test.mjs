// E0 — the golden compile (docs/TRELLIS.md §17): fixture graph + mock voice
// → render → the UNMODIFIED deep grader produces a score. Zero tokens.
// This is the experiment that proves the existing ruler fits Trellis output;
// its result is recorded (not asserted perfect) — findings are data.

import { describe, it, expect } from 'vitest';
import { mkdir, writeFile } from 'node:fs/promises';
import { buildResearchMethods8 } from '../fixtures/graphs/researchMethods8.mjs';
import { buildLessonSlice } from '../voice/contracts.mjs';
import { mockAuthorLesson, mockAuthorCourseWide } from '../voice/mockAuthor.mjs';
import { renderPackage, createMemoryFileProvider, FEATURE_FOLDERS } from '../render/deliverables.mjs';
import { validateGraph, blockers } from '../graph/validate.mjs';
import { grade, letterGrade, GRADER_VERSION } from '../../src/lib/quality/deepQualityGrader.js';

describe('E0 golden compile through the unmodified deep grader', () => {
  it('produces a graded package with no P0 findings', async () => {
    const graph = buildResearchMethods8();
    expect(blockers(validateGraph(graph))).toEqual([]);

    const authored = Object.fromEntries(
      graph.lessons.map((lesson) => [lesson.id, mockAuthorLesson(buildLessonSlice(graph, lesson.id))]),
    );
    const prereqEdges = graph.concepts.reduce((n, c) => n + c.requires.length, 0);
    const { files } = renderPackage({
      graph,
      authored,
      courseWide: mockAuthorCourseWide(graph),
      generatedAt: '2026-07-03T00:00:00.000Z',
      // The honest judgment line: Trellis's V2 prerequisite analysis really
      // ran (validateGraph above); the manifest discloses its verdict.
      digest: {
        judgment: `Course judgment: no gaps across ${graph.lessons.length} lessons; ${prereqEdges} prerequisite edges verified in order (V2)`,
        validation: 'V1–V7 structural invariants: 0 blockers',
        voice: 'mock (E0 zero-token compile; no quality claim)',
      },
    });

    const result = await grade({
      fileProvider: createMemoryFileProvider(files),
      course: {
        id: 'trellis-golden-rm8',
        title: graph.course.title,
        lessonCount: graph.lessons.length,
        featureIds: Object.keys(FEATURE_FOLDERS),
      },
    });

    // Record the full result as an E0 artifact for the build report.
    await mkdir('trellis/runs/e0-golden', { recursive: true });
    await writeFile(
      'trellis/runs/e0-golden/report.json',
      JSON.stringify({ graderVersion: GRADER_VERSION, result }, null, 2),
    );

    const findings = result.findings ?? [];
    const p0 = findings.filter((f) => f.severity === 'P0');
    // The E0 bar from §17: the ruler runs and yields a score; we additionally
    // hold the package to zero P0s (a P0 here means the compat layer is
    // structurally wrong, not that the mock prose is unliterary) and pin the
    // exact V1.11.6 checkpoint result. Any score drift must be reviewed rather
    // than silently spending the eight-point margin above the old floor.
    expect(typeof result.overall?.score).toBe('number');
    expect(p0, JSON.stringify(p0, null, 2)).toEqual([]);
    expect(result.overall).toEqual({ score: 98, grade: 'A' });
    expect(result.texture?.score).toBe(88);

    // eslint-disable-next-line no-console
    console.log(
      `E0: grader v${GRADER_VERSION} overall=${result.overall.score}/${result.overall.grade ?? letterGrade(result.overall.score)} ` +
        `dims=${JSON.stringify(result.scores)} findings=${findings.length} (P1=${result.stats?.p1 ?? '?'}, P2=${result.stats?.p2 ?? '?'})`,
    );
  }, 30000);
});
