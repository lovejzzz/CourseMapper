// Project Prof — same-generation twin harness (deterministic pieces).
import { describe, expect, it } from 'vitest';
import { blindAssignments, pairedDeltaStats, assertTwinProvenance } from '../prof/twinStats.mjs';
import { validateTwinVerdict, unblind } from '../prof/arenas/adoptionTwin.mjs';

describe('blind assignment', () => {
  it('is deterministic for a seed and balanced across universes', () => {
    const a = blindAssignments(8, 42);
    const b = blindAssignments(8, 42);
    expect(a).toEqual(b);
    const aFirst = a.filter((x) => x.aIsPacketOne).length;
    expect(aFirst).toBe(4); // alternating from a seeded start → exact split on even N
  });

  it('different seeds can start differently but stay balanced', () => {
    const counts = blindAssignments(7, 7).filter((x) => x.aIsPacketOne).length;
    expect(counts === 3 || counts === 4).toBe(true); // odd N: as even as parity allows
  });
});

describe('paired delta statistics', () => {
  it('computes the delta CI and win/loss/tie record', () => {
    // Consistent deltas [1,1,1,2]: mean 1.25, sd 0.5 → CI ≈ [0.45, 2.05].
    // This is the twin's whole point — paired deltas this consistent are
    // significant at n=4, where independent-round CIs would swamp them.
    const pairs = [
      { teachA: 3, teachB: 4, preference: 'B' },
      { teachA: 4, teachB: 5, preference: 'B' },
      { teachA: 3, teachB: 4, preference: 'B' },
      { teachA: 4, teachB: 6, preference: 'B' },
    ];
    const stats = pairedDeltaStats(pairs);
    expect(stats.n).toBe(4);
    expect(stats.deltaMean).toBeCloseTo(1.25, 5);
    expect(stats.wins).toBe(4);
    expect(stats.ties).toBe(0);
    expect(stats.losses).toBe(0);
    expect(stats.deltaCi95[0]).toBeGreaterThan(0);
    expect(stats.significant).toBe(true);
  });

  it('overlapping-zero deltas are NOT significant', () => {
    const stats = pairedDeltaStats([
      { teachA: 3, teachB: 4, preference: 'B' },
      { teachA: 4, teachB: 3, preference: 'A' },
      { teachA: 3, teachB: 3, preference: 'tie' },
    ]);
    expect(stats.significant).toBe(false);
  });
});

describe('twin provenance guard', () => {
  const fixture = (generationId, compilerRef) => ({ twin: { generationId, compilerRef }, files: [] });

  it('accepts a true twin and returns its provenance', () => {
    const p = assertTwinProvenance(fixture('gen-1', 'aaa111'), fixture('gen-1', 'bbb222'));
    expect(p).toEqual({ generationId: 'gen-1', refA: 'aaa111', refB: 'bbb222' });
  });

  it('REFUSES packages from different generations (the confound)', () => {
    expect(() => assertTwinProvenance(fixture('gen-1', 'a'), fixture('gen-2', 'b'))).toThrow(/NOT A TWIN/);
  });

  it('refuses fixtures with no generationId and same-ref twins', () => {
    expect(() => assertTwinProvenance({ files: [] }, fixture('gen-1', 'b'))).toThrow(/generationId/);
    expect(() => assertTwinProvenance(fixture('gen-1', 'aaa'), fixture('gen-1', 'aaa'))).toThrow(/SAME ref/);
  });
});

describe('twin verdict validation + unblinding', () => {
  const verdict = {
    packetOne: { tier: 'export-safe', teachAsIs: 3, summary: 'meh' },
    packetTwo: { tier: 'structured-complete', teachAsIs: 5, summary: 'better' },
    preference: 'two',
    keyDifferences: ['quiz items are machine-scorable in packet two'],
    findings: [
      {
        packet: 'one',
        taxonomy: 'generic-content',
        severity: 'P1',
        file: 'Syllabus',
        quote: 'a verbatim quote long enough',
        objection: 'templated',
      },
    ],
  };

  it('validates a well-formed comparative verdict', () => {
    expect(() => validateTwinVerdict(verdict)).not.toThrow();
    expect(() => validateTwinVerdict({ ...verdict, preference: 'both' })).toThrow(/preference/);
    expect(() => validateTwinVerdict({ ...verdict, packetTwo: { ...verdict.packetTwo, teachAsIs: 11 } })).toThrow(
      /teachAsIs/,
    );
  });

  it('unblinds correctly when A was packet one', () => {
    const u = unblind(verdict, true);
    expect(u.teachA).toBe(3);
    expect(u.teachB).toBe(5);
    expect(u.preference).toBe('B'); // "two" and A-is-one → preferred B
    expect(u.findings[0].side).toBe('A');
  });

  it('unblinds correctly when A was packet two (flipped)', () => {
    const u = unblind(verdict, false);
    expect(u.teachA).toBe(5);
    expect(u.teachB).toBe(3);
    expect(u.preference).toBe('A'); // "two" and A-is-two → preferred A
    expect(u.findings[0].side).toBe('B');
  });

  it('a flipped assignment leaves the DELTA invariant in magnitude', () => {
    const straight = unblind(verdict, true);
    const flipped = unblind(verdict, false);
    expect(straight.teachB - straight.teachA).toBe(-(flipped.teachB - flipped.teachA));
  });
});
