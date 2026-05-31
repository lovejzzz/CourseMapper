#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import {
  DEFAULT_GOLD_SAMPLES,
  buildBlueprintFidelityFindings,
  closeHybridPipelineAuditRuntime,
  loadHybridPipelineAuditRuntime,
} from './goldSampleQualityAudit.mjs';
import {
  buildInstructorPreferenceProfile,
  describeInstructorPreferenceForFeature,
  summarizeInstructorPreferenceProfile,
} from '../src/lib/instructorPreferenceProfile.js';

export { closeHybridPipelineAuditRuntime, loadHybridPipelineAuditRuntime };

const ROOT = process.cwd();
const DEFAULT_OUTPUT_DIR = path.join(ROOT, 'verification-output', 'expert-review-quality-audit');
export const CURRENT_PACKAGE_VERSION = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;

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

const DEFAULT_REVIEW_FEATURES = Object.keys(FEATURE_LABELS);
const REQUIRED_FULL_PACKAGE_ARTIFACTS = Object.keys(FEATURE_LABELS);
const FULL_PACKAGE_ARTIFACT_ALIASES = new Set([
  'all',
  'all-artifacts',
  'all-deliverables',
  'complete-package',
  'course-materials',
  'course-package',
  'download-zip',
  'export-package',
  'full-package',
  'package',
  'zip',
]);
const EXTERNAL_EVIDENCE_TYPES = new Set(['external', 'internal-provisional']);
const REVIEW_SCORECARD_FLOOR = 9;
const REQUIRED_EXTERNAL_PROOF_STATUS = 'external-review-and-edit-evidence-present';
const REQUIRED_EXTERNAL_COMPLETE_PROOF_SAMPLES = 2;
const REQUIRED_EXTERNAL_COMPLETE_PROOF_MODALITIES = 2;
const REQUIRED_EXTERNAL_PROJECT_COMPLETE_PROOF_SAMPLES = 1;
const REQUIRED_EXTERNAL_COMPLETE_PROOF_SCOPES = [5, 8, 14];
const REQUIRED_ASSUMPTION_LEDGER_CATEGORIES = [
  'learner-context',
  'course-modality',
  'assessment-weight',
  'handoff-boundary',
];
const REQUIRED_REVIEW_SCORECARD_DIMENSIONS = [
  {
    id: 'instructional-alignment',
    label: 'Instructional alignment',
    aliases: ['alignment', 'instructionalAlignment', 'learning alignment', 'backward design'],
  },
  {
    id: 'teachability',
    label: 'Teachability',
    aliases: ['classroom readiness', 'classroom-readiness', 'teaching usability', 'lesson usability'],
  },
  {
    id: 'assessment-authenticity',
    label: 'Assessment authenticity',
    aliases: ['assessment', 'assessment quality', 'assessmentAuthenticity', 'authentic assessment'],
  },
  {
    id: 'feedback-and-revision',
    label: 'Feedback and revision loop',
    aliases: ['feedback', 'revision', 'feedbackAndRevision', 'feedback loop', 'feedback/revision'],
  },
  {
    id: 'cognitive-progression',
    label: 'Cognitive progression',
    aliases: ['progression', 'cognitiveProgression', 'scaffolding', 'cognitive demand'],
  },
  {
    id: 'accessibility-and-trust',
    label: 'Accessibility and trust',
    aliases: ['accessibility', 'trust', 'accessibilityAndTrust', 'accessibility trust'],
  },
];
const FIXTURE_SOURCE_BLOCKERS = new Set([
  'sampleSource',
  'unknownSampleId',
  'projectCourseMap',
  'projectCourseName',
  'projectLessons',
  'projectCourseMapPlaceholder',
]);
const PLACEHOLDER_PROOF_RE =
  /\b(?:replace with|template|placeholder|tbd|to be determined|example only|lorem ipsum|yyyy-mm-dd)\b/i;
const UNREPLACED_TEMPLATE_RE =
  /\b(?:replace with|replace this|placeholder|tbd|to be determined|example only|lorem ipsum|yyyy-mm-dd)\b/i;

function normalizePackageVersion(value) {
  return String(value || '')
    .trim()
    .replace(/^v/i, '');
}

function matchesCurrentPackageVersion(value) {
  return normalizePackageVersion(value) === normalizePackageVersion(CURRENT_PACKAGE_VERSION);
}

export const DEFAULT_REVIEW_FIXTURES = [
  {
    id: 'internal-review-research-methods-specificity',
    label: 'Research methods specificity reviewer expectations',
    sampleId: 'gold-research-methods-8',
    evidenceType: 'internal-provisional',
    reviewerRole: 'methods instructor review proxy',
    focus: 'Make generic compiler output read like applied research-methods course material.',
    packageMustMatch: [
      /empirical evidence/i,
      /method decision/i,
      /sampling frame/i,
      /measurement validity/i,
      /limitation/i,
      /study-design scenario/i,
    ],
    packageMustNotMatch: [/TBD|to be determined|lorem ipsum|placeholder/i],
    featureExpectations: {
      lessonPlans: [/worked example/i, /mini-rubric/i, /formative/i, /empirical evidence/i],
      assignments: [/evidence checkpoint/i, /empirical evidence/i, /limitation/i],
      rubrics: [/evidence/i, /decision/i, /revision/i],
      discussions: [/method decision/i, /evidence/i, /limitation/i],
      quizBank: [/short_answer/i, /essay/i, /scoring/i, /method decision/i],
      studyGuides: [/definition to memorize|summarizing the topic/i, /What would strong work/i, /method decision/i],
    },
    editChecks: [
      {
        id: 'no-generic-method-work',
        label: 'Reviewer should not need to replace generic method language',
        featureId: 'assignments',
        mustNotMatch: /generic course artifact|general summary|placeholder/i,
      },
      {
        id: 'method-feedback-loop',
        label: 'Reviewer should see feedback and revision language tied to methods work',
        featureId: 'rubrics',
        mustMatch: /feedback|revision/i,
      },
    ],
  },
  {
    id: 'internal-review-ai-accountability',
    label: 'AI course-design accountability reviewer expectations',
    sampleId: 'gold-ai-course-design-8',
    evidenceType: 'internal-provisional',
    reviewerRole: 'AI pedagogy instructor review proxy',
    focus: 'Keep AI course-design output accountable to privacy, accessibility, disclosure, and instructor judgment.',
    packageMustMatch: [
      /design evidence/i,
      /instructional design decision/i,
      /privacy risk|privacy/i,
      /accessibility/i,
      /AI disclosure/i,
      /human-in-the-loop/i,
      /rubric calibration/i,
    ],
    packageMustNotMatch: [/TBD|to be determined|lorem ipsum|placeholder/i],
    featureExpectations: {
      lessonPlans: [/instructor judgment|instructor accountability|design evidence/i, /accessibility/i],
      assignments: [/privacy|accessibility|AI-supported course design/i, /design evidence/i],
      rubrics: [/bias|rubric calibration|design evidence/i],
      discussions: [/instructional design decision/i, /design evidence/i],
      quizBank: [/design evidence/i, /instructional design decision/i, /AI/i],
      studyGuides: [/AI/i, /design evidence/i, /instructional design decision/i],
    },
    editChecks: [
      {
        id: 'privacy-visible',
        label: 'Reviewer should not need to add privacy language by hand',
        featureId: 'syllabus',
        mustMatch: /privacy/i,
      },
      {
        id: 'accessibility-visible',
        label: 'Reviewer should not need to add accessibility guidance by hand',
        featureId: 'slideDecks',
        mustMatch: /accessibility|alt text|processing time/i,
      },
    ],
  },
  {
    id: 'internal-review-messy-clinical-trust',
    label: 'Messy clinical import trust reviewer expectations',
    sampleId: 'gold-messy-clinical-resilience-8',
    evidenceType: 'internal-provisional',
    reviewerRole: 'clinical course reviewer proxy',
    focus: 'Do not hide weak imported source material or publish unfinished placeholders.',
    packageMustMatch: [
      /health equity/i,
      /implementation evidence/i,
      /program decision/i,
      /local review|needs local review/i,
    ],
    packageMustNotMatch: [/TBD|to be determined|lorem ipsum|placeholder/i],
    blueprintExpectations: {
      minReviewFlags: 3,
      maxSourceGroundedLessonCount: 7,
      reviewFlagMustMatch: [/Lesson title was derived/i, /unfinished language/i],
    },
    featureExpectations: {
      syllabus: [/review/i, /high|medium|needs-review/i],
      lessonPlans: [/implementation evidence/i, /program decision/i],
      slideDecks: [/implementation evidence/i, /program decision/i],
      assignments: [/implementation evidence/i, /community health evaluation/i],
      rubrics: [/implementation evidence/i, /revision/i],
      studyGuides: [/implementation evidence/i, /program decision/i],
    },
    editChecks: [
      {
        id: 'unfinished-language-removed',
        label: 'Reviewer should not need to remove unfinished source placeholders',
        featureId: 'package',
        mustNotMatch: /TBD|to be determined|placeholder/i,
      },
      {
        id: 'weak-input-visible',
        label: 'Reviewer should see source weakness rather than silent overconfidence',
        blueprintMustMatch: /Lesson title was derived|unfinished language/i,
      },
    ],
  },
];

function cleanText(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanToken(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function hasPlaceholderProofText(value) {
  return PLACEHOLDER_PROOF_RE.test(cleanText(value));
}

function hasUnreplacedTemplateText(value) {
  return UNREPLACED_TEMPLATE_RE.test(cleanText(value));
}

function hasConcreteProofNote(value) {
  const text = cleanText(value);
  return text.length >= 12 && !hasPlaceholderProofText(text);
}

function scopeCourseMap(courseMap, scope) {
  return {
    ...courseMap,
    lessons: Array.isArray(courseMap?.lessons) ? courseMap.lessons.slice(0, scope) : [],
  };
}

function collectStrings(value, out = []) {
  if (typeof value === 'string') {
    const trimmed = cleanText(value);
    if (trimmed) out.push(trimmed);
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

function collectUnreplacedTemplatePaths(value, prefix, out = []) {
  if (value instanceof RegExp) {
    if (hasUnreplacedTemplateText(value.source)) out.push(prefix);
    return out;
  }
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

function uniqueValues(values, limit = Infinity) {
  const seen = new Set();
  const result = [];
  for (const value of values.filter(Boolean)) {
    const key = String(value).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(value);
    if (result.length >= limit) break;
  }
  return result;
}

function patternLabel(pattern) {
  return pattern instanceof RegExp ? `/${pattern.source}/${pattern.flags}` : String(pattern);
}

function revivePattern(value) {
  if (value instanceof RegExp) return value;
  if (typeof value !== 'string') return value;
  const regexMatch = value.match(/^\/(.+)\/([a-z]*)$/i);
  if (regexMatch) {
    return new RegExp(regexMatch[1], regexMatch[2]);
  }
  return value;
}

function normalizeFixturePatterns(value) {
  if (value instanceof RegExp) return value;
  if (Array.isArray(value)) return value.map(normalizeFixturePatterns);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, normalizeFixturePatterns(entry)]));
  }
  return revivePattern(value);
}

function normalizeReviewedArtifactKey(value) {
  return String(value || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function reviewedArtifactAliasMap() {
  const entries = Object.entries(FEATURE_LABELS).flatMap(([featureId, label]) => [
    [featureId, featureId],
    [label, featureId],
  ]);
  return new Map(
    [
      ...entries,
      ['assignment briefs', 'assignments'],
      ['assignments', 'assignments'],
      ['course faq', 'courseFaq'],
      ['course faqs', 'courseFaq'],
      ['discussion prompts', 'discussions'],
      ['discussions', 'discussions'],
      ['exam bank', 'quizBank'],
      ['lesson plans', 'lessonPlans'],
      ['quiz and exam bank', 'quizBank'],
      ['quiz bank', 'quizBank'],
      ['quizzes', 'quizBank'],
      ['slide decks', 'slideDecks'],
      ['slides', 'slideDecks'],
      ['study guides', 'studyGuides'],
    ].map(([key, featureId]) => [normalizeReviewedArtifactKey(key), featureId]),
  );
}

const REVIEWED_ARTIFACT_ALIASES = reviewedArtifactAliasMap();

function buildReviewedArtifactCoverage(fixture) {
  const rawArtifacts = Array.isArray(fixture?.reviewEvidence?.reviewedArtifacts)
    ? fixture.reviewEvidence.reviewedArtifacts
    : [];
  const rawKeys = rawArtifacts.map((artifact) => normalizeReviewedArtifactKey(artifact)).filter(Boolean);
  const hasFullPackageAlias = rawKeys.some((key) => FULL_PACKAGE_ARTIFACT_ALIASES.has(key));
  const covered = hasFullPackageAlias
    ? [...REQUIRED_FULL_PACKAGE_ARTIFACTS]
    : uniqueValues(
        rawKeys.map((key) => REVIEWED_ARTIFACT_ALIASES.get(key)).filter(Boolean),
        REQUIRED_FULL_PACKAGE_ARTIFACTS.length,
      );
  const coveredSet = new Set(covered);
  const missing = REQUIRED_FULL_PACKAGE_ARTIFACTS.filter((featureId) => !coveredSet.has(featureId));
  return {
    rawArtifacts,
    covered,
    coveredCount: covered.length,
    requiredCount: REQUIRED_FULL_PACKAGE_ARTIFACTS.length,
    missing,
    coversFullPackage: missing.length === 0,
  };
}

function patternMatches(pattern, text) {
  if (pattern instanceof RegExp) return pattern.test(text);
  return String(text || '')
    .toLowerCase()
    .includes(String(pattern || '').toLowerCase());
}

function makeFinding(severity, fixtureId, featureId, check, message) {
  return { severity, fixtureId, featureId, check, message };
}

function getFeatureData(featureId, compiled) {
  if (featureId === 'package') return compiled;
  return compiled?.[featureId] || {};
}

function getFixtureEditPatterns(fixture) {
  if (Array.isArray(fixture.instructorEditPatterns)) return fixture.instructorEditPatterns;
  if (Array.isArray(fixture.editHistory)) return fixture.editHistory;
  if (Array.isArray(fixture.instructorEditHistory)) return fixture.instructorEditHistory;
  return [];
}

function getFixtureCourseMap(fixture) {
  if (fixture?.project?.courseMap && typeof fixture.project.courseMap === 'object') return fixture.project.courseMap;
  if (fixture?.courseMap && typeof fixture.courseMap === 'object') return fixture.courseMap;
  return null;
}

function getGoldSample(sampleId) {
  return DEFAULT_GOLD_SAMPLES.find((item) => item.id === sampleId) || null;
}

function isExternalFixture(fixture) {
  return (fixture.evidenceType || 'external') === 'external';
}

function countPatternArray(value) {
  return Array.isArray(value) ? value.length : 0;
}

function countFeatureExpectationPatterns(value = {}) {
  return Object.values(value).reduce((sum, patterns) => sum + countPatternArray(patterns), 0);
}

function countObjectKeys(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? Object.keys(value).length : 0;
}

function getReviewScorecardDimensions(fixture) {
  if (Array.isArray(fixture?.reviewScorecard?.dimensions)) return fixture.reviewScorecard.dimensions;
  if (Array.isArray(fixture?.reviewScores)) return fixture.reviewScores;
  return [];
}

function getSourceFidelityReview(fixture) {
  if (fixture?.sourceFidelityReview && typeof fixture.sourceFidelityReview === 'object') {
    return fixture.sourceFidelityReview;
  }
  if (
    fixture?.reviewEvidence?.sourceFidelityReview &&
    typeof fixture.reviewEvidence.sourceFidelityReview === 'object'
  ) {
    return fixture.reviewEvidence.sourceFidelityReview;
  }
  return null;
}

function getAssumptionLedgerReview(fixture) {
  if (fixture?.assumptionLedgerReview && typeof fixture.assumptionLedgerReview === 'object') {
    return fixture.assumptionLedgerReview;
  }
  if (
    fixture?.reviewEvidence?.assumptionLedgerReview &&
    typeof fixture.reviewEvidence.assumptionLedgerReview === 'object'
  ) {
    return fixture.reviewEvidence.assumptionLedgerReview;
  }
  return null;
}

function getBlueprintQualityReview(fixture) {
  if (fixture?.blueprintQualityReview && typeof fixture.blueprintQualityReview === 'object') {
    return fixture.blueprintQualityReview;
  }
  if (
    fixture?.reviewEvidence?.blueprintQualityReview &&
    typeof fixture.reviewEvidence.blueprintQualityReview === 'object'
  ) {
    return fixture.reviewEvidence.blueprintQualityReview;
  }
  return null;
}

function getFixtureProofScopeTags(fixture) {
  const values = [
    ...(Array.isArray(fixture?.proofScopeTags) ? fixture.proofScopeTags : []),
    ...(Array.isArray(fixture?.reviewEvidence?.proofScopeTags) ? fixture.reviewEvidence.proofScopeTags : []),
    ...(Array.isArray(fixture?.reviewEvidence?.courseTags) ? fixture.reviewEvidence.courseTags : []),
  ];
  return [...new Set(values.map((value) => cleanToken(value)).filter(Boolean))].sort();
}

function getFixtureProofScope(fixture, blueprint = null, sample = null) {
  const explicitScope = Number(
    fixture?.proofScope ||
      fixture?.reviewEvidence?.proofScope ||
      fixture?.reviewEvidence?.courseScope ||
      fixture?.scope ||
      fixture?.project?.scope ||
      sample?.scope,
  );
  if (Number.isFinite(explicitScope) && explicitScope > 0) return explicitScope;
  const blueprintLessonCount = Array.isArray(blueprint?.lessons) ? blueprint.lessons.length : 0;
  if (blueprintLessonCount > 0) return blueprintLessonCount;
  const courseMap = getFixtureCourseMap(fixture);
  const sourceLessonCount = Array.isArray(courseMap?.lessons) ? courseMap.lessons.length : 0;
  return sourceLessonCount > 0 ? sourceLessonCount : null;
}

function getFixtureProofModality(fixture, blueprint = null) {
  return (
    cleanToken(fixture?.reviewEvidence?.courseModality) ||
    cleanToken(fixture?.courseModality) ||
    cleanToken(blueprint?.courseModalityProfile?.primaryMode) ||
    'unknown'
  );
}

function countReviewerExpectationSignals(fixture) {
  return (
    countPatternArray(fixture.packageMustMatch) +
    countPatternArray(fixture.packageMustNotMatch) +
    countFeatureExpectationPatterns(fixture.featureExpectations) +
    countFeatureExpectationPatterns(fixture.preferenceExpectations) +
    countObjectKeys(fixture.blueprintExpectations) +
    countPatternArray(fixture.editChecks) +
    getReviewScorecardDimensions(fixture).length +
    (getBlueprintQualityReview(fixture) ? 1 : 0) +
    (getAssumptionLedgerReview(fixture) ? 1 : 0)
  );
}

function hasExternalProofEvidence(fixture) {
  return countReviewerExpectationSignals(fixture) > 0 || getFixtureEditPatterns(fixture).length > 0;
}

function collectPositiveExpectationPlaceholders(fixture) {
  const editCheckMustMatches = (fixture.editChecks || []).map((check) => ({
    id: check.id,
    mustMatch: check.mustMatch,
    blueprintMustMatch: check.blueprintMustMatch,
  }));
  return [
    ...collectUnreplacedTemplatePaths(fixture.packageMustMatch || [], 'packageMustMatch'),
    ...collectUnreplacedTemplatePaths(fixture.featureExpectations || {}, 'featureExpectations'),
    ...collectUnreplacedTemplatePaths(fixture.preferenceExpectations || {}, 'preferenceExpectations'),
    ...collectUnreplacedTemplatePaths(fixture.blueprintExpectations || {}, 'blueprintExpectations'),
    ...collectUnreplacedTemplatePaths(editCheckMustMatches, 'editChecks'),
  ];
}

function validateReviewFixture(fixture) {
  const findings = [];
  const fixtureId = fixture.id || 'unknown-fixture';
  const fixtureCourseMap = getFixtureCourseMap(fixture);
  const hasExternalProject = Boolean(fixtureCourseMap);
  if (!fixture.id) {
    findings.push(makeFinding('blocker', fixtureId, 'fixture', 'fixtureId', 'Review fixture is missing id.'));
  }
  if (!fixture.sampleId && !hasExternalProject) {
    findings.push(
      makeFinding(
        'blocker',
        fixtureId,
        'fixture',
        'sampleSource',
        'Review fixture must include sampleId or project.courseMap.',
      ),
    );
  }
  if (fixture.sampleId && !hasExternalProject && !getGoldSample(fixture.sampleId)) {
    findings.push(
      makeFinding(
        'blocker',
        fixtureId,
        'fixture',
        'unknownSampleId',
        `Unknown review fixture sampleId: ${fixture.sampleId}.`,
      ),
    );
  }
  if (hasExternalProject) {
    if (!fixtureCourseMap.courseName) {
      findings.push(
        makeFinding(
          'blocker',
          fixtureId,
          'fixture',
          'projectCourseName',
          'External project fixtures must include project.courseMap.courseName.',
        ),
      );
    }
    if (!Array.isArray(fixtureCourseMap.lessons) || fixtureCourseMap.lessons.length === 0) {
      findings.push(
        makeFinding(
          'blocker',
          fixtureId,
          'fixture',
          'projectLessons',
          'External project fixtures must include project.courseMap.lessons.',
        ),
      );
    }
    const courseMapPlaceholderPaths = collectUnreplacedTemplatePaths(fixtureCourseMap, 'project.courseMap');
    if (courseMapPlaceholderPaths.length > 0) {
      findings.push(
        makeFinding(
          'blocker',
          fixtureId,
          'fixture',
          'projectCourseMapPlaceholder',
          `External project course maps must replace template text before they count as proof: ${courseMapPlaceholderPaths
            .slice(0, 5)
            .join(', ')}.`,
        ),
      );
    }
  }
  if (fixture.evidenceType && !EXTERNAL_EVIDENCE_TYPES.has(fixture.evidenceType)) {
    findings.push(
      makeFinding(
        'blocker',
        fixtureId,
        'fixture',
        'evidenceType',
        `Review fixture evidenceType must be one of: ${[...EXTERNAL_EVIDENCE_TYPES].join(', ')}.`,
      ),
    );
  }
  if (fixture.templateOnly) {
    findings.push(
      makeFinding(
        'blocker',
        fixtureId,
        'fixture',
        'templateOnly',
        'Template fixtures must be copied, filled with real review evidence, and have templateOnly removed before they count as proof.',
      ),
    );
  }

  if (!isExternalFixture(fixture)) return findings;

  const reviewEvidence = fixture.reviewEvidence || {};
  if (!fixture.reviewerRole || fixture.reviewerRole === 'reviewer') {
    findings.push(
      makeFinding(
        'blocker',
        fixtureId,
        'fixture',
        'externalProofReviewerRole',
        'External review fixtures must name the reviewer role.',
      ),
    );
  } else if (hasPlaceholderProofText(fixture.reviewerRole)) {
    findings.push(
      makeFinding(
        'blocker',
        fixtureId,
        'fixture',
        'externalProofReviewerRolePlaceholder',
        'External review fixtures must replace placeholder reviewer-role text with the real reviewer role.',
      ),
    );
  }
  if (!reviewEvidence.reviewerType) {
    findings.push(
      makeFinding(
        'blocker',
        fixtureId,
        'fixture',
        'externalProofReviewerType',
        'External review fixtures must include reviewEvidence.reviewerType.',
      ),
    );
  } else if (hasPlaceholderProofText(reviewEvidence.reviewerType)) {
    findings.push(
      makeFinding(
        'blocker',
        fixtureId,
        'fixture',
        'externalProofReviewerTypePlaceholder',
        'External review fixtures must replace placeholder reviewer-type text with the real reviewer type.',
      ),
    );
  }
  if (!reviewEvidence.reviewedAt) {
    findings.push(
      makeFinding(
        'blocker',
        fixtureId,
        'fixture',
        'externalProofReviewedAt',
        'External review fixtures must include reviewEvidence.reviewedAt.',
      ),
    );
  } else if (hasPlaceholderProofText(reviewEvidence.reviewedAt)) {
    findings.push(
      makeFinding(
        'blocker',
        fixtureId,
        'fixture',
        'externalProofReviewedAtPlaceholder',
        'External review fixtures must replace placeholder review dates with the actual review date.',
      ),
    );
  }
  if (!reviewEvidence.reviewedPackageVersion) {
    findings.push(
      makeFinding(
        'blocker',
        fixtureId,
        'fixture',
        'externalProofPackageVersion',
        'External review fixtures must include reviewEvidence.reviewedPackageVersion.',
      ),
    );
  } else if (hasPlaceholderProofText(reviewEvidence.reviewedPackageVersion)) {
    findings.push(
      makeFinding(
        'blocker',
        fixtureId,
        'fixture',
        'externalProofPackageVersionPlaceholder',
        'External review fixtures must replace placeholder package-version text with the reviewed package version.',
      ),
    );
  } else if (!matchesCurrentPackageVersion(reviewEvidence.reviewedPackageVersion)) {
    findings.push(
      makeFinding(
        'blocker',
        fixtureId,
        'fixture',
        'externalProofPackageVersionMismatch',
        `External review fixtures must match the current package version (${CURRENT_PACKAGE_VERSION}); found ${reviewEvidence.reviewedPackageVersion}. Regenerate and review the packet for this release before using it as A-quality proof.`,
      ),
    );
  }
  if (!Array.isArray(reviewEvidence.reviewedArtifacts) || reviewEvidence.reviewedArtifacts.length === 0) {
    findings.push(
      makeFinding(
        'blocker',
        fixtureId,
        'fixture',
        'externalProofArtifacts',
        'External review fixtures must list reviewEvidence.reviewedArtifacts.',
      ),
    );
  } else if (reviewEvidence.reviewedArtifacts.some((artifact) => hasPlaceholderProofText(artifact))) {
    findings.push(
      makeFinding(
        'blocker',
        fixtureId,
        'fixture',
        'externalProofArtifactsPlaceholder',
        'External review fixtures must replace placeholder artifact names with the actual reviewed artifacts.',
      ),
    );
  }
  if (reviewEvidence.evidenceSource && hasPlaceholderProofText(reviewEvidence.evidenceSource)) {
    findings.push(
      makeFinding(
        'blocker',
        fixtureId,
        'fixture',
        'externalProofEvidenceSourcePlaceholder',
        'External review fixtures must replace placeholder evidence-source text with the actual source of review evidence.',
      ),
    );
  }
  if (!hasExternalProofEvidence(fixture)) {
    findings.push(
      makeFinding(
        'blocker',
        fixtureId,
        'fixture',
        'externalProofExpectations',
        'External review fixtures must include reviewer expectations, edit checks, or instructor edit patterns.',
      ),
    );
  }
  const placeholderExpectationPaths = collectPositiveExpectationPlaceholders(fixture);
  if (placeholderExpectationPaths.length > 0) {
    findings.push(
      makeFinding(
        'blocker',
        fixtureId,
        'fixture',
        'externalProofExpectationPlaceholder',
        `External review fixtures must replace placeholder positive reviewer expectations before they count as proof: ${placeholderExpectationPaths
          .slice(0, 5)
          .join(', ')}.`,
      ),
    );
  }
  if (fixture.reviewScorecard && getReviewScorecardDimensions(fixture).length === 0) {
    findings.push(
      makeFinding(
        'blocker',
        fixtureId,
        'fixture',
        'reviewScorecard',
        'Review scorecards must include at least one scored dimension.',
      ),
    );
  }
  if (fixture.editHistoryEvidenceType === 'external' && getFixtureEditPatterns(fixture).length === 0) {
    findings.push(
      makeFinding(
        'blocker',
        fixtureId,
        'fixture',
        'externalEditHistory',
        'Fixtures marked with external edit history must include instructor edit patterns.',
      ),
    );
  }
  return findings;
}

function buildFixturePreferenceProfile(fixture) {
  const editPatterns = getFixtureEditPatterns(fixture);
  if (editPatterns.length === 0) return null;
  return buildInstructorPreferenceProfile(editPatterns, {
    minSignalCount: Number(fixture.minPreferenceSignals || 1),
    source:
      fixture.editHistoryEvidenceType === 'external'
        ? 'external-instructor-edit-history'
        : 'review-fixture-edit-history',
  });
}

function addPatternFindings({ findings, fixtureId, featureId, text, mustMatch = [], mustNotMatch = [] }) {
  for (const pattern of mustMatch || []) {
    if (!patternMatches(pattern, text)) {
      findings.push(
        makeFinding(
          'blocker',
          fixtureId,
          featureId,
          'mustMatch',
          `${FEATURE_LABELS[featureId] || featureId} is missing reviewer-required evidence ${patternLabel(pattern)}.`,
        ),
      );
    }
  }
  for (const pattern of mustNotMatch || []) {
    if (patternMatches(pattern, text)) {
      findings.push(
        makeFinding(
          'blocker',
          fixtureId,
          featureId,
          'mustNotMatch',
          `${FEATURE_LABELS[featureId] || featureId} contains reviewer-forbidden text ${patternLabel(pattern)}.`,
        ),
      );
    }
  }
}

function resolveReviewFixtureSample(fixture) {
  const externalCourseMap = getFixtureCourseMap(fixture);
  if (externalCourseMap) {
    const lessons = Array.isArray(externalCourseMap.lessons) ? externalCourseMap.lessons : [];
    return {
      id: fixture.sampleId || fixture.project?.id || fixture.id,
      label: fixture.project?.label || fixture.label || fixture.id,
      source: 'external-project',
      project: {
        courseMap: externalCourseMap,
      },
      scope: Number(fixture.scope || fixture.project?.scope || lessons.length || 0),
      features:
        Array.isArray(fixture.features) && fixture.features.length > 0 ? fixture.features : DEFAULT_REVIEW_FEATURES,
      enrichment: fixture.enrichment || {},
    };
  }
  const sample = getGoldSample(fixture.sampleId);
  if (!sample) {
    throw new Error(`Unknown review fixture sampleId: ${fixture.sampleId}`);
  }
  return {
    ...sample,
    source: 'gold-sample',
    features: Array.isArray(fixture.features) && fixture.features.length > 0 ? fixture.features : sample.features,
    enrichment: fixture.enrichment || sample.enrichment || {},
    scope: Number(fixture.scope || sample.scope),
  };
}

function buildCompiledFixture({ fixture, runtime }) {
  const sample = resolveReviewFixtureSample(fixture);
  const rawCourseMap = scopeCourseMap(sample.project.courseMap, sample.scope);
  const instructorPreferenceProfile = buildFixturePreferenceProfile(fixture);
  const blueprint = runtime.buildCourseBlueprint(rawCourseMap, {
    enrichment: sample.enrichment || {},
    instructorPreferences: instructorPreferenceProfile,
  });
  const compiledFeatures = runtime.getBlueprintCompiledFeatures(sample.features);
  const compiled = runtime.compileBlueprintDeliverables(blueprint, compiledFeatures, {
    configMap: { courseFaq: { questionsPerLesson: 5 } },
  });
  return { sample, blueprint, compiled, compiledFeatures, instructorPreferenceProfile };
}

function auditBlueprintExpectations({ fixture, blueprint, findings }) {
  const expectations = fixture.blueprintExpectations || {};
  const qualitySignals = blueprint.qualitySignals || {};
  if (
    Number.isFinite(expectations.minReviewFlags) &&
    Number(qualitySignals.reviewFlagCount || 0) < expectations.minReviewFlags
  ) {
    findings.push(
      makeFinding(
        'blocker',
        fixture.id,
        'blueprint',
        'minReviewFlags',
        `Expected at least ${expectations.minReviewFlags} review flag(s), found ${qualitySignals.reviewFlagCount || 0}.`,
      ),
    );
  }
  if (
    Number.isFinite(expectations.maxSourceGroundedLessonCount) &&
    Number(qualitySignals.sourceGroundedLessonCount || 0) > expectations.maxSourceGroundedLessonCount
  ) {
    findings.push(
      makeFinding(
        'blocker',
        fixture.id,
        'blueprint',
        'sourceGrounding',
        `Expected no more than ${expectations.maxSourceGroundedLessonCount} fully source-grounded lesson(s), found ${qualitySignals.sourceGroundedLessonCount || 0}.`,
      ),
    );
  }
  const reviewText = collectStrings(qualitySignals.reviewFlags || []).join(' ');
  for (const pattern of expectations.reviewFlagMustMatch || []) {
    if (!patternMatches(pattern, reviewText)) {
      findings.push(
        makeFinding(
          'blocker',
          fixture.id,
          'blueprint',
          'reviewSignal',
          `Blueprint review flags are missing reviewer-required signal ${patternLabel(pattern)}.`,
        ),
      );
    }
  }
}

function auditEditChecks({ fixture, blueprint, compiled, packageText, findings }) {
  const blueprintText = collectStrings(blueprint.qualitySignals?.reviewFlags || []).join(' ');
  for (const check of fixture.editChecks || []) {
    if (check.blueprintMustMatch && !patternMatches(check.blueprintMustMatch, blueprintText)) {
      findings.push(makeFinding('blocker', fixture.id, 'blueprint', check.id, check.label));
    }
    const featureId = check.featureId || 'package';
    const text = featureId === 'package' ? packageText : collectStrings(getFeatureData(featureId, compiled)).join(' ');
    if (check.mustMatch && !patternMatches(check.mustMatch, text)) {
      findings.push(makeFinding('blocker', fixture.id, featureId, check.id, check.label));
    }
    if (check.mustNotMatch && patternMatches(check.mustNotMatch, text)) {
      findings.push(makeFinding('blocker', fixture.id, featureId, check.id, check.label));
    }
  }
}

function normalizeScorecardDimension(dimension, index, defaultMaxScore) {
  const score = Number(typeof dimension === 'number' ? dimension : dimension?.score);
  const maxScore = Number(dimension?.maxScore || dimension?.scale || defaultMaxScore || 10);
  const normalizedScore =
    Number.isFinite(score) && Number.isFinite(maxScore) && maxScore > 0 ? (score / maxScore) * 10 : null;
  const evidenceArtifacts = Array.isArray(dimension?.evidenceArtifacts)
    ? dimension.evidenceArtifacts
    : Array.isArray(dimension?.artifactEvidence)
      ? dimension.artifactEvidence
      : Array.isArray(dimension?.reviewedArtifacts)
        ? dimension.reviewedArtifacts
        : [];
  const evidenceExamples = Array.isArray(dimension?.evidenceExamples)
    ? dimension.evidenceExamples
    : Array.isArray(dimension?.examples)
      ? dimension.examples
      : Array.isArray(dimension?.artifactExamples)
        ? dimension.artifactExamples
        : [];
  return {
    id: dimension?.id || `dimension-${index + 1}`,
    label: dimension?.label || dimension?.name || `Dimension ${index + 1}`,
    score: Number.isFinite(score) ? score : null,
    maxScore: Number.isFinite(maxScore) && maxScore > 0 ? maxScore : null,
    normalizedScore: Number.isFinite(normalizedScore) ? Number(normalizedScore.toFixed(2)) : null,
    notes: dimension?.notes || dimension?.comment || '',
    evidenceArtifacts,
    evidenceExamples,
  };
}

function normalizeScorecardDimensionKey(value) {
  return String(value || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function scorecardDimensionCoverage(dimensions) {
  const dimensionKeys = dimensions.map(
    (dimension) =>
      new Set(
        [dimension.id, dimension.label, dimension.name]
          .filter(Boolean)
          .map((value) => normalizeScorecardDimensionKey(value)),
      ),
  );

  const coverage = REQUIRED_REVIEW_SCORECARD_DIMENSIONS.map((required) => {
    const expectedKeys = new Set(
      [required.id, required.label, ...(required.aliases || [])].map((value) => normalizeScorecardDimensionKey(value)),
    );
    const matched = dimensionKeys.some((keys) => [...keys].some((key) => expectedKeys.has(key)));
    return {
      id: required.id,
      label: required.label,
      covered: matched,
    };
  });

  return {
    required: coverage.length,
    covered: coverage.filter((item) => item.covered).length,
    missing: coverage.filter((item) => !item.covered).map((item) => item.label),
  };
}

function auditReviewerScorecard({ fixture, findings }) {
  const dimensions = getReviewScorecardDimensions(fixture);
  const defaultMaxScore = Number(fixture?.reviewScorecard?.maxScore || fixture?.reviewScorecard?.scale || 10);
  const floor = Number(
    fixture?.reviewScorecard?.minNormalizedScore || fixture?.reviewScorecard?.floor || REVIEW_SCORECARD_FLOOR,
  );
  const normalized = dimensions.map((dimension, index) =>
    normalizeScorecardDimension(dimension, index, defaultMaxScore),
  );
  const requiredCoverage = scorecardDimensionCoverage(normalized);
  let weakNoteCount = 0;
  let weakEvidenceCount = 0;

  if (normalized.length > 0 && requiredCoverage.missing.length > 0) {
    findings.push(
      makeFinding(
        'blocker',
        fixture.id,
        'reviewScorecard',
        'reviewScorecardCoverage',
        `Reviewer scorecard is missing required classroom-quality dimensions: ${requiredCoverage.missing.join(', ')}.`,
      ),
    );
  }

  if (isExternalFixture(fixture)) {
    for (const dimension of normalized) {
      if (!hasConcreteProofNote(dimension.notes)) {
        weakNoteCount += 1;
        findings.push(
          makeFinding(
            'blocker',
            fixture.id,
            'reviewScorecard',
            'reviewScorecardNotes',
            `${dimension.label} needs concrete external reviewer notes, not blank or placeholder text.`,
          ),
        );
      }
      const evidenceArtifactIds = normalizeScorecardEvidenceArtifacts(dimension.evidenceArtifacts);
      const concreteExamples = dimension.evidenceExamples.filter((example) =>
        hasConcreteProofNote(scorecardEvidenceExampleText(example)),
      );
      if (evidenceArtifactIds.length === 0 || concreteExamples.length === 0) {
        weakEvidenceCount += 1;
        findings.push(
          makeFinding(
            'blocker',
            fixture.id,
            'reviewScorecard',
            'reviewScorecardEvidence',
            `${dimension.label} needs at least one reviewed artifact and one concrete evidence example supporting the score.`,
          ),
        );
      }
      dimension.evidenceArtifactIds = evidenceArtifactIds;
      dimension.concreteEvidenceExampleCount = concreteExamples.length;
    }
  }

  for (const dimension of normalized) {
    if (!Number.isFinite(dimension.normalizedScore)) {
      findings.push(
        makeFinding(
          'blocker',
          fixture.id,
          'reviewScorecard',
          'reviewScorecardScore',
          `${dimension.label} is missing a numeric reviewer score.`,
        ),
      );
      continue;
    }
    if (dimension.normalizedScore < floor) {
      findings.push(
        makeFinding(
          'blocker',
          fixture.id,
          'reviewScorecard',
          'reviewScorecardFloor',
          `${dimension.label} scored ${dimension.normalizedScore}/10, below the required ${floor}/10.`,
        ),
      );
    }
  }

  const scores = normalized.map((dimension) => dimension.normalizedScore).filter(Number.isFinite);
  return {
    dimensionCount: normalized.length,
    floor,
    minScore: scores.length ? Math.min(...scores) : null,
    avgScore: scores.length ? Number((scores.reduce((sum, score) => sum + score, 0) / scores.length).toFixed(2)) : null,
    requiredCoverage,
    status:
      normalized.length === 0
        ? 'not-provided'
        : requiredCoverage.missing.length > 0 ||
            weakNoteCount > 0 ||
            weakEvidenceCount > 0 ||
            scores.length !== normalized.length ||
            scores.some((score) => score < floor)
          ? 'blocked'
          : 'pass',
    dimensions: normalized,
    evidenceAnchoredDimensionCount: normalized.filter(
      (dimension) =>
        (dimension.evidenceArtifactIds || normalizeScorecardEvidenceArtifacts(dimension.evidenceArtifacts)).length >
          0 &&
        (dimension.concreteEvidenceExampleCount ||
          dimension.evidenceExamples.filter((example) => hasConcreteProofNote(scorecardEvidenceExampleText(example)))
            .length) > 0,
    ).length,
  };
}

function scorecardEvidenceExampleText(example) {
  if (typeof example === 'string' || typeof example === 'number') return String(example);
  if (!example || typeof example !== 'object') return '';
  return cleanText(
    example.text ||
      example.note ||
      example.notes ||
      example.evidence ||
      example.example ||
      collectStrings(example).join(' '),
  );
}

function normalizeScorecardEvidenceArtifacts(artifacts) {
  return uniqueValues(
    (Array.isArray(artifacts) ? artifacts : [])
      .map((artifact) => {
        const normalized = normalizeReviewedArtifactKey(artifact);
        return REVIEWED_ARTIFACT_ALIASES.get(normalized) || normalized;
      })
      .filter((featureId) => REQUIRED_FULL_PACKAGE_ARTIFACTS.includes(featureId)),
    REQUIRED_FULL_PACKAGE_ARTIFACTS.length,
  );
}

function auditSourceFidelityReview({ fixture, findings }) {
  const review = getSourceFidelityReview(fixture);
  if (!review) {
    return {
      status: 'not-provided',
      sourceInputReviewed: false,
      compiledPackageReviewed: false,
      artifactReviewCount: 0,
      reviewedArtifacts: [],
      missingArtifacts: REQUIRED_FULL_PACKAGE_ARTIFACTS,
      notes: '',
    };
  }

  let blockerCount = 0;
  const addBlocker = (check, message) => {
    blockerCount += 1;
    findings.push(makeFinding('blocker', fixture.id, 'sourceFidelityReview', check, message));
  };
  const notes = review.notes || review.sourceFidelityNotes || review.comment || '';
  const unsupportedRisk = cleanText(review.unsupportedInventionRisk ?? review.inventionRisk ?? '').toLowerCase();
  const artifactReviews = normalizeSourceFidelityArtifactReviews(review);
  const reviewedArtifacts = uniqueValues(
    artifactReviews.map((artifactReview) => artifactReview.featureId).filter(Boolean),
    REQUIRED_FULL_PACKAGE_ARTIFACTS.length,
  );
  const reviewedArtifactSet = new Set(reviewedArtifacts);
  const missingArtifacts = REQUIRED_FULL_PACKAGE_ARTIFACTS.filter((featureId) => !reviewedArtifactSet.has(featureId));
  const weakArtifactReviews = artifactReviews.filter(
    (artifactReview) =>
      !artifactReview.featureId ||
      artifactReview.sourceCompared !== true ||
      artifactReview.packageCompared !== true ||
      !hasConcreteProofNote(artifactReview.notes) ||
      artifactReview.sourceSignalsPreserved === false ||
      artifactReview.compilerDecisionVisible !== true ||
      artifactReview.publishGateVisible !== true ||
      artifactReview.modelUsePolicyVisible !== true ||
      artifactReview.handoffReviewFocusVisible !== true ||
      artifactReview.localReviewActionVisible !== true ||
      artifactReview.unsupportedInventionRisk === true ||
      /\b(?:high|major|unacceptable|unsupported)\b/i.test(cleanText(artifactReview.unsupportedInventionRisk)),
  );

  if (review.sourceInputReviewed !== true) {
    addBlocker(
      'sourceInputReviewed',
      'Source-fidelity review must confirm that the reviewer inspected the original source course-map file.',
    );
  }
  if (review.compiledPackageReviewed !== true) {
    addBlocker(
      'compiledPackageReviewed',
      'Source-fidelity review must confirm that the reviewer inspected the compiled full package.',
    );
  }
  if (!hasConcreteProofNote(notes)) {
    addBlocker(
      'sourceFidelityNotes',
      'Source-fidelity review needs concrete reviewer notes comparing the source course map to the compiled package.',
    );
  }
  if (isExternalFixture(fixture) && artifactReviews.length === 0) {
    addBlocker(
      'sourceFidelityArtifactReviews',
      'External source-fidelity review must include artifactReviews comparing source input to each compiled core artifact.',
    );
  }
  if (isExternalFixture(fixture) && missingArtifacts.length > 0) {
    addBlocker(
      'sourceFidelityArtifactCoverage',
      `External source-fidelity review must cover every core artifact: ${missingArtifacts.join(', ')} missing.`,
    );
  }
  if (weakArtifactReviews.length > 0) {
    addBlocker(
      'sourceFidelityArtifactNotes',
      `Source-fidelity review has ${weakArtifactReviews.length} artifact row(s) missing source/package comparison flags, concrete notes, preserved-source confirmation, compiler-decision visibility, publish-gate visibility, model-use-policy visibility, handoff-review-focus visibility, or local-review action visibility.`,
    );
  }
  if (review.lessonOrderPreserved === false) {
    addBlocker('lessonOrderPreserved', 'Source-fidelity review says lesson order was not preserved.');
  }
  if (review.assessmentsPreserved === false) {
    addBlocker('assessmentsPreserved', 'Source-fidelity review says source assessments were not preserved.');
  }
  if (
    review.unsupportedInventionRisk === true ||
    /\b(?:high|major|unacceptable|unsupported)\b/i.test(unsupportedRisk)
  ) {
    addBlocker('unsupportedInventionRisk', 'Source-fidelity review found unsupported invention risk.');
  }

  return {
    status: blockerCount > 0 ? 'blocked' : 'pass',
    sourceInputReviewed: review.sourceInputReviewed === true,
    compiledPackageReviewed: review.compiledPackageReviewed === true,
    artifactReviewCount: artifactReviews.length,
    reviewedArtifacts,
    missingArtifacts,
    artifactReviews,
    lessonOrderPreserved: review.lessonOrderPreserved,
    assessmentsPreserved: review.assessmentsPreserved,
    unsupportedInventionRisk: review.unsupportedInventionRisk ?? review.inventionRisk ?? null,
    notes,
  };
}

function normalizeSourceFidelityArtifactReviews(review) {
  const rows = Array.isArray(review?.artifactReviews)
    ? review.artifactReviews
    : Array.isArray(review?.artifactComparisons)
      ? review.artifactComparisons
      : Array.isArray(review?.artifactChecks)
        ? review.artifactChecks
        : [];
  return rows.map((row) => {
    const rawArtifact = row?.featureId || row?.artifactId || row?.artifact || row?.deliverable || row?.name;
    const normalizedArtifact = normalizeReviewedArtifactKey(rawArtifact);
    const featureId = REVIEWED_ARTIFACT_ALIASES.get(normalizedArtifact) || normalizedArtifact;
    return {
      artifact: cleanText(rawArtifact),
      featureId: REQUIRED_FULL_PACKAGE_ARTIFACTS.includes(featureId) ? featureId : '',
      sourceCompared: row?.sourceCompared === true || row?.sourceInputReviewed === true,
      packageCompared: row?.packageCompared === true || row?.compiledPackageReviewed === true,
      sourceSignalsPreserved: row?.sourceSignalsPreserved ?? row?.signalsPreserved ?? row?.sourcePreserved ?? null,
      compilerDecisionVisible: row?.compilerDecisionVisible ?? row?.compilerDecisionTraceVisible ?? null,
      publishGateVisible: row?.publishGateVisible ?? row?.publishBoundaryVisible ?? null,
      modelUsePolicyVisible: row?.modelUsePolicyVisible ?? row?.modelPolicyVisible ?? null,
      handoffReviewFocusVisible: row?.handoffReviewFocusVisible ?? row?.reviewFocusVisible ?? null,
      localReviewActionVisible:
        row?.localReviewActionVisible ?? row?.reviewActionabilityVisible ?? row?.localConfirmationActionVisible ?? null,
      unsupportedInventionRisk: row?.unsupportedInventionRisk ?? row?.inventionRisk ?? null,
      notes: cleanText(row?.notes || row?.sourceFidelityNotes || row?.comment || row?.evidence),
    };
  });
}

function getAssumptionLedgerReviewDecisions(review) {
  const rows = Array.isArray(review?.reviewedRows)
    ? review.reviewedRows
    : Array.isArray(review?.decisions)
      ? review.decisions
      : Array.isArray(review?.assumptionDecisions)
        ? review.assumptionDecisions
        : Array.isArray(review?.reviewedAssumptions)
          ? review.reviewedAssumptions
          : [];

  return rows.map((row) => {
    const rowId = cleanText(row?.rowId || row?.id || row?.assumptionId || row?.ledgerRowId);
    const category = cleanText(row?.category || row?.ledgerCategory);
    return {
      rowId,
      category,
      normalizedRowId: normalizeReviewedArtifactKey(rowId),
      normalizedCategory: normalizeReviewedArtifactKey(category),
      coverage: cleanText(row?.coverage || row?.scope || row?.covers),
      decision: cleanText(row?.decision || row?.reviewerDecision || row?.status || row?.resolution),
      notes: cleanText(row?.notes || row?.rationale || row?.comment || row?.evidence),
    };
  });
}

function coversAssumptionLedgerRow(decision, row) {
  const rowId = normalizeReviewedArtifactKey(row?.id);
  const category = normalizeReviewedArtifactKey(row?.category);
  if (rowId && decision.normalizedRowId === rowId) return true;
  if (decision.normalizedCategory !== category) return false;
  return /\b(?:all|category|review-required|review required|rows?|items?)\b/i.test(decision.coverage);
}

function auditAssumptionLedgerReview({ fixture, blueprint, findings }) {
  const review = getAssumptionLedgerReview(fixture);
  const ledger = blueprint?.blueprintAssumptionLedger || {};
  const requiredCategories =
    Array.isArray(ledger.categories) && ledger.categories.length > 0
      ? ledger.categories
      : REQUIRED_ASSUMPTION_LEDGER_CATEGORIES;
  const reviewRequiredRows = Array.isArray(ledger.rows) ? ledger.rows.filter((row) => row?.reviewRequired) : [];
  const reviewRequiredRowCount = reviewRequiredRows.length;
  const reviewRequiredCategories = uniqueValues(
    reviewRequiredRows.map((row) => cleanText(row.category)).filter(Boolean),
  );

  if (!review) {
    return {
      status: 'not-provided',
      assumptionLedgerReviewed: false,
      categoriesReviewed: [],
      requiredCategories,
      missingCategories: requiredCategories,
      reviewRequiredRowCount,
      reviewRequiredCategories,
      reviewRequiredRowsReviewed: false,
      reviewedRowDecisionCount: 0,
      missingReviewRequiredRows: reviewRequiredRows.map((row) => row.id || row.category).filter(Boolean),
      missingReviewRequiredCategories: reviewRequiredCategories,
      notes: '',
    };
  }

  let blockerCount = 0;
  const addBlocker = (check, message) => {
    blockerCount += 1;
    findings.push(makeFinding('blocker', fixture.id, 'assumptionLedgerReview', check, message));
  };
  const categoriesReviewed = Array.isArray(review.categoriesReviewed)
    ? review.categoriesReviewed
    : Array.isArray(review.reviewedCategories)
      ? review.reviewedCategories
      : Array.isArray(review.categories)
        ? review.categories
        : [];
  const reviewedCategorySet = new Set(categoriesReviewed.map((category) => normalizeReviewedArtifactKey(category)));
  const missingCategories = requiredCategories.filter(
    (category) => !reviewedCategorySet.has(normalizeReviewedArtifactKey(category)),
  );
  const notes = review.notes || review.assumptionNotes || review.comment || '';
  const unresolvedRisk = cleanText(
    review.unresolvedAssumptionRisk ?? review.unresolvedRisk ?? review.unresolvedHighRiskAssumptions ?? '',
  ).toLowerCase();
  const assumptionLedgerReviewed = review.assumptionLedgerReviewed === true || review.reviewed === true;
  const reviewRequiredRowsReviewed =
    review.reviewRequiredRowsReviewed === true || review.reviewRequiredItemsReviewed === true;
  const decisionRowsRequired = reviewRequiredRowCount > 0 || isExternalFixture(fixture);
  const reviewedRowDecisions = getAssumptionLedgerReviewDecisions(review);
  const weakDecisionRows = reviewedRowDecisions.filter(
    (decision) => !hasConcreteProofNote(decision.decision) || !hasConcreteProofNote(decision.notes),
  );
  const missingReviewRequiredRows = reviewRequiredRows.filter(
    (row) => !reviewedRowDecisions.some((decision) => coversAssumptionLedgerRow(decision, row)),
  );
  const reviewedDecisionCategorySet = new Set(
    reviewedRowDecisions
      .filter((decision) => hasConcreteProofNote(decision.decision) && hasConcreteProofNote(decision.notes))
      .map((decision) => decision.normalizedCategory)
      .filter(Boolean),
  );
  const missingReviewRequiredCategories = reviewRequiredCategories.filter(
    (category) => !reviewedDecisionCategorySet.has(normalizeReviewedArtifactKey(category)),
  );

  if (!assumptionLedgerReviewed) {
    addBlocker(
      'assumptionLedgerReviewed',
      'Assumption-ledger review must confirm that the reviewer inspected the blueprint assumption ledger.',
    );
  }
  if (missingCategories.length > 0) {
    addBlocker(
      'assumptionLedgerCategories',
      `Assumption-ledger review must cover every ledger category: ${missingCategories.join(', ')} missing.`,
    );
  }
  if (reviewRequiredRowCount > 0 && !reviewRequiredRowsReviewed) {
    addBlocker(
      'reviewRequiredRowsReviewed',
      'Assumption-ledger review must confirm that review-required assumption rows were inspected.',
    );
  }
  if (decisionRowsRequired && reviewedRowDecisions.length === 0) {
    addBlocker(
      'assumptionLedgerDecisions',
      'Assumption-ledger review must include reviewer decision rows for review-required assumptions.',
    );
  }
  if (weakDecisionRows.length > 0) {
    addBlocker(
      'assumptionLedgerDecisionNotes',
      `Assumption-ledger review has ${weakDecisionRows.length} decision row(s) missing concrete decisions or notes.`,
    );
  }
  if (reviewRequiredRowCount > 0 && missingReviewRequiredRows.length > 0) {
    addBlocker(
      'assumptionLedgerDecisionCoverage',
      `Assumption-ledger review decisions must cover every review-required row or category: ${missingReviewRequiredRows
        .slice(0, 5)
        .map((row) => row.id || row.category)
        .join(
          ', ',
        )}${missingReviewRequiredRows.length > 5 ? ` and ${missingReviewRequiredRows.length - 5} more` : ''} missing.`,
    );
  }
  if (!hasConcreteProofNote(notes)) {
    addBlocker(
      'assumptionLedgerNotes',
      'Assumption-ledger review needs concrete reviewer notes about inferred assumptions and local confirmations.',
    );
  }
  if (
    review.unresolvedHighRiskAssumptions === true ||
    /\b(?:high|major|unacceptable|unresolved|blocker)\b/i.test(unresolvedRisk)
  ) {
    addBlocker('unresolvedAssumptionRisk', 'Assumption-ledger review reports unresolved high-risk assumptions.');
  }

  return {
    status: blockerCount > 0 ? 'blocked' : 'pass',
    assumptionLedgerReviewed,
    categoriesReviewed,
    requiredCategories,
    missingCategories,
    reviewRequiredRowCount,
    reviewRequiredCategories,
    reviewRequiredRowsReviewed,
    reviewedRowDecisionCount: reviewedRowDecisions.length,
    missingReviewRequiredRows: missingReviewRequiredRows.map((row) => row.id || row.category).filter(Boolean),
    missingReviewRequiredCategories,
    reviewedRows: reviewedRowDecisions,
    unresolvedAssumptionRisk: review.unresolvedAssumptionRisk ?? review.unresolvedRisk ?? null,
    notes,
  };
}

function normalizeBlueprintQualityLessonReviews(review) {
  const rows = Array.isArray(review?.lessonReviews)
    ? review.lessonReviews
    : Array.isArray(review?.lessonChecks)
      ? review.lessonChecks
      : Array.isArray(review?.lessonComparisons)
        ? review.lessonComparisons
        : [];
  return rows.map((row) => ({
    lessonNumber: Number(row?.lessonNumber || row?.lesson || row?.week || 0),
    sourceCompared: row?.sourceCompared === true || row?.sourceInputReviewed === true,
    blueprintCompared: row?.blueprintCompared === true || row?.compactBlueprintReviewed === true,
    sourceSignalsPreserved: row?.sourceSignalsPreserved ?? row?.signalsPreserved ?? null,
    assessmentPreserved: row?.assessmentPreserved ?? row?.assessmentSignalsPreserved ?? null,
    alignmentUsable: row?.alignmentUsable ?? row?.instructionalAlignmentUsable ?? null,
    reviewRequiredFlagsVisible:
      row?.reviewRequiredFlagsVisible ?? row?.localReviewFlagsVisible ?? row?.assumptionsVisible ?? null,
    notes: cleanText(row?.notes || row?.blueprintNotes || row?.comment || row?.evidence),
  }));
}

function auditBlueprintQualityReview({ fixture, blueprint, findings }) {
  const review = getBlueprintQualityReview(fixture);
  const lessons = Array.isArray(blueprint?.lessons) ? blueprint.lessons : [];
  const requiredLessonCount = lessons.length;

  if (!review) {
    return {
      status: 'not-provided',
      blueprintReviewed: false,
      sourceInputReviewed: false,
      compactRepresentationReviewed: false,
      lessonReviewCount: 0,
      requiredLessonCount,
      missingLessonNumbers: lessons.map((lesson, index) => lesson.lessonNumber || index + 1),
      notes: '',
    };
  }

  let blockerCount = 0;
  const addBlocker = (check, message) => {
    blockerCount += 1;
    findings.push(makeFinding('blocker', fixture.id, 'blueprintQualityReview', check, message));
  };
  const notes = review.notes || review.blueprintNotes || review.comment || '';
  const unresolvedRisk = cleanText(review.unresolvedBlueprintRisk ?? review.unresolvedRisk ?? '').toLowerCase();
  const lessonReviews = normalizeBlueprintQualityLessonReviews(review);
  const reviewedLessonNumbers = new Set(
    lessonReviews.map((row) => Number(row.lessonNumber)).filter((lessonNumber) => Number.isFinite(lessonNumber)),
  );
  const missingLessonNumbers = lessons
    .map((lesson, index) => lesson.lessonNumber || index + 1)
    .filter((lessonNumber) => !reviewedLessonNumbers.has(Number(lessonNumber)));
  const weakLessonReviews = lessonReviews.filter(
    (row) =>
      !Number.isFinite(row.lessonNumber) ||
      row.lessonNumber <= 0 ||
      row.sourceCompared !== true ||
      row.blueprintCompared !== true ||
      row.sourceSignalsPreserved === false ||
      row.assessmentPreserved === false ||
      row.alignmentUsable === false ||
      row.reviewRequiredFlagsVisible === false ||
      !hasConcreteProofNote(row.notes),
  );

  if (review.blueprintReviewed !== true) {
    addBlocker(
      'blueprintReviewed',
      'Blueprint-quality review must confirm that the reviewer inspected the compact course blueprint.',
    );
  }
  if (review.sourceInputReviewed !== true) {
    addBlocker(
      'sourceInputReviewed',
      'Blueprint-quality review must confirm that the reviewer compared the source course map to the compact blueprint.',
    );
  }
  if (review.compactRepresentationReviewed !== true && review.compactBlueprintReviewed !== true) {
    addBlocker(
      'compactRepresentationReviewed',
      'Blueprint-quality review must confirm that the reviewer inspected the compact representation before final package review.',
    );
  }
  if (!hasConcreteProofNote(notes)) {
    addBlocker(
      'blueprintQualityNotes',
      'Blueprint-quality review needs concrete notes about source-to-blueprint compression and decode readiness.',
    );
  }
  if (isExternalFixture(fixture) && requiredLessonCount > 0 && lessonReviews.length === 0) {
    addBlocker(
      'blueprintLessonReviews',
      'External blueprint-quality review must include lessonReviews comparing each source lesson to its compact blueprint row.',
    );
  }
  if (isExternalFixture(fixture) && missingLessonNumbers.length > 0) {
    addBlocker(
      'blueprintLessonCoverage',
      `External blueprint-quality review must cover every lesson row: ${missingLessonNumbers
        .slice(0, 8)
        .join(', ')}${missingLessonNumbers.length > 8 ? ` and ${missingLessonNumbers.length - 8} more` : ''} missing.`,
    );
  }
  if (weakLessonReviews.length > 0) {
    addBlocker(
      'blueprintLessonReviewNotes',
      `Blueprint-quality review has ${weakLessonReviews.length} lesson row(s) missing source/blueprint comparison flags, positive preservation checks, or concrete notes.`,
    );
  }
  if (review.sourceSignalsPreserved === false) {
    addBlocker('sourceSignalsPreserved', 'Blueprint-quality review says source signals were not preserved.');
  }
  if (review.assessmentsPreserved === false) {
    addBlocker('assessmentsPreserved', 'Blueprint-quality review says assessment signals were not preserved.');
  }
  if (review.alignmentUsable === false) {
    addBlocker('alignmentUsable', 'Blueprint-quality review says the compact blueprint is not instructionally usable.');
  }
  if (
    review.unresolvedBlueprintRisk === true ||
    /\b(?:high|major|unacceptable|unresolved|blocker)\b/i.test(unresolvedRisk)
  ) {
    addBlocker('unresolvedBlueprintRisk', 'Blueprint-quality review reports unresolved high-risk blueprint issues.');
  }

  return {
    status: blockerCount > 0 ? 'blocked' : 'pass',
    blueprintReviewed: review.blueprintReviewed === true,
    sourceInputReviewed: review.sourceInputReviewed === true,
    compactRepresentationReviewed:
      review.compactRepresentationReviewed === true || review.compactBlueprintReviewed === true,
    sourceSignalsPreserved: review.sourceSignalsPreserved ?? null,
    assessmentsPreserved: review.assessmentsPreserved ?? null,
    alignmentUsable: review.alignmentUsable ?? null,
    lessonReviewCount: lessonReviews.length,
    requiredLessonCount,
    missingLessonNumbers,
    lessonReviews,
    unresolvedBlueprintRisk: review.unresolvedBlueprintRisk ?? review.unresolvedRisk ?? null,
    notes,
  };
}

function addPreferenceFinding(findings, fixtureId, featureId, check, message) {
  findings.push(makeFinding('blocker', fixtureId, featureId, check, message));
}

function hasConcreteEditPatternEvidence(pattern) {
  const noteFields = [
    pattern?.notes,
    pattern?.rationale,
    pattern?.reason,
    pattern?.evidence,
    pattern?.editSummary,
    pattern?.beforeAfterSummary,
    pattern?.acceptedEditRationale,
  ];
  if (noteFields.some((value) => hasConcreteProofNote(value))) return true;

  const beforeText = cleanText(pattern?.before || pattern?.beforeText || pattern?.original || pattern?.from);
  const afterText = cleanText(pattern?.after || pattern?.afterText || pattern?.revised || pattern?.to);
  return (
    hasConcreteProofNote(beforeText) &&
    hasConcreteProofNote(afterText) &&
    normalizeReviewedArtifactKey(beforeText) !== normalizeReviewedArtifactKey(afterText)
  );
}

function auditExternalEditPatternEvidence({ fixture, editPatterns, findings }) {
  if (!isExternalFixture(fixture) || fixture.editHistoryEvidenceType !== 'external') {
    return {
      concreteEvidencePatternCount: 0,
      weakEvidencePatternCount: 0,
      missingCoreFieldCount: 0,
    };
  }

  let missingCoreFieldCount = 0;
  let weakEvidencePatternCount = 0;
  const concreteEvidencePatternCount = editPatterns.filter((pattern, index) => {
    const missingCoreFields = ['featureId', 'field', 'action'].filter((field) => !cleanText(pattern?.[field]));
    if (missingCoreFields.length > 0) {
      missingCoreFieldCount += 1;
      addPreferenceFinding(
        findings,
        fixture.id,
        'editHistory',
        'externalEditPatternFields',
        `External edit pattern ${index + 1} is missing required field(s): ${missingCoreFields.join(', ')}.`,
      );
    }
    if (hasPlaceholderProofText(pattern?.action)) {
      missingCoreFieldCount += 1;
      addPreferenceFinding(
        findings,
        fixture.id,
        'editHistory',
        'externalEditPatternAction',
        `External edit pattern ${index + 1} has placeholder action text.`,
      );
    }
    if (!hasConcreteEditPatternEvidence(pattern)) {
      weakEvidencePatternCount += 1;
      addPreferenceFinding(
        findings,
        fixture.id,
        'editHistory',
        'externalEditPatternEvidence',
        `External edit pattern ${index + 1} needs concrete before/after text or notes explaining the accepted instructor edit.`,
      );
      return false;
    }
    return missingCoreFields.length === 0 && !hasPlaceholderProofText(pattern?.action);
  }).length;

  return {
    concreteEvidencePatternCount,
    weakEvidencePatternCount,
    missingCoreFieldCount,
  };
}

function auditInstructorEditHistory({
  fixture,
  blueprint,
  compiled,
  compiledFeatures,
  instructorPreferenceProfile,
  findings,
}) {
  const editPatterns = getFixtureEditPatterns(fixture);
  const editPatternCount = editPatterns.length;
  if (editPatternCount === 0) {
    return {
      editPatternCount: 0,
      appliedFeatureCount: 0,
      concreteEvidencePatternCount: 0,
      weakEvidencePatternCount: 0,
      missingCoreFieldCount: 0,
    };
  }
  const editEvidenceSummary = auditExternalEditPatternEvidence({ fixture, editPatterns, findings });

  if (!instructorPreferenceProfile) {
    addPreferenceFinding(
      findings,
      fixture.id,
      'blueprint',
      'editHistoryProfile',
      `Instructor edit history included ${editPatternCount} pattern(s), but no preference profile was built.`,
    );
    return {
      editPatternCount,
      appliedFeatureCount: 0,
      ...editEvidenceSummary,
    };
  }

  const blueprintProfile = blueprint.instructorPreferenceProfile || {};
  if (Number(blueprintProfile.signalCount || 0) < editPatternCount) {
    addPreferenceFinding(
      findings,
      fixture.id,
      'blueprint',
      'editHistoryProfile',
      `Blueprint preference profile has ${blueprintProfile.signalCount || 0} signal(s), expected at least ${editPatternCount}.`,
    );
  }

  const syllabusReceiptText = collectStrings(compiled?.syllabus?.syllabus?.blueprintQualityReceipt || {}).join(' ');
  const preferenceSummary = summarizeInstructorPreferenceProfile(instructorPreferenceProfile);
  if (
    compiledFeatures.includes('syllabus') &&
    preferenceSummary &&
    !patternMatches(preferenceSummary, syllabusReceiptText)
  ) {
    addPreferenceFinding(
      findings,
      fixture.id,
      'syllabus',
      'preferenceReceipt',
      `Syllabus blueprint receipt does not expose learned preference summary "${preferenceSummary}".`,
    );
  }

  const featureIds = Object.keys(instructorPreferenceProfile.featureSignals || {}).filter(
    (featureId) => featureId !== 'courseMap' && compiledFeatures.includes(featureId),
  );
  const appliedFeatureIds = [];
  for (const featureId of featureIds) {
    const expected = describeInstructorPreferenceForFeature(instructorPreferenceProfile, featureId);
    if (!expected) continue;
    const text = collectStrings(getFeatureData(featureId, compiled)).join(' ');
    if (!patternMatches(expected, text)) {
      addPreferenceFinding(
        findings,
        fixture.id,
        featureId,
        'preferenceApplication',
        `${FEATURE_LABELS[featureId] || featureId} does not expose learned preference "${expected}".`,
      );
    } else {
      appliedFeatureIds.push(featureId);
    }
  }

  for (const [featureId, patterns] of Object.entries(fixture.preferenceExpectations || {})) {
    const text =
      featureId === 'blueprint'
        ? collectStrings(blueprint.instructorPreferenceProfile || {}).join(' ')
        : collectStrings(getFeatureData(featureId, compiled)).join(' ');
    addPatternFindings({
      findings,
      fixtureId: fixture.id,
      featureId,
      text,
      mustMatch: Array.isArray(patterns) ? patterns : [],
    });
  }

  return {
    editPatternCount,
    appliedFeatureCount: appliedFeatureIds.length,
    ...editEvidenceSummary,
  };
}

export function auditExpertReviewFixture({ fixture, runtime }) {
  if (!runtime) throw new Error('auditExpertReviewFixture requires a loaded audit runtime.');
  const normalizedFixture = normalizeFixturePatterns(fixture);
  const reviewedPackageVersion = normalizedFixture.reviewEvidence?.reviewedPackageVersion || null;
  const reviewedCurrentPackageVersion =
    isExternalFixture(normalizedFixture) &&
    Boolean(reviewedPackageVersion) &&
    !hasPlaceholderProofText(reviewedPackageVersion) &&
    matchesCurrentPackageVersion(reviewedPackageVersion);
  const fixtureValidationFindings = validateReviewFixture(normalizedFixture);
  const reviewedArtifactCoverage = buildReviewedArtifactCoverage(normalizedFixture);
  if (fixtureValidationFindings.some((finding) => FIXTURE_SOURCE_BLOCKERS.has(finding.check))) {
    const reviewerScorecard = auditReviewerScorecard({
      fixture: normalizedFixture,
      findings: fixtureValidationFindings,
    });
    const sourceFidelityReview = auditSourceFidelityReview({
      fixture: normalizedFixture,
      findings: fixtureValidationFindings,
    });
    const assumptionLedgerReview = auditAssumptionLedgerReview({
      fixture: normalizedFixture,
      blueprint: null,
      findings: fixtureValidationFindings,
    });
    const blueprintQualityReview = auditBlueprintQualityReview({
      fixture: normalizedFixture,
      blueprint: null,
      findings: fixtureValidationFindings,
    });
    const blockerCount = fixtureValidationFindings.filter((finding) => finding.severity === 'blocker').length;
    const warningCount = fixtureValidationFindings.filter((finding) => finding.severity === 'warning').length;
    return {
      fixtureId: normalizedFixture.id || 'unknown-fixture',
      label: normalizedFixture.label || normalizedFixture.id || 'Unknown fixture',
      sampleId: normalizedFixture.sampleId || normalizedFixture.project?.id || null,
      courseName: getFixtureCourseMap(normalizedFixture)?.courseName || '',
      proofModality: getFixtureProofModality(normalizedFixture),
      proofScope: getFixtureProofScope(normalizedFixture),
      proofScopeTags: getFixtureProofScopeTags(normalizedFixture),
      evidenceType: normalizedFixture.evidenceType || 'external',
      reviewerRole: normalizedFixture.reviewerRole || 'reviewer',
      focus: normalizedFixture.focus || '',
      compiledFeatures: [],
      checkedFeatureCount: Object.keys(normalizedFixture.featureExpectations || {}).length,
      reviewerExpectationCount: countReviewerExpectationSignals(normalizedFixture),
      editCheckCount: (normalizedFixture.editChecks || []).length,
      editHistoryPatternCount: getFixtureEditPatterns(normalizedFixture).length,
      editHistoryAppliedFeatureCount: 0,
      editHistoryConcreteEvidencePatternCount: 0,
      editHistoryWeakEvidencePatternCount: 0,
      blueprintFidelityFindingCount: 0,
      reviewerScorecard,
      sourceFidelityReview,
      assumptionLedgerReview,
      blueprintQualityReview,
      reviewedArtifactCoverage,
      externalProofEligible: false,
      externalEditProofEligible: false,
      reviewedPackageVersion,
      reviewedCurrentPackageVersion,
      reviewEvidence: normalizedFixture.reviewEvidence || null,
      preferenceProfile: null,
      findings: fixtureValidationFindings,
      summary: {
        status: blockerCount > 0 ? 'blocked' : warningCount > 0 ? 'warnings' : 'pass',
        blockerCount,
        warningCount,
      },
    };
  }
  const externalProofEligible =
    isExternalFixture(normalizedFixture) &&
    !fixtureValidationFindings.some((finding) => finding.severity === 'blocker');
  const { sample, blueprint, compiled, compiledFeatures, instructorPreferenceProfile } = buildCompiledFixture({
    fixture: normalizedFixture,
    runtime,
  });
  const findings = [...fixtureValidationFindings];
  const reviewerScorecard = auditReviewerScorecard({ fixture: normalizedFixture, findings });
  const sourceFidelityReview = auditSourceFidelityReview({ fixture: normalizedFixture, findings });
  const assumptionLedgerReview = auditAssumptionLedgerReview({ fixture: normalizedFixture, blueprint, findings });
  const blueprintQualityReview = auditBlueprintQualityReview({ fixture: normalizedFixture, blueprint, findings });
  const packageText = collectStrings(compiled).join(' ');
  const blueprintFidelityFindings = buildBlueprintFidelityFindings({ blueprint, compiledFeatures, compiled }).map(
    (finding) => makeFinding(finding.severity, normalizedFixture.id, finding.featureId, finding.check, finding.message),
  );
  findings.push(...blueprintFidelityFindings);

  addPatternFindings({
    findings,
    fixtureId: normalizedFixture.id,
    featureId: 'package',
    text: packageText,
    mustMatch: normalizedFixture.packageMustMatch || [],
    mustNotMatch: normalizedFixture.packageMustNotMatch || [],
  });

  for (const [featureId, patterns] of Object.entries(normalizedFixture.featureExpectations || {})) {
    const text = collectStrings(getFeatureData(featureId, compiled)).join(' ');
    addPatternFindings({
      findings,
      fixtureId: normalizedFixture.id,
      featureId,
      text,
      mustMatch: Array.isArray(patterns) ? patterns : [],
    });
  }

  auditBlueprintExpectations({ fixture: normalizedFixture, blueprint, findings });
  auditEditChecks({ fixture: normalizedFixture, blueprint, compiled, packageText, findings });
  const editHistorySummary = auditInstructorEditHistory({
    fixture: normalizedFixture,
    blueprint,
    compiled,
    compiledFeatures,
    instructorPreferenceProfile,
    findings,
  });

  const blockerCount = findings.filter((finding) => finding.severity === 'blocker').length;
  const warningCount = findings.filter((finding) => finding.severity === 'warning').length;
  return {
    fixtureId: normalizedFixture.id,
    label: normalizedFixture.label,
    sampleId: normalizedFixture.sampleId || sample.id,
    courseName: sample.project.courseMap.courseName,
    projectSource: sample.source,
    proofModality: getFixtureProofModality(normalizedFixture, blueprint),
    proofScope: getFixtureProofScope(normalizedFixture, blueprint, sample),
    proofScopeTags: getFixtureProofScopeTags(normalizedFixture),
    evidenceType: normalizedFixture.evidenceType || 'external',
    reviewerRole: normalizedFixture.reviewerRole || 'reviewer',
    focus: normalizedFixture.focus || '',
    compiledFeatures,
    checkedFeatureCount: Object.keys(normalizedFixture.featureExpectations || {}).length,
    reviewerExpectationCount: countReviewerExpectationSignals(normalizedFixture),
    editCheckCount: (normalizedFixture.editChecks || []).length,
    editHistoryPatternCount: editHistorySummary.editPatternCount,
    editHistoryAppliedFeatureCount: editHistorySummary.appliedFeatureCount,
    editHistoryConcreteEvidencePatternCount: editHistorySummary.concreteEvidencePatternCount,
    editHistoryWeakEvidencePatternCount: editHistorySummary.weakEvidencePatternCount,
    blueprintFidelityFindingCount: blueprintFidelityFindings.length,
    reviewerScorecard,
    sourceFidelityReview,
    assumptionLedgerReview,
    blueprintQualityReview,
    reviewedArtifactCoverage,
    externalProofEligible,
    externalEditProofEligible:
      externalProofEligible &&
      normalizedFixture.editHistoryEvidenceType === 'external' &&
      editHistorySummary.editPatternCount > 0 &&
      editHistorySummary.concreteEvidencePatternCount === editHistorySummary.editPatternCount &&
      editHistorySummary.weakEvidencePatternCount === 0 &&
      editHistorySummary.missingCoreFieldCount === 0,
    reviewedPackageVersion,
    reviewedCurrentPackageVersion,
    reviewEvidence: normalizedFixture.reviewEvidence || null,
    preferenceProfile: instructorPreferenceProfile
      ? {
          source: instructorPreferenceProfile.source,
          confidence: instructorPreferenceProfile.confidence,
          signalCount: instructorPreferenceProfile.signalCount,
          summary: summarizeInstructorPreferenceProfile(instructorPreferenceProfile),
        }
      : null,
    findings,
    summary: {
      status: blockerCount > 0 ? 'blocked' : warningCount > 0 ? 'warnings' : 'pass',
      blockerCount,
      warningCount,
    },
  };
}

function summarizeResults(results, auditFindings = [], externalProofBundles = buildExternalProofBundles(results)) {
  const resultBlockers = results.reduce((sum, result) => sum + result.summary.blockerCount, 0);
  const resultWarnings = results.reduce((sum, result) => sum + result.summary.warningCount, 0);
  const auditBlockers = auditFindings.filter((finding) => finding.severity === 'blocker').length;
  const auditWarnings = auditFindings.filter((finding) => finding.severity === 'warning').length;
  const blockers = resultBlockers + auditBlockers;
  const warnings = resultWarnings + auditWarnings;
  const externalFixtureCount = results.filter((result) => result.evidenceType === 'external').length;
  const externalCurrentPackageVersionFixtureCount = results.filter(
    (result) => result.evidenceType === 'external' && result.reviewedCurrentPackageVersion,
  ).length;
  const externalStalePackageVersionResults = results.filter(
    (result) =>
      result.evidenceType === 'external' &&
      result.reviewedPackageVersion &&
      !hasPlaceholderProofText(result.reviewedPackageVersion) &&
      !result.reviewedCurrentPackageVersion,
  );
  const externalProofEligibleCount = results.filter((result) => result.externalProofEligible).length;
  const externalReviewProofCount = results.filter(
    (result) => result.externalProofEligible && result.reviewerExpectationCount > 0,
  ).length;
  const reviewerScorecardFixtureCount = results.filter((result) => result.reviewerScorecard?.dimensionCount > 0).length;
  const externalReviewerScorecardCount = results.filter(
    (result) => result.externalProofEligible && result.reviewerScorecard?.dimensionCount > 0,
  ).length;
  const externalEvidenceAnchoredScorecardCount = results.filter(
    (result) =>
      result.externalProofEligible &&
      result.reviewerScorecard?.dimensionCount > 0 &&
      result.reviewerScorecard?.evidenceAnchoredDimensionCount === result.reviewerScorecard?.dimensionCount,
  ).length;
  const externalFullPackageReviewCount = results.filter(
    (result) =>
      result.externalProofEligible &&
      result.reviewerScorecard?.dimensionCount > 0 &&
      result.reviewedArtifactCoverage?.coversFullPackage,
  ).length;
  const externalSourceFidelityReviewCount = results.filter(
    (result) => result.externalProofEligible && result.sourceFidelityReview?.status === 'pass',
  ).length;
  const externalSourceFidelityArtifactReviewCount = results.filter(
    (result) =>
      result.externalProofEligible &&
      result.sourceFidelityReview?.status === 'pass' &&
      result.sourceFidelityReview?.artifactReviewCount >= REQUIRED_FULL_PACKAGE_ARTIFACTS.length &&
      (result.sourceFidelityReview?.missingArtifacts || []).length === 0,
  ).length;
  const externalBlueprintQualityReviewCount = results.filter(
    (result) => result.externalProofEligible && result.blueprintQualityReview?.status === 'pass',
  ).length;
  const externalBlueprintLessonReviewCount = results.filter(
    (result) =>
      result.externalProofEligible &&
      result.blueprintQualityReview?.status === 'pass' &&
      result.blueprintQualityReview?.lessonReviewCount >= result.blueprintQualityReview?.requiredLessonCount &&
      (result.blueprintQualityReview?.missingLessonNumbers || []).length === 0,
  ).length;
  const externalAssumptionLedgerReviewCount = results.filter(
    (result) => result.externalProofEligible && result.assumptionLedgerReview?.status === 'pass',
  ).length;
  const externalAssumptionLedgerDecisionReviewCount = results.filter(
    (result) =>
      result.externalProofEligible &&
      result.assumptionLedgerReview?.status === 'pass' &&
      Number(result.assumptionLedgerReview?.reviewedRowDecisionCount || 0) > 0,
  ).length;
  const reviewerScores = results
    .map((result) => result.reviewerScorecard?.minScore)
    .filter((score) => Number.isFinite(score));
  const externalReviewerScores = results
    .filter((result) => result.externalProofEligible && result.reviewerScorecard?.dimensionCount > 0)
    .map((result) => result.reviewerScorecard?.minScore)
    .filter((score) => Number.isFinite(score));
  const editHistoryFixtureCount = results.filter((result) => result.editHistoryPatternCount > 0).length;
  const externalEditHistoryFixtureCount = results.filter((result) => result.externalEditProofEligible).length;
  const externalEditHistoryEvidencePatternCount = results
    .filter((result) => result.externalEditProofEligible)
    .reduce((sum, result) => sum + (result.editHistoryConcreteEvidencePatternCount || 0), 0);
  const externalCompleteProofSamples = externalProofBundles.filter((entry) => entry.complete);
  const externalCompleteProofModalities = [
    ...new Set(externalCompleteProofSamples.map((entry) => entry.proofModality).filter(Boolean)),
  ].sort();
  const externalCompleteProofScopeTags = [
    ...new Set(externalCompleteProofSamples.flatMap((entry) => entry.proofScopeTags || [])),
  ].sort();
  const externalCompleteProofScopes = [
    ...new Set(
      externalCompleteProofSamples
        .map((entry) => Number(entry.proofScope))
        .filter((scope) => Number.isFinite(scope) && scope > 0),
    ),
  ].sort((a, b) => a - b);
  const missingExternalCompleteProofScopes = REQUIRED_EXTERNAL_COMPLETE_PROOF_SCOPES.filter(
    (scope) => !externalCompleteProofScopes.includes(scope),
  );
  const externalProjectCompleteProofSamples = externalCompleteProofSamples.filter(
    (entry) => entry.projectSource === 'external-project',
  );
  const externalProjectCompleteProofRequiredScopes = [
    ...new Set(
      externalProjectCompleteProofSamples
        .map((entry) => Number(entry.proofScope))
        .filter((scope) => REQUIRED_EXTERNAL_COMPLETE_PROOF_SCOPES.includes(scope)),
    ),
  ].sort((a, b) => a - b);
  const blueprintFidelityFindings = results.reduce(
    (sum, result) => sum + (result.blueprintFidelityFindingCount || 0),
    0,
  );
  const proofStatus =
    externalReviewProofCount > 0 && externalEditHistoryFixtureCount > 0
      ? 'external-review-and-edit-evidence-present'
      : externalReviewProofCount > 0
        ? 'external-review-evidence-present'
        : externalEditHistoryFixtureCount > 0
          ? 'external-edit-evidence-present'
          : 'internal-provisional-only';
  return {
    status: blockers > 0 ? 'blocked' : warnings > 0 ? 'warnings' : 'pass',
    reviewFixtureCount: results.length,
    currentPackageVersion: CURRENT_PACKAGE_VERSION,
    externalFixtureCount,
    externalCurrentPackageVersionFixtureCount,
    externalStalePackageVersionFixtureCount: externalStalePackageVersionResults.length,
    externalStalePackageVersionFixtureIds: externalStalePackageVersionResults.map((result) => result.fixtureId),
    externalProofEligibleCount,
    externalReviewProofCount,
    reviewerScorecardFixtureCount,
    externalReviewerScorecardCount,
    externalEvidenceAnchoredScorecardCount,
    externalFullPackageReviewCount,
    externalSourceFidelityReviewCount,
    externalSourceFidelityArtifactReviewCount,
    externalBlueprintQualityReviewCount,
    externalBlueprintLessonReviewCount,
    externalAssumptionLedgerReviewCount,
    externalAssumptionLedgerDecisionReviewCount,
    minReviewerScore: reviewerScores.length ? Math.min(...reviewerScores) : null,
    minExternalReviewerScore: externalReviewerScores.length ? Math.min(...externalReviewerScores) : null,
    editHistoryFixtureCount,
    externalEditHistoryFixtureCount,
    externalEditHistoryEvidencePatternCount,
    externalCompleteProofSampleCount: externalCompleteProofSamples.length,
    externalCompleteProofSampleIds: externalCompleteProofSamples.map((entry) => entry.sampleId),
    externalCompleteProofModalityCount: externalCompleteProofModalities.length,
    externalCompleteProofModalities,
    requiredExternalCompleteProofScopes: REQUIRED_EXTERNAL_COMPLETE_PROOF_SCOPES,
    externalCompleteProofScopeCount: externalCompleteProofScopes.length,
    externalCompleteProofScopes,
    missingExternalCompleteProofScopes,
    externalCompleteProofScopeTags,
    externalProjectCompleteProofSampleCount: externalProjectCompleteProofSamples.length,
    externalProjectCompleteProofSampleIds: externalProjectCompleteProofSamples.map((entry) => entry.sampleId),
    externalProjectCompleteProofRequiredScopeCount: externalProjectCompleteProofRequiredScopes.length,
    externalProjectCompleteProofRequiredScopes,
    blueprintFidelityFindings,
    internalProvisionalFixtureCount: results.filter((result) => result.evidenceType !== 'external').length,
    proofStatus,
    auditBlockers,
    auditWarnings,
    blockers,
    warnings,
  };
}

function hasPassingExternalProofResult(result) {
  return result.externalProofEligible && result.summary?.status === 'pass';
}

function hasEvidenceAnchoredScorecard(result) {
  return (
    hasPassingExternalProofResult(result) &&
    result.reviewerScorecard?.dimensionCount > 0 &&
    result.reviewerScorecard?.evidenceAnchoredDimensionCount === result.reviewerScorecard?.dimensionCount
  );
}

function hasFullPackageScorecard(result) {
  return hasEvidenceAnchoredScorecard(result) && result.reviewedArtifactCoverage?.coversFullPackage;
}

function hasAQualityScorecard(result) {
  return hasFullPackageScorecard(result) && Number(result.reviewerScorecard?.minScore) >= REVIEW_SCORECARD_FLOOR;
}

function hasCompleteSourceFidelityReview(result) {
  return (
    hasPassingExternalProofResult(result) &&
    result.sourceFidelityReview?.status === 'pass' &&
    result.sourceFidelityReview?.artifactReviewCount >= REQUIRED_FULL_PACKAGE_ARTIFACTS.length &&
    (result.sourceFidelityReview?.missingArtifacts || []).length === 0
  );
}

function hasCompleteBlueprintQualityReview(result) {
  return (
    hasPassingExternalProofResult(result) &&
    result.blueprintQualityReview?.status === 'pass' &&
    result.blueprintQualityReview?.lessonReviewCount >= result.blueprintQualityReview?.requiredLessonCount &&
    (result.blueprintQualityReview?.missingLessonNumbers || []).length === 0
  );
}

function hasDecisionBearingAssumptionReview(result) {
  return (
    hasPassingExternalProofResult(result) &&
    result.assumptionLedgerReview?.status === 'pass' &&
    Number(result.assumptionLedgerReview?.reviewedRowDecisionCount || 0) > 0
  );
}

function hasConcreteExternalEditHistory(result) {
  return result.externalEditProofEligible && result.summary?.status === 'pass';
}

function buildExternalProofBundles(results) {
  const samples = new Map();
  for (const result of results) {
    if (result.evidenceType !== 'external') continue;
    const sampleId = result.sampleId || result.courseName || result.fixtureId;
    if (!sampleId) continue;
    const entry = samples.get(sampleId) || {
      sampleId,
      scorecard: false,
      sourceFidelity: false,
      blueprintQuality: false,
      assumptionLedger: false,
      editHistory: false,
      proofModality: result.proofModality || 'unknown',
      proofScope: result.proofScope || null,
      proofScopeTags: [],
      projectSource: result.projectSource || 'unknown',
      fixtureIds: [],
    };
    entry.scorecard = entry.scorecard || hasAQualityScorecard(result);
    entry.sourceFidelity = entry.sourceFidelity || hasCompleteSourceFidelityReview(result);
    entry.blueprintQuality = entry.blueprintQuality || hasCompleteBlueprintQualityReview(result);
    entry.assumptionLedger = entry.assumptionLedger || hasDecisionBearingAssumptionReview(result);
    entry.editHistory = entry.editHistory || hasConcreteExternalEditHistory(result);
    if (result.proofModality && entry.proofModality === 'unknown') entry.proofModality = result.proofModality;
    if (!entry.proofScope && result.proofScope) entry.proofScope = result.proofScope;
    if (result.projectSource === 'external-project') entry.projectSource = 'external-project';
    entry.fixtureIds = [...new Set([...(entry.fixtureIds || []), result.fixtureId].filter(Boolean))].sort();
    entry.proofScopeTags = [
      ...new Set(
        [
          ...(entry.proofScopeTags || []),
          ...(result.proofScopeTags || []),
          result.proofModality,
          result.proofScope ? `scope:${result.proofScope}` : null,
        ].filter(Boolean),
      ),
    ].sort();
    samples.set(sampleId, entry);
  }
  return [...samples.values()]
    .map((entry) => {
      const missingEvidence = [
        !entry.scorecard ? 'scorecard' : null,
        !entry.sourceFidelity ? 'source-fidelity' : null,
        !entry.blueprintQuality ? 'blueprint-quality' : null,
        !entry.assumptionLedger ? 'assumption-ledger' : null,
        !entry.editHistory ? 'edit-history' : null,
      ].filter(Boolean);
      return {
        ...entry,
        complete: missingEvidence.length === 0,
        missingEvidence,
        fixtureCount: entry.fixtureIds.length,
      };
    })
    .sort((a, b) => a.sampleId.localeCompare(b.sampleId));
}

function hasRequiredExternalProofIngredients(summary) {
  return (
    summary.proofStatus === REQUIRED_EXTERNAL_PROOF_STATUS &&
    summary.externalEvidenceAnchoredScorecardCount >= 1 &&
    summary.externalFullPackageReviewCount >= 1 &&
    Number.isFinite(summary.minExternalReviewerScore) &&
    summary.minExternalReviewerScore >= REVIEW_SCORECARD_FLOOR &&
    summary.externalSourceFidelityReviewCount >= 1 &&
    summary.externalSourceFidelityArtifactReviewCount >= 1 &&
    summary.externalBlueprintQualityReviewCount >= 1 &&
    summary.externalBlueprintLessonReviewCount >= 1 &&
    summary.externalAssumptionLedgerReviewCount >= 1 &&
    summary.externalAssumptionLedgerDecisionReviewCount >= 1
  );
}

function buildAuditRequirementFindings(summary, options = {}) {
  if (!options.requireExternalProof) return [];

  const findings = [];
  if (summary.proofStatus !== REQUIRED_EXTERNAL_PROOF_STATUS) {
    findings.push(
      makeFinding(
        'blocker',
        'audit',
        'externalProof',
        'requiredExternalProof',
        `A-quality proof requires ${REQUIRED_EXTERNAL_PROOF_STATUS}; current proof status is ${summary.proofStatus}.`,
      ),
    );
  }
  if (summary.externalReviewerScorecardCount < 1) {
    findings.push(
      makeFinding(
        'blocker',
        'audit',
        'externalProof',
        'requiredExternalScorecard',
        'A-quality proof requires at least one proof-eligible external reviewer scorecard covering all required classroom-quality dimensions.',
      ),
    );
  }
  if (summary.externalReviewerScorecardCount >= 1 && summary.externalEvidenceAnchoredScorecardCount < 1) {
    findings.push(
      makeFinding(
        'blocker',
        'audit',
        'externalProof',
        'requiredExternalScorecardEvidence',
        'A-quality proof requires at least one proof-eligible external reviewer scorecard with artifact evidence and concrete examples for every scored dimension.',
      ),
    );
  }
  if (summary.externalFullPackageReviewCount < 1) {
    findings.push(
      makeFinding(
        'blocker',
        'audit',
        'externalProof',
        'requiredFullPackageExternalReview',
        'A-quality proof requires at least one proof-eligible external reviewer scorecard whose reviewed artifacts cover the full core package.',
      ),
    );
  }
  if (!Number.isFinite(summary.minExternalReviewerScore) || summary.minExternalReviewerScore < REVIEW_SCORECARD_FLOOR) {
    findings.push(
      makeFinding(
        'blocker',
        'audit',
        'externalProof',
        'requiredReviewerScoreFloor',
        `A-quality proof requires an external reviewer scorecard minimum of at least ${REVIEW_SCORECARD_FLOOR}/10.`,
      ),
    );
  }
  if (summary.externalSourceFidelityReviewCount < 1 || summary.externalSourceFidelityArtifactReviewCount < 1) {
    findings.push(
      makeFinding(
        'blocker',
        'audit',
        'externalProof',
        'requiredSourceFidelityReview',
        'A-quality proof requires at least one proof-eligible external source-fidelity review with artifact-level comparison rows for the full core package.',
      ),
    );
  }
  if (summary.externalBlueprintQualityReviewCount < 1 || summary.externalBlueprintLessonReviewCount < 1) {
    findings.push(
      makeFinding(
        'blocker',
        'audit',
        'externalProof',
        'requiredBlueprintQualityReview',
        'A-quality proof requires at least one proof-eligible external blueprint-quality review with lesson-level source-to-blueprint comparison rows.',
      ),
    );
  }
  if (summary.externalAssumptionLedgerReviewCount < 1 || summary.externalAssumptionLedgerDecisionReviewCount < 1) {
    findings.push(
      makeFinding(
        'blocker',
        'audit',
        'externalProof',
        'requiredAssumptionLedgerReview',
        'A-quality proof requires at least one proof-eligible external assumption-ledger review with reviewer decisions for review-required assumptions.',
      ),
    );
  }
  if (hasRequiredExternalProofIngredients(summary) && summary.externalCompleteProofSampleCount < 1) {
    findings.push(
      makeFinding(
        'blocker',
        'audit',
        'externalProof',
        'requiredCompleteExternalProofSample',
        'A-quality proof requires at least one course sample where the external scorecard, source-fidelity review, assumption-ledger decisions, and concrete instructor edit history all refer to that same sample.',
      ),
    );
  }
  if (
    hasRequiredExternalProofIngredients(summary) &&
    summary.externalCompleteProofSampleCount >= 1 &&
    (summary.externalCompleteProofSampleCount < REQUIRED_EXTERNAL_COMPLETE_PROOF_SAMPLES ||
      summary.externalCompleteProofModalityCount < REQUIRED_EXTERNAL_COMPLETE_PROOF_MODALITIES)
  ) {
    findings.push(
      makeFinding(
        'blocker',
        'audit',
        'externalProof',
        'requiredDiverseExternalProofSamples',
        `A-quality proof requires at least ${REQUIRED_EXTERNAL_COMPLETE_PROOF_SAMPLES} complete external proof samples across at least ${REQUIRED_EXTERNAL_COMPLETE_PROOF_MODALITIES} teaching modalities; current proof covers ${summary.externalCompleteProofSampleCount} sample(s) across ${summary.externalCompleteProofModalityCount} modality group(s).`,
      ),
    );
  }
  if (
    hasRequiredExternalProofIngredients(summary) &&
    summary.externalCompleteProofSampleCount >= REQUIRED_EXTERNAL_COMPLETE_PROOF_SAMPLES &&
    summary.externalCompleteProofModalityCount >= REQUIRED_EXTERNAL_COMPLETE_PROOF_MODALITIES &&
    summary.externalProjectCompleteProofSampleCount < REQUIRED_EXTERNAL_PROJECT_COMPLETE_PROOF_SAMPLES
  ) {
    findings.push(
      makeFinding(
        'blocker',
        'audit',
        'externalProof',
        'requiredExternalProjectProofSample',
        `A-quality proof requires at least ${REQUIRED_EXTERNAL_PROJECT_COMPLETE_PROOF_SAMPLES} complete proof sample compiled from an externally supplied project.courseMap; current complete external-project proof samples: ${summary.externalProjectCompleteProofSampleCount}.`,
      ),
    );
  }
  if (
    hasRequiredExternalProofIngredients(summary) &&
    summary.externalCompleteProofSampleCount >= REQUIRED_EXTERNAL_COMPLETE_PROOF_SAMPLES &&
    summary.externalCompleteProofModalityCount >= REQUIRED_EXTERNAL_COMPLETE_PROOF_MODALITIES &&
    summary.externalProjectCompleteProofSampleCount >= REQUIRED_EXTERNAL_PROJECT_COMPLETE_PROOF_SAMPLES &&
    summary.externalProjectCompleteProofRequiredScopeCount < REQUIRED_EXTERNAL_PROJECT_COMPLETE_PROOF_SAMPLES
  ) {
    findings.push(
      makeFinding(
        'blocker',
        'audit',
        'externalProof',
        'requiredExternalProjectProofScope',
        `A-quality proof requires at least ${REQUIRED_EXTERNAL_PROJECT_COMPLETE_PROOF_SAMPLES} complete external-project proof sample at one of the required course scopes (${REQUIRED_EXTERNAL_COMPLETE_PROOF_SCOPES.join(
          ', ',
        )} lessons); current required-scope external-project proof scopes: ${
          summary.externalProjectCompleteProofRequiredScopes?.join(', ') || 'none'
        }.`,
      ),
    );
  }
  if (
    hasRequiredExternalProofIngredients(summary) &&
    summary.externalCompleteProofSampleCount >= REQUIRED_EXTERNAL_COMPLETE_PROOF_SAMPLES &&
    summary.externalCompleteProofModalityCount >= REQUIRED_EXTERNAL_COMPLETE_PROOF_MODALITIES &&
    summary.externalProjectCompleteProofSampleCount >= REQUIRED_EXTERNAL_PROJECT_COMPLETE_PROOF_SAMPLES &&
    (summary.missingExternalCompleteProofScopes || []).length > 0
  ) {
    findings.push(
      makeFinding(
        'blocker',
        'audit',
        'externalProof',
        'requiredExternalProofScopeCoverage',
        `A-quality proof requires complete external proof across course scopes ${REQUIRED_EXTERNAL_COMPLETE_PROOF_SCOPES.join(
          ', ',
        )}; missing scope(s): ${summary.missingExternalCompleteProofScopes.join(', ')}.`,
      ),
    );
  }
  return findings;
}

function buildExternalProofReadinessChecklist(summary) {
  const minScore = Number.isFinite(summary.minExternalReviewerScore)
    ? `${summary.minExternalReviewerScore}/10`
    : 'not supplied';
  const items = [
    {
      id: 'external-review-and-edit-evidence',
      label: 'External review and concrete edit-history evidence are both present',
      status: summary.proofStatus === REQUIRED_EXTERNAL_PROOF_STATUS ? 'pass' : 'blocked',
      evidence: `proofStatus=${summary.proofStatus}`,
      nextAction:
        'Provide proof-eligible external reviewer evidence and external instructor edit-history patterns with concrete before/after text or evidence notes.',
    },
    {
      id: 'current-package-version-proof',
      label: `External proof was reviewed against the current package version (${CURRENT_PACKAGE_VERSION})`,
      status:
        summary.externalFixtureCount > 0 &&
        summary.externalCurrentPackageVersionFixtureCount === summary.externalFixtureCount &&
        summary.externalStalePackageVersionFixtureCount === 0
          ? 'pass'
          : 'blocked',
      evidence: `${summary.externalCurrentPackageVersionFixtureCount || 0}/${summary.externalFixtureCount || 0} external fixture(s) match ${CURRENT_PACKAGE_VERSION}; stale fixture(s): ${
        summary.externalStalePackageVersionFixtureIds?.length
          ? summary.externalStalePackageVersionFixtureIds.join(', ')
          : 'none'
      }`,
      nextAction:
        'Regenerate the proof packet for the current package version, have reviewers inspect that package, and set reviewEvidence.reviewedPackageVersion to the current package version.',
    },
    {
      id: 'complete-proof-sample',
      label: 'External proof includes multiple complete samples across distinct teaching modalities',
      status:
        summary.externalCompleteProofSampleCount >= REQUIRED_EXTERNAL_COMPLETE_PROOF_SAMPLES &&
        summary.externalCompleteProofModalityCount >= REQUIRED_EXTERNAL_COMPLETE_PROOF_MODALITIES
          ? 'pass'
          : 'blocked',
      evidence: `${summary.externalCompleteProofSampleCount} complete external proof sample(s)${
        summary.externalCompleteProofSampleIds?.length ? `: ${summary.externalCompleteProofSampleIds.join(', ')}` : ''
      }; ${summary.externalCompleteProofModalityCount || 0} modality group(s)${
        summary.externalCompleteProofModalities?.length ? `: ${summary.externalCompleteProofModalities.join(', ')}` : ''
      }`,
      nextAction: `Complete combined external proof fixture bundles for at least ${REQUIRED_EXTERNAL_COMPLETE_PROOF_SAMPLES} reviewed course samples across at least ${REQUIRED_EXTERNAL_COMPLETE_PROOF_MODALITIES} distinct teaching modalities. Each bundle must include the full-package scorecard, source-fidelity review, blueprint-quality review, assumption-ledger decisions, and concrete instructor edit-history evidence for that same sample.`,
    },
    {
      id: 'external-project-proof-sample',
      label: `External proof includes at least one complete real course-map sample at a required proof scope (${REQUIRED_EXTERNAL_COMPLETE_PROOF_SCOPES.join(
        ', ',
      )} lessons)`,
      status:
        summary.externalProjectCompleteProofSampleCount >= REQUIRED_EXTERNAL_PROJECT_COMPLETE_PROOF_SAMPLES &&
        summary.externalProjectCompleteProofRequiredScopeCount >= REQUIRED_EXTERNAL_PROJECT_COMPLETE_PROOF_SAMPLES
          ? 'pass'
          : 'blocked',
      evidence: `${summary.externalProjectCompleteProofSampleCount || 0} complete external-project proof sample(s)${
        summary.externalProjectCompleteProofSampleIds?.length
          ? `: ${summary.externalProjectCompleteProofSampleIds.join(', ')}`
          : ''
      }; required-scope external-project proof scopes: ${
        summary.externalProjectCompleteProofRequiredScopes?.length
          ? summary.externalProjectCompleteProofRequiredScopes.join(', ')
          : 'none'
      }`,
      nextAction: `Add a complete external proof bundle whose fixture includes project.courseMap from a real reviewed course at a ${REQUIRED_EXTERNAL_COMPLETE_PROOF_SCOPES.join(
        ', ',
      )}-lesson proof scope, not only a curated built-in sampleId or off-scope real course.`,
    },
    {
      id: 'external-proof-scope-coverage',
      label: `External proof covers short, standard, and full-semester course lengths (${REQUIRED_EXTERNAL_COMPLETE_PROOF_SCOPES.join(
        ', ',
      )} lessons)`,
      status: (summary.missingExternalCompleteProofScopes || []).length === 0 ? 'pass' : 'blocked',
      evidence: `${summary.externalCompleteProofScopeCount || 0} complete scope group(s)${
        summary.externalCompleteProofScopes?.length ? `: ${summary.externalCompleteProofScopes.join(', ')}` : ''
      }; missing ${
        summary.missingExternalCompleteProofScopes?.length
          ? summary.missingExternalCompleteProofScopes.join(', ')
          : 'none'
      }`,
      nextAction: `Complete proof bundles for reviewed course samples at ${REQUIRED_EXTERNAL_COMPLETE_PROOF_SCOPES.join(
        ', ',
      )} lessons so strict proof covers short modules, standard courses, and full-semester courses.`,
    },
    {
      id: 'external-scorecard',
      label: 'At least one proof-eligible external reviewer scorecard is evidence-anchored',
      status:
        summary.externalReviewerScorecardCount >= 1 && summary.externalEvidenceAnchoredScorecardCount >= 1
          ? 'pass'
          : 'blocked',
      evidence: `${summary.externalReviewerScorecardCount} external reviewer scorecard(s), ${summary.externalEvidenceAnchoredScorecardCount} evidence-anchored scorecard(s)`,
      nextAction:
        'Add a reviewScorecard from an external reviewer with all required classroom-quality dimensions, concrete notes, reviewed artifacts, and evidence examples.',
    },
    {
      id: 'full-package-review',
      label: 'At least one external scorecard reviewed the full core package',
      status: summary.externalFullPackageReviewCount >= 1 ? 'pass' : 'blocked',
      evidence: `${summary.externalFullPackageReviewCount} full-package external scorecard(s)`,
      nextAction:
        'Set reviewEvidence.reviewedArtifacts to "full-package" or list every core artifact reviewed by the scorecard reviewer.',
    },
    {
      id: 'reviewer-score-floor',
      label: `External reviewer score floor is at least ${REVIEW_SCORECARD_FLOOR}/10`,
      status:
        Number.isFinite(summary.minExternalReviewerScore) && summary.minExternalReviewerScore >= REVIEW_SCORECARD_FLOOR
          ? 'pass'
          : 'blocked',
      evidence: `minimum external reviewer score=${minScore}`,
      nextAction:
        'Collect a complete external scorecard where every normalized dimension score meets the A-quality floor.',
    },
    {
      id: 'source-fidelity-review',
      label: 'At least one external reviewer confirmed artifact-level source-to-package fidelity',
      status:
        summary.externalSourceFidelityReviewCount >= 1 && summary.externalSourceFidelityArtifactReviewCount >= 1
          ? 'pass'
          : 'blocked',
      evidence: `${summary.externalSourceFidelityReviewCount} source-fidelity review(s), ${summary.externalSourceFidelityArtifactReviewCount} artifact-level review(s)`,
      nextAction:
        'Add sourceFidelityReview.artifactReviews evidence comparing the source course-map to each compiled core artifact with concrete reviewer notes.',
    },
    {
      id: 'blueprint-quality-review',
      label: 'At least one external reviewer confirmed source-to-blueprint compression quality',
      status:
        summary.externalBlueprintQualityReviewCount >= 1 && summary.externalBlueprintLessonReviewCount >= 1
          ? 'pass'
          : 'blocked',
      evidence: `${summary.externalBlueprintQualityReviewCount} blueprint-quality review(s), ${summary.externalBlueprintLessonReviewCount} lesson-level blueprint review(s)`,
      nextAction:
        'Add blueprintQualityReview.lessonReviews evidence comparing each source lesson to the compact blueprint row before scoring the compiled package.',
    },
    {
      id: 'assumption-ledger-review',
      label: 'At least one external reviewer confirmed the blueprint assumption ledger and decisions',
      status:
        summary.externalAssumptionLedgerReviewCount >= 1 && summary.externalAssumptionLedgerDecisionReviewCount >= 1
          ? 'pass'
          : 'blocked',
      evidence: `${summary.externalAssumptionLedgerReviewCount} assumption-ledger review(s), ${summary.externalAssumptionLedgerDecisionReviewCount} decision-bearing review(s)`,
      nextAction:
        'Add assumptionLedgerReview evidence confirming the reviewer inspected inferred assumptions, ledger categories, and recorded decisions for review-required rows.',
    },
    {
      id: 'normal-expert-audit-clear',
      label: 'Fixture validation, reviewer expectations, compiler fidelity, and edit-history checks are clear',
      status: summary.blockers === 0 ? 'pass' : 'blocked',
      evidence: `${summary.blockers} blocker(s), ${summary.warnings} warning(s) before strict proof-only blockers`,
      nextAction:
        'Resolve fixture placeholder, reviewer expectation, scorecard, blueprint-fidelity, or preference-application findings.',
    },
  ];
  const passCount = items.filter((item) => item.status === 'pass').length;
  return {
    status: passCount === items.length ? 'pass' : 'blocked',
    passCount,
    itemCount: items.length,
    items,
  };
}

function buildReviewFixtureBundleFindings(raw, fixturePath) {
  if (Array.isArray(raw) || !raw || typeof raw !== 'object') return [];
  const findings = [];
  const bundleId = raw.id || raw.bundleId || path.basename(fixturePath || 'fixture-bundle');
  if (raw.templateOnly === true) {
    findings.push(
      makeFinding(
        'blocker',
        bundleId,
        'fixtureBundle',
        'bundleTemplateOnly',
        `Review fixture bundle ${path.basename(
          fixturePath || bundleId,
        )} still has templateOnly: true. Fill reviewer evidence, replace any external project placeholders, and remove the top-level templateOnly flag before using this bundle as A-quality proof.`,
      ),
    );
  }
  const metadata = { ...raw };
  delete metadata.fixtures;
  const placeholderPaths = collectUnreplacedTemplatePaths(metadata, 'bundle');
  if (placeholderPaths.length > 0) {
    findings.push(
      makeFinding(
        'blocker',
        bundleId,
        'fixtureBundle',
        'bundleMetadataPlaceholder',
        `Review fixture bundle metadata still contains template text: ${placeholderPaths.slice(0, 8).join(', ')}.`,
      ),
    );
  }
  return findings;
}

export async function loadReviewFixtureBundle(fixturePath) {
  if (!fixturePath) return { fixtures: DEFAULT_REVIEW_FIXTURES, bundleFindings: [] };
  const raw = JSON.parse(await fs.readFile(fixturePath, 'utf8'));
  const fixtures = Array.isArray(raw) ? raw : Array.isArray(raw.fixtures) ? raw.fixtures : null;
  if (!fixtures) throw new Error(`Review fixture file must contain an array or { "fixtures": [...] }: ${fixturePath}`);
  return {
    fixtures,
    bundleFindings: buildReviewFixtureBundleFindings(raw, fixturePath),
  };
}

export async function loadReviewFixtures(fixturePath) {
  if (!fixturePath) return DEFAULT_REVIEW_FIXTURES;
  return (await loadReviewFixtureBundle(fixturePath)).fixtures;
}

export async function buildExpertReviewQualityAudit(options = {}) {
  const runtime = options.runtime || (await loadHybridPipelineAuditRuntime());
  const fixtureBundle =
    Array.isArray(options.fixtures) && options.fixtures.length > 0
      ? { fixtures: options.fixtures, bundleFindings: [] }
      : await loadReviewFixtureBundle(options.fixturePath);
  const fixtures = fixtureBundle.fixtures;
  const results = fixtures.map((fixture) => auditExpertReviewFixture({ fixture, runtime }));
  const externalProofBundles = buildExternalProofBundles(results);
  const baseSummary = summarizeResults(results, [], externalProofBundles);
  const auditFindings = [
    ...(fixtureBundle.bundleFindings || []),
    ...buildAuditRequirementFindings(baseSummary, options),
  ];
  const proofReadinessChecklist = buildExternalProofReadinessChecklist(baseSummary);
  return {
    meta: {
      generatedAt: new Date().toISOString(),
      requireExternalProof: Boolean(options.requireExternalProof),
      preflight: Boolean(options.preflight),
      note: options.requireExternalProof
        ? 'External proof is required for this run. Provide proof-eligible external reviewer scorecards and instructor edit-history fixtures with --fixtures.'
        : 'Default fixtures are internal provisional reviewer expectations. Add --fixtures with external expert-reviewed samples or instructor edit patterns to turn this into external quality proof.',
    },
    summary: summarizeResults(results, auditFindings, externalProofBundles),
    proofReadinessChecklist,
    externalProofBundles,
    auditFindings,
    results,
  };
}

function markdownTable(rows) {
  return rows.join('\n');
}

export function renderExpertReviewQualityAuditMarkdown(payload) {
  const caseRows = payload.results.map(
    (result) =>
      `| ${result.fixtureId} | ${result.evidenceType} | ${result.externalProofEligible ? 'yes' : 'no'} | ${result.reviewedPackageVersion || ''} | ${
        result.evidenceType === 'external' ? (result.reviewedCurrentPackageVersion ? 'yes' : 'no') : ''
      } | ${result.sampleId} | ${result.proofModality || 'unknown'} | ${result.summary.status} | ${result.checkedFeatureCount} | ${result.editCheckCount} | ${result.editHistoryPatternCount} | ${result.editHistoryAppliedFeatureCount} | ${result.editHistoryConcreteEvidencePatternCount ?? 0}/${result.editHistoryPatternCount ?? 0} | ${result.reviewerScorecard?.minScore ?? ''} | ${result.reviewedArtifactCoverage?.coveredCount || 0}/${result.reviewedArtifactCoverage?.requiredCount || REQUIRED_FULL_PACKAGE_ARTIFACTS.length} | ${result.sourceFidelityReview?.status || 'not-provided'} | ${result.sourceFidelityReview?.artifactReviewCount ?? 0}/${REQUIRED_FULL_PACKAGE_ARTIFACTS.length} | ${result.blueprintQualityReview?.status || 'not-provided'} | ${result.blueprintQualityReview?.lessonReviewCount ?? 0}/${result.blueprintQualityReview?.requiredLessonCount ?? 0} | ${result.assumptionLedgerReview?.status || 'not-provided'} | ${result.assumptionLedgerReview?.reviewedRowDecisionCount ?? 0}/${result.assumptionLedgerReview?.reviewRequiredRowCount ?? 0} | ${result.blueprintFidelityFindingCount || 0} | ${result.summary.blockerCount} | ${result.summary.warningCount} |`,
  );
  const scorecardRows = payload.results.flatMap((result) =>
    (result.reviewerScorecard?.dimensions || []).map(
      (dimension) =>
        `| ${result.fixtureId} | ${dimension.label} | ${dimension.score ?? ''} | ${dimension.maxScore ?? ''} | ${dimension.normalizedScore ?? ''} | ${(dimension.evidenceArtifactIds || []).join(', ')} | ${dimension.concreteEvidenceExampleCount ?? 0} | ${dimension.notes || ''} |`,
    ),
  );
  const findings = [...(payload.auditFindings || []), ...payload.results.flatMap((result) => result.findings)].map(
    (finding) => `- ${finding.fixtureId}/${finding.featureId}/${finding.check}: ${finding.message}`,
  );
  const readinessRows = (payload.proofReadinessChecklist?.items || []).map(
    (item) =>
      `| ${item.status} | ${item.label} | ${item.evidence} | ${item.status === 'pass' ? 'Ready' : item.nextAction} |`,
  );
  const proofBundleRows = (payload.externalProofBundles || []).map(
    (entry) =>
      `| ${entry.sampleId} | ${entry.complete ? 'yes' : 'no'} | ${
        entry.missingEvidence?.length ? entry.missingEvidence.join(', ') : 'none'
      } | ${entry.proofModality || 'unknown'} | ${entry.proofScope || ''} | ${entry.projectSource || 'unknown'} | ${entry.scorecard ? 'yes' : 'no'} | ${
        entry.sourceFidelity ? 'yes' : 'no'
      } | ${entry.blueprintQuality ? 'yes' : 'no'} | ${entry.assumptionLedger ? 'yes' : 'no'} | ${
        entry.editHistory ? 'yes' : 'no'
      } | ${
        entry.proofScopeTags?.length ? entry.proofScopeTags.join(', ') : 'none'
      } | ${entry.fixtureIds?.length ? entry.fixtureIds.join(', ') : 'none'} |`,
  );
  return `${[
    '# CourseMapper Expert Review Quality Audit',
    '',
    `Generated: ${payload.meta.generatedAt}`,
    '',
    '## Summary',
    '',
    `Status: ${payload.summary.status}`,
    `Review fixtures: ${payload.summary.reviewFixtureCount}`,
    `Current package version: ${payload.summary.currentPackageVersion}`,
    `External review fixtures: ${payload.summary.externalFixtureCount}`,
    `External current-version fixtures: ${payload.summary.externalCurrentPackageVersionFixtureCount}/${payload.summary.externalFixtureCount}`,
    `External stale package-version fixtures: ${payload.summary.externalStalePackageVersionFixtureCount}${
      payload.summary.externalStalePackageVersionFixtureIds?.length
        ? ` (${payload.summary.externalStalePackageVersionFixtureIds.join(', ')})`
        : ''
    }`,
    `External proof-eligible fixtures: ${payload.summary.externalProofEligibleCount}`,
    `External reviewer-proof fixtures: ${payload.summary.externalReviewProofCount}`,
    `Reviewer scorecard fixtures: ${payload.summary.reviewerScorecardFixtureCount}`,
    `External reviewer scorecards: ${payload.summary.externalReviewerScorecardCount}`,
    `External evidence-anchored scorecards: ${payload.summary.externalEvidenceAnchoredScorecardCount}`,
    `External full-package review scorecards: ${payload.summary.externalFullPackageReviewCount}`,
    `External source-fidelity reviews: ${payload.summary.externalSourceFidelityReviewCount}`,
    `External source-fidelity artifact reviews: ${payload.summary.externalSourceFidelityArtifactReviewCount}`,
    `External blueprint-quality reviews: ${payload.summary.externalBlueprintQualityReviewCount}`,
    `External blueprint-quality lesson reviews: ${payload.summary.externalBlueprintLessonReviewCount}`,
    `External assumption-ledger reviews: ${payload.summary.externalAssumptionLedgerReviewCount}`,
    `External assumption-ledger decision reviews: ${payload.summary.externalAssumptionLedgerDecisionReviewCount}`,
    `Minimum reviewer score: ${payload.summary.minReviewerScore}`,
    `Minimum external reviewer score: ${payload.summary.minExternalReviewerScore}`,
    `Edit-history fixtures: ${payload.summary.editHistoryFixtureCount}`,
    `External edit-history fixtures: ${payload.summary.externalEditHistoryFixtureCount}`,
    `External edit-history evidence patterns: ${payload.summary.externalEditHistoryEvidencePatternCount}`,
    `External complete proof samples: ${payload.summary.externalCompleteProofSampleCount}${
      payload.summary.externalCompleteProofSampleIds?.length
        ? ` (${payload.summary.externalCompleteProofSampleIds.join(', ')})`
        : ''
    }`,
    `External complete proof modalities: ${payload.summary.externalCompleteProofModalityCount}${
      payload.summary.externalCompleteProofModalities?.length
        ? ` (${payload.summary.externalCompleteProofModalities.join(', ')})`
        : ''
    }`,
    `External complete proof scopes: ${payload.summary.externalCompleteProofScopeCount}${
      payload.summary.externalCompleteProofScopes?.length
        ? ` (${payload.summary.externalCompleteProofScopes.join(', ')})`
        : ''
    }`,
    `Missing external proof scopes: ${
      payload.summary.missingExternalCompleteProofScopes?.length
        ? payload.summary.missingExternalCompleteProofScopes.join(', ')
        : 'none'
    }`,
    `External complete proof scope tags: ${
      payload.summary.externalCompleteProofScopeTags?.length
        ? payload.summary.externalCompleteProofScopeTags.join(', ')
        : 'none'
    }`,
    `External-project complete proof samples: ${payload.summary.externalProjectCompleteProofSampleCount}${
      payload.summary.externalProjectCompleteProofSampleIds?.length
        ? ` (${payload.summary.externalProjectCompleteProofSampleIds.join(', ')})`
        : ''
    }`,
    `External-project required-scope proof: ${payload.summary.externalProjectCompleteProofRequiredScopeCount || 0}${
      payload.summary.externalProjectCompleteProofRequiredScopes?.length
        ? ` (${payload.summary.externalProjectCompleteProofRequiredScopes.join(', ')})`
        : ''
    }`,
    `Blueprint fidelity findings: ${payload.summary.blueprintFidelityFindings}`,
    `Internal provisional fixtures: ${payload.summary.internalProvisionalFixtureCount}`,
    `Proof status: ${payload.summary.proofStatus}`,
    `External proof readiness: ${payload.proofReadinessChecklist?.status || 'unknown'} (${payload.proofReadinessChecklist?.passCount ?? 0}/${payload.proofReadinessChecklist?.itemCount ?? 0})`,
    `External proof required: ${payload.meta.requireExternalProof ? 'yes' : 'no'}`,
    `Audit requirement blockers: ${payload.summary.auditBlockers}`,
    `Blockers: ${payload.summary.blockers}`,
    `Warnings: ${payload.summary.warnings}`,
    '',
    `Note: ${payload.meta.note}`,
    '',
    '## Review Fixture Matrix',
    '',
    markdownTable([
      '| Review Fixture | Evidence Type | Proof Eligible | Reviewed Version | Current Version | Sample/Project | Proof Modality | Status | Feature Checks | Edit Checks | Edit Patterns | Applied Features | Edit Evidence | Reviewer Min Score | Reviewed Core | Source Fidelity | Source Artifacts | Blueprint Quality | Blueprint Lessons | Assumption Ledger | Assumption Decisions | Fidelity Findings | Blockers | Warnings |',
      '| --- | --- | --- | --- | --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: | --- | ---: | --- | ---: | ---: | ---: | ---: |',
      ...caseRows,
    ]),
    '',
    '## Reviewer Scorecard Matrix',
    '',
    markdownTable([
      '| Review Fixture | Dimension | Raw Score | Max Score | Normalized /10 | Evidence Artifacts | Evidence Examples | Notes |',
      '| --- | --- | ---: | ---: | ---: | --- | ---: | --- |',
      ...(scorecardRows.length > 0 ? scorecardRows : ['| none | none |  |  |  |  |  |  |']),
    ]),
    '',
    '## External Proof Readiness Checklist',
    '',
    markdownTable([
      '| Status | Requirement | Evidence | Next Action |',
      '| --- | --- | --- | --- |',
      ...(readinessRows.length > 0 ? readinessRows : ['| blocked | No readiness data | none | Run the audit. |']),
    ]),
    '',
    '## External Proof Bundle Matrix',
    '',
    markdownTable([
      '| Sample/Project | Complete | Missing Evidence | Proof Modality | Scope | Project Source | Scorecard | Source Fidelity | Blueprint Quality | Assumption Ledger | Edit History | Scope Tags | Fixture IDs |',
      '| --- | --- | --- | --- | ---: | --- | --- | --- | --- | --- | --- | --- | --- |',
      ...(proofBundleRows.length > 0
        ? proofBundleRows
        : ['| none | no | no external fixtures supplied | none |  | none | no | no | no | no | no | none | none |']),
    ]),
    '',
    '## Findings',
    '',
    ...(findings.length > 0 ? findings : ['- No expert-review findings.']),
  ].join('\n')}\n`;
}

export async function writeExpertReviewQualityAudit(payload, outputDir = DEFAULT_OUTPUT_DIR) {
  await fs.mkdir(outputDir, { recursive: true });
  const jsonPath = path.join(outputDir, 'latest.json');
  const markdownPath = path.join(outputDir, 'latest.md');
  await fs.writeFile(jsonPath, `${JSON.stringify(payload, null, 2)}\n`);
  await fs.writeFile(markdownPath, renderExpertReviewQualityAuditMarkdown(payload));
  return { jsonPath, markdownPath };
}

function parseArgs(argv) {
  const args = { outputDir: DEFAULT_OUTPUT_DIR };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--output') args.outputDir = path.resolve(argv[++i]);
    if (arg === '--fixtures') args.fixturePath = path.resolve(argv[++i]);
    if (arg === '--require-external-proof') args.requireExternalProof = true;
    if (arg === '--preflight') args.preflight = true;
  }
  if (args.preflight) args.requireExternalProof = true;
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  try {
    const payload = await buildExpertReviewQualityAudit({
      fixturePath: args.fixturePath,
      requireExternalProof: args.requireExternalProof,
      preflight: args.preflight,
    });
    const paths = await writeExpertReviewQualityAudit(payload, args.outputDir);
    console.log(`Expert review quality audit: ${payload.summary.status}`);
    console.log(`Proof status: ${payload.summary.proofStatus}`);
    console.log(
      `External proof readiness: ${payload.proofReadinessChecklist.status} (${payload.proofReadinessChecklist.passCount}/${payload.proofReadinessChecklist.itemCount})`,
    );
    console.log(`External proof required: ${payload.meta.requireExternalProof ? 'yes' : 'no'}`);
    console.log(`Report: ${paths.markdownPath}`);
    if (payload.summary.status !== 'pass') {
      process.exitCode = 1;
    }
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
