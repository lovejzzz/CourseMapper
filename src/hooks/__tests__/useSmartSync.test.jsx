/**
 * @vitest-environment happy-dom
 */
import React, { useEffect } from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import useSmartSync from '../useSmartSync';
import { applyCanonicalPatchesToCourseMap } from '../../lib/artifactBlueprintProjection';
// v0.14.7 WS-G2: runSync dynamic-imports these on the course-map branch.
// Pre-warm them so the import() calls resolve as microtasks under fake
// timers (a cold module load is real I/O the fake-timer flush can't wait
// out, and the stale-marking assertions would race it).
import '../../lib/syncBlastRadius';
import '../../lib/genome/lessonKernelCache';
import '../../lib/instructorPreferenceRuntime';
import '../../lib/lessonDepth';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function Harness({ props, onHook }) {
  const hook = useSmartSync(props);
  useEffect(() => {
    onHook(hook);
  }, [hook, onHook]);
  return null;
}

describe('useSmartSync canonical patch requests', () => {
  let container;
  let root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  it('serializes public Scion sync work against its single browser model', async () => {
    const courseMapRef = {
      current: { lessons: [{ title: 'One', sections: [{ topicSection: 'One' }] }] },
    };
    let active = 0;
    let peak = 0;
    const deliv = {
      isGenerating: false,
      deliverables: {
        lessonPlans: { status: 'done', data: { lessonPlans: [] } },
        assignments: { status: 'done', data: { assignments: [] } },
        rubrics: { status: 'done', data: { rubrics: [] } },
      },
      generateAll: vi.fn(),
      markFeatureStale: vi.fn(),
      regenerateLesson: vi.fn(async (featureId) => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active -= 1;
        return { status: 'done', featureId, syncSource: 'blueprint-compiler', providerCallCount: 0 };
      }),
    };
    let hook;

    root = createRoot(container);
    await act(async () => {
      root.render(
        <Harness
          onHook={(value) => {
            hook = value;
          }}
          props={{
            deliv,
            gen: { isStreaming: false },
            courseMapRef,
            provider: 'public',
            selectedFeatures: ['courseMap', 'lessonPlans', 'assignments', 'rubrics'],
            onSyncComplete: vi.fn(),
            onRequestProposal: vi.fn(),
          }}
        />,
      );
    });

    await act(async () => {
      await hook.executeSyncPlan(
        [
          { featureId: 'lessonPlans', lessonIndices: [0] },
          { featureId: 'assignments', lessonIndices: [0] },
          { featureId: 'rubrics', lessonIndices: [0] },
        ],
        'topic/section',
      );
    });

    expect(deliv.regenerateLesson).toHaveBeenCalledTimes(3);
    expect(peak).toBe(1);
  });

  afterEach(() => {
    vi.useRealTimers();
    if (root) {
      act(() => {
        root.unmount();
      });
    }
    container.remove();
  });

  it('uses the committed canonical map for later full-feature syncs after an earlier build normalizes it', async () => {
    const before = { lessons: [{ title: 'Before normalization', sections: [] }] };
    const after = { lessons: [{ title: 'Canonical course map', sections: [] }] };
    const courseMapRef = { current: before };
    const deliv = {
      isGenerating: false,
      deliverables: {},
      markFeatureStale: vi.fn(),
      regenerateLesson: vi.fn(async (_id, map) => {
        expect(map).toBe(after);
        return { status: 'done', syncSource: 'blueprint-compiler', providerCallCount: 0 };
      }),
      generateAll: vi.fn(async (map, [id]) => {
        if (id === 'syllabus') courseMapRef.current = after;
        else expect(map).toBe(after);
        return { completedFeatureIds: [id], providerCallCount: 0 };
      }),
    };
    let hook;
    root = createRoot(container);
    await act(async () =>
      root.render(
        <Harness
          onHook={(value) => {
            hook = value;
          }}
          props={{
            deliv,
            gen: { isStreaming: false },
            courseMapRef,
            provider: 'public',
            selectedFeatures: ['syllabus', 'lessonPlans', 'discussions', 'courseFaq'],
          }}
        />,
      ),
    );
    let completed;
    await act(async () => {
      completed = await hook.executeSyncPlan([
        { featureId: 'syllabus', lessonIndices: null },
        { featureId: 'lessonPlans', lessonIndices: [0] },
        { featureId: 'discussions', lessonIndices: null },
        { featureId: 'courseFaq', lessonIndices: null },
      ]);
    });
    expect([...completed]).toEqual(['syllabus', 'lessonPlans', 'discussions', 'courseFaq']);
    expect(completed.syncSummary.resultDetails?.some((x) => x.status === 'error') || false).toBe(false);
  });

  it('resolves ambiguous artifact edits into blueprint patches before compiler sync', async () => {
    const courseMapRef = {
      current: {
        lessons: [
          {
            title: 'Model Evaluation',
            sections: [{ topicSection: 'Evaluation metrics', learningObjectives: 'Explain model evaluation.' }],
          },
        ],
      },
    };
    let compiledCourseMap = null;
    const deliv = {
      isGenerating: false,
      deliverables: {
        lessonPlans: { status: 'done' },
        slideDecks: { status: 'done' },
      },
      generateAll: vi.fn(),
      markFeatureStale: vi.fn(),
      regenerateLesson: vi.fn(async (_featureId, nextCourseMap) => {
        compiledCourseMap = nextCourseMap;
        return { status: 'done', syncSource: 'blueprint-compiler', providerCallCount: 0 };
      }),
    };
    const resolvedPatch = {
      sourceFeatureId: 'lessonPlans',
      lessonIndex: 0,
      sectionIndex: 0,
      field: 'topicSection',
      label: 'topic/section',
      oldValue: 'Evaluation metrics',
      value: 'Evaluation metrics through the Riverton validation dataset.',
    };
    const onResolveCanonicalPatchRequests = vi.fn(async () => ({
      patches: [resolvedPatch],
      providerCallCount: 1,
    }));
    const onApplyCanonicalPatches = vi.fn((patches) => {
      const result = applyCanonicalPatchesToCourseMap(courseMapRef.current, patches);
      if (result.courseMap) courseMapRef.current = result.courseMap;
      return result;
    });
    let hook;

    root = createRoot(container);
    await act(async () => {
      root.render(
        <Harness
          onHook={(value) => {
            hook = value;
          }}
          props={{
            deliv,
            gen: { isStreaming: false },
            courseMapRef,
            selectedFeatures: ['courseMap', 'lessonPlans', 'slideDecks'],
            onSyncComplete: vi.fn(),
            onRequestProposal: vi.fn(),
            onApplyCanonicalPatches,
            onResolveCanonicalPatchRequests,
          }}
        />,
      );
    });

    const request = {
      id: 'request-1',
      sourceFeatureId: 'lessonPlans',
      lessonIndex: 0,
      sectionIndex: 0,
      label: 'course-design edit',
      editPath: ['lessonPlans', 0, 'customInstruction'],
      artifactValue: 'Use the Riverton validation dataset.',
    };
    let completed;
    await act(async () => {
      completed = await hook.executeSyncPlan(
        [{ featureId: 'lessonPlans', lessonIndices: [0], canonicalPatchRequests: [request] }],
        'course-design edit',
      );
    });

    expect(onResolveCanonicalPatchRequests).toHaveBeenCalledWith(
      [request],
      expect.objectContaining({
        changedFieldsSummary: 'course-design edit',
        courseMap: expect.objectContaining({ lessons: expect.any(Array) }),
      }),
    );
    expect(onApplyCanonicalPatches).toHaveBeenCalledWith([resolvedPatch], expect.any(Object));
    expect(deliv.regenerateLesson).toHaveBeenCalledWith(
      'lessonPlans',
      expect.any(Object),
      0,
      expect.objectContaining({
        syncGenId: expect.any(Number),
        currentData: null,
        currentEntry: deliv.deliverables.lessonPlans,
      }),
    );
    expect(compiledCourseMap.lessons[0].sections[0].topicSection).toContain('Riverton validation dataset');
    expect([...completed]).toEqual(['lessonPlans']);
    expect(completed.syncSummary).toMatchObject({
      canonicalPatchRequests: [request],
      canonicalPatches: [resolvedPatch],
      providerCallCount: 1,
      compilerSyncCount: 1,
      modelFallbackCount: 1,
    });
  });

  it('feeds each completed lesson snapshot into the next lesson regeneration', async () => {
    const courseMapRef = {
      current: {
        lessons: [
          { title: 'One', sections: [{ topicSection: 'One' }] },
          { title: 'Two', sections: [{ topicSection: 'Two' }] },
        ],
      },
    };
    const startingData = { lessonPlans: [{ lessonNumber: 1 }, { lessonNumber: 2 }] };
    const deliv = {
      isGenerating: false,
      deliverables: { lessonPlans: { status: 'done', data: startingData } },
      generateAll: vi.fn(),
      markFeatureStale: vi.fn(),
      regenerateLesson: vi.fn(async (_featureId, _courseMap, lessonIndex, options) => {
        const data = {
          ...options.currentData,
          completedLessons: [...(options.currentData.completedLessons || []), lessonIndex],
        };
        return {
          status: 'done',
          syncSource: 'blueprint-compiler',
          data,
          entry: { status: 'done', data, error: null, stale: false, staleConfidence: null },
        };
      }),
    };
    let hook;

    root = createRoot(container);
    await act(async () => {
      root.render(
        <Harness
          onHook={(value) => {
            hook = value;
          }}
          props={{
            deliv,
            gen: { isStreaming: false },
            courseMapRef,
            selectedFeatures: ['courseMap', 'lessonPlans'],
            onSyncComplete: vi.fn(),
            onRequestProposal: vi.fn(),
          }}
        />,
      );
    });

    await act(async () => {
      await hook.executeSyncPlan([{ featureId: 'lessonPlans', lessonIndices: [0, 1] }], 'two lessons');
    });

    expect(deliv.regenerateLesson).toHaveBeenCalledTimes(2);
    expect(deliv.regenerateLesson.mock.calls[0][3].currentData).toBe(startingData);
    expect(deliv.regenerateLesson.mock.calls[1][3].currentData).toMatchObject({ completedLessons: [0] });
    expect(deliv.regenerateLesson.mock.calls[1][3].currentEntry).toMatchObject({
      status: 'done',
      data: { completedLessons: [0] },
      stale: false,
    });
  });

  it('stops the lesson sequence and withholds completion after an aborted regeneration', async () => {
    const courseMapRef = {
      current: {
        lessons: [
          { title: 'One', sections: [{ topicSection: 'One' }] },
          { title: 'Two', sections: [{ topicSection: 'Two' }] },
        ],
      },
    };
    const onSyncComplete = vi.fn();
    const deliv = {
      isGenerating: false,
      deliverables: {
        lessonPlans: { status: 'done', data: { lessonPlans: [] } },
        syllabus: { status: 'done', data: { courseTitle: 'Course' } },
      },
      generateAll: vi.fn(async () => ({ status: 'aborted', completedFeatureIds: [] })),
      markFeatureStale: vi.fn(),
      regenerateLesson: vi.fn(async () => ({ status: 'aborted', data: { lessonPlans: [] } })),
    };
    let hook;

    root = createRoot(container);
    await act(async () => {
      root.render(
        <Harness
          onHook={(value) => {
            hook = value;
          }}
          props={{
            deliv,
            gen: { isStreaming: false },
            courseMapRef,
            selectedFeatures: ['courseMap', 'lessonPlans', 'syllabus'],
            onSyncComplete,
            onRequestProposal: vi.fn(),
          }}
        />,
      );
    });

    let completed;
    await act(async () => {
      completed = await hook.executeSyncPlan(
        [
          { featureId: 'lessonPlans', lessonIndices: [0, 1] },
          { featureId: 'syllabus', lessonIndices: null },
        ],
        'two lessons',
      );
    });

    expect(deliv.regenerateLesson).toHaveBeenCalledTimes(1);
    expect(deliv.generateAll).toHaveBeenCalledTimes(1);
    expect([...completed]).toEqual([]);
    expect(onSyncComplete).not.toHaveBeenCalled();
    expect(completed.syncSummary.resultDetails).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ status: 'aborted', featureId: 'lessonPlans', lessonIndex: 0 }),
        expect.objectContaining({ status: 'aborted', featureId: 'syllabus', lessonIndices: null }),
      ]),
    );
  });

  it('keeps a partial sync completion bound to the epoch captured before Stop', async () => {
    const courseMapRef = {
      current: { lessons: [{ title: 'One', sections: [{ topicSection: 'One' }] }] },
    };
    let workflowEpoch = 7;
    let settleSecondFeature;
    const secondFeature = new Promise((resolve) => {
      settleSecondFeature = resolve;
    });
    const setSyncRegradeEpoch = vi.fn();
    const onSyncComplete = vi.fn((featureIds, capturedEpoch) => {
      if (workflowEpoch !== capturedEpoch) return;
      setSyncRegradeEpoch(capturedEpoch);
    });
    const deliv = {
      isGenerating: false,
      deliverables: {
        lessonPlans: { status: 'done', data: { lessonPlans: [] } },
        syllabus: { status: 'done', data: { courseTitle: 'Course' } },
      },
      generateAll: vi.fn(async (_courseMap, [featureId]) => {
        if (featureId === 'lessonPlans') {
          return { status: 'complete', completedFeatureIds: ['lessonPlans'] };
        }
        return secondFeature;
      }),
      markFeatureStale: vi.fn(),
      regenerateLesson: vi.fn(),
    };
    let hook;

    root = createRoot(container);
    await act(async () => {
      root.render(
        <Harness
          onHook={(value) => {
            hook = value;
          }}
          props={{
            deliv,
            gen: { isStreaming: false },
            courseMapRef,
            selectedFeatures: ['courseMap', 'lessonPlans', 'syllabus'],
            workflowEpochRef: {
              get current() {
                return workflowEpoch;
              },
            },
            onSyncComplete,
            onRequestProposal: vi.fn(),
          }}
        />,
      );
    });

    let syncPromise;
    await act(async () => {
      syncPromise = hook.executeSyncPlan(
        [
          { featureId: 'lessonPlans', lessonIndices: null },
          { featureId: 'syllabus', lessonIndices: null },
        ],
        'partial stop',
      );
      await Promise.resolve();
    });
    expect(deliv.generateAll).toHaveBeenCalledTimes(2);

    // Global Stop advances the package epoch while the second feature is
    // still awaiting its hook-level abort result.
    workflowEpoch = 8;
    let completed;
    await act(async () => {
      settleSecondFeature({ status: 'aborted', completedFeatureIds: [] });
      completed = await syncPromise;
    });

    expect([...completed]).toEqual(['lessonPlans']);
    expect(completed.syncSummary).toMatchObject({ status: 'aborted', completedFeatureIds: ['lessonPlans'] });
    expect(onSyncComplete).not.toHaveBeenCalled();
    expect(setSyncRegradeEpoch).not.toHaveBeenCalled();
  });

  it('does not apply a resolved blueprint patch after Stop advances the workflow epoch', async () => {
    const workflowEpochRef = { current: 4 };
    const courseMapRef = {
      current: { lessons: [{ title: 'One', sections: [{ topicSection: 'Before' }] }] },
    };
    let settleResolver;
    const resolverResult = new Promise((resolve) => {
      settleResolver = resolve;
    });
    const onApplyCanonicalPatches = vi.fn();
    const onSyncComplete = vi.fn();
    const deliv = {
      isGenerating: false,
      deliverables: { lessonPlans: { status: 'done', data: { lessonPlans: [] } } },
      generateAll: vi.fn(),
      markFeatureStale: vi.fn(),
      regenerateLesson: vi.fn(),
    };
    let hook;

    root = createRoot(container);
    await act(async () => {
      root.render(
        <Harness
          onHook={(value) => {
            hook = value;
          }}
          props={{
            deliv,
            gen: { isStreaming: false },
            courseMapRef,
            selectedFeatures: ['courseMap', 'lessonPlans'],
            workflowEpochRef,
            onSyncComplete,
            onRequestProposal: vi.fn(),
            onApplyCanonicalPatches,
            onResolveCanonicalPatchRequests: vi.fn(() => resolverResult),
          }}
        />,
      );
    });

    let syncPromise;
    await act(async () => {
      syncPromise = hook.executeSyncPlan(
        [
          {
            featureId: 'lessonPlans',
            lessonIndices: [0],
            canonicalPatchRequests: [
              {
                id: 'late-patch',
                sourceFeatureId: 'lessonPlans',
                lessonIndex: 0,
                sectionIndex: 0,
                field: 'topicSection',
                value: 'After',
              },
            ],
          },
        ],
        'late resolver',
      );
      await Promise.resolve();
    });

    workflowEpochRef.current = 5;
    let completed;
    await act(async () => {
      settleResolver({
        patches: [
          {
            sourceFeatureId: 'lessonPlans',
            lessonIndex: 0,
            sectionIndex: 0,
            field: 'topicSection',
            value: 'After',
          },
        ],
      });
      completed = await syncPromise;
    });

    expect([...completed]).toEqual([]);
    expect(completed.syncSummary).toMatchObject({ status: 'aborted', completedFeatureIds: [] });
    expect(onApplyCanonicalPatches).not.toHaveBeenCalled();
    expect(deliv.regenerateLesson).not.toHaveBeenCalled();
    expect(onSyncComplete).not.toHaveBeenCalled();
  });

  it('marks course-map sync plan targets stale before waiting for approval', async () => {
    vi.useFakeTimers();
    const courseMapRef = {
      current: {
        lessons: [{ title: 'Foundations', sections: [{ topicSection: 'Foundations' }] }],
      },
    };
    const deliv = {
      isGenerating: false,
      deliverables: {
        lessonPlans: { status: 'done' },
        slideDecks: { status: 'done' },
      },
      generateAll: vi.fn(),
      markFeatureStale: vi.fn(),
      regenerateLesson: vi.fn(),
    };
    let hook;

    root = createRoot(container);
    await act(async () => {
      root.render(
        <Harness
          onHook={(value) => {
            hook = value;
          }}
          props={{
            deliv,
            gen: { isStreaming: false },
            courseMapRef,
            selectedFeatures: ['courseMap', 'lessonPlans', 'slideDecks'],
            onSyncComplete: vi.fn(),
            onRequestProposal: vi.fn(),
            onApplyCanonicalPatches: vi.fn(),
            onResolveCanonicalPatchRequests: vi.fn(),
          }}
        />,
      );
    });

    await act(async () => {
      hook.notifyEdit(null, '_structural');
      vi.advanceTimersByTime(2100);
      await Promise.resolve();
    });

    expect(deliv.markFeatureStale).toHaveBeenCalledWith(
      'lessonPlans',
      expect.objectContaining({ level: 'high', dominantField: '_structural' }),
      { lessonIndices: [], editKeys: ['_structural'], sourceFeatureId: null },
    );
    expect(deliv.markFeatureStale).toHaveBeenCalledWith(
      'slideDecks',
      expect.objectContaining({ level: 'high', dominantField: '_structural' }),
      { lessonIndices: [], editKeys: ['_structural'], sourceFeatureId: null },
    );
    expect(hook.pendingSyncSuggestion).toMatchObject({
      editSource: 'courseMap',
      plan: [
        expect.objectContaining({
          featureId: 'lessonPlans',
          staleEdits: { lessonIndices: [], editKeys: ['_structural'], sourceFeatureId: null },
        }),
        expect.objectContaining({
          featureId: 'slideDecks',
          staleEdits: { lessonIndices: [], editKeys: ['_structural'], sourceFeatureId: null },
        }),
      ],
    });
    vi.useRealTimers();
  });
});
