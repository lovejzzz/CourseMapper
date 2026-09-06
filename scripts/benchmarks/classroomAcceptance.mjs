// Version 2 output checks. This file deliberately imports no product code.
// Structural consistency is necessary, but cannot certify educational value.
export const ACCEPTANCE_FEATURES = [
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
const array = (value) => (Array.isArray(value) ? value : []);
const normalize = (text) =>
  String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const minutes = (text) => Number(String(text || '').match(/\d+(?:\.\d+)?/)?.[0]);
const levels = ['exemplary', 'proficient', 'developing', 'beginning'];

export function evaluateAcceptanceOutputs(fixture, outputs, tasks) {
  const checks = [];
  const check = (feature, id, pass, detail) => checks.push({ feature, id, status: pass ? 'pass' : 'fail', detail });
  for (const feature of ACCEPTANCE_FEATURES) {
    check(feature, 'material-present', Boolean(outputs[feature]), 'The actual requested material must exist.');
    if (outputs[feature])
      check(
        feature,
        'no-broken-value-labels',
        !/null%|undefined%|\bNaN\b/.test(JSON.stringify(outputs[feature])),
        'No broken numeric label in the stored material.',
      );
  }
  check(
    'courseMap',
    'concrete-task',
    tasks.length > 0,
    'A source task must be admitted; absence is a coverage failure, not a quality pass.',
  );
  for (const task of tasks) {
    const transfer = array(task.sequence).find((unit) => unit.kind === 'independent-transfer');
    check(
      'courseMap',
      'canonical-inputs',
      array(task.inputs).length > 0 && task.inputs.every((input) => fixture.sources.includes(input.text)),
      'Main-task inputs must be verbatim source packet statements.',
    );
    check(
      'rubrics',
      'discriminating-task-bands',
      task.criteria?.length >= 3 &&
        task.criteria.every(
          (criterion) =>
            levels.every((level) => criterion.levels?.[level]) &&
            new Set(levels.map((level) => normalize(criterion.levels[level]))).size === 4,
        ),
      'Every task criterion needs four distinct observable descriptions. Semantic discrimination still needs review.',
    );
    check(
      'quizBank',
      'new-independent-case',
      Boolean(
        transfer?.question &&
        transfer?.answer &&
        transfer?.sources?.length &&
        transfer.question !== task.question &&
        !same(
          transfer.sources,
          task.inputs.map((input) => input.text),
        ),
      ),
      'Independent work must use a new packet and a complete teacher key.',
    );
    check(
      'quizBank',
      'transfer-bands',
      Boolean(
        transfer?.rubric?.length >= 3 &&
        transfer.rubric.every(
          (criterion) =>
            levels.every((level) => criterion[level]) &&
            new Set(levels.map((level) => normalize(criterion[level]))).size === 4,
        ),
      ),
      'Independent work has its own scoring descriptions.',
    );
    const expected = fixture.expected?.result?.match(/^\d+(?:\.\d+)?%/)?.[0];
    if (expected)
      check(
        'studyGuides',
        'reference-numeric-result',
        task.answer.includes(expected),
        `The reference response must contain the separately authored result ${expected}.`,
      );
    if (fixture.language === 'zh')
      check(
        'rubrics',
        'requested-language',
        task.criteria.every((criterion) => /\p{Script=Han}/u.test(criterion.label)),
        'Chinese tasks need Chinese criterion labels.',
      );
    for (const [feature, key] of [
      ['assignments', 'assignments'],
      ['rubrics', 'rubrics'],
      ['studyGuides', 'studyGuides'],
      ['lessonPlans', 'lessonPlans'],
    ]) {
      const row = array(outputs[feature]?.[key]).find((entry) => entry.taskId === task.id);
      check(
        feature,
        'retained-source-record',
        Boolean(row && task.inputs.every((input) => array(row.sourceEvidenceBrief?.claims).includes(input.text))),
        'A complete verbatim source record accompanies the task.',
      );
    }
    const assignment = array(outputs.assignments?.assignments).find((row) => row.taskId === task.id);
    const rubric = array(outputs.rubrics?.rubrics).find((row) => row.taskId === task.id);
    check(
      'assignments',
      'reference-answer-sync',
      normalize(assignment?.anchorExampleSet?.strongSample) === normalize(task.answer),
      'The assignment teacher key matches the canonical response.',
    );
    check(
      'rubrics',
      'assessment-criteria-sync',
      Boolean(assignment && rubric && same(assignment.weightedGradingCriteria, rubric.criteria)),
      'Assignment criteria and rubric score the same task with the same descriptors and points.',
    );
    const questions = array(outputs.quizBank?.quizzes).flatMap((quiz) => array(quiz.questions));
    const independent = transfer && questions.find((question) => question.practiceId === transfer.id);
    check(
      'quizBank',
      'independent-key-sync',
      Boolean(independent && normalize(independent.sampleAnswer || independent.answer) === normalize(transfer.answer)),
      'The quiz independent key matches its own case, not the taught example.',
    );
    const guide = array(outputs.studyGuides?.studyGuides).find((row) => row.taskId === task.id);
    const guideQuestion =
      transfer && array(guide?.reviewQuestions).find((question) => question.practiceId === transfer.id);
    check(
      'studyGuides',
      'independent-key-sync',
      Boolean(guideQuestion && normalize(guideQuestion.answer) === normalize(transfer.answer)),
      'Self-study includes the independent case and matching key.',
    );
  }
  for (const row of array(outputs.assignments?.assignments)) {
    check(
      'assignments',
      'no-invented-course-weight',
      row.weightPercent == null,
      'These v2 packets supply no course grading policy; rubric points must not invent one.',
    );
  }
  for (const row of array(outputs.rubrics?.rubrics)) {
    check(
      'rubrics',
      'point-total',
      row.totalPoints > 0 &&
        Math.abs(
          array(row.criteria).reduce((sum, criterion) => sum + Number(criterion.points || 0), 0) - row.totalPoints,
        ) < 0.001,
      'Displayed criterion points sum to the displayed task total.',
    );
  }
  for (const plan of array(outputs.lessonPlans?.lessonPlans)) {
    check(
      'lessonPlans',
      'class-clock',
      minutes(plan.duration) === fixture.sessionMinutes &&
        array(plan.outline).reduce((sum, phase) => sum + minutes(phase.time), 0) === fixture.sessionMinutes,
      'The class phases fit the requested clock; feasibility requires classroom review.',
    );
  }
  for (const deck of array(outputs.slideDecks?.decks)) {
    const slides = array(deck.slides);
    const practice = slides.findIndex((slide) => slide.taskRole === 'activity');
    check(
      'slideDecks',
      'reasoning-before-practice',
      practice >= 0 && slides.every((slide, index) => !slide.taskRole?.startsWith('worked:') || index < practice),
      'All generated worked reasoning precedes independent work.',
    );
    check('slideDecks', 'slide-count', deck.totalSlides === slides.length, 'Declared count matches actual slides.');
    const visible = (slide) => [slide.title, ...array(slide.bullets)].filter(Boolean).join(' ');
    check(
      'slideDecks',
      'visible-density',
      slides.every((slide) =>
        /\p{Script=Han}/u.test(visible(slide))
          ? [...visible(slide).replace(/\s/g, '')].length <= 300
          : visible(slide).split(/\s+/).length <= 95,
      ),
      'Visible content stays within a bounded slide text load. Rendering is checked separately.',
    );
  }
  return {
    checks,
    failures: checks
      .filter((entry) => entry.status === 'fail')
      .map((entry) => `${entry.feature}/${entry.id}: ${entry.detail}`),
    educationReview: 'pending independent review of correctness, relevance, transfer and scoring discrimination',
  };
}
