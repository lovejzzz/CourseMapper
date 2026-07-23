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

import { isProvenanceMirrorKey } from './compiledLanguageFinalizer.js';

const DANGLING_CLAUSE_RE = /\b(?:and|or|for|in|of|to|the|with|before|after|around|aligned to|into|from)\s*[.]\s*$/i;
const DANGLING_EXEMPT_RE = /\b(?:etc|e\.g|i\.e)[.]\s*$/i;
// Terminal prepositions can be legitimate particles. These pairs are common
// in instructor prose and must not be diagnosed as missing-object seams.
const VALID_TERMINAL_PARTICLE_RE =
  /\b(?:watch for|look for|listen for|account for|prepare for|plan for|wait for|care for|ask for|search for|pay for|hope for|wish for|settle for|stand for|call for|aim for|work with|start with|begin with|end with|follow with|connect with|engage with|align with|agree with|meet with|share with|(?:come|comes|came|coming) from|result from|learn from|benefit from|move into|fit into|enter into|look into|go into|check in|turn in|hand in|participate in|belong to|lead to|refer to|listen to|respond to|contribute to|talk to|look around|move around)[.]\s*$/i;
const LEADING_COLON_RE = /^\s*:/;
const ARTICLE_A_VOWEL_RE = /\ba\s+[AEIOU][a-z]{3,}/;
const DOUBLE_PERIOD_RE = /[a-z]\.\.(?!\.)/;
const CLIPPED_FORMAL_CHOICE_RE = /\b(?:explain how one formal choice|one formal choice shapes)\s*[.!?]\s*$/i;
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
      // Internal receipt/trace and provenance subtrees never render in
      // exports; auditing them would warn on text instructors cannot see.
      if (isProvenanceMirrorKey(key)) continue;
      yield* walkStrings(value, `${path}.${key}`);
    }
  }
}

function pushFinding(findings, code, path, sample) {
  findings.push({ code, path, sample: String(sample).slice(0, 140) });
}

export function hasDanglingClauseSeam(value) {
  const text = String(value || '').trim();
  return DANGLING_CLAUSE_RE.test(text) && !DANGLING_EXEMPT_RE.test(text) && !VALID_TERMINAL_PARTICLE_RE.test(text);
}

function checkSentenceIntegrity(findings, featureId, data) {
  for (const [path, value] of walkStrings(data)) {
    const trimmed = value.trim();
    if (!trimmed) continue;
    if (LEADING_COLON_RE.test(trimmed)) pushFinding(findings, 'leading-colon-label', path, trimmed);
    if (hasDanglingClauseSeam(trimmed)) {
      pushFinding(findings, 'dangling-clause', path, trimmed);
    }
    if (CLIPPED_FORMAL_CHOICE_RE.test(trimmed)) {
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

// ── Substance audit (CCR D2.1 / D3.1 instrument) ────────────────────────────
// Measures whether assessment surfaces talk about the discipline or about the
// course's own process. Reported separately from auditDeliverableContentQuality
// because compiled-only packages are legitimately meta until enrichment runs —
// this is a measurement first, a gate later.

const PROCESS_MARKER_RE =
  /\b(?:evidence move|success criteri\w*|course evidence|lesson evidence|inspectable (?:course )?evidence|the (?:Week\s*\d+|weekly) (?:check|memo|quiz|artifact|discussion(?: post)?|brief|plan|paper|reflection|recording|exam|report|project|lab work|analysis|presentation|portfolio|mapping work)|the lesson(?:'s)? (?:materials|artifact|focus|objective)|checkpoint response|professional decision|rubric criteri\w*|feedback routine|artifact revision|distractor)\b/i;

const CIRCULAR_DEFINITION_RE =
  /(?:names the evidence focus|is the part of the lesson students must apply|as a self-check|helps students separate description from|helps students choose relevant evidence)/i;

function quizSurfaceStrings(data) {
  const surfaces = [];
  for (const quiz of data?.quizzes || data?.quizBank || []) {
    for (const question of Array.isArray(quiz?.questions) ? quiz.questions : []) {
      if (question?.question) surfaces.push({ kind: 'stem', text: String(question.question) });
      for (const option of Array.isArray(question?.options) ? question.options : []) {
        surfaces.push({ kind: 'option', text: String(option) });
      }
    }
  }
  return surfaces;
}

function keyTermSurfaceStrings(data) {
  const surfaces = [];
  for (const guide of data?.studyGuides || []) {
    for (const term of Array.isArray(guide?.keyTerms) ? guide.keyTerms : []) {
      const text = typeof term === 'string' ? term : `${term?.term || ''}: ${term?.definition || term?.df || ''}`;
      surfaces.push({ kind: 'keyTerm', text });
    }
  }
  return surfaces;
}

/**
 * Substance metrics for one deliverable: how many assessment surfaces are
 * course-process talk instead of disciplinary content.
 * Returns { surfaces, meta, metaShare, samples } or null for other features.
 */
export function auditSubstance(featureId, data) {
  let surfaces = [];
  if (featureId === 'quizBank') surfaces = quizSurfaceStrings(data);
  else if (featureId === 'studyGuides') surfaces = keyTermSurfaceStrings(data);
  else return null;
  if (surfaces.length === 0) return null;
  const samples = [];
  let meta = 0;
  for (const surface of surfaces) {
    const isMeta =
      PROCESS_MARKER_RE.test(surface.text) || (surface.kind === 'keyTerm' && CIRCULAR_DEFINITION_RE.test(surface.text));
    if (isMeta) {
      meta += 1;
      if (samples.length < 5) samples.push({ kind: surface.kind, text: surface.text.slice(0, 120) });
    }
  }
  return {
    featureId,
    surfaces: surfaces.length,
    meta,
    metaShare: Math.round((meta / surfaces.length) * 100) / 100,
    samples,
  };
}
