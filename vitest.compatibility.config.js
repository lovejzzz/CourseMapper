import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  test: {
    setupFiles: ['./tests/setup/unitEnvironment.js'],
    maxWorkers: 2,
    testTimeout: 30000,
    include: [
      'src/components/deliverables/__tests__/*.{test,spec}.{js,jsx}',
      'src/components/__tests__/{GenericDeliverableView,ExportSidePanel.readiness,Header}.test.jsx',
      'src/lib/__tests__/{deliverableSchemas,exporterUtils,generationCancellation,scionCompilerRoute,keyMaps}.test.js',
      'tests/v01654-editable-object-fields.test.jsx',
      'tests/v015-sync-durable.test.jsx',
      'tests/v0147-sync-star.test.js',
      'tests/v0157-finished-package-surface.test.jsx',
      'src/hooks/__tests__/{useDeliverableUndo,useBoundedAutosave}.test.jsx',
      'src/lib/__tests__/teachingTaskContent*.test.js',
    ],
  },
});
