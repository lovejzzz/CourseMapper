import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

export function applicationRelease() {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  let commit = 'local';
  try {
    commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    /* Source archive without Git metadata. */
  }
  return {
    name: 'application-release',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'release.json',
        source: JSON.stringify({
          version: pkg.version,
          commit,
          interfaceBaseline: '0.18.7',
          builtAt: new Date().toISOString(),
        }),
      });
      const productionModules = [...this.getModuleIds()]
        .filter((id) => id.startsWith(process.cwd() + '/src/'))
        .map((id) => id.slice(process.cwd().length + 1))
        .sort();
      if (productionModules.some((id) => id.startsWith('src/studio/')))
        throw new Error('The experimental Studio must not replace the restored application.');
      this.emitFile({
        type: 'asset',
        fileName: 'build-report.json',
        source: JSON.stringify({ productionModules }, null, 2),
      });
    },
  };
}
