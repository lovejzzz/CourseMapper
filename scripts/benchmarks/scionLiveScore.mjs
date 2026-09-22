// v0.20.08: scoring for the live Scion quality test (benchmarks/scion-live).
//
// A run is one brief generated end to end in a real browser with the real
// model. It is scored on what a teacher would check first:
//   - checks: at least three quarters of the pre-registered content checks
//     appear in what students work on: quiz questions, options, answers and
//     study-guide practice. The material card (the brief quoted verbatim) is
//     deliberately not counted, so copying the input cannot pass a check;
//   - language: the quiz is in the brief's language;
//   - no pipeline words anywhere in the package;
//   - no "Records A-D" template questions.
// A run is usable only when all four hold. The release gate is at least 9 of
// 12 usable and at least 2 of 4 in each family.

const JARGON_RE = /\b(?:admitted evidence|evidence ledger|source ledger|revision trail)\b/gi;
const TEMPLATE_RE = /\bRecords? [A-D](?:[-–][A-D])?\b/g;
const CJK_RE = /[㐀-鿿]/g;

export function quizText(deliverables) {
  const quizzes = deliverables?.quizBank?.data?.quizzes || deliverables?.quizBank?.quizzes || [];
  return quizzes
    .flatMap((quiz) => quiz.questions || [])
    .map((question) =>
      [question.question, ...(question.options || []), question.answer, question.explanation].join(' '),
    )
    .join('\n');
}

function languageShare(text) {
  const letters = String(text || '').replace(/[\s\d\p{P}\p{S}]/gu, '');
  return letters ? (letters.match(CJK_RE) || []).length / letters.length : 0;
}

export function studentWorkText(deliverables) {
  const guides = deliverables?.studyGuides?.data?.studyGuides || deliverables?.studyGuides?.studyGuides || [];
  const practice = guides.flatMap((guide) => [...(guide.objectivePractice || []), ...(guide.practiceAnswers || [])]);
  return `${quizText(deliverables)}\n${practice.join('\n')}`;
}

export function scoreScionLiveRun({ input, checks, deliverables, courseMap = null }) {
  const quiz = quizText(deliverables);
  const work = studentWorkText(deliverables);
  const everything = JSON.stringify({ courseMap, deliverables: deliverables || {} });
  const hits = Object.fromEntries(
    Object.entries(checks || {}).map(([name, pattern]) => [name, new RegExp(pattern, 'i').test(work)]),
  );
  const questions = (deliverables?.quizBank?.data?.quizzes || deliverables?.quizBank?.quizzes || []).flatMap(
    (quiz) => quiz.questions || [],
  );
  const share = languageShare(questions.map((question) => question.question).join(' '));
  const languageOk = input.lang === 'zh' ? share >= 0.3 : share <= 0.2;
  const jargon = (everything.match(JARGON_RE) || []).length;
  const templates = (quiz.match(TEMPLATE_RE) || []).length;
  const passed = Object.values(hits).filter(Boolean).length;
  const total = Object.keys(hits).length;
  // A short answer keyed "c" or left empty cannot be marked.
  const brokenAnswers = questions.filter(
    (question) =>
      question.type !== 'multiple_choice' &&
      (String(question.answer || '').replace(/[\s\p{P}]/gu, '').length < 2 ||
        /^[A-Da-d][.)]?$/.test(String(question.answer).trim())),
  ).length;
  const usable =
    questions.length > 0 &&
    passed >= Math.ceil(total * 0.75) &&
    languageOk &&
    jargon === 0 &&
    templates === 0 &&
    brokenAnswers === 0;
  return {
    id: input.id,
    family: input.id[0],
    questions: questions.length,
    hits,
    score: `${passed}/${Object.keys(hits).length}`,
    languageOk,
    jargon,
    templates,
    brokenAnswers,
    usable,
  };
}

export function gateScionLiveRuns(results) {
  const usable = results.filter((result) => result.usable).length;
  const families = {};
  for (const result of results) {
    families[result.family] ||= { usable: 0, total: 0 };
    families[result.family].total += 1;
    if (result.usable) families[result.family].usable += 1;
  }
  const familiesOk = Object.values(families).every((family) => family.usable >= Math.min(2, family.total));
  return { usable, total: results.length, families, passed: usable >= Math.ceil(results.length * 0.75) && familiesOk };
}
