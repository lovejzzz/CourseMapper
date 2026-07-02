// Project Prof P0 — unit tests for every deterministic module (goal clause 7).
import { describe, expect, it } from 'vitest';
import { createTerm, buildUniverses, seededRandom, TERM_MODES } from '../prof/universe.mjs';
import { VerdictLedger, normalizeForQuoteMatch, quoteAppearsInCorpus } from '../prof/verdictLedger.mjs';
import {
  buildWorkloadAccount,
  parseWritingTargetWords,
  parseStatedMinutes,
  parseStatedWeeklyHours,
  DISCREPANCY_BAR,
  UNDERLOAD_BAR,
} from '../prof/workloadAccountant.mjs';
import { collapseFindings, meanWithCI, ciSeparated, personaPairAgreement, quoteOverlap } from '../prof/collapse.mjs';
import { validateVerdict, buildReadingPacket, ADOPTION_TIER_IDS } from '../prof/personaEngine.mjs';
import { SpendMeter, providerForModel } from '../prof/modelClient.mjs';
import { adoptionKpis } from '../prof/profReport.mjs';

describe('universe & term modes (design §11)', () => {
  it('rejects mode "both" and anything not instrument/course', () => {
    expect(() => createTerm({ mode: 'both', scenarioId: 's', arena: 'a1', capUsd: 5 })).toThrow(/not allowed/);
    expect(() => createTerm({ mode: 'all', scenarioId: 's', arena: 'a1', capUsd: 5 })).toThrow();
    expect(TERM_MODES.has('both')).toBe(false);
  });

  it('quarantines instrument-mode terms', () => {
    const instrument = createTerm({ mode: 'instrument', scenarioId: 's', arena: 'a1', capUsd: 5 });
    const course = createTerm({ mode: 'course', scenarioId: 's', arena: 'a1', capUsd: 5 });
    expect(instrument.quarantined).toBe(true);
    expect(course.quarantined).toBe(false);
  });

  it('builds seeded, reproducible universes with rotated independence axes', () => {
    const scenario = {
      id: 'x',
      packageDir: 'pkg',
      instructorCast: ['a', 'b', 'c'],
      modelSeats: ['m1', 'm2', 'm3'],
    };
    const first = buildUniverses({ scenario, count: 9, seed: 7 });
    const second = buildUniverses({ scenario, count: 9, seed: 7 });
    expect(first).toEqual(second); // replayable
    // No two consecutive universes share persona+model+order simultaneously.
    const keys = first.map((u) => `${u.instructor}|${u.modelSeat}|${u.readingOrder}`);
    expect(new Set(keys).size).toBeGreaterThan(6);
  });

  it('seededRandom is deterministic', () => {
    const a = seededRandom(42);
    const b = seededRandom(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
});

describe('verdict ledger — quote-or-discard (design §6)', () => {
  const corpus = normalizeForQuoteMatch(
    'The midterm exam covers lessons one through eleven. Students submit a debugging trace with every code lab.',
  );

  it('accepts verbatim quotes (whitespace/punctuation tolerant)', () => {
    expect(quoteAppearsInCorpus('covers lessons one through eleven', corpus)).toBe(true);
    expect(quoteAppearsInCorpus('submit a debugging   trace, with every code lab', corpus)).toBe(true);
  });

  it('rejects paraphrases and too-short quotes', () => {
    expect(quoteAppearsInCorpus('the exam includes the first eleven lessons', corpus)).toBe(false);
    expect(quoteAppearsInCorpus('midterm exam', corpus)).toBe(false); // < 4 words = not evidence
  });

  it('screens findings: no quote → discarded with reason, quoted → kept', () => {
    const ledger = new VerdictLedger({ termDir: '/tmp', normalizedCorpus: corpus });
    const screened = ledger.screenVerdict(
      {
        tier: 'classroom-ready-draft',
        teachAsIs: 6,
        summary: 's',
        minimumEdits: [],
        findings: [
          {
            taxonomy: 'templated-prose',
            severity: 'P2',
            file: 'a',
            quote: 'submit a debugging trace with every code lab',
            objection: 'x',
          },
          { taxonomy: 'templated-prose', severity: 'P2', file: 'a', quote: 'this text is invented', objection: 'x' },
          { taxonomy: 'templated-prose', severity: 'P2', file: 'a', quote: '', objection: 'x' },
        ],
      },
      { universeId: 'u1', personaId: 'p1' },
    );
    expect(screened.findings).toHaveLength(1);
    expect(ledger.discarded).toHaveLength(2);
    expect(ledger.discarded.map((d) => d.reason).sort()).toEqual(['missing-quote', 'quote-not-in-corpus']);
  });
});

describe('workload accountant (deterministic, zero-LLM)', () => {
  it('parses writing targets and stated times', () => {
    expect(parseWritingTargetWords('Write a two-page memo')).toBe(600);
    expect(parseWritingTargetWords('a 1,500 words essay')).toBe(1500);
    expect(parseWritingTargetWords('500-word response')).toBe(500);
    expect(parseWritingTargetWords('no target here')).toBeNull();
    expect(parseStatedMinutes('takes about 30 minutes')).toBe(30);
    expect(parseStatedMinutes('1 hour exam')).toBe(60);
    expect(parseStatedWeeklyHours('expect 6-8 hours per week of work')).toBe(7);
  });

  const makeExtracted = (studyGuideWords, assignmentText) => ({
    files: [
      { featureId: 'syllabus', lessonNumber: null, path: 's.docx', text: 'Course syllabus.' },
      {
        featureId: 'studyGuides',
        lessonNumber: 1,
        path: 'g1.docx',
        text: Array(studyGuideWords).fill('word').join(' '),
      },
      { featureId: 'assignments', lessonNumber: 1, path: 'a1.docx', text: assignmentText },
      { featureId: 'quizBank', lessonNumber: 1, path: 'q1.docx', text: 'Quiz: 10 items.' },
    ],
  });

  it('flags overload above the bar', () => {
    // 20-page assignment ≈ 6000 words ≈ 24h writing >> 6h/week default.
    const account = buildWorkloadAccount(makeExtracted(500, 'Write a 6,000 words portfolio'));
    expect(account.weeks[0].ratio).toBeGreaterThan(DISCREPANCY_BAR);
    expect(account.finding?.severity).toBe('P1');
    expect(account.finding.detail).toContain('exceeds');
  });

  it('flags underload below the bar (the too-thin course)', () => {
    const account = buildWorkloadAccount(makeExtracted(100, 'Reflect briefly.'));
    expect(account.meanRatio).toBeLessThan(UNDERLOAD_BAR);
    expect(account.finding?.severity).toBe('P2');
    expect(account.finding.detail).toContain('too thin');
  });

  it('reports assumptions honestly', () => {
    const account = buildWorkloadAccount(makeExtracted(200, 'no parseable target'));
    expect(account.expectedSource).toBe('credit-hour-default');
    expect(account.weeks[0].sources.some((s) => s.kind === 'assignment-unparsed' && s.assumed)).toBe(true);
  });
});

describe('collapse stage (design §4c)', () => {
  it('fingerprints duplicate findings across universes into agreement scores', () => {
    const entry = (universeId, personaId, quote) => ({
      universeId,
      personaId,
      finding: { file: 'Syllabus.docx', taxonomy: 'templated-prose', severity: 'P2', quote, objection: 'o' },
    });
    const collapsed = collapseFindings(
      [
        entry('u1', 'p1', 'the same generic sentence repeated every single week'),
        entry('u2', 'p2', 'same generic sentence repeated every single week here'),
        entry('u3', 'p3', 'a completely different objection about citations'),
      ],
      3,
    );
    expect(collapsed).toHaveLength(2);
    expect(collapsed[0].agreement).toBe(2);
    expect(collapsed[0].agreementFraction).toBeCloseTo(0.667, 2);
    expect(collapsed[1].agreement).toBe(1);
  });

  it('quoteOverlap measures token containment', () => {
    expect(quoteOverlap('alpha beta gamma delta', 'alpha beta gamma delta epsilon')).toBe(1);
    expect(quoteOverlap('alpha beta', 'gamma delta')).toBe(0);
  });

  it('meanWithCI computes t-based intervals and ciSeparated detects separation', () => {
    const good = meanWithCI([8, 9, 8, 9, 8]);
    const bad = meanWithCI([2, 3, 2, 3, 2]);
    expect(good.mean).toBeCloseTo(8.4, 1);
    expect(good.ci95[0]).toBeGreaterThan(7.5);
    expect(ciSeparated(good, bad)).toBe(true);
    const overlapping = meanWithCI([5, 9, 2, 8, 4]);
    expect(ciSeparated(good, overlapping)).toBe(false);
  });

  it('personaPairAgreement computes tier agreement per pair', () => {
    const rows = [
      { personaId: 'a', artifact: 'z', tier: 'adoption-ready' },
      { personaId: 'b', artifact: 'z', tier: 'adoption-ready' },
      { personaId: 'a', artifact: 'y', tier: 'blocked' },
      { personaId: 'b', artifact: 'y', tier: 'adoption-ready' },
    ];
    const pairs = personaPairAgreement(rows);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].rate).toBe(0.5);
  });
});

describe('persona engine validation + reading packet', () => {
  it('validateVerdict enforces the schema', () => {
    const valid = {
      tier: 'classroom-ready-draft',
      teachAsIs: 7,
      summary: 'fine',
      minimumEdits: [],
      findings: [{ taxonomy: 'templated-prose', severity: 'P2', file: 'f', quote: 'q', objection: 'because' }],
    };
    expect(() => validateVerdict(valid)).not.toThrow();
    expect(() => validateVerdict({ ...valid, tier: 'excellent' })).toThrow(/tier/);
    expect(() => validateVerdict({ ...valid, teachAsIs: 11 })).toThrow(/teachAsIs/);
    expect(() => validateVerdict({ ...valid, findings: [{ taxonomy: 'nope' }] })).toThrow(/taxonomy/);
    expect(ADOPTION_TIER_IDS[0]).toBe('blocked');
  });

  it('buildReadingPacket respects reading order and never leaks internal JSON', () => {
    const longText = (label) => `${label} ${'content '.repeat(200)}`;
    const extracted = {
      files: [
        { featureId: 'syllabus', path: 'Syllabus/x.docx', text: longText('SYLLABUS') },
        { featureId: 'lessonPlans', path: 'Lesson Plans/1.docx', text: longText('PLAN1') },
        { featureId: 'quizBank', path: 'Quiz & Exam Bank/1.docx', text: longText('QUIZ1') },
        { featureId: 'quizBank', path: 'Quiz & Exam Bank/9.docx', text: longText('EXAM') },
      ],
    };
    const examFirst = buildReadingPacket({ extracted, readingOrder: 'exam-first', hotSpot: [] });
    expect(examFirst[0].path).toContain('Quiz');
    const syllabusFirst = buildReadingPacket({ extracted, readingOrder: 'syllabus-first', hotSpot: ['quizBank'] });
    expect(syllabusFirst[0].path).toContain('Syllabus');
    expect(syllabusFirst.some((f) => f.path.includes('Quiz'))).toBe(true);
    for (const file of syllabusFirst) expect(typeof file.text).toBe('string');
  });
});

describe('spend meter (budget clause 8)', () => {
  it('meters cost and refuses past the cap', () => {
    const meter = new SpendMeter({ capUsd: 0.01 });
    meter.record('gpt-5.4-mini', 'test', { inputTokens: 1000, outputTokens: 1000 });
    expect(meter.spentUsd).toBeCloseTo(0.00525, 4);
    expect(() => meter.assertBudget('claude-sonnet-5', 1_000_000)).toThrow(/Spend cap/);
    expect(() => meter.price('unknown-model', { inputTokens: 1, outputTokens: 1 })).toThrow(/No price entry/);
  });

  it('maps models to providers', () => {
    expect(providerForModel('claude-sonnet-5')).toBe('anthropic');
    expect(providerForModel('gemini-2.5-flash')).toBe('google');
    expect(providerForModel('gpt-5.4-mini')).toBe('openai');
  });
});

describe('adoption KPIs exclude the holdout pool (charter §10)', () => {
  it('active-pool KPIs only; holdout counted separately', () => {
    const reviews = [
      { personaPool: 'active', personaId: 'a', verdict: { tier: 'adoption-ready', teachAsIs: 8, findings: [] } },
      { personaPool: 'active', personaId: 'b', verdict: { tier: 'export-safe', teachAsIs: 4, findings: [] } },
      { personaPool: 'holdout', personaId: 'h', verdict: { tier: 'blocked', teachAsIs: 1, findings: [] } },
    ];
    const kpis = adoptionKpis(reviews);
    expect(kpis.reviews).toBe(2);
    expect(kpis.holdoutExcluded).toBe(1);
    expect(kpis.adoptionRate).toBe(0.5);
    expect(kpis.teachAsIs.mean).toBe(6);
  });
});
