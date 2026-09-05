// Independent output checks. Deliberately imports no compiler or product grader.
export const FEATURES = [
  'courseMap',
  'syllabus',
  'lessonPlans',
  'slideDecks',
  'assignments',
  'rubrics',
  'discussions',
  'quizBank',
  'studyGuides',
  'courseFaq',
];
const array = (x) => (Array.isArray(x) ? x : x == null ? [] : [x]);
const pick = (x, keys) => Object.fromEntries(keys.filter((k) => x?.[k] != null).map((k) => [k, x[k]]));
const flatten = (x) =>
  typeof x === 'string'
    ? [x]
    : Array.isArray(x)
      ? x.flatMap(flatten)
      : x && typeof x === 'object'
        ? Object.values(x).flatMap(flatten)
        : [];
const words = (x) =>
  flatten(x)
    .join(' ')
    .match(/[\p{L}\p{N}]+/gu) || [];
const compact = (x) => flatten(x).join(' ').replace(/\s+/g, ' ').trim();
const number = (x) => Number.parseFloat(x) || 0;
const itemKey = { slideDecks: 'decks', quizBank: 'quizzes', courseFaq: 'faqs' };
export function rowsFor(feature, data) {
  if (feature === 'courseMap') return array(data?.lessons);
  return array(data?.[itemKey[feature] || feature]);
}

// This is a classroom-facing field projection, not a JSON-length score.
// Receipts, fingerprints, quality self-reports and hidden scaffolding cannot
// earn credit for text missing from the actual material.
export function classroomSurface(feature, data) {
  return rowsFor(feature, data).map((r) => {
    switch (feature) {
      case 'courseMap':
        return pick(r, ['title', 'sections']);
      case 'syllabus':
        return pick(r, [
          'courseTitle',
          'meetingPattern',
          'deliveryMode',
          'courseDescription',
          'gettingStarted',
          'learningOutcomes',
          'courseRequirements',
          'weeklySchedule',
          'gradingScale',
          'latePolicy',
          'attendancePolicy',
        ]);
      case 'lessonPlans':
        return pick(r, [
          'lessonTitle',
          'duration',
          'objectives',
          'materials',
          'warmUp',
          'outline',
          'workedExample',
          'formativeCheck',
          'homework',
          'closingActivity',
        ]);
      case 'slideDecks':
        return array(r.slides).map((s) => pick(s, ['title', 'subtitle', 'bullets', 'notes', 'content']));
      case 'assignments':
        return pick(r, [
          'title',
          'overview',
          'instructions',
          'formatRequirements',
          'deliverables',
          'gradingCriteria',
          'supportResources',
        ]);
      case 'rubrics':
        return {
          title: r.title,
          taskDirections: r.taskDirections,
          criteria: array(r.criteria).map((c) =>
            pick(c, ['criterion', 'exemplary', 'proficient', 'developing', 'beginning']),
          ),
        };
      case 'discussions':
        return pick(r, [
          'context',
          'prompt',
          'positionMap',
          'sourceArtifacts',
          'followUpProbes',
          'evaluationCriteria',
          'guidelines',
        ]);
      case 'quizBank':
        return array(r.questions).map((q) =>
          pick(q, ['question', 'options', 'answer', 'sampleAnswer', 'explanation', 'scoringGuidance']),
        );
      case 'studyGuides':
        return pick(r, [
          'summary',
          'sourceEvidenceBrief',
          'objectivePractice',
          'keyTerms',
          'workedExample',
          'reviewQuestions',
          'practiceActivities',
          'examPrep',
        ]);
      case 'courseFaq':
        return array(r.qs).map((q) => pick(q, ['q', 'an']));
      default:
        return {};
    }
  });
}

export function evaluateClassroomOutputs(fixture, outputs) {
  const checks = [];
  const check = (feature, id, pass, evidence, severity = 'major') =>
    checks.push({ feature, id, status: pass ? 'pass' : 'fail', severity, evidence });
  const each = (feature, id, predicate, explain, severity) => {
    const rows = rowsFor(feature, outputs[feature]);
    const failures = rows.flatMap((row, i) => (predicate(row, i) ? [] : [{ row: i, detail: explain(row, i) }]));
    check(
      feature,
      id,
      rows.length > 0 && failures.length === 0,
      failures.length ? failures : ['All observed rows satisfy this check.'],
      severity,
    );
  };
  const expected = fixture.expectations || {};
  for (const feature of FEATURES) {
    const rows = rowsFor(feature, outputs[feature]);
    const text = compact(classroomSurface(feature, outputs[feature]));
    check(
      feature,
      'material-present',
      rows.length > 0 && text.length > 0,
      `${rows.length} material row(s); ${words(text).length} visible-field words.`,
      'critical',
    );
    const phantom = [
      ...text.matchAll(
        /two (?:[\p{L}\p{N}:/. -]{0,95} )?solution paths|competing solution paths|the recording or transcript excerpt/giu,
      ),
    ]
      .map((m) => m[0])
      .filter((m) => !/\bor\b/i.test(m) && !fixture.sourceBrief.toLowerCase().includes(m.toLowerCase()));
    check(
      feature,
      'provided-materials-only',
      !expected.selfContained || phantom.length === 0,
      phantom.length ? phantom : ['No targeted phantom-material reference found.'],
      'critical',
    );
    const internal = text.match(/fact-(?:subject|ledger)-projection|model-provisional|source-ledger-facts-only/g) || [];
    check(
      feature,
      'no-internal-labels',
      internal.length === 0,
      internal.length ? internal : ['No targeted internal label found.'],
    );
    if (expected.singleSession) {
      const drift =
        text.match(
          /weekly course sessions|later course topics|final course synthesis|over the semester|throughout the semester/gi,
        ) || [];
      check(
        feature,
        'single-session-scope',
        drift.length === 0,
        drift.length ? drift : ['No targeted multi-session promise found.'],
      );
    }
  }
  each(
    'courseMap',
    'observable-objective',
    (r) =>
      array(r.sections).some((s) =>
        /\b(calculate|identify|explain|distinguish|propose|compare|evaluate|design|justify)\b/i.test(
          compact(s.learningObjectives),
        ),
      ),
    () => 'No observable objective in a lesson.',
  );
  check(
    'courseMap',
    'lesson-count',
    rowsFor('courseMap', outputs.courseMap).length === fixture.map.lessons.length,
    `Expected ${fixture.map.lessons.length} lessons.`,
  );
  each(
    'syllabus',
    'schedule-coverage',
    (r) => array(r.weeklySchedule).length === fixture.map.lessons.length,
    (r) => `${array(r.weeklySchedule).length} scheduled rows.`,
  );
  each(
    'syllabus',
    'grade-weight-total',
    (r) => Math.abs(array(r.courseRequirements).reduce((n, x) => n + number(x.weight), 0) - 100) < 0.01,
    (r) => array(r.courseRequirements).map((x) => x.weight),
    'critical',
  );
  each(
    'lessonPlans',
    'class-clock',
    (r) =>
      number(r.duration) === fixture.sessionMinutes &&
      array(r.outline).reduce((n, x) => n + number(x.time), 0) === fixture.sessionMinutes,
    (r) =>
      `Duration ${r.duration}; outline ${array(r.outline).reduce((n, x) => n + number(x.time), 0)}; expected ${fixture.sessionMinutes}.`,
    'critical',
  );
  each(
    'lessonPlans',
    'usable-feedback-answer',
    (r) => compact(r.formativeCheck?.expectedAnswer).length > 0,
    (r) => r.formativeCheck?.prompt || 'No check prompt.',
  );
  each(
    'slideDecks',
    'slide-density',
    (r) => array(r.slides).every((s) => words([s.title, s.bullets, s.content]).length <= 85),
    (r) =>
      array(r.slides)
        .map((s, i) => ({ slide: i + 1, words: words([s.title, s.bullets, s.content]).length }))
        .filter((x) => x.words > 85),
    'major',
  );
  each(
    'slideDecks',
    'speaker-guidance',
    (r) => array(r.slides).length > 0 && array(r.slides).every((s) => words(s.notes).length >= 8),
    () => 'A slide lacks usable speaker guidance.',
  );
  each(
    'assignments',
    'submission-and-criteria',
    (r) =>
      array(r.instructions).length >= 2 && array(r.deliverables).length > 0 && array(r.gradingCriteria).length >= 2,
    () => 'Missing directions, submission product or criteria.',
  );
  if (expected.arithmetic)
    each(
      'assignments',
      'proportionate-task',
      (r) => !/750[–-]1,250 words/.test(compact(classroomSurface('assignments', { assignments: [r] }))),
      () => 'A short calculation task inherits a 750–1,250-word essay option.',
    );
  each(
    'rubrics',
    'distinct-performance-levels',
    (r) =>
      array(r.criteria).length > 0 &&
      array(r.criteria).every((c) => {
        const levels = ['exemplary', 'proficient', 'developing', 'beginning'].map((k) => compact(c[k]));
        return levels.every((x) => x.length > 10) && new Set(levels).size === 4;
      }),
    () => 'Missing or identical level descriptions.',
  );
  each(
    'rubrics',
    'point-total',
    (r) => Math.abs(array(r.criteria).reduce((n, c) => n + number(c.points), 0) - number(r.totalPoints)) < 0.01,
    () => 'Criterion points do not match rubric total.',
    'critical',
  );
  each(
    'discussions',
    'evidence-and-followup',
    (r) =>
      compact(r.prompt).length > 20 &&
      array(r.followUpProbes).length >= 2 &&
      (compact(r.evidenceRequirement).length > 10 || array(r.sourceArtifacts).length > 0),
    () => 'Missing prompt, evidence directions or follow-up.',
  );
  if (expected.arithmetic)
    each(
      'discussions',
      'no-false-arithmetic-debate',
      (r) =>
        !(
          /interpretation|reading/i.test(compact(r.context)) &&
          /solution paths|interpretation:.*\d+\/\d+.*=/i.test(compact([r.prompt, r.positionMap]))
        ),
      () => 'A verified calculation is framed as competing factual interpretations.',
    );
  each(
    'quizBank',
    'answered-items',
    (r) =>
      array(r.questions).length > 0 &&
      array(r.questions).every((q) => {
        if (q.type !== 'multiple_choice')
          return (
            compact(q.answer || q.sampleAnswer).length > 0 ||
            typeof q.answer === 'boolean' ||
            typeof q.answer === 'number'
          );
        const index = Number.isInteger(q.answerIndex)
          ? q.answerIndex
          : /^[A-Z]$/.test(q.answer || '')
            ? q.answer.charCodeAt(0) - 65
            : -1;
        return (
          index >= 0 &&
          index < array(q.options).length &&
          new Set(array(q.options).map((x) => compact(x).replace(/^[A-Z][.)]\s*/, ''))).size === array(q.options).length
        );
      }),
    () => 'Unanswerable item, invalid choice key or duplicate options.',
    'critical',
  );
  each(
    'quizBank',
    'concrete-reference-answers',
    (r) =>
      array(r.questions).every(
        (q) =>
          !/^A valid response identifies an exact supplied statement|^Quote or identify the decisive ledger statement/i.test(
            compact(q.answer || q.sampleAnswer),
          ),
      ),
    () => 'Scoring instructions stand in for a worked reference answer.',
  );
  each(
    'quizBank',
    'question-uniqueness',
    (r) => new Set(array(r.questions).map((q) => compact(q.question).toLowerCase())).size === array(r.questions).length,
    () => 'Duplicate question.',
  );
  each(
    'studyGuides',
    'answerable-self-study',
    (r) => array(r.reviewQuestions).length > 0 && array(r.reviewQuestions).every((q) => compact(q.answer).length > 0),
    () => 'A review question has no self-check answer.',
  );
  each(
    'studyGuides',
    'worked-example',
    (r) => compact(r.workedExample?.result).length > 10 && array(r.workedExample?.steps).length >= 2,
    () => 'Missing worked reasoning or result.',
  );
  each(
    'courseFaq',
    'direct-concise-answers',
    (r) => array(r.qs).length >= 3 && array(r.qs).every((q) => words(q.an).length >= 5 && words(q.an).length <= 120),
    (r) =>
      array(r.qs)
        .filter((q) => words(q.an).length > 120)
        .map((q) => ({ question: q.q, words: words(q.an).length })),
  );
  const guides = rowsFor('studyGuides', outputs.studyGuides);
  const plans = rowsFor('lessonPlans', outputs.lessonPlans);
  check(
    'lessonPlans',
    'student-teacher-answer-sync',
    plans.length > 0 &&
      plans.every(
        (p, i) =>
          !p.formativeCheck?.practiceId ||
          array(guides[i]?.reviewQuestions).some(
            (q) => q.practiceId === p.formativeCheck.practiceId && q.answer === p.formativeCheck.expectedAnswer,
          ),
      ),
    'Shared practice identities must carry identical reference answers.',
    'critical',
  );
  if (expected.arithmetic) {
    const { fraction, decimal, percent } = expected.arithmetic;
    const [n, d] = fraction.split('/').map(Number);
    const validOracle = Math.abs(n / d - Number(decimal)) < 1e-10 && Math.abs((n / d) * 100 - Number(percent)) < 1e-10;
    for (const feature of ['lessonPlans', 'studyGuides']) {
      const r = rowsFor(feature, outputs[feature])[0];
      const v = r?.workedExample?.verification;
      const result = (r?.workedExample?.result || '').match(/(\d+)\s*\/\s*(\d+)\s*=\s*([\d.]+)\s*=\s*([\d.]+)\s*%/);
      const displayedCorrect =
        result &&
        Number(result[1]) === n &&
        Number(result[2]) === d &&
        Number(result[3]) === Number(decimal) &&
        Number(result[4]) === Number(percent);
      check(
        feature,
        'numeric-oracle',
        Boolean(
          validOracle &&
          displayedCorrect &&
          v?.numerator === String(n) &&
          v?.denominator === String(d) &&
          Number(v?.decimal) === Number(decimal) &&
          Number(v?.percent) === Number(percent),
        ),
        { expected: expected.arithmetic, observedResult: r?.workedExample?.result || null, observed: v || null },
        'critical',
      );
    }
    each(
      'quizBank',
      'calculation-objective-tested',
      (r) =>
        array(r.questions).some(
          (q) =>
            /\b(?:calculate|recalculate|convert|compute)\b|÷/i.test(q.question || '') &&
            compact(q.answer || q.sampleAnswer).includes(`${percent}%`),
        ),
      () => `No directly answered calculation item for ${fraction}.`,
    );
  }
  return {
    caseId: fixture.id,
    split: fixture.split,
    checks,
    summary: FEATURES.map((feature) => {
      const c = checks.filter((x) => x.feature === feature);
      return {
        feature,
        passed: c.filter((x) => x.status === 'pass').length,
        failed: c.filter((x) => x.status === 'fail').length,
        critical: c.filter((x) => x.status === 'fail' && x.severity === 'critical').length,
      };
    }),
    educationalJudgment:
      'Required separately: source truth, objective coverage, scaffolding, rubric validity, pacing and rendered usability. These checks are defect probes, not an educational quality score.',
  };
}
