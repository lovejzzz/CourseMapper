#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { buildBlueprintFromGraph } from '../src/lib/courseGraph/blueprintFromGraph.js';
import { compileBlueprintDeliverables } from '../src/lib/courseBlueprintCompiler.js';

const BROKEN_DETERMINER_PROMPT_RE = /\bname one (?:the|a|an|this|that|these|those)\b/i;
const BROKEN_SOURCE_DETAIL_PROMPT_RE =
  /\bname one (?:the|a|an|this|that|these|those)\b[^.]{0,160}\bsource detail\b/i;

function valueAfter(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : '';
}

function collectBrokenPrompts(value, currentPath = '$', findings = [], pattern = BROKEN_DETERMINER_PROMPT_RE) {
  if (typeof value === 'string') {
    if (pattern.test(value)) findings.push({ path: currentPath, value });
    return findings;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectBrokenPrompts(item, `${currentPath}[${index}]`, findings, pattern));
    return findings;
  }
  if (value && typeof value === 'object') {
    Object.entries(value).forEach(([key, item]) => collectBrokenPrompts(item, `${currentPath}.${key}`, findings, pattern));
  }
  return findings;
}

function uniqueFindings(findings) {
  const seen = new Set();
  return findings.filter((finding) => {
    const match = finding.value.match(BROKEN_SOURCE_DETAIL_PROMPT_RE)?.[0] || finding.value;
    const key = match.toLowerCase().replace(/\s+/g, ' ').trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const projectPath = valueAfter('--project') || process.argv[2];
if (!projectPath) {
  console.error('Usage: node scripts/scionSlideFeedbackReplay.mjs --project /path/to/project.json');
  process.exitCode = 2;
} else {
  const absolutePath = path.resolve(projectPath);
  const project = JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
  const graph =
    typeof project.courseGraphJson === 'string' ? JSON.parse(project.courseGraphJson) : project.courseGraphJson;
  if (!graph || typeof graph !== 'object') throw new Error('Project does not contain a usable courseGraphJson value.');

  const blueprint = buildBlueprintFromGraph(graph);
  const compiled = compileBlueprintDeliverables(blueprint, ['slideDecks']);
  const decks = Array.isArray(compiled?.slideDecks?.decks) ? compiled.slideDecks.decks : [];
  const defects = collectBrokenPrompts(decks);
  const sourceReportPath = path.join(path.dirname(absolutePath), 'report.json');
  const sourceArtifactDefects = fs.existsSync(sourceReportPath)
    ? uniqueFindings(
        collectBrokenPrompts(JSON.parse(fs.readFileSync(sourceReportPath, 'utf8')), '$', [], BROKEN_SOURCE_DETAIL_PROMPT_RE),
      )
    : [];
  const report = {
    schemaVersion: 1,
    projectPath: absolutePath,
    courseName: blueprint.courseName || graph.course?.name || '',
    slideDeckCount: decks.length,
    sourceArtifactBrokenPromptCount: sourceArtifactDefects.length,
    sourceArtifactDefects,
    brokenDeterminerPromptCount: defects.length,
    defects,
  };
  console.log(JSON.stringify(report, null, 2));
  if (decks.length === 0 || defects.length > 0) process.exitCode = 1;
}
