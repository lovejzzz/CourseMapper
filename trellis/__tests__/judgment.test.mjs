import { describe, it, expect } from 'vitest';
import { buildResearchMethods8 } from '../fixtures/graphs/researchMethods8.mjs';
import { buildLessonSlice } from '../voice/contracts.mjs';
import { mockAuthorLesson } from '../voice/mockAuthor.mjs';
import { runChecks, blockingFindings, findingsByLesson } from '../judgment/index.mjs';
import { j1KeyValid } from '../judgment/checks/j1KeyValid.mjs';
import { j2BloomMatch, levelForVerb } from '../judgment/checks/j2BloomMatch.mjs';
import { j3RepairConfronts } from '../judgment/checks/j3RepairConfronts.mjs';
import { j4Coverage } from '../judgment/checks/j4Coverage.mjs';
import { j5CiteResolves } from '../judgment/checks/j5CiteResolves.mjs';
import { j6Xref } from '../judgment/checks/j6Xref.mjs';
import { j7Echo } from '../judgment/checks/j7Echo.mjs';
import { j9Dates } from '../judgment/checks/j9Dates.mjs';
import { j10Relevance } from '../judgment/checks/j10Relevance.mjs';

function authorAll(graph) {
  return Object.fromEntries(
    graph.lessons.map((lesson) => [lesson.id, mockAuthorLesson(buildLessonSlice(graph, lesson.id))]),
  );
}

describe('judgment checks J1–J10 (each with a passing and a failing fixture)', () => {
  const graph = buildResearchMethods8();
  const authored = authorAll(graph);

  it('the golden mock package has no blocking judgment findings', () => {
    const findings = runChecks(graph, authored);
    expect(blockingFindings(findings), JSON.stringify(blockingFindings(findings), null, 2)).toEqual([]);
  });

  it('J1 fails on an out-of-range key and on duplicate options', () => {
    const broken = structuredClone(authored);
    broken.l1.quizItems[0].correctIndex = 9;
    broken.l2.quizItems[1].options = ['same', 'same', 'other', 'third'];
    const codes = j1KeyValid(graph, broken).map((f) => f.code);
    expect(codes.filter((c) => c === 'J1_KEY_VALID')).toHaveLength(2);
    expect(j1KeyValid(graph, authored)).toEqual([]);
  });

  it('J2 fails a far verb/tag mismatch and passes the golden outcomes', () => {
    const bad = structuredClone(graph);
    bad.outcomes[0] = { ...bad.outcomes[0], statement: 'Define the research question', bloom: 'create' };
    expect(j2BloomMatch(bad).some((f) => f.severity === 'block')).toBe(true);
    expect(j2BloomMatch(graph).filter((f) => f.severity === 'block')).toEqual([]);
    expect(levelForVerb('design')).toBe('create');
  });

  it('J3 fails when no explanation confronts the corrective', () => {
    const broken = structuredClone(authored);
    for (const item of broken.l6.quizItems) item.explanation = 'The correct answer is A because it is correct.';
    const findings = j3RepairConfronts(graph, broken);
    expect(findings.some((f) => f.path === 'authored/l6')).toBe(true);
    expect(j3RepairConfronts(graph, authored)).toEqual([]);
  });

  it('J4 fails on a missing lesson and a thin graded quiz', () => {
    const broken = structuredClone(authored);
    delete broken.l4;
    broken.l2.quizItems = broken.l2.quizItems.slice(0, 2);
    const codes = j4Coverage(graph, broken).map((f) => f.code);
    expect(codes.filter((c) => c === 'J4_COVERAGE').length).toBeGreaterThanOrEqual(2);
    expect(j4Coverage(graph, authored)).toEqual([]);
  });

  it('J5 fails a dangling claim ref and passes resolvable ones', () => {
    const broken = structuredClone(authored);
    broken.l1.claims.push({ path: 'slides[0]', ref: 'kernel:c-invented' });
    expect(j5CiteResolves(graph, broken)).toHaveLength(1);
    expect(j5CiteResolves(graph, authored)).toEqual([]);
  });

  it('J6 fails a "last time" reference in lesson 1', () => {
    const broken = structuredClone(authored);
    broken.l1.plan.segments[0].text += ' As we saw last time, this builds on earlier material we covered together.';
    expect(j6Xref(graph, broken)).toHaveLength(1);
    expect(j6Xref(graph, authored)).toEqual([]);
  });

  it('J7 blocks two lessons with near-identical prose', () => {
    const broken = structuredClone(authored);
    broken.l2.studyGuideSection = broken.l1.studyGuideSection;
    const findings = j7Echo(graph, broken);
    expect(findings.some((f) => f.severity === 'block' && f.path.includes('studyGuide'))).toBe(true);
  });

  it('J9 blocks an exam anchored to a lesson-less week and warns on schedule holes', () => {
    const broken = structuredClone(graph);
    broken.lessons = broken.lessons.filter((lesson) => lesson.week !== 4);
    const findings = j9Dates(broken);
    expect(findings.some((f) => f.severity === 'block' && f.path.includes('a-midterm'))).toBe(true);
    expect(findings.some((f) => f.severity === 'warn' && f.path.includes('week-4'))).toBe(true);
    expect(j9Dates(graph).filter((f) => f.severity === 'block')).toEqual([]);
  });

  it('J10 blocks keyword-bycatch readings (the "Philippine general election" class)', () => {
    const broken = structuredClone(graph);
    broken.sources.push({
      kind: 'source',
      id: 's-junk',
      title: '2025 Philippine general election',
      url: 'https://en.wikipedia.org/wiki/2025_Philippine_general_election',
      provider: 'wikipedia',
      license: 'CC BY-SA',
      trust: 'candidate',
      conceptIds: ['c-sampling'],
    });
    const findings = j10Relevance(broken, authored);
    expect(findings.some((f) => f.path === 'source/s-junk')).toBe(true);
    expect(j10Relevance(graph, authored)).toEqual([]);
  });

  it('findingsByLesson groups repair work by lesson', () => {
    const broken = structuredClone(authored);
    broken.l1.quizItems[0].correctIndex = 9;
    const grouped = findingsByLesson(blockingFindings(runChecks(graph, broken)));
    expect(Object.keys(grouped)).toContain('l1');
  });

  // L2: zero mode nulls claim.ref to withhold unverifiable citations. Exposure
  // enforcement must survive that via the durable claim.concept mapping — else
  // J12 silently stops firing in zero mode (refs all null → every item skipped).
  it('J12 exposure still fires on the durable concept mapping when ref is withheld', async () => {
    const { j12Exposure } = await import('../judgment/checks/j12Exposure.mjs');
    const lesson = graph.lessons[0];
    const untaught = 'kernel:concept/never-taught-here';
    // ref withheld (zero mode), but concept preserved → J12 must catch it.
    const withheld = {
      [lesson.id]: { claims: [{ path: 'quizItems[0].explanation', ref: null, concept: untaught }] },
    };
    expect(j12Exposure(graph, withheld).some((f) => f.code === 'J12_EXPOSURE')).toBe(true);
    // Both null → nothing to enforce, and no false positive.
    const blind = { [lesson.id]: { claims: [{ path: 'quizItems[0].explanation', ref: null, concept: null }] } };
    expect(j12Exposure(graph, blind)).toEqual([]);
  });
});
