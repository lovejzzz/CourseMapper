import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { checkClassroomV3Evidence } from './classroomV3Checks.mjs';

const [projectPath, inputPath, annotationPath, directory] = process.argv.slice(2);
if (!directory) throw Error('Usage: node checkClassroomV3Project.mjs PROJECT INPUT ANNOTATIONS NEW_OUTPUT_DIRECTORY');
const paths = [projectPath, inputPath, annotationPath];
const bytes = await Promise.all(paths.map((p) => fs.readFile(p)));
const [project, input, annotations] = bytes.map((b) => JSON.parse(b.toString('utf8')));
const report = checkClassroomV3Evidence(project, input, annotations);
report.files = paths.map((file, i) => ({ file, sha256: createHash('sha256').update(bytes[i]).digest('hex') }));
report.checkedAt = new Date().toISOString();
report.modelCalls = 0;
report.checkerSha256 = createHash('sha256')
  .update(await fs.readFile(new URL('./classroomV3Checks.mjs', import.meta.url)))
  .digest('hex');
report.runnerSha256 = createHash('sha256')
  .update(await fs.readFile(new URL(import.meta.url)))
  .digest('hex');
report.sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
report.dirty = Boolean(execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim());
// Immutable output directories retain the first failure when checks improve.
await fs.mkdir(directory);
await fs.writeFile(path.join(directory, 'report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(
  JSON.stringify(
    { checks: report.checks.length, failures: report.failures, educationalAcceptance: report.educationalAcceptance },
    null,
    2,
  ),
);
if (report.failures.length) process.exitCode = 1;
