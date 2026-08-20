import { cleanText, stripLessonPrefix, unique } from './compilerText.js';
import { lessonRequiresFunctionalVisual } from './briefQualityContract.js';
import { buildFunctionalVisualInstructionalIntent } from './functionalVisualTaskContract.js';
import { buildGeneralEvidenceReasoningIntent } from './generalEvidenceReasoningIntent.js';
import {
  buildInstructionalInstanceContract,
  instanceByLessonId,
  instructionalInstanceContractReceiptMatches,
  instructionalInstanceReceiptMatches,
} from './instructionalInstanceContract.js';
import { operationEvidenceDemandForLesson } from './operationEvidenceContract.js';
import { sha256HexSync } from './sha256Sync.js';
import { createStatisticalInstructionalIntentForOperation } from './statisticalOperationArtifactDetails.js';

export const INSTRUCTIONAL_INTENT_GRAPH_VERSION = 1;

export const INSTRUCTIONAL_ARTIFACT_RESPONSIBILITIES = Object.freeze({
  syllabus: 'State the course promise, progression, workload, assessment role, and publication boundaries.',
  lessonPlans: 'Sequence diagnosis, modeling, guided practice, performance, feedback, revision, and transfer.',
  slideDecks: 'Make the lesson model, worked example, learner action, and evidence checkpoint visible.',
  assignments: 'Elicit the planned learner evidence without introducing a different objective or artifact.',
  rubrics: 'Judge only the success criteria and evidence named in the approved lesson intent.',
  discussions: 'Rehearse the planned reasoning or performance before independent submission.',
  quizBank: 'Diagnose prerequisite, concept, application, and misconception evidence named in the plan.',
  studyGuides: 'Support retrieval and transfer of the approved concepts without adding unsupported claims.',
  courseFaq: 'Clarify expectations, evidence, feedback, support, and local decisions without inventing policy.',
});

const MEASURABLE_VERB_RE =
  /\b(?:adjust|analy[sz]e|annotate|apply|argue|ask|assess|audit|balance|build|calculate|calibrate|choose|classify|communicate|compare|compose|conduct|construct|contrast|converse|create|critique|defend|define|demonstrate|derive|describe|design|develop|diagnose|distinguish|elicit|evaluate|exchange|explain|gather|identify|improve|inspect|integrate|interpret|introduce|justify|label|mark|model|organize|perform|plan|point|predict|prepare|prioritize|produce|pronounce|propose|rank|read|recognize|record|rehearse|respond|revise|solve|speak|synthesize|test|trace|track|translate|use|verify|write)\b/i;

const COMPILER_GENERIC_INTENT_PATTERNS = Object.freeze([
  /^apply\s+the\s+main\s+concepts?\s+from\s+.+?\s+to\s+(?:a|one)\s+course\s+task\s+or\s+example\.?$/i,
  /^use\s+.+?\s+to\s+make\s+course-relevant\s+decisions?\.?$/i,
  /^connect\s+.+?\s+to\s+evidence\s+and\s+practice\.?$/i,
  /^explain\s+.+?\s+using\s+the\s+available\s+course\s+evidence\.?$/i,
  /^apply\s+.+?\s+in\s+one\s+practical\s+example\s+from\s+.+?\s+and\s+justify\s+one\s+revision\.?$/i,
  /^apply\s+.+?\s+to\s+one\s+inspectable\s+course\s+problem\s+and\s+justify\s+the\s+result\s+with\s+evidence\.?$/i,
  /^use\s+.+?\s+to\s+produce\s+and\s+explain\s+the\s+planned\s+lesson\s+evidence\.?$/i,
  /^turn\s+source\s+evidence\s+about\s+.+?\s+into\s+one\s+justified\s+instructional\s+move\.?$/i,
  /^use\s+the\s+assigned\s+source\s+artifact\s+to\s+explain\s+where\s+.+?\s+changes\s+the\s+lesson\s+response\.?$/i,
  /^compare\s+source\s+details\s+about\s+.+?,?\s+then\s+name\s+the\s+decision\s+those\s+details\s+justify\.?$/i,
  /^use\s+source-specific\s+evidence\s+to\s+analy[sz]e\s+.+?\s+and\s+justify\s+the\s+lesson\s+decision\.?$/i,
  /^trace\s+how\s+.+?\s+appears\s+in\s+the\s+source\s+materials\s+and\s+what\s+the\s+instructor\s+should\s+do\s+next\.?$/i,
  /^explain\s+how\s+evidence\s+from\s+the\s+source\s+materials\s+changes\s+the\s+decision\s+about\s+.+?\.?$/i,
  /^cite\s+source\s+details\s+that\s+explain\s+the\s+supported\s+decision\.?$/i,
  /^evaluate\s+(?:[A-Z][\w-]*(?:\s*:\s*)?)(?:\s+[A-Z][\w-]*){0,3}\.?$/,
]);

const statisticalInstructionalIntentForOperation = createStatisticalInstructionalIntentForOperation({
  operationEvidenceDemandForLesson,
});

export function isCompilerGenericInstructionalIntent(value) {
  const text = cleanText(value);
  return Boolean(text && COMPILER_GENERIC_INTENT_PATTERNS.some((pattern) => pattern.test(text)));
}

function values(value) {
  if (Array.isArray(value)) return value.flatMap(values);
  const text = cleanText(value);
  return text ? [text] : [];
}

function items(value) {
  return Array.isArray(value) ? value : value === undefined || value === null ? [] : [value];
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function assessmentForLesson(assessments, lesson, index) {
  const exact = assessments.filter((assessment) =>
    items(assessment?.lessonNumbers).map(Number).includes(lesson.lessonNumber),
  );
  if (exact.length > 0) {
    const selectedArtifact = cleanText(lesson?.studentArtifact).toLowerCase();
    return exact.find((assessment) => cleanText(assessment?.artifact).toLowerCase() === selectedArtifact) || exact[0];
  }
  if (assessments.some((assessment) => cleanText(assessment?.registryId))) return null;
  return assessments[index] || null;
}

function lessonFacts(lesson) {
  return unique(
    [
      ...values(lesson?.enrichment?.kernel?.facts),
      ...values(lesson?.enrichment?.kernel?.canonicalFacts),
      ...items(lesson?.enrichment?.sourceClaims).map((claim) => claim?.text || claim?.claim || claim),
      ...items(lesson?.enrichment?.keyTerms).map((term) =>
        typeof term === 'object' ? [term.term, term.definition].filter(Boolean).join(': ') : term,
      ),
      ...items(lesson?.authenticDataTaskPlan?.examples).map((example) =>
        [
          example?.displayLabel,
          example?.form,
          example?.gloss,
          example?.translation,
          example?.analysisFocus,
          example?.sourceLocator,
        ]
          .filter(Boolean)
          .join(' | '),
      ),
      ...values(lesson?.authenticDataTaskPlan?.answerKey),
    ],
    12,
  );
}

const NON_AUTHORITATIVE_SOURCE_RE =
  /^(?:instructor notes(?: and in-class materials)?|class notes(?: and assigned materials)?|assigned (?:course )?materials?|lesson materials?|course materials?|evidence brief|source packet|instructor source packet|instructor observation packet|instructor revision cases)$/i;

function isKnowledgeSourceIdentity(value) {
  const text = cleanText(value);
  if (!text || NON_AUTHORITATIVE_SOURCE_RE.test(text)) return false;
  if (/\b(?:lesson\s+\d+\s+)?evidence packet\b/i.test(text)) return false;
  if (/\b(?:course-created|classroom practice)\s+(?:case|dataset|packet)\b/i.test(text)) return false;
  // Compiler planning cues name the kind of evidence still needed; they are
  // not themselves sources and must never outrank an admitted source title.
  // Treating them as authority produces learner-facing directions such as
  // "cite Admitted visual specimen" and repeats that fiction across lessons.
  if (
    /^(?:Admitted |Lesson-specific )(?:visual specimen and attribution record(?: for .+)?|.+ source record and verified CourseMapper operation specimen)\.?$/i.test(
      text,
    ) ||
    /\b(?:source|asset) admission required before drafting\b/i.test(text)
  ) {
    return false;
  }
  return true;
}

function sourceIdentities(lesson, { strict = false } = {}) {
  return unique(
    [
      ...values(lesson?.sourceUsePlan?.approvedSources),
      ...values(lesson?.instructorNamedReadings),
      ...values(lesson?.readings),
      // Course-map anchors for titles, objectives, topics, and assessment
      // labels are curriculum signals. They help formulate a research need,
      // but they are never factual authority. Only an explicitly resource-
      // bearing anchor may enter the knowledge-source boundary.
      ...items(lesson?.sourceAnchors)
        .filter(
          (anchor) =>
            typeof anchor === 'object' &&
            /\b(?:resource|reading|assigned[- ]open[- ]source)\b/i.test(`${anchor.field || ''} ${anchor.source || ''}`),
        )
        .map((anchor) => anchor.anchor || ''),
    ].filter((source) => !strict || isKnowledgeSourceIdentity(source)),
    10,
  );
}

function normalizeEvidenceAuthority(authority = null) {
  if (!authority || typeof authority !== 'object') return null;
  const claims = items(authority.claims)
    .map((claim, index) => {
      if (typeof claim === 'string') {
        const text = cleanText(claim);
        return text ? { id: `claim-${index + 1}`, text } : null;
      }
      const text = cleanText(claim?.text || claim?.claim);
      if (!text) return null;
      return {
        id: cleanText(claim?.id, `claim-${index + 1}`),
        candidateId: cleanText(claim?.candidateId),
        queryId: cleanText(claim?.queryId),
        instructionalInstanceId: cleanText(claim?.instructionalInstanceId),
        ...(claim?.queryReceipt ? { queryReceipt: structuredClone(claim.queryReceipt) } : {}),
        ...(claim?.candidateReceipt ? { candidateReceipt: structuredClone(claim.candidateReceipt) } : {}),
        text,
        sourceIds: unique(values(claim?.sourceIds), 8),
        authorityKind: cleanText(claim?.authorityKind || authority?.authorityKind),
      };
    })
    .filter(Boolean);
  const sources = items(authority.sources)
    .map((source, index) => {
      if (typeof source === 'string') {
        const title = cleanText(source);
        return title ? { id: `source-${index + 1}`, title } : null;
      }
      const title = cleanText(source?.title || source?.displayTitle || source?.citation);
      if (!title) return null;
      return {
        id: cleanText(source?.id, `source-${index + 1}`),
        title,
        url: cleanText(source?.url || source?.sourceUrl),
        sourceSnapshotSha256: cleanText(source?.sourceSnapshotSha256),
        authorityKind: cleanText(source?.authorityKind || authority?.authorityKind),
      };
    })
    .filter(Boolean);
  return {
    protocol: cleanText(authority.protocol, 'coursemapper-evidence-authority-v1'),
    lessonId: cleanText(authority.lessonId),
    status: cleanText(authority.status, claims.length > 0 ? 'admitted' : 'needs-evidence'),
    authorityKind: cleanText(authority.authorityKind),
    admissionPolicyVersion: cleanText(authority.admissionPolicyVersion),
    claims,
    sources,
    predecessorAuthorityReceipts: unique(values(authority.predecessorAuthorityReceipts), 24),
    instructionalInstanceId: cleanText(authority.instructionalInstanceId),
    planBodySha256: cleanText(authority.planBodySha256),
    ...(authority.instructionalInstance
      ? { instructionalInstance: structuredClone(authority.instructionalInstance) }
      : {}),
    ...(authority.authenticEvidenceReceipt
      ? { authenticEvidenceReceipt: structuredClone(authority.authenticEvidenceReceipt) }
      : {}),
    receiptSha256: cleanText(authority.receiptSha256),
  };
}

function objectiveForLesson(lesson) {
  const objectives = unique(values(lesson?.outcomes), 4);
  const specificObjectives = objectives.filter((objective) => !isCompilerGenericInstructionalIntent(objective));
  if (specificObjectives.length > 0) return specificObjectives;
  const operationIntent = statisticalInstructionalIntentForOperation(lesson);
  if (operationIntent) return [operationIntent.objective];
  return objectives;
}

function conceptTokens(value) {
  return (
    cleanText(value)
      .toLowerCase()
      .match(/[a-z0-9]+/g)
      ?.filter((token) => !['a', 'an', 'and', 'for', 'in', 'of', 'the', 'to', 'with'].includes(token)) || []
  );
}

function rankConceptsByObjective(concepts, objectives) {
  const objectiveText = cleanText(objectives.join(' ')).toLowerCase();
  const objectiveTokens = new Set(conceptTokens(objectiveText));
  return concepts
    .map((concept, index) => {
      const normalized = cleanText(concept).toLowerCase();
      const tokens = conceptTokens(concept);
      const overlap = tokens.filter((token) => objectiveTokens.has(token)).length;
      return {
        concept,
        index,
        score: (normalized && objectiveText.includes(normalized) ? 100 : 0) + overlap / Math.max(1, tokens.length),
      };
    })
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map((row) => row.concept);
}

function lessonFocusConcepts(lesson, commonConcepts = new Set(), conceptOverrides = []) {
  const titleFocus = stripLessonPrefix(lesson?.title || '');
  const titleIsSpecific =
    titleFocus.split(/\s+/).filter(Boolean).length >= 2 &&
    !/^(?:introduction|overview|orientation|foundations?|fundamentals?|review|conclusion|final project)$/i.test(
      titleFocus,
    );
  const admittedTerms = items(lesson?.enrichment?.keyTerms)
    .filter((term) => typeof term !== 'object' || cleanText(term.definition))
    .map((term) => (typeof term === 'object' ? term.term : term))
    .filter(Boolean);
  // The course-map schema stores many source-authored concept identities in
  // section.topicSection rather than lesson.keyConcepts. Retrieval already
  // searches those stable section labels; the frozen instructional plan must
  // preserve the same labels or the later admission gate compares evidence
  // against a weaker, broad lesson title. Normalize only the numbering prefix
  // and retain the authored wording as curriculum identity, never as factual
  // authority.
  const sectionConcepts = items(lesson?.sections)
    .map((section) => cleanText(section?.topicSection).replace(/^\s*\d+(?:\.\d+)*\s*[:.\-–—]\s*/i, ''))
    .filter(Boolean);
  const currentMapConcepts = unique([...values(lesson?.keyConcepts), ...sectionConcepts], 8);
  const previousFocusConcepts = values(lesson?.instructionalIntent?.focusConcepts);
  const previousPlanConcepts = new Set(previousFocusConcepts.map((concept) => cleanText(concept).toLowerCase()));
  const currentMapConceptKeys = new Set(currentMapConcepts.map((concept) => cleanText(concept).toLowerCase()));
  const previousPrimaryRemoved =
    previousFocusConcepts.length > 0 && !currentMapConceptKeys.has(cleanText(previousFocusConcepts[0]).toLowerCase());
  // A concept introduced after the previous plan receipt represents a fresh
  // instructor/editor decision. Let it lead the next planning pass instead
  // of silently restoring the old plan's primary concept.
  const explicitOverrides = unique(
    values(conceptOverrides).length > 0
      ? values(conceptOverrides)
      : previousPlanConcepts.size
        ? previousPrimaryRemoved
          ? currentMapConcepts
          : currentMapConcepts.filter((concept) => !previousPlanConcepts.has(cleanText(concept).toLowerCase()))
        : [],
    8,
  );
  const mapConcepts = unique([...currentMapConcepts, ...(titleIsSpecific ? [titleFocus] : [])], 8);
  const specificMapConcepts = mapConcepts.filter((concept) => !commonConcepts.has(cleanText(concept).toLowerCase()));
  const rankedMapConcepts = rankConceptsByObjective(
    specificMapConcepts.length > 0 ? specificMapConcepts : mapConcepts,
    objectiveForLesson(lesson),
  );
  // Two or more verified definitions are already a complete, precise concept
  // frame. Do not append the broader lesson title and dilute that authority.
  if (admittedTerms.length >= 2) return unique(admittedTerms, 4);
  return unique(
    [
      ...admittedTerms,
      ...explicitOverrides,
      ...rankedMapConcepts,
      ...mapConcepts,
      // A generic title remains a last-resort identity when no more precise
      // concept exists, but must never displace the approved teaching terms.
      ...(!titleIsSpecific && mapConcepts.length === 0 ? [titleFocus] : []),
    ],
    4,
  );
}

function primaryConcept(lesson, focusConcepts = lessonFocusConcepts(lesson)) {
  return cleanText(focusConcepts[0], stripLessonPrefix(lesson?.title || 'the lesson focus'));
}

function learnerActionForLesson(lesson, objective, focusConcept, derivedIntent = null) {
  if (derivedIntent?.preferDerivedLearnerAction && derivedIntent.learnerAction) return derivedIntent.learnerAction;
  if (derivedIntent?.learnerAction) return derivedIntent.learnerAction;
  if (MEASURABLE_VERB_RE.test(objective) && !isCompilerGenericInstructionalIntent(objective)) return objective;
  const activity = values(lesson?.activityPattern)[0];
  if (activity && MEASURABLE_VERB_RE.test(activity) && !isCompilerGenericInstructionalIntent(activity)) return activity;
  return '';
}

function evidenceBoundaryForLesson(lesson, suppliedAuthority = null, { requireClaimAuthority = false } = {}) {
  const evidenceAuthority = normalizeEvidenceAuthority(suppliedAuthority);
  const operationDemand = operationEvidenceDemandForLesson(lesson, { requireAction: false });
  const compilerOperationSpecimen = operationDemand?.operation
    ? {
        protocol: 'coursemapper-compiler-operation-specimen-authority-v1',
        authorityKind: 'compiler-verified-synthetic',
        operation: operationDemand.operation,
        matchedSurface: operationDemand.matchedSurface,
        verificationRequirement:
          'The compiled specimen must expose fixed inputs, replayable steps, a checked result, a bounded interpretation, and its operation receipt.',
      }
    : null;
  const requiresExternalClaims = requireClaimAuthority && !compilerOperationSpecimen;
  const authorityClaims = evidenceAuthority?.status === 'admitted' ? evidenceAuthority.claims : [];
  const observedLessonFacts = lessonFacts(lesson);
  const authorityClaimTexts = authorityClaims.map((claim) => claim.text);
  const allowedClaims = unique(
    requiresExternalClaims && evidenceAuthority
      ? authorityClaimTexts
      : compilerOperationSpecimen
        ? authorityClaimTexts
        : [...observedLessonFacts, ...authorityClaimTexts],
    16,
  );
  const authorityClaimSet = new Set(authorityClaimTexts.map((claim) => cleanText(claim)));
  const unadmittedClaims =
    requiresExternalClaims && evidenceAuthority
      ? observedLessonFacts.filter((claim) => !authorityClaimSet.has(cleanText(claim)))
      : [];
  const approvedSources = unique(
    compilerOperationSpecimen
      ? [
          `course-created ${operationDemand.operation} specimen`,
          ...(evidenceAuthority?.status === 'admitted'
            ? (evidenceAuthority.sources || []).map((source) => source.title)
            : []),
        ]
      : [
          ...sourceIdentities(lesson, { strict: requiresExternalClaims }),
          ...(evidenceAuthority?.sources || []).map((source) => source.title),
        ].filter((source) => !requiresExternalClaims || isKnowledgeSourceIdentity(source)),
    12,
  );
  const instructorSource = approvedSources.some(
    (source) => !/^course-created\b/i.test(source) && !/lesson materials|evidence brief|source packet/i.test(source),
  );
  const mode = compilerOperationSpecimen
    ? 'compiler-verified-operation-specimen'
    : allowedClaims.length > 0
      ? 'claim-bounded'
      : approvedSources.length > 0
        ? 'source-bounded-no-claim-expansion'
        : 'instructor-confirmation-required';
  return {
    mode,
    allowedClaims,
    unadmittedClaims,
    approvedSources,
    curriculumSignalsAreNotSources: true,
    draftAuthorization:
      compilerOperationSpecimen || allowedClaims.length > 0 || !requireClaimAuthority
        ? 'authorized'
        : 'evidence-acquisition-required',
    ...(compilerOperationSpecimen ? { compilerOperationSpecimen } : {}),
    ...(evidenceAuthority
      ? {
          authority: evidenceAuthority,
          admittedClaimIds: authorityClaims.map((claim) => claim.id),
        }
      : {}),
    instructorSource,
    mayAddUnsupportedFacts: false,
    citationExpectation:
      mode === 'compiler-verified-operation-specimen' && evidenceAuthority?.status !== 'admitted'
        ? `Identify the course-created ${operationDemand.operation} specimen and cite its fixed inputs or checked step at the point where the evidence is used.`
        : cleanText(lesson?.sourceUsePlan?.citationExpectation) ||
          'Cite the exact assigned or admitted source at the point where its evidence is used.',
    limitation:
      cleanText(lesson?.evidencePlan?.limitationCue) ||
      `Limit the conclusion to the inspected evidence for ${stripLessonPrefix(lesson?.title) || 'this lesson'}; one untested condition must remain explicit.`,
    publicationBoundary:
      mode === 'compiler-verified-operation-specimen'
        ? 'The native specimen authorizes only its verified synthetic inputs, procedure, checked result, interpretation, and boundary; add no external factual claims without admitted source evidence.'
        : mode === 'instructor-confirmation-required'
          ? 'Do not publish factual teaching claims until the instructor identifies an approved source.'
          : 'Do not introduce factual teaching claims outside the listed claims and approved sources.',
  };
}

function clarificationQuestionsForLesson(lesson, assessment, evidenceBoundary) {
  const questions = [];
  const missing = new Set(values(lesson?.missingSignals).map((signal) => signal.toLowerCase()));
  if (missing.has('objectives') || lesson?.confidence?.fields?.objectives?.source === 'compiler-inferred') {
    questions.push({
      id: `${lesson.id}-objective`,
      priority: 'recommended',
      decision: 'learning-objective',
      prompt: `What should learners demonstrably be able to do after ${stripLessonPrefix(lesson.title)}?`,
    });
  }
  if (!assessment || lesson?.assessmentSource === 'compiler-inferred') {
    questions.push({
      id: `${lesson.id}-assessment`,
      priority: 'recommended',
      decision: 'assessment-evidence',
      prompt: `What learner work should count as evidence of success for ${stripLessonPrefix(lesson.title)}?`,
    });
  }
  if (
    evidenceBoundary.mode === 'instructor-confirmation-required' ||
    evidenceBoundary.draftAuthorization === 'evidence-acquisition-required'
  ) {
    questions.push({
      id: `${lesson.id}-source`,
      priority: 'essential',
      decision: evidenceBoundary.mode === 'instructor-confirmation-required' ? 'governing-source' : 'source-claims',
      prompt:
        evidenceBoundary.mode === 'instructor-confirmation-required'
          ? `Which source or instructor-provided evidence should govern factual teaching in ${stripLessonPrefix(lesson.title)}?`
          : `Which exact, source-bound claims from ${evidenceBoundary.approvedSources[0]} may Scion teach in ${stripLessonPrefix(lesson.title)}?`,
    });
  }
  return questions;
}

function buildLessonIntent({
  lesson,
  assessment,
  index,
  lessonCount,
  commonConcepts,
  conceptOverrides,
  briefQualityContract,
  evidenceAuthority,
  requireClaimAuthority,
}) {
  let targetObjectives = objectiveForLesson(lesson);
  const focusConcepts = lessonFocusConcepts(lesson, commonConcepts, conceptOverrides);
  const focusConcept = primaryConcept(lesson, focusConcepts);
  const artifact = cleanText(assessment?.artifact || lesson?.studentArtifact);
  const successCriteria = unique(values(lesson?.successCriteria), 6);
  const evidenceBoundary = evidenceBoundaryForLesson(lesson, evidenceAuthority, { requireClaimAuthority });
  const operationIntent = statisticalInstructionalIntentForOperation(lesson);
  const visualIntent = lessonRequiresFunctionalVisual(briefQualityContract, lesson.lessonNumber || index + 1)
    ? buildFunctionalVisualInstructionalIntent({
        lessonNumber: lesson.lessonNumber || index + 1,
        lessonTitle: lesson.title,
        objectives: targetObjectives,
        concept: focusConcept,
        secondary: focusConcepts[1] || '',
        productActions: briefQualityContract?.functionalVisual?.productActions || [],
        learnerArtifact: artifact,
        successCriterion: successCriteria[0] || '',
      })
    : null;
  const generalEvidenceReasoningIntent =
    !operationIntent &&
    !visualIntent &&
    (targetObjectives.length === 0 || targetObjectives.every(isCompilerGenericInstructionalIntent))
      ? buildGeneralEvidenceReasoningIntent({
          focusConcept,
          artifact,
          variationKey: (lesson.lessonNumber || index + 1) - 1,
        })
      : null;
  const derivedIntent = operationIntent || visualIntent || generalEvidenceReasoningIntent;
  // A deterministic operation contract is stronger than an incidental
  // source-summary objective. Once the lesson identity demands a concrete
  // procedure (for example, calculating and interpreting a distribution),
  // freeze that observable operation before research or prose generation.
  // Otherwise the plan can sign a generic source-use sentence while the
  // compiler later drafts the real procedure, creating two authorities.
  if (
    derivedIntent?.objective &&
    (operationIntent || targetObjectives.length === 0 || targetObjectives.every(isCompilerGenericInstructionalIntent))
  ) {
    targetObjectives = [derivedIntent.objective];
  }
  const primaryObjective = targetObjectives[0];
  const learnerAction = learnerActionForLesson(lesson, primaryObjective, focusConcept, derivedIntent);
  const priorLesson = index > 0 ? `lesson-${index}` : null;
  const nextLesson = index + 1 < lessonCount ? `lesson-${index + 2}` : null;
  const questions = clarificationQuestionsForLesson(lesson, assessment, evidenceBoundary);
  return {
    id: lesson.id || `lesson-${index + 1}`,
    lessonNumber: lesson.lessonNumber || index + 1,
    title: cleanText(lesson.title, `Lesson ${index + 1}`),
    focusConcepts,
    purpose: `${primaryObjective} This prepares learners to produce ${artifact || 'the planned lesson evidence'}.`,
    targetObjectives,
    targetUnderstanding: primaryObjective,
    learnerAction,
    expectedEvidence: {
      artifact,
      evidenceRequirement:
        derivedIntent?.evidenceRequirement ||
        cleanText(lesson?.evidencePlan?.evidenceRequirement) ||
        `The ${artifact || 'learner artifact'} must make the relevant evidence, reasoning, and revision decision inspectable.`,
      successCriteria,
      feedbackUse: cleanText(lesson?.feedbackCycle?.nextUse || lesson?.feedbackMoment),
    },
    evidenceModel: {
      objectiveEvidence: targetObjectives.map((objective, objectiveIndex) => ({
        objective,
        learnerEvidence: artifact,
        successSignal:
          successCriteria[objectiveIndex % Math.max(1, successCriteria.length)] ||
          'The learner makes the reasoning and evidence visible in the planned artifact.',
        sourceBoundaryMode: evidenceBoundary.mode,
      })),
      diagnosticEvidence:
        cleanText(lesson?.readinessSupport?.diagnosticCheck) ||
        `Ask learners to explain what they already know about ${focusConcept} before modeling.`,
      feedbackDecision:
        cleanText(lesson?.feedbackCycle?.feedbackMethod) ||
        'Compare the visible evidence with the success criteria and select one revision move.',
    },
    evidenceBoundary,
    evidenceNeedKind: operationIntent ? 'operation-specimen' : visualIntent ? 'visual-specimen' : 'source-claims',
    sequence: {
      prerequisiteIntentId: priorLesson,
      transferIntentId: nextLesson,
      role: index === 0 ? 'foundation' : index + 1 === lessonCount ? 'integration' : 'development',
    },
    clarificationQuestions: questions,
    assumptions: values(lesson?.missingSignals).map((signal) => ({
      signal,
      policy: 'Keep the inferred value visible to the instructor; never present it as source-confirmed.',
    })),
  };
}

export function validateInstructionalIntentGraph(graph = {}) {
  const blockers = [];
  const warnings = [];
  const intents = Array.isArray(graph.lessonIntents) ? graph.lessonIntents : [];
  if (graph.version !== INSTRUCTIONAL_INTENT_GRAPH_VERSION) blockers.push('unsupported-version');
  if (!cleanText(graph.course?.name)) blockers.push('missing-course-name');
  if (intents.length === 0) blockers.push('missing-lesson-intents');
  if (Number(graph.course?.lessonCount) !== intents.length) blockers.push('lesson-count-mismatch');
  if (!instructionalInstanceContractReceiptMatches(graph.instructionalInstanceContract)) {
    blockers.push('invalid-instructional-instance-contract');
  }
  if (
    Object.keys(graph?.artifactResponsibilities || {}).length !==
    Object.keys(INSTRUCTIONAL_ARTIFACT_RESPONSIBILITIES).length
  ) {
    blockers.push('incomplete-artifact-responsibilities');
  }
  const instancesByLessonId = instanceByLessonId(graph.instructionalInstanceContract);
  const ids = new Set();
  for (const intent of intents) {
    const prefix = intent?.id || `lesson-${intent?.lessonNumber || '?'}`;
    if (!intent?.id || ids.has(intent.id)) blockers.push(`${prefix}:invalid-identity`);
    ids.add(intent?.id);
    const instance = instancesByLessonId[intent?.id];
    if (
      !instance ||
      !instructionalInstanceReceiptMatches(instance) ||
      intent?.instructionalInstanceId !== instance.instructionalInstanceId ||
      intent?.instructionalInstance?.receiptSha256 !== instance.receiptSha256
    ) {
      blockers.push(`${prefix}:invalid-instructional-instance`);
    }
    if (!cleanText(intent?.purpose)) blockers.push(`${prefix}:missing-purpose`);
    if (!Array.isArray(intent?.focusConcepts) || intent.focusConcepts.length === 0) {
      blockers.push(`${prefix}:missing-focus-concepts`);
    }
    if (!Array.isArray(intent?.targetObjectives) || intent.targetObjectives.length === 0) {
      blockers.push(`${prefix}:missing-objectives`);
    } else if (intent.targetObjectives.some(isCompilerGenericInstructionalIntent)) {
      blockers.push(`${prefix}:generic-objective`);
    }
    if (!cleanText(intent?.learnerAction) || !MEASURABLE_VERB_RE.test(intent.learnerAction)) {
      blockers.push(`${prefix}:unobservable-learner-action`);
    } else if (isCompilerGenericInstructionalIntent(intent.learnerAction)) {
      blockers.push(`${prefix}:generic-learner-action`);
    }
    if (!cleanText(intent?.expectedEvidence?.artifact)) blockers.push(`${prefix}:missing-evidence-artifact`);
    if (!cleanText(intent?.expectedEvidence?.evidenceRequirement)) {
      blockers.push(`${prefix}:missing-evidence-requirement`);
    }
    if (
      !Array.isArray(intent?.expectedEvidence?.successCriteria) ||
      intent.expectedEvidence.successCriteria.length < 2
    ) {
      blockers.push(`${prefix}:missing-success-criteria`);
    }
    if (!cleanText(intent?.evidenceBoundary?.mode)) blockers.push(`${prefix}:missing-evidence-boundary`);
    if (
      !Array.isArray(intent?.evidenceModel?.objectiveEvidence) ||
      intent.evidenceModel.objectiveEvidence.length !== intent.targetObjectives.length
    ) {
      blockers.push(`${prefix}:incomplete-objective-evidence-model`);
    }
    if (intent?.evidenceBoundary?.mayAddUnsupportedFacts !== false) {
      blockers.push(`${prefix}:unbounded-claim-policy`);
    }
    if (intent?.evidenceBoundary?.unadmittedClaims?.length > 0) {
      blockers.push(`${prefix}:unadmitted-draft-claims`);
    }
    if (intent?.evidenceBoundary?.draftAuthorization === 'evidence-acquisition-required') {
      blockers.push(`${prefix}:evidence-acquisition-required`);
    } else if (intent?.clarificationQuestions?.some((question) => question.priority === 'essential')) {
      blockers.push(`${prefix}:essential-instructor-input-required`);
    }
  }
  const evidenceOnlyBlockers =
    blockers.length > 0 && blockers.every((blocker) => /:evidence-acquisition-required$/.test(blocker));
  return {
    version: 1,
    status: blockers.length > 0 ? (evidenceOnlyBlockers ? 'needs-evidence' : 'blocked') : 'approved',
    blockerCount: blockers.length,
    warningCount: warnings.length,
    blockers,
    warnings,
    lessonCount: intents.length,
  };
}

export function buildInstructionalIntentGraph({
  courseName,
  lessons = [],
  assessments = [],
  courseConcepts = [],
  lessonConceptOverrides = {},
  briefQualityContract = null,
  planningAuthority = null,
  evidenceAuthorityByLessonId = {},
  requireClaimAuthority = Boolean(planningAuthority),
} = {}) {
  const conceptLessonCounts = new Map();
  for (const lesson of lessons) {
    const lessonConcepts = new Set(values(lesson?.keyConcepts).map((concept) => concept.toLowerCase()));
    for (const concept of lessonConcepts) {
      conceptLessonCounts.set(concept, (conceptLessonCounts.get(concept) || 0) + 1);
    }
  }
  const commonConceptThreshold = Math.max(2, Math.ceil(lessons.length * 0.5));
  const commonConcepts = new Set(
    [...conceptLessonCounts.entries()]
      .filter(([, count]) => count >= commonConceptThreshold)
      .map(([concept]) => concept),
  );
  const baseLessonIntents = lessons.map((lesson, index) =>
    buildLessonIntent({
      lesson,
      assessment: assessmentForLesson(assessments, lesson, index),
      index,
      lessonCount: lessons.length,
      commonConcepts,
      conceptOverrides:
        lessonConceptOverrides?.[lesson.id] || lessonConceptOverrides?.[`lesson-${lesson.lessonNumber}`] || [],
      briefQualityContract,
      evidenceAuthority:
        evidenceAuthorityByLessonId?.[lesson.id] ||
        evidenceAuthorityByLessonId?.[`lesson-${lesson.lessonNumber}`] ||
        null,
      requireClaimAuthority,
    }),
  );
  const course = {
    name: cleanText(courseName),
    lessonCount: lessons.length,
    throughlineConcepts: unique(courseConcepts, 12),
    culminatingEvidence: baseLessonIntents.at(-1)?.expectedEvidence?.artifact || '',
  };
  const predecessorByLessonId = Object.fromEntries(
    Object.entries(evidenceAuthorityByLessonId || {})
      .filter(([, authority]) => instructionalInstanceReceiptMatches(authority?.instructionalInstance))
      .map(([lessonId, authority]) => [lessonId, authority.instructionalInstance]),
  );
  const instructionalInstanceContract = buildInstructionalInstanceContract({
    course,
    lessonIntents: baseLessonIntents,
    planningAuthority,
    predecessorByLessonId,
  });
  const instances = instanceByLessonId(instructionalInstanceContract);
  const lessonIntents = baseLessonIntents.map((intent) => {
    const instructionalInstance = instances[intent.id];
    return {
      ...intent,
      instructionalInstanceId: instructionalInstance?.instructionalInstanceId || '',
      instructionalRequirementIds: (instructionalInstance?.requirements || [])
        .filter((requirement) => requirement.required)
        .map((requirement) => requirement.requirementId),
      instructionalInstance: structuredClone(instructionalInstance),
    };
  });
  const evidenceNeeds = lessonIntents.map((intent) => ({
    needId: `${intent.id}-${intent.evidenceNeedKind}-1`,
    lessonId: intent.id,
    instructionalInstanceId: intent.instructionalInstanceId,
    instructionalRequirementIds: [...intent.instructionalRequirementIds],
    kind: intent.evidenceNeedKind,
    required: true,
    question:
      intent.evidenceNeedKind === 'source-claims'
        ? `Which exact source-bound claims are necessary to teach ${intent.focusConcepts[0]} and support ${intent.expectedEvidence.artifact}?`
        : `Which compiler-verifiable ${intent.evidenceNeedKind.replace('-', ' ')} lets learners perform ${intent.learnerAction}?`,
    acceptanceTest: {
      minimumClaimCount: intent.evidenceNeedKind === 'source-claims' ? 3 : 0,
      minimumSpecimenCount: intent.evidenceNeedKind === 'source-claims' ? 0 : 1,
      requiresSourceSnapshot: intent.evidenceNeedKind === 'source-claims',
      rejectsLearnerFacingDraftFields: true,
      allowedAuthorityKinds:
        intent.evidenceNeedKind === 'source-claims'
          ? ['instructor-provided-facts', 'shipped-source-library', 'verified-open-research']
          : ['compiler-verified-synthetic', 'verified-open-research'],
    },
    curriculumSignalRefs: [
      {
        role: 'lesson-title',
        value: intent.title,
        claimBearing: false,
        citable: false,
      },
      ...intent.targetObjectives.map((objective, index) => ({
        role: `objective-${index + 1}`,
        value: objective,
        claimBearing: false,
        citable: false,
      })),
    ],
  }));
  const evidenceNeedsPayload = {
    protocol: 'coursemapper-evidence-needs-plan-v1',
    status: 'needs-planned',
    needs: evidenceNeeds,
  };
  const evidenceNeedsPlan = {
    ...evidenceNeedsPayload,
    receipt: {
      algorithm: 'sha256',
      exactInputSha256: sha256HexSync(canonicalJson(evidenceNeedsPayload)),
      needCount: evidenceNeeds.length,
    },
  };
  const graphWithoutReceipt = {
    version: INSTRUCTIONAL_INTENT_GRAPH_VERSION,
    source: 'plan-before-draft-instructional-authority',
    course,
    artifactResponsibilities: { ...INSTRUCTIONAL_ARTIFACT_RESPONSIBILITIES },
    instructionalInstanceContract,
    evidenceNeedsPlan,
    ...(planningAuthority && typeof planningAuthority === 'object'
      ? { planningAuthority: structuredClone(planningAuthority) }
      : {}),
    lessonIntents,
  };
  const admission = validateInstructionalIntentGraph(graphWithoutReceipt);
  const exactInputSha256 = sha256HexSync(canonicalJson(graphWithoutReceipt));
  return {
    ...graphWithoutReceipt,
    admission,
    receipt: {
      version: 1,
      algorithm: 'sha256',
      exactInputSha256,
      lessonCount: lessonIntents.length,
      status: admission.status,
    },
  };
}

export function instructionalIntentGraphReceiptMatches(graph = {}) {
  if (!graph?.receipt?.exactInputSha256) return false;
  const { admission: _admission, receipt: _receipt, ...graphWithoutReceipt } = graph;
  return sha256HexSync(canonicalJson(graphWithoutReceipt)) === graph.receipt.exactInputSha256;
}

/**
 * Convert an exact evidence-only planning hold into a signed compiler recovery
 * authorization. The curriculum intent stays immutable; only the permission
 * to render source-bounded, compiler-owned recovery surfaces changes. Any
 * other blocker, stale receipt, or mixed blocker set remains fail-closed.
 */
export function authorizeInstructionalIntentGraphEvidenceRecovery(graph = {}) {
  if (!instructionalIntentGraphReceiptMatches(graph)) return graph;
  const admission = validateInstructionalIntentGraph(graph);
  const blockers = admission.blockers || [];
  if (
    admission.status !== 'needs-evidence' ||
    blockers.length === 0 ||
    !blockers.every((blocker) => /^lesson-\d+:evidence-acquisition-required$/.test(blocker))
  ) {
    return graph;
  }

  const lessonNumbers = blockers
    .map((blocker) => Number(/^lesson-(\d+):/.exec(blocker)?.[1]))
    .filter((lessonNumber) => Number.isInteger(lessonNumber) && lessonNumber > 0);
  const recoveryLessons = new Set(lessonNumbers);
  const { admission: _priorAdmission, receipt: _priorReceipt, ...priorGraph } = graph;
  const graphWithoutReceipt = {
    ...structuredClone(priorGraph),
    lessonIntents: items(graph.lessonIntents).map((intent) =>
      recoveryLessons.has(Number(intent?.lessonNumber))
        ? (() => {
            const recoverySource = `course-created ${cleanText(intent.title, `Lesson ${intent.lessonNumber}`)} practice record`;
            return {
              ...structuredClone(intent),
              clarificationQuestions: items(intent.clarificationQuestions).map((question) =>
                question?.priority === 'essential' && ['source-claims', 'governing-source'].includes(question?.decision)
                  ? {
                      ...structuredClone(question),
                      priority: 'deferred-by-compiler-recovery',
                      resolution:
                        'The compiler will publish no external factual claim for this lesson until exact source claims are admitted.',
                    }
                  : structuredClone(question),
              ),
              evidenceBoundary: {
                ...structuredClone(intent.evidenceBoundary || {}),
                approvedSources: [recoverySource],
                citationExpectation: `Cite ${recoverySource} at the point where its evidence is used.`,
                draftAuthorization: 'compiler-source-review-recovery',
                recoveryConstraint:
                  'Render only curriculum-owned objectives, source labels, and compiler-created practice; publish no provisional subject-matter claims.',
              },
            };
          })()
        : structuredClone(intent),
    ),
    evidenceRecoveryAuthorization: {
      protocol: 'coursemapper-instructional-plan-evidence-recovery-v1',
      status: 'authorized',
      lessonNumbers,
      predecessorReceiptSha256: graph.receipt.exactInputSha256,
      claimBoundary:
        'Only exact evidence-acquisition holds may enter compiler-owned source-review recovery; all other planning defects remain blocked.',
    },
  };
  const recoveredAdmission = validateInstructionalIntentGraph(graphWithoutReceipt);
  if (recoveredAdmission.status !== 'approved') return graph;
  return {
    ...graphWithoutReceipt,
    admission: recoveredAdmission,
    receipt: {
      version: 1,
      algorithm: 'sha256',
      exactInputSha256: sha256HexSync(canonicalJson(graphWithoutReceipt)),
      lessonCount: graphWithoutReceipt.lessonIntents.length,
      status: recoveredAdmission.status,
    },
  };
}

export function applyInstructionalIntentGraph(lessons = [], graph = {}) {
  const byId = new Map(items(graph.lessonIntents).map((intent) => [intent?.id, intent]));
  const synchronizeEvidenceBoundary = Boolean(graph?.planningAuthority);
  return lessons.map((lesson, index) => {
    const intent = byId.get(lesson.id) || graph.lessonIntents?.[index];
    if (!intent) return lesson;
    // Revalidate signed-plan source labels at the projection boundary as well
    // as during new plan construction. Older persisted plans can carry a
    // compiler planning placeholder ahead of the subsequently admitted source;
    // a valid receipt proves those bytes are unchanged, not that the placeholder
    // became factual authority.
    const approvedSources = unique(values(intent?.evidenceBoundary?.approvedSources), 12).filter(
      isKnowledgeSourceIdentity,
    );
    const primarySource = approvedSources[0] || '';
    const sourceIdentity = primarySource || 'the instructor-confirmed lesson source';
    const sourceUsePlan = {
      approvedSources,
      citationExpectation:
        cleanText(intent?.evidenceBoundary?.citationExpectation) ||
        `Cite ${sourceIdentity} at the point where its evidence is used.`,
      studentAttributionMove: `Identify ${sourceIdentity}, point to the exact input, passage, step, or record used, and keep the conclusion within that evidence.`,
      noInventedSources: `Do not invent authors, URLs, pages, studies, or authority for ${sourceIdentity}; add an external factual claim only after its source passage earns admission.`,
      sourceEvaluationPrompt: `Ask what ${sourceIdentity} supports, what it cannot establish, and which evidence would be required for a broader conclusion.`,
      localReplacementCue: `Before publishing, confirm that ${sourceIdentity} is the intended lesson evidence; replace it only with an instructor-approved source that has an admitted claim boundary.`,
      copyrightReviewCue: /^course-created\b/i.test(sourceIdentity)
        ? `${sourceIdentity} is compiler-generated; review any separately added external asset or excerpt for attribution and reuse rights.`
        : `Verify that every copied excerpt, image, dataset, case, or media item from ${sourceIdentity} is licensed or institutionally approved.`,
    };
    return {
      ...lesson,
      outcomes: [...intent.targetObjectives],
      keyConcepts: unique([...intent.focusConcepts, ...values(lesson.keyConcepts)], 4),
      studentArtifact: intent.expectedEvidence.artifact,
      successCriteria: [...intent.expectedEvidence.successCriteria],
      evidencePlan: {
        ...(lesson.evidencePlan || {}),
        sourceCue: synchronizeEvidenceBoundary
          ? primarySource || lesson.evidencePlan?.sourceCue
          : lesson.evidencePlan?.sourceCue,
        evidenceRequirement: intent.expectedEvidence.evidenceRequirement,
        limitationCue: intent.evidenceBoundary.limitation,
      },
      ...(synchronizeEvidenceBoundary ? { sourceUsePlan } : {}),
      ...(synchronizeEvidenceBoundary && lesson.throughlineCase
        ? {
            throughlineCase: {
              ...lesson.throughlineCase,
              evidencePacket: primarySource || lesson.throughlineCase.evidencePacket,
              sourceBoundary: intent.evidenceBoundary,
            },
          }
        : {}),
      instructionalIntent: intent,
      instructionalIntentReceiptSha256: graph.receipt?.exactInputSha256 || '',
    };
  });
}

export function assertInstructionalIntentGraph(graph = {}, { allowEvidenceNeeds = false } = {}) {
  const admission = validateInstructionalIntentGraph(graph);
  if (admission.status !== 'approved' && !(allowEvidenceNeeds && admission.status === 'needs-evidence')) {
    throw new Error(`Instructional plan blocked drafting: ${admission.blockers.slice(0, 3).join(', ')}`);
  }
  if (!instructionalIntentGraphReceiptMatches(graph)) {
    throw new Error('Instructional plan blocked drafting: stale-or-missing-plan-receipt');
  }
  return admission;
}
