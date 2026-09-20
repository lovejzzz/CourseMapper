import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  test: {
    setupFiles: ['./tests/setup/unitEnvironment.js'],
    maxWorkers: 2,
    testTimeout: 30000,
    include: ['tests/authoring/**/*.test.{js,jsx}', 'src/lib/__tests__/cloudStorage.security.test.js'],
  },
});
