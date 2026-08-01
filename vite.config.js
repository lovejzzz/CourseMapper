import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/',
  build: {
    // The generic 500 KiB warning is redundant with bundle:check, which owns
    // tighter raw and gzip budgets for every large lazy chunk. Keep Vite's
    // warning just above the 842 KiB compiler ratchet; bundle:check still
    // fails on a single byte over its per-chunk ceiling.
    chunkSizeWarningLimit: 865,
    modulePreload: {
      // The ribbon belongs to the lazily loaded workspace route. Rollup can
      // identify a manual chunk as an entry dependency and otherwise add it to
      // index.html, which makes the landing page download workspace-only UI.
      // Keep dynamic-import dependency preloads intact; filter only the HTML
      // host so AppFlow fetches the ribbon when the workspace is requested.
      resolveDependencies(_filename, dependencies, { hostType }) {
        if (hostType !== 'html') return dependencies;
        return dependencies.filter(
          (dependency) =>
            !dependency.includes('livingCompilerRibbon-') &&
            !dependency.includes('livingCompilerFailure-') &&
            !dependency.includes('courseMapContinuation-'),
        );
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
          if (/src\/lib\/buildRibbonFailureModel\.js$/.test(id)) return 'livingCompilerFailure';
          if (/src\/lib\/(?:courseMapContinuation|generatedCourseMapHandoff|materializedLessonScope)\.js$/.test(id)) {
            return 'courseMapContinuation';
          }
          if (/src\/lib\/workspaceSaveStatus\.js$/.test(id)) return 'workspaceSaveStatus';
          if (/src\/components\/PackageTrustStrip\.jsx$/.test(id)) return 'packageTrustStrip';
          if (/src\/lib\/notifyDone\.js$/.test(id)) return 'workspaceNotification';
          if (/src\/lib\/agentEvidenceCards\.js$/.test(id)) return 'agentEvidenceCards';
          if (/src\/components\/deliverables\/shared\/lessonGrouping\.js$/.test(id)) {
            return 'deliverableLessonGrouping';
          }
          // Vite 8's Rolldown graph follows transitive dependencies into a
          // named manual chunk. Grouping scionPassB or the course compiler
          // here captures shared landing dependencies and turns a lazy seam
          // into an initial megabyte-scale download. Let their existing
          // dynamic imports define both chunk boundaries automatically.
          if (
            /src\/lib\/scion(AdapterManifest|AdapterRegistry|BrowserConstants|BrowserWllama|RuntimeCanaryBridge|RuntimeCanaryGate)\.js$/.test(
              id,
            )
          )
            return 'scionRuntime';
          if (/src\/lib\/quality\/quizItemDepth\.js$/.test(id)) return 'quizItemDepth';
          // Exact target-language quiz and lesson-plan frames are sizeable
          // compile-only data. Keep them beside the lazy compiler as an
          // independently cacheable leaf instead of inflating its control-flow
          // chunk or the landing route.
          if (/src\/lib\/scionLanguageCompilerFrames\.js$/.test(id)) return 'scionLanguageCompilerFrames';
          if (/src\/lib\/(?:bayesianQuizFrames|musicTheoryQuizFrames)\.js$/.test(id)) return 'compilerFrames';
          // Exam distractor/correct-answer rotations are pure compile-only
          // data. Keep them cacheable apart from the broader course-copy leaf
          // so platform-specific gzip variance cannot cross either ratchet.
          if (/src\/lib\/courseCompilerExamCopy\.js$/.test(id)) return 'compilerExamCopy';
          if (/src\/lib\/courseCompilerPolish\.js$/.test(id)) return 'compilerPolish';
          if (/src\/lib\/compilerEvidenceCopy\.js$/.test(id)) return 'compilerEvidenceCopy';
          if (/src\/lib\/artifactDisplayReference\.js$/.test(id)) return 'compilerCopyVariants';
          if (/src\/lib\/quality\/repeatedInstructionalPhrase\.js$/.test(id)) {
            return 'repeatedInstructionalPhrase';
          }
          // Fact-ledger feedback normalization is shared by native authoring
          // and compilation. Keep that pure helper independently cacheable
          // instead of duplicating its bytes inside the compiler control-flow
          // chunk.
          if (/src\/lib\/factLedgerFeedback\.js$/.test(id)) return 'factLedgerFeedback';
          // Rotating instructional prose is data, not compiler control flow.
          // Keep it independently cacheable so adding texture does not make
          // the disciplinary frame chunk pay the parsing/invalidation cost.
          if (/src\/lib\/courseCompilerCopyVariants\.js$/.test(id)) return 'compilerCopyVariants';
          if (/src\/lib\/courseCompilerRealization\.js$/.test(id)) return 'compilerRealization';
          if (/src\/lib\/courseCompilerTextureCopy\.js$/.test(id)) return 'compilerTextureCopy';
          if (/src\/lib\/courseCompilerAssessmentRegistry\.js$/.test(id)) return 'compilerAssessmentRegistry';
          if (/src\/lib\/courseCompilerTechnicalSessionPlans\.js$/.test(id)) {
            return 'compilerTechnicalSessionPlans';
          }
          if (/src\/lib\/courseCompilerSlideDiscussionCopy\.js$/.test(id)) {
            return 'compilerSlideDiscussionCopy';
          }
          if (/src\/lib\/courseCompilerLensProfiles\.js$/.test(id)) return 'compilerSlideDiscussionCopy';
          if (/src\/lib\/courseCompilerInstructionalCopy\.js$/.test(id)) return 'compilerInstructionalCopy';
          if (/src\/lib\/courseCompilerSelfAssessmentCopy\.js$/.test(id)) return 'compilerSelfAssessmentCopy';
          if (/src\/lib\/courseCompilerReadingProfiles\.js$/.test(id)) return 'compilerReadingProfiles';
          if (/src\/lib\/courseCompilerRubricCopy\.js$/.test(id)) return 'compilerRubricCopy';
          if (/src\/lib\/courseCompilerComparativeRubricBands\.js$/.test(id)) {
            return 'compilerComparativeRubricBands';
          }
          if (/src\/lib\/compilerExperientialActivity\.js$/.test(id)) return 'compilerExperientialActivity';
          if (/src\/lib\/compilerAssessmentEvidenceCopy\.js$/.test(id)) return 'compilerAssessmentEvidenceCopy';
          if (/src\/lib\/compilerFactLedgerVisuals\.js$/.test(id)) return 'compilerFactLedgerVisuals';
          if (/src\/lib\/quality\/deepQualitySubstanceDetails\.js$/.test(id)) return 'deepQualitySubstanceDetails';
          if (/src\/lib\/quality\/deepQualityFormatDetails\.js$/.test(id)) return 'deepQualityFormatDetails';
          if (/src\/lib\/quality\/sourceLedgerCitationSupport\.js$/.test(id)) return 'sourceLedgerCitationSupport';
        },
      },
    },
  },
  server: {
    port: 5173,
  },
  test: {
    // The suite contains several hash-bound replay and zero-token compiler
    // integrations. Running hundreds of files with Vitest's CPU-count worker
    // default starves those I/O-heavy proofs and creates false 15-second
    // failures. Four workers is faster end-to-end on the release machine and
    // keeps the expensive assertions deterministic.
    maxWorkers: 4,
    testTimeout: 120000,
    // Background-task worktrees are separate checkouts with their own test
    // trees — never collect them from the parent repo's run.
    // verification-output holds prof twin worktrees (full checkouts) while a
    // twin compiles — never collect tests from artifacts.
    exclude: ['**/node_modules/**', '**/dist/**', '.claude/**', 'verification-output/**'],
  },
});
