import { createServer } from 'vite';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
const output = path.resolve(process.argv[2] ?? '.audit-work/rebuild-2026-09-05/baseline');
const selected = process.argv.slice(3);
const controller = new AbortController();
process.once('SIGINT', () => controller.abort());
process.once('SIGTERM', () => controller.abort());
await fs.mkdir(output, { recursive: true });
const sources = {};
for (const file of [
  'src/studio/engine.ts',
  'src/studio/domain.ts',
  'src/studio/scion.ts',
  'src/studio/verify.ts',
  'src/studio/evidence.ts',
  'src/studio/context.ts',
  'src/studio/answer.ts',
  'src/studio/material.ts',
  'src/studio/pedagogy.ts',
  'server/scion/google.ts',
  'server/scion/worker.ts',
  'server/scion/request.ts',
  'server/scion/wrangler.jsonc',
  'server/scion/regions.ts',
  'scripts/studio/fixtures.ts',
]) {
  const bytes = await fs.readFile(file);
  sources[file] = createHash('sha256').update(bytes).digest('hex');
}
await fs.writeFile(
  path.join(output, `execution-${Date.now()}.json`),
  JSON.stringify({ startedAt: new Date().toISOString(), sources }, null, 2),
);
const server = await createServer({
  configFile: false,
  server: { middlewareMode: true, watch: null, hmr: false, ws: false },
  logLevel: 'error',
});
try {
  const { fixtures, fixtureCourse } = await server.ssrLoadModule('/scripts/studio/fixtures.ts');
  const { buildCourse, PROMPT_VERSION } = await server.ssrLoadModule('/src/studio/engine.ts');
  const { serverInference, completionParams } = await server.ssrLoadModule('/src/studio/scion.ts');
  const { renderCourseHtml, renderCourseDocx, courseBlocks } = await server.ssrLoadModule('/src/studio/export.ts');
  const { auditCourse } = await server.ssrLoadModule('/src/studio/verify.ts');
  const { CourseSchema } = await server.ssrLoadModule('/src/studio/domain.ts');
  for (const fixture of fixtures.filter((f) => !selected.length || selected.includes(f.id))) {
    if (controller.signal.aborted) break;
    const filename = path.join(output, `${fixture.id}.json`);
    let course = fixtureCourse(fixture.id);
    try {
      course = CourseSchema.parse(JSON.parse(await fs.readFile(filename, 'utf8')));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    console.log(`${fixture.id}: ${PROMPT_VERSION}`);
    try {
      course = await buildCourse(course, {
        signal: controller.signal,
        inference: process.env.SCION_DIRECT_UPSTREAM
          ? {
              async complete(request, signal) {
                const start = Date.now();
                const model = process.env.SCION_CANDIDATE_MODEL;
                if (!model) throw new Error('Direct experiments must specify SCION_CANDIDATE_MODEL.');
                const response = await fetch(new URL('/v1/chat/completions', process.env.SCION_DIRECT_UPSTREAM), {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ ...completionParams(request), model }),
                  signal,
                });
                const result = await response.json();
                if (!response.ok || result.model !== model)
                  throw new Error('Direct experiment model is unavailable or does not match its declared identity.');
                const choice = result.choices[0];
                return {
                  text: choice.message.content,
                  finishReason: choice.finish_reason,
                  inputTokens: result.usage.prompt_tokens,
                  outputTokens: result.usage.completion_tokens,
                  elapsedMs: Date.now() - start,
                  model: result.model,
                  route: 'server',
                };
              },
            }
          : serverInference(
              process.env.SCION_ENDPOINT ?? 'http://127.0.0.1:8080/api/scion',
              process.env.SCION_ORIGIN ? { Origin: process.env.SCION_ORIGIN } : {},
              (message) => console.log(`${fixture.id}: ${message}`),
            ),
        async checkpoint(next) {
          course = next;
          await fs.writeFile(filename + '.tmp', JSON.stringify(next, null, 2));
          await fs.rename(filename + '.tmp', filename);
        },
        onProgress(message) {
          console.log(`${fixture.id}: ${message}`);
        },
      });
      for (const audience of ['student', 'teacher']) {
        await fs.writeFile(
          path.join(output, `${fixture.id}-${audience}.docx`),
          await renderCourseDocx(course, audience),
        );
        await fs.writeFile(path.join(output, `${fixture.id}-${audience}.html`), renderCourseHtml(course, audience));
        await fs.writeFile(
          path.join(output, `${fixture.id}-${audience}.txt`),
          courseBlocks(course, audience)
            .map((b) => b.text)
            .join('\n\n'),
        );
      }
      console.log(
        `${fixture.id}: COMPLETE ${Object.keys(course.lessons).length} lessons; ${course.runs.length} model response receipts; ${auditCourse(course).length} review items`,
      );
    } catch (error) {
      process.exitCode = 1;
      console.log(`${fixture.id}: FAILED ${error.message}`);
      await fs.writeFile(path.join(output, `${fixture.id}-error.txt`), error.stack);
    }
  }
} finally {
  await server.close();
}
