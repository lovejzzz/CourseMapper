// Emit a fresh, explicitly allowlisted Docker context, independent of builder version.
import { cp, mkdir, mkdtemp, readdir, lstat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url));
const destination = await mkdtemp(join(tmpdir(), 'coursemapper-authoring-build-'));
async function copy(relative) {
  const source = join(root, relative);
  const stat = await lstat(source);
  if (stat.isSymbolicLink()) throw new Error(`Build input must not be a symbolic link: ${relative}`);
  if (stat.isDirectory()) {
    await mkdir(join(destination, relative), { recursive: true });
    for (const name of await readdir(source)) await copy(join(relative, name));
  } else if (stat.isFile()) {
    await mkdir(join(destination, relative, '..'), { recursive: true });
    await cp(source, join(destination, relative));
  } else throw new Error(`Unsupported build input: ${relative}`);
}
try {
  await copy('server/authoring/Dockerfile');
  await copy('server/authoring/runtime/package.json');
  await copy('server/authoring/runtime/package-lock.json');
  for (const name of await readdir(join(root, 'server/authoring')))
    if (name.endsWith('.mjs')) await copy(join('server/authoring', name));
  await copy('src/lib/authoringCore');
  process.stdout.write(`${destination}\n`);
} catch (error) {
  await rm(destination, { recursive: true, force: true });
  throw error;
}
