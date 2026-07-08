import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  DEFAULT_SCION_COURSES,
  buildCrucibleArgs,
  buildScionGauntletSummary,
  evaluateScionGauntlet,
  extractLocalModelIds,
  providerCourseId,
  renderScionGauntletMarkdown,
  resolveScionCourseIds,
  writeScionGauntletReport,
} from '../scripts/lib/scionGauntlet.mjs';

async function writeCourseFixture(roundDir, courseId, overrides = {}) {
  const dir = path.join(roundDir, providerCourseId(courseId, 'local'));
  await fs.mkdir(dir, { recursive: true });
  const report = {
    courseId: providerCourseId(courseId, 'local'),
    run: { status: overrides.status || 'passed', durationMs: overrides.durationMs || 120000 },
    normalized: {
      overall: overrides.overall ?? 99,
      overallGrade: 'A',
      scores: { texture: overrides.texture ?? 96 },
      p0Count: overrides.p0 ?? 0,
      p1Count: overrides.p1 ?? 0,
      findings: [],
      status: 'graded',
    },
  };
  const digest = {
    run: { provider: 'local', models: ['scion-1.2'] },
    cost: { totalUsd: overrides.costUsd ?? 0, totalDisplay: '$0.00' },
  };
  const course = {
    id: providerCourseId(courseId, 'local'),
    baseId: courseId,
    title: courseId,
    provider: 'local',
    modelId: 'scion-1.2',
  };
  await fs.writeFile(path.join(dir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  await fs.writeFile(path.join(dir, 'digest.json'), `${JSON.stringify(digest, null, 2)}\n`);
  await fs.writeFile(path.join(dir, 'course.json'), `${JSON.stringify(course, null, 2)}\n`);
}

describe('Scion-1.2 gauntlet helper', () => {
  it('defines the real-course default set and local Crucible command', () => {
    expect(resolveScionCourseIds('scion12')).toEqual(DEFAULT_SCION_COURSES);
    expect(resolveScionCourseIds('scion11')).toEqual(DEFAULT_SCION_COURSES);
    expect(resolveScionCourseIds('music-theory,cs-python')).toEqual(['music-theory', 'cs-python']);
    expect(buildCrucibleArgs({ courses: 'scion12', provider: 'local', model: 'scion-1.2' }).slice(0, 3)).toEqual([
      'scripts/crucible.mjs',
      '--courses',
      DEFAULT_SCION_COURSES.join(','),
    ]);
    expect(buildCrucibleArgs({ courses: 'music-theory', provider: 'local', model: 'scion-1.2' })).toEqual([
      'scripts/crucible.mjs',
      '--courses',
      'music-theory',
      '--provider',
      'local',
      '--model',
      'scion-1.2',
      '--concurrency',
      '1',
    ]);
  });

  it('extracts advertised local model ids for stale-shim rejection', () => {
    expect(
      extractLocalModelIds({
        data: [{ id: 'scion-1' }, { id: 'scion-1.1' }, { id: 'scion-1.2' }, { object: 'model' }],
      }),
    ).toEqual(['scion-1', 'scion-1.1', 'scion-1.2']);
  });

  it('passes only when every Scion-1.2 threshold is met', () => {
    const good = evaluateScionGauntlet({
      entries: [
        { courseId: 'music-theory--local', status: 'passed', overall: 99, texture: 96, p0: 0, p1: 0, costUsd: 0 },
        { courseId: 'cs-python--local', status: 'passed', overall: 98, texture: 92, p0: 0, p1: 1, costUsd: 0 },
      ],
    });
    expect(good.passed).toBe(true);
    expect(good.metrics.avgOverall).toBe(98.5);

    const bad = evaluateScionGauntlet({
      entries: [{ courseId: 'geology--local', status: 'passed', overall: 97, texture: 91, p0: 0, p1: 2, costUsd: 0 }],
    });
    expect(bad.passed).toBe(false);
    expect(bad.checks.filter((check) => !check.passed).map((check) => check.name)).toEqual([
      'every course has P1 <= 1',
      'every course overall >= 98',
      'every course texture >= 92',
    ]);
  });

  it('loads a Crucible round fixture and writes Markdown plus JSON reports', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'scion-gauntlet-'));
    try {
      const roundDir = path.join(tempRoot, 'round-2026-07-08T00-00-00-000Z');
      await writeCourseFixture(roundDir, 'music-theory');
      await writeCourseFixture(roundDir, 'cs-python');

      const summary = await buildScionGauntletSummary({
        roundDir,
        courses: 'music-theory,cs-python',
        label: 'fixture',
      });
      expect(summary.evaluation.passed).toBe(true);
      expect(summary.entries.map((entry) => entry.courseId)).toEqual(['music-theory--local', 'cs-python--local']);

      const markdown = renderScionGauntletMarkdown(summary);
      expect(markdown).toContain('# Scion-1.2 Gauntlet');
      expect(markdown).toContain('| music-theory--local | passed | 99/A | 96 | 0 | 0 | $0.00 | 120s | scion-1.2 |');

      const paths = await writeScionGauntletReport(summary, { outputRoot: path.join(tempRoot, 'gauntlet') });
      await expect(fs.readFile(paths.mdPath, 'utf8')).resolves.toContain('Status: PASS');
      await expect(fs.readFile(path.join(tempRoot, 'gauntlet', 'latest.json'), 'utf8')).resolves.toContain(
        '"passed": true',
      );
    } finally {
      await fs.rm(tempRoot, { recursive: true, force: true });
    }
  });
});
