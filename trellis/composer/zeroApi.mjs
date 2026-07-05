// Zero-API composer mode ($0/course for library-covered courses).
// The paid stages either move to Tendril-S (local, gated, fallback to
// source form) or to deterministic assembly/verification. Everything
// dropped is DISCLOSED — zero mode fails honest, never optimistic.

import { collectCheckableClaims } from '../knowledge/entailment.mjs';
import { tokenOverlapRatio } from '../judgment/text.mjs';

// ── exams from the bank ─────────────────────────────────────────────────────
// Mirrors authorAllExams' coverage windows (midterm = lessons up to its
// anchor, final = cumulative) but draws gate-passed bank items instead of
// authoring: catches/confronts first, course-unused first, stem-deduped,
// correctIndex rotated. 12 items per exam like the authored path.
export function assembleExamsFromBank(graph, bank, { usedBankIds = new Set(), perExam = 12 } = {}) {
  const lessons = [...graph.lessons].sort((a, b) => a.week - b.week);
  const lessonWeek = new Map(lessons.map((l) => [l.id, l.week]));
  const conceptById = new Map(graph.concepts.map((c) => [c.id, c]));
  const exams = (graph.assessments ?? [])
    .filter((a) => a.kindOf === 'exam')
    .sort((a, b) => (lessonWeek.get(a.anchor?.lessonId) ?? a.anchor?.week ?? 99) - (lessonWeek.get(b.anchor?.lessonId) ?? b.anchor?.week ?? 99));
  const authoredExams = {};
  let coveredFrom = 0;
  for (const exam of exams) {
    const upTo = lessonWeek.get(exam.anchor?.lessonId) ?? exam.anchor?.week ?? graph.course.weeks;
    const cumulative = String(exam.registryKey ?? '').toLowerCase().includes('final');
    const pool = lessons.filter((l) => l.week <= upTo && (cumulative || l.week > coveredFrom));
    coveredFrom = upTo;
    const conceptIds = [...new Set(pool.flatMap((l) => [...l.introduces, ...(l.reinforces ?? [])]))];
    const candidates = [];
    for (const cid of conceptIds) {
      const kernelId = conceptById.get(cid)?.genomeRef;
      if (!kernelId) continue;
      for (const item of bank.items) {
        if (item.kernelId === kernelId) candidates.push({ item, conceptId: cid });
      }
    }
    candidates.sort(
      (a, b) =>
        Number(usedBankIds.has(a.item.id)) - Number(usedBankIds.has(b.item.id)) ||
        Number(b.item.catches) + Number(b.item.confronts) - (Number(a.item.catches) + Number(a.item.confronts)),
    );
    const picked = [];
    const perConcept = new Map();
    for (const { item, conceptId } of candidates) {
      if (picked.length >= perExam) break;
      if ((perConcept.get(conceptId) ?? 0) >= 2) continue; // spread coverage
      if (picked.some((p) => tokenOverlapRatio(p.stem, item.stem) > 0.6)) continue;
      const rotation = picked.length % 4;
      const options = item.options.map((_, i) => item.options[(i + item.correctIndex - rotation + 4) % 4]);
      picked.push({
        stem: item.stem,
        options,
        correctIndex: rotation,
        explanation: item.explanation,
        bloom: item.bloom,
        difficulty: item.difficulty,
        conceptId,
      });
      perConcept.set(conceptId, (perConcept.get(conceptId) ?? 0) + 1);
      usedBankIds.add(item.id);
    }
    authoredExams[exam.id] = picked;
  }
  return authoredExams;
}

// ── zero-mode claim policy ──────────────────────────────────────────────────
// A LEXICAL verifier (≥2 shared informative tokens with a kernel fact) was
// built first and RETIRED BY ITS OWN CALIBRATION: against the nano verifier
// on the same claims it FALSE-KEPT 64.2% (95/148; nano's semantic bar keeps
// only ~40% of claims — no token-overlap threshold approximates that;
// $0.002 measurement, runs/zero-entailment-calibration). A citation the
// house cannot verify to the house standard must not ship: zero mode
// downgrades EVERY checkable claim to the JUDGED class (ref = null) —
// grounding is withheld, never overclaimed.
export function zeroEntailment(graph, authored) {
  let checked = 0;
  for (const lesson of graph.lessons) {
    const art = authored[lesson.id];
    if (!art) continue;
    for (const entry of collectCheckableClaims(graph, art)) {
      checked += 1;
      entry.claim.ref = null;
    }
  }
  return { checked, downgraded: checked };
}

// ── course-wide surfaces from the graph ─────────────────────────────────────
// Syllabus-class content IS structured data: description, policies,
// materials and logistics FAQ assemble deterministically from graph
// facts. This is the one surface where structural prose is honest — a
// syllabus states facts; it does not teach. Disclosed as assembled.
export function zeroCourseWide(graph) {
  const { course, outcomes = [], assessments = [], sources = [], lessons = [] } = graph;
  const weeks = course.weeks ?? lessons.reduce((m, l) => Math.max(m, l.week), 0);
  const outcomeLines = outcomes.slice(0, 6).map((o) => o.text ?? o.statement ?? '').filter(Boolean);
  const kinds = [...new Set(assessments.map((a) => a.registryKey).filter(Boolean))];
  return {
    courseDescription:
      `${course.title} is a ${course.level ?? ''} ${weeks}-week course in ${course.subject ?? course.title}. ` +
      (outcomeLines.length > 0
        ? `By the end, students can: ${outcomeLines.join('; ')}.`
        : `The course follows the week-by-week plan below.`),
    policies:
      kinds.length > 0
        ? `Assessment: ${kinds.join(', ')}. Weights and dates appear in the schedule; late work and academic-integrity policies follow the institution's standard terms unless the instructor states otherwise.`
        : `Assessment details appear in the schedule.`,
    materials: sources.slice(0, 8).map((s) => `${s.title ?? s.url ?? 'Reading'}${s.author ? ` — ${s.author}` : ''}`),
    faqIntro: `Practical questions about how ${course.title} runs, answered from the syllabus facts.`,
    logisticsFaq: [
      { q: 'How long is the course?', a: `${weeks} weeks, one lesson per week as scheduled.` },
      {
        q: 'What are the graded assessments?',
        a: kinds.length > 0 ? kinds.join(', ') + ' — anchored to the weeks shown in the schedule.' : 'See the schedule.',
      },
      {
        q: 'What if I miss a week?',
        a: 'Each study guide has a catch-up section for students who missed the reading; start there, then attempt the quiz.',
      },
    ],
  };
}
