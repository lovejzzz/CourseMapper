import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { execFileSync } from 'node:child_process';
import {
  buildCourseBlueprint,
  compileBlueprintDeliverables,
  BLUEPRINT_COMPILE_CONTEXT,
  reconcileCourseMapWithBlueprintSemanticAdmission,
} from '../../src/lib/courseBlueprintCompiler.js';
import { completeNativeKernelSurfaces } from '../../src/lib/nativeGraphAuthoring.js';
import { extractInstructorProvidedFacts } from '../../src/lib/sourceBriefConstraints.js';
import { FEATURES, classroomSurface, evaluateClassroomOutputs } from './classroomBenchmark.mjs';

const args = process.argv.slice(2);
const outputDir =
  args[args.indexOf('--out') + 1] && args.includes('--out')
    ? args[args.indexOf('--out') + 1]
    : '.audit-work/classroom-benchmark/latest';
const casesDir = 'benchmarks/classroom/v1/cases';
const regrade = args.includes('--regrade');
await fs.mkdir(outputDir, { recursive: true });
const priorReport = regrade ? JSON.parse(await fs.readFile(path.join(outputDir, 'report.json'), 'utf8')) : null;
const sha256 = (raw) => createHash('sha256').update(raw).digest('hex');
// Hash file contents as well as the Git diff: new, untracked compiler modules
// must be represented in an in-progress replay receipt.
const compilerFiles = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '--', 'src/lib'], {
  encoding: 'utf8',
})
  .trim()
  .split('\n')
  .filter(Boolean)
  .sort();
const compilerSource = createHash('sha256');
if (!regrade)
  for (const file of compilerFiles) {
    compilerSource
      .update(file)
      .update('\0')
      .update(await fs.readFile(file))
      .update('\0');
  }
const report = {
  protocol: 'edutool-classroom-output-benchmark-v1',
  createdAt: new Date().toISOString(),
  modelCalls: 0,
  mode: regrade ? 'regrade saved outputs without regeneration' : 'frozen-kernel compiler replay',
  compilerRevision: regrade
    ? (priorReport?.compilerRevision ?? null)
    : execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  compilerDiffSha256: regrade
    ? (priorReport?.compilerDiffSha256 ?? null)
    : sha256(execFileSync('git', ['diff', 'HEAD', '--', 'src/lib'])),
  compilerSourceSha256: regrade ? (priorReport?.compilerSourceSha256 ?? null) : compilerSource.digest('hex'),
  courseMapMode: regrade
    ? (priorReport?.courseMapMode ?? 'captured input')
    : 'reconciled from frozen input using the production compiler',
  referenceTasksSha256: sha256(await fs.readFile('benchmarks/classroom/v1/reference-tasks.json')),
  checkerSha256: sha256(await fs.readFile('scripts/benchmarks/classroomBenchmark.mjs')),
  cases: [],
  corpusSha256: '',
};
const corpus = createHash('sha256');
for (const file of (await fs.readdir(casesDir)).filter((f) => f.endsWith('.json')).sort()) {
  const raw = await fs.readFile(path.join(casesDir, file), 'utf8');
  corpus.update(file).update(raw);
  const fixture = JSON.parse(raw);
  const lessonContent = structuredClone(fixture.lessonContent);
  type KernelPayload = Parameters<typeof completeNativeKernelSurfaces>[0];
  for (const [id, payload] of Object.entries(lessonContent) as [string, KernelPayload][]) {
    if (regrade) break;
    // Re-run only explicitly compiler-owned surface fallbacks, never rewrite
    // the captured model's authored content or admitted fact ledger.
    for (const field of payload.surfaceFallbacks || []) delete payload[field];
    const index = Number(id.replace('lesson-', '')) - 1;
    lessonContent[id] = completeNativeKernelSurfaces(payload, fixture.map.lessons[index]);
  }
  const start = performance.now();
  const blueprint = regrade
    ? null
    : buildCourseBlueprint(fixture.map, {
        sourceBrief: fixture.sourceBrief,
        sessionMinutes: fixture.sessionMinutes,
        instructorProvidedFacts: extractInstructorProvidedFacts(fixture.sourceBrief),
        enrichment: { lessonContent },
      });
  const derivatives = regrade
    ? null
    : compileBlueprintDeliverables(
        blueprint,
        FEATURES.filter((f) => f !== 'courseMap'),
      );
  const outputs = regrade
    ? JSON.parse(await fs.readFile(path.join(outputDir, fixture.id, 'outputs.json'), 'utf8'))
    : {
        courseMap: reconcileCourseMapWithBlueprintSemanticAdmission(
          fixture.map,
          derivatives[BLUEPRINT_COMPILE_CONTEXT],
        ),
        ...derivatives,
      };
  const result = {
    ...evaluateClassroomOutputs(fixture, outputs),
    elapsedMs: regrade
      ? (priorReport.cases.find((c) => c.caseId === fixture.id)?.elapsedMs ?? null)
      : Math.round(performance.now() - start),
    outputsSha256: sha256(JSON.stringify(outputs)),
    inputProvenance: fixture.provenance,
  };
  report.cases.push(result);
  await fs.mkdir(path.join(outputDir, fixture.id), { recursive: true });
  await fs.writeFile(path.join(outputDir, fixture.id, 'outputs.json'), JSON.stringify(outputs, null, 2));
  for (const feature of FEATURES)
    await fs.writeFile(
      path.join(outputDir, fixture.id, `${feature}.json`),
      JSON.stringify(classroomSurface(feature, outputs[feature]), null, 2),
    );
}
report.corpusSha256 = corpus.digest('hex');
await fs.writeFile(path.join(outputDir, 'report.json'), JSON.stringify(report, null, 2));
const table = [
  '# Classroom output defect probes',
  '',
  'These counts are not educational quality scores. See the separately completed review rubric.',
  '',
  '| Case | Material | Passed checks | Failed checks | Critical failures |',
  '|---|---|---:|---:|---:|',
];
for (const c of report.cases)
  for (const s of c.summary) table.push(`| ${c.caseId} | ${s.feature} | ${s.passed} | ${s.failed} | ${s.critical} |`);
await fs.writeFile(path.join(outputDir, 'report.md'), table.join('\n') + '\n');
console.log(
  JSON.stringify(
    {
      outputDir,
      corpusSha256: report.corpusSha256,
      cases: report.cases.map((c) => ({
        id: c.caseId,
        elapsedMs: c.elapsedMs,
        checks: c.checks.length,
        failed: c.checks.filter((x) => x.status === 'fail').length,
        critical: c.checks.filter((x) => x.status === 'fail' && x.severity === 'critical').length,
      })),
    },
    null,
    2,
  ),
);
if (args.includes('--strict') && report.cases.some((c) => c.checks.some((x) => x.status === 'fail')))
  process.exitCode = 1;
