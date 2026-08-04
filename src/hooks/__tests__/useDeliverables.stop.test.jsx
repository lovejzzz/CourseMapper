/**
 * @vitest-environment happy-dom
 */
import React, { useContext, useEffect } from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const compilerControl = vi.hoisted(() => ({ release: null, signalStarted: null }));
const streamControl = vi.hoisted(() => ({ release: null, response: '', signalStarted: null }));

vi.mock('../../lib/courseBlueprintCompiler', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    compileBlueprintDeliverablesYielding: async (...args) => {
      const result = actual.compileBlueprintDeliverables(...args);
      compilerControl.signalStarted?.();
      await new Promise((resolve) => {
        compilerControl.release = resolve;
      });
      return result;
    },
  };
});

vi.mock('../useStreamReader', () => ({
  default: () => ({
    streamProvider: async (...args) => {
      streamControl.signalStarted?.();
      await new Promise((resolve) => {
        streamControl.release = resolve;
      });
      args.at(-1)?.onChunk?.(streamControl.response);
      return { fullText: streamControl.response, modelRequests: 1 };
    },
    parsePartialJSON: (text) => {
      try {
        return JSON.parse(text);
      } catch {
        return null;
      }
    },
    getLastParseRecovery: () => null,
  }),
}));

import useDeliverables from '../useDeliverables';
import { CourseStateContext, CourseStoreProvider } from '../../model/courseStore.jsx';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const courseMap = {
  courseName: 'Cancellation Lab',
  courseDescription: 'A compact course used to verify cancellation.',
  semester: 'Fall',
  lessons: [
    {
      title: 'Foundations',
      sections: [
        {
          topicSection: 'Foundations',
          learningObjectives: 'Explain the foundation and apply it to a concrete case.',
          weeklyAssessments: 'Submit a short analysis.',
          asyncActivities: 'Read and annotate the case.',
          syncActivities: 'Discuss the case in pairs.',
          supportingResources: 'Instructor case notes.',
          presentationFormat: 'Mini-lecture and workshop.',
        },
      ],
    },
    {
      title: 'Applications',
      sections: [
        {
          topicSection: 'Applications',
          learningObjectives: 'Apply the foundation to a second concrete case.',
          weeklyAssessments: 'Submit an applied analysis.',
          asyncActivities: 'Annotate the application case.',
          syncActivities: 'Compare applications in pairs.',
          supportingResources: 'Instructor application notes.',
          presentationFormat: 'Workshop.',
        },
      ],
    },
  ],
};

function Harness({ onHook, onState, callbacks }) {
  const state = useContext(CourseStateContext);
  const hook = useDeliverables({
    provider: '',
    modelId: '',
    apiKey: '',
    maxOutputTokens: 4000,
    modelCapabilities: {},
    generationPlan: { blueprintCompiler: true, blueprintEnrichment: false },
    deliverableConfig: {},
    lockedLessons: new Set(),
    columns: [],
    sourceBrief:
      'Use only these instructor-provided facts: The course has one lesson. The case is instructor-authored. No outside sources are needed.',
    onCourseGraph: callbacks.onCourseGraph,
    onCourseMapRepair: callbacks.onCourseMapRepair,
  });
  useEffect(() => onHook(hook), [hook, onHook]);
  useEffect(() => onState(state), [state, onState]);
  return null;
}

describe('useDeliverables stop restoration', () => {
  let container;
  let root;
  let started;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    compilerControl.release = null;
    streamControl.release = null;
    streamControl.response = '';
    streamControl.signalStarted = null;
    started = new Promise((resolve) => {
      compilerControl.signalStarted = resolve;
    });
  });

  afterEach(() => {
    compilerControl.release?.();
    streamControl.release?.();
    compilerControl.signalStarted = null;
    if (root) {
      act(() => root.unmount());
    }
    container.remove();
  });

  function armStream(response) {
    streamControl.release = null;
    streamControl.response = JSON.stringify(response);
    return new Promise((resolve) => {
      streamControl.signalStarted = resolve;
    });
  }

  async function renderHarness(initialState) {
    let hook;
    let state;
    const callbacks = { onCourseGraph: vi.fn(), onCourseMapRepair: vi.fn() };
    root = createRoot(container);
    await act(async () => {
      root.render(
        <CourseStoreProvider initialState={initialState}>
          <Harness
            callbacks={callbacks}
            onHook={(value) => {
              hook = value;
            }}
            onState={(value) => {
              state = value;
            }}
          />
        </CourseStoreProvider>,
      );
    });
    return { callbacks, getHook: () => hook, getState: () => state };
  }

  it('restores every pre-run entry after global Stop and blocks late callbacks', async () => {
    const previous = {
      status: 'done',
      data: { lessonPlans: [{ lessonNumber: 1, title: 'Original lesson' }] },
      error: null,
      stale: true,
      staleConfidence: 'high',
      staleEdits: { lessonIndices: [0] },
    };
    const harness = await renderHarness({ deliverables: { lessonPlans: previous } });
    let generation;
    await act(async () => {
      generation = harness.getHook().generateAll(courseMap, ['lessonPlans']);
      await started;
    });
    harness.callbacks.onCourseGraph.mockClear();
    harness.callbacks.onCourseMapRepair.mockClear();

    act(() => harness.getHook().stopGenerating());
    expect(harness.getState().deliverables.lessonPlans).toBe(previous);

    compilerControl.release();
    await act(async () => generation);
    expect(harness.getState().deliverables.lessonPlans).toBe(previous);
    expect(harness.callbacks.onCourseGraph).not.toHaveBeenCalled();
    expect(harness.callbacks.onCourseMapRepair).not.toHaveBeenCalled();
  });

  it('restores a targeted feature while its sibling remains active and completes', async () => {
    const lessonPlans = {
      status: 'done',
      data: { lessonPlans: [{ lessonNumber: 1, title: 'Original lesson' }] },
      stale: true,
    };
    const studyGuides = {
      status: 'done',
      data: { studyGuides: [{ lessonNumber: 1, title: 'Original guide' }] },
      stale: true,
    };
    const harness = await renderHarness({ deliverables: { lessonPlans, studyGuides } });
    let generation;
    await act(async () => {
      generation = harness.getHook().generateAll(courseMap, ['lessonPlans', 'studyGuides']);
      await started;
    });

    act(() => harness.getHook().stopGenerating('lessonPlans'));
    expect(harness.getState().deliverables.lessonPlans).toBe(lessonPlans);
    expect(harness.getState().deliverables.studyGuides.status).toBe('streaming');

    compilerControl.release();
    const result = await act(async () => generation);
    expect(harness.getState().deliverables.lessonPlans).toBe(lessonPlans);
    expect(harness.getState().deliverables.studyGuides.status).toBe('done');
    expect(result).toMatchObject({ status: 'partial', completedFeatureIds: ['studyGuides'] });
  });

  it('preserves lesson one when a same-task finalizer retry stops during lesson two', async () => {
    const previous = {
      status: 'done',
      data: {
        lessonPlans: [
          { lessonNumber: 1, lessonTitle: 'Lesson 1: Original' },
          { lessonNumber: 2, lessonTitle: 'Lesson 2: Original' },
        ],
      },
      error: null,
      stale: true,
      staleConfidence: 'high',
      staleEdits: { lessonIndices: [0, 1] },
    };
    const harness = await renderHarness({ deliverables: { lessonPlans: previous } });
    const firstStarted = armStream({
      plans: [{ lt: 'Lesson 1: Revised', mt: ['Revised instructor material'] }],
    });
    let firstGeneration;
    await act(async () => {
      firstGeneration = harness.getHook().regenerateLesson('lessonPlans', courseMap, 0, {
        mode: 'finalizerRetry',
        useBlueprintCompiler: false,
        currentData: previous.data,
        currentEntry: previous,
      });
      await firstStarted;
    });
    streamControl.release();
    let firstResult;
    await act(async () => {
      firstResult = await firstGeneration;
    });
    expect(firstResult.entry.data.lessonPlans[0].materials).toContain('Revised instructor material');

    const secondStarted = armStream({
      plans: [{ lt: 'Lesson 2: Revised' }],
    });
    let secondGeneration;
    await act(async () => {
      secondGeneration = harness.getHook().regenerateLesson('lessonPlans', courseMap, 1, {
        mode: 'finalizerRetry',
        useBlueprintCompiler: false,
        currentData: firstResult.data,
        currentEntry: firstResult.entry,
      });
      await secondStarted;
    });

    act(() => harness.getHook().stopGenerating('lessonPlans'));
    expect(harness.getState().deliverables.lessonPlans).toBe(firstResult.entry);

    streamControl.release();
    let secondResult;
    await act(async () => {
      secondResult = await secondGeneration;
    });
    expect(secondResult.status).toBe('aborted');
    expect(harness.getState().deliverables.lessonPlans).toBe(firstResult.entry);
  });
});
