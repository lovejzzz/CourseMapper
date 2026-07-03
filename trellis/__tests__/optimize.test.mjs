// Tests for the cost/speed optimization pass (attempt-5 refinements):
// J2 auto-align, dangling-claim downgrade, the per-lesson claims-ref enum,
// and the targeted quiz-repair contract.

import { describe, it, expect } from 'vitest';
import { buildResearchMethods8 } from '../fixtures/graphs/researchMethods8.mjs';
import { autoAlignBloom, downgradeDanglingClaims } from '../graph/autoAlign.mjs';
import { buildLessonSlice } from '../voice/contracts.mjs';
import { mockAuthorLesson } from '../voice/mockAuthor.mjs';
import { legalRefsForSlice, lessonSchemaForSlice, validateQuizRepair, QUIZ_REPAIR_SCHEMA } from '../voice/author.mjs';
import { j2BloomMatch } from '../judgment/checks/j2BloomMatch.mjs';
import { runPipeline } from '../pipeline.mjs';

describe('autoAlignBloom (J2 as a deterministic metadata fix)', () => {
  it('realigns a far verb/tag mismatch and leaves the rest untouched', () => {
    const graph = buildResearchMethods8();
    graph.outcomes[0] = { ...graph.outcomes[0], statement: 'Define the empirical research question', bloom: 'create' };
    const before = graph.outcomes.map((o) => o.bloom).join(',');
    const realigned = autoAlignBloom(graph);
    expect(realigned).toHaveLength(1);
    expect(realigned[0]).toMatchObject({ verb: 'Define', from: 'create', to: 'remember' });
    expect(graph.outcomes[0].bloom).toBe('remember');
    // The realigned graph now passes J2 with zero blocks.
    expect(j2BloomMatch(graph).filter((f) => f.severity === 'block')).toEqual([]);
    expect(graph.outcomes.map((o) => o.bloom).join(',')).not.toBe(before);
  });

  it('one-tier drift is left alone (that is judgment, not metadata error)', () => {
    const graph = buildResearchMethods8();
    expect(autoAlignBloom(graph)).toEqual([]);
  });
});

describe('downgradeDanglingClaims (unverifiable citation → explicit JUDGED)', () => {
  it('downgrades dangling refs, keeps resolvable ones, and discloses each', () => {
    const graph = buildResearchMethods8();
    const authored = { l1: mockAuthorLesson(buildLessonSlice(graph, 'l1')) };
    authored.l1.claims.push({ path: 'slides[0]', ref: 'kernel:c-invented' });
    authored.l1.claims.push({ path: 'slides[1]', ref: 'source:s-nope' });
    const resolvableBefore = authored.l1.claims.filter(
      (c) => c.ref !== null && !['kernel:c-invented', 'source:s-nope'].includes(c.ref),
    ).length;
    const downgraded = downgradeDanglingClaims(graph, authored);
    expect(downgraded).toHaveLength(2);
    expect(authored.l1.claims.filter((c) => c.ref === null).length).toBeGreaterThanOrEqual(2);
    expect(authored.l1.claims.filter((c) => c.ref !== null)).toHaveLength(resolvableBefore);
  });
});

describe('per-lesson claims-ref enum (J5 killed at the grammar)', () => {
  it('the enum contains exactly the slice’s legal refs plus null', () => {
    const graph = buildResearchMethods8();
    const slice = buildLessonSlice(graph, 'l6');
    const refs = legalRefsForSlice(slice);
    expect(refs).toContain('kernel:c-correlation-causation');
    expect(refs).toContain('misconception:m-correlation-causes');
    expect(refs.some((r) => r.startsWith('source:'))).toBe(true);
    const schema = lessonSchemaForSlice(slice);
    const enumValues = schema.properties.claims.items.properties.ref.enum;
    expect(enumValues).toContain(null);
    expect(enumValues).toEqual([...refs, null]);
    // The base contract schema is never mutated.
    expect(lessonSchemaForSlice(buildLessonSlice(graph, 'l1')).properties.claims.items.properties.ref.enum).not.toEqual(
      enumValues,
    );
  });
});

describe('targeted quiz repair contract', () => {
  it('validator demands full item set, 4 options, keyed index, claims array', () => {
    const validate = validateQuizRepair({ quizItems: 6 });
    const good = {
      quizItems: Array.from({ length: 6 }, (_, i) => ({
        stem: 'A sufficiently long application stem for the item?',
        options: ['a', 'b', 'c', 'd'],
        correctIndex: i % 4,
        explanation: 'A sufficiently long explanation that confronts the corrective.',
        bloom: 'apply',
        difficulty: 'apply',
      })),
      quizClaims: [{ path: 'quizItems[0].explanation', ref: null }],
    };
    expect(validate(good)).toEqual([]);
    expect(validate({ quizItems: good.quizItems.slice(0, 2), quizClaims: [] }).join(' ')).toMatch(/needs 6/);
    const bad = structuredClone(good);
    bad.quizItems[0].options = ['a', 'b'];
    bad.quizItems[1].correctIndex = 7;
    expect(validate(bad).join(' ')).toMatch(/exactly 4/);
    expect(validate(bad).join(' ')).toMatch(/out of range/);
    expect(QUIZ_REPAIR_SCHEMA.required).toEqual(['quizItems', 'quizClaims']);
  });
});

describe('pipeline integration of the deterministic fixes (mock, zero tokens)', () => {
  it('discloses bloom realignment and claim downgrades in the digest', async () => {
    const graph = buildResearchMethods8();
    graph.outcomes[0] = {
      ...graph.outcomes[0],
      statement: 'List the parts of an empirical question',
      bloom: 'evaluate',
    };
    const result = await runPipeline({
      graph,
      tier: 'draft',
      mockVoice: true,
      runId: 'test-optimize-mock',
      generatedAt: '2026-07-03T00:00:00.000Z',
    });
    expect(result.digest.bloomAutoAligned).toHaveLength(1);
    expect(result.digest.bloomAutoAligned[0]).toMatch(/List.*evaluate→remember/);
    expect(result.ledger.totals().usd).toBe(0);
    expect(result.digest.judgment).toMatch(/0 section, 0 full|repair round/);
  }, 30000);
});
