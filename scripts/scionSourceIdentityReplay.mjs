#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { buildBlueprintFromGraph } from '../src/lib/courseGraph/blueprintFromGraph.js';
import { detectForeignLanguageTeachingContent } from '../src/lib/languageIdentityGuard.js';

const AUTOMATIC_SOURCE_ORIGINS = new Set([
  'genome',
  'genome-prerequisite',
  'openalex',
  'openlibrary',
  'openstax',
  'source-finder',
]);

function valueAfter(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : '';
}

function resourceText(resource) {
  return `${resource?.title || ''} ${resource?.citation || ''} ${resource?.snippet || ''} ${
    resource?.evidence || ''
  }`;
}

const projectPath = valueAfter('--project') || process.argv[2];
if (!projectPath) {
  console.error('Usage: node scripts/scionSourceIdentityReplay.mjs --project /path/to/project.json');
  process.exitCode = 2;
} else {
  const absolutePath = path.resolve(projectPath);
  const project = JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
  const graph =
    typeof project.courseGraphJson === 'string' ? JSON.parse(project.courseGraphJson) : project.courseGraphJson;
  if (!graph || typeof graph !== 'object') throw new Error('Project does not contain a usable courseGraphJson value.');

  const courseIdentity = graph?.course?.name || graph?.courseName || graph?.title || '';
  const sourceDefects = (graph.resources || [])
    .filter((resource) => AUTOMATIC_SOURCE_ORIGINS.has(resource?.origin))
    .map((resource) => ({
      resource,
      contamination: detectForeignLanguageTeachingContent({
        courseIdentity,
        text: resourceText(resource),
      }),
    }))
    .filter((row) => row.contamination)
    .map((row) => ({
      id: row.resource.id || '',
      title: row.resource.title || '',
      origin: row.resource.origin || '',
      languageId: row.contamination.languageId,
      markers: row.contamination.markerLabels,
    }));

  const blueprint = buildBlueprintFromGraph(graph);
  const compiledText = JSON.stringify(blueprint);
  const compiledDefects = sourceDefects.filter((defect) => {
    const resource = (graph.resources || []).find((candidate) => candidate?.id === defect.id);
    return resource && compiledText.includes(resource.title || resource.citation || resource.id);
  });
  const report = {
    schemaVersion: 1,
    projectPath: absolutePath,
    courseName: courseIdentity,
    sourceIdentityDefects: sourceDefects.length,
    compiledIdentityDefects: compiledDefects.length,
    quarantinedDefects: sourceDefects.length - compiledDefects.length,
    sourceDefects,
    compiledDefects,
  };
  console.log(JSON.stringify(report, null, 2));
  if (compiledDefects.length > 0) process.exitCode = 1;
}
