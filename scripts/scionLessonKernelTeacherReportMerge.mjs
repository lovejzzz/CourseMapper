#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import {
  mergeScionLessonKernelTeacherReports,
  validateScionLessonKernelMergedTeacherReport,
} from './lib/scionLessonKernelTeacherReportMerge.mjs';

const DEFAULT_REPORTS = [
  'verification-output/scion-lesson-kernel-teacher-revision-v0.16.54/teacher-report.json',
  'verification-output/scion-lesson-kernel-teacher-revision-v2-v0.16.54/teacher-report.json',
];
const DEFAULT_OUTPUT =
  'verification-output/scion-lesson-kernel-teacher-revision-merged-v0.16.54/teacher-report.json';

function parseArgs(argv) {
  const args = { reports: [], output: DEFAULT_OUTPUT, audit: false };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--report') args.reports.push(argv[++index] || '');
    else if (token === '--output') args.output = argv[++index] || args.output;
    else if (token === '--audit') args.audit = true;
    else if (token === '--help' || token === '-h') args.help = true;
    else throw new Error(`Unknown teacher report merge option: ${token}`);
  }
  if (args.reports.length === 0) args.reports = [...DEFAULT_REPORTS];
  if (args.reports.some((entry) => !entry)) throw new Error('--report requires a file');
  return args;
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, 'utf8'));
}

async function atomicWriteJson(file, value) {
  const absolute = path.resolve(file);
  await fs.mkdir(path.dirname(absolute), { recursive: true });
  const temporary = `${absolute}.${process.pid}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`);
  await fs.rename(temporary, absolute);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log('Usage: node scripts/scionLessonKernelTeacherReportMerge.mjs [--report file ...] [--output file] [--audit]');
    return;
  }
  if (args.audit) {
    const report = await readJson(args.output);
    const validation = validateScionLessonKernelMergedTeacherReport(report);
    if (!validation.valid) throw new Error(`Merged teacher report audit failed: ${validation.issues.join(', ')}`);
    console.log(JSON.stringify(report.summary, null, 2));
    return;
  }
  const sources = await Promise.all(args.reports.map(async (file) => ({ path: file, report: await readJson(file) })));
  const report = mergeScionLessonKernelTeacherReports({ sources });
  await atomicWriteJson(args.output, report);
  console.log(JSON.stringify(report.summary, null, 2));
}

if (import.meta.url === pathToFileURL(path.resolve(process.argv[1] || '')).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
