#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { buildBlueprintFromGraph } from '../src/lib/courseGraph/blueprintFromGraph.js';
import { compileBlueprintDeliverables } from '../src/lib/courseBlueprintCompiler.js';
import { lintItemAdmission } from '../src/lib/itemAdmissionLint.js';
import { isAppliedQuizStem } from '../src/lib/quality/quizItemDepth.js';

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

const projectPath = valueAfter('--project') || process.argv[2];
if (!projectPath) {
  console.error('Usage: npx vite-node scripts/scionQuizDepthReplay.mjs --project /path/to/project.json');
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
  const compiledItems = weeklyQuizzes.flatMap((quiz) =>
    (quiz.questions || [])
      .filter((item) => item?.type === 'multiple_choice')
      .map((item) => ({ ...item, lessonNumber: quiz.lessonNumber ?? null })),
  );
  const compiledAuthoredItems = compiledItems.filter(
    (item) => item.enrichmentSource === 'lesson-content-enrichment' || item.enrichmentSource === 'kernel-bank-extension',
  );
  const byLesson = weeklyQuizzes.map((quiz) => {
    const items = (quiz.questions || []).filter((item) => item?.type === 'multiple_choice');
    return { lessonNumber: quiz.lessonNumber ?? null, ...summarize(items) };
  });
  console.log(
    JSON.stringify(
      {
        schemaVersion: 1,
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
        compiledAuthoredItems: summarize(compiledAuthoredItems),
        byLesson,
      },
      null,
      2,
    ),
  );
}
