// Run with vite-node. Development inputs only; serial, no Scion or reference injection.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
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
import { compilerArguments, inspectCapture, productInput } from './classroomV3Probe.mjs';
import { verifyFrozenCorpus } from './verifyClassroomV3Freeze.mjs';

const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== '--out') throw new Error('Use --out NEW_DIRECTORY. Only development inputs run.');
const root = 'benchmarks/classroom/v3';
const output = args[1];
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const frozen = await verifyFrozenCorpus(root);
if (!frozen.frozen) throw new Error(frozen.errors.join('\n'));
const manifest = JSON.parse(await fs.readFile(path.join(root, 'manifest.json')));
const cases = manifest.cases.filter((entry) => entry.split === 'development');
// Never replace an earlier run; completed cases survive interruption.
await fs.mkdir(output, { recursive: false });
const git = (...argv) => execFileSync('git', argv, { encoding: 'utf8' }).trim();
const sourceFiles = git('ls-files', '--cached', '--others', '--exclude-standard', '--', 'src/lib', 'scripts/benchmarks')
  .split('\n')
  .filter(Boolean)
  .sort();
const codeDigest = createHash('sha256');
for (const file of sourceFiles)
  codeDigest
    .update(file)
    .update('\0')
    .update(await fs.readFile(file))
    .update('\0');
const report = {
  mode: 'source-only compiler diagnostic; not Scion, reviewed-structure, or complete natural-language acceptance',
  createdAt: new Date().toISOString(),
  head: git('rev-parse', 'HEAD'),
  workingTreeDirty: Boolean(git('status', '--porcelain')),
  sourceSha256: codeDigest.digest('hex'),
  manifestSha256: frozen.manifestSha256,
  protocolSha256: sha(await fs.readFile(path.join(root, 'PROTOCOL.zh-CN.md'))),
  runnerSha256: sha(await fs.readFile('scripts/benchmarks/probeClassroomV3Compiler.mjs')),
  checkerSha256: sha(await fs.readFile('scripts/benchmarks/classroomV3Probe.mjs')),
  device: { platform: os.platform(), arch: os.arch(), cpu: os.cpus()[0]?.model, memoryBytes: os.totalmem() },
  serial: true,
  modelCalls: 0,
  model: null,
  split: 'development',
  inputPreparation:
    'One lesson, original objective and request; verbatim source texts and IDs. No reviewed bindings or reference answers.',
  independentHumanReview: false,
  educationalAcceptance: 'pending',
  protocolCompletion: 'not-measured',
  plannedBaseCases: cases.length,
  status: 'running',
  cases: [],
};
const save = () => fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
await save();
for (const entry of cases) {
  const bytes = await fs.readFile(path.join(root, 'inputs', `${entry.id}.json`));
  if (sha(bytes) !== entry.inputSha256) throw new Error(`Frozen input changed: ${entry.id}`);
  const input = productInput(JSON.parse(bytes));
  const { map, options } = compilerArguments(input);
  const start = performance.now();
  let outputs = {},
    tasks = [],
    error = null;
  try {
    const blueprint = buildCourseBlueprint(map, options);
    const derivatives = compileBlueprintDeliverables(
      blueprint,
      FEATURES.filter((id) => id !== 'courseMap'),
    );
    const context = derivatives[BLUEPRINT_COMPILE_CONTEXT];
    tasks = (context?.lessons || []).map((lesson) => lesson.teachingTask).filter(Boolean);
    outputs = { courseMap: reconcileCourseMapWithBlueprintSemanticAdmission(map, context), ...derivatives };
  } catch (caught) {
    error = String(caught?.stack || caught);
  }
  const compilerMs = performance.now() - start;
  const capture = { input, compilerInput: { map, options }, outputs, tasks, error };
  const encoded = JSON.stringify(capture, null, 2);
  const folder = path.join(output, entry.id);
  await fs.mkdir(folder);
  await fs.writeFile(path.join(folder, 'capture.json'), encoded, { flag: 'wx' });
  for (const feature of FEATURES)
    await fs.writeFile(
      path.join(folder, `${feature}.json`),
      JSON.stringify(classroomSurface(feature, outputs[feature]), null, 2),
      { flag: 'wx' },
    );
  report.cases.push({
    id: entry.id,
    family: entry.family,
    language: entry.language,
    scope: entry.scope,
    inputSha256: entry.inputSha256,
    captureSha256: sha(encoded),
    compilerMs,
    modelCalls: 0,
    ...inspectCapture({ outputs, tasks, error }),
  });
  await save();
}
report.status = 'captured';
report.summary = Object.fromEntries(
  ['quantity', 'source', 'experiment'].map((family) => {
    const rows = report.cases.filter((entry) => entry.family === family);
    return [
      family,
      {
        captured: rows.length,
        supportedDenominator: rows.filter((r) => r.scope === 'supported').length,
        sharedTasksFormed: rows.filter((r) => r.taskCount > 0).length,
        supportedWithoutSharedTask: rows.filter((r) => r.scope === 'supported' && !r.taskCount).map((r) => r.id),
        structuralFailures: rows.reduce((sum, r) => sum + r.failures.length, 0),
        acceptance: 'pending',
      },
    ];
  }),
);
await save();
console.log(JSON.stringify({ report: path.join(output, 'report.json'), summary: report.summary }, null, 2));
