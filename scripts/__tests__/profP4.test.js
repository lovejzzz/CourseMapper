// Project Prof P4 — deterministic tests for the Reality Anchor machinery and
// the longitudinal roll-up (human anchor rounds themselves are out of scope).
import { describe, expect, it } from 'vitest';
import { humanAnchorTemplate, computeSimToRealAgreement, anchorFreshness } from '../prof/realityAnchor.mjs';
import { rollUp, renderRollUp } from '../prof/longitudinal.mjs';

describe('Reality Anchor machinery (design §9)', () => {
  it('the human template mirrors the persona verdict schema', () => {
    const template = humanAnchorTemplate({ scenarioId: 'x', packageDir: 'pkg' });
    expect(template.schema).toBe('reality-anchor-v1');
    expect(template.verdict).toHaveProperty('tier');
    expect(template.verdict).toHaveProperty('teachAsIs');
    expect(template.verdict.findings[0]).toHaveProperty('quote');
  });

  it('computes tier agreement, teach delta, and objection overlap', () => {
    const simVerdicts = [
      {
        tier: 'export-safe',
        teachAsIs: 3,
        findings: [{ file: 'Syllabus', quote: 'the outcomes are not measurable as written' }],
      },
      {
        tier: 'structured-complete',
        teachAsIs: 4,
        findings: [{ file: 'Syllabus', quote: 'template filler with no discipline content' }],
      },
    ];
    const humanVerdicts = [
      {
        verdict: {
          tier: 'export-safe',
          teachAsIs: 3,
          findings: [{ file: 'Syllabus', quote: 'the outcomes are not measurable and vague' }],
        },
      },
    ];
    const agreement = computeSimToRealAgreement({ simVerdicts, humanVerdicts });
    expect(agreement.status).toBe('computed');
    expect(agreement.tierAgreement).toBe(1); // human export-safe within 1 of sim mean
    expect(agreement.teachDelta).toBeLessThanOrEqual(1);
    expect(agreement.objectionOverlap).toBeGreaterThan(0); // "outcomes ... measurable" overlaps
  });

  it('no-data when either side is empty', () => {
    expect(computeSimToRealAgreement({ simVerdicts: [], humanVerdicts: [] }).status).toBe('no-data');
  });

  it('UNANCHORED stamp trips with no rounds and when stale', () => {
    expect(anchorFreshness({ anchorRounds: [], currentRelease: { ordinal: 5 } }).anchored).toBe(false);
    const stale = anchorFreshness({
      anchorRounds: [{ releaseOrdinal: 1, date: 'old' }],
      currentRelease: { ordinal: 5 },
      maxAgeRounds: 2,
    });
    expect(stale.anchored).toBe(false);
    const fresh = anchorFreshness({
      anchorRounds: [{ releaseOrdinal: 4, date: 'recent' }],
      currentRelease: { ordinal: 5 },
      maxAgeRounds: 2,
    });
    expect(fresh.anchored).toBe(true);
  });
});

describe('longitudinal roll-up (design §11 P4)', () => {
  it('rolls up course-mode terms only and renders a table', () => {
    const terms = [
      {
        termId: 'term-a',
        term: { mode: 'course', startedAt: '2026-07-02T01' },
        scenario: { id: 'cs' },
        kpis: { adoptionRate: 0, teachAsIs: { mean: 3.4, ci95: [2.7, 4.1] } },
        findings: [1, 2, 3],
      },
      {
        termId: 'term-b',
        term: { mode: 'instrument', startedAt: '2026-07-02T02' }, // excluded
        scenario: { id: 'cal' },
        kpis: { adoptionRate: 0, teachAsIs: { mean: 1.7, ci95: [1.3, 2.1] } },
        findings: [],
      },
      {
        termId: 'term-c',
        term: { mode: 'course', startedAt: '2026-07-02T03' },
        scenario: { id: 'rm' },
        itemSummary: { healthyFraction: 0.77 },
        misconceptions: { repairRate: 0 },
        coverage: { covered: 14, total: 75 },
        findings: [1],
      },
    ];
    const rollup = rollUp(terms);
    expect(rollup.courseTerms).toBe(2);
    expect(rollup.adoption).toHaveLength(1);
    expect(rollup.classroom).toHaveLength(1);
    expect(rollup.latestAdoption.teachAsIs).toBe(3.4);
    const md = renderRollUp(rollup);
    expect(md).toContain('Longitudinal Roll-Up');
    expect(md).toContain('SIMULATED');
  });
});
