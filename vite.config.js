import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/',
  build: {
    rollupOptions: {
      output: {
        // Scion (V2.1 D): the house-model compiler wiring is local-provider
        // only — keep it in its own lazy chunk so it never inflates the main
        // AppFlow bundle (whose budget ratchets down, never up for features).
        manualChunks(id) {
          if (/src\/lib\/scion(Contracts|Passes|PassB|Flywheel)\.js$/.test(id)) return 'scion';
          if (
            /src\/lib\/scion(AdapterManifest|AdapterRegistry|BrowserConstants|BrowserWllama|RuntimeCanaryBridge|RuntimeCanaryGate)\.js$/.test(
              id,
            )
          )
            return 'scionRuntime';
          if (/src\/lib\/quality\/quizItemDepth\.js$/.test(id)) return 'quizItemDepth';
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
