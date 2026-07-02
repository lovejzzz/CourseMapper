/**
 * scripts/prof/twinCompile.mjs — build a same-generation TWIN: one captured
 * generation (project.json from a crucible round) compiled by two compiler
 * versions into two Prof fixtures that share a generationId.
 *
 *   npx vite-node scripts/prof/twinCompile.mjs -- \
 *     --project verification-output/crucible/round-…/cs-python/project.json \
 *     --refA <git-ref> --refB <git-ref|local> \
 *     --out verification-output/prof/twins/<name>
 *
 * Each ref side runs in a detached git worktree (node_modules symlinked,
 * _twinRunner.mjs copied in) so `src/` imports resolve to THAT ref's
 * compiler. `local` compiles with the CURRENT working tree — use it for the
 * candidate side when the fix is not yet committed. The compiler is
 * deterministic, so twin sides differ ONLY by compiler code.
 */
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(moduleDir, '..', '..');

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--project') args.project = String(argv[++index]);
    if (argv[index] === '--refA') args.refA = String(argv[++index]);
    if (argv[index] === '--refB') args.refB = String(argv[++index]);
    if (argv[index] === '--out') args.out = String(argv[++index]);
  }
  return args;
}

async function git(cwd, ...argv) {
  const { stdout } = await execFileAsync('git', argv, { cwd, maxBuffer: 16 * 1024 * 1024 });
  return stdout.trim();
}

async function runRunner({ rootDir, projectPath, outPath, generationId, refLabel }) {
  await execFileAsync(
    'npx',
    [
      'vite-node',
      path.join(rootDir, 'scripts/prof/_twinRunner.mjs'),
      '--',
      '--project',
      projectPath,
      '--out',
      outPath,
      '--generation-id',
      generationId,
      '--ref',
      refLabel,
    ],
    {
      cwd: rootDir,
      maxBuffer: 64 * 1024 * 1024,
      env: { ...process.env },
    },
  );
}

async function compileSide({ ref, projectPath, outPath, generationId, worktreesDir }) {
  if (ref === 'local') {
    await runRunner({
      rootDir: repoRoot,
      projectPath,
      outPath,
      generationId,
      refLabel: `local@${await git(repoRoot, 'rev-parse', '--short', 'HEAD')}`,
    });
    return 'local';
  }
  const sha = await git(repoRoot, 'rev-parse', '--short', ref);
  const worktreeDir = path.join(worktreesDir, sha);
  await fs.rm(worktreeDir, { recursive: true, force: true }).catch(() => {});
  await git(repoRoot, 'worktree', 'add', '--detach', worktreeDir, ref);
  try {
    // Dependencies are unchanged across the refs a twin compares — share them.
    await fs.symlink(path.join(repoRoot, 'node_modules'), path.join(worktreeDir, 'node_modules'), 'dir');
    // The runner may not exist at older refs — always inject the CURRENT one
    // (its logic is identical on both sides by construction; only src/ differs).
    await fs.mkdir(path.join(worktreeDir, 'scripts/prof'), { recursive: true });
    await fs.copyFile(
      path.join(repoRoot, 'scripts/prof/_twinRunner.mjs'),
      path.join(worktreeDir, 'scripts/prof/_twinRunner.mjs'),
    );
    await runRunner({ rootDir: worktreeDir, projectPath, outPath, generationId, refLabel: sha });
  } finally {
    await git(repoRoot, 'worktree', 'remove', '--force', worktreeDir).catch(() => {});
  }
  return sha;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.project || !args.refA || !args.refB || !args.out) {
    throw new Error('Usage: twinCompile --project <project.json> --refA <ref> --refB <ref|local> --out <dir>');
  }
  const projectPath = path.isAbsolute(args.project) ? args.project : path.join(repoRoot, args.project);
  const outDir = path.isAbsolute(args.out) ? args.out : path.join(repoRoot, args.out);
  const worktreesDir = path.join(repoRoot, 'verification-output', 'prof', 'twin-worktrees');
  const projectBytes = await fs.readFile(projectPath);
  const generationId = createHash('sha256').update(projectBytes).digest('hex');

  await fs.mkdir(outDir, { recursive: true });
  const outA = path.join(outDir, 'twin-A.json');
  const outB = path.join(outDir, 'twin-B.json');
  console.log(`[twin] generation ${generationId.slice(0, 12)}… from ${path.relative(repoRoot, projectPath)}`);
  const shaA = await compileSide({ ref: args.refA, projectPath, outPath: outA, generationId, worktreesDir });
  const shaB = await compileSide({ ref: args.refB, projectPath, outPath: outB, generationId, worktreesDir });

  const meta = {
    generationId,
    project: path.relative(repoRoot, projectPath),
    sides: {
      A: { ref: args.refA, sha: shaA, fixture: path.relative(repoRoot, outA) },
      B: { ref: args.refB, sha: shaB, fixture: path.relative(repoRoot, outB) },
    },
    builtAt: new Date().toISOString(),
  };
  await fs.writeFile(path.join(outDir, 'twin-meta.json'), JSON.stringify(meta, null, 2));
  console.log(`[twin] A=${args.refA}(${shaA}) B=${args.refB}(${shaB}) → ${path.relative(repoRoot, outDir)}`);
}

main().catch((error) => {
  console.error(`[twin] FAILED: ${error.message}`);
  process.exitCode = 1;
});
