#!/usr/bin/env node

// Recompile a saved package with the current compiler and prove that one
// instructor-named work reaches every instructional surface verbatim.

import fs from 'node:fs';
import path from 'node:path';
import { buildBlueprintFromGraph } from '../src/lib/courseGraph/blueprintFromGraph.js';
import { compileBlueprintDeliverables } from '../src/lib/courseBlueprintCompiler.js';

const FEATURES = ['lessonPlans', 'slideDecks', 'assignments', 'discussions', 'quizBank', 'studyGuides'];

function valueAfter(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : '';
}

function countOccurrences(text, needle) {
  if (!needle) return 0;
  return String(text).split(needle).length - 1;
}

const projectPath = valueAfter('--project') || process.argv[2];
const requestedTitle = valueAfter('--title');
const forbiddenVariant = valueAfter('--forbidden');
if (!projectPath) {
  console.error(
    'Usage: npx vite-node scripts/scionNamedReadingReplay.mjs --project /path/to/project.json [--title "Work title"]',
  );
  process.exitCode = 2;
} else {
  const absolutePath = path.resolve(projectPath);
  const project = JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
  const graph =
    typeof project.courseGraphJson === 'string' ? JSON.parse(project.courseGraphJson) : project.courseGraphJson;
  if (!graph || typeof graph !== 'object') throw new Error('Project does not contain a usable courseGraphJson value.');

  const blueprint = buildBlueprintFromGraph(graph);
  const title =
    requestedTitle ||
    blueprint.readingsRegistry?.find(
      (entry) =>
        String(entry?.title || '')
          .trim()
          .split(/\s+/).length >= 5,
    )?.title;
  if (!title) throw new Error('No named reading was found; pass one with --title.');

  const compiled = compileBlueprintDeliverables(blueprint, FEATURES, { skipLanguageFinalizer: true });
  const rows = FEATURES.map((featureId) => {
    const feature = compiled[featureId];
    const text = JSON.stringify(feature);
    const matchingEntries = Object.entries(feature || {}).flatMap(([collection, value]) =>
      Array.isArray(value)
        ? value.flatMap((entry, index) => {
            const entryText = JSON.stringify(entry);
            if (!entryText.includes(title)) return [];
            return [
              {
                collection,
                index,
                lessonNumber: entry?.lessonNumber ?? entry?.weekNumber ?? null,
                lessonTitle: entry?.lessonTitle ?? entry?.title ?? entry?.weekTitle ?? '',
                exactTitleOccurrences: countOccurrences(entryText, title),
              },
            ];
          })
        : [],
    );
    return {
      featureId,
      exactTitleOccurrences: countOccurrences(text, title),
      titlePresent: text.includes(title),
      forbiddenVariantOccurrences: countOccurrences(text, forbiddenVariant),
      matchingEntries,
    };
  });
  const missingFeatures = rows.filter((row) => !row.titlePresent).map((row) => row.featureId);
  const contaminatedFeatures = forbiddenVariant
    ? rows.filter((row) => row.forbiddenVariantOccurrences > 0).map((row) => row.featureId)
    : [];
  console.log(
    JSON.stringify(
      {
        schemaVersion: 1,
        projectPath: absolutePath,
        courseName: blueprint.courseName || graph.course?.name || '',
        title,
        forbiddenVariant: forbiddenVariant || null,
        surfaceCoverage: `${FEATURES.length - missingFeatures.length}/${FEATURES.length}`,
        missingFeatures,
        contaminatedFeatures,
        rows,
      },
      null,
      2,
    ),
  );
  if (missingFeatures.length > 0 || contaminatedFeatures.length > 0) process.exitCode = 1;
}
