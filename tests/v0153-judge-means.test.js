/**
 * v0.15.3 D2 — the per-course-means ruler, pinned.
 *
 * The variance note's verdict: single judge readings are ±1 noise; the
 * teachability KPI is each course's MEAN moving. computeJudgeMeans turns
 * stored round summaries into that KPI; renderJudgeMeansSection is the
 * section every ROUND_REPORT now carries below the trajectory table.
 */
import { describe, expect, it } from 'vitest';

import {
  JUDGE_MEANS_BASELINE,
  JUDGE_MEANS_TARGET,
  computeJudgeMeans,
  renderJudgeMeansSection,
} from '../scripts/lib/crucibleRound.mjs';

const summaries = [
  {
    courses: [
      { id: 'world-lit', judge: 5 },
      { id: 'mandarin', judge: 3 },
      { id: 'cs-python', judge: null }, // judge off this round — ignored
    ],
  },
  {
    courses: [
      { id: 'world-lit', judge: 6 },
      { id: 'world-lit--voiced', judge: 6 }, // twin folds into its base course
      { id: 'mandarin', judge: 5 },
      { id: 'geology', judge: 4 }, // single reading — excluded (minN 2)
    ],
  },
];

describe('computeJudgeMeans', () => {
  const means = computeJudgeMeans(summaries);

  it('computes mean ± sd per course, sorted by mean desc', () => {
    expect(means.map((row) => row.id)).toEqual(['world-lit', 'mandarin']);
    const worldLit = means[0];
    expect(worldLit.n).toBe(3); // 5, 6, and the folded twin's 6
    expect(worldLit.mean).toBeCloseTo(5.67, 2);
    expect(worldLit.min).toBe(5);
    expect(worldLit.max).toBe(6);
    const mandarin = means[1];
    expect(mandarin.n).toBe(2);
    expect(mandarin.mean).toBe(4);
    expect(mandarin.sd).toBe(1);
  });

  it('folds tagged/twin ids into the base course (the KPI tracks course identity)', () => {
    expect(means.find((row) => row.id === 'world-lit--voiced')).toBeUndefined();
  });

  it('excludes single-reading courses — one reading is noise, per the note', () => {
    expect(means.find((row) => row.id === 'geology')).toBeUndefined();
  });
});

describe('renderJudgeMeansSection', () => {
  it('renders the KPI table with Δ against the v0.15.2 baseline', () => {
    const section = renderJudgeMeansSection(computeJudgeMeans(summaries));
    expect(section).toContain('## Per-course judge means (the KPI)');
    expect(section).toContain(JUDGE_MEANS_TARGET);
    expect(section).toContain('docs/JUDGE_VARIANCE_NOTE.md');
    // world-lit baseline 5.40 → mean 5.67 reads as +0.27
    expect(section).toContain('| world-lit | 3 | 5.67 |');
    expect(section).toContain('+0.27');
    // mandarin baseline 3.86 → mean 4.00 reads as +0.14
    expect(section).toContain('+0.14');
  });

  it('says so honestly when no course has two readings yet', () => {
    expect(renderJudgeMeansSection([])).toContain('No course has 2+ judge readings yet');
  });

  it('the baseline matches the variance note (re-baseline only on judge changes)', () => {
    expect(JUDGE_MEANS_BASELINE.means['world-lit']).toBe(5.4);
    expect(JUDGE_MEANS_BASELINE.means.mandarin).toBe(3.86);
  });
});
