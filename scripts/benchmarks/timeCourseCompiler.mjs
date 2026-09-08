// Serial warm compiler timing for an actual saved course. No browser timing
// or model performance is inferred from this receipt.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { setImmediate } from 'node:timers/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import {
  buildCourseBlueprint,
  compileBlueprintDeliverables,
  BLUEPRINT_COMPILE_CONTEXT,
} from '../../src/lib/courseBlueprintCompiler.js';
import { readTeachingTaskSources } from '../../src/lib/teachingProgram.js';

const [input, output] = process.argv.slice(2);
assert(input && output, 'Provide a course capture and a new timing directory.');
const bytes = await fs.readFile(input);
const project = JSON.parse(bytes);
const features = Object.keys(project.deliverables);
const sources = readTeachingTaskSources(project.courseMap);
assert.equal(sources.length, 6);
await fs.mkdir(output, { recursive: false });
function compile() {
  const begin = performance.now();
  const blueprint = buildCourseBlueprint(project.courseMap, { sourceBrief: project.promptText, sessionMinutes: 50 });
  const built = performance.now();
  const materials = compileBlueprintDeliverables(blueprint, features);
  const end = performance.now();
  // Assertions inspect the prepared compiler context, not the unhydrated input blueprint.
  const compiledLessons = materials[BLUEPRINT_COMPILE_CONTEXT].lessons;
  // Assertions are outside the measured compiler interval.
  assert.equal(compiledLessons.filter((lesson) => lesson.teachingTask).length, 6);
  assert.deepEqual(
    compiledLessons.map((lesson) => lesson.teachingTask.id),
    sources.map((source) => source.id),
  );
  assert(features.every((feature) => materials[feature] && typeof materials[feature] === 'object'));
  return { blueprintMs: built - begin, projectionMs: end - built, totalMs: end - begin };
}
const cold = compile();
const runs = [];
for (let index = 0; index < 30; index++) {
  await setImmediate();
  runs.push({ iteration: index + 1, ...compile() });
  if ((index + 1) % 5 === 0) console.log(`Completed ${index + 1}/30 serial compiler samples`);
}
const sorted = runs.map((row) => row.totalMs).sort((a, b) => a - b);
const p95 = sorted[Math.ceil(sorted.length * 0.95) - 1];
const median = (sorted[14] + sorted[15]) / 2;
const report = {
  recordedAt: new Date().toISOString(),
  projectSha256: createHash('sha256').update(bytes).digest('hex'),
  scope: 'one explicit six-lesson development course; compiler only, not browser, exports or Scion inference',
  environment: {
    platform: process.platform,
    architecture: process.arch,
    node: process.version,
    cpu: os.cpus()[0]?.model,
    cpuCount: os.cpus().length,
    totalMemoryBytes: os.totalmem(),
  },
  lessons: 6,
  features,
  modelCalls: 0,
  concurrency: 1,
  cold,
  runs,
  warmP95Ms: p95,
  warmMedianMs: median,
  underFiveSecondP95: p95 <= 5000,
};
await fs.writeFile(path.join(output, 'timing.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ warmP95Ms: p95, warmMedianMs: median, underFiveSecondP95: p95 <= 5000 }));
