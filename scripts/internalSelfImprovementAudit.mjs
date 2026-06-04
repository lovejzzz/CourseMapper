#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import {
  PIPELINE_FEATURES,
  closeHybridPipelineAuditRuntime,
  loadHybridPipelineAuditRuntime,
} from './hybridPipelineAudit.mjs';
import { buildCompactPackageTrustReceipt } from '../src/lib/packageFinalizerSummary.js';

const ROOT = process.cwd();
const DEFAULT_OUTPUT_DIR = path.join(ROOT, 'verification-output', 'internal-self-improvement');

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

export const DEFAULT_SELF_IMPROVEMENT_FIXTURES = [
  {
    id: 'sparse-official-dates-and-assessments',
    title: 'Sparse official dates and assessments',
    focus: 'Missing official dates, incomplete assessment details, and local confirmation boundaries',
    expectedReviewSignals: [
      {
        id: 'official-dates',
        label: 'Official dates need local confirmation',
        pattern: /official (?:date|calendar)|confirm(?:ed|ation)?[^.]{0,80}date|date[^.]{0,80}confirm/i,
      },
      {
        id: 'assessment-confirmation',
        label: 'Assessment weights or grading choices need local confirmation',
        pattern:
          /assessment weight|grading decision|confirm(?:ed|ation)?[^.]{0,80}assessment|assessment[^.]{0,80}confirm/i,
      },
    ],
    courseMap: {
      courseName: 'Community Health Practicum Planning',
      semester: 'TBD',
      lessons: [
        {
          title: 'Lesson 1: Community Intake',
          sections: [
            {
              topics: 'Community intake goals and stakeholder context',
              objectives: 'Identify the information needed before a practicum plan can be approved.',
              activities: 'Stakeholder map and intake role-play',
              assessment: '',
            },
          ],
        },
        {
          title: 'Lesson 2: Evidence Sources',
          sections: [
            {
              topics: 'Local reports, interview notes, and incomplete agency records',
              objectives: 'Evaluate which sources are strong enough to support planning decisions.',
              activities: 'Source-quality sort with missing-record flags',
              assessment: 'Evidence memo draft',
            },
          ],
        },
        {
          title: 'Lesson 3: Program Logic',
          sections: [
            {
              topics: 'Inputs, activities, outputs, outcomes',
              objectives: 'Build a draft logic model from partial source evidence.',
              activities: 'Logic-model studio with peer critique',
              assessment: '',
            },
          ],
        },
        {
          title: 'Lesson 4: Feasibility Review',
          sections: [
            {
              topics: 'Staffing, timeline, risk, and adoption constraints',
              objectives: 'Revise a plan when a constraint invalidates the first draft.',
              activities: 'Constraint scenario and revision round',
              assessment: 'Feasibility note',
            },
          ],
        },
        {
          title: 'Lesson 5: Handoff and Local Approval',
          sections: [
            {
              topics: 'Instructor approval, partner confirmation, and publish boundary',
              objectives: 'Prepare a handoff that names what still needs local approval.',
              activities: 'Final handoff checklist',
              assessment: 'Draft practicum plan',
            },
          ],
        },
      ],
    },
  },
  {
    id: 'contradictory-clinical-schedule',
    title: 'Contradictory clinical schedule',
    focus: 'Duplicate clinical weeks, safety-sensitive assumptions, and source-conflict review actions',
    expectedReviewSignals: [
      {
        id: 'source-conflict',
        label: 'Source conflicts are visible before publication',
        pattern: /source conflict|conflicting source|duplicate|contradict/i,
      },
      {
        id: 'safety-review',
        label: 'Clinical or safety-sensitive assumptions require review',
        pattern: /safety|clinical|scope of practice|local review|confirm/i,
      },
    ],
    courseMap: {
      courseName: 'Clinical Communication Simulation',
      semester: 'Spring pilot',
      lessons: [
        {
          title: 'Week 1: Patient Intake',
          sections: [
            {
              topics: 'Patient greeting, confidentiality, symptom intake',
              objectives: 'Collect a patient concern using safe communication routines.',
              activities: 'Simulated intake with observer checklist',
              assessment: 'Role-play note',
            },
          ],
        },
        {
          title: 'Week 2: Medication Communication',
          sections: [
            {
              topics: 'Medication reconciliation and plain-language explanation',
              objectives: 'Explain medication instructions and identify risk cues.',
              activities: 'Medication-card simulation',
              assessment: 'Medication explanation check',
            },
          ],
        },
        {
          title: 'Week 2: Discharge Communication',
          sections: [
            {
              topics: 'Discharge instructions, teach-back, warning signs',
              objectives: 'Use teach-back to confirm patient understanding.',
              activities: 'Discharge simulation',
              assessment: 'Discharge script',
            },
          ],
        },
        {
          title: 'Week 4: Interpreter Protocol',
          sections: [
            {
              topics: 'Interpreter use, cultural humility, handoff limits',
              objectives: 'Choose communication moves that stay within role and protocol.',
              activities: 'Interpreter scenario triads',
              assessment: 'Protocol reflection',
            },
          ],
        },
        {
          title: 'Week 5: Final Simulation',
          sections: [
            {
              topics: 'Integrated patient scenario',
              objectives: 'Complete a safe simulated communication sequence.',
              activities: 'Final simulation with debrief',
              assessment: 'Final simulation performance',
            },
          ],
        },
      ],
    },
  },
];

function makeFinding(severity, check, message, detail = {}) {
  return { severity, check, message, ...detail };
}

function collectStrings(value, out = []) {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) value.forEach((item) => collectStrings(item, out));
  else if (value && typeof value === 'object') Object.values(value).forEach((item) => collectStrings(item, out));
  return out;
}

function summarizeFindings(findings) {
  const blockers = findings.filter((finding) => finding.severity === 'blocker').length;
  const warnings = findings.filter((finding) => finding.severity === 'warning').length;
  const improvements = findings.filter((finding) => finding.severity === 'improvement').length;
  const acceptedRisks = findings.filter((finding) => finding.severity === 'risk').length;
  return {
    status: blockers > 0 ? 'blocked' : warnings > 0 ? 'warnings' : 'pass',
    blockers,
    warnings,
    improvements,
    acceptedRisks,
  };
}

function findDuplicateLessonLabels(courseMap) {
  const seen = new Map();
  const duplicates = [];
  for (const [index, lesson] of (courseMap?.lessons || []).entries()) {
    const normalized = String(lesson?.title || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
    const scheduleLabel = normalized.match(/\b(?:week|lesson|module|session)\s+\d+\b/)?.[0];
    if (!scheduleLabel) continue;
    if (seen.has(scheduleLabel)) duplicates.push({ label: scheduleLabel, firstIndex: seen.get(scheduleLabel), index });
    else seen.set(scheduleLabel, index);
  }
  return duplicates;
}

function auditInputRisks(fixture) {
  const findings = [];
  const courseMap = fixture.courseMap || {};
  if (!courseMap.semester || /\b(?:tbd|unknown|placeholder)\b/i.test(courseMap.semester)) {
    findings.push(
      makeFinding('risk', 'input-risk', 'Course has missing or placeholder official dates.', {
        path: 'courseMap.semester',
      }),
    );
  }

  const missingAssessmentLessons = (courseMap.lessons || [])
    .map((lesson, index) => ({
      index,
      title: lesson.title || `Lesson ${index + 1}`,
      hasAssessment: collectStrings(lesson.sections || []).some((value) =>
        /assessment|quiz|exam|rubric|memo|plan/i.test(value),
      ),
    }))
    .filter((row) => !row.hasAssessment);
  if (missingAssessmentLessons.length > 0) {
    findings.push(
      makeFinding(
        'risk',
        'input-risk',
        `${missingAssessmentLessons.length} lesson(s) lack visible assessment evidence.`,
        {
          lessons: missingAssessmentLessons.map((row) => row.title),
        },
      ),
    );
  }

  const duplicateLabels = findDuplicateLessonLabels(courseMap);
  if (duplicateLabels.length > 0) {
    findings.push(
      makeFinding(
        'risk',
        'input-risk',
        `Duplicate schedule labels need source-conflict review: ${duplicateLabels.map((row) => row.label).join(', ')}.`,
        {
          duplicateLabels,
        },
      ),
    );
  }

  return findings;
}

function compileFixture({ fixture, runtime, features }) {
  const courseMap = fixture.courseMap;
  const blueprint = runtime.buildCourseBlueprint(courseMap, {});
  const compiledFeatures = runtime.getBlueprintCompiledFeatures(features || PIPELINE_FEATURES);
  const compiled = runtime.compileBlueprintDeliverables(blueprint, compiledFeatures, { configMap: {} });
  return { blueprint, compiledFeatures, compiled };
}

function numericValue(...values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

function lessonWorkloadMinutes(lesson = {}) {
  const workload = lesson.workloadEstimate || {};
  const direct = numericValue(
    workload.totalStudentMinutes,
    workload.totalMinutes,
    workload.studentMinutes,
    workload.totalWorkloadMinutes,
  );
  if (direct !== null) return direct;
  const parts = [
    workload.beforeClassMinutes,
    workload.inClassMinutes,
    workload.afterClassMinutes,
    workload.outOfClassMinutes,
  ]
    .map(Number)
    .filter(Number.isFinite);
  return parts.length > 0 ? parts.reduce((sum, value) => sum + value, 0) : null;
}

function lessonLiveMinutes(lesson = {}) {
  const session = lesson.classSessionPlan || {};
  const workload = lesson.workloadEstimate || {};
  return numericValue(
    session.plannedMinutes,
    session.totalMinutes,
    session.liveMinutes,
    workload.inClassMinutes,
    workload.plannedClassMinutes,
  );
}

function auditTimingWorkloadPlausibility(blueprint = {}) {
  const findings = [];
  const lessons = Array.isArray(blueprint.lessons) ? blueprint.lessons : [];

  for (const lesson of lessons) {
    const lessonNumber = lesson.lessonNumber || lesson.weekNumber || null;
    const title = lesson.title || lesson.lessonTitle || `Lesson ${lessonNumber || '?'}`;
    const artifact = lesson.studentArtifact || lesson.assessmentArtifact || 'lesson artifact';
    const totalMinutes = lessonWorkloadMinutes(lesson);
    const liveMinutes = lessonLiveMinutes(lesson);
    const feasibilityStatus = String(lesson.classSessionPlan?.feasibilityStatus || '').toLowerCase();
    const detail = {
      lessonNumber,
      lessonTitle: title,
      artifact,
      invariant: 'Lesson timing must be plausible for the stated modality and workload.',
      repairPath: 'Adjust the lesson workload, split the lesson, or mark the schedule for local instructor review.',
    };

    if (totalMinutes === null || liveMinutes === null) {
      findings.push(
        makeFinding(
          'improvement',
          'timing-workload',
          `${title} is missing explicit workload or live-session timing evidence for ${artifact}.`,
          detail,
        ),
      );
      continue;
    }

    if (
      totalMinutes > 720 ||
      liveMinutes > 240 ||
      /\b(?:impossible|infeasible|overloaded|unworkable)\b/i.test(feasibilityStatus)
    ) {
      findings.push(
        makeFinding(
          'blocker',
          'timing-workload',
          `${title} has implausible timing for ${artifact}: ${totalMinutes} total minutes and ${liveMinutes} live minutes.`,
          detail,
        ),
      );
    } else if (totalMinutes > 540 || liveMinutes > 180 || /\b(?:review|tight|heavy)\b/i.test(feasibilityStatus)) {
      findings.push(
        makeFinding(
          'warning',
          'timing-workload',
          `${title} has heavy timing for ${artifact}: ${totalMinutes} total minutes and ${liveMinutes} live minutes.`,
          detail,
        ),
      );
    }
  }

  return findings;
}

function buildSelfImprovementReceipt({ blueprint = {}, compiledFeatures = [], findings = [] }) {
  const lessons = Array.isArray(blueprint.lessons) ? blueprint.lessons : [];
  const reviewRequiredLessons =
    numericValue(blueprint.compilerDecisionMatrix?.reviewRequiredCount) ??
    lessons.filter((lesson) => lesson.compilerDecision?.reviewRequired || lesson.sourceRisk?.reviewRequired).length;
  const deterministicRepairs =
    numericValue(
      blueprint.compilerPath?.adaptiveSafety?.locallyRepairedLessonCount,
      blueprint.compilerPath?.adaptiveRepairPlan?.deterministicRepairCount,
      blueprint.compilerDecisionMatrix?.localRepairCount,
    ) ?? 0;
  const sourceGroundedLessons =
    numericValue(blueprint.qualitySignals?.sourceGroundedLessonCount) ??
    lessons.filter((lesson) => lesson.confidence?.level === 'high').length;
  const inferredAssumptions =
    numericValue(blueprint.blueprintAssumptionLedger?.reviewRequiredCount) ??
    (Array.isArray(blueprint.blueprintAssumptionLedger?.rows)
      ? blueprint.blueprintAssumptionLedger.rows.filter((row) => row.reviewRequired).length
      : null);
  const localConfirmationChecklist =
    blueprint.classroomHandoffPlan?.requiredLocalConfirmations ||
    blueprint.blueprintReviewSurface?.localConfirmationSummary?.localConfirmationRows?.map(
      (row) => row.localConfirmationCue,
    ) ||
    [];
  const studentFacingCleanlinessStatus = findings.some((finding) =>
    /publishability|student-facing|internal-language/i.test(finding.check),
  )
    ? 'blocked'
    : 'clean';

  return buildCompactPackageTrustReceipt({
    lessonCount: lessons.length,
    compilerSummary: { compiledFeatureCount: compiledFeatures.length },
    selectedFeatureCount: compiledFeatures.length,
    modelGeneratedDeliverableCount: 0,
    deterministicRepairCount: deterministicRepairs,
    reviewRequiredCount: reviewRequiredLessons,
    sourceGroundedLessonCount: sourceGroundedLessons,
    inferredAssumptionCount: inferredAssumptions,
    exportVerification: { formatsVerified: ['audit:self validators'] },
    studentFacingCleanlinessStatus,
    localConfirmationChecklist,
    liveProviderCallCount: 0,
    budgetStatus: '0 live provider calls',
  });
}

function auditCompiledPackage({ fixture, runtime, blueprint, compiledFeatures, compiled }) {
  const findings = [];
  const courseMap = fixture.courseMap;
  const expectedLessonCount = Array.isArray(courseMap?.lessons) ? courseMap.lessons.length : 0;
  const compiledText = collectStrings(compiled).join(' ');

  for (const signal of fixture.expectedReviewSignals || []) {
    if (!signal.pattern.test(compiledText)) {
      findings.push(
        makeFinding('blocker', 'review-boundary', `Missing review signal: ${signal.label}.`, { signalId: signal.id }),
      );
    }
  }

  for (const featureId of compiledFeatures) {
    const data = compiled?.[featureId];
    if (!data) {
      findings.push(
        makeFinding('blocker', 'compiled-feature', `Missing compiled feature: ${featureId}.`, { featureId }),
      );
      continue;
    }
    const validation =
      typeof runtime.validateDeliverableGeneration === 'function'
        ? runtime.validateDeliverableGeneration(featureId, data, {
            expectedLessonCount,
            config: featureId === 'courseFaq' ? { questionsPerLesson: 5 } : {},
          })
        : { valid: true, blockers: [] };
    for (const message of validation.blockers || []) {
      findings.push(
        makeFinding('blocker', 'validator', `${FEATURE_LABELS[featureId] || featureId} failed validation: ${message}`, {
          featureId,
        }),
      );
    }
    const placeholders =
      typeof runtime.findPublishabilityPlaceholders === 'function'
        ? runtime.findPublishabilityPlaceholders(collectStrings(data).join(' '), { limit: 3 })
        : [];
    if (placeholders.length > 0) {
      findings.push(
        makeFinding(
          'blocker',
          'publishability',
          `${FEATURE_LABELS[featureId] || featureId} contains publishability placeholder: ${placeholders[0]}.`,
          { featureId },
        ),
      );
    }
  }

  findings.push(...auditTimingWorkloadPlausibility(blueprint));

  return findings;
}

export function auditSelfImprovementFixture({ fixture, runtime, features = PIPELINE_FEATURES }) {
  const inputRiskFindings = auditInputRisks(fixture);
  try {
    const { blueprint, compiledFeatures, compiled } = compileFixture({ fixture, runtime, features });
    const packageFindings = auditCompiledPackage({ fixture, runtime, blueprint, compiledFeatures, compiled });
    const findings = [...inputRiskFindings, ...packageFindings];
    return {
      fixtureId: fixture.id,
      title: fixture.title,
      focus: fixture.focus,
      scope: fixture.courseMap?.lessons?.length || 0,
      compiledFeatures,
      compactReceipt: buildSelfImprovementReceipt({ blueprint, compiledFeatures, findings }),
      inputRiskCount: inputRiskFindings.length,
      expectedReviewSignalCount: fixture.expectedReviewSignals?.length || 0,
      ...summarizeFindings(findings),
      findings,
    };
  } catch (error) {
    const findings = [
      ...inputRiskFindings,
      makeFinding('blocker', 'compiler', `Compiler failed: ${error?.message || String(error)}`),
    ];
    return {
      fixtureId: fixture.id,
      title: fixture.title,
      focus: fixture.focus,
      scope: fixture.courseMap?.lessons?.length || 0,
      compiledFeatures: [],
      compactReceipt: buildSelfImprovementReceipt({ findings }),
      inputRiskCount: inputRiskFindings.length,
      expectedReviewSignalCount: fixture.expectedReviewSignals?.length || 0,
      ...summarizeFindings(findings),
      findings,
    };
  }
}

function summarizeResults(results) {
  const blockers = results.reduce((sum, result) => sum + result.blockers, 0);
  const warnings = results.reduce((sum, result) => sum + result.warnings, 0);
  return {
    status: blockers > 0 ? 'blocked' : warnings > 0 ? 'warnings' : 'pass',
    fixtureCount: results.length,
    blockers,
    warnings,
    inputRiskCount: results.reduce((sum, result) => sum + result.inputRiskCount, 0),
    expectedReviewSignalCount: results.reduce((sum, result) => sum + result.expectedReviewSignalCount, 0),
    improvements: results.reduce((sum, result) => sum + (result.improvements || 0), 0),
    acceptedRisks: results.reduce((sum, result) => sum + (result.acceptedRisks || 0), 0),
    receiptCount: results.filter((result) => result.compactReceipt?.fields?.length > 0).length,
  };
}

export async function buildInternalSelfImprovementAudit(options = {}) {
  const runtime = options.runtime || (await loadHybridPipelineAuditRuntime());
  const fixtures =
    Array.isArray(options.fixtures) && options.fixtures.length > 0
      ? options.fixtures
      : DEFAULT_SELF_IMPROVEMENT_FIXTURES;
  const results = fixtures.map((fixture) =>
    auditSelfImprovementFixture({ fixture, runtime, features: options.features || PIPELINE_FEATURES }),
  );
  return {
    meta: {
      generatedAt: new Date().toISOString(),
      note: 'Internal self-improvement fixtures are adversarial regression checks. They replace external proof as a v0.8.2 release dependency, but they do not claim external expert certification.',
    },
    summary: summarizeResults(results),
    results,
  };
}

function markdownTable(rows) {
  return rows.join('\n');
}

export function renderInternalSelfImprovementMarkdown(payload) {
  const matrixRows = payload.results.map(
    (result) =>
      `| ${result.fixtureId} | ${result.scope} | ${result.status} | ${result.compiledFeatures.length} | ${result.inputRiskCount} | ${result.expectedReviewSignalCount} | ${result.blockers} | ${result.warnings} | ${result.improvements || 0} |`,
  );
  const receiptRows = payload.results.flatMap((result) =>
    (result.compactReceipt?.fields || []).map(
      (field) => `| ${result.fixtureId} | ${field.label} | ${String(field.value).replace(/\|/g, '/')} |`,
    ),
  );
  const findingLine = (result, finding) => {
    const suffix = finding.repairPath ? ` Repair path: ${finding.repairPath}` : '';
    return `- ${result.fixtureId}/${finding.check}/${finding.severity}: ${finding.message}${suffix}`;
  };
  const findings = payload.results.flatMap((result) =>
    result.findings.filter((finding) => finding.severity !== 'risk').map((finding) => findingLine(result, finding)),
  );
  const acceptedRisks = payload.results.flatMap((result) =>
    result.findings.filter((finding) => finding.severity === 'risk').map((finding) => findingLine(result, finding)),
  );

  return `${[
    '# CourseMapper Internal Self-Improvement Audit',
    '',
    `Generated: ${payload.meta.generatedAt}`,
    '',
    '## Summary',
    '',
    `Status: ${payload.summary.status}`,
    `Fixtures: ${payload.summary.fixtureCount}`,
    `Input risks surfaced: ${payload.summary.inputRiskCount}`,
    `Expected review signals checked: ${payload.summary.expectedReviewSignalCount}`,
    `Improvement candidates: ${payload.summary.improvements}`,
    `Accepted risks: ${payload.summary.acceptedRisks}`,
    `Compact receipts: ${payload.summary.receiptCount}`,
    `Blockers: ${payload.summary.blockers}`,
    `Warnings: ${payload.summary.warnings}`,
    '',
    `Note: ${payload.meta.note}`,
    '',
    '## Fixture Matrix',
    '',
    markdownTable([
      '| Fixture | Scope | Status | Compiled Features | Input Risks | Review Signals | Blockers | Warnings | Improvements |',
      '| --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: |',
      ...matrixRows,
    ]),
    '',
    '## Compact Receipt Matrix',
    '',
    markdownTable([
      '| Fixture | Field | Value |',
      '| --- | --- | --- |',
      ...(receiptRows.length > 0 ? receiptRows : ['| none | none | none |']),
    ]),
    '',
    '## Findings',
    '',
    ...(findings.length > 0 ? findings : ['- No internal self-improvement findings.']),
    '',
    '## Accepted Risks',
    '',
    ...(acceptedRisks.length > 0 ? acceptedRisks : ['- No accepted input risks.']),
    '',
  ].join('\n')}`;
}

export async function writeInternalSelfImprovementAudit(payload, outputDir = DEFAULT_OUTPUT_DIR) {
  await fs.mkdir(outputDir, { recursive: true });
  const jsonPath = path.join(outputDir, 'latest.json');
  const markdownPath = path.join(outputDir, 'latest.md');
  await fs.writeFile(jsonPath, `${JSON.stringify(payload, null, 2)}\n`);
  await fs.writeFile(markdownPath, renderInternalSelfImprovementMarkdown(payload));
  return { jsonPath, markdownPath };
}

function parseArgs(argv) {
  const args = { outputDir: DEFAULT_OUTPUT_DIR, fixtureIds: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--output') args.outputDir = path.resolve(argv[++i]);
    else if (arg === '--fixture' || arg === '--fixtures') {
      args.fixtureIds.push(
        ...String(argv[++i] || '')
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean),
      );
    }
  }
  return args;
}

function selectFixtures(fixtureIds) {
  if (!Array.isArray(fixtureIds) || fixtureIds.length === 0) return DEFAULT_SELF_IMPROVEMENT_FIXTURES;
  const available = new Map(DEFAULT_SELF_IMPROVEMENT_FIXTURES.map((fixture) => [fixture.id, fixture]));
  const missing = fixtureIds.filter((fixtureId) => !available.has(fixtureId));
  if (missing.length > 0) throw new Error(`Unknown self-improvement fixture id(s): ${missing.join(', ')}`);
  return fixtureIds.map((fixtureId) => available.get(fixtureId));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  try {
    const payload = await buildInternalSelfImprovementAudit({ fixtures: selectFixtures(args.fixtureIds) });
    const paths = await writeInternalSelfImprovementAudit(payload, args.outputDir);
    console.log(`Internal self-improvement audit: ${payload.summary.status}`);
    console.log(`Report: ${paths.markdownPath}`);
    if (payload.summary.status !== 'pass') process.exitCode = 1;
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
