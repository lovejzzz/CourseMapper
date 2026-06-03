/**
 * @vitest-environment happy-dom
 */
import React, { useEffect } from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import useSmartSync from '../useSmartSync';
import { applyCanonicalPatchesToCourseMap } from '../../lib/artifactBlueprintProjection';

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

  afterEach(() => {
    if (root) {
      act(() => {
        root.unmount();
      });
    }
    container.remove();
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
    expect(deliv.regenerateLesson).toHaveBeenCalledWith('lessonPlans', expect.any(Object), 0, expect.any(Number));
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
});
