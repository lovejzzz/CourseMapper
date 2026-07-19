#!/usr/bin/env node

// Run with vite-node because the production compiler uses browser-compatible
// extensionless imports: npx vite-node scripts/scionQuizFeedbackReplay.mjs --project <path>

import fs from 'node:fs';
import path from 'node:path';
import { buildBlueprintFromGraph } from '../src/lib/courseGraph/blueprintFromGraph.js';
import { compileBlueprintDeliverables } from '../src/lib/courseBlueprintCompiler.js';
import { lintItemAdmission } from '../src/lib/itemAdmissionLint.js';

const FEEDBACK_ISSUES = new Set([
  'generation-marker-residue',
  'answer-position-residue',
  'claim-marker-residue',
  'repetitive-explanation',
]);

function valueAfter(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : '';
}

function feedbackIssues(item) {
  return lintItemAdmission(item).filter((issue) => FEEDBACK_ISSUES.has(issue));
}

function collectCompiledFeedbackDefects(value, currentPath = [], rows = []) {
  if (!value || typeof value !== 'object') return rows;
  if (typeof value.explanation === 'string') {
    const issues = feedbackIssues(value);
    if (issues.length > 0) {
      rows.push({ path: currentPath.join('.'), issues, preview: value.explanation.slice(0, 140) });
    }
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => collectCompiledFeedbackDefects(entry, [...currentPath, index], rows));
  } else {
    Object.entries(value).forEach(([key, entry]) => collectCompiledFeedbackDefects(entry, [...currentPath, key], rows));
  }
  return rows;
}

const projectPath = valueAfter('--project') || process.argv[2];
if (!projectPath) {
  console.error('Usage: npx vite-node scripts/scionQuizFeedbackReplay.mjs --project /path/to/project.json');
  process.exitCode = 2;
} else {
  const absolutePath = path.resolve(projectPath);
  const project = JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
  const graph =
    typeof project.courseGraphJson === 'string' ? JSON.parse(project.courseGraphJson) : project.courseGraphJson;
  if (!graph || typeof graph !== 'object') throw new Error('Project does not contain a usable courseGraphJson value.');

  const blueprint = buildBlueprintFromGraph(graph);
  const sourceDefects = [];
  for (const lesson of blueprint.lessons || []) {
    for (const [index, item] of (lesson?.enrichment?.quizItems || []).entries()) {
      const issues = feedbackIssues(item);
      if (issues.length === 0) continue;
      sourceDefects.push({
        lesson: lesson.lessonNumber,
        item: index + 1,
        issues,
        preview: String(item.explanation || '').slice(0, 140),
      });
    }
  }

  const compiled = compileBlueprintDeliverables(blueprint, ['quizBank'], { skipLanguageFinalizer: true });
  const compiledDefects = collectCompiledFeedbackDefects(compiled);
  const report = {
    schemaVersion: 2,
    projectPath: absolutePath,
    courseName: blueprint.courseName || graph.course?.name || '',
    sourceFeedbackDefects: sourceDefects.length,
    compiledFeedbackDefects: compiledDefects.length,
    quarantinedDefects: sourceDefects.length - compiledDefects.length,
    sourceDefects,
    compiledDefects,
  };
  console.log(JSON.stringify(report, null, 2));
  if (compiledDefects.length > 0) process.exitCode = 1;
}
