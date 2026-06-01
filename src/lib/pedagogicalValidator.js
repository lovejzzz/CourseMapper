/**
 * pedagogicalValidator.js — Client-side pedagogical validation engine.
 *
 * Pure functions that analyze course map + deliverables for educational design issues:
 *   1. Bloom's taxonomy alignment (objectives ↔ assessments)
 *   2. Objective coverage (every objective assessed, every assessment mapped)
 *   3. Cognitive load (overloaded weeks)
 *   4. Difficulty progression (Easy → Hard across lessons)
 *
 * Runs synchronously, no API calls, <50ms for 20-lesson courses.
 */

import { getArrayKey } from './syncDependencies';
import readability from 'text-readability';

// ── Bloom's Taxonomy ─────────────────────────────────────────────────────────

const BLOOMS_LEVELS = {
  Remember: 1,
  Understand: 2,
  Apply: 3,
  Analyze: 4,
  Evaluate: 5,
  Create: 6,
};

const BLOOMS_VERBS = {
  // L1 — Remember
  define: 1,
  list: 1,
  recall: 1,
  identify: 1,
  name: 1,
  recognize: 1,
  state: 1,
  label: 1,
  match: 1,
  select: 1,
  // L2 — Understand
  explain: 2,
  summarize: 2,
  interpret: 2,
  classify: 2,
  compare: 2,
  paraphrase: 2,
  describe: 2,
  discuss: 2,
  distinguish: 2,
  predict: 2,
  // L3 — Apply
  apply: 3,
  demonstrate: 3,
  solve: 3,
  use: 3,
  implement: 3,
  calculate: 3,
  execute: 3,
  illustrate: 3,
  practice: 3,
  show: 3,
  // L4 — Analyze
  analyze: 4,
  differentiate: 4,
  organize: 4,
  examine: 4,
  categorize: 4,
  deconstruct: 4,
  relate: 4,
  contrast: 4,
  investigate: 4,
  // L5 — Evaluate
  evaluate: 5,
  assess: 5,
  critique: 5,
  justify: 5,
  judge: 5,
  argue: 5,
  defend: 5,
  appraise: 5,
  prioritize: 5,
  recommend: 5,
  // L6 — Create
  create: 6,
  design: 6,
  develop: 6,
  construct: 6,
  formulate: 6,
  compose: 6,
  produce: 6,
  propose: 6,
  invent: 6,
  synthesize: 6,
};

const LEVEL_NAMES = ['', 'Remember', 'Understand', 'Apply', 'Analyze', 'Evaluate', 'Create'];

const SEVERITY_ORDER = { error: 0, warning: 1, info: 2 };

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Parse Bloom's verbs from a learning objectives text block. */
export function parseBloomsFromObjectives(text) {
  if (!text || typeof text !== 'string') return [];
  const results = [];
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  for (const line of lines) {
    // Strip numbered prefixes like "1a.", "2b.", "3.", "- "
    const stripped = line
      .replace(/^\s*[-•]?\s*\d+[a-z]?\.\s*/i, '')
      .replace(/^students?\s+will\s+be\s+able\s+to:?\s*/i, '');
    if (!stripped) continue;

    // Extract the first word (the verb)
    const firstWord = stripped.split(/[\s,.(]/)[0].toLowerCase();
    const level = BLOOMS_VERBS[firstWord];
    if (level) {
      results.push({ verb: firstWord, level, objectiveText: stripped });
    }
  }
  return results;
}

/** Get all Bloom's levels from a lesson's objectives (across all sections). */
function getLessonObjectiveLevels(lesson) {
  if (!lesson?.sections) return [];
  const levels = [];
  for (const section of lesson.sections) {
    const objectiveText =
      section.learningObjectives ||
      section.objectives ||
      section.lo ||
      section.learningObjective ||
      section.learning_outcomes ||
      '';
    const parsed = parseBloomsFromObjectives(Array.isArray(objectiveText) ? objectiveText.join('\n') : objectiveText);
    levels.push(...parsed);
  }
  return levels;
}

/** Resolve a Bloom's level string like "Analyze" or "Apply" to a number 1-6. */
function resolveBloomsLevel(bl) {
  if (!bl) return 0;
  if (typeof bl === 'number') return bl;
  return BLOOMS_LEVELS[bl] || BLOOMS_LEVELS[bl.charAt(0).toUpperCase() + bl.slice(1).toLowerCase()] || 0;
}

/** Get the deliverable array for a feature, safely. */
function getDelivArray(deliverables, featureId) {
  const entry = deliverables?.[featureId];
  if (!entry || entry.status !== 'done' || !entry.data) return null;
  const key = getArrayKey(featureId, entry.data);
  if (!key || !Array.isArray(entry.data[key])) return null;
  return entry.data[key];
}

/** Normalize text for substring matching. */
function norm(s) {
  return (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim();
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  return value ? [value] : [];
}

function collectText(value, output = []) {
  if (value == null) return output;
  if (typeof value === 'string' || typeof value === 'number') {
    output.push(String(value));
    return output;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectText(item, output));
    return output;
  }
  if (typeof value === 'object') {
    Object.values(value).forEach((item) => collectText(item, output));
  }
  return output;
}

function textify(value) {
  return collectText(value).join(' ').replace(/\s+/g, ' ').trim();
}

function getQuizQuestions(quiz) {
  return asArray(quiz?.qs || quiz?.questions || quiz?.items);
}

function getRelatedLessons(assignment) {
  return asArray(
    assignment?.rl ||
      assignment?.relatedLessons ||
      assignment?.lessons ||
      assignment?.lessonTitles ||
      assignment?.lessonTitle ||
      assignment?.lt,
  );
}

function getAssignmentObjectives(assignment) {
  return asArray(
    assignment?.ob ||
      assignment?.objectives ||
      assignment?.learningObjectives ||
      assignment?.outcomes ||
      assignment?.objectiveAligned,
  );
}

function getRubricCriteria(rubric) {
  return asArray(rubric?.cr || rubric?.criteria || rubric?.rows || rubric?.performanceCriteria);
}

function extractLessonNumbersFromText(value) {
  const text = textify(value);
  const lessonNumbers = new Set();
  for (const match of text.matchAll(/\b(?:lesson|week|module)\s*#?\s*(\d{1,2})\b/gi)) {
    const num = Number(match[1]);
    if (Number.isInteger(num) && num > 0) lessonNumbers.add(num);
  }
  return [...lessonNumbers];
}

function getRubricLessonText(rubric) {
  return textify([
    rubric?.lessonNumber,
    rubric?.ln,
    rubric?.lesson,
    rubric?.week,
    rubric?.module,
    rubric?.lessonTitle,
    rubric?.lt,
    rubric?.relatedLessons,
    rubric?.rl,
    rubric?.lessonTitles,
    rubric?.title,
    rubric?.t,
    rubric?.assessmentTitle,
    rubric?.assessment,
    rubric?.assessmentType,
    rubric?.at,
    rubric?.tags,
    rubric?.tg,
  ]);
}

function rubricMatchesLesson(rubric, lesson, lessonIndex) {
  if (!rubric || !lesson) return false;
  const lessonNumber = lessonIndex + 1;
  const numericFields = [rubric.lessonNumber, rubric.ln, rubric.lesson, rubric.week, rubric.module]
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value > 0);
  if (numericFields.includes(lessonNumber)) return true;

  const rubricLessonText = getRubricLessonText(rubric);
  const explicitNumbers = extractLessonNumbersFromText(rubricLessonText);
  if (explicitNumbers.length > 0) return explicitNumbers.includes(lessonNumber);

  const lessonTitle = norm(lesson?.title);
  const rubricText = norm(rubricLessonText);
  return (
    lessonTitle.length >= 8 &&
    rubricText.length >= 8 &&
    (rubricText.includes(lessonTitle) || lessonTitle.includes(rubricText))
  );
}

function getRubricsForLesson(rubrics, lesson, lessonIndex, lessons) {
  if (!Array.isArray(rubrics) || rubrics.length === 0) return [];
  const matched = rubrics.filter((rubric) => rubricMatchesLesson(rubric, lesson, lessonIndex));
  if (matched.length > 0) return matched;
  return rubrics.length === lessons.length && rubrics[lessonIndex] ? [rubrics[lessonIndex]] : [];
}

function getLessonAssessmentText(lesson) {
  const sectionText = asArray(lesson?.sections)
    .map((section) =>
      textify([
        section?.weeklyAssessments,
        section?.weeklyAssessment,
        section?.assessments,
        section?.assessment,
        section?.assessmentPlan,
        section?.as,
      ]),
    )
    .join(' ');
  return sectionText || textify([lesson?.weeklyAssessments, lesson?.assessments, lesson?.assessment, lesson?.as]);
}

function lessonHasAssessmentCue(lesson) {
  const assessmentText = getLessonAssessmentText(lesson);
  if (!assessmentText) return false;
  const negative =
    /\b(no\s+(?:graded\s+)?(?:assessment|assignment|quiz|exam|rubric)|not\s+graded|ungraded|optional|informal\s+check|practice\s+only)\b/i;
  const positive =
    /\b(quiz|exam|test|assignment|project|paper|essay|portfolio|presentation|report|brief|memo|problem\s+set|case\s+study|lab\s+report|reflection|analysis|proposal|deliverable|graded|grade|points?|rubric|submit|submission|discussion\s+post|assessment)\b/i;
  if (negative.test(assessmentText)) return false;
  return positive.test(assessmentText);
}

function getAlignmentText(item) {
  return (
    item?.oa ||
    item?.objectiveAligned ||
    item?.objectiveAlignment ||
    item?.learningObjective ||
    item?.learningObjectives ||
    item?.outcome ||
    ''
  );
}

function getBloomsText(item) {
  return item?.bl || item?.bloomsLevel || item?.bloomLevel || item?.blooms || item?.level || '';
}

// ── 1. Bloom's Alignment ─────────────────────────────────────────────────────

export function validateBloomsAlignment(courseMap, deliverables) {
  const findings = [];
  const lessons = courseMap?.lessons || [];
  if (lessons.length === 0) return findings;

  const lessonAvgs = []; // track per-lesson average for progression check

  for (let li = 0; li < lessons.length; li++) {
    const lesson = lessons[li];
    const objLevels = getLessonObjectiveLevels(lesson);
    if (objLevels.length === 0) continue;

    const maxObjLevel = Math.max(...objLevels.map((o) => o.level));
    const hasHighOrder = objLevels.some((o) => o.level >= 5); // Evaluate or Create

    // Collect assessment Bloom's levels for this lesson
    const assessmentLevels = [];

    // Quiz questions
    const quizzes = getDelivArray(deliverables, 'quizBank');
    if (quizzes && quizzes[li]) {
      const qs = getQuizQuestions(quizzes[li]);
      for (const q of qs) {
        const lvl = resolveBloomsLevel(getBloomsText(q));
        if (lvl > 0) assessmentLevels.push(lvl);
      }
    }

    // Assignments (flat array — match by rl or title)
    const assignments = getDelivArray(deliverables, 'assignments');
    if (assignments) {
      const lessonTitle = norm(lesson.title);
      for (const a of assignments) {
        const related = getRelatedLessons(a).map(norm);
        if (related.some((r) => r.includes(lessonTitle) || lessonTitle.includes(r))) {
          const lvl = resolveBloomsLevel(getBloomsText(a));
          if (lvl > 0) assessmentLevels.push(lvl);
        }
      }
    }

    // Discussions
    const discussions = getDelivArray(deliverables, 'discussions');
    if (discussions && discussions[li]) {
      const lvl = resolveBloomsLevel(getBloomsText(discussions[li]));
      if (lvl > 0) assessmentLevels.push(lvl);
    }

    // Lesson plan segments
    const plans = getDelivArray(deliverables, 'lessonPlans');
    if (plans && plans[li]) {
      for (const seg of asArray(plans[li].ol || plans[li].outline)) {
        const lvl = resolveBloomsLevel(getBloomsText(seg));
        if (lvl > 0) assessmentLevels.push(lvl);
      }
    }

    // Study guide review questions
    const guides = getDelivArray(deliverables, 'studyGuides');
    if (guides && guides[li]) {
      for (const rq of asArray(guides[li].rq || guides[li].reviewQuestions || guides[li].questions)) {
        const lvl = resolveBloomsLevel(getBloomsText(rq));
        if (lvl > 0) assessmentLevels.push(lvl);
      }
    }

    if (assessmentLevels.length === 0) continue;

    const maxAssessLevel = Math.max(...assessmentLevels);
    const avgAssessLevel = assessmentLevels.reduce((s, v) => s + v, 0) / assessmentLevels.length;
    lessonAvgs.push({ li, avg: avgAssessLevel });

    // Check: objectives require L4+ but ALL assessments are L1-2
    if (maxObjLevel >= 4 && maxAssessLevel <= 2) {
      findings.push({
        id: `blooms-mismatch-L${li}`,
        severity: 'error',
        category: 'blooms',
        message: `Lesson ${li + 1} objectives require ${LEVEL_NAMES[maxObjLevel]} (L${maxObjLevel}) but all assessments are ${LEVEL_NAMES[maxAssessLevel]} or below`,
        lessonIndex: li,
        featureId: null,
        suggestedPrompt: `The assessments in Lesson ${li + 1} are too low-level for the objectives. Upgrade quiz questions and activities to ${LEVEL_NAMES[maxObjLevel]} level.`,
      });
    }

    // Check: objectives include Evaluate/Create but no L5-6 assessments
    if (hasHighOrder && maxAssessLevel < 5) {
      findings.push({
        id: `blooms-no-higher-L${li}`,
        severity: 'warning',
        category: 'blooms',
        message: `Lesson ${li + 1} objectives include Evaluate/Create but no assessments reach that level (max: ${LEVEL_NAMES[maxAssessLevel]})`,
        lessonIndex: li,
        featureId: null,
        suggestedPrompt: `Add an Evaluate or Create level activity to Lesson ${li + 1} to match the learning objectives.`,
      });
    }
  }

  // Check Bloom's progression across lessons (avg shouldn't regress by >1)
  for (let i = 1; i < lessonAvgs.length; i++) {
    const prev = lessonAvgs[i - 1];
    const curr = lessonAvgs[i];
    if (prev.avg - curr.avg > 1.0) {
      findings.push({
        id: `blooms-regression-L${curr.li}`,
        severity: 'warning',
        category: 'blooms',
        message: `Bloom's level drops from Lesson ${prev.li + 1} (avg ${prev.avg.toFixed(1)}) to Lesson ${curr.li + 1} (avg ${curr.avg.toFixed(1)})`,
        lessonIndex: curr.li,
        featureId: null,
        suggestedPrompt: `Lesson ${curr.li + 1} assessments are significantly lower-level than Lesson ${prev.li + 1}. Review and increase the cognitive demand.`,
      });
    }
  }

  return findings;
}

// ── 2. Objective Alignment ───────────────────────────────────────────────────

export function validateObjectiveAlignment(courseMap, deliverables) {
  const findings = [];
  const lessons = courseMap?.lessons || [];
  if (lessons.length === 0) return findings;

  // Check which deliverables have alignment data
  const hasQuiz = !!getDelivArray(deliverables, 'quizBank');
  const hasAssignments = !!getDelivArray(deliverables, 'assignments');
  const hasRubrics = !!getDelivArray(deliverables, 'rubrics');

  if (!hasQuiz && !hasAssignments && !hasRubrics) {
    findings.push({
      id: 'alignment-no-data',
      severity: 'info',
      category: 'alignment',
      message: 'No assessments generated yet — cannot check objective alignment',
      lessonIndex: null,
      featureId: null,
      suggestedPrompt: '',
    });
    return findings;
  }

  for (let li = 0; li < lessons.length; li++) {
    const lesson = lessons[li];
    const objParsed = getLessonObjectiveLevels(lesson);
    if (objParsed.length === 0) continue;

    const objectives = objParsed.map((o) => norm(o.objectiveText));

    // Collect all assessment alignment texts for this lesson
    const assessmentAlignments = [];
    let assessmentItemSeen = false;

    const quizzes = getDelivArray(deliverables, 'quizBank');
    if (quizzes && quizzes[li]) {
      assessmentItemSeen = true;
      for (const q of getQuizQuestions(quizzes[li])) {
        const alignment = getAlignmentText(q);
        if (alignment) assessmentAlignments.push(norm(Array.isArray(alignment) ? alignment.join(' ') : alignment));
      }
    }

    const assignments = getDelivArray(deliverables, 'assignments');
    if (assignments) {
      const lessonTitle = norm(lesson.title);
      for (const a of assignments) {
        const related = getRelatedLessons(a).map(norm);
        if (related.some((r) => r.includes(lessonTitle) || lessonTitle.includes(r))) {
          assessmentItemSeen = true;
          for (const ob of getAssignmentObjectives(a)) {
            assessmentAlignments.push(norm(ob));
          }
        }
      }
    }

    const rubrics = getDelivArray(deliverables, 'rubrics');
    const lessonRubrics = getRubricsForLesson(rubrics, lesson, li, lessons);
    if (lessonRubrics.length > 0) {
      assessmentItemSeen = true;
      for (const rubric of lessonRubrics) {
        for (const cr of getRubricCriteria(rubric)) {
          const alignment = getAlignmentText(cr);
          if (alignment) assessmentAlignments.push(norm(Array.isArray(alignment) ? alignment.join(' ') : alignment));
        }
      }
    }

    if (
      assessmentAlignments.length === 0 &&
      objectives.length > 0 &&
      !assessmentItemSeen &&
      !lessonHasAssessmentCue(lesson)
    ) {
      continue;
    }

    if (assessmentAlignments.length === 0 && objectives.length > 0) {
      findings.push({
        id: `alignment-no-assess-L${li}`,
        severity: 'error',
        category: 'alignment',
        message: `Lesson ${li + 1} has ${objectives.length} objectives but no assessments map to them`,
        lessonIndex: li,
        featureId: null,
        suggestedPrompt: `Add quiz questions or assignments for Lesson ${li + 1} that align to the learning objectives.`,
      });
      continue;
    }

    // Check each objective has at least one matching assessment
    for (let oi = 0; oi < objectives.length; oi++) {
      const obj = objectives[oi];
      // Substring match: does any assessment mention key words from the objective?
      const objWords = obj.split(/\s+/).filter((w) => w.length > 3); // significant words
      const isMatched = assessmentAlignments.some((aa) => objWords.some((w) => aa.includes(w)));
      if (!isMatched) {
        const shortObj = objParsed[oi].objectiveText.slice(0, 60);
        findings.push({
          id: `alignment-uncovered-L${li}-O${oi}`,
          severity: 'warning',
          category: 'alignment',
          message: `Lesson ${li + 1} objective "${shortObj}..." has no matching assessment`,
          lessonIndex: li,
          featureId: null,
          suggestedPrompt: `Add an assessment for Lesson ${li + 1} that covers: "${shortObj}"`,
        });
      }
    }
  }

  return findings;
}

// ── 3. Cognitive Load ────────────────────────────────────────────────────────

const TIME_ESTIMATES = {
  multiple_choice: 3,
  short_answer: 5,
  essay: 15,
  discussion: 20,
  assignment_default: 60,
};

export function assessCognitiveLoad(courseMap, deliverables) {
  const findings = [];
  const lessons = courseMap?.lessons || [];
  if (lessons.length === 0) return findings;

  for (let li = 0; li < lessons.length; li++) {
    const lesson = lessons[li];
    let itemCount = 0;
    let estMinutes = 0;

    // Quiz questions
    const quizzes = getDelivArray(deliverables, 'quizBank');
    if (quizzes && quizzes[li]) {
      const qs = quizzes[li].qs || [];
      itemCount += qs.length;
      for (const q of qs) {
        estMinutes += q.em || TIME_ESTIMATES[q.ty] || 5;
      }
    }

    // Assignments related to this lesson
    const assignments = getDelivArray(deliverables, 'assignments');
    if (assignments) {
      const lessonTitle = norm(lesson.title);
      for (const a of assignments) {
        const related = (a.rl || []).map(norm);
        if (related.some((r) => r.includes(lessonTitle) || lessonTitle.includes(r))) {
          itemCount++;
          // Parse estimated time from 'et' field (e.g. "6-8 hours" → 420 min)
          const etMatch = (a.et || '').match(/(\d+)/);
          estMinutes += etMatch ? parseInt(etMatch[1], 10) * 60 : TIME_ESTIMATES.assignment_default;
        }
      }
    }

    // Discussion prompts
    const discussions = getDelivArray(deliverables, 'discussions');
    if (discussions && discussions[li]) {
      itemCount++;
      const durMatch = (discussions[li].ed || '').match(/(\d+)/);
      estMinutes += durMatch ? parseInt(durMatch[1], 10) : TIME_ESTIMATES.discussion;
    }

    // Lesson plan outline segments
    const plans = getDelivArray(deliverables, 'lessonPlans');
    if (plans && plans[li]) {
      const segs = plans[li].ol || [];
      itemCount += segs.length;
    }

    if (itemCount === 0) continue;

    // Threshold checks
    if (estMinutes > 120 || itemCount > 15) {
      findings.push({
        id: `load-overloaded-L${li}`,
        severity: 'error',
        category: 'cognitiveLoad',
        message: `Lesson ${li + 1} is overloaded: ${itemCount} items, ~${estMinutes} min estimated student time`,
        lessonIndex: li,
        featureId: null,
        suggestedPrompt: `Lesson ${li + 1} has too many activities (${itemCount} items, ~${estMinutes} min). Suggest which items to remove or redistribute to other lessons.`,
      });
    } else if (estMinutes > 90 || itemCount > 10) {
      findings.push({
        id: `load-heavy-L${li}`,
        severity: 'warning',
        category: 'cognitiveLoad',
        message: `Lesson ${li + 1} has heavy load: ${itemCount} items, ~${estMinutes} min estimated`,
        lessonIndex: li,
        featureId: null,
        suggestedPrompt: `Lesson ${li + 1} is heavy (${itemCount} items). Consider redistributing some activities to lighter weeks.`,
      });
    }
  }

  return findings;
}

// ── 4. Difficulty Progression ────────────────────────────────────────────────

const DIFFICULTY_SCORES = { Easy: 1, easy: 1, Medium: 2, medium: 2, Hard: 3, hard: 3 };

export function validateDifficultyProgression(deliverables) {
  const findings = [];
  const quizzes = getDelivArray(deliverables, 'quizBank');
  if (!quizzes) return findings;

  const lessonDiffs = [];

  for (let li = 0; li < quizzes.length; li++) {
    const qs = quizzes[li]?.qs || [];
    if (qs.length === 0) continue;

    let easy = 0,
      medium = 0,
      hard = 0;
    for (const q of qs) {
      const score = DIFFICULTY_SCORES[q.df] || 0;
      if (score === 1) easy++;
      else if (score === 2) medium++;
      else if (score === 3) hard++;
    }

    const total = easy + medium + hard;
    if (total === 0) continue;

    const avg = (easy * 1 + medium * 2 + hard * 3) / total;
    lessonDiffs.push({ li, avg, easy, medium, hard, total });

    // Info: no difficulty variety
    if ((easy === total || medium === total || hard === total) && total >= 3) {
      const level = easy === total ? 'Easy' : medium === total ? 'Medium' : 'Hard';
      findings.push({
        id: `diff-uniform-L${li}`,
        severity: 'info',
        category: 'difficulty',
        message: `Lesson ${li + 1} quiz: all ${total} questions are ${level} — consider adding variety`,
        lessonIndex: li,
        featureId: 'quizBank',
        suggestedPrompt: `Add variety to Lesson ${li + 1} quiz — all questions are currently ${level}. Mix in some ${level === 'Easy' ? 'Medium and Hard' : level === 'Hard' ? 'Easy and Medium' : 'Easy and Hard'} questions.`,
      });
    }
  }

  // Check progression: later lessons shouldn't be significantly easier
  for (let i = 1; i < lessonDiffs.length; i++) {
    const prev = lessonDiffs[i - 1];
    const curr = lessonDiffs[i];
    if (prev.avg - curr.avg > 0.5) {
      findings.push({
        id: `diff-regression-L${curr.li}`,
        severity: 'warning',
        category: 'difficulty',
        message: `Quiz difficulty drops from Lesson ${prev.li + 1} (avg ${prev.avg.toFixed(1)}) to Lesson ${curr.li + 1} (avg ${curr.avg.toFixed(1)})`,
        lessonIndex: curr.li,
        featureId: 'quizBank',
        suggestedPrompt: `Lesson ${curr.li + 1} quiz is easier than Lesson ${prev.li + 1}. Increase the difficulty to maintain progression.`,
      });
    }
  }

  return findings;
}

// ── 5. Readability Scoring ────────────────────────────────────────────────────

const READABLE_NAMES = {
  quizBank: 'Quiz & Exam Bank',
  discussions: 'Discussion Prompts',
  lessonPlans: 'Lesson Plans',
  slideDecks: 'Slide Decks',
  rubrics: 'Rubrics',
  assignments: 'Assignments',
  studyGuides: 'Study Guides',
  courseFaq: 'Course FAQ',
};

const READABILITY_IGNORED_KEYS = new Set([
  'id',
  'uid',
  'uuid',
  'type',
  'title',
  'lessonTitle',
  'lt',
  'name',
  'label',
  'category',
  'topic',
  'topicSection',
  'difficulty',
  'df',
  'bloomsLevel',
  'blooms',
  'bl',
  'points',
  'pt',
  'weight',
  'wt',
  'percent',
  'percentage',
  'tags',
  'option',
  'options',
  'op',
  'answerOption',
  'answerOptions',
  'explanation',
  'explanations',
  'rationale',
  'distractorRationale',
  'dr',
  'intendedUse',
  'iu',
  'pointPlan',
  'pp',
  'objectiveAligned',
  'oa',
  'relatedLessons',
  'rl',
  'assignmentType',
  'at',
  'criterionName',
  'cn',
  'term',
  'tm',
]);

const READABILITY_IGNORED_SUBTREE_KEYS = new Set([
  'adaptiveRepairPlan',
  'blueprintAssumptionLedger',
  'blueprintGrounding',
  'blueprintQualityReceipt',
  'blueprintReviewSurface',
  'classroomDryRun',
  'classroomDryRunPlan',
  'classroomEvidenceLoop',
  'classroomEvidenceLoopPlan',
  'classroomHandoffPlan',
  'classSessionPlan',
  'compilerContract',
  'compilerDecision',
  'conceptDependencyGraph',
  'courseModalityProfile',
  'courseWorkload',
  'evidenceResponseMap',
  'instructorFeedbackLoad',
  'instructorFeedbackLoadPlan',
  'learnerContextProfile',
  'masteryEvidenceMap',
  'objectiveEvidenceMap',
  'objectiveEvidencePlan',
  'outlineTiming',
  'packageCoherenceMatrix',
  'provenance',
  'qualityReceipt',
  'qualitySignals',
  'qualitySummary',
  'receipt',
  'sourceAnchors',
  'sourceConflictReport',
  'sourceEvidenceTrace',
  'sourceGrounding',
  'sourceRiskRegister',
]);

function normalizedReadabilityKey(key = '') {
  return String(key)
    .replace(/[-_\s]/g, '')
    .toLowerCase();
}

function isIgnoredReadabilityKey(key = '') {
  const normalized = normalizedReadabilityKey(key);
  return [...READABILITY_IGNORED_KEYS].some((ignored) => normalizedReadabilityKey(ignored) === normalized);
}

function isIgnoredReadabilitySubtree(key = '') {
  const normalized = normalizedReadabilityKey(key);
  return [...READABILITY_IGNORED_SUBTREE_KEYS].some((ignored) => normalizedReadabilityKey(ignored) === normalized);
}

function readabilityWordCount(text = '') {
  return (String(text).match(/[A-Za-z][A-Za-z'-]*/g) || []).length;
}

function looksLikeReadableProse(raw = '') {
  const words = readabilityWordCount(raw);
  if (words < 14) return false;

  const terminalCount = (raw.match(/[.!?]/g) || []).length;
  if (terminalCount === 0 && words < 18) return false;

  return true;
}

function collectReadableStrings(value, output = [], key = '') {
  if (value == null) return output;
  if (isIgnoredReadabilitySubtree(key)) return output;

  if (typeof value === 'string' || typeof value === 'number') {
    const raw = String(value).replace(/\s+/g, ' ').trim();
    if (raw.length >= 24 && !isIgnoredReadabilityKey(key) && looksLikeReadableProse(raw)) {
      output.push(/[.!?]$/.test(raw) ? raw : `${raw}.`);
    }
    return output;
  }

  if (Array.isArray(value)) {
    value.forEach((item) => collectReadableStrings(item, output, key));
    return output;
  }

  if (typeof value === 'object') {
    Object.entries(value).forEach(([childKey, childValue]) => {
      collectReadableStrings(childValue, output, childKey);
    });
  }

  return output;
}

function readabilitySupportMetrics(text = '') {
  const sentences = text
    .split(/[.!?]+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  const wordCounts = sentences.map((sentence) => (sentence.match(/[A-Za-z][A-Za-z'-]*/g) || []).length);
  const totalWords = wordCounts.reduce((sum, count) => sum + count, 0);
  const sentenceCount = Math.max(1, sentences.length);
  const avgWordsPerSentence = totalWords / sentenceCount;
  const shortFragmentRatio =
    sentenceCount > 0 ? wordCounts.filter((count) => count > 0 && count <= 8).length / sentenceCount : 0;
  const longSentenceRatio = sentenceCount > 0 ? wordCounts.filter((count) => count >= 28).length / sentenceCount : 0;
  return {
    sentenceCount,
    totalWords,
    avgWordsPerSentence,
    shortFragmentRatio,
    longSentenceRatio,
  };
}

function isLikelyTechnicalListNoise(text = '', grade = 0) {
  if (grade <= 12) return false;
  const metrics = readabilitySupportMetrics(text);
  return (
    metrics.sentenceCount >= 6 &&
    metrics.avgWordsPerSentence <= 22 &&
    metrics.longSentenceRatio <= 0.12 &&
    (metrics.shortFragmentRatio >= 0.2 || metrics.avgWordsPerSentence <= 18 || metrics.sentenceCount >= 8)
  );
}

function extractDeliverableText(deliverables, featureId) {
  const deliv = deliverables?.[featureId];
  if (!deliv || deliv.status !== 'done' || !deliv.data) return '';
  let parsed = deliv.data;
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return '';
    }
  }
  const arrKey = getArrayKey(featureId, parsed);
  if (!arrKey || !Array.isArray(parsed[arrKey])) return '';
  const texts = parsed[arrKey].flatMap((item) => collectReadableStrings(item, []));
  const joined = texts.join(' ');
  const sentenceCount = (joined.match(/[.!?]/g) || []).length;
  if (texts.length < 3 && sentenceCount < 3) return '';
  return joined;
}

export function validateReadability(courseMap, deliverables) {
  const findings = [];
  if (!deliverables) return findings;

  // Determine if this is an intro-level course (heuristic: check course name)
  const courseName = (courseMap?.courseName || '').toLowerCase();
  const isIntro = /intro|101|100-level|foundations|beginning|fundamentals|principles of/i.test(courseName);

  const featureIds = Object.keys(READABLE_NAMES);

  for (const featureId of featureIds) {
    const text = extractDeliverableText(deliverables, featureId);
    if (!text || text.length < 180) continue; // need enough real prose for meaningful analysis

    const grade = readability.fleschKincaidGrade(text);
    const displayName = READABLE_NAMES[featureId];
    const technicalListNoise = isLikelyTechnicalListNoise(text, grade);

    // Error threshold: >14 for intro courses, >16 for any course
    if (((isIntro && grade > 14) || grade > 16) && !technicalListNoise) {
      findings.push({
        id: `readability-error-${featureId}`,
        severity: 'error',
        category: 'readability',
        message: `${displayName} readability is grade level ${grade.toFixed(1)} — too complex${isIntro ? ' for an introductory course' : ''}`,
        lessonIndex: null,
        featureId,
        suggestedPrompt: `Simplify the language in ${displayName}. Current readability is grade ${grade.toFixed(1)}, which is too advanced${isIntro ? ' for intro-level students' : ''}. Use shorter sentences and simpler vocabulary.`,
      });
    } else if (grade > 12) {
      findings.push({
        id: `readability-warning-${featureId}`,
        severity: 'warning',
        category: 'readability',
        message: `${displayName} readability is grade level ${grade.toFixed(1)} — may be difficult for some students`,
        lessonIndex: null,
        featureId,
        suggestedPrompt: `Consider simplifying the language in ${displayName}. Current readability is grade ${grade.toFixed(1)}. Shorter sentences and clearer vocabulary would improve accessibility.`,
      });
    }
  }

  return findings;
}

// ── 6. Grammar Checking (async, called separately from health report) ────────
// Uses LanguageTool API — async and rate-limited, so not included in the
// synchronous generateCourseHealthReport(). Call independently when needed.

export async function validateGrammarAsync(courseMap, deliverables) {
  const findings = [];
  const { checkGrammar } = await import('./grammarChecker');

  for (const featureId of Object.keys(READABLE_NAMES)) {
    const text = extractDeliverableText(deliverables, featureId);
    if (!text || text.length < 50) continue;

    try {
      const { matches } = await checkGrammar(text);
      if (matches.length > 0) {
        const topIssues = matches
          .slice(0, 3)
          .map((m) => m.shortMessage || m.message)
          .join('; ');
        findings.push({
          id: `grammar-${featureId}`,
          severity: matches.length > 5 ? 'warning' : 'info',
          category: 'grammar',
          message: `${READABLE_NAMES[featureId]}: ${matches.length} grammar/style issue${matches.length !== 1 ? 's' : ''} found. Top: ${topIssues}`,
          lessonIndex: null,
          featureId,
          suggestedPrompt: `Review and fix grammar issues in ${READABLE_NAMES[featureId]}`,
        });
      }
    } catch (err) {
      // Skip if grammar check fails — it's optional
    }
  }
  return findings;
}

// ── Orchestrator ─────────────────────────────────────────────────────────────

export function generateCourseHealthReport(courseMap, deliverables) {
  if (!courseMap?.lessons?.length) {
    return { findings: [], errorCount: 0, warningCount: 0, infoCount: 0, summary: '' };
  }

  const allFindings = [
    ...validateBloomsAlignment(courseMap, deliverables),
    ...validateObjectiveAlignment(courseMap, deliverables),
    ...assessCognitiveLoad(courseMap, deliverables),
    ...validateDifficultyProgression(deliverables),
    ...validateReadability(courseMap, deliverables),
  ];

  // Deduplicate by id
  const seen = new Set();
  const findings = [];
  for (const f of allFindings) {
    if (!seen.has(f.id)) {
      seen.add(f.id);
      findings.push(f);
    }
  }

  // Sort: error → warning → info
  findings.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);

  const errorCount = findings.filter((f) => f.severity === 'error').length;
  const warningCount = findings.filter((f) => f.severity === 'warning').length;
  const infoCount = findings.filter((f) => f.severity === 'info').length;

  // Build summary for prompt injection (top 3 issues, compact)
  const topFindings = findings.filter((f) => f.severity !== 'info').slice(0, 3);
  const summaryLines = [
    `Course Health: ${errorCount} error${errorCount !== 1 ? 's' : ''}, ${warningCount} warning${warningCount !== 1 ? 's' : ''}`,
  ];
  for (const f of topFindings) {
    summaryLines.push(`- ${f.severity.toUpperCase()}: ${f.message}`);
  }
  const summary = summaryLines.join('\n');

  return { findings, errorCount, warningCount, infoCount, summary };
}

// ── Auto-fix classification ─────────────────────────────────────────────────

/** Categories that the agent can fix directly without user decision */
export const AUTO_FIX_CATEGORIES = new Set(['readability', 'difficulty', 'grammar']);

/**
 * Classify findings into auto-fixable (agent can fix directly) vs
 * needs-decision (user must choose from options).
 */
export function classifyFindings(findings) {
  return {
    autoFixable: findings.filter((f) => AUTO_FIX_CATEGORIES.has(f.category) && f.suggestedPrompt),
    needsDecision: findings.filter((f) => !AUTO_FIX_CATEGORIES.has(f.category) && f.suggestedPrompt),
  };
}
