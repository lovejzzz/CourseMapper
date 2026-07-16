import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'scripts/__tests__/qualityBenchmark.test.js',
      'tests/scion-model-bakeoff.test.js',
      'tests/scion-adapter-judge-promotion.test.js',
    ],
    fileParallelism: false,
    testTimeout: 120_000,
  },
});
