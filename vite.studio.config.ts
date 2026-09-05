import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
let commit = 'local';
try {
  commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
} catch {
  /* exported source tree */
}
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'release-identity',
      generateBundle() {
        this.emitFile({
          type: 'asset',
          fileName: 'release.json',
          source: JSON.stringify({ version: pkg.version, commit, builtAt: new Date().toISOString() }),
        });
        const productionModules = [...this.getModuleIds()]
          .filter((id) => id.startsWith(process.cwd() + '/src/'))
          .map((id) => id.slice(process.cwd().length + 1))
          .sort();
        if (productionModules.some((id) => /^src\/(lib|model|contexts)\/|^src\/App|LegacyApplication/.test(id)))
          throw new Error('The retired workspace entered the Studio production graph.');
        this.emitFile({
          type: 'asset',
          fileName: 'build-report.json',
          source: JSON.stringify({ productionModules }, null, 2),
        });
      },
    },
  ],
  publicDir: 'studio-public',
  define: { __STUDIO_VERSION__: JSON.stringify(pkg.version) },
  build: { manifest: true },
  server: {
    proxy: {
      '/api/scion': {
        target: process.env.SCION_PROXY_TARGET || 'https://edutool-scion.xingpicture.workers.dev',
        changeOrigin: true,
        headers: { Origin: 'https://edutool.dev' },
      },
    },
  },
});
