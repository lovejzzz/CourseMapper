import { describe, expect, it } from 'vitest';
import { getWorkspaceSavePresentation } from '../workspaceSaveStatus';

describe('getWorkspaceSavePresentation', () => {
  it('keeps an in-flight quota fallback calm while generation continues', () => {
    expect(
      getWorkspaceSavePresentation({
        cloudStatus: 'idle',
        localStatus: 'error',
        workflowRunning: true,
      }),
    ).toMatchObject({ failed: false, quiet: true, text: 'Saving locally…' });
  });

  it('keeps a recoverable save calm while sync verification or grading continues', () => {
    expect(
      getWorkspaceSavePresentation({
        cloudStatus: 'idle',
        localStatus: 'error',
        workflowRunning: true,
      }),
    ).toMatchObject({
      failed: false,
      quiet: true,
      text: 'Saving locally…',
      tone: 'border-slate-200 bg-white text-slate-600',
    });
  });

  it('shows a real local save failure after the complete workflow stops', () => {
    expect(
      getWorkspaceSavePresentation({
        cloudStatus: 'idle',
        localStatus: 'error',
        workflowRunning: false,
      }),
    ).toMatchObject({ failed: true, quiet: false, text: 'Local save failed' });
  });

  it('never defers a cloud failure because the workflow is active', () => {
    expect(
      getWorkspaceSavePresentation({
        cloudStatus: 'error',
        localStatus: 'idle',
        workflowRunning: true,
      }),
    ).toMatchObject({ failed: true, quiet: false, text: 'Cloud save failed' });
  });
});
