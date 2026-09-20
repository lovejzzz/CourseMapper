import { it, expect } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, cp, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

it('stages only runtime inputs and rejects symlinks outside the context', async () => {
  const fixture = await mkdtemp(join(tmpdir(), 'authoring-context-test-'));
  let context;
  try {
    for (const directory of ['scripts/authoring', 'server/authoring/runtime', 'src/lib/authoringCore', 'node_modules'])
      await mkdir(join(fixture, directory), { recursive: true });
    await cp('scripts/authoring/buildContext.mjs', join(fixture, 'scripts/authoring/buildContext.mjs'));
    for (const file of [
      'server/authoring/Dockerfile',
      'server/authoring/start.mjs',
      'server/authoring/runtime/package.json',
      'server/authoring/runtime/package-lock.json',
      'src/lib/authoringCore/core.js',
    ])
      await writeFile(join(fixture, file), 'fixture');
    await writeFile(join(fixture, '.env'), 'PRIVATE_CONFIGURATION_SENTINEL');
    await writeFile(join(fixture, 'server/authoring/private.json'), 'PRIVATE_CONFIGURATION_SENTINEL');
    await writeFile(join(fixture, 'node_modules/private.js'), 'PRIVATE_CONFIGURATION_SENTINEL');
    const script = join(fixture, 'scripts/authoring/buildContext.mjs');
    context = execFileSync(process.execPath, [script], { encoding: 'utf8' }).trim();
    expect(await readFile(join(context, 'server/authoring/start.mjs'), 'utf8')).toBe('fixture');
    for (const file of ['.env', 'server/authoring/private.json', 'node_modules/private.js'])
      await expect(readFile(join(context, file))).rejects.toMatchObject({ code: 'ENOENT' });
    await symlink(join(fixture, '.env'), join(fixture, 'src/lib/authoringCore/leak.js'));
    expect(() => execFileSync(process.execPath, [script], { stdio: 'pipe' })).toThrow();
  } finally {
    if (context) await rm(context, { recursive: true, force: true });
    await rm(fixture, { recursive: true, force: true });
  }
});
