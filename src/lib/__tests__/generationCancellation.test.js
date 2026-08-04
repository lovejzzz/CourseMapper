import { describe, expect, it } from 'vitest';

import {
  beginGenerationEpoch,
  cancelGenerationFeatureActivity,
  cancelGenerationEpoch,
  cancelFeatureGenerationEpoch,
  captureFeatureGenerationEpoch,
  createGenerationAbortController,
  isFeatureGenerationEpochCancelled,
  isGenerationEpochCancelled,
  readGenerationActivity,
} from '../generationCancellation.js';

describe('generation cancellation epoch', () => {
  it('invalidates every remaining stage in the stopped run', () => {
    const epochRef = { current: 0 };
    const runEpoch = beginGenerationEpoch(epochRef);

    expect(isGenerationEpochCancelled(epochRef, runEpoch)).toBe(false);
    cancelGenerationEpoch(epochRef);
    expect(isGenerationEpochCancelled(epochRef, runEpoch)).toBe(true);
  });

  it('keeps an old run invalid after a later run begins', () => {
    const epochRef = { current: 0 };
    const oldRunEpoch = beginGenerationEpoch(epochRef);
    cancelGenerationEpoch(epochRef);
    const newRunEpoch = beginGenerationEpoch(epochRef);

    expect(isGenerationEpochCancelled(epochRef, oldRunEpoch)).toBe(true);
    expect(isGenerationEpochCancelled(epochRef, newRunEpoch)).toBe(false);
  });

  it('allows overlapping runs until the user actually stops them', () => {
    const epochRef = { current: 0 };
    const firstRunEpoch = beginGenerationEpoch(epochRef);
    const secondRunEpoch = beginGenerationEpoch(epochRef);

    expect(isGenerationEpochCancelled(epochRef, firstRunEpoch)).toBe(false);
    expect(isGenerationEpochCancelled(epochRef, secondRunEpoch)).toBe(false);
  });

  it('cancels one feature without invalidating its siblings', () => {
    const featureEpochRef = { current: new Map() };
    const lessonPlanEpoch = captureFeatureGenerationEpoch(featureEpochRef, 'lessonPlans');
    const rubricEpoch = captureFeatureGenerationEpoch(featureEpochRef, 'rubrics');

    cancelFeatureGenerationEpoch(featureEpochRef, 'lessonPlans');

    expect(isFeatureGenerationEpochCancelled(featureEpochRef, 'lessonPlans', lessonPlanEpoch)).toBe(true);
    expect(isFeatureGenerationEpochCancelled(featureEpochRef, 'rubrics', rubricEpoch)).toBe(false);
  });

  it('cannot create a fresh provider controller after stop', () => {
    const epochRef = { current: 0 };
    const runEpoch = beginGenerationEpoch(epochRef);
    let controllerCount = 0;
    class FakeAbortController {
      constructor() {
        controllerCount += 1;
      }
    }

    expect(createGenerationAbortController(epochRef, runEpoch, FakeAbortController)).toBeInstanceOf(
      FakeAbortController,
    );
    cancelGenerationEpoch(epochRef);
    expect(createGenerationAbortController(epochRef, runEpoch, FakeAbortController)).toBeNull();
    expect(controllerCount).toBe(1);
  });

  it('keeps sibling operations visible when one finishes', () => {
    const operationRef = { current: new Map() };
    operationRef.current.set('run-a', new Set(['lessonPlans']));
    operationRef.current.set('run-b', new Set(['quizBank']));

    operationRef.current.delete('run-a');

    expect(readGenerationActivity(operationRef)).toEqual(new Set(['quizBank']));
  });

  it('removes a targeted feature without hiding unrelated active work', () => {
    const operationRef = { current: new Map() };
    operationRef.current.set('batch', new Set(['lessonPlans', 'quizBank']));
    operationRef.current.set('regen', new Set(['lessonPlans']));

    cancelGenerationFeatureActivity(operationRef, 'lessonPlans');

    expect(readGenerationActivity(operationRef)).toEqual(new Set(['quizBank']));
  });

  it('clears every active operation for stop-all', () => {
    const operationRef = { current: new Map() };
    operationRef.current.set('run-a', new Set(['lessonPlans']));
    operationRef.current.set('run-b', new Set(['quizBank']));

    operationRef.current.clear();

    expect(readGenerationActivity(operationRef)).toEqual(new Set());
  });

  it('blocks a deferred phase from committing after stop', async () => {
    const epochRef = { current: 0 };
    const runEpoch = beginGenerationEpoch(epochRef);
    let releasePhase;
    const phase = new Promise((resolve) => {
      releasePhase = resolve;
    });
    const commits = [];
    const pending = (async () => {
      const value = await phase;
      if (isGenerationEpochCancelled(epochRef, runEpoch)) return;
      commits.push(value);
    })();

    cancelGenerationEpoch(epochRef);
    releasePhase('course-graph');
    await pending;

    expect(commits).toEqual([]);
  });

  it('lets a deferred sibling commit after a targeted feature stop', async () => {
    const featureEpochRef = { current: new Map() };
    const lessonPlanEpoch = captureFeatureGenerationEpoch(featureEpochRef, 'lessonPlans');
    const rubricEpoch = captureFeatureGenerationEpoch(featureEpochRef, 'rubrics');
    let releasePhase;
    const phase = new Promise((resolve) => {
      releasePhase = resolve;
    });
    const commits = [];
    const commitFeature = async (featureId, featureEpoch) => {
      await phase;
      if (isFeatureGenerationEpochCancelled(featureEpochRef, featureId, featureEpoch)) return;
      commits.push(featureId);
    };
    const pending = [commitFeature('lessonPlans', lessonPlanEpoch), commitFeature('rubrics', rubricEpoch)];

    cancelFeatureGenerationEpoch(featureEpochRef, 'lessonPlans');
    releasePhase();
    await Promise.all(pending);

    expect(commits).toEqual(['rubrics']);
  });
});
