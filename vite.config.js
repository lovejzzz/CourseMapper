import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/',
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
