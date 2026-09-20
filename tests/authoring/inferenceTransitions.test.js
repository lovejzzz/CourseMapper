import { afterEach, it, expect, vi } from 'vitest';
import { setAuthoringExecutionMode } from '../../src/lib/authoring/inferencePolicy.js';
import { runScionLocalCompletion } from '../../src/lib/scionLocalProvider.js';
afterEach(() => setAuthoringExecutionMode('site-model'));
it.each(['runtime-import', 'model-load', 'attempt-callback'])(
  'blocks completion after a mode switch during %s',
  async (stage) => {
    setAuthoringExecutionMode('site-model');
    const switchMode = () => setAuthoringExecutionMode('external-agent');
    const runtime = {
      loadScionBrowserWllama: vi.fn(async () => {
        if (stage === 'model-load') switchMode();
      }),
      completeScionBrowserWllama: vi.fn(async () => 'should never be generated'),
    };
    const runtimeLoader = vi.fn(async () => {
      if (stage === 'runtime-import') switchMode();
      return runtime;
    });
    const onAttemptStart = vi.fn(() => {
      if (stage === 'attempt-callback') switchMode();
    });
    await expect(runScionLocalCompletion({ runtimeLoader, onAttemptStart })).rejects.toMatchObject({
      code: 'EXTERNAL_MODE_MODEL_DISABLED',
    });
    expect(runtime.completeScionBrowserWllama).not.toHaveBeenCalled();
    if (stage === 'runtime-import') expect(runtime.loadScionBrowserWllama).not.toHaveBeenCalled();
    if (stage !== 'attempt-callback') expect(onAttemptStart).not.toHaveBeenCalled();
  },
);
