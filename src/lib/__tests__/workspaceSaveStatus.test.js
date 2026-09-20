import { describe, expect, it } from 'vitest';
import { buildKnowledgeBackboneLabel, getWorkspaceSavePresentation } from '../workspaceSaveStatus';

describe('buildKnowledgeBackboneLabel', () => {
  it('uses explicit research provenance while a recovered coverage receipt catches up', () => {
    expect(
      buildKnowledgeBackboneLabel(
        {
          sessions: 4,
          genomeLinkedLessons: 0,
          researchedLessons: 0,
          openResources: 5,
          sessionsWithResources: 6,
          resourcesByOrigin: { 'algi-research': 5 },
        },
        { trustedConceptLinkedCount: 3 },
      ),
    ).toBe(
      '4/4 lessons source-researched · 3 trusted source-ledger rows · 5 graph reading resources (algi-research: 5) · 4/4 lessons with readings',
    );
  });

  it('returns no label when the workspace has no open resources', () => {
    expect(buildKnowledgeBackboneLabel({ sessions: 4, openResources: 0 })).toBeNull();
  });
});

describe('getWorkspaceSavePresentation', () => {
  it('explains an account pause without calling it a failed save', () => {
    const result = getWorkspaceSavePresentation({
      cloudStatus: 'account-paused',
      localStatus: 'saved',
      user: { uid: 'other' },
    });
    expect(result).toMatchObject({ failed: false, quiet: false, text: 'Cloud save paused' });
    expect(result.notice).toContain('another account');
    expect(result.notice).toContain('Save Current as New Project');
    expect(getWorkspaceSavePresentation({ cloudStatus: 'account-paused', localStatus: 'saved' })).toMatchObject({
      notice: null,
      text: 'Autosaved locally',
    });
    expect(
      getWorkspaceSavePresentation({ cloudStatus: 'account-paused', localStatus: 'error', user: { uid: 'other' } }),
    ).toMatchObject({ failed: true, text: 'Local save failed' });
  });
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
