#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { buildBlueprintFromGraph } from '../src/lib/courseGraph/blueprintFromGraph.js';
import { compileBlueprintDeliverables } from '../src/lib/courseBlueprintCompiler.js';

const CJK_RE = /[\u3400-\u4dbf\u4e00-\u9fff]/;
const TONE_MARKED_PINYIN_RE = /[a-zü]*[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/i;

function valueAfter(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : '';
}

const projectPath = valueAfter('--project') || process.argv[2];
if (!projectPath) {
  console.error('Usage: node scripts/scionLanguageProjectionReplay.mjs --project /path/to/project.json');
  process.exitCode = 2;
} else {
  const absolutePath = path.resolve(projectPath);
  const project = JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
  const graph =
    typeof project.courseGraphJson === 'string' ? JSON.parse(project.courseGraphJson) : project.courseGraphJson;
  if (!graph || typeof graph !== 'object') throw new Error('Project does not contain a usable courseGraphJson value.');

  const blueprint = buildBlueprintFromGraph(graph);
  const compiled = compileBlueprintDeliverables(blueprint, ['studyGuides'], { skipLanguageFinalizer: true });
  const guides = Array.isArray(compiled?.studyGuides?.studyGuides) ? compiled.studyGuides.studyGuides : [];
  const rows = guides.map((guide, index) => {
    const text = JSON.stringify(guide);
    return {
      lesson: index + 1,
      title: guide.lessonTitle || `Lesson ${index + 1}`,
      hasHanzi: CJK_RE.test(text),
      hasToneMarkedPinyin: TONE_MARKED_PINYIN_RE.test(text),
      admittedPairTerms: (guide.keyTerms || []).filter((term) => term?.enrichmentSource === 'admitted-language-pair')
        .length,
    };
  });
  const complete = rows.filter((row) => row.hasHanzi && row.hasToneMarkedPinyin).length;
  const report = {
    schemaVersion: 1,
    projectPath: absolutePath,
    courseName: blueprint.courseName || graph.course?.name || '',
    studyGuideCount: rows.length,
    pairedStudyGuideCount: complete,
    missingLessons: rows.filter((row) => !row.hasHanzi || !row.hasToneMarkedPinyin).map((row) => row.lesson),
    admittedPairTermsAdded: rows.reduce((total, row) => total + row.admittedPairTerms, 0),
    rows,
  };
  console.log(JSON.stringify(report, null, 2));
  if (rows.length === 0 || complete !== rows.length) process.exitCode = 1;
}
