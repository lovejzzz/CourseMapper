/**
 * @vitest-environment happy-dom
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import BuildRibbon from '../src/components/BuildRibbon.jsx';
import { preferredScrollBehavior } from '../src/lib/motionPreference.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(repoRoot, rel), 'utf8');

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('minimal workspace status contract', () => {
  it('keeps build diagnostics closed by default while preserving the compact narrator and stop action', () => {
    const html = renderToStaticMarkup(
      <BuildRibbon
        model={{
          activeStartedAt: 0,
          compilerArtifacts: [],
          compilerState: 'live',
          pipelineChips: [],
          progressPct: 42,
          running: true,
          stageLabel: 'Building 4 of 9 materials',
          steps: [],
        }}
        onStop={() => {}}
      />,
    );
    expect(html).toContain('<details');
    expect(html).not.toContain('<details open');
    expect(html).toContain('Building 4 of 9 materials');
    expect(html).toContain('Build details');
    expect(html).toContain('Stop build');
    expect(html.match(/<summary[\s\S]*?<\/summary>/)?.[0]).not.toContain('<p');
    const source = read('src/components/BuildRibbon.jsx');
    expect(source.indexOf('{onStop && model.running')).toBeGreaterThan(source.indexOf('</details>'));
    expect(source).toContain('min-h-11 shrink-0');
    expect(source).toContain('onClick={() => onStop()}');
  });

  it('keeps the honest quality score reachable from the agent panel', () => {
    const source = read('src/AppFlow.jsx');
    expect(source).toContain('<AgentQualityControl');
    expect(source).toContain('onOpen={setQualityReportOpen}');
    expect(source).toContain('qualityModalOpen={qualityReportOpen}');
    expect(source).not.toContain('onStopDeliverables={deliv.isGenerating ? () => deliv.stopGenerating() : null}');
    expect(source).toContain('onStopDeliverables={deliv.isGenerating ? onStop : null}');
    expect(read('src/components/chat/ProgressHeader.jsx')).not.toContain('onClick={onStopDeliverables}');
    expect(read('src/components/ProgressPanel.jsx')).not.toContain('onClick={onStopDeliverables}');
  });

  it('invalidates the rest of a stopped deliverable run before retries can create new requests', () => {
    const source = read('src/hooks/useDeliverables.js');
    const generateAllSource = source.slice(
      source.indexOf('const generateAll = useCallback'),
      source.indexOf('// ── Single-lesson regeneration'),
    );
    const regenerateSource = source.slice(source.indexOf('const regenerateLesson = useCallback'));
    expect(source).toContain('cancelGenerationEpoch(generationEpochRef)');
    expect(source).toContain('while (!isGenerationCancelled(fid) && !validation.valid');
    expect(source).toContain('while (!isGenerationCancelled(fid) && mergedArr.length');
    expect(
      generateAllSource.match(/createGenerationAbortController\(generationEpochRef, generationEpoch\)/g),
    ).toHaveLength(7);
    expect(source.match(/isGenerationCancelled\(fid\)/g)?.length).toBeGreaterThanOrEqual(8);
    expect(source).toContain('else cancelFeatureGenerationEpoch(featureGenerationEpochRef, featureId)');
    expect(source).toContain('abortDeliverableOperationControllers(abortMapRef.current, operationId)');
    expect(generateAllSource).toContain('abortDeliverableControllers(abortMapRef.current, featureId, generationRunId)');
    expect(generateAllSource).toContain('abortDeliverableOperationControllers(abortMapRef.current, generationRunId)');
    expect(generateAllSource).toContain('const shouldStopBlueprintCompiler = () =>');
    expect(generateAllSource.match(/if \(shouldStopBlueprintCompiler\(\)\) return;/g)?.length).toBeGreaterThanOrEqual(
      14,
    );
    expect(
      generateAllSource.indexOf(
        'if (shouldStopBlueprintCompiler()) return;\n        // Knowledge attachment is allowed to discover review material',
      ),
    ).toBeGreaterThan(-1);
    expect(generateAllSource).toContain(
      'const boundSources = scionEvidenceHandoff?.bindTeachingSurfaces(blueprintCourseMap, courseGraph);',
    );
    expect(generateAllSource).toContain(
      'for (const fid of blueprintCompiledFeatureIds) {\n          if (isGenerationCancelled(fid)) continue;',
    );
    expect(generateAllSource).toContain(
      'const failed = requestedFeatures.filter((fid) => !completedFeatureIds.has(fid))',
    );
    expect(source).toContain('const generationSnapshotsRef = useRef(new Map())');
    expect(source).toContain('actions.restoreDeliverableSnapshot(');
    expect(source).toContain('generationSnapshotsRef.current.clear()');
    expect(source).toContain('generationSnapshotsRef.current.delete(featureId)');
    expect(generateAllSource).not.toContain('abortMapRef.current.delete(');
    expect(source).not.toContain('timedOutFeaturesRef');
    expect(source).not.toContain('featureActivityRef');
    expect(generateAllSource).toContain('const timedOutFeatures = new Set()');
    expect(generateAllSource).toContain('const featureActivity = new Map()');
    expect(generateAllSource).toContain("featureId: 'blueprintCompiler'");
    expect(generateAllSource).toContain('runFeature: runBlueprintCompiler');
    expect(generateAllSource).toContain('abortDeliverableOperationControllers(abortMapRef.current, generationRunId)');
    const timeoutSource = generateAllSource.slice(
      generateAllSource.indexOf('const markFeatureTimedOut'),
      generateAllSource.indexOf('// v0.14.5 WS-B'),
    );
    expect(timeoutSource).toContain("generatedDeliverables[featureId] = { status: 'error'");
    expect(timeoutSource).toContain('failedFeatureIds.add(featureId)');
    expect(generateAllSource).toContain('`${featureId}:${generationRunId}:');
    expect(generateAllSource).toContain('`shared:${generationRunId}:blueprintEnrichment`');
    expect(generateAllSource).not.toContain("const abortKey = 'blueprintEnrichment'");
    expect(generateAllSource).not.toContain('`${featureId}:chunk${chunkIndex}`');
    expect(generateAllSource.match(/releaseDeliverableController\(/g)?.length).toBeGreaterThanOrEqual(11);
    const activityRegistration = generateAllSource.indexOf(
      'trackGenerationOperation(generationRunId, requestedFeatures)',
    );
    const compilerImport = generateAllSource.indexOf("await import('../lib/courseBlueprintCompiler')");
    expect(activityRegistration).toBeGreaterThan(-1);
    expect(activityRegistration).toBeLessThan(compilerImport);
    expect(generateAllSource.slice(compilerImport, compilerImport + 700)).toContain(
      'requestedFeatures = requestedFeatures.filter',
    );
    expect(generateAllSource.slice(compilerImport, compilerImport + 700)).toContain(
      '!isGenerationCancelled(featureId)',
    );
    expect(generateAllSource.slice(compilerImport, compilerImport + 700)).toContain(
      'trackGenerationOperation(generationRunId)',
    );
    expect(regenerateSource).toContain('const regenerationEpoch = generationEpochRef.current');
    expect(regenerateSource).toContain('const regenerationFeatureEpoch = captureFeatureGenerationEpoch');
    expect(
      regenerateSource.match(/createGenerationAbortController\(generationEpochRef, regenerationEpoch\)/g),
    ).toHaveLength(2);
    expect(regenerateSource).toContain('signal: kernelController.signal');
    expect(regenerateSource).toContain("if (err?.name === 'AbortError' || isRegenerationCancelled())");
    const appFlow = read('src/AppFlow.jsx');
    expect(appFlow).toContain('await deliv.generateAll(courseMap, staleIds, null)');
    expect(appFlow).not.toContain('deliv.generateAll(courseMap, [fid], scopeIndices)');
  });

  it('chains multi-lesson stale syncs through each completed feature snapshot', () => {
    const appSource = read('src/AppFlow.jsx');
    const smartSyncSource = read('src/hooks/useSmartSync.js');
    expect(appSource).not.toContain('for (const idx of se.lessonIndices)');
    expect(appSource).toContain('await deliv.generateAll(courseMap, staleIds, null)');
    expect(appSource).toContain('await deliv.generateAll(courseMap, [activeTab], null)');
    expect(smartSyncSource).toContain('let currentEntry = delivRef.current.deliverables?.[featureId] ?? null');
    expect(smartSyncSource).toContain('let currentData = currentEntry?.data ?? null');
    expect(smartSyncSource).toContain('syncGenId: currentGenId');
    expect(smartSyncSource).toContain('currentData,');
    expect(smartSyncSource).toContain('currentEntry,');
    expect(smartSyncSource).toContain('if (lessonResult.data) {');
    expect(appSource).toContain('currentEntry: finalizerDeliverables[action.featureId] || null');
  });

  it('keeps Stop authoritative through generation, retries, verification, and grading', () => {
    const appSource = read('src/AppFlow.jsx');
    const blueprintWorkflowSource = read('src/hooks/useInstructionalBlueprintWorkflow.js');
    const agentFeatureGenerationSource = read('src/hooks/useAgentFeatureGeneration.js');
    const packageWorkflowSource = `${appSource}\n${blueprintWorkflowSource}\n${agentFeatureGenerationSource}`;
    const smartSyncSource = read('src/hooks/useSmartSync.js');
    expect(appSource).toContain('const packageWorkflowEpochRef = useRef(1)');
    expect(appSource).not.toContain('const packageWorkflowEpochRef = useRef(0)');
    expect(appSource).toContain("throw new DOMException('Stopped', 'AbortError')");
    expect(packageWorkflowSource).toContain("result?.status === 'aborted'");
    expect(packageWorkflowSource.match(/await finalizeGeneratedPackage\(/g)).toHaveLength(3);
    expect(packageWorkflowSource.match(/scopeIndices,\n\s+workflowEpoch,/g)).toHaveLength(4);
    const retryRunner = appSource.slice(
      appSource.indexOf('const runRetryAction = async'),
      appSource.indexOf('const runLocalCompilerRetryBatch'),
    );
    expect(retryRunner.indexOf('assertPackageWorkflowActive();')).toBeLessThan(
      retryRunner.indexOf('retryResult = await'),
    );
    expect((appSource.match(/assertPackageWorkflowActive\(\);/g) || []).length).toBeGreaterThanOrEqual(12);
    expect(appSource).toContain('packageWorkflowEpochRef.current += 1;');
    expect(appSource).toContain('detachPackageFinalizer(packageFinalizerInFlightRef);');
    expect(appSource).toContain('releasePackageFinalizer(packageFinalizerInFlightRef, finishPromise);');
    expect(appSource).toContain('continuePackageFinalizer(prior, packageWorkflowEpochRef, finishWorkflowEpoch, () =>');
    expect(appSource).toContain('workflowEpoch: finishWorkflowEpoch');
    expect(appSource).not.toContain('setSyncRegradePending(true)');
    expect(smartSyncSource).toContain('const workflowEpoch = workflowEpochRef?.current ?? null');
    expect(smartSyncSource).toContain('if ((workflowEpochRef?.current ?? null) !== workflowEpoch) {');
    expect(smartSyncSource).toContain('onSyncCompleteRef.current(completedFeatureIds, workflowEpoch)');
    expect(smartSyncSource).toContain('if (!syncStopped && completedFeatureIds.length > 0');
    expect(appSource).toContain('if (packageWorkflowEpochRef.current !== workflowEpoch) return');
    expect(appSource).toContain('setSyncRegradeEpoch(workflowEpoch)');
    expect(appSource).not.toContain('setSyncRegradeEpoch(packageWorkflowEpochRef.current)');
    expect(appSource).toContain('workflowEpoch: syncRegradeEpoch');
    expect(appSource).toContain('if (!syncRegradeEpoch) return');
    expect(appSource).not.toContain('syncRegradeEpoch === null');
    expect(packageWorkflowSource.match(/const workflowEpoch = beginPackageWorkflow\(\);/g)).toHaveLength(4);
    expect(appSource).toContain('deliv.stopGenerating();');
    expect(appSource).toContain('onBeforeNewProject: onStop');
    expect(read('src/hooks/useProjectPersistence.js')).toContain('onBeforeNewProject?.();');
    expect(read('src/components/chat/useChatRouter.js')).toContain("status: 'stopped'");
    expect(read('src/components/chat/ChatPanel.jsx')).toContain("title: 'Sync stopped'");
    expect(appSource).toContain(
      'onStop={isPackageGenerationRunning || isFinishPassRunning(packageQualityPass) ? onStop : null}',
    );
  });

  it('reserves the zero sentinel so a cold restored-project sync schedules regrade', () => {
    const appSource = read('src/AppFlow.jsx');
    const initialEpoch = Number(appSource.match(/packageWorkflowEpochRef = useRef\((\d+)\)/)?.[1]);
    expect(initialEpoch).toBeGreaterThan(0);
    expect(appSource).toContain('const [syncRegradeEpoch, setSyncRegradeEpoch] = useState(0)');
    expect(appSource).toContain('setSyncRegradeEpoch(workflowEpoch)');
    expect(initialEpoch).not.toBe(0);
  });
});

describe('setup semantics contract', () => {
  it('uses sibling native buttons for custom material selection, edit, and delete', () => {
    const source = read('src/screens/FeatureSelect.jsx');
    expect(source).not.toContain('role="button"');
    expect(source).toContain('aria-label={`Edit ${feature.label}`}');
    expect(source).toContain('aria-label={`Delete ${feature.label}`}');
    expect(source).toContain('flex gap-2 border-t border-slate-100 p-2');
    expect(source).not.toContain('absolute right-2 top-2');
    expect(source.lastIndexOf('{continuationAction}')).toBeGreaterThan(source.indexOf('Package contents'));
  });

  it('keeps external transfer visible before generation and scope ahead of the final action', () => {
    const landing = read('src/screens/Landing.jsx');
    const config = read('src/screens/Config.jsx');
    expect(landing).toContain('data-testid="scion-external-source-notice"');
    expect(landing.indexOf('scion-external-source-notice')).toBeLessThan(landing.indexOf('landing-quick-start'));
    for (const summary of landing.match(/<summary[\s\S]*?<\/summary>/g) || []) {
      expect(summary).not.toContain('<p');
    }
    expect(config.indexOf('{generationAction}')).toBeGreaterThan(config.indexOf('<LessonScopeSelector'));
  });
});

describe('motion preference contract', () => {
  it('falls back to instant scrolling when reduced motion is requested', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: true })),
    );
    expect(preferredScrollBehavior()).toBe('auto');
    window.matchMedia.mockReturnValue({ matches: false });
    expect(preferredScrollBehavior()).toBe('smooth');
  });

  it('routes every programmatic smooth scroll through the preference helper', () => {
    const sourceFiles = [
      'src/AppFlow.jsx',
      'src/components/ExportSidePanel.jsx',
      'src/components/deliverables/AssignmentsView.jsx',
      'src/components/deliverables/RubricsView.jsx',
      'src/components/DeliverableView.jsx',
      'src/components/CourseMapPreview.jsx',
      'src/pages/FaqChatbot.jsx',
      'src/components/ChatWindow.jsx',
      'src/components/chat/MessageList.jsx',
      'src/components/RevisionChat.jsx',
    ];
    for (const sourceFile of sourceFiles) {
      expect(read(sourceFile)).not.toMatch(/behavior:\s*['"]smooth['"]/);
    }
  });
});
