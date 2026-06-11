// V0.14.3 WS-E (E1–E6) — unit proof for the pure half of the Crucible driver
// (scripts/lib/crucibleRound.mjs): spend-guard accounting, retry bookkeeping,
// pool ordering, verdict-ledger check-id/hash/diff logic, history shaping, and
// the round-diff sectionizer. No browser, no fs, no spend.
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MAX_SPEND_USD,
  INAPP_SCORE_DRIFT_LIMIT,
  JUDGE_MODEL,
  JUDGE_MODEL_RATES_USD,
  NEXT_COURSE_ESTIMATE_USD,
  buildHistoryTable,
  buildJudgePrompt,
  clampConcurrency,
  deriveCheckId,
  diffLedger,
  diffSections,
  digestCostUsd,
  docxStyledParagraphs,
  findingEvidenceHash,
  inAppDriftDecision,
  inAppScoreFromManifest,
  judgeOverallCell,
  judgeSampleIndex,
  judgeSpendUsd,
  normalizeFindingEvidence,
  pairExtractedFiles,
  parseJudgeResponse,
  parseRoundDirTimestamp,
  renderJudgeSection,
  runPool,
  sampleJudgeArtifacts,
  sectionizeFile,
  spendGuardDecision,
  summarizeCourseAttempts,
} from '../scripts/lib/crucibleRound.mjs';
import {
  dayOfYear,
  pickStranger,
  resolveCourses,
  strangerPool,
  referenceCourses,
} from '../scripts/crucible/courses.mjs';

const digestOf = (totalUsd) => ({ cost: { totalUsd } });

describe('E2 — spend guard accounting', () => {
  it('defaults match the roadmap ($2.50 cap, $0.20 next-course estimate)', () => {
    expect(DEFAULT_MAX_SPEND_USD).toBe(2.5);
    expect(NEXT_COURSE_ESTIMATE_USD).toBe(0.2);
  });

  it('continues while spend + estimate stays within the cap', () => {
    expect(spendGuardDecision({ spentUsd: 0, maxSpendUsd: 2.5 })).toEqual({ abort: false, reason: null });
    // 2.29 + 0.20 = 2.49 <= 2.50 — the next course may start.
    expect(spendGuardDecision({ spentUsd: 2.29, maxSpendUsd: 2.5 }).abort).toBe(false);
  });

  it('aborts when the sum already meets/exceeds the cap', () => {
    const decision = spendGuardDecision({ spentUsd: 2.5, maxSpendUsd: 2.5 });
    expect(decision.abort).toBe(true);
    expect(decision.reason).toMatch(/spend cap hit/);
  });

  it('aborts when the NEXT course estimate would exceed the cap', () => {
    const decision = spendGuardDecision({ spentUsd: 2.35, maxSpendUsd: 2.5 });
    expect(decision.abort).toBe(true);
    expect(decision.reason).toMatch(/next-course estimate/);
  });

  it('treats missing/invalid caps as no guard and missing spend as zero', () => {
    expect(spendGuardDecision({ spentUsd: 99, maxSpendUsd: NaN }).abort).toBe(false);
    expect(spendGuardDecision({ spentUsd: undefined, maxSpendUsd: 2.5 }).abort).toBe(false);
  });

  it('digestCostUsd reads digest cost and tolerates absent digests', () => {
    expect(digestCostUsd(digestOf(0.117))).toBe(0.117);
    expect(digestCostUsd(null)).toBe(0);
    expect(digestCostUsd({ cost: { totalUsd: 'n/a' } })).toBe(0);
  });
});

describe('E3 — retry bookkeeping', () => {
  it('single passing attempt: plain "passed", no retry', () => {
    const summary = summarizeCourseAttempts([{ status: 'passed', digest: digestOf(0.1), durationMs: 1000 }]);
    expect(summary).toMatchObject({ statusLabel: 'passed', status: 'passed', retried: false, attemptCount: 1 });
    expect(summary.spendUsd).toBeCloseTo(0.1);
  });

  it('fail then pass: "passed (retry)" and BOTH attempts\' spend/time counted', () => {
    const summary = summarizeCourseAttempts([
      { status: 'failed', digest: digestOf(0.04), durationMs: 30_000 },
      { status: 'passed', digest: digestOf(0.11), durationMs: 200_000 },
    ]);
    expect(summary.statusLabel).toBe('passed (retry)');
    expect(summary.status).toBe('passed');
    expect(summary.retried).toBe(true);
    expect(summary.spendUsd).toBeCloseTo(0.15);
    expect(summary.durationMs).toBe(230_000);
  });

  it('fail then fail: reports failed after two attempts, spend still summed', () => {
    const summary = summarizeCourseAttempts([
      { status: 'failed', digest: digestOf(0.03), durationMs: 10 },
      { status: 'failed', digest: null, durationMs: 20 },
    ]);
    expect(summary.statusLabel).toBe('failed');
    expect(summary.attemptCount).toBe(2);
    expect(summary.spendUsd).toBeCloseTo(0.03);
  });
});

describe('E1 — bounded pool with deterministic ordering', () => {
  it('returns results in item order even when later items finish first', async () => {
    const delays = [50, 5, 25, 1];
    const finishOrder = [];
    const results = await runPool(delays, 2, async (delay, index) => {
      await new Promise((resolve) => setTimeout(resolve, delay));
      finishOrder.push(index);
      return `item-${index}`;
    });
    expect(results).toEqual(['item-0', 'item-1', 'item-2', 'item-3']);
    expect(finishOrder).not.toEqual([0, 1, 2, 3]); // parallel lanes really interleaved
  });

  it('never exceeds the concurrency limit', async () => {
    let inFlight = 0;
    let peak = 0;
    await runPool([1, 2, 3, 4, 5, 6], 2, async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
    });
    expect(peak).toBe(2);
  });

  it('concurrency 1 is strictly sequential', async () => {
    const order = [];
    await runPool([0, 1, 2], 1, async (_, index) => {
      order.push(`start-${index}`);
      await new Promise((resolve) => setTimeout(resolve, 2));
      order.push(`end-${index}`);
    });
    expect(order).toEqual(['start-0', 'end-0', 'start-1', 'end-1', 'start-2', 'end-2']);
  });

  it('clampConcurrency: default 2, max 3, min 1', () => {
    expect(clampConcurrency(undefined)).toBe(2);
    expect(clampConcurrency('abc')).toBe(2);
    expect(clampConcurrency(1)).toBe(1);
    expect(clampConcurrency(99)).toBe(3);
    expect(clampConcurrency(0)).toBe(1);
  });
});

describe('E4 — check ids and evidence hashes', () => {
  it('strips volatile specifics so the same check shares one id', () => {
    const a = deriveCheckId({
      detail:
        'registered exam artifact contains no exam content: A11.2 "Quiz: midterm readiness check" never appears in the document',
    });
    const b = deriveCheckId({
      detail:
        'registered exam artifact contains no exam content: A14.3 "Final Exam: comprehensive geology coverage" never appears in the document',
    });
    expect(a).toBe(b);
    expect(a).toBe('registered-exam-artifact-contains-no-exam-content-never-appears-in-the-document');
  });

  it('neutralizes lesson numbers and parentheticals', () => {
    expect(deriveCheckId({ detail: 'Lesson 13 title differs across deliverable types' })).toBe(
      deriveCheckId({ detail: 'Lesson 2 title differs across deliverable types' }),
    );
    expect(
      deriveCheckId({ detail: 'off-discipline reading (implementation-science) attached to a student reading slot' }),
    ).toBe(deriveCheckId({ detail: 'off-discipline reading (business) attached to a student reading slot' }));
    expect(deriveCheckId({ detail: 'fused colon-title with interior-lowercase label (roadmap 1.2)' })).toBe(
      'fused-colon-title-with-interior-lowercase-label',
    );
  });

  it('hash is whitespace/case-insensitive but detail-sensitive', () => {
    const base = { file: 'Quiz/L11.docx', detail: 'missing A11.2', evidence: 'QUIZ  BANK   intro' };
    expect(findingEvidenceHash(base)).toBe(findingEvidenceHash({ ...base, evidence: 'quiz bank intro' }));
    expect(findingEvidenceHash(base)).not.toBe(findingEvidenceHash({ ...base, detail: 'missing A11.5' }));
    expect(normalizeFindingEvidence(base)).toBe('quiz/l11.docx | missing a11.2 | quiz bank intro');
  });
});

describe('E4 — ledger diffing', () => {
  const finding = (overrides = {}) => ({
    roundId: 'round-1',
    courseId: 'cs-python',
    checkId: 'exam-missing',
    evidenceHash: 'hash-1',
    severity: 'P0',
    detail: 'missing exam',
    file: 'Quiz/L11.docx',
    ...overrides,
  });
  const tp = (overrides = {}) => ({
    checkId: 'exam-missing',
    courseId: 'cs-python',
    roundId: 'round-1',
    evidenceHash: 'hash-1',
    verdict: 'true-positive',
    note: '',
    ...overrides,
  });

  it('true positive found by exact hash → ok, consumed (not unvetted)', () => {
    const diff = diffLedger({ ledger: [tp()], findings: [finding()], storedRoundIds: ['round-1'] });
    expect(diff.ok).toBe(true);
    expect(diff.verified).toHaveLength(1);
    expect(diff.verified[0].status).toBe('ok');
    expect(diff.unvetted).toHaveLength(0);
  });

  it('true positive with drifted evidence still verifies, labeled as drifted', () => {
    const diff = diffLedger({
      ledger: [tp()],
      findings: [finding({ evidenceHash: 'hash-other' })],
      storedRoundIds: ['round-1'],
    });
    expect(diff.ok).toBe(true);
    expect(diff.verified[0].status).toBe('ok (evidence drifted)');
  });

  it('missing true positive → calibration failure', () => {
    const diff = diffLedger({ ledger: [tp()], findings: [], storedRoundIds: ['round-1'] });
    expect(diff.ok).toBe(false);
    expect(diff.missingTruePositives).toHaveLength(1);
  });

  it('false positive resurfacing by checkId (hash irrelevant for reconstructed entries) → failure', () => {
    const fp = tp({ verdict: 'false-positive', evidenceHash: 'reconstructed-hash' });
    const quiet = diffLedger({ ledger: [fp], findings: [], storedRoundIds: ['round-1'] });
    expect(quiet.ok).toBe(true);
    expect(quiet.quietFalsePositives).toHaveLength(1);

    const resurfaced = diffLedger({
      ledger: [fp],
      findings: [finding({ evidenceHash: 'totally-different' })],
      storedRoundIds: ['round-1'],
    });
    expect(resurfaced.ok).toBe(false);
    expect(resurfaced.resurfacedFalsePositives).toHaveLength(1);
  });

  it('two same-check entries match two distinct findings (A11.2 + A11.5 case)', () => {
    const diff = diffLedger({
      ledger: [tp({ evidenceHash: 'hash-1' }), tp({ evidenceHash: 'hash-2' })],
      findings: [finding({ evidenceHash: 'hash-1' }), finding({ evidenceHash: 'hash-2' })],
      storedRoundIds: ['round-1'],
    });
    expect(diff.verified).toHaveLength(2);
    expect(diff.unvetted).toHaveLength(0);
  });

  it('unknown findings collapse into unvetted groups with counts', () => {
    const diff = diffLedger({
      ledger: [],
      findings: [finding(), finding({ evidenceHash: 'hash-2' }), finding({ checkId: 'other-check' })],
      storedRoundIds: ['round-1'],
    });
    expect(diff.unvetted).toHaveLength(2);
    const exam = diff.unvetted.find((group) => group.checkId === 'exam-missing');
    expect(exam.count).toBe(2);
  });

  it('ledger entries for rounds not stored locally are skipped, never failed', () => {
    const diff = diffLedger({ ledger: [tp({ roundId: 'round-gone' })], findings: [], storedRoundIds: ['round-1'] });
    expect(diff.ok).toBe(true);
    expect(diff.skipped).toHaveLength(1);
    expect(diff.skipped[0].status).toMatch(/not stored locally/);
  });
});

describe('E5 — history shaping', () => {
  it('parses round dir timestamps back to ISO (and rejects non-rounds)', () => {
    expect(parseRoundDirTimestamp('round-2026-06-11T06-39-33-774Z')).toBe('2026-06-11T06:39:33.774Z');
    expect(parseRoundDirTimestamp('baseline-v0140')).toBeNull();
    expect(parseRoundDirTimestamp('dry-run-2026-06-11T06-21-21-555Z')).toBeNull();
  });

  it('orders baselines first, then rounds chronologically; cells read overall · P0/P1', () => {
    const summaries = [
      {
        dirName: 'round-2026-06-11T16-11-11-692Z',
        courses: [{ id: 'cs-python', overall: 90, p0: 2, p1: 0 }],
        costUsd: 0.42,
      },
      {
        dirName: 'baseline-v0140',
        courses: [{ id: 'cs-python', overall: 54, p0: 1038, p1: 268 }],
        costUsd: 0.45,
      },
      {
        dirName: 'round-2026-06-11T06-39-33-774Z',
        courses: [{ id: 'cs-python', overall: 91, p0: 2, p1: 0 }],
        costUsd: 0.41,
      },
    ];
    const { header, rows } = buildHistoryTable(summaries, ['mandarin', 'cs-python']);
    expect(header).toEqual(['Round', 'cs-python', 'Cost']);
    expect(rows.map((row) => row[0])).toEqual([
      'baseline-v0140',
      'round-2026-06-11T06-39-33-774Z',
      'round-2026-06-11T16-11-11-692Z',
    ]);
    expect(rows[0][1]).toBe('54 · 1038/268');
    expect(rows[0][2]).toBe('$0.45');
  });
});

describe('E6 — sectionization and diff', () => {
  const docxXml = (paras) =>
    paras
      .map(
        ([style, text]) =>
          `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ''}<w:r><w:t>${text}</w:t></w:r></w:p>`,
      )
      .join('');

  it('docxStyledParagraphs recovers pStyle + text from rawXml', () => {
    const paras = docxStyledParagraphs(
      docxXml([
        ['Title', 'Doc &amp; Title'],
        [null, 'Body line'],
      ]),
    );
    expect(paras).toEqual([
      { style: 'Title', text: 'Doc & Title' },
      { style: null, text: 'Body line' },
    ]);
  });

  it('docx sections split on Title/Heading* styles, body text attaches below', () => {
    const file = {
      kind: 'docx',
      rawXml: docxXml([
        [null, 'LESSON PLANS'],
        ['Title', 'Course - Lesson 01'],
        ['Heading3', 'LEARNING OBJECTIVES'],
        ['ListParagraph', 'Identify course themes.'],
        ['Heading3', 'WARM-UP'],
        [null, 'Retrieval and framing'],
      ]),
    };
    const sections = sectionizeFile(file);
    expect(sections.map((section) => section.heading)).toEqual([
      '(front matter)',
      'Course - Lesson 01',
      'LEARNING OBJECTIVES',
      'WARM-UP',
    ]);
    expect(sections[2].content).toBe('Identify course themes.');
  });

  it('pptx sections come from slides; markdown from heading lines', () => {
    const deck = sectionizeFile({
      kind: 'pptx',
      slides: [
        { title: 'KEY CONCEPT', text: 'KEY CONCEPT loops repeat work' },
        { title: 'PRACTICE', text: 'PRACTICE write a loop' },
      ],
    });
    expect(deck.map((section) => section.heading)).toEqual(['KEY CONCEPT', 'PRACTICE']);

    const md = sectionizeFile({ kind: 'text', paragraphs: ['# Course Map', 'intro', '## Week 1', 'topics'] });
    expect(md.map((section) => section.heading)).toEqual(['Course Map', 'Week 1']);
  });

  it('diffSections reports added/removed/changed at heading granularity', () => {
    const a = [
      { heading: 'WARM-UP', content: 'old prompt' },
      { heading: 'HOMEWORK', content: 'read ch 2' },
      { heading: 'DROPPED', content: 'gone' },
    ];
    const b = [
      { heading: 'WARM-UP', content: 'new prompt' },
      { heading: 'HOMEWORK', content: 'read ch 2' },
      { heading: 'ADDED', content: 'fresh' },
    ];
    const delta = diffSections(a, b);
    expect(delta.changed).toEqual(['WARM-UP']);
    expect(delta.added).toEqual(['ADDED']);
    expect(delta.removed).toEqual(['DROPPED']);
  });

  it('duplicate headings pair by occurrence index', () => {
    const a = [
      { heading: 'CRITERIA', content: 'one' },
      { heading: 'CRITERIA', content: 'two' },
    ];
    const b = [
      { heading: 'CRITERIA', content: 'one' },
      { heading: 'CRITERIA', content: 'two-edited' },
    ];
    const delta = diffSections(a, b);
    expect(delta.changed).toEqual(['CRITERIA']);
    expect(delta.added).toEqual([]);
  });

  it('pairExtractedFiles keys on top + lesson + kind so retitled files still pair', () => {
    const fileA = {
      path: 'Lesson Plans/Lesson 03 - Boolean Logic - Lesson Plans.docx',
      top: 'Lesson Plans',
      kind: 'docx',
      lessonNumber: 3,
    };
    const fileB = {
      path: 'Lesson Plans/Lesson 03 - Conditionals and Boolean Logic - Lesson Plans.docx',
      top: 'Lesson Plans',
      kind: 'docx',
      lessonNumber: 3,
    };
    const syllabusA = { path: 'Syllabus/Course - Syllabus.docx', top: 'Syllabus', kind: 'docx', lessonNumber: null };
    const extraB = { path: 'Course FAQ/Course FAQ.docx', top: 'Course FAQ', kind: 'docx', lessonNumber: null };
    const { pairs, onlyA, onlyB } = pairExtractedFiles([fileA, syllabusA], [fileB, extraB]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].a).toBe(fileA);
    expect(pairs[0].b).toBe(fileB);
    expect(onlyA).toEqual([syllabusA]);
    expect(onlyB).toEqual([extraB]);
  });
});

// ── V0.14.3 WS-B: course resolution, stranger rotation, drift gate ──────────

describe('WS-B1 — course resolution', () => {
  it("'all' resolves to exactly the four audit courses (release-comparable)", () => {
    const ids = resolveCourses('all').map((course) => course.id);
    expect(ids).toEqual(['mandarin', 'cs-python', 'geology', 'world-lit']);
  });

  it("'extended' resolves to all ten audit + genome courses", () => {
    const extended = resolveCourses('extended');
    expect(extended).toEqual(referenceCourses);
    expect(extended.map((course) => course.id)).toEqual([
      'mandarin',
      'cs-python',
      'geology',
      'world-lit',
      'econ-intro',
      'stats-intro',
      'psych-101',
      'nursing-fundamentals',
      'nutrition-101',
      'astro-101',
    ]);
  });

  it('comma ids resolve any subset, including genome and stranger ids', () => {
    expect(resolveCourses('econ-intro,astro-101').map((c) => c.id)).toEqual(['econ-intro', 'astro-101']);
    expect(resolveCourses('art-history').map((c) => c.id)).toEqual(['art-history']);
  });

  it('an unknown id throws with the known-id list', () => {
    expect(() => resolveCourses('not-a-course')).toThrow(/Unknown course id "not-a-course"/);
  });

  it('only cs-python and geology carry expectGenome among the originals', () => {
    const withGenome = referenceCourses.filter((course) => course.expectGenome).map((course) => course.id);
    expect(withGenome).toContain('cs-python');
    expect(withGenome).toContain('geology');
    // world-lit (thin lit shard, 0 linked) and mandarin (no shard) stay off.
    expect(withGenome).not.toContain('world-lit');
    expect(withGenome).not.toContain('mandarin');
  });

  it('econ-intro seeds the out-of-order prerequisite gap', () => {
    const econ = referenceCourses.find((course) => course.id === 'econ-intro');
    expect(econ.seededGap).toEqual({ lesson: 5, missingConcept: 'Demand curve' });
    // The prompt teaches elasticity BEFORE the demand curve (the seeded gap).
    const elasticityAt = econ.prompt.indexOf('price elasticity of demand');
    const demandCurveAt = econ.prompt.indexOf('the demand curve and the law of demand');
    expect(elasticityAt).toBeGreaterThan(0);
    expect(demandCurveAt).toBeGreaterThan(elasticityAt);
  });
});

describe('WS-B3 — deterministic stranger rotation', () => {
  it('dayOfYear is 1-based and advances by one per UTC day', () => {
    expect(dayOfYear(new Date('2026-01-01T00:00:00Z'))).toBe(1);
    expect(dayOfYear(new Date('2026-01-02T23:59:00Z'))).toBe(2);
    expect(dayOfYear(new Date('2026-12-31T12:00:00Z'))).toBe(365);
  });

  it('the same calendar day always picks the same stranger (no randomness)', () => {
    const a = pickStranger(new Date('2026-06-11T01:00:00Z'));
    const b = pickStranger(new Date('2026-06-11T23:00:00Z'));
    expect(a).toBe(b);
    expect(a.probeProfile).toBe('generic');
  });

  it('the pick rotates across the pool by day-of-year modulo', () => {
    const picks = [];
    for (let day = 1; day <= strangerPool.length; day += 1) {
      // Construct a date with the given day-of-year.
      const date = new Date(Date.UTC(2026, 0, day));
      picks.push(pickStranger(date).id);
    }
    expect(new Set(picks).size).toBe(strangerPool.length); // every stranger picked once across one cycle
    // Day 1 → index 0, day N → index (N-1) % len.
    expect(pickStranger(new Date(Date.UTC(2026, 0, 1))).id).toBe(strangerPool[0].id);
    expect(pickStranger(new Date(Date.UTC(2026, 0, strangerPool.length + 1))).id).toBe(strangerPool[0].id);
  });

  it('every stranger is a generic-profile course (probes off, never gates)', () => {
    expect(strangerPool.every((course) => course.probeProfile === 'generic')).toBe(true);
    expect(strangerPool.length).toBeGreaterThanOrEqual(6);
  });
});

describe('A5(4) — in-app vs Crucible drift gate', () => {
  it('the drift limit is 3 points', () => {
    expect(INAPP_SCORE_DRIFT_LIMIT).toBe(3);
  });

  it('reads manifest.quality.score only for a successful grade', () => {
    expect(inAppScoreFromManifest({ quality: { status: 'graded', score: 98 } })).toBe(98);
    expect(inAppScoreFromManifest({ quality: { status: 'not-graded', reason: 'timed out' } })).toBeNull();
    expect(inAppScoreFromManifest({})).toBeNull();
    expect(inAppScoreFromManifest(null)).toBeNull();
  });

  it('skips when the in-app score is absent (older artifact)', () => {
    const decision = inAppDriftDecision(100, null);
    expect(decision.skip).toBe(true);
    expect(decision.ok).toBe(true);
  });

  it('passes within the tolerance, fails beyond it', () => {
    expect(inAppDriftDecision(100, 98)).toEqual({ skip: false, drift: 2, ok: true });
    expect(inAppDriftDecision(100, 97)).toEqual({ skip: false, drift: 3, ok: true }); // exactly at limit
    const drifted = inAppDriftDecision(100, 96);
    expect(drifted).toEqual({ skip: false, drift: 4, ok: false });
  });

  it('drift is symmetric (in-app above or below the Crucible)', () => {
    expect(inAppDriftDecision(90, 95).drift).toBe(5);
    expect(inAppDriftDecision(95, 90).drift).toBe(5);
    expect(inAppDriftDecision(95, 90).ok).toBe(false);
  });
});

// ── E7: the advisory judge — pure halves (sampling, prompt, parse, spend) ────

describe('E7 — judge sampling', () => {
  const files = [
    { featureId: 'lessonPlans', lessonNumber: 1, path: 'Lesson Plans/Lesson 01 - A - Lesson Plans.docx', text: 'lp1' },
    { featureId: 'lessonPlans', lessonNumber: 7, path: 'Lesson Plans/Lesson 07 - G - Lesson Plans.docx', text: 'lp7' },
    {
      featureId: 'lessonPlans',
      lessonNumber: 14,
      path: 'Lesson Plans/Lesson 14 - N - Lesson Plans.docx',
      text: 'lp14',
    },
    {
      featureId: 'quizBank',
      lessonNumber: 7,
      path: 'Quiz & Exam Bank/Lesson 07 - G - Quiz & Exam Bank.docx',
      text: 'q7',
    },
    { featureId: 'studyGuides', lessonNumber: 6, path: 'Study Guides/Lesson 06 - F - Study Guides.docx', text: 'sg6' },
    { featureId: 'studyGuides', lessonNumber: 8, path: 'Study Guides/Lesson 08 - H - Study Guides.docx', text: 'sg8' },
    { featureId: 'rubrics', lessonNumber: 7, path: 'Rubrics/Lesson 07 - G - Rubrics.docx', text: 'rub7' },
  ];

  it('the mid-lesson index is floor(lessonCount/2)', () => {
    expect(judgeSampleIndex(14)).toBe(7);
    expect(judgeSampleIndex(15)).toBe(7);
    expect(judgeSampleIndex(12)).toBe(6);
    expect(judgeSampleIndex(0)).toBe(1); // degenerate → first lesson
  });

  it('samples exactly the mid-lesson lesson plan, quiz bank, and study guide', () => {
    const picks = sampleJudgeArtifacts(files, 14);
    expect(picks.map((p) => p.name)).toEqual([
      'Lesson 7 lesson plan',
      'Lesson 7 quiz bank',
      'Lesson 6 study guide', // no Lesson 7 study guide → nearest; the 6-vs-8 tie breaks to 6
    ]);
  });

  it('breaks ties to the LOWER lesson number when two are equidistant', () => {
    // target 7: study guides 6 and 8 are both distance 1 → pick 6.
    const picks = sampleJudgeArtifacts(files, 14);
    const studyGuide = picks.find((p) => /study guide/.test(p.name));
    expect(studyGuide.name).toBe('Lesson 6 study guide');
    expect(studyGuide.text).toBe('sg6');
  });

  it('skips a feature with no lesson-rooted files (never invents one)', () => {
    const noQuiz = files.filter((f) => f.featureId !== 'quizBank');
    const picks = sampleJudgeArtifacts(noQuiz, 14);
    expect(picks.some((p) => /quiz bank/.test(p.name))).toBe(false);
    expect(picks).toHaveLength(2);
  });

  it('returns an empty list when nothing is sampleable', () => {
    expect(sampleJudgeArtifacts([], 14)).toEqual([]);
  });
});

describe('E7 — judge prompt', () => {
  it('bundles all artifacts into ONE prompt naming the discipline and the JSON shape', () => {
    const prompt = buildJudgePrompt({ title: 'Introductory Statistics' }, [
      { name: 'Lesson 7 lesson plan', text: 'sampling and the central limit theorem' },
      { name: 'Lesson 7 quiz bank', text: 'p-value items' },
    ]);
    expect(prompt).toContain('You are a professor in Introductory Statistics');
    expect(prompt).toContain('would I teach from this as-is?');
    expect(prompt).toContain('{"artifacts":[{"name","score","notes"}],"overall","verdict"}');
    expect(prompt).toContain('Artifact 1 — Lesson 7 lesson plan');
    expect(prompt).toContain('Artifact 2 — Lesson 7 quiz bank');
    expect(prompt).toContain('For each of the 2 artifacts');
    expect(JUDGE_MODEL).toBe('gpt-5.4-mini');
  });

  it('truncates each artifact text to keep the bundled prompt bounded', () => {
    const long = 'streak '.repeat(2000);
    const prompt = buildJudgePrompt({ id: 'geology' }, [{ name: 'big', text: long }]);
    expect(prompt.length).toBeLessThan(long.length);
    expect(prompt).toContain('You are a professor in geology');
  });
});

describe('E7 — defensive judge parsing (advisory: any malformed → null)', () => {
  it('parses a clean JSON object', () => {
    const parsed = parseJudgeResponse(
      JSON.stringify({
        artifacts: [{ name: 'Lesson 7 lesson plan', score: 8, notes: 'Solid.' }],
        overall: 8,
        verdict: 'Teachable.',
      }),
    );
    expect(parsed.overall).toBe(8);
    expect(parsed.verdict).toBe('Teachable.');
    expect(parsed.artifacts[0]).toEqual({ name: 'Lesson 7 lesson plan', score: 8, notes: 'Solid.' });
  });

  it('tolerates code fences and surrounding prose', () => {
    const parsed = parseJudgeResponse(
      'Here is my review:\n```json\n{"artifacts":[],"overall":7,"verdict":"Fine."}\n```',
    );
    expect(parsed.overall).toBe(7);
    expect(parsed.verdict).toBe('Fine.');
  });

  it('coerces non-numeric scores to null fields but keeps the artifact', () => {
    const parsed = parseJudgeResponse(
      '{"artifacts":[{"name":"x","score":"high","notes":"n"}],"overall":6,"verdict":"v"}',
    );
    expect(Number.isFinite(parsed.artifacts[0].score)).toBe(false);
    expect(parsed.artifacts[0].name).toBe('x');
  });

  it('returns null on garbage, empty, missing braces, or null input', () => {
    expect(parseJudgeResponse('not json at all')).toBeNull();
    expect(parseJudgeResponse('')).toBeNull();
    expect(parseJudgeResponse(null)).toBeNull();
    expect(parseJudgeResponse('{ broken json ')).toBeNull();
    // a valid object with neither overall nor artifacts is not a judge verdict.
    expect(parseJudgeResponse('{"unrelated":true}')).toBeNull();
  });
});

describe('E7 — spend estimation + report shaping', () => {
  it('estimates cost from usage tokens at the gpt-5.4-mini rates', () => {
    expect(JUDGE_MODEL_RATES_USD).toEqual({ inputPerMillion: 0.75, outputPerMillion: 4.5 });
    // 8000 in + 400 out → 8000/1e6*0.75 + 400/1e6*4.5 = 0.006 + 0.0018 = 0.0078.
    expect(judgeSpendUsd({ prompt_tokens: 8000, completion_tokens: 400 })).toBeCloseTo(0.0078, 6);
    expect(judgeSpendUsd(undefined)).toBe(0);
  });

  it('the round-table judge cell is "N/10" when parsed, blank otherwise', () => {
    expect(judgeOverallCell({ parsed: { overall: 9, artifacts: [], verdict: '' } })).toBe('9/10');
    expect(judgeOverallCell({ parsed: null, note: 'judge: unparseable' })).toBe('');
    expect(judgeOverallCell(null)).toBe(''); // judge off → blank
    expect(judgeOverallCell({ parsed: { overall: NaN } })).toBe('');
  });

  it('renders the advisory section with the non-gating disclaimer', () => {
    const md = renderJudgeSection({
      parsed: {
        artifacts: [{ name: 'Lesson 7 lesson plan', score: 8, notes: 'Clear.' }],
        overall: 8,
        verdict: 'Would teach.',
      },
    });
    expect(md).toContain('## Advisory judge (LLM, non-gating)');
    expect(md).toContain('never gates');
    expect(md).toContain('**Overall: 8/10** — Would teach.');
    expect(md).toContain('**Lesson 7 lesson plan: 8/10** — Clear.');
  });

  it('renders the unparseable note instead of scores when parsing failed', () => {
    const md = renderJudgeSection({ parsed: null, note: 'judge: unparseable' });
    expect(md).toContain('## Advisory judge (LLM, non-gating)');
    expect(md).toContain('judge: unparseable');
    expect(md).not.toContain('Overall:');
  });
});
