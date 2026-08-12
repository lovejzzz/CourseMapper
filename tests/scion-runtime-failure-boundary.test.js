import { describe, expect, it, vi } from 'vitest';

import { runNativeSkeletonGenerationFlow } from '../src/lib/nativeSkeletonGenerationRuntime.js';
import { isNonFallbackScionRuntimeError } from '../src/lib/scionRuntimeErrors.js';

function nativeFlowInput(streamProvider, recordApiCallEvent) {
  return [
    'One lesson about keyboard accessibility.',
    'public',
    '',
    'scion-public',
    2048,
    {},
    { courseMapOutputTokens: 2048 },
    'Scion',
    streamProvider,
    recordApiCallEvent,
    vi.fn(),
    { current: '' },
    { expected: 1, confidence: 'high' },
    'coursemapper-stream',
  ];
}

function nativeFlowOutput(addLog = vi.fn()) {
  return [
    { current: null },
    vi.fn(),
    { current: null },
    vi.fn(),
    vi.fn(),
    { current: '' },
    { current: null },
    vi.fn(),
    addLog,
    vi.fn(),
    vi.fn(),
    vi.fn(),
    vi.fn(),
    vi.fn(),
    vi.fn(),
    vi.fn(),
    vi.fn(),
    vi.fn(),
  ];
}

describe('Scion runtime failure boundary', () => {
  it('recognizes a nested browser-runtime failure without treating content failures as device failures', () => {
    const runtimeFailure = Object.assign(new Error('Scion could not start.'), {
      cause: Object.assign(new Error('WebGPU unavailable.'), { code: 'SCION_WLLAMA_WEBGPU' }),
    });

    expect(isNonFallbackScionRuntimeError(runtimeFailure)).toBe(true);
    expect(
      isNonFallbackScionRuntimeError(Object.assign(new Error('Incomplete JSON.'), { code: 'SCION_LOCAL_INCOMPLETE' })),
    ).toBe(false);
  });

  it('stops at one provider attempt when Scion runtime activation fails', async () => {
    const runtimeFailure = Object.assign(new Error('Scion removed an incomplete local model download.'), {
      code: 'SCION_WLLAMA_CACHE_INCOMPLETE',
    });
    const streamProvider = vi.fn(async () => {
      throw runtimeFailure;
    });
    const recordApiCallEvent = vi.fn();
    const addLog = vi.fn();

    await expect(
      runNativeSkeletonGenerationFlow(nativeFlowInput(streamProvider, recordApiCallEvent), nativeFlowOutput(addLog)),
    ).rejects.toBe(runtimeFailure);

    expect(streamProvider).toHaveBeenCalledTimes(1);
    expect(recordApiCallEvent).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'nativeAuthoringFellBack' }));
    expect(addLog).not.toHaveBeenCalledWith(
      'Scion',
      expect.stringContaining('falling back to the prose course-map path'),
      'warning',
    );
  });

  it('stops before research instead of falling back when Pass A cannot name the lesson', async () => {
    const streamProvider = vi.fn(async () => ({
      fullText: JSON.stringify({
        course: { name: 'Course', term: 'TBD', goals: [] },
        sessions: [{ id: 's1', order: 1, title: 'Session 1 topic', sectionTitles: ['Session 1 topic'] }],
        assessments: [],
        readings: [],
        resources: [],
      }),
    }));
    const recordApiCallEvent = vi.fn();
    const addLog = vi.fn();

    await expect(
      runNativeSkeletonGenerationFlow(nativeFlowInput(streamProvider, recordApiCallEvent), nativeFlowOutput(addLog)),
    ).rejects.toMatchObject({ code: 'SCION_INSTRUCTIONAL_PLAN_NOT_READY' });

    expect(streamProvider).toHaveBeenCalledTimes(1);
    expect(recordApiCallEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'pipelineDecision', label: 'Instructional plan blocked' }),
    );
    expect(recordApiCallEvent).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'nativeAuthoringFellBack' }));
  });
});
