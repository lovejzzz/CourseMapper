/**
 * scripts/prof/_twinRunner.mjs — the twin's per-ref compile step. twinCompile
 * COPIES this file into a git worktree at the ref under test and runs it with
 * vite-node from inside that worktree, so every `src/` import below resolves
 * to THAT ref's compiler. Do not import anything from scripts/prof here —
 * older refs may not have it.
 *
 * In: a captured generation (project.json from a crucible round — course map
 * + CourseGraph with enrichment overlay baked in). Out: a Prof pre-extracted
 * fixture (Artifact Bridge .json) built through the real exporters and the
 * grader's own extraction — export-shaped text, same as every other arena.
 *
 * Mirrors src/lib/projectRestoreCompiler.js: compile FROM the saved graph
 * (enrichment included); bare-map compile would silently drop the overlay.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const worktreeRoot = path.resolve(moduleDir, '..', '..');

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--project') args.project = String(argv[++index]);
    if (argv[index] === '--out') args.out = String(argv[++index]);
    if (argv[index] === '--generation-id') args.generationId = String(argv[++index]);
    if (argv[index] === '--ref') args.ref = String(argv[++index]);
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.project || !args.out) throw new Error('Usage: _twinRunner --project <project.json> --out <fixture.json>');

  const saved = JSON.parse(await fs.readFile(args.project, 'utf8'));
  if (!saved.courseMap || !Array.isArray(saved.courseMap.lessons)) throw new Error('project.json has no courseMap.');
  const graph = saved.courseGraph || (saved.courseGraphJson ? JSON.parse(saved.courseGraphJson) : null);
  const projectDir = path.dirname(args.project);
  const readJsonIfPresent = async (candidate) => {
    try {
      return JSON.parse(await fs.readFile(candidate, 'utf8'));
    } catch {
      return null;
    }
  };
  // Crucible captures these beside project.json. Reusing their disclosure
  // lets a compiler twin receive the same manifest/honesty checks as the
  // original browser download without another provider call.
  const [capturedManifest, capturedDigest, capturedCourse] = await Promise.all([
    readJsonIfPresent(path.join(projectDir, 'extracted', 'PACKAGE_MANIFEST.json')),
    readJsonIfPresent(path.join(projectDir, 'digest.json')),
    readJsonIfPresent(path.join(projectDir, 'course.json')),
  ]);

  const {
    buildCourseBlueprint,
    compactBlueprintForStorage,
    compileBlueprintDeliverables,
    getBlueprintCompiledFeatures,
  } = await import(path.join(worktreeRoot, 'src/lib/courseBlueprintCompiler.js'));

  const selected = (
    saved.deliverableFeatureIds?.length ? saved.deliverableFeatureIds : saved.selectedFeatures || []
  ).filter((featureId) => featureId && featureId !== 'courseMap');
  const featureIds = getBlueprintCompiledFeatures(selected);
  if (featureIds.length === 0) throw new Error('No compilable features in the captured project.');
  const configMap = Object.fromEntries(featureIds.map((id) => [id, saved.deliverableConfig?.[id] || {}]));

  let blueprint = null;
  if (graph && Array.isArray(graph.sessions)) {
    const { buildBlueprintFromGraph } = await import(
      path.join(worktreeRoot, 'src/lib/courseGraph/blueprintFromGraph.js')
    );
    blueprint = compactBlueprintForStorage(
      buildBlueprintFromGraph(graph, {
        sessionMinutes: capturedManifest?.generationConstraints?.sessionMinutes || undefined,
      }),
    );
  } else {
    blueprint = compactBlueprintForStorage(buildCourseBlueprint(saved.courseMap));
  }
  const deliverables = compileBlueprintDeliverables(blueprint, featureIds, { configMap });
  const deliverableState = Object.fromEntries(
    featureIds.filter((id) => deliverables[id]).map((id) => [id, { status: 'done', data: deliverables[id] }]),
  );

  const { buildCourseMaterialsZip } = await import(path.join(worktreeRoot, 'src/lib/packageZipExporter.js'));
  const { extractPackage } = await import(path.join(worktreeRoot, 'src/lib/quality/deepQualityGrader.js'));
  const { createMemoryFileProvider } = await import(path.join(worktreeRoot, 'src/lib/quality/fileProviders.js'));

  const assembled = await buildCourseMaterialsZip({
    courseMap: saved.courseMap,
    deliverables: deliverableState,
    featureIds: ['courseMap', ...featureIds],
    courseGraph: graph,
    readiness: { status: 'ready', blockers: 0, warnings: 0, issues: [] },
    pipelineState: capturedManifest?.pipeline || capturedDigest?.pipeline || null,
    assembleOnly: true,
    quality: {
      budget: saved.apiCallBudgetReceipt || null,
      digest: capturedDigest || null,
      courseId: capturedCourse?.id || saved.projectId || '',
      coursePrompt: capturedCourse?.prompt || saved.promptText || '',
      expectedSessionMinutes: capturedManifest?.generationConstraints?.sessionMinutes || null,
      timeoutMs: 120000,
    },
  });
  const extracted = await extractPackage(createMemoryFileProvider(assembled.fileContents));

  const fixture = {
    label: `twin-${args.ref || 'unknown-ref'}`,
    builtAt: new Date().toISOString(),
    twin: { generationId: args.generationId || null, compilerRef: args.ref || null, projectPath: args.project },
    quality: assembled.quality || null,
    qualityFindings: assembled.qualityResult?.findings || [],
    manifestSummary: assembled.manifest
      ? {
          readiness: assembled.manifest.readiness || null,
          assessmentSummary: assembled.manifest.assessmentSummary || null,
          readingCount: Array.isArray(assembled.manifest.readings) ? assembled.manifest.readings.length : 0,
        }
      : null,
    files: extracted.files.map((file) => ({
      path: file.path,
      featureId: file.featureId,
      lessonNumber: file.lessonNumber ?? null,
      text: file.text || '',
    })),
  };
  const substantive = fixture.files.filter((file) => file.text.length > 100).length;
  if (substantive < 30)
    throw new Error(`Twin side looks empty (${substantive} substantive files) — compile or extraction failed.`);
  await fs.mkdir(path.dirname(args.out), { recursive: true });
  await fs.writeFile(args.out, JSON.stringify(fixture, null, 2));
  console.log(
    `[twin-runner] ${args.ref || '?'}: ${fixture.files.length} files (${substantive} substantive) · quality ${fixture.quality?.score ?? 'n/a'}/${fixture.quality?.grade ?? '—'} · findings ${fixture.qualityFindings.length} → ${args.out}`,
  );
}

main().catch((error) => {
  console.error(`[twin-runner] FAILED: ${error.message}`);
  process.exitCode = 1;
});
