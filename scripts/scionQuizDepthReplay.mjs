#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { buildBlueprintFromGraph } from '../src/lib/courseGraph/blueprintFromGraph.js';
import { compileBlueprintDeliverables } from '../src/lib/courseBlueprintCompiler.js';
import { lintItemAdmission } from '../src/lib/itemAdmissionLint.js';
import {
  isAppliedQuizStem,
  isClaimEvidenceBoundaryShortAnswer,
  isConceptCuedCompilerShortAnswer,
} from '../src/lib/quality/quizItemDepth.js';
import { verifyPackageExports } from '../src/lib/packageExportVerifier.js';

function valueAfter(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : '';
}

function summarize(items) {
  const appliedItems = items.filter((item) => isAppliedQuizStem(item.question));
  return {
    total: items.length,
    applied: appliedItems.length,
    appliedShare: items.length > 0 ? Number((appliedItems.length / items.length).toFixed(3)) : 0,
  };
}

function summarizeConstructed(items) {
  const conceptCued = items.filter((item) => isConceptCuedCompilerShortAnswer(item.question)).length;
  const claimEvidenceBoundary = items.filter((item) => isClaimEvidenceBoundaryShortAnswer(item.question)).length;
  return {
    total: items.length,
    conceptCued,
    claimEvidenceBoundary,
    claimEvidenceBoundaryShare: items.length > 0 ? Number((claimEvidenceBoundary / items.length).toFixed(3)) : 0,
  };
}

function summarizeProvenance(items) {
  const counts = new Map();
  for (const item of items) {
    const source = String(item?.enrichmentSource || 'unlabeled');
    counts.set(source, (counts.get(source) || 0) + 1);
  }
  return Object.fromEntries([...counts.entries()].sort(([left], [right]) => left.localeCompare(right)));
}

function normalizedQuestion(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function summarizeExactDuplicates(quizzes) {
  const groups = [];
  for (const quiz of quizzes) {
    const byStem = new Map();
    for (const item of quiz.questions || []) {
      const stem = normalizedQuestion(item.question);
      if (!stem) continue;
      const matches = byStem.get(stem) || [];
      matches.push(item);
      byStem.set(stem, matches);
    }
    for (const matches of byStem.values()) {
      if (matches.length < 2) continue;
      groups.push({
        lessonNumber: quiz.lessonNumber ?? null,
        count: matches.length,
        question: matches[0].question,
        ids: matches.map((item) => item.id || null),
      });
    }
  }
  return {
    groupCount: groups.length,
    duplicatedSeatCount: groups.reduce((sum, group) => sum + group.count, 0),
    groups,
  };
}

function compiledAdmissionIssues(items) {
  return items.flatMap((item) => {
    const issues = lintItemAdmission({
      question: item.question,
      options: (item.options || []).map((option) => String(option).replace(/^[A-D]\.\s*/, '')),
      answerIndex: 'ABCD'.indexOf(item.answer),
      explanation: item.explanation,
    });
    return issues.length > 0
      ? [
          {
            lessonNumber: item.lessonNumber,
            enrichmentSource: item.enrichmentSource || null,
            question: item.question,
            options: item.options,
            answer: item.answer,
            explanation: item.explanation,
            tags: item.tags,
            quizPlan: item.quizPlan,
            misconceptionSourced: item.misconceptionSourced === true,
            issues,
          },
        ]
      : [];
  });
}

const projectPath = valueAfter('--project') || process.argv[2];
if (!projectPath) {
  console.error(
    'Usage: npx vite-node scripts/scionQuizDepthReplay.mjs --project /path/to/project.json [--verify-export]',
  );
  process.exitCode = 2;
} else {
  const absolutePath = path.resolve(projectPath);
  const project = JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
  const graph =
    typeof project.courseGraphJson === 'string' ? JSON.parse(project.courseGraphJson) : project.courseGraphJson;
  if (!graph || typeof graph !== 'object') throw new Error('Project does not contain a usable courseGraphJson value.');

  const blueprint = buildBlueprintFromGraph(graph);
  const sourceItems = (blueprint.lessons || []).flatMap((lesson) =>
    (lesson?.enrichment?.quizItems || [])
      .filter((item) => (item?.type || 'multiple_choice') === 'multiple_choice' && item?.extension !== true)
      .map((item) => ({ ...item, lessonNumber: lesson.lessonNumber })),
  );
  const compiled = compileBlueprintDeliverables(blueprint, ['quizBank'], { skipLanguageFinalizer: true });
  const weeklyQuizzes = compiled.quizBank?.quizzes || [];
  const compiledQuestionSeats = weeklyQuizzes.flatMap((quiz) =>
    (quiz.questions || []).map((item) => ({ ...item, lessonNumber: quiz.lessonNumber ?? null })),
  );
  const compiledItems = weeklyQuizzes.flatMap((quiz) =>
    (quiz.questions || [])
      .filter((item) => item?.type === 'multiple_choice')
      .map((item) => ({ ...item, lessonNumber: quiz.lessonNumber ?? null })),
  );
  const compiledAuthoredItems = compiledItems.filter(
    (item) =>
      item.enrichmentSource === 'lesson-content-enrichment' || item.enrichmentSource === 'kernel-bank-extension',
  );
  const compiledConstructedItems = weeklyQuizzes.flatMap((quiz) =>
    (quiz.questions || [])
      .filter((item) => item?.type === 'short_answer')
      .map((item) => ({ ...item, lessonNumber: quiz.lessonNumber ?? null })),
  );
  const byLesson = weeklyQuizzes.map((quiz) => {
    const items = (quiz.questions || []).filter((item) => item?.type === 'multiple_choice');
    return { lessonNumber: quiz.lessonNumber ?? null, ...summarize(items) };
  });
  const verifyExport = process.argv.includes('--verify-export');
  const exactDuplicates = summarizeExactDuplicates(weeklyQuizzes);
  const exportVerification = verifyExport
    ? await verifyPackageExports({
        courseMap: project.courseMap,
        deliverables: { quizBank: { status: 'done', data: compiled.quizBank } },
        selectedFeatures: ['quizBank'],
      })
    : null;
  console.log(
    JSON.stringify(
      {
        schemaVersion: 3,
        projectPath: absolutePath,
        courseName: blueprint.courseName || graph.course?.name || '',
        sourceModelItems: summarize(sourceItems),
        sourceAppliedSamples: sourceItems
          .filter((item) => isAppliedQuizStem(item.question))
          .slice(0, 6)
          .map((item) => ({
            lessonNumber: item.lessonNumber,
            question: item.question,
            admissionIssues: lintItemAdmission(item),
          })),
        compiledItems: summarize(compiledItems),
        compiledQuestionSeats: {
          total: compiledQuestionSeats.length,
          sourceBoundRecovery: compiledQuestionSeats.filter((item) => item.enrichmentSource === 'source-bound-recovery')
            .length,
          admittedKernelAssessment: compiledQuestionSeats.filter(
            (item) => item.enrichmentSource === 'admitted-kernel-assessment',
          ).length,
          sourceReviewRequired: compiledQuestionSeats.filter((item) => item.sourceReviewRequired === true).length,
          provenance: summarizeProvenance(compiledQuestionSeats),
          sourceBoundRecoverySamples: compiledQuestionSeats
            .filter((item) => item.enrichmentSource === 'source-bound-recovery')
            .map((item) => ({
              lessonNumber: item.lessonNumber,
              type: item.type,
              question: item.question,
            })),
        },
        compiledAdmissionIssues: compiledAdmissionIssues(compiledItems),
        compiledExactDuplicates: exactDuplicates,
        compiledAuthoredItems: summarize(compiledAuthoredItems),
        compiledConstructedItems: summarizeConstructed(compiledConstructedItems),
        compiledConstructedSamples: compiledConstructedItems.map((item) => ({
          lessonNumber: item.lessonNumber,
          question: item.question,
          conceptCued: isConceptCuedCompilerShortAnswer(item.question),
          claimEvidenceBoundary: isClaimEvidenceBoundaryShortAnswer(item.question),
          enrichmentSource: item.enrichmentSource || null,
        })),
        byLesson,
        ...(exportVerification
          ? {
              exportVerification: {
                status: exportVerification.status,
                checked: exportVerification.checked,
                failed: exportVerification.failed,
                warningCount: exportVerification.warningCount,
                findings: exportVerification.checks.filter((check) => check.status !== 'passed'),
              },
            }
          : {}),
      },
      null,
      2,
    ),
  );
  if (exportVerification && exportVerification.status !== 'passed') process.exitCode = 1;
  if (exactDuplicates.groupCount > 0) process.exitCode = 1;
}
