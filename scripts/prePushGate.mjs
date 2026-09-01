import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ZERO_SHA = /^0+$/;

export const FAST_VERIFICATION_COMMANDS = [
  ['npm', ['run', 'format:check']],
  ['npm', ['run', 'lint']],
  ['npm', ['run', 'build']],
  ['npm', ['run', 'bundle:check']],
  ['npm', ['run', 'audit:release-history']],
  ['npm', ['run', 'audit:scion:codex-cross-revision-evidence']],
  ['npm', ['run', 'audit:scion:source-compiler-replay']],
  ['npm', ['run', 'audit:scion:semantic-expansion-evidence:v0.16.61']],
  ['npm', ['run', 'audit:scion:review-candidates']],
  ['npm', ['run', 'audit:scion:source-review-packet']],
  ['npm', ['run', 'audit:scion:codex-first-order']],
  ['npm', ['run', 'audit:scion:codex-first-order-evidence']],
  ['npm', ['run', 'audit:scion:codex-reverse-order']],
  ['npm', ['run', 'audit:scion:codex-paired-order-evidence']],
  ['npm', ['run', 'audit:scion:adapter:corpus-readiness']],
  ['npm', ['run', 'audit:scion:adapter:exact-lineage']],
  ['npm', ['run', 'audit:automated-readiness']],
  ['npm', ['run', 'audit:texture:cross-package', '--', '--profile', 'thin', '--compare-baseline']],
  ['npm', ['run', 'audit:texture:cross-package', '--', '--profile', 'gold', '--compare-baseline']],
  ['npm', ['run', 'audit:texture:cross-package:untuned']],
  ['npm', ['run', 'test:blueprint:quality:fast']],
  ['npm', ['run', 'audit:deliverables']],
  ['npm', ['run', 'audit:pipeline']],
  ['npm', ['test']],
  ['npm', ['run', 'test:e2e']],
  ['npm', ['run', 'audit:evaluation:pr']],
];

export function parsePrePushUpdates(input) {
  return input
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const [localRef, localSha, remoteRef, remoteSha] = line.trim().split(/\s+/);
      return { localRef, localSha, remoteRef, remoteSha };
    });
}

export function mainPushFromUpdates(updates) {
  return updates.find(({ localSha, remoteRef }) => remoteRef === 'refs/heads/main' && !ZERO_SHA.test(localSha));
}

export function formatCommand([command, args]) {
  return [command, ...args].join(' ');
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: options.capture ? 'pipe' : 'inherit',
  });

  if (result.status !== 0) {
    if (options.capture) {
      process.stderr.write(result.stderr || result.stdout || '');
    }
    process.exit(result.status || 1);
  }

  return options.capture ? result.stdout.trim() : '';
}

function git(...args) {
  return run('git', args, { capture: true });
}

function requireCleanCheckout(stage) {
  const dirty = git('status', '--porcelain');
  if (!dirty) return;

  console.error(`\nPush blocked: the checkout is not clean ${stage}.`);
  console.error('Commit or remove these changes so the verified files exactly match the pushed commit:');
  console.error(dirty);
  process.exit(1);
}

function gateFingerprint() {
  const script = readFileSync(fileURLToPath(import.meta.url), 'utf8');
  return createHash('sha256')
    .update(script)
    .update(JSON.stringify(FAST_VERIFICATION_COMMANDS))
    .digest('hex')
    .slice(0, 12);
}

function forcedHeadUpdate() {
  const remoteSha = git('rev-parse', '--verify', 'origin/main');
  return {
    localRef: 'HEAD',
    localSha: git('rev-parse', 'HEAD'),
    remoteRef: 'refs/heads/main',
    remoteSha,
  };
}

function printPlan() {
  console.log('EduTool main push gate will run:');
  FAST_VERIFICATION_COMMANDS.forEach((command, index) => {
    console.log(`${index + 1}. ${formatCommand(command)}`);
  });
}

function verifyMainPush(update) {
  const headSha = git('rev-parse', 'HEAD');
  if (update.localSha !== headSha) {
    console.error('\nPush blocked: refs/heads/main must be updated from the currently checked-out HEAD.');
    console.error(`Checked-out HEAD: ${headSha}`);
    console.error(`Requested commit: ${update.localSha}`);
    process.exit(1);
  }

  requireCleanCheckout('before verification');

  if (update.remoteSha && !ZERO_SHA.test(update.remoteSha)) {
    run('git', ['diff', '--check', update.remoteSha, update.localSha]);
  }

  const stampDir = git('rev-parse', '--git-path', 'edutool-push-gate');
  const stampPath = `${stampDir}/${update.localSha}-${gateFingerprint()}`;
  try {
    readFileSync(stampPath);
    console.log(`EduTool push gate: ${update.localSha.slice(0, 8)} already passed this exact gate.`);
    return;
  } catch {
    // A missing stamp means this exact commit and gate definition still need verification.
  }

  console.log(`\nVerifying ${update.localSha.slice(0, 8)} before main can be updated...`);
  FAST_VERIFICATION_COMMANDS.forEach(([command, args], index) => {
    console.log(`\n[${index + 1}/${FAST_VERIFICATION_COMMANDS.length}] ${formatCommand([command, args])}`);
    run(command, args);
  });

  requireCleanCheckout('after verification');
  mkdirSync(stampDir, { recursive: true });
  writeFileSync(stampPath, `${new Date().toISOString()}\n`);
  console.log(`\nEduTool push gate passed for ${update.localSha.slice(0, 8)}.`);
}

function main() {
  const args = new Set(process.argv.slice(2));
  if (args.has('--plan')) {
    printPlan();
    return;
  }

  const updates = args.has('--force-head') ? [forcedHeadUpdate()] : parsePrePushUpdates(readFileSync(0, 'utf8'));
  const mainPush = mainPushFromUpdates(updates);
  if (!mainPush) {
    console.log('EduTool push gate: no update to refs/heads/main; skipping.');
    return;
  }

  verifyMainPush(mainPush);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
