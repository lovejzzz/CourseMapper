/**
 * Deterministic content-quality checks for compiled/generated deliverables.
 *
 * The June 2026 four-course audit found exports shipping with `ready, 0
 * warnings` while containing template seams an instructor rejects on sight:
 * dangling clauses, leading-colon labels, bad article agreement, instructor
 * voice inside student instructions, single-word concept fragments, and the
 * same long template phrase stamped dozens of times. These checks make those
 * defects visible to the finish pipeline and the trust strip as warnings.
 */

import { isInternalExportMetadataKey } from './exporters/exporterUtils.js';

const DANGLING_CLAUSE_RE = /\b(?:and|or|for|in|of|to|the|with|before|after|around|aligned to|into|from)\s*[.]\s*$/i;
const DANGLING_EXEMPT_RE = /\b(?:etc|e\.g|i\.e)[.]\s*$/i;
const LEADING_COLON_RE = /^\s*:/;
const ARTICLE_A_VOWEL_RE = /\ba\s+[AEIOU][a-z]{3,}/;
const DOUBLE_PERIOD_RE = /[a-z]\.\.(?!\.)/;
const RUN_TOGETHER_RE = /\b(?:work|criteria) (?:Names|Uses|Explains|Shows|Cites)\b/;
const INSTRUCTOR_VOICE_RE = /\b(?:Ask students\b|Share the .{0,80}\bbefore students\b)/;

function* walkStrings(node, path = '$') {
  if (typeof node === 'string') {
    yield [path, node];
  } else if (Array.isArray(node)) {
    for (let index = 0; index < node.length; index += 1) {
      yield* walkStrings(node[index], `${path}[${index}]`);
    }
  } else if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      // Internal receipt/trace subtrees never render in exports; auditing
      // them would warn on text instructors cannot see.
      if (isInternalExportMetadataKey(key)) continue;
      yield* walkStrings(value, `${path}.${key}`);
    }
  }
}

function pushFinding(findings, code, path, sample) {
  findings.push({ code, path, sample: String(sample).slice(0, 140) });
}

function checkSentenceIntegrity(findings, featureId, data) {
  for (const [path, value] of walkStrings(data)) {
    const trimmed = value.trim();
    if (!trimmed) continue;
    if (LEADING_COLON_RE.test(trimmed)) pushFinding(findings, 'leading-colon-label', path, trimmed);
    if (DANGLING_CLAUSE_RE.test(trimmed) && !DANGLING_EXEMPT_RE.test(trimmed)) {
      pushFinding(findings, 'dangling-clause', path, trimmed);
    }
    if (ARTICLE_A_VOWEL_RE.test(trimmed)) pushFinding(findings, 'article-agreement', path, trimmed);
    if (DOUBLE_PERIOD_RE.test(trimmed)) pushFinding(findings, 'double-period', path, trimmed);
    if (RUN_TOGETHER_RE.test(trimmed)) pushFinding(findings, 'run-together-criteria', path, trimmed);
  }
}

const STUDENT_SURFFACE_PATH_RE =
  /\.(?:instructions|deliverables|studentSelfAssessment|selfAssessmentRubric|guidelines|practiceActivities|reviewQuestions|answer|question|prompt)\b/i;

function checkStudentVoice(findings, featureId, data) {
  if (!['assignments', 'studyGuides', 'courseFaq', 'discussions'].includes(featureId)) return;
  for (const [path, value] of walkStrings(data)) {
    if (!STUDENT_SURFFACE_PATH_RE.test(path)) continue;
    if (INSTRUCTOR_VOICE_RE.test(value)) pushFinding(findings, 'instructor-voice-in-student-surface', path, value);
  }
}

function checkQuizAnswerKeyUniformity(findings, featureId, data) {
  if (featureId !== 'quizBank') return;
  const quizzes = data?.quizzes || data?.quizBank || [];
  const keys = [];
  for (const quiz of quizzes) {
    const questions = Array.isArray(quiz?.questions) ? quiz.questions : [];
    const key = questions
      .filter((question) => question?.type === 'multiple_choice')
      .map((question) => question?.answer || '-')
      .join(',');
    if (key) keys.push(key);
  }
  if (keys.length > 2 && new Set(keys).size === 1) {
    pushFinding(findings, 'uniform-quiz-answer-key', `all ${keys.length} lessons`, keys[0]);
  }
}

/**
 * Audit one deliverable's content. Returns { findings, summary } where each
 * finding is { code, path, sample }. Intended to surface as export warnings —
 * never blockers — so instructors see honest quality signals without losing
 * the download.
 */
export function auditDeliverableContentQuality(featureId, data) {
  const findings = [];
  if (data && typeof data === 'object') {
    checkSentenceIntegrity(findings, featureId, data);
    checkStudentVoice(findings, featureId, data);
    checkQuizAnswerKeyUniformity(findings, featureId, data);
  }
  const codes = [...new Set(findings.map((finding) => finding.code))];
  return {
    findings,
    summary:
      findings.length === 0
        ? 'Content quality checks passed.'
        : `${findings.length} content quality finding(s): ${codes.join(', ')}.`,
  };
}
