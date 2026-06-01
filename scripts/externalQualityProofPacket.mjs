#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import {
  DEFAULT_GOLD_SAMPLES,
  closeHybridPipelineAuditRuntime,
  loadHybridPipelineAuditRuntime,
} from './goldSampleQualityAudit.mjs';

export { closeHybridPipelineAuditRuntime, loadHybridPipelineAuditRuntime };

const ROOT = process.cwd();
const DEFAULT_OUTPUT_DIR = path.join(ROOT, 'verification-output', 'external-quality-proof-packet');
const RECOMMENDED_PROOF_SCOPES = [5, 8, 14];
const FULL_PACKAGE_REVIEW_TEXT_LIMIT = 30000;

const FEATURE_LABELS = {
  syllabus: 'Syllabus',
  lessonPlans: 'Lesson Plans',
  slideDecks: 'Slide Decks',
  assignments: 'Assignment Briefs',
  rubrics: 'Rubrics',
  discussions: 'Discussion Prompts',
  quizBank: 'Quiz & Exam Bank',
  studyGuides: 'Study Guides',
  courseFaq: 'Course FAQ',
};

const FULL_PACKAGE_ARTIFACTS = Object.keys(FEATURE_LABELS);
const UNREPLACED_TEMPLATE_RE =
  /\b(?:replace with|replace this|placeholder|tbd|to be determined|example only|lorem ipsum|yyyy-mm-dd)\b/i;

const REVIEW_SCORECARD_DIMENSIONS = [
  ['instructional-alignment', 'Instructional alignment'],
  ['teachability', 'Teachability'],
  ['assessment-authenticity', 'Assessment authenticity'],
  ['feedback-and-revision', 'Feedback and revision loop'],
  ['cognitive-progression', 'Cognitive progression'],
  ['accessibility-and-trust', 'Accessibility and trust'],
];

const REVIEW_SCORECARD_PROMPTS = {
  'instructional-alignment':
    'Do objectives, practice, assessment artifacts, criteria, and success criteria point to the same learning target?',
  teachability:
    'Could an instructor teach from the lesson plans, slide notes, materials, and support moves without major rewriting?',
  'assessment-authenticity':
    'Do assignments, rubrics, quiz items, and grading calibration measure meaningful performance rather than surface polish?',
  'feedback-and-revision':
    'Do students receive clear formative evidence, actionable feedback, and a visible revision path before final judgment?',
  'cognitive-progression':
    'Does the package use retrieval, spaced practice, transfer, and increasing cognitive demand across the course arc?',
  'accessibility-and-trust':
    'Are participation options, accommodation checks, source-grounding, local-review flags, and human-review limits visible?',
};

function cleanText(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncateText(value, limit = 520) {
  const text = cleanText(value);
  if (text.length <= limit) return text;
  return `${text.slice(0, Math.max(0, limit - 3)).trim()}...`;
}

function tableCell(value, limit = 520) {
  return truncateText(value, limit).replace(/\|/g, '\\|');
}

function collectStrings(value, out = []) {
  if (typeof value === 'string') {
    const text = cleanText(value);
    if (text) out.push(text);
    return out;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectStrings(item, out));
    return out;
  }
  if (value && typeof value === 'object') {
    Object.values(value).forEach((item) => collectStrings(item, out));
  }
  return out;
}

function hasUnreplacedTemplateText(value) {
  return UNREPLACED_TEMPLATE_RE.test(cleanText(value));
}

function collectUnreplacedTemplatePaths(value, prefix, out = []) {
  if (typeof value === 'string') {
    if (hasUnreplacedTemplateText(value)) out.push(prefix);
    return out;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectUnreplacedTemplatePaths(item, `${prefix}[${index}]`, out));
    return out;
  }
  if (value && typeof value === 'object') {
    Object.entries(value).forEach(([key, item]) =>
      collectUnreplacedTemplatePaths(item, prefix ? `${prefix}.${key}` : key, out),
    );
  }
  return out;
}

function scopeCourseMap(courseMap, scope) {
  return {
    ...courseMap,
    lessons: Array.isArray(courseMap?.lessons) ? courseMap.lessons.slice(0, scope) : [],
  };
}

function getFeatureArray(featureId, data) {
  if (!data || typeof data !== 'object') return [];
  const keys = {
    lessonPlans: ['lessonPlans', 'plans'],
    slideDecks: ['decks', 'slideDecks'],
    assignments: ['assignments'],
    rubrics: ['rubrics'],
    discussions: ['discussions'],
    quizBank: ['quizzes', 'quizBank'],
    studyGuides: ['studyGuides', 'guides'],
    courseFaq: ['faqs', 'courseFaq'],
  };
  for (const key of keys[featureId] || []) {
    if (Array.isArray(data[key])) return data[key];
  }
  return [];
}

function uniqueList(values, limit = 20) {
  const seen = new Set();
  const result = [];
  for (const value of values.map(cleanText).filter(Boolean)) {
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
    if (result.length >= limit) break;
  }
  return result;
}

async function readPackageVersion() {
  const raw = JSON.parse(await fs.readFile(path.join(ROOT, 'package.json'), 'utf8'));
  return raw.version || 'unknown';
}

function makeScorecardTemplate() {
  return {
    maxScore: 5,
    dimensions: REVIEW_SCORECARD_DIMENSIONS.map(([id, label]) => ({
      id,
      label,
      reviewPrompt: REVIEW_SCORECARD_PROMPTS[id],
      score: null,
      evidenceArtifacts: ['Replace with reviewed artifact featureId, e.g. lessonPlans'],
      evidenceExamples: ['Replace with one concrete package detail that supports this score.'],
      notes: 'Replace with reviewer notes tied to the reviewed package.',
    })),
  };
}

function makeSourceFidelityArtifactReviewTemplate() {
  return FULL_PACKAGE_ARTIFACTS.map((featureId) => ({
    featureId,
    artifact: FEATURE_LABELS[featureId],
    sourceCompared: false,
    packageCompared: false,
    sourceSignalsPreserved: null,
    compilerDecisionVisible: null,
    publishGateVisible: null,
    modelUsePolicyVisible: null,
    handoffReviewFocusVisible: null,
    localReviewActionVisible: null,
    unsupportedInventionRisk: null,
    notes:
      'Replace with reviewer notes comparing this compiled artifact to the source course map, including compiler decision, publish gate, model-use policy, handoff review focus, and the local-review or publish-before-use action the reviewer saw.',
  }));
}

function makeBlueprintQualityLessonReviewTemplate(blueprint) {
  const lessons = Array.isArray(blueprint?.lessons) ? blueprint.lessons : [];
  const rows =
    lessons.length > 0
      ? lessons
      : [
          {
            lessonNumber: null,
            title: 'Replace with reviewed lesson title',
          },
        ];
  return rows.map((lesson, index) => ({
    lessonNumber: lesson.lessonNumber || index + 1,
    lessonTitle: truncateText(lesson.title || `Lesson ${index + 1}`, 180),
    sourceCompared: false,
    blueprintCompared: false,
    sourceSignalsPreserved: null,
    assessmentPreserved: null,
    alignmentUsable: null,
    reviewRequiredFlagsVisible: null,
    notes: 'Replace with reviewer notes comparing this source lesson to the compact blueprint row.',
  }));
}

function makeAssumptionLedgerDecisionTemplate(assumptionLedger) {
  const reviewRequiredRows = Array.isArray(assumptionLedger?.rows)
    ? assumptionLedger.rows.filter((row) => row?.reviewRequired)
    : [];
  if (reviewRequiredRows.length === 0) {
    return [
      {
        rowId: null,
        category: 'handoff-boundary',
        coverage: 'all review-required rows in this category',
        decision: null,
        notes:
          'Replace with reviewer notes describing the local-confirmation decision for any review-required assumption.',
      },
    ];
  }
  return reviewRequiredRows.map((row) => ({
    rowId: row.id || null,
    category: row.category || '',
    lessonNumber: row.lessonNumber || null,
    assumption: truncateText(row.assumption, 220),
    reviewerAction: truncateText(row.reviewerAction, 220),
    decision: null,
    notes:
      'Replace with reviewer notes describing whether this assumption was confirmed, revised, or held for local confirmation.',
  }));
}

function makeFixtureTemplate({ sample, packageVersion, blueprint = null, assumptionLedger, proofContext = {} }) {
  return {
    id: `external-full-package-review-${sample.id}`,
    templateOnly: true,
    label: `External full-package review: ${sample.label}`,
    sampleId: sample.id,
    ...(sample.source === 'external-project' && sample.project ? { project: sample.project } : {}),
    evidenceType: 'external',
    reviewerRole: 'external course reviewer',
    reviewEvidence: {
      reviewerType: 'external-expert',
      reviewedAt: 'YYYY-MM-DD',
      reviewedPackageVersion: packageVersion,
      reviewedArtifacts: FULL_PACKAGE_ARTIFACTS,
      evidenceSource: 'external full-package review packet',
      courseModality: proofContext.courseModality || 'unknown',
      proofScopeTags: proofContext.proofScopeTags || [],
    },
    reviewScorecard: makeScorecardTemplate(),
    sourceFidelityReview: {
      sourceInputReviewed: false,
      compiledPackageReviewed: false,
      lessonOrderPreserved: null,
      assessmentsPreserved: null,
      unsupportedInventionRisk: null,
      artifactReviews: makeSourceFidelityArtifactReviewTemplate(),
      notes: 'Replace with reviewer notes comparing the source course map to the compiled package.',
    },
    blueprintQualityReview: {
      blueprintReviewed: false,
      sourceInputReviewed: false,
      compactRepresentationReviewed: false,
      sourceSignalsPreserved: null,
      assessmentsPreserved: null,
      alignmentUsable: null,
      unresolvedBlueprintRisk: null,
      lessonReviews: makeBlueprintQualityLessonReviewTemplate(blueprint),
      notes:
        'Replace with reviewer notes comparing the source course map to the compact blueprint before reviewing compiled artifacts.',
    },
    assumptionLedgerReview: {
      assumptionLedgerReviewed: false,
      categoriesReviewed: assumptionLedger?.categories || [
        'learner-context',
        'course-modality',
        'assessment-weight',
        'handoff-boundary',
      ],
      reviewRequiredRowsReviewed: false,
      reviewedRows: makeAssumptionLedgerDecisionTemplate(assumptionLedger),
      unresolvedAssumptionRisk: null,
      notes:
        'Replace with reviewer notes confirming which blueprint assumptions and local-confirmation rows were inspected.',
    },
    packageMustMatch: ['Replace with one reviewer-required phrase that should appear in the package.'],
    packageMustNotMatch: ['/TBD|to be determined|lorem ipsum|placeholder/i'],
    featureExpectations: {
      lessonPlans: ['Replace with one reviewer-required lesson-plan signal.'],
      assignments: ['Replace with one reviewer-required assignment signal.'],
      rubrics: ['Replace with one reviewer-required rubric signal.'],
      quizBank: ['Replace with one reviewer-required quiz/exam signal.'],
    },
    editChecks: [
      {
        id: 'external-review-main-edit-pressure',
        label: 'Reviewer should not need to rewrite the core package before classroom use.',
        featureId: 'package',
        mustNotMatch: '/TBD|to be determined|lorem ipsum|placeholder/i',
      },
    ],
  };
}

function makeEditHistoryTemplate({ sample, packageVersion, proofContext = {} }) {
  return {
    id: `external-edit-history-${sample.id}`,
    templateOnly: true,
    label: `External instructor edit history: ${sample.label}`,
    sampleId: sample.id,
    ...(sample.source === 'external-project' && sample.project ? { project: sample.project } : {}),
    evidenceType: 'external',
    reviewerRole: 'external instructor',
    reviewEvidence: {
      reviewerType: 'external-instructor',
      reviewedAt: 'YYYY-MM-DD',
      reviewedPackageVersion: packageVersion,
      reviewedArtifacts: FULL_PACKAGE_ARTIFACTS,
      evidenceSource: 'accepted instructor edit history',
      courseModality: proofContext.courseModality || 'unknown',
      proofScopeTags: proofContext.proofScopeTags || [],
    },
    editHistoryEvidenceType: 'external',
    instructorEditPatterns: [
      {
        featureId: 'rubrics',
        field: 'criteria',
        action: 'accepted-or-edited',
        before: 'Replace with original or pre-edit wording.',
        after: 'Replace with accepted instructor-edited wording.',
        notes: 'Replace with concrete notes explaining the repeated instructor edit pattern and why it was accepted.',
      },
    ],
    preferenceExpectations: {
      syllabus: ['Replace with expected learned preference phrase.'],
    },
  };
}

function makeExternalProjectCourseMapTemplate() {
  return {
    courseName: 'Replace with real reviewed course name',
    semester: 'Replace with reviewed term, if available',
    lessons: [
      {
        title: 'Lesson 1: Replace with real lesson title',
        sections: [
          {
            topicSection: 'Replace with real topic and section details from the reviewed source course map.',
            learningObjectives: 'Replace with real learning objectives from the reviewed course map.',
            learningGoals: 'Replace with real learning goals or module outcomes.',
            weeklyAssessments: 'Replace with real assessment, checkpoint, or performance evidence.',
            asyncActivities: 'Replace with real asynchronous preparation or independent work.',
            syncActivities: 'Replace with real class, lab, studio, clinical, or discussion activities.',
            supportingResources: 'Replace with real source resources, readings, cases, datasets, protocols, or tools.',
            evaluateDesign: 'Replace with real evaluation, grading, rubric, or feedback notes.',
          },
        ],
      },
      {
        title: 'Lesson 2: Replace with real lesson title',
        sections: [
          {
            topicSection: 'Replace with real topic and section details from the reviewed source course map.',
            learningObjectives: 'Replace with real learning objectives from the reviewed course map.',
            learningGoals: 'Replace with real learning goals or module outcomes.',
            weeklyAssessments: 'Replace with real assessment, checkpoint, or performance evidence.',
            asyncActivities: 'Replace with real asynchronous preparation or independent work.',
            syncActivities: 'Replace with real class, lab, studio, clinical, or discussion activities.',
            supportingResources: 'Replace with real source resources, readings, cases, datasets, protocols, or tools.',
            evaluateDesign: 'Replace with real evaluation, grading, rubric, or feedback notes.',
          },
        ],
      },
    ],
  };
}

function makeExternalProjectProofTemplate({ packageVersion }) {
  const project = {
    id: 'external-reviewed-course-project',
    label: 'External reviewed course project',
    courseMap: makeExternalProjectCourseMapTemplate(),
  };
  const sample = {
    id: project.id,
    label: project.label,
  };
  const proofContext = {
    courseModality: 'Replace with confirmed course modality, e.g. field-applied',
    proofScopeTags: [
      'external-project',
      'modality:replace-with-confirmed-course-modality',
      'scope:replace-with-reviewed-lesson-count',
      'source-risk:replace-after-review',
    ],
  };
  const reviewFixture = {
    ...makeFixtureTemplate({
      sample,
      packageVersion,
      blueprint: project.courseMap,
      assumptionLedger: null,
      proofContext,
    }),
    id: 'external-project-full-package-review-template',
    label: 'External full-package review: real course map',
    project,
    focus:
      'Compile this externally supplied course map and review whether the resulting full package is classroom-ready for this real course.',
  };
  const editHistoryFixture = {
    ...makeEditHistoryTemplate({ sample, packageVersion, proofContext }),
    id: 'external-project-edit-history-template',
    label: 'External instructor edit history: real course map',
    project,
  };
  return {
    combined: { fixtures: [reviewFixture, editHistoryFixture] },
    review: { fixtures: [reviewFixture] },
    editHistory: { fixtures: [editHistoryFixture] },
  };
}

function renderExternalProjectTemplateMarkdown({ packageVersion, paths = {} }) {
  return [
    '# External Project Course-Map Proof Template',
    '',
    'Use this template when the strict A-quality proof gate needs evidence from a real reviewed course map at one of the required 5/8/14 lesson proof scopes rather than only a curated built-in sample.',
    '',
    `Package version: ${packageVersion}`,
    '',
    '## Files',
    '',
    `- Combined fixture: \`${paths.combinedFixturePath || 'fixtures/external-project.combined-fixtures.template.json'}\``,
    `- Review fixture: \`${paths.reviewFixturePath || 'fixtures/external-project.review-fixture.template.json'}\``,
    `- Edit-history fixture: \`${paths.editHistoryFixturePath || 'fixtures/external-project.edit-history-fixture.template.json'}\``,
    '',
    '## Required Edits',
    '',
    '1. Replace `project.courseMap` with the real source course map that was reviewed; use a 5-, 8-, or 14-lesson reviewed course so the real project contributes to required scope proof.',
    '2. Remove `templateOnly` only after every placeholder has been replaced with concrete evidence.',
    '3. Fill reviewer metadata, scorecard evidence artifacts, evidence examples, source-fidelity artifact rows, blueprint-quality lesson rows, assumption-ledger decisions, and instructor edit-history before/after evidence.',
    '4. Run `npm run audit:expert:preflight -- --fixtures /path/to/external-project.combined-fixtures.json`.',
    '5. Use this together with at least one other complete proof sample from a distinct teaching modality before claiming A-quality.',
    '',
  ].join('\n');
}

function assessmentForLesson(blueprint, lesson) {
  return (
    (blueprint.assessments || []).find((assessment) =>
      (assessment.lessonNumbers || []).includes(lesson.lessonNumber),
    ) || {}
  );
}

function localReviewActionForLesson(lesson, assessment = {}) {
  const reviewFocus = Array.isArray(lesson?.compilerDecision?.reviewFocus) ? lesson.compilerDecision.reviewFocus : [];
  const actionableFocus =
    reviewFocus.find((item) => /\b(?:confirm|check|spot-check|review|verify|resolve)\b/i.test(cleanText(item))) ||
    reviewFocus[0];
  if (actionableFocus) return cleanText(actionableFocus);

  const missingSignals = Array.isArray(lesson?.missingSignals)
    ? lesson.missingSignals.map(cleanText).filter(Boolean)
    : [];
  if (missingSignals.length > 0) {
    return `Before publishing ${lesson.title || 'this lesson'}, confirm ${missingSignals.join(', ')} against the instructor's source materials.`;
  }

  const artifact = cleanText(lesson?.studentArtifact || assessment?.title || 'the lesson materials');
  return `Spot-check official dates, policies, source permissions, local examples, and ${artifact} expectations for ${lesson.title || 'this lesson'}.`;
}

function summarizeLessons(blueprint) {
  return (blueprint.lessons || []).map((lesson) => {
    const assessment = assessmentForLesson(blueprint, lesson);
    return {
      lessonNumber: lesson.lessonNumber,
      title: lesson.title,
      sourceConfidence: lesson.confidence?.level || 'unknown',
      sourceEvidenceTrace: lesson.sourceEvidenceTrace || null,
      sourceConflict: lesson.sourceConflict || null,
      sourceRisk: lesson.sourceRisk || null,
      compilerDecision: lesson.compilerDecision || null,
      publishGate: lesson.compilerDecision?.publishGate || 'missing',
      localReviewState: lesson.compilerDecision?.reviewRequired ? 'local-review-required' : 'spot-check-required',
      localReviewAction: localReviewActionForLesson(lesson, assessment),
      assessmentArtifact: lesson.studentArtifact || '',
      evidenceRequirement: lesson.evidencePlan?.evidenceRequirement || '',
      successCriteria: lesson.successCriteria || [],
      feedbackCycle: lesson.feedbackCycle || null,
      learningTransferPlan: lesson.learningTransferPlan || null,
      teachingIntent: lesson.teachingIntent || null,
      prerequisitePlan: lesson.prerequisitePlan || null,
      conceptDependencyPlan: lesson.conceptDependencyPlan || null,
      practiceProgressionPlan: lesson.practiceProgressionPlan || null,
      masteryEvidencePlan: lesson.masteryEvidencePlan || null,
      evidenceResponsePlan: lesson.evidenceResponsePlan || null,
      classSessionPlan: lesson.classSessionPlan || null,
      modalityCue: lesson.modalityCue || '',
      modalityDecode: lesson.modalityDecode || null,
      artifactGenre: lesson.artifactGenre || null,
      learnerContextCue: lesson.learnerContextCue || '',
      sourceUsePlan: lesson.sourceUsePlan || null,
      accessibilityPlan: lesson.accessibilityPlan || null,
      instructionalRationale: lesson.instructionalRationale || null,
      readinessSupport: lesson.readinessSupport || null,
      modelContrast: lesson.modelContrast || null,
      assessmentValidity: assessment.validityEvidence || null,
      gradingCalibrationPlan: assessment.calibrationPlan || null,
      criterionEvidenceCue: assessment.criterionEvidenceMap?.[0]?.evidenceNeeded || '',
      criterionWeightPlan: assessment.criterionWeightPlan || [],
      anchorExampleSet: assessment.anchorExampleSet || null,
      localReviewNeeded: lesson.missingSignals || [],
      reviewerFocus: [
        `Check whether ${lesson.studentArtifact || 'the assessment artifact'} is teachable and assessable from the provided materials.`,
        lesson.prerequisitePlan?.diagnosticCheck || '',
        assessment.anchorExampleSet?.studentFacingUse || '',
        lesson.artifactGenre?.reviewProtocol || '',
        lesson.feedbackCycle?.studentRevisionAction || '',
        assessment.calibrationPlan?.biasCheck || '',
      ].filter(Boolean),
    };
  });
}

function summarizeFeature({ featureId, compiled }) {
  const data = compiled[featureId];
  const itemCount = featureId === 'syllabus' ? (data?.syllabus ? 1 : 0) : getFeatureArray(featureId, data).length;
  return {
    featureId,
    label: FEATURE_LABELS[featureId] || featureId,
    itemCount,
    excerpt: truncateText(collectStrings(data).join(' '), 900),
  };
}

function summarizeQuizProgression({ compiled, lessons = [] }) {
  return getFeatureArray('quizBank', compiled.quizBank).map((quiz, index) => {
    const questionPlans = Array.isArray(quiz.quizBlueprint?.questionPlan)
      ? quiz.quizBlueprint.questionPlan
      : (quiz.questions || []).map((question) => question.quizPlan).filter(Boolean);
    const bloomCoverage = uniqueList([
      ...(Array.isArray(quiz.bloomsCoverage) ? quiz.bloomsCoverage : []),
      ...questionPlans.map((plan) => plan?.bloom),
      ...(quiz.questions || []).map((question) => question.bloomsLevel),
    ]);
    const roleSequence = questionPlans
      .map((plan) => [plan?.role, plan?.bloom].filter(Boolean).join(' -> '))
      .filter(Boolean);
    const transferPlan =
      questionPlans.find((plan) => /transfer|synthesis/i.test(plan?.role || '')) ||
      (quiz.questions || []).find((question) => /transfer|synthesis/i.test(question.quizPlan?.role || ''))?.quizPlan ||
      null;
    const lesson = lessons[index] || {};
    const hasRetrievalToSynthesis =
      bloomCoverage.includes('Remember') &&
      bloomCoverage.includes('Apply') &&
      bloomCoverage.includes('Analyze') &&
      bloomCoverage.includes('Evaluate') &&
      bloomCoverage.includes('Create') &&
      roleSequence.some((role) => /transfer-synthesis/i.test(role));
    return {
      lessonNumber: lesson.lessonNumber || index + 1,
      lessonTitle: quiz.lessonTitle || lesson.title || `Lesson ${index + 1}`,
      totalQuestions: quiz.totalQuestions || (quiz.questions || []).length || 0,
      bloomCoverage,
      roleSequence,
      transferSynthesisRole: [transferPlan?.role, transferPlan?.bloom].filter(Boolean).join(' -> '),
      transferSynthesisBloom: transferPlan?.bloom || '',
      transferSynthesisSource: transferPlan?.sourceSignal || '',
      transferSynthesisUse: transferPlan?.intendedUse || transferPlan?.use || '',
      hasRetrievalToSynthesis,
      reviewerCue: hasRetrievalToSynthesis
        ? 'Reviewer can verify retrieval, application, analysis, evaluation, and Create-level transfer-synthesis in this quiz.'
        : 'Reviewer should inspect whether this quiz truly progresses from retrieval to synthesis.',
    };
  });
}

const REVIEW_NOISE_KEYS = new Set(['tags']);
const REVIEW_LABEL_OVERRIDES = {
  an: 'Answer',
  ca: 'Category',
  df: 'Difficulty',
  lt: 'Lesson Title',
  q: 'Question',
  qs: 'Questions',
  rc: 'Related Concepts',
  tg: 'Topic Goal',
};

function stripReviewNoise(value) {
  if (Array.isArray(value)) return value.map(stripReviewNoise);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key, entry]) => !REVIEW_NOISE_KEYS.has(key) && entry !== undefined && entry !== null)
      .map(([key, entry]) => [key, stripReviewNoise(entry)]),
  );
}

function reviewLabel(key) {
  const normalizedKey = String(key || '').trim();
  const override = REVIEW_LABEL_OVERRIDES[normalizedKey];
  if (override) return override;
  return String(key || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^./, (char) => char.toUpperCase());
}

function reviewItemTitle(item, index) {
  if (!item || typeof item !== 'object') return `Item ${index + 1}`;
  return (
    item.lessonTitle ||
    item.title ||
    item.artifact ||
    item.courseTitle ||
    item.lt ||
    item.q ||
    item.prompt ||
    `Item ${index + 1}`
  );
}

function renderPrimitiveReviewValue(value) {
  if (typeof value === 'string') return cleanText(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

function renderStructuredReviewValue(value, depth = 0) {
  if (value === null || value === undefined) return '';
  if (typeof value !== 'object') return renderPrimitiveReviewValue(value);

  if (Array.isArray(value)) {
    if (value.length === 0) return '- None';
    if (value.every((item) => item === null || typeof item !== 'object')) {
      return value.map((item) => `- ${renderPrimitiveReviewValue(item)}`).join('\n');
    }
    return value
      .map((item, index) => {
        const heading = `${'#'.repeat(Math.min(6, depth + 3))} ${tableCell(reviewItemTitle(item, index), 120)}`;
        return `${heading}\n\n${renderStructuredReviewValue(item, depth + 1)}`;
      })
      .join('\n\n');
  }

  const sections = [];
  for (const [key, entry] of Object.entries(value)) {
    const label = reviewLabel(key);
    if (entry === null || entry === undefined) continue;
    if (typeof entry !== 'object') {
      const primitive = renderPrimitiveReviewValue(entry);
      if (primitive) sections.push(`- **${label}:** ${primitive}`);
      continue;
    }
    if (Array.isArray(entry) && entry.every((item) => item === null || typeof item !== 'object')) {
      sections.push(`- **${label}:**\n${renderStructuredReviewValue(entry, depth + 1)}`);
      continue;
    }
    const heading = `${'#'.repeat(Math.min(6, depth + 3))} ${label}`;
    sections.push(`${heading}\n\n${renderStructuredReviewValue(entry, depth + 1)}`);
  }
  return sections.join('\n\n');
}

function limitReviewTextForMarkdown(text, limit = FULL_PACKAGE_REVIEW_TEXT_LIMIT) {
  const reviewText = text || 'No compiled artifact content generated.';
  if (reviewText.length <= limit) {
    return {
      reviewText,
      reviewTextTruncated: false,
      reviewTextFullLength: reviewText.length,
      reviewTextLimit: limit,
    };
  }
  const marker = `\n\n[Reviewer-facing Markdown truncated from ${reviewText.length} to ${limit} characters. Inspect fullPackageArtifacts[].reviewData in the paired JSON file for the full structured artifact data.]\n\n`;
  const available = Math.max(0, limit - marker.length);
  const headLength = Math.floor(available * 0.58);
  const tailLength = available - headLength;
  return {
    reviewText: `${reviewText.slice(0, headLength).trim()}${marker}${reviewText
      .slice(Math.max(0, reviewText.length - tailLength))
      .trim()}`,
    reviewTextTruncated: true,
    reviewTextFullLength: reviewText.length,
    reviewTextLimit: limit,
  };
}

function fullPackageArtifact({ featureId, compiled }) {
  const data = compiled[featureId];
  const itemCount = featureId === 'syllabus' ? (data?.syllabus ? 1 : 0) : getFeatureArray(featureId, data).length;
  const reviewData = stripReviewNoise(data);
  const reviewTextResult = limitReviewTextForMarkdown(renderStructuredReviewValue(reviewData));
  return {
    featureId,
    label: FEATURE_LABELS[featureId] || featureId,
    itemCount,
    reviewData,
    ...reviewTextResult,
  };
}

function sourceInputArtifact({ courseMap }) {
  const reviewData = stripReviewNoise(courseMap);
  return {
    courseName: courseMap.courseName || '',
    lessonCount: Array.isArray(courseMap.lessons) ? courseMap.lessons.length : 0,
    reviewData,
    reviewText: renderStructuredReviewValue(reviewData) || 'No source course-map content supplied.',
  };
}

function buildSamplePacket({ sample, runtime, packageVersion }) {
  const courseMap = scopeCourseMap(sample.project.courseMap, sample.scope);
  const sourceInput = sourceInputArtifact({ courseMap });
  const blueprint = runtime.buildCourseBlueprint(courseMap, { enrichment: sample.enrichment || {} });
  const compiledFeatures = runtime.getBlueprintCompiledFeatures(sample.features || FULL_PACKAGE_ARTIFACTS);
  const compiled = runtime.compileBlueprintDeliverables(blueprint, compiledFeatures, {
    configMap: { courseFaq: { questionsPerLesson: 5 } },
    enforceCompilerContract: false,
  });
  const featureSummaries = FULL_PACKAGE_ARTIFACTS.map((featureId) => summarizeFeature({ featureId, compiled }));
  const fullPackageArtifacts = FULL_PACKAGE_ARTIFACTS.map((featureId) => fullPackageArtifact({ featureId, compiled }));
  const lessons = summarizeLessons(blueprint);
  const proofContext = {
    courseModality: blueprint.courseModalityProfile?.primaryMode || 'unknown',
    proofScopeTags: [
      `modality:${blueprint.courseModalityProfile?.primaryMode || 'unknown'}`,
      `scope:${courseMap.lessons.length}`,
      `source-risk:${blueprint.sourceRiskRegister?.status || 'unknown'}`,
      sample.source || 'gold-sample',
    ],
  };
  return {
    sampleId: sample.id,
    label: sample.label,
    courseName: courseMap.courseName,
    projectSource: sample.source || 'gold-sample',
    scope: courseMap.lessons.length,
    reviewedArtifacts: FULL_PACKAGE_ARTIFACTS,
    fullPackageArtifactCount: FULL_PACKAGE_ARTIFACTS.length,
    sourceInput,
    compilerPath: blueprint.compilerPath,
    qualitySignals: blueprint.qualitySignals,
    courseWorkload: blueprint.courseWorkload,
    conceptDependencyGraph: blueprint.conceptDependencyGraph,
    masteryEvidenceMap: blueprint.masteryEvidenceMap,
    evidenceResponseMap: blueprint.evidenceResponseMap,
    learnerContextProfile: blueprint.learnerContextProfile,
    courseModalityProfile: blueprint.courseModalityProfile,
    sourceConflictReport: blueprint.sourceConflictReport,
    sourceRiskRegister: blueprint.sourceRiskRegister,
    compilerDecisionMatrix: blueprint.compilerDecisionMatrix,
    assessmentArchitecture: blueprint.assessmentArchitecture,
    classroomHandoffPlan: blueprint.classroomHandoffPlan,
    blueprintAssumptionLedger: blueprint.blueprintAssumptionLedger,
    packageCoherenceMatrix: blueprint.packageCoherenceMatrix,
    blueprintReviewSurface: blueprint.blueprintReviewSurface,
    lessons,
    quizProgression: summarizeQuizProgression({ compiled, lessons }),
    featureSummaries,
    fullPackageArtifacts,
    fixtureTemplate: makeFixtureTemplate({
      sample,
      packageVersion,
      blueprint,
      assumptionLedger: blueprint.blueprintAssumptionLedger,
      proofContext,
    }),
    editHistoryTemplate: makeEditHistoryTemplate({ sample, packageVersion, proofContext }),
  };
}

function selectSamples(samples, sampleIds = []) {
  if (!Array.isArray(sampleIds) || sampleIds.length === 0) return samples;
  const wanted = new Set(sampleIds);
  return samples.filter((sample) => wanted.has(sample.id));
}

async function loadFixtureFile(fixturePath) {
  if (!fixturePath) return [];
  const raw = JSON.parse(await fs.readFile(fixturePath, 'utf8'));
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw.fixtures)) return raw.fixtures;
  throw new Error(`Fixture file must contain an array or { "fixtures": [...] }: ${fixturePath}`);
}

function fixtureCourseMap(fixture) {
  if (fixture?.project?.courseMap && typeof fixture.project.courseMap === 'object') return fixture.project.courseMap;
  if (fixture?.courseMap && typeof fixture.courseMap === 'object') return fixture.courseMap;
  return null;
}

function assertExternalProjectCourseMapReadyForPacket(fixture, courseMap) {
  const fixtureId = fixture?.id || fixture?.sampleId || fixture?.project?.id || 'unknown-fixture';
  if (!courseMap.courseName) {
    throw new Error(
      `External project fixture ${fixtureId} must include project.courseMap.courseName before generating a review packet.`,
    );
  }
  if (!Array.isArray(courseMap.lessons) || courseMap.lessons.length === 0) {
    throw new Error(
      `External project fixture ${fixtureId} must include project.courseMap.lessons before generating a review packet.`,
    );
  }
  const placeholderPaths = collectUnreplacedTemplatePaths(courseMap, 'project.courseMap');
  if (placeholderPaths.length > 0) {
    throw new Error(
      `External project fixture ${fixtureId} still contains placeholder course-map text at ${placeholderPaths
        .slice(0, 8)
        .join(
          ', ',
        )}. Fill project.courseMap with the real reviewed course before generating source-input or full-package review artifacts.`,
    );
  }
}

async function loadExternalProjectSamplesFromFixtures(fixturePath) {
  const fixtures = await loadFixtureFile(fixturePath);
  const samples = new Map();
  for (const fixture of fixtures) {
    const courseMap = fixtureCourseMap(fixture);
    if (!courseMap) continue;
    assertExternalProjectCourseMapReadyForPacket(fixture, courseMap);
    const id = fixture.sampleId || fixture.project?.id || fixture.id;
    if (!id || samples.has(id)) continue;
    samples.set(id, {
      id,
      label: fixture.project?.label || fixture.label || id,
      source: 'external-project',
      project: {
        ...(fixture.project || {}),
        id,
        courseMap,
      },
      scope: Number(fixture.scope || fixture.project?.scope || courseMap.lessons?.length || 0),
      features:
        Array.isArray(fixture.features) && fixture.features.length > 0 ? fixture.features : FULL_PACKAGE_ARTIFACTS,
      enrichment: fixture.enrichment || {},
    });
  }
  return [...samples.values()];
}

function proofPlanSample(sample, role) {
  const fileName = safeSampleFileName(sample.sampleId);
  return {
    sampleId: sample.sampleId,
    courseName: sample.courseName,
    role,
    scope: sample.scope,
    projectSource: sample.projectSource,
    proofModality: sample.courseModalityProfile?.primaryMode || sample.fixtureTemplate?.reviewEvidence?.courseModality,
    proofScopeTags: sample.fixtureTemplate?.reviewEvidence?.proofScopeTags || [],
    sourceInputPath: `source-inputs/${fileName}.md`,
    blueprintPath: `compact-blueprints/${fileName}.md`,
    fullPackagePath: `full-package/${fileName}.md`,
    reviewIntakePath: `review-intake/${fileName}.md`,
    combinedFixturePath: `fixtures/${fileName}.combined-fixtures.template.json`,
  };
}

function addProofPlanSample(selected, selectedById, sample, role) {
  if (!sample) return null;
  const existing = selectedById.get(sample.sampleId);
  if (existing) {
    if (role && !existing.role.split('; ').includes(role)) existing.role = `${existing.role}; ${role}`;
    return existing;
  }
  const planned = proofPlanSample(sample, role);
  selected.push(planned);
  selectedById.set(planned.sampleId, planned);
  return planned;
}

function proofSampleModality(sample) {
  return (
    sample?.proofModality ||
    sample?.courseModalityProfile?.primaryMode ||
    sample?.fixtureTemplate?.reviewEvidence?.courseModality ||
    null
  );
}

function selectedProofModalities(selected) {
  return new Set(selected.map((sample) => proofSampleModality(sample)).filter(Boolean));
}

function selectScopeProofSample(samplePackets, scope, selected, selectedById) {
  const candidates = samplePackets.filter((sample) => Number(sample.scope) === Number(scope));
  if (candidates.length === 0) return null;

  const currentModalities = selectedProofModalities(selected);
  return (
    candidates.find(
      (sample) => !selectedById.has(sample.sampleId) && !currentModalities.has(proofSampleModality(sample)),
    ) ||
    candidates.find((sample) => !selectedById.has(sample.sampleId)) ||
    candidates[0]
  );
}

function buildRecommendedBundleCoverage(samples) {
  const scopes = [
    ...new Set(samples.map((sample) => Number(sample.scope)).filter((scope) => Number.isFinite(scope) && scope > 0)),
  ].sort((a, b) => a - b);
  const modalities = [...new Set(samples.map((sample) => proofSampleModality(sample)).filter(Boolean))].sort();
  const externalProjectSamples = samples.filter((sample) => sample.projectSource === 'external-project');
  const externalProjectRequiredScopeSamples = externalProjectSamples.filter((sample) =>
    RECOMMENDED_PROOF_SCOPES.includes(Number(sample.scope)),
  );
  const missingScopes = RECOMMENDED_PROOF_SCOPES.filter((scope) => !scopes.includes(scope));
  const missingCoverage = [
    samples.length < 2 ? 'complete proof from at least two reviewed samples' : null,
    modalities.length < 2 ? 'complete proof across at least two teaching modalities' : null,
    externalProjectRequiredScopeSamples.length < 1
      ? 'complete proof from at least one real external project.courseMap at a 5, 8, or 14 lesson proof scope'
      : null,
    missingScopes.length > 0 ? `complete proof for ${missingScopes.join(', ')} lesson scope(s)` : null,
  ].filter(Boolean);

  return {
    status: missingCoverage.length === 0 ? 'ready-for-evidence-collection' : 'needs-more-samples',
    sampleCount: samples.length,
    requiredCompleteProofSamples: 2,
    modalityCount: modalities.length,
    requiredDistinctModalities: 2,
    modalities,
    externalProjectSampleCount: externalProjectSamples.length,
    requiredExternalProjectSamples: 1,
    externalProjectRequiredScopeSampleCount: externalProjectRequiredScopeSamples.length,
    scopeCount: scopes.length,
    requiredScopes: RECOMMENDED_PROOF_SCOPES,
    scopes,
    missingScopes,
    missingCoverage,
  };
}

function buildProofCollectionPlan(samplePackets) {
  const modalities = [
    ...new Set(samplePackets.map((sample) => sample.courseModalityProfile?.primaryMode).filter(Boolean)),
  ].sort();
  const scopeCounts = new Map();
  for (const sample of samplePackets) {
    if (Number.isFinite(Number(sample.scope))) {
      scopeCounts.set(Number(sample.scope), (scopeCounts.get(Number(sample.scope)) || 0) + 1);
    }
  }
  const availableScopes = [...scopeCounts.keys()].sort((a, b) => a - b);
  const externalProjectSamples = samplePackets.filter((sample) => sample.projectSource === 'external-project');
  const externalProjectRequiredScopeSamples = externalProjectSamples.filter((sample) =>
    RECOMMENDED_PROOF_SCOPES.includes(Number(sample.scope)),
  );
  const selected = [];
  const selectedById = new Map();
  const externalProjectSample = externalProjectSamples[0];
  if (externalProjectSample) {
    addProofPlanSample(selected, selectedById, externalProjectSample, 'required real-course proof sample');
  }
  const scopeCoverageSamples = [];
  for (const scope of RECOMMENDED_PROOF_SCOPES) {
    const sampleForScope = selectScopeProofSample(samplePackets, scope, selected, selectedById);
    if (!sampleForScope) continue;
    const planned = addProofPlanSample(selected, selectedById, sampleForScope, `${scope}-lesson scope proof sample`);
    if (planned) scopeCoverageSamples.push(planned);
  }

  for (const sample of samplePackets) {
    const currentModalities = selectedProofModalities(selected);
    if (currentModalities.size >= Math.min(2, modalities.length)) break;
    if (selectedById.has(sample.sampleId)) continue;
    const modality = sample.courseModalityProfile?.primaryMode;
    if (modality && currentModalities.has(modality) && modalities.length > 1) continue;
    addProofPlanSample(
      selected,
      selectedById,
      sample,
      currentModalities.size === 0 ? 'first modality proof sample' : 'additional modality proof sample',
    );
  }
  for (const sample of samplePackets) {
    if (selected.length >= 2) break;
    if (selectedById.has(sample.sampleId)) continue;
    addProofPlanSample(selected, selectedById, sample, 'backup proof sample');
  }

  const missingRequirements = [];
  if (samplePackets.length < 2) {
    missingRequirements.push('Add at least two reviewed course samples to complete strict A-quality proof.');
  }
  if (modalities.length < 2) {
    missingRequirements.push(
      'Add at least two distinct teaching modalities to prove the compiler beyond one course type.',
    );
  }
  if (externalProjectSamples.length < 1) {
    missingRequirements.push(
      'Add at least one filled real external project.courseMap fixture at a 5-, 8-, or 14-lesson proof scope; curated built-in samples cannot certify release quality alone.',
    );
  } else if (externalProjectRequiredScopeSamples.length < 1) {
    missingRequirements.push(
      'Add at least one filled real external project.courseMap fixture at a required 5-, 8-, or 14-lesson proof scope; off-scope real courses can support breadth but cannot satisfy strict A-quality proof alone.',
    );
  }
  const missingRecommendedScopes = RECOMMENDED_PROOF_SCOPES.filter((scope) => !scopeCounts.has(scope));
  if (missingRecommendedScopes.length > 0) {
    missingRequirements.push(
      `Add reviewed course samples for required proof scope(s): ${missingRecommendedScopes.join(', ')} lessons.`,
    );
  }

  return {
    requiredCompleteProofSamples: 2,
    requiredDistinctModalities: 2,
    requiredExternalProjectSamples: 1,
    requiredCompleteProofScopes: RECOMMENDED_PROOF_SCOPES,
    recommendedScopeCoverage: RECOMMENDED_PROOF_SCOPES,
    availableSamples: samplePackets.length,
    availableModalities: modalities,
    availableScopes,
    availableScopeCounts: Object.fromEntries([...scopeCounts.entries()].sort((a, b) => a[0] - b[0])),
    missingRecommendedScopes,
    availableExternalProjectSamples: externalProjectSamples.length,
    readyForStrictExternalCollection: missingRequirements.length === 0,
    missingRequirements,
    recommendedSamples: selected,
    recommendedBundleCoverage: buildRecommendedBundleCoverage(selected),
    scopeCoverageSamples,
    externalProjectTemplate: {
      intakePath: 'review-intake/external-project-course-map.md',
      combinedFixturePath: 'fixtures/external-project.combined-fixtures.template.json',
      reviewFixturePath: 'fixtures/external-project.review-fixture.template.json',
      editHistoryFixturePath: 'fixtures/external-project.edit-history-fixture.template.json',
    },
    recommendedBundleTemplatePath: 'fixtures/recommended-strict-proof-bundle.template.json',
    completedFixtureBundlePath: '/path/to/completed-external-proof-bundle.json',
    preflightCommand: 'npm run audit:expert:preflight -- --fixtures /path/to/completed-external-proof-bundle.json',
    externalGateCommand: 'npm run audit:expert:external -- --fixtures /path/to/completed-external-proof-bundle.json',
  };
}

function buildReviewerCompletionChecklist({ packageVersion, proofCollectionPlan }) {
  const recommendedSamples = proofCollectionPlan?.recommendedSamples || [];
  const externalProjectStatus =
    Number(proofCollectionPlan?.recommendedBundleCoverage?.externalProjectRequiredScopeSampleCount || 0) >=
    Number(proofCollectionPlan?.requiredExternalProjectSamples || 1)
      ? 'ready'
      : 'missing';
  const requiredReviewFixtureFields = [
    'reviewEvidence.reviewedAt',
    'reviewEvidence.reviewedPackageVersion',
    'reviewEvidence.reviewedArtifacts',
    'reviewScorecard.dimensions[].score',
    'reviewScorecard.dimensions[].evidenceArtifacts',
    'reviewScorecard.dimensions[].evidenceExamples',
    'reviewScorecard.dimensions[].notes',
    'sourceFidelityReview.sourceInputReviewed',
    'sourceFidelityReview.compiledPackageReviewed',
    'sourceFidelityReview.artifactReviews[].sourceCompared',
    'sourceFidelityReview.artifactReviews[].packageCompared',
    'sourceFidelityReview.artifactReviews[].sourceSignalsPreserved',
    'sourceFidelityReview.artifactReviews[].compilerDecisionVisible',
    'sourceFidelityReview.artifactReviews[].publishGateVisible',
    'sourceFidelityReview.artifactReviews[].modelUsePolicyVisible',
    'sourceFidelityReview.artifactReviews[].handoffReviewFocusVisible',
    'sourceFidelityReview.artifactReviews[].localReviewActionVisible',
    'sourceFidelityReview.artifactReviews[].notes',
    'blueprintQualityReview.sourceInputReviewed',
    'blueprintQualityReview.compactRepresentationReviewed',
    'blueprintQualityReview.lessonReviews[].sourceCompared',
    'blueprintQualityReview.lessonReviews[].blueprintCompared',
    'blueprintQualityReview.lessonReviews[].sourceSignalsPreserved',
    'blueprintQualityReview.lessonReviews[].assessmentPreserved',
    'blueprintQualityReview.lessonReviews[].alignmentUsable',
    'blueprintQualityReview.lessonReviews[].reviewRequiredFlagsVisible',
    'blueprintQualityReview.lessonReviews[].notes',
    'assumptionLedgerReview.assumptionLedgerReviewed',
    'assumptionLedgerReview.reviewRequiredRowsReviewed',
    'assumptionLedgerReview.reviewedRows[].decision',
    'assumptionLedgerReview.reviewedRows[].notes',
    'packageMustMatch',
    'featureExpectations',
  ];
  const requiredEditHistoryFixtureFields = [
    'reviewEvidence.reviewedAt',
    'reviewEvidence.reviewedPackageVersion',
    'instructorEditPatterns[].featureId',
    'instructorEditPatterns[].field',
    'instructorEditPatterns[].action',
    'instructorEditPatterns[].before',
    'instructorEditPatterns[].after',
    'instructorEditPatterns[].notes',
    'preferenceExpectations',
  ];
  const perSample = recommendedSamples.map((sample) => ({
    sampleId: sample.sampleId,
    courseName: sample.courseName,
    scope: sample.scope,
    modality: sample.proofModality || 'unknown',
    projectSource: sample.projectSource || 'unknown',
    files: {
      sourceInput: sample.sourceInputPath,
      compactBlueprint: sample.blueprintPath,
      fullPackage: sample.fullPackagePath,
      reviewIntake: sample.reviewIntakePath,
      combinedFixture: sample.combinedFixturePath,
    },
    requiredReviewFixtureFields,
    requiredEditHistoryFixtureFields,
  }));

  if (externalProjectStatus !== 'ready') {
    perSample.push({
      sampleId: 'external-reviewed-course-project',
      courseName: 'Replace with real reviewed course map',
      scope: '5, 8, or 14 required',
      modality: 'replace-with-confirmed-course-modality',
      projectSource: 'external-project',
      requiredForCertification: true,
      files: {
        sourceInput: 'generated after external-only packet run',
        compactBlueprint: 'generated after external-only packet run',
        fullPackage: 'generated after external-only packet run',
        reviewIntake: proofCollectionPlan?.externalProjectTemplate?.intakePath,
        combinedFixture: proofCollectionPlan?.externalProjectTemplate?.combinedFixturePath,
      },
      requiredReviewFixtureFields: [
        'project.courseMap.courseName',
        'project.courseMap.lessons[]',
        'reviewEvidence.proofScopeTags',
        ...requiredReviewFixtureFields,
      ],
      requiredEditHistoryFixtureFields,
    });
  }

  return {
    status: proofCollectionPlan?.readyForStrictExternalCollection
      ? 'ready-for-evidence-collection'
      : 'missing-required-samples',
    packageVersion,
    completedFixtureBundlePath: proofCollectionPlan?.completedFixtureBundlePath,
    preflightCommand: proofCollectionPlan?.preflightCommand,
    externalGateCommand: proofCollectionPlan?.externalGateCommand,
    globalItems: [
      {
        id: 'review-current-version',
        status: 'required',
        target: 'reviewEvidence.reviewedPackageVersion',
        requirement: `Set every fixture reviewEvidence.reviewedPackageVersion to ${packageVersion}.`,
      },
      {
        id: 'remove-template-markers',
        status: 'required',
        target: 'templateOnly',
        requirement:
          'Remove top-level and fixture-level templateOnly only after every placeholder has been replaced with real reviewer evidence.',
      },
      {
        id: 'real-external-project',
        status: externalProjectStatus,
        target: proofCollectionPlan?.externalProjectTemplate?.combinedFixturePath,
        requirement:
          'Include one real external project.courseMap fixture at a 5-, 8-, or 14-lesson proof scope; curated samples alone cannot certify release quality.',
      },
      {
        id: 'scope-coverage',
        status:
          (proofCollectionPlan?.recommendedBundleCoverage?.missingScopes || []).length === 0 ? 'ready' : 'missing',
        target: 'reviewEvidence.proofScopeTags',
        requirement: 'Completed proof bundle must cover 5-, 8-, and 14-lesson scopes.',
      },
    ],
    perSample,
  };
}

export async function buildExternalQualityProofPacket(options = {}) {
  const runtime = options.runtime || (await loadHybridPipelineAuditRuntime());
  const packageVersion = options.packageVersion || (await readPackageVersion());
  const curatedSamples =
    options.includeDefaultSamples === false
      ? []
      : selectSamples(
          Array.isArray(options.samples) && options.samples.length > 0 ? options.samples : DEFAULT_GOLD_SAMPLES,
          options.sampleIds,
        );
  const externalProjectSamples = Array.isArray(options.externalProjectSamples)
    ? options.externalProjectSamples
    : await loadExternalProjectSamplesFromFixtures(options.fixturePath);
  if (options.fixturePath && options.includeDefaultSamples === false && externalProjectSamples.length === 0) {
    throw new Error(
      `No external project.courseMap fixtures were found in ${options.fixturePath}. External-only proof packets require at least one real reviewed course map.`,
    );
  }
  const samples = [...curatedSamples, ...externalProjectSamples];
  const samplePackets = samples.map((sample) => buildSamplePacket({ sample, runtime, packageVersion }));
  const proofCollectionPlan = buildProofCollectionPlan(samplePackets);
  const reviewerCompletionChecklist = buildReviewerCompletionChecklist({ packageVersion, proofCollectionPlan });
  return {
    meta: {
      generatedAt: new Date().toISOString(),
      packageVersion,
      note: 'This packet prepares external A-quality proof. It is not proof until complete reviewed samples cover distinct teaching modalities, a real external course map at a required 5/8/14 lesson proof scope, and 5/8/14 lesson scopes overall with full-package scorecards, source-fidelity reviews, blueprint-quality reviews, assumption-ledger decisions, and instructor edit-history evidence.',
    },
    summary: {
      sampleCount: samplePackets.length,
      curatedSampleCount: samplePackets.filter((sample) => sample.projectSource !== 'external-project').length,
      externalProjectSampleCount: samplePackets.filter((sample) => sample.projectSource === 'external-project').length,
      reviewedArtifactCount: FULL_PACKAGE_ARTIFACTS.length,
      scorecardDimensionCount: REVIEW_SCORECARD_DIMENSIONS.length,
      proofRequirements: [
        'At least two course samples carry complete external proof bundles across at least two teaching modalities',
        'At least one complete proof bundle uses a real external project.courseMap fixture at a required 5-, 8-, or 14-lesson proof scope rather than only curated built-in samples',
        'Complete proof bundles cover short-module, standard, and full-semester course lengths: 5, 8, and 14 lessons',
        'Each complete bundle includes a full-package scorecard, source-fidelity review, blueprint-quality review, assumption-ledger decisions, and instructor edit-history evidence tied to the same sample',
        'External reviewer scorecard over the full core package for each proof sample',
        'Reviewer compares each source course map against the compact blueprint before scoring compiled-package quality',
        'Reviewer compares each compiled package against its source course map before scoring source fidelity',
        'All six classroom-quality dimensions scored at or above 9/10 normalized',
        'External instructor edit-history evidence for each reviewed proof sample',
        'Reviewer notes should cite lesson-level teaching intent, modality fit, calibration, feedback, transfer, accessibility, and local-review evidence where relevant',
        'npm run audit:expert:preflight shows every external proof readiness item as pass',
        'npm run audit:expert:external passes with 0 blockers',
      ],
    },
    proofCollectionPlan,
    reviewerCompletionChecklist,
    reviewedArtifacts: FULL_PACKAGE_ARTIFACTS.map((featureId) => ({
      featureId,
      label: FEATURE_LABELS[featureId],
    })),
    scorecardDimensions: REVIEW_SCORECARD_DIMENSIONS.map(([id, label]) => ({
      id,
      label,
      reviewPrompt: REVIEW_SCORECARD_PROMPTS[id],
    })),
    samples: samplePackets,
  };
}

function markdownTable(rows) {
  return rows.join('\n');
}

function renderLessonRows(sample) {
  return sample.lessons.map(
    (lesson) =>
      `| ${lesson.lessonNumber} | ${tableCell(lesson.title, 120)} | ${lesson.sourceConfidence} | ${tableCell(lesson.prerequisitePlan?.diagnosticCheck, 150)} | ${tableCell([lesson.modalityCue, lesson.modalityDecode?.signaturePractice].filter(Boolean).join(' '), 170)} | ${tableCell([lesson.artifactGenre?.genre, lesson.artifactGenre?.outputFormat].filter(Boolean).join(': '), 150)} | ${tableCell(lesson.assessmentArtifact, 120)} | ${tableCell(lesson.evidenceRequirement, 120)} | ${tableCell((lesson.successCriteria || []).join('; '), 160)} |`,
  );
}

function renderCalibrationRows(sample) {
  return sample.lessons.map(
    (lesson) =>
      `| ${lesson.lessonNumber} | ${tableCell(lesson.assessmentValidity?.targetConstruct, 140)} | ${tableCell(lesson.criterionEvidenceCue, 150)} | ${tableCell(lesson.anchorExampleSet?.strongSample, 150)} | ${tableCell(lesson.anchorExampleSet?.partialSample, 150)} | ${tableCell(lesson.gradingCalibrationPlan?.scorerNorming, 150)} | ${tableCell(lesson.gradingCalibrationPlan?.biasCheck, 150)} | ${tableCell(lesson.gradingCalibrationPlan?.studentTransparency, 130)} |`,
  );
}

function renderCriterionWeightRows(sample) {
  return sample.lessons.flatMap((lesson) =>
    (lesson.criterionWeightPlan || []).map(
      (entry) =>
        `| ${lesson.lessonNumber} | ${tableCell(entry.criterion, 120)} | ${entry.weight || 0}% | ${entry.points || 0} | ${tableCell(entry.priority, 90)} | ${tableCell(entry.rationale, 150)} | ${tableCell(entry.evidenceSignal, 150)} | ${tableCell(entry.calibrationUse, 150)} |`,
    ),
  );
}

function renderClassroomEvidenceRows(sample) {
  return sample.lessons.map(
    (lesson) =>
      `| ${lesson.lessonNumber} | ${tableCell(lesson.teachingIntent?.teachingGoal, 150)} | ${tableCell(lesson.feedbackCycle?.studentRevisionAction, 150)} | ${tableCell(lesson.learningTransferPlan?.transferTask, 150)} | ${tableCell(lesson.learnerContextCue, 150)} | ${tableCell(lesson.sourceUsePlan?.noInventedSources, 150)} | ${tableCell(lesson.accessibilityPlan?.participationProtocol, 150)} | ${tableCell((lesson.localReviewNeeded || []).join('; ') || 'None', 120)} |`,
  );
}

function renderLocalReviewActionRows(sample) {
  return sample.lessons.map(
    (lesson) =>
      `| ${lesson.lessonNumber} | ${tableCell(lesson.title, 110)} | ${tableCell(lesson.localReviewState, 90)} | ${tableCell(lesson.publishGate, 110)} | ${tableCell(lesson.sourceRisk?.riskLevel || lesson.compilerDecision?.evidence?.sourceRiskLevel || 'unknown', 80)} | ${tableCell(lesson.compilerDecision?.evidence?.assessmentSource || 'unknown', 90)} | ${tableCell(lesson.localReviewAction, 220)} |`,
  );
}

function renderConceptGraphRows(sample) {
  return sample.lessons.map((lesson) => {
    const plan = lesson.conceptDependencyPlan || {};
    const practice = lesson.practiceProgressionPlan || {};
    return `| ${lesson.lessonNumber} | ${tableCell(practice.priorConcept || '', 90)} | ${tableCell(plan.node?.concept || practice.currentConcept || '', 110)} | ${tableCell(practice.nextConcept || '', 90)} | ${tableCell(practice.practiceFocus || '', 150)} | ${tableCell(practice.evidenceRoutine || '', 150)} | ${tableCell(practice.feedbackRoutine || '', 150)} | ${tableCell(plan.transferCue || practice.transferTask || '', 150)} |`;
  });
}

function renderMasteryEvidenceRows(sample) {
  return sample.lessons.map((lesson) => {
    const plan = lesson.masteryEvidencePlan || {};
    return `| ${lesson.lessonNumber} | ${tableCell(plan.concept || '', 90)} | ${tableCell(plan.diagnosticEvidence || '', 150)} | ${tableCell(plan.guidedPracticeEvidence || '', 150)} | ${tableCell(plan.independentPerformanceEvidence || '', 150)} | ${tableCell(plan.feedbackRevisionEvidence || '', 150)} | ${tableCell(plan.transferEvidence || '', 150)} | ${tableCell(plan.masteryThreshold || '', 150)} |`;
  });
}

function renderEvidenceResponseRows(sample) {
  return sample.lessons.map((lesson) => {
    const plan = lesson.evidenceResponsePlan || {};
    return `| ${lesson.lessonNumber} | ${tableCell(plan.concept || '', 90)} | ${tableCell(plan.readySignal || '', 130)} | ${tableCell(plan.readyMove || '', 140)} | ${tableCell(plan.partialSignal || '', 130)} | ${tableCell(plan.partialMove || '', 140)} | ${tableCell(plan.supportSignal || '', 130)} | ${tableCell(plan.supportMove || '', 140)} | ${tableCell(plan.recheckCue || '', 140)} |`;
  });
}

function renderSessionFeasibilityRows(sample) {
  return sample.lessons.map((lesson) => {
    const plan = lesson.classSessionPlan || {};
    return `| ${lesson.lessonNumber} | ${tableCell(lesson.title, 100)} | ${plan.feasibilityStatus || 'missing'} | ${plan.plannedClassMinutes || ''}/${plan.sessionMinutes || ''} | ${plan.segmentCount || 0} | ${tableCell(plan.studentWorkloadFit?.status || 'missing', 80)} | ${tableCell(plan.studentWorkloadFit?.reviewCue || '', 160)} |`;
  });
}

function renderAssessmentArchitectureRows(sample) {
  return (sample.assessmentArchitecture?.lessonRows || []).map(
    (row) =>
      `| ${row.lessonNumber} | ${tableCell(row.assessmentTitle, 110)} | ${tableCell(row.roleLabel, 80)} | ${row.stakes || ''} | ${row.weightPercent || ''}% | ${tableCell(row.weightProvenance?.source || 'unknown', 100)} | ${row.weightProvenance?.reviewRequired ? 'confirm' : 'source'} | ${tableCell(row.feedbackWindow, 150)} | ${tableCell(row.revisionUse, 150)} |`,
  );
}

function renderQuizProgressionRows(sample) {
  return (sample.quizProgression || []).map(
    (row) =>
      `| ${row.lessonNumber} | ${tableCell(row.lessonTitle, 100)} | ${row.totalQuestions || 0} | ${tableCell((row.bloomCoverage || []).join(', '), 130)} | ${tableCell((row.roleSequence || []).join('; '), 180)} | ${tableCell(row.transferSynthesisRole || 'missing', 90)} | ${tableCell(row.transferSynthesisBloom || 'missing', 80)} | ${tableCell(row.transferSynthesisUse || '', 110)} | ${row.hasRetrievalToSynthesis ? 'yes' : 'review'} | ${tableCell(row.reviewerCue, 160)} |`,
  );
}

function renderSourceProvenanceRows(sample) {
  return sample.lessons.flatMap((lesson) =>
    (lesson.sourceEvidenceTrace?.sourceFields || []).map(
      (field) =>
        `| ${lesson.lessonNumber} | ${tableCell(field.field, 80)} | ${tableCell(field.sourceColumn, 90)} | ${field.source || ''} | ${field.confidence || ''} | ${tableCell(field.rawText, 150)} | ${tableCell(field.compiledValue, 150)} |`,
    ),
  );
}

function renderSectionCoverageRows(sample) {
  return sample.lessons.flatMap((lesson) =>
    (lesson.sourceEvidenceTrace?.sectionCoverage || []).map(
      (section) =>
        `| ${lesson.lessonNumber} | ${section.sectionNumber || ''} | ${tableCell(section.sectionLabel || '', 110)} | ${tableCell((section.sourceColumns || []).join(', '), 130)} | ${tableCell((section.preservedSignals || []).join(', '), 130)} | ${tableCell(section.coverageCue || '', 170)} |`,
    ),
  );
}

function renderSourceRiskRows(sample) {
  return (sample.sourceRiskRegister?.lessonRows || []).map(
    (row) =>
      `| ${row.lessonNumber} | ${tableCell(row.lessonTitle, 100)} | ${row.riskLevel} | ${row.sourceConfidence} | ${row.directCourseMapFieldCount}/${row.sourceFieldCount} | ${row.inferredFieldCount} | ${row.assessmentSource} | ${row.reviewRequired ? 'yes' : 'spot-check'} | ${tableCell((row.reviewFocus || []).join('; '), 180)} |`,
  );
}

function renderSourceConflictRows(sample) {
  return (sample.sourceConflictReport?.lessonRows || []).map(
    (row) =>
      `| ${row.lessonNumber} | ${tableCell(row.lessonTitle, 100)} | ${row.conflictStatus} | ${tableCell(row.conflictLabel || 'none', 90)} | ${tableCell((row.duplicateLessonNumbers || []).join(', ') || 'none', 60)} | ${tableCell((row.conflictFields || []).join(', ') || 'none', 120)} | ${tableCell(row.reviewerAction || 'No duplicate source-row conflict detected.', 180)} |`,
  );
}

function renderBlueprintAssumptionRows(sample) {
  return (sample.blueprintAssumptionLedger?.rows || []).map(
    (row) =>
      `| ${row.lessonNumber || ''} | ${tableCell(row.category, 80)} | ${tableCell(row.assumption, 150)} | ${tableCell(row.evidence, 160)} | ${tableCell(row.source, 90)} | ${tableCell(row.confidence, 70)} | ${row.reviewRequired ? 'yes' : 'spot-check'} | ${tableCell(row.reviewerAction, 180)} |`,
  );
}

function renderAssumptionDecisionIntakeRows(sample) {
  const rows = (sample.blueprintAssumptionLedger?.rows || []).filter((row) => row?.reviewRequired);
  if (rows.length === 0) {
    return ['|  |  |  | No review-required assumption rows in this packet. |  |  |'];
  }
  return rows.map(
    (row) =>
      `| ${row.id || ''} | ${tableCell(row.category, 70)} | ${row.lessonNumber || ''} | ${tableCell(row.assumption, 150)} | ${tableCell(row.reviewerAction, 160)} |  |  |`,
  );
}

function renderCompilerDecisionRows(sample) {
  return (sample.compilerDecisionMatrix?.lessonRows || []).map(
    (row) =>
      `| ${row.lessonNumber} | ${tableCell(row.lessonTitle, 100)} | ${tableCell(row.generationPath, 90)} | ${tableCell(row.publishGate, 110)} | ${row.reviewRequired ? 'yes' : 'spot-check'} | ${row.localRepairUsed ? 'yes' : 'no'} | ${tableCell(row.sourceRiskLevel, 70)} | ${tableCell(row.assessmentSource, 90)} | ${tableCell((row.reviewFocus || []).join('; '), 180)} |`,
  );
}

function renderPackageCoherenceRows(sample) {
  return (sample.packageCoherenceMatrix?.lessonRows || []).map(
    (row) =>
      `| ${row.lessonNumber} | ${tableCell(row.lessonTitle, 100)} | ${tableCell(row.assessmentArtifact, 110)} | ${tableCell(row.artifactGenreCue, 90)} | ${tableCell(row.assessmentWeight, 60)} | ${tableCell(row.assessmentRole, 80)} | ${tableCell(row.assessmentCadenceCue, 120)} | ${tableCell(row.evidenceRequirement, 130)} | ${tableCell(row.compilerDecisionCue, 100)} | ${tableCell(row.publishGate, 100)} | ${tableCell(row.sourceUseCue, 130)} | ${tableCell(row.prerequisiteCue, 130)} | ${tableCell(row.learnerContextCue, 130)} | ${tableCell(row.teachingIntentCue, 130)} | ${tableCell([row.modalityCue, row.modalityDecodeCue].filter(Boolean).join(' '), 150)} | ${tableCell(row.classSessionCue, 90)} | ${tableCell(row.transferTarget, 110)} |`,
  );
}

function renderFeatureRows(sample) {
  return sample.featureSummaries.map(
    (feature) => `| ${feature.label} | ${feature.itemCount} | ${tableCell(feature.excerpt, 220)} |`,
  );
}

function renderFullArtifactRows(sample) {
  return sample.fullPackageArtifacts.map(
    (feature) =>
      `| ${feature.label} | ${feature.itemCount} | ${feature.reviewText.length} | ${feature.reviewTextFullLength || feature.reviewText.length} | ${feature.reviewTextTruncated ? 'yes' : 'no'} |`,
  );
}

function renderSourceLessonRows(sample) {
  const lessons = Array.isArray(sample.sourceInput?.reviewData?.lessons) ? sample.sourceInput.reviewData.lessons : [];
  return lessons.map((lesson, index) => {
    const sections = Array.isArray(lesson.sections) ? lesson.sections : [];
    const sectionText = sections.map((section) => collectStrings(section).join(' ')).join(' ');
    return `| ${index + 1} | ${tableCell(lesson.title || `Lesson ${index + 1}`, 120)} | ${tableCell(sectionText, 260)} |`;
  });
}

function renderReviewerChecklistRows(payload) {
  return payload.reviewedArtifacts.map((artifact) => `| ${artifact.label} | ${artifact.featureId} | [ ] |  |`);
}

function renderProofCollectionPlanRows(plan) {
  return (plan?.recommendedSamples || []).map(
    (sample) =>
      `| ${sample.sampleId} | ${tableCell(sample.courseName, 120)} | ${sample.role} | ${sample.scope || ''} | ${sample.proofModality || 'unknown'} | ${sample.projectSource || 'unknown'} | \`${sample.sourceInputPath}\` | \`${sample.blueprintPath}\` | \`${sample.fullPackagePath}\` | \`${sample.combinedFixturePath}\` |`,
  );
}

function renderProofScopeCoverageRows(plan) {
  return (plan?.recommendedScopeCoverage || []).map((scope) => {
    const sample = (plan?.scopeCoverageSamples || []).find((item) => Number(item.scope) === Number(scope));
    const count = plan?.availableScopeCounts?.[scope] || 0;
    if (!sample) return `| ${scope} | missing | ${count} | none | none | none |`;
    return `| ${scope} | ready | ${count} | ${sample.sampleId} | ${sample.proofModality || 'unknown'} | \`${sample.combinedFixturePath}\` |`;
  });
}

function renderRecommendedBundleCoverageRows(plan) {
  const coverage = plan?.recommendedBundleCoverage || {};
  const sampleStatus =
    Number(coverage.sampleCount || 0) >= Number(coverage.requiredCompleteProofSamples || 0) ? 'ready' : 'missing';
  const modalityStatus =
    Number(coverage.modalityCount || 0) >= Number(coverage.requiredDistinctModalities || 0) ? 'ready' : 'missing';
  const projectStatus =
    Number(coverage.externalProjectRequiredScopeSampleCount || 0) >=
    Number(coverage.requiredExternalProjectSamples || 0)
      ? 'ready'
      : 'missing';
  const scopeStatus = (coverage.missingScopes || []).length === 0 ? 'ready' : 'missing';
  return [
    `| Complete proof samples | ${sampleStatus} | ${coverage.sampleCount || 0}/${coverage.requiredCompleteProofSamples || 0} | ${
      coverage.sampleCount ? 'recommended bundle has enough reviewed samples' : 'add reviewed samples'
    } |`,
    `| Teaching modalities | ${modalityStatus} | ${coverage.modalityCount || 0}/${coverage.requiredDistinctModalities || 0} | ${
      coverage.modalities?.length ? coverage.modalities.join(', ') : 'add a second modality'
    } |`,
    `| Real external course map at required scope | ${projectStatus} | ${coverage.externalProjectRequiredScopeSampleCount || 0}/${coverage.requiredExternalProjectSamples || 0} | ${
      projectStatus === 'ready'
        ? 'external project sample included at a required proof scope'
        : 'add a filled 5-, 8-, or 14-lesson project.courseMap fixture'
    } |`,
    `| Lesson scopes | ${scopeStatus} | ${coverage.scopeCount || 0}/${coverage.requiredScopes?.length || 0} | ${
      scopeStatus === 'ready'
        ? `covered ${coverage.scopes?.join(', ')}`
        : `missing ${(coverage.missingScopes || []).join(', ') || 'required scopes'}`
    } |`,
  ];
}

function renderReviewerCompletionGlobalRows(checklist) {
  return (checklist?.globalItems || []).map(
    (item) => `| ${item.id} | ${item.status} | ${tableCell(item.target, 120)} | ${tableCell(item.requirement, 220)} |`,
  );
}

function renderReviewerCompletionSampleRows(checklist) {
  return (checklist?.perSample || []).map(
    (sample) =>
      `| ${sample.sampleId} | ${tableCell(sample.courseName, 120)} | ${sample.scope || ''} | ${sample.modality || 'unknown'} | ${sample.projectSource || 'unknown'} | ${sample.requiredReviewFixtureFields?.length || 0} | ${sample.requiredEditHistoryFixtureFields?.length || 0} | \`${sample.files?.combinedFixture || ''}\` |`,
  );
}

function renderSampleIndexRows(payload) {
  return (payload.samples || []).map((sample) => {
    const fileName = safeSampleFileName(sample.sampleId);
    const inRecommendedBundle = (payload.proofCollectionPlan?.recommendedSamples || []).some(
      (item) => item.sampleId === sample.sampleId,
    );
    return `| ${sample.sampleId} | ${tableCell(sample.courseName, 120)} | ${sample.scope || ''} | ${sample.courseModalityProfile?.primaryMode || 'unknown'} | ${sample.projectSource || 'unknown'} | ${inRecommendedBundle ? 'yes' : 'no'} | \`source-inputs/${fileName}.md\` | \`compact-blueprints/${fileName}.md\` | \`full-package/${fileName}.md\` | \`review-intake/${fileName}.md\` |`;
  });
}

function mainPacketDetailSamples(payload) {
  const detailIds = new Set((payload.proofCollectionPlan?.recommendedSamples || []).map((sample) => sample.sampleId));
  if (detailIds.size === 0) return payload.samples || [];
  const recommended = (payload.samples || []).filter((sample) => detailIds.has(sample.sampleId));
  return recommended.length > 0 ? recommended : payload.samples || [];
}

function renderSourceFidelityArtifactIntakeRows(payload) {
  return payload.reviewedArtifacts.map(
    (artifact) => `| ${artifact.label} | ${artifact.featureId} |  |  |  |  |  |  |  |  |  |`,
  );
}

function renderBlueprintQualityIntakeRows(sample) {
  const lessons = Array.isArray(sample.lessons) ? sample.lessons : [];
  if (lessons.length === 0) return ['|  |  |  |  |  |  |  |  |  |'];
  return lessons.map(
    (lesson) => `| ${lesson.lessonNumber || ''} | ${tableCell(lesson.title, 120)} |  |  |  |  |  |  |  |`,
  );
}

function renderScorecardIntakeRows(payload) {
  return payload.scorecardDimensions.map(
    (dimension) => `| ${dimension.label} | ${tableCell(dimension.reviewPrompt, 180)} |  /5 |  |  |  |`,
  );
}

export function renderReviewerCompletionChecklistMarkdown(payload) {
  const checklist = payload.reviewerCompletionChecklist || {};
  const externalProjectChecklist = (checklist.perSample || []).find((sample) => sample.requiredForCertification);
  const lines = [
    '# CourseMapper Reviewer Completion Checklist',
    '',
    `Generated: ${payload.meta.generatedAt}`,
    `Package version: ${payload.meta.packageVersion}`,
    `Status: ${checklist.status || 'unknown'}`,
    '',
    'Use this checklist before running the external proof preflight. It maps the strict A-quality proof requirements to the exact fixture fields reviewers or instructors must complete.',
    '',
    '## Global Completion Items',
    '',
    markdownTable([
      '| Item | Status | Fixture Field / File | Requirement |',
      '| --- | --- | --- | --- |',
      ...(checklist.globalItems?.length
        ? renderReviewerCompletionGlobalRows(checklist)
        : ['| none | unknown |  | No checklist items generated. |']),
    ]),
    '',
    '## Recommended Proof Samples',
    '',
    markdownTable([
      '| Sample | Course | Scope | Modality | Source | Review Fields | Edit-History Fields | Combined Fixture |',
      '| --- | --- | ---: | --- | --- | ---: | ---: | --- |',
      ...(checklist.perSample?.length
        ? renderReviewerCompletionSampleRows(checklist)
        : ['| none | none |  | none | none | 0 | 0 | none |']),
    ]),
    '',
    '## Required Review Fixture Fields',
    '',
    ...(checklist.perSample?.[0]?.requiredReviewFixtureFields || []).map((field) => `- \`${field}\``),
    '',
    ...(externalProjectChecklist
      ? [
          '## Required Real External Course Fields',
          '',
          ...externalProjectChecklist.requiredReviewFixtureFields.map((field) => `- \`${field}\``),
          '',
        ]
      : []),
    '## Required Edit-History Fixture Fields',
    '',
    ...(checklist.perSample?.[0]?.requiredEditHistoryFixtureFields || []).map((field) => `- \`${field}\``),
    '',
    '## Commands',
    '',
    '```bash',
    checklist.preflightCommand || 'npm run audit:expert:preflight -- --fixtures /path/to/completed-fixtures.json',
    checklist.externalGateCommand || 'npm run audit:expert:external -- --fixtures /path/to/completed-fixtures.json',
    '```',
  ];

  return `${lines.join('\n')}\n`;
}

export function renderExternalQualityProofPacketMarkdown(payload) {
  const detailSamples = mainPacketDetailSamples(payload);
  const lines = [
    '# CourseMapper External Quality Proof Packet',
    '',
    `Generated: ${payload.meta.generatedAt}`,
    `Package version: ${payload.meta.packageVersion}`,
    '',
    '## Purpose',
    '',
    payload.meta.note,
    '',
    '## Reviewer Instructions',
    '',
    '1. Compare the source course map to the compact blueprint before reviewing compiled artifacts.',
    '2. Review every core artifact listed below, not only selected examples.',
    '3. Score each classroom-quality dimension on the 5-point scorecard.',
    '4. Complete combined fixtures for enough course samples to cover distinct teaching modalities, one real external course map at a required 5/8/14 lesson scope, and the required 5/8/14 lesson scopes overall.',
    '5. Add concrete reviewer-required expectations or edit checks where the package needs proof.',
    '6. Remove `templateOnly` only after real external evidence replaces placeholder text.',
    '7. Run `npm run audit:expert:preflight -- --fixtures /path/to/external-review-fixtures.json` with the completed fixtures.',
    '8. Treat the package as externally proven only when the preflight readiness checklist and `npm run audit:expert:external` both pass with 0 blockers.',
    '',
    'For the required real-course proof sample, start from `fixtures/external-project.combined-fixtures.template.json` and replace `project.courseMap` with a reviewed 5-, 8-, or 14-lesson course map.',
    'After filling the real course map, run `npm run audit:expert:packet -- --fixtures /path/to/external-project.combined-fixtures.json --external-only` to generate source-input and full-package review artifacts for that course.',
    '',
    '## Proof Requirements',
    '',
    ...payload.summary.proofRequirements.map((item) => `- ${item}`),
    '',
    '## Proof Collection Plan',
    '',
    `Ready for strict external collection: ${payload.proofCollectionPlan?.readyForStrictExternalCollection ? 'yes' : 'no'}`,
    `Available samples: ${payload.proofCollectionPlan?.availableSamples || 0}`,
    `Available teaching modalities: ${
      payload.proofCollectionPlan?.availableModalities?.length
        ? payload.proofCollectionPlan.availableModalities.join(', ')
        : 'none'
    }`,
    `Available course scopes: ${
      payload.proofCollectionPlan?.availableScopes?.length
        ? payload.proofCollectionPlan.availableScopes.join(', ')
        : 'none'
    }`,
    `Available external project samples: ${payload.proofCollectionPlan?.availableExternalProjectSamples || 0}`,
    `Recommended scope coverage: ${(payload.proofCollectionPlan?.recommendedScopeCoverage || []).join(', ')}`,
    `Recommended bundle coverage: ${payload.proofCollectionPlan?.recommendedBundleCoverage?.status || 'unknown'}`,
    '',
    ...(payload.proofCollectionPlan?.missingRequirements?.length
      ? [
          '### Missing Before Strict Proof',
          '',
          ...payload.proofCollectionPlan.missingRequirements.map((item) => `- ${item}`),
          '',
        ]
      : [
          '### Missing Before Strict Proof',
          '',
          '- None. The packet has enough sample coverage to collect strict proof evidence.',
          '',
        ]),
    '### Recommended Strict Proof Bundle Samples',
    '',
    markdownTable([
      '| Sample | Course | Role | Scope | Modality | Source | Source Input | Blueprint | Full Package | Combined Fixture |',
      '| --- | --- | --- | ---: | --- | --- | --- | --- | --- | --- |',
      ...(payload.proofCollectionPlan?.recommendedSamples?.length
        ? renderProofCollectionPlanRows(payload.proofCollectionPlan)
        : ['| none | none | none |  | none | none | none | none | none | none |']),
    ]),
    '',
    '### Recommended Bundle Coverage',
    '',
    markdownTable([
      '| Requirement | Status | Coverage | Detail |',
      '| --- | --- | ---: | --- |',
      ...renderRecommendedBundleCoverageRows(payload.proofCollectionPlan),
    ]),
    '',
    '### Recommended Scope Coverage',
    '',
    markdownTable([
      '| Scope | Status | Available Samples | Suggested Sample | Modality | Combined Fixture |',
      '| ---: | --- | ---: | --- | --- | --- |',
      ...(payload.proofCollectionPlan?.recommendedScopeCoverage?.length
        ? renderProofScopeCoverageRows(payload.proofCollectionPlan)
        : ['| none | none | 0 | none | none | none |']),
    ]),
    '',
    '### Required Commands',
    '',
    'After reviewers complete the selected combined fixture templates, place the completed fixtures in one private bundle and run:',
    '',
    '```bash',
    payload.proofCollectionPlan?.preflightCommand ||
      'npm run audit:expert:preflight -- --fixtures /path/to/fixtures.json',
    payload.proofCollectionPlan?.externalGateCommand ||
      'npm run audit:expert:external -- --fixtures /path/to/fixtures.json',
    '```',
    '',
    `Recommended strict-proof bundle template: \`${payload.proofCollectionPlan?.recommendedBundleTemplatePath || 'fixtures/recommended-strict-proof-bundle.template.json'}\``,
    `External project starting point: \`${payload.proofCollectionPlan?.externalProjectTemplate?.combinedFixturePath || 'fixtures/external-project.combined-fixtures.template.json'}\``,
    `Reviewer completion checklist: \`review-intake/reviewer-completion-checklist.md\``,
    '',
    '### Reviewer Completion Checklist',
    '',
    markdownTable([
      '| Item | Status | Fixture Field / File | Requirement |',
      '| --- | --- | --- | --- |',
      ...renderReviewerCompletionGlobalRows(payload.reviewerCompletionChecklist),
    ]),
    '',
    markdownTable([
      '| Sample | Course | Scope | Modality | Source | Review Fields | Edit-History Fields | Combined Fixture |',
      '| --- | --- | ---: | --- | --- | ---: | ---: | --- |',
      ...renderReviewerCompletionSampleRows(payload.reviewerCompletionChecklist),
    ]),
    '',
    ...(payload.reviewerCompletionChecklist?.perSample?.[0]?.requiredReviewFixtureFields?.length
      ? [
          'Required review fixture fields include:',
          '',
          ...payload.reviewerCompletionChecklist.perSample[0].requiredReviewFixtureFields
            .slice(0, 8)
            .map((field) => `- \`${field}\``),
          '',
        ]
      : []),
    '## Reviewed Artifacts',
    '',
    markdownTable([
      '| Artifact | Feature ID |',
      '| --- | --- |',
      ...payload.reviewedArtifacts.map((artifact) => `| ${artifact.label} | ${artifact.featureId} |`),
    ]),
    '',
    '## Scorecard Dimensions',
    '',
    markdownTable([
      '| Dimension | ID | Reviewer Question |',
      '| --- | --- | --- |',
      ...payload.scorecardDimensions.map(
        (dimension) => `| ${dimension.label} | ${dimension.id} | ${tableCell(dimension.reviewPrompt, 220)} |`,
      ),
    ]),
    '',
    '## Available Sample File Index',
    '',
    `Detailed evidence sections below are limited to ${detailSamples.length} recommended strict-proof bundle sample(s). Every available sample still has source-input, compact-blueprint, full-package, reviewer-intake, and fixture-template files on disk.`,
    '',
    markdownTable([
      '| Sample | Course | Scope | Modality | Source | In Recommended Bundle | Source Input | Blueprint | Full Package | Intake Form |',
      '| --- | --- | ---: | --- | --- | --- | --- | --- | --- | --- |',
      ...renderSampleIndexRows(payload),
    ]),
  ];

  for (const sample of detailSamples) {
    lines.push(
      '',
      `## ${sample.sampleId}`,
      '',
      `Course: ${sample.courseName}`,
      `Scope: ${sample.scope} lessons`,
      `Compiler path: ${sample.compilerPath?.source || 'unknown'}`,
      `Quality confidence: ${sample.qualitySignals?.confidenceLevel || 'unknown'}`,
      `Timing status: ${sample.courseWorkload?.timingStatus || 'unknown'} (${sample.courseWorkload?.averagePlannedClassMinutes || 0} average live minutes)`,
      `Concept graph: ${sample.conceptDependencyGraph?.status || 'unknown'} (${sample.conceptDependencyGraph?.nodeCount || 0} nodes, ${sample.conceptDependencyGraph?.edgeCount || 0} edges)`,
      `Mastery evidence: ${sample.masteryEvidenceMap?.status || 'unknown'} (${sample.masteryEvidenceMap?.checkedStages?.length || 0} stages checked)`,
      `Evidence responses: ${sample.evidenceResponseMap?.status || 'unknown'} (${sample.evidenceResponseMap?.checkedStates?.length || 0} states checked)`,
      `Learner context: ${tableCell(sample.learnerContextProfile?.coursePerformanceRole || 'Not supplied', 220)}`,
      `Course modality: ${sample.courseModalityProfile?.primaryMode || 'unknown'} - ${tableCell(sample.courseModalityProfile?.sessionPattern || 'Not supplied', 220)}`,
      `Source conflicts: ${sample.sourceConflictReport?.status || 'unknown'} (${sample.sourceConflictReport?.duplicateLessonCount || 0} affected lessons)`,
      `Source risk: ${sample.sourceRiskRegister?.status || 'unknown'} (${sample.sourceRiskRegister?.highRiskCount || 0} high, ${sample.sourceRiskRegister?.mediumRiskCount || 0} medium)`,
      `Compiler decisions: ${sample.compilerDecisionMatrix?.status || 'unknown'} (${sample.compilerDecisionMatrix?.reviewRequiredCount || 0} review-required, ${sample.compilerDecisionMatrix?.localRepairCount || 0} local repair)`,
      `Assessment architecture: ${sample.assessmentArchitecture?.status || 'unknown'} (${sample.assessmentArchitecture?.totalWeightPercent || 0}% total weight)`,
      `Assumption ledger: ${sample.blueprintAssumptionLedger?.status || 'unknown'} (${sample.blueprintAssumptionLedger?.reviewRequiredCount || 0} review item(s))`,
      `Human-Readable Blueprint Review Surface: ${sample.blueprintReviewSurface?.status || 'unknown'} (${sample.blueprintReviewSurface?.localConfirmationSummary?.sourceReviewRequiredCount ?? 0} source-review lesson(s))`,
      `Traceability: ${sample.blueprintReviewSurface?.traceabilitySummary?.status || 'unknown'} (${sample.blueprintReviewSurface?.traceabilitySummary?.untraceableRows ?? 0} untraceable row(s); Answerability checked)`,
      `Instructional moves: ${sample.blueprintReviewSurface?.instructionalMoveDecode?.status || 'unknown'} (${sample.blueprintReviewSurface?.traceabilitySummary?.instructionalMoveRows ?? 0}/${sample.scope} lesson rows)`,
      `Handoff status: ${sample.classroomHandoffPlan?.status || 'unknown'}`,
      `Package coherence: ${sample.packageCoherenceMatrix?.status || 'unknown'} (${sample.packageCoherenceMatrix?.checkedArtifacts?.length || 0} artifacts checked)`,
      `Publish boundary: ${tableCell(sample.classroomHandoffPlan?.publishBoundary || 'Not supplied', 220)}`,
      `Source input review files: \`source-inputs/${sample.sampleId}.md\` and \`source-inputs/${sample.sampleId}.json\``,
      `Compact blueprint review files: \`compact-blueprints/${sample.sampleId}.md\` and \`compact-blueprints/${sample.sampleId}.json\``,
      `Full-package review files: \`full-package/${sample.sampleId}.md\` and \`full-package/${sample.sampleId}.json\``,
      `Reviewer intake form: \`review-intake/${sample.sampleId}.md\``,
      `Fixture templates: \`fixtures/${sample.sampleId}.combined-fixtures.template.json\`, \`fixtures/${sample.sampleId}.review-fixture.template.json\`, and \`fixtures/${sample.sampleId}.edit-history-fixture.template.json\``,
      '',
      '### Lesson Evidence',
      '',
      markdownTable([
        '| Lesson | Title | Confidence | Prerequisite Check | Modality Fit | Artifact Genre | Assessment Artifact | Evidence Requirement | Success Criteria |',
        '| ---: | --- | --- | --- | --- | --- | --- | --- | --- |',
        ...renderLessonRows(sample),
      ]),
      '',
      '### Calibration Evidence',
      '',
      markdownTable([
        '| Lesson | Target Construct | Criterion Evidence | Strong Anchor | Partial Anchor | Scorer Norming | Bias Check | Student Transparency |',
        '| ---: | --- | --- | --- | --- | --- | --- | --- |',
        ...renderCalibrationRows(sample),
      ]),
      '',
      '### Criterion Weighting',
      '',
      markdownTable([
        '| Lesson | Criterion | Weight | Points | Priority | Rationale | Evidence Signal | Calibration Use |',
        '| ---: | --- | ---: | ---: | --- | --- | --- | --- |',
        ...renderCriterionWeightRows(sample),
      ]),
      '',
      '### Classroom Evidence',
      '',
      markdownTable([
        '| Lesson | Teaching Intent | Feedback / Revision | Transfer | Learner Context | Source Integrity | Accessibility / Participation | Local Review Flags |',
        '| ---: | --- | --- | --- | --- | --- | --- | --- |',
        ...renderClassroomEvidenceRows(sample),
      ]),
      '',
      '### Concept Dependency Graph',
      '',
      markdownTable([
        '| Lesson | Prior Concept | Current Concept | Next Concept | Practice Focus | Evidence Routine | Feedback Routine | Transfer Edge |',
        '| ---: | --- | --- | --- | --- | --- | --- | --- |',
        ...renderConceptGraphRows(sample),
      ]),
      '',
      '### Mastery Evidence',
      '',
      markdownTable([
        '| Lesson | Concept | Diagnostic Evidence | Guided Practice Evidence | Independent Performance | Feedback Revision | Transfer Evidence | Mastery Threshold |',
        '| ---: | --- | --- | --- | --- | --- | --- | --- |',
        ...renderMasteryEvidenceRows(sample),
      ]),
      '',
      '### Evidence Response Decisions',
      '',
      markdownTable([
        '| Lesson | Concept | Ready Signal | Ready Response | Partial Signal | Partial Response | Support Signal | Support Response | Recheck Cue |',
        '| ---: | --- | --- | --- | --- | --- | --- | --- | --- |',
        ...renderEvidenceResponseRows(sample),
      ]),
      '',
      '### Session Feasibility',
      '',
      markdownTable([
        '| Lesson | Title | Timing Status | Planned / Session Minutes | Phases | Workload Fit | Reviewer Cue |',
        '| ---: | --- | --- | --- | ---: | --- | --- |',
        ...renderSessionFeasibilityRows(sample),
      ]),
      '',
      '### Assessment Architecture',
      '',
      markdownTable([
        '| Lesson | Assessment | Role | Stakes | Weight | Weight Source | Weight Review | Feedback Window | Revision Use |',
        '| ---: | --- | --- | --- | ---: | --- | --- | --- | --- |',
        ...renderAssessmentArchitectureRows(sample),
      ]),
      '',
      '### Quiz Progression Evidence',
      '',
      markdownTable([
        '| Lesson | Title | Questions | Bloom Coverage | Source-Grounded Question Roles | Transfer Synthesis Role | Transfer Synthesis Bloom | Transfer Use | Retrieval-To-Synthesis | Reviewer Cue |',
        '| ---: | --- | ---: | --- | --- | --- | --- | --- | --- | --- |',
        ...renderQuizProgressionRows(sample),
      ]),
      '',
      '### Source Provenance',
      '',
      markdownTable([
        '| Lesson | Blueprint Field | Source Column | Source | Confidence | Raw Source Text | Compiled Value |',
        '| ---: | --- | --- | --- | --- | --- | --- |',
        ...renderSourceProvenanceRows(sample),
      ]),
      '',
      '### Section Coverage',
      '',
      markdownTable([
        '| Lesson | Section | Section Label | Source Columns | Preserved Signals | Coverage Cue |',
        '| ---: | ---: | --- | --- | --- | --- |',
        ...renderSectionCoverageRows(sample),
      ]),
      '',
      '### Source Risk Register',
      '',
      markdownTable([
        '| Lesson | Title | Risk | Source Confidence | Direct Fields | Inferred Fields | Assessment Source | Review Required | Reviewer Focus |',
        '| ---: | --- | --- | --- | ---: | ---: | --- | --- | --- |',
        ...renderSourceRiskRows(sample),
      ]),
      '',
      '### Source Conflict Report',
      '',
      markdownTable([
        '| Lesson | Title | Conflict Status | Conflict Label | Duplicate Lessons | Conflict Fields | Reviewer Action |',
        '| ---: | --- | --- | --- | --- | --- | --- |',
        ...renderSourceConflictRows(sample),
      ]),
      '',
      '### Blueprint Assumption Ledger',
      '',
      markdownTable([
        '| Lesson | Category | Assumption | Evidence | Source | Confidence | Review Required | Reviewer Action |',
        '| ---: | --- | --- | --- | --- | --- | --- | --- |',
        ...renderBlueprintAssumptionRows(sample),
      ]),
      '',
      '### Compiler Decisions',
      '',
      markdownTable([
        '| Lesson | Title | Generation Path | Publish Gate | Review Required | Local Repair | Source Risk | Assessment Source | Review Focus |',
        '| ---: | --- | --- | --- | --- | --- | --- | --- | --- |',
        ...renderCompilerDecisionRows(sample),
      ]),
      '',
      '### Local Review Actions',
      '',
      markdownTable([
        '| Lesson | Title | Review State | Publish Gate | Source Risk | Assessment Source | Local Review Action |',
        '| ---: | --- | --- | --- | --- | --- | --- |',
        ...renderLocalReviewActionRows(sample),
      ]),
      '',
      '### Package Coherence Matrix',
      '',
      markdownTable([
        '| Lesson | Title | Artifact | Artifact Genre | Weight | Assessment Role | Assessment Cadence | Evidence Requirement | Compiler Decision | Publish Gate | Source Rule | Prerequisite Check | Learner Context | Teaching Intent | Modality Fit | Class Timing | Transfer Target |',
        '| ---: | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
        ...renderPackageCoherenceRows(sample),
      ]),
      '',
      '### Artifact Review Excerpts',
      '',
      markdownTable(['| Artifact | Items | Excerpt |', '| --- | ---: | --- |', ...renderFeatureRows(sample)]),
      '',
      '### Full Artifact Inventory',
      '',
      markdownTable([
        '| Artifact | Items | Markdown Characters | Full Structured Text Characters | Truncated |',
        '| --- | ---: | ---: | ---: | --- |',
        ...renderFullArtifactRows(sample),
      ]),
      '',
      '### Fixture Template',
      '',
      'Use the corresponding `fixtureTemplate` and `editHistoryTemplate` in the JSON packet output. Keep real reviewer data outside the repo if it contains private information.',
    );
  }

  return `${lines.join('\n')}\n`;
}

export function renderExternalReviewIntakeMarkdown(payload, sample) {
  const lines = [
    '# CourseMapper External Review Intake Form',
    '',
    `Generated: ${payload.meta.generatedAt}`,
    `Package version: ${payload.meta.packageVersion}`,
    `Sample: ${sample.sampleId}`,
    `Course: ${sample.courseName}`,
    '',
    '## Files To Review',
    '',
    `- Source course-map Markdown: \`../source-inputs/${sample.sampleId}.md\``,
    `- Source course-map JSON: \`../source-inputs/${sample.sampleId}.json\``,
    `- Compact blueprint Markdown: \`../compact-blueprints/${sample.sampleId}.md\``,
    `- Compact blueprint JSON: \`../compact-blueprints/${sample.sampleId}.json\``,
    `- Full compiled package Markdown: \`../full-package/${sample.sampleId}.md\``,
    `- Full compiled package JSON: \`../full-package/${sample.sampleId}.json\``,
    `- Combined external proof fixture template: \`../fixtures/${sample.sampleId}.combined-fixtures.template.json\``,
    `- Review fixture JSON template: \`../fixtures/${sample.sampleId}.review-fixture.template.json\``,
    `- Instructor edit-history fixture JSON template: \`../fixtures/${sample.sampleId}.edit-history-fixture.template.json\``,
    '',
    '## Reviewer Metadata',
    '',
    '- Reviewer role:',
    '- Reviewer type:',
    '- Reviewed at:',
    '- Evidence source:',
    '- Reviewed package version:',
    '',
    '## Artifact Checklist',
    '',
    'First compare the source course-map files against the compact blueprint, then compare the compiled package against both. Confirm that lesson order, assessments, source limits, and local-review needs were preserved before scoring quality.',
    '',
    markdownTable([
      '| Artifact | Feature ID | Reviewed? | Notes |',
      '| --- | --- | --- | --- |',
      ...renderReviewerChecklistRows(payload),
    ]),
    '',
    '## A-Quality Scorecard',
    '',
    'Use a 5-point scale. To count as A-quality proof, every dimension must score at least 4.5/5, which normalizes to 9/10.',
    '',
    markdownTable([
      '| Dimension | Reviewer Question | Score /5 | Reviewed Artifact(s) | Concrete Evidence Example | Evidence Notes |',
      '| --- | --- | ---: | --- | --- | --- |',
      ...renderScorecardIntakeRows(payload),
    ]),
    '',
    '## Required Reviewer Expectations',
    '',
    '- Package must include:',
    '- Package must not include:',
    '- Lesson-plan expectation:',
    '- Assignment expectation:',
    '- Rubric expectation:',
    '- Quiz/exam-bank expectation:',
    '',
    '## Source-Fidelity Review',
    '',
    '- Source input reviewed: yes/no',
    '- Compiled package reviewed: yes/no',
    '- Lesson order preserved: yes/no',
    '- Assessments preserved: yes/no',
    '- Unsupported invention risk: none/low/medium/high',
    '- Notes comparing source course map to compiled package:',
    '',
    markdownTable([
      '| Artifact | Feature ID | Source Compared? | Package Compared? | Source Signals Preserved? | Compiler Decision Visible? | Publish Gate Visible? | Model-Use Policy Visible? | Handoff Review Focus Visible? | Local Review Action Visible? | Evidence Notes |',
      '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
      ...renderSourceFidelityArtifactIntakeRows(payload),
    ]),
    '',
    '## Blueprint-Quality Review',
    '',
    '- Source input reviewed: yes/no',
    '- Compact blueprint reviewed: yes/no',
    '- Compact representation usable for compilation: yes/no',
    '- Source signals preserved: yes/no',
    '- Assessments preserved: yes/no',
    '- Instructional alignment usable: yes/no',
    '- Unresolved blueprint risk: none/low/medium/high',
    '- Notes comparing source course map to compact blueprint:',
    '',
    markdownTable([
      '| Lesson | Blueprint Lesson | Source Compared? | Blueprint Compared? | Source Signals Preserved? | Assessment Preserved? | Alignment Usable? | Review Flags Visible? | Evidence Notes |',
      '| ---: | --- | --- | --- | --- | --- | --- | --- | --- |',
      ...renderBlueprintQualityIntakeRows(sample),
    ]),
    '',
    '## Assumption-Ledger Review',
    '',
    '- Blueprint assumption ledger reviewed: yes/no',
    '- Categories reviewed:',
    '- Review-required rows inspected: yes/no',
    '- Reviewer decisions recorded for each review-required row: yes/no',
    '- Unresolved assumption risk: none/low/medium/high',
    '- Notes on inferred assumptions and local confirmations:',
    '',
    markdownTable([
      '| Row ID | Category | Lesson | Assumption | Reviewer Action | Reviewer Decision | Evidence Notes |',
      '| --- | --- | ---: | --- | --- | --- | --- |',
      ...renderAssumptionDecisionIntakeRows(sample),
    ]),
    '',
    '## Instructor Edit-History Evidence',
    '',
    'Complete this section only when real accepted instructor edits are available.',
    '',
    '| Feature | Field | Edit action | Before / original wording | After / accepted wording | Evidence notes |',
    '| --- | --- | --- | --- | --- | --- |',
    '|  |  |  |  |  |  |',
    '',
    '## Audit Handoff',
    '',
    'Transfer completed reviewer evidence into the combined fixture JSON file, remove `templateOnly` from both fixtures, keep private reviewer data outside the repo when needed, then run the proof preflight:',
    '',
    '```bash',
    `npm run audit:expert:preflight -- --fixtures /path/to/${sample.sampleId}.combined-fixtures.json`,
    '```',
    '',
    'When every readiness item passes, run the strict external proof gate:',
    '',
    '```bash',
    `npm run audit:expert:external -- --fixtures /path/to/${sample.sampleId}.combined-fixtures.json`,
    '```',
  ];

  return `${lines.join('\n')}\n`;
}

export function renderExternalQualitySourceInputMarkdown(payload, sample) {
  const lines = [
    '# CourseMapper Source Course Map Review',
    '',
    `Generated: ${payload.meta.generatedAt}`,
    `Package version: ${payload.meta.packageVersion}`,
    `Sample: ${sample.sampleId}`,
    `Course: ${sample.courseName}`,
    `Lessons: ${sample.sourceInput?.lessonCount || 0}`,
    '',
    '## Reviewer Task',
    '',
    'Use this original source course map beside the compiled package. Check whether the compiler preserved course title, lesson order, lesson topics, assessments, activities, source limits, and local-review needs without inventing unsupported details.',
    '',
    '## Source Lesson Map',
    '',
    markdownTable([
      '| Lesson | Source Title | Source Details |',
      '| ---: | --- | --- |',
      ...renderSourceLessonRows(sample),
    ]),
    '',
    '## Full Source Course Map',
    '',
    sample.sourceInput?.reviewText || 'No source course-map content supplied.',
  ];

  return `${lines.join('\n')}\n`;
}

function blueprintArtifactPayload(payload, sample) {
  return {
    meta: payload.meta,
    sampleId: sample.sampleId,
    label: sample.label,
    courseName: sample.courseName,
    scope: sample.scope,
    compilerPath: sample.compilerPath,
    qualitySignals: sample.qualitySignals,
    courseWorkload: sample.courseWorkload,
    learnerContextProfile: sample.learnerContextProfile,
    courseModalityProfile: sample.courseModalityProfile,
    sourceConflictReport: sample.sourceConflictReport,
    sourceRiskRegister: sample.sourceRiskRegister,
    compilerDecisionMatrix: sample.compilerDecisionMatrix,
    assessmentArchitecture: sample.assessmentArchitecture,
    classroomHandoffPlan: sample.classroomHandoffPlan,
    blueprintAssumptionLedger: sample.blueprintAssumptionLedger,
    packageCoherenceMatrix: sample.packageCoherenceMatrix,
    blueprintReviewSurface: sample.blueprintReviewSurface,
    conceptDependencyGraph: sample.conceptDependencyGraph,
    masteryEvidenceMap: sample.masteryEvidenceMap,
    evidenceResponseMap: sample.evidenceResponseMap,
    lessons: sample.lessons,
    quizProgression: sample.quizProgression,
    blueprintQualityTemplate: sample.fixtureTemplate?.blueprintQualityReview || null,
  };
}

export function renderExternalQualityBlueprintMarkdown(payload, sample) {
  const lines = [
    '# CourseMapper Compact Blueprint Review',
    '',
    `Generated: ${payload.meta.generatedAt}`,
    `Package version: ${payload.meta.packageVersion}`,
    `Sample: ${sample.sampleId}`,
    `Course: ${sample.courseName}`,
    `Scope: ${sample.scope} lessons`,
    `Compiler path: ${sample.compilerPath?.source || 'unknown'}`,
    `Quality confidence: ${sample.qualitySignals?.confidenceLevel || 'unknown'}`,
    `Course modality: ${sample.courseModalityProfile?.primaryMode || 'unknown'}`,
    `Source risk: ${sample.sourceRiskRegister?.status || 'unknown'}`,
    `Compiler decisions: ${sample.compilerDecisionMatrix?.status || 'unknown'}`,
    `Assumption ledger: ${sample.blueprintAssumptionLedger?.status || 'unknown'}`,
    '',
    '## Reviewer Task',
    '',
    'Compare this compact blueprint against the original source course map before reviewing the compiled package. The goal is to confirm that the compressed representation preserved source lesson identity, assessment signals, instructional alignment, local-review flags, and unsupported-invention boundaries.',
    '',
    '## Human-Readable Blueprint Review Surface',
    '',
    `Review surface: ${sample.blueprintReviewSurface?.status || 'missing'}`,
    `Summary: ${sample.blueprintReviewSurface?.summary || 'missing'}`,
    `Compression claim: ${sample.blueprintReviewSurface?.compressionClaim || 'missing'}`,
    `Local confirmations: ${sample.blueprintReviewSurface?.localConfirmationSummary?.localConfirmationCount ?? ''}`,
    `Source-review lessons: ${sample.blueprintReviewSurface?.localConfirmationSummary?.sourceReviewRequiredCount ?? ''}`,
    `Traceability: ${sample.blueprintReviewSurface?.traceabilitySummary?.status || 'missing'} (${sample.blueprintReviewSurface?.traceabilitySummary?.untraceableRows ?? ''} untraceable row(s))`,
    `Instructional moves: ${sample.blueprintReviewSurface?.instructionalMoveDecode?.status || 'missing'} (${sample.blueprintReviewSurface?.traceabilitySummary?.instructionalMoveRows ?? 0}/${sample.scope} lesson row(s))`,
    `Instructional move source: ${sample.blueprintReviewSurface?.instructionalMoveDecode?.source || 'missing'}`,
    `Instructional move grounding: ${sample.blueprintReviewSurface?.instructionalMoveDecode?.sourceGrounding || 'missing'}`,
    '',
    markdownTable([
      '| Lesson | Title | Source Confidence | Artifact Genre | Assessment Artifact | Review State | Answerability | Teaching Moves | Source Trace | Reviewer Question |',
      '| ---: | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
      ...(sample.blueprintReviewSurface?.lessonRows || []).map(
        (row) =>
          `| ${row.lessonNumber} | ${tableCell(row.lessonTitle, 120)} | ${row.sourceConfidence} | ${row.artifactGenre} | ${tableCell(row.assessmentArtifact, 120)} | ${row.reviewState} | ${row.answerabilityStatus || 'missing'} | ${tableCell([row.teachingMoveTrace?.openingMove, row.teachingMoveTrace?.practiceMove, row.teachingMoveTrace?.feedbackMove].filter(Boolean).join(' '), 180)} | ${tableCell([row.sourceTrace?.sourceAnchor, row.sourceTrace?.evidenceRequirement, row.sourceTrace?.compilerReason].filter(Boolean).join(' '), 180)} | ${tableCell(row.reviewerQuestion, 160)} |`,
      ),
    ]),
    '',
    '## Lesson Compression Matrix',
    '',
    markdownTable([
      '| Lesson | Blueprint Lesson | Source Confidence | Assessment Artifact | Evidence Requirement | Teaching Intent | Modality Fit | Review Flags |',
      '| ---: | --- | --- | --- | --- | --- | --- | --- |',
      ...sample.lessons.map(
        (lesson) =>
          `| ${lesson.lessonNumber} | ${tableCell(lesson.title, 120)} | ${lesson.sourceConfidence} | ${tableCell(lesson.assessmentArtifact, 120)} | ${tableCell(lesson.evidenceRequirement, 130)} | ${tableCell(lesson.teachingIntent?.teachingGoal, 150)} | ${tableCell([lesson.modalityCue, lesson.modalityDecode?.signaturePractice].filter(Boolean).join(' '), 160)} | ${tableCell((lesson.localReviewNeeded || []).join('; ') || 'None', 120)} |`,
      ),
    ]),
    '',
    '## Source Provenance',
    '',
    markdownTable([
      '| Lesson | Blueprint Field | Source Column | Source | Confidence | Raw Source Text | Compiled Value |',
      '| ---: | --- | --- | --- | --- | --- | --- |',
      ...renderSourceProvenanceRows(sample),
    ]),
    '',
    '## Section Coverage',
    '',
    markdownTable([
      '| Lesson | Section | Section Label | Source Columns | Preserved Signals | Coverage Cue |',
      '| ---: | ---: | --- | --- | --- | --- |',
      ...renderSectionCoverageRows(sample),
    ]),
    '',
    '## Assessment Architecture',
    '',
    markdownTable([
      '| Lesson | Assessment | Role | Stakes | Weight | Weight Source | Weight Review | Feedback Window | Revision Use |',
      '| ---: | --- | --- | --- | ---: | --- | --- | --- | --- |',
      ...renderAssessmentArchitectureRows(sample),
    ]),
    '',
    '## Source Risk Register',
    '',
    markdownTable([
      '| Lesson | Title | Risk | Source Confidence | Direct Fields | Inferred Fields | Assessment Source | Review Required | Reviewer Focus |',
      '| ---: | --- | --- | --- | ---: | ---: | --- | --- | --- |',
      ...renderSourceRiskRows(sample),
    ]),
    '',
    '## Source Conflict Report',
    '',
    markdownTable([
      '| Lesson | Title | Conflict Status | Conflict Label | Duplicate Lessons | Conflict Fields | Reviewer Action |',
      '| ---: | --- | --- | --- | --- | --- | --- |',
      ...renderSourceConflictRows(sample),
    ]),
    '',
    '## Blueprint Assumption Ledger',
    '',
    markdownTable([
      '| Lesson | Category | Assumption | Evidence | Source | Confidence | Review Required | Reviewer Action |',
      '| ---: | --- | --- | --- | --- | --- | --- | --- |',
      ...renderBlueprintAssumptionRows(sample),
    ]),
    '',
    '## Compiler Decisions',
    '',
    markdownTable([
      '| Lesson | Title | Generation Path | Publish Gate | Review Required | Local Repair | Source Risk | Assessment Source | Review Focus |',
      '| ---: | --- | --- | --- | --- | --- | --- | --- | --- |',
      ...renderCompilerDecisionRows(sample),
    ]),
    '',
    '## Blueprint-Quality Fixture Rows',
    '',
    'Use these lesson rows when filling `blueprintQualityReview.lessonReviews` in the combined fixture.',
    '',
    markdownTable([
      '| Lesson | Blueprint Lesson | Source Compared? | Blueprint Compared? | Source Signals Preserved? | Assessment Preserved? | Alignment Usable? | Review Flags Visible? | Evidence Notes |',
      '| ---: | --- | --- | --- | --- | --- | --- | --- | --- |',
      ...renderBlueprintQualityIntakeRows(sample),
    ]),
  ];

  return `${lines.join('\n')}\n`;
}

export function renderExternalQualityFullPackageMarkdown(payload, sample) {
  const lines = [
    '# CourseMapper Full Compiled Package Review',
    '',
    `Generated: ${payload.meta.generatedAt}`,
    `Package version: ${payload.meta.packageVersion}`,
    `Sample: ${sample.sampleId}`,
    `Course: ${sample.courseName}`,
    `Scope: ${sample.scope} lessons`,
    `Compiler path: ${sample.compilerPath?.source || 'unknown'}`,
    `Compiler decisions: ${sample.compilerDecisionMatrix?.status || 'unknown'}`,
    `Source risk: ${sample.sourceRiskRegister?.status || 'unknown'}`,
    `Timing status: ${sample.courseWorkload?.timingStatus || 'unknown'}`,
    `Assessment architecture: ${sample.assessmentArchitecture?.status || 'unknown'}`,
    `Assumption ledger: ${sample.blueprintAssumptionLedger?.status || 'unknown'}`,
    `Package coherence: ${sample.packageCoherenceMatrix?.status || 'unknown'}`,
    '',
    '## Reviewer Task',
    '',
    'Review this compiled package before filling the external scorecard. Long artifact sections are bounded for readable Markdown; use the paired JSON file when you need the full structured artifact data.',
    '',
    '## Reviewed Artifacts',
    '',
    markdownTable([
      '| Artifact | Feature ID | Items |',
      '| --- | --- | ---: |',
      ...sample.fullPackageArtifacts.map(
        (artifact) => `| ${artifact.label} | ${artifact.featureId} | ${artifact.itemCount} |`,
      ),
    ]),
    '',
    '## Local Review Actions',
    '',
    'Use this table when filling `sourceFidelityReview.artifactReviews[].localReviewActionVisible`. The compiled package should make these publish-before-use checks visible rather than burying them in internal metadata.',
    '',
    markdownTable([
      '| Lesson | Title | Review State | Publish Gate | Source Risk | Assessment Source | Local Review Action |',
      '| ---: | --- | --- | --- | --- | --- | --- |',
      ...renderLocalReviewActionRows(sample),
    ]),
  ];

  for (const artifact of sample.fullPackageArtifacts) {
    lines.push('', `## ${artifact.label}`, '', artifact.reviewText);
  }

  return `${lines.join('\n')}\n`;
}

function sampleArtifactPayload(payload, sample) {
  return {
    meta: payload.meta,
    sampleId: sample.sampleId,
    label: sample.label,
    courseName: sample.courseName,
    scope: sample.scope,
    reviewedArtifacts: sample.reviewedArtifacts,
    sourceInput: sample.sourceInput,
    compilerPath: sample.compilerPath,
    qualitySignals: sample.qualitySignals,
    courseWorkload: sample.courseWorkload,
    conceptDependencyGraph: sample.conceptDependencyGraph,
    masteryEvidenceMap: sample.masteryEvidenceMap,
    evidenceResponseMap: sample.evidenceResponseMap,
    learnerContextProfile: sample.learnerContextProfile,
    courseModalityProfile: sample.courseModalityProfile,
    sourceConflictReport: sample.sourceConflictReport,
    sourceRiskRegister: sample.sourceRiskRegister,
    compilerDecisionMatrix: sample.compilerDecisionMatrix,
    assessmentArchitecture: sample.assessmentArchitecture,
    classroomHandoffPlan: sample.classroomHandoffPlan,
    blueprintAssumptionLedger: sample.blueprintAssumptionLedger,
    packageCoherenceMatrix: sample.packageCoherenceMatrix,
    lessons: sample.lessons,
    quizProgression: sample.quizProgression,
    fullPackageArtifacts: sample.fullPackageArtifacts,
    fixtureTemplate: sample.fixtureTemplate,
    editHistoryTemplate: sample.editHistoryTemplate,
  };
}

function safeSampleFileName(sampleId) {
  return String(sampleId || 'sample').replace(/[^a-z0-9_.-]/gi, '-');
}

function compactManifestSample(sample, paths = {}) {
  return {
    sampleId: sample.sampleId,
    label: sample.label,
    courseName: sample.courseName,
    projectSource: sample.projectSource,
    scope: sample.scope,
    reviewedArtifacts: sample.reviewedArtifacts,
    fullPackageArtifactCount: sample.fullPackageArtifactCount,
    featureSummaries: sample.featureSummaries,
    sourceInput: sample.sourceInput
      ? {
          lessonCount: sample.sourceInput.lessonCount,
          markdownPath: paths.sourceInputMarkdownPath,
          jsonPath: paths.sourceInputJsonPath,
        }
      : null,
    fullPackageFiles: {
      markdownPath: paths.sampleMarkdownPath,
      jsonPath: paths.sampleJsonPath,
    },
    blueprintFiles: {
      markdownPath: paths.blueprintMarkdownPath,
      jsonPath: paths.blueprintJsonPath,
    },
    reviewIntakePath: paths.reviewIntakePath,
    fixtureFiles: {
      combinedFixturePath: paths.combinedFixturePath,
      reviewFixturePath: paths.reviewFixturePath,
      editHistoryFixturePath: paths.editHistoryFixturePath,
    },
    qualitySummary: {
      compilerPath: sample.compilerPath?.source || 'unknown',
      confidenceLevel: sample.qualitySignals?.confidenceLevel || 'unknown',
      timingStatus: sample.courseWorkload?.timingStatus || 'unknown',
      modality: sample.courseModalityProfile?.primaryMode || 'unknown',
      sourceConflictStatus: sample.sourceConflictReport?.status || 'unknown',
      sourceRiskStatus: sample.sourceRiskRegister?.status || 'unknown',
      compilerDecisionStatus: sample.compilerDecisionMatrix?.status || 'unknown',
      assessmentArchitectureStatus: sample.assessmentArchitecture?.status || 'unknown',
      totalWeightPercent: sample.assessmentArchitecture?.totalWeightPercent ?? null,
      handoffStatus: sample.classroomHandoffPlan?.status || 'unknown',
      assumptionLedgerStatus: sample.blueprintAssumptionLedger?.status || 'unknown',
      assumptionReviewRequiredCount: sample.blueprintAssumptionLedger?.reviewRequiredCount ?? null,
      packageCoherenceStatus: sample.packageCoherenceMatrix?.status || 'unknown',
      blueprintReviewSurfaceStatus: sample.blueprintReviewSurface?.status || 'unknown',
      blueprintReviewSourceRequiredCount:
        sample.blueprintReviewSurface?.localConfirmationSummary?.sourceReviewRequiredCount ?? null,
      blueprintReviewTraceabilityStatus: sample.blueprintReviewSurface?.traceabilitySummary?.status || 'unknown',
      blueprintReviewUntraceableRows: sample.blueprintReviewSurface?.traceabilitySummary?.untraceableRows ?? null,
      blueprintReviewInstructionalMoveStatus:
        sample.blueprintReviewSurface?.instructionalMoveDecode?.status || 'unknown',
      blueprintReviewInstructionalMoveRows:
        sample.blueprintReviewSurface?.traceabilitySummary?.instructionalMoveRows ?? null,
      quizProgressionRows: Array.isArray(sample.quizProgression) ? sample.quizProgression.length : 0,
    },
    templateSummary: {
      reviewTemplateOnly: sample.fixtureTemplate?.templateOnly === true,
      editHistoryTemplateOnly: sample.editHistoryTemplate?.templateOnly === true,
      reviewedArtifacts: sample.fixtureTemplate?.reviewEvidence?.reviewedArtifacts || [],
      scorecardDimensionCount: sample.fixtureTemplate?.reviewScorecard?.dimensions?.length || 0,
      sourceFidelityArtifactCount: sample.fixtureTemplate?.sourceFidelityReview?.artifactReviews?.length || 0,
      blueprintLessonReviewCount: sample.fixtureTemplate?.blueprintQualityReview?.lessonReviews?.length || 0,
      assumptionDecisionRows: sample.fixtureTemplate?.assumptionLedgerReview?.reviewedRows?.length || 0,
      editHistoryPatternCount: sample.editHistoryTemplate?.instructorEditPatterns?.length || 0,
    },
  };
}

function externalQualityProofManifestPayload(payload, pathIndex = {}, externalProjectTemplatePaths = null) {
  return {
    meta: payload.meta,
    summary: payload.summary,
    proofCollectionPlan: payload.proofCollectionPlan,
    reviewerCompletionChecklist: payload.reviewerCompletionChecklist,
    reviewedArtifacts: payload.reviewedArtifacts,
    scorecardDimensions: payload.scorecardDimensions,
    externalProjectTemplateFiles: externalProjectTemplatePaths,
    samples: payload.samples.map((sample) => {
      const paths = pathIndex[sample.sampleId] || {};
      return compactManifestSample(sample, paths);
    }),
  };
}

function buildRecommendedStrictProofBundleTemplate(payload, externalProjectTemplate) {
  const recommendedIds = new Set(
    (payload.proofCollectionPlan?.recommendedSamples || []).map((sample) => sample.sampleId),
  );
  const recommendedSamples = (payload.samples || []).filter((sample) => recommendedIds.has(sample.sampleId));
  const fixtures = recommendedSamples.flatMap((sample) => [sample.fixtureTemplate, sample.editHistoryTemplate]);
  const hasExternalProjectSample = recommendedSamples.some((sample) => sample.projectSource === 'external-project');
  if (!hasExternalProjectSample && externalProjectTemplate?.combined?.fixtures?.length) {
    fixtures.push(...externalProjectTemplate.combined.fixtures);
  }

  return {
    templateOnly: true,
    generatedAt: payload.meta.generatedAt,
    packageVersion: payload.meta.packageVersion,
    purpose:
      'Recommended strict A-quality proof bundle. Fill every reviewer field, replace the external project.courseMap with a real reviewed course when present, then remove templateOnly before running audit:expert:preflight and audit:expert:external.',
    recommendedSamples: payload.proofCollectionPlan?.recommendedSamples || [],
    requiredCompleteProofScopes: payload.proofCollectionPlan?.requiredCompleteProofScopes || RECOMMENDED_PROOF_SCOPES,
    requiredDistinctModalities: payload.proofCollectionPlan?.requiredDistinctModalities || 2,
    requiredExternalProjectSamples: payload.proofCollectionPlan?.requiredExternalProjectSamples || 1,
    reviewerCompletionChecklistPath: 'review-intake/reviewer-completion-checklist.md',
    reviewerCompletionChecklist: payload.reviewerCompletionChecklist,
    fixtures,
  };
}

export async function writeExternalQualityProofPacket(payload, outputDir = DEFAULT_OUTPUT_DIR) {
  await fs.mkdir(outputDir, { recursive: true });
  const jsonPath = path.join(outputDir, 'latest.json');
  const markdownPath = path.join(outputDir, 'latest.md');
  const sourceInputDir = path.join(outputDir, 'source-inputs');
  const blueprintDir = path.join(outputDir, 'compact-blueprints');
  const fullPackageDir = path.join(outputDir, 'full-package');
  const reviewIntakeDir = path.join(outputDir, 'review-intake');
  const fixtureDir = path.join(outputDir, 'fixtures');
  await fs.mkdir(sourceInputDir, { recursive: true });
  await fs.mkdir(blueprintDir, { recursive: true });
  await fs.mkdir(fullPackageDir, { recursive: true });
  await fs.mkdir(reviewIntakeDir, { recursive: true });
  await fs.mkdir(fixtureDir, { recursive: true });
  await fs.writeFile(markdownPath, renderExternalQualityProofPacketMarkdown(payload));
  const reviewerCompletionChecklistPath = path.join(reviewIntakeDir, 'reviewer-completion-checklist.md');
  const reviewerCompletionChecklistJsonPath = path.join(reviewIntakeDir, 'reviewer-completion-checklist.json');
  await fs.writeFile(reviewerCompletionChecklistPath, renderReviewerCompletionChecklistMarkdown(payload));
  await fs.writeFile(
    reviewerCompletionChecklistJsonPath,
    `${JSON.stringify(payload.reviewerCompletionChecklist, null, 2)}\n`,
  );
  const externalProjectTemplate = makeExternalProjectProofTemplate({ packageVersion: payload.meta.packageVersion });
  const externalProjectTemplatePaths = {
    intakePath: path.join(reviewIntakeDir, 'external-project-course-map.md'),
    combinedFixturePath: path.join(fixtureDir, 'external-project.combined-fixtures.template.json'),
    reviewFixturePath: path.join(fixtureDir, 'external-project.review-fixture.template.json'),
    editHistoryFixturePath: path.join(fixtureDir, 'external-project.edit-history-fixture.template.json'),
    recommendedBundleTemplatePath: path.join(fixtureDir, 'recommended-strict-proof-bundle.template.json'),
  };
  await fs.writeFile(
    externalProjectTemplatePaths.intakePath,
    renderExternalProjectTemplateMarkdown({
      packageVersion: payload.meta.packageVersion,
      paths: externalProjectTemplatePaths,
    }),
  );
  await fs.writeFile(
    externalProjectTemplatePaths.combinedFixturePath,
    `${JSON.stringify(externalProjectTemplate.combined, null, 2)}\n`,
  );
  await fs.writeFile(
    externalProjectTemplatePaths.reviewFixturePath,
    `${JSON.stringify(externalProjectTemplate.review, null, 2)}\n`,
  );
  await fs.writeFile(
    externalProjectTemplatePaths.editHistoryFixturePath,
    `${JSON.stringify(externalProjectTemplate.editHistory, null, 2)}\n`,
  );
  await fs.writeFile(
    externalProjectTemplatePaths.recommendedBundleTemplatePath,
    `${JSON.stringify(buildRecommendedStrictProofBundleTemplate(payload, externalProjectTemplate), null, 2)}\n`,
  );
  const sourceInputPaths = [];
  const blueprintPaths = [];
  const fullPackagePaths = [];
  const reviewIntakePaths = [];
  const fixtureTemplatePaths = [];
  const manifestPathIndex = {};
  for (const sample of payload.samples) {
    const fileName = safeSampleFileName(sample.sampleId);
    const sourceInputJsonPath = path.join(sourceInputDir, `${fileName}.json`);
    const sourceInputMarkdownPath = path.join(sourceInputDir, `${fileName}.md`);
    const blueprintJsonPath = path.join(blueprintDir, `${fileName}.json`);
    const blueprintMarkdownPath = path.join(blueprintDir, `${fileName}.md`);
    const sampleJsonPath = path.join(fullPackageDir, `${fileName}.json`);
    const sampleMarkdownPath = path.join(fullPackageDir, `${fileName}.md`);
    const reviewIntakePath = path.join(reviewIntakeDir, `${fileName}.md`);
    const combinedFixturePath = path.join(fixtureDir, `${fileName}.combined-fixtures.template.json`);
    const reviewFixturePath = path.join(fixtureDir, `${fileName}.review-fixture.template.json`);
    const editHistoryFixturePath = path.join(fixtureDir, `${fileName}.edit-history-fixture.template.json`);
    manifestPathIndex[sample.sampleId] = {
      sourceInputJsonPath,
      sourceInputMarkdownPath,
      blueprintJsonPath,
      blueprintMarkdownPath,
      sampleJsonPath,
      sampleMarkdownPath,
      reviewIntakePath,
      combinedFixturePath,
      reviewFixturePath,
      editHistoryFixturePath,
    };
    await fs.writeFile(
      sourceInputJsonPath,
      `${JSON.stringify({ meta: payload.meta, sampleId: sample.sampleId, sourceInput: sample.sourceInput }, null, 2)}\n`,
    );
    await fs.writeFile(sourceInputMarkdownPath, renderExternalQualitySourceInputMarkdown(payload, sample));
    await fs.writeFile(blueprintJsonPath, `${JSON.stringify(blueprintArtifactPayload(payload, sample), null, 2)}\n`);
    await fs.writeFile(blueprintMarkdownPath, renderExternalQualityBlueprintMarkdown(payload, sample));
    await fs.writeFile(sampleJsonPath, `${JSON.stringify(sampleArtifactPayload(payload, sample), null, 2)}\n`);
    await fs.writeFile(sampleMarkdownPath, renderExternalQualityFullPackageMarkdown(payload, sample));
    await fs.writeFile(reviewIntakePath, renderExternalReviewIntakeMarkdown(payload, sample));
    await fs.writeFile(
      combinedFixturePath,
      `${JSON.stringify({ fixtures: [sample.fixtureTemplate, sample.editHistoryTemplate] }, null, 2)}\n`,
    );
    await fs.writeFile(reviewFixturePath, `${JSON.stringify({ fixtures: [sample.fixtureTemplate] }, null, 2)}\n`);
    await fs.writeFile(
      editHistoryFixturePath,
      `${JSON.stringify({ fixtures: [sample.editHistoryTemplate] }, null, 2)}\n`,
    );
    sourceInputPaths.push({
      sampleId: sample.sampleId,
      jsonPath: sourceInputJsonPath,
      markdownPath: sourceInputMarkdownPath,
    });
    blueprintPaths.push({
      sampleId: sample.sampleId,
      jsonPath: blueprintJsonPath,
      markdownPath: blueprintMarkdownPath,
    });
    fullPackagePaths.push({
      sampleId: sample.sampleId,
      jsonPath: sampleJsonPath,
      markdownPath: sampleMarkdownPath,
    });
    reviewIntakePaths.push({ sampleId: sample.sampleId, markdownPath: reviewIntakePath });
    fixtureTemplatePaths.push({
      sampleId: sample.sampleId,
      combinedFixturePath,
      reviewFixturePath,
      editHistoryFixturePath,
    });
  }
  await fs.writeFile(
    jsonPath,
    `${JSON.stringify(externalQualityProofManifestPayload(payload, manifestPathIndex, externalProjectTemplatePaths), null, 2)}\n`,
  );
  return {
    jsonPath,
    markdownPath,
    sourceInputDir,
    sourceInputPaths,
    blueprintDir,
    blueprintPaths,
    fullPackageDir,
    fullPackagePaths,
    reviewIntakeDir,
    reviewIntakePaths,
    reviewerCompletionChecklistPath,
    reviewerCompletionChecklistJsonPath,
    fixtureDir,
    fixtureTemplatePaths,
    externalProjectTemplatePaths,
  };
}

function parseArgs(argv) {
  const args = {
    outputDir: DEFAULT_OUTPUT_DIR,
    sampleIds: [],
    fixturePath: null,
    includeDefaultSamples: true,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--output') args.outputDir = path.resolve(argv[++i]);
    if (arg === '--sample') args.sampleIds.push(argv[++i]);
    if (arg === '--fixtures') args.fixturePath = path.resolve(argv[++i]);
    if (arg === '--external-only') args.includeDefaultSamples = false;
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  try {
    const payload = await buildExternalQualityProofPacket({
      sampleIds: args.sampleIds,
      fixturePath: args.fixturePath,
      includeDefaultSamples: args.includeDefaultSamples,
    });
    const paths = await writeExternalQualityProofPacket(payload, args.outputDir);
    console.log(`External quality proof packet: ${payload.summary.sampleCount} sample(s)`);
    console.log(`Report: ${paths.markdownPath}`);
    console.log(`Source input review files: ${paths.sourceInputDir}`);
    console.log(`Compact blueprint review files: ${paths.blueprintDir}`);
    console.log(`Full package review files: ${paths.fullPackageDir}`);
    console.log(`Reviewer intake forms: ${paths.reviewIntakeDir}`);
    console.log(`Fixture templates: ${paths.fixtureDir}`);
  } finally {
    await closeHybridPipelineAuditRuntime();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
