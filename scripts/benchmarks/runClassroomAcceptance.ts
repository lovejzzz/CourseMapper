import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import {
  buildCourseBlueprint,
  compileBlueprintDeliverables,
  BLUEPRINT_COMPILE_CONTEXT,
  reconcileCourseMapWithBlueprintSemanticAdmission,
} from '../../src/lib/courseBlueprintCompiler.js';
import { FEATURES, classroomSurface } from './classroomBenchmark.mjs';
import { evaluateAcceptanceOutputs } from './classroomAcceptance.mjs';

type AcceptedTask = { question: string; answer: string; criteria: { label: string }[]; sequence?: { kind: string }[] };
const args = process.argv.slice(2);
const value = (flag: string, fallback: string) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : fallback);
const split = value('--split', 'development');
if (!['development', 'held-out'].includes(split)) throw new Error('Choose development or held-out explicitly.');
const out = value('--out', `.audit-work/v019-2026-09-06/${split}-${Date.now()}`);
const sha = (text: string | Buffer) => createHash('sha256').update(text).digest('hex');
const directory = 'benchmarks/classroom/v2/cases';
const manifest = JSON.parse(await fs.readFile('benchmarks/classroom/v2/manifest.json', 'utf8'));
const cases = manifest.cases.filter((entry: { split: string }) => entry.split === split);
await fs.mkdir(out, { recursive: true });
const results = [];
for (const entry of cases) {
  const raw = await fs.readFile(path.join(directory, `${entry.id}.json`), 'utf8');
  if (sha(raw) !== entry.sha256) throw new Error(`Source packet changed: ${entry.id}`);
  const fixture = JSON.parse(raw);
  // Reference judgments are intentionally excluded from all generation input.
  const map = {
    courseName: fixture.request,
    lessons: [
      {
        title: fixture.request,
        sections: [
          {
            topicSection: fixture.request,
            learningObjectives: fixture.request,
            weeklyAssessments:
              fixture.language === 'zh'
                ? '根据所给材料完成具体任务，提交推理过程。'
                : 'A reasoned response using the supplied record.',
          },
        ],
      },
    ],
  };
  const sourceBrief = `${fixture.request}\n${fixture.sessionMinutes} minutes.\nSource facts:\n${fixture.sources.map((source: string, index: number) => `${index + 1}. ${source}`).join('\n')}`;
  const start = performance.now();
  const failures: string[] = [];
  let outputs: Record<string, unknown> = {};
  let tasks: AcceptedTask[] = [];
  let checks: unknown[] = [];
  try {
    const blueprint = buildCourseBlueprint(map, {
      sourceBrief,
      sessionMinutes: fixture.sessionMinutes,
      instructorProvidedFacts: fixture.sources,
    });
    const derivatives = compileBlueprintDeliverables(
      blueprint,
      FEATURES.filter((feature: string) => feature !== 'courseMap'),
    );
    const context = derivatives[BLUEPRINT_COMPILE_CONTEXT];
    outputs = { courseMap: reconcileCourseMapWithBlueprintSemanticAdmission(map, context), ...derivatives };
    tasks = context.lessons.map((lesson: { teachingTask?: AcceptedTask }) => lesson.teachingTask).filter(Boolean);
    const evaluation = evaluateAcceptanceOutputs(fixture, outputs, tasks);
    checks = evaluation.checks;
    failures.push(...evaluation.failures);
  } catch (error) {
    failures.push(`Compiler error: ${String(error)}`);
  }
  const caseOut = path.join(out, fixture.id);
  await fs.mkdir(caseOut, { recursive: true });
  const encoded = JSON.stringify(outputs, null, 2);
  await fs.writeFile(path.join(caseOut, 'outputs.json'), encoded);
  await fs.writeFile(path.join(caseOut, 'tasks.json'), JSON.stringify(tasks, null, 2));
  await fs.writeFile(path.join(caseOut, 'checks.json'), JSON.stringify(checks, null, 2));
  for (const feature of FEATURES)
    if (outputs[feature])
      await fs.writeFile(
        path.join(caseOut, `${feature}.json`),
        JSON.stringify(classroomSurface(feature, outputs[feature]), null, 2),
      );
  results.push({
    id: fixture.id,
    family: fixture.family,
    language: fixture.language,
    elapsedMs: Math.round(performance.now() - start),
    inputSha256: sha(raw),
    outputSha256: sha(encoded),
    failures,
    educationReview: 'pending',
    taskCount: tasks.length,
  });
}
const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '--', 'src/lib'], {
  encoding: 'utf8',
})
  .trim()
  .split('\n')
  .filter(Boolean)
  .sort();
const sourceHash = createHash('sha256');
for (const file of files)
  sourceHash
    .update(file)
    .update('\0')
    .update(await fs.readFile(file))
    .update('\0');
const report = {
  protocol: 'edutool-classroom-acceptance-v2',
  createdAt: new Date().toISOString(),
  split,
  modelCalls: 0,
  mode: 'source-packet compiler acceptance; not model inference or measured learning',
  head: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  compilerSourceSha256: sourceHash.digest('hex'),
  checkerSha256: sha(await fs.readFile('scripts/benchmarks/classroomAcceptance.mjs')),
  runnerSha256: sha(await fs.readFile('scripts/benchmarks/runClassroomAcceptance.ts')),
  cases: results,
  independentHumanReview: false,
  automatedFailures: results.reduce((sum, result) => sum + result.failures.length, 0),
};
await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
process.stdout.write(
  `${split}: ${results.length} cases, ${report.automatedFailures} automated defects; educational reviews pending.\n${out}/report.json\n`,
);
if (args.includes('--strict') && report.automatedFailures) process.exitCode = 1;
