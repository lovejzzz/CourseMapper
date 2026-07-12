#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { applyScionKernelPasses } from '../src/lib/scionPasses.js';
import { isAppliedQuizStem } from '../src/lib/quality/quizItemDepth.js';
import { assessScionPreferencePair } from '../src/lib/scionPreferenceGate.js';

const DEFAULT_PROJECT =
  'verification-output/crucible/round-2026-07-11T04-06-33-298Z/music-theory--quiet--local/project.json';
const DEFAULT_OUTPUT = 'verification-output/scion-applied-repair-probe';

function args(argv) {
  const out = { project: DEFAULT_PROJECT, lesson: 1, output: DEFAULT_OUTPUT, endpoint: 'http://127.0.0.1:8799' };
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (key === '--project') out.project = argv[++index];
    else if (key === '--lesson') out.lesson = Number(argv[++index]) || 1;
    else if (key === '--output') out.output = argv[++index] || out.output;
    else if (key === '--endpoint') out.endpoint = argv[++index] || out.endpoint;
  }
  return out;
}

function graphFrom(project) {
  if (project?.courseGraph) return project.courseGraph;
  if (typeof project?.courseGraphJson === 'string') return JSON.parse(project.courseGraphJson);
  throw new Error('Project has no CourseGraph.');
}

function compactLesson(graph, lessonNumber) {
  const lessonId = `lesson-${lessonNumber}`;
  const content = graph?.enrichmentOverlay?.lessonContent?.[lessonId];
  if (!content) throw new Error(`Project has no authored ${lessonId}.`);
  const scenario = content?.kernel?.scenario || content?.scenario || {};
  return {
    lessonId,
    mc: (content.quizItems || [])
      .filter((item) => item?.type === 'multiple_choice')
      .map((item) => ({ q: item.question, op: item.options, ai: item.answerIndex, ex: item.explanation })),
    scenario: { su: scenario.setup || scenario.su, ma: scenario.materials || scenario.ma },
    discussionPrompt: {
      pr: content?.discussionPrompt?.prompt,
      tn: content?.discussionPrompt?.tension,
      po: content?.discussionPrompt?.positions,
    },
    assignmentCore: {
      td: content?.assignmentCore?.taskDescription,
      pa: content?.assignmentCore?.parameters,
    },
    studyGuide: {
      sm: content?.studyGuide?.summary,
      rs: content?.studyGuide?.reviewStrategy || content?.studyGuide?.reviewStrategies?.join(' '),
    },
  };
}

function promptLessonFrom(graph, lessonNumber) {
  const session = (graph.sessions || []).find((entry) => Number(entry?.number) === lessonNumber) || {};
  return {
    lessonId: `lesson-${lessonNumber}`,
    title: session.title || `Lesson ${lessonNumber}`,
    topics: (session.sections || [])
      .map((section) => section?.topic)
      .filter(Boolean)
      .join('; '),
  };
}

async function localGenerateJson(endpoint, { system, user, schemaProfile, maxOutputTokens, temperature }) {
  const response = await fetch(`${endpoint.replace(/\/$/, '')}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'scion-1',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      response_format: { type: 'json_schema', json_schema: schemaProfile },
      max_tokens: maxOutputTokens || 2000,
      ...(temperature ? { temperature } : {}),
      stream: false,
    }),
  });
  if (!response.ok) throw new Error(`Local Scion returned HTTP ${response.status}: ${await response.text()}`);
  const body = await response.json();
  return body?.choices?.[0]?.message?.content || body?.choices?.[0]?.text || '';
}

function render(report) {
  const eventRows = report.events.map(
    (event) =>
      `| ${event.item ?? '—'} | ${event.action || '—'} | ${event.reason || '—'} | ${event.trainingEligible === true ? 'yes' : 'no'} |`,
  );
  return [
    '# Scion Applied-MC Repair Probe',
    '',
    `- Project: ${report.project}`,
    `- Lesson: ${report.lesson}`,
    `- Applied stems: ${report.before.applied}/${report.before.total} before → ${report.after.applied}/${report.after.total} after`,
    `- Corpus-eligible verified training pairs: ${report.verifiedPairs}`,
    '',
    '| Item | Action | Reason | Training eligible |',
    '| ---: | --- | --- | --- |',
    ...eventRows,
    '',
  ].join('\n');
}

async function main() {
  const options = args(process.argv.slice(2));
  const project = JSON.parse(await fs.readFile(options.project, 'utf8'));
  const graph = graphFrom(project);
  const lesson = compactLesson(graph, options.lesson);
  const promptLesson = promptLessonFrom(graph, options.lesson);
  const before = lesson.mc.map((item) => isAppliedQuizStem(item.q));
  const result = await applyScionKernelPasses(JSON.stringify({ lessons: [lesson] }), {
    promptLessons: [promptLesson],
    generateJson: (request) => localGenerateJson(options.endpoint, request),
    expectedMcCount: 4,
    minimumKeyTermCount: 3,
  });
  const afterLesson = JSON.parse(result.text).lessons[0];
  const after = afterLesson.mc.map((item) => isAppliedQuizStem(item.q));
  const pairAssessments = result.events
    .filter((event) => event.trainingEligible === true && event.chosen && event.rejected)
    .map((event) => ({
      pass: event.pass,
      lessonId: event.lessonId,
      item: event.item,
      result: assessScionPreferencePair({
        kind: 'mc-item',
        chosen: event.chosen,
        rejected: event.rejected,
        preferenceEvidence: event.preferenceEvidence,
      }),
    }));
  const report = {
    generatedAt: new Date().toISOString(),
    project: options.project,
    lesson: options.lesson,
    before: { total: before.length, applied: before.filter(Boolean).length },
    after: { total: after.length, applied: after.filter(Boolean).length },
    verifiedPairs: pairAssessments.filter((entry) => entry.result.eligible).length,
    pairAssessments,
    events: result.events,
    lessonAfter: afterLesson,
  };
  await fs.mkdir(options.output, { recursive: true });
  await Promise.all([
    fs.writeFile(path.join(options.output, 'latest.json'), `${JSON.stringify(report, null, 2)}\n`),
    fs.writeFile(path.join(options.output, 'latest.md'), `${render(report)}\n`),
  ]);
  console.log(
    `Applied stems: ${report.before.applied}/${report.before.total} -> ${report.after.applied}/${report.after.total}`,
  );
  console.log(`Verified training pairs: ${report.verifiedPairs}`);
  console.log(`Report: ${path.resolve(options.output, 'latest.md')}`);
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exitCode = 1;
});
