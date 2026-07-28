// @vitest-environment happy-dom

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  buildProviderTextRequest: vi.fn(),
  runScionLocalCompletion: vi.fn(),
  composeAlgiResponse: vi.fn(),
  readScionResearchEnabled: vi.fn(() => false),
  buildPublicScionExactSourceLedgerResponse: vi.fn(() => ''),
}));

vi.mock('../src/lib/modelRequestBuilders', () => ({
  buildProviderTextRequest: mocks.buildProviderTextRequest,
}));

vi.mock('../src/lib/scionLocalProvider', () => ({
  runScionLocalCompletion: mocks.runScionLocalCompletion,
}));

vi.mock('../src/lib/algiComposer', () => ({
  composeAlgiResponse: mocks.composeAlgiResponse,
}));

vi.mock('../src/lib/scionResearchPolicy', () => ({
  readScionResearchEnabled: mocks.readScionResearchEnabled,
}));

vi.mock('../src/lib/publicScionProvider', () => ({
  buildPublicScionExactSourceLedgerResponse: mocks.buildPublicScionExactSourceLedgerResponse,
}));

import useStreamReader from '../src/hooks/useStreamReader';

let reader;
let root;
let container;

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function Harness({ scionResearchEnabledOverride = null } = {}) {
  reader = useStreamReader({ scionResearchEnabledOverride });
  return null;
}

beforeEach(async () => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(<Harness />));
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  mocks.buildProviderTextRequest.mockReset();
  mocks.runScionLocalCompletion.mockReset();
  mocks.composeAlgiResponse.mockReset();
  mocks.readScionResearchEnabled.mockReset();
  mocks.readScionResearchEnabled.mockReturnValue(false);
  mocks.buildPublicScionExactSourceLedgerResponse.mockReset();
  mocks.buildPublicScionExactSourceLedgerResponse.mockReturnValue('');
});

describe('useStreamReader Scion boundary', () => {
  it('routes Scion through browser-local inference without constructing or fetching a prompt request', async () => {
    const messages = [
      { role: 'system', content: 'Scion local system' },
      { role: 'user', content: 'Scion local task' },
    ];
    mocks.runScionLocalCompletion.mockImplementation(async (options) => {
      options.onProgress({ phase: 'loading-model', progress: 0.5, message: 'Downloading Gemma 4 (50%)…' });
      options.onAttemptStart({ attempt: 1, maxAttempts: 3, temperature: 0 });
      options.onToken('{"ok":', 1, 1);
      return {
        fullText: '{"ok":true}',
        rawText: '{"ok":true}',
        messages,
        attempt: 1,
        retryCount: 0,
        maxRetries: 2,
        tokenCount: 1,
        repairs: [
          {
            pass: 'incompleteExplanationTail',
            action: 'trimmed-incomplete-tail',
            lessonId: 'lesson-2',
            item: 0,
            trainingEligible: false,
            recoveryEvidence: {
              retainedCharacters: 72,
              removedCharacters: 14,
              removedTail: 'Option D is',
            },
          },
        ],
      };
    });
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const onChunk = vi.fn();
    const onApiCallEvent = vi.fn();

    let result;
    await act(async () => {
      result = await reader.streamProvider('public', '', 'scion-public', 'Verbose system', 'Build a course.', {
        task: 'course-map',
        maxOutputTokens: 1500,
        onChunk,
        onApiCallEvent,
      });
    });

    expect(result).toEqual({ fullText: '{"ok":true}', finishReason: 'stop', adapterRoutes: [] });
    expect(mocks.runScionLocalCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        systemPrompt: 'Verbose system',
        userPrompt: 'Build a course.',
        task: 'course-map',
        maxOutputTokens: 1500,
      }),
    );
    expect(mocks.buildProviderTextRequest).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(onChunk).toHaveBeenLastCalledWith('{"ok":true}', 2);
    expect(onApiCallEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'localModelProgress', progress: 0.5 }));
    expect(onApiCallEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'providerResponseDone', execution: 'browser-local' }),
    );
    expect(onApiCallEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'scionCompilerRepair',
        repairPass: 'incompleteExplanationTail',
        retainedCharacters: 72,
        removedCharacters: 14,
        removedTail: 'Option D is',
        trainingEligible: false,
      }),
    );
    expect(onApiCallEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'apiUsage', pricingSource: 'browser-local', costUsd: 0 }),
    );
  });

  it('records a deterministic source-ledger projection as zero model calls', async () => {
    mocks.runScionLocalCompletion.mockImplementation(async (options) => {
      options.onAdapterRoute({
        protocol: 'scion-adapter-runtime-route-v1',
        mode: 'base-only',
        taskFamily: 'lesson-kernel-synthesis',
        reason: 'no-adapter-installed',
        factLedgerOnly: true,
        exactSourceLedger: true,
        modelCalls: 0,
      });
      return {
        fullText: '{"lessons":[]}',
        messages: [],
        attempt: 0,
        retryCount: 0,
        maxRetries: 0,
        tokenCount: 0,
        repairs: [],
      };
    });
    const onApiCallEvent = vi.fn();

    await act(async () => {
      await reader.streamProvider('public', '', 'scion-public', 'System', 'Course: Design', {
        task: 'blueprintEnrichment',
        onApiCallEvent,
      });
    });

    expect(onApiCallEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'scionAdapterRoute',
        label: 'Scion exact evidence projected',
        stage: 'local-compiler',
        factLedgerOnly: true,
        exactSourceLedger: true,
        routeModelCalls: 0,
        execution: 'browser-compiler',
      }),
    );
  });

  it('adapts to the private evidence compiler when this browser cannot obtain a WebGPU adapter', async () => {
    mocks.readScionResearchEnabled.mockReturnValue(true);
    const capabilityError = Object.assign(new Error('This browser could not start a WebGPU adapter for Scion.'), {
      code: 'SCION_WLLAMA_WEBGPU_ADAPTER',
    });
    mocks.runScionLocalCompletion.mockRejectedValue(capabilityError);
    mocks.composeAlgiResponse.mockResolvedValue({
      text: '{"courseName":"Digital Accessibility","lessons":[]}',
      coverage: { covered: 3, requested: 3, researched: 0, cachedResearch: 0 },
    });
    const onChunk = vi.fn();
    const onApiCallEvent = vi.fn();

    let result;
    await act(async () => {
      result = await reader.streamProvider(
        'public',
        '',
        'scion-public',
        'System',
        'Digital Accessibility, exactly three lessons.',
        {
          task: 'course-map',
          structuredPrompt: { courseTitle: 'Digital Accessibility' },
          onChunk,
          onApiCallEvent,
        },
      );
    });

    expect(result).toEqual({
      fullText: '{"courseName":"Digital Accessibility","lessons":[]}',
      finishReason: 'stop',
      adaptiveRoute: 'scion-evidence-compiler',
      modelRequests: 0,
    });
    expect(mocks.composeAlgiResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        task: 'course-map',
        structuredPrompt: { courseTitle: 'Digital Accessibility' },
        researchEnabled: true,
      }),
    );
    expect(onChunk).toHaveBeenCalledWith('{"courseName":"Digital Accessibility","lessons":[]}', 1);
    expect(onApiCallEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'scionAdaptiveRoute',
        routeReason: 'SCION_WLLAMA_WEBGPU_ADAPTER',
        modelRequests: 0,
        execution: 'browser-compiler',
      }),
    );
    expect(onApiCallEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'scionEvidenceComposed',
        label: 'Scion evidence composition complete',
        modelRequests: 0,
      }),
    );
    expect(onApiCallEvent).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'failedCall' }));
  });

  it('uses explicit run consent even when persistent research storage is still off', async () => {
    const capabilityError = Object.assign(new Error('This browser could not start a WebGPU adapter for Scion.'), {
      code: 'SCION_WLLAMA_WEBGPU_ADAPTER',
    });
    mocks.runScionLocalCompletion.mockRejectedValue(capabilityError);
    mocks.readScionResearchEnabled.mockReturnValue(false);
    mocks.composeAlgiResponse.mockResolvedValue({
      text: '{"courseName":"Digital Accessibility","lessons":[]}',
      coverage: { covered: 3, requested: 3, researched: 3, cachedResearch: 0 },
    });
    await act(async () => root.render(<Harness scionResearchEnabledOverride />));

    await act(async () => {
      await reader.streamProvider('public', '', 'scion-public', 'System', 'Digital Accessibility', {
        task: 'course-map',
      });
    });

    expect(mocks.composeAlgiResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        researchEnabled: true,
      }),
    );
  });

  it('projects the preflight evidence ledger exactly instead of researching it a second time', async () => {
    const capabilityError = Object.assign(new Error('This browser could not start a WebGPU adapter for Scion.'), {
      code: 'SCION_WLLAMA_WEBGPU_ADAPTER',
    });
    mocks.runScionLocalCompletion.mockRejectedValue(capabilityError);
    const exactText = JSON.stringify({
      lessons: [
        {
          lessonId: 'lesson-1',
          facts: [
            'The first admitted source claim is preserved exactly.',
            'The second admitted source claim is preserved exactly.',
            'The third admitted source claim is preserved exactly.',
          ],
          keyTerms: [],
        },
      ],
    });
    mocks.buildPublicScionExactSourceLedgerResponse.mockReturnValue(exactText);
    const onApiCallEvent = vi.fn();

    let result;
    await act(async () => {
      result = await reader.streamProvider('public', '', 'scion-public', 'System', 'Course: Accessibility', {
        task: 'blueprintEnrichment',
        structuredPrompt: { lessons: [{ lessonId: 'lesson-1' }] },
        onApiCallEvent,
      });
    });

    expect(result.fullText).toBe(exactText);
    expect(result.modelRequests).toBe(0);
    expect(result.adapterRoutes).toEqual([
      expect.objectContaining({
        taskFamily: 'lesson-kernel-synthesis',
        factLedgerOnly: true,
        exactSourceLedger: true,
        modelCalls: 0,
      }),
    ]);
    expect(mocks.composeAlgiResponse).not.toHaveBeenCalled();
    expect(onApiCallEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'scionAdapterRoute',
        routeReason: 'compiler-owned-exact-source-ledger',
        routeModelCalls: 0,
        execution: 'browser-compiler',
      }),
    );
  });

  it('does not hide a semantic admission error behind the adaptive evidence lane', async () => {
    const semanticError = Object.assign(new Error('Incomplete kernel'), {
      code: 'SCION_LOCAL_INCOMPLETE',
      admissionIssues: ['lesson-1:key-terms-count:1/3'],
    });
    mocks.runScionLocalCompletion.mockRejectedValue(semanticError);

    await expect(
      act(async () => {
        await reader.streamProvider('public', '', 'scion-public', 'System', 'Course', {
          task: 'blueprintEnrichment',
        });
      }),
    ).rejects.toThrow('Incomplete kernel');

    expect(mocks.composeAlgiResponse).not.toHaveBeenCalled();
  });

  it('records semantic issue and kernel-shape evidence on a local retry', async () => {
    mocks.runScionLocalCompletion.mockImplementation(async (options) => {
      const error = Object.assign(new Error('Incomplete kernel'), {
        code: 'SCION_LOCAL_INCOMPLETE',
        retryable: true,
        admissionIssues: ['lesson-2:key-terms-count:1/3'],
        kernelShape: [{ lessonId: 'lesson-2', facts: 5, keyTerms: 1, mc: 0 }],
      });
      options.onRetry(1, 2, 250, error);
      throw error;
    });
    const onApiCallEvent = vi.fn();

    await expect(
      act(async () => {
        await reader.streamProvider('public', '', 'scion-public', 'System', 'Course: Design', {
          task: 'blueprintEnrichment',
          onApiCallEvent,
        });
      }),
    ).rejects.toThrow('Incomplete kernel');

    expect(onApiCallEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'streamRetryCall',
        admissionIssues: ['lesson-2:key-terms-count:1/3'],
        kernelShape: [{ lessonId: 'lesson-2', facts: 5, keyTerms: 1, mc: 0 }],
      }),
    );
    expect(onApiCallEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'failedCall',
        admissionIssues: ['lesson-2:key-terms-count:1/3'],
      }),
    );
  });

  it('forwards deferred kernel shape to the canonical admission receipt', async () => {
    mocks.runScionLocalCompletion.mockResolvedValue({
      fullText: '{"lessons":[]}',
      tokenCount: 4,
      attempt: 2,
      retryCount: 1,
      maxRetries: 2,
      messages: [
        { role: 'system', content: 'System' },
        { role: 'user', content: 'Course: Design' },
      ],
      repairs: [],
      contractIncomplete: true,
      admissionIssues: ['lesson-2:key-terms-count:1/3'],
      kernelShape: [{ lessonId: 'lesson-2', facts: 5, keyTerms: 1, mc: 2 }],
    });
    const onApiCallEvent = vi.fn();

    await act(async () => {
      await reader.streamProvider('public', '', 'scion-public', 'System', 'Course: Design', {
        task: 'blueprintEnrichment',
        onApiCallEvent,
      });
    });

    expect(onApiCallEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'pipelineDecision',
        stage: 'local-compiler',
        admissionIssues: ['lesson-2:key-terms-count:1/3'],
        kernelShape: [{ lessonId: 'lesson-2', facts: 5, keyTerms: 1, mc: 2 }],
      }),
    );
  });

  it('records the local server native adapter route carried by the model response', async () => {
    mocks.buildProviderTextRequest.mockReturnValue({
      url: 'http://127.0.0.1:8799/v1/chat/completions',
      headers: { 'Content-Type': 'application/json', 'X-Scion-Task-Family': 'lesson-kernel' },
      body: { stream: true },
      parseChunk: (parsed) => parsed.choices?.[0]?.delta?.content || null,
    });
    const route = {
      protocol: 'scion-adapter-runtime-route-v1',
      mode: 'adapter',
      taskFamily: 'lesson-kernel',
      reason: 'exact-task-family-match',
      adapterId: 'scion-test',
      manifestSha256: 'a'.repeat(64),
      scopeIdentitySha256: 'b'.repeat(64),
      nativeAdapterActive: true,
      adapterScale: 1,
      modelCalls: 2,
      factLedgerOnly: true,
    };
    const body = [
      `data: ${JSON.stringify({ choices: [{ delta: { content: '{"ok":true}' } }], scion_adapter_route: route })}`,
      'data: [DONE]',
      '',
    ].join('\n\n');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(body, { status: 200 }));
    const onApiCallEvent = vi.fn();

    let result;
    await act(async () => {
      result = await reader.streamProvider('local', '', 'scion-1', 'System', 'Course', {
        task: 'blueprintEnrichment',
        onApiCallEvent,
      });
    });

    expect(result.fullText).toBe('{"ok":true}');
    expect(result.adapterRoutes).toEqual([
      expect.objectContaining({
        taskFamily: 'lesson-kernel',
        routeMode: 'adapter',
        routeModelCalls: 2,
        factLedgerOnly: true,
      }),
    ]);
    expect(onApiCallEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'scionAdapterRoute',
        routeProtocol: 'scion-adapter-runtime-route-v1',
        routeMode: 'adapter',
        taskFamily: 'lesson-kernel',
        adapterId: 'scion-test',
        adapterManifestSha256: 'a'.repeat(64),
        adapterScopeIdentitySha256: 'b'.repeat(64),
        nativeAdapterActive: true,
        routeModelCalls: 2,
        factLedgerOnly: true,
        execution: 'local-server',
      }),
    );
  });
});
