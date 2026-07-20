#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { assessProjectedKernelCoverage, buildQuizItemPlan } from '../src/lib/blueprintEnrichmentPass.js';
import { completeNativeKernelSurfaces, parseNativePassBResponse } from '../src/lib/nativeGraphAuthoring.js';
import {
  assessPublicScionKernelResponse,
  extractPublicScionKernelLessons,
  publicScionFactContractIssues,
} from '../src/lib/publicScionProvider.js';
import { applyScionKernelPasses } from '../src/lib/scionPasses.js';

function parseArgs(argv) {
  const values = { logs: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--log') values.logs.push(path.resolve(argv[++index]));
    else if (arg === '--output') values.output = path.resolve(argv[++index]);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (values.logs.length === 0) throw new Error('At least one --log <body-log.jsonl> is required');
  return values;
}

function readJsonLines(file) {
  return fs
    .readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(`${file}:${index + 1}: ${error.message}`);
      }
    });
}

function courseName(userPrompt) {
  return (
    String(userPrompt || '')
      .match(/^COURSE:\s*(.+)$/im)?.[1]
      ?.trim() || 'Unknown course'
  );
}

function extractJsonArrayAfter(text, marker) {
  const start = String(text || '').indexOf(marker);
  if (start < 0) return [];
  const source = String(text).slice(start + marker.length);
  const arrayStart = source.indexOf('[');
  if (arrayStart < 0) return [];
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let index = arrayStart; index < source.length; index += 1) {
    const char = source[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') quoted = false;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === '[') depth += 1;
    else if (char === ']') {
      depth -= 1;
      if (depth === 0) {
        try {
          const parsed = JSON.parse(source.slice(arrayStart, index + 1));
          return Array.isArray(parsed) ? parsed : [];
        } catch {
          return [];
        }
      }
    }
  }
  return [];
}

function extractLoggedLessons(userPrompt) {
  const productionLessons = extractPublicScionKernelLessons(userPrompt);
  if (productionLessons.length > 0) return productionLessons;
  return extractJsonArrayAfter(userPrompt, 'LESSONS TO AUTHOR:');
}

function projectedCoverage(text, prompt, expectedLessonIds) {
  const projected = parseNativePassBResponse(text, { prompt, expectedLessonIds });
  const rawCoverage = Object.fromEntries(
    Object.entries(projected.kernels).map(([lessonId, payload]) => [lessonId, assessProjectedKernelCoverage(payload)]),
  );
  const coverage = Object.fromEntries(
    Object.entries(projected.kernels).map(([lessonId, payload]) => {
      const lesson = prompt.lessons.find((entry) => entry.lessonId === lessonId) || {};
      const completed = completeNativeKernelSurfaces(payload, {
        title: lesson.title,
        sections: [
          {
            topicSection: lesson.topics,
            learningObjectives: lesson.objectives,
          },
        ],
      });
      return [lessonId, assessProjectedKernelCoverage(completed)];
    }),
  );
  return { projected, rawCoverage, coverage };
}

function summarizeCall(row, callIndex) {
  const userPrompt = String(row?.user || '');
  const originalUserPrompt = String(row?.originalCompilerUser || '');
  const contractPrompt = originalUserPrompt || userPrompt;
  const lessons = extractLoggedLessons(contractPrompt || userPrompt);
  const expectedLessonIds = lessons.map((lesson) => lesson.lessonId).filter(Boolean);
  const name = courseName(contractPrompt || userPrompt);
  const assessmentPrompt =
    extractPublicScionKernelLessons(contractPrompt).length > 0
      ? contractPrompt
      : `Course: ${name}\nLessons:\n${JSON.stringify(lessons)}\nReturn ONLY valid JSON matching the kernel shape from the instructions.`;
  const prompt = {
    courseName: name,
    lessons,
    itemPlan: buildQuizItemPlan(6),
    systemPrompt: String(row?.system || ''),
    userPrompt: assessmentPrompt,
  };
  const publicAdmission = assessPublicScionKernelResponse(
    String(row?.response || ''),
    assessmentPrompt,
    'blueprintEnrichment',
  );
  const { projected, rawCoverage, coverage } = projectedCoverage(
    String(row?.response || ''),
    prompt,
    expectedLessonIds,
  );
  return {
    callIndex,
    courseName: prompt.courseName,
    taskFamily: row?.adapterRoute?.taskFamily || null,
    routeMode: row?.adapterRoute?.mode || row?.adapterRoute?.routeMode || null,
    expectedLessonIds,
    returnedKernelIds: Object.keys(projected.kernels),
    usableKernelIds: Object.entries(coverage)
      .filter(([, value]) => value.usable)
      .map(([lessonId]) => lessonId),
    coverage,
    rawCoverage,
    publicAdmission: {
      needsRetry: publicAdmission.needsRetry,
      factIssues: publicScionFactContractIssues(publicAdmission),
      issues: publicAdmission.issues || [],
    },
    projectionIssues: projected.issues,
  };
}

function repairQueuesForRows(rows) {
  const courseNames = [
    ...new Set(
      rows
        .filter((row) => row?.adapterRoute?.taskFamily === 'lesson-kernel-synthesis')
        .map((row) => courseName(row?.originalCompilerUser || row?.user))
        .filter((name) => name !== 'Unknown course'),
    ),
  ].sort((left, right) => right.length - left.length);
  const queues = new Map();
  let lastKey = '';
  for (const row of rows) {
    const family = row?.adapterRoute?.taskFamily;
    const text = String(row?.originalCompilerUser || row?.user || '');
    const lessonId = text.match(/"lessonId"\s*:\s*"(lesson-\d+)"/)?.[1] || '';
    const course = courseNames.find((name) => text.includes(name)) || '';
    if (family === 'lesson-kernel-synthesis' && lessonId && course) {
      lastKey = `${course}\u0000${lessonId}`;
      continue;
    }
    if (family !== 'compiler-repair') continue;
    const key = course && lessonId ? `${course}\u0000${lessonId}` : lastKey;
    if (!key) continue;
    const queue = queues.get(key) || [];
    queue.push(String(row?.response || ''));
    queues.set(key, queue);
    lastKey = key;
  }
  return queues;
}

async function replayBaseCalls(rows) {
  const repairQueues = repairQueuesForRows(rows);
  const results = [];
  for (const row of rows) {
    if (row?.adapterRoute?.taskFamily !== 'lesson-kernel-synthesis') continue;
    if ((row?.adapterRoute?.mode || row?.adapterRoute?.routeMode) !== 'base-only') continue;
    const userPrompt = String(row?.originalCompilerUser || row?.user || '');
    const lessons = extractLoggedLessons(userPrompt);
    if (lessons.length !== 1) continue;
    const name = courseName(userPrompt);
    const lessonId = lessons[0].lessonId;
    const key = `${name}\u0000${lessonId}`;
    const queue = repairQueues.get(key) || [];
    let repairCalls = 0;
    const outcome = await applyScionKernelPasses(String(row?.response || ''), {
      promptLessons: lessons,
      courseName: name,
      expectedMcCount: 2,
      minimumKeyTermCount: 3,
      verifyDraftMcWithSameModel: false,
      verifyRepairMcWithSameModel: false,
      maxAdmissionRepairsPerCall: 1,
      generateJson: async () => {
        const response = queue.shift();
        if (response === undefined) throw new Error(`No captured compiler response remains for ${name}/${lessonId}`);
        repairCalls += 1;
        return response;
      },
    });
    const assessmentPrompt = `Course: ${name}\nLessons:\n${JSON.stringify(lessons)}\nReturn ONLY valid JSON matching the kernel shape from the instructions.`;
    const prompt = {
      courseName: name,
      lessons,
      itemPlan: buildQuizItemPlan(6),
      systemPrompt: String(row?.system || ''),
      userPrompt: assessmentPrompt,
    };
    const { projected, coverage } = projectedCoverage(outcome.text, prompt, [lessonId]);
    results.push({
      courseName: name,
      lessonId,
      repairCalls,
      returnedKernelIds: Object.keys(projected.kernels),
      usable: Boolean(coverage[lessonId]?.usable),
      coverage: coverage[lessonId] || null,
      projectionIssues: projected.issues,
      passEvents: outcome.events,
    });
  }
  return results;
}

async function summarizeLog(file) {
  const rows = readJsonLines(file);
  const calls = rows
    .filter((row) =>
      ['lesson-kernel-synthesis', 'source-grounded-lesson-kernel'].includes(row?.adapterRoute?.taskFamily),
    )
    .map((row, index) => summarizeCall(row, index + 1));
  return {
    file,
    rowCount: rows.length,
    kernelCallCount: calls.length,
    calls,
    basePassReplay: await replayBaseCalls(rows),
  };
}

const args = parseArgs(process.argv.slice(2));
const report = {
  protocol: 'scion-matched-kernel-autopsy-v1',
  generatedAt: new Date().toISOString(),
  logs: await Promise.all(args.logs.map(summarizeLog)),
};

const output = `${JSON.stringify(report, null, 2)}\n`;
if (args.output) {
  fs.mkdirSync(path.dirname(args.output), { recursive: true });
  fs.writeFileSync(args.output, output);
  process.stdout.write(`Wrote ${args.output}\n`);
} else {
  process.stdout.write(output);
}
