import {
  compactBlueprintForStorage,
  compileBlueprintDeliverables,
  getBlueprintCompiledFeatures,
} from './courseBlueprintCompiler.js';
import { attachEnrichmentToGraph, buildBlueprintFromGraph, deriveCourseGraphFromCourseMap } from './courseGraph';
import { validateCourseGraph } from './courseGraph/schema.js';
import { buildQuizItemPlan } from './blueprintEnrichmentPass.js';
import { projectKernelToSurfaces } from './kernelProjection.js';
import { resolveProviderMaxOutputTokens } from './adaptiveProviderBatching.js';
import { estimateTokens, getModelLimit } from './tokenEstimator.js';
import { normalizeTrustedSource, sourceCitationLabel } from './knowledge/sourceLedger.js';

export const COURSE_IR_VERSION = 'courseir.v1';
export const COURSE_IR_SCHEMA_NAME = 'course_ir_v1';
export const COURSE_IR_SYSTEM_PROMPT = `You are CourseMapper's CurriculumV1 authoring engine. Return one compact CourseIR JSON object only: no markdown, no commentary, no final deliverable prose. Encode the curriculum brain as semantic atoms with stable ids, source/provenance status, a trusted sourceLedger, concept prerequisites, lesson objectives, outcome atoms, activity atoms, assessments, rubric criteria, examples, misconceptions, constraints, and artifact intent links. SourceLedger rows should name title, authors, URL or DOI, license, provider, conceptLinks, and checkedAt when known. Every lesson outcome, activity, worked example, assessment, and rubric criterion must link to sourceRefs instead of inventing citations.`;

const KNOWN_FEATURE_IDS = [
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

const VALID_ASSESSMENT_KINDS = new Set(['graded-artifact', 'in-class', 'exam', 'oral']);
const VALID_ACTIVITY_MODES = new Set(['async', 'sync', 'practice', 'assessment-prep']);
const SOURCE_STATUSES = new Set(['source-provided', 'standard-domain-knowledge', 'model-authored', 'assumption']);
const BLOCKING_SEVERITIES = new Set(['blocker']);
const DEFAULT_RUBRIC_DIMENSIONS = ['accuracy', 'evidence use', 'transfer'];

export class CourseIRValidationError extends Error {
  constructor(issues = []) {
    const summary = issues
      .filter((issue) => BLOCKING_SEVERITIES.has(issue.severity))
      .slice(0, 3)
      .map((issue) => `${issue.path}: ${issue.message}`)
      .join(' ');
    super(summary || 'CourseIR validation failed.');
    this.name = 'CourseIRValidationError';
    this.issues = issues;
  }
}

function cleanText(value, maxLength = 320) {
  const text = String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return '';
  return text.length > maxLength
    ? text
        .slice(0, maxLength)
        .replace(/\s+\S*$/, '')
        .trim()
    : text;
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null || value === '') return [];
  return [value];
}

function uniqueStrings(values = [], limit = Infinity) {
  const seen = new Set();
  const result = [];
  for (const value of values) {
    const text = cleanText(value);
    const key = text.toLowerCase();
    if (!text || seen.has(key)) continue;
    seen.add(key);
    result.push(text);
    if (result.length >= limit) break;
  }
  return result;
}

function extractJsonObject(text) {
  const raw = String(text || '').trim();
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
}

function normalizeId(value, fallbackPrefix, index) {
  const text = cleanText(value, 80).replace(/\s+/g, '-');
  if (text) return text;
  return `${fallbackPrefix}${index + 1}`;
}

function normalizeAnchor(anchor, fallbackStatus = 'model-authored') {
  if (typeof anchor === 'string') {
    return { claim: cleanText(anchor), status: fallbackStatus, sourceRefs: [], risk: 'medium' };
  }
  const status = SOURCE_STATUSES.has(anchor?.status) ? anchor.status : fallbackStatus;
  return {
    claim: cleanText(anchor?.claim || anchor?.text || anchor?.fact),
    status,
    sourceRefs: uniqueStrings(anchor?.sourceRefs || anchor?.sources || [], 6),
    risk: cleanText(anchor?.risk || (status === 'assumption' ? 'medium' : 'low'), 40),
  };
}

function normalizeConstraint(entry, index, defaultScope = 'course') {
  if (typeof entry === 'string') {
    return {
      id: normalizeId('', 'K', index),
      scope: defaultScope,
      text: cleanText(entry, 260),
      sourceRefs: [],
      severity: 'requirement',
    };
  }
  return {
    id: normalizeId(entry?.id, 'K', index),
    scope: cleanText(entry?.scope || defaultScope, 120),
    text: cleanText(entry?.text || entry?.constraint || entry?.requirement || entry?.note, 260),
    sourceRefs: uniqueStrings(entry?.sourceRefs || entry?.sources || [], 6),
    severity: cleanText(entry?.severity || entry?.kind || 'requirement', 40),
  };
}

function normalizeMisconception(entry) {
  if (typeof entry === 'string') return { claim: cleanText(entry), correction: '' };
  return {
    claim: cleanText(entry?.claim || entry?.misconception || entry?.wrongIdea),
    correction: cleanText(entry?.correction || entry?.corrective || entry?.accurateStatement),
  };
}

function normalizeWorkedExample(entry, lessonId, index) {
  if (typeof entry === 'string') {
    return {
      id: `${lessonId}-E${index + 1}`,
      skill: '',
      setup: cleanText(entry),
      solutionSteps: [],
      result: '',
      sourceRefs: [],
    };
  }
  return {
    id: normalizeId(entry?.id, `${lessonId}-E`, index),
    skill: cleanText(entry?.skill, 120),
    setup: cleanText(entry?.setup || entry?.problem, 260),
    solutionSteps: uniqueStrings(entry?.solutionSteps || entry?.steps || [], 8),
    result: cleanText(entry?.result || entry?.answer, 180),
    sourceRefs: uniqueStrings(entry?.sourceRefs || entry?.refs || [], 16),
  };
}

function normalizeQuizItem(item) {
  const options = asArray(item?.options)
    .map((option) => cleanText(option, 180))
    .filter(Boolean);
  return {
    question: cleanText(item?.question || item?.q, 260),
    options,
    answerIndex: Number.isInteger(item?.answerIndex) ? item.answerIndex : Number(item?.answerIndex) || 0,
    explanation: cleanText(item?.explanation || item?.ex, 260),
  };
}

function normalizeConcept(rawConcept, index) {
  const id = normalizeId(rawConcept?.id, 'C', index);
  const misconceptions = asArray(rawConcept?.misconceptions)
    .map(normalizeMisconception)
    .filter((entry) => entry.claim);
  const vocabulary = asArray(rawConcept?.vocabulary || rawConcept?.terms)
    .map((term) => (typeof term === 'string' ? { term } : term))
    .map((term) => ({
      term: cleanText(term?.term || term?.label, 90),
      definition: cleanText(term?.definition || term?.df, 240),
      example: cleanText(term?.example || term?.eg, 220),
      misconception: cleanText(term?.misconception || term?.mi || misconceptions[0]?.claim, 220),
      correction: cleanText(term?.correction || term?.cx || misconceptions[0]?.correction, 220),
      ...(cleanText(term?.romanization, 120) ? { romanization: cleanText(term.romanization, 120) } : {}),
    }))
    .filter((term) => term.term);
  return {
    id,
    term: cleanText(rawConcept?.term || rawConcept?.title || id, 120),
    definition: cleanText(rawConcept?.definition || rawConcept?.summary, 260),
    prerequisiteIds: uniqueStrings(rawConcept?.prerequisiteIds || rawConcept?.prerequisites || [], 12),
    factualAnchors: asArray(rawConcept?.factualAnchors || rawConcept?.facts)
      .map((anchor) => normalizeAnchor(anchor, 'standard-domain-knowledge'))
      .filter((anchor) => anchor.claim),
    misconceptions,
    vocabulary,
    sourceTier: cleanText(rawConcept?.sourceTier || rawConcept?.source || '', 80),
  };
}

function normalizeAssessment(rawAssessment, index) {
  const id = normalizeId(rawAssessment?.id, 'A', index);
  const kind = VALID_ASSESSMENT_KINDS.has(rawAssessment?.kind) ? rawAssessment.kind : 'graded-artifact';
  const rubricDimensions = uniqueStrings(rawAssessment?.rubricDimensions || rawAssessment?.dimensions || [], 8);
  const rawRubricCriteria = asArray(rawAssessment?.rubricCriteria || rawAssessment?.rubric || rawAssessment?.criteria);
  const rubricCriteria = rawRubricCriteria
    .map((criterion, criterionIndex) =>
      normalizeRubricCriterion(
        criterion,
        id,
        criterionIndex,
        uniqueStrings(rawAssessment?.coverageConceptIds || rawAssessment?.conceptIds || [], 32),
      ),
    )
    .filter((criterion) => criterion.label);
  const sourceRefs = uniqueStrings(
    [
      ...asArray(rawAssessment?.sourceRefs || rawAssessment?.refs),
      ...rubricCriteria.flatMap((criterion) => criterion.sourceRefs),
    ],
    16,
  );
  return {
    id,
    title: cleanText(rawAssessment?.title || rawAssessment?.name || `Assessment ${index + 1}`, 160),
    kind,
    lessonIds: uniqueStrings(rawAssessment?.lessonIds || rawAssessment?.lessons || [], 32),
    coverageConceptIds: uniqueStrings(rawAssessment?.coverageConceptIds || rawAssessment?.conceptIds || [], 32),
    prompt: cleanText(rawAssessment?.prompt || rawAssessment?.task || rawAssessment?.description, 360),
    rubricDimensions: uniqueStrings([...rubricDimensions, ...rubricCriteria.map((criterion) => criterion.label)], 8),
    rubricCriteria,
    sourceRefs,
    weightPct: Number.isFinite(Number(rawAssessment?.weightPct)) ? Number(rawAssessment.weightPct) : null,
    provenance: cleanText(rawAssessment?.provenance || rawAssessment?.source || 'courseir', 80),
  };
}

function normalizeRubricLevel(rawLevel, index) {
  if (typeof rawLevel === 'string') {
    return {
      level: cleanText(rawLevel.split(/:|-/)[0] || `Level ${index + 1}`, 80),
      description: cleanText(rawLevel, 240),
      points: null,
    };
  }
  return {
    level: cleanText(rawLevel?.level || rawLevel?.label || rawLevel?.name || `Level ${index + 1}`, 80),
    description: cleanText(rawLevel?.description || rawLevel?.descriptor || rawLevel?.text, 240),
    points: Number.isFinite(Number(rawLevel?.points)) ? Number(rawLevel.points) : null,
  };
}

function normalizeRubricCriterion(rawCriterion, assessmentId, index, defaultConceptIds = [], defaultOutcomeIds = []) {
  const criterion = typeof rawCriterion === 'object' && rawCriterion !== null ? rawCriterion : { label: rawCriterion };
  const label = cleanText(
    criterion.label || criterion.name || criterion.dimension || criterion.criterion || criterion.text,
    120,
  );
  return {
    id: normalizeId(criterion.id, `${assessmentId}-R`, index),
    label,
    description: cleanText(criterion.description || criterion.lookFor || criterion.evidence || label, 260),
    conceptIds: uniqueStrings(criterion.conceptIds || criterion.concepts || defaultConceptIds, 32),
    outcomeIds: uniqueStrings(criterion.outcomeIds || criterion.outcomes || defaultOutcomeIds, 32),
    performanceLevels: asArray(criterion.performanceLevels || criterion.levels || criterion.descriptors)
      .map(normalizeRubricLevel)
      .filter((level) => level.level || level.description),
    sourceRefs: uniqueStrings(criterion.sourceRefs || criterion.refs || [], 16),
  };
}

function normalizeOutcome(rawOutcome, lessonId, index, defaultConceptIds = [], defaultAssessmentIds = []) {
  const outcome = typeof rawOutcome === 'object' && rawOutcome !== null ? rawOutcome : { statement: rawOutcome };
  const statement = cleanText(
    outcome.statement || outcome.objective || outcome.outcome || outcome.text || outcome.description,
    220,
  );
  const performanceVerb = cleanText(
    outcome.performanceVerb || outcome.verb || statement.split(/\s+/)[0] || '',
    40,
  ).replace(/[^\w-].*$/, '');
  return {
    id: normalizeId(outcome.id, `${lessonId}-O`, index),
    statement,
    performanceVerb,
    conceptIds: uniqueStrings(outcome.conceptIds || outcome.concepts || defaultConceptIds, 16),
    assessmentIds: uniqueStrings(outcome.assessmentIds || outcome.assessments || defaultAssessmentIds, 16),
    sourceRefs: uniqueStrings(outcome.sourceRefs || outcome.refs || [], 16),
  };
}

function activityInput(entry, mode) {
  if (entry && typeof entry === 'object') return { ...entry, mode: entry.mode || mode };
  return { learnerAction: entry, mode };
}

function normalizeActivity(rawActivity, lessonId, index, defaultConceptIds = [], defaultAssessmentIds = []) {
  const activity =
    typeof rawActivity === 'object' && rawActivity !== null ? rawActivity : { learnerAction: rawActivity };
  const mode = VALID_ACTIVITY_MODES.has(activity.mode) ? activity.mode : 'practice';
  const learnerAction = cleanText(
    activity.learnerAction || activity.action || activity.text || activity.description || activity.title,
    260,
  );
  const title = cleanText(activity.title || activity.name || learnerAction.split(/[:;.]/)[0], 100);
  return {
    id: normalizeId(activity.id, `${lessonId}-ACT`, index),
    mode,
    title,
    learnerAction,
    evidence: cleanText(activity.evidence || activity.output || activity.deliverable || activity.successCriteria, 220),
    conceptIds: uniqueStrings(activity.conceptIds || activity.concepts || defaultConceptIds, 16),
    assessmentIds: uniqueStrings(activity.assessmentIds || activity.assessments || defaultAssessmentIds, 16),
    sourceRefs: uniqueStrings(activity.sourceRefs || activity.refs || [], 16),
  };
}

function formatActivityLine(activity) {
  const action = cleanText(activity?.learnerAction || activity?.title, 220);
  if (!action) return '';
  const evidence = cleanText(activity?.evidence, 160);
  return evidence ? `${action}; evidence: ${evidence}` : action;
}

function formatRubricCriterion(criterion) {
  const label = cleanText(criterion?.label, 120);
  const description = cleanText(criterion?.description, 180);
  if (!label) return '';
  return description && description.toLowerCase() !== label.toLowerCase() ? `${label}: ${description}` : label;
}

function normalizeLesson(rawLesson, index) {
  const id = normalizeId(rawLesson?.id, 'L', index);
  const topic = cleanText(rawLesson?.topic || rawLesson?.title || `Lesson ${index + 1}`, 160);
  const conceptIds = uniqueStrings(rawLesson?.conceptIds || rawLesson?.concepts || [], 24);
  const assessmentIds = uniqueStrings(rawLesson?.assessmentIds || rawLesson?.assessments || [], 12);
  const outcomes = asArray(rawLesson?.outcomes || rawLesson?.learningOutcomes)
    .map((entry, outcomeIndex) => normalizeOutcome(entry, id, outcomeIndex, conceptIds, assessmentIds))
    .filter((entry) => entry.statement);
  const objectives = uniqueStrings(
    [
      ...asArray(rawLesson?.objectives || rawLesson?.learningObjectives),
      ...outcomes.map((outcome) => outcome.statement),
    ],
    8,
  );
  const rawActivities = [
    ...asArray(rawLesson?.activities || rawLesson?.activityAtoms),
    ...asArray(rawLesson?.async || rawLesson?.asyncActivities).map((entry) => activityInput(entry, 'async')),
    ...asArray(rawLesson?.sync || rawLesson?.syncActivities).map((entry) => activityInput(entry, 'sync')),
  ];
  const activities = rawActivities
    .map((entry, activityIndex) => normalizeActivity(entry, id, activityIndex, conceptIds, assessmentIds))
    .filter((entry) => entry.learnerAction);
  return {
    id,
    title: cleanText(rawLesson?.title || `Lesson ${index + 1}: ${topic}`, 180),
    topic,
    conceptIds,
    prerequisiteConceptIds: uniqueStrings(rawLesson?.prerequisiteConceptIds || rawLesson?.prerequisiteIds || [], 12),
    objectives,
    outcomes,
    activities,
    prerequisiteChecks: uniqueStrings(rawLesson?.prerequisiteChecks || rawLesson?.prerequisites || [], 6),
    constraints: asArray(rawLesson?.constraints)
      .map((entry, constraintIndex) => normalizeConstraint(entry, constraintIndex, id))
      .filter((entry) => entry.text),
    factualAnchors: asArray(rawLesson?.factualAnchors || rawLesson?.facts)
      .map((anchor) => normalizeAnchor(anchor))
      .filter((anchor) => anchor.claim),
    workedExamples: asArray(rawLesson?.workedExamples || rawLesson?.examples)
      .map((entry, exampleIndex) => normalizeWorkedExample(entry, id, exampleIndex))
      .filter((entry) => entry.setup),
    misconceptions: asArray(rawLesson?.misconceptions)
      .map(normalizeMisconception)
      .filter((entry) => entry.claim),
    practiceItems: uniqueStrings(rawLesson?.practiceItems || rawLesson?.practice || [], 8),
    assessmentIds,
    quizItems: asArray(rawLesson?.quizItems || rawLesson?.mc)
      .map(normalizeQuizItem)
      .filter((item) => item.question),
  };
}

function normalizeArtifactIntent(intent, index) {
  return {
    id: normalizeId(intent?.id, 'AI', index),
    featureId: cleanText(intent?.featureId || intent?.artifact || '', 80),
    lessonIds: uniqueStrings(intent?.lessonIds || intent?.lessons || [], 64),
    requiredRefs: uniqueStrings(intent?.requiredRefs || intent?.refs || [], 64),
    notes: cleanText(intent?.notes || intent?.instruction, 240),
  };
}

function normalizeHandoffNote(note, index) {
  return {
    id: normalizeId(note?.id, 'HN', index),
    scope: cleanText(note?.scope || note?.path || 'course', 120),
    severity: cleanText(note?.severity || 'review', 40),
    note: cleanText(note?.note || note?.message || note?.text, 320),
  };
}

export function normalizeCourseIR(rawIR = {}) {
  const course = rawIR.course && typeof rawIR.course === 'object' ? rawIR.course : {};
  const lessons = asArray(rawIR.lessons).map(normalizeLesson);
  const concepts = asArray(rawIR.concepts).map(normalizeConcept);
  const conceptIds = new Set(concepts.map((concept) => concept.id));

  // A provider can return lesson concept IDs before the concept block catches
  // up. Normalize those IDs into explicit concept shells so validation can
  // report thin concept content without losing referential integrity.
  for (const lesson of lessons) {
    for (const conceptId of lesson.conceptIds) {
      if (conceptIds.has(conceptId)) continue;
      conceptIds.add(conceptId);
      concepts.push({
        id: conceptId,
        term: conceptId,
        definition: '',
        prerequisiteIds: [],
        factualAnchors: [],
        misconceptions: [],
        vocabulary: [],
        sourceTier: '',
      });
    }
  }

  const assessments = asArray(rawIR.assessments).map(normalizeAssessment);
  const assessmentIds = new Set(assessments.map((assessment) => assessment.id));
  for (const lesson of lessons) {
    const linkedIds = new Set(lesson.assessmentIds);
    for (const assessment of assessments) {
      if (assessment.lessonIds.includes(lesson.id)) linkedIds.add(assessment.id);
    }
    lesson.assessmentIds = [...linkedIds].filter((id) => assessmentIds.has(id));
  }

  return {
    version: rawIR.version || COURSE_IR_VERSION,
    course: {
      title: cleanText(course.title || course.name || rawIR.courseName || 'Untitled Course', 180),
      discipline: cleanText(course.discipline || rawIR.discipline, 80),
      level: cleanText(course.level, 80),
      modality: cleanText(course.modality, 80),
      duration: cleanText(course.duration || course.term, 80),
      audience: cleanText(course.audience, 160),
      sourceProvenance: cleanText(course.sourceProvenance || course.provenance, 240),
    },
    sourceLedger: asArray(rawIR.sourceLedger)
      .map((entry, index) => {
        const normalized = normalizeTrustedSource(
          {
            provider: 'courseir',
            sourceType: 'courseir-ledger-row',
            ...entry,
            status: SOURCE_STATUSES.has(entry?.status) ? entry.status : 'model-authored',
          },
          { fallbackId: normalizeId(entry?.id, 'SL', index) },
        );
        return {
          ...normalized,
          id: normalizeId(normalized.id, 'SL', index),
          scope: cleanText(normalized.scope || entry?.scope || entry?.path || 'course', 120),
          status: SOURCE_STATUSES.has(normalized.status) ? normalized.status : 'model-authored',
          evidence: cleanText(normalized.evidence || entry?.evidence || entry?.note || entry?.source, 360),
        };
      })
      .filter((entry) => entry.scope),
    constraints: asArray(rawIR.constraints || course.constraints)
      .map((entry, index) => normalizeConstraint(entry, index, 'course'))
      .filter((entry) => entry.text),
    concepts,
    lessons,
    assessments,
    artifactIntents: asArray(rawIR.artifactIntents).map(normalizeArtifactIntent),
    handoffNotes: asArray(rawIR.handoffNotes)
      .map(normalizeHandoffNote)
      .filter((note) => note.note),
    qualityHints: asArray(rawIR.qualityHints)
      .map((hint) => cleanText(hint, 220))
      .filter(Boolean),
  };
}

function issue(severity, code, path, message, extra = {}) {
  return { severity, code, path, message, ...extra };
}

export function validateCourseIR(rawIR = {}) {
  const ir = normalizeCourseIR(rawIR);
  const issues = [];
  const push = (...args) => issues.push(issue(...args));

  if (ir.version !== COURSE_IR_VERSION) {
    push('blocker', 'version-mismatch', 'version', `CourseIR version must be ${COURSE_IR_VERSION}.`);
  }
  if (!ir.course.title) push('blocker', 'missing-course-title', 'course.title', 'CourseIR needs a course title.');
  if (ir.lessons.length === 0) push('blocker', 'missing-lessons', 'lessons', 'CourseIR needs at least one lesson.');
  if (ir.concepts.length === 0) push('blocker', 'missing-concepts', 'concepts', 'CourseIR needs concept atoms.');
  if (ir.assessments.length === 0) {
    push('blocker', 'missing-assessments', 'assessments', 'CourseIR needs assessment atoms.');
  }
  if (ir.sourceLedger.length === 0) {
    push('blocker', 'missing-source-ledger', 'sourceLedger', 'CourseIR needs source/provenance rows.');
  }
  if (ir.constraints.length === 0) {
    push('warning', 'missing-course-constraints', 'constraints', 'CourseIR should carry course-level constraints.', {
      repairPath: 'constraints',
    });
  }
  if (ir.lessons.length > 1 && ir.assessments.length < ir.lessons.length) {
    push(
      'blocker',
      'under-assessed-course',
      'assessments',
      `CourseIR needs lesson-level assessment structure (${ir.assessments.length} assessment${
        ir.assessments.length === 1 ? '' : 's'
      } for ${ir.lessons.length} lessons).`,
      {
        repairPath: 'assessments',
      },
    );
  }

  const conceptIds = new Set();
  for (const [index, concept] of ir.concepts.entries()) {
    const path = `concepts[${index}]`;
    if (conceptIds.has(concept.id))
      push('blocker', 'duplicate-concept-id', `${path}.id`, `Duplicate concept id ${concept.id}.`);
    conceptIds.add(concept.id);
    if (!concept.term) push('blocker', 'missing-concept-term', `${path}.term`, 'Concept needs a term.');
    if (!concept.definition && concept.factualAnchors.length === 0) {
      push('warning', 'thin-concept', path, `Concept ${concept.id} has no definition or factual anchors.`, {
        repairPath: `${path}.definition`,
      });
    }
  }

  const prerequisiteAdjacency = new Map(ir.concepts.map((concept) => [concept.id, concept.prerequisiteIds]));
  for (const [index, concept] of ir.concepts.entries()) {
    const path = `concepts[${index}].prerequisiteIds`;
    for (const prerequisiteId of concept.prerequisiteIds) {
      if (prerequisiteId === concept.id) {
        push('blocker', 'self-concept-prerequisite', path, `Concept ${concept.id} cannot require itself.`);
      } else if (!conceptIds.has(prerequisiteId)) {
        push(
          'blocker',
          'dangling-concept-prerequisite',
          path,
          `Concept ${concept.id} references missing prerequisite concept ${prerequisiteId}.`,
        );
      }
    }
  }

  const visiting = new Set();
  const visited = new Set();
  const cycleReported = new Set();
  const visitPrerequisite = (conceptId, path = []) => {
    if (visiting.has(conceptId)) {
      const cycle = [...path.slice(path.indexOf(conceptId)), conceptId].join(' -> ');
      if (!cycleReported.has(cycle)) {
        cycleReported.add(cycle);
        push('blocker', 'cyclic-concept-prerequisite', 'concepts.prerequisiteIds', `Prerequisite cycle: ${cycle}.`);
      }
      return;
    }
    if (visited.has(conceptId)) return;
    visiting.add(conceptId);
    for (const prerequisiteId of prerequisiteAdjacency.get(conceptId) || []) {
      if (conceptIds.has(prerequisiteId)) visitPrerequisite(prerequisiteId, [...path, conceptId]);
    }
    visiting.delete(conceptId);
    visited.add(conceptId);
  };
  for (const conceptId of conceptIds) visitPrerequisite(conceptId);

  const lessonIds = new Set();
  const assessmentIds = new Set(ir.assessments.map((assessment) => assessment.id));
  const outcomeIds = new Set(ir.lessons.flatMap((lesson) => lesson.outcomes.map((outcome) => outcome.id)));
  const sourceLedgerIds = new Set(ir.sourceLedger.map((entry) => entry.id));
  const assessmentLessonRefs = new Map(ir.lessons.map((lesson) => [lesson.id, 0]));
  const validateSourceRefs = (sourceRefs, path, label, codePrefix) => {
    if (sourceRefs.length === 0) {
      push('blocker', `missing-${codePrefix}-source-refs`, `${path}.sourceRefs`, `${label} needs source references.`, {
        repairPath: `${path}.sourceRefs`,
      });
    }
    for (const sourceRef of sourceRefs) {
      if (!sourceLedgerIds.has(sourceRef)) {
        push(
          'blocker',
          `dangling-${codePrefix}-source-ref`,
          `${path}.sourceRefs`,
          `${label} references missing source ledger row ${sourceRef}.`,
          {
            repairPath: `${path}.sourceRefs`,
          },
        );
      }
    }
  };

  for (const [index, lesson] of ir.lessons.entries()) {
    const path = `lessons[${index}]`;
    if (lessonIds.has(lesson.id))
      push('blocker', 'duplicate-lesson-id', `${path}.id`, `Duplicate lesson id ${lesson.id}.`);
    lessonIds.add(lesson.id);
    if (!lesson.topic) push('blocker', 'missing-lesson-topic', `${path}.topic`, 'Lesson needs a topic.');
    if (lesson.objectives.length === 0) {
      push('blocker', 'missing-lesson-objectives', `${path}.objectives`, 'Lesson needs at least one objective.', {
        repairPath: `${path}.objectives`,
      });
    }
    if (lesson.outcomes.length === 0) {
      push('blocker', 'missing-lesson-outcomes', `${path}.outcomes`, 'Lesson needs first-class outcome atoms.', {
        repairPath: `${path}.outcomes`,
      });
    }
    if (lesson.activities.length === 0) {
      push('blocker', 'missing-lesson-activities', `${path}.activities`, 'Lesson needs first-class activity atoms.', {
        repairPath: `${path}.activities`,
      });
    }
    if (lesson.conceptIds.length === 0) {
      push('blocker', 'missing-lesson-concepts', `${path}.conceptIds`, 'Lesson needs concept coverage.', {
        repairPath: `${path}.conceptIds`,
      });
    }
    for (const conceptId of lesson.conceptIds) {
      if (!conceptIds.has(conceptId)) {
        push(
          'blocker',
          'dangling-lesson-concept',
          `${path}.conceptIds`,
          `Lesson references missing concept ${conceptId}.`,
        );
      }
    }
    for (const conceptId of lesson.prerequisiteConceptIds) {
      if (!conceptIds.has(conceptId)) {
        push(
          'blocker',
          'dangling-lesson-prerequisite',
          `${path}.prerequisiteConceptIds`,
          `Lesson references missing prerequisite concept ${conceptId}.`,
        );
      }
    }
    for (const [outcomeIndex, outcome] of lesson.outcomes.entries()) {
      const outcomePath = `${path}.outcomes[${outcomeIndex}]`;
      validateSourceRefs(outcome.sourceRefs, outcomePath, 'Outcome', 'outcome');
      if (outcome.conceptIds.length === 0) {
        push('blocker', 'missing-outcome-concepts', `${outcomePath}.conceptIds`, 'Outcome must link to concepts.', {
          repairPath: `${outcomePath}.conceptIds`,
        });
      }
      for (const conceptId of outcome.conceptIds) {
        if (!conceptIds.has(conceptId)) {
          push(
            'blocker',
            'dangling-outcome-concept',
            `${outcomePath}.conceptIds`,
            `Outcome references missing concept ${conceptId}.`,
          );
        }
      }
      for (const assessmentId of outcome.assessmentIds) {
        if (!assessmentIds.has(assessmentId)) {
          push(
            'blocker',
            'dangling-outcome-assessment',
            `${outcomePath}.assessmentIds`,
            `Outcome references missing assessment ${assessmentId}.`,
          );
        }
      }
    }
    for (const [activityIndex, activity] of lesson.activities.entries()) {
      const activityPath = `${path}.activities[${activityIndex}]`;
      validateSourceRefs(activity.sourceRefs, activityPath, 'Activity', 'activity');
      if (activity.conceptIds.length === 0) {
        push(
          'blocker',
          'missing-activity-concepts',
          `${activityPath}.conceptIds`,
          'Activity must link to genome/source concepts.',
          {
            repairPath: `${activityPath}.conceptIds`,
          },
        );
      }
      if (activity.assessmentIds.length === 0) {
        push(
          'warning',
          'missing-activity-assessments',
          `${activityPath}.assessmentIds`,
          'Activity should link to the assessment it prepares.',
          {
            repairPath: `${activityPath}.assessmentIds`,
          },
        );
      }
      if (!activity.evidence) {
        push(
          'warning',
          'missing-activity-evidence',
          `${activityPath}.evidence`,
          'Activity should name its evidence output.',
          {
            repairPath: `${activityPath}.evidence`,
          },
        );
      }
      for (const conceptId of activity.conceptIds) {
        if (!conceptIds.has(conceptId)) {
          push(
            'blocker',
            'dangling-activity-concept',
            `${activityPath}.conceptIds`,
            `Activity references missing concept ${conceptId}.`,
          );
        }
      }
      for (const assessmentId of activity.assessmentIds) {
        if (!assessmentIds.has(assessmentId)) {
          push(
            'blocker',
            'dangling-activity-assessment',
            `${activityPath}.assessmentIds`,
            `Activity references missing assessment ${assessmentId}.`,
          );
        }
      }
    }
    if (lesson.constraints.length === 0) {
      push('warning', 'missing-lesson-constraints', `${path}.constraints`, 'Lesson has no constraint atoms.', {
        repairPath: `${path}.constraints`,
      });
    }
    if (lesson.factualAnchors.length === 0) {
      push('warning', 'thin-lesson-facts', `${path}.factualAnchors`, 'Lesson has no lesson-specific factual anchors.', {
        repairPath: `${path}.factualAnchors`,
      });
    }
    if (lesson.workedExamples.length === 0) {
      push('warning', 'missing-worked-example', `${path}.workedExamples`, 'Lesson has no worked-example spec.', {
        repairPath: `${path}.workedExamples`,
      });
    }
    for (const [exampleIndex, example] of lesson.workedExamples.entries()) {
      validateSourceRefs(
        example.sourceRefs || [],
        `${path}.workedExamples[${exampleIndex}]`,
        'Worked example',
        'example',
      );
    }
    if (lesson.misconceptions.length === 0) {
      push('warning', 'missing-misconception', `${path}.misconceptions`, 'Lesson has no misconception corrective.', {
        repairPath: `${path}.misconceptions`,
      });
    }
    for (const assessmentId of lesson.assessmentIds) {
      if (!assessmentIds.has(assessmentId)) {
        push(
          'blocker',
          'dangling-lesson-assessment',
          `${path}.assessmentIds`,
          `Lesson references missing assessment ${assessmentId}.`,
        );
      }
    }
  }

  for (const [index, assessment] of ir.assessments.entries()) {
    const path = `assessments[${index}]`;
    if (!assessment.title) push('blocker', 'missing-assessment-title', `${path}.title`, 'Assessment needs a title.');
    validateSourceRefs(assessment.sourceRefs || [], path, 'Assessment', 'assessment');
    if (assessment.lessonIds.length === 0) {
      push(
        'blocker',
        'missing-assessment-lessons',
        `${path}.lessonIds`,
        'Assessment must link to at least one lesson.',
        {
          repairPath: `${path}.lessonIds`,
        },
      );
    }
    for (const lessonId of assessment.lessonIds) {
      if (!lessonIds.has(lessonId)) {
        push(
          'blocker',
          'dangling-assessment-lesson',
          `${path}.lessonIds`,
          `Assessment references missing lesson ${lessonId}.`,
        );
      } else {
        assessmentLessonRefs.set(lessonId, (assessmentLessonRefs.get(lessonId) || 0) + 1);
      }
    }
    for (const conceptId of assessment.coverageConceptIds) {
      if (!conceptIds.has(conceptId)) {
        push(
          'warning',
          'dangling-assessment-concept',
          `${path}.coverageConceptIds`,
          `Assessment references missing concept ${conceptId}.`,
        );
      }
    }
    if (assessment.rubricCriteria.length === 0) {
      push('blocker', 'missing-rubric-criteria', `${path}.rubricCriteria`, 'Assessment needs rubric criteria atoms.', {
        repairPath: `${path}.rubricCriteria`,
      });
    }
    for (const [criterionIndex, criterion] of assessment.rubricCriteria.entries()) {
      const criterionPath = `${path}.rubricCriteria[${criterionIndex}]`;
      validateSourceRefs(criterion.sourceRefs, criterionPath, 'Rubric criterion', 'rubric');
      if (criterion.conceptIds.length === 0) {
        push(
          'blocker',
          'missing-rubric-concepts',
          `${criterionPath}.conceptIds`,
          'Rubric criterion must link to assessed concepts.',
          {
            repairPath: `${criterionPath}.conceptIds`,
          },
        );
      }
      if (criterion.outcomeIds.length === 0) {
        push(
          'warning',
          'missing-rubric-outcomes',
          `${criterionPath}.outcomeIds`,
          'Rubric criterion should link to learning outcomes.',
          {
            repairPath: `${criterionPath}.outcomeIds`,
          },
        );
      }
      if (criterion.performanceLevels.length < 2) {
        push(
          'blocker',
          'missing-rubric-levels',
          `${criterionPath}.performanceLevels`,
          'Rubric criterion needs at least two performance levels.',
          {
            repairPath: `${criterionPath}.performanceLevels`,
          },
        );
      }
      for (const conceptId of criterion.conceptIds) {
        if (!conceptIds.has(conceptId)) {
          push(
            'blocker',
            'dangling-rubric-concept',
            `${criterionPath}.conceptIds`,
            `Rubric criterion references missing concept ${conceptId}.`,
          );
        }
      }
      for (const outcomeId of criterion.outcomeIds) {
        if (!outcomeIds.has(outcomeId)) {
          push(
            'blocker',
            'dangling-rubric-outcome',
            `${criterionPath}.outcomeIds`,
            `Rubric criterion references missing outcome ${outcomeId}.`,
          );
        }
      }
    }
  }

  for (const [lessonId, count] of assessmentLessonRefs.entries()) {
    if (count === 0) {
      push('blocker', 'unassessed-lesson', `lessons.${lessonId}`, `Lesson ${lessonId} has no linked assessment.`, {
        repairPath: `lessons.${lessonId}.assessmentIds`,
      });
    }
  }

  for (const [index, intent] of ir.artifactIntents.entries()) {
    const path = `artifactIntents[${index}]`;
    if (!KNOWN_FEATURE_IDS.includes(intent.featureId) && !intent.featureId.startsWith('custom_')) {
      push('warning', 'unknown-artifact-intent', `${path}.featureId`, `Unknown artifact feature ${intent.featureId}.`);
    }
    for (const lessonId of intent.lessonIds) {
      if (!lessonIds.has(lessonId)) {
        push(
          'blocker',
          'dangling-artifact-lesson',
          `${path}.lessonIds`,
          `Artifact intent references missing lesson ${lessonId}.`,
        );
      }
    }
  }

  const hasReviewNeededSource = ir.sourceLedger.some(
    (entry) => entry.status === 'assumption' || entry.status === 'model-authored',
  );
  if (hasReviewNeededSource && ir.handoffNotes.length === 0) {
    push(
      'warning',
      'missing-handoff-notes',
      'handoffNotes',
      'Model-authored or assumption rows need instructor handoff notes.',
      {
        repairPath: 'handoffNotes',
      },
    );
  }

  const stats = {
    lessons: ir.lessons.length,
    concepts: ir.concepts.length,
    assessments: ir.assessments.length,
    factualAnchors:
      ir.lessons.reduce((sum, lesson) => sum + lesson.factualAnchors.length, 0) +
      ir.concepts.reduce((sum, concept) => sum + concept.factualAnchors.length, 0),
    workedExamples: ir.lessons.reduce((sum, lesson) => sum + lesson.workedExamples.length, 0),
    outcomes: ir.lessons.reduce((sum, lesson) => sum + lesson.outcomes.length, 0),
    activities: ir.lessons.reduce((sum, lesson) => sum + lesson.activities.length, 0),
    rubricCriteria: ir.assessments.reduce((sum, assessment) => sum + assessment.rubricCriteria.length, 0),
    rubricCriteriaWithLevels: ir.assessments.reduce(
      (sum, assessment) =>
        sum + assessment.rubricCriteria.filter((criterion) => criterion.performanceLevels.length >= 2).length,
      0,
    ),
    rubricOutcomeLinks: ir.assessments.reduce(
      (sum, assessment) =>
        sum +
        assessment.rubricCriteria.reduce((criterionSum, criterion) => criterionSum + criterion.outcomeIds.length, 0),
      0,
    ),
    sourceLinkedOutcomes: ir.lessons.reduce(
      (sum, lesson) => sum + lesson.outcomes.filter((outcome) => outcome.sourceRefs.length > 0).length,
      0,
    ),
    sourceLinkedActivities: ir.lessons.reduce(
      (sum, lesson) => sum + lesson.activities.filter((activity) => activity.sourceRefs.length > 0).length,
      0,
    ),
    sourceLinkedRubricCriteria: ir.assessments.reduce(
      (sum, assessment) =>
        sum + assessment.rubricCriteria.filter((criterion) => criterion.sourceRefs.length > 0).length,
      0,
    ),
    sourceLinkedWorkedExamples: ir.lessons.reduce(
      (sum, lesson) => sum + lesson.workedExamples.filter((example) => example.sourceRefs?.length > 0).length,
      0,
    ),
    sourceLinkedAssessments: ir.assessments.filter((assessment) => assessment.sourceRefs?.length > 0).length,
    misconceptionCorrectives:
      ir.lessons.reduce((sum, lesson) => sum + lesson.misconceptions.filter((entry) => entry.correction).length, 0) +
      ir.concepts.reduce((sum, concept) => sum + concept.misconceptions.filter((entry) => entry.correction).length, 0),
    artifactIntents: ir.artifactIntents.length,
    sourceLedgerRows: ir.sourceLedger.length,
    constraints: ir.constraints.length + ir.lessons.reduce((sum, lesson) => sum + lesson.constraints.length, 0),
    prerequisiteLinks:
      ir.concepts.reduce((sum, concept) => sum + concept.prerequisiteIds.length, 0) +
      ir.lessons.reduce((sum, lesson) => sum + lesson.prerequisiteConceptIds.length, 0),
  };
  const coverage = buildCourseIRCoverageLedger(ir);
  const repairPaths = issues.map((entry) => entry.repairPath).filter(Boolean);
  return {
    valid: !issues.some((entry) => BLOCKING_SEVERITIES.has(entry.severity)),
    ir,
    issues,
    stats,
    coverage,
    repairPaths: [...new Set(repairPaths)],
  };
}

function nextAssessmentId(usedIds, ordinal) {
  let candidate = `A${ordinal}`;
  while (usedIds.has(candidate)) {
    ordinal += 1;
    candidate = `A${ordinal}`;
  }
  usedIds.add(candidate);
  return candidate;
}

function nextConceptId(usedIds, ordinal) {
  let candidate = `C${ordinal}`;
  while (usedIds.has(candidate)) {
    ordinal += 1;
    candidate = `C${ordinal}`;
  }
  usedIds.add(candidate);
  return candidate;
}

function lessonConceptFromTopic(lesson, index, id, sourceRef = 'SL1') {
  const topic = cleanText(lesson.topic || lesson.title || `Lesson ${index + 1}`, 140);
  return {
    id,
    term: topic,
    definition: `Core concept for ${topic}.`,
    prerequisiteIds: [],
    factualAnchors:
      lesson.factualAnchors.length > 0
        ? lesson.factualAnchors
        : [
            {
              claim: `Students need evidence for ${topic}.`,
              status: 'assumption',
              sourceRefs: [sourceRef],
              risk: 'medium',
            },
          ],
    misconceptions: lesson.misconceptions,
    vocabulary: [],
    sourceTier: 'courseir-repair',
  };
}

function assessmentTemplateForLesson(ir, lesson) {
  return (
    ir.assessments.find((assessment) => assessment.lessonIds.length === 1 && assessment.lessonIds[0] === lesson.id) ||
    ir.assessments.find((assessment) => assessment.lessonIds.includes(lesson.id)) ||
    ir.assessments[0] ||
    {}
  );
}

function lessonAssessmentFromTemplate(template, lesson, index, id) {
  const topic = cleanText(lesson.topic || lesson.title || `Lesson ${index + 1}`, 140);
  const templateIsLessonSpecific = template?.lessonIds?.length === 1 && template.lessonIds[0] === lesson.id;
  const title = templateIsLessonSpecific
    ? cleanText(template.title || `${topic} check`, 160)
    : cleanText(`${topic} check`, 160);
  const prompt = templateIsLessonSpecific
    ? cleanText(template.prompt || `Demonstrate ${topic} with evidence.`, 260)
    : cleanText(
        template?.prompt ? `${template.prompt} Focus the evidence on ${topic}.` : `Demonstrate ${topic} with evidence.`,
        260,
      );
  return {
    ...template,
    id,
    title,
    kind: VALID_ASSESSMENT_KINDS.has(template?.kind) ? template.kind : 'graded-artifact',
    lessonIds: [lesson.id],
    coverageConceptIds: lesson.conceptIds,
    prompt,
    rubricDimensions: uniqueStrings([...asArray(template?.rubricDimensions), ...DEFAULT_RUBRIC_DIMENSIONS], 5),
    rubricCriteria: templateIsLessonSpecific ? asArray(template?.rubricCriteria) : [],
    provenance: cleanText(template?.provenance || 'courseir-repair', 80),
  };
}

function outcomesForAssessment(ir, assessment) {
  const linkedLessons = ir.lessons.filter((lesson) => assessment.lessonIds.includes(lesson.id));
  const explicitlyLinked = linkedLessons.flatMap((lesson) =>
    lesson.outcomes.filter((outcome) => outcome.assessmentIds.includes(assessment.id)),
  );
  const fallback = linkedLessons.flatMap((lesson) => lesson.outcomes);
  return explicitlyLinked.length > 0 ? explicitlyLinked : fallback;
}

function conceptIdsForAssessment(ir, assessment) {
  const linkedLessons = ir.lessons.filter((lesson) => assessment.lessonIds.includes(lesson.id));
  return uniqueStrings([...assessment.coverageConceptIds, ...linkedLessons.flatMap((lesson) => lesson.conceptIds)], 32);
}

function repairedRubricLevels(criterionLabel) {
  const label = cleanText(criterionLabel || 'criterion', 80).toLowerCase();
  return [
    {
      level: 'Exceeds',
      description: `Uses precise evidence and reasoning for ${label}.`,
      points: 4,
    },
    {
      level: 'Meets',
      description: `Shows accurate, sufficient work for ${label}.`,
      points: 3,
    },
    {
      level: 'Developing',
      description: `Shows partial or inconsistent evidence for ${label}.`,
      points: 2,
    },
    {
      level: 'Needs revision',
      description: `Does not yet provide usable evidence for ${label}.`,
      points: 1,
    },
  ];
}

function repairedAssessmentRubricCriteria(ir, assessment) {
  const conceptIds = conceptIdsForAssessment(ir, assessment);
  const outcomeIds = outcomesForAssessment(ir, assessment).map((outcome) => outcome.id);
  const sourceCriteria =
    assessment.rubricCriteria.length > 0
      ? assessment.rubricCriteria
      : uniqueStrings(
          assessment.rubricDimensions.length > 0 ? assessment.rubricDimensions : DEFAULT_RUBRIC_DIMENSIONS,
          5,
        ).map((dimension, index) => ({
          id: `${assessment.id}-R${index + 1}`,
          label: dimension,
          description: `Evaluate ${dimension} in ${assessment.title}.`,
          conceptIds,
          outcomeIds,
          performanceLevels: [],
          sourceRefs: [],
        }));
  return sourceCriteria.map((criterion, index) => ({
    ...criterion,
    id: criterion.id || `${assessment.id}-R${index + 1}`,
    description: criterion.description || `Evaluate ${criterion.label} in ${assessment.title}.`,
    conceptIds: criterion.conceptIds.length > 0 ? criterion.conceptIds : conceptIds,
    outcomeIds: criterion.outcomeIds.length > 0 ? criterion.outcomeIds : outcomeIds,
    performanceLevels:
      criterion.performanceLevels.length >= 2 ? criterion.performanceLevels : repairedRubricLevels(criterion.label),
  }));
}

function validSourceRefs(ir, sourceRefs = []) {
  const sourceIds = new Set((ir.sourceLedger || []).map((entry) => entry.id));
  return uniqueStrings(
    sourceRefs.filter((sourceRef) => sourceIds.has(sourceRef)),
    16,
  );
}

function fallbackSourceRefsForLesson(ir, lesson) {
  const concepts = conceptByIdMap(ir);
  const linkedConcepts = lesson.conceptIds.map((id) => concepts.get(id)).filter(Boolean);
  const candidateRefs = [
    ...lesson.factualAnchors.flatMap((anchor) => anchor.sourceRefs),
    ...constraintsForLesson(ir, lesson).flatMap((constraint) => constraint.sourceRefs || []),
    ...linkedConcepts.flatMap((concept) => concept.factualAnchors.flatMap((anchor) => anchor.sourceRefs)),
  ];
  const validRefs = validSourceRefs(ir, candidateRefs);
  if (validRefs.length > 0) return validRefs;
  return ir.sourceLedger[0]?.id ? [ir.sourceLedger[0].id] : [];
}

function fallbackSourceRefsForAssessment(ir, assessment) {
  const linkedLessons = ir.lessons.filter((lesson) => assessment.lessonIds.includes(lesson.id));
  const validRefs = validSourceRefs(
    ir,
    linkedLessons.flatMap((lesson) => fallbackSourceRefsForLesson(ir, lesson)),
  );
  if (validRefs.length > 0) return validRefs;
  return ir.sourceLedger[0]?.id ? [ir.sourceLedger[0].id] : [];
}

function sourceRefsNeedRepair(ir, refs = []) {
  const validRefs = validSourceRefs(ir, refs);
  return refs.length === 0 || validRefs.length !== refs.length;
}

function repairedAtomSourceRefs(ir, refs, fallbackRefs) {
  const validRefs = validSourceRefs(ir, refs);
  return validRefs.length > 0 ? validRefs : uniqueStrings(fallbackRefs, 16);
}

function needsAtomSourceRepair(ir) {
  return (
    ir.lessons.some(
      (lesson) =>
        lesson.outcomes.some((outcome) => sourceRefsNeedRepair(ir, outcome.sourceRefs)) ||
        lesson.activities.some((activity) => sourceRefsNeedRepair(ir, activity.sourceRefs)) ||
        lesson.workedExamples.some((example) => sourceRefsNeedRepair(ir, example.sourceRefs || [])),
    ) ||
    ir.assessments.some(
      (assessment) =>
        sourceRefsNeedRepair(ir, assessment.sourceRefs || []) ||
        assessment.rubricCriteria.some((criterion) => sourceRefsNeedRepair(ir, criterion.sourceRefs)),
    )
  );
}

function repairedCourseConstraint() {
  return {
    id: 'K1',
    scope: 'course',
    text: 'Confirm local timing, modality, accessibility, source permissions, and grading policy before publishing.',
    sourceRefs: [],
    severity: 'review',
  };
}

function repairedLessonConstraint(lesson, index) {
  const topic = cleanText(lesson.topic || lesson.title || `Lesson ${index + 1}`, 140);
  return {
    id: `K-L${index + 1}`,
    scope: lesson.id,
    text: `Keep ${topic} aligned to the stated objective, lesson-level assessment, and available class time.`,
    sourceRefs: [],
    severity: 'requirement',
  };
}

function repairedLessonOutcomes(lesson) {
  const sourceStatements =
    lesson.objectives.length > 0
      ? lesson.objectives
      : [`Apply ${cleanText(lesson.topic || lesson.title || 'the lesson concept', 120)} with evidence.`];
  return sourceStatements.map((statement, index) => ({
    id: `${lesson.id}-O${index + 1}`,
    statement,
    performanceVerb: statement.split(/\s+/)[0] || 'Apply',
    conceptIds: lesson.conceptIds,
    assessmentIds: lesson.assessmentIds,
    sourceRefs: [],
  }));
}

function repairedLessonActivities(ir, lesson) {
  const concepts = conceptByIdMap(ir);
  const linkedConcepts = lesson.conceptIds.map((id) => concepts.get(id)).filter(Boolean);
  const constraints = constraintsForLesson(ir, lesson);
  const { asyncActivities, syncActivities } = lessonActivitiesFromIR(
    {
      ...lesson,
      activities: [],
    },
    linkedConcepts,
    constraints,
  );
  const topic = cleanText(lesson.topic || lesson.title || 'lesson concept', 120);
  const evidenceTarget = lesson.assessmentIds[0] || 'lesson assessment';
  return [
    ...asyncActivities.map((learnerAction, index) => ({
      id: `${lesson.id}-ACT${index + 1}`,
      mode: 'async',
      title: learnerAction.split(/[:;.]/)[0] || `Prepare ${topic}`,
      learnerAction,
      evidence: `Prepared notes for ${evidenceTarget}.`,
      conceptIds: lesson.conceptIds,
      assessmentIds: lesson.assessmentIds,
      sourceRefs: [],
    })),
    ...syncActivities.map((learnerAction, index) => ({
      id: `${lesson.id}-ACT${asyncActivities.length + index + 1}`,
      mode: 'sync',
      title: learnerAction.split(/[:;.]/)[0] || `Practice ${topic}`,
      learnerAction,
      evidence: `Class artifact or explanation for ${evidenceTarget}.`,
      conceptIds: lesson.conceptIds,
      assessmentIds: lesson.assessmentIds,
      sourceRefs: [],
    })),
  ].slice(0, 4);
}

export function repairCourseIRStructure(rawIR = {}) {
  let ir = normalizeCourseIR(rawIR);
  const repairs = [];
  let changed = false;

  if (ir.sourceLedger.length === 0 && ir.lessons.length > 0) {
    ir = normalizeCourseIR({
      ...ir,
      sourceLedger: [
        {
          id: 'SL1',
          scope: 'course',
          status: 'assumption',
          evidence: 'No source ledger was supplied; repaired package requires instructor source review.',
        },
      ],
      handoffNotes: [
        ...ir.handoffNotes,
        {
          id: 'HN1',
          scope: 'sourceLedger',
          severity: 'review',
          note: 'CourseIR source ledger was missing and was repaired as an instructor-review assumption.',
        },
      ],
    });
    repairs.push({ code: 'added-assumption-source-ledger', before: 0, after: ir.sourceLedger.length });
    changed = true;
  }

  if (ir.constraints.length === 0 && ir.lessons.length > 0) {
    ir = normalizeCourseIR({
      ...ir,
      constraints: [repairedCourseConstraint()],
      handoffNotes: [
        ...ir.handoffNotes,
        {
          id: 'HN-constraints',
          scope: 'constraints',
          severity: 'review',
          note: 'CourseIR constraints were missing and were repaired as instructor-review publication constraints.',
        },
      ],
    });
    repairs.push({ code: 'added-course-constraints', before: 0, after: ir.constraints.length });
    changed = true;
  }

  if (ir.lessons.some((lesson) => lesson.constraints.length === 0)) {
    const missingConstraintLessonCount = ir.lessons.filter((lesson) => lesson.constraints.length === 0).length;
    ir = normalizeCourseIR({
      ...ir,
      lessons: ir.lessons.map((lesson, index) =>
        lesson.constraints.length > 0
          ? lesson
          : {
              ...lesson,
              constraints: [repairedLessonConstraint(lesson, index)],
            },
      ),
    });
    repairs.push({ code: 'added-lesson-constraints', count: missingConstraintLessonCount });
    changed = true;
  }

  if (ir.lessons.some((lesson) => lesson.conceptIds.length === 0)) {
    const usedConceptIds = new Set(ir.concepts.map((concept) => concept.id));
    const nextConcepts = [...ir.concepts];
    const sourceRef = ir.sourceLedger[0]?.id || 'SL1';
    const missingConceptLessonCount = ir.lessons.filter((lesson) => lesson.conceptIds.length === 0).length;
    const nextLessons = ir.lessons.map((lesson, index) => {
      if (lesson.conceptIds.length > 0) return lesson;
      const conceptId = nextConceptId(usedConceptIds, index + 1);
      nextConcepts.push(lessonConceptFromTopic(lesson, index, conceptId, sourceRef));
      return {
        ...lesson,
        conceptIds: [conceptId],
      };
    });
    ir = normalizeCourseIR({
      ...ir,
      concepts: nextConcepts,
      lessons: nextLessons,
    });
    repairs.push({
      code: 'added-lesson-concepts',
      count: missingConceptLessonCount,
    });
    changed = true;
  }

  if (ir.lessons.length > 1 && ir.assessments.length < ir.lessons.length) {
    const usedAssessmentIds = new Set();
    const nextLessons = [];
    const nextAssessments = [];
    for (const [index, lesson] of ir.lessons.entries()) {
      const template = assessmentTemplateForLesson(ir, lesson);
      const existingLessonSpecific =
        template?.id && template.lessonIds?.length === 1 && template.lessonIds[0] === lesson.id;
      const id =
        existingLessonSpecific && !usedAssessmentIds.has(template.id)
          ? template.id
          : nextAssessmentId(usedAssessmentIds, index + 1);
      usedAssessmentIds.add(id);
      nextAssessments.push(lessonAssessmentFromTemplate(template, lesson, index, id));
      nextLessons.push({
        ...lesson,
        assessmentIds: [id],
      });
    }

    const assessmentIds = nextAssessments.map((assessment) => assessment.id);
    const nextArtifactIntents = ir.artifactIntents.map((intent) => ({
      ...intent,
      requiredRefs: uniqueStrings([...intent.requiredRefs, ...assessmentIds], 200),
    }));

    const assessmentCountBefore = ir.assessments.length;
    ir = normalizeCourseIR({
      ...ir,
      lessons: nextLessons,
      assessments: nextAssessments,
      artifactIntents: nextArtifactIntents,
    });
    repairs.push({
      code: 'expanded-lesson-assessments',
      before: assessmentCountBefore,
      after: ir.assessments.length,
    });
    changed = true;
  }

  if (ir.lessons.some((lesson) => lesson.outcomes.length === 0)) {
    const missingOutcomeLessonCount = ir.lessons.filter((lesson) => lesson.outcomes.length === 0).length;
    ir = normalizeCourseIR({
      ...ir,
      lessons: ir.lessons.map((lesson) =>
        lesson.outcomes.length > 0
          ? lesson
          : {
              ...lesson,
              outcomes: repairedLessonOutcomes(lesson),
            },
      ),
    });
    repairs.push({ code: 'added-lesson-outcomes', count: missingOutcomeLessonCount });
    changed = true;
  }

  if (ir.lessons.some((lesson) => lesson.activities.length === 0)) {
    const missingActivityLessonCount = ir.lessons.filter((lesson) => lesson.activities.length === 0).length;
    ir = normalizeCourseIR({
      ...ir,
      lessons: ir.lessons.map((lesson) =>
        lesson.activities.length > 0
          ? lesson
          : {
              ...lesson,
              activities: repairedLessonActivities(ir, lesson),
            },
      ),
    });
    repairs.push({ code: 'added-lesson-activities', count: missingActivityLessonCount });
    changed = true;
  }

  if (
    ir.assessments.some(
      (assessment) =>
        assessment.rubricCriteria.length === 0 ||
        assessment.rubricCriteria.some(
          (criterion) =>
            criterion.conceptIds.length === 0 ||
            criterion.outcomeIds.length === 0 ||
            criterion.performanceLevels.length < 2,
        ),
    )
  ) {
    const repairedAssessmentCount = ir.assessments.filter(
      (assessment) =>
        assessment.rubricCriteria.length === 0 ||
        assessment.rubricCriteria.some(
          (criterion) =>
            criterion.conceptIds.length === 0 ||
            criterion.outcomeIds.length === 0 ||
            criterion.performanceLevels.length < 2,
        ),
    ).length;
    ir = normalizeCourseIR({
      ...ir,
      assessments: ir.assessments.map((assessment) => ({
        ...assessment,
        rubricCriteria: repairedAssessmentRubricCriteria(ir, assessment),
      })),
    });
    repairs.push({ code: 'added-assessment-rubric-criteria', count: repairedAssessmentCount });
    changed = true;
  }

  if (needsAtomSourceRepair(ir)) {
    const repairedOutcomeCount = ir.lessons.reduce(
      (sum, lesson) => sum + lesson.outcomes.filter((outcome) => sourceRefsNeedRepair(ir, outcome.sourceRefs)).length,
      0,
    );
    const repairedActivityCount = ir.lessons.reduce(
      (sum, lesson) =>
        sum + lesson.activities.filter((activity) => sourceRefsNeedRepair(ir, activity.sourceRefs)).length,
      0,
    );
    const repairedExampleCount = ir.lessons.reduce(
      (sum, lesson) =>
        sum + lesson.workedExamples.filter((example) => sourceRefsNeedRepair(ir, example.sourceRefs || [])).length,
      0,
    );
    const repairedAssessmentSourceCount = ir.assessments.filter((assessment) =>
      sourceRefsNeedRepair(ir, assessment.sourceRefs || []),
    ).length;
    const repairedRubricCount = ir.assessments.reduce(
      (sum, assessment) =>
        sum + assessment.rubricCriteria.filter((criterion) => sourceRefsNeedRepair(ir, criterion.sourceRefs)).length,
      0,
    );
    ir = normalizeCourseIR({
      ...ir,
      lessons: ir.lessons.map((lesson) => {
        const fallbackRefs = fallbackSourceRefsForLesson(ir, lesson);
        return {
          ...lesson,
          outcomes: lesson.outcomes.map((outcome) => ({
            ...outcome,
            sourceRefs: repairedAtomSourceRefs(ir, outcome.sourceRefs, fallbackRefs),
          })),
          activities: lesson.activities.map((activity) => ({
            ...activity,
            sourceRefs: repairedAtomSourceRefs(ir, activity.sourceRefs, fallbackRefs),
          })),
          workedExamples: lesson.workedExamples.map((example) => ({
            ...example,
            sourceRefs: repairedAtomSourceRefs(ir, example.sourceRefs || [], fallbackRefs),
          })),
        };
      }),
      assessments: ir.assessments.map((assessment) => {
        const fallbackRefs = fallbackSourceRefsForAssessment(ir, assessment);
        return {
          ...assessment,
          sourceRefs: repairedAtomSourceRefs(ir, assessment.sourceRefs || [], fallbackRefs),
          rubricCriteria: assessment.rubricCriteria.map((criterion) => ({
            ...criterion,
            sourceRefs: repairedAtomSourceRefs(ir, criterion.sourceRefs, fallbackRefs),
          })),
        };
      }),
    });
    repairs.push({
      code: 'added-atom-source-refs',
      outcomes: repairedOutcomeCount,
      activities: repairedActivityCount,
      workedExamples: repairedExampleCount,
      assessments: repairedAssessmentSourceCount,
      rubricCriteria: repairedRubricCount,
    });
    changed = true;
  }

  return { changed, ir, repairs };
}

function conceptByIdMap(ir) {
  return new Map((ir.concepts || []).map((concept) => [concept.id, concept]));
}

function assessmentByLessonIdMap(ir) {
  const map = new Map((ir.lessons || []).map((lesson) => [lesson.id, []]));
  for (const assessment of ir.assessments || []) {
    for (const lessonId of assessment.lessonIds || []) {
      if (!map.has(lessonId)) map.set(lessonId, []);
      map.get(lessonId).push(assessment);
    }
  }
  return map;
}

function constraintsForLesson(ir, lesson) {
  return [
    ...(ir.constraints || []).filter((constraint) => constraint.scope === 'course' || constraint.scope === lesson.id),
    ...(lesson.constraints || []),
  ];
}

function sourceLedgerById(ir) {
  return new Map((ir.sourceLedger || []).map((entry) => [entry.id, entry]));
}

function sourceRefsForLesson(ir, lesson, assessments = []) {
  return uniqueStrings(
    [
      ...lesson.outcomes.flatMap((outcome) => outcome.sourceRefs || []),
      ...lesson.activities.flatMap((activity) => activity.sourceRefs || []),
      ...lesson.workedExamples.flatMap((example) => example.sourceRefs || []),
      ...lesson.factualAnchors.flatMap((anchor) => anchor.sourceRefs || []),
      ...constraintsForLesson(ir, lesson).flatMap((constraint) => constraint.sourceRefs || []),
      ...assessments.flatMap((assessment) => assessment.sourceRefs || []),
      ...assessments.flatMap((assessment) =>
        assessment.rubricCriteria.flatMap((criterion) => criterion.sourceRefs || []),
      ),
    ],
    12,
  );
}

function sourceLabelsForRefs(ir, sourceRefs = []) {
  const ledger = sourceLedgerById(ir);
  return uniqueStrings(
    sourceRefs
      .map((sourceRef) => ledger.get(sourceRef))
      .filter(Boolean)
      .map((source) => sourceCitationLabel(source)),
    6,
  );
}

export function buildCourseIRCoverageLedger(rawIR = {}) {
  const ir = rawIR.version === COURSE_IR_VERSION ? rawIR : normalizeCourseIR(rawIR);
  const concepts = conceptByIdMap(ir);
  const assessmentsByLessonId = assessmentByLessonIdMap(ir);
  return {
    version: COURSE_IR_VERSION,
    lessons: ir.lessons.map((lesson) => {
      const linkedConcepts = lesson.conceptIds.map((id) => concepts.get(id)).filter(Boolean);
      const assessments = [
        ...assessmentsByLessonId.get(lesson.id),
        ...lesson.assessmentIds.map((id) => ir.assessments.find((assessment) => assessment.id === id)).filter(Boolean),
      ];
      const rubricCriteriaCount = assessments.reduce((sum, assessment) => sum + assessment.rubricCriteria.length, 0);
      const lessonFactCount =
        lesson.factualAnchors.length + linkedConcepts.reduce((sum, concept) => sum + concept.factualAnchors.length, 0);
      const misconceptionCount =
        lesson.misconceptions.length + linkedConcepts.reduce((sum, concept) => sum + concept.misconceptions.length, 0);
      const constraints = constraintsForLesson(ir, lesson);
      return {
        lessonId: lesson.id,
        title: lesson.title,
        conceptIds: linkedConcepts.map((concept) => concept.id),
        prerequisiteConceptIds: lesson.prerequisiteConceptIds,
        assessmentIds: [...new Set(assessments.map((assessment) => assessment.id))],
        outcomeCount: lesson.outcomes.length,
        activityCount: lesson.activities.length,
        rubricCriteriaCount,
        factualAnchorCount: lessonFactCount,
        workedExampleCount: lesson.workedExamples.length,
        misconceptionCount,
        constraintCount: constraints.length,
        complete:
          linkedConcepts.length > 0 &&
          assessments.length > 0 &&
          lesson.objectives.length > 0 &&
          lesson.outcomes.length > 0 &&
          lesson.activities.length > 0 &&
          rubricCriteriaCount >= assessments.length &&
          lessonFactCount > 0 &&
          lesson.workedExamples.length > 0 &&
          constraints.length > 0,
      };
    }),
  };
}

function sourceRefCategory(items, sourceIds) {
  const missingIds = [];
  let withRefs = 0;
  let danglingRefs = 0;
  for (const item of items) {
    const refs = uniqueStrings(item?.sourceRefs || [], 16);
    if (refs.length === 0) {
      missingIds.push(item?.id || item?.label || item?.claim || 'unnamed');
      continue;
    }
    const validRefs = refs.filter((ref) => sourceIds.has(ref));
    if (validRefs.length > 0) withRefs += 1;
    if (validRefs.length !== refs.length) danglingRefs += refs.length - validRefs.length;
  }
  return {
    total: items.length,
    withRefs,
    missing: Math.max(0, items.length - withRefs),
    danglingRefs,
    missingIds: missingIds.slice(0, 20),
  };
}

export function buildCourseIRSourceRefCoverage(rawIR = {}) {
  const ir = rawIR.version === COURSE_IR_VERSION ? rawIR : normalizeCourseIR(rawIR);
  const sourceIds = new Set((ir.sourceLedger || []).map((entry) => entry.id));
  const factualClaims = [
    ...ir.concepts.flatMap((concept) =>
      concept.factualAnchors.map((anchor, index) => ({
        id: `${concept.id}-fact-${index + 1}`,
        ...anchor,
      })),
    ),
    ...ir.lessons.flatMap((lesson) =>
      lesson.factualAnchors.map((anchor, index) => ({
        id: `${lesson.id}-fact-${index + 1}`,
        ...anchor,
      })),
    ),
  ];
  const categories = {
    outcomes: sourceRefCategory(
      ir.lessons.flatMap((lesson) => lesson.outcomes),
      sourceIds,
    ),
    activities: sourceRefCategory(
      ir.lessons.flatMap((lesson) => lesson.activities),
      sourceIds,
    ),
    examples: sourceRefCategory(
      ir.lessons.flatMap((lesson) => lesson.workedExamples),
      sourceIds,
    ),
    assessments: sourceRefCategory(ir.assessments, sourceIds),
    rubricCriteria: sourceRefCategory(
      ir.assessments.flatMap((assessment) => assessment.rubricCriteria),
      sourceIds,
    ),
    factualClaims: sourceRefCategory(factualClaims, sourceIds),
  };
  const totals = Object.values(categories).reduce(
    (sum, category) => ({
      total: sum.total + category.total,
      withRefs: sum.withRefs + category.withRefs,
      missing: sum.missing + category.missing,
      danglingRefs: sum.danglingRefs + category.danglingRefs,
    }),
    { total: 0, withRefs: 0, missing: 0, danglingRefs: 0 },
  );
  return {
    version: COURSE_IR_VERSION,
    sourceLedgerRows: ir.sourceLedger.length,
    totals,
    categories,
  };
}

const GENERIC_ASSESSMENT_SCAFFOLD_RE =
  /\b(?:quick evidence check|exit ticket using|practice response that names|course-relevant decision|new example|evidence needed)\b/i;

function isGenericAssessmentScaffold(text) {
  return GENERIC_ASSESSMENT_SCAFFOLD_RE.test(cleanText(text, 260));
}

function assessmentVariantIndex(assessment = {}, lesson = {}, fallbackIndex = 0) {
  const rawNumber =
    String(assessment?.id || '').match(/\d+/)?.[0] ||
    String(lesson?.id || '').match(/\d+/)?.[0] ||
    lesson?.lessonNumber ||
    fallbackIndex + 1;
  const parsed = Number(rawNumber);
  return Number.isFinite(parsed) && parsed > 0 ? parsed - 1 : fallbackIndex;
}

function assessmentFocusLabel(lesson = {}, fallbackIndex = 0) {
  return (
    cleanText(lesson?.topic || lesson?.title || '', 120)
      .replace(/^lesson\s+\d+\s*[:.–—-]\s*/i, '')
      .replace(/^\d+(?:\.\d+)?\s*[:.–—-]\s*/i, '')
      .trim() || `Lesson ${fallbackIndex + 1}`
  );
}

function repairedGenericAssessmentTitle(assessment = {}, lesson = {}, fallbackIndex = 0, courseName = '') {
  const title = cleanText(assessment?.title || assessment?.name || `Assessment ${fallbackIndex + 1}`, 160);
  if (!isGenericAssessmentScaffold(title)) return title || 'Lesson assessment';

  const focus = assessmentFocusLabel(lesson, fallbackIndex);
  const variantIndex = assessmentVariantIndex(assessment, lesson, fallbackIndex);
  const isPythonCourse = /\b(?:computer science|python|programming|coding|software)\b/i.test(`${courseName} ${focus}`);
  const variants = isPythonCourse
    ? [
        `Code trace: predict the ${focus} output and explain why.`,
        `Debug note: identify one ${focus} error and the correction.`,
        `Mini program: write a ${focus} example with expected input and output.`,
        `Peer review: annotate a ${focus} solution for accuracy and style.`,
        `Transfer check: choose when ${focus} fits a program requirement.`,
      ]
    : [
        `Application note: connect ${focus} to one observed decision.`,
        `Source-use check: cite a ${focus} detail and explain its consequence.`,
        `Short response: compare two possible choices for ${focus}.`,
        `Peer critique: identify the strongest ${focus} evidence in a class artifact.`,
        `Transfer task: adapt ${focus} to a new case and name the limitation.`,
      ];
  return variants[variantIndex % variants.length];
}

function buildAssessmentCell(assessment, { lesson = {}, fallbackIndex = 0, courseName = '' } = {}) {
  const title = repairedGenericAssessmentTitle(assessment, lesson, fallbackIndex, courseName);
  const prompt = cleanText(assessment.prompt, 320);
  if (prompt && !isGenericAssessmentScaffold(prompt)) return `${title}: ${prompt}`;
  return title;
}

const GENERIC_PUBLICATION_CONSTRAINT_PATTERN =
  /\bconfirm local timing, modality, accessibility, source permissions, and grading policy before publishing\b/i;

function lessonFocusLabel(lesson, fallbackIndex = 0) {
  return (
    cleanText(lesson?.title || lesson?.topic || '')
      .replace(/^lesson\s+\d+\s*[:.–—-]\s*/i, '')
      .trim() || `Lesson ${fallbackIndex + 1}`
  );
}

function lessonConstraintVariant(lesson, fallbackIndex = 0, variants = []) {
  if (!variants.length) return '';
  const rawNumber = Number(lesson?.lessonNumber || String(lesson?.id || '').match(/\d+/)?.[0] || fallbackIndex + 1);
  const index = Number.isFinite(rawNumber) && rawNumber > 0 ? rawNumber - 1 : fallbackIndex;
  return variants[index % variants.length];
}

function formatConstraintTextForLesson(constraint = {}, lesson = {}, fallbackIndex = 0) {
  const text = cleanText(constraint.text || constraint);
  if (!GENERIC_PUBLICATION_CONSTRAINT_PATTERN.test(text)) return text;
  const focus = lessonFocusLabel(lesson, fallbackIndex);
  return lessonConstraintVariant(lesson, fallbackIndex, [
    `Review ${focus} for local schedule, modality, accessibility needs, source permissions, and grading policy before publishing.`,
    `Before publishing ${focus}, verify timing, delivery mode, accommodations, source permissions, and grading rules.`,
    `Check ${focus} against local timing, delivery format, accessibility requirements, source permissions, and grading policy before release.`,
    `Confirm ${focus} fits the local schedule, modality, accessibility needs, source permissions, and grading rules before students see it.`,
  ]);
}

function formatConstraintResourceForLesson(constraint = {}, lesson = {}, fallbackIndex = 0) {
  const text = formatConstraintTextForLesson(constraint, lesson, fallbackIndex);
  return text ? `Constraint: ${text}` : '';
}

function lessonActivitiesFromIR(lesson, concepts, constraints = [], fallbackIndex = 0) {
  const terms = concepts.map((concept) => concept.term).filter(Boolean);
  const misconception = lesson.misconceptions[0] || concepts.flatMap((concept) => concept.misconceptions || [])[0];
  const workedExample = lesson.workedExamples[0];
  const derivedAsyncActivities = [
    ...lesson.prerequisiteChecks.map((check) => `Read and annotate prerequisite check: ${check}`),
    ...lesson.prerequisiteConceptIds.map((id) => `Preview prerequisite concept ${id}`),
    ...lesson.practiceItems.slice(0, 2).map((item) => `Prepare practice response: ${item}`),
    terms.length > 0 ? `Preview key terms: ${terms.slice(0, 4).join(', ')}` : '',
  ];
  const derivedSyncActivities = [
    workedExample ? `Work through ${workedExample.skill || workedExample.setup} with visible solution steps` : '',
    misconception?.claim ? `Misconception check: ${misconception.claim}` : '',
    ...constraints
      .slice(0, 2)
      .map((constraint) => `Constraint check: ${formatConstraintTextForLesson(constraint, lesson, fallbackIndex)}`),
    ...lesson.practiceItems.slice(2, 4).map((item) => `Peer practice: ${item}`),
  ];
  const explicitAsyncActivities = lesson.activities
    .filter((activity) => activity.mode === 'async' || activity.mode === 'assessment-prep')
    .map(formatActivityLine);
  const explicitSyncActivities = lesson.activities
    .filter((activity) => activity.mode === 'sync' || activity.mode === 'practice')
    .map(formatActivityLine);
  const unassignedActivities = lesson.activities
    .filter(
      (activity) =>
        !explicitAsyncActivities.includes(formatActivityLine(activity)) &&
        !explicitSyncActivities.includes(formatActivityLine(activity)),
    )
    .map(formatActivityLine);
  return {
    asyncActivities: uniqueStrings(
      [...explicitAsyncActivities, ...unassignedActivities.slice(0, 1), ...derivedAsyncActivities],
      4,
    ),
    syncActivities: uniqueStrings(
      [...explicitSyncActivities, ...unassignedActivities.slice(1), ...derivedSyncActivities],
      4,
    ),
  };
}

export function courseIRToCourseMap(rawIR = {}) {
  const ir = normalizeCourseIR(rawIR);
  const concepts = conceptByIdMap(ir);
  const assessmentsByLessonId = assessmentByLessonIdMap(ir);
  return {
    courseName: ir.course.title,
    ...(ir.course.duration ? { semester: ir.course.duration } : {}),
    ...(ir.course.sourceProvenance ? { courseDescription: ir.course.sourceProvenance } : {}),
    lessons: ir.lessons.map((lesson, index) => {
      const linkedConcepts = lesson.conceptIds.map((id) => concepts.get(id)).filter(Boolean);
      const assessments = [
        ...assessmentsByLessonId.get(lesson.id),
        ...lesson.assessmentIds.map((id) => ir.assessments.find((assessment) => assessment.id === id)).filter(Boolean),
      ];
      const anchors = [...lesson.factualAnchors, ...linkedConcepts.flatMap((concept) => concept.factualAnchors)];
      const constraints = constraintsForLesson(ir, lesson);
      const prerequisiteTerms = lesson.prerequisiteConceptIds.map((id) => concepts.get(id)?.term || id).filter(Boolean);
      const { asyncActivities, syncActivities } = lessonActivitiesFromIR(lesson, linkedConcepts, constraints, index);
      const learningObjectives = uniqueStrings(
        [...lesson.outcomes.map((outcome) => outcome.statement), ...lesson.objectives],
        8,
      );
      return {
        title: lesson.title || `Lesson ${index + 1}: ${lesson.topic}`,
        sections: [
          {
            topicSection: uniqueStrings([lesson.topic, ...linkedConcepts.map((concept) => concept.term)], 6).join('; '),
            learningGoals: uniqueStrings(
              [
                `Use ${lesson.topic} to make course-relevant decisions.`,
                linkedConcepts[0]?.definition ? `Connect ${linkedConcepts[0].term} to evidence and practice.` : '',
              ],
              3,
            ).join('; '),
            learningObjectives: learningObjectives.join('; '),
            weeklyAssessments: uniqueStrings(
              assessments.map((assessment) =>
                buildAssessmentCell(assessment, {
                  lesson,
                  fallbackIndex: index,
                  courseName: ir.course.title,
                }),
              ),
              5,
            ).join('; '),
            asyncActivities: asyncActivities.join('; '),
            syncActivities: syncActivities.join('; '),
            supportingResources: uniqueStrings(
              [
                ...sourceLabelsForRefs(ir, sourceRefsForLesson(ir, lesson, assessments)),
                ...prerequisiteTerms.map((term) => `Prerequisite concept: ${term}`),
                ...constraints.map((constraint) => formatConstraintResourceForLesson(constraint, lesson, index)),
                ...anchors.map((anchor) => anchor.claim),
                ...lesson.workedExamples.map((example) => example.setup),
                ...ir.handoffNotes
                  .filter((note) => note.scope === lesson.id)
                  .map((note) => `Instructor review: ${note.note}`),
              ],
              6,
            ).join('; '),
          },
        ],
      };
    }),
  };
}

function buildDefaultQuizItem({ term, definition, misconception, correction }) {
  const correct = correction || definition;
  if (!term || !correct || !misconception) return null;
  return {
    question: `Which statement best corrects a common misconception about ${term}?`,
    options: [
      correct,
      misconception,
      `${term} is only a vocabulary label and does not affect practice decisions.`,
      `${term} should be applied before checking the lesson evidence.`,
    ],
    answerIndex: 0,
    explanation: correct,
  };
}

function lessonKernelFromIR(ir, lesson, fallbackIndex = 0) {
  const concepts = conceptByIdMap(ir);
  const linkedConcepts = lesson.conceptIds.map((id) => concepts.get(id)).filter(Boolean);
  const prerequisiteTerms = lesson.prerequisiteConceptIds.map((id) => concepts.get(id)?.term || id).filter(Boolean);
  const constraints = constraintsForLesson(ir, lesson);
  const conceptFacts = linkedConcepts.flatMap((concept) => concept.factualAnchors.map((anchor) => anchor.claim));
  const facts = uniqueStrings(
    [
      ...lesson.factualAnchors.map((anchor) => anchor.claim),
      ...conceptFacts,
      ...constraints.map((constraint) => formatConstraintResourceForLesson(constraint, lesson, fallbackIndex)),
    ],
    8,
  );
  const lessonMisconception =
    lesson.misconceptions[0] || linkedConcepts.flatMap((concept) => concept.misconceptions)[0] || null;
  const keyTerms = linkedConcepts
    .flatMap((concept) => {
      if (concept.vocabulary.length > 0) return concept.vocabulary;
      return [
        {
          term: concept.term,
          definition: concept.definition || facts[0] || `${concept.term} is a key course concept.`,
          example: facts[1] || lesson.workedExamples[0]?.setup || lesson.topic,
          misconception: concept.misconceptions[0]?.claim || lessonMisconception?.claim || '',
          correction:
            concept.misconceptions[0]?.correction ||
            lessonMisconception?.correction ||
            concept.definition ||
            facts[0] ||
            '',
        },
      ];
    })
    .filter((term) => term.term && term.definition)
    .slice(0, 6);
  const generatedMc = keyTerms
    .map((term) =>
      buildDefaultQuizItem({
        term: term.term,
        definition: term.definition,
        misconception: term.misconception,
        correction: term.correction,
      }),
    )
    .filter(Boolean);
  const assessment = (ir.assessments || []).find((entry) => entry.lessonIds.includes(lesson.id));
  const activityLines = lesson.activities.map(formatActivityLine).filter(Boolean);
  const outcomeStatements = lesson.outcomes.map((outcome) => outcome.statement).filter(Boolean);
  const rubricLines = (assessment?.rubricCriteria || []).map(formatRubricCriterion).filter(Boolean);
  const workedExample = lesson.workedExamples[0]
    ? {
        problem: lesson.workedExamples[0].setup,
        steps: lesson.workedExamples[0].solutionSteps,
        result: lesson.workedExamples[0].result,
      }
    : null;
  return {
    facts,
    keyTerms,
    scenario: {
      setup:
        facts[0] ||
        `Students apply ${lesson.topic} to a realistic course task and explain the evidence behind their decision.`,
      materials: uniqueStrings(
        [
          assessment?.title,
          lesson.workedExamples[0]?.setup,
          ...activityLines,
          ...lesson.practiceItems,
          ...prerequisiteTerms.map((term) => `prerequisite: ${term}`),
          ...constraints.map(
            (constraint) => `constraint: ${formatConstraintTextForLesson(constraint, lesson, fallbackIndex)}`,
          ),
        ],
        5,
      ).join('; '),
    },
    discussionPrompt: {
      prompt: lessonMisconception?.claim
        ? `Where might ${lessonMisconception.claim.toLowerCase()} appear in student work, and how should it be corrected?`
        : `Which evidence would convince you that ${lesson.topic} has been understood well enough to transfer?`,
      tension:
        lessonMisconception?.correction ||
        `Balance procedural fluency with evidence-based explanation for ${lesson.topic}.`,
      positions: uniqueStrings([lessonMisconception?.claim, lessonMisconception?.correction, facts[0]], 3),
    },
    assignmentCore: {
      taskDescription:
        assessment?.prompt || assessment?.title || `Apply ${lesson.topic} to a concrete course artifact.`,
      parameters: uniqueStrings(
        [
          ...(assessment?.rubricDimensions || []),
          ...rubricLines,
          ...outcomeStatements,
          ...lesson.objectives,
          ...constraints.map((entry) => formatConstraintTextForLesson(entry, lesson, fallbackIndex)),
          ...activityLines,
        ],
        12,
      ),
    },
    mc: [...lesson.quizItems, ...generatedMc].slice(0, 8),
    ...(workedExample ? { workedExample } : {}),
  };
}

export function courseIRToEnrichmentOverlay(rawIR = {}) {
  const ir = normalizeCourseIR(rawIR);
  const lessonContent = {};
  const itemPlan = buildQuizItemPlan(6);
  for (const [index, lesson] of ir.lessons.entries()) {
    const kernel = lessonKernelFromIR(ir, lesson, index);
    const payload = projectKernelToSurfaces(kernel, { itemPlan });
    payload.courseIR = {
      version: COURSE_IR_VERSION,
      lessonId: lesson.id,
      lessonNumber: index + 1,
      conceptIds: lesson.conceptIds,
      assessmentIds: lesson.assessmentIds,
    };
    lessonContent[`lesson-${index + 1}`] = payload;
  }
  return {
    source: 'courseir-v1',
    signatureTerms: uniqueStrings(
      ir.concepts.map((concept) => concept.term),
      12,
    ),
    lens: {
      domain: ir.course.discipline || ir.course.title,
      evidenceNoun: 'evidence',
      decisionNoun: 'instructional decision',
      learnerRole: ir.course.audience || 'student',
      exampleNoun: 'worked example',
    },
    styleNotes: ['Compile from CourseIR semantic atoms; do not invent untracked factual claims.'],
    lessonContent,
    quality: {
      status: 'accepted',
      source: 'courseir-v1',
      sourceGroundingSignalCount: validateCourseIR(ir).stats.factualAnchors,
    },
  };
}

export function courseIRToCourseGraph(rawIR = {}) {
  const ir = normalizeCourseIR(rawIR);
  const courseMap = courseIRToCourseMap(ir);
  const enrichmentOverlay = courseIRToEnrichmentOverlay(ir);
  const graph = deriveCourseGraphFromCourseMap(courseMap, { enrichmentOverlay });
  attachEnrichmentToGraph(graph, enrichmentOverlay);
  graph.authoredBy = 'courseir-v1';
  graph.courseIR = {
    version: COURSE_IR_VERSION,
    lessonIds: ir.lessons.map((lesson) => lesson.id),
    conceptIds: ir.concepts.map((concept) => concept.id),
    assessmentIds: ir.assessments.map((assessment) => assessment.id),
    sourceLedger: ir.sourceLedger,
    sourceRefCoverage: buildCourseIRSourceRefCoverage(ir),
  };
  return { ir, courseMap, graph, enrichmentOverlay };
}

export function buildCourseIRPipelineState(validation, extra = {}) {
  const coverageLessons = validation?.coverage?.lessons || [];
  const completeLessons = coverageLessons.filter((lesson) => lesson.complete);
  return {
    courseIR: {
      version: COURSE_IR_VERSION,
      valid: Boolean(validation?.valid),
      stats: validation?.stats || null,
      coverageStats: {
        lessonsComplete: completeLessons.length,
        lessonsTotal: coverageLessons.length,
        incompleteLessonIds: coverageLessons.filter((lesson) => !lesson.complete).map((lesson) => lesson.lessonId),
      },
      issueCounts: {
        blockers: (validation?.issues || []).filter((entry) => entry.severity === 'blocker').length,
        warnings: (validation?.issues || []).filter((entry) => entry.severity === 'warning').length,
      },
      repairPaths: validation?.repairPaths || [],
      coverage: validation?.coverage || null,
      sourceRefCoverage: validation?.ir ? buildCourseIRSourceRefCoverage(validation.ir) : null,
      ...extra,
    },
  };
}

export function compileCourseIR(rawIR = {}, { featureIds, configMap = {}, allowInvalid = false } = {}) {
  const initialValidation = validateCourseIR(rawIR);
  const repair = repairCourseIRStructure(initialValidation.ir);
  const validation = repair.changed ? validateCourseIR(repair.ir) : initialValidation;
  if (!validation.valid && !allowInvalid) {
    throw new CourseIRValidationError(validation.issues);
  }
  const { ir, courseMap, graph, enrichmentOverlay } = courseIRToCourseGraph(validation.ir);
  const graphValidation = validateCourseGraph(graph);
  if (!graphValidation.valid && !allowInvalid) {
    throw new CourseIRValidationError(
      graphValidation.issues.map((entry) => issue('blocker', `graph-${entry.code}`, 'courseGraph', entry.message)),
    );
  }
  const compiledFeatureIds = getBlueprintCompiledFeatures(
    Array.isArray(featureIds) && featureIds.length > 0 ? featureIds : KNOWN_FEATURE_IDS,
  );
  const blueprint = compactBlueprintForStorage(buildBlueprintFromGraph(graph, { enrichment: enrichmentOverlay }));
  const deliverables = compileBlueprintDeliverables(blueprint, compiledFeatureIds, { configMap });
  const pipelineState = buildCourseIRPipelineState(validation, {
    compiledFeatureIds,
    graphValid: graphValidation.valid,
    deterministicCompile: true,
    providerCallsDuringCompile: 0,
    repairedBeforeCompile: repair.changed,
    repairs: repair.repairs,
    initialIssueCodes: repair.changed ? initialValidation.issues.map((entry) => entry.code) : [],
  });
  return {
    ir,
    courseMap,
    graph,
    blueprint,
    deliverables,
    compiledFeatureIds,
    enrichmentOverlay,
    courseIRValidation: validation,
    courseIRProof: pipelineState.courseIR,
    pipelineState,
  };
}

export function buildCourseIRFromCourseMap(courseMap = {}) {
  const lessons = asArray(courseMap.lessons).map((lesson, index) => {
    const section = asArray(lesson.sections)[0] || {};
    const conceptId = `C${index + 1}`;
    const assessmentId = `A${index + 1}`;
    const objectives = uniqueStrings(String(section.learningObjectives || '').split(/;|\n/), 6);
    const topic = cleanText(section.topicSection || lesson.title || `Lesson ${index + 1}`, 160);
    const asyncActivities = uniqueStrings(String(section.asyncActivities || '').split(/;|\n/), 4);
    const syncActivities = uniqueStrings(String(section.syncActivities || '').split(/;|\n/), 4);
    return {
      id: `L${index + 1}`,
      title: cleanText(lesson.title || `Lesson ${index + 1}`, 180),
      topic,
      conceptIds: [conceptId],
      prerequisiteConceptIds: index > 0 ? [`C${index}`] : [],
      objectives,
      outcomes: objectives.map((statement, outcomeIndex) => ({
        id: `L${index + 1}-O${outcomeIndex + 1}`,
        statement,
        performanceVerb: statement.split(/\s+/)[0] || 'Apply',
        conceptIds: [conceptId],
        assessmentIds: [assessmentId],
        sourceRefs: ['SL1'],
      })),
      activities: [
        ...asyncActivities.map((learnerAction, activityIndex) => ({
          id: `L${index + 1}-ACT${activityIndex + 1}`,
          mode: 'async',
          title: learnerAction.split(/[:;.]/)[0] || `Prepare ${topic}`,
          learnerAction,
          evidence: `Preparation notes for ${assessmentId}.`,
          conceptIds: [conceptId],
          assessmentIds: [assessmentId],
          sourceRefs: ['SL1'],
        })),
        ...syncActivities.map((learnerAction, activityIndex) => ({
          id: `L${index + 1}-ACT${asyncActivities.length + activityIndex + 1}`,
          mode: 'sync',
          title: learnerAction.split(/[:;.]/)[0] || `Practice ${topic}`,
          learnerAction,
          evidence: `Class artifact or explanation for ${assessmentId}.`,
          conceptIds: [conceptId],
          assessmentIds: [assessmentId],
          sourceRefs: ['SL1'],
        })),
      ],
      prerequisiteChecks:
        index > 0
          ? [
              `Confirm students can use ${cleanText(asArray(courseMap.lessons?.[index - 1]?.sections)[0]?.topicSection || courseMap.lessons?.[index - 1]?.title || `Lesson ${index}`, 120)} before ${cleanText(section.topicSection || lesson.title || `Lesson ${index + 1}`, 120)}.`,
            ]
          : [],
      constraints: [
        {
          id: `K-L${index + 1}`,
          scope: `L${index + 1}`,
          text: `Keep ${cleanText(section.topicSection || lesson.title || `Lesson ${index + 1}`, 120)} aligned to its assessment, activity, and available course time.`,
          severity: 'requirement',
          sourceRefs: ['SL1'],
        },
      ],
      factualAnchors: uniqueStrings(
        String(section.supportingResources || section.learningGoals || '').split(/;|\n/),
        4,
      ).map((claim) => ({ claim, status: 'source-provided', sourceRefs: ['SL1'], risk: 'low' })),
      workedExamples: [
        {
          id: `L${index + 1}-E1`,
          skill: `Apply ${cleanText(section.topicSection || lesson.title || 'lesson concept', 100)}`,
          setup: cleanText(section.syncActivities || section.asyncActivities || section.topicSection, 240),
          solutionSteps: uniqueStrings(
            String(section.syncActivities || section.asyncActivities || '').split(/;|\n/),
            4,
          ),
          result: cleanText(section.weeklyAssessments || 'Completed evidence-based response.', 160),
          sourceRefs: ['SL1'],
        },
      ].filter((entry) => entry.setup),
      misconceptions: [
        {
          claim: `Students may treat ${cleanText(section.topicSection || lesson.title || 'the topic', 100)} as a label instead of evidence for a decision.`,
          correction: `Require students to connect ${cleanText(section.topicSection || lesson.title || 'the topic', 100)} to observable evidence and feedback.`,
        },
      ],
      practiceItems: uniqueStrings(String(section.asyncActivities || section.syncActivities || '').split(/;|\n/), 6),
      assessmentIds: [assessmentId],
    };
  });
  return normalizeCourseIR({
    version: COURSE_IR_VERSION,
    course: {
      title: cleanText(courseMap.courseName || 'Untitled Course', 180),
      duration: cleanText(courseMap.semester || '', 80),
      sourceProvenance: 'Normalized from existing CourseMapper course map.',
    },
    sourceLedger: [{ id: 'SL1', scope: 'course', status: 'source-provided', evidence: 'Existing course map fields.' }],
    constraints: [
      {
        id: 'K1',
        scope: 'course',
        text: 'Confirm local timing, modality, accessibility, source permissions, and grading policy before publishing.',
        severity: 'review',
      },
    ],
    concepts: lessons.map((lesson, index) => ({
      id: `C${index + 1}`,
      term: lesson.topic,
      definition: lesson.objectives[0] || `Core concept for ${lesson.topic}.`,
      prerequisiteIds: index > 0 ? [`C${index}`] : [],
      factualAnchors: lesson.factualAnchors,
      misconceptions: lesson.misconceptions,
    })),
    lessons,
    assessments: lessons.map((lesson, index) => {
      const rawAssessmentTitle = cleanText(
        asArray(courseMap.lessons?.[index]?.sections)[0]?.weeklyAssessments || `${lesson.topic} check`,
        160,
      );
      const repairedAssessmentTitle = repairedGenericAssessmentTitle(
        { id: `A${index + 1}`, title: rawAssessmentTitle },
        lesson,
        index,
        courseMap.courseName,
      );
      return {
        id: `A${index + 1}`,
        title: repairedAssessmentTitle,
        kind: 'graded-artifact',
        lessonIds: [lesson.id],
        coverageConceptIds: lesson.conceptIds,
        prompt: isGenericAssessmentScaffold(rawAssessmentTitle) ? repairedAssessmentTitle : rawAssessmentTitle,
        rubricDimensions: ['accuracy', 'evidence use', 'transfer'],
        sourceRefs: ['SL1'],
        rubricCriteria: DEFAULT_RUBRIC_DIMENSIONS.map((dimension, criterionIndex) => ({
          id: `A${index + 1}-R${criterionIndex + 1}`,
          label: dimension,
          description: `Evaluate ${dimension} in ${lesson.topic}.`,
          conceptIds: lesson.conceptIds,
          outcomeIds: lesson.outcomes.map((outcome) => outcome.id),
          performanceLevels: repairedRubricLevels(dimension),
          sourceRefs: ['SL1'],
        })),
        provenance: 'course-map',
      };
    }),
    artifactIntents: KNOWN_FEATURE_IDS.map((featureId, index) => ({
      id: `AI${index + 1}`,
      featureId,
      lessonIds: lessons.map((lesson) => lesson.id),
      requiredRefs: lessons.flatMap((lesson) => [lesson.id, ...lesson.conceptIds, ...lesson.assessmentIds]),
    })),
    handoffNotes: [],
    qualityHints: ['Compiled from normalized course-map CourseIR; review thin source fields before publishing.'],
  });
}

export function buildCourseIRPromptPayload({
  courseMap,
  sourceText = '',
  selectedFeatureIds = KNOWN_FEATURE_IDS,
  expectedLessons = null,
  sourceTextCharLimit = 24000,
} = {}) {
  return {
    task: 'courseir-v1',
    instruction:
      'Return compact CourseIR JSON only. Write semantic atoms, not final deliverable prose. Preserve source facts, mark assumptions, and link every lesson to concepts, prerequisite concepts, constraints, outcomes, worked examples, activities, assessments, rubric criteria, and source ledger rows. SourceLedger rows should include title, authors, URL or DOI, license, provider, conceptLinks, and checkedAt when known. Each lesson needs outcomes[] objects and activities[] objects; activities must name learnerAction, evidence, mode, conceptIds, assessmentIds, and sourceRefs. Each worked example and assessment also needs sourceRefs. Each assessment needs rubricCriteria[] objects with label, description, conceptIds, outcomeIds, performanceLevels, and sourceRefs.',
    selectedFeatureIds,
    sourcePacket: {
      courseName: courseMap?.courseName || '',
      lessons: asArray(courseMap?.lessons).map((lesson, index) => ({
        id: `L${index + 1}`,
        title: cleanText(lesson?.title, 180),
        sections: asArray(lesson?.sections).map((section) => ({
          topic: cleanText(section?.topicSection, 180),
          objectives: cleanText(section?.learningObjectives, 600),
          assessments: cleanText(section?.weeklyAssessments, 600),
          resources: cleanText(section?.supportingResources, 600),
          asyncActivities: cleanText(section?.asyncActivities, 600),
          syncActivities: cleanText(section?.syncActivities, 600),
        })),
      })),
      sourceText: cleanText(sourceText, sourceTextCharLimit),
      expectedLessons: Number.isInteger(expectedLessons) && expectedLessons > 0 ? expectedLessons : null,
    },
    outputContract: COURSE_IR_RESPONSE_SCHEMA,
  };
}

export function planCourseIRGeneration({
  courseMap,
  sourceText = '',
  modelId = '',
  maxOutputTokens,
  generationPlan,
  modelCapabilities,
  expectedLessons,
  expectedOutputTokensPerLesson = 1400,
  globalOutputTokens = 2400,
  inputReserveTokens = 20000,
  outputReserveTokens = 8192,
  minReliableOutputTokens = 12000,
} = {}) {
  const lessonCount = Math.max(
    0,
    Number(expectedLessons) || (Array.isArray(courseMap?.lessons) ? courseMap.lessons.length : 0),
  );
  const payload = buildCourseIRPromptPayload({ courseMap, sourceText, expectedLessons: lessonCount || null });
  const estimatedInputTokens = estimateTokens(JSON.stringify(payload.sourcePacket));
  const contextLimit =
    modelCapabilities?.limits?.contextWindow || modelCapabilities?.contextWindow || getModelLimit(modelId);
  const providerMaxOutputTokens = resolveProviderMaxOutputTokens({
    maxOutputTokens,
    generationPlan,
    modelCapabilities,
  });
  const outputLimit = providerMaxOutputTokens || modelCapabilities?.maxOutputTokens || 4096;
  const requiredOutputTokens = globalOutputTokens + lessonCount * expectedOutputTokensPerLesson;
  const availableInputTokens = Math.max(0, contextLimit - inputReserveTokens);
  const usableOutputTokens = Math.max(0, outputLimit - outputReserveTokens);
  const inputFits = estimatedInputTokens <= availableInputTokens;
  const wholeCourseFits =
    inputFits && outputLimit >= minReliableOutputTokens && requiredOutputTokens <= usableOutputTokens;
  const lessonsPerBlock =
    usableOutputTokens > 0
      ? Math.max(1, Math.floor((usableOutputTokens - globalOutputTokens) / expectedOutputTokensPerLesson))
      : 0;

  let strategy = 'fallback-current';
  let plannedCalls = 0;
  let blockSize = 0;
  if (wholeCourseFits) {
    strategy = 'whole-course-ir';
    plannedCalls = lessonCount > 0 ? 1 : 0;
    blockSize = lessonCount;
  } else if (inputFits && lessonsPerBlock >= 1) {
    strategy = lessonCount > lessonsPerBlock ? 'global-then-lesson-blocks' : 'lesson-blocks';
    blockSize = Math.min(lessonCount, lessonsPerBlock);
    plannedCalls =
      lessonCount > 0 ? (strategy === 'global-then-lesson-blocks' ? 1 : 0) + Math.ceil(lessonCount / blockSize) : 0;
  }

  return {
    strategy,
    lessonCount,
    plannedCalls,
    blockSize,
    estimatedInputTokens,
    requiredOutputTokens,
    contextLimit,
    outputLimit,
    usableOutputTokens,
    inputFits,
    wholeCourseFits,
    reserves: { inputReserveTokens, outputReserveTokens },
  };
}

export function assessCourseIRDirectAuthoring(validation, { expectedLessons = null, repair = null } = {}) {
  const lessonCount = validation?.stats?.lessons || 0;
  const assessmentCount = validation?.stats?.assessments || 0;
  const completeLessons = (validation?.coverage?.lessons || []).filter((lesson) => lesson.complete).length;
  const expected = Number.isInteger(expectedLessons) && expectedLessons > 0 ? expectedLessons : 0;
  const blockers = [];
  if (repair?.changed) {
    const repairCodes = (repair.repairs || []).map((entry) => entry.code).filter(Boolean);
    blockers.push(`repaired-structure${repairCodes.length ? ` ${repairCodes.join(',')}` : ''}`);
  }
  if (!validation?.valid) blockers.push('validation-blockers');
  if (expected > 0 && lessonCount < expected) blockers.push(`lesson-count ${lessonCount}/${expected}`);
  if (lessonCount === 0) blockers.push('no-lessons');
  if (completeLessons < lessonCount) blockers.push(`coverage ${completeLessons}/${lessonCount}`);
  if (assessmentCount < lessonCount) blockers.push('under-assessed');
  if ((validation?.stats?.outcomes || 0) < lessonCount) blockers.push('thin-outcomes');
  if ((validation?.stats?.activities || 0) < lessonCount * 2) blockers.push('thin-activities');
  if ((validation?.stats?.rubricCriteria || 0) < assessmentCount * 2) blockers.push('thin-rubrics');
  if ((validation?.stats?.rubricCriteriaWithLevels || 0) < (validation?.stats?.rubricCriteria || 0)) {
    blockers.push('thin-rubric-levels');
  }
  if ((validation?.stats?.rubricOutcomeLinks || 0) < (validation?.stats?.rubricCriteria || 0)) {
    blockers.push('unlinked-rubrics');
  }
  if ((validation?.stats?.sourceLinkedOutcomes || 0) < (validation?.stats?.outcomes || 0)) {
    blockers.push('unlinked-outcome-sources');
  }
  if ((validation?.stats?.sourceLinkedActivities || 0) < (validation?.stats?.activities || 0)) {
    blockers.push('unlinked-activity-sources');
  }
  if ((validation?.stats?.sourceLinkedRubricCriteria || 0) < (validation?.stats?.rubricCriteria || 0)) {
    blockers.push('unlinked-rubric-sources');
  }
  if ((validation?.stats?.sourceLinkedWorkedExamples || 0) < (validation?.stats?.workedExamples || 0)) {
    blockers.push('unlinked-example-sources');
  }
  if ((validation?.stats?.sourceLinkedAssessments || 0) < (validation?.stats?.assessments || 0)) {
    blockers.push('unlinked-assessment-sources');
  }
  if ((validation?.stats?.factualAnchors || 0) < lessonCount) blockers.push('thin-facts');
  if ((validation?.stats?.workedExamples || 0) < lessonCount) blockers.push('thin-examples');
  if ((validation?.stats?.misconceptionCorrectives || 0) < lessonCount) blockers.push('thin-misconceptions');
  if ((validation?.stats?.constraints || 0) < lessonCount + 1) blockers.push('thin-constraints');
  return {
    accepted: blockers.length === 0,
    reason: blockers.length === 0 ? 'accepted' : blockers.join('; '),
    lessonCount,
    completeLessons,
    repairedBeforeAcceptance: Boolean(repair?.changed),
  };
}

export function parseCourseIRResponse(text, { expectedLessons = null } = {}) {
  const parsed = extractJsonObject(text);
  if (!parsed) {
    throw new CourseIRValidationError([
      issue('blocker', 'courseir-unparseable', 'response', 'Provider returned no parseable CourseIR JSON object.'),
    ]);
  }
  const initialValidation = validateCourseIR(parsed);
  const repair = repairCourseIRStructure(initialValidation.ir);
  const validation = repair.changed ? validateCourseIR(repair.ir) : initialValidation;
  if (!validation.valid) throw new CourseIRValidationError(validation.issues);
  return {
    ir: validation.ir,
    validation,
    repair,
    acceptance: assessCourseIRDirectAuthoring(validation, { expectedLessons, repair }),
  };
}

let stashedCourseIR = null;

export function stashCourseIR(courseIR) {
  stashedCourseIR = courseIR || null;
}

export function takeCourseIR(courseMap) {
  const courseIR = stashedCourseIR;
  stashedCourseIR = null;
  if (!courseIR) return null;
  const ir = normalizeCourseIR(courseIR);
  if (
    cleanText(courseMap?.courseName).toLowerCase() !== cleanText(ir.course?.title).toLowerCase() ||
    (courseMap?.lessons || []).length !== ir.lessons.length
  ) {
    return null;
  }
  return ir;
}

export const COURSE_IR_RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'version',
    'course',
    'sourceLedger',
    'constraints',
    'concepts',
    'lessons',
    'assessments',
    'artifactIntents',
  ],
  properties: {
    version: { type: 'string', enum: [COURSE_IR_VERSION] },
    course: {
      type: 'object',
      additionalProperties: true,
      required: ['title'],
      properties: {
        title: { type: 'string' },
        discipline: { type: 'string' },
        level: { type: 'string' },
        modality: { type: 'string' },
        duration: { type: 'string' },
        audience: { type: 'string' },
        sourceProvenance: { type: 'string' },
      },
    },
    sourceLedger: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: true,
        required: ['id', 'scope', 'status', 'evidence'],
        properties: {
          id: { type: 'string' },
          scope: { type: 'string' },
          status: { type: 'string' },
          evidence: { type: 'string' },
          title: { type: 'string' },
          authors: { type: 'array', items: { type: 'string' } },
          url: { type: 'string' },
          doi: { type: 'string' },
          license: { type: 'string' },
          provider: { type: 'string' },
          conceptLinks: { type: 'array', items: { type: 'object', additionalProperties: true } },
          checkedAt: { type: 'string' },
        },
      },
    },
    constraints: { type: 'array', items: { type: 'object', additionalProperties: true } },
    concepts: { type: 'array', items: { type: 'object', additionalProperties: true } },
    lessons: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: true,
        required: ['id', 'topic', 'conceptIds', 'outcomes', 'activities', 'assessmentIds'],
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          topic: { type: 'string' },
          conceptIds: { type: 'array', items: { type: 'string' } },
          prerequisiteConceptIds: { type: 'array', items: { type: 'string' } },
          objectives: { type: 'array', items: { type: 'string' } },
          outcomes: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: true,
              required: ['statement', 'conceptIds', 'assessmentIds', 'sourceRefs'],
              properties: {
                id: { type: 'string' },
                statement: { type: 'string' },
                performanceVerb: { type: 'string' },
                conceptIds: { type: 'array', items: { type: 'string' } },
                assessmentIds: { type: 'array', items: { type: 'string' } },
                sourceRefs: { type: 'array', items: { type: 'string' } },
              },
            },
          },
          activities: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: true,
              required: ['mode', 'learnerAction', 'evidence', 'conceptIds', 'assessmentIds', 'sourceRefs'],
              properties: {
                id: { type: 'string' },
                mode: { type: 'string', enum: [...VALID_ACTIVITY_MODES] },
                title: { type: 'string' },
                learnerAction: { type: 'string' },
                evidence: { type: 'string' },
                conceptIds: { type: 'array', items: { type: 'string' } },
                assessmentIds: { type: 'array', items: { type: 'string' } },
                sourceRefs: { type: 'array', items: { type: 'string' } },
              },
            },
          },
          workedExamples: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: true,
              required: ['setup', 'sourceRefs'],
              properties: {
                id: { type: 'string' },
                skill: { type: 'string' },
                setup: { type: 'string' },
                solutionSteps: { type: 'array', items: { type: 'string' } },
                result: { type: 'string' },
                sourceRefs: { type: 'array', items: { type: 'string' } },
              },
            },
          },
          assessmentIds: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    assessments: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: true,
        required: ['id', 'title', 'lessonIds', 'coverageConceptIds', 'prompt', 'sourceRefs', 'rubricCriteria'],
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          kind: { type: 'string' },
          lessonIds: { type: 'array', items: { type: 'string' } },
          coverageConceptIds: { type: 'array', items: { type: 'string' } },
          prompt: { type: 'string' },
          sourceRefs: { type: 'array', items: { type: 'string' } },
          rubricCriteria: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: true,
              required: ['label', 'description', 'conceptIds', 'outcomeIds', 'performanceLevels', 'sourceRefs'],
              properties: {
                id: { type: 'string' },
                label: { type: 'string' },
                description: { type: 'string' },
                conceptIds: { type: 'array', items: { type: 'string' } },
                outcomeIds: { type: 'array', items: { type: 'string' } },
                sourceRefs: { type: 'array', items: { type: 'string' } },
                performanceLevels: {
                  type: 'array',
                  items: {
                    type: 'object',
                    additionalProperties: true,
                    required: ['level', 'description'],
                    properties: {
                      level: { type: 'string' },
                      description: { type: 'string' },
                      points: { type: ['number', 'null'] },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    artifactIntents: { type: 'array', items: { type: 'object', additionalProperties: true } },
    handoffNotes: { type: 'array', items: { type: 'object', additionalProperties: true } },
    qualityHints: { type: 'array', items: { type: 'string' } },
  },
};
