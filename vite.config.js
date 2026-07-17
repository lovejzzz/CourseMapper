import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/',
  build: {
    modulePreload: {
      // The ribbon belongs to the lazily loaded workspace route. Rollup can
      // identify a manual chunk as an entry dependency and otherwise add it to
      // index.html, which makes the landing page download workspace-only UI.
      // Keep dynamic-import dependency preloads intact; filter only the HTML
      // host so AppFlow fetches the ribbon when the workspace is requested.
      resolveDependencies(_filename, dependencies, { hostType }) {
        if (hostType !== 'html') return dependencies;
        return dependencies.filter((dependency) => !dependency.includes('livingCompilerRibbon-'));
      },
    },
    rollupOptions: {
      output: {
        // Scion (V2.1 D): the house-model compiler wiring is local-provider
        // only — keep it in its own lazy chunk so it never inflates the main
        // AppFlow bundle (whose budget ratchets down, never up for features).
        manualChunks(id) {
          // v0.16.47: the Living Course Compiler is a cohesive route widget
          // with a pure state model. Keep that UI/model pair independently
          // cacheable instead of making every progress refinement invalidate
          // the much larger AppFlow workspace chunk.
          if (/src\/(?:components\/BuildRibbon\.jsx|lib\/buildRibbonModel\.js)$/.test(id)) {
            return 'livingCompilerRibbon';
          }
          if (/src\/lib\/scion(Contracts|Passes|PassB|Flywheel)\.js$/.test(id)) return 'scion';
          if (
            /src\/lib\/scion(AdapterManifest|AdapterRegistry|BrowserConstants|BrowserWllama|RuntimeCanaryBridge|RuntimeCanaryGate)\.js$/.test(
              id,
            )
          )
            return 'scionRuntime';
          if (/src\/lib\/quality\/quizItemDepth\.js$/.test(id)) return 'quizItemDepth';
          if (/src\/lib\/bayesianQuizFrames\.js$/.test(id)) return 'compilerFrames';
        },
      },
    },
  },
  server: {
    port: 5173,
  },
  test: {
    testTimeout: 15000,
    // Background-task worktrees are separate checkouts with their own test
    // trees — never collect them from the parent repo's run.
    // verification-output holds prof twin worktrees (full checkouts) while a
    // twin compiles — never collect tests from artifacts.
    exclude: ['**/node_modules/**', '**/dist/**', '.claude/**', 'verification-output/**'],
  },
});
