import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    setupFiles: ['./tests/setup/unitEnvironment.js'],
    maxWorkers: 1,
    testTimeout: 10000,
    include: [
      'src/lib/__tests__/scion*.test.js',
      'src/lib/__tests__/{contentQualityRepair,scenarioContract,nativeGraphAuthoring}.test.js',
      'src/lib/__tests__/algiResearchProvider.test.js',
      'src/lib/__tests__/instructionalIntentGraph.test.js',
      'src/lib/knowledge/__tests__/{algiResearch,algiResearchPlan,algiResearchCache,algiEvidenceGraph}.test.js',
      'src/lib/__tests__/{kernelProjection,blueprintEnrichmentPass,instructionalPlanGenerationAdmission,compilerSourceBoundaryCorrection,generationCancellation,sourceBriefConstraints,objectiveConstructInstruction}.test.js',
      'src/components/chat/__tests__/useStreamProcessor.test.js',
      'src/components/chat/__tests__/ChatPanel.autoFinalize.test.jsx',
      'src/components/__tests__/{ModelConfig,BuildRibbon}.test.jsx',
      'src/hooks/__tests__/useSmartSync.test.jsx',
    ],
  },
});
