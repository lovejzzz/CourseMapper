import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['src/studio/__tests__/**/*.test.ts', 'server/scion/__tests__/**/*.test.ts'],
    environment: 'node',
    maxWorkers: 1,
  },
});
