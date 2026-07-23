import { describe, expect, it } from 'vitest';
import { getWorkspaceSavePresentation } from '../workspaceSaveStatus';

describe('getWorkspaceSavePresentation', () => {
  it('keeps an in-flight quota fallback calm while generation continues', () => {
    expect(
      getWorkspaceSavePresentation({
        cloudStatus: 'idle',
        localStatus: 'error',
        generationRunning: true,
      }),
    ).toMatchObject({ failed: false, quiet: true, text: 'Saving locally…' });
  });

  it('shows a real local save failure after generation stops', () => {
    expect(
      getWorkspaceSavePresentation({
        cloudStatus: 'idle',
        localStatus: 'error',
        generationRunning: false,
      }),
    ).toMatchObject({ failed: true, quiet: false, text: 'Local save failed' });
  });
});
