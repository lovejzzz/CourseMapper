// Project Prof P3 — deterministic tests for adversary + calibration anchor.
import { describe, expect, it } from 'vitest';
import { runChaosProbe, runInjectionScan, CHAOS_COURSES, INJECTION_CORPUS } from '../prof/arenas/adversary.mjs';
import { runCs1Anchor, spearman, CONFIDENCE_LANES } from '../prof/student/calibrationAnchor.mjs';
import { deriveCourseGraphFromCourseMap } from '../../src/lib/courseGraph/deriveFromCourseMap.js';
import { buildBlueprintFromGraph } from '../../src/lib/courseGraph/blueprintFromGraph.js';
import { compileBlueprintDeliverables } from '../../src/lib/courseBlueprintCompiler.js';

const deps = { deriveCourseGraphFromCourseMap, buildBlueprintFromGraph, compileBlueprintDeliverables };

describe('adversary A5 (design §2 A5)', () => {
  it('chaos courses compile without an uncaught throw escaping the pipeline', async () => {
    const { results, findings } = await runChaosProbe(deps);
    expect(results).toHaveLength(CHAOS_COURSES.length);
    // Fault isolation must contain any failure — zero uncaught throws.
    expect(findings.filter((f) => f.instrument === 'chaos-structural')).toHaveLength(0);
    for (const row of results) expect(row.threw).toBe(false);
  });

  it('injection scan: trusted-cell passthrough is not flagged; only answer-key bleed is a P0', () => {
    const { details, findings } = runInjectionScan(deps);
    expect(details).toHaveLength(INJECTION_CORPUS.length);
    // No injection signature reaches a structural answer-key field.
    expect(findings).toHaveLength(0);
    // The scan is honest that it observed passthrough (informational).
    expect(details.some((d) => typeof d.passthrough === 'boolean')).toBe(true);
  });
});

describe('calibration anchor (design §3g)', () => {
  it('spearman ranks correctly', () => {
    expect(spearman([1, 2, 3, 4], [1, 2, 3, 4])).toBe(1);
    expect(spearman([1, 2, 3, 4], [4, 3, 2, 1])).toBe(-1);
  });

  it('the CS1 anchor reproduces harder-is-harder ordering (Spearman ≥ 0.6)', () => {
    const anchor = runCs1Anchor({ seed: 1 });
    expect(anchor.lane).toBe('cs');
    expect(anchor.spearman).toBeGreaterThanOrEqual(0.6);
    expect(anchor.anchored).toBe(true);
  });

  it('humanities lanes are declared unanchored, not faked', () => {
    expect(CONFIDENCE_LANES.humanities).toBe('unanchored');
    expect(CONFIDENCE_LANES.cs).toBe('anchored');
  });
});
