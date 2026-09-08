// Read only product inputs. No references, teacher confirmations, model calls,
// or ten-material acceptance scores are involved in this deterministic probe.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { buildSharedTeachingTask } from '../../src/lib/compilerTeachingTask.js';
import { sourceRelationIntent } from '../../src/lib/teachingTaskSourceRelations.js';
import { TEACHING_OPERATION_SPECS } from '../../src/lib/teachingOperationPlan.js';
const [inputDirectory, outputDirectory] = process.argv.slice(2);
assert(inputDirectory && outputDirectory, 'Provide an input-only directory and a new output directory.');
await fs.mkdir(outputDirectory, { recursive: false });
const rows = [];
for (const name of (await fs.readdir(inputDirectory)).filter((name) => name.endsWith('.json')).sort()) {
  const bytes = await fs.readFile(path.join(inputDirectory, name));
  const input = JSON.parse(bytes);
  const started = performance.now();
  let task = null,
    error = null;
  try {
    // admitted:true isolates the task builder under assumed prior admission;
    // this does NOT invoke or claim actual product admission or approval.
    task = buildSharedTeachingTask({
      lessonId: name.slice(0, -5),
      objective: input.objective,
      claims: input.sources.map((source) => source.text),
      admitted: true,
    });
  } catch (caught) {
    error = caught.message;
  }
  const outputName = name.replace('.json', '.task.json');
  await fs.writeFile(path.join(outputDirectory, outputName), JSON.stringify({ task, error }, null, 2));
  rows.push({
    id: name.slice(0, -5),
    inputSha256: createHash('sha256').update(bytes).digest('hex'),
    sourceIntent: sourceRelationIntent(input.objective),
    producedTask: Boolean(task),
    kind: task?.kind ?? null,
    durationMs: performance.now() - started,
    error,
    outputName,
  });
}
const report = {
  mode: 'deterministic task builder under assumed admission only',
  productAdmissionExecuted: false,
  modelCalls: 0,
  referenceFilesRead: 0,
  completePipelineRuns: 0,
  explicitOperations: Object.keys(TEACHING_OPERATION_SPECS),
  rows,
  limitation:
    'A null task is a builder coverage observation, not an end-to-end failure or correct refusal. A produced task still requires correctness, alignment, all-material and actual model review.',
};
await fs.writeFile(path.join(outputDirectory, 'probe.json'), JSON.stringify(report, null, 2) + '\n');
console.log(
  JSON.stringify(
    rows.map(({ id, sourceIntent, producedTask, kind, error }) => ({ id, sourceIntent, producedTask, kind, error })),
    null,
    2,
  ),
);
